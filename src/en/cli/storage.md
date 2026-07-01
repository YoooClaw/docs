# Storage & Context Building

The CLI writes the three kinds of data pushed from the phone — **notifications, recordings (including transcripts / summaries), and images** — all to local files, then uses a set of commands to turn them into context an Agent can consume directly.

This chapter has two halves: the first covers **how each of the three data types gets written to disk**, and the second covers **how the CLI turns that on-disk data into context**. For where the storage directory sits within a profile, see [Architecture & Implementation · Profiles](/en/cli/architecture); for how `clientLabel` tagging works across multiple accounts, see [Multi API-Key Design](/en/cli/multi-api-key).

## Design philosophy: disk writes are the source of truth, reads are context

All three data types share the same underlying approach:

1. **Everything is written to a local file first** — notifications are per-day JSON, recordings / images each have an `index.json` plus entity files, and status is driven by a state machine. The files are the source of truth; whether the daemon is online has no effect on "reading."
2. **Read and write control are separated** — query commands (🟢) do pure disk reads, so they **work right after a cold start**, no daemon required.
3. **A consistent trio across data types** — each type has: a metadata index, a sync / transcription state, a `clientLabel` source tag, and a resolvable local path. An Agent either gets a complete result or a clear "not ready yet" error — **it never gets a partial result**.

```text
profiles/<name>/
├── notifications/          # per-day JSON + dedup indexes
│   ├── 2026-05-25.json
│   ├── .ids/               # dedup by id
│   └── .keys/               # dedup by content fingerprint
├── recordings/
│   ├── audio/              # raw audio (.ogg)
│   ├── transcript-data/    # transcript JSON (primary storage)
│   ├── transcripts/        # transcript text .md (derived)
│   ├── summaries/          # summary .md (derived)
│   ├── index.json          # metadata + state index
│   ├── asr-config.json     # local ASR config
│   └── state/events.jsonl  # state event stream
└── images/
    ├── index.json          # metadata + sync state
    └── files/              # downloaded image files
```

## Notifications: per-day JSON with double deduplication

Notifications are written per day to `notifications/YYYY-MM-DD.json` (a JSON array, append-only). Each [StoredNotification](https://github.com/YoooClaw/cli/blob/master/src/vendor/notification/storage.ts) looks like:

```json
{
  "clientLabel": "phone-a",
  "appName": "com.tencent.xin",
  "appDisplayName": "WeChat",
  "title": "Mr. Wang",
  "content": "The 3pm meeting moved to 4pm",
  "timestamp": "2026-05-25T14:02:11+08:00",
  "senderName": "Mr. Wang",
  "conversationType": "private"
}
```

A few key points:

- **`appDisplayName` is filled in by the backend's app-name-map** — the package name `com.tencent.xin` is resolved to "WeChat" at write time, making the context more readable for both humans and models.
- **IM apps like Lark get structured splitting** — title / subtitle are normalized into `senderName` / `conversationType` / `conversationName`, so group chats and DMs can be distinguished.
- **Double deduplication**: `.ids/` deduplicates by the notification's `id`, and `.keys/` deduplicates by a SHA-256 content fingerprint of `clientLabel`+app+title+content+timestamp. The same message being re-pushed by the phone, or delivered twice under multiple keys, won't land twice. Dedup happens per `clientLabel` — the same content received by different accounts doesn't shadow each other.
- **Retention**: data files and both indexes are automatically cleaned up once `retentionDays` expires.

## Recordings: audio → transcript JSON → summary

Recordings have the longest pipeline, written across a four-level directory structure strung together by `index.json`. Recording results are written by the app / cloud via `recordings.result.write`:

```text
recordings.result.write (transcript/summary, optional ossUrl)
  ↓  entry written to index.json (status=synced on creation)
transcript-data/<id>.json   ← primary transcript storage (structured: title/summary/text/segments)
transcripts/<id>_<title>.md  ← body text (derived)
summaries/<id>.md           ← summary (derived)
  ↓  optional: if ossUrl is present, download the audio in the background → audio/<id>.ogg
  ↓  status=transcribed
```

When you need to re-transcribe locally on the daemon's machine, `recordings.retranscribe` triggers it using local / request-level ASR config: `status=transcribing → ASR (api/model-proxy, falls back to the account ock- key by default) → transcribed`.

Key design points:

- **The JSON in `transcript-data/` is the primary storage**; the text in `transcripts/` and the summary in `summaries/` are both derived from it. `readTranscript` / `readSummary` prefer reading the JSON, falling back to Markdown only for legacy data — keeping old and new data on the same footing.
- **`title` / `summary` built in**: finishing a transcription also produces a short `title` and a summary, written into the index and `summaries/`. When an Agent wants a quick sense of "what's this recording about," **reading the summary is enough — no need to pull the full text**.
- **A strictly validated state machine**: `transfer_status` transitions `synced → transcribing → transcribed` (or `transcribe_failed`) via a state machine, and illegal transitions are rejected outright. Writing a result via `result.write` is an out-of-band disk write, and goes straight to `transcribed`. A `transcribing` state left over from a daemon restart is treated as interrupted and set to `transcribe_failed`.
- **Event stream**: every state change is appended to `state/events.jsonl`; `yc recording events --id <id> --watch` can follow it like `tail -f`, and the same event is also pushed back to the phone via Relay as `recording.status`.

ASR config is written to `recordings/asr-config.json` (generated by `yc recording setup-asr`); when `mode=api` is missing a key, it falls back to the account-level `ock-` key. The current Go beta only supports `api` / model-proxy; the `local` mode is kept in the schema for compatibility with older requests, but is rejected during validation.

## Images: a download pipeline mirroring recordings

Images arrive via `POST /images`, are written to `images/index.json`, and then **downloaded from OSS as a background stream** to `images/files/<id>.<ext>`:

```text
POST /images → entry written to index.json, status=syncing
  ↓  background fetch(ossUrl) streamed to files/<id>.<ext>
status=synced (failure → sync_failed, with lastError recorded)
```

`image path <id>` returns `YOOOCLAW_IMAGE_NOT_READY` rather than a partial file while the download is still in progress — so when an Agent feeds the local path to a multimodal model, it either gets the complete image or a clear "not ready yet." `index.json` also carries metadata like `clientLabel`, `source_app`, and `caption`.

## How the CLI helps you build context

The disk writes are just raw material — the CLI's command layer turns them into context an Agent can use easily. There are six core mechanisms:

### 1. Presets for high-frequency scenarios (shortcuts)

The `+` prefix hardcodes the most common queries into a single command, so an Agent doesn't have to assemble a pile of flags:

```bash
yc notification +today      # today's notification summary
yc notification +recent     # the last hour
yc recording +latest        # the most recent recording (with title/summary/transcript)
yc image +latest            # details for the most recent image
```

### 2. Aggregation commands built for "summarize this"

`notification summary` doesn't just spit out notifications one by one — it returns **aggregate statistics + recent samples** together, exactly the shape an Agent needs to write a summary; `notification stats` supports multi-dimensional aggregation by `date|app|sender|hour|client`:

```bash
yc notification summary --from 2026-05-25T00:00:00+08:00 --sample 30 --top 10
yc notification stats --dim app --from 2026-05-20
```

### 3. Incremental cursors for feeding a memory system

The `sync` service (`scan` / `fetch` / `commit`) provides a cursor scheme designed for "continuously pipe notifications into a memory system": `scan` finds how much is pending per date, `fetch` gets a given date's details and returns `endIndex`, and `commit` marks that batch processed using that `endIndex`. **Re-running doesn't re-ingest**, and it can resume from where it left off.

### 4. Recordings read "summary-first"

`recording status <id>` / `+latest` return `title` + `summary` + `transcript`, so an Agent can look at the summary first and decide whether to expand the full text, saving tokens:

```bash
yc recording +latest                  # the latest recording's title + summary + text
yc recording list --status transcribed --client phone-a
```

### 5. Images provide a "local absolute path" for multimodal input

`image +latest` / `image path <id>` return the **local file's absolute path** directly, for an Agent to feed to a multimodal model; if the download hasn't finished, they return `YOOOCLAW_IMAGE_NOT_READY` instead of a partial file.

### 6. An Agent-facing output contract

All commands support a unified `--format json|pretty|table|ndjson`:

- **`ndjson`** puts one JSON result per line, ideal for an Agent to stream and consume with backpressure;
- Success `{ "ok": true, ... }` / failure `{ "ok": false, "error": { "code": "YOOOCLAW_*", ... } }` share stdout; local CLI errors additionally set a **non-zero exit code**, and raw HTTP results should also be checked for `ok` / HTTP status;
- `--client <label>` splits context by account; `--client all` means no filter.

Putting these together, building context for "summarize what happened on my phone today" looks like:

```text
yc notification summary +today      → today's aggregated notifications + samples
yc recording list --status transcribed
  └─ yc recording status <id>       → read the summary for the recordings picked out
yc image +latest                    → the latest image's local path, for a multimodal model
            ↓  all with --format ndjson / json
        Agent assembles context → answers
```

## Next steps

- [Command Reference](/en/cli/commands) — every subcommand and flag for `notification` / `recording` / `image` / `sync`.
- [Agent Skill](/en/cli/skills) — how an Agent drives these commands automatically.
- [Architecture & Implementation](/en/cli/architecture) — the full picture of the daemon, ingest, and the recording state machine.
- [Multi API-Key Design](/en/cli/multi-api-key) — where `clientLabel` comes from, and how to switch between accounts.
