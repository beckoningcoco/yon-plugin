# 字段映射规则

## 概述

本文档定义BIP销售发票到第三方系统的字段映射规则，适用于蓝票和红冲场景。

## ⚠️ 字段来源识别规范（核心）

**在读取Excel字段映射表时，必须严格区分BIP来源字段和三方目标字段**

### 识别规则

| Excel列位置 | 含义 |
|-------------|------|
| 左侧列（BIP来源系统） | BIP系统字段，包括主表字段和特征组字段 |
| 右侧列（三方目标系统） | 第三方系统字段（如航天金税AK8） |

### Excel结构示例

```
┌─────────────────────────────────┬─────────────────────────────────┐
│ BIP（来源系统）                  │ 航天金税（目标系统）              │
├─────────────────────────────────┼─────────────────────────────────┤
│ 字段描述 | 字段编码 | 字段类型   │ 字段描述 | 字段编码             │
├─────────────────────────────────┼─────────────────────────────────┤
│ 开票人  | ???_?? | 特征-枚举类型 │ 开票人   | drawer               │
│ 复核人  | ???_?? | 特征-枚举类型 │ 复核人   | reviewer              │
│ 收款人  | ???_?? | 特征-员工档案 │ 收款人   | payee                 │
└─────────────────────────────────┴─────────────────────────────────┘
                                       ↑
                              编码由实施人员自定义！
```

## ⚠️ 特征字段识别规范（重要）

**特征字段编码是实施人员自定义的，不能用固定前缀识别！**

### 识别方式

特征字段通过**Excel中的"字段类型"列**来识别，而非字段编码：

| Excel字段类型列描述 | 识别结果 | 翻译方式 |
|-------------------|---------|----------|
| 特征-枚举类型 | 特征组枚举字段 | 枚举翻译 |
| 特征-员工档案 | 特征组员工档案字段 | **参照翻译** |
| 特征-自定义档案 | 特征组自定义档案字段 | 自定义档案翻译 |
| 枚举 | 枚举字段 | 枚举翻译 |
| 布尔 | 布尔字段 | 布尔转换 |
| 文本/字符/字符串 | 普通文本字段 | 直接取值 |

### ⚠️ 错误识别方式

```
❌ 错误：根据字段编码前缀识别特征字段
   - udef_DJ01 ← 实施人员可能用任何编码
   - chart_001 ← 可能是任何格式

✅ 正确：根据Excel字段类型列识别
   - 字段类型 = "特征-枚举类型" → 特征组枚举字段
   - 字段类型 = "特征-员工档案" → 特征组员工档案字段
```

### 动态识别流程

```
1. 读取Excel字段映射表
   ├─→ 读取"BIP字段类型"列
   └─→ 读取"BIP字段编码"列

2. 根据字段类型识别特征字段
   ├─→ 类型包含"特征-枚举" → 枚举特征
   ├─→ 类型包含"特征-员工" → 员工档案特征
   └─→ 类型包含"特征-自定义" → 自定义档案特征

3. 动态构建映射配置
   Map<String, FeatureConfig> featureMap = new HashMap<>();
   featureMap.put(fieldCode, new FeatureConfig(
       fieldCode,           // 字段编码（动态）
       fieldType,          // 字段类型（用于选择翻译方式）
       targetField         // 目标字段
   ));
```

### 特征组路径

| 特征组 | BIP数据路径 |
|--------|------------|
| 主表特征组 | `saleInvoiceDefineCharacter` |
| 明细特征组 | `saleInvoiceDetails[i].saleInvoiceDetailDefineCharacter` |

### 特征字段处理示例

假设Excel中某行数据：

| BIP字段描述 | BIP字段编码 | BIP字段类型 | 目标字段编码 |
|-----------|------------|------------|-------------|
| 开票人 | kpr_001 | 特征-枚举类型 | drawer |
| 复核人 | fhr_001 | 特征-枚举类型 | reviewer |
| 收款人 | skr_001 | 特征-员工档案 | payee |
| 冲红原因 | chyy_001 | 特征-枚举类型 | blueinvchyy |
| 自动开票 | zdkp_01 | 布尔 | isAutoMakeInv |

代码处理：
```java
// 从Excel动态读取（不要硬编码）
Map<String, FeatureConfig> featureMap = new HashMap<>();

// 遍历Excel行，根据字段类型动态构建映射
for (ExcelRow row : excelRows) {
    String fieldCode = row.get("BIP字段编码");      // 如 "kpr_001"（动态）
    String fieldType = row.get("BIP字段类型");      // 如 "特征-枚举类型"
    String targetField = row.get("目标字段编码");   // 如 "drawer"

    // 根据字段类型确定翻译方式
    if (fieldType.contains("枚举")) {
        featureMap.put(fieldCode, new FeatureConfig(fieldCode, "enum", targetField));
    } else if (fieldType.contains("员工档案")) {
        featureMap.put(fieldCode, new FeatureConfig(fieldCode, "ref", targetField));
    } else if (fieldType.contains("布尔")) {
        featureMap.put(fieldCode, new FeatureConfig(fieldCode, "boolean", targetField));
    }
}
```

## 主表字段映射

| BIP字段（来源） | 三方字段（目标） | 转换规则 |
|---------------|-----------------|----------|
| code | orderNo | 直接映射 |
| pk_org.code | orgnCode | 组织编码 |
| cinvoicecustid.code | custNo | 客户编码 |
| vprintcustname | custName | 客户名称 |
| cinvoicecustid_taxpayerid | custTaxNo | 客户税号 |
| ccust_address_detailinfo + cinvoicecustid_tel1 | custAddrPhone | 地址电话合并 |
| ccustbankaccid | custBankAccount | 银行账号 |
| bdInvoiceTypeCode | invType | 发票类型转换 |
| memo | invRemark | 直接映射 |
| vtrantypecode | oderType | 直接映射 |
| dbilldate | orderDate | 格式化为yyyyMMdd |
| id | source | 直接映射 |

## 特征组字段映射（动态示例）

**⚠️ 以下仅为示例，实际编码由实施人员定义**

| 特征类型 | 三方字段 | 翻译方式 |
|---------|----------|---------|
| 特征-枚举类型（任意编码） | drawer, reviewer, blueinvchyy等 | 枚举翻译 |
| 特征-员工档案（任意编码） | payee | **参照翻译** |
| 特征-自定义档案（任意编码） | buyerIdcartype等 | 自定义档案翻译 |
| 布尔（任意编码） | isAutoMakeInv, bankRemarkStatus等 | 布尔转0/1或0/3 |

## 明细行映射

| BIP字段 | 三方字段 | 说明 |
|--------|---------|------|
| crowno | lineCode | 行号 |
| pk_material.code | goodsNo | 商品编码 |
| pk_material.name | goodsName | 商品名称 |
| modelDescription | model | 规格型号 |
| castunitid.name | unit | 计量单位 |
| nqtunitnum | qty | 数量（方向处理） |
| norigprice | price | 单价（方向处理） |
| norigtaxprice | taxPrice | 含税单价（方向处理） |
| ntaxrate | taxRate | 税率 |
| norigmny | amount | 金额（方向处理） |
| ntax | tax | 税额（方向处理） |
| ncaltaxmny | taxAmount | 价税合计（方向处理） |
| lineDiscountMoney | distaxAmount | 折扣含税金额（蓝票） |

## 金额符号处理

### 蓝票
所有金额字段必须为正值（abs）：

```java
qty.abs()
oriMoney.abs()
oriTax.abs()
oriSum.abs()
```

### 红冲
所有金额字段必须为负值（negate）：

```java
qty.negate()
oriMoney.negate()
oriTax.negate()
oriSum.negate()
```

## 发票类型映射

| BIP发票类型(bdInvoiceTypeCode) | 目标系统编码(invType) |
|-------------------------------|----------------------|
| 10 | 31（数电专票→全电电专） |
| 11 | 32（数电普票→全电电普） |

## 红冲专用映射

| BIP字段 | 三方字段 | 说明 |
|--------|---------|------|
| blueEinvoiceNo | oriinvcode | 原蓝票代码 |
| blueEinvoiceHm | oriinvno | 原蓝票号码 |
| einvoiceKprq | blueinvdate | 原开票日期 |
| invoiceType | blueinvtype | 原发票种类 |

## 映射配置示例（动态）

```java
// 主表字段映射（BIP字段 -> 三方字段）
Map<String, String> mainFieldMapping = new HashMap<>();
mainFieldMapping.put("code", "orderNo");
mainFieldMapping.put("pk_org.code", "orgnCode");

// 特征字段映射（动态读取，不要硬编码特征编码）
Map<String, FeatureConfig> featureMapping = new HashMap<>();

// 根据Excel字段类型动态构建
// featureMapping.put("实施自定义的编码", new FeatureConfig("enum/ref/boolean", "drawer"));
```

## 注意事项

- ⚠️ **特征字段编码是实施人员自定义的**，不要用固定前缀（如`udef_`）识别
- ⚠️ **通过Excel"字段类型"列识别特征字段类型**
- ⚠️ **特征字段映射从Excel动态读取**，不硬编码
- 金额字段根据场景（蓝票/红冲）自动处理符号
- 特征字段需参考 reference/03_character_translation.md 进行翻译
- 映射关系从外部Excel动态解析，Excel编码使用UTF-8
