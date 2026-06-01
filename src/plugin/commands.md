# 命令参考

以下示例以 OpenClaw 全局 CLI 为例。QClaw 下请把 `openclaw` 替换为 QClaw 提供的 wrapper。

## 认证

```bash
openclaw ntf auth set-api-key "ock_xxx"
openclaw ntf auth show
openclaw ntf auth clear
```

## 通知查询

```bash
openclaw ntf search
openclaw ntf search --app wechat --from 2026-03-01T00:00:00+08:00 --to 2026-03-09T23:59:59+08:00
openclaw ntf search --keyword "开会" --limit 20
openclaw ntf search --sender "张三"
openclaw ntf summary --limit 700
openclaw ntf stats --dim app --from 2026-03-01
```

## 通知同步

```bash
openclaw ntf sync scan
openclaw ntf sync fetch --date 2026-03-09
openclaw ntf sync commit --date 2026-03-09
```

## 通知监控

```bash
openclaw ntf monitor create boss-alert \
  --description "监控重点微信消息" \
  --match-rules '{"appName":"wechat","senderKeywords":["张总"]}' \
  --schedule "*/30 * * * *"

openclaw ntf monitor list
openclaw ntf monitor show boss-alert
openclaw ntf monitor enable boss-alert
openclaw ntf monitor disable boss-alert
openclaw ntf monitor delete boss-alert --yes
```

## 录音

```bash
openclaw ntf rec list
openclaw ntf rec status <recording-id>
openclaw ntf rec storage-path
openclaw ntf rec setup
```

## 灯效

```bash
openclaw ntf light setup
openclaw ntf light send \
  --segments '[{"mode":"wave","duration_s":4,"brightness":192,"color":{"r":255,"g":0,"b":0}}]'
```

## 诊断与运维

```bash
openclaw ntf doctor
openclaw ntf storage-path
openclaw ntf tunnel-status
openclaw ntf log --keyword error
openclaw ntf update
```
