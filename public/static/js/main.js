// 极简说说 — 前端核心（独立页与嵌入 iframe 复用）
const state = { user: null, posts: [], nextCursor: 0, replyTo: null, authMode: 'login' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error) alert(data.error);
  return data;
}

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? String(s).slice(0, 16) : d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
};

// Markdown + LaTeX 渲染（marked v18 token API；极简 XSS 防护：忽略 raw HTML，拦截 javascript: 链接）
function renderContent(text) {
  const math = [];
  let t = String(text);
  if (typeof katex !== 'undefined') {
    t = t
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, e) => { math.push(katex.renderToString(e, { displayMode: true })); return '\u0001M' + (math.length - 1) + '\u0001'; })
      .replace(/\$([^$\n]+?)\$/g, (_, e) => { math.push(katex.renderToString(e)); return '\u0001M' + (math.length - 1) + '\u0001'; });
  }
  const renderer = new marked.Renderer();
  renderer.html = (token) => esc(typeof token === 'string' ? token : token.raw ?? '');
  renderer.link = (token) => {
    const href = String(token.href ?? '');
    if (/^javascript:/i.test(href)) return token.text ?? '';
    return `<a href="${esc(href)}"${token.title ? ` title="${esc(token.title)}"` : ''} target="_blank" rel="noopener">${token.text ?? ''}</a>`;
  };
  // callout 支持：> [!note] 标题行
  renderer.blockquote = function (token) {
    const html = this.parser.parse(token.tokens);
    const m = html.match(/^\s*<p>\[!([^\]]+)\]([\s\S]*?)<\/p>/);
    if (!m) return `<blockquote>${html}</blockquote>`;
    return `<blockquote class="callout callout-${esc(m[1].toLowerCase())}"><p class="callout-title">${esc(m[1])}</p>${m[2].trim() ? `<p>${m[2].trim()}</p>` : ''}</blockquote>`;
  };
  return marked.parse(t, { gfm: true, breaks: true, renderer }).replace(/\u0001M(\d+)\u0001/g, (_, i) => math[i]);
}

async function initApp() {
  const cfg = window.SITE_CONFIG || {};
  if (cfg.title) document.title = cfg.title;
  state.user = (await api('/api/auth/me').catch(() => null)).data || null;
  await loadPosts(true);
}

async function loadPosts(reset = false) {
  if (reset) { state.posts = []; state.nextCursor = 0; }
  const r = await api(`/api/posts?cursor=${state.nextCursor}&limit=${(window.SITE_CONFIG || {}).limit || 20}`);
  if (r.success) {
    state.posts = reset ? r.data : state.posts.concat(r.data);
    state.nextCursor = r.next_cursor || 0;
  }
  render();
}

function render() {
  document.getElementById('auth-area') && (document.getElementById('auth-area').innerHTML = authHTML());
  document.getElementById('composer').innerHTML = composerHTML();
  document.getElementById('list').innerHTML = state.posts.map(postHTML).join('');
  document.getElementById('more').innerHTML = state.nextCursor ? '<button onclick="loadPosts()">加载更多</button>' : '';
  document.getElementById('admin-area').style.display = state.user?.role === 'admin' ? '' : 'none';
}

function authHTML() {
  if (state.user) {
    const badge = state.user.role === 'admin' ? '管理员' : state.user.approved ? '已通过' : '待审核';
    const adminBtn = state.user.role === 'admin' ? `<button onclick="showAdmin()">审核</button>` : '';
    return `<div class="auth"><span class="who">${esc(state.user.name)} · ${badge}</span>${adminBtn}<button onclick="doLogout()">退出</button></div>`;
  }
  if (state.authMode === 'login') {
    return `<div class="auth">
      <form class="auth-form" onsubmit="doLogin(event)">
        <input id="lg-ident" placeholder="邮箱或昵称" required>
        <input id="lg-pass" type="password" placeholder="密码（邮箱登录可不填）">
        <button class="btn-primary" type="submit">登录</button>
      </form>
      <button onclick="state.authMode='reg';render()">注册</button>
      <p class="tip">填邮箱可直接登录（免密码）；填昵称需输入密码</p>
    </div>`;
  }
  return `<div class="auth">
    <form class="auth-form" onsubmit="doRegister(event)">
      <input id="rg-name" placeholder="昵称（必填，唯一）" required>
      <input id="rg-email" type="email" placeholder="邮箱（选填，可作为登录凭据）">
      <input id="rg-pass" type="password" placeholder="密码（至少6位；填了邮箱则登录时可不填）" required>
      <button class="btn-primary" type="submit">注册</button>
    </form>
    <button onclick="state.authMode='login';render()">登录</button>
    <p class="tip">注册后需管理员审核通过才能发言；昵称+密码 或 邮箱 均可登录</p>
  </div>`;
}

function composerHTML() {
  if (!state.user) return '<p class="tip">登录后可发言</p>';
  if (state.user.approved !== 1) return '<p class="tip">账号待管理员审核，通过后可发言</p>';
  return `<form class="composer" onsubmit="submitPost(event)">
    <textarea id="content" placeholder="说点什么…支持 Markdown 与 $公式$"></textarea>
    ${state.replyTo ? `<div class="reply-hint">正在回复 #${state.replyTo.id} ${esc(state.replyTo.name)} <span class="link" onclick="cancelReply()">取消</span></div>` : ''}
    <div class="actions"><button class="btn-primary" type="submit">发布</button></div>
  </form>`;
}

const adminBtns = (p) => state.user?.role === 'admin'
  ? `<button data-id="${p.id}" onclick="editPost(this)">编辑</button><button data-id="${p.id}" onclick="deletePost(this)">删除</button>` : '';

function findPost(id) {
  for (const p of state.posts) {
    if (p.id === id) return p;
    const r = p.replies.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

function postHTML(p) {
  const replies = p.replies.map((r) => `<li><article class="post">
    <header><span class="author">${esc(r.author_name)}</span><time>${fmtDate(r.created_at)}</time>${adminBtns(r)}</header>
    <div class="content">${renderContent(r.content)}</div>
  </article></li>`).join('');
  return `<article class="post">
    <header><span class="author">${esc(p.author_name)}</span><time>${fmtDate(p.created_at)}</time>${adminBtns(p)}</header>
    <div class="content">${renderContent(p.content)}</div>
    ${replies ? `<ul class="replies">${replies}</ul>` : ''}
    ${state.user?.approved === 1 ? `<button onclick="replyTo(${p.id},'${esc(p.author_name)}')">回复</button>` : ''}
  </article>`;
}

async function doLogin(e) {
  e.preventDefault();
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ ident: document.getElementById('lg-ident').value, password: document.getElementById('lg-pass').value }) });
  if (r.success) { state.user = r.data; await loadPosts(true); }
}

async function doRegister(e) {
  e.preventDefault();
  const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('rg-name').value, email: document.getElementById('rg-email').value, password: document.getElementById('rg-pass').value }) });
  if (r.success) { state.authMode = 'login'; render(); alert('注册成功，等待管理员审核'); }
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  await loadPosts(true);
}

async function submitPost(e) {
  e.preventDefault();
  const content = document.getElementById('content').value.trim();
  if (!content) return;
  const r = await api('/api/posts', { method: 'POST', body: JSON.stringify({ content, parent_id: state.replyTo?.id || null }) });
  if (r.success) { state.replyTo = null; await loadPosts(true); }
}

function replyTo(id, name) { state.replyTo = { id, name }; render(); document.getElementById('content')?.focus(); }
function cancelReply() { state.replyTo = null; render(); }

async function editPost(btn) {
  const post = findPost(Number(btn.dataset.id));
  if (!post) return;
  const next = prompt('编辑内容', post.content);
  if (next === null) return;
  const r = await api(`/api/posts/${post.id}`, { method: 'PUT', body: JSON.stringify({ content: next }) });
  if (r.success) await loadPosts(true);
}

async function deletePost(btn) {
  const id = Number(btn.dataset.id);
  if (!confirm('确认删除该条及回复？')) return;
  const r = await api(`/api/posts/${id}`, { method: 'DELETE' });
  if (r.success) await loadPosts(true);
}

async function showAdmin() {
  const r = await api('/api/admin/users');
  if (!r.success) return;
  const el = document.getElementById('admin-area');
  el.innerHTML = `<h2>用户管理</h2>` + (r.data.length
    ? `<ul class="userlist">` + r.data.map((u) => `<li>
        <span class="author">${esc(u.name)}</span>
        <span class="who">${u.role === 'admin' ? '管理员' : u.approved ? '已通过' : '待审核'}</span>
        <span class="who">${esc(u.email)}</span>
        <span class="who">${fmtDate(u.created_at)}</span>
        <span class="actions">
          ${u.approved ? `<button onclick="adminUser(${u.id},'unapprove')">取消通过</button>` : `<button onclick="adminUser(${u.id},'approve')">通过</button>`}
          ${u.role === 'admin' ? `<button onclick="adminUser(${u.id},'remove-admin')">取消管理员</button>` : `<button onclick="adminUser(${u.id},'set-admin')">设为管理员</button>`}
        </span>
      </li>`).join('') + `</ul>`
    : '<p class="tip">暂无用户</p>');
}

async function adminUser(id, action) {
  const r = await api(`/api/admin/users/${id}/${action}`, { method: 'POST' });
  if (r.success) showAdmin();
}
