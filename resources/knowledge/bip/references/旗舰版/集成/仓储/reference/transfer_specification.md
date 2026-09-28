# 调拨订单业务场景规范

## 业务语义

调拨订单推送是指基于BIP系统中已审核的调拨订单数据，向WMS系统发起出入库请求的标准业务流程。

### 业务目标

将BIP调拨订单的完整业务数据，通过标准化的字段映射与接口调用，推送至WMS系统完成实际的仓储出入库操作。

### 前置条件

1. BIP调拨订单已审核通过
2. 调出/调入仓库为WMS管理仓库（bWMS = true）
3. 调拨订单未推送给WMS或需要重新推送

## 核心流程

```
调拨订单ID ──▶ 查询订单详情 ──▶ 字段映射转换 ──▶ 调用WMS接口 ──▶ 解析回执
```

## 关键字段映射

### 基础字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| code | docNo | 单据编号 | 是 |
| id | docHeaderId | 单据头ID | 是 |
| outorg.code | customerId | 调出组织编码 | 是 |
| inorg.code | targetOrgCode | 调入组织编码 | 否 |
| bustype.code | bustype | 交易类型 | 是 |
| outwarehouse.code | ERPoutSublibrary | 调出仓库编码 | 是 |
| inwarehouse.code | ERPinSublibrary | 调入仓库编码 | 是 |
| memo | notes | 备注 | 否 |
| outdepartment.code | workshop | 调出部门/车间 | 否 |
| indepartment.name | departmentName | 调入部门名称 | 否 |
| inbizperson.name | applicant | 申请人 | 否 |

### 单据类型映射

| 业务场景 | WMS单据类型 | 说明 |
|---------|-------------|------|
| 调拨出库 | OUB0701 | 库内调拨出库 |
| 调拨入库 | INB0701 | 库内调拨入库 |
| 车间退料 | INB0301 | 生产退料入库 |
| 车间退料（另一接口） | INB0303 | 产线退料 |
| 成品入库 | INB0404 | 产品入库 |
| 转储入库 | INB0401 | 转储入库 |

### 明细字段

| BIP字段 | 目标字段 | 精度 | 说明 |
|---------|---------|------|------|
| lineno | lineNo | - | 行号 |
| id | docLineId | - | 明细ID |
| productn.code | sku | - | 物料编码 |
| productn.name | skuDesc | - | 物料名称 |
| qty | qty | 6位 | 数量 |
| unit.name | uom | - | 单位 |
| batchno | attribute4 | - | 批次号 |
| producedate | attribute1 | - | 生产日期（yyyy-MM-dd）|
| invaliddate | attribute2 | - | 失效日期（yyyy-MM-dd）|
| outreserveid | attribute12 | - | 出库跟踪线索 |
| project.code | attribute18 | - | 项目编码 |
| memo | attribute21 | - | 备注 |

### 特征组字段

> **重要规则**：特征字段是BIP明细表的扩展属性字段，存储在 `transferApplysCharacteristics` 结构中。**具体字段编码必须从用户提供的字段映射文档中动态识别和提取**。
> 
> **识别逻辑**：
> ```
> 用户提供的字段映射文档（Excel/Word等）
>     │
>     ├── 扫描BIP字段列
>     │   ├── 识别特征属性描述
>     │   │   ├── 是 → 提取字段编码和描述
>     │   │   │           ↓
>     │   │   │       识别业务含义（匹配目标系统字段）
>     │   │   │           ↓
>     │   │   └── 生成特征字段映射关系
>     │   │
>     │   └── 匹配目标系统字段
>     │       ├── attribute5 → {文档中的BIP特征字段}
>     │       ├── attribute11 → {文档中的BIP特征字段}
>     │       ├── attribute14 → {文档中的BIP特征字段}
>     │       └── ... 其他字段
>     │
>     └── 生成字段映射代码
> ```
> 
> **特征字段判断标准**：
> 1. 字段描述中明确说明是**特征属性**、**自由项**或**自定义字段**
> 2. 字段值从特征组结构中获取
> 3. 字段编码不限于特定命名格式

**特征字段识别关键词对照表**：

| 目标系统字段 | 识别关键词 | 转换说明 | 常见BIP字段示例 |
|-------------|-----------|---------|----------------|
| attribute5 | 图号版本、图纸版本 | 需翻译 | DRW_VER |
| attribute11 | 清洗标识、是否清洗 | 需翻译 | Is_Clear |
| attribute14 | 颜色、色号 | 需翻译 | CLR |
| attribute15 | 销售合同号、合同号 | 需翻译 | SL_CO |
| attribute16 | BOM标准、BOM版本 | 需翻译 | BOM_STD |
| attribute17 | 工作令号、令号 | 需翻译 | JOB_NO |
| attribute19 | 客户指定供应商、指定供应商 | 需翻译 | CUST_SUP |

**动态识别示例**：

假设用户提供的字段映射文档内容如下：
```
BIP字段                | 目标系统字段 | 说明
----------------------|-------------|------
DRW_VER               | attribute5  | 图号版本（特征字段）
Is_Clear              | attribute11 | 清洗标识（特征字段）
CLR                   | attribute14 | 颜色（特征字段）
```

则生成的字段映射代码应为：
```java
// 处理特征组字段
Map<String, Object> transferApplysCharacteristics = 
    (Map<String, Object>) detail.get("transferApplysCharacteristics");
if (transferApplysCharacteristics != null) {
    // 图号版本（从文档识别：DRW_VER → attribute5）
    String drwVer = (String) transferApplysCharacteristics.get("DRW_VER");
    if (drwVer != null) {
        dto.setAttribute5(translateCharacteristic(drwVer, "DRW_VER"));
    }
    
    // 清洗标识（从文档识别：Is_Clear → attribute11）
    String isClear = (String) transferApplysCharacteristics.get("Is_Clear");
    if (isClear != null) {
        dto.setAttribute11(translateCharacteristic(isClear, "Is_Clear"));
    }
    
    // 颜色（从文档识别：CLR → attribute14）
    String clr = (String) transferApplysCharacteristics.get("CLR");
    if (clr != null) {
        dto.setAttribute14(translateCharacteristic(clr, "CLR"));
    }
}
```

**如果文档中未包含某特征字段，则不生成该字段的映射代码**。

---

## 核心代码模板

### 1. 查询调拨订单

```java
/**
 * 查询BIP调拨订单详情
 */
private Map<String, Object> queryTransferOrder(String orderId) throws Exception {
    // 查询主表
    QuerySchema querySchema = new QuerySchema().addSelect(
        "outorg.code as customerId," +
        "code as docNo," +
        "id as docHeaderId," +
        "bustype.code as bustype," +
        "indepartment.name as departmentName," +
        "inbizperson.name as applicant," +
        "outdepartment.code as workshop," +
        "memo as notes," +
        "outwarehouse.code as ERPoutSublibrary," +
        "inwarehouse.code as ERPinSublibrary"
    );
    querySchema.appendQueryCondition(
        QueryConditionGroup.and(QueryCondition.name("id").eq(orderId))
    );
    
    List<Map<String, Object>> list = iYmsJdbcApi.query(
        EntityUrl.ST_TRANSFERAPPLY_TRANSFERAPPLY, 
        querySchema, 
        EntityUrl.USTOCK
    );
    
    if (CollectionUtils.isEmpty(list)) {
        throw new BusinessException("90003", "调拨订单未找到！", null);
    }
    
    Map<String, Object> sendData = list.get(0);
    
    // 查询明细
    QuerySchema detailSchema = new QuerySchema().addSelect(
        "lineno as lineNo," +
        "id as docLineId," +
        "productn.code as sku," +
        "productn.name as skuDesc," +
        "qty as qty," +
        "unit.name as uom," +
        "batchno as attribute4," +
        "producedate," +
        "invaliddate," +
        "outreserveid as attribute12," +
        "project.code as attribute18," +
        "transferApplysCharacteristics," +
        "memo as attribute21"
    );
    detailSchema.appendQueryCondition(
        QueryConditionGroup.and(
            QueryCondition.name("mainid").eq(sendData.get("docHeaderId"))
        )
    );
    
    List<Map<String, Object>> details = iYmsJdbcApi.query(
        EntityUrl.ST_TRANSFERAPPLY_TRANSFERAPPLYS, 
        detailSchema, 
        EntityUrl.USTOCK
    );
    
    // 处理明细特征组字段
    for (Map<String, Object> detail : details) {
        processCharacteristics(detail);
    }
    
    sendData.put("details", details);
    return sendData;
}
```

### 2. 字段映射转换

```java
/**
 * 将BIP调拨订单转换为WMS DTO
 */
public TransferOrderWmsDTO convertToWmsDTO(Map<String, Object> bipData,
                                            Map<String, String> orgCodeMap) {
    TransferOrderWmsDTO dto = new TransferOrderWmsDTO();
    
    // 基础字段
    dto.setCustomerId(bipData.get("customerId"));
    dto.setDocNo(bipData.get("docNo"));
    dto.setDocHeaderId(bipData.get("docHeaderId"));
    dto.setBustype(bipData.get("bustype"));
    dto.setNotes(bipData.get("notes"));
    dto.setERPoutSublibrary(bipData.get("ERPoutSublibrary"));
    dto.setERPinSublibrary(bipData.get("ERPinSublibrary"));
    
    // 单据类型（根据业务场景动态设置）
    dto.setOrderType("OUB0701"); // 默认调拨出库
    dto.setCreateSource("ERP");
    dto.setAccountOnly("N");
    
    // 明细转换
    List<Map<String, Object>> details = (List<Map<String, Object>>) bipData.get("details");
    List<TransferOrderDetailWmsDTO> itemList = new ArrayList<>();
    
    for (Map<String, Object> detail : details) {
        itemList.add(convertDetail(detail));
    }
    dto.setDetails(itemList);
    
    return dto;
}

/**
 * 转换明细
 */
private TransferOrderDetailWmsDTO convertDetail(Map<String, Object> detail) {
    TransferOrderDetailWmsDTO dto = new TransferOrderDetailWmsDTO();
    
    dto.setLineNo(detail.get("lineNo"));
    dto.setDocLineId(detail.get("docLineId"));
    dto.setSku(detail.get("sku"));
    dto.setSkuDesc(detail.get("skuDesc"));
    dto.setUom(detail.get("uom"));
    dto.setAttribute4(detail.get("attribute4"));
    dto.setAttribute18(detail.get("attribute18"));
    dto.setAttribute21(detail.get("attribute21"));
    
    // 数值精度处理
    dto.setQty(convertDecimal(detail.get("qty"), 6));
    
    // 日期格式转换
    dto.setAttribute1(dateToStr((Date) detail.get("producedate")));
    dto.setAttribute2(dateToStr((Date) detail.get("invaliddate")));
    
    // 处理跟踪线索编码转换
    String outreserveid = (String) detail.get("attribute12");
    dto.setAttribute12(convertReserveId(outreserveid));
    
    return dto;
}

/**
 * 处理特征组字段
 * 
 * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
 * 
 * 生成规则：
 * 1. 扫描用户提供的字段映射文档（Excel/Word等）
 * 2. 识别描述为"特征属性"、"自由项"的BIP字段
 * 3. 根据目标系统字段（attribute5/attribute11等）匹配业务含义
 * 4. 动态生成字段获取和转换代码
 * 
 * 字段类型处理：
 * - 普通文本字段：直接从characteristics获取值
 * - 参照字段（自定义档案）：需要翻译，将ID转换为编码
 */
private void processCharacteristics(Map<String, Object> detail) {
    Map<String, Object> characteristics = 
        (Map<String, Object>) detail.get("transferApplysCharacteristics");
    
    if (characteristics == null) {
        return;
    }
    
    // ============================================
    // 动态生成区域 - 根据字段映射文档自动识别特征字段
    // ============================================
    
    // 示例1：普通文本字段（从文档动态识别：{BIP字段} → attribute5）
    // Object attr5 = characteristics.get("{BIP字段编码}");
    // detail.put("attribute5", attr5);
    
    // 示例2：参照字段-自定义档案（需要翻译）
    // 从文档识别：{BIP字段} → attribute5，字段类型=自定义档案
    // String attr5Id = (String) characteristics.get("{BIP字段编码}");
    // String attr5Code = translateCustomArchive(attr5Id, "档案类型");
    // detail.put("attribute5", attr5Code);
    
    // 示例3：枚举字段（需要翻译）
    // 从文档识别：{BIP字段} → attribute11，字段类型=枚举
    // String attr11Code = (String) characteristics.get("{BIP字段编码}");
    // String attr11Value = translateEnum("枚举类型", attr11Code);
    // detail.put("attribute11", attr11Value);
}

/**
 * 翻译自定义档案
 * 将档案ID转换为档案编码
 * 
 * @param archiveId 档案ID
 * @param archiveType 档案类型
 * @return 档案编码
 */
private String translateCustomArchive(String archiveId, String archiveType) {
    if (StringUtils.isBlank(archiveId)) {
        return null;
    }
    // TODO: 翻译自定义档案
    // return mcpService.translateToCode(archiveId, archiveType);
    return archiveId;
}

/**
 * 翻译枚举值
 * 将枚举编码转换为枚举值
 * 
 * @param enumType 枚举类型
 * @param enumCode 枚举编码
 * @return 枚举值
 */
private String translateEnum(String enumType, String enumCode) {
    if (StringUtils.isBlank(enumCode)) {
        return null;
    }
    // TODO: 翻译枚举
    // return mcpService.translateEnum(enumType, enumCode);
    return enumCode;
}
```

### 3. 工具方法

```java
/**
 * 数值精度转换
 */
private BigDecimal convertDecimal(Object value, int scale) {
    if (value == null) {
        return BigDecimal.ZERO;
    }
    BigDecimal decimal = new BigDecimal(value.toString());
    return decimal.setScale(scale, RoundingMode.HALF_UP);
}

/**
 * 日期格式转换
 */
private String dateToStr(Date date) {
    if (date == null) {
        return "";
    }
    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
    return sdf.format(date);
}

/**
 * 转换跟踪线索编码
 */
private String convertReserveId(String reserveId) {
    if (StringUtils.isBlank(reserveId) || "0".equals(reserveId)) {
        return "";
    }
    // TODO: 查询跟踪线索编码映射
    // return reserveCodeMap.get(reserveId);
    return reserveId;
}
```

### 4. WMS接口调用

```java
/**
 * 调用WMS接口推送调拨订单
 */
public WmsResponse sendToWms(TransferOrderWmsDTO dto, String wmsUrl) throws Exception {
    // 构建请求参数
    Map<String, Object> params = new HashMap<>();
    params.put("headlist", dto);
    
    // 发送HTTP请求
    String responseStr = HttpClient.post(wmsUrl, JSON.toJSONString(params));
    
    // 解析响应
    JSONObject response = JSON.parseObject(responseStr);
    WmsResponse wmsResponse = new WmsResponse();
    wmsResponse.setSuccess(response.getBoolean("success"));
    wmsResponse.setCode(response.getString("code"));
    wmsResponse.setMessage(response.getString("message"));
    wmsResponse.setWmsDocNo(response.getString("wmsDocNo"));
    
    return wmsResponse;
}
```

### 5. 结果回写

```java
/**
 * 回写执行状态
 */
private void writeBackStatus(String orderId, boolean success, String message) {
    SQLParameter parameter = new SQLParameter();
    parameter.addParam(success ? "1" : "0");
    parameter.addParam(message);
    parameter.addParam(orderId);
    
    String sql = "UPDATE st.transferapply.TransferApply SET " +
                 "wmsPushStatus = ?, " +
                 "wmsPushMessage = ? " +
                 "WHERE id = ?";
    
    iYmsJdbcApi.update(sql, parameter);
}
```

## 数值精度规则

| 字段类型 | 精度要求 | 说明 |
|----------|----------|------|
| 数量 | 6位小数 | 小数点后保留6位 |
| 金额 | 2位小数 | 精确到分 |

## 异常处理

### 常见异常场景

1. **数据查询异常**：调拨订单不存在或无权限
2. **字段映射异常**：必填字段为空或格式错误
3. **接口调用异常**：网络超时、服务不可用
4. **业务校验异常**：仓库非WMS管理、订单已推送

### 异常处理代码

```java
try {
    // 业务逻辑
} catch (DataNotFoundException e) {
    log.error("调拨订单不存在", e);
    throw new BusinessException("调拨订单不存在：" + e.getMessage());
} catch (FieldMappingException e) {
    log.error("字段映射失败", e);
    throw new BusinessException("字段映射失败：" + e.getMessage());
} catch (ApiCallException e) {
    log.error("WMS接口调用失败", e);
    // 可配置重试机制
    retryService.scheduleRetry(orderId);
}
```

## 注意事项

1. **幂等性保证**：同一订单多次调用应保证结果一致
2. **事务一致性**：回写操作需保证数据一致性
3. **日志记录**：关键节点需记录操作日志便于追溯
4. **并发控制**：避免同一订单并发推送
5. **特征字段**：注意特征组字段可能为空，需做空值判断
6. **跟踪线索**：出库跟踪线索ID需要转换为编码
7. **仓库校验**：推送前需校验仓库是否为WMS管理仓库
