# Handoff — 2026-08-16

## State
- [ ] Phase 5 部署 — 1/2 任务 — next: `wrangler d1 create mumble-db` + Cloudflare secrets + `wrangler deploy`
- 功能全部完成（Phase 1-4 + 多项迭代），代码已全部 commit（工作树干净）

## Pickup commands
- resume → /pickup

## Notes
- 本地服务已停止（`npx wrangler dev --local --port 8787` 重启即可）
- 登录：邮箱免密 or 昵称+密码；注册需管理员审核
- 管理员：`wrangler.toml [vars]` ADMIN_EMAIL/ADMIN_PASSWORD（部署前改 Cloudflare secrets）
- 嵌入模式：`/embed`（非 `/embed.html`，307 重定向）；iframe + postMessage 高度自适应
- 已知陷阱：
  - marked CDN 是 v18，renderer 用 token 对象 API（非 (href,title,text)）
  - 前端渲染勿用 form 嵌套 form（浏览器丢弃内层 → onsubmit 失效，曾致登录 bug）
  - 编辑/删除按钮勿把 content 内联进 onclick（data-id + findPost 方案）
- 用户偏好：极简、语义化标签、无圆角阴影、CSS 分离（style/embed + custom 覆盖）
