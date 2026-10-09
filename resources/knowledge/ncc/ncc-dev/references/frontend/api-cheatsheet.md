# NCC 前端脚手架 · 平台 API 速查

> **什么时候读我**：写代码时忘了某个高阶组件的 API 名、参数、返回结构。**手边常备**。
> 完整 API 清单（含 exportTable/syncTree 全部方法）见 `../ncc-dev/references/common/frontend-dev.md` 第 3 章，本篇只收**这个工程高频用到 + 容易记错**的部分。

---

## 一、数据形态（踩坑高发区，先背这个）

```js
// ① 表格行：勾选返回的是包装对象
props.table.getCheckedRows(tableId)
// → [{ index: 3, data: { values: { pk_recbill: {value, display, scale}, ... }, rowId } }]

// ② 字段值是对象，不是字符串
record.pk_recbill.value      // ✅ 主键
record.customer.display      // ✅ 参照显示名
record.money.value           // ✅ 金额
props.form.getFormItemsValue(formId, 'pk_org')   // → {value, display, scale}，要 .value

// ③ 在 this.Info 里存的行数据同样形态（that.Info.record 是 values 对象）

// ④ 查询接口入参
{ pageId, queryInfo: { pageInfo, queryAreaCode, querytype:'tree', conditions:[...] }, tradeType }

// ⑤ 查询接口返回
res.data[tableId] = { rows: [...], allpks: [...], pageInfo: {...} }

// ⑥ 保存/删除：一主多子结构
{ formId, pageCode, billCard: { pageid, bodys: { [area]: { areaType:"table", areacode:area, pageinfo:null, rows } } } }
// 行状态：0 原始 / 1 修改 / 2 新增 / 3 删除；删除行要带 ts（乐观锁）
```

## 二、表头表单 `props.form`

```js
form.createForm(areaCode, { fieldid, onAfterEvent, onBeforeEvent })
form.setAllFormValue({ [formId]: res.data.head[formId] })        // 整表设值
form.getAllFormValue(formId)
form.getFormItemsValue(formId, 'pk_org').value                   // 取值（返回对象！）
form.getFormItemsValue(formId, 'pk_org_v').display
form.setFormItemsValue(formId, { ts: { value: ts } })            // 单字段设值
form.setFormStatus(formId, 'browse' | 'edit' | 'add')
form.getFormStatus(formId)
form.setFormItemsDisabled(formId, { pk_org_v: true })
form.setFormItemsRequired / setFormItemsVisible / setItemsVisible
form.EmptyAllFormValue(formId)
form.isCheckNow(formId)                                          // 必输校验，返回 false 表示校验不过
form.resetItemWidth / closeArea / openArea
```

## 三、表体卡片表格 `props.cardTable`

```js
cardTable.createCardTable(areaCode, { fieldid, tableHead, modelSave, modelAddRow, modelDelRow,
                                      onAfterEvent, onBeforeEvent, onSelected, onSelectedAll,
                                      showCheck, showIndex, adaptionHeight })
cardTable.setTableData(tableId, res.data.body[tableId])
cardTable.getDataByIndex(tableId, index)          // 取某行（编辑后事件传 body 用）
cardTable.getVisibleRows(tableId)
cardTable.getAllRows(tableId)
cardTable.getCheckedRows(tableId)
cardTable.getNumberOfRows(tableId)
cardTable.addRow(tableId, index, rowValues, isAutoAddRow)
cardTable.updateDataByRowId(tableId, bodyData)    // ★ 保存回写用这个
cardTable.updateDataByIndexs(tableId, [{ index, data: { values } }])
cardTable.setValByKeyAndIndex(tableId, index, key, { value })
cardTable.setValByKeyAndRowId(tableId, rowId, key, changedrows)   // ★ 出错回滚用这个
cardTable.setStatus(tableId, 'browse' | 'edit')
cardTable.checkTableRequired(tableId)
cardTable.setEditableByIndex(moduleId, index, key, false)         // ★ 表体改可编辑性（不能靠返回值）
cardTable.closeModel(tableId)                     // 侧拉编辑
```

## 四、浏览态表格 `props.table`（列表页）

```js
table.createSimpleTable(areaCode, { fieldid, dataSource, pkname, handlePageInfoChange,
                                    onRowDoubleClick, onSelected, onSelectedAll,
                                    componentInitFinished, tableModelConfirm, showCheck, showIndex })
table.setAllTableData(tableId, data)
table.getAllTableData(tableId)
table.getTablePageInfo(tableId)
table.getCheckedRows(tableId)
table.updateDataByIndexs(tableId, [{ index, data: { values } }])
table.deleteTableRowsByIndex(tableId, successIndexs)
table.deleteCacheId(tableId, successPKs)          // ★ 删行必须同时删缓存
table.hasCacheData(dataSource)
table.setValByKeyAndIndex(tableId, index, 'ts', tsCell)
table.selectTableRows / openMaxTable / openListView
```

## 五、查询区 `props.search`

```js
search.NCCreateSearch(searchId, { clickSearchBtn, showAdvBtn, onAfterEvent, renderCompleteEvent })
search.getQueryInfo(searchId)                     // → 查询条件对象（含 conditions）
search.getQueryInfo(searchId, showError)
search.getAllSearchData(searchId)
search.getSearchValByField(searchId, 'pk_org')    // → { value: { firstvalue, ... }, display }
search.setSearchValByField(searchId, field, { display, value })
search.setSearchValue(searchId, obj)
search.clearSearchArea(searchId)
search.openAdvSearch(searchId, true)
search.setDisabledByField / setRequiredByField / setTemlateByField
```

> 查询区取"第一个值"要写 `.value.firstvalue`（比表头多一层）。

## 六、按钮 `props.button`

```js
button.createButtonApp({ area: 'list_head'|'card_head'|'card_body', buttonLimit: 3,
                         onButtonClick, popContainer: document.querySelector('.header-button-area') })
button.setButtons(button, callback)                // createUIDom 回调里注册
button.getButtons()
button.setDisabled({ [ACTIONS.DELETE]: selectedCount == 0 })     // 或 setButtonDisabled
button.setButtonsVisible({ [ACTIONS.ADD]: true })                // 或 setButtonVisible
button.setMainButton(ACTIONS.ADD, isBrowse)
button.setPopContent(ACTIONS.DELETE, '确定要删除？')
button.setUploadConfig(ACTIONS.IMPORT, excelimportconfig)
button.createOprationButton(btns, { area: 'list_inner', buttonLimit: 3, onButtonClick })
```

## 七、页面资源与上下文

```js
props.createUIDom({ pagecode, appcode,
                    reqDataQueryallbtns: { rqUrl, rqJson, rqCode:'button' },     // 自定义：并进按钮请求
                    reqDataQuerypage:   { rqUrl, rqJson, rqCode:'template' } },  // 自定义：并进模板请求
                  (data) => { data.template / data.button.button / data.context })

props.meta.getMeta() / props.meta.setMeta(meta, callback) / props.meta.addMeta(metas)
props.createMasterChildData(pagecode, formId, tableId)                      // ★ 保存用
props.createHeadAfterEventData(pagecode, formId, tableId, moduleId, key, value)
props.createFormAfterEventData(pagecode, formId, tableId, key, value)
props.validateToSave(cardData, callback, { table1:'cardTable' }, 'card')    // ★ 公式校验
props.beforeUpdatePage() / props.updatePage(formId, tableId)                // 成对，性能开关
props.resMetaAfterPkorgEdit()                                              // 改组织后重置模板
```

## 八、URL 参数与路由

```js
props.getUrlParam('status'|'id'|'scene'|'type'|'pagecode'|'flag'|'pk_bills'|'srcbilltype')
props.setUrlParam({ status:'browse', id: pk, pagecode })
props.addUrlParam({ id }) / props.delUrlParam('type')
props.getSearchParam('c')   // appcode（小应用编码）
props.getSearchParam('p')   // pagecode
props.getSearchParam('n')   // 节点名称（当标题用）

props.pushTo('/card', { status:'browse', id, pagecode })     // 单页内路由跳转
props.linkTo('/arap/gatheringbill/gatheringbill/transfer/index.html', {...})   // 跨节点
props.openTo(data.url, data.condition)
```

| 参数 | 常见取值 | 含义 |
| --- | --- | --- |
| `status` | `add` / `edit` / `browse` | 页面状态 |
| `scene` | `linksce` / `fip` / `approvesce` / `bz` | 联查/来源/审批/报账场景 |
| `type` | `transfer` / `copy` / `redBack` | 转单/复制/红冲 |

## 九、缓存 `cardCache`

```js
import { cardCache, cacheTools } from 'nc-lightapp-front';
let { setDefData, getDefData, addCache, getCacheById, updateCache, deleteCacheById,
      getNextId, getCurrentLastId } = cardCache;

setDefData(key, dataSource, val) / getDefData(key, dataSource)
addCache(pkname, cardData, formId, dataSource)
updateCache(pkname, id, cardData, formId, dataSource)
getCacheById(id, dataSource)
deleteCacheById(pkname, id, dataSource)
cacheTools.set(key, val) / cacheTools.get(key)
```

## 十、消息与弹窗

```js
import { toast, promptBox, print, printer } from 'nc-lightapp-front';

toast({ color: 'success'|'warning'|'danger'|'info', content, duration: 'infinity'|5 })
promptBox({ color:'warning', title, content, beSureBtnName, cancelBtnName,
            noCancelBtn, beSureBtnClick, cancelBtnClick, closeByClickBackDrop })
props.modal.show('modalKey') / props.modal.createModal(id, config)

print('pdf'|'html', '/nccloud/arap/arappub/print.do', printData, false)   // 打印
printer('pdf', url, printData)                                            // 列表打印
```

## 十一、多语

```js
// ① 页面封装（bank 模块风格）
this.lang = getLangCode.bind(this);            // getLangCode 内部走 MutiInit.getIntl(moduleId)
this.lang('0004')

// ② 标准产品主流写法（实测 2931 处）
this.props.MutiInit.getIntl("360704SM").get('360704SM-000017')

// ③ 官方文档写法
import { getMultiLang } from 'nc-lightapp-front';
getMultiLang({ moduleId: ['receivablebill','public'], domainName: 'arap',
               currentLocale: 'simpchn', callback: (json) => this.setState({ json }) })
this.state.json['receivablebill-000051']
```

> `MutiInit`（少一个 l）与 `MultiInit` 都存在，别写错。

## 十二、常用 import 清单

```js
import React, { Component } from 'react';
import { createPage, ajax, base, toast, high, print, printer, promptBox,
         cardCache, cacheTools, getMultiLang, createPageIcon,
         excelImportconfig, widgetAutoRefresh } from 'nc-lightapp-front';

const { NCDiv, NCButton, NCAffix, NCTable, NCModal, NCDropdown, NCBackBtn } = base;
const { BillTrack, PrintOutput, Inspection, ApproveDetail, NCUploader,
        ExcelImport, ApprovalTrans } = high;
```

## 十三、`getBusinessInfo()`

```js
import { getBusinessInfo } from 'nc-lightapp-front';
getBusinessInfo().userId            // 当前用户
getBusinessInfo().businessDate      // 业务日期（版本类参照 VersionStartDate 常用）
```
