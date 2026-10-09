# NCC 前端脚手架 · 编码、工具与已知坑

> **什么时候读我**：**动手改任何文件之前**先扫一遍。也用于排查"中文注释为什么是问号""为什么改了没生效"。

---

## 一、编码：这个工程不是统一 UTF-8（实测）

对 `E:\NCProject\NCC2005\touziwuye\hotwebs` 做过对照实验：

| 文件 | 判定 | 证据 |
| --- | --- | --- |
| `src/cmp/ftsbusinessreceipt/gatherrec/list/events/buttonClick.js` | **UTF-8** | `ncc_gbk_edit` 按 gb18030 解码失败：`byte 0xb0 ... b"\xe6\x9d\xbf"`（UTF-8 的"板"） |
| `src/cmp/settlementmanagement/settlement/list/events/buttonClick.js` | **纯 ASCII，中文已损坏** | gb18030 与 UTF-8 都能解码，中文一律是 `?`；搜 `[^\x00-\x7F]` **零命中** |

第二条的完整含义：

- 该文件有 **204 处**连续问号（如 `/* ????????? ?????*/`），位置/空格/标点结构都在，
  但**中文字符已经变成真正的 U+003F 问号**；
- ASCII 部分（`modify by zyh`、`tm lidyu`、`20200402`、代码逻辑）**完好**；
- 这是"按不支持中文的编码读入再写回"造成的**不可逆损坏**，**换编码读不回来**；
- 本次检索只在**这一个文件**命中，说明损坏面不大，但**不能假设全工程编码统一**。

### 操作纪律

1. **改任何文件前先用 `ncc_gbk_edit` 探测/读写**，不要用普通编辑器直接保存；
2. `ncc_gbk_edit` 的编码判定是"能否按 gb18030 解码"——**成功不代表一定是 GBK**
   （纯 ASCII 文件两种都能过），只有**失败**才能反证"这不是 GBK"；
3. 遇到已损坏文件，中文注释别指望恢复，按代码逻辑重新理解；
4. 读 GBK 文件用 `ncc_gbk_edit --read`，普通 `read` 会出乱码，`grep` 搜中文永远搜不到。

> 通用原则（不只 NCC）：**用 UTF-8 工具链读 GBK 文件再写回 = 不可逆损坏**。
> 详细机制见 `../resources/knowledge/ncc/references/GBK文件编辑.md` 或 `ncc_gbk_edit` 工具说明。

## 二、文件首尾的神秘标记（未定论）

几乎每个 `.js` 文件的首行和末行都有一行 `//` + 一串 base64 样字符串，**同文件首尾相同，不同文件不同**：

| 文件 | 标记 |
| --- | --- |
| `cmp/bank/commom/utils.js` | `//YepeYOeUEAvNuAnSGO/3ClEFvVzTGjWG8CkKJVj4tmw=` |
| `cmp/bank/bankcontrast_tzwy/list/events/commom.js` | `//K2w4Q4DHdrhYiFevqlOh6gsHVqsT5UeTeuryuwOyxGFyfny2l1t8GD6KPrLr7Has` |
| `jytzwy/taxclass/taxclass/main/router.js` | `//Jd2y+qhYYLi1p942tboURoKBqix0cv8blvUsGnYH9zylbQ5LPiOzCJ2aAkOBzamc` |

- 长度不一（44 / 64 字符），像摘要/签名；
- `arap/receivablebill/recbill/list/provisionModel/index.js` 等文件**没有**这两行；
- 参考库搜「代码加密」「代码保护」均未命中；
- **推测**（未验证）：NCC 前端源码的防篡改校验标记，或开发工具保存时打的指纹。

> **处理原则**：不要删这两行，也不要自己加。目前没有证据表明它们影响构建。

## 三、工具约束（本机实测）

| 工具 | 状态 | 说明 |
| --- | --- | --- |
| `pwsh` | ❌ **不可用** | 本会话所有调用返回 `[exit code: 3221225794]`（`0xC0000142` STATUS_DLL_INIT_FAILED），无输出。**不要依赖 shell 命令**，用 `glob`/`grep`/`read` |
| `glob` | ⚠️ 只按 **文件名** 匹配 | `**/*tzwy*` 搜不到 `bankcontrast_tzwy/list/index.js`（tzwy 在**目录名**里）。搜目录要用 `grep` 搜内容，或直接读已知路径 |
| `grep` | ⚠️ pattern 里反斜杠转义**不生效** | `hotwebs\\src\\[a-z]+\\` 匹配不到任何东西；用 `.` 通配反斜杠即可：`hotwebs.src.[a-z_]+.` |
| `ncc_home_*` | 只认**已登记的 Home** | 目前本机只登记了 NCC2312（天九），**没有 NCC2005**。要查这份工程对应的后端源码，得先让操作者登记 NCC2005 的 Home |
| `ncc_class_search` | 需要先建索引 | 未建索引时会列出已建索引的版本 |

## 四、构建/运行的坑（汇总）

1. **`config.json` 的 `buildEntryPath` 写死后，其余页面全部不参与构建**。
   当前只指向 `src/cmp/bank/bankcontrast_tzwy/*/index.js`。排查"改了没生效"先看这里。
2. **`CleanWebpackPlugin` 只清本次要产出的目录**，切换 `buildEntryPath` 后**旧产物会留在 `dist`**。
3. **dev 与 prod 的 `output.path` 不同**：`config/dist`（dev）vs `hotwebs/dist`（prod）。
4. **`--env.hash=false` 传过来是字符串** `"false"`（真值！），`buildEntry.js:87-91` 专门做了转换。
5. **`npm run component` 指向的 `config/webpack.component.config.js` 不存在**，该脚本不可用。
6. **全量构建需要 8G 堆**（`--max_old_space_size=8192`），本机编译前留足内存。

## 五、写代码的坑（汇总）

1. **`createPage({})(Component)` 的 `({})` 不能省** —— 省了就没有 `props.table`/`props.form` 等注入。
2. **`createSimpleTable` 不传 `dataSource` 就没有列表缓存**，从卡片返回列表会重新查一次。
3. **删行必须同时 `deleteCacheId`**：
   ```js
   props.table.deleteTableRowsByIndex(tableId, data.successIndexs);
   props.table.deleteCacheId(tableId, data.successPKs);
   ```
4. **`beforeUpdatePage()` / `updatePage()` 必须成对**，否则批量设值时每个字段重绘一次。
5. **保存/提交必须经过 `props.validateToSave(cardData, callback, {...}, 'card'|'grid')`**，
   把真正的 ajax 放进 callback。漏了这层，单据模板里配的校验公式全部不生效。
6. **保存数据必须用 `props.createMasterChildData(pagecode, formId, tableId)` 生成**，不要手拼 head/body。
7. **`MutiInit`（少一个 l）** —— 平台真实拼写，与 `MultiInit` 并存，写错取不到多语。
8. **`schema` 里 `pagecode` 常取 `record.pk_tradetype.value`（交易类型）**，不是固定的页面编码。
9. **列表↔卡片的 `dataSource` 与 `pkname` 必须一致**，否则缓存往返失效。
10. **`tableButtonClick` 的第一个参数是 `that`**，与 `buttonClick(props, id)` 签名不同。
11. **表体改可编辑性不能靠编辑前事件返回值**，要用 `props.cardTable.setEditableByIndex(...)`。
12. **编辑后事件里的 ajax 必须 `async: false`**，因为后面的渲染依赖返回值。

## 六、源码阅读的坑

1. **`src/cmp/bank/commom/`** —— 注意拼写是 **`commom`**（不是 `common`），是本地公共组件目录；
   全工程的公共件在 `src/arap/public/components/`、`src/sscrp/public/common/`。
2. **标准产品源码里存在冗余**：卡片页 render 中 `hideAdd`、`adaptionHeight` 各重复两次；
   照抄时删掉即可，不影响运行。
3. **标准源码可能已经被客户改过**（见 `project-status.md`），读之前先看一眼那份清单，别把客户改动当成平台行为。
