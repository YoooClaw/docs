# 命令参考

按 service 列出全部子命令。依赖标记：🟢 不需要 daemon · 🟡 需要 daemon 在跑 · 🔵 管理 daemon 自身。
所有命令支持全局 flags（`--profile` / `--format` / `--quiet` / `--no-color`），见[命令体系与输出](/cli/usage)。

## config — 配置管理 🟢

| 命令 | 说明 |
| --- | --- |
| `config init` | 交互式首次向导，生成 `config.json` + gateway token，打印手机端配置摘要。支持 `--non-interactive --from-file <config.json>`（`-` 读 stdin）、`--force` 覆盖。 |
| `config show` | 显示当前 profile 配置（敏感字段遮罩）。`--show-secrets` 明文输出（需 TTY + 二次确认）。 |
| `config set <key> <value>` | 设置单个配置项，支持点号路径（`daemon.port`、`notification.ignoredApps` 用逗号分隔）。 |
| `config unset <key>` | 删除单个配置项。 |

```bash
yoooclaw config init
yoooclaw config set daemon.port 18789
yoooclaw config show --format json
```

## profile — 多 profile 管理 🟢

| 命令 | 说明 |
| --- | --- |
| `profile list` | 列出所有 profile，标注 active。 |
| `profile use <name>` | 切换 active profile。 |
| `profile create <name>` | 新建 profile（走 `config init` 向导）。 |
| `profile delete <name>` | 删除 profile（不允许删 active，需 `--yes`）。 |

## auth — 凭据与鉴权

| 命令 | 说明 |
| --- | --- |
| `auth set-api-key <key>` 🟢 | 设置 / 轮换 account 级 default api-key（`-` 从 stdin 读，避免进 shell history）。已有 `apiKeys[]` 时只更新 default 条目；`--keychain` 写 OS keychain。 |
| `auth add-api-key <key>` 🟢 | 新增一条带 label 的 api-key。`--label <label>` 必填（`[a-z0-9-]{1,32}`），`--default` 设为默认，`--force` 覆盖同名 label。 |
| `auth list-api-keys` 🟢 | 列出 api-key 条目、`mode`、`defaultLabel`，key 自动遮罩。 |
| `auth remove-api-key <label>` 🟢 | 删除指定 label 的 api-key。删掉 default 时，第一条剩余 key 自动成为新 default。 |
| `auth set-default-api-key <label>` 🟢 | 切换 default api-key；云端 ASR fallback 和旧的单 key 调用会用它。 |
| `auth status` 🟢 | 显示 api-key / gateway token 是否存在、来源（env/keychain/file）、`mode`、`defaultLabel`、daemon 是否可达。不调 daemon。 |
| `auth token-rotate` 🟡 | 生成新 gateway token 并写入（按 `auth.tokenRef`）。`--length <n>` 字节长度，默认 32。 |
| `auth check` 🟡 | 端到端鉴权体检：用本地 token 调 daemon `/daemon/status` 验证一致性。 |

```bash
echo 'ock_xxx' | yoooclaw auth set-api-key -
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw auth list-api-keys
yoooclaw auth set-default-api-key phone-b
yoooclaw auth status --format json
```

多 key 存在共享 `~/.yoooclaw/credentials.json` 的 `apiKeys[]`，跨 profile 生效。daemon 在跑时会通过文件 watch 热重载；如果 watch 不可靠，执行 `yoooclaw daemon reload` 主动重读凭据并增量刷新 Relay 隧道。每个 key label 会成为入站数据的 `clientLabel`，可用各查询命令的 `--client <label>` 过滤。

## daemon — 守护进程管理 🔵

| 命令 | 说明 |
| --- | --- |
| `daemon start` | 启动 daemon，默认 fork 到后台 detach。`--bind <host>`、`--port <n>`、`--no-detach`（systemd/launchd 用）、`--log-level <level>`。 |
| `daemon stop` | 发送 SIGTERM，最多等 10s 后 SIGKILL。 |
| `daemon restart` | 等同 stop + start，保留原启动参数。 |
| `daemon reload` | 不重启进程，重读 api-key CredentialSet 并增量启动 / 停止 / 重连 Relay 隧道。 |
| `daemon status` | 打印 PID、监听地址、启动时间、relay 状态、灯效规则数、最近 ingest、内存占用。 |
| `daemon logs` | 跟踪 daemon 日志。`-f, --follow`、`--lines <n>`（默认 100）、`--level <level>`。 |

```bash
yoooclaw daemon start
yoooclaw daemon status --format json
yoooclaw daemon logs --lines 200 --level error
```

## notification — 通知查询 🟢

| 命令 | 说明 |
| --- | --- |
| `notification search` | 按条件查询，时间倒序。`--from/--to <iso8601>`、`--app`、`--sender`、`--conversation-type group\|private`、`--keyword`、`--client <label>`、`--limit`（默认 100）。 |
| `notification summary` | 聚合统计 + 样例摘要，供 Agent 总结。支持 `--client <label>`，追加 `--sample <n>`（默认 30）、`--top <n>`（默认 10）。 |
| `notification stats` | 按维度聚合。`--from/--to <YYYY-MM-DD>`、`--app`、`--client <label>`、`--dim date\|app\|sender\|hour\|client\|all`。 |
| `notification storage-path` | 打印 notifications 目录绝对路径。 |
| `notification +today` | 今日通知。支持 `--client <label>`。 |
| `notification +recent` | 最近 1 小时通知。支持 `--client <label>`。 |

`--app` 支持中英文别名：`微信/wechat`、`飞书/feishu/lark`、`钉钉/dingtalk`、`企业微信/wecom`、`qq` 等。

```bash
yoooclaw notification search --app 微信 --keyword 开会 --format ndjson
yoooclaw notification summary --top 10 --format json
```

## sync — 通知同步给记忆系统 🟢

供外部记忆系统按批次拉取通知的 checkpoint 协议。

| 命令 | 说明 |
| --- | --- |
| `sync scan` | 扫描未处理通知，返回各日期待同步摘要。 |
| `sync fetch --date <YYYY-MM-DD>` | 获取指定日期未处理通知详情。`--max-end-index <n>` 用于幂等切片。 |
| `sync commit --date <YYYY-MM-DD>` | 标记当前批次处理完成。`--end-index <n>` 精确提交。 |

## recording — 录音管理

| 命令 | 说明 |
| --- | --- |
| `recording list` 🟢 | 列出所有录音。`--status <status>` 按传输状态过滤，`--client <label>` 按 api-key label 过滤。 |
| `recording status <id>` 🟢 | 单条录音详情（metadata、文件路径、ASR 状态、错误）。 |
| `recording storage-path` 🟢 | 打印录音存储目录绝对路径。 |
| `recording setup-asr` 🟢 | 配置 ASR 转写参数。`--mode api\|local`、`--api-key`、`--endpoint`、`--language`、`--model`、`--non-interactive`。 |
| `recording events` 🟢 | 查询录音状态事件流。`--id <recordingId>`、`--since <10m\|1h\|24h>`、`--watch`、`--limit <n>`（默认 200）。 |
| `recording +latest` 🟢 | 展示最新一条录音详情。 |

独立 CLI 的 daemon 会接收手机端 `recordings.sync` / `POST /recordings`，音频和转写稿落在当前 profile 的 `recordings/`。`setup-asr` 写出的 `asr-config.json` 与手机端请求级 `asr` 参数兼容；当 `mode=api` 且未写入 `apiKey` 时，会回退到 account 级 `ock-` key。

```bash
yoooclaw recording setup-asr --mode api --language auto --non-interactive
yoooclaw recording events --since 1h --limit 50 --format json
yoooclaw recording events --id 2026-03-23_14-32 --watch
```

## image — 图片管理 🟢

图片由 daemon 后台从 OSS 下载到 `images/files/`；查询命令纯读 `images/index.json`。

| 命令 | 说明 |
| --- | --- |
| `image list` | 列出图片。`--status syncing\|synced\|sync_failed`、`--app`、`--from/--to <iso8601>`、`--client <label>`、`--limit`。 |
| `image status <id>` | 单张图片详情。 |
| `image path <id>` | 打印本地文件绝对路径（供 Agent 喂多模态模型）。`--thumbnail` 返回缩略图。未下载完成返回 `YOOOCLAW_IMAGE_NOT_READY`。 |
| `image storage-path` | 打印图片存储目录绝对路径。 |
| `image +latest` | 展示最新一张图片详情。 |

## light — 灯效硬件控制 🟡

| 命令 | 说明 |
| --- | --- |
| `light send` | 发送灯效指令。`--segments <json>`（灯效参数）或 `--preset <name>`（预设名）；`--repeat`、`--repeat-times <n>`。 |
| `light +blink` | 灯效连通性测试。 |

> 独立 daemon 暂无连接的灯效设备会话时，命令返回 `accepted: true, delivered: false`（需手机端在线 / relay）。

## lightrule — 灯效规则管理 🟡

通知 ingest 后 daemon 评估命中并触发灯效。

| 命令 | 说明 |
| --- | --- |
| `lightrule list` | 列出所有规则及状态。 |
| `lightrule show <id>` | 单条规则详情。 |
| `lightrule create` | 创建规则。`--from-file <path>`（`-` 读 stdin）或 `--name`/`--intent`/`--light-action`/`--match-rules`。 |
| `lightrule update <id>` | 更新现有规则，未指定字段保留原值。 |
| `lightrule delete <id>` | 删除规则（`--yes` 跳过确认）。 |
| `lightrule enable <id>` / `disable <id>` | 启用 / 停用单条规则。 |
| `lightrule +on` / `+off` | 启用 / 停用所有规则。 |

```bash
cat rule.json | yoooclaw lightrule create --from-file -
yoooclaw lightrule list --format json
```

## monitor — 定时通知监控任务 🟡

cron 表达式驱动的定时任务定义（当前持久化定义与启用状态）。

| 命令 | 说明 |
| --- | --- |
| `monitor list` | 列出所有监控任务。 |
| `monitor show <name>` | 任务详情。 |
| `monitor create <name>` | 创建任务。`--description`、`--match-rules <json>`、`--schedule <cron>` 均必填。 |
| `monitor delete <name>` | 删除任务（`--yes`）。 |
| `monitor enable <name>` / `disable <name>` | 启用 / 暂停任务。 |

## tunnel — Relay 隧道 🟡

| 命令 | 说明 |
| --- | --- |
| `tunnel status` | 查询 Relay 连接状态（`connected` / `reconnectAttempt` / 断开原因）。多 key 时返回 `tunnels[]`；`--client <label>` 只看指定隧道。详见 [调试与排错](/cli/debugging)。 |
| `tunnel reconnect` | 强制断开重连。`--client <label>` 只重连指定 label；不传则重连全部隧道。 |
| `tunnel +test` | 端到端联通性自检：daemon 通过本地回环给自己发一条 echo 通知，验证 ingest + 鉴权链路。`--client <label>` 用指定 api-key 写入。 |

## log — 日志检索 🟢

| 命令 | 说明 |
| --- | --- |
| `log [keyword]` | 搜索 daemon 日志。`--from/--to <YYYY-MM-DD>`、`--limit`（默认 50）、`--level`。 |
| `log +errors` | 昨天起的 error 级日志。 |

## gateway — 协议自检 🟡

| 命令 | 说明 |
| --- | --- |
| `gateway test` | 模拟手机端调 daemon `/notifications`，验证连通 / 鉴权。`--from-phone-ip <ip>`、`--via-relay`。 |

## api — Raw HTTP escape hatch 🟡

```bash
yoooclaw api GET /daemon/status
yoooclaw api POST /images --data @img.json
yoooclaw api POST /light/send --data '{"preset":"blink"}'
```

`--data` 支持 `@filename`（读文件）、`-`（读 stdin）或内联 JSON；`--header <key:value>` 可重复。

## skills — Agent 技能管理 🟢

把随包发布的 `SKILL.md` 安装到 Agent 的 skills 发现目录，让 Agent 自己驱动 `yoooclaw` 命令。详见 [Agent Skill](/cli/skills)。

| 命令 | 说明 |
| --- | --- |
| `skills list` | 列出随 CLI 发布的内置 Skill 及其触发说明。 |
| `skills targets` | 列出支持的 Agent skills 目录和自动探测结果。 |
| `skills install` | 安装到 Agent skills 目录。`--agent <agent>`（`auto` / `claude` / `codex` / `custom`，默认 `auto`）、`--target <dir>`、`--copy`、`--force`。 |

```bash
yoooclaw skills list
yoooclaw skills targets
yoooclaw skills install            # 自动探测唯一 Agent 后软链安装
yoooclaw skills install --agent codex
```

## 维护命令

| 命令 | 说明 |
| --- | --- |
| `migrate from-openclaw` 🟢 | 把 `~/.openclaw/plugins/phone-notifications/` 的通知 / 录音 / 规则 / 图片与 api-key 迁移到 `~/.yoooclaw/`，迁移前自动备份。`--dry-run`、`--source <path>`。 |
| `update self` 🟢 | 查 npm registry 比对版本并提示（不自动更新）。响应里 `dist` 标识当前安装来源（`npm` / `native`），`command` 给出对应的升级命令：npm 形态返回 `npm update -g @yoooclaw/cli`，原生二进制形态返回 `curl ... install.sh \| sh`。`--beta`、`--json`。 |
| `doctor` 🟢/🟡 | 环境自检：Node 版本、目录权限、keychain、daemon、配置。`--json`、`--fix`。网络类自检（relay / OSS）交给 `gateway test` / `tunnel +test`。 |

```bash
yoooclaw migrate from-openclaw --dry-run
yoooclaw doctor --format json
```
