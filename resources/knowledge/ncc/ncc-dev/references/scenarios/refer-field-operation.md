# NCC 参照字段的界面操作（打开 / 选值 / 变更）

> **什么时候读我**：要在浏览器里打开、选择或**变更**一个 NCC 参照字段的值；
> 或者驱动 NCC 卡片页 / 列表页时遇到"点了没反应""参照窗是空的""值改不动""弹框关不掉"。
> 开发视角的参照过滤（`queryCondition`、`TreeRefActionExt`）看 `ref-model.md`，本文只讲**界面怎么操作**。

---

## 零、先明确四件事（决定后面一半的坑）

1. **参照不是下拉框，是全屏浮层。** 打开后是一个浮层 `.refer-pop-window`，
   容器 fieldid 形如 `<字段名>_refer-window`（如 `pk_org_v_refer-window`），内部是
   左侧分类树 + 搜索框 + 表格 + 确定/取消。
2. **参照字段有两种形态，切换是显式的一步。**
   - **显示态**（字段有值时）：`<span class="refer-display">值</span><i class="iconfont icon-canzhaozuixin">`
   - **编辑态**：`input.nc-input.refer-input` + `<span class="icon-refer">`
   显示态下**点它不会打开参照**（合成鼠标事件无效，见第三节）；必须先把字段切到编辑态。
3. **变更组织这类主组织字段，选完值还会再弹一层确认框。**
   实测弹出：`提示信息 / 确认修改 / 是否修改组织，这样会清空您录入的信息？`（`.u-modal-dialog` + `.u-modal-backdrop`）。
   **这一层不处理，值不算真正改掉**：点「确定(Y)」才生效（值保持新组织、框自动关闭、字段回到显示态），
   点「取消(N)」则回滚到原组织。
   **首次给空字段选值不弹框，只有"已有值再改"才弹。** 详见第四节。
4. **节点页跑在工作台的 iframe 里。** 参照字段、连同上面那层弹框，都在
   `#mainiframe` 的 `contentDocument` 里，不在主文档；操作前先
   `document.querySelector('#mainiframe').contentDocument`。

---

## 一、完整流程（实测：采购订单卡片「采购组织」从 A 组织变更到 B 组织）

字段定位：采购订单卡片上的采购组织是 `[fieldid="pk_org_v"]`
（注意：列表页**查询区**里的采购组织是 `pk_org`，不是同一个字段）。

```
1. 判断形态        field.querySelector('.refer-input') 存在 → 编辑态，跳到第 3 步
2. 显示态 → 编辑态  调 span.refer-display 的 React props：onFocus + onKeyDown(Enter)
3. 打开参照窗      合成 mousedown/mouseup/click 点 .icon-refer
4. 选值            搜索框输入编码 → 定位行 → 对行内每个 td 派发鼠标事件 → 点 .sure-btn
5. 处理确认框      「是否修改组织，这会清空您录入的信息？」→ 确定(Y) 应用 / 取消(N) 回滚
6. 验证            读 .refer-display 文本（或 .hidden-input 的值）
```

### 1–2. 显示态切编辑态（关键一步）

`span.refer-display` 上挂着 React 的 props（键名 `__reactEventHandlers$*`），其中
**`onFocus` 与 `onKeyDown` 都是函数**，调用它们即可切到编辑态：

```js
const span = field.querySelector('.refer-display');
const props = span[Object.keys(span).find(k => /^__reactEventHandlers/.test(k))];
const ev = { target: span, currentTarget: span, stopPropagation(){}, preventDefault(){}, nativeEvent:{} };
props.onFocus({ ...ev, type: 'focus' });
props.onKeyDown({ ...ev, type: 'keydown', key: 'Enter', keyCode: 13, which: 13 });
// 之后 field 内出现 input.refer-input 与 .icon-refer
```

**不要指望这两条路**（都实测失败）：

- 合成 `MouseEvent('click')` / `dblclick` 派发到 `.refer-display`、`.refer-display-wrapper`
  或 `i.iconfont`：没有任何反应。
- `.form-item-control` 的 props 里**确实有一个 `onClick` 键，但它的值不是函数**
  （`typeof props.onClick !== 'function'`），调用会抛 `is not a function`。
  早期一次排查里它被误判成"调用成功"，实际是判断写成了 `props.onClick && props.onClick(ev)` 后
  无条件记录成功——真正的触发者是 `onKeyDown(Enter)`。

### 3. 打开参照窗

```js
const click = el => ['mousedown','mouseup','click'].forEach(t =>
  el.dispatchEvent(new W.MouseEvent(t, { bubbles:true, cancelable:true, view:W, button:0 })));
click(field.querySelector('.icon-refer'));
```

判断参照窗是否打开：**用 `getBoundingClientRect().height > 10`**，
不要用 `offsetParent`——参照窗打开时（2552×1230、`display:flex`）`offsetParent` 仍然是 `null`。

### 4. 在参照窗里选值

- **搜索框不一定能用，先看它走不走全文检索。** 采购组织版本参照的搜索是按编码前缀过滤的，
  实测有效（搜「首创环保集团」返回空，搜 `101001` 出 `10100110 / 10100114 / 10100115`）；
  **供应商档案参照的搜索走全文检索服务，开发环境通常没配**，一触发就弹
  `请检查全文检索配置！`（一闪而过），列表纹丝不动——详见第三节坑 8。
  输入要用原生 setter + `input` 事件，否则 React 不认：
  ```js
  const setter = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '10100114');
  inp.dispatchEvent(new W.Event('input', { bubbles: true }));
  inp.dispatchEvent(new W.KeyboardEvent('keydown', { bubbles:true, key:'Enter', keyCode:13 }));
  ```
- **表格第一列是序号，第二列才是编码**——按"第一个 td 等于编码"去找行会找不到。
- **选中要打到每个 `td` 上**，只点 `tr` 不够：
  ```js
  const row = [...win.querySelectorAll('tr')].find(r => /10100114/.test(r.innerText));
  [...row.querySelectorAll('td')].forEach(click);
  ```
  选中后 `[class*=selected]` 的文本会变成「已选：（1）…」，可以据此确认。
- 收尾点 `.sure-btn`（确定）或 `.cancel-btn`（取消）。

---

## 二、参照窗内部结构速查

**先判断这个参照是哪一种形态**——它决定你接下来该点哪里、要不要等右侧出数据：

| 形态 | 实例 | 怎么选值 |
| --- | --- | --- |
| **纯列表** | 交易类型参照（订单类型 `ctrantypeid`） | 打开就有数据，右侧表格选行 → 确定 |
| **分类 + 列表** | 供应商档案（`pk_supplier`） | **先点左侧分类**（不点右侧恒为空）→ 右侧出列表 → 选行 → 确定 |
| **纯树选择** | 部门版本（采购部门 `pk_dept_v`） | **右侧没有列表**（`win.querySelectorAll('table').length === 0`），直接在左侧树里选中节点 → 确定 |

| 部位 | 选择器 | 说明 |
| --- | --- | --- |
| 浮层容器 | `#<字段名>_refer-window` / `.refer-pop-window` | fieldid 定位最稳 |
| 分类树 | 可点项是 `.refer-tree-title`；页签 `.u-tabs-tab`（常用 / 全部） | **供应商参照必须先点这里**（不点右侧恒为空）；"常用"页签也可能是空的 |
| 搜索框 | `input.search-input`；旁边 `.refer-search-i`（放大镜）、`.refer-del-i`（清空） | 不是每个参照都有（交易类型参照就没有）。**能否过滤取决于实现**：采购组织版本参照按编码前缀有效；供应商档案参照走全文检索，环境未配置时直接失效（坑 8） |
| 表格 | `table tr`（首行表头、末行分页） | 第一列序号、第二列编码 |
| 确定 / 取消 | 采购组织、供应商参照是 `.sure-btn` / `.cancel-btn`；**物料(多版本)参照的按钮没有这两个 class**（`u-button.button-primary`，文本「确定」）——按文本找最稳 |
| 已选计数 | `[class*=selected]` | 文本形如「已选：（1）」 |

---

## 三、坑（都是实测踩出来的）

1. **可见性别用 `offsetParent`。** 参照窗、`ant-drawer` 这类浮层打开后 `offsetParent` 仍可能为 `null`，
   用 `getBoundingClientRect()` + `getComputedStyle`。
2. **iframe 内不要用坐标点击。** NCC 节点页全在工作台 `#mainiframe` 里，
   实测坐标点击会**少算 iframe 在主文档中的 y 偏移**（本例 44px，正好是工作台顶栏高度），
   工具报"已点击 input"、事件实际落在目标上方 44px 的 `.search-top` 上。
   iframe 内一律用 DOM 事件（合成 `mousedown/mouseup/click` 对参照相关控件是有效的）。
3. **工作台应用菜单抽屉会自己收起。** `.all-apps-layout` 的 x 会变成 `-2093`（移出屏幕），
   此时点左栏应用毫无反应；先点左上角 logo（`.nav-left .nc-workbench-allAppsBtn .nc-workbench-icon`）
   把抽屉唤出来再点。
4. **参照窗空，先看左侧分类点了没有——多数情况不是权限问题。**
   **供应商参照**打开后右侧默认就是空的（只有表头 + 序号，共 2 行），
   **必须先点左侧分类**（`.refer-tree-title`，如「01 内部供应商」「02 外部供应商」）才会加载数据
   （实测：点完 2 行 → 102 行）。而且**每打开一次都要重新点**，它不记忆上次的分类。
   合成 `mousedown/mouseup/click` 打到 `.refer-tree-title` 即可，点完该节点会出现选中态。
   —— 这里绕过一次大弯：把"右侧空"误判成数据权限问题，还去库里核对半天。
   只有**点完分类仍为空**时，才往权限 / 组织过滤方向查（用 `datasource_query` 对照库里有没有数据）。
   另外注意：**树选择型参照根本没有右侧列表**（如部门版本，`win.querySelectorAll('table').length === 0`），
   此时"右侧空"是它的正常形态，别等数据——直接在树里选中节点再点确定。
   部门参照的树要逐级展开：点组织节点（`10100110 …分公司`）才会出现 `01 公司领导 / 02 业务部 / 0202 本部 …`，
   展开一次后同级节点即可直接点选（实测选中「0202 本部」，字段值取到「本部」）。
5. 参照字段的值一旦选定，卡片上不会自动回到编辑态，也不会因为点一下文字就重新打开——
   变更必须走第一节第 2 步。
6. **只看字段 DOM 会漏掉模态弹框。** 判断"这一步成没成"时，别只读目标字段，
   要顺手扫一遍可见的 `.u-modal-dialog` / `.u-modal-backdrop` / `.ant-drawer-mask`——
   它们可能是全屏遮罩，既挡住后续点击，也说明业务还停在"等你确认"的状态。
7. **确认框「先取消、再确定」会让它残留。** 实测：变更组织弹出确认框后点「取消(N)」，
   字段回滚到原组织，但那个框**不消失**，之后再点「确定(Y)」既不改值也不关框，只能刷新页面恢复。
   单独验证过：用"直接调 React props 切编辑态"这条绕路 + 直接点「确定(Y)」，
   弹框**能正常关闭、变更正常生效** —— 所以框卡住的原因是"先取消又确定"的操作顺序，
   不是绕路本身。确认框弹出后，**选定一个按钮点到底，别来回试**。
8. **参照里的搜索可能整个不可用（全文检索未配置）。** 在供应商参照的搜索框里输入关键词，
   无论用合成 `input` 事件、`browser_type` 真实输入、敲回车，还是点放大镜 `.refer-search-i`，
   列表都纹丝不动（实测一直 102 行）。原因不在操作：**它走的是全文检索服务，开发环境没配** ——
   每次触发搜索，页面会弹一条 **`请检查全文检索配置！`** 的 toast
   （`.toast-content`，外层 `.toast-modal.danger`）。这条 toast 一闪而过，极容易被当成无关提示忽略；
   **排查"参照搜索没反应"时，先把页面上的 toast 扫一遍**（`[...doc.querySelectorAll('.toast-content')].map(e=>e.textContent)`）。
   搜索不可用时，找指定档案只能靠"点分类 + 逐页翻"。
   **实时盯 toast 的完整方法（含可直接粘贴的代码）见 `page-feedback-watch.md`** ——
   别等到"没数据"才想起去看提示。

---

## 四、变更组织时的确认框（实测）

> **这是"主组织类字段"专属的一层。** 普通参照不弹框：订单类型 `ctrantypeid`
> （参照窗标题「交易类型参照」）实测首次选值 `21-01 普通采购`、再变更为 `21-02 直运采购`，
> **两次都没有确认框、没有遮罩**，选完点 `.sure-btn` 即生效，字段还停在编辑态。
> 只有采购组织这类主组织字段才会弹「是否修改组织」。

弹框长这样（在 iframe 内）：

```
提示信息
确认修改
是否修改组织，这样会清空您录入的信息？
                          [确定(Y)] [取消(N)]
```

DOM：`.u-modal-dialog`（410×201）+ 全屏 `.u-modal-backdrop`（遮罩 2552×1230），
外层还有 `.nc-modal.disabled-bg-btn.prompt-box`。

**触发条件**：字段**已有值再改**才弹。给空字段首次选值不弹（实测：空 → 水汇智造分公司，无弹框）。

| 操作 | 实测结果 |
| --- | --- |
| 点「确定(Y)」 | **变更生效**：值保持新组织、确认框与遮罩一起关闭、字段回到显示态。两条路径都验证通过：① 字段本来就在编辑态；② 显示态先用 props `onFocus+onKeyDown` 切编辑态 |
| 点「取消(N)」 | 字段**回滚**到变更前的组织；**但那个框会残留**（不消失），此后点「确定(Y)」既不改值也不关框，只能刷新页面恢复 |

> ⚠️ 因为这一层确认框的存在，**"读到字段显示成新组织"不等于"组织已经改掉了"**。
> 中途读到的值只是编辑态里的临时值；判断结果要等确认框处理完，再看一次字段值
> （变更落地的标志：确认框消失 + 字段回到显示态）。

---

## 五、最小可复现片段

```js
const d = document.querySelector('#mainiframe').contentDocument;
const W = d.defaultView;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = el => ['mousedown','mouseup','click'].forEach(t =>
  el.dispatchEvent(new W.MouseEvent(t, { bubbles:true, cancelable:true, view:W, button:0 })));

const field = d.querySelector('[fieldid="pk_org_v"]');

// 1) 显示态 → 编辑态
if (!field.querySelector('.refer-input')) {
  const span = field.querySelector('.refer-display');
  const p = span[Object.keys(span).find(k => /^__reactEventHandlers/.test(k))];
  const ev = { target: span, currentTarget: span, stopPropagation(){}, preventDefault(){}, nativeEvent:{} };
  p.onFocus({ ...ev, type:'focus' });
  p.onKeyDown({ ...ev, type:'keydown', key:'Enter', keyCode:13, which:13 });
  await sleep(1500);
}

// 2) 打开参照窗
click(field.querySelector('.icon-refer'));
await sleep(2000);
const win = d.querySelector('#pk_org_v_refer-window');
if (!win || win.getBoundingClientRect().height < 10) throw new Error('参照窗未打开');

// 3) 搜索（只认编码）→ 选中 → 确定
const inp = win.querySelector('input.search-input');
const setter = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set;
setter.call(inp, '10100114');
inp.dispatchEvent(new W.Event('input', { bubbles:true }));
inp.dispatchEvent(new W.KeyboardEvent('keydown', { bubbles:true, key:'Enter', keyCode:13 }));
await sleep(2000);

const row = [...win.querySelectorAll('tr')].find(r => /10100114/.test(r.innerText));
[...row.querySelectorAll('td')].forEach(click);
await sleep(800);
click(win.querySelector('.sure-btn'));
await sleep(2000);

// 4) 处理确认框（变更组织必过的一关）
const dlg = d.querySelector('.u-modal-dialog');
if (dlg && dlg.getBoundingClientRect().height > 5) {
  const ok = [...dlg.querySelectorAll('button')].find(b => /确定/.test(b.textContent));
  click(ok);                       // 取消则回滚到原组织
  await sleep(2000);
}

// 5) 验证
field.querySelector('.refer-display').textContent;   // → 新的组织名
```

---

## 六、表体（明细行）的参照单元格

表头和表体的参照**操作方式不一样**，表体是"两段式"：

```
1. 定位行       <tr data-row-key="...">；字段容器仍是 [fieldid="pk_material"]，
                多行同名，必须靠行元素的 data-row-key 区分，不能只取第一个
2. 增行         [fieldid="Material_AddLine_btn"]（"增行"），点完多一行空行
3. 进编辑态     点 .card-table-edit-td —— 显示态只有 .refer-icon；点一下变成
                .card-table-edit-line，出现 input.refer-input
4. 打开参照窗   点单元格里的 .icon-refer
5. 选值         先点**叶子分类**（见下），再选行 → 确定
6. 验证         单元格里出现编码；同行的物料名称 / 单位等会被联动带出
```

实测（采购订单新增，采购组织=水汇智造分公司）：增行后新行行号 `30`；
点单元格 → 出现 `input.refer-input`（placeholder `物料(多版本)`）；
点 `.icon-refer` 打开参照窗 → 选中物料 `0101019999` → 确定，
该行变为 `30 | 0101019999 | 钢丝绳牵引式格栅除污机-物料 | 个 | 13.00`（名称、单位联动带出）。

**物料参照必须点到"最末级"分类才出数据。** 中间层分类（`01 水处理设备及装置`、
`0101 格栅设备`）点完右侧仍是空的（只剩表头）；一路展开点到叶子
（`010101 钢丝绳牵引式格栅除污机`）才出那一行。
供应商参照则是**一层分类就出数据** —— 别把两者的层级假设互相套用。

表体参照窗**没有 `<字段>_refer-window` 这个 id**，用可见的 `.refer-pop-window` 定位。

**两个容易卡住的细节（实测）：**

- **这个参照的"确定"按钮没有 `.sure-btn`。** 物料(多版本)参照的按钮是
  `u-button button-primary`，文本就是「确定」——**按文本找按钮**最稳，别只认 `.sure-btn`
  （采购组织、供应商参照才是 `.sure-btn`）。同一排还有「已选：N」「清空」「设为常用」。
- **怎么判断哪个分类是"叶子"**：看 `li` 里有没有 `ul.u-tree-child-tree`（有子节点 = 非叶子，
  点了不加载数据）。点中叶子后，`li` 的 class 会从 `u-tree-treenode-close` 变成
  `u-tree-treenode-selected u-tree-treenode-open`，右侧行数随之变化——**用这个确认点击是否真的生效**，
  而不是急着怀疑"这个分类没数据"。

实测复核（全部由脚本点击完成）：展开 `01 水处理设备及装置` → 展开 `0101 格栅设备` →
点 `010101 钢丝绳牵引式格栅除污机`（叶子），`li` 变为 `u-tree-treenode-selected u-tree-treenode-open`，
右侧 3 行 → 5 行，出现 `0101019999`；选中该行（`.u-table-row.refer-selected-row`）→ 点「确定」，
表体对应行的物料编码、物料名称、单位被一并填上。

---

## 七、本文未覆盖

- 多选参照（`isMultiSelectedEnabled`）、树形参照（`refType == 'tree'`）的操作差异
- 带"业务单元"页签的参照（`isShowUnit` / `unitCondition`）
- 列表页**查询区**参照（fieldid 与卡片不同，如采购组织在查询区是 `pk_org`）
- 确认框在"真实鼠标点击"路径下的行为（受 iframe 坐标偏移所限，本次未能用真实指针验证；
  但已用 DOM 事件在"字段本来就在编辑态"和"props 切换编辑态"两种情况下验证通过）
