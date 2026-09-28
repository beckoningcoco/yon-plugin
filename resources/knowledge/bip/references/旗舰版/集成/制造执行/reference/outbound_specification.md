# 材料出库推送业务场景规范

> **⚠️ 场景限制**：本文件仅描述**材料出库推送**特有逻辑，**禁止扩散生成其他场景**

> **⚠️ 通用逻辑**：BIP查询、字段映射、特征处理、鉴权、调用、响应解析、结果回写等通用能力请参考 pub_specification.md

---

## 业务语义

材料出库推送是指将BIP系统中的材料出库数据推送至第三方系统的业务流程。

### 前置条件

1. BIP材料出库单已审核通过
2. 出库仓库为第三方仓库（第三方标识=是）
3. 出库数量为负数（退料场景）

---

## 材料出库特有差异内容

### 1. 出库类型判断

| 业务场景 | 三方单据类型 | 说明 |
|---------|-------------|------|
| 材料出库负数 | INB0302 | 成本中心退料 |

### 2. 字段转换

> **⚠️ 动态映射**：根据外部Excel/需求动态生成三方字段

```java
/**
 * 材料出库转换为三方格式
 */
public Map<String, Object> convertToThird(Map<String, Object> bipData) {
    Map<String, Object> thirdData = new HashMap<>();
    
    // 三方接口地址
    thirdData.put("restUrl", "/xdesb/wms/wms_re_xd_otherrtn_026/1.0.0");
    
    // 仓库第三方标识校验
    Boolean bWMS = (Boolean) bipData.get("bWMS");
    if (Boolean.FALSE.equals(bWMS)) {
        bipData.put("isPush", "0");
        return bipData;
    }
    
    // 表头字段
    thirdData.put("customerId", bipData.get("customerId"));
    thirdData.put("docNo", bipData.get("docNo"));
    thirdData.put("docHeaderId", bipData.get("billId"));
    thirdData.put("bustype", bipData.get("bustype"));
    thirdData.put("orderType", "INB0302");
    thirdData.put("workshop", bipData.get("workshop"));
    thirdData.put("costCenter", bipData.get("costCenter"));
    thirdData.put("createSource", "ERP");
    thirdData.put("notes", bipData.get("notes"));
    
    // 明细行处理
    List<Map<String, Object>> details = convertLines(bipData);
    wmsData.put("details", details);
    
    return wmsData;
}
```

### 3. 数量符号处理

> 材料出库（退料）数量为**负数**，需要转换为**正数**

```java
/**
 * 明细行转换
 */
private List<Map<String, Object>> convertLines(Map<String, Object> bipData) {
    List<Map<String, Object>> details = (List<Map<String, Object>>) bipData.get("details");
    List<Map<String, Object>> result = new ArrayList<>();
    
    for (Map<String, Object> detail : details) {
        Map<String, Object> item = new HashMap<>();
        
        // 数量处理：负数转正数
        BigDecimal qty = new BigDecimal(String.valueOf(detail.get("contactsQuantity")));
        if (qty.compareTo(BigDecimal.ZERO) < 0) {
            qty = qty.negate();
        } else {
            // 退料是按单退，只允许所有行都为负数
            bipData.put("isPush", "0");
            return new ArrayList<>();
        }
        
        item.put("qty", qty);
        item.put("lineNo", detail.get("lineNo"));
        item.put("docLineId", detail.get("docLineId"));
        item.put("sku", detail.get("sku"));
        item.put("skuDesc", detail.get("skuDesc"));
        item.put("uom", detail.get("uom"));
        item.put("ERPinSublibrary", detail.get("ERPinSublibrary"));
        
        // 扩展字段
        item.put("attribute1", detail.getOrDefault("attribute1", ""));
        item.put("attribute2", detail.getOrDefault("attribute2", ""));
        item.put("attribute3", detail.getOrDefault("attribute3", ""));
        item.put("attribute4", detail.getOrDefault("attribute4", ""));
        item.put("attribute10", detail.getOrDefault("attribute10", ""));
        item.put("attribute12", detail.getOrDefault("attribute12", ""));
        item.put("attribute18", detail.getOrDefault("attribute18", ""));
        
        result.add(item);
    }
    
    return result;
}
```

### 4. 特征字段处理

> 材料出库明细包含物料自由项特征组

```java
/**
 * 处理物料自由项特征组
 */
private void processCharacteristics(Map<String, Object> detail, Map<String, Object> materialOutsCharacteristics) {
    if (materialOutsCharacteristics == null) return;
    
    // 镀层 COAT
    if (materialOutsCharacteristics.get("COAT") != null) {
        detail.put("scCOAT", materialOutsCharacteristics.get("COAT").toString());
    }
    // 产品出厂编号 CPCCBH
    if (materialOutsCharacteristics.get("CPCCBH") != null) {
        detail.put("scCPCCBH", materialOutsCharacteristics.get("CPCCBH").toString());
    }
    // 图号版本 DRW_VER
    if (materialOutsCharacteristics.get("DRW_VER") != null) {
        detail.put("scDRW_VER", materialOutsCharacteristics.get("DRW_VER").toString());
    }
}
```

---

## 注意事项

1. 仅处理第三方仓库（bWMS=true）的出库单
2. 数量必须为负数（退料场景），转换时取绝对值
3. 三方接口地址：动态配置
4. 特征字段：动态识别物料自由项
