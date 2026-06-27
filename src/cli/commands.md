# 命令参考

按 service 列出全部子命令。依赖标记：🟢 不需要 daemon · 🟡 需要 daemon 在跑 · 🔵 管理 daemon 自身。
所有命令支持全局 flags（`--profile` / `--format` / `--quiet` / `--no-color`），见[命令体系与输出](/cli/usage)。

## config — 配置管理 🟢

| 命令 | 说明 |
| --- | --- |
| `config init` | 交互式首次向导，生成 `config.json` + gateway token，打印手机端配置摘要，并自动后台拉起 daemon（开箱即用）。支持 `--non-interactive --from-file <config.json>`（`-` 读 stdin）、`--force` 覆盖、`--no-start` 只生成配置不启动 daemon。 |
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
| `notification summary` | 聚合统计 + 样例摘要，供 Agent 总结。支持 `--client <label>`，追加 `--sample <n>`（默认 30）、`--top <n>`（默认 10）。显式传 `--limit` 时只聚合最近 N 条。 |
| `notification summary-job` | 分片通知总结任务：大批量通知切片 → 逐片总结 → 合并结果。子命令见下方 [summary-job](#notification-summary-job-—-分片通知总结-🟢)。 |
| `notification stats` | 按维度聚合。`--from/--to <YYYY-MM-DD>`、`--app`、`--client <label>`、`--dim date\|app\|sender\|hour\|client\|all`。 |
| `notification storage-path` | 打印 notifications 目录绝对路径。 |
| `notification +today` | 今日通知。支持 `--client <label>`。 |
| `notification +recent` | 最近 1 小时通知。支持 `--client <label>`。 |
| `notification +unread` | （预留）未读通知，需先落地已读状态模型，当前返回 `YOOOCLAW_NOT_IMPLEMENTED`。 |

`--app` 支持中英文别名：`微信/wechat`、`飞书/feishu/lark`、`钉钉/dingtalk`、`企业微信/wecom`、`qq` 等。

```bash
yoooclaw notification search --app 微信 --keyword 开会 --format ndjson
yoooclaw notification summary --top 10 --format json
```

### notification summary-job — 分片通知总结 🟢

供大批量通知的「切片 → 逐片总结 → 合并」工作流。`summary` 适合小批量一次性聚合；通知条数很多、需要逐片喂给模型时走 `summary-job`：`create` 建任务并切片，`next` 领一个待总结分片，`commit` 回填该片摘要，全部完成后 `result` 合并出最终结果。也可用 `run` 跳过模型、用抽取式摘要自动跑完。

| 命令 | 说明 |
| --- | --- |
| `notification summary-job create` | 创建任务并按查询切片。复用全部 `notification` 查询 flags（`--from/--to`、`--app`、`--sender`、`--conversation-type`、`--keyword`、`--client`、`--limit`，`--limit` 默认 1000），加 `--chunk-size <n>`（每片条数，默认 150）、`--max-content <n>`（单条标题/正文最大字数，默认 120）。 |
| `notification summary-job status <id>` | 查看任务状态与各分片进度。 |
| `notification summary-job next <id>` | 领取或重试下一个待总结分片，返回分片内容与 `chunkId`。 |
| `notification summary-job commit <id>` | 回填分片摘要并标记该片完成。`--chunk-id <id>`（必填，来自 `next`），`--summary <text>` 或 `--summary-file <path>` 二选一传入摘要。 |
| `notification summary-job run <id>` | 用抽取式摘要自动处理待总结分片（无需模型）。`--max-chunks <n>`（本次最多处理片数，默认 20）、`--include-result`（完成时输出 markdown 结果）。 |
| `notification summary-job result <id>` | 合并已提交的分片摘要并返回最终结果。 |
| `notification summary-job cancel <id>` | 取消任务（保留已落盘的分片与摘要）。 |

```bash
# Agent 驱动：建任务 → 循环 next/commit → 合并
JOB=$(yoooclaw notification summary-job create --app 微信 --limit 2000 --format json)
yoooclaw notification summary-job next <id>     # 取一片，喂给模型总结
yoooclaw notification summary-job commit <id> --chunk-id <chunk> --summary "本片摘要…"
yoooclaw notification summary-job result <id> --format json

# 无模型场景：抽取式自动跑完
yoooclaw notification summary-job run <id> --include-result --format json
```

## sync — 通知同步给记忆系统 🟢

供外部记忆系统按批次拉取通知的 checkpoint 协议。`scan` / `next` 共享一组日期范围 flags：`--all`（处理 checkpoint 之后所有日期）、`--date <YYYY-MM-DD>`（仅指定日期）、`--from-date` / `--to-date`（区间）；都不传时默认只处理本地当天。

| 命令 | 说明 |
| --- | --- |
| `sync scan` | 扫描未处理通知，默认只返回本地当天待同步摘要；配合范围 flags 扩大扫描范围。 |
| `sync next` | 通用批次迭代器：返回范围内下一批未处理通知（≤100 条）及 `commitCommand`，全部处理完返回 `done=true`。配合范围 flags 使用。 |
| `sync fetch --date <YYYY-MM-DD>` | 获取指定日期未处理通知详情。`--max-end-index <n>` 用于幂等切片。 |
| `sync commit --date <YYYY-MM-DD>` | 标记当前批次处理完成。`--end-index <n>` 精确提交。 |

```bash
# 迭代器写法：next 直接返回下一批 + 提交命令，处理完 done=true
yoooclaw sync next --all --format json
yoooclaw sync commit --date 2026-06-17 --end-index 42
```

## recording — 录音管理

| 命令 | 说明 |
| --- | --- |
| `recording list` 🟢 | 列出所有录音。`--status <status>` 按传输状态过滤，`--client <label>` 按 api-key label 过滤。 |
| `recording status <id>` 🟢 | 单条录音详情（metadata、文件路径、ASR 状态、错误）。 |
| `recording storage-path` 🟢 | 打印录音存储目录绝对路径。 |
| `recording setup-asr` 🟢 | 配置 ASR 转写参数。当前可用模式是 `--mode api`；`local` 仍保留在 flag/schema 中用于兼容旧请求，但 Go beta 会拒绝本地 Whisper 模式。支持 `--api-key`、`--endpoint`、`--language`、`--non-interactive`。 |
| `recording events` 🟢 | 查询录音状态事件流。`--id <recordingId>`、`--since <10m\|1h\|24h>`、`--watch`、`--limit <n>`（默认 200）。 |
| `recording +latest` 🟢 | 展示最新一条录音详情。 |

独立 CLI 的 daemon 经 `recordings.result.write` 接收 App / 云端写入的转写与总结（可选带 `ossUrl` 时后台下载音频），落在当前 profile 的 `recordings/`。本机重新转写经 `recordings.retranscribe` 触发：`setup-asr` 写出的 `asr-config.json` 与请求级 `asr` 参数兼容；当 `mode=api` 且未写入 `apiKey` 时，会回退到 account 级 `ock-` key。当前 Go beta 只支持 `api` / model-proxy ASR。

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

Raw API 会尽量保留 daemon 的原始 HTTP 语义；脚本消费时请同时检查返回体 `ok` 与 HTTP status，不要只依赖进程退出码。

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
| `doctor` 🟢/🟡 | 环境自检：Go runtime、目录权限、keychain、daemon、配置。`--json`、`--fix`。网络类自检（relay / OSS）交给 `gateway test` / `tunnel +test`。 |
| `uninstall` 🔵 | 卸载 CLI：停掉所有 profile 的 daemon，删除二进制（`yoooclaw` 及 `yc` 软链）与配置（account / profile 的 `config.json`、`credentials.json`、`active-profile`、`daemon.lock`），**默认保留**通知 / 录音 / 图片等数据。`--data` 连同数据一并删除（清空 `~/.yoooclaw`）；`--yes` 跳过确认。npm 安装形态无法自删二进制，会提示运行 `npm uninstall -g @yoooclaw/cli`。 |

```bash
yoooclaw migrate from-openclaw --dry-run
yoooclaw doctor --format json
yoooclaw uninstall              # 停 daemon + 删二进制与配置，保留数据
yoooclaw uninstall --data --yes # 连数据一起清空，免确认
```
