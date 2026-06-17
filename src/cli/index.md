# 独立 CLI

`@yoooclaw/cli` 是独立运行的 `yoooclaw` / `yc` 命令行 —— 自带后台守护进程（daemon），**不依赖 openclaw 客户端在线**。设计对齐飞书 [lark-cli](https://github.com/larksuite/cli)：Service-oriented 命令树、三层命令体系（Shortcuts / Service Commands / Raw API）、统一 `--format`、Agent-Native。

::: tip 当前状态：命令全部可用
全部 service 命令已落地：本地查询类（🟢，纯读磁盘）开箱即用；守护进程类（🔵）与需 daemon 在跑的控制类（🟡）通过本地 HTTP RPC 协作。手机端可以经 yoooclaw 托管 Relay 进入本机 daemon；Relay 不可用时仍可用 `cloudflared` / `tailscale serve` 反代本地 HTTP server 作为兜底。
:::

## 安装

两种分发渠道，功能完全一致，按是否方便装 Node 选择。npm 包是极薄 Node launcher，安装时通过 optionalDependencies 拉取当前平台的 Go 原生二进制；原生二进制渠道则直接下载同一套 Go binary。

::: tip 平台支持
npm 渠道支持 `darwin/linux` 的 `x64+arm64` 与 `win32-x64`（launcher 需 Node ≥ 18）。`install.sh` / GitHub Release 直装支持 `darwin/linux` 的 `x64+arm64`。Windows 上有两点差异：凭据以明文存放在 `~/.yoooclaw/credentials.json`（无系统 keychain 加固，`yoooclaw doctor` 会标记为 `skip` 并提示），`yoooclaw daemon stop` 经 HTTP `/daemon/stop` 优雅退出而非 POSIX 信号。详见 [存储与目录](/cli/storage)。
:::

### A. npm（薄 Node launcher + 平台 Go 二进制）

免安装（npx，每次拉最新版）：

```bash
npx @yoooclaw/cli --help          # 主命令
npx @yoooclaw/cli notification +today
```

全局安装（提供 `yoooclaw` / `yc` 两个命令）：

```bash
npm i -g @yoooclaw/cli
yoooclaw --help        # 主命令
yc --help              # 等价短 alias
```

> `npx @yoooclaw/cli` 始终调用 `yoooclaw` 入口（`yoooclaw` 与 `yc` 指向同一可执行文件）。

### B. 原生二进制（无需 Node）

单文件 Go 可执行，冷启动和资源占用都比旧 TS/Bun 形态更轻。

```bash
# 自动检测平台、下载、校验 sha256、写入 ~/.local/bin
curl -fsSL https://raw.githubusercontent.com/YoooClaw/cli/master/scripts/install.sh | sh

# 指定版本 / 安装目录 / 覆盖
curl -fsSL https://raw.githubusercontent.com/YoooClaw/cli/master/scripts/install.sh \
  | sh -s -- --version 0.2.0-beta.1 --dir ~/bin --force
```

直装支持平台：`darwin-arm64` / `darwin-x64` / `linux-x64` / `linux-arm64`。Windows Go binary 目前随 npm 平台子包发布，请用上面的 npm 渠道。

二进制也可从 [GitHub Releases](https://github.com/YoooClaw/cli/releases) 手动下载，配合同 release 的 `checksums.txt` 校验。

> `yoooclaw update self` 会自动识别当前安装来源（npm vs 原生二进制），给出对应的升级命令 —— 不要混用两种渠道。

## 5 分钟上手

```bash
# 1) 交互式向导：填入 Relay api-key，生成 config.json、gateway token，
#    并自动后台启动守护进程（无需再单独跑 daemon start）
yoooclaw config init

# 2) 看状态：PID、监听端口、relay、灯效规则数、最近 ingest
yoooclaw daemon status

# 3) 查今天的通知（手机推送落盘后）
yoooclaw notification +today
```

> `config init` 收尾会自动后台拉起 daemon。向导里填了 api-key 就直接连上 Relay、开箱即用；
> 如果当时留空，事后用 `yoooclaw auth set-api-key <ock_xxx>` 设置后再 `yoooclaw daemon restart` 让 daemon 连上 Relay。
> 只想生成配置、暂不启动 daemon，加 `--no-start`。

多手机 / 多账号接入时，可以给每个 key 一个稳定 label；daemon 会为每个 label 各连一条 Relay 隧道，入站数据也会带上对应 `clientLabel`：

```bash
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw daemon reload
yoooclaw tunnel status
yoooclaw notification +today --client phone-a
```

服务器 / 无 GUI 部署（systemd / launchd 包装）：

```bash
yoooclaw daemon start --bind 0.0.0.0 --port 18789 --no-detach
```

> 绑 `0.0.0.0` 时强制要求已设置 gateway token，否则拒绝启动。

## 录音同步与 ASR

daemon 会接收手机端的 `recordings.sync` / `POST /recordings`，把音频下载到当前 profile 的 `recordings/`，并按配置触发 ASR。独立 CLI 形态下，ASR 配置由本机一次性写入 `recordings/asr-config.json`；手机端没随请求传 `asr` 时 daemon 会自动读取本地配置。

```bash
# api 模式：不传 --api-key 时，daemon 会回退到 account 级 ock- key
yoooclaw recording setup-asr --mode api --language auto --non-interactive
```

当前 Go beta 只支持 `api` / model-proxy ASR。`local` 和 `yoooclaw` mode 仍保留在配置 schema 里用于兼容旧请求，但会在校验阶段被拒绝。

录音同步过程中，daemon 会把状态变化追加到 `recordings/state/events.jsonl`，CLI 可以直接查询或持续跟随：

```bash
yoooclaw recording list
yoooclaw recording +latest
yoooclaw recording events --since 1h --limit 50
yoooclaw recording events --id <recording-id> --watch
```

## Agent-Native

CLI 自身就是 Agent 的工具表，无需再起一层 MCP server：

- 所有命令支持 `--format ndjson`，便于 Agent 流式逐条消费；
- 失败统一返回 `{ ok: false, error: { code, message, hint } }`，错误码前缀 `YOOOCLAW_*`；本地 CLI 错误会返回非零退出码，Raw HTTP 结果请同时看 `ok` / HTTP status；
- `yoooclaw api <METHOD> <PATH>` 作为 Raw escape hatch 直达 daemon HTTP。

随包发布了一组 Skill（流式查通知与分片总结、从 stdin 建灯效规则、隧道排查，以及一系列录音转写处理），教 Agent 直接调命令。安装前可先查看支持的 Agent 目标：

```bash
yoooclaw skills targets      # 查看可安装到哪些 Agent
yoooclaw skills install      # 自动探测唯一 Agent 后软链安装
```

详见 [Agent Skill](/cli/skills)。

## 下一步

- [命令体系与输出](/cli/usage) —— 三层命令、全局 flags、输出契约与数据目录。
- [命令参考](/cli/commands) —— 按 service 列出全部子命令与示例。
- [Agent Skill](/cli/skills) —— 把随包 Skill 安装到 Agent 让它自己驱动 CLI。
