# NCC 卡片页的元素交互（文本框 / 表体单元格 / 复选框）

> **什么时候读我**：要在 NCC 卡片页上填表体的数字、勾复选框、或者把一张单据**真正保存下来**。
> 表头的参照字段（采购组织、供应商、物料…）看 `refer-field-operation.md`，本文只管其余的控件。

---

## 一、表体单元格：两段式，而且 Enter 会跳格

表体的可编辑单元格是**两段式**的：

```
显示态  td > div[fieldid="nastnum"] > .card-table-edit-td       （只有一个图标，没有 input）
   ↓ 点一下
编辑态  ... > .card-table-edit-line > input.nc-input             （出现输入框）
```

**填一个格的完整动作**：点 `.card-table-edit-td` → `browser_type` 往该格输入 → `Enter` 提交。

### 坑 1：定位必须带上行

同一个字段名在表体里出现好几次，而且**表头行和合计行用的是同一个 fieldid**。实测一页上：

```
[fieldid="nastnum"] 匹配 5 个：① 表头 ② 表头内层 ③ 行10 数据格 ④ 行30 数据格 ⑤ 合计行
```

所以要**用行键锁定**：

```css
tr[data-row-key="034720.35a78b357820a31"] [fieldid="nastnum"] .card-table-edit-td
tr[data-row-key="034720.35a78b357820a31"] [fieldid="nastnum"] input        /* 编辑态下输入 */
```

`.card-table-edit-td` 这个后缀很有用：它只匹配**数据格**，表头和合计行都没有。

### 坑 2：Enter 会确认并跳到**同一行的下一格**

这是最容易填错地方的一条。实测：

1. 点行 10 的数量 → 输入 `10` → Enter
2. 这一下**既提交了数量，又把光标送到了行 10 的无税单价**（该格已经是 `.card-table-edit-line`）
3. 此时若再按"先点格再输入"的套路去点 `[fieldid="nqtorigprice"] .card-table-edit-td`，
   第一个匹配**已经变成行 30**（行 10 的那格此刻是编辑态，不匹配 `.card-table-edit-td`）
4. 结果 `100` 填进了**行 30**，而行 10 的单价还是空的

两种写法都对，别混用：

- **跟着 Enter 走**：Enter 之后直接往"当前处于编辑态的那一格"输入（`… .card-table-edit-line input`）。
- **每次都重新点**：那就一律用**行键**选择器点名，不要依赖"第一个匹配"。

### 值的格式

填进去是 `10`，提交后显示成 `10.0000`、`100.00`，价税合计自动带千分位（`1,130.00`）——都是平台格式化，不必自己对齐。

---

## 二、复选框：状态在包装元素上，不在 `input.checked` 上

实测：点了表头的全选框之后，三行都选中了，但

```
原生 input.checked        →  false  false  false
父元素 className          →  u-checkbox is-checked …（三个都是）
```

所以**判断勾没勾要看 class**：

```js
[...doc.querySelectorAll('.u-checkbox')].filter(el => el.classList.contains('is-checked')).length
```

只看 `input.checked` 会得出"没勾上"的错误结论（这一点我踩过：以为点击没生效，其实全选成功了）。

表头的全选框点一下 = 所有行选中。

---

## 三、路上不会有原生 `<select>`

实测一张 NCC 卡片页上**可见控件只有 button 和 checkbox**；`select` 数量为 0，也没有 radio。
NCC 的"下拉"是两样东西：**自定义下拉**（包装 div）或**参照窗**（见 `refer-field-operation.md`）。
所以 `browser_select` 在这类页面上基本用不上，别按 HTML 直觉找它。

另外注意**浏览态与新增态**：保存后的单据（`status=browse`）里输入框全部收起，
可见控件只剩按钮和复选框——想测输入类的交互，得在新增态。

---

## 四、把一张单据保存下来

### 保存前的必填清单（采购订单实测）

- **表头**：采购组织、订单类型、供应商、采购部门、币种、单据状态（后三个多数有默认值）
- **表体每一行**：物料 + **数量** + **无税单价**
- 含税单价、价税合计、主数量、主含税单价…都是**算出来的**，不用填；
  但**正在编辑态没提交的格子会被当成空**——保存前把格子都 Enter 掉

### 保存与判定

1. 点 `[fieldid="Save_btn"]`
2. **成功提示是延迟的**：点完当次调用可能什么都不带，要**下一次调用**（或 `browser_messages`）才读到
   `✓ 页面提示：保存成功！`
3. 落库的硬标志：**URL 从 `#/card?scene=ADD` 变成带 `status=browse&id=…`**
4. 到库里核对（实测列名）：

```sql
SELECT b.crowno, b.nastnum, b.nqtorigprice, b.nqtorigtaxprice, b.norigtaxmny
FROM po_order_b b, po_order h
WHERE h.pk_order = b.pk_order AND h.vbillcode = '&单据号'
ORDER BY b.crowno
```

> `po_order_b` 里没有 `vbillrowno` 这类列；行号是 **`CROWNO`**（字符串），
> 数量 `NASTNUM`、无税单价 `NQTORIGPRICE`、含税单价 `NQTORIGTAXPRICE`、价税合计 `NORIGTAXMNY`。

---

## 五、这一次实测的完整结果

| 环节 | 结果 |
| --- | --- |
| 表体单元格（文本框） | 点格 → `browser_type` → Enter；数量 `10.0000`、单价 `100.00` 都提交成功 |
| 复选框 | 表头全选框一次点击 → 三行全选中（`is-checked` × 3） |
| 原生 select / radio | 页面上没有，无法测 |
| 保存 | `✓ 页面提示：保存成功！`（延迟约一次调用），URL 转为 `status=browse&id=1001E11000000097SW4W` |
| 入库 | `select vbillcode, ts from po_order order by ts desc` → 新增 **`HWDD2026101200011265`**，`TS=2026-10-12 15:24:24` |
| 明细 | `CROWNO 10 / NASTNUM 10 / NQTORIGPRICE 100 / NQTORIGTAXPRICE 113 / NORIGTAXMNY 1130`，行 30 为 `20 / 100 / 113 / 2260`，与界面逐字一致 |
