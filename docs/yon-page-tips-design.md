# 页面提示采集（page tips）：设计记录

> **状态：已实现（2026-10-12）。** 本文记录为什么做、口径、以及实现时的取舍，不是接口手册。
> 落点与三处与设计不同的取舍见文末「实现记录」。
> 相关：`docs/yon-browser-design.md`（调试浏览器本体）、
> 触发它的迭代表板条目 `it-mv4uvx5i-rpgi`、使用侧的实测经验
> `resources/knowledge/ncc/ncc-dev/references/scenarios/page-feedback-watch.md`。
>
> 记录日期 2026-10-12。

## 一、要解决的问题

**browser_\* 拿得到页面的 DOM，却拿不到页面说的话。**

NCC（用友前台）的业务错误几乎只以 toast 的形式出现，不进 console。而 toast 有两个要命特性，
都是本次实测出来的：

1. **一闪而过**：几秒后自动淡出，页面 DOM 上留不留得住看运气（实测有时残留、有时 `toastNodes=0`）。
2. **可能延迟出现**：同一次操作里，保存的必输校验**立刻**弹（`ms=29488`），
   全文检索失败的报错**晚了约 9 秒**（`ms=38429`）。

后果不是"少看到一条提示"，而是**误判**。本次会话就发生过：在参照窗里反复搜索都查不出数据，
于是得出"这个环境的参照搜索只认编码"的错误结论并写进知识文档——真实原因是
**环境没配全文检索服务，搜索每次都报错**，而那条报错只闪了一下。

现有的绕法（自己往页面里 `browser_eval` 一段 `MutationObserver`）能用，但有三个问题：
**要手动预埋**、**页面一重载就没了**、**每次都得记着去看**。凡是"要人记得做的事"，在长会话里必然会漏。

## 二、口径（要做成什么样）

| # | 决策 | 取值 |
|---|---|---|
| 1 | 采集范围 | toast / message 一类的**瞬时提示节点**；不做 console、不做网络（那是另一件事） |
| 2 | 携带方式 | **写操作（click / type / setValue / pressKey / select / fill / scroll）的返回值里附带**该次操作期间新出现的提示 |
| 3 | 兜底携带 | **任何 browser_\* 调用**都顺带把"自上次报告以来新出现的提示"带回——因为提示可能比操作晚数秒 |
| 4 | 去重 | 同一条提示**只报一次**（游标推进 + 元素级 WeakSet 去重） |
| 5 | 失败姿态 | 采集失败**静默**，绝不因此让主操作失败或报错 |
| 6 | 显式入口 | 另加只读工具 `browser_messages`，用于"我就想现在看看有什么提示" |
| 7 | 非目标 | 不改 `browser_eval` 的语义；不新增对页面的写权限；不解析提示的业务含义 |

## 三、分层设计

```
工具层   browser-tools.ts      render 里附带提示行；新增 browser_messages
            ▲
服务层   browser-cdp-service.ts  写操作包一层：操作 → 短等 → collectTips()；结果类型加 tips 字段
            ▲
采集层   browser-tips.ts（新）   幂等安装 + 增量读取的表达式 + 解析
            ▲
页面内   window.__yonTips        每个 document 一份：{seen: WeakSet, items: [], cursor: n}
```

### 3.1 采集层：一段幂等表达式（`browser-tips.ts`）

采集靠**同一个表达式**完成"装 + 读"，因此不需要"预埋"这个独立步骤——
任何一次调用跑它，它就把监控装好，并把增量取回来。

```js
(function () {
  var SEL = '.toast-content,.ant-message-notice-content,.el-message__content,[class*=message-content]';
  var K = '__yonTips';
  var S = window[K] || (window[K] = { seen: new WeakSet(), items: [], cursor: 0 });
  if (!S.obs) {
    var levelOf = function (el) {
      for (var n = el; n && n !== document.body; n = n.parentElement) {
        var c = String(n.className || '');
        if (/danger|error|fail/i.test(c)) return 'error';
        if (/success|ok/i.test(c)) return 'success';
        if (/warn/i.test(c)) return 'warn';
      }
      return 'info';
    };
    var push = function (el) {
      if (S.seen.has(el)) return;                       // ★ 元素级去重
      S.seen.add(el);
      var t = (el.innerText || el.textContent || '')
        .replace(/\s+/g, ' ').replace(/\s*关闭\s*$/, '').trim();
      if (t.length < 2) return;                          // 过滤空白残渣
      S.items.push({ ms: Math.round(performance.now()), level: levelOf(el), txt: t.slice(0, 160) });
    };
    Array.prototype.forEach.call(document.querySelectorAll(SEL), push);   // ★ 已有的算基线
    S.obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(SEL)) push(n);
          else if (n.querySelector) Array.prototype.forEach.call(n.querySelectorAll(SEL), push);
        });
      });
    });
    S.obs.observe(document.body, { childList: true, subtree: true });
  }
  var out = S.items.slice(S.cursor);
  S.cursor = S.items.length;
  return JSON.stringify(out);
})()
```

三个必须保留的细节，每个都是踩出来的：

- **`WeakSet` 按元素去重**：一条 toast 会触发多条 mutation 记录（外层 `section` 与内层 `div`
  都能 `querySelectorAll` 到同一个 `.toast-content`）。不去重时点一次保存记到 **2~3 条**相同的，
  去重后稳定 **1 条**。
- **装的时候把已有节点计入 items**（而非跳过）：它们会落在 `cursor` 之前，
  于是天然成为基线，不会在第一次采集时被误报成"刚才弹的"。
- **只 observe `childList`**：不加 `attributes` / `characterData`。实测页面开销可忽略，
  也不会和页面自身的频繁重渲染打架。

### 3.2 iframe：逐个 document 各跑一遍

NCC 的工作台把节点页放在 `#mainiframe` 里，**toast 出现在 iframe 内部**——
只装在顶层文档上会一条都收不到（这也是本次会话最初的坑之一）。

做法：host 侧先取该页所有 document（顶层 + **同源** iframe，深度 ≤ 2），
对每个 document 各跑一次上面的表达式，把结果合并：

```ts
/** 顶层文档 + 同源 iframe，跨域的跳过。 */
const DOCS = `
(function(){
  var out=[document];
  (function walk(root,depth){
    if(depth>2) return;
    var frames;
    try { frames = root.querySelectorAll('iframe'); } catch(e){ return; }
    for (var i=0;i<frames.length;i++){
      var doc; try { doc = frames[i].contentDocument; } catch(e){ continue; }   // 跨域会抛
      if(!doc || !doc.body) continue;
      out.push(doc); walk(doc, depth+1);
    }
  })(document,0);
  return out;
})()`
```

`Runtime.evaluate` 一次只能在一个 document 里执行，所以实际实现是：
**先跑 DOCS 拿到 iframe 的数量与索引，再用带 frame 定位的表达式逐个跑**
（`Runtime.evaluate` 传 `contextId`，或退化为在父文档里用 `frames[i]` 间接执行）。

> 落地的简化版（推荐先做这个）：只处理**顶层 + 一层同源 iframe**，
> 并且允许脚本从父文档直接写子文档的 `window.__yonTips`——同源时这是合法的，
> 一次 `Runtime.evaluate` 就能把所有 document 装好、读出来。

### 3.3 服务层：挂在哪几个方法上

`browser-cdp-service.ts` 里每个操作都走 `withPage(...)`，所以挂载点很集中：

```ts
async function withPageAndTips<T>(input, signal, body: (ctx, page) => Promise<T>, opts: {settleMs?: number} = {}) {
  return await withPage(input, signal, async (context, page) => {
    await collectTips(context)                       // 操作前：把游标推到当前（丢弃历史）
    const value = await body(context, page)
    await sleep(opts.settleMs ?? 400)                // 让同步弹出的提示有机会出现
    const tips = await collectTips(context)          // 操作后：取增量
    return { ...value, tips }
  })
}
```

- `click` / `type` / `setValue` / `pressKey` / `select` / `fill` / `scroll` → 带上 `tips`，`settleMs` 400。
- 只读方法（`read` / `evaluate` / `snapshot` / `getValue` / `wait` / `pages`）→
  **也采集**，但 `settleMs = 0`（不额外等待），返回值里同样带 `tips`。
  这就是口径 3 的兜底：延迟 9 秒的那条报错，会在**下一次任何调用**时被带出来。
- 采集本身用已有的 `evaluateIn(context, expr)`，异常一律 catch 成 `[]`。

新增结果字段（加到各 `Cdp*Result`）：

```ts
export interface PageTip {
  readonly ms: number
  readonly level: 'info' | 'success' | 'warn' | 'error'
  readonly txt: string
}
```

### 3.4 工具层：render 里怎么显示

`browser-tools.ts` 的 `render(value)` 末尾附一段——**有提示才出现**，没有就维持现状（零噪声）：

```
已在页面 采购订单新增 上点击了 button「保存」。
⚠ 页面提示：提示!下列字段不能为空：订单类型
```

多条时逐条列出（最多 5 条，其余折叠成"…还有 N 条"）。
`level: 'error'` 用 `⛔`、`warn` 用 `⚠`、`success` 用 `✓`。

另外新增一个只读工具：

```
browser_messages { page, run? }
→ 返回该页自上次报告以来新出现的提示（不清空队列，游标照常推进）
```

### 3.5 时序：为什么"操作后短等"不够，必须有兜底

```
t=0ms    点保存        → click 返回，settle 400ms，抓到"下列字段不能为空"
t=9000ms 全文检索失败  → 此刻没有任何 browser_* 在跑，没人看到
t=12000ms 下一次 browser_read / eval / click  → 顺带采集，把这条带出来 ✓
```

所以口径 3 不是锦上添花，而是**覆盖延迟报错的唯一手段**。

## 四、风险与对策

| 风险 | 对策 |
|---|---|
| 采集把主操作拖慢 | 每次多一次 `Runtime.evaluate`（个位数 ms）；只读调用 `settleMs=0`，无额外等待 |
| 采集抛异常连累主操作 | 采集整体 `try/catch` 成 `[]`；主操作的返回值照常返回 |
| 跨域 iframe 访问抛错 | 逐帧 `try/catch`，跨域的跳过 |
| 页面频繁重渲染导致提示刷屏 | 元素级 WeakSet + 文本长度阈值（<2 字符丢弃）+ 每条 160 字符截断 + 单次最多报 5 条 |
| 普通网页也有 `[class*=message-content]` 之类的节点 | 选择器以 NCC 的 `.toast-content` 为主；其余为兼容项。**宁少勿多**——噪声会让这个功能被关掉 |
| 页面重载后监控消失 | 不需要额外处理：采集表达式本身就是幂等的"装 + 读"，下次调用自动重装（代价是重载期间出现的提示会丢，可接受） |

## 五、验收标准

1. 在 NCC 采购订单新增页点「保存」（必输项没填全）→ `browser_click` 的返回里出现
   「提示!下列字段不能为空：订单类型」。
2. 在供应商参照的搜索框触发一次搜索（环境未配全文检索）→ **不要求这一次调用就带回**，
   但**其后任意一次 browser_\* 调用**必须带回「请检查全文检索配置！」。
3. 在一个没有提示的普通页面上点击 → 返回值与改动前**逐字一致**（不得多出空行或占位文本）。
4. 让采集表达式故意抛错 → 主操作仍然成功返回，只是没有 tips。
5. 单元测试：给一个带 `.toast-content` 的假 DOM，连续两次采集，第二次的增量必须为空
   （验证游标推进），并列断言不去重时会出现的重复计数。

## 六、明确不做

- **不做 console / 网络采集**：那是"页面为什么白屏"的问题（`it-mv4pbjbo-6k4n`），
  与"这一步成没成"是两个场景，混在一个返回值里会让噪声失控。
- **不解释提示的业务含义**：只负责把页面说的话原样带回。
- **不改 `browser_eval` 的返回值**：它是逃生舱，保持不加料的语义。
- **不持久化提示**：只活在本次会话的返回值里，不落盘、不进面板。

## 七、实现记录（2026-10-12）

**落点**

| 文件 | 内容 |
|---|---|
| `src/host/browser-tips.ts`（新） | `PageTip`、`TIPS_SELECTOR`、`TIPS_SCRIPT`（页面内脚本，导出以便在 jsdom 里直接 eval）、`tipsExpression()`、`parseTips()`、`tipsOf()`、`collectPageTips()` |
| `src/host/browser-cdp-service.ts` | `TipMode` + `WRITE_TIPS`；`withPage` 学会 pre-push、settle、drain；八个写操作挂上 `WRITE_TIPS`；新增 `messages()` 与 `CdpMessagesResult` |
| `src/host/browser-tools.ts` | `defineTool` 统一附加提示行与 schema 字段；新增 `browser_messages`；工具名单加一项 |
| `tests/browser-tips.spec.ts`（新） | 13 个用例，`@vitest-environment jsdom` |

**三处与设计不同的取舍**

1. **一个结果接口都没改。** 原计划给十几个 `Cdp*Result` 各加一行 `readonly tips?`。实现改成：`withPage`
   在运行时把 `tips` 并进返回值，工具层用 `tipsOf(value: unknown)` 取出来。少改十几处、少一层
   类型耦合，代价是"tips 存在"这件事在服务层类型上不可见——由 `browser-tips.ts` 的 JSDoc 说明。
2. **提示行只在 `defineTool` 里加一次。** 二十个工具的 `render` 全部自动获得这段，且**页面没说话时
   逐字不变**（`renderTips` 返回空串就直接用原文本）。`browser_messages` 用 `tipsInRender: false`
   关掉自动附加，自己渲染。`outputSchema` 里的 `tips` 字段同样由 `schemaWithTips` 统一注入。
3. **iframe 在页面内一次走完，而不是 host 侧多次 `Runtime.evaluate`。** 脚本自己
   `docs.push(document)` 再递归同源 iframe（≤2 层），一次往返拿全；跨域帧用 `try/catch` 跳过。
   原设计里"用 `contextId` 逐帧执行"那条路因此不需要了。

**测试抓到的一个真 bug**

"把页面上已有的提示算作基线"这条口径，第一版没写对：安装观察器时把已有节点记进了缓冲区，
却没有把 `cursor` 推过它们，于是**第一次 drain 会把"上一步留下的提示"报成本次操作的输出**。
`browser-tips.spec.ts` 里那条 `leaves messages that were already on the page out of the first drain`
正是冲它去的，装上就红。修法是安装完立刻 `S.cursor = S.items.length`。

**验证到什么程度**

- `npx vitest run`：71 文件 / 1028 用例全绿（含新增 13 个）。
- `npm run build`：`lib/host/browser-tips.js` 已产出，`browser_messages` 与 `collectPageTips`
  都出现在 bundle 里。
- **重启 DSH 后在真实环境跑通**（2026-10-12，首创 NCC1909），逐条对上第五节的验收标准：
  1. ✅ `browser_messages` 立即读到保存校验的报错，且是 error 级：`⛔ 页面提示：以下字段出现空值：…`
  2. ✅ 延迟提示由后续调用带回：`browser_type` 触发全文检索报错后，**下一次** `browser_eval`
     的末尾出现 `⛔ 页面提示：请检查全文检索配置！`（当时页面上有 3 条 toast，只报了 1 条新的）
  3. ✅ 写操作直接带：直连节点页点「查询」，`browser_click` 的返回里带出该页新弹的权限提示
  4. ✅ 静默页逐字不变：`browser_type` 在没有新提示时的返回与旧格式一字不差
  5. ✅ iframe：第 1 条读到的就是 `#mainiframe` 里的 toast —— NCC 节点页的常态，无需额外处理
  6. ✅ 基线：打开页面时弹的那条权限提示从未被误报成"刚刚发生的"

**用之前要知道的一件事**：改的是插件的宿主半，**要重启 DSH 才会生效**；当前会话里的工具集是
进程启动时定下的，不会中途多出 `browser_messages`。
