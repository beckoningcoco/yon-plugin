# 审核后规则 params 完整结构

> 来源于 Arthas `watch ... 'params[1]' -x 6`
> 单据：CKSQ20260611000002 (id=2559448398345273353)

## 顶层结构（21 个 key）

| No | key | 类型 | 说明 |
|:--:|-----|------|------|
| 1 | `return` | HashMap | **审核后的完整单据数据** |
| 2 | `convBills` | ArrayList | 转换后的单据列表 |
| 3 | `requestData` | ArrayList | 原始请求数据 |
| 4 | `param` | BillDataDto | 请求上下文 |
| 5 | `billMapInDbBeforeAudit` | HashMap | 审核前数据库快照 |
| 6 | `billMapInDbAfterSave` | HashMap | 保存后数据库快照 |
| 7 | `bizFlowReturn` | ConvertResult | 业务流返回 |
| 8 | `commitType` | Integer | 提交类型(0) |
| 9 | `stockCheckTiming` | String | 库存检查时机("audit") |
| 10 | `billStatusPrototype` | String | 状态原型("Unchanged") |
| 11 | `isEffectStock` | Boolean | 是否影响库存(true) |
| 12 | `_status` | String | 状态("Unchanged") |
| 13 | `impactStockTiming` | Integer | 库存影响时机(0) |
| 14 | `ruleRegisterBillnum` | String | 注册规则单据("po_picking_requisition") |
| 15 | `billDirection` | Integer | 单据方向(1) |
| 16 | `isUpdateStock` | Boolean | 是否更新库存(true) |
| 17 | `config` | String | 事件配置JSON |
| 18 | `skipErrorMessage` | ArrayList | 跳过错误消息(空) |
| 19 | `currentstock` | ArrayList | 当前库存(空) |
| 20 | `impactFinancialTiming` | Integer | 财务影响时机(0) |
| 21 | `action_timing` | Integer | 动作时机(2) |

---

## 1. `return` — 审核后完整单据（⭐⭐⭐ 最常用）

```json
{
  "tcOrgAccount": 0,
  "returncount": 0,
  "verifystate": 2,
  "code": "CKSQ20260611000002",
  "alreadyUpdateFinancial": 1,
  "costAccountingMethod": 0,
  "creatorId": 2557981246130487303,
  "operatorName": null,
  "orgId": "2526879120190603274",
  "vouchdate": "2026-06-11",
  "transTypeId": "2500114292754874946",
  "bizFlow_version": null,
  "printCount": 0,
  "requisitionType": "1",
  "impactFinancialTiming": 0,
  "id": 2559448398345273353,
  "lendCustom_name": null,
  "tenant": 4768584027869200,
  "auditDate": "2026-06-27",
  "departmentName": null,
  "bustype_code": "FA002",
  "creator": "陈轩宏",
  "alreadyUpdateStock": 1,
  "orgName": "青岛东软载波科技股份有限公司001",
  "isWfControlled": false,
  "ytenant": "x24ewi7i",
  "lendDept_name": null,
  "auditor": "yhtmanager",
  "vendor_name": null,
  "lendSupplier_name": null,
  "lendUser_name": null,
  "impactStockTiming": 0,
  "barCode": "po_picking_requisition|2559448398345273353",
  "auditorId": 2500111861782413318,
  "requisitionDefineCharacter": {
    "SYR": null,
    "SYR_name": null
  },
  "createTime": "2026-06-11 14:23:29",
  "requisitionDetail": [
    {
      "auxiliaryQuantity": 1.00000000,
      "materialModel": "RC0402-J-10M-1/16W",
      "requisitionDetailDefineCharacter__id": "2559448398345273355",
      "requisitionDetailCharacteristics": {},
      "reserveid": 0,
      "collaborationType": 0,
      "stockUnitPrecision": "0",
      "orgId": "2526879120190603274",
      "stockUnitName": "台",
      "requisitionId": 2559448398345273353,
      "natCurrency": "2500112334249787398",
      "materialReqType": 0,
      "isBatchManage": false,
      "isExpiryDateManage": false,
      "mainUnitPrecision": "0",
      "id": 2559448398345273354,
      "changeRate": 1.00000000,
      "tenant": 4768584027869200,
      "rowno": 1,
      "mainUnit": "2554117957390696450",
      "productn_manageClass": "2526863864469913604",
      "quantity": 1.00000000,
      "orgName": "青岛东软载波科技股份有限公司001",
      "productId": 2559433958672039964,
      "ytenant": "x24ewi7i",
      "changeType": 0,
      "requisitionDetailDefineCharacter": {
        "WLWYBM": "2559438365306912769",
        "WLWYBM_name": "30101040046"
      },
      "isWip": false,
      "materialCode": "30101040046",
      "isExcess": false,
      "mainUnitName": "台",
      "materialName": "1657海外物联载波模块",
      "lineno": 10.00000000,
      "productn_manageClass_name": "窄带载波模块",
      "natCurrency_moneyDigit": "2",
      "natCurrency_priceDigit": "2",
      "isLineClose": false,
      "stockUnitId": 2554117957390696450
    }
  ],
  "auditTime": "2026-06-27 09:42:25",
  "transTypeId_name": "出库申请",
  "transTypeCode": "FA002",
  "status": 1,
  "bizFlow_name": null
}
```

---

## 2. `param` — 请求上下文（⭐⭐⭐ 常用）

```json
{
  "billnum": "po_picking_requisition",
  "action": "audit",
  "data": [
    {
      "_entityName": "st.pickingrequisition.PickingRequisition",
      "id": 2559448398345273353,
      "code": "CKSQ20260611000002",
      "status": 1,
      "orgId": "2526879120190603274",
      "orgName": "青岛东软载波科技股份有限公司001",
      "transTypeCode": "FA002",
      "vouchdate": "2026-06-11",
      "creator": "陈轩宏",
      "creatorId": 2557981246130487303,
      "auditor": "yhtmanager",
      "auditorId": 2500111861782413318,
      "auditTime": "2026-06-27 09:42:25",
      "requisitionDefineCharacter": {
        "SYR": null,
        "SYR_name": null
      },
      "requisitionDetail": [
        {
          "id": 2559448398345273354,
          "materialCode": "30101040046",
          "materialName": "1657海外物联载波模块",
          "quantity": 1.00000000,
          "stockUnitId": 2554117957390696450,
          "stockUnitName": "台",
          "requisitionDetailDefineCharacter": {
            "WLWYBM": "2559438365306912769",
            "WLWYBM_name": "30101040046"
          }
        }
      ]
    }
  ],
  "parameters": {
    "serviceCode": "po_picking_requisition_list_1",
    "businessStepCode": [],
    "cmdname": "cmdAudit",
    "businessActName": "出库申请-审核",
    "sbillno": "po_picking_requisition_list",
    "terminalType": "1"
  }
}
```

---

## 3. `billMapInDbAfterSave` — 保存后数据库快照（对比用）

```json
{
  "2559448398345273353": {
    "tcOrgAccount": 0,
    "returncount": 0,
    "verifystate": 2,
    "code": "CKSQ20260611000002",
    "costAccountingMethod": "0",
    "creatorId": 2557981246130487303,
    "orgId": "2526879120190603274",
    "vouchdate": "2026-06-11",
    "transTypeId": "2500114292754874946",
    "printCount": 0,
    "requisitionType": "1",
    "id": 2559448398345273353,
    "tenant": 4768584027869200,
    "auditDate": "2026-06-27",
    "creator": "陈轩宏",
    "ytenant": "x24ewi7i",
    "isWfControlled": false,
    "auditor": "yhtmanager",
    "barCode": "po_picking_requisition|2559448398345273353",
    "auditorId": 2500111861782413318,
    "createTime": "2026-06-11 14:23:29",
    "auditTime": "2026-06-27 09:42:25",
    "status": 1
  }
}
```

---

## 4. `billMapInDbBeforeAudit` — 审核前数据库快照（对比用）

```json
{
  "2559448398345273353": {
    "tcOrgAccount": 0,
    "returncount": 0,
    "verifystate": 0,
    "code": "CKSQ20260611000002",
    "costAccountingMethod": 0,
    "creatorId": 2557981246130487303,
    "orgId": "2526879120190603274",
    "vouchdate": "2026-06-11",
    "transTypeId": "2500114292754874946",
    "printCount": 0,
    "requisitionType": "1",
    "id": 2559448398345273353,
    "tenant": 4768584027869200,
    "createDate": "2026-06-11",
    "creator": "陈轩宏",
    "ytenant": "x24ewi7i",
    "isWfControlled": false,
    "barCode": "po_picking_requisition|2559448398345273353",
    "createTime": "2026-06-11 14:23:29",
    "status": 0
  }
}
```

**对比发现**：审核后 `status` 从 0→1，新增 `auditor`/`auditorId`/`auditDate`/`auditTime`，`verifystate` 从 0→2。

---

## 5. `convBills` — 转换后单据列表

结构与 `return` 相同，是平台转换规则处理后的数据。

---

## 6. `requestData` — 原始请求数据

结构与 `return` 类似，差异在于 `_status`/`_entityName` 等内部字段为 null。

---

## 关键总结

| 场景 | 取哪个 key | 
|------|-----------|
| 规则中获取触发单据 | `CommonRuleUtils.getBills()` → 内部取 `param.data` |
| 手动获取完整审核后数据 | `params.get("return")` |
| 对比审核前后差异 | `params.get("billMapInDbBeforeAudit")` vs `billMapInDbAfterSave` |
| 获取子表 | `returnData.get("requisitionDetail")` |
| 获取特征字段 | 子表内 `requisitionDetailDefineCharacter` → key 用 `__` 分隔 |
