# SPEC

## Goal

"说说/留言板"：用户发表短文本（Markdown），时间线倒序展示，一层引用回复，独立页 + 嵌入双模式。带邮箱+密码鉴权：用户注册需管理员审核后才能发帖，仅管理员可删/改。前端原生、后端 Cloudflare（Workers + D1）。

## What We're Building

- 发表说说（Markdown），顶部输入框
- 时间线倒序（新在上）+ 加载更多
- 一层引用回复
- 图片 + LaTeX（KaTeX 按需）
- 双模式：独立页 + 嵌入（iframe），两套分离 CSS
- 作者字段（每帖显示作者名）
- 邮箱+密码登录/注册
- 注册后待管理员审核，通过才可发帖
- 编辑/删除（仅管理员）

## Decisions

| Decision | Choice | Rationale | Date |
|---|---|---|---|
| 前端 | 原生 HTML/CSS/JS + `marked`(CDN)，原生 CSS 零框架 | 无框架，最简 | 2026-08 |
| 后端 | Cloudflare Workers 单文件，`if` 链路由，零依赖 | 无服务器，无需装包 | 2026-08 |
| 存储 | D1 两表，启动自动建表 | 免迁移流程 | 2026-08 |
| 排序 | 倒序（新在上） | 微博/说说风格 | 2026-08 |
| 回复 | 一层 `parent_id` | 查询简单 | 2026-08 |
| 嵌入 | iframe，`style.css`/`embed.css` 分离 | 天然隔离，可各自改 | 2026-08 |
| 鉴权 | 邮箱+密码，PBKDF2 hash，HMAC 签名 cookie | Workers 原生 crypto，无库 | 2026-08 |
| 权限 | 注册→管理员审核→可发帖；删/改仅管理员 | 用户要求 | 2026-08 |
| LaTeX | KaTeX（按需） | 轻量 | 2026-08 |
| 分页 | cursor 式加载更多，每页 20 | 无 total 查询，最简 | 2026-08 |
