# 架构与实现逻辑

`@yoooclaw/cli` 把 phone-notifications 插件里那套手机连接 / Relay / 灯效规则的能力，从 OpenClaw 宿主里抽出来，做成一个**独立可执行的本地 daemon + 命令行**。

设计目标只有一条：**Agent 想用这套能力时，不该被强制装一个 GUI 宿主**。所以 CLI 自带后台进程、自带 Relay 隧道、用同样的协议接手机端，宿主在不在线都不影响落盘。

本章把 daemon 怎么起来、命令怎么走 RPC、Relay 怎么复用插件代码讲清楚。命令清单见[命令参考](/cli/commands)。

## 三层命令体系

CLI 不只有一个扁平命令列表，而是**按使用频率分层**：

```text
Shortcuts     yoooclaw notification +today        ← 高频场景预设
                          ↓ 解析为
Service       yoooclaw notification search --from … --to …
                          ↓ 同进程 / HTTP RPC
Daemon HTTP   GET /notifications?from=…
                          ↓ 内部转发或读盘
读磁盘 / Relay / 灯效硬件
```

- **Shortcuts**（`+` 前缀）：对最常用场景做参数预设。`+today` = "今天 0 点到现在的通知"，背后就是 `notification search` 加几个 flag。
- **Service commands**：`yoooclaw <service> <subcommand>`，列表见 `yoooclaw --help`。所有 service 命令路径在 [command-tree.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/command-tree.ts) 集中声明。
- **Raw API**：`yoooclaw api <METHOD> <PATH>` 是 escape hatch，直达 daemon HTTP。Agent 遇到未包装能力或调试时不卡。

[program.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/program.ts) 把命令树喂给 commander 构建命令；具体 handler 由 [commands/registry.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/commands/registry.ts) 按 path（如 `config init`）注册。

## daemon 依赖与命令分类

CLI 命令分三类，文档里用色块标记：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| 🟢 | 不需要 daemon（纯读磁盘 / 纯本地操作） | `notification search`、`log`、`config show` |
| 🟡 | 需要 daemon 在跑（控制类，走本地 HTTP RPC） | `light send`、`lightrule create`、`tunnel status` |
| 🔵 | 管理 daemon 自身 | `daemon start/stop/status/logs` |

🟢 命令的好处是**冷启动就能跑**：没装 daemon 也能查通知。这是把"读"和"写控制"分开设计的直接收益 —— 通知是纯文件，没必要为了查一下而起后台进程。

🟡 命令通过本地 HTTP RPC 调 daemon：

```text
yc light send --preset blink
  → http POST 127.0.0.1:<port>/light/send
    Authorization: Bearer <gateway-token>
  → daemon: 评估当前是否有灯效设备会话 → 转发或排队
```

如果 daemon 没跑，🟡 命令直接返回 `YOOOCLAW_DAEMON_NOT_RUNNING`，提示去执行 `yc daemon start`。

## daemon 启动与端口

`daemon start` 默认 fork 一个子进程到后台 detach；子进程跑 `daemon run-foreground`，最终调到 [daemon/main.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/main.ts) 的 `runDaemonForeground`。流程：

```text
1. 检查 daemon.lock（process.kill(pid, 0) 探活）→ 已跑则拒绝
2. 加载 config.json + 解析 gateway token
3. 装配 StandaloneRuntime + NotificationStorage + RecordingStorage + LightRuleRegistry
4. 注册 phone-notifications 的通知 / 录音 / 灯效规则路由（直接复用插件代码）
5. http.createServer.listen(port)：EADDRINUSE 时端口自动 +1（最多 64 次）
6. 写 daemon.lock {pid, startedAt, bind, port, logLevel}
7. 若 relay.enabled && apiKey 存在 → startRelayTunnel
8. SIGTERM/SIGINT → 优雅关闭：停 relay → 关 notification / recording storage → 移 lock → exit(0)
```

端口处理是关键设计：**起始端口 18789，被占自动 +1 顺延**，实际端口写进日志和 `daemon status`。所以排查时永远以 `daemon status` 的 `port` 为准，别假设一定是 18789。

> **Windows 上的停止路径**：Node 在 Windows 没有真正的 POSIX 信号，`process.kill(pid, "SIGTERM")` 会直接 TerminateProcess，跳过上面第 8 步的优雅关闭。因此 `daemon stop` 在 Windows 上改打 HTTP `POST /daemon/stop`，由 daemon 自己触发同一套优雅关闭；超时（10s）才回退到硬杀。macOS / Linux 仍走 SIGTERM。

绑非回环地址（`0.0.0.0` / 公网 IP）强制要求 gateway token 已设置，否则拒绝启动 —— 公网裸奔无 token 是个常见踩坑，干脆在启动期拦住。

## StandaloneRuntime：让插件代码免改跑在 daemon 里

CLI 不是把通知 / 灯效规则这套逻辑重写了一遍 —— 而是**直接复用 phone-notifications 插件包**。窍门在 [daemon/runtime.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/runtime.ts) 的 `StandaloneRuntime`：

```ts
class StandaloneRuntime {
  // 结构兼容 OpenClawPluginApi 的子集
  registerHttpRoute(spec)        // 注册的路由收集到 Map，daemon HTTP server 派发
  registerGatewayMethod(m, h)    // 注册的 gateway 方法收集到 Map，/gateway/<m> 桥接
  registerService() {}           // CLI 无服务生命周期，no-op
  registerCli() {}               // CLI 不复用插件 CLI 注册，no-op
  registerTool() {}              // CLI 不开 MCP，Agent 走 Skill，no-op
  on() {}                        // before_prompt_build 等宿主事件，no-op
  runtime.state.resolveStateDir(): string  // 指向 profile dir
}
```

`StandaloneRuntime` 实现 `OpenClawPluginApi` 的**结构子集** —— 凡是 daemon 形态不该有的（service 生命周期、MCP tool、宿主事件）全部 no-op。phone-notifications 的 `registerNotificationInterfaces`、`registerRecordingInterfaces`、`registerLightRulesGateway` 看到的就是一个标准 `api` 对象，**完全不知道自己跑在 CLI 还是宿主里**。

这条做法的代价：插件 / CLI 的注册接口必须保持稳定。收益是 daemon 不需要复制粘贴 ingest / 录音状态机 / 灯效规则代码，插件侧改一次两边都生效。

## Relay 隧道：复用协议，daemon 内分发

`startRelayTunnel`（[daemon/relay.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/relay.ts)）继续复用插件的 `RelayClient`：连接、心跳、重连、frame 收发协议保持同源。差异在入站帧的处理方式：CLI daemon 不跑 OpenClaw 宿主 gateway，所以不再复用 `TunnelProxy`，而是用 [RelayDispatcher](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/relay-dispatcher.ts) 在同进程里派发。

```text
CredentialSet (one or more account-level api-keys)
  ↓
TunnelSupervisor
  ↓ one RelayClient per label
RelayClient.connectWithAutoReconnect(signal)
  ↓ wss://openclaw-service.yoooclaw.com/message/messages/ws/plugin
  ↓ inbound frame
RelayDispatcher
  ├─ type:"req"     → runtime.callGateway(method, params) → type:"res"
  ├─ type:"request" → loopback http://127.0.0.1:<port>/<path> → proxy_response
  └─ daemon push    → type:"event" event:"recording.status"
```

差异点：

| | 插件形态 | CLI 形态 |
| --- | --- | --- |
| api-key 来源 | 宿主 `resolveAuthProvider` | `resolveApiKeyEntries()` 分层（env / file multi / keychain / legacy file） |
| 入站分发 | `TunnelProxy` 反代到宿主 gateway | `RelayDispatcher` 直接调 `runtime.callGateway`，HTTP-style frame 再 loopback 到本 daemon |
| 鉴权 | 宿主 gateway token / password | CLI gateway token（per-profile） |
| 状态文件 | 宿主状态目录 | profile 目录 `state/tunnel-status.json` |
| connect-status 上报 | 上报给 openclaw 后端 | 不上报，仅本地状态 |

多 key 时，daemon 为每个 label 各起一条 Relay 隧道，`RelayDispatcher` 会把 label 写进 ingest context。通知、录音、图片落盘时都会带 `clientLabel`，后续查询可以用 `--client <label>` 过滤。没设 api-key 时直接跳过隧道，daemon 仍正常起 HTTP server —— 可以自建 `cloudflared` / `tailscale serve` 反代到 `127.0.0.1:<port>` 走直连兜底。

## 录音同步与事件流

daemon 侧先调用 `registerRecordingInterfaces` 注册 `recordings.list/status/rename/retranscribe/...` 这类通用 gateway 能力，再用 [recording-bridge.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/recording-bridge.ts) 覆盖 `recordings.sync` 和 `POST /recordings`。覆盖的原因是独立 CLI 形态下 ASR 配置在本机 profile 里，而不是每次都要求手机端随请求传入。

```text
手机端 recordings.sync / POST /recordings
  ↓
daemon recording bridge
  ├─ 校验 recordingId / metadata / asr
  ├─ 同 recordingId in-flight 去重，避免重复 sync 撞状态机
  ├─ 合并 caller.asr + recordings/asr-config.json
  ├─ mode=api 且缺 apiKey → fallback account 级 ock- key
  ↓
phone-notifications handleRecordingSync
  ↓
RecordingStorage index.json + audio/ + transcripts/
```

ASR 配置由 `yc recording setup-asr` 写到当前 profile 的 `recordings/asr-config.json`：

```json
{ "mode": "api", "api": { "language": "auto" } }
```

这份结构与 phone-notifications 的 `AsrConfig` 兼容。`mode=api` 时可以显式写 `api.apiKey`，也可以留空让 daemon 使用 account 级 `ock-` key；`mode=local` 时写入本地 Whisper 相关参数。

状态事件走一条 append-only JSONL：

```text
recordings/state/events.jsonl
{"ts":"2026-05-25T10:00:00.000Z","recordingId":"...","transfer_status":"syncing_openclaw"}
{"ts":"2026-05-25T10:00:03.000Z","recordingId":"...","transfer_status":"transcribing"}
{"ts":"2026-05-25T10:00:25.000Z","recordingId":"...","transfer_status":"transcribed"}
```

`yc recording events` 纯读这个文件，支持 `--id`、`--since 10m/1h/24h`、`--limit` 和 `--watch`。同一事件也会通过 Relay 以 `recording.status` 推回手机端；JSONL 仍是本地可观察性的事实来源。

## 凭据分层：account 级 vs instance 级

`auth status` 把这两层凭据分开管，源码见 [credentials/store.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/credentials/store.ts)。account 级多 key 的完整设计（存储形态、管理命令、一 key 一隧道、按 client 查询）单列一章：[多 api-key 设计](/cli/multi-api-key)。

### account 级 api-key（跨 profile 共享）

调 yoooclaw 后端（AI ASR / app-name-map / Relay）用的 key。CLI 支持单 key 和多 key 两种文件形态。`resolveApiKeyEntries()` 返回完整 CredentialSet，daemon 用它决定要连哪些 Relay 隧道；`resolveApiKey()` 只返回 default key，供 ASR fallback 和旧的单 key 调用使用。

```text
1. env  YOOOCLAW_API_KEY                            ← 显式单 key 覆盖
2. file ~/.yoooclaw/credentials.json#apiKeys[]      ← 多 key；存在时遮蔽 keychain
3. keychain yoooclaw/api-key                        ← --keychain 写入的单 key
4. file ~/.yoooclaw/credentials.json#apiKey         ← 旧版单 key
```

> **keychain 仅 macOS（`security`）/ Linux（`secret-tool`）可用**。Windows 没有对接系统凭据管理器，`--keychain` 与第 3 层不生效，凭据落明文文件（第 2 / 4 层）。`yoooclaw doctor` 会把 keychain 检查标记为 `skip` 并提示「凭据将落文件」。

`apiKeys[]` 里的每条记录都有 `label`、`key` 和可选 `default`：

```json
{
  "apiKeys": [
    { "label": "phone-a", "key": "ock_xxx", "default": true },
    { "label": "phone-b", "key": "ock_yyy" }
  ]
}
```

`auth add-api-key` 会在第一次新增 label 时把旧 `apiKey` 迁移为 `apiKeys[]`；`auth set-api-key` 在多 key 模式下只轮换 default 条目的 key；`auth set-default-api-key` 切换 default。共享文件仍然是关键：`~/.yoooclaw/credentials.json` 也被 phone-notifications 插件读，**CLI / daemon / 插件三方共用同一份 account 级凭据**。

daemon 启动后会 watch 共享凭据文件，CredentialSet 变化时通过 `TunnelSupervisor.apply()` 做增量刷新：新增 label 启动新隧道，删除 label 停止旧隧道，key 变化则重连对应隧道。watch 不可靠时可以手动调用 `yoooclaw daemon reload`。

### instance 级 token（per-profile）

每个 profile 一个 gateway token，用 `*Ref` 抽象引用指向具体存放位置：

```text
auth.tokenRef:
  file:~/.yoooclaw/profiles/<name>/credentials.json#gatewayToken  ← 默认
  env:YOOOCLAW_GATEWAY_TOKEN
  keychain:yoooclaw/gateway-token-<profile>
  inline:<literal>
```

`*Ref` 的好处：换存储位置不需要改命令逻辑，统一走 `resolveRef` / `writeRef`（[credentials/refs.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/credentials/refs.ts)）。

## profile：多机 / 多账号隔离

`~/.yoooclaw/profiles/<name>/` 是隔离单位。`--profile work` 或 `yoooclaw profile use work` 切到不同 profile：

```text
~/.yoooclaw/
├── credentials.json          ← account 级（跨 profile）
├── active-profile            ← 当前 active profile 名
└── profiles/
    ├── default/
    │   ├── config.json       ← daemon / relay / 灯效规则 / 输出
    │   ├── credentials.json  ← instance 级密文
    │   ├── daemon.lock       ← 进程锁
    │   ├── daemon.log        ← 日志（按日轮转 daemon.log.YYYY-MM-DD）
    │   ├── notifications/    ← 通知 YYYY-MM-DD.json
    │   ├── recordings/       ← index.json + audio/ + transcripts/ + asr-config.json + state/events.jsonl
    │   ├── images/           ← index.json + files/
    │   ├── tasks/            ← 灯效规则
    │   └── state/            ← monitors.json、tunnel-status.json
    ├── home/                 ← 各跑自己的 daemon
    └── work/
```

每个 profile 各跑各的 daemon，端口不同自动错开（18789 → 18790 → ...）。

## 输出统一契约

`--format json|pretty|table|ndjson`，所有命令走 [output/format.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/output/format.ts) 序列化。

成功和失败**共用同一通道**（stdout）与可预测结构：

```json
// 成功
{ "ok": true, "items": [...], "total": 12 }

// 失败
{ "ok": false, "error": { "code": "YOOOCLAW_DAEMON_NOT_RUNNING", "message": "daemon 未运行", "hint": "先执行 yoooclaw daemon start" } }
```

失败额外用**非零退出码**表达，让 shell `set -e` / Agent 都能直接判断。错误码统一前缀 `YOOOCLAW_*`，进入半正式契约，不会随版本静默改名。

`ndjson` 是为 Agent / 流式消费准备的 —— 每条结果一行 JSON，不裹数组，便于逐行解析与背压处理。

## 图片：与录音同构的下载通道

`POST /images` 走 [image/channel.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/image/channel.ts) 的 `ingestImage`：

```text
1. respond(true) 先回，落 imageId + metadata 到 index.json，状态 syncing
2. 后台 fetch(ossUrl) → 流式写到 images/files/<id>.<ext>
3. 完成 → status: synced；失败 → sync_failed
4. CLI: image path <id> 命中未下载完时返回 YOOOCLAW_IMAGE_NOT_READY
```

这样 Agent 调 `yoooclaw image +latest` 拿本地路径喂多模态模型时，要么拿到完整文件、要么拿到清晰的"还没好"错误，**不会拿到半截文件**。

## 失败与降级

- **端口被占用** → 自动 +1 顺延（最多 64 次），实际端口写进 lock 和 `daemon status`。
- **lock 存在但进程已死** → `daemonState()` 用 `process.kill(pid, 0)` 探活，陈旧锁视为未运行。
- **Relay 断连** → 指数退避无限重连，`tunnel status` 暴露 `reconnectAttempt` / `lastDisconnectReason`。
- **没设 api-key** → 跳过 Relay 启动，daemon 仍可工作；`tunnel status` 提示走直连 HTTP 兜底。
- **绑公网地址无 token** → 启动期拒绝，避免裸奔。
- **手机端重复推同一条录音 sync** → daemon 用 recordingId 做 in-flight 去重，第二次请求直接返回当前状态，避免并行 ASR 撞状态机。
- **录音转写失败** → 状态事件落 `recordings/state/events.jsonl`，`yc recording events --id <id>` 可直接看最近状态和错误；成功终态会清理历史 `lastError` 残留。

## 与插件的协作关系

CLI 不是要替代插件 —— 两者是**互补**：

| | 插件 | 独立 CLI |
| --- | --- | --- |
| 装在哪 | OpenClaw / QClaw 宿主内 | 任意机器，npm 包或原生二进制 |
| 起 daemon | 宿主代劳 | 自己起 |
| Skill | 宿主自动加载 | `yoooclaw skills install` |
| api-key | 共享 `~/.yoooclaw/credentials.json` | 共享 `~/.yoooclaw/credentials.json` |
| ingest 代码 | 同一份 | 同一份（StandaloneRuntime 复用） |
| 录音同步 / ASR | 同一份状态机，请求级 ASR 配置 | 同一份状态机，本地 `asr-config.json` + account key fallback |
| 灯效规则评估 | 同一份 | 同一份 |
| Relay 协议 | 同一份，TunnelProxy 进宿主 gateway | 同一份，RelayDispatcher 进 daemon runtime |

宿主里有插件、本地又装了 CLI 时，两边 daemon **不应该同时连同一个 Relay 账号** —— 同一条手机消息会被推到两个 ingress 落两份。实践上要么关掉插件的 Relay（在宿主 gateway 配 `tailscale.mode` / `remote.url` 触发 exclusive hint）、要么停掉 CLI 的 daemon。

## 下一步

- [命令体系与输出](/cli/usage) —— 命令分类、全局 flags、profile 与数据目录。
- [命令参考](/cli/commands) —— 全部子命令清单。
- [Agent Skill](/cli/skills) —— Agent 怎么自动驱动 CLI。
- [调试与排错](/cli/debugging) —— Relay 连不上 / 推送收不到时的三步排查。
