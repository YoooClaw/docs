# Command System & Output

## Three-tier command system

- **Shortcuts** (`+` prefix): presets for the most common scenarios, e.g. `yoooclaw notification +today`, `yoooclaw light +blink`, `yoooclaw lightrule +on`, `yoooclaw recording +latest`, `yoooclaw image +latest`.
- **Service commands**: `yoooclaw <service> <subcommand>`; see the service list with `yoooclaw --help`.
- **Raw API**: `yoooclaw api <METHOD> <PATH> [--data ...]` goes straight to a daemon HTTP endpoint — no gaps for debugging or unwrapped capabilities.

See the full subcommand list in the [Command Reference](/en/cli/commands).

## Daemon dependency badges

Three badges mark how much each command depends on the daemon:

| Badge | Meaning |
| --- | --- |
| 🟢 | Doesn't need the daemon (pure disk reads or pure local operations) |
| 🟡 | Needs the daemon to be running (control commands, over local HTTP RPC) |
| 🔵 | Process-management commands (manage the daemon itself) |

## Global flags

| Flag | Description |
| --- | --- |
| `--profile <name>` | Switch profile (defaults to `default`; can also use the `YOOOCLAW_PROFILE` env var) |
| `--format <fmt>` | `json` \| `pretty` \| `table` \| `ndjson` (defaults to `pretty` on a TTY, `json` when piped) |
| `--quiet` | Suppress progress logs, printing only the final result |
| `--no-color` | Disable terminal colors |

### Output formats

| Format | Behavior | Use case |
| --- | --- | --- |
| `json` | Single-line `JSON.stringify` | Default for non-TTY / piped output |
| `pretty` | Indented with two spaces | Default on a TTY |
| `table` | Array results column-aligned | Human-readable lists |
| `ndjson` | One JSON object per line, no wrapping array | Streaming / large batches / Agent consumption |

## Output contract

Success and failure share the same channel (stdout) with a predictable structure. Local CLI validation / runtime errors additionally express failure via a non-zero exit code; raw HTTP commands like `api` try to preserve the daemon's original response as-is, so scripts should check both `ok` and the HTTP status:

```json
{ "ok": false, "error": { "code": "YOOOCLAW_DAEMON_NOT_RUNNING", "message": "daemon is not running", "hint": "run yoooclaw daemon start first" } }
```

Error codes are uniformly prefixed `YOOOCLAW_*` and form a semi-formal contract. Common error codes:

| Code | Meaning |
| --- | --- |
| `YOOOCLAW_INVALID_ARGUMENT` | Argument validation failed |
| `YOOOCLAW_CONFIG_INVALID` | Profile not initialized, or config is invalid |
| `YOOOCLAW_DAEMON_NOT_RUNNING` | Daemon isn't running (pre-check for 🟡 commands) |
| `YOOOCLAW_DAEMON_ALREADY_RUNNING` | Daemon is already running (single-instance protection) |
| `YOOOCLAW_UNAUTHORIZED` | Gateway token mismatch |
| `YOOOCLAW_NOT_FOUND` | Resource doesn't exist |
| `YOOOCLAW_IMAGE_NOT_READY` | Image hasn't finished downloading yet |

## Profiles

`--profile <name>` switches to `~/.yoooclaw/profiles/<name>/`; when not specified, it uses the active profile recorded in `~/.yoooclaw/active-profile`, defaulting to `default`. Run a separate profile per machine / account:

```bash
yoooclaw --profile home daemon status
yoooclaw --profile work daemon status
yoooclaw profile list          # list all, marking the active one
yoooclaw profile use work       # switch the active profile
```

## Data directory

`~/.yoooclaw/` (can be overridden with the `YOOOCLAW_HOME` env var, handy for testing / multiple instances). Files are written `0600`, directories `0700`:

```text
~/.yoooclaw/
├── credentials.json          # account-level shared api-key (apiKey or apiKeys[]), spans profiles and is shared with the plugin
├── active-profile            # name of the current active profile
└── profiles/
    └── default/
        ├── config.json       # daemon / relay / light-rule / output config, etc.
        ├── credentials.json  # instance-level secrets (gateway token / webhook secret)
        ├── daemon.lock       # process lock (PID + start time + listen address)
        ├── daemon.log        # current log (rotated daily to daemon.log.YYYY-MM-DD)
        ├── notifications/    # by date, YYYY-MM-DD.json
        ├── recordings/       # index.json + audio / transcripts / asr-config.json / state/events.jsonl
        ├── images/           # index.json + files/ (downloaded from OSS)
        ├── tasks/            # light rules
        └── state/            # monitors.json, last-update-check.json, etc.
```

## Credential resolution

Sensitive credentials are resolved in layers, stopping at the first hit:

- **api-key** (account-level; calls yoooclaw AI / app-name-map / Relay): `YOOOCLAW_API_KEY` → shared `~/.yoooclaw/credentials.json#apiKeys[]` → keychain `yoooclaw/api-key` → shared `~/.yoooclaw/credentials.json#apiKey`. `YOOOCLAW_API_KEY` is an explicit single-key override; once `apiKeys[]` exists in the file, the keychain is shadowed.
- **gateway token / webhook secret** (instance-level): travels with the profile, referenced by a `*Ref` field in `config.json` (`env:` / `file:` / `keychain:` / `inline:`).

### Multiple api-keys

Multiple keys are still account-level credentials, stored in the shared `~/.yoooclaw/credentials.json`, in this format:

```json
{
  "apiKeys": [
    { "label": "phone-a", "key": "ock_xxx", "default": true },
    { "label": "phone-b", "key": "ock_yyy" }
  ]
}
```

Common commands:

```bash
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw auth list-api-keys
yoooclaw auth set-default-api-key phone-b
yoooclaw auth remove-api-key phone-a
```

Labels can only use `[a-z0-9-]{1,32}`, and can't be `all`, `legacy`, `env`, `keychain`, or `local`. The first time you run `auth add-api-key`, if the file already has an old `apiKey`, the CLI migrates it into `apiKeys[]` and keeps the old key under a `default` label; if there's no old key, the first new key added automatically becomes the default.

`auth set-api-key` still works for single-key scenarios; in `apiKeys[]` mode it only rotates the key of the default entry and won't touch other labels. Multiple keys don't support `--keychain`, since the keychain can only hold a single account-level key.

Once the daemon starts, it opens one Relay tunnel per label in `apiKeys[]`; file changes trigger a hot reload, and you can manually run `yoooclaw daemon reload` if needed. Inbound notifications, recordings, and images all record the matching `clientLabel`, which you can filter on with `--client <label>` when querying, e.g.:

```bash
yoooclaw notification +today --client phone-a
yoooclaw recording list --client phone-b
yoooclaw tunnel status --client phone-a
```
