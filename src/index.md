---
layout: home

hero:
  name: yoooclaw
  text: 手机、硬件与本地 Agent 的连接器
  tagline: 手机通知 / 录音同步插件，以及 Agent-Native 的独立 yoooclaw CLI
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 手机通知插件
      link: /plugin/
    - theme: alt
      text: GitHub
      link: https://github.com/Yoooclaw/openclaw-plugin

features:
  - title: 手机通知同步
    details: 手机端把通知推给 OpenClaw / QClaw 宿主，插件本地落盘、查询、摘要、统计，并按日期同步给记忆系统。
    link: /plugin/
    linkText: 了解插件
  - title: 录音与灯效
    details: 长录音下载、ASR 转写稿落盘与状态事件流；硬件灯效控制与规则评估，通知触发后异步执行。
    link: /plugin/commands
    linkText: 命令参考
  - title: 独立 yoooclaw CLI
    details: 自带本地守护进程、不依赖宿主在线的 Agent-Native 命令体系，统一 --format 输出与错误契约。
    link: /cli/
    linkText: 了解 CLI
  - title: 插件架构与实现
    details: 通知接入两条通路、Relay 隧道、灯效规则事件驱动评估、录音状态机怎么串起来。
    link: /plugin/architecture
    linkText: 看插件实现
  - title: CLI 架构与实现
    details: daemon 启动流程、StandaloneRuntime 怎么免改复用插件代码、RelayDispatcher、profile / 凭据分层与端口顺延。
    link: /cli/architecture
    linkText: 看 CLI 实现
  - title: Agent Skill
    details: 内置三个 Skill（查通知 / 建灯效规则 / 排查隧道），软链到 Claude Code / Codex 后让 Agent 自己驱动 CLI。
    link: /cli/skills
    linkText: 了解 Skill
---
