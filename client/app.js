'use strict';

const $ = (sel) => document.querySelector(sel);
const API_BASE = '/api';

const state = { search: '', category: '' };
let books = [];
let categories = [];
let editingBookId = null;   // 编辑中的图书 id；null 表示新增
let borrowingBookId = null; // 借出弹窗对应的图书 id
let searchTimer = null;
let toastTimer = null;

/* ---------- 通用工具 ---------- */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toast(message, type = 'success') {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

/* ---------- 数据加载与渲染 ---------- */
async function fetchBooks() {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('search', state.search.trim());
  if (state.category) params.set('category', state.category);
  const query = params.toString();
  try {
    books = await api(`/books${query ? `?${query}` : ''}`);
    renderBooks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function fetchCategories() {
  try {
    categories = await api('/categories');
    renderChips();
    renderCategorySelect();
    renderStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function refreshAll() {
  await Promise.all([fetchBooks(), fetchCategories()]);
}

function renderStats() {
  const totals = categories.reduce(
    (acc, c) => ({
      bookCount: acc.bookCount + c.bookCount,
      total: acc.total + c.totalCopies,
      available: acc.available + c.availableCopies,
      borrowed: acc.borrowed + c.borrowedCopies
    }),
    { bookCount: 0, total: 0, available: 0, borrowed: 0 });
  $('#stats').innerHTML =
    `<span>藏书 <b>${totals.bookCount}</b> 种</span>` +
    `<span>馆藏 <b>${totals.total}</b> 本</span>` +
    `<span>在库 <b>${totals.available}</b> 本</span>` +
    `<span>借出 <b>${totals.borrowed}</b> 本</span>`;
}

function renderChips() {
  const totalBooks = categories.reduce((s, c) => s + c.bookCount, 0);
  const chips = [
    `<button class="chip ${state.category === '' ? 'active' : ''}" data-cat="">全部 <b>${totalBooks}</b></button>`,
    ...categories.map((c) =>
      `<button class="chip ${state.category === c.category ? 'active' : ''}" data-cat="${escapeHtml(c.category)}">` +
      `${escapeHtml(c.category)} <b>${c.bookCount}</b></button>`)
  ];
  $('#categoryChips').innerHTML = chips.join('');
}

function renderCategorySelect() {
  const select = $('#categorySelect');
  select.innerHTML = '<option value="">全部分类</option>' +
    categories.map((c) =>
      `<option value="${escapeHtml(c.category)}"${state.category === c.category ? ' selected' : ''}>` +
      `${escapeHtml(c.category)}（${c.bookCount}）</option>`).join('');
  const datalist = $('#categoryList');
  if (datalist) datalist.innerHTML = categories.map((c) =>
    `<option value="${escapeHtml(c.category)}"></option>`).join('');
}

function badgeIndex(category) {
  const i = categories.findIndex((c) => c.category === category);
  return i < 0 ? 0 : i % 6;
}

function renderBooks() {
  $('#bookGrid').innerHTML = books.map(bookCard).join('');
  $('#emptyState').classList.toggle('hidden', books.length > 0);
}

function bookCard(book) {
  const active = book.loans.filter((l) => !l.returnedAt);
  const avail = book.availableCopies;
  const statusCls = avail === 0 ? 'none' : avail <= 1 ? 'low' : 'ok';
  const statusText = avail === 0 ? '已借完' : `在库 ${avail}/${book.totalCopies}`;
  const loansHtml = active.map((l) =>
    `<div class="loan">👤 ${escapeHtml(l.borrower)} · ${fmtDate(l.borrowedAt)} 借出</div>`).join('');
  return `
    <article class="card" data-id="${book.id}">
      <div class="card-head">
        <span class="badge c${badgeIndex(book.category)}">${escapeHtml(book.category)}</span>
        <span class="avail ${statusCls}">${statusText}</span>
      </div>
      <h3 class="title">${escapeHtml(book.title)}</h3>
      <p class="meta">${escapeHtml(book.author)}${book.year ? ` · ${book.year} 年` : ''}${book.isbn ? ` · ISBN ${escapeHtml(book.isbn)}` : ''}</p>
      ${book.description ? `<p class="desc">${escapeHtml(book.description)}</p>` : ''}
      ${loansHtml}
      <div class="card-actions">
        <button class="btn primary small" data-action="borrow" ${avail === 0 ? 'disabled' : ''}>借出</button>
        <button class="btn small" data-action="return" ${active.length === 0 ? 'disabled' : ''}>归还</button>
        <button class="btn ghost small" data-action="edit">编辑</button>
        <button class="btn danger small" data-action="delete">删除</button>
      </div>
    </article>`;
}

/* ---------- 借出 / 归还 ---------- */
function openBorrowModal(book) {
  borrowingBookId = book.id;
  $('#borrowBookInfo').textContent = `《${book.title}》 剩余可借 ${book.availableCopies} 本`;
  $('#borrowerInput').value = '';
  $('#borrowModal').classList.remove('hidden');
  $('#borrowerInput').focus();
}

async function confirmBorrow() {
  const book = books.find((b) => b.id === borrowingBookId);
  const borrower = $('#borrowerInput').value.trim();
  if (!book) return closeModal('#borrowModal');
  if (!borrower) {
    toast('请先填写借阅人姓名', 'error');
    $('#borrowerInput').focus();
    return;
  }
  try {
    await api(`/books/${book.id}/borrow`, { method: 'POST', body: { borrower } });
    closeModal('#borrowModal');
    toast(`《${book.title}》已借出给 ${borrower}`);
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function returnBook(book) {
  const active = book.loans.filter((l) => !l.returnedAt);
  const loan = active[active.length - 1];
  if (!loan) return;
  try {
    await api(`/books/${book.id}/return`, { method: 'POST', body: { loanId: loan.id } });
    toast(`《${book.title}》已归还（借阅人：${loan.borrower}）`);
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- 添加 / 编辑 / 删除 ---------- */
function openBookModal(book) {
  editingBookId = book ? book.id : null;
  $('#bookModalTitle').textContent = book ? '编辑图书' : '添加图书';
  $('#titleInput').value = book ? book.title : '';
  $('#authorInput').value = book ? book.author : '';
  $('#categoryInput').value = book ? book.category : '';
  $('#yearInput').value = book && book.year ? book.year : '';
  $('#copiesInput').value = book ? book.totalCopies : 1;
  $('#isbnInput').value = book ? book.isbn : '';
  $('#descriptionInput').value = book ? book.description : '';
  $('#bookModal').classList.remove('hidden');
  $('#titleInput').focus();
}

async function submitBookForm(event) {
  event.preventDefault();
  const title = $('#titleInput').value.trim();
  if (!title) {
    toast('书名不能为空', 'error');
    $('#titleInput').focus();
    return;
  }
  const payload = {
    title,
    author: $('#authorInput').value.trim(),
    category: $('#categoryInput').value.trim(),
    year: $('#yearInput').value,
    totalCopies: $('#copiesInput').value,
    isbn: $('#isbnInput').value.trim(),
    description: $('#descriptionInput').value.trim()
  };
  try {
    if (editingBookId) {
      await api(`/books/${editingBookId}`, { method: 'PUT', body: payload });
      toast(`《${title}》已更新`);
    } else {
      await api('/books', { method: 'POST', body: payload });
      toast(`《${title}》已添加`);
    }
    closeModal('#bookModal');
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteBook(book) {
  if (!window.confirm(`确定删除《${book.title}》吗？此操作不可恢复。`)) return;
  try {
    await api(`/books/${book.id}`, { method: 'DELETE' });
    toast(`《${book.title}》已删除`);
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- 弹窗通用 ---------- */
function closeModal(selector) {
  $(selector).classList.add('hidden');
}

function closeAllModals() {
  closeModal('#borrowModal');
  closeModal('#bookModal');
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  // 全文搜索（输入防抖）
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      fetchBooks();
    }, 250);
  });

  // 分类下拉
  $('#categorySelect').addEventListener('change', (e) => {
    state.category = e.target.value;
    fetchBooks();
    renderChips();
  });

  // 分类汇总条
  $('#categoryChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.cat || '';
    $('#categorySelect').value = state.category;
    fetchBooks();
    renderChips();
  });

  // 添加图书
  $('#addBtn').addEventListener('click', () => openBookModal(null));

  // 卡片按钮（事件委托）
  $('#bookGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.card');
    const book = books.find((b) => b.id === Number(card.dataset.id));
    if (!book) return;
    const action = btn.dataset.action;
    if (action === 'borrow') openBorrowModal(book);
    else if (action === 'return') returnBook(book);
    else if (action === 'edit') openBookModal(book);
    else if (action === 'delete') deleteBook(book);
  });

  // 借出弹窗
  $('#borrowConfirmBtn').addEventListener('click', confirmBorrow);
  $('#borrowerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBorrow();
  });

  // 图书表单
  $('#bookForm').addEventListener('submit', submitBookForm);

  // 关闭按钮 / 点击遮罩 / Esc
  document.querySelectorAll('.modal-mask').forEach((mask) => {
    mask.addEventListener('click', (e) => {
      if (e.target === mask || e.target.closest('[data-close]')) mask.classList.add('hidden');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });
}

/* ---------- 启动 ---------- */
bindEvents();
refreshAll();
