'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const PORT = process.env.PORT || 3007;
const DATA_FILE = path.join(__dirname, 'data.json');
const CLIENT_DIR = path.join(__dirname, '..', 'client');

// ---- 内置 12 本示例图书（首次启动时写入 data.json）----
const DEFAULT_BOOKS = [
  { title: '三体', author: '刘慈欣', category: '科幻', year: 2008, isbn: '9787536692930', totalCopies: 3, description: '地球文明向宇宙发出的第一声啼鸣，一段跨越光年的文明兴衰史。' },
  { title: '三体Ⅱ·黑暗森林', author: '刘慈欣', category: '科幻', year: 2008, isbn: '9787536693968', totalCopies: 2, description: '面壁计划开启，人类与三体文明进入漫长的黑暗森林对峙。' },
  { title: '活着', author: '余华', category: '文学', year: 1993, isbn: '9787506365437', totalCopies: 3, description: '福贵的一生，写尽了中国人在苦难中活下去的韧性。' },
  { title: '百年孤独', author: '加西亚·马尔克斯', category: '文学', year: 1967, isbn: '9787544253994', totalCopies: 2, description: '布恩迪亚家族七代人的传奇，魔幻现实主义巅峰之作。' },
  { title: '小王子', author: '圣埃克苏佩里', category: '文学', year: 1943, isbn: '9787020042494', totalCopies: 2, description: '写给大人的童话：真正重要的东西，眼睛是看不见的。' },
  { title: '人类简史：从动物到上帝', author: '尤瓦尔·赫拉利', category: '历史', year: 2012, isbn: '9787508647357', totalCopies: 2, description: '从认知革命到人工智能，一部宏观的人类发展史。' },
  { title: '明朝那些事儿（第1部）', author: '当年明月', category: '历史', year: 2006, isbn: '9787505722880', totalCopies: 1, description: '以通俗笔法重写大明王朝三百年兴衰。' },
  { title: '深入理解计算机系统（第3版）', author: '兰德尔·E. 布莱恩特', category: '科技', year: 2016, isbn: '9787111544937', totalCopies: 2, description: '从程序员视角剖析计算机系统的经典教材（CSAPP）。' },
  { title: '代码大全（第2版）', author: '史蒂夫·迈克康奈尔', category: '科技', year: 2006, isbn: '9787121022982', totalCopies: 1, description: '软件构建领域的百科全书，写好代码的案头必备。' },
  { title: '时间简史', author: '史蒂芬·霍金', category: '科技', year: 1988, isbn: '9787535732309', totalCopies: 2, description: '宇宙的起源、黑洞与时间箭头，最畅销的科普经典。' },
  { title: '原则', author: '瑞·达利欧', category: '经济', year: 2018, isbn: '9787508684031', totalCopies: 2, description: '桥水基金创始人总结的生活与工作原则。' },
  { title: '经济学原理（微观经济学分册）', author: '曼昆', category: '经济', year: 1998, isbn: '9787301114265', totalCopies: 2, description: '全球最流行的经济学入门教材，十大原理深入浅出。' }
];

// ---- data.json 的读写与初始化 ----
function defaultData() {
  return {
    nextBookId: DEFAULT_BOOKS.length + 1,
    nextLoanId: 1,
    books: DEFAULT_BOOKS.map((b, i) => ({ id: i + 1, ...b, availableCopies: b.totalCopies, loans: [] }))
  };
}

function saveData() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

let db;
(function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(parsed.books)) throw new Error('books 字段缺失');
      parsed.nextBookId = parsed.nextBookId || parsed.books.length + 1;
      parsed.nextLoanId = parsed.nextLoanId || 1;
      db = parsed;
      console.log(`已从 ${DATA_FILE} 载入 ${db.books.length} 本图书`);
      return;
    } catch (err) {
      console.error(`data.json 读取失败（${err.message}），将重建初始数据`);
    }
  }
  db = defaultData();
  saveData();
  console.log(`首次启动：已把 ${db.books.length} 本示例图书写入 ${DATA_FILE}`);
})();

// ---- 工具函数 ----
function findBook(id) {
  const num = Number(id);
  return db.books.find((b) => b.id === num);
}

function activeLoans(book) {
  return book.loans.filter((l) => !l.returnedAt);
}

function publicBook(book) {
  return { ...book, activeLoans: activeLoans(book) };
}

function toInt(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

// ---- Express 应用 ----
const app = express();
app.use(express.json());

// 图书列表：支持 ?search=（书名/作者/分类/ISBN/简介全文搜索） 与 ?category= 筛选
app.get('/api/books', (req, res) => {
  let list = db.books;
  const search = String(req.query.search || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  if (category) list = list.filter((b) => b.category === category);
  if (search) {
    list = list.filter((b) =>
      [b.title, b.author, b.category, b.isbn, b.description]
        .some((v) => String(v || '').toLowerCase().includes(search)));
  }
  res.json([...list].sort((a, b) => a.id - b.id).map(publicBook));
});

app.get('/api/books/:id', (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return res.status(404).json({ error: '图书不存在' });
  res.json(publicBook(book));
});

// 新增图书
app.post('/api/books', (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ error: '书名不能为空' });

  let totalCopies = 1;
  if (body.totalCopies !== undefined && body.totalCopies !== '') {
    const n = toInt(body.totalCopies);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: '馆藏副本数必须是不小于 1 的整数' });
    }
    totalCopies = n;
  }
  let year = null;
  if (body.year !== undefined && body.year !== '') {
    const y = toInt(body.year);
    if (!Number.isInteger(y) || y < 0) return res.status(400).json({ error: '出版年份不合法' });
    year = y;
  }

  const book = {
    id: db.nextBookId++,
    title,
    author: String(body.author || '').trim() || '佚名',
    category: String(body.category || '').trim() || '未分类',
    year,
    isbn: String(body.isbn || '').trim(),
    totalCopies,
    availableCopies: totalCopies,
    description: String(body.description || '').trim(),
    loans: []
  };
  db.books.push(book);
  saveData();
  res.status(201).json(publicBook(book));
});

// 编辑图书
app.put('/api/books/:id', (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return res.status(404).json({ error: '图书不存在' });
  const body = req.body || {};

  const title = body.title !== undefined ? String(body.title).trim() : book.title;
  if (!title) return res.status(400).json({ error: '书名不能为空' });

  const borrowed = activeLoans(book).length;
  let totalCopies = book.totalCopies;
  if (body.totalCopies !== undefined && body.totalCopies !== '') {
    const n = toInt(body.totalCopies);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: '馆藏副本数必须是不小于 1 的整数' });
    }
    if (n < borrowed) {
      return res.status(400).json({ error: `馆藏副本数不能少于当前借出数量（${borrowed}）` });
    }
    totalCopies = n;
  }

  book.title = title;
  if (body.author !== undefined) book.author = String(body.author).trim() || '佚名';
  if (body.category !== undefined) book.category = String(body.category).trim() || '未分类';
  if (body.year !== undefined) {
    const y = toInt(body.year);
    book.year = Number.isInteger(y) && y > 0 ? y : null;
  }
  if (body.isbn !== undefined) book.isbn = String(body.isbn).trim();
  if (body.description !== undefined) book.description = String(body.description).trim();
  book.totalCopies = totalCopies;
  book.availableCopies = totalCopies - borrowed;
  saveData();
  res.json(publicBook(book));
});

// 删除图书
app.delete('/api/books/:id', (req, res) => {
  const idx = db.books.findIndex((b) => b.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '图书不存在' });
  const [removed] = db.books.splice(idx, 1);
  saveData();
  res.json({ ok: true, deleted: removed.title });
});

// 借出图书
app.post('/api/books/:id/borrow', (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return res.status(404).json({ error: '图书不存在' });
  const borrower = String((req.body || {}).borrower || '').trim();
  if (!borrower) return res.status(400).json({ error: '请填写借阅人姓名' });
  if (book.availableCopies <= 0) {
    return res.status(400).json({ error: `《${book.title}》暂无可借副本` });
  }
  book.availableCopies -= 1;
  book.loans.push({
    id: db.nextLoanId++,
    borrower,
    borrowedAt: new Date().toISOString(),
    returnedAt: null
  });
  saveData();
  res.json(publicBook(book));
});

// 归还图书：不传 loanId 时默认归还最近一次借出
app.post('/api/books/:id/return', (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return res.status(404).json({ error: '图书不存在' });
  const loans = activeLoans(book);
  if (loans.length === 0) return res.status(400).json({ error: `《${book.title}》没有未归还的借阅记录` });

  let loan = loans[loans.length - 1];
  const loanId = toInt((req.body || {}).loanId);
  if (Number.isInteger(loanId)) {
    const found = loans.find((l) => l.id === loanId);
    if (!found) return res.status(400).json({ error: '未找到对应的借阅记录' });
    loan = found;
  }
  loan.returnedAt = new Date().toISOString();
  book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
  saveData();
  res.json(publicBook(book));
});

// 分类汇总：每个分类的图书种数、馆藏总副本、在库、借出
app.get('/api/categories', (req, res) => {
  const map = new Map();
  for (const b of db.books) {
    const cur = map.get(b.category) || { category: b.category, bookCount: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0 };
    cur.bookCount += 1;
    cur.totalCopies += b.totalCopies;
    cur.availableCopies += b.availableCopies;
    cur.borrowedCopies += b.totalCopies - b.availableCopies;
    map.set(b.category, cur);
  }
  const list = [...map.values()].sort(
    (a, b) => b.bookCount - a.bookCount || a.category.localeCompare(b.category, 'zh'));
  res.json(list);
});

// API 404
app.use('/api', (req, res) => res.status(404).json({ error: `接口不存在：${req.method} ${req.originalUrl}` }));

// 静态托管前端
app.use(express.static(CLIENT_DIR));

// JSON 解析失败等错误统一处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`library 图书管理已启动：http://localhost:${PORT}`);
  console.log(`API 地址：http://localhost:${PORT}/api/books`);
});
