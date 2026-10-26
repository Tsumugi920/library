# library 图书管理

前后端分离的图书管理系统：Node.js + Express 提供 REST API 并托管前端静态页面，原生 HTML/CSS/JS 实现界面。数据持久化在 `server/data.json` 文件中，首次启动自动写入 12 本示例图书。

## 功能

- 图书列表（卡片视图，展示馆藏 / 在库 / 借出状态与借阅人）
- 全文搜索：书名、作者、分类、ISBN、简介
- 按分类筛选（下拉框 + 可点击的分类汇总条）
- 借出与归还（记录借阅人与时间，副本数自动增减，借完为 0 时禁止再借）
- 添加 / 编辑 / 删除图书
- 分类汇总：每个分类的图书种数、馆藏副本、在库、借出

## 目录结构

```
library/
├── package.json          # 启动脚本 npm start
├── client/
│   ├── index.html        # 页面结构（列表、搜索栏、分类条、弹窗）
│   ├── style.css         # 样式
│   └── app.js            # 前端逻辑（调用 REST API）
├── server/
│   ├── server.js         # Express 后端：REST API + 静态托管 client/
│   └── data.json         # 数据文件（首次启动自动生成，含 12 本示例图书）
└── README.md
```

## 安装与启动

环境要求：Node.js ≥ 16。

```bash
cd library
npm install
npm start
```

启动后访问 **http://localhost:3007** 即可使用（前端由后端同源托管，无需单独启动）。

端口默认为 **3007**（刻意避开 3000–3006），如需更换：

```bash
PORT=8080 npm start
```

开发模式（改动后端代码自动重启）：

```bash
npm run dev
```

重置数据：删除 `server/data.json` 后重启，即可恢复为 12 本示例图书。

## REST API

基础地址：`http://localhost:3007/api`

| 方法   | 路径                        | 说明 |
| ------ | --------------------------- | ---- |
| GET    | `/books`                    | 图书列表，支持 `?search=` 全文搜索、`?category=` 分类筛选 |
| GET    | `/books/:id`                | 图书详情 |
| POST   | `/books`                    | 新增图书（`title` 必填） |
| PUT    | `/books/:id`                | 编辑图书 |
| DELETE | `/books/:id`                | 删除图书 |
| POST   | `/books/:id/borrow`         | 借出，body：`{"borrower": "张三"}` |
| POST   | `/books/:id/return`         | 归还，body 可传 `{"loanId": 1}`，缺省归还最近一次借出 |
| GET    | `/categories`               | 分类汇总 |

### curl 示例

```bash
# 列出全部图书
curl -s http://localhost:3007/api/books

# 全文搜索
curl -s 'http://localhost:3007/api/books?search=三体'

# 借出 1 号图书
curl -s -X POST http://localhost:3007/api/books/1/borrow \
  -H 'Content-Type: application/json' -d '{"borrower":"张三"}'

# 归还 1 号图书（最近一次借出）
curl -s -X POST http://localhost:3007/api/books/1/return \
  -H 'Content-Type: application/json' -d '{}'

# 分类汇总
curl -s http://localhost:3007/api/categories

# 新增图书
curl -s -X POST http://localhost:3007/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"新书","author":"作者","category":"科技","year":2024,"totalCopies":2}'
```

## 数据模型

`server/data.json` 中的每本图书：

```json
{
  "id": 1,
  "title": "三体",
  "author": "刘慈欣",
  "category": "科幻",
  "year": 2008,
  "isbn": "9787536692930",
  "totalCopies": 3,
  "availableCopies": 3,
  "description": "……",
  "loans": [
    { "id": 1, "borrower": "张三", "borrowedAt": "2026-10-25T08:00:00.000Z", "returnedAt": null }
  ]
}
```

`loans` 保留完整借阅历史：`returnedAt` 为 `null` 表示尚未归还；编辑图书时副本数不能少于当前未归还数量。
