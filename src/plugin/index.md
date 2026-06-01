# 手机通知插件

`@yoooclaw/phone-notifications` 是 OpenClaw / QClaw 插件，负责手机通知接收与本地存储、通知查询/摘要/统计、定时监控、长录音同步与 ASR 转写、硬件灯效控制与规则评估，以及 Relay Tunnel 连通。

## 功能概览

- 手机通知接收与本地 JSON 存储，支持 Gateway Native 和 HTTP 备选接入。
- 通知查询、摘要、统计、按日期同步给记忆系统。
- 定时通知监控任务，适合 Agent 周期性处理重点消息。
- 硬件灯效控制与灯效规则管理，支持通知触发后的异步评估。
- 长录音同步、音频下载、ASR 转写和 Markdown 转写稿落盘。
- Relay Tunnel 状态检查与远程连通能力。

## 安装

### OpenClaw CLI 安装

适用于有全局 `openclaw` 命令的标准 OpenClaw 环境：

```bash
openclaw plugins install @yoooclaw/phone-notifications
openclaw plugins update @yoooclaw/phone-notifications
```

验证：

```bash
openclaw ntf --help
openclaw ntf --version
```

如果已有其他插件占用了 `ntf` 命令，可使用别名：

```bash
openclaw phone-notifications --help
```

### NPM 包安装说明

标准 OpenClaw 环境请优先使用 `openclaw plugins install @yoooclaw/phone-notifications`，它会负责下载 NPM 包、注册插件并更新宿主配置。单独执行下面的命令只会把包下载到当前项目或全局 `node_modules`，不会自动写入 `openclaw.json`，也不会重启宿主：

```bash
npm install @yoooclaw/phone-notifications
```

因此不建议把裸 `npm install` 当成插件安装方式。它只适合调试、打包验证或由 OpenClaw 插件管理器内部调用。

JvsClaw 环境可能通过 `JVSCLAW_STATE_DIR` 暴露只读宿主根目录（例如 `/opt/jvs-claw`）。裸 NPM 安装同样不会完成插件注册，也不应该尝试写入该目录。请使用 JvsClaw 专用脚本，它会把插件和配置写到可写状态目录 `/home/admin/.openclaw`：

```bash
curl -fsSL https://artifact.yoooclaw.com/plugin/install-jvsclaw.sh | bash
```

需要自定义可写目录时，使用插件专用变量，不要改写宿主路径变量：

```bash
curl -fsSL https://artifact.yoooclaw.com/plugin/install-jvsclaw.sh |
  PHONE_NOTIFICATIONS_STATE_DIR=/custom/writable/openclaw \
  PHONE_NOTIFICATIONS_CONFIG_PATH=/custom/writable/openclaw/openclaw.json bash
```

### 一键脚本安装

推荐给 QClaw，也可作为 OpenClaw 备选方式。脚本会从 CDN 下载插件包，自动探测宿主状态目录，预检写入权限，按插件工具契约写入授权配置，并在失败时回滚。

macOS / Linux：

```bash
curl -fsSL https://artifact.yoooclaw.com/plugin/install.sh | bash
```

JvsClaw：

```bash
curl -fsSL https://artifact.yoooclaw.com/plugin/install-jvsclaw.sh | bash
```

Windows PowerShell：

```powershell
& ([scriptblock]::Create((irm https://artifact.yoooclaw.com/plugin/install.ps1)))
```

常用选项：

| 选项 | 说明 |
| --- | --- |
| `--version <ver>` | 安装指定版本，不传则自动获取最新版本。 |
| `--tgz-url <url\|path>` | 使用指定插件包地址或本地包。 |
| `--target-dir <path>` | 指定安装目录。 |
| `--state-dir <path>` | 指定 OpenClaw / QClaw / JvsClaw 状态目录。 |
| `--config-path <path>` | 指定宿主配置文件路径。 |
| `--channel <name>` | 指定渠道，支持 `openclaw`、`arkclaw`、`jvsclaw`。 |
| `--api-key <key>` | 安装时写入灯控等能力使用的 API Key。 |
| `--retention-days <n>` | 设置通知数据保留天数；不传则永久保存。 |

示例：

```bash
curl -fsSL https://artifact.yoooclaw.com/plugin/install.sh | bash -s -- --version 1.11.17-beta.8
curl -fsSL https://artifact.yoooclaw.com/plugin/install.sh | bash -s -- --api-key ock_xxx
```

> OpenClaw 下脚本会在重启后验证插件命令是否可用；JvsClaw 下脚本会写入 `/home/admin/.openclaw` 并触发 Gateway 重启，但会跳过即时 CLI 自检，避免平台 RPC 恢复期间误报。如果宿主 `plugins.deny` 明确禁用了本插件，脚本会中止并提示先移除 denylist 项。QClaw 通常没有全局 `openclaw` 命令，插件安装后如果没有立即生效，请重启 QClaw 桌面应用；如需执行 OpenClaw 子命令，请使用 QClaw 自带 wrapper。JvsClaw 的宿主根目录可能只读，专用脚本不会把它当作插件写入目录。

## 下一步

- [工作方式与存储](/plugin/how-it-works) —— 两种接入模式与本地数据布局。
- [命令参考](/plugin/commands) —— `openclaw ntf` 常用命令。
- [配置项](/plugin/config) —— 保留天数、忽略 app、Relay、ASR 等。
