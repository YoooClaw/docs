# 快速开始

本仓库是 YoooClaw / OpenClaw 插件与 CLI 的 monorepo，核心目标是把**手机、硬件与本地 Agent** 连接起来：手机端把通知、录音等数据推给 OpenClaw / QClaw 宿主或独立 daemon，本地侧负责落盘、查询、同步、规则触发和硬件控制；CLI 则把这些能力抽象成不依赖宿主在线的 Agent-Native 命令体系。

## 两个包

| 包 | 状态 | 说明 |
| --- | --- | --- |
| [`@yoooclaw/phone-notifications`](/plugin/) | 可用 | OpenClaw / QClaw 插件：手机通知、录音、灯效、Relay、插件内 CLI 与技能目录。 |
| [`@yoooclaw/cli`](/cli/) | 可用 | 独立 `yoooclaw` / `yc` CLI：自带 daemon，配置 / 通知 / 录音 / 图片 / 灯效规则 / 隧道 / 监控等全部命令已落地，统一 `--format` 与错误契约，Agent-Native。 |

- 想在 OpenClaw / QClaw 里收手机通知 → 看[手机通知插件](/plugin/)。
- 想用独立命令行（自带 daemon、不依赖宿主在线）→ 看[独立 CLI](/cli/)。

## 前置要求

- [Bun](https://bun.sh) `>= 1.3.0`
- Node.js `>= 22.12.0`
- 使用插件时需要 OpenClaw `>= 2026.3.28`，或兼容 OpenClaw 插件 ABI 的 QClaw 宿主
- 使用本地 Whisper 转写时还需 `whisper-cpp`；处理 OGG/Opus 建议安装 `opus-tools` 或 `ffmpeg`

macOS 本地 ASR 依赖示例：

```bash
brew install whisper-cpp
brew install opus-tools
```

## 从源码构建

```bash
git clone https://github.com/Yoooclaw/openclaw-plugin.git
cd openclaw-plugin

bun install
bun run build
bun run test
bun run typecheck
```

只构建单个包：

```bash
bun run --filter '@yoooclaw/phone-notifications' build
bun run --filter '@yoooclaw/cli' build
```

## 下一步

- [插件：概述与安装](/plugin/) —— 在 OpenClaw / QClaw 中安装并接入手机通知。
- [插件：架构与实现逻辑](/plugin/architecture) —— 通知接入两条通路、Relay 隧道、灯效规则评估、录音状态机。
- [CLI：概述与安装](/cli/) —— 安装并了解独立命令行的命令体系。
- [CLI：架构与实现逻辑](/cli/architecture) —— daemon 启动流程、StandaloneRuntime 复用插件、profile 与凭据分层。
