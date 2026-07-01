# Command Reference

All subcommands, listed by service. Dependency badges: 🟢 doesn't need the daemon · 🟡 needs the daemon running · 🔵 manages the daemon itself.
Every command supports the global flags (`--profile` / `--format` / `--quiet` / `--no-color`); see [Command System & Output](/en/cli/usage).

## config — Configuration management 🟢

| Command | Description |
| --- | --- |
| `config init` | Interactive first-run wizard: generates `config.json` + a gateway token, prints a phone-side config summary, and automatically brings up the daemon in the background (works out of the box). Supports `--non-interactive --from-file <config.json>` (`-` reads stdin), `--force` to overwrite, and `--no-start` to only generate config without starting the daemon. |
| `config show` | Show the current profile's config (sensitive fields masked). `--show-secrets` prints them in plaintext (requires a TTY + confirmation). |
| `config set <key> <value>` | Set a single config value; supports dotted paths (`daemon.port`, `notification.ignoredApps` uses a comma-separated list). |
| `config unset <key>` | Remove a single config value. |

```bash
yoooclaw config init
yoooclaw config set daemon.port 18789
yoooclaw config show --format json
```

## profile — Multi-profile management 🟢

| Command | Description |
| --- | --- |
| `profile list` | List all profiles, marking the active one. |
| `profile use <name>` | Switch the active profile. |
| `profile create <name>` | Create a new profile (via the `config init` wizard). |
| `profile delete <name>` | Delete a profile (can't delete the active one; requires `--yes`). |

## auth — Credentials and authentication

| Command | Description |
| --- | --- |
| `auth set-api-key <key>` 🟢 | Set / rotate the account-level default api-key (`-` reads from stdin, avoiding shell history). If `apiKeys[]` already exists, only updates the default entry; `--keychain` writes to the OS keychain. |
| `auth add-api-key <key>` 🟢 | Add a new labeled api-key. `--label <label>` is required (`[a-z0-9-]{1,32}`), `--default` marks it default, `--force` overwrites a label with the same name. |
| `auth list-api-keys` 🟢 | List api-key entries, `mode`, and `defaultLabel`, with keys auto-masked. |
| `auth remove-api-key <label>` 🟢 | Remove the api-key for the given label. If you remove the default, the first remaining key automatically becomes the new default. |
| `auth set-default-api-key <label>` 🟢 | Switch the default api-key; used by cloud ASR fallback and legacy single-key calls. |
| `auth status` 🟢 | Show whether an api-key / gateway token exists, its source (env/keychain/file), `mode`, `defaultLabel`, and whether the daemon is reachable. Doesn't call the daemon. |
| `auth token-rotate` 🟡 | Generate and write a new gateway token (per `auth.tokenRef`). `--length <n>` for byte length, default 32. |
| `auth check` 🟡 | End-to-end auth check: calls the daemon's `/daemon/status` with the local token to verify consistency. |

```bash
echo 'ock_xxx' | yoooclaw auth set-api-key -
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw auth list-api-keys
yoooclaw auth set-default-api-key phone-b
yoooclaw auth status --format json
```

Multiple keys live in the shared `apiKeys[]` field of `~/.yoooclaw/credentials.json`, effective across profiles. While the daemon is running it hot-reloads via a file watch; if the watch is unreliable, run `yoooclaw daemon reload` to re-read credentials and incrementally refresh the Relay tunnels. Each key's label becomes the `clientLabel` on inbound data, filterable with `--client <label>` on the query commands.

## daemon — Daemon management 🔵

| Command | Description |
| --- | --- |
| `daemon start` | Start the daemon; forks a detached background process by default. `--bind <host>`, `--port <n>`, `--no-detach` (for systemd/launchd), `--log-level <level>`. |
| `daemon stop` | Send SIGTERM, then SIGKILL after waiting up to 10s. |
| `daemon restart` | Equivalent to stop + start, preserving the original start arguments. |
| `daemon reload` | Doesn't restart the process; re-reads the api-key CredentialSet and incrementally starts / stops / reconnects Relay tunnels. |
| `daemon status` | Print PID, listen address, start time, relay status, number of light rules, latest ingest, and memory usage. |
| `daemon logs` | Follow the daemon log. `-f, --follow`, `--lines <n>` (default 100), `--level <level>`. |

```bash
yoooclaw daemon start
yoooclaw daemon status --format json
yoooclaw daemon logs --lines 200 --level error
```

## notification — Notification queries 🟢

| Command | Description |
| --- | --- |
| `notification search` | Query by criteria, newest first. `--from/--to <iso8601>`, `--app`, `--sender`, `--conversation-type group\|private`, `--keyword`, `--client <label>`, `--limit` (default 100). |
| `notification summary` | Aggregate statistics + sample summaries, for an Agent to summarize. Supports `--client <label>`, plus `--sample <n>` (default 30), `--top <n>` (default 10). When `--limit` is explicitly passed, only the most recent N are aggregated. |
| `notification summary-job` | A chunked notification summarization job: slice a large batch of notifications → summarize chunk by chunk → merge the result. Subcommands below, see [summary-job](#notification-summary-job-—-chunked-notification-summarization-🟢). |
| `notification stats` | Aggregate by dimension. `--from/--to <YYYY-MM-DD>`, `--app`, `--client <label>`, `--dim date\|app\|sender\|hour\|client\|all`. |
| `notification storage-path` | Print the absolute path of the notifications directory. |
| `notification +today` | Today's notifications. Supports `--client <label>`. |
| `notification +recent` | Notifications from the last hour. Supports `--client <label>`. |
| `notification +unread` | (Reserved) Unread notifications — requires a read-state model that hasn't landed yet; currently returns `YOOOCLAW_NOT_IMPLEMENTED`. |

`--app` supports Chinese/English aliases: `微信/wechat`, `飞书/feishu/lark`, `钉钉/dingtalk`, `企业微信/wecom`, `qq`, etc.

```bash
yoooclaw notification search --app wechat --keyword meeting --format ndjson
yoooclaw notification summary --top 10 --format json
```

### notification summary-job — Chunked notification summarization 🟢

A workflow for large batches of notifications: "slice → summarize chunk by chunk → merge". `summary` is fine for small, one-shot aggregation; when there are a lot of notifications and you need to feed a model chunk by chunk, use `summary-job`: `create` builds the job and slices it, `next` claims a pending chunk to summarize, `commit` writes that chunk's summary back, and once everything's done, `result` merges the final output. You can also use `run` to skip the model entirely and finish automatically with extractive summarization.

| Command | Description |
| --- | --- |
| `notification summary-job create` | Create a job, sliced by query. Reuses all the `notification` query flags (`--from/--to`, `--app`, `--sender`, `--conversation-type`, `--keyword`, `--client`, `--limit`, defaulting `--limit` to 1000), plus `--chunk-size <n>` (items per chunk, default 150) and `--max-content <n>` (max characters per item's title/body, default 120). |
| `notification summary-job status <id>` | View job status and per-chunk progress. |
| `notification summary-job next <id>` | Claim or retry the next chunk to summarize; returns the chunk content and a `chunkId`. |
| `notification summary-job commit <id>` | Write a chunk's summary back and mark it complete. `--chunk-id <id>` (required, from `next`), plus either `--summary <text>` or `--summary-file <path>` for the summary. |
| `notification summary-job run <id>` | Auto-process pending chunks with extractive summarization (no model needed). `--max-chunks <n>` (max chunks to process this run, default 20), `--include-result` (output the markdown result once done). |
| `notification summary-job result <id>` | Merge the committed chunk summaries and return the final result. |
| `notification summary-job cancel <id>` | Cancel the job (keeping already-written chunks and summaries). |

```bash
# Agent-driven: create the job → loop next/commit → merge
JOB=$(yoooclaw notification summary-job create --app wechat --limit 2000 --format json)
yoooclaw notification summary-job next <id>     # get a chunk, feed it to a model for summarization
yoooclaw notification summary-job commit <id> --chunk-id <chunk> --summary "chunk summary…"
yoooclaw notification summary-job result <id> --format json

# no-model case: finish automatically with extractive summarization
yoooclaw notification summary-job run <id> --include-result --format json
```

## sync — Sync notifications to a memory system 🟢

A checkpoint protocol for external memory systems to pull notifications in batches. `scan` / `next` share a set of date-range flags: `--all` (process every date after the checkpoint), `--date <YYYY-MM-DD>` (a single date), `--from-date` / `--to-date` (a range); if none are passed, only today (local time) is processed by default.

| Command | Description |
| --- | --- |
| `sync scan` | Scan for unprocessed notifications; by default returns only today's (local) pending summary, or use range flags to widen the scan. |
| `sync next` | A general-purpose batch iterator: returns the next unprocessed batch (≤100 items) within range plus a `commitCommand`; returns `done=true` once everything's processed. Used together with the range flags. |
| `sync fetch --date <YYYY-MM-DD>` | Fetch details of unprocessed notifications for a given date. `--max-end-index <n>` for idempotent slicing. |
| `sync commit --date <YYYY-MM-DD>` | Mark the current batch as processed. `--end-index <n>` for a precise commit. |

```bash
# Iterator style: next returns the next batch + a commit command directly; done=true once finished
yoooclaw sync next --all --format json
yoooclaw sync commit --date 2026-06-17 --end-index 42
```

## recording — Recording management

| Command | Description |
| --- | --- |
| `recording list` 🟢 | List all recordings. `--status <status>` filters by transfer status, `--client <label>` filters by api-key label. |
| `recording status <id>` 🟢 | Details for a single recording (metadata, file paths, ASR status, errors). |
| `recording storage-path` 🟢 | Print the absolute path of the recordings storage directory. |
| `recording setup-asr` 🟢 | Configure ASR transcription parameters. The only currently available mode is `--mode api`; `local` remains in the flag/schema for compatibility with older requests, but the Go beta rejects local Whisper mode. Supports `--api-key`, `--endpoint`, `--language`, `--non-interactive`. |
| `recording events` 🟢 | Query the recording state event stream. `--id <recordingId>`, `--since <10m\|1h\|24h>`, `--watch`, `--limit <n>` (default 200). |
| `recording +latest` 🟢 | Show details for the most recent recording. |

The standalone CLI's daemon receives transcripts and summaries written by the app / cloud via `recordings.result.write` (optionally downloading the audio in the background if an `ossUrl` is included), landing them in the current profile's `recordings/`. Local re-transcription is triggered via `recordings.retranscribe`: the `asr-config.json` written by `setup-asr` is compatible with a request-level `asr` parameter; when `mode=api` and no `apiKey` was written, it falls back to the account-level `ock-` key. The current Go beta only supports `api` / model-proxy ASR.

```bash
yoooclaw recording setup-asr --mode api --language auto --non-interactive
yoooclaw recording events --since 1h --limit 50 --format json
yoooclaw recording events --id 2026-03-23_14-32 --watch
```

## image — Image management 🟢

Images are downloaded from OSS to `images/files/` by the daemon in the background; query commands do pure reads of `images/index.json`.

| Command | Description |
| --- | --- |
| `image list` | List images. `--status syncing\|synced\|sync_failed`, `--app`, `--from/--to <iso8601>`, `--client <label>`, `--limit`. |
| `image status <id>` | Details for a single image. |
| `image path <id>` | Print the local file's absolute path (for feeding an Agent's multimodal model). `--thumbnail` returns the thumbnail. Returns `YOOOCLAW_IMAGE_NOT_READY` if the download hasn't finished. |
| `image storage-path` | Print the absolute path of the images storage directory. |
| `image +latest` | Show details for the most recent image. |

## light — Light-effect hardware control 🟡

| Command | Description |
| --- | --- |
| `light send` | Send a light-effect command. `--segments <json>` (light parameters) or `--preset <name>` (preset name); `--repeat`, `--repeat-times <n>`. |
| `light +blink` | Light-effect connectivity test. |

> When the standalone daemon has no connected light-effect device session, the command returns `accepted: true, delivered: false` (the phone side needs to be online / relayed).

## lightrule — Light-effect rule management 🟡

After a notification is ingested, the daemon evaluates rule matches and triggers light effects.

| Command | Description |
| --- | --- |
| `lightrule list` | List all rules and their status. |
| `lightrule show <id>` | Details for a single rule. |
| `lightrule create` | Create a rule. `--from-file <path>` (`-` reads stdin) or `--name`/`--intent`/`--light-action`/`--match-rules`. |
| `lightrule update <id>` | Update an existing rule; unspecified fields keep their current value. |
| `lightrule delete <id>` | Delete a rule (`--yes` skips confirmation). |
| `lightrule enable <id>` / `disable <id>` | Enable / disable a single rule. |
| `lightrule +on` / `+off` | Enable / disable all rules. |

```bash
cat rule.json | yoooclaw lightrule create --from-file -
yoooclaw lightrule list --format json
```

## monitor — Scheduled notification monitoring tasks 🟡

Scheduled task definitions driven by cron expressions (currently persists definitions and enabled state).

| Command | Description |
| --- | --- |
| `monitor list` | List all monitor tasks. |
| `monitor show <name>` | Task details. |
| `monitor create <name>` | Create a task. `--description`, `--match-rules <json>`, `--schedule <cron>` are all required. |
| `monitor delete <name>` | Delete a task (`--yes`). |
| `monitor enable <name>` / `disable <name>` | Enable / pause a task. |

## tunnel — Relay tunnel 🟡

| Command | Description |
| --- | --- |
| `tunnel status` | Query the Relay connection status (`connected` / `reconnectAttempt` / disconnect reason). With multiple keys, returns `tunnels[]`; `--client <label>` shows only the specified tunnel. See [Debugging & Troubleshooting](/en/cli/debugging). |
| `tunnel reconnect` | Force a disconnect and reconnect. `--client <label>` reconnects only the specified label; if omitted, reconnects all tunnels. |
| `tunnel +test` | End-to-end connectivity self-test: the daemon sends itself an echo notification over local loopback, verifying the ingest + auth chain. `--client <label>` writes with the specified api-key. |

## log — Log search 🟢

| Command | Description |
| --- | --- |
| `log [keyword]` | Search the daemon logs. `--from/--to <YYYY-MM-DD>`, `--limit` (default 50), `--level`. |
| `log +errors` | Error-level logs since yesterday. |

## gateway — Protocol self-test 🟡

| Command | Description |
| --- | --- |
| `gateway test` | Simulate the phone calling the daemon's `/notifications`, verifying connectivity / auth. `--from-phone-ip <ip>`, `--via-relay`. |

## api — Raw HTTP escape hatch 🟡

```bash
yoooclaw api GET /daemon/status
yoooclaw api POST /images --data @img.json
yoooclaw api POST /light/send --data '{"preset":"blink"}'
```

`--data` supports `@filename` (read from a file), `-` (read from stdin), or inline JSON; `--header <key:value>` can be repeated.

The raw API tries to preserve the daemon's original HTTP semantics as much as possible; scripts consuming it should check both the response body's `ok` and the HTTP status, not just the process exit code.

## skills — Agent skill management 🟢

Installs the `SKILL.md` files shipped with the package into an Agent's skills discovery directory, so the Agent can drive `yoooclaw` commands on its own. See [Agent Skill](/en/cli/skills) for details.

| Command | Description |
| --- | --- |
| `skills list` | List the built-in Skills shipped with the CLI and their trigger descriptions. |
| `skills targets` | List the supported Agent skills directories and auto-detection results. |
| `skills install` | Install into an Agent's skills directory. `--agent <agent>` (`auto` / `claude` / `codex` / `custom`, default `auto`), `--target <dir>`, `--copy`, `--force`. |

```bash
yoooclaw skills list
yoooclaw skills targets
yoooclaw skills install            # auto-detect the single available Agent and symlink-install
yoooclaw skills install --agent codex
```

## Maintenance commands

| Command | Description |
| --- | --- |
| `migrate from-openclaw` 🟢 | Migrate notifications / recordings / rules / images and api-keys from `~/.openclaw/plugins/phone-notifications/` into `~/.yoooclaw/`, automatically backing up beforehand. `--dry-run`, `--source <path>`. |
| `update self` 🟢 | Check the npm registry, compare versions, and prompt (doesn't auto-update). The response's `dist` identifies the current install source (`npm` / `native`), and `command` gives the matching upgrade command: the npm form returns `npm update -g @yoooclaw/cli`, the native binary form returns `curl ... install.sh \| sh`. `--beta`, `--json`. |
| `doctor` 🟢/🟡 | Environment self-check: Go runtime, directory permissions, keychain, daemon, config. `--json`, `--fix`. Network self-checks (relay / OSS) are left to `gateway test` / `tunnel +test`. |
| `uninstall` 🔵 | Uninstall the CLI: stops the daemon for every profile, removes the binary (the `yoooclaw` and `yc` symlinks) and config (each profile's `config.json`, `credentials.json`, `active-profile`, `daemon.lock` at both the account and profile level), **keeping notification / recording / image data by default**. `--data` also wipes the data (clears `~/.yoooclaw`); `--yes` skips confirmation. The npm install form can't remove its own binary and will prompt you to run `npm uninstall -g @yoooclaw/cli`. |

```bash
yoooclaw migrate from-openclaw --dry-run
yoooclaw doctor --format json
yoooclaw uninstall              # stop the daemon + remove binary and config, keep data
yoooclaw uninstall --data --yes # wipe data too, no confirmation
```
