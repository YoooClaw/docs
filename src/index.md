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
      link: https://github.com/Yoooclaw/openclaw-plugin

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
