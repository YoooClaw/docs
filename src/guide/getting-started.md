# 快速开始

本文档介绍独立的 `yoooclaw` / `yc` CLI：自带本地守护进程（daemon）、不依赖宿主在线，把手机通知、录音、图片、灯效规则、隧道、监控等能力抽象成 Agent-Native 的命令体系，统一 `--format` 输出与错误契约。

## 包

| 包 | 状态 | 说明 |
| --- | --- | --- |
| [`@yoooclaw/cli`](/cli/) | 可用 | 独立 `yoooclaw` / `yc` CLI：自带 daemon，配置 / 通知 / 录音 / 图片 / 灯效规则 / 隧道 / 监控等全部命令已落地，统一 `--format` 与错误契约，Agent-Native。 |

- 想用独立命令行（自带 daemon、不依赖宿主在线）→ 看[独立 CLI](/cli/)。

## 前置要求

- [Bun](https://bun.sh) `>= 1.3.0`
- Node.js `>= 22.12.0`
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

只构建 CLI 包：

```bash
bun run --filter '@yoooclaw/cli' build
```

## 下一步

- [CLI：概述与安装](/cli/) —— 安装并了解独立命令行的命令体系。
- [CLI：架构与实现逻辑](/cli/architecture) —— daemon 启动流程、StandaloneRuntime 复用插件、profile 与凭据分层。
