# 关联方/客户/供应商赋值优先级详解

## 概述

关联方段(INT)、客户编码(CUSTOMER_NUMBER)、供应商编码(SUPPLIER_NUMBER) 的赋值是数据迁移中最复杂的逻辑。Oracle 中这些字段存储在不同的弹性域段中，需要根据科目配置和映射关系正确分配到 BIP 的客户/供应商/前端客户/前端供应商维度。

## 映射涉及的辅助核算维度

| 维度 | 编码 | 说明 |
|------|------|------|
| 客户 | 0005 | BIP系统客户（关联方映射后的客户） |
| 供应商 | 0004 | BIP系统供应商（关联方映射后的供应商） |
| 前端客户 | 0051 | Oracle原始客户编码 |
| 前端供应商 | 0052 | Oracle原始供应商编码 |

## 涉及的映射表

- `MAPPER_CUSTOMER_OR_MERCHANT_INT`: 客户/关联方映射表
- `aa_vendor`: 供应商档案
- `MERCHANT`: 客户档案

## 完整赋值逻辑

### 情况一：关联方段有值 (INT != null && INT != "0")

#### 1.1 科目同时配置了客户和供应商

```
if (科目有客户 && 科目有供应商) {
    if (SUPPLIER_NUMBER有值) {
        → 关联方 → 供应商(0004)     // 通过vendorMap查关联方编码对应的供应商
        → SUPPLIER_NUMBER → 前端供应商(0052)  // 通过vendorMap查原始供应商编码
    } else if (CUSTOMER_NUMBER有值) {
        → 关联方 → 客户(0005)       // 通过merchantMap查关联方编码对应的客户
        → CUSTOMER_NUMBER → 前端客户(0051)    // 通过merchantMap查原始客户编码
    } else {
        // 都无值，默认赋给客户
        → 关联方 → 客户(0005)
        → 关联方 → 前端客户(0051)    // 前端客户也赋关联方
    }
}
```

#### 1.2 科目只配置了供应商

```
if (科目只有供应商) {
    → 关联方 → 供应商(0004)         // 通过vendorMap查关联方编码对应的供应商

    if (SUPPLIER_NUMBER有值) {
        → SUPPLIER_NUMBER → 前端供应商(0052)
    } else {
        → 关联方 → 前端供应商(0052)  // 前端供应商也赋关联方
    }
}
```

#### 1.3 科目只配置了客户

```
if (科目只有客户) {
    → 关联方 → 客户(0005)           // 通过merchantMap查关联方编码对应的客户

    if (CUSTOMER_NUMBER有值) {
        → CUSTOMER_NUMBER → 前端客户(0051)
    } else {
        → 关联方 → 前端客户(0051)    // 前端客户也赋关联方
    }
}
```

### 情况二：关联方段无值 (INT == null || INT == "0")

#### 2.1 客户编码有值

```
if (科目有客户 && CUSTOMER_NUMBER有值) {
    // 先查客户关联方映射表
    relationVO = mapperCustomerOrMerchantIntMap.get(CUSTOMER_NUMBER + "客户");

    if (映射关系找到) {
        → 映射表关联方编码 → 客户(0005)     // 通过merchantMap查映射后的关联方
        → CUSTOMER_NUMBER → 前端客户(0051)   // 原始客户编码放到前端客户
    } else {
        → CUSTOMER_NUMBER → 客户(0005)       // 直接赋值
        → CUSTOMER_NUMBER → 前端客户(0051)   // 也赋前端客户
    }
}
```

#### 2.2 供应商编码有值

```
if (科目有供应商 && SUPPLIER_NUMBER有值) {
    → SUPPLIER_NUMBER → 供应商(0004)         // 直接赋值
    → SUPPLIER_NUMBER → 前端供应商(0052)     // 也赋前端供应商
}
```

## 流程图

```
                    ┌─────────────────────┐
                    │  关联方段(INT)有值?  │
                    └─────────┬───────────┘
                    │ Yes                  │ No
                    ▼                      ▼
        ┌───────────────────┐   ┌──────────────────────┐
        │ 科目配置了什么?    │   │ 客户编码有值?         │
        │ (客户/供应商/两者) │   │ + 科目有客户维度?     │
        └───────┬───────────┘   └──────────┬───────────┘
                │                          │
    ┌───────────┼───────────┐      ┌───────┴───────┐
    ▼           ▼           ▼      ▼               ▼
  两者都有    只有供应商   只有客户  查映射表       直接赋
    │           │           │      │
    │           │           │   ┌──┴──┐
    ▼           ▼           ▼   ▼     ▼
 优先供应商   关联方→供应商  关联方→客户 有映射  无映射
 或客户      前端供应商     前端客户     →用映射 →直接赋
```

## 代码实现要点

### 期初保存模式

```java
// 使用 vendorMap/merchantMap 查询 BIP 系统中的供应商/客户信息
// 查到后构建 itemMap 条目
SimpleResultVO vrs = allVrsAndRefCodeMap.get(AuxiliaryDisplayEnum.MERCHANT.getValue()); // 0004
Map<String, String> def4 = new LinkedHashMap<>();
def4.put("code", supply.getCode());
def4.put("id", supply.getId());
def4.put("name", supply.getName());
def4.put("refcode", vrs.getRefCode());
itemMap.put(vrs.getVrs().replace("vr", "def"), def4);
```

### 凭证迁移模式

```java
// 使用更简洁的 filedCode + valueCode 结构
ClientAuxiliaryList supply = new ClientAuxiliaryList();
supply.setFiledCode(AuxiliaryDisplayEnum.MERCHANT.getValue()); // "0004"
supply.setValueCode(relationCode); // 供应商编码
clientAuxiliaryList.add(supply);
```

## 错误处理

当映射查不到对应数据时，记录错误信息到 PARAMJSON 字段：

```java
errorLogBuilder.append("通过关联方映射取供应商为空,对应编码为" + intCode + ",科目编码为:" + accCode);
errorLogBuilder.append("根据客户编码取前端客户为空,对应编码为" + customerCode + ",科目编码为:" + accCode);
```

## 关键注意事项

1. **供应商和客户的编码体系不同**：供应商在 `aa_vendor` 表，客户在 `MERCHANT` 表
2. **关联方编码同时存在于供应商和客户表中**：同一关联方编码可能对应一个供应商和一个客户
3. **前端客户/前端供应商是额外维度**：用于保留 Oracle 原始的客户/供应商编码，便于数据核对
4. **映射表 MAPPER_CUSTOMER_OR_MERCHANT_INT**：只在关联方段无值且客户编码有值时使用
5. **银行映射** BANK_MAPPING_T：用于银行子目的编码转换
