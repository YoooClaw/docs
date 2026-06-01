# 多 api-key 设计

一个 daemon 可以**同时接多个 yoooclaw 账号**：每个账号对应一条 account 级 api-key，daemon 为每条 key 各起一条 Relay 隧道，落盘时按 `clientLabel` 区分来源，查询时用 `--client <label>` 过滤。

这一章把多 key 的**存储形态、解析分层、管理命令、运行时编排**集中讲清楚。凭据在架构里的位置见[架构与实现逻辑](/cli/architecture)的「凭据分层」一节。

## 为什么要多 key

account 级 api-key 是调 yoooclaw 后端（Relay / AI ASR / app-name-map）的凭据，**一个账号一把**。单 key 够用的场景：一台机器只接一个手机端。

需要多 key 的典型场景：

- 一台机器（一个 daemon、一个 profile）要**同时接多部手机 / 多个账号**；
- 想把不同来源的通知、录音**落到同一份数据里但可区分**，而不是开多个 profile 各跑各的 daemon。

多 key 与 profile 是两个正交维度：

| | 隔离粒度 | daemon | 数据 |
| --- | --- | --- | --- |
| **多 profile** | 完全隔离 | 各跑各的 daemon，端口错开 | 各自独立目录 |
| **多 api-key** | 同一 daemon 内共存 | 一个 daemon，多条隧道 | 同一份数据，按 `clientLabel` 打标 |

## 存储形态：`apiKeys[]` vs 旧 `apiKey`

account 级凭据写在共享文件 `~/.yoooclaw/credentials.json`，**CLI / daemon / phone-notifications 插件三方共用同一份**。多 key 用 `apiKeys[]` 数组表达：

```json
{
  "apiKeys": [
    { "label": "phone-a", "key": "ock_xxx", "default": true },
    { "label": "phone-b", "key": "ock_yyy" }
  ]
}
```

每条记录三个字段：

- `label`：隧道与落盘标识，必须匹配 `[a-z0-9-]{1,32}`，且不能用保留字 `all` / `legacy` / `env` / `keychain` / `local`（见 [credentials/store.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/credentials/store.ts) 的 `isValidApiKeyLabel`）。
- `key`：account 级 api-key（`ock_` 前缀）。
- `default`：是否为默认 key。`resolveApiKey()` 在只取单 key 的场景（ASR fallback、旧的单 key 调用）会用 default 条目；**未标记 default 时运行时退化为数组第一条**，并产生一条 warning。

旧版单 key 写法 `{ "apiKey": "ock_xxx" }` 仍兼容，对应解析 mode `legacy-file-single`。第一次 `auth add-api-key` 新增 label 时，会自动把旧 `apiKey` 迁移成 `apiKeys[]` 里 label 为 `default` 的一条。

## 凭据解析分层

`resolveApiKeyEntries()` 返回一个 `CredentialSet`，按下表分层解析、**命中即停**，并标注当前所处的 `mode`：

```text
1. env  YOOOCLAW_API_KEY                       → mode: env-single        ← 显式单 key 覆盖
2. file credentials.json#apiKeys[]             → mode: file-multi         ← 多 key；存在时遮蔽 keychain
3. keychain yoooclaw/api-key                   → mode: keychain-single    ← --keychain 写入的单 key
4. file credentials.json#apiKey                → mode: legacy-file-single ← 旧版单 key
（都没有）                                       → mode: none
```

- 设了 `YOOOCLAW_API_KEY` 环境变量，**强制单 key**，覆盖文件与 keychain。
- 一旦文件里出现 `apiKeys[]` 字段，就进入 `file-multi` 模式并**遮蔽 keychain**；`CredentialSet.shadowedKeychainPresent` 会提示存在被遮蔽的 keychain key。
- `resolveApiKeyEntries()` 给 daemon 决定要连哪些隧道；`resolveApiKey()` 只返回 default key 的单值，供 ASR fallback 等旧路径使用。

## 管理命令

| 命令 | 作用 | 备注 |
| --- | --- | --- |
| `auth add-api-key <key> --label <l>` | 新增一条 key | 首条自动设为 default；`--default` 强制设为默认；label 已存在需 `--force` 覆盖 |
| `auth list-api-keys` | 列出所有条目 | key 自动遮罩为 `ock_***xxxx` |
| `auth set-default-api-key <label>` | 切换默认 key | 只改 default 标记 |
| `auth set-api-key <key>` | 轮换 default 条目的 key | **多 key 模式下只轮换 default 那条的 key**，不新增 |
| `auth remove-api-key <label>` | 删除指定 key | 删掉 default 时自动把剩余第一条提为 default |

```bash
# 接入第二部手机
yc auth add-api-key ock_yyy --label phone-b

# 从 stdin 读，避免 key 进 shell history
echo "ock_zzz" | yc auth add-api-key - --label phone-c

# 看当前都有哪些 key（已遮罩）
yc auth list-api-keys

# 切换默认 key
yc auth set-default-api-key phone-b
```

::: warning keychain 不支持多 key
`auth set-api-key --keychain` 只能管单 key。文件里已存在 `apiKeys[]` 时再带 `--keychain` 会报 `KEYCHAIN_MULTI_UNSUPPORTED`——多 key 请统一走文件 `apiKeys[]`。
:::

## 运行时：一 key 一隧道

daemon 启动后由 [TunnelSupervisor](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/tunnel-supervisor.ts) 按 `CredentialSet` 编排隧道——**每个 label 一条 `RelayClient`**：

```text
CredentialSet (apiKeys[])
  ↓
TunnelSupervisor.apply(set)
  ├─ label 新增      → 启动新隧道           (started)
  ├─ label 删除      → 停止旧隧道           (stopped)
  ├─ key 变化        → 停旧 + 起新（重连）   (restarted)
  └─ 不变            → 复用                 (unchanged)
  ↓ 每条隧道
RelayClient → wss://…/ws/plugin → RelayDispatcher（同进程派发到 daemon runtime）
```

daemon 会 **watch 共享凭据文件**，`apiKeys[]` 变化时自动调 `TunnelSupervisor.apply()` 做增量刷新，无需重启 daemon。watch 不可靠时手动触发：

```bash
yc daemon reload        # 重新读凭据并增量 apply 隧道
yc tunnel status        # 看每条隧道的 label / connected / 默认标记 / 重连次数
yc tunnel reconnect --client phone-b   # 只重连指定 label
```

## 落盘打标与按 client 查询

入站请求在鉴权阶段就确定了来源 `clientLabel`（见 [daemon/main.ts](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/cli/src/daemon/main.ts)）：

| 入站方式 | `authKind` | `clientLabel` |
| --- | --- | --- |
| Relay 隧道（带 api-key） | `relay-api-key` | 对应隧道的 label |
| 本地 HTTP 带 api-key | `http-api-key` | 命中的 label |
| 本地 HTTP 带 gateway token | `gateway-token` | `local` |
| 同进程本地调用 | `local` | `local` |

通知、录音、图片落盘时都带上这个 `clientLabel`，于是查询可以按来源过滤——`--client all` 表示不过滤：

```bash
yc notification +today --client phone-a    # 只看 phone-a 的今日通知
yc notification search --client phone-b --from 09:00
yc notification +today --client all        # 全部来源
```

## 与插件共享同一份凭据

`~/.yoooclaw/credentials.json` 也被 phone-notifications 插件读取，所以 account 级 key 是 **CLI / daemon / 插件共用**的。由此引出一个关键约束：

::: danger 不要让两个 ingress 同连一个账号
宿主里跑着插件、本机又装了 CLI daemon 时，**两边不应同时连同一个 Relay 账号（同一把 api-key）**——同一条手机消息会被推到两个 ingress、落两份。处理：要么关掉插件侧 Relay，要么停掉 CLI 的 daemon，或给两边分配不同的 account key。
:::

## 约束速查

- **label 命名**：`[a-z0-9-]{1,32}`，禁用保留字 `all/legacy/env/keychain/local`。
- **未标 default**：`apiKeys[]` 里没有任何 `default:true` 时，运行时用第一条并告警。
- **env 覆盖**：设了 `YOOOCLAW_API_KEY` 即强制单 key，多 key 文件被忽略。
- **keychain 与多 key 互斥**：多 key 只能走文件。
- **删除最后一条**：`apiKeys[]` 删空后回到 `none` 模式，daemon 停所有隧道但 HTTP server 仍在跑（可走直连兜底）。

## 下一步

- [架构与实现逻辑](/cli/architecture) —— daemon、Relay、StandaloneRuntime 全貌。
- [命令参考](/cli/commands) —— `auth` / `tunnel` / `notification` 全部子命令。
- [调试与排错](/cli/debugging) —— 某条隧道连不上时的排查。
