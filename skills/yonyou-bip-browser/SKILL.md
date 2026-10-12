---
name: yonyou-bip-browser
description: 用浏览器工具（browser_* 那一套，走 CDP 驱动 Yon 面板启动的调试浏览器）操作用友 BIP 旗舰版/共享服务等前台页面的技能。触发场景：要"进某个菜单节点""填一张单据""把列表抓成数据""看页面上报的什么错"这类真实页面操作，而手边只有 browser_* 工具的时候。本技能只讲旗舰版前台的 DOM 事实与操作纪律；NCC 的前台是另一条产品线，选择器与布局不相通，涉及 NCC 请用 ncc-dev。纯后端开发、元数据与表名字段名问题请用 yonyou-bip-dev。
---

# 旗舰版前台：用浏览器工具去操作

> 本技能里的选择器与数字**都来自真实环境的实测**（金隅共享 `dev-fssc.bbmg.com.cn`，
> 2026-10 用 Edge 154 + CDP 驱动）。旗舰版各版本主题不同，选择器名可能变；**用之前先
> 用 `browser_eval` 确认一遍结构**，不要照抄当常量。

## 这个技能解决什么

`browser_*` 工具能驱动使用者**已经登录好的**浏览器。旗舰版前台是个典型 SPA：菜单是 DOM 里
现成的、导航不改 URL、大量用 `div` 当按钮。这个技能把这些事实写下来，省掉每次都重新摸索。

## 开工顺序

1. `browser_targets` —— 看有哪些页面可接管。**注意 URL 和标题在这里没有定位价值**（见下）。
2. `browser_attach` 接管使用者打开的页面；要自己开新的用 `browser_open`。
3. **`browser_read` 先读一遍**。旗舰版前台的 `innerText` 会把**左侧菜单 + 内容区**一起吐出来，
   这是"我现在在哪、这页有什么"最快的一次调用。
4. `browser_snapshot` 看可交互元素（会不全，见下），或直接按文字操作。
5. 动完之后再 `browser_read` / `browser_scrape` 确认结果。

## 旗舰版前台的 DOM 事实

### ① 导航不改 URL，标题也不变

前台是 SPA：`location.href` 恒为 `https://<host>/#/`，`document.title` 也一直是站点名。
**判断"有没有进入某个节点"只能看内容区文本**，看 URL 会得出错误结论（实测中我因此把一次
成功的点击误判为失败）。

### ② 左侧导航有两套子项结构，只取一套会漏一半

```text
div.domain-cloud-wrap                     ← 一个"云"
  div.doamin-cloud-info                   ← 该云的一级项（注意类名就是 doamin，拼错的）
    span.topText-domain      "财务云"      ← 一级名
    span.topText-suffix      "管理会计"    ← 单子项的云把子项放这里
  ul.domain-list                           ← 多子项的云把子项放这里
    li > span.domain-item-text "管理会计"
    li > span.domain-item-text "财务会计"
```

**两边都取再按名去重**，才是完整菜单树。语义化的取法：

```js
// 一级
[...document.querySelectorAll('div.domain-cloud-wrap .topText-domain')].map(e => e.textContent.trim())
// 子项（两处合并）
[...document.querySelectorAll('div.domain-cloud-wrap')].map(w => ({
  domain: w.querySelector('.topText-domain')?.textContent.trim(),
  modules: [...w.querySelectorAll('ul.domain-list .domain-item-text, .topText-suffix span')]
    .filter(e => e.children.length === 0).map(e => e.textContent.trim()),
}))
```

### ③ 点一次二级模块 = 展开全套三/四级

`ul.domain-list` 一直在 DOM 里，只是视觉折叠。所以点一下「基础数据」，左侧立刻出现
「客户信息 / 供应商信息 / …」以及它们下面的「客户创建 / 供应商创建」等**四级节点**，
不用像人那样逐级 hover。已经展开的菜单项会带 `li.active`。

### ④ 全局搜索框

顶部右侧，`input[class*="searchInput"]`（placeholder 是「搜索」）。输入后**按 Enter**
直接进入第一个结果。结果下拉在 `[class*="searchWindom"]` 里，每项是 `p.name`。

### ⑤ 同名节点会同时出现在两处

例如「供应商创建」既是搜索下拉里的一项（`[class*="searchWindom"] .name`），也是左侧菜单里
的一项（`span.new-node-name`）。**按文字定位会歧义**（排序按深度，可能点错那条）——
要精确就用 CSS 区分来源。

### ⑥ "XX创建"打开的是列表页，不是空表单

点「客户创建」「供应商创建」进去，标题确实是它，但内容是：查询条件（管理组织/名称/状态）
＋ 操作按钮（新增、批改、启用、分配组织、更多）＋ 列表。**真正的录入表单要点「新增」**。

### ⑦ 大量 `div` / `li` 当按钮用，`snapshot` 枚举不全

旗舰版的菜单项、卡片、工具栏按钮多是 `div`/`li` 加 class，**既没有原生语义也没有标准
`role`**。实测某首页 13543 个元素里，`browser_snapshot` 只列得出 12 个。

**但这不影响操作**：`browser_click` / `scroll` / `get_value` 按文字定位时遍历的是**页面所有
元素**，不限于原生交互标签。所以：
- 想"看有哪些能点的"→ 别只信 `snapshot`，`browser_read` 的文本往往更全；
- 想"点某个东西"→ 用 `by:"text"` 指它**看得见的文字**，成功率很高。

### ⑧ `cursor: pointer` 不能当"可点"判据

实测 13543 个元素里 **10167 个**返回 `cursor: pointer`——祖先设了、后代继承。只取
"pointer 变更处的源头"仍有 3392 个。噪声太大，别用它做启发式。

## 操作纪律

1. **输入类控件**：优先 `id` / `name`；没有就用 `[placeholder="…"]`（`browser_snapshot`
   现在会直接给出这个选择器）。`by:"text"` 也接受 placeholder 与 aria-label。
2. **点击后先等再读**。导航是异步的，连续快照会拍到中间状态。在 `browser_eval` 里
   `setTimeout` 一两秒再读，比多调几次工具省。
3. **要滚动就用 `browser_scroll({ target })`**（元素级 `scrollIntoView`）。**别用像素滚动**：
   前台首页是固定布局 + 内部滚动容器，`window.scrollBy` 无效（实测 `scrollY` 恒为 0、`maxY` 也是 0）。
4. **别把页面上的后端报错当页面故障**（见下）。
5. **只在已登录的页面上动**；不要提交真实单据，除非使用者明确要求。

## 页面上的后端报错要读出来并转述

旗舰版会把后端异常**原样渲染在页面里**。实测样例：

```text
状态码: 999-999-999999
RuntimeException of server: org.springframework.dao.DataAccessResourceFailureException:
### Cause: dm.jdbc.driver.DMException: Communication error
### The error may involve com.yonyou.ucf.mdd.ext.uimeta.metaMapper.getUserAuthLevel
### SQL: select  authLevel  from usertype_authlevel where userType=?
链路ID:85d0ec70733bb361
```

看到这类内容要**原话报给使用者**（哪个库、什么错、链路ID），并说明这是**环境/后端问题**，
不是浏览器操作出错。达梦（DM）连接失败是最常见的一种，会导致列表显示"暂时没有数据哦~"。

## 边界

- 本技能服务**旗舰版前台**。NCC 的前台是另一套界面与选择器，请用 `ncc-dev`。
- 表名、字段名、实体、元数据这类问题不要靠看页面猜，用 `yonyou-bip-dev` 或 `bip_meta_*` 工具。
- `browser_close` **拒绝关闭使用者自己开的页面**——这是设计，不是故障。

## 待补充（下次做到时往上加）

- 单据录入表单的控件特征（参照选择器、日期、金额、表格内编辑）——还没实测
- 列表页的分页/排序/筛选，以及「更多」下拉里的操作
- 弹窗、抽屉、右侧滑出面板里的表单
- 附件上传、富文本、图片控件
- 保存后的校验提示与错误定位方式
- 不同 BIP 版本 / 主题下选择器名的差异
