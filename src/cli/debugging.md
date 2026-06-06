# 调试与排错（Relay 连接与日志）

手机通知和录音要进来，链路是 **手机 App → 托管 Relay → 本机 daemon → 落盘**。其中「连 Relay」这一步由 daemon 在启动时发起：daemon 用 account 级 api-key 连上 `wss://…/message/messages/ws/plugin`，再把 Relay 转发进来的 `req` 帧交给 Go 版 Dispatcher 分发到 daemon gateway；HTTP-style frame 则 loopback 到 daemon 自己的 HTTP server。多 key 模式下，每个 api-key label 都会对应一条 Relay 隧道。

所以排查顺序固定是三步：**CredentialSet 有没有可用 key → daemon 在不在跑 → 隧道连没连上**。

## 三步确认 Relay 连上

```bash
yc auth status           # 1. api-key / apiKeys[] 是否就位
yc auth list-api-keys    # 多 key 时看 mode、defaultLabel、label 列表
yc daemon status         # 2. daemon 是否在跑（顺带看 relay/tunnels 字段）
yc tunnel status         # 3. 隧道连接状态
```

`tunnel status` 连上时长这样：

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

字段怎么读：

| 字段 | 含义 |
| --- | --- |
| `mode` | `relay`＝走托管隧道；`standalone-http`＝隧道没起（没 api-key 或 `relay.enabled=false`），仅直连 HTTP |
| `credentialMode` | `env-single` / `file-multi` / `keychain-single` / `legacy-file-single` / `none` |
| `defaultLabel` | default api-key label；ASR fallback 和兼容单 key 的状态字段会用它 |
| `connected` | 是否已和 Relay 建立 WebSocket 并在心跳 |
| `reconnectAttempt` | 累计重连次数，`0` 表示一次连上没断过 |
| `lastDisconnectReason` | 最近一次断开原因（如 `error: Unexpected server response: 403`） |
| `tunnels[]` | 多 key 隧道列表；每项包含 `label`、`default`、`connected`、`reconnectAttempt` |
| `note` | 未连上时给出可执行提示 |

`yc tunnel status --client phone-a` 可以只看指定 label。Relay 是 daemon 启动时连的：`auth status` 显示 `daemon.running: false` 时，`tunnel status` 不会有连接——先 `yc daemon start`。

## 看日志

daemon 写文件日志到 `~/.yoooclaw/profiles/<profile>/daemon.log`，按日轮转为 `daemon.log.YYYY-MM-DD`。两种看法：

```bash
# 检索（🟢 纯读磁盘，不需要 daemon）
yc log relay                       # 关键字过滤
yc log --level warn --limit 100    # 按级别 / 条数
yc log --from 2026-05-21           # 按日期区间
yc log +errors                     # 昨天起的 error 级

# 实时跟踪（🔵 持续 tail）
yc daemon logs -f                  # 类似 tail -f
yc daemon logs -f --level error    # 只跟 error
```

也可以直接 `tail -f ~/.yoooclaw/profiles/default/daemon.log`。

### 关键日志行解读

一次正常启动 + 连上，日志大致是：

| 日志行（节选） | 含义 |
| --- | --- |
| `端口 18789 被占用，改试 18790` / `最终绑定到 18790` | 默认端口被占，自动 +1（见下文「端口」） |
| `Relay 多隧道已启动：phone-a,phone-b（mode=file-multi, default=phone-a）` | daemon 已按 `apiKeys[]` 为每个 label 建隧道 |
| `CredentialSet reload(manual): mode=file-multi, default=phone-b, started=..., stopped=...` | 手动或文件 watch 触发凭据热重载 |
| `Relay tunnel: 已启动（url=… → in-process gateway dispatch）` | RelayDispatcher 已接管入站帧，后续 `req` 会直接调 daemon runtime |
| `Relay tunnel: connecting to wss://… (apiKey=ock-…)` | 开始建连，api-key 已遮罩 |
| `Relay tunnel: ✔ connected, heartbeat started` | **连上了**，心跳启动 |
| `→ heartbeat "ping"` / `← pong received` | 每 10s 一次心跳保活，能持续看到说明连接稳定 |
| `Relay tunnel: relay disconnected (…)` | 断开，随后进入指数退避重连 |
| `[relay-dispatcher] req id=… method=recordings.sync` | 手机端经 Relay 调了 gateway 方法，已进入 daemon 分发 |
| `[recording-status] <id> → transcribing` | 录音状态变化已产生，并会追加到 `recordings/state/events.jsonl` |

## 常见症状 → 处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `tunnel status` 是 `mode: standalone-http`，`note` 提示没 api-key | 没设 api-key，隧道被跳过 | 单 key 用 `yc auth set-api-key <ock_…>`；多 key 用 `yc auth add-api-key <ock_…> --label <label>`，然后 `yc daemon reload` |
| `connected: false`，`lastDisconnectReason` 含 `403` | api-key 无效 / 过期 / 账号不匹配 | 换正确的 api-key；多 key 时先用 `yc tunnel status --client <label>` 定位具体 label，再 `yc daemon reload` |
| 所有 🟡 命令报 `YOOOCLAW_DAEMON_NOT_RUNNING` | daemon 没跑 | `yc daemon start` |
| `mode: standalone-http` 但已设 api-key | `relay.enabled=false` | `yc config set relay.enabled true` 后重启 |
| `connected: false`，`reconnectAttempt` 持续增长 | 网络不通 / Relay 不可达 | 查网络；临时可走直连 HTTP（见下） |
| 录音停在 `synced` 没有转写稿 | 未配置 ASR，或云端 model-proxy ASR 不可用 | `yc recording setup-asr --mode api --language auto --non-interactive` 后重试；同时看 `yc recording events --id <id>` |
| 录音状态一会儿成功一会儿失败 | 手机端重复推同一 recordingId 或旧错误残留 | 新版 daemon 会 in-flight 去重并在成功终态清理 `lastError`；重启 daemon 后再观察事件流 |

## 主动操作与自检

```bash
yc daemon reload      # 重读 apiKeys[] 并增量刷新多条 Relay 隧道
yc tunnel reconnect   # 强制断开重连（换了 api-key 或网络恢复后）
yc tunnel reconnect --client phone-a
yc tunnel +test       # 回环自检：daemon 给自己发一条 echo 通知，验证 ingest + 鉴权
yc tunnel +test --client phone-a
yc gateway test       # 模拟手机端调 /notifications，验证连通 / 鉴权
yc doctor             # 环境自检：Go runtime、目录权限、keychain、daemon、配置
```

收到通知后，`yc daemon status` 里的 `lastIngestAt` / `ingestCount` 会变化，`yc notification search --client <label>` 能看到对应 label 的落盘通知——这两处是确认「整条链路打通」的最终凭据。

收到录音后，先看列表和最新事件：

```bash
yc recording list
yc recording +latest
yc recording events --since 1h --limit 50
```

排查单条录音时用：

```bash
yc recording status <recording-id>
yc recording events --id <recording-id> --watch
```

事件文件位于 `~/.yoooclaw/profiles/<profile>/recordings/state/events.jsonl`。它是 append-only，本地查询不依赖 daemon 是否正在运行；`--watch` 会先输出匹配的历史事件，再持续 tail 新事件。

## 端口

监听地址固定回环 `127.0.0.1`、起始端口 `18789`，**不需要也不再提供交互配置**。启动时若 `18789` 被占，daemon 自动 `+1` 顺延（`18790`、`18791`…）并把实际端口写进日志与 `daemon status`。所以排查时以 `daemon status` 的 `port` 为准，别假设一定是 18789。

## 不走 Relay 的兜底

Relay 暂时不可用时，daemon 的 HTTP server 始终在本地监听，可以自建内网穿透直连：用 `cloudflared` 或 `tailscale serve` 反代到 `http://127.0.0.1:<port>`，手机端填这个地址 + gateway token 即可，不依赖托管 Relay。
