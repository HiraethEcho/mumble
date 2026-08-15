# PLAN

## Phase 1: 骨架 + 自动建表

- [x] `wrangler.toml`（绑定 D1）
- [x] worker 启动时自动建表（`CREATE TABLE IF NOT EXISTS`：`users` + `posts` + 索引 + seed 管理员）

## Phase 2: 鉴权系统

- [x] 密码 hash（PBKDF2，Workers crypto）+ 会话（HMAC 签名 cookie）
- [x] `register` / `login` / `logout` / `me` 接口
- [x] 管理员 seed（`ADMIN_EMAIL` / `ADMIN_PASSWORD`）

## Phase 3: 帖子 + 权限 API

- [x] `GET /api/posts`（倒序分页 + 一层回复 + 作者）
- [x] `POST /api/posts`（需登录 + 审核通过）
- [x] `PUT` / `DELETE /api/posts/:id`（仅管理员）
- [x] 审核接口（待审核列表 + 通过）

## Phase 4: 前端

- [x] `static/js/main.js`（fetch / 渲染 / 提交 / 加载更多 / 登录注册）
- [x] `index.html` + `style.css`（顶部输入框、作者名、管理员删改按钮）
- [x] `embed.html` + `embed.css`（嵌入片段，含登录/发帖）

## Phase 5: 文档 + 部署

- [ ] `README.md`（开发/部署步骤 + 管理员初始化说明）
- [ ] 生产 D1 迁移 + `wrangler deploy`
