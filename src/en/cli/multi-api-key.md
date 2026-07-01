# Multi API-Key Design

A single daemon can connect **multiple yoooclaw accounts at once**: each account corresponds to one account-level api-key, the daemon opens one Relay tunnel per key, tags disk writes by `clientLabel` to distinguish their source, and queries can filter with `--client <label>`.

This chapter covers the **storage format, resolution layering, management commands, and runtime orchestration** for multiple keys in one place. For where credentials fit into the overall architecture, see the "Credential layering" section of [Architecture & Implementation](/en/cli/architecture).

## Why multiple keys

An account-level api-key is the credential for calling the yoooclaw backend (Relay / AI ASR / app-name-map) — **one per account**. A single key is enough when one machine only connects to one phone.

Typical scenarios that need multiple keys:

- One machine (one daemon, one profile) needs to **connect to multiple phones / accounts at once**;
- You want to land notifications and recordings from different sources **in the same dataset but distinguishable**, rather than running a separate profile (and daemon) for each.

Multiple keys and profiles are two orthogonal dimensions:

| | Isolation granularity | Daemon | Data |
| --- | --- | --- | --- |
| **Multiple profiles** | Fully isolated | Each runs its own daemon, on a different port | Each has its own separate directory |
| **Multiple api-keys** | Coexist within the same daemon | One daemon, multiple tunnels | Same dataset, tagged by `clientLabel` |

## Storage format: `apiKeys[]` vs. the legacy `apiKey`

Account-level credentials are written to the shared file `~/.yoooclaw/credentials.json`, **used jointly by the CLI, the daemon, and the phone-notifications plugin**. Multiple keys are expressed with an `apiKeys[]` array:

```json
{
  "apiKeys": [
    { "label": "phone-a", "key": "ock_xxx", "default": true },
    { "label": "phone-b", "key": "ock_yyy" }
  ]
}
```

Each entry has three fields:

- `label`: the tunnel and disk-write identifier. Must match `[a-z0-9-]{1,32}` and can't use the reserved words `all` / `legacy` / `env` / `keychain` / `local` (see the validation logic in [internal/creds/store.go](https://github.com/YoooClaw/cli/blob/master/internal/creds/store.go)).
- `key`: the account-level api-key (`ock_` prefix).
- `default`: whether this is the default key. `resolveApiKey()` uses the default entry in scenarios that need a single key (ASR fallback, legacy single-key calls); **if none is marked default, the runtime falls back to the first array entry** and emits a warning.

The old single-key format `{ "apiKey": "ock_xxx" }` is still supported, resolving to `mode: legacy-file-single`. The first time you run `auth add-api-key` to add a label, the old `apiKey` is automatically migrated into an `apiKeys[]` entry labeled `default`.

## Credential resolution layering

`resolveApiKeyEntries()` returns a `CredentialSet`, resolved in layers as below, **stopping at the first hit**, and tagging the current `mode`:

```text
1. env  YOOOCLAW_API_KEY                       → mode: env-single        ← explicit single-key override
2. file credentials.json#apiKeys[]             → mode: file-multi        ← multiple keys; shadows the keychain when present
3. keychain yoooclaw/api-key                   → mode: keychain-single   ← single key written via --keychain
4. file credentials.json#apiKey                → mode: legacy-file-single ← legacy single key
(none of the above)                            → mode: none
```

- Setting the `YOOOCLAW_API_KEY` environment variable **forces a single key**, overriding both the file and the keychain.
- Once `apiKeys[]` appears in the file, the resolver enters `file-multi` mode and **shadows the keychain**; `CredentialSet.shadowedKeychainPresent` flags that there's a shadowed keychain key.
- `resolveApiKeyEntries()` is what tells the daemon which tunnels to connect; `resolveApiKey()` only returns the single default key value, for legacy paths like ASR fallback.

## Management commands

| Command | Effect | Notes |
| --- | --- | --- |
| `auth add-api-key <key> --label <l>` | Add a new key | The first one is automatically set as default; `--default` forces it to be default; an existing label requires `--force` to overwrite |
| `auth list-api-keys` | List all entries | Keys are auto-masked as `ock_***xxxx` |
| `auth set-default-api-key <label>` | Switch the default key | Only changes the default marker |
| `auth set-api-key <key>` | Rotate the default entry's key | **In multi-key mode, only rotates the default entry's key** — doesn't add a new one |
| `auth remove-api-key <label>` | Remove the given key | If the default is removed, the first remaining entry is automatically promoted to default |

```bash
# Connect a second phone
yc auth add-api-key ock_yyy --label phone-b

# Read from stdin to avoid the key landing in shell history
echo "ock_zzz" | yc auth add-api-key - --label phone-c

# See what keys currently exist (masked)
yc auth list-api-keys

# Switch the default key
yc auth set-default-api-key phone-b
```

::: warning The keychain doesn't support multiple keys
`auth set-api-key --keychain` can only manage a single key. If `apiKeys[]` already exists in the file and you also pass `--keychain`, it fails with `KEYCHAIN_MULTI_UNSUPPORTED` — for multiple keys, use the file-based `apiKeys[]` consistently.
:::

## Runtime: one key, one tunnel

Once the daemon starts, [internal/relay/supervisor.go](https://github.com/YoooClaw/cli/blob/master/internal/relay/supervisor.go) orchestrates tunnels based on the `CredentialSet` — **one `RelayClient` per label**:

```text
CredentialSet (apiKeys[])
  ↓
TunnelSupervisor.apply(set)
  ├─ label added      → start a new tunnel        (started)
  ├─ label removed     → stop the old tunnel        (stopped)
  ├─ key changed        → stop old + start new (reconnect) (restarted)
  └─ unchanged            → reused                  (unchanged)
  ↓ per tunnel
RelayClient → wss://…/ws/plugin → RelayDispatcher (dispatches to the daemon runtime in-process)
```

The daemon **watches the shared credentials file**, automatically calling `TunnelSupervisor.apply()` for an incremental refresh whenever `apiKeys[]` changes — no daemon restart needed. When the watch is unreliable, trigger it manually:

```bash
yc daemon reload        # re-read credentials and incrementally apply tunnels
yc tunnel status        # see each tunnel's label / connected / default marker / reconnect count
yc tunnel reconnect --client phone-b   # reconnect only the specified label
```

## Tagging on disk and querying by client

The `clientLabel` source is determined at the authentication stage for every inbound request (see [internal/daemon/server.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server.go)):

| Inbound method | `authKind` | `clientLabel` |
| --- | --- | --- |
| Relay tunnel (with api-key) | `relay-api-key` | The label of the matching tunnel |
| Local HTTP with api-key | `http-api-key` | The matched label |
| Local HTTP with gateway token | `gateway-token` | `local` |
| Same-process local call | `local` | `local` |

Notifications, recordings, and images all carry this `clientLabel` when written to disk, so queries can filter by source — `--client all` means no filter:

```bash
yc notification +today --client phone-a    # only today's notifications from phone-a
yc notification search --client phone-b --from 09:00
yc notification +today --client all        # all sources
```

## Sharing the same credentials with the plugin

`~/.yoooclaw/credentials.json` is also read by the phone-notifications plugin, so the account-level key is **shared by the CLI, the daemon, and the plugin**. This leads to one key constraint:

::: danger Don't let two ingress paths connect the same account
When the host is running the plugin and the same machine also has the CLI daemon installed, **the two sides shouldn't both connect to the same Relay account (the same api-key)** at once — a single phone message would be pushed to two ingress paths and land twice. To fix it: either turn off Relay on the plugin side, stop the CLI's daemon, or give each side a different account key.
:::

## Constraints cheat sheet

- **Label naming**: `[a-z0-9-]{1,32}`, reserved words `all/legacy/env/keychain/local` are forbidden.
- **No default marked**: if no entry in `apiKeys[]` has `default:true`, the runtime uses the first one and warns.
- **env override**: setting `YOOOCLAW_API_KEY` forces a single key, and the multi-key file is ignored.
- **Keychain and multiple keys are mutually exclusive**: multiple keys must go through the file.
- **Removing the last entry**: once `apiKeys[]` is emptied out, it falls back to `none` mode — the daemon stops all tunnels, but the HTTP server keeps running (you can fall back to a direct connection).

## Next steps

- [Architecture & Implementation](/en/cli/architecture) — the full picture of the daemon, Relay, and Dispatcher.
- [Command Reference](/en/cli/commands) — every subcommand for `auth` / `tunnel` / `notification`.
- [Debugging & Troubleshooting](/en/cli/debugging) — troubleshooting when a specific tunnel won't connect.
