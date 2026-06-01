# 架构与实现逻辑

`@yoooclaw/phone-notifications` 是一个 OpenClaw / QClaw 宿主插件。装进宿主以后，插件用宿主的 `OpenClawPluginApi` 注册一组**服务、网关方法、HTTP 路由、CLI 子命令和 Skill**，把手机端送来的事件落到本地磁盘，并把硬件能力暴露给 Agent。

本章把这套实现展开讲：模块怎么分、数据怎么流、关键状态机长什么样。安装与命令清单见[概述与安装](/plugin/)和[命令参考](/plugin/commands)。

## 顶层结构

```text
register(api)
├── registerStorageLifecycle           # 通知 / 录音存储服务（生命周期管理）
├── registerRelayTunnelLifecycle       # Relay 隧道服务（WebSocket 反代）
├── registerNotificationInterfaces     # gateway notifications.* + HTTP /notifications
├── registerRecordingInterfaces        # gateway recording.* + 录音状态机
├── registerLightControlTool           # MCP tool: light_control
├── registerLightRulesGateway          # gateway lightrules.*
├── registerLightRulesTools            # MCP tool: lightrules_create / update / delete / get
├── registerAutoUpdateLifecycle        # 自动更新检查与重启
└── registerPluginCli                  # openclaw ntf 全部子命令
```

入口在 [packages/phone-notifications/src/index.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/index.ts)。`register(api)` 收到宿主回调时，按上述顺序登记。任何一个分支失败都不影响其他能力，符合「插件局部失败不要打挂宿主」的原则。

## 两条数据通路

手机端把数据推进来有两种方式，**插件不假设走哪条**，两条都注册并复用同一段 ingest 逻辑：

### Gateway Native（推荐）

手机调 `notifications.push` / `recording.upload-chunk` 等 gateway 方法。宿主完成鉴权后，通过 `api.registerGatewayMethod` 注册回调把请求交给插件。这个路径不需要插件起 HTTP server，跨平台一致。

### HTTP 备选

部分场景手机端只能发标准 HTTP，所以插件用 `api.registerHttpRoute` 注册了 `POST /notifications`、录音分片等路由。宿主先用 gateway token 完成鉴权，再把 request 转交给路由处理函数。

两条通路最终都会走 [notification/storage.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/notification/storage.ts) 里的 `NotificationStorage.ingest()`，所以**去重、保留策略、灯效规则触发是一致的**。

## Relay 隧道：让手机能找到本机

手机出门不在同个网络时，直连 HTTP 走不通。插件因此自带一条托管 Relay 隧道：

```text
手机 App
  │  WebSocket 长连
  ▼
托管 Relay (wss://…/message/messages/ws/plugin)
  │  反代请求帧
  ▼
插件 RelayClient + TunnelProxy
  │  本地 HTTP
  ▼
宿主 gateway (http://localhost:18789)
```

实现拆成两层：

- **RelayClient**（[tunnel/relay-client.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/tunnel/relay-client.ts)）：负责 WebSocket 长连、心跳、指数退避重连，状态写到 `state/tunnel-status.json`。
- **TunnelProxy**（[tunnel/proxy.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/tunnel/proxy.ts)）：把 Relay 推过来的请求帧反代到宿主 gateway，自动带上本地 gateway token。

启动条件由 [plugin/lifecycle.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/plugin/lifecycle.ts) 控制 —— 如果宿主已经配了 `gateway.tailscale.mode` 或外部 `gateway.remote.url`，Relay 会主动停下来保持「入口互斥」，避免和 Tailscale Funnel / 其它隧道抢同一条 ingress。

## 灯效规则：事件驱动的异步评估

灯效规则不是「通知到达时同步判断」，而是**先落盘、再异步评估**，以避免一次 ingest 卡在评估链路上。

```text
ingest notifications
  ↓ onAfterIngest(inserted, ingestId)
LightRuleEvaluationScheduler
  ↓ debounce 1s
InlineLightRuleEvaluator
  ↓ 拼 system prompt（regulrules.getEnabled()）
PiAiInvoker → LLM 决策
  ↓ 命中
light.send / 联动手机端
```

关键点：

- **常驻内存索引**：`LightRuleRegistry` 把规则 meta 全部加载到 `Map<name, meta>` 里。每次 ingest 都要拿全量 enabled 规则拼 prompt，扫盘扛不住 5s 延迟预算（见 [light-rules/registry.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/light-rules/registry.ts)）。
- **CRUD 串行化**：写路径用一条 promise 链做最朴素的 mutex，避免「内存和磁盘交错」。
- **写盘后才更新内存**：先落磁盘，成功才更新内存索引；磁盘失败时内存保持原状。
- **debounce 1s**：连发的多条通知合并成一次评估，节省 LLM 调用。

LLM 由 [profile/llm/index.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/profile/llm/index.ts) 的 `resolveLlmCompleter` 提供，优先复用宿主已配置的模型。

## 录音状态机

长录音是分片传输 + OSS 中转 + ASR 转写的多步骤流程，所以专门写了状态机来约束流转，**不允许跳跃**：

```text
receiving_failed ──► receiving ──► pending_oss_upload ──► uploading_oss
                                                              │
                                                              ▼
                                                        oss_uploaded
                                                              │
                                                              ▼
                          syncing_openclaw ◄── sync_failed
                                  │
                                  ├──► synced ──► transcribing
                                  │                  │
                                  │                  ├──► transcribed (可手动 → transcribing 重转)
                                  │                  └──► transcribe_failed ──► transcribing
                                  └──► sync_failed
```

任何尝试跳过中间态的 transition 都会被 [recording/state-machine.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/recording/state-machine.ts) 抛 `TransitionError`。落盘的 `index.json` 是事实来源；ASR 失败可以原地重试不污染上游。

ASR 走 `asr.mode` 选三种：

| mode | 说明 |
| --- | --- |
| `api` | 走第三方 / OpenAI 兼容的远端 ASR。 |
| `local` | 本地 `whisper-cpp`，需要装 `whisper-cpp` 与 `opus-tools` / `ffmpeg`。 |
| `yoooclaw` | 走 yoooclaw 托管 ASR，用 account 级 api-key 鉴权。 |

## 通知存储

每条通知按**当地日期**写入 `notifications/YYYY-MM-DD.json`，append-only。两层去重：

- **`.ids/`**：按 `id` 索引去重，重复 push 同一条不会多写。
- **`.keys/`**：按内容键（app+title+content+timestamp 的 hash）去重，处理同一条通知不同 `id` 推上来的边界场景。

`workspaceDir` 不可写时回落到宿主状态目录下的 `plugins/phone-notifications/notifications/`。`retentionDays` 启用时按日清理；不设置则永久保存。

## 插件 CLI 与 Agent Skill

插件不仅在宿主 Agent 里跑，还把全部能力暴露成 `openclaw ntf` 子命令（[plugin/cli.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/plugin/cli.ts)）。这套子命令在 `runtime-mode.ts` 判定为「CLI 调用上下文」时，**只注册 CLI、不启动后台服务**，避免 CLI 进程意外影响 Relay 常驻连接。

`openclaw.plugin.json` 的 `skills` 字段把随包 `SKILL.md` 注册给宿主 Agent，所以装好插件就能直接说「看看最近的通知」让 Agent 调命令。独立 CLI 形态下没有宿主代劳，Skill 需要手动 `yoooclaw skills install`（见 [Agent Skill](/cli/skills)）。

## 自动更新

[plugin/auto-update.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/plugin/auto-update.ts) 注册一个定时任务，按 `autoUpdate.checkIntervalHours` 去 npm registry 查最新版本（`latest` / `beta` 频道）。命中后通过 `broadcastFn` 把更新事件广播给手机端，手机端弹提示后用户决定升不升级。升级用 [update/executor.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/update/executor.ts) 完成包替换 + 宿主 Gateway 重启。

## 失败与降级

- **`workspaceDir` 不可写** → 回落 `<stateDir>/plugins/phone-notifications/`。
- **Relay 断连** → 指数退避无限重连，状态写到 `tunnel-status.json` 供 `tunnel-status` 命令读。
- **直连 gateway 检测到手机端 client** → 主动停 Relay 隧道，避免双通路并存导致重复 ingest。
- **ASR 失败** → 不动 `synced` 这条主链路，只在 `transcribing` 子链路里反复重试，CLI/Agent 仍能拿到没转写的音频。

## 下一步

- [工作方式与存储](/plugin/how-it-works) —— 通知/录音落盘的目录结构细节。
- [命令参考](/plugin/commands) —— `openclaw ntf` 全部子命令。
- [CLI 架构与实现逻辑](/cli/architecture) —— 独立 CLI 怎么把这些能力搬到本地 daemon。
