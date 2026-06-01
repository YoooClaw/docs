# Agent Skill

`@yoooclaw/cli` 随包发布了一组 **Skill**（`SKILL.md`）—— 用自然语言描述「何时该调哪些 `yoooclaw` 命令」，让 Agent 不必你逐条教学就能自己驱动 CLI。

::: tip 与插件形态的区别
在 openclaw 插件里，这些 Skill 由 [`openclaw.plugin.json`](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/openclaw.plugin.json) 的 `skills` 字段自动注册，宿主启动即加载。独立 CLI 没有宿主代劳，Skill 只随 npm 包躺在 `<pkg>/skills/`，**需要手动安装**到当前 Agent 的 skills 发现目录。
:::

## 内置 Skill

| Skill | 触发场景 |
| --- | --- |
| `yoooclaw-notification-query` | "看看最近的通知 / 谁找过我 / 总结今天的消息 / 某 App 有什么通知"——流式查通知，纯读磁盘，不需要 daemon。 |
| `yoooclaw-lightrule-create` | "收到/当某类通知时亮灯/闪灯"这类**持久规则**——daemon 在 ingest 后评估命中并触发灯效，需要 daemon 在跑。 |
| `yoooclaw-tunnel-debug` | "手机推送收不到 / 通知没同步 / 检查隧道 / daemon 还活着吗"——组合 `daemon status` / `tunnel status` / `tunnel +test` / `gateway test` 自检接收链路。 |

```bash
yoooclaw skills list                 # 列出随包发布的内置 Skill 及触发说明
yoooclaw skills targets              # 查看支持的 Agent 目标和探测结果
```

## 安装

```bash
yoooclaw skills install              # 自动探测唯一 Agent 后软链安装
yoooclaw skills install --agent codex
yoooclaw skills install --agent claude
yoooclaw skills install --copy       # 复制而非软链
yoooclaw skills install --target ~/.config/agent/skills --force
```

| flag | 说明 |
| --- | --- |
| `--agent <agent>` | 安装目标 Agent，支持 `auto` / `claude` / `codex` / `custom`，默认 `auto`。 |
| `--target <dir>` | 安装目标目录；传入后优先于自动探测，适合任意兼容 `SKILL.md` 目录结构的 Agent。 |
| `--copy` | 复制目录而非创建软链。Windows 无管理员权限创建软链失败时用它。 |
| `--force` | 目标已存在同名 Skill 时覆盖；否则跳过并在 `skipped` 中报告。 |

`auto` 模式只在检测到唯一 Agent 时自动安装。如果同时检测到 Claude Code 和 Codex，或一个都没检测到，CLI 会返回候选目标并要求显式传 `--agent` 或 `--target`，避免悄悄装到错误宿主。

内置 Agent 默认目录：

| Agent | 默认 skills 目录 |
| --- | --- |
| `claude` | `~/.claude/skills` |
| `codex` | `${CODEX_HOME}/skills`，未设置时为 `~/.codex/skills` |

::: info 默认软链 vs 复制
默认创建**软链**指向包内的 `skills/`：`yoooclaw update self` 升级 CLI 后，Skill 内容自动跟随新版本，无需重装。`--copy` 得到的是快照，升级后需要重新 `install --force`。
:::

安装后**重启 Agent 会话**即可被发现。之后说一句"看看最近的通知"，Agent 就会按 `yoooclaw-notification-query` 的指引调 `yoooclaw notification` 命令。

## 幂等与排错

- 不确定该装到哪里时，先执行 `yoooclaw skills targets` 看 `detected` 和 `target`。
- 重复执行 `skills install`（软链模式）对已指向同一来源的链接视作「已安装」，不报错、不计入 `skipped`。
- 输出里 `installed` 是本次新装/已就绪的 Skill，`skipped` 列出因已存在而跳过的（附原因），加 `--force` 覆盖。
- 创建软链报 `YOOOCLAW_STORAGE_UNAVAILABLE`（`EPERM`/`EACCES`，多见于 Windows）时，改用 `--copy`。
