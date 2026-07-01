# Standalone CLI

`@yoooclaw/cli` is the standalone `yoooclaw` / `yc` command line — it ships its own background daemon and **doesn't require the openclaw client app to be online**. Its design follows Lark's [lark-cli](https://github.com/larksuite/cli): a service-oriented command tree, a three-tier command system (Shortcuts / Service Commands / Raw API), unified `--format`, and Agent-Native.

::: tip Current status: all commands available
Every service command has landed: local read-only commands (🟢, pure disk reads) work out of the box; daemon commands (🔵) and control commands that require the daemon to be running (🟡) collaborate over a local HTTP RPC. Phones can reach the local daemon via yoooclaw's hosted Relay; when Relay is unavailable, you can still fall back to `cloudflared` / `tailscale serve` to reverse-proxy the local HTTP server.
:::

## Installation

There are two distribution channels with identical functionality — pick based on whether it's convenient for you to have Node installed. The npm package is an extremely thin Node launcher that pulls the current platform's native Go binary via optionalDependencies at install time; the native binary channel downloads the same Go binary directly.

::: tip Platform support
The npm channel supports `x64+arm64` on `darwin/linux` plus `win32-x64` (the launcher needs Node ≥ 18). Direct install via `install.sh` / GitHub Release supports `x64+arm64` on `darwin/linux`. Windows has two differences: credentials are stored in plaintext at `~/.yoooclaw/credentials.json` (no OS keychain hardening — `yoooclaw doctor` flags this as `skip` with a hint), and `yoooclaw daemon stop` exits gracefully via HTTP `/daemon/stop` instead of a POSIX signal. See [Storage & Directories](/en/cli/storage) for details.
:::

### A. npm (thin Node launcher + platform Go binary)

No install (npx, always pulls the latest version):

```bash
npx @yoooclaw/cli --help          # main command
npx @yoooclaw/cli notification +today
```

Global install (provides both the `yoooclaw` and `yc` commands):

```bash
npm i -g @yoooclaw/cli
yoooclaw --help        # main command
yc --help              # equivalent short alias
```

> `npx @yoooclaw/cli` always invokes the `yoooclaw` entry point (`yoooclaw` and `yc` point to the same executable).

### B. Native binary (no Node required)

A single-file Go executable, with faster cold starts and lower resource usage than the old TS/Bun form.

```bash
# auto-detect platform, download, verify sha256, write to ~/.local/bin
curl -fsSL https://raw.githubusercontent.com/YoooClaw/cli/master/scripts/install.sh | sh

# specify version / install dir / force overwrite
curl -fsSL https://raw.githubusercontent.com/YoooClaw/cli/master/scripts/install.sh \
  | sh -s -- --version 0.2.0-beta.1 --dir ~/bin --force
```

Direct-install platforms: `darwin-arm64` / `darwin-x64` / `linux-x64` / `linux-arm64`. The Windows Go binary currently ships as an npm platform subpackage — use the npm channel above for Windows.

You can also download the binary manually from [GitHub Releases](https://github.com/YoooClaw/cli/releases) and verify it against that release's `checksums.txt`.

> `yoooclaw update self` automatically detects the current install source (npm vs native binary) and gives you the matching upgrade command — don't mix the two channels.

### Uninstall

```bash
# stop the daemon + remove the binary and config, keep notification / recording / image data
yoooclaw uninstall

# wipe the data too (clears ~/.yoooclaw), no confirmation prompt
yoooclaw uninstall --data --yes
```

The native binary form removes its own `yoooclaw` and `yc` symlinks; the npm install form is managed by node_modules and can't remove itself — `uninstall` will prompt you to also run `npm uninstall -g @yoooclaw/cli`.

## 5-minute quickstart

```bash
# 1) Interactive wizard: enter your Relay api-key, generate config.json and a
#    gateway token, and automatically start the daemon in the background
#    (no need to run daemon start separately)
yoooclaw config init

# 2) Check status: PID, listening port, relay, number of light rules, latest ingest
yoooclaw daemon status

# 3) Look up today's notifications (once phone pushes have landed on disk)
yoooclaw notification +today
```

> `config init` automatically brings up the daemon in the background at the end. If you enter an api-key in the wizard, it connects to Relay and just works out of the box;
> if you left it blank, set one afterward with `yoooclaw auth set-api-key <ock_xxx>` and then `yoooclaw daemon restart` so the daemon connects to Relay.
> If you only want to generate the config without starting the daemon, add `--no-start`.

For multi-phone / multi-account setups, give each key a stable label; the daemon opens one Relay tunnel per label, and inbound data carries the matching `clientLabel`:

```bash
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw daemon reload
yoooclaw tunnel status
yoooclaw notification +today --client phone-a
```

Server / headless deployments (wrapped in systemd / launchd):

```bash
yoooclaw daemon start --bind 0.0.0.0 --port 18789 --no-detach
```

> Binding to `0.0.0.0` requires a gateway token to already be set, or startup is refused.

## Recording sync and ASR

The daemon receives transcripts and summaries written by the app / cloud via `recordings.result.write` (optionally downloading the audio in the background if an `ossUrl` is included) into the current profile's `recordings/`. Re-transcribing locally is triggered via `recordings.retranscribe` according to config; in the standalone CLI, ASR config is written once locally to `recordings/asr-config.json`, and the daemon reads it automatically when a request doesn't include an `asr` field.

```bash
# api mode: if --api-key isn't passed, the daemon falls back to the account-level ock- key
yoooclaw recording setup-asr --mode api --language auto --non-interactive
```

The current Go beta only supports `api` / model-proxy ASR. The `local` and `yoooclaw` modes are still kept in the config schema for compatibility with older requests, but are rejected during validation.

While recordings sync, the daemon appends state changes to `recordings/state/events.jsonl`, which the CLI can query directly or follow continuously:

```bash
yoooclaw recording list
yoooclaw recording +latest
yoooclaw recording events --since 1h --limit 50
yoooclaw recording events --id <recording-id> --watch
```

## Agent-Native

The CLI itself is the Agent's toolset — there's no need to stand up a separate MCP server:

- Every command supports `--format ndjson`, so an Agent can stream and consume results incrementally;
- Failures uniformly return `{ ok: false, error: { code, message, hint } }`, with error codes prefixed `YOOOCLAW_*`; local CLI errors return a non-zero exit code, and for raw HTTP results you should check both `ok` and the HTTP status;
- `yoooclaw api <METHOD> <PATH>` is a raw escape hatch straight to the daemon's HTTP API.

A set of Skills ships with the package (streaming notification queries with chunked summarization, creating light rules from stdin, tunnel debugging, and a series of recording/transcript processing skills) to teach an Agent to call the commands directly. Before installing, you can check which Agent targets are supported:

```bash
yoooclaw skills targets      # see which Agents this can be installed into
yoooclaw skills install      # auto-detect the single available Agent and symlink-install
```

See [Agent Skill](/en/cli/skills) for details.

## Next steps

- [Command System & Output](/en/cli/usage) — the three-tier command system, global flags, output contract, and data directory.
- [Command Reference](/en/cli/commands) — every subcommand listed by service, with examples.
- [Agent Skill](/en/cli/skills) — install the bundled Skills into an Agent so it can drive the CLI on its own.
