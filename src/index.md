---
layout: home

hero:
  name: yoooclaw
  text: Agent-Native 的独立 CLI
  tagline: 自带本地守护进程、不依赖宿主在线的 yoooclaw / yc 命令体系
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 了解 CLI
      link: /cli/
    - theme: alt
      text: GitHub
      link: https://github.com/YoooClaw/cli

features:
  - title: 独立 yoooclaw CLI
    details: 自带本地守护进程、不依赖宿主在线的 Agent-Native 命令体系，统一 --format 输出与错误契约。
    link: /cli/
    linkText: 了解 CLI
  - title: CLI 架构与实现
    details: daemon 启动流程、StandaloneRuntime 怎么免改复用底层代码、RelayDispatcher、profile / 凭据分层与端口顺延。
    link: /cli/architecture
    linkText: 看 CLI 实现
  - title: 命令体系与输出
    details: 配置 / 通知 / 录音 / 图片 / 灯效规则 / 隧道 / 监控等命令，统一 --format 输出与错误契约。
    link: /cli/usage
    linkText: 命令体系
  - title: 命令参考
    details: 全部子命令、参数与示例的完整参考。
    link: /cli/commands
    linkText: 命令参考
  - title: 多 api-key 设计
    details: 多 api-key 的分层、选择与回退策略。
    link: /cli/multi-api-key
    linkText: 了解设计
  - title: Agent Skill
    details: 内置三个 Skill（查通知 / 建灯效规则 / 排查隧道），软链到 Claude Code / Codex 后让 Agent 自己驱动 CLI。
    link: /cli/skills
    linkText: 了解 Skill
---

## 先看这里：这是什么、不是什么

最近不少同学装完这个 CLI 后问「为什么 App 里不能跟 Hermes 对话了」。这里统一解释一下，**安装前请先确认它符合你的预期**：

::: warning 这是面向开发者的独立命令行工具，不是聊天 App
`yoooclaw` / `yc` 是一套**独立的命令行（CLI）**，自带本地守护进程、不依赖 openclaw 客户端在线。它把通知、录音、图片、灯效规则、隧道、监控等能力抽象成命令，**交给 Agent（Claude Code / Codex 等）或你自己在终端里驱动**——它本身没有聊天界面。
:::

- **建议有编程基础的同学使用。** 需要在终端里敲命令、理解 daemon / 配置 / 凭据等概念，并通常配合 Agent 使用。完全没有命令行经验的话，上手成本会比较高。
- **与 App 插件互斥，二选一。** 独立 CLI 与 openclaw 客户端插件是两条不同的运行路径，**不要同时启用**，否则会相互抢占。装了独立 CLI 就走 CLI 这条路。
- **不支持 chat / 跟 Hermes 对话。** 这是它和 App 最大的区别：CLI **没有聊天功能**，不能在 App 里跟 Hermes 对话。如果你的核心诉求是「打开 App 跟 Hermes 聊天」，那你需要的是 **openclaw / Hermes 插件**，而不是这个 CLI。

想清楚后再开始：[快速开始](/guide/getting-started) · [了解独立 CLI](/cli/)
