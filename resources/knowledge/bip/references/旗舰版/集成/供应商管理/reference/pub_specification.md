# 公共规范（动态适配）

## 概述

> **⚠️ 适用范围**：本文件适用于**有第三方配置**时的动态适配场景
> **⚠️ 托底说明**：无第三方配置时的托底逻辑请参考 [td_specification.md](./td_specification.md)
> **⚠️ 代码生成规范**：遵循 MVC 分层架构
> **⚠️ 场景限制**：本技能仅生成**委外订单/入库推送 SRM**场景代码

---

## 1. Controller 层（入参处理）

### 1.1 统一推送 Controller

```java
@RestController
@RequestMapping("/subcontract")
public class SubcontractPushController {

    @Autowired
    private SubcontractPushService subcontractPushService;

    /**
     * 委外业务推送
     * POST /subcontract/push
     * @param billType 业务类型：order-委外订单，in-委外入库
     * @param data 单据ID列表（JSON数组字符串）
     */
    @PostMapping("/push")
    public void push(@RequestBody Map<String, Object> param,
                    HttpServletRequest request,
                    HttpServletResponse response) throws Exception {
        if (MapUtils.isEmpty(param)) {
            renderJson(response, Result.error("参数为空"));
            return;
        }

        String billType = (String) param.get("billType");
        if (StringUtils.isBlank(billType)) {
            renderJson(response, Result.error("billType不能为空"));
            return;
        }

        // 校验 billType
        if (!"order".equals(billType) && !"in".equals(billType)) {
            renderJson(response, Result.error("billType必须是order或in"));
            return;
        }

        Object data = param.get("data");
        if (data == null) {
            renderJson(response, Result.error("data不能为空"));
            return;
        }

        JSONArray jsonArray = JSONArray.parseArray((String) data);
        List<String> ids = jsonArray.toJavaList(String.class);

        if (CollectionUtils.isEmpty(ids)) {
            renderJson(response, Result.error("单据ID为空"));
            return;
        }

        try {
            SubcontractResult result = subcontractPushService.push(billType, ids);
            if ("200".equals(result.getSuccessCode())) {
                renderJson(response, Result.data(result));
            } else {
                renderJson(response, Result.error(result.getMsg()));
            }
        } catch (Exception e) {
            renderJson(response, Result.error(e.getMessage()));
        }
    }

    private void renderJson(HttpServletResponse response, Result result) throws Exception {
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(JSONObject.toJSONString(result));
    }
}
```

### 1.2 推送 Service 接口

```java
public interface SubcontractPushService {
    /**
     * 推送委外业务到第三方
     * @param billType 业务类型：order-委外订单，in-委外入库
     * @param billIds 单据ID列表
     * @return 推送结果
     */
    SubcontractResult push(String billType, List<String> billIds) throws Exception;

    /**
     * 删除委外业务
     * @param billType 业务类型
     * @param billId 单据ID
     * @return 删除结果
     */
    Map<String, Object> delete(String billType, String billId) throws Exception;
}
```

### 1.3 Service 实现（按 billType 分发）

```java
@Service
public class SubcontractPushServiceImpl implements SubcontractPushService {

    @Autowired
    private SubcontractOrderPushService orderPushService;

    @Autowired
    private SubcontractInPushService inPushService;

    @Override
    public SubcontractResult push(String billType, List<String> billIds) throws Exception {
        if ("order".equals(billType)) {
            return orderPushService.push(billIds);
        } else {
            return inPushService.push(billIds);
        }
    }

    @Override
    public Map<String, Object> delete(String billType, String billId) throws Exception {
        if ("order".equals(billType)) {
            return orderPushService.delete(billId);
        } else {
            return inPushService.delete(billId);
        }
    }
}
```

---

## 2. BIP 查询服务

### 2.1 统一查询服务接口

```java
public interface SubcontractQueryService {
    /**
     * 查询委外订单详情
     * @param billId 订单ID
     * @return 订单数据
     */
    Map<String, Object> querySubcontractOrder(String billId) throws Exception;

    /**
     * 查询委外入库详情
     * @param billId 入库单ID
     * @return 入库单数据
     */
    Map<String, Object> querySubcontractIn(String billId) throws Exception;
}
```

### 2.2 订单查询服务

> **⚠️ 委外订单详情 URL**：iuap-api-gateway/yonbip/mfg/subcontractorder/detail
> **⚠️ 请求方式**：GET
> **⚠️ 入参**：id（订单ID）

```java
@Service
public class SubcontractOrderQueryService implements SubcontractQueryService {

    @Value("${bip.subcontractorder.detail.url:}")
    private String detailUrl;

    @Autowired
    private BIPAuthService bipAuthService;

    @Override
    public Map<String, Object> querySubcontractOrder(String billId) throws Exception {
        // MCP技能调用：getOpenApiCall
        // 生成调用BIP委外订单详情接口的代码
        Map<String, Object> result = new HashMap<>();

        String accessToken = bipAuthService.getAccessToken();
        String url = detailUrl + "?id=" + billId;

        // TODO: 调用MCP生成HTTP请求代码
        // HttpResponse httpResponse = HttpUtil.createGet(url)
        //     .header("Authorization", "Bearer " + accessToken)
        //     .execute();
        // result = JSON.parseObject(httpResponse.getBody());

        return result;
    }

    @Override
    public Map<String, Object> querySubcontractIn(String billId) throws Exception {
        throw new UnsupportedOperationException("订单查询服务不支持入库查询");
    }
}
```

### 2.3 入库查询服务

> **⚠️ 委外入库详情 URL**：iuap-api-gateway/yonbip/scm/osminrecord/detail
> **⚠️ 请求方式**：GET
> **⚠️ 入参**：id（入库单ID）

```java
@Service
public class SubcontractInQueryService implements SubcontractQueryService {

    @Value("${bip.osminrecord.detail.url:}")
    private String detailUrl;

    @Autowired
    private BIPAuthService bipAuthService;

    @Override
    public Map<String, Object> querySubcontractOrder(String billId) throws Exception {
        throw new UnsupportedOperationException("入库查询服务不支持订单查询");
    }

    @Override
    public Map<String, Object> querySubcontractIn(String billId) throws Exception {
        // MCP技能调用：getOpenApiCall
        // 生成调用BIP委外入库详情接口的代码
        Map<String, Object> result = new HashMap<>();

        String accessToken = bipAuthService.getAccessToken();
        String url = detailUrl + "?id=" + billId;

        // TODO: 调用MCP生成HTTP请求代码
        // HttpResponse httpResponse = HttpUtil.createGet(url)
        //     .header("Authorization", "Bearer " + accessToken)
        //     .execute();
        // result = JSON.parseObject(httpResponse.getBody());

        return result;
    }
}
```

---

## 3. 字段映射转换

> **⚠️ 重要**：以下字段映射示例来自实际业务代码，仅供参��。实际映射关系需从Excel/需求动态读取。

### 3.1 订单字段映射

```java
@Service
public class SubcontractOrderFieldMapper {

    @Autowired
    private SubcontractOrderQueryService queryService;

    /**
     * 将BIP委外订单数据转换为第三方目标格式
     */
    public Map<String, Object> convert(Map<String, Object> sourceData) throws Exception {
        Map<String, Object> target = new HashMap<>();

        if (sourceData == null) {
            return target;
        }

        // ==================== 操作类型 ====================
        // OptionType: 0新增 1变更 2删除
        target.put("OptionType", 0);

        // ==================== 订单基本信息 ====================
        target.put("OrderId", sourceData.get("id"));
        target.put("OrderCode", sourceData.get("code"));
        target.put("OrderName", sourceData.get("code"));

        // ==================== 订单类型 ====================
        String transType = (String) sourceData.get("transTypeId_code");
        if ("WWDD01".equals(transType)) {
            target.put("OrderType", "25"); // 标准外协采购
        } else if ("GXWWDD01".equals(transType)) {
            target.put("OrderType", "26"); // 工序外协采购
        }

        // ==================== 订单状态 ====================
        target.put("OrderStatus", 0);

        // ==================== 日期信息 ====================
        target.put("OrderDate", sourceData.get("vouchdate"));
        target.put("CreateDate", sourceData.get("createTime"));

        // ==================== 人员信息 ====================
        target.put("CreateEmpNo", sourceData.get("creatorId"));
        target.put("CreateDeptNo", sourceData.get("creatorId_department"));

        // ==================== 组织信息 ====================
        target.put("OrderOrgNo", sourceData.get("orgId_code"));

        // ==================== 供应商信息 ====================
        target.put("SupplierCode", sourceData.get("vendor_code"));

        // ==================== 来源与税信息 ====================
        target.put("OrderSource", 1); // 0 SRM, 1 ERP, 2 PMS
        target.put("IsImport", 0);
        target.put("IsTaxed", 1);

        // ==================== 金额信息 ====================
        target.put("OrderAmount", sourceData.get("oriSum"));
        target.put("OrderNotaxAmount", sourceData.get("oriMoney"));
        target.put("CurrencyCode", sourceData.get("tcId_code"));
        target.put("ExchangeRate", sourceData.get("tcFCExchRate"));
        target.put("OrderExcAmount", sourceData.get("totalMoneyFC"));

        // ==================== 协同信息 ====================
        target.put("ConfirmMethod", 1);
        target.put("DeliveryMethod", 1);

        // ==================== 特征字段处理 ====================
        Map<String, Object> defineDts = (Map<String, Object>) sourceData.get("defineDts");
        if (defineDts != null) {
            Boolean isUrgent = (Boolean) defineDts.get("PO001");
            target.put("IsUrgentPur", isUrgent != null && isUrgent ? 1 : 0);
            Boolean isResProc = (Boolean) defineDts.get("PO005");
            target.put("IsResProc", isResProc != null && isResProc ? 1 : 0);
            Boolean isWholeOrder = (Boolean) defineDts.get("PO006");
            target.put("IsWholeOrder", isWholeOrder != null && isWholeOrder ? 1 : 0);
        }

        // ==================== 备注信息 ====================
        target.put("OrderRemark", sourceData.get("remark"));

        // ==================== 明细行处理 ====================
        Map<String, Object> lineData = convertOrderLine(sourceData);
        target.put("orderLines", lineData);

        return target;
    }

    private Map<String, Object> convertOrderLine(Map<String, Object> sourceData) throws Exception {
        Map<String, Object> orderLine = new HashMap<>();
        orderLine.put("DtlOptionType", 0);
        orderLine.put("OrderLineId", sourceData.get("productId"));

        // 特征字段
        Map<String, Object> productDefineDts = (Map<String, Object>) sourceData.get("productDefineDts");
        if (productDefineDts != null) {
            orderLine.put("PriceSerialNo", productDefineDts.get("charac_priceserialnum"));
            orderLine.put("EstPriceFlag", productDefineDts.get("EstPriceFlag"));
            orderLine.put("InsMethod", productDefineDts.get("charac_checkway"));
        }

        // 基础信息
        orderLine.put("OrderLineNum", sourceData.get("lineNo"));
        orderLine.put("MaterialCode", sourceData.get("productId_code"));
        orderLine.put("MaterialName", sourceData.get("productId_name"));

        // 数量
        orderLine.put("BaseQty", sourceData.get("subcontractQuantityMU"));
        orderLine.put("PurAuxQty", sourceData.get("subcontractQuantityMU"));

        // 单位
        orderLine.put("BaseUnit", sourceData.get("mainUnitId_code"));
        orderLine.put("PurAuxUnit", sourceData.get("subcontractUnitId_code"));
        orderLine.put("UnitFactor", sourceData.get("mainUnitId_convertCoefficient"));

        // 价格
        orderLine.put("TaxedPrice", sourceData.get("oriTaxUnitPrice"));
        orderLine.put("NoTaxPrice", sourceData.get("oriUnitPrice"));
        orderLine.put("ExchangePrice", sourceData.get("natTaxUnitPrice"));
        orderLine.put("TaxRate", sourceData.get("taxRate"));
        orderLine.put("TaxedAmount", sourceData.get("oriTax"));

        // 交货日期
        orderLine.put("DeliveryDate", sourceData.get("deliveryDate"));

        return orderLine;
    }
}
```

### 3.2 入库字段映射

```java
@Service
public class SubcontractInFieldMapper {

    /**
     * 将BIP委外入库数据转换为第三方目标格式
     */
    public Map<String, Object> convert(Map<String, Object> sourceData) throws Exception {
        Map<String, Object> target = new HashMap<>();

        if (sourceData == null) {
            return target;
        }

        // ==================== 操作类型 ====================
        target.put("OptionType", 0);

        // ==================== 基本信息 ====================
        target.put("billId", sourceData.get("id"));
        target.put("billCode", sourceData.get("code"));
        target.put("InboundId", sourceData.get("id"));
        target.put("InboundCode", sourceData.get("code"));

        // 入库单日期
        if (sourceData.get("vouchdate") != null) {
            Date vouchdate = (Date) sourceData.get("vouchdate");
            target.put("InboundDate", DateUtils.dateToStrLong(vouchdate));
        }

        // ==================== 组织信息 ====================
        if (sourceData.get("osmOrg") != null) {
            String orgCode = queryCompanyOrgCode(sourceData.get("osmOrg"));
            target.put("InboundOrgNo", orgCode);
        }
        if (sourceData.get("warehouse") != null) {
            String warehouseCode = queryWarehouseCode(sourceData.get("warehouse"));
            target.put("warehouseCode", warehouseCode);
        }

        // ==================== 供应商信息 ====================
        if (sourceData.get("invoiceVendor") != null) {
            String vendorCode = queryVendorCode(sourceData.get("invoiceVendor"));
            target.put("SupplierCode", vendorCode);
        } else {
            throw new RuntimeException("推三方时供应商SupplierCode不能为空");
        }
        if (sourceData.get("vendor") != null) {
            String invoiceVendor = queryVendorCode(sourceData.get("vendor"));
            target.put("TrueSupplierCode", invoiceVendor);
        }

        // ==================== 人员信息 ====================
        if (sourceData.get("creatorId") != null) {
            String staffCode = queryStuffCode(sourceData.get("creatorId").toString());
            target.put("CreateEmpNo", staffCode);
            String department = queryDeptCode(sourceData.get("creatorId").toString());
            target.put("CreateDeptNo", department);
        }
        if (sourceData.get("createDate") != null) {
            target.put("CreateDate", sourceData.get("createDate"));
        }

        // ==================== 交易类型 ====================
        String bustype = queryBustypeCode(sourceData.get("bustype"));
        Boolean purchaseReturn = "A15004".equals(bustype);
        target.put("bustype", sourceData.get("bustype"));
        target.put("InboundType", purchaseReturn ? 1 : 0);

        // ==================== 财务信息 ====================
        target.put("natCurrency_code", sourceData.get("natCurrency_code"));
        target.put("currency_code", sourceData.get("currency_code"));
        target.put("exchRate", sourceData.get("exchRate"));

        // ==================== 特征字段 ====================
        Map<String, Object> subcontractInDefineCharacter =
            (Map<String, Object>) sourceData.get("subcontractInDefineCharacter");
        if (subcontractInDefineCharacter != null) {
            Map<String, String> charFieldMapping = loadCharFieldMapping("main");
            CharacterFieldExtractor.extractCharacter(
                new JSONObject(subcontractInDefineCharacter),
                target,
                charFieldMapping
            );
        }

        // ==================== 明细行 ====================
        List<Map<String, Object>> lines = convertLines(sourceData);
        target.put("stockLines", lines);

        return target;
    }

    private List<Map<String, Object>> convertLines(Map<String, Object> sourceData) throws Exception {
        List<Map<String, Object>> stockLines = new ArrayList<>();
        List<Map<String, Object>> osmInRecords =
            (List<Map<String, Object>>) sourceData.get("osmInRecords");
        if (osmInRecords == null || osmInRecords.isEmpty()) {
            return stockLines;
        }

        Boolean purchaseReturn = "A15004".equals(queryBustypeCode(sourceData.get("bustype")));

        for (Map<String, Object> osmInRecord : osmInRecords) {
            Map<String, Object> stockLine = new HashMap<>();
            stockLine.put("DtlOptionType", 0);
            stockLine.put("InboundLineId", osmInRecord.get("id"));
            stockLine.put("OrderCode", osmInRecord.get("pocode"));
            stockLine.put("MaterialCode", osmInRecord.get("product"));
            stockLine.put("DetailStatus", 1);

            // 单位
            if (osmInRecord.get("unit") != null) {
                stockLine.put("BaseUnit", osmInRecord.get("unit"));
            }
            if (osmInRecord.get("priceUOM") != null) {
                stockLine.put("PurAuxUnit", osmInRecord.get("priceUOM"));
            }

            // 数量
            stockLine.put("BaseQty", getSignedQuantity((BigDecimal) osmInRecord.get("qty"), purchaseReturn));
            stockLine.put("PurAuxQty", getSignedQuantity((BigDecimal) osmInRecord.get("priceQty"), purchaseReturn));

            // 价格
            stockLine.put("TaxedPrice", osmInRecord.get("oriTaxUnitPrice"));
            stockLine.put("NoTaxPrice", osmInRecord.get("oriUnitPrice"));
            stockLine.put("ExchangePrice", osmInRecord.get("natTaxUnitPrice"));
            stockLine.put("TaxRate", osmInRecord.get("taxRate"));
            stockLine.put("TaxRateCode", osmInRecord.get("taxitems_code"));

            stockLines.add(stockLine);
        }
        return stockLines;
    }

    private BigDecimal getSignedQuantity(BigDecimal qty, Boolean purchaseReturn) {
        if (qty == null) return BigDecimal.ZERO;
        return purchaseReturn ? qty.negate() : qty;
    }

    private Map<String, String> loadCharFieldMapping(String type) {
        Map<String, String> mapping = new HashMap<>();
        // TODO: 从Excel动态读取
        return mapping;
    }

    private String queryCompanyOrgCode(Object orgId) { return ""; }
    private String queryWarehouseCode(Object warehouseId) { return ""; }
    private String queryVendorCode(Object vendorId) { return ""; }
    private String queryStuffCode(String creatorId) { return ""; }
    private String queryDeptCode(String creatorId) { return ""; }
    private String queryBustypeCode(Object bustype) { return ""; }
}
```

### 3.3 字段映射对照表

#### 订单字段

| BIP字段 | 三方字段 | 说明 |
|--------|----------|------|
| id | OrderId | 外部系统单据ID |
| code | OrderCode/OrderName | 订单编号/名称 |
| vouchdate | OrderDate | 订单日期 |
| transTypeId_code | OrderType | 订单类型(25标准/26工序) |
| creatorId | CreateEmpNo | 创建人员工编号 |
| createTime | CreateDate | 创建时间 |
| creatorId_department | CreateDeptNo | 创建人部门编号 |
| orgId_code | OrderOrgNo | 公司编码 |
| vendor_code | SupplierCode | 供应商��码 |
| defineDts.PO001 | IsUrgentPur | 是否紧急采购 |
| defineDts.PO005 | IsResProc | 需反馈生产进度 |
| defineDts.PO006 | IsWholeOrder | 整单结算 |

#### 入库字段

| BIP字段 | 三方字段 | 说明 |
|--------|----------|------|
| id | billId | ERP单据ID |
| code | billCode | ERP单据编号 |
| vouchdate | InboundDate | 入库单日期 |
| osmOrg | InboundOrgNo | 公司组织编码 |
| warehouse | warehouseCode | 仓库编码 |
| invoiceVendor | SupplierCode | 开票供应商 |
| vendor | TrueSupplierCode | 供货供应商 |
| creatorId | CreateEmpNo | 创建人员工编号 |
| bustype | bustype/InboundType | 交易类型/入库类型 |

---

## 4. 特征字段动态处理

### 4.1 特征组说明

**订单主表特征组**：`defineDts`

**订单明细特征组**：`productDefineDts`

**入库主表特征组**：`subcontractInDefineCharacter`

**入库明细特征组**：`subcontractInDetailsDefineCharacter`

> **⚠️ 通用逻辑**：特征字段翻译能力请参考 [char_translation_spec](../_公共规范/char_translation.md)

---

## 5. 三方鉴权接口机制

> **⚠️ 重要**：以下代码仅在**有第三方配置**时生成

### 5.1 鉴权服务接口

```java
public interface ThirdPartyAuthService {
    String getAccessToken() throws Exception;
}
```

### 5.2 鉴权服务实现

```java
@Service
public class ThirdPartyAuthServiceImpl implements ThirdPartyAuthService {

    @Value("${third.subcontract.auth.url:}")
    private String authUrl;

    @Value("${third.subcontract.auth.appKey:}")
    private String appKey;

    @Value("${third.subcontract.auth.appSecret:}")
    private String appSecret;

    @Override
    public String getAccessToken() throws Exception {
        // TODO: 根据配置生成鉴权请求
        return null;
    }
}
```

---

## 6. 三方接口调用

### 6.1 订单接口服务

```java
public interface ThirdPartySubcontractOrderService {
    ThirdApiResponse pushSubcontractOrder(Map<String, Object> data);
    ThirdApiResponse deleteSubcontractOrder(String billId);
}

@Service
public class ThirdPartySubcontractOrderServiceImpl implements ThirdPartySubcontractOrderService {

    @Value("${third.subcontractorder.push.url:}")
    private String pushUrl;

    @Autowired
    private ThirdPartyAuthService authService;

    @Override
    public ThirdApiResponse pushSubcontractOrder(Map<String, Object> data) {
        ThirdApiResponse response = new ThirdApiResponse();
        try {
            String accessToken = authService.getAccessToken();
            // TODO: 根据配置生成调用代码
        } catch (Exception e) {
            response.setCode("500");
            response.setMessage(e.getMessage());
        }
        return response;
    }

    @Override
    public ThirdApiResponse deleteSubcontractOrder(String billId) {
        return null;
    }
}
```

### 6.2 入库接口服务

```java
public interface ThirdPartySubcontractInService {
    ThirdApiResponse pushSubcontractIn(Map<String, Object> data);
    ThirdApiResponse deleteSubcontractIn(String billId);
}

@Service
public class ThirdPartySubcontractInServiceImpl implements ThirdPartySubcontractInService {

    @Value("${third.osminrecord.push.url:}")
    private String pushUrl;

    @Value("${third.osminrecord.delete.url:}")
    private String deleteUrl;

    @Autowired
    private ThirdPartyAuthService authService;

    @Override
    public ThirdApiResponse pushSubcontractIn(Map<String, Object> data) {
        ThirdApiResponse response = new ThirdApiResponse();
        try {
            String accessToken = authService.getAccessToken();
            // TODO: 根据配置生成调用代码
        } catch (Exception e) {
            response.setCode("500");
            response.setMessage(e.getMessage());
        }
        return response;
    }

    @Override
    public ThirdApiResponse deleteSubcontractIn(String billId) {
        return null;
    }
}
```

---

## 7. 响应解析

### 7.1 响应DTO

```java
@Data
public class ThirdApiResponse implements Serializable {
    private static final long serialVersionUID = 1L;

    private String code;
    private String message;
    private Object data;
    private String billId;
    private String thirdBillNo;

    public boolean isSuccess() {
        return "200".equals(code) || "1".equals(code) || "true".equalsIgnoreCase(code);
    }
}
```

---

## 8. 结果回写

### 8.1 订单回写服务

```java
public interface SubcontractOrderResultWriteService {
    void writeBack(String billId, ThirdApiResponse response) throws Exception;
}

@Service
public class SubcontractOrderResultWriteServiceImpl implements SubcontractOrderResultWriteService {

    @Autowired
    private SubcontractOrderMapper subcontractOrderMapper;

    @Override
    public void writeBack(String billId, ThirdApiResponse response) throws Exception {
        // 同步状态: 0失败, 1成功, 3删除
        // TODO: 更新BIP委外订单状态
    }
}
```

### 8.2 入库回写服务

```java
public interface SubcontractInResultWriteService {
    void writeBack(String billId, ThirdApiResponse response) throws Exception;
}

@Service
public class SubcontractInResultWriteServiceImpl implements SubcontractInResultWriteService {

    @Autowired
    private OsmInRecordMapper osmInRecordMapper;

    @Override
    public void writeBack(String billId, ThirdApiResponse response) throws Exception {
        // pushStatus: 0空；1同步成功；-1同步失败
        // TODO: 更新BIP委外入库单状态
    }
}
```

---

## 托底策略说明

> **⚠️ 详细托底逻辑请参考** [td_specification.md](./td_specification.md)