# 出库申请与WMS字段转换场景规范

## 业务语义

字段转换是指将BIP出库申请单的数据格式转换为WMS系统可识别的标准格式，包括字段映射、数据类型转换、数值精度处理、日期格式转换等。

### 业务目标

确保BIP出库申请数据能够准确、完整地映射到WMS系统，满足WMS接口的数据要求。

### 前置条件

1. 已完成出库申请数据查询
2. 已获取字段映射规则（来自用户文档或默认配置）
3. 明确WMS接口的数据格式要求

## 核心流程

```
BIP出库申请数据 ──▶ 字段映射 ──▶ 数据转换 ──▶ 数值精度处理 ──▶ 生成WMS格式数据
```

## 字段映射规则

### 主表字段映射

| BIP字段路径 | WMS目标字段 | 转换说明 | 是否必填 |
|------------|------------|---------|---------|
| id | docHeaderId | 直接映射 | 是 |
| code | docNo | 直接映射 | 是 |
| orgId.code | customerId | 组织编码映射 | 是 |
| vouchdate | orderDate | 日期格式转换 | 是 |
| transTypeId.code | bustype | 交易类型编码 | 否 |
| productionDepartmentId.code | workshop | 生产部门编码 | 否 |
| memo | notes | 直接映射 | 否 |

### 明细字段映射

| BIP字段路径 | WMS目标字段 | 转换说明 | 是否必填 |
|------------|------------|---------|---------|
| id | docLineId | 直接映射 | 是 |
| lineno | lineNo | 直接映射 | 是 |
| productn.code | sku | 物料编码映射 | 是 |
| productn.name | skuDesc | 物料名称映射 | 否 |
| quantity | qty | 数值精度处理(6位) | 是 |
| stockUnitId.code | uom | 单位编码映射 | 是 |
| warehouseId.code | ERPoutSublibrary | 仓库编码映射 | 是 |
| batchno | attribute4 | 批次号映射 | 否 |
| producedate | attribute1 | 生产日期映射 | 否 |
| invaliddate | attribute2 | 失效日期映射 | 否 |
| projectId.code | attribute18 | 项目编码映射 | 否 |
| reserveid.code | attribute12 | 跟踪线索编码映射 | 否 |
| upcode | workDocNo | 上游单据号映射 | 否 |

### 特征组字段映射（动态识别）

> **重要规则**：特征组字段必须从用户提供的字段映射文档中动态识别

| 目标系统字段 | 识别关键词 | 常见BIP字段路径 |
|-------------|-----------|----------------|
| workStation | 工位、工位编码、GWBM | requisitionDetailDefineCharacter.GWBM |
| costCenter | 成本中心 | pickingRequisitionDetailExtend.costCenter.code |
| projectCode | 项目编码 | projectId.code |

## 核心代码模板

### 1. 数据转换器接口

```java
/**
 * 出库申请数据转换器接口
 */
public interface PickingRequisitionConverter {
    
    /**
     * 将BIP出库申请转换为WMS请求DTO
     * @param bipData BIP出库申请数据
     * @return WMS请求DTO
     */
    WmsPickingRequisitionRequestDTO convertToWmsRequest(PickingRequisitionVO bipData);
    
    /**
     * 批量转换
     * @param bipDataList BIP出库申请列表
     * @return WMS请求DTO列表
     */
    List<WmsPickingRequisitionRequestDTO> convertToWmsRequestList(List<PickingRequisitionVO> bipDataList);
}
```

### 2. 数据转换器实现

```java
/**
 * 出库申请数据转换器实现
 */
@Component
@Slf4j
public class PickingRequisitionConverterImpl implements PickingRequisitionConverter {
    
    @Override
    public WmsPickingRequisitionRequestDTO convertToWmsRequest(PickingRequisitionVO bipData) {
        if (bipData == null) {
            return null;
        }
        
        WmsPickingRequisitionRequestDTO dto = new WmsPickingRequisitionRequestDTO();
        
        // 转换主表字段
        convertHeadFields(dto, bipData);
        
        // 转换明细字段
        convertDetailFields(dto, bipData);
        
        return dto;
    }
    
    /**
     * 转换主表字段
     */
    private void convertHeadFields(WmsPickingRequisitionRequestDTO dto, PickingRequisitionVO bipData) {
        // 基础字段映射
        dto.setDocHeaderId(bipData.getId());
        dto.setDocNo(bipData.getCode());
        dto.setCustomerId(bipData.getOrgCode());
        dto.setBustype(bipData.getTransTypeCode());
        dto.setWorkshop(bipData.getProductionDepartmentCode());
        dto.setNotes(bipData.getMemo());
        
        // 日期格式转换
        dto.setOrderDate(DateUtils.formatToYyyyMmDd(bipData.getVouchdate()));
        
        // 单据类型映射
        String orderType = mapOrderType(bipData.getTransTypeCode());
        dto.setOrderType(orderType);
        
        // 来源系统固定值
        dto.setCreateSource("ERP");
    }
    
    /**
     * 转换明细字段
     */
    private void convertDetailFields(WmsPickingRequisitionRequestDTO dto, PickingRequisitionVO bipData) {
        if (CollectionUtils.isEmpty(bipData.getDetails())) {
            return;
        }
        
        List<WmsPickingRequisitionDetailDTO> details = new ArrayList<>();
        
        for (PickingRequisitionDetailVO detail : bipData.getDetails()) {
            // 过滤非WMS仓库
            if (Boolean.FALSE.equals(detail.getBWMS())) {
                continue;
            }
            
            WmsPickingRequisitionDetailDTO detailDTO = new WmsPickingRequisitionDetailDTO();
            
            // 基础字段映射
            detailDTO.setDocLineId(detail.getId());
            detailDTO.setLineNo(String.valueOf(detail.getLineno()));
            detailDTO.setSku(detail.getProductCode());
            detailDTO.setSkuDesc(detail.getProductName());
            detailDTO.setUom(detail.getStockUnitCode());
            detailDTO.setERPoutSublibrary(detail.getWarehouseCode());
            detailDTO.setERPinSublibrary(detail.getWarehouseCode());
            
            // 数值精度处理（数量6位小数）
            BigDecimal qty = DecimalUtils.convertQuantity(detail.getQuantity());
            detailDTO.setQty(qty);
            
            // 批次信息
            detailDTO.setAttribute4(detail.getBatchno());
            detailDTO.setAttribute1(DateUtils.formatToYyyyMmDd(detail.getProducedate()));
            detailDTO.setAttribute2(DateUtils.formatToYyyyMmDd(detail.getInvaliddate()));
            
            // 项目编码
            detailDTO.setAttribute18(detail.getProjectCode());
            
            // 跟踪线索
            detailDTO.setAttribute12(detail.getReserveCode());
            
            // 上游单据号
            detailDTO.setWorkDocNo(detail.getUpcode());
            
            // 处理特征组字段（动态识别）
            processDefineCharacterFields(detailDTO, detail);
            
            // 处理物料自由项特征组
            processCharacteristicsFields(detailDTO, detail);
            
            details.add(detailDTO);
        }
        
        dto.setDetails(details);
    }
    
    /**
     * 处理特征组字段（动态识别）
     * 
     * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
     */
    private void processDefineCharacterFields(WmsPickingRequisitionDetailDTO detailDTO, 
                                               PickingRequisitionDetailVO detail) {
        // ============================================
        // 动态生成区域 - 根据字段映射文档自动识别特征字段
        // ============================================
        
        // 示例1：工位编码（从文档识别：requisitionDetailDefineCharacter.GWBM → workStation）
        Map<String, Object> defineCharacter = detail.getRequisitionDetailDefineCharacter();
        if (defineCharacter != null && defineCharacter.get("GWBM") != null) {
            detailDTO.setWorkStation((String) defineCharacter.get("GWBM"));
        }
        
        // 示例2：成本中心（从文档识别：pickingRequisitionDetailExtend.costCenter.code → costCenter）
        // 已在VO中处理，直接取值
        detailDTO.setCostCenter(detail.getCostCenterCode());
        
        // 其他特征字段根据文档动态添加...
    }
    
    /**
     * 处理物料自由项特征组
     * 
     * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
     */
    private void processCharacteristicsFields(WmsPickingRequisitionDetailDTO detailDTO,
                                               PickingRequisitionDetailVO detail) {
        Map<String, Object> characteristics = detail.getRequisitionDetailCharacteristics();
        if (characteristics == null) {
            return;
        }
        
        // ============================================
        // 动态生成区域 - 根据字段映射文档自动识别物料自由项字段
        // ============================================
        
        // 示例：图号版本（从文档识别：requisitionDetailCharacteristics.DRW_VER → attribute5）
        if (characteristics.get("DRW_VER") != null) {
            detailDTO.setAttribute5((String) characteristics.get("DRW_VER"));
        }
        
        // 示例：清洗标识（从文档识别：requisitionDetailCharacteristics.Is_Clear → attribute11）
        if (characteristics.get("Is_Clear") != null) {
            detailDTO.setAttribute11((String) characteristics.get("Is_Clear"));
        }
        
        // 示例：颜色（从文档识别：requisitionDetailCharacteristics.CLR → attribute14）
        if (characteristics.get("CLR") != null) {
            detailDTO.setAttribute14((String) characteristics.get("CLR"));
        }
        
        // 示例：销售合同号（从文档识别：requisitionDetailCharacteristics.SL_CO → attribute15）
        if (characteristics.get("SL_CO") != null) {
            detailDTO.setAttribute15((String) characteristics.get("SL_CO"));
        }
        
        // 示例：BOM标准（从文档识别：requisitionDetailCharacteristics.BOM_STD → attribute16）
        if (characteristics.get("BOM_STD") != null) {
            detailDTO.setAttribute16((String) characteristics.get("BOM_STD"));
        }
        
        // 示例：工作令号（从文档识别：requisitionDetailCharacteristics.JOB_NO → attribute17）
        if (characteristics.get("JOB_NO") != null) {
            detailDTO.setAttribute17((String) characteristics.get("JOB_NO"));
        }
        
        // 示例：客户指定供应商（从文档识别：requisitionDetailCharacteristics.CUST_SUP → attribute19）
        if (characteristics.get("CUST_SUP") != null) {
            detailDTO.setAttribute19((String) characteristics.get("CUST_SUP"));
        }
        
        // 其他物料自由项字段根据文档动态添加...
    }
    
    /**
     * 单据类型映射
     */
    private String mapOrderType(String transTypeCode) {
        if (StringUtils.isBlank(transTypeCode)) {
            return "OUB0215"; // 默认成本中心领料
        }
        
        switch (transTypeCode) {
            case "FA001":
                return "OUB0208"; // 标准生产领料
            case "FA100":
                return "INB0303"; // 车间退料
            case "FD001":
                return "OUB0203"; // 委外领料
            case "FD100":
                return "INB0104"; // 委外退料
            default:
                return "OUB0215"; // 成本中心领料
        }
    }
}
```

### 3. WMS请求DTO定义

```java
/**
 * WMS出库申请请求DTO（主表）
 */
@Data
public class WmsPickingRequisitionRequestDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /** 企业编码 */
    private String customerId;
    
    /** 单据编号 */
    private String docNo;
    
    /** 单据头ID */
    private String docHeaderId;
    
    /** 单据类型 */
    private String orderType;
    
    /** 交易类型 */
    private String bustype;
    
    /** 车间编码 */
    private String workshop;
    
    /** 产线编码 */
    private String prodLine;
    
    /** 来源系统 */
    private String createSource;
    
    /** 单据日期 */
    private String orderDate;
    
    /** 计划要料时间 */
    private String startTime;
    
    /** 备注 */
    private String notes;
    
    /** 来源单据号 */
    private String workDocNo;
    
    /** ERP订单号 */
    private String ERPOrderNo;
    
    /** 产品SKU */
    private String prodSku;
    
    /** 产品数量 */
    private BigDecimal prodQty;
    
    /** 明细列表 */
    private List<WmsPickingRequisitionDetailDTO> details;
}

/**
 * WMS出库申请请求DTO（明细）
 */
@Data
public class WmsPickingRequisitionDetailDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /** 行号 */
    private String lineNo;
    
    /** 单据行ID */
    private String docLineId;
    
    /** 物料编码 */
    private String sku;
    
    /** 物料描述 */
    private String skuDesc;
    
    /** 数量 */
    private BigDecimal qty;
    
    /** 单位 */
    private String uom;
    
    /** ERP调出仓库 */
    private String ERPoutSublibrary;
    
    /** ERP调入仓库 */
    private String ERPinSublibrary;
    
    /** 成本中心 */
    private String costCenter;
    
    /** 工位编码 */
    private String workStation;
    
    /** 工单号 */
    private String workDocNo;
    
    /** 备注 */
    private String notes;
    
    /** 生产日期 */
    private String attribute1;
    
    /** 失效日期 */
    private String attribute2;
    
    /** 批次号 */
    private String attribute4;
    
    /** 图号版本 */
    private String attribute5;
    
    /** 仓库编码 */
    private String attribute6;
    
    /** 清洗标识 */
    private String attribute11;
    
    /** 跟踪线索号 */
    private String attribute12;
    
    /** 跟踪号 */
    private String attribute13;
    
    /** 颜色 */
    private String attribute14;
    
    /** 销售合同号 */
    private String attribute15;
    
    /** BOM标准 */
    private String attribute16;
    
    /** 工作令号 */
    private String attribute17;
    
    /** 项目编码 */
    private String attribute18;
    
    /** 客户指定供应商 */
    private String attribute19;
    
    /** 行备注 */
    private String attribute21;
    
    /** 扩展字段（动态） */
    private Map<String, Object> extFields;
}
```

## 数值精度规范

所有数值字段必须按以下精度处理：

| 字段类型 | 精度 | 说明 |
|---------|------|------|
| 数量 | 6位小数 | decimal(12,6) |
| 金额 | 2位小数 | decimal(16,2)，精确到分 |

```java
/**
 * 数值精度处理
 */
public class DecimalUtils {
    
    /**
     * 转换数量精度（6位小数）
     */
    public static BigDecimal convertQuantity(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value.setScale(6, RoundingMode.HALF_UP);
    }
    
    /**
     * 转换金额精度（2位小数）
     */
    public static BigDecimal convertAmount(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
```

## 日期格式规范

- **BIP格式**：yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss
- **WMS目标格式**：yyyyMMdd
- **转换示例**："2024-03-09" -> "20240309"

```java
/**
 * 日期格式转换
 */
public class DateUtils {
    
    /**
     * 转换为yyyyMMdd格式
     */
    public static String formatToYyyyMmDd(Object date) {
        if (date == null) {
            return null;
        }
        if (date instanceof String) {
            String dateStr = (String) date;
            if (dateStr.length() >= 10) {
                return dateStr.substring(0, 10).replace("-", "");
            }
            return dateStr;
        }
        if (date instanceof Date) {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd");
            return sdf.format((Date) date);
        }
        return date.toString();
    }
}
```

## 异常处理

### 常见异常场景

1. **字段映射异常**：必填字段为空或字段路径错误
2. **数据类型转换异常**：类型不匹配导致转换失败
3. **数值精度异常**：数值超出范围或格式错误
4. **日期格式异常**：日期字符串格式不正确

### 异常处理代码

```java
try {
    // 转换逻辑
} catch (FieldMappingException e) {
    log.error("字段映射失败", e);
    throw new BusinessException("字段映射失败：" + e.getMessage());
} catch (NumberFormatException e) {
    log.error("数值转换失败", e);
    throw new BusinessException("数值转换失败：" + e.getMessage());
} catch (ParseException e) {
    log.error("日期格式转换失败", e);
    throw new BusinessException("日期格式转换失败：" + e.getMessage());
}
```

## 注意事项

1. **动态字段识别**：特征组字段必须从用户文档中动态识别，不预置固定字段
2. **空值处理**：所有字段需做空值判断，避免空指针异常
3. **数值精度**：数量字段必须保留6位小数
4. **日期格式**：统一转换为yyyyMMdd格式
5. **WMS仓过滤**：只推送WMS仓标识为true的明细行
6. **字段扩展**：attribute字段根据实际需求动态映射
