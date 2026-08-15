# DESIGN

## 架构总览

```
浏览器（网页） → Cloudflare Worker（1 个 JS 文件） → D1（SQLite 数据库）
```

- 前端：纯 HTML/CSS/JS，零框架，CDN 引入 `marked`（Markdown）与 KaTeX（公式）。
- 后端：一个 Worker，`if (path === ...)` 链式路由，零框架零依赖。
- 存储：两张表（`users` + `posts`），启动时自动建表（`CREATE TABLE IF NOT EXISTS`），无迁移流程。
- CSS：原生 CSS，无框架无预处理器，独立页与嵌入两套文件。

## 数据模型

### `users` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK | 自增 |
| `email` | TEXT UNIQUE | 登录邮箱 |
| `password_hash` | TEXT | 密码 hash（PBKDF2，含 salt） |
| `name` | TEXT | 作者名/昵称 |
| `role` | TEXT | `admin` / `user` |
| `approved` | INTEGER | 0=待审核，1=已通过（admin 恒 1） |
| `created_at` | DATETIME | |

### `posts` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK | 自增 |
| `content` | TEXT | 内容（Markdown） |
| `parent_id` | INTEGER | 回复目标，`NULL`=原创 |
| `author_id` | INTEGER | 外键 `users.id` |
| `author_name` | TEXT | 冗余存昵称（免 join） |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | 编辑时间 |

- 一层回复：对回复的回复不进时间线。
- 删帖级联删回复（`ON DELETE CASCADE`）。

## 鉴权

- 密码：PBKDF2-SHA256 + 随机 salt（Workers 原生 `crypto.subtle`，无第三方库）。
- 会话：登录成功 → HMAC-SHA256 签名的 cookie（含 user_id + 过期时间），无状态、不建 sessions 表。
- 管理员：初始由 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量 seed 进 `users`（role=admin）。

### 权限规则

| 操作 | 要求 |
|---|---|
| 发帖 / 回复 | 登录 + `approved=1` |
| 编辑 / 删除 | 仅 `role=admin` |
| 审核用户 | 仅 `role=admin` |
| 浏览列表 | 无限制 |

## 分页

- cursor 式：`GET /api/posts?cursor=<id>&limit=20`，返回 `next_cursor`，无 total 计数查询。
- "加载更多"按钮追加下一页。

## API

### 公开
- `GET /api/posts?cursor=&limit=20` — 倒序列表 + 一层回复 + 作者名

### 鉴权
- `POST /api/auth/register` — 注册（email/password/name）→ `approved=0`
- `POST /api/auth/login` — 登录 → 设 cookie
- `POST /api/auth/logout` — 登出
- `GET /api/auth/me` — 当前用户

### 登录后
- `POST /api/posts` — 发帖/回复

### 仅管理员
- `PUT /api/posts/:id` — 编辑
- `DELETE /api/posts/:id` — 删除
- `GET /api/admin/users?approved=0` — 待审核列表
- `POST /api/admin/users/:id/approve` — 审核通过

## 前端

- 顶部输入框（未登录显示登录/注册入口，登录 + 审核通过才可提交）。
- 时间线倒序，每条显示作者名 + 时间 + Markdown 渲染内容 + 回复。
- "加载更多"按钮追加下一页。
- 管理员登录后：每条显示"编辑/删除"，另有审核面板。
- `marked` 渲染 Markdown，`$...$` 预处理后交 KaTeX（按需）。

## 双模式 + CSS 分离

- `index.html` 独立页（完整骨架）+ `static/css/style.css`。
- `embed.html` 嵌入片段 + `static/css/embed.css`。
- 宿主（Hugo）用 `<iframe src="...">` 引用 → iframe 天然隔离 CSS，不污染宿主。
- 两套 CSS 独立，可各自修改。

## 文件结构

```
/
├── index.html
├── embed.html
├── static/
│   ├── css/style.css
│   ├── css/embed.css
│   └── js/main.js        # 两种模式复用
├── worker/index.js
├── schema.sql
└── wrangler.toml
```
