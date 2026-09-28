# 用友社区网页内容抓取指南

> 总结于 2026-05-28，用于后续消化用友社区链接上的知识。

## 核心问题

用友社区的所有站点都是 **SPA（单页应用）**，页面内容通过 JavaScript 动态加载。
直接 `curl` 或 `WebFetch` 只能拿到空壳 HTML，没有实际内容。

| 站点 | 技术栈 | 内容加载方式 |
|------|--------|-------------|
| `community.yonyou.com` | Vue | API 异步加载文章/课程数据 |
| `c2.yonyoucloud.com` | React | Hash 路由 + API 异步加载文档 |

## 可用方法对比

| 方法 | 结果 | 备注 |
|------|------|------|
| `curl` / `WebFetch` | 空壳 | 只拿到 SPA 框架 HTML |
| 猜 API 端点 | 全部返回 SPA | 服务端对所有路径返回 index.html |
| baoyu-url-to-markdown（无登录态） | 页面框架 | 只抓到 SVG sprite 和 CSS，0 个中文字符 |
| baoyu-url-to-markdown（有登录态） | 页面框架 | 同上，defuddle 转换器在 Vue 渲染前就捕获了 |
| **Chrome CDP `Runtime.evaluate` + 已登录浏览器** | **成功** | 直接提取 `document.body.innerText` |

## 唯一有效方案

**前提**：用户用 Chrome 打开 `--remote-debugging-port=9222`，在浏览器里登录用友社区。

### 环境准备

```bash
# 1. 关闭所有 Chrome 窗口和后台进程
taskkill /F /IM chrome.exe

# 2. 必须指定独立的用户目录（避免和日常 Chrome 冲突），使用 127.0.0.1 而非 localhost
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\chrome-debug"
```

然后在这个 Chrome 中访问 `community.yonyou.com` 和 `c2.yonyoucloud.com` 并登录。

> **重要**：CDP 连接必须使用 `127.0.0.1:9222`，不能使用 `localhost:9222`，否则会连接失败。

### 内容类型过滤（必须遵守）

**遇到以下类型直接跳过，不要抓取：**

- **视频课程页**（`learn/detail/XXX` 中标题为"视频播放"的页面）→ 内容不是文档，只有视频播放器和课程大纲
- 页面标题或 H1 包含"视频播放"、"视频课程"等关键词
- `document.title` 为 `"视频播放 - YonBIP开发者社区"` 的页面

**判断逻辑**：先检查 `document.title`，如果包含"视频播放"则标记为跳过，直接关闭标签页。
**只抓取文档中心**（`c2.yonyoucloud.com`）的文字内容，和社区文章页（`article/detail/`）的文字内容。

### 抓取 community.yonyou.com 文章/课程页

使用 bun 脚本通过 CDP 打开新标签页并提取内容：

```ts
// 打开新标签页（共享登录态）
const url = 'https://community.yonyou.com/article/detail/XXXXX'; // 或 learn/detail/XXX
const resp = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
const tab = JSON.parse(await resp.text());

// 连接 WebSocket，等待页面加载，提取内容
const ws = new WebSocket(tab.webSocketDebuggerUrl);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
// 收到 Page.loadEventFired 后，等待 8-12 秒让 Vue 渲染，然后：
ws.send(JSON.stringify({
  id: 9, method: 'Runtime.evaluate',
  params: { expression: 'document.body.innerText', returnByValue: true }
}));
```

### 提取页面中的链接

```ts
ws.send(JSON.stringify({
  id: 4, method: 'Runtime.evaluate',
  params: {
    expression: `JSON.stringify(
      Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({text: a.innerText.trim().substring(0, 100), href: a.href}))
        .filter(l => l.text && l.href)
    )`,
    returnByValue: true
  }
}));
```

### 抓取 c2.yonyoucloud.com 文档页

文档中心是 React + Hash 路由，`Page.loadEventFired` 只触发一次（初始加载），后续的 hash 导航不会触发新的 load 事件。需要**轮询等待**内容就绪：

```ts
// 第一个 setTimeout 在 5 秒后评估，检查 body.innerText.length > 200
// 如果还没内容，10 秒后再试一次
// 最多尝试 3 次
```

## 关键经验

1. **不要浪费时间猜 API 端点** — 服务端对所有路径返回 SPA 壳
2. **baoyu-url-to-markdown 不可用** — defuddle 转换器在内容渲染前就捕获了 DOM
3. **必须用 CDP + Runtime.evaluate** — 这是唯一直接从已渲染 DOM 提取内容的方式
4. **等待时间要够** — Vue/React 异步渲染，内容较长的页面建议等 8-12 秒
5. **必须复用已登录的 Chrome** — CDP 打开的标签页共享浏览器 profile 和 cookies
6. **必须指定独立用户目录** — `--user-data-dir="%USERPROFILE%\chrome-debug"`，否则会和日常 Chrome 冲突导致调试端口失效
7. **必须用 127.0.0.1 而非 localhost** — CDP 连接 `localhost:9222` 会失败，要写 `127.0.0.1:9222`
8. **视频课程页直接跳过** — `learn/detail/` 页面如果 `document.title` 包含"视频播放"则忽略，只抓文档中心和文章页的文字内容

## 抓取脚本模板

完整的抓取脚本模板位于 `scripts/fetch-yonby-article.ts`（可复用）。
