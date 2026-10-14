---
name: ncc-spr-recording
description: 在 NCC（NC Cloud）环境里录制 SPR 性能报告并取回报告——从工作台头像菜单开/关录制，用 browser_* 驱动目标业务操作，结束后接住自动弹出的 `/spr/temp/*.html` 报告页签。触发词：录 SPR、SPR 录制、开录制、结束录制、抓一份性能报告、这个操作慢录一下看看、SPR 报告在哪下载。**只负责录制这一段**；报告拿到之后怎么读（慢在哪层、慢 SQL 指纹、报错区分流）看 `ncc/ncc-dev/references/scenarios/spr-log-analysis.md`。旗舰版（BIP / YonBIP）是另一条产品线，它没有 SPR，对应的是 YMC 操作录制，见技能 `yonyou-bip-recording`。
---

# 录制 SPR 性能报告（NCC）

> 本技能管**前半段**：把 SPR 打开、让目标操作落在录制窗口里、结束、把报告页签拿到手。
> **报告拿到之后怎么分析**不在本技能——照
> `ncc/ncc-dev/references/scenarios/spr-log-analysis.md`（用 `knowledge_read` 传该路径读全文）走。
> 两篇是前后半段，**交接物就是那个报告 URL**。

## 一、录制是什么

SPR 是 NCC 服务端的**性能采集开关**：打开后服务端开始记录**录制窗口内**的远程调用 / SQL / 耗时；
关闭时生成一份 HTML 报告并自动弹出一个新页签。窗口**默认 20 分钟**，由系统参数 `maxsprtime` 控制
——**超时的操作录不到**。

所以顺序永远是：**先开录制 → 再操作 → 再结束**，反了就只能重录。

## 二、三步

### 第 1 步：开始录制

入口在工作台右上角的**头像菜单**里，不是独立按钮：

| 元素 | 定位 |
| --- | --- |
| 头像 | `DIV.avatar_container`（约 33×39，内含 `IMG.img-avatar`） |
| 菜单抽屉 | `DIV.ant-drawer.ant-drawer-right.ant-drawer-open`，另带 `nc-workbench-all-app` 类 |
| 菜单项 | `.link-box-item-content` → `.link-box-item-left` → 里面的 `span`，文字是「录制SPR」 |

`browser_click` 的真实指针点头像**能穿透一层 iframe**，可以直接用。

**但头像有时点不动**——实测发生过：`browser_click` 返回「按下的那一点底下是 div（与目标无关的另一个元素）」，
抽屉根本不出现；派发 `KeyboardEvent` 模拟热键 `ctrl + ~` 也无效（三种组合都试过，`SHOWSPR` 一动不动）。

这时**直接调到组件方法**。`.spr-record` 元素上挂着 React fiber，**往上退一层** `stateNode`
就是那个持有 `handleSprClick` 的组件实例：

```js
// browser_eval —— 开始 / 结束都靠它，一次调用翻转一次状态
(async () => {
  const inner = document.querySelector('#forwardFrame').contentDocument;
  const el = inner.querySelector('.spr-record');
  const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  let fiber = el[key], inst = null, d = 0;
  while (fiber && d < 20) {                       // ⚠️ 必须往上找：depth 0 是 div，stateNode 是 DOM 元素本身
    if (fiber.stateNode && typeof fiber.stateNode.handleSprClick === 'function') { inst = fiber.stateNode; break; }
    fiber = fiber.return; d++;
  }
  if (!inst) return 'not found';
  const before = { SHOWSPR: inner.defaultView.localStorage.getItem('SHOWSPR') };
  inst.handleSprClick();                          // 翻转状态 + 发 start.do / end.do
  await new Promise(r => setTimeout(r, 4500));
  return JSON.stringify({ depth: d, before, after: { SHOWSPR: inner.defaultView.localStorage.getItem('SHOWSPR') } });
})()
```

`handleSprClick` 读的是**点击前**的 `SHOWSPR`：`"true"` 走开始、`"false"` 走结束——
所以同一个调用**既能开也能关**，一个方法就是全部开关。
组件实例上还有 `handleSprOver` / `handleSprOut` / `modifySPR` / `handleHotKey` 可供排查。

**怎么确认已经开录**（三个都能验，任选其一即可）：

```js
// browser_eval
JSON.stringify({
  showSpr: localStorage.getItem('SHOWSPR'),   // 开录后是 "false"
  sprTime: localStorage.getItem('sprTime'),   // 开录后是开始时刻，如 "2026-10-14 20:47:14"
  recBtn: (() => { const e = document.querySelector('.spr-record');
                   return e ? getComputedStyle(e).display : null })()  // 开录后是 "block"
})
```

`SHOWSPR` 是个**反着的开关**：`"true"` = 没在录（录制按钮隐藏），`"false"` = 正在录（按钮显示）。
别把它当"是否开启"来读。同时菜单项文字会从「录制SPR」变成「结束录制sprctrl + ~」。

> ⚠️ **不要用改 `localStorage` 的办法开关录制。** 实测渲染逻辑是：先取旧的 `SHOWSPR`，
> 翻转后写回存储，**然后按那个旧值去调服务端接口**。只手改存储不会发出录制请求，
> 只会让界面状态和真正在录的东西对不上。要么点界面，要么直接打接口（见第四节）。

### 第 2 步：在窗口内做目标操作

录制期间照常用 `browser_*` 驱动页面，**你操作的耗时就是被记录的耗时**，所以要把"用户说慢的那一下"
完整做进去。窗口只有 20 分钟，操作多就先规划顺序。

### 第 3 步：结束录制、接住报告

两个入口等价：

> ⚠️ **结束这一步必须用真实指针点（`browser_click`），不要用 `browser_eval` 调 `handleSprClick()`。**
> 实测差别是决定性的：`browser_eval` 里调完，服务端**确实收到了 `end.do`**（`performance` 里能看到请求、
> `SHOWSPR` 也翻回 `"true"`），但**报告页签不会弹**——因为结束分支里有一句
> `window.open("","_blank")` 用来预先占住那个窗口，而 `window.open` 需要**用户手势（user activation）**，
> 从 `browser_eval` 里发起不算，被浏览器静默拦掉。改用 `browser_click` 点 `.spr-record`，同一个动作
> 页签就正常弹出。
>
> **开录时没有这个问题**（开录不开窗口），所以"用 fiber 开、用真实点击关"是最省事的组合。

- 录制期间页面右上角出现的红色按钮 `.spr-record`（内含 `.iconContainer-spr > i.iconfont.icon-luzhi1`）；
- 头像菜单里那句「结束录制sprctrl + ~」。

结束后**会自动打开一个新页签**，地址形如：

```
http://<host>:<port>/spr/temp/<用户pk>_<yyyyMMddHHmmss>.html
```

> ⚠️ **别靠标题找这个页签。** 它是 `window.open("","_blank")` 预留出来的窗口，标题经常还留着
> 上一个页面的文字（实测弹出来时标题是「工作桌面设置-搜索应用菜单项（只搜索四级菜单）」）。
> **按 URL 里的 `/spr/temp/` 认**——在 `browser_targets` 里筛这个片段最稳。

结束后的状态：`SHOWSPR` 回到 `"true"`、`.spr-record` 重新隐藏、`sprTime` 被覆盖成字符串 `"true"`。
**想留开始时刻，要在开录时就先抄下来。**

## 三、报告怎么取出来

报告页本身就是完整报告（UTF-8，约 300 KB）。顶部有 **「保存到本地」**（`href="javascript:download()"`）
和 **Email**。Email 那个链接最有用——它的 `mailto:` body 里写着真正的下载地址：

```
http://<host>:<port>/spr/download?param=<报告文件名>
```

| 取法 | 怎么做 | 什么时候用 |
| --- | --- | --- |
| **读** | 页签就是报告，直接 `browser_eval` 按锚点/表取数（取数配方见 spr-log-analysis.md 第六节） | 就地分析，最快 |
| **下** | `GET /spr/download?param=<报告文件名>` | 要留档、要 `grep`、要离线看 |

> `/spr/*` 是 **servlet 映射，不是磁盘目录**——`/spr/` 根返回的是 NCC 自己的「页面出错啦！」404 页。
> 所以**不要去文件系统里找报告**。实测找过的地方全都没有：客开 `hotwebs` 目录、Home 的
> `hotwebs/nccloud/spr`、整个 NCC home、以及 `E:/data`。报告是可访问的服务端产物，按 URL 取就对了。

## 四、接口（界面点不动时的兜底）

界面上的「录制SPR」最终就是这两个请求：

| 动作 | 请求 | 关键参数 |
| --- | --- | --- |
| 开始 | `POST /nccloud/platform/spr/start.do` | `sysAppcode: "10228888"`；`info: {name:"spr", appcode:"10228888", action:<开始文案>}`；`data: {oprtime: "YYYY-MM-DD HH:mm:SS", userid: <用户pk>}` |
| 结束 | `POST /nccloud/platform/spr/end.do` | 同构，`action` 换成结束文案 |

`start.do` 成功时返回的开始时刻会被写进 `localStorage.sprTime`。

> 直接打接口**能录，但界面状态不会跟着变**（`.spr-record` 不出现、菜单文字不变）。
> 能用界面就用界面；只有界面点不动时才退到接口，并且自己记住已经开录。

**用户 pk** 就是当前登录用户主键，形如 `1001A110000000002D4C`——它同时出现在报告文件名里，
拿报告名就能反查是谁录的。

## 五、操作纪律（踩过的坑）

1. **写操作前先把目标页签切到前台**（纯读不切，别抢用户焦点）。
2. **iframe 有两层**：外层 NCC 工作台 → `#forwardFrame`（yonbip 壳）→ `#mainiframe`（内层业务页）。
   - 真实指针**能穿透一层**：点头像、点菜单项没问题；
   - 进到 `#mainiframe` 里的按钮再**按文字**点，坐标换算会偏，报 `not-hit`（提示"指针底下是目标本身，
     但点不在它的框里"）。这时改用 `browser_click` 的 **`mode: "dom"`**。
   - `browser_set_value` **不穿透 iframe**（会报"不是输入框"）。要填内层搜索框，用 `browser_eval`
     走原型 setter，再 dispatch 一个 `input` 事件：
     ```js
     (() => {
       const inner = document.querySelector('#forwardFrame').contentDocument;
       const w = inner.defaultView, el = inner.querySelector('input.search-input');
       Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, '总账');
       el.dispatchEvent(new w.Event('input', { bubbles: true }));
       return el.value;
     })()
     ```
3. **抽屉别用 `.ant-drawer` 裸选。** 工作台上常有多个滑出抽屉，返回的那个 `transform` 可能已经把
   内容推到屏幕外（实测 `matrix(1,0,0,1,-2268.2,0)`），取到的是错的那个。**按菜单文字找**。
4. **下拉项的文字可能被拆开**（`<span style="color:red">总账</span>结账`），按整串文字点会落空。
   改用 CSS + 下标定位更稳：`.wui-dropdown.panel-show .menu-item`，`index: 1`。

5. **NCC 的应用菜单：要派发完整的鼠标事件序列，只 dispatch 一个 `click` 不够。**
   - 菜单按钮 `DIV.nc-workbench-allAppsBtn`（0,0 54×39），**是切换语义**——连点两次会又关上。
   - `browser_click` 的 `mode:"dom"` 对它时灵时不灵；真实指针只在元素**还在视口里**时有效
     （菜单收起是把容器**平移到屏幕外**，坐标变成负两千多，`scrollIntoView` 对它无效）。
   - 可靠写法：

     ```js
     const fire = (el) => {
       const opts = { bubbles: true, cancelable: true, view: inner.defaultView };
       ['mouseover','mouseenter','mousemove','mousedown','mouseup','click']
         .forEach(t => el.dispatchEvent(new inner.defaultView.MouseEvent(t, opts)));
     };
     fire(inner.querySelector('.nc-workbench-allAppsBtn'));  // 打开菜单
     fire(base.closest('.list-item-content') || base);       // 点一级，如「基础数据」
     ```

   - **菜单是三层，但第三层不是子菜单**：一级 `.list-item-content`（「基础数据」）→
     二级 `.content-item`（`.content-item-header span` 是分组名，如「客户信息」）→
     **第三层是 `.item-app` 应用格子**（`title` 属性是应用名）。**分组本身点不开、也没有子菜单**，
     别对着它 hover 或反复点——点它只会把菜单收起来。

6. **NCC 里"客户档案"不叫客户档案，叫「客户-集团」/「客户-业务单元」。** 实测路径：
   `全部应用 → 基础数据 → 客户信息 → 客户-集团`，打开后 `#mainiframe` 的 URL 是
   `/nccloud/resources/uapbd/customer/customer_grp/router/index.html#/list?urlKey=10140CUG-10140CUG_list-10141036`。
   找不到某个档案时，先想它在 NCC 里**叫什么后缀**（`-集团` / `-业务单元` / 申请单 / 分类），再决定去哪一层找。
   应用格子可以直接按 title 选：`inner.querySelector('.item-app[title="客户-集团"]')`。

7. **NCC 参照（F7）字段的选法**：点输入框会先出一个小下拉（`.refer-popover`），里面有
   「打开参照弹窗」/「新增」；点 `.openshow` 才弹出带树的 `refer-pop-window`。
   树节点 `.wui-tree-treenode` 点中后会带 `wui-tree-treenode-selected`；
   **确定按钮在 `.refer-popover .sure-btn`**（文字「确定(Y)」），不在 `refer-pop-window` 里面——
   按 `.refer-pop-window` 找按钮会一个都找不到。确认关闭看 `getBoundingClientRect()` 全 0。

## 六、实测样本（2026-10-14，首创 NCC 环境）

| 项 | 值 |
| --- | --- |
| 开始 → 结束 | 20:47:14 → 20:50:05（约 3 分钟，远在 20 分钟窗口内） |
| 用户 pk | `1001A110000000002D4C` |
| 报告 | `/spr/temp/1001A110000000002D4C_20261014205004.html`，`Content-Length: 298819` |
| 录进去的操作 | 打开「总账结账」节点 → 点「结账检查报告」 |
| 报告概要 | 页面渲染 6 次、服务端 1326 ms、远程调用 11 次、SQL 215 条、结果集 27773 行、事务 27、**是否存在错误 = YES**（假警报，见分析篇第四节） |
| 可重复访问 | 事后 `GET` 仍 `200`，带 `Last-Modified: Wed, 14 Oct 2026 12:50:05 GMT`（= 北京时间 20:50:05） |

**第二次实测（同日 22:38，录"新建客户档案"只录保存那一下）**：

| 项 | 值 |
| --- | --- |
| 开始 → 结束 | 22:38:09 → 22:38:28（约 19 秒，窗口内只有一次保存） |
| 报告 | `/spr/temp/1001A110000000002D4C_20261014223828.html` |
| 页签标题 | **「客户信息卡片保存」**——这次标题就是业务操作名，比第一次好认 |
| 录进去的操作 | **1 个**：「客户信息卡片保存」（正是"只想录保存"要的效果） |
| 报告概要 | 页面渲染 3 次、服务端 223 ms、远程调用 1 次、SQL 84 条、结果集 56 行、事务 8、调用 NCLocator 27 次、**是否存在错误 = YES** |
| 耗时分布 | NC 70%、数据库 23%、后端 web 7%、网络 0% |

> **报告文件名里的时间戳是"结束时刻"，不是开始时刻。** 这次 `sprTime` 记的是 `22:38:09`，
> 文件名却是 `_20261014223828`。想事后按时间找报告，按结束时间猜。

## 七、还没验过的

- **一份报告里多个业务操作**（"一报告一操作"已验过两次，多操作还没做过）
- **报告页签被拦掉之后能不能补救**：实测**猜 URL 不行**。拿
  `/spr/temp/<用户pk>_<时间戳>.html` 用 `fetch(..., {credentials:'include'})` 打过去，
  时间戳不对是 **`404`**（NCC 自己的「页面出错啦」页），格式对但报告还没生成时是 **`403`**。
  **报告 URL 只能从弹出的页签（或 `end.do` 的响应）拿，事后拼不出来**——所以结束那一下千万别用
  `browser_eval` 代替真实点击，弹不出来就只能重录。
- 录制窗口跑满 20 分钟时的行为（自动结束，还是丢掉尾部）
- 直接打 `start.do` / `end.do` 时，界面与报告内容是否一致
- 非首创环境（NCC2111 / 2312 / 其他客户皮肤）上头像菜单与 `.spr-record` 是否同构

遇到新形态先确认再补进本文件，别把首创的实测结论当通用事实。
