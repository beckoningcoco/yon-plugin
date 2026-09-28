# 其他出库业务场景规范

## 业务语义

其他出库推送是指基于BIP系统中已审核的其他出库单数据，向WMS系统发起出库单推送请求的标准业务流程。

### 业务目标

将BIP其他出库单的完整业务数据，通过标准化的字段映射与接口调用，推送至WMS系统进行处理。

### 前置条件

1. BIP其他出库单已审核通过
2. 仓库已启用WMS（warehouse.bWMS = true）
3. 单据未推送至WMS或需要重新推送

## 核心流程

```
其他出库单ID ──▶ 查询BIP数据 ──▶ 字段映射转换 ──▶ 调用WMS接口 ──▶ 回写wmsStatus
```

## 关键字段映射

### 基础字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| id | docHeaderId | 直接映射 | 是 |
| code | docNo | 直接映射 | 是 |
| org.code | customerId | 组织编码 | 是 |
| bustype.code | bustype | 业务类型编码 | 是 |
| department.code | workshop | 部门编码 | 否 |
| warehouse.code | ERPoutSublibrary | 出库仓库编码 | 是 |
| warehouse.bWMS | bWMS | WMS标识判断 | 是 |
| pubts | udf01 | 格式：yyyy-MM-dd HH:mm:ss | 是 |
| operator.code | applicant | 经办人编码 | 否 |

### 明细字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| lineno | lineNo | 直接映射 | 是 |
| id | docLineId | 明细ID | 是 |
| product.cCode | sku | 物料编码 | 是 |
| product.cName | skuDesc | 物料名称 | 是 |
| contactsQuantity | qty | 取绝对值 | 是 |
| unit.code | uom | 单位编码 | 是 |
| batchno | attribute4 | 批次号 | 否 |
| project.code | attribute18 | 项目编码 | 否 |

### 特征组字段（动态识别）

> **重要规则**：特征字段是BIP明细表的扩展属性字段，存储在 `othOutRecordsCharacteristics` 结构中。**具体字段编码必须从用户提供的字段映射文档中动态识别和提取**。
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
>     │       ├── 图号版本/DRW_VER → attribute5
>     │       ├── 客户供应商/CUST_SUP → attribute10/19
>     │       ├── 是否清洗/Is_Clear → attribute11
>     │       ├── 颜色/CLR → attribute14
>     │       ├── 销售公司/SL_CO → attribute15
>     │       ├── BOM标准/BOM_STD → attribute16
>     │       ├── 作业号/JOB_NO → attribute17
>     │       └── ... 其他字段
>     │
>     └── 生成字段映射代码
> ```

**特征字段识别关键词对照表**：

| 目标系统字段 | 识别关键词 | 转换说明 | 常见BIP字段示例 |
|-------------|-----------|---------|----------------|
| attribute5（图号版本） | 图号版本、DRW_VER、图纸版本 | BIP特征字段 → WMS attribute5 | DRW_VER |
| attribute10/19（客户供应商） | 客户供应商、CUST_SUP | BIP特征字段 → WMS attribute10/19 | CUST_SUP |
| attribute11（是否清洗） | 是否清洗、Is_Clear | BIP特征字段 → WMS attribute11 | Is_Clear |
| attribute14（颜色） | 颜色、CLR | BIP特征字段 → WMS attribute14 | CLR |
| attribute15（销售公司） | 销售公司、SL_CO | BIP特征字段 → WMS attribute15 | SL_CO |
| attribute16（BOM标准） | BOM标准、BOM_STD | BIP特征字段 → WMS attribute16 | BOM_STD |
| attribute17（作业号） | 作业号、JOB_NO | BIP特征字段 → WMS attribute17 | JOB_NO |

**动态识别示例**：

假设用户提供的字段映射文档内容如下：
```
BIP字段                | 目标系统字段 | 说明
----------------------|-------------|------
DRW_VER               | attribute5  | 图号版本（特征字段）
CUST_SUP              | attribute10 | 客户供应商（特征字段）
Is_Clear              | attribute11 | 是否清洗（特征字段）
CLR                   | attribute14 | 颜色（特征字段）
SL_CO                 | attribute15 | 销售公司（特征字段）
BOM_STD               | attribute16 | BOM标准（特征字段）
JOB_NO                | attribute17 | 作业号（特征字段）
```

则生成的字段映射代码应为：
```java
// 处理明细特征组字段
Map<String, Object> othOutRecordsCharacteristics = (Map<String, Object>) detailMap.get("othOutRecords_othOutRecordsCharacteristics");
StringBuffer sb = new StringBuffer();

if (othOutRecordsCharacteristics != null && othOutRecordsCharacteristics.get("DRW_VER") != null) {
    sb.append("othOutRecordsCharacteristics.DRW_VER.code as attribute5,");
    detail.put("scDRW_VER", othOutRecordsCharacteristics.getOrDefault("DRW_VER", ""));
}
// 查询特征字段详细信息
if (sb.length() > 0) {
    String fieldString = sb.toString();
    if (fieldString.endsWith(",")) {
        fieldString = fieldString.substring(0, sb.length() - 1);
    }
    Map<String, Object> characteristicsMap = queryDetailCharacteristics(lineId, fieldString, "st.othoutrecord.OthOutRecords", "ustock");
    DeepCopyUtil.deepCopyMap(characteristicsMap, detail);
}
```

**如果文档中未包含某特征字段，则不生成该字段的映射代码**。

### 单据类型映射

| 数量方向 | WMS orderType | 含义 |
|---------|---------------|------|
| 正数（contactsQuantity > 0） | OUB0601 | 其他出库 |
| 负数（contactsQuantity < 0） | INB0602 | 其他出库退回 |

### 接口地址映射

| 数量方向 | WMS接口地址 | 说明 |
|---------|-------------|------|
| 正数 | /xdesb/wms/wms_re_xd_otheroub_027/1.0.0 | 其他出库推送 |
| 负数 | /xdesb/wms/wms_re_xd_otheroubrtn_039/1.0.0 | 其他出库退回推送 |

## 核心代码模板

### 1. 查询其他出库单

```java
import com.yonyou.ypd.bill.infrastructure.service.api.IBillQueryRepository;
@Autowired
private IBillQueryRepository ibillquery;
/**
 * 查询BIP其他出库单详情
 */
private List<Map<String, Object>> queryOthOutRecord(String billId) throws Exception {
    QuerySchema qc = QuerySchema.create().addSelect(
        "org.code as customerId,code as docNo,id as docHeaderId,bustype.code as bustype," +
        "department.code as workshop, warehouse.code as ERPoutSublibrary,warehouse.bWMS as bWMS, pubts," +
        "operator.code as applicant, othOutRecords.lineno as lineNo,othOutRecords.id as docLineId," +
        "othOutRecords.product.cCode as sku,othOutRecords.product.cName as skuDesc," +
        "othOutRecords.contactsQuantity as qty,othOutRecords.unit.code as uom," +
        "othOutRecords.batchno as attribute4,othOutRecords.othOutRecordsCharacteristics," +
        "othOutRecords.project.code as attribute18"
    );
    QueryConditionGroup qcg = new QueryConditionGroup();
    qcg.addCondition(QueryCondition.name("id").eq(billId));
    qc.addCondition(qcg);
    
    return ibillquery.queryMapBySchema("st.othoutrecord.OthOutRecord", qc, "ustock");
}
```

### 2. 字段映射转换

```java
/**
 * 将BIP其他出库单转换为WMS格式
 */
public Map<String, Object> convertToWMSFormat(List<Map<String, Object>> billMap) throws Exception {
    if (CollUtil.isEmpty(billMap)) {
        return null;
    }
    
    Map<String, Object> head = new HashMap<>();
    Map<String, Object> headMap = billMap.get(0);
    
    // 检查WMS标识
    boolean bWMS = TypeUtils.toBoolean(headMap.get("bWMS"), false);
    if (!bWMS) {
        Map<String, Object> result = new HashMap<>();
        result.put("isPush", "0");
        return result;
    }
    
    // 基础字段
    head.put("docHeaderId", headMap.get("docHeaderId"));
    head.put("docNo", headMap.get("docNo"));
    head.put("createSource", "ERP");
    head.put("customerId", headMap.get("customerId"));
    head.put("bustype", headMap.get("bustype"));
    head.put("udf01", DateUtils.dateToString((Date) headMap.get("pubts"), "yyyy-MM-dd HH:mm:ss"));
    
    // 明细转换
    List<Map<String, Object>> details = new ArrayList<>();
    List<BigDecimal> detailQty = new ArrayList<>();
    
    for (Map<String, Object> detailMap : billMap) {
        Map<String, Object> detail = new HashMap<>();
        
        Object qty = detailMap.get("qty");
        if (qty != null) {
            detailQty.add(new BigDecimal(String.valueOf(qty)));
        } else {
            throw new BusinessException("明细行数量为0或为空，推送wms失败");
        }
        
        String lineId = detailMap.get("docLineId") != null ? detailMap.get("docLineId").toString() : "";
        
        detail.put("lineNo", String.valueOf(detailMap.get("lineNo")));
        detail.put("docLineId", String.valueOf(detailMap.get("docLineId")));
        detail.put("sku", detailMap.get("sku").toString());
        detail.put("skuDesc", detailMap.get("skuDesc").toString());
        BigDecimal absQty = new BigDecimal(String.valueOf(qty)).abs();
        detail.put("qty", absQty);
        detail.put("uom", detailMap.get("uom").toString());
        detail.put("ERPoutSublibrary", detailMap.get("ERPoutSublibrary").toString());
        detail.put("ERPinSublibrary", detailMap.get("ERPoutSublibrary").toString());
        
        // 处理特征组字段（动态识别）
        processCharacteristics(detail, detailMap, lineId);
        
        // 其他属性字段
        detail.put("attribute4", detailMap.getOrDefault("attribute4", ""));
        
        details.add(detail);
    }
    
    head.put("details", details);
    
    // 判断单据类型和接口地址,如果后续三方系统使用一个接口承载，那么就使用一个接口即可，
    boolean qtyLessZero = detailQty.stream().anyMatch(d -> d.compareTo(BigDecimal.ZERO) < 0);
    Map<String, Object> result = new HashMap<>();
    
    if (qtyLessZero) {
        result.put("restUrl", "/xdesb/wms/wms_re_xd_otheroubrtn_039/1.0.0");
        head.put("orderType", "INB0602");
    } else {
        result.put("restUrl", "/xdesb/wms/wms_re_xd_otheroub_027/1.0.0");
        head.put("orderType", "OUB0601");
    }
    
    result.put("headlist", head);
    return result;
}

/**
 * 处理特征组字段
 * 
 * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
 * 
 * 生成规则：
 * 1. 扫描用户提供的字段映射文档（Excel/Word等）
 * 2. 识别描述为"明细特征属性"的BIP字段
 * 3. 根据目标系统字段（attribute5/10/11/14/15/16/17等）匹配业务含义
 * 4. 动态生成字段获取和转换代码
 */
private void processCharacteristics(Map<String, Object> detail, Map<String, Object> detailMap, String lineId) {
    Map<String, Object> characteristics = (Map<String, Object>) detailMap.get("othOutRecords_othOutRecordsCharacteristics");
    if (characteristics == null) {
        return;
    }
    
    StringBuffer sb = new StringBuffer();
    
    // ============================================
    // 动态生成区域 - 根据字段映射文档自动识别特征字段
    // ============================================
    
    // 示例1：图号版本（从文档动态识别：DRW_VER → attribute5）
    // if (characteristics.get("DRW_VER") != null) {
    //     sb.append("othOutRecordsCharacteristics.DRW_VER.code as attribute5,");
    //     detail.put("scDRW_VER", characteristics.getOrDefault("DRW_VER", ""));
    // }
    
    // 查询特征字段详细信息
    if (sb.length() > 0) {
        String fieldString = sb.toString();
        if (fieldString.endsWith(",")) {
            fieldString = fieldString.substring(0, sb.length() - 1);
        }
        Map<String, Object> characteristicsMap = queryDetailCharacteristics(lineId, fieldString, "st.othoutrecord.OthOutRecords", "ustock");
        DeepCopyUtil.deepCopyMap(characteristicsMap, detail);
    }
}
```

### 3. 调用WMS接口

> **重要规则**：接口调用方式、报文格式和鉴权方式必须从用户提供的集成文档中动态识别。

```java
/**
 * 调用WMS接口推送其他出库单
 * 
 * 动态配置项（从集成文档识别）：
 * - 接口地址：{从文档识别的完整URL或路径}
 * - 调用方式：{GET/POST/PUT}
 * - 报文格式：{JSON/XML/Form}
 * - 鉴权方式：{Token/OAuth/Sign/None}
 * - 请求头：{从文档识别的请求头信息}
 * - 响应解析：{从文档识别的响应字段映射}
 */
private WMSResponse callWMSApi(Map<String, Object> data, String restUrl) throws Exception {
    // ============================================
    // 动态生成区域 - 根据集成文档自动识别接口配置
    // ============================================
    
    // 1. 识别接口地址（从文档动态识别）
    // String url = 从文档识别接口地址();
    String url = wmsHost + restUrl; // 占位符示例
    
    // 2. 构建请求参数（根据文档识别的报文格式组装）
    // Map<String, Object> param = 根据报文格式组装参数(data);
    Map<String, Object> param = new HashMap<>();
    param.put("headlist", data.get("headlist"));
    
    // 3. 发送请求（根据文档识别的调用方式和鉴权方式）
    // String responseStr = HttpClientUtils.sendRequest(url, param);
    String responseStr = HttpClientUtils.sendRequest(url, param);
    
    // 4. 解析响应（根据文档识别的响应格式）
    // JSONObject jsonObject = 根据响应格式解析(responseStr);
    JSONObject jsonObject = JSONObject.parseObject(responseStr);
    
    WMSResponse response = new WMSResponse();
    // 响应字段映射（从文档动态识别）
    response.setSuccess("200".equals(jsonObject.getString("code")));
    response.setCode(jsonObject.getString("code"));
    response.setMessage(jsonObject.getString("message"));
    
    if (response.isSuccess()) {
        JSONObject dataObj = jsonObject.getJSONObject("data");
        if (dataObj != null) {
            // 从文档识别WMS单号字段和状态字段
            response.setWmsBillNo(dataObj.getString("wmsBillNo"));
            response.setStatus(dataObj.getString("status"));
        }
    }
    
    return response;
}
```

### 4. 结果回写

> **重要规则**：回写目标表和字段必须从用户提供的业务描述中动态识别。**如果业务描述中未明确说明回写哪个表、哪些字段，则不进行状态回写**。

```java
/**
 * 回写WMS推送状态
 * 
 * 动态配置项（从业务描述识别）：
 * - 目标表名：{从业务描述识别的表名}
 * - 状态字段：{从业务描述识别的状态字段}
 * - WMS单号字段：{从业务描述识别的WMS单号字段}
 * - 消息字段：{从业务描述识别的消息字段}
 */
private void writeBackWmsStatus(String billId, WMSResponse response) {
    // ============================================
    // 动态生成区域 - 根据业务描述自动识别回写配置
    // ============================================
    
    // 如果业务描述中未明确说明回写配置，则不进行回写
    // if (无回写配置) {
    //     log.info("业务描述中未配置回写信息，跳过状态回写，billId: {}", billId);
    //     return;
    // }
    
    // 示例（实际应根据业务描述动态生成）：
    // SQLParameter parameter = new SQLParameter();
    // parameter.addParam(response.isSuccess() ? "1" : "0");
    // parameter.addParam(response.getWmsBillNo());
    // parameter.addParam(response.getMessage());
    // parameter.addParam(billId);
    // 
    // String sql = "UPDATE {表名} SET " +
    //              "{状态字段} = ?, {WMS单号字段} = ?, {消息字段} = ? " +
    //              "WHERE id = ?";
    // 
    // iYmsJdbcApi.update(sql, parameter);
}
```

## 数值精度规则

| 字段类型 | 精度要求 | 说明 |
|----------|----------|------|
| 数量 | 原始精度 | 取绝对值后推送 |
| 单价 | 原始精度 | 根据业务需求 |
| 金额 | 原始精度 | 根据业务需求 |

## 异常处理

### 常见异常场景

1. **数据查询异常**：单据不存在或无权限
2. **字段映射异常**：必填字段为空或格式错误
3. **接口调用异常**：网络超时、服务不可用
4. **业务校验异常**：仓库未启用WMS、数量为0

### 异常处理代码

```java
try {
    // 业务逻辑
} catch (DataNotFoundException e) {
    log.error("其他出库单不存在", e);
    throw new BusinessException("其他出库单不存在：" + e.getMessage());
} catch (FieldMappingException e) {
    log.error("字段映射失败", e);
    throw new BusinessException("字段映射失败：" + e.getMessage());
} catch (ApiCallException e) {
    log.error("接口调用失败", e);
    // 记录失败状态，支持重试
    writeBackWmsStatus(billId, new WMSResponse(false, "API_ERROR", e.getMessage()));
}
```

## 注意事项

1. **幂等性保证**：同一单据多次调用应保证结果一致
2. **事务一致性**：回写操作需保证数据一致性
3. **日志记录**：关键节点需记录操作日志便于追溯
4. **并发控制**：避免同一单据并发推送
5. **特征字段**：注意特征组字段可能为空，需做空值判断
6. **数量方向**：根据数量正负判断是出库还是退回
