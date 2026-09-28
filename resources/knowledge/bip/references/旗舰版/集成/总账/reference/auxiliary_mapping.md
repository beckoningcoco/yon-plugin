# 辅助核算映射详解

## 概述

辅助核算是总账数据迁移中最复杂的部分。Oracle 使用"弹性域"字段段（科目段、子目段、关联方段、部门段等），需要映射到 BIP 的辅助核算维度。

## 两种辅助核算表达方式

### 期初保存模式：itemMap (Map结构)

```java
// 使用 def{N} 作为 key，值为 {code, id, name, refcode} 的 Map
Map<String, Map<String, String>> itemMap = new LinkedHashMap<>();

SimpleResultVO vrs = allVrsAndRefCodeMap.get("0001"); // 获取辅助核算维度定义
Map<String, String> def1 = new LinkedHashMap<>();
def1.put("code", dept.getCode());
def1.put("id", dept.getId());
def1.put("name", dept.getName());
def1.put("refcode", vrs.getRefCode()); // 如 "ucf-org-center.bd_adminorgsharetreeref"
itemMap.put(vrs.getVrs().replace("vr", "def"), def1); // 如 "def1"
```

### 凭证迁移模式：ClientAuxiliaryList (扁平结构)

```java
// 使用 filedCode + valueCode 的扁平结构
List<ClientAuxiliaryList> clientAuxiliaryList = new ArrayList<>();

ClientAuxiliaryList aux = new ClientAuxiliaryList();
aux.setFiledCode("0001");  // 辅助核算编码
aux.setValueCode("部门编码");
clientAuxiliaryList.add(aux);
```

## 映射维度详解

### 1. 子目段映射 (SUBACC)

子目段是 Oracle 最复杂的映射之一，一个子目编码需要先查映射表确定子目类型，再查对应的档案表获取 BIP 数据。

**子目类型映射表**: `mapper_subacc`
- 每个子目编码对应一个子目类型（往来子目/薪资子目/银行子目/资产子目）

```java
// Step 1: 查映射表获取子目类型
SimpleResultVO subAccInfo = mapperSubaccMap.get(subaccCode);

// Step 2: 根据子目类型查对应档案
switch (subAccInfo.getName()) {
    case "银行子目":
        // 银行子目需要先查银行映射表 BANK_MAPPING_T
        String bankCode = subaccCode;
        if (mapperBankMap.get(bankCode) != null) {
            bankCode = mapperBankMap.get(bankCode).getName(); // 转换银行编码
        }
        SimpleResultVO bank = orgFinBankacctMap.get(bankCode);
        // 辅助核算编码: 021
        break;
    case "往来子目":
        SimpleResultVO vo = alternatingSubHeadMap.get(subaccCode);
        // 辅助核算编码: 0035
        break;
    case "薪资子目":
        SimpleResultVO vo = payrollSubheadMap.get(subaccCode);
        // 辅助核算编码: 0032
        break;
    case "资产子目":
        SimpleResultVO vo = assetsSubheadMap.get(subaccCode);
        // 辅助核算编码: 0033
        break;
}
```

**关键点**：
- 子目类型由映射表决定，不是硬编码
- 银行子目需要额外经过 BANK_MAPPING_T 编码转换
- 只有科目配置了对应辅助核算维度时才处理

### 2. 部门映射 (DEPT)

```java
// Key 的拼接规则：公司编码前缀 + "_" + 部门段编码
String deptKey = com.split("\\.")[0] + "_" + deptCode;
SimpleResultVO dept = allDeptMap.get(deptKey);
// 辅助核算编码: 0001
// refcode: ucf-org-center.bd_adminorgsharetreeref
```

**注意**：部门编码需要和公司编码拼接作为查询 Key。

### 3. 产品服务段映射 (PROD)

```java
SimpleResultVO prod = productServiceMap.get(prodCode);
// 辅助核算编码: 0036
```

### 4. 品牌映射 (BRAND_CODE)

```java
SimpleResultVO brand = brandInformationMap.get(brandCode);
// 辅助核算编码: 0034
```

### 5. 广场映射 (GUANGCHANG)

```java
SimpleResultVO plaza = plazaInformationMap.get(guangchangCode);
// 辅助核算编码: 0031
```

### 6. 铺位映射 (PUWEI_DESCRIPTION)

```java
// 铺位直接使用原始编码，无需查档案
def20.put("code", puweiCode);
def20.put("id", puweiCode);
def20.put("name", puweiCode);
// 辅助核算编码: 020
```

### 7. 项目映射 (PROJ)

```java
SimpleResultVO proj = projectMap.get(projCode);
// 辅助核算编码: 0002
```

### 8. 关联方/客户/供应商映射 (INT)

最复杂的映射，详见 [relation_mapping.md](relation_mapping.md)。

## 判断辅助核算是否需要填充

```java
// 通过科目的辅助核算维度配置判断
// allSubjectAndExtMap 的 key 是科目ID，value 是该科目配置的辅助核算维度列表
List<SimpleResultVO> subjectAndExtList = allSubjectAndExtMap.get(subjectId);

Map<String, SimpleResultVO> supplyOrCustomerMap = new HashMap<>();
if (!CollectionUtil.isEmpty(subjectAndExtList)) {
    supplyOrCustomerMap = subjectAndExtList.stream()
        .collect(Collectors.toMap(SimpleResultVO::getName, Function.identity()));
}

// 判断某个维度是否需要填充
if (supplyOrCustomerMap.get("部门") != null && deptCode != "0") {
    // 需要填充部门辅助核算
}

if (supplyOrCustomerMap.get("往来子目") != null && subaccCode != "0") {
    // 需要填充往来子目辅助核算
}
```

## 辅助核算编码速查表

| 维度名称 | 编码 | refcode来源 |
|----------|------|------------|
| 部门 | 0001 | org_orgs |
| 项目 | 0002 | bd_project |
| 供应商 | 0004 | aa_vendor |
| 客户 | 0005 | MERCHANT |
| 银行子目 | 021 | org_fin_bankacct |
| 铺位 | 020 | 自定义 |
| 广场 | 0031 | wd_fz_plaza_information |
| 薪资子目 | 0032 | wd_fz_payroll_subhead |
| 资产子目 | 0033 | wd_fz_assets_subhead |
| 品牌 | 0034 | wd_fz_brand_information |
| 往来子目 | 0035 | wd_fz_alternating_subhead |
| 产品服务段 | 0036 | wd_fz_product_service |
| 前端客户 | 0051 | 系统客户编码 |
| 前端供应商 | 0052 | 系统供应商编码 |
