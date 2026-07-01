# Agent Skill

`@yoooclaw/cli` ships a set of **Skills** (`SKILL.md`) — natural-language descriptions of "which `yoooclaw` commands to call, and when" — so an Agent can drive the CLI on its own without you teaching it step by step.

::: tip Difference from the plugin form
In the openclaw plugin, these Skills are auto-registered via the `skills` field in [`openclaw.plugin.json`](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/openclaw.plugin.json) and loaded automatically when the host starts. The standalone CLI has no host to do this for it — the Skills just sit in `<pkg>/skills/` inside the npm package and **need to be installed manually** into the current Agent's skills discovery directory.
:::

## Built-in Skills

### Notifications / light effects / connectivity

| Skill | Trigger scenario |
| --- | --- |
| `yoooclaw-notification-query` | "Check my recent notifications / who's messaged me / summarize today's messages / what notifications does some app have" — streams notification queries, using `summary` for small batches and `summary-job` chunked summarization for large ones; pure disk reads, no daemon needed. |
| `yoooclaw-lightrule-create` | "Light up / blink when I get some kind of notification" — this kind of **persistent rule**: the daemon evaluates matches after ingest and triggers the light effect, requiring the daemon to be running. |
| `yoooclaw-tunnel-debug` | "Phone pushes aren't arriving / notifications aren't syncing / check the tunnel / is the daemon alive" — combines `daemon status` / `tunnel status` / `tunnel +test` / `gateway test` to self-check the receive path. |

### Recording processing

Built around transcript files from long phone recordings. These Skills always locate the transcript files' **real storage location** first via `yoooclaw recording storage-path` / `recording list` — never assume the recordings directory or substitute memory/document search for it, or things will get missed. Pure disk reads, no daemon needed.

| Skill | Trigger scenario |
| --- | --- |
| `yoooclaw-recording-query` | "What recordings are there / look up a recording / what did this recording say / answer a question based on the recording / view a recording's summary/transcript / search recording content" — query local long-recording records and transcript content. |
| `yoooclaw-recording-meeting-minutes` | "Write up the meeting minutes / summarize this meeting / what are the action items from the meeting" — turn a meeting recording's transcript into structured meeting minutes. |
| `yoooclaw-recording-interview` | "Organize the interview content / extract the key points / turn it into Q&A / produce interview Q&A" — turn an interview recording's transcript into a structured interview writeup. |
| `yoooclaw-recording-entity-extraction` | "Extract information / find contact info / who's mentioned / key info / extract from a file" — extract entities like names, contact info, organizations, and terminology from a transcript or text, outputting sidecar JSON. |
| `yoooclaw-recording-translation` | "Translate the recording / translate into [language] / translate the file / write it up in [language]" — translate a transcript or text into a target language, supporting a two-stage flow (extract a glossary first, then translate), preserving timestamps, and outputting a Markdown sidecar. |
| `yoooclaw-recording-mindmap` | "Generate a mind map / draw a mind map / turn this into a mind map / generate an outline from this file" — generate a Markdown mind map, either from a recording's transcript or any text. |

```bash
yoooclaw skills list                 # list the built-in Skills shipped with the package and their triggers
yoooclaw skills targets              # see the supported Agent targets and detection results
```

## Installation

```bash
yoooclaw skills install              # auto-detect the single available Agent and symlink-install
yoooclaw skills install --agent codex
yoooclaw skills install --agent claude
yoooclaw skills install --copy       # copy instead of symlinking
yoooclaw skills install --target ~/.config/agent/skills --force
```

| Flag | Description |
| --- | --- |
| `--agent <agent>` | The target Agent to install into; supports `auto` / `claude` / `codex` / `custom`, default `auto`. |
| `--target <dir>` | The target install directory; when passed, takes priority over auto-detection — suitable for any Agent compatible with the `SKILL.md` directory layout. |
| `--copy` | Copy the directory instead of creating a symlink. Use this when creating symlinks fails without admin rights on Windows. |
| `--force` | Overwrite if a Skill with the same name already exists at the target; otherwise it's skipped and reported under `skipped`. |

`auto` mode only auto-installs when exactly one Agent is detected. If both Claude Code and Codex are detected, or neither is, the CLI returns the candidate targets and requires you to explicitly pass `--agent` or `--target`, to avoid silently installing into the wrong host.

Default directories for the built-in Agents:

| Agent | Default skills directory |
| --- | --- |
| `claude` | `~/.claude/skills` |
| `codex` | `${CODEX_HOME}/skills`, or `~/.codex/skills` if unset |

::: info Symlink by default vs. copy
By default, a **symlink** is created pointing into the package's `skills/`: after `yoooclaw update self` upgrades the CLI, the Skill content automatically follows the new version, with no reinstall needed. `--copy` produces a snapshot, which needs `install --force` again after an upgrade.
:::

Once installed, **restart the Agent session** for it to be discovered. After that, just say something like "check my recent notifications," and the Agent will follow `yoooclaw-notification-query`'s guidance to call `yoooclaw notification` commands.

## Idempotency and troubleshooting

- If you're not sure where it should be installed, first run `yoooclaw skills targets` to see `detected` and `target`.
- Re-running `skills install` (symlink mode) when the link already points to the same source is treated as "already installed" — no error, and it's not counted in `skipped`.
- In the output, `installed` lists Skills newly installed or already in place this run; `skipped` lists ones skipped because they already exist (with a reason) — add `--force` to overwrite.
- If creating a symlink fails with `YOOOCLAW_STORAGE_UNAVAILABLE` (`EPERM`/`EACCES`, most often on Windows), use `--copy` instead.
