# @yoooclaw/docs

yoooclaw 文档站，基于 [VitePress](https://vitepress.dev) 把项目文档构建为静态页面。

> 当前为脚手架占位，文档内容后续补充。

## 目录结构

```
packages/docs/
├── package.json
├── tsconfig.json
└── src/                      # VitePress 源目录（srcDir）
    ├── .vitepress/
    │   └── config.ts         # 站点配置
    ├── index.md              # 首页
    └── guide/
        └── getting-started.md
```

## 常用命令

在仓库根目录执行：

```bash
# 开发预览（默认 http://localhost:5173）
bun run --filter '@yoooclaw/docs' dev

# 构建静态页面 -> src/.vitepress/dist
bun run --filter '@yoooclaw/docs' build

# 本地预览构建产物
bun run --filter '@yoooclaw/docs' preview

# 类型检查
bun run --filter '@yoooclaw/docs' typecheck
```

也可进入本包目录后直接使用 `bun run dev` 等脚本。

## 部署（Cloudflare Pages）

站点部署在 Cloudflare Pages 项目 **developer-yoooclaw**（账号 `yoooclaw.ai` 所在账号），
自定义域 **developer.yoooclaw.ai**。

通过 Cloudflare Pages 的 Git 集成自动构建部署，面板（Settings → Builds & deployments →
Connect to Git）配置如下：

| 项 | 值 |
| --- | --- |
| Production branch | `master` |
| Root directory | `/`（仓库根，保证 bun workspace 依赖可解析） |
| Build command | `bun install && bun run --filter '@yoooclaw/docs' build` |
| Build output directory | `packages/docs/src/.vitepress/dist` |
| Build watch paths（Include） | `packages/docs/*`（仅文档变更才触发构建） |

> 自定义域的 DNS：在 `yoooclaw.ai` 区添加 `CNAME developer → developer-yoooclaw.pages.dev`（Proxied）。

### 手动部署（当前方式）

构建 + 上传到 Cloudflare Pages，一条命令搞定（已固定项目名与账号）：

```bash
bun run --filter '@yoooclaw/docs' deploy
# 或进入 packages/docs 后：bun run deploy
```

前置条件：本机已登录 `wrangler`（`wrangler login`），且账号包含 `yoooclaw.ai`。
脚本会先 `vitepress build`，再 `wrangler pages deploy` 到 `developer-yoooclaw`。
