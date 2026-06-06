# 命令体系与输出

## 三层命令体系

- **Shortcuts**（`+` 前缀）：对最常用场景做参数预设，如 `yoooclaw notification +today`、`yoooclaw light +blink`、`yoooclaw lightrule +on`、`yoooclaw recording +latest`、`yoooclaw image +latest`。
- **Service commands**：`yoooclaw <service> <subcommand>`，service 列表见 `yoooclaw --help`。
- **Raw API**：`yoooclaw api <METHOD> <PATH> [--data ...]` 直达 daemon HTTP 端点，调试和未包装能力都不卡。

完整子命令清单见 [命令参考](/cli/commands)。

## daemon 依赖标记

文档里用三个标记区分命令对 daemon 的依赖：

| 标记 | 含义 |
| --- | --- |
| 🟢 | 不需要 daemon（纯读磁盘或纯本地操作） |
| 🟡 | 需要 daemon 在跑（控制类，走本地 HTTP RPC） |
| 🔵 | 进程类（管理 daemon 自身） |

## 全局 flags

| flag | 说明 |
| --- | --- |
| `--profile <name>` | 切换 profile（默认 `default`，也可用环境变量 `YOOOCLAW_PROFILE`） |
| `--format <fmt>` | `json` \| `pretty` \| `table` \| `ndjson`（TTY 默认 pretty，管道默认 json） |
| `--quiet` | 抑制进度日志，只输出最终结果 |
| `--no-color` | 关闭终端颜色 |

### 输出格式

| 格式 | 行为 | 适用 |
| --- | --- | --- |
| `json` | 单行 `JSON.stringify` | 非 TTY / 管道默认 |
| `pretty` | 缩进两空格 | TTY 默认 |
| `table` | 数组结果按列对齐 | 人看列表 |
| `ndjson` | 每条结果一行 JSON，无包裹数组 | 流式 / 大批量 / Agent 消费 |

## 输出契约

成功与失败共用同一通道（stdout）与可预测结构。本地 CLI 校验 / 运行时错误会额外以非零退出码表达；`api` 这类 Raw HTTP 命令会尽量保留 daemon 原始响应，脚本里应同时检查 `ok` 与 HTTP status：

```json
{ "ok": false, "error": { "code": "YOOOCLAW_DAEMON_NOT_RUNNING", "message": "daemon 未运行", "hint": "先执行 yoooclaw daemon start" } }
```

错误码统一前缀 `YOOOCLAW_*`，进入半正式契约。常见错误码：

| code | 含义 |
| --- | --- |
| `YOOOCLAW_INVALID_ARGUMENT` | 参数校验失败 |
| `YOOOCLAW_CONFIG_INVALID` | profile 未初始化或配置非法 |
| `YOOOCLAW_DAEMON_NOT_RUNNING` | daemon 未运行（🟡 命令前置检查） |
| `YOOOCLAW_DAEMON_ALREADY_RUNNING` | daemon 已在运行（单实例保护） |
| `YOOOCLAW_UNAUTHORIZED` | gateway token 不一致 |
| `YOOOCLAW_NOT_FOUND` | 资源不存在 |
| `YOOOCLAW_IMAGE_NOT_READY` | 图片尚未下载完成 |

## Profile

`--profile <name>` 切换到 `~/.yoooclaw/profiles/<name>/`；未指定时用 `~/.yoooclaw/active-profile` 记录的 active profile，缺省 `default`。多机 / 多账号各跑一个 profile：

```bash
yoooclaw --profile home daemon status
yoooclaw --profile work daemon status
yoooclaw profile list          # 列出全部，标注 active
yoooclaw profile use work       # 切换 active
```

## 数据目录

`~/.yoooclaw/`（可用环境变量 `YOOOCLAW_HOME` 覆盖，便于测试 / 多实例）。落盘文件 `0600`、目录 `0700`：

```text
~/.yoooclaw/
├── credentials.json          # account 级共享 api-key（apiKey 或 apiKeys[]，跨 profile，且与插件共用）
├── active-profile            # 当前 active profile 名
└── profiles/
    └── default/
        ├── config.json       # daemon / relay / 灯效规则 / 输出等配置
        ├── credentials.json  # instance 级密文（gateway token / webhook secret）
        ├── daemon.lock       # 进程锁（PID + 启动时间 + 监听地址）
        ├── daemon.log        # 当前日志（按日轮转为 daemon.log.YYYY-MM-DD）
        ├── notifications/    # 按日期 YYYY-MM-DD.json
        ├── recordings/       # index.json + 音频 / 转写稿 / asr-config.json / state/events.jsonl
        ├── images/           # index.json + files/（从 OSS 下载的本体）
        ├── tasks/            # 灯效规则
        └── state/            # monitors.json、last-update-check.json 等
```

## 凭据解析

敏感凭据按分层解析，命中即停：

- **api-key**（account 级，调 yoooclaw AI / app-name-map / Relay）：`YOOOCLAW_API_KEY` → 共享 `~/.yoooclaw/credentials.json#apiKeys[]` → keychain `yoooclaw/api-key` → 共享 `~/.yoooclaw/credentials.json#apiKey`。`YOOOCLAW_API_KEY` 是单 key 显式覆盖；一旦文件里存在 `apiKeys[]`，keychain 会被遮蔽。
- **gateway token / webhook secret**（instance 级）：随 profile 走，由 `config.json` 的 `*Ref` 引用（`env:` / `file:` / `keychain:` / `inline:`）。

### 多 api-key

多 key 仍然是 account 级凭据，写在共享 `~/.yoooclaw/credentials.json`，格式是：

```json
{
  "apiKeys": [
    { "label": "phone-a", "key": "ock_xxx", "default": true },
    { "label": "phone-b", "key": "ock_yyy" }
  ]
}
```

常用命令：

```bash
yoooclaw auth add-api-key <ock_phone_a> --label phone-a --default
yoooclaw auth add-api-key <ock_phone_b> --label phone-b
yoooclaw auth list-api-keys
yoooclaw auth set-default-api-key phone-b
yoooclaw auth remove-api-key phone-a
```

label 只能使用 `[a-z0-9-]{1,32}`，且不能是 `all`、`legacy`、`env`、`keychain`、`local`。第一次执行 `auth add-api-key` 时，如果文件里已有旧的 `apiKey`，CLI 会迁移为 `apiKeys[]` 并保留旧 key 为 `default` label；没有旧 key 时，第一条新增 key 自动成为 default。

`auth set-api-key` 仍可用于单 key 场景；在 `apiKeys[]` 模式下它只轮换 default 条目的 key，不会覆盖其他 label。多 key 不支持 `--keychain`，因为 keychain 只表示一个 account 级单 key。

daemon 启动后会为 `apiKeys[]` 的每个 label 各连一条 Relay 隧道；文件变更会触发热重载，必要时可手动执行 `yoooclaw daemon reload`。入站通知、录音、图片会记录对应 `clientLabel`，查询时可用 `--client <label>` 过滤，例如：

```bash
yoooclaw notification +today --client phone-a
yoooclaw recording list --client phone-b
yoooclaw tunnel status --client phone-a
```
