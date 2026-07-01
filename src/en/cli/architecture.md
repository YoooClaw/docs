# Architecture & Implementation

`@yoooclaw/cli` is now the Go-implemented standalone `yoooclaw` / `yc` command: a single native binary plays both the CLI client and the local daemon roles. The npm package is just a thin Node launcher that resolves the platform's Go binary from an optionalDependency and passes through arguments and exit codes.

The old TypeScript `src/` code is kept around as a protocol reference and migration aid; the current release artifacts are produced by `cmd/yc`, `internal/*`, and `scripts/build-go.sh`. This chapter describes how the Go beta actually runs.

## Three-tier command system

The CLI is still split into three tiers by usage frequency:

```text
Shortcuts     yoooclaw notification +today        ← presets for high-frequency scenarios
                          ↓ resolves to
Service       yoooclaw notification search --from … --to …
                          ↓ pure disk read / HTTP RPC
Daemon HTTP   GET /notifications?from=…
                          ↓
Local files / Relay / light-effect cloud / OSS / ASR
```

- **Shortcuts** (`+` prefix): parameter presets for the most common scenarios.
- **Service commands**: `yoooclaw <service> <subcommand>`, wired up by [internal/cli/root.go](https://github.com/YoooClaw/cli/blob/master/internal/cli/root.go) into each `cmd_*.go`.
- **Raw API**: `yoooclaw api <METHOD> <PATH>` goes straight to the daemon's HTTP API, for debugging and unwrapped capabilities.

[cmd/yc/main.go](https://github.com/YoooClaw/cli/blob/master/cmd/yc/main.go) is the binary entry point; [internal/cli/handler.go](https://github.com/YoooClaw/cli/blob/master/internal/cli/handler.go) uniformly handles context construction, handler invocation, `--format` output, and error rendering.

## Daemon dependency and command categories

CLI commands fall into three categories, marked with color badges in the docs:

| Badge | Meaning | Examples |
| --- | --- | --- |
| 🟢 | Doesn't need the daemon (pure disk reads / pure local operations) | `notification search`, `recording list`, `image path`, `log` |
| 🟡 | Needs the daemon to be running (control commands, over local HTTP RPC) | `light send`, `tunnel status`, `gateway test` |
| 🔵 | Manages the daemon itself | `daemon start/stop/status/logs` |

🟢 commands can run right after a cold start: notifications, recordings, images, logs, and sync cursors all read directly from `~/.yoooclaw/profiles/<profile>/`. 🟡 commands go through [internal/daemon/client.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/client.go), which reads the lock/config to derive the local address, then calls the daemon's HTTP API with a gateway token.

## Daemon startup and ports

`daemon start` forks a detached child process by default; the child runs `daemon run-foreground` and enters `RunForeground` in [internal/daemon/server.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server.go). `config init` automatically calls the same start logic at the end, unless `--no-start` is passed.

Startup flow:

```text
1. Check daemon.lock; a stale lock is treated as "not running"
2. Load config.json, resolve the gateway token and the account api-key CredentialSet
3. Refuse to start if binding to a non-loopback address without a gateway token
4. Initialize local storage for notifications, recordings, images, light rules, monitors, etc.
5. http.Server.listen; if the port is taken, auto-increment from 18789 (up to 64 times)
6. Write daemon.lock {pid, startedAt, bind, port, logLevel}
7. Assemble the transport layer according to ingress mode (see "Ingress modes" below): in standalone, if relay.enabled and an api-key exists, start one Relay tunnel per label; proxied / direct skip tunnels
8. SIGTERM/SIGINT or /daemon/stop triggers a graceful shutdown
```

Port handling is a key design point: always trust the `port` field from `daemon status` for the actual port — don't assume it's always 18789. Stopping the daemon on Windows goes through HTTP `POST /daemon/stop`; macOS / Linux prefer signals, then force-kill after a timeout.

## Ingress modes

The daemon's "connection to the phone" is a pluggable transport layer, and `--ingress` selects the **single** owner of it (priority order: `--ingress` flag > `YOOOCLAW_INGRESS` env var > `config.ingress.mode`, defaulting to `standalone`). This keeps the standalone CLI and a host plugin (like hermes-plugin) from both connecting to Relay at the same time and causing double connections / double ingest.

| Mode | Owner of the phone connection | Relay tunnel | Ingest auth | Outbound events (egress) |
| --- | --- | --- | --- | --- |
| `standalone` (default) | The Go daemon's own tunnel | Enabled | gateway token / local | Pushed back to phone via Relay |
| `proxied` (embedded plugin) | The host plugin proxies it | Disabled | **api-key required** | POST back to the host callback URL |
| `direct` (LAN / testing) | The caller POSTs directly | Disabled | api-key / token | Dropped (disk-write only) |

Inbound is always the same set of ingest endpoints (`POST /notifications` `/images`, `/gateway/recordings.result.write`) — the mode just decides who "feeds" them. Outbound is abstracted into an Egress port: `standalone` goes over the Relay tunnel (`RelayEgress`), `proxied` POSTs to `--egress-callback-url` (`ProxyEgress`), and `direct` drops it (`NoopEgress`) — replacing the previously scattered tunnel PushEvent calls.

Example of embedding with `proxied` (the host proxies the connection, and the daemon only exposes the ingest API):

```bash
yoooclaw daemon run-foreground --ingress proxied \
  --egress-callback-url http://127.0.0.1:8765/yoooclaw/egress \
  --egress-callback-token <token>
```

`proxied` requires an api-key (otherwise startup fails with `YOOOCLAW_UNAUTHORIZED`); `/daemon/reload` only rebuilds tunnels under `standalone`; `daemon status` has a new `ingressMode` field. See [docs/design/ingress-layering.md](https://github.com/YoooClaw/cli/blob/master/docs/design/ingress-layering.md) for the full design.

## HTTP routes and authentication

The daemon's HTTP server carries both the control plane and the phone-side ingest plane:

| Endpoint | Method | Auth | Responsibility |
| --- | --- | --- | --- |
| `/health` | GET | Public | `{ server, version, protocol, capabilities }` |
| `/daemon/status` `/daemon/reload` `/daemon/stop` | GET/POST | gateway token | Daemon management |
| `/tunnel/status` `/tunnel/reconnect` `/tunnel/test` | GET/POST | gateway token | Relay status, reconnect, local loopback self-test |
| `/notifications` `/images` | POST | gateway token / api-key / internal Relay header | Phone-side data writes |
| `/gateway/<method>` | POST | gateway token / api-key / internal Relay header | Gateway method bridge (including recording `recordings.result.write`) |
| `/light/send` | POST | gateway token | Light-effect delivery |
| `/monitors[/...]` | GET/POST/DELETE | gateway token | Monitor task CRUD |

Auth is unified in [internal/daemon/server.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server.go). Relay loopback requests use an internal header to preserve the real `clientLabel`; local gateway-token requests are tagged `local`; and when the phone calls ingest directly with an account api-key, it's mapped to the matching api-key label.

## Relay tunnels

The Relay-related Go code lives in [internal/relay](https://github.com/YoooClaw/cli/tree/master/internal/relay). The daemon opens one WebSocket tunnel per label in `apiKeys[]`:

```text
CredentialSet
  ↓
Supervisor (label → Client + Dispatcher)
  ↓
Relay Client: wss://openclaw-service.yoooclaw.com/message/messages/ws/plugin
  ↓ inbound frame
Dispatcher
  ├─ type:"req"     → daemon gateway method → type:"res"
  ├─ type:"request" → loopback http://127.0.0.1:<port>/<path>
  └─ ws_open/data/close → local WebSocket loopback
```

The Go version no longer depends on the OpenClaw desktop gateway, nor does it reuse the old `TunnelProxy`'s coupling to a local gateway WS reverse proxy. It keeps the Relay frame schema compatible with the phone side, but dispatches frames to the daemon's HTTP/gateway within the same process.

Changes to `~/.yoooclaw/credentials.json` trigger a CredentialSet reload: adding a label starts a new tunnel, removing a label stops the old one, and a changed key reconnects the corresponding tunnel. When the watch is unreliable, you can manually run `yoooclaw daemon reload`.

## Recording and image ingest

The recording entry point is in [internal/daemon/server_ingest.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server_ingest.go); the core storage and ASR live in [internal/recording](https://github.com/YoooClaw/cli/tree/master/internal/recording):

```text
recordings.result.write (transcript/summary, optional ossUrl)
  ↓
Write metadata to recordings/index.json (status=synced on creation)
  ↓
Write transcript-data/*.json + transcripts/*.md + summaries/*.md
  ↓
Optional: if ossUrl is present, download the audio in the background to recordings/audio/
  ↓  status=transcribed
Append a state event to state/events.jsonl, and optionally push it back to the phone via Relay
(local re-transcription is triggered via recordings.retranscribe, which invokes ASR api/model-proxy)
```

The ASR config is written to `recordings/asr-config.json`. The current Go beta only supports `mode=api`; when `api.apiKey` is missing, the daemon falls back to the account-level `ock-` key. The `local` / `yoooclaw` modes are kept only for compatibility and are rejected during validation.

The image ingest path mirrors recordings and is stored in [internal/image](https://github.com/YoooClaw/cli/tree/master/internal/image): `images.sync` / `POST /images` first write to `images/index.json`, then download from OSS in the background to `images/files/`. `image path <id>` returns `YOOOCLAW_IMAGE_NOT_READY` when the file hasn't finished downloading, so an Agent never reads a partial file.

## Credential layering

`auth status` keeps account-level api-keys and instance-level gateway tokens separate. The Go implementation lives in [internal/creds](https://github.com/YoooClaw/cli/tree/master/internal/creds).

Account-level api-key resolution order:

```text
1. YOOOCLAW_API_KEY
2. ~/.yoooclaw/credentials.json#apiKeys[]
3. keychain:yoooclaw/api-key
4. ~/.yoooclaw/credentials.json#apiKey
```

`apiKeys[]` is the primary multi-device form; each entry has a `label`, a `key`, and an optional `default`. The daemon opens one tunnel per label, and inbound notifications, recordings, and images all record a `clientLabel`; query commands can filter with `--client <label>`.

Instance-level gateway tokens travel with the profile, referenced by `auth.tokenRef` in `config.json`, supporting `env:` / `file:` / `keychain:` / `inline:`. Windows has no system keychain adapter, so credentials are stored as files, which `doctor` will flag.

## Profiles and data directories

`~/.yoooclaw/profiles/<name>/` is the isolation unit:

```text
~/.yoooclaw/
├── credentials.json          ← account-level shared api-key
├── active-profile            ← name of the current active profile
└── profiles/
    └── default/
        ├── config.json
        ├── credentials.json  ← instance-level credentials, e.g. gateway token
        ├── daemon.lock
        ├── daemon.log
        ├── notifications/
        ├── recordings/
        ├── images/
        ├── light-rules/
        ├── tasks/            ← where light rules are actually stored
        └── state/
```

`YOOOCLAW_HOME` can override the root directory, which is handy for testing and isolating multiple instances. Resolution order: `--profile` > `YOOOCLAW_PROFILE` > `active-profile` > `default`.

## Output contract

Every command goes through [internal/output/output.go](https://github.com/YoooClaw/cli/blob/master/internal/output/output.go):

```json
{ "ok": true, "items": [] }
```

```json
{ "ok": false, "error": { "code": "YOOOCLAW_DAEMON_NOT_RUNNING", "message": "daemon is not running", "hint": "run yoooclaw daemon start first" } }
```

Local CLI validation / runtime errors return a non-zero exit code. Raw HTTP commands like `yoooclaw api` try to preserve the daemon's original response as-is, so scripts should check both `ok` and the HTTP status, not just the process exit code.

Error codes are uniformly prefixed `YOOOCLAW_*`, defined in [internal/errs/errors.go](https://github.com/YoooClaw/cli/blob/master/internal/errs/errors.go).

## Relationship to the plugin

The standalone CLI doesn't replace the OpenClaw plugin; the two share account-level credentials and the phone-side protocol. The difference is the runtime host:

| | Plugin | Standalone CLI |
| --- | --- | --- |
| Installed in | Inside the OpenClaw / QClaw host | Any machine, via npm or the native binary |
| Starting the daemon | Handled by the host | `yoooclaw daemon start` |
| Agent integration | Host tools / Skills | `yoooclaw skills install`, then call the CLI directly |
| api-key | `~/.yoooclaw/credentials.json` | The same file |
| Relay ingress | Host gateway | Go daemon Dispatcher |
| Queries | Host capabilities | Pure local reads of profile files |

Don't let the plugin and the standalone CLI daemon connect to Relay for the same account at the same time, or a single phone message can land twice. Two solutions:

- **Pick one**: stop the plugin's Relay connection, or stop the CLI daemon — simple, but needs manual coordination.
- **Proxy (recommended for embedding)**: start the daemon with `--ingress proxied`, letting the host plugin own the "connection to the phone" while the CLI only exposes the ingest API to receive data and pushes outbound events back via the egress callback. This guarantees a single connection owner by construction. See "Ingress modes" above for details.

## Next steps

- [Command System & Output](/en/cli/usage) — command categories, global flags, profiles, and data directories.
- [Command Reference](/en/cli/commands) — the full list of subcommands.
- [Agent Skill](/en/cli/skills) — how an Agent drives the CLI automatically.
- [Debugging & Troubleshooting](/en/cli/debugging) — the three-step check for when Relay won't connect or pushes aren't arriving.
