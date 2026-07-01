# Debugging & Troubleshooting (Relay connections and logs)

For phone notifications and recordings to arrive, the path is **phone app → hosted Relay → local daemon → written to disk**. The "connect to Relay" step is initiated by the daemon at startup: the daemon connects to `wss://…/message/messages/ws/plugin` using the account-level api-key, then hands `req` frames forwarded by Relay to the Go Dispatcher to route to the daemon's gateway; HTTP-style frames are looped back to the daemon's own HTTP server. In multi-key mode, each api-key label gets its own Relay tunnel.

So the troubleshooting order is always the same three steps: **does the CredentialSet have a usable key → is the daemon running → is the tunnel connected**.

## Three steps to confirm Relay is connected

```bash
yc auth status           # 1. is an api-key / apiKeys[] in place
yc auth list-api-keys    # with multiple keys, check mode, defaultLabel, label list
yc daemon status         # 2. is the daemon running (also check the relay/tunnels fields)
yc tunnel status         # 3. tunnel connection status
```

`tunnel status` looks like this when connected:

```json
{ "ok": true, "mode": "relay", "credentialMode": "file-multi",
  "defaultLabel": "phone-a", "connected": true,
  "relayUrl": "wss://openclaw-service.yoooclaw.com/message/messages/ws/plugin",
  "enabled": true, "reconnectAttempt": 0,
  "tunnels": [
    { "label": "phone-a", "default": true, "connected": true, "reconnectAttempt": 0 },
    { "label": "phone-b", "default": false, "connected": true, "reconnectAttempt": 0 }
  ] }
```

How to read the fields:

| Field | Meaning |
| --- | --- |
| `mode` | `relay` = going through the hosted tunnel; `standalone-http` = the tunnel never started (no api-key, or `relay.enabled=false`), direct HTTP only |
| `credentialMode` | `env-single` / `file-multi` / `keychain-single` / `legacy-file-single` / `none` |
| `defaultLabel` | The default api-key label; used by ASR fallback and legacy single-key status fields |
| `connected` | Whether a WebSocket to Relay is established and heartbeating |
| `reconnectAttempt` | Cumulative reconnect count; `0` means it connected once and never dropped |
| `lastDisconnectReason` | The reason for the most recent disconnect (e.g. `error: Unexpected server response: 403`) |
| `tunnels[]` | The list of tunnels under multiple keys; each item has `label`, `default`, `connected`, `reconnectAttempt` |
| `note` | An actionable hint when not connected |

`yc tunnel status --client phone-a` shows just the specified label. Relay is connected when the daemon starts: if `auth status` shows `daemon.running: false`, `tunnel status` won't show a connection — run `yc daemon start` first.

## Reading logs

The daemon writes file logs to `~/.yoooclaw/profiles/<profile>/daemon.log`, rotated daily to `daemon.log.YYYY-MM-DD`. Two ways to view them:

```bash
# search (🟢 pure disk read, no daemon needed)
yc log relay                       # filter by keyword
yc log --level warn --limit 100    # by level / count
yc log --from 2026-05-21           # by date range
yc log +errors                     # error-level since yesterday

# live follow (🔵 continuous tail)
yc daemon logs -f                  # like tail -f
yc daemon logs -f --level error    # only follow errors
```

You can also just run `tail -f ~/.yoooclaw/profiles/default/daemon.log` directly.

### Reading key log lines

A normal startup + connect roughly looks like:

| Log line (excerpt) | Meaning |
| --- | --- |
| `Port 18789 in use, trying 18790` / `Bound to 18790` | The default port was taken, so it auto-incremented (see "Ports" below) |
| `Relay multi-tunnel started: phone-a,phone-b (mode=file-multi, default=phone-a)` | The daemon has built a tunnel for each label in `apiKeys[]` |
| `CredentialSet reload(manual): mode=file-multi, default=phone-b, started=..., stopped=...` | A manual reload or file watch triggered a credential hot reload |
| `Relay tunnel: started (url=… → in-process gateway dispatch)` | The RelayDispatcher has taken over inbound frames; subsequent `req`s call the daemon runtime directly |
| `Relay tunnel: connecting to wss://… (apiKey=ock-…)` | The connection is being established; the api-key is masked |
| `Relay tunnel: ✔ connected, heartbeat started` | **Connected**, heartbeat started |
| `→ heartbeat "ping"` / `← pong received` | A keepalive heartbeat every 10s; seeing this continuously means the connection is stable |
| `Relay tunnel: relay disconnected (…)` | Disconnected, then enters exponential-backoff reconnection |
| `[relay-dispatcher] req id=… method=recordings.result.write` | The app / cloud called a gateway method over Relay, and it's been dispatched into the daemon |
| `[recording-status] <id> → transcribing` | A recording status change happened, and it's been appended to `recordings/state/events.jsonl` |

## Common symptoms → fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `tunnel status` shows `mode: standalone-http`, `note` says no api-key | No api-key set, so the tunnel was skipped | For a single key, `yc auth set-api-key <ock_…>`; for multiple keys, `yc auth add-api-key <ock_…> --label <label>`, then `yc daemon reload` |
| `connected: false`, `lastDisconnectReason` contains `403` | Invalid / expired api-key, or account mismatch | Use the correct api-key; with multiple keys, first find the specific label with `yc tunnel status --client <label>`, then `yc daemon reload` |
| All 🟡 commands report `YOOOCLAW_DAEMON_NOT_RUNNING` | The daemon isn't running | `yc daemon start` |
| `mode: standalone-http` even though an api-key is set | `relay.enabled=false` | `yc config set relay.enabled true`, then restart |
| `connected: false`, `reconnectAttempt` keeps climbing | Network unreachable / Relay unreachable | Check the network; you can temporarily fall back to a direct HTTP connection (see below) |
| A recording stays at `synced` with no transcript | ASR isn't configured, or the cloud model-proxy ASR is unavailable | Retry after `yc recording setup-asr --mode api --language auto --non-interactive`; also check `yc recording events --id <id>` |
| A recording has a lingering `lastError` | A historical failure message wasn't cleared | The daemon auto-clears `lastError` on reaching a successful terminal state like `synced` / `transcribed`; restart the daemon and watch the event stream |

## Active checks and self-tests

```bash
yc daemon reload      # re-read apiKeys[] and incrementally refresh multiple Relay tunnels
yc tunnel reconnect   # force disconnect and reconnect (after changing api-key or network recovery)
yc tunnel reconnect --client phone-a
yc tunnel +test       # loopback self-test: the daemon sends itself an echo notification, verifying ingest + auth
yc tunnel +test --client phone-a
yc gateway test       # simulate the phone calling /notifications, verifying connectivity / auth
yc doctor             # environment self-check: Go runtime, directory permissions, keychain, daemon, config
```

Once a notification arrives, `lastIngestAt` / `ingestCount` in `yc daemon status` change, and `yc notification search --client <label>` will show the notification written for that label — these two are the final proof that "the whole chain is working."

Once a recording arrives, start by looking at the list and the latest event:

```bash
yc recording list
yc recording +latest
yc recording events --since 1h --limit 50
```

To debug a specific recording:

```bash
yc recording status <recording-id>
yc recording events --id <recording-id> --watch
```

The event file lives at `~/.yoooclaw/profiles/<profile>/recordings/state/events.jsonl`. It's append-only, and local queries don't depend on whether the daemon is currently running; `--watch` first prints matching historical events, then keeps tailing new ones.

## Ports

The listen address is always the loopback `127.0.0.1`, starting at port `18789` — **there's no need for, and no longer any, interactive port configuration**. If `18789` is taken at startup, the daemon automatically increments `+1` (`18790`, `18791`, …), writing the actual port into the log and `daemon status`. So when troubleshooting, trust the `port` in `daemon status` — don't assume it's always 18789.

## Fallback when not using Relay

When Relay is temporarily unavailable, the daemon's HTTP server is always listening locally, so you can set up your own tunnel: use `cloudflared` or `tailscale serve` to reverse-proxy to `http://127.0.0.1:<port>`, and point the phone at that address plus the gateway token — no dependency on the hosted Relay.
