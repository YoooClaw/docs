# Getting Started

This documentation covers the standalone `yoooclaw` / `yc` CLI: it ships its own local daemon, doesn't require the host app to be online, and abstracts phone notifications, recordings, images, light rules, tunnels, and monitoring into an Agent-Native command suite with a unified `--format` output and error contract.

## Packages

| Package | Status | Description |
| --- | --- | --- |
| [`@yoooclaw/cli`](/en/cli/) | Available | The standalone `yoooclaw` / `yc` CLI: ships its own daemon; config / notification / recording / image / light-rule / tunnel / monitor commands are all implemented, with a unified `--format` output and error contract, Agent-Native. |

- Want a standalone command line (own daemon, no host app required) → see the [standalone CLI](/en/cli/).

## Prerequisites

- Installing via npm: Node.js `>= 18` (only used to start the thin launcher; the actual work is done by the native Go binary)
- Installing directly via `install.sh` / GitHub Release: no Node required
- Building from source: the Go toolchain; currently verified locally with Go `1.26.4`
- ASR: the current Go beta only supports cloud `api` / model-proxy mode; no local Whisper needed
- Platforms: the npm channel supports `x64+arm64` on `darwin/linux` plus `win32-x64`; native direct install supports `x64+arm64` on `darwin/linux`. On Windows, credentials are stored in plaintext and the daemon shuts down gracefully over HTTP — see the [CLI overview](/en/cli/) for details.

Install example:

```bash
npm i -g @yoooclaw/cli
yoooclaw --help
```

## Building from source

```bash
git clone https://github.com/YoooClaw/cli.git
cd cli

go test ./...
go vet ./...
scripts/build-go.sh --current
dist-native/yoooclaw-darwin-arm64 --help
```

## Next steps

- [CLI: Overview & Installation](/en/cli/) — install the standalone command line and get familiar with its command suite.
- [CLI: Architecture & Implementation](/en/cli/architecture) — the Go daemon startup flow, Relay dispatch, and profile / credential layering.
