# 配置项

插件的配置 schema 定义在 [`packages/phone-notifications/openclaw.plugin.json`](https://github.com/Yoooclaw/openclaw-plugin/blob/master/packages/phone-notifications/openclaw.plugin.json)。

## 常用配置

| 配置 | 说明 |
| --- | --- |
| `retentionDays` | 通知数据保留天数；不设置则永久保存。 |
| `ignoredApps` | 要忽略的 app 包名列表。 |
| `relay.heartbeatSec` | 插件与 Relay 的心跳间隔。 |
| `relay.reconnectBackoffMs` | Relay 重连退避时间。 |
| `autoUpdate.enabled` | 是否启用插件自动更新检查。 |
| `autoUpdate.checkIntervalHours` | 自动更新检查间隔。 |
| `autoUpdate.channel` | 更新频道，支持 `latest` 和 `beta`。 |
| `asr.mode` | 录音转写方式，支持 `api`、`local`、`yoooclaw`。 |
| `asr.api.*` | 云端 ASR 参数。 |
| `asr.local.*` | 本地 Whisper 参数。 |

## 设置示例（OpenClaw）

```bash
openclaw config set plugins.entries.phone-notifications.config.retentionDays 30
openclaw config set plugins.entries.phone-notifications.config.ignoredApps '["com.android.systemui"]'
```
