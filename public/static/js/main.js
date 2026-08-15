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

// Markdown + LaTeX 渲染（含极简 XSS 防护：忽略用户 raw HTML，拦截 javascript: 链接）
function renderContent(text) {
  const math = [];
  let t = String(text);
  if (typeof katex !== 'undefined') {
    t = t
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, e) => { math.push(katex.renderToString(e, { displayMode: true })); return '\u0001M' + (math.length - 1) + '\u0001'; })
      .replace(/\$([^$\n]+?)\$/g, (_, e) => { math.push(katex.renderToString(e)); return '\u0001M' + (math.length - 1) + '\u0001'; });
  }
  const renderer = new marked.Renderer();
  renderer.html = (h) => esc(h);
  renderer.link = (href, title, text) => (href && href.startsWith('javascript:')) ? text : `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener">${text}</a>`;
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
        <input id="lg-email" type="email" placeholder="邮箱" required>
        <input id="lg-pass" type="password" placeholder="密码" required>
        <button class="btn-primary" type="submit">登录</button>
      </form>
      <button onclick="state.authMode='reg';render()">注册</button>
    </div>`;
  }
  return `<div class="auth">
    <form class="auth-form" onsubmit="doRegister(event)">
      <input id="rg-name" placeholder="昵称" required>
      <input id="rg-email" type="email" placeholder="邮箱" required>
      <input id="rg-pass" type="password" placeholder="密码(至少6位)" required>
      <button class="btn-primary" type="submit">注册</button>
    </form>
    <button onclick="state.authMode='login';render()">登录</button>
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
  ? `<button onclick="editPost(${p.id},${JSON.stringify(p.content)})">编辑</button><button onclick="deletePost(${p.id})">删除</button>` : '';

function postHTML(p) {
  const replies = p.replies.map((r) => `<div class="card post">
    <div class="post-head"><span class="author">${esc(r.author_name)}</span><span class="time">${fmtDate(r.created_at)}</span>${adminBtns(r)}</div>
    <div class="content">${renderContent(r.content)}</div>
  </div>`).join('');
  return `<div class="card post">
    <div class="post-head"><span class="author">${esc(p.author_name)}</span><span class="time">${fmtDate(p.created_at)}</span>${adminBtns(p)}</div>
    <div class="content">${renderContent(p.content)}</div>
    ${replies ? `<div class="replies">${replies}</div>` : ''}
    ${state.user?.approved === 1 ? `<button class="reply-btn" onclick="replyTo(${p.id},'${esc(p.author_name)}')">回复</button>` : ''}
  </div>`;
}

async function doLogin(e) {
  e.preventDefault();
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('lg-email').value, password: document.getElementById('lg-pass').value }) });
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

async function editPost(id, content) {
  const next = prompt('编辑内容', content);
  if (next === null) return;
  const r = await api(`/api/posts/${id}`, { method: 'PUT', body: JSON.stringify({ content: next }) });
  if (r.success) await loadPosts(true);
}

async function deletePost(id) {
  if (!confirm('确认删除该条及回复？')) return;
  const r = await api(`/api/posts/${id}`, { method: 'DELETE' });
  if (r.success) await loadPosts(true);
}

async function showAdmin() {
  const r = await api('/api/admin/users?approved=0');
  if (!r.success) return;
  const el = document.getElementById('admin-area');
  el.innerHTML = r.data.length
    ? r.data.map((u) => `<div class="card">${esc(u.name)} ${esc(u.email)} <button onclick="approveUser(${u.id})">通过</button></div>`).join('')
    : '<p class="tip">暂无待审核用户</p>';
}

async function approveUser(id) {
  const r = await api(`/api/admin/users/${id}/approve`, { method: 'POST' });
  if (r.success) showAdmin();
}
