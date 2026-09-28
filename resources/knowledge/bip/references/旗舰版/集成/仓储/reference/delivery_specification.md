# 销售退货WMS集成业务场景规范

## 业务语义

销售退货WMS集成是指基于BIP系统中已审核的销售退货单数据，向WMS（仓库管理系统）发起退货入库请求的标准业务流程。

### 业务目标

将BIP销售退货单的完整业务数据，通过标准化的字段映射与接口调用，推送至WMS系统完成退货入库的仓库作业处理。

### 前置条件

1. BIP销售退货单已审核通过
2. 退货仓库已配置为WMS仓（bWMS = true）
3. 退货单未推送至WMS或需要重新推送

## 核心流程

```
销售退货单ID ──▶ 查询退货单详情 ──▶ 校验WMS仓标识 ──▶ 字段映射转换 ──▶ 调用WMS接口 ──▶ 回写状态
```

## 关键字段映射

### 基础字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| code | docNo | 直接映射 | 是 |
| id | docHeaderId | 直接映射 | 是 |
| salesOrgId.code | customerId | 销售组织编码 | 是 |
| saleDepartmentId.code | workshop | 销售部门编码 | 否 |
| vouchdate | attribute3（入库日期） | 格式：Date -> yyyy-MM-dd | 是 |
| agentId.name | consigneeName | 客户名称 | 否 |
| deliveryCustId.code | consigneeId | 收货客户编码 | 否 |
| memo | notes | 备注 | 否 |

### 仓库字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| saleReturnDetails.stockId.code | ERPinSublibrary | 退货仓库编码 | 是 |
| saleReturnDetails.stockId.bWMS | bWMS | WMS仓标识校验 | 是 |
| saleReturnDetails.stockId.name | stockIdName | 仓库名称（用于提示） | 否 |

### 明细字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| saleReturnDetails.id | docLineId | 明细ID | 是 |
| saleReturnDetails.lineno | lineNo | 行号 | 是 |
| saleReturnDetails.productCode | sku | 物料编码 | 是 |
| saleReturnDetails.productName | skuDesc | 物料名称 | 是 |
| saleReturnDetails.masterUnitId.code | uom | 计量单位编码 | 是 |
| saleReturnDetails.qty | qty | 数量 | 是 |
| saleReturnDetails.orderNo | salesOrderNo | 销售订单号 | 否 |
| saleReturnDetails.orderDetailLineno | salesOrderLineNo | 销售订单行号 | 否 |
| saleReturnDetails.orderId | salesOrderId | 销售订单ID | 否 |
| saleReturnDetails.orderDetailIdKey | salesOrderLineId | 销售订单明细ID | 否 |

### 特征组字段

> **重要规则**：特征字段是BIP明细表的扩展属性字段，存储在 `saleReturnDetailCharacteristics` 结构中。**具体字段编码必须从用户提供的字段映射文档中动态识别和提取**。
> 
> **识别逻辑**：
> ```
> 用户提供的字段映射文档（Excel/Word等）
>     │
>     ├── 扫描BIP字段列
>     │   ├── 识别明细表特征属性描述
>     │   │   ├── 是 → 提取字段编码和描述
>     │   │   │           ↓
>     │   │   │       识别业务含义（匹配目标系统字段）
>     │   │   │           ↓
>     │   │   └── 生成特征字段映射关系
>     │   │
>     │   └── 匹配目标系统字段
>     │       ├── attribute1 → {文档中的BIP字段}
>     │       ├── attribute4 → {文档中的BIP字段}
>     │       ├── attribute11 → {文档中的BIP字段}
>     │       └── ... 其他字段
>     │
>     └── 生成字段映射代码
> ```
> 
> **特征字段判断标准**：
> 1. 字段描述中明确说明是**明细表特征属性**、**自定义字段**或**特征字段**
> 2. 字段值从 `saleReturnDetailCharacteristics` 结构中获取
> 3. 字段编码不限于特定格式，可以是 `Is_Clear`、`CLR`、`BOM_STD` 等

**特征字段识别关键词对照表**：

| 目标系统字段 | 识别关键词 | 转换说明 | 常见BIP字段示例 |
|-------------|-----------|---------|----------------|
| attribute1（生产日期） | 生产日期、入库日期 | Date -> yyyy-MM-dd | productDate |
| attribute3（入库日期） | 入库日期、单据日期 | Date -> yyyy-MM-dd | vouchdate |
| attribute4（批次号） | 批次号、批号 | 直接映射 | batchNo |
| attribute11（清洗标识） | 清洗标识、清洗标志 | 特征组字段 | Is_Clear |
| attribute12（跟踪号） | 跟踪号、追踪号 | 特征组字段 | charac_tracknum |
| attribute13（预留号） | 预留号、保留号 | 直接映射 | reserveid.code |
| attribute14（颜色） | 颜色、色号 | 特征组字段 | CLR |
| attribute15（销售合同号） | 销售合同号、合同号 | sactCode优先，其次特征组SL_CO | sactCode / SL_CO |
| attribute16（BOM标准） | BOM标准、BOM版本 | 特征组字段 | BOM_STD |
| attribute17（工作令号） | 工作令号、工单号 | 特征组字段 | JOB_NO |
| attribute18（项目编码） | 项目编码、项目号 | 直接映射 | projectId.code |
| attribute19（客户指定供应商） | 客户指定供应商 | 特征组字段 | CUST_SUP |
| attribute20（工序状态） | 工序状态、工艺状态 | define2_code优先 | define2 / define2_code |
| attribute21（备注） | 备注、行备注 | 直接映射 | memo |
| attribute5（图号版本） | 图号版本、图纸版本 | 特征组字段 | DRW_VER |

**动态识别示例**：

假设用户提供的字段映射文档内容如下：
```
BIP字段                                        | 目标系统字段 | 说明
----------------------------------------------|-------------|------
saleReturnDetailCharacteristics.Is_Clear      | attribute11  | 清洗标识（特征字段）
saleReturnDetailCharacteristics.CLR           | attribute14  | 颜色（特征字段）
saleReturnDetailCharacteristics.SL_CO         | attribute15  | 销售合同号（特征字段）
saleReturnDetailCharacteristics.BOM_STD       | attribute16  | BOM标准（特征字段）
saleReturnDetailCharacteristics.JOB_NO        | attribute17  | 工作令号（特征字段）
saleReturnDetailCharacteristics.CUST_SUP      | attribute19  | 客户指定供应商（特征字段）
saleReturnDetailCharacteristics.DRW_VER       | attribute5   | 图号版本（特征字段）
```

则生成的字段映射代码应为：
```java
// 处理特征组字段
Map<String, Object> saleReturnDetailCharacteristics = 
    (Map<String, Object>) detailMap.get("saleReturnDetailCharacteristics");

if (saleReturnDetailCharacteristics != null) {
    // 清洗标识（从文档识别：Is_Clear → attribute11）
    if (saleReturnDetailCharacteristics.get("Is_Clear") != null) {
        Object isClear = saleReturnDetailCharacteristics.get("Is_Clear");
        if (isClear instanceof Map) {
            detail.put("attribute11", ((Map) isClear).get("code"));
        } else {
            detail.put("attribute11", isClear);
        }
    }
    
    // 颜色（从文档识别：CLR → attribute14）
    if (saleReturnDetailCharacteristics.get("CLR") != null) {
        Object clr = saleReturnDetailCharacteristics.get("CLR");
        if (clr instanceof Map) {
            detail.put("attribute14", ((Map) clr).get("code"));
        } else {
            detail.put("attribute14", clr);
        }
    }
    
    // 销售合同号（从文档识别：SL_CO → attribute15）
    // 注意：如果sactCode已有值，优先使用sactCode
    if (detailMap.get("sactCode") == null && saleReturnDetailCharacteristics.get("SL_CO") != null) {
        Object slCo = saleReturnDetailCharacteristics.get("SL_CO");
        if (slCo instanceof Map) {
            detail.put("attribute15", ((Map) slCo).get("code"));
        } else {
            detail.put("attribute15", slCo);
        }
    }
    
    // BOM标准（从文档识别：BOM_STD → attribute16）
    if (saleReturnDetailCharacteristics.get("BOM_STD") != null) {
        Object bomStd = saleReturnDetailCharacteristics.get("BOM_STD");
        if (bomStd instanceof Map) {
            detail.put("attribute16", ((Map) bomStd).get("code"));
        } else {
            detail.put("attribute16", bomStd);
        }
    }
    
    // 工作令号（从文档识别：JOB_NO → attribute17）
    if (saleReturnDetailCharacteristics.get("JOB_NO") != null) {
        Object jobNo = saleReturnDetailCharacteristics.get("JOB_NO");
        if (jobNo instanceof Map) {
            detail.put("attribute17", ((Map) jobNo).get("code"));
        } else {
            detail.put("attribute17", jobNo);
        }
    }
    
    // 客户指定供应商（从文档识别：CUST_SUP → attribute19）
    if (saleReturnDetailCharacteristics.get("CUST_SUP") != null) {
        Object custSup = saleReturnDetailCharacteristics.get("CUST_SUP");
        if (custSup instanceof Map) {
            detail.put("attribute19", ((Map) custSup).get("code"));
        } else {
            detail.put("attribute19", custSup);
        }
    }
    
    // 图号版本（从文档识别：DRW_VER → attribute5）
    if (saleReturnDetailCharacteristics.get("DRW_VER") != null) {
        Object drwVer = saleReturnDetailCharacteristics.get("DRW_VER");
        if (drwVer instanceof Map) {
            detail.put("attribute5", ((Map) drwVer).get("code"));
        } else {
            detail.put("attribute5", drwVer);
        }
    }
}
```

**如果文档中未包含某特征字段，则不生成该字段的映射代码**。

---

**以下为常见特征字段映射参考（仅作示例，实际以文档为准）**：

| BIP特征字段 | 目标字段 | 转换说明 | 是否必填 | 识别关键词 |
|------------|---------|---------|---------|-----------|
| {动态识别} | attribute1 | 生产日期 | 否 | 生产日期 |
| {动态识别} | attribute4 | 批次号 | 否 | 批次号 |
| {动态识别} | attribute11 | 清洗标识 | 否 | 清洗标识 |
| {动态识别} | attribute12 | 跟踪号 | 否 | 跟踪号 |
| {动态识别} | attribute14 | 颜色 | 否 | 颜色 |
| {动态识别} | attribute15 | 销售合同号 | 否 | 销售合同号 |
| {动态识别} | attribute16 | BOM标准 | 否 | BOM标准 |
| {动态识别} | attribute17 | 工作令号 | 否 | 工作令号 |
| {动态识别} | attribute19 | 客户指定供应商 | 否 | 客户指定供应商 |
| {动态识别} | attribute20 | 工序状态 | 否 | 工序状态 |
| {动态识别} | attribute5 | 图号版本 | 否 | 图号版本 |

## 核心代码模板

### 1. 查询销售退货单

```java
/**
 * 查询BIP销售退货单详情
 */
private JSONObject queryBipSaleReturn(String saleReturnId) throws Exception {
    String accessToken = accessTokenUtils.getAccessToken();
    String url = gatewayHost + "/yonbip/sd/vouchersalereturn/detail" 
        + "?access_token=" + accessToken + "&id=" + saleReturnId;
    
    Map<String, Object> result = OpenApiUtils.getMethod(null, url);
    
    if ("200".equals(result.get("code"))) {
        return JSONObject.parseObject(JSON.toJSONString(result.get("data")));
    }
    throw new BusinessException("查询销售退货单失败");
}
```

### 2. 字段映射转换

```java
/**
 * 将BIP销售退货单转换为WMS DTO
 */
public SaleReturnWmsDTO convertToWmsDTO(JSONObject bipData) {
    SaleReturnWmsDTO dto = new SaleReturnWmsDTO();
    
    // 基础字段
    dto.setDocNo(bipData.getString("code"));
    dto.setDocHeaderId(bipData.getString("id"));
    dto.setCustomerId(getNestedValue(bipData, "salesOrgId", "code"));
    dto.setWorkshop(getNestedValue(bipData, "saleDepartmentId", "code"));
    dto.setConsigneeName(getNestedValue(bipData, "agentId", "name"));
    dto.setConsigneeId(getNestedValue(bipData, "deliveryCustId", "code"));
    dto.setNotes(bipData.getString("memo"));
    
    // 订单类型固定值
    dto.setOrderType("INB0501");  // 销售退货单
    dto.setCreateSource("ERP");
    
    // 日期格式转换
    String vouchdate = bipData.getString("vouchdate");
    dto.setAttribute3(convertDate(vouchdate));
    
    // 明细转换
    JSONArray details = bipData.getJSONArray("saleReturnDetails");
    List<SaleReturnWmsDetailDTO> itemList = new ArrayList<>();
    for (int i = 0; i < details.size(); i++) {
        itemList.add(convertDetail(details.getJSONObject(i)));
    }
    dto.setDetails(itemList);
    
    return dto;
}

/**
 * 转换明细
 */
private SaleReturnWmsDetailDTO convertDetail(JSONObject detail) {
    SaleReturnWmsDetailDTO dto = new SaleReturnWmsDetailDTO();
    
    // 基础明细字段
    dto.setDocLineId(detail.getString("id"));
    dto.setLineNo(detail.getString("lineno"));
    dto.setSku(detail.getString("productCode"));
    dto.setSkuDesc(detail.getString("productName"));
    dto.setUom(getNestedValue(detail, "masterUnitId", "code"));
    dto.setQty(detail.getBigDecimal("qty"));
    dto.setERPinSublibrary(getNestedValue(detail, "stockId", "code"));
    dto.setSalesOrderNo(detail.getString("orderNo"));
    dto.setSalesOrderLineNo(detail.getString("orderDetailLineno"));
    dto.setSalesOrderId(detail.getString("orderId"));
    dto.setSalesOrderLineId(detail.getString("orderDetailIdKey"));
    
    // 批次号
    dto.setAttribute4(detail.getString("batchNo"));
    
    // 生产日期
    Object productDate = detail.get("productDate");
    if (productDate != null) {
        dto.setAttribute1(convertDate(productDate));
    }
    
    // 入库日期（单据日期）
    Object vouchdate = detail.get("vouchdate");
    if (vouchdate != null) {
        dto.setAttribute3(convertDate(vouchdate));
    }
    
    // 预留号
    dto.setAttribute13(getNestedValue(detail, "reserveid", "code"));
    
    // 项目编码
    dto.setAttribute18(getNestedValue(detail, "projectId", "code"));
    
    // 备注
    dto.setAttribute21(detail.getString("memo"));
    
    // 销售合同号（优先使用sactCode）
    String sactCode = detail.getString("sactCode");
    if (StringUtils.isNotBlank(sactCode)) {
        dto.setAttribute15(sactCode);
    }
    
    // 工序状态
    Object define2 = detail.get("define2");
    if (define2 != null) {
        if (define2 instanceof JSONObject) {
            dto.setAttribute20(((JSONObject) define2).getString("code"));
        } else {
            dto.setAttribute20(define2.toString());
        }
    }
    
    // 处理特征组字段
    JSONObject saleReturnDetailCharacteristics = detail.getJSONObject("saleReturnDetailCharacteristics");
    if (saleReturnDetailCharacteristics != null) {
        processDefineCharacter(dto, saleReturnDetailCharacteristics);
    }
    
    return dto;
}

/**
 * 处理特征组字段
 * 
 * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
 * 
 * 生成规则：
 * 1. 扫描用户提供的字段映射文档（Excel/Word等）
 * 2. 识别描述为"明细表特征属性"的BIP字段
 * 3. 根据目标系统字段（attribute11/attribute12等）匹配业务含义
 * 4. 动态生成字段获取和转换代码
 * 
 * 字段类型处理：
 * - 普通文本字段：直接从saleReturnDetailCharacteristics获取String值
 * - 参照字段（自定义档案）：需要获取code值
 * 
 * 参照字段处理逻辑：
 * 1. 从saleReturnDetailCharacteristics获取字段值
 * 2. 判断是否为Map/JSONObject类型（参照类型）
 * 3. 如果是参照类型，获取code字段值
 * 4. 设置到DTO对应字段
 */
private void processDefineCharacter(SaleReturnWmsDetailDTO dto, JSONObject characteristics) {
    if (characteristics == null) {
        return;
    }
    
    // ============================================
    // 动态生成区域 - 根据字段映射文档自动识别特征字段
    // ============================================
    
    // 示例1：清洗标识（从文档动态识别：Is_Clear → attribute11）
    // Object isClear = characteristics.get("Is_Clear");
    // if (isClear != null) {
    //     dto.setAttribute11(getCodeValue(isClear));
    // }
    
    // 示例2：颜色（从文档动态识别：CLR → attribute14）
    // Object clr = characteristics.get("CLR");
    // if (clr != null) {
    //     dto.setAttribute14(getCodeValue(clr));
    // }
    
    // 示例3：销售合同号（从文档动态识别：SL_CO → attribute15）
    // 注意：如果dto.getAttribute15()已有值，则不覆盖
    // if (dto.getAttribute15() == null) {
    //     Object slCo = characteristics.get("SL_CO");
    //     if (slCo != null) {
    //         dto.setAttribute15(getCodeValue(slCo));
    //     }
    // }
    
    // 示例4：BOM标准（从文档动态识别：BOM_STD → attribute16）
    // Object bomStd = characteristics.get("BOM_STD");
    // if (bomStd != null) {
    //     dto.setAttribute16(getCodeValue(bomStd));
    // }
    
    // 示例5：工作令号（从文档动态识别：JOB_NO → attribute17）
    // Object jobNo = characteristics.get("JOB_NO");
    // if (jobNo != null) {
    //     dto.setAttribute17(getCodeValue(jobNo));
    // }
    
    // 示例6：客户指定供应商（从文档动态识别：CUST_SUP → attribute19）
    // Object custSup = characteristics.get("CUST_SUP");
    // if (custSup != null) {
    //     dto.setAttribute19(getCodeValue(custSup));
    // }
    
    // 示例7：图号版本（从文档动态识别：DRW_VER → attribute5）
    // Object drwVer = characteristics.get("DRW_VER");
    // if (drwVer != null) {
    //     dto.setAttribute5(getCodeValue(drwVer));
    // }
    
    // 示例8：跟踪号（从文档动态识别：charac_tracknum → attribute12）
    // Object trackNum = characteristics.get("charac_tracknum");
    // if (trackNum != null) {
    //     dto.setAttribute12(getCodeValue(trackNum));
    // }
}

/**
 * 获取编码值（处理参照类型）
 */
private String getCodeValue(Object value) {
    if (value == null) {
        return null;
    }
    if (value instanceof JSONObject) {
        return ((JSONObject) value).getString("code");
    }
    if (value instanceof Map) {
        return (String) ((Map) value).get("code");
    }
    return value.toString();
}

/**
 * 获取嵌套属性值
 */
private String getNestedValue(JSONObject json, String parentKey, String childKey) {
    JSONObject parent = json.getJSONObject(parentKey);
    if (parent != null) {
        return parent.getString(childKey);
    }
    return null;
}
```

### 3. WMS仓校验

```java
/**
 * 校验退货仓库是否为WMS仓
 */
private boolean validateWMSWarehouse(JSONObject detail) {
    JSONObject stockId = detail.getJSONObject("stockId");
    if (stockId == null) {
        return false;
    }
    
    Boolean bWMS = stockId.getBoolean("bWMS");
    return Boolean.TRUE.equals(bWMS);
}

/**
 * 获取校验失败信息
 */
private String getValidateMessage(JSONObject detail) {
    JSONObject stockId = detail.getJSONObject("stockId");
    if (stockId == null) {
        return "退货仓库不能为空。";
    }
    
    String stockName = stockId.getString("name");
    Boolean bWMS = stockId.getBoolean("bWMS");
    
    if (Boolean.FALSE.equals(bWMS)) {
        return "退货仓库：" + stockName + "不是WMS仓，请确认仓库的WMS仓标识。";
    }
    
    return null;
}
```

### 4. 工具方法

```java
/**
 * 日期格式转换
 */
private String convertDate(Object dateObj) {
    if (dateObj == null) {
        return null;
    }
    
    if (dateObj instanceof Date) {
        return DateUtils.dateToStr((Date) dateObj);
    } else if (dateObj instanceof String) {
        String dateStr = (String) dateObj;
        if (dateStr.length() >= 10) {
            return dateStr.substring(0, 10);
        }
        return dateStr;
    }
    return dateObj.toString();
}

/**
 * 日期格式转换（带格式）
 */
private String convertDate(String bipDate) {
    if (StringUtils.isBlank(bipDate)) {
        return bipDate;
    }
    if (bipDate.length() >= 10) {
        return bipDate.substring(0, 10);
    }
    return bipDate;
}
```

### 5. WMS接口调用

> **⚠️ 重要说明**
> 
> 以下代码为**示例模板**，展示销售退货单推送WMS的标准处理流程。
> 
> **实际生成规则**：
> - 接口地址（如 `/xdesb/erp/erp_genOutBillTaskSaleBack_250`）需从用户提供的**需求文档**中读取
> - 请求头、认证方式、加密方式等需根据**厂商接口文档**动态配置
> - 字段映射关系需根据**字段映射文档**动态生成
> - **严禁**直接复制以下示例代码，必须基于用户提供的实际文档生成

```java
/**
 * 推送销售退货单到WMS
 * 
 * 【动态生成说明】
 * 1. 接口URL：从需求文档读取，示例中的 "/xdesb/erp/erp_genOutBillTaskSaleBack_250" 仅为占位符
 * 2. 请求头：根据厂商接口文档要求的认证方式（Token/OAuth/签名等）动态生成
 * 3. 字段映射：根据字段映射文档动态生成转换逻辑
 * 4. 加密处理：仅当文档明确要求时才添加加密逻辑
 */
public Map<String, Object> pushSaleReturnToWMS(SaleReturnWmsDTO billData) throws Exception {
        
        // 2. 组装发送WMS参数
        if (billData != null ) {
            Map<String, Object> head = new HashMap<>();
            Map<String, Object> headMap = list.get(0);
            
            // 设置接口URL
            billData.put("restUrl", "/xdesb/erp/erp_genOutBillTaskSaleBack_250");
            
            // 校验WMS仓标识
            Boolean bWMS = TypeUtils.toBoolean(headMap.get("bWMS"), false);
            if (headMap.get("stockIdName") == null || Boolean.FALSE.equals(bWMS)) {
                billData.put("isPush", "0");
                String isPushMessage = "";
                if (headMap.get("stockIdName") == null) {
                    isPushMessage = "退货仓库不能为空。";
                } else {
                    isPushMessage = "退货仓库：" + headMap.get("stockIdName") + "不是WMS仓，请确认仓库的WMS仓标识。";
                }
                billData.put("isPushMessage", isPushMessage);
                return billData;
            }
            
            // 组装头信息
            head.put("customerId", headMap.get("customerId").toString());
            head.put("docNo", headMap.get("docNo"));
            head.put("docHeaderId", headMap.get("docHeaderId").toString());
            head.put("orderType", "INB0501");
            head.put("workshop", headMap.get("workshop"));
            head.put("createSource", "ERP");
            head.put("consigneeId", headMap.get("consigneeId"));
            head.put("consigneeName", headMap.get("consigneeName"));
            head.put("notes", headMap.get("notes"));
            
            // 组装明细
            List<Map<String, Object>> details = new ArrayList<>();
            for (Map<String, Object> detailMap : list) {
                Map<String, Object> detail = new HashMap<>();
                String docLineId = detailMap.get("docLineId").toString();
                
                detail.put("qty", String.valueOf(detailMap.get("qty")));
                detail.put("lineNo", String.valueOf(detailMap.get("lineNo")));
                detail.put("docLineId", docLineId);
                detail.put("sku", detailMap.get("sku"));
                detail.put("skuDesc", detailMap.get("skuDesc"));
                detail.put("uom", detailMap.get("uom"));
                detail.put("ERPinSublibrary", detailMap.get("ERPinSublibrary"));
                detail.put("salesOrderNo", detailMap.get("salesOrderNo"));
                detail.put("salesOrderLineNo", detailMap.get("salesOrderLineNo"));
                detail.put("salesOrderId", detailMap.get("salesOrderId"));
                detail.put("salesOrderLineId", detailMap.get("salesOrderLineId"));
                
                // 生产日期 -> attribute1
                if (detailMap.get("productDate") != null) {
                    detail.put("attribute1", convertDate(detailMap.get("productDate")));
                }
                
                // 入库日期 -> attribute3
                if (detailMap.get("vouchdate") != null) {
                    detail.put("attribute3", convertDate(detailMap.get("vouchdate")));
                }
                
                detail.put("attribute4", detailMap.getOrDefault("attribute4", ""));
                detail.put("attribute13", detailMap.getOrDefault("attribute13", ""));
                detail.put("attribute18", detailMap.getOrDefault("attribute18", ""));
                
                // 工序状态 -> attribute20
                if (detailMap.get("define2") != null && detailMap.get("define2_code") != null) {
                    detail.put("attribute20", detailMap.getOrDefault("define2_code", ""));
                }
                
                detail.put("attribute21", detailMap.getOrDefault("attribute21", ""));
                detail.put("notes", detailMap.getOrDefault("lineNotes", ""));
                
                // 处理特征组字段
                Map<String, Object> characteristics = 
                    (Map<String, Object>) detailMap.get("saleReturnDetailCharacteristics");
                if (characteristics != null) {
                    processCharacteristics(detail, characteristics, docLineId);
                }
                
                details.add(detail);
            }
            
            head.put("details", details);
            billData.put("headlist", head);
        } else {
            billData.put("isPush", "0");
        }
    } catch (Exception e) {
        log.error("SaleReturnServiceImpl.saleReturn.error:", e);
        throw new BusinessException("查询销售退货单报错，", e);
    }
    
    return billData;
}

/**
 * 处理特征组字段
 */
private void processCharacteristics(Map<String, Object> detail, 
                                     Map<String, Object> characteristics,
                                     String docLineId) {
    StringBuffer sb = new StringBuffer();
    
    // 动态识别特征字段（根据用户提供的字段映射文档）
    // 示例：
    // if (characteristics.get("Is_Clear") != null) {
    //     sb.append("saleReturnDetailCharacteristics.Is_Clear.code as attribute11,");
    // }
    // if (characteristics.get("charac_tracknum") != null) {
    //     sb.append("saleReturnDetailCharacteristics.charac_tracknum.code as attribute12,");
    // }
    // ...
    
    if (sb.length() > 0) {
        String fieldString = sb.toString();
        if (fieldString.endsWith(",")) {
            fieldString = fieldString.substring(0, sb.length() - 1);
        }
        Map<String, Object> characteristicsMap = queryDetailCharacteristics(
            docLineId, fieldString, fullname, group);
        DeepCopyUtil.deepCopyMap(characteristicsMap, detail);
    }
}
```

### 6. 结果回写

```java
/**
 * 回写WMS推送状态  通过销售出库单获取表名，进行更新
 */
@Resource(name = "baseDAO", type = BaseDAO.class)
private IYmsJdbcApi ymsJdbcApi; 

private void writeBackWMSStatus(String saleReturnId, String wmsStatus, String tenantId) {
    try {
        String table = "voucher_salereturn";  // 根据实际情况调整表名
        String updateSql = "UPDATE " + table +
                " SET wms_status = ? " +
                " WHERE id= ?  AND ytenant_id=?";

        SQLParameter parameter = new SQLParameter();
        parameter.addParam(wmsStatus);
        parameter.addParam(saleReturnId);
        parameter.addParam(tenantId);
        ymsJdbcApi.update(updateSql, parameter);

        log.error("更新WMS状态成功, saleReturnId:{}, wmsStatus:{}", saleReturnId, wmsStatus);
    } catch (Exception e) {
        log.error(e.getMessage(), e);
        throw e;
    }
}
```

## 数值精度规则

| 字段类型 | 精度要求 | 说明 |
|----------|----------|------|
| 数量 | 根据实际业务 | decimal |
| 金额 | 2位小数 | 精确到分 |

## 日期格式规范

- **BIP格式**：yyyy-MM-dd HH:mm:ss 或 Date对象
- **WMS格式**：yyyy-MM-dd
- **转换示例**："2024-03-09 00:00:00" -> "2024-03-09"

## 异常处理

### 常见异常场景

1. **数据查询异常**：销售退货单不存在或无权限
2. **仓库校验异常**：退货仓库为空或不是WMS仓
3. **字段映射异常**：必填字段为空或格式错误
4. **接口调用异常**：网络超时、服务不可用

### 异常处理代码

```java
try {
    // 业务逻辑
} catch (DataNotFoundException e) {
    log.error("销售退货单不存在", e);
    throw new BusinessException("销售退货单不存在：" + e.getMessage());
} catch (WarehouseNotWMSException e) {
    log.error("退货仓库不是WMS仓", e);
    throw new BusinessException("退货仓库不是WMS仓：" + e.getMessage());
} catch (FieldMappingException e) {
    log.error("字段映射失败", e);
    throw new BusinessException("字段映射失败：" + e.getMessage());
} catch (ApiCallException e) {
    log.error("接口调用失败", e);
    // 可配置重试机制
    retryService.scheduleRetry(saleReturnId);
}
```

## 注意事项

1. **幂等性保证**：同一退货单多次调用应保证结果一致
2. **事务一致性**：回写操作需保证数据一致性
3. **日志记录**：关键节点需记录操作日志便于追溯
4. **并发控制**：避免同一退货单并发推送
5. **WMS仓校验**：推送前必须校验退货仓库是否为WMS仓
6. **特征组处理**：特征组字段可能为空，需做空值判断
7. **日期转换**：注意处理Date对象和String类型的日期字段
