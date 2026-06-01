# 工作方式与存储

## 两种通知接入模式

`@yoooclaw/phone-notifications` 支持两种通知接入模式：

1. **Gateway Native**：手机端通过宿主 gateway 调用 `notifications.push`，插件通过 `registerGatewayMethod` 接收数据。
2. **HTTP 备选**：宿主注册 `POST /notifications`，请求通过 gateway 鉴权后写入本地存储。

### Gateway Native 示例

```json
{
  "type": "req",
  "id": "n_abc",
  "method": "notifications.push",
  "params": {
    "items": [
      {
        "id": "n_001",
        "app": "WeChat",
        "title": "张三",
        "body": "在吗？",
        "timestamp": "2026-03-02T08:30:00+08:00",
        "category": "message",
        "metadata": { "chatId": "c1" }
      }
    ]
  }
}
```

### HTTP 示例

```http
POST /notifications
Authorization: Bearer <gateway-token>
Content-Type: application/json
```

```json
{
  "notifications": [
    {
      "id": "n_001",
      "app": "SMS",
      "title": "京东快递",
      "body": "包裹已发出",
      "timestamp": "2026-03-02T08:30:00+08:00"
    }
  ]
}
```

## 通知存储

通知按日期写入本地 JSON 文件：

```text
<workspace>/notifications/
├── 2026-03-02.json
├── 2026-03-03.json
└── 2026-03-04.json
```

如果 `workspaceDir` 不可用或不可写，插件会回退到宿主状态目录下的 `plugins/phone-notifications/notifications`。同一天内会按通知 `id` 去重；如果设置了 `retentionDays`，插件会按天清理过期文件。

## 录音存储

录音数据默认写入：

```text
<stateDir>/plugins/phone-notifications/recordings/
├── audio/
├── transcripts/
└── index.json
```
