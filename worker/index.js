// 极简说说 — Cloudflare Worker 单文件
// 零依赖：if 链路由 + 启动自动建表

// ---------- 密码 hash (PBKDF2-SHA256, Workers 原生 crypto) ----------
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  const hex = (u) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex(salt)}:${hex(bits)}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  return (await hashPassword(password, salt)) === stored;
}

// ---------- 自动建表 + seed 管理员 ----------
const USERS_TABLE = `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

async function initializeDatabase(env) {
  const batch = [
    env.DB.prepare(USERS_TABLE),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      parent_id INTEGER,
      author_id INTEGER,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES posts(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id)`),
  ];
  await env.DB.batch(batch);

  // 迁移：email 从 NOT NULL → 可空（email 选填），保留已有数据
  const cols = await env.DB.prepare('PRAGMA table_info(users)').all();
  const emailCol = cols.results.find((c) => c.name === 'email');
  if (emailCol && emailCol.notnull === 1) {
    await env.DB.batch([
      env.DB.prepare('ALTER TABLE users RENAME TO users_old'),
      env.DB.prepare(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        approved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role, approved, created_at) SELECT id, email, password_hash, name, role, approved, created_at FROM users_old'),
      env.DB.prepare('DROP TABLE users_old'),
    ]);
  }

  // seed 管理员（仅当无 admin 时）
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
    if (existing.results.length === 0) {
      const hash = await hashPassword(env.ADMIN_PASSWORD);
      await env.DB.prepare(`INSERT INTO users (email, password_hash, name, role, approved) VALUES (?, ?, '管理员', 'admin', 1)`)
        .bind(env.ADMIN_EMAIL, hash).run();
    }
  }
}

// ---------- 会话 (HMAC 签名 cookie, 无状态) ----------
const SESSION_COOKIE = 'ss_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 天

async function sign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verify(token, secret) {
  if (!token || !token.includes('.')) return null;
  const data = token.slice(0, token.lastIndexOf('.')); // data 自身含点，取最后一个点后的签名
  return (await sign(data, secret)) === token ? data : null;
}

async function createSessionToken(userId, env) {
  return sign(`${userId}.${Date.now() + SESSION_DURATION}`, env.SESSION_SECRET);
}

async function verifySession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(SESSION_COOKIE + '='));
  if (!m) return null;
  const data = await verify(m.slice(SESSION_COOKIE.length + 1), env.SESSION_SECRET);
  if (!data) return null;
  const [userId, expiry] = data.split('.');
  if (Date.now() > Number(expiry)) return null;
  return (await env.DB.prepare('SELECT id, email, name, role, approved FROM users WHERE id = ?').bind(userId).first()) || null;
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`;
}

const clearSessionCookie = () => `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;

// ---------- 入口 ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      await initializeDatabase(env); // 幂等，每次请求执行足够简单

      if (path === '/api/auth/register' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body?.name?.trim() || !body?.password) return json({ success: false, error: '昵称/密码必填' }, 400);
        if (body.email && !body.email.includes('@')) return json({ success: false, error: '邮箱格式错误' }, 400);
        if (body.password.length < 6) return json({ success: false, error: '密码至少 6 位' }, 400);
        if (body.email) {
          const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first();
          if (existing) return json({ success: false, error: '邮箱已注册' }, 409);
        }
        const hash = await hashPassword(body.password);
        const result = await env.DB.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
          .bind(body.email || null, hash, body.name.trim()).run();
        return json({ success: true, message: '注册成功，等待管理员审核', data: { id: result.meta.last_row_id } });
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body?.email || !body?.password) return json({ success: false, error: 'email/password 必填' }, 400);
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first();
        if (!user || !(await verifyPassword(body.password, user.password_hash))) return json({ success: false, error: '邮箱或密码错误' }, 401);
        const token = await createSessionToken(user.id, env);
        return json({ success: true, message: '登录成功', data: { id: user.id, name: user.name, role: user.role, approved: user.approved } }, 200, { 'Set-Cookie': sessionCookie(token) });
      }

      if (path === '/api/auth/logout' && request.method === 'POST') {
        return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
      }

      if (path === '/api/auth/me' && request.method === 'GET') {
        const user = await verifySession(request, env);
        if (!user) return json({ success: false, error: '未登录' }, 401);
        return json({ success: true, data: user });
      }

      // ---------- 帖子 ----------
      if (path === '/api/posts' && request.method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
        const cursor = Number(url.searchParams.get('cursor')) || 0;
        const rows = await env.DB.prepare(
          `SELECT id, content, parent_id, author_id, author_name, created_at, updated_at
           FROM posts WHERE parent_id IS NULL AND (? = 0 OR id < ?)
           ORDER BY id DESC LIMIT ?`
        ).bind(cursor, cursor, limit + 1).all();
        const roots = rows.results.slice(0, limit);
        const next_cursor = rows.results.length > limit ? rows.results[limit - 1].id : null;
        if (roots.length) {
          const ids = roots.map((r) => r.id);
          const ph = ids.map(() => '?').join(',');
          const replies = await env.DB.prepare(
            `SELECT id, content, parent_id, author_id, author_name, created_at FROM posts
             WHERE parent_id IN (${ph}) ORDER BY parent_id, id`
          ).bind(...ids).all();
          const byParent = {};
          for (const r of replies.results) (byParent[r.parent_id] ||= []).push(r);
          for (const root of roots) root.replies = byParent[root.id] || [];
        }
        return json({ success: true, data: roots, next_cursor });
      }

      if (path === '/api/posts' && request.method === 'POST') {
        const user = await verifySession(request, env);
        if (!user) return json({ success: false, error: '请先登录' }, 401);
        if (user.approved !== 1) return json({ success: false, error: '账号待管理员审核，暂不能发帖' }, 403);
        const body = await request.json().catch(() => null);
        if (!body?.content?.trim()) return json({ success: false, error: '内容不能为空' }, 400);
        const parent_id = body.parent_id ? Number(body.parent_id) : null;
        if (parent_id) {
          const parent = await env.DB.prepare('SELECT id FROM posts WHERE id = ? AND parent_id IS NULL').bind(parent_id).first();
          if (!parent) return json({ success: false, error: '回复目标不存在' }, 404);
        }
        const result = await env.DB.prepare('INSERT INTO posts (content, parent_id, author_id, author_name) VALUES (?, ?, ?, ?)')
          .bind(body.content.trim(), parent_id, user.id, user.name).run();
        return json({ success: true, message: '发布成功', data: { id: result.meta.last_row_id } });
      }

      // ---------- 管理员：编辑/删除/审核 ----------
      if ((path.startsWith('/api/posts/') && (request.method === 'PUT' || request.method === 'DELETE')) ||
          (path.startsWith('/api/admin/') && request.method !== 'OPTIONS')) {
        const user = await verifySession(request, env);
        if (!user || user.role !== 'admin') return json({ success: false, error: '需要管理员权限' }, 403);

        if (path.startsWith('/api/posts/')) {
          const id = Number(path.split('/').pop());
          if (request.method === 'PUT') {
            const body = await request.json().catch(() => null);
            if (!body?.content?.trim()) return json({ success: false, error: '内容不能为空' }, 400);
            await env.DB.prepare("UPDATE posts SET content = ?, updated_at = datetime('now') WHERE id = ?")
              .bind(body.content.trim(), id).run();
            return json({ success: true, message: '已更新' });
          }
          await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run(); // 回复级联删
          return json({ success: true, message: '已删除' });
        }

        if (path === '/api/admin/users' && request.method === 'GET') {
          const filter = url.searchParams.get('approved');
          const rows = await env.DB.prepare(
            'SELECT id, email, name, role, approved, created_at FROM users' + (filter ? ' WHERE approved = ?' : '')
          ).bind(...(filter ? [Number(filter)] : [])).all();
          return json({ success: true, data: rows.results });
        }

        if (path.startsWith('/api/admin/users/')) {
          const id = Number(path.split('/')[4]);
          const action = path.split('/')[5] || ''; // approve | unapprove | set-admin | remove-admin
          const sql = {
            approve: "UPDATE users SET approved = 1 WHERE id = ?",
            unapprove: "UPDATE users SET approved = 0 WHERE id = ?",
            'set-admin': "UPDATE users SET role = 'admin', approved = 1 WHERE id = ?",
            'remove-admin': "UPDATE users SET role = 'user' WHERE id = ?",
          }[action];
          if (!sql) return json({ success: false, error: '未知操作' }, 400);
          if ((action === 'set-admin' || action === 'remove-admin') && id === user.id) {
            return json({ success: false, error: '不能操作自己' }, 400);
          }
          await env.DB.prepare(sql).bind(id).run();
          return json({ success: true, message: '已更新' });
        }
      }

      return json({ success: false, error: 'Not found' }, 404);
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }
  },
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}
