# 架构与实现逻辑

`@yoooclaw/cli` 现在是 Go 实现的独立 `yoooclaw` / `yc` 命令：一个原生二进制同时承担 CLI 客户端和本地 daemon 两个角色。npm 包只是薄 Node launcher，按平台解析 optionalDependency 里的 Go binary 并透传参数与退出码。

旧 TypeScript `src/` 代码仍保留为协议对拍和迁移参考；当前发布产物由 `cmd/yc`、`internal/*` 与 `scripts/build-go.sh` 生成。本章描述 Go beta 的真实运行逻辑。

## 三层命令体系

CLI 仍按使用频率分三层：

```text
Shortcuts     yoooclaw notification +today        ← 高频场景预设
                          ↓ 解析为
Service       yoooclaw notification search --from … --to …
                          ↓ 纯读磁盘 / HTTP RPC
Daemon HTTP   GET /notifications?from=…
                          ↓
本地文件 / Relay / 灯效云 / OSS / ASR
```

- **Shortcuts**（`+` 前缀）：对最常用场景做参数预设。
- **Service commands**：`yoooclaw <service> <subcommand>`，由 [internal/cli/root.go](https://github.com/YoooClaw/cli/blob/master/internal/cli/root.go) 接线到各 `cmd_*.go`。
- **Raw API**：`yoooclaw api <METHOD> <PATH>` 直达 daemon HTTP，供调试和未包装能力使用。

[cmd/yc/main.go](https://github.com/YoooClaw/cli/blob/master/cmd/yc/main.go) 是 binary 入口，[internal/cli/handler.go](https://github.com/YoooClaw/cli/blob/master/internal/cli/handler.go) 统一做 context 构造、handler 调用、`--format` 输出与错误渲染。

## daemon 依赖与命令分类

CLI 命令分三类，文档里用色块标记：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| 🟢 | 不需要 daemon（纯读磁盘 / 纯本地操作） | `notification search`、`recording list`、`image path`、`log` |
| 🟡 | 需要 daemon 在跑（控制类，走本地 HTTP RPC） | `light send`、`tunnel status`、`gateway test` |
| 🔵 | 管理 daemon 自身 | `daemon start/stop/status/logs` |

🟢 命令冷启动即可跑：通知、录音、图片、日志和同步游标都直接读 `~/.yoooclaw/profiles/<profile>/`。🟡 命令通过 [internal/daemon/client.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/client.go) 读取 lock/config 推导本地地址，再带 gateway token 调 daemon HTTP。

## daemon 启动与端口

`daemon start` 默认 fork 一个子进程到后台 detach；子进程执行 `daemon run-foreground` 并进入 [internal/daemon/server.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server.go) 的 `RunForeground`。`config init` 收尾会自动调用同一套 start 逻辑，除非传 `--no-start`。

启动流程：

```text
1. 检查 daemon.lock，陈旧锁视为未运行
2. 加载 config.json，解析 gateway token 与 account api-key CredentialSet
3. 非 loopback bind 且无 gateway token 时拒绝启动
4. 初始化通知、录音、图片、灯效规则、monitor 等本地存储
5. http.Server.listen；端口被占时从 18789 起自动 +1（最多 64 次）
6. 写 daemon.lock {pid, startedAt, bind, port, logLevel}
7. 按 ingress 模式装配传输层（见下「Ingress 模式」）：standalone 且 relay.enabled 且有 api-key 时按 label 启动多条 Relay 隧道；proxied / direct 跳过隧道
8. SIGTERM/SIGINT 或 /daemon/stop 触发优雅关闭
```

端口处理是关键设计：实际端口永远以 `daemon status` 的 `port` 为准，不要假设一定是 18789。Windows 上停止 daemon 走 HTTP `POST /daemon/stop`；macOS / Linux 优先走信号，超时后再强杀。

## Ingress 模式

daemon 的「到手机的连接」是可插拔的传输层，由 `--ingress` 选择**唯一** owner（优先级 `--ingress` flag > `YOOOCLAW_INGRESS` 环境变量 > `config.ingress.mode`，默认 `standalone`）。这样独立 CLI 与宿主插件（如 hermes-plugin）不会同时连 Relay 导致双连接、双 ingest。

| 模式 | 到手机的连接 owner | Relay 隧道 | ingest 鉴权 | 出站事件（Egress） |
| --- | --- | --- | --- | --- |
| `standalone`（默认） | Go daemon 自己的隧道 | 启用 | gateway token / 本机 | 经 Relay 推回手机 |
| `proxied`（嵌入插件） | 宿主插件代理 | 关闭 | **必须 api-key** | POST 回宿主回调 URL |
| `direct`（LAN / 测试） | 调用方直接 POST | 关闭 | api-key / token | 丢弃（仅落盘） |

入站永远是同一组 ingest 端点（`POST /notifications` `/recordings` `/images`），谁来「喂」由模式决定。出站抽象成 Egress 端口：`standalone` 走 Relay 隧道（`RelayEgress`）、`proxied` POST 到 `--egress-callback-url`（`ProxyEgress`）、`direct` 丢弃（`NoopEgress`），替换了原先散落的隧道 PushEvent 调用。

`proxied` 嵌入示例（宿主代理连接、daemon 只暴露 ingest API）：

```bash
yoooclaw daemon run-foreground --ingress proxied \
  --egress-callback-url http://127.0.0.1:8765/yoooclaw/egress \
  --egress-callback-token <token>
```

`proxied` 强制要求 api-key（否则启动报 `YOOOCLAW_UNAUTHORIZED`）；`/daemon/reload` 仅在 `standalone` 下重建隧道；`daemon status` 新增 `ingressMode` 字段。完整设计见 [docs/design/ingress-layering.md](https://github.com/YoooClaw/cli/blob/master/docs/design/ingress-layering.md)。

## HTTP 路由与鉴权

daemon HTTP server 同时承载控制面和手机端 ingest 面：

| 端点 | 方法 | 鉴权 | 职责 |
| --- | --- | --- | --- |
| `/health` | GET | 公开 | `{ server, version, protocol, capabilities }` |
| `/daemon/status` `/daemon/reload` `/daemon/stop` | GET/POST | gateway token | daemon 管理 |
| `/tunnel/status` `/tunnel/reconnect` `/tunnel/test` | GET/POST | gateway token | Relay 状态、重连、本地回环自检 |
| `/notifications` `/recordings` `/images` | POST | gateway token / api-key / Relay 内部头 | 手机端数据写入 |
| `/gateway/<method>` | POST | gateway token / api-key / Relay 内部头 | gateway 方法桥 |
| `/light/send` | POST | gateway token | 灯效下发 |
| `/monitors[/...]` | GET/POST/DELETE | gateway token | 监控任务 CRUD |

鉴权在 [internal/daemon/server.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server.go) 中统一收敛。Relay loopback 请求使用内部头保留真实 `clientLabel`；本地 gateway token 请求标记为 `local`；手机端直接带 account api-key 调 ingest 时会映射到对应 api-key label。

## Relay 隧道

Relay 相关 Go 代码在 [internal/relay](https://github.com/YoooClaw/cli/tree/master/internal/relay)。daemon 为 `apiKeys[]` 中每个 label 各起一条 WebSocket 隧道：

```text
CredentialSet
  ↓
Supervisor（label → Client + Dispatcher）
  ↓
Relay Client: wss://openclaw-service.yoooclaw.com/message/messages/ws/plugin
  ↓ inbound frame
Dispatcher
  ├─ type:"req"     → daemon gateway method → type:"res"
  ├─ type:"request" → loopback http://127.0.0.1:<port>/<path>
  └─ ws_open/data/close → 本地 WebSocket loopback
```

Go 版不再依赖 OpenClaw 桌面端 gateway，也不复用旧 `TunnelProxy` 的本地 gateway WS 反代耦合。它保持 Relay frame schema 与手机端兼容，但在本进程内把 frame 分发到 daemon HTTP/gateway。

`~/.yoooclaw/credentials.json` 变化会触发 CredentialSet reload：新增 label 启动新隧道，删除 label 停旧隧道，key 变化重连对应隧道。watch 不可靠时可以手动 `yoooclaw daemon reload`。

## 录音与图片 ingest

录音入口在 [internal/daemon/server_ingest.go](https://github.com/YoooClaw/cli/blob/master/internal/daemon/server_ingest.go)，核心存储和 ASR 在 [internal/recording](https://github.com/YoooClaw/cli/tree/master/internal/recording)：

```text
recordings.sync / POST /recordings
  ↓
recordings/index.json 落元数据，status=syncing_openclaw
  ↓
后台下载 OSS 音频到 recordings/audio/
  ↓
ASR api/model-proxy 转写
  ↓
transcript-data/*.json + transcripts/*.md + summaries/*.md
  ↓
state/events.jsonl 追加状态事件，并可经 Relay 推回手机端
```

ASR 配置写在 `recordings/asr-config.json`。当前 Go beta 只支持 `mode=api`；缺 `api.apiKey` 时 daemon 会回退到 account 级 `ock-` key。`local` / `yoooclaw` mode 仅保留兼容，校验会拒绝。

图片入口与录音同构，存储在 [internal/image](https://github.com/YoooClaw/cli/tree/master/internal/image)：`images.sync` / `POST /images` 先落 `images/index.json`，再后台从 OSS 下载到 `images/files/`。`image path <id>` 在文件未完成时返回 `YOOOCLAW_IMAGE_NOT_READY`，避免 Agent 读到半截文件。

## 凭据分层

`auth status` 把 account 级 api-key 和 instance 级 gateway token 分开管。Go 实现在 [internal/creds](https://github.com/YoooClaw/cli/tree/master/internal/creds)。

account 级 api-key 解析顺序：

```text
1. YOOOCLAW_API_KEY
2. ~/.yoooclaw/credentials.json#apiKeys[]
3. keychain:yoooclaw/api-key
4. ~/.yoooclaw/credentials.json#apiKey
```

`apiKeys[]` 是多设备主形态，每条记录有 `label`、`key` 和可选 `default`。daemon 按 label 起隧道，入站通知、录音、图片都会记录 `clientLabel`，查询命令可用 `--client <label>` 过滤。

instance 级 gateway token 随 profile 走，由 `config.json` 的 `auth.tokenRef` 引用，支持 `env:` / `file:` / `keychain:` / `inline:`。Windows 没有系统 keychain 适配，凭据落文件，`doctor` 会提示。

## profile 与数据目录

`~/.yoooclaw/profiles/<name>/` 是隔离单位：

```text
~/.yoooclaw/
├── credentials.json          ← account 级共享 api-key
├── active-profile            ← 当前 active profile 名
└── profiles/
    └── default/
        ├── config.json
        ├── credentials.json  ← gateway token 等 instance 级凭据
        ├── daemon.lock
        ├── daemon.log
        ├── notifications/
        ├── recordings/
        ├── images/
        ├── light-rules/
        ├── tasks/            ← lightrule 当前实际存储
        └── state/
```

`YOOOCLAW_HOME` 可覆盖根目录，方便测试和多实例隔离。`--profile` > `YOOOCLAW_PROFILE` > `active-profile` > `default`。

## 输出契约

所有命令走 [internal/output/output.go](https://github.com/YoooClaw/cli/blob/master/internal/output/output.go)：

```json
{ "ok": true, "items": [] }
```

```json
{ "ok": false, "error": { "code": "YOOOCLAW_DAEMON_NOT_RUNNING", "message": "daemon 未运行", "hint": "先执行 yoooclaw daemon start" } }
```

本地 CLI 校验 / 运行时错误会返回非零退出码。`yoooclaw api` 这类 Raw HTTP 命令会尽量保留 daemon 原始响应，脚本里应同时检查 `ok` 与 HTTP status，不要只依赖进程退出码。

错误码统一前缀 `YOOOCLAW_*`，定义在 [internal/errs/errors.go](https://github.com/YoooClaw/cli/blob/master/internal/errs/errors.go)。

## 与插件的关系

独立 CLI 不替代 OpenClaw 插件；两者共享账号级凭据和手机端协议。差异在运行宿主：

| | 插件 | 独立 CLI |
| --- | --- | --- |
| 装在哪 | OpenClaw / QClaw 宿主内 | 任意机器，npm 或原生 binary |
| 起 daemon | 宿主代劳 | `yoooclaw daemon start` |
| Agent 接入 | 宿主工具 / Skill | `yoooclaw skills install` 后直接调 CLI |
| api-key | `~/.yoooclaw/credentials.json` | 同一份 |
| Relay 入站 | 宿主 gateway | Go daemon Dispatcher |
| 查询 | 宿主能力 | 纯读本地 profile 文件 |

同一个账号不要让插件和独立 CLI daemon 同时连 Relay，否则同一条手机消息可能落两份。两种解法：

- **二选一**：停插件 Relay，或停 CLI daemon——简单但需要人为协调。
- **代理（推荐用于嵌入）**：用 `--ingress proxied` 启动 daemon，让宿主插件代理「到手机的连接」，CLI 只暴露 ingest API 收数据、经 egress 回调回投出站事件。这样连接 owner 唯一，从机制上杜绝双连接。详见上文「Ingress 模式」。

## 下一步

- [命令体系与输出](/cli/usage) —— 命令分类、全局 flags、profile 与数据目录。
- [命令参考](/cli/commands) —— 全部子命令清单。
- [Agent Skill](/cli/skills) —— Agent 怎么自动驱动 CLI。
- [调试与排错](/cli/debugging) —— Relay 连不上 / 推送收不到时的三步排查。
