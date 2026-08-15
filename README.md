# 说说 (Mumble)

极简云端留言板。前端原生 HTML/CSS/JS，后端 Cloudflare Workers + D1，零框架零依赖。

## 本地运行

```bash
npx wrangler dev --local
```

打开 http://localhost:8787 — 独立页。
嵌入模式：http://localhost:8787/embed （iframe 引用用 `/embed`）。

## 配置

**前端配置** — `public/config.js`：站点标题、每页条数等。改完刷新页面生效。

**后端配置** — `wrangler.toml` 的 `[vars]`：`ADMIN_EMAIL`（管理员邮箱）、`ADMIN_PASSWORD`（管理员密码）、`SESSION_SECRET`（会话密钥）。生产部署改为 Cloudflare Dashboard 环境变量，勿用默认值。

**自定义样式**：
- 独立页：`public/static/css/custom.css`（覆盖 style.css）
- 嵌入页：`public/static/css/custom-embed.css`（覆盖 embed.css）

## 使用流程

1. 注册 → 待审核
2. 管理员登录 → 点"审核" → 通过
3. 通过后即可发帖 / 回复
4. 编辑 / 删除仅管理员

## 嵌入 Hugo 博客

```html
<iframe src="https://你的域名/embed" style="width:100%;height:600px;border:0"></iframe>
```

## 部署

```bash
npx wrangler d1 create mumble-db      # 建生产库，得到 database_id 填入 wrangler.toml
npx wrangler deploy
```
