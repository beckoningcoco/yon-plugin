# 操作 NCC 页面时，实时盯住提示消息（toast）

> **先看这个**：本仓插件已经把这件事内置进 `browser_*` 了 —— 写操作的返回值会带回该次操作
> 期间的提示，另有 `browser_messages` 随时读（设计见 `docs/yon-page-tips-design.md`）。
> 只要返回里出现「⚠ 页面提示：…」，就不必再手工装监控。
> 下面的手工办法留给这些情况：插件没重启（新能力未生效）、提示没被带出来、或你在别的环境里操作。

> **什么时候读我**：在 NCC 页面上点按钮 / 填字段 / 保存之后，要判断"这一步到底成没成"。
> 尤其是**界面看起来没反应、列表是空的**的时候——往往不是没数据，而是后端报错了，
> 而那个错误只以一条 toast 的形式闪一下（`请检查全文检索配置！` 就是这么一条）。

---

## 零、为什么需要专门盯它

NCC 的业务错误**几乎不走 console，只走 toast**。而 toast 有两个要命的特性（都是实测）：

1. **一闪而过。** 默认几秒后自动淡出，用眼睛盯都容易错过。
2. **可能延迟出现。** 实测同一次操作里：保存的必输校验**立刻**弹（`ms=29488`），
   而全文检索失败的报错**晚了约 9 秒**才弹（`ms=38429`）。
   所以"操作完立刻看一眼页面"这个做法**会漏掉慢的那条**。

结论：**不要靠"当下看一眼"，要靠订阅**。

---

## 一、三种做法（按能力递增）

| 做法 | 怎么做 | 能拿到什么 |
| --- | --- | --- |
| ① 事后扫 | `[...doc.querySelectorAll('.toast-content')].map(e=>e.textContent)` | toast 节点**会残留在 DOM 里**，所以事后也能扫到。缺点：分不清是哪次操作弹的，也不知道弹了几次、隔了多久 |
| ② 基线对比 | 操作前记快照，操作后取差集 | 能把提示归到"这一次操作"。仍会漏掉"弹出又消失"的（节点被移除的话） |
| ③ **MutationObserver 预埋**（推荐） | 操作前装观察器，把每条 toast 按出现顺序记进数组 | **弹出瞬间就留档**，带时间戳，能看出延迟、频次、先后 |

---

## 二、推荐实现（可直接粘贴）

在页面主文档执行；NCC 节点页在 iframe 里，`d` 取 `#mainiframe.contentDocument`。

```js
const d = document.querySelector('#mainiframe').contentDocument;
const W = d.defaultView;

// —— 装监控 ——
if (W.__toastWatch) { try { W.__toastWatch.disconnect(); } catch (e) {} }
W.__toastLog = [];
W.__toastSeen = new W.WeakSet();                 // ★ 去重：同一个节点只记一次
const log = (el) => {
  if (W.__toastSeen.has(el)) return;
  W.__toastSeen.add(el);
  const txt = (el.innerText || el.textContent || '')
    .replace(/\s+/g, ' ').replace(/\s*关闭\s*$/, '').trim();   // 去掉尾部的"关闭"
  if (txt) W.__toastLog.push({ ms: Math.round(W.performance.now()), txt: txt.slice(0, 120) });
};

[...d.querySelectorAll('.toast-content')].forEach(log);  // ★ 页面上已有的算基线
W.__toastBase = W.__toastLog.length;                     //   之后只看 slice(__toastBase)

W.__toastWatch = new W.MutationObserver((muts) => {
  muts.forEach((m) => [...(m.addedNodes || [])].forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('.toast-content')) log(n);
    else if (n.querySelector) n.querySelectorAll('.toast-content').forEach(log);
  }));
});
W.__toastWatch.observe(d.body, { childList: true, subtree: true });
```

读完一次操作的结果：

```js
(W.__toastLog || []).slice(W.__toastBase || 0)     // → [{ms, txt}, ...] 本次操作新出现的提示
```

**每次操作前调一次安装代码（或至少 `W.__toastBase = W.__toastLog.length` 归零基线）**，
操作后读上面的切片，就是"这次操作到底报了什么"。

---

## 三、实测证据

在采购订单新增页（采购组织=水汇智造分公司）点「保存」，期望被校验拦下，监控输出：

```
[
  { ms: 29488, txt: "提示!下列字段不能为空：订单类型" },
  { ms: 38429, txt: "请检查全文检索配置！" }
]
```

两条都不是 console 报错，页面上也不常驻——**只有订阅才留得住**。

---

## 四、两个必须处理的坑

1. **一条 toast 会被多条 mutation 记录命中 → 重复计数。**
   实测不加去重时，点一次保存能记到 **2~3 条**完全相同的文本
   （外层 `section` 和内层 `div` 各触发一次 mutation，而它们都能 `querySelectorAll` 到同一个 `.toast-content`）。
   用 **`WeakSet` 按元素去重**后，点一次保存稳定是 **1 条**。
   只匹配 `.toast-content`（不要同时匹配 `.toast-modal`）也能减少重复。
2. **不要忘记基线。** 装监控时页面上往往还残留着之前的 toast，直接读 `__toastLog`
   会把旧消息当成"刚才弹的"。这就是 `__toastBase` 存在的原因。

---

## 五、局限与增强

- **必须预埋**：装监控这一步得在操作之前做。
- **会丢**：页面刷新 / 切换节点（iframe 重载）后 `WeakSet`、数组、观察器全没了，要重装。
- **想更根本，就盯网络层**：toast 只是前端展示，真正的错误来自响应。
  可以在同一个 window 上包一层 `XMLHttpRequest.prototype.open/send` 和 `fetch`，
  记录 URL / 状态码 / 响应片段，比 toast 更全（连"没有 toast 的静默失败"也能看到）。
- toast 的 DOM 形态：外层 `.toast-modal`（含 `.danger` / `.success` 之类的语义 class），
  文本在 `.toast-content`，右侧有个 `.close-icon`（文本"关闭"）。
