# 存储与上下文构建

CLI 把手机端推来的三类数据——**通知、录音（含转写 / 摘要）、图片**——全部落成本地文件，再用一套命令把它们整理成 Agent 能直接消费的上下文。

这一章分两半：前半讲**三类数据各自怎么落盘**，后半讲 **CLI 怎么把这些落盘数据加工成上下文**。落盘目录在 profile 里的位置见[架构与实现逻辑 · profile](/cli/architecture)；多账号下的 `clientLabel` 打标见[多 api-key 设计](/cli/multi-api-key)。

## 设计理念：落盘即事实，纯读即上下文

三类数据共用同一套思路：

1. **一切先落本地文件**——通知是按天 JSON，录音 / 图片各有 `index.json` + 实体文件，状态走状态机。文件就是事实来源，daemon 在不在线都不影响「读」。
2. **读与写控制分离**——查询类命令（🟢）纯读磁盘，**冷启动就能跑**，不需要 daemon。
3. **同构三件套**——每类数据都有：元数据索引、同步 / 转写状态、`clientLabel` 来源标记、可解析的本地路径。Agent 拿到的要么是完整结果，要么是清晰的「还没好」错误，**不会拿到半截数据**。

```text
profiles/<name>/
├── notifications/          # 按天 JSON + 去重索引
│   ├── 2026-05-25.json
│   ├── .ids/               # 按 id 去重
│   └── .keys/              # 按内容指纹去重
├── recordings/
│   ├── audio/              # 原始音频(.ogg) + 打点(.srt)
│   ├── transcript-data/    # 转写 JSON（主存储）
│   ├── transcripts/        # 转写正文 .md（派生）
│   ├── summaries/          # 摘要 .md（派生）
│   ├── index.json          # 元数据 + 状态索引
│   ├── asr-config.json     # 本地 ASR 配置
│   └── state/events.jsonl  # 状态事件流
└── images/
    ├── index.json          # 元数据 + 同步状态
    └── files/              # 下载后的图片实体
```

## 通知：按天 JSON + 双重去重

通知按天落到 `notifications/YYYY-MM-DD.json`（JSON 数组，追加写）。每条 [StoredNotification](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/src/notification/storage.ts) 结构：

```json
{
  "clientLabel": "phone-a",
  "appName": "com.tencent.xin",
  "appDisplayName": "微信",
  "title": "王总",
  "content": "下午三点的会议改到四点",
  "timestamp": "2026-05-25T14:02:11+08:00",
  "senderName": "王总",
  "conversationType": "private"
}
```

几个要点：

- **`appDisplayName` 由后端 app-name-map 补全**——落库时把包名 `com.tencent.xin` 解析成「微信」，让上下文对人和模型都更可读。
- **飞书等 IM 做结构化拆分**——把 title / subtitle 归一成 `senderName` / `conversationType` / `conversationName`，群聊私聊可区分。
- **双重去重**：`.ids/` 按通知 `id` 去重，`.keys/` 按「`clientLabel`+app+title+content+timestamp」的 SHA-256 内容指纹去重。同一条消息被手机端重推、或多 key 重复投递都不会落两份。去重以 `clientLabel` 为维度——不同账号收到的同样内容互不遮蔽。
- **保留期**：`retentionDays` 到期自动清理数据文件与两份索引。

## 录音：音频 → 转写 JSON → 摘要

录音是链路最长的一类，落盘分四级目录，由 `index.json` 串起来。一条录音从手机端 `recordings.sync` 进来后：

```text
recordings.sync(元数据)
  ↓  index.json 落条目，status=syncing_openclaw
后台拉 OSS 音频 → audio/<id>.ogg (+ .srt 打点)
  ↓  status=transcribing
ASR 转写（api: account ock- key / local: Whisper）
  ↓
transcript-data/<id>.json   ← 转写主存储（结构化：title/summary/text/segments）
transcripts/<id>_<标题>.md  ← 正文（派生）
summaries/<id>.md           ← 摘要（派生）
  ↓  status=transcribed
```

设计上的关键点：

- **`transcript-data/` 的 JSON 是主存储**，`transcripts/` 正文和 `summaries/` 摘要都是从它派生的。`readTranscript` / `readSummary` 优先读 JSON，旧数据才回退读 Markdown——保证新老数据一个口径。
- **`title` / `summary` 内置**：转写完成会顺带产出 ≤ 标题级别的 `title` 和一段摘要，写进 index 与 `summaries/`。Agent 想「快速了解这条录音讲了啥」时，**读摘要就够，不必拉全文**。
- **状态机严格校验**：`transfer_status` 在 `syncing_openclaw → transcribing → transcribed`（及各 `*_failed`）之间按状态机迁移，非法跃迁直接拒绝。daemon 重启时残留的 `transcribing` 会被判定为中断并落 `transcribe_failed`。
- **in-flight 去重**：手机端对同一 `recordingId` 重复推 sync 时，第二次直接返回当前状态，避免并行 ASR 撞状态机。
- **事件流**：每次状态变化追加到 `state/events.jsonl`，`yc recording events --id <id> --watch` 可像 `tail -f` 一样跟随；同一事件也经 Relay 以 `recording.status` 推回手机端。

ASR 配置写在 `recordings/asr-config.json`（`yc recording setup-asr` 生成），`mode=api` 缺 key 时回退到 account 级 `ock-` key，`mode=local` 走本机 Whisper。

## 图片：与录音同构的下载通道

图片走 `POST /images`，落 `images/index.json` 后**后台流式下载** OSS 原图到 `images/files/<id>.<ext>`：

```text
POST /images → index.json 落条目，status=syncing
  ↓  后台 fetch(ossUrl) 流式写 files/<id>.<ext>
status=synced（失败 → sync_failed，记 lastError）
```

`image path <id>` 在文件还没下载完时返回 `YOOOCLAW_IMAGE_NOT_READY` 而不是半截文件——这样 Agent 拿本地路径喂多模态模型时，要么拿到完整图片、要么拿到明确的「还没好」。`index.json` 同样带 `clientLabel`、`source_app`、`caption` 等元数据。

## CLI 如何帮你构建上下文

落盘只是原料，CLI 的命令层把它们加工成 Agent 好用的上下文。核心手段有六个：

### 1. 高频场景预设（shortcuts）

`+` 前缀把最常用的查询固化成一条命令，Agent 不必拼一堆 flag：

```bash
yc notification +today      # 今日通知摘要
yc notification +recent     # 最近 1 小时
yc recording +latest        # 最新一条录音（含 title/summary/transcript）
yc image +latest            # 最新一张图片详情
```

### 2. 为「总结」而生的聚合命令

`notification summary` 不是把通知一条条吐出来，而是**聚合统计 + 最近样例**一起返回，正好是 Agent 做总结需要的形状；`notification stats` 支持按 `date|app|sender|hour|client` 多维聚合：

```bash
yc notification summary --from 2026-05-25T00:00:00+08:00 --sample 30 --top 10
yc notification stats --dim app --from 2026-05-20
```

### 3. 喂给记忆系统的增量游标

`sync` 服务（`scan` / `fetch` / `commit`）给「把通知持续灌进记忆系统」设计了一套游标：`scan` 找出各日期待处理量，`fetch` 取某日明细并返回 `endIndex`，`commit` 用该 `endIndex` 标记本批已处理。**重复跑不会重复灌**，断点可续。

### 4. 录音读「摘要优先」

`recording status <id>` / `+latest` 返回 `title` + `summary` + `transcript`，Agent 先看摘要决定要不要展开全文，省 token：

```bash
yc recording +latest                  # 最新录音的标题 + 摘要 + 正文
yc recording list --status transcribed --client phone-a
```

### 5. 图片给「本地绝对路径」喂多模态

`image +latest` / `image path <id>` 直接吐**本地文件绝对路径**，Agent 拿去喂多模态模型；未下载完则返回 `YOOOCLAW_IMAGE_NOT_READY`，不会喂半截文件。

### 6. 面向 Agent 的输出契约

所有命令走统一 `--format json|pretty|table|ndjson`：

- **`ndjson`** 每条结果一行 JSON，适合 Agent 流式逐行消费与背压处理；
- 成功 `{ "ok": true, ... }` / 失败 `{ "ok": false, "error": { "code": "YOOOCLAW_*", ... } }` 共用 stdout，失败再叠加**非零退出码**，让 `set -e` 和 Agent 都能直接判断；
- `--client <label>` 把多账号上下文切开，`--client all` 表示不过滤。

把这几件事串起来，一次「帮我整理今天手机上发生了什么」的上下文构建就是：

```text
yc notification summary +today      → 今日通知聚合 + 样例
yc recording list --status transcribed
  └─ yc recording status <id>       → 挑出的录音读摘要
yc image +latest                    → 最新图片本地路径喂多模态
            ↓  全部 --format ndjson / json
        Agent 拼装上下文 → 回答
```

## 下一步

- [命令参考](/cli/commands) —— `notification` / `recording` / `image` / `sync` 全部子命令与 flag。
- [Agent Skill](/cli/skills) —— Agent 怎么自动驱动这些命令。
- [架构与实现逻辑](/cli/architecture) —— daemon、ingest、录音状态机的全貌。
- [多 api-key 设计](/cli/multi-api-key) —— `clientLabel` 怎么来的、多账号怎么切。
