# 快速开始

本文档介绍独立的 `yoooclaw` / `yc` CLI：自带本地守护进程（daemon）、不依赖宿主在线，把手机通知、录音、图片、灯效规则、隧道、监控等能力抽象成 Agent-Native 的命令体系，统一 `--format` 输出与错误契约。

## 包

| 包 | 状态 | 说明 |
| --- | --- | --- |
| [`@yoooclaw/cli`](/cli/) | 可用 | 独立 `yoooclaw` / `yc` CLI：自带 daemon，配置 / 通知 / 录音 / 图片 / 灯效规则 / 隧道 / 监控等全部命令已落地，统一 `--format` 与错误契约，Agent-Native。 |

- 想用独立命令行（自带 daemon、不依赖宿主在线）→ 看[独立 CLI](/cli/)。

## 前置要求

- 通过 npm 安装：Node.js `>= 18`（只用于启动薄 launcher，实际执行 Go 原生二进制）
- 通过 `install.sh` / GitHub Release 直装：无需 Node
- 从源码构建：Go toolchain；本机当前验证使用 Go `1.26.4`
- ASR：当前 Go beta 只支持云端 `api` / model-proxy 模式，不需要本地 Whisper
- 平台：npm 支持 `darwin/linux` 的 `x64+arm64` 与 `win32-x64`；原生直装支持 `darwin/linux` 的 `x64+arm64`。Windows 上凭据落明文、daemon 经 HTTP 优雅停止，详见 [CLI 概述](/cli/)。

安装示例：

```bash
npm i -g @yoooclaw/cli
yoooclaw --help
```

## 从源码构建

```bash
git clone https://github.com/YoooClaw/cli.git
cd cli

go test ./...
go vet ./...
scripts/build-go.sh --current
dist-native/yoooclaw-darwin-arm64 --help
```

## 下一步

- [CLI：概述与安装](/cli/) —— 安装并了解独立命令行的命令体系。
- [CLI：架构与实现逻辑](/cli/architecture) —— Go daemon 启动流程、Relay 分发、profile 与凭据分层。
