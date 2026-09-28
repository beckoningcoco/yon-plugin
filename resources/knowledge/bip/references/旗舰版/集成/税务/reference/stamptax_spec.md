# 契税推送业务规范

## 业务场景

契税计算数据推送：将 BIP 系统的契税计算数据推送到第三方财务系统。

## 推送流程

```
1. 接收推送请求
2. 数据校验
3. 数据转换（BIP → 三方格式）
4. 调用三方接口
5. 处理返回结果
6. 状态回写
```

## 数据校验规则

### 必须校验字段

| 字段 | 校验规则 |
|------|----------|
| lyid | 不能为空 |
| billNo | 不能为空 |
| 科目 | 不能为空，未匹配到科目则报错 |
| 税目 | 根据税目类型必须匹配到对应的税目，未匹配到则报错 |
| 子目 | 根据配置需要匹配子目，未匹配到则报错 |

### 校验失败处理

校验失败时，设置推送结果为失败原因，不执行推送操作。

---

## 推送数据构建

### 请求数据对象

```java
StampTaxCalcData {
    String lyid;           // 推送ID
    String billNo;         // 单据编号
    String accountCode;   // 科目编码
    String taxCategory;   // 税目类型
    String taxSubcategory; // 子目
    BigDecimal amount;    // 金额
    // ... 其他字段
}
```

### 响应数据对象

```java
PushStampTaxCalcDataResult {
    String pushStampTaxCalcId;      // 推送ID
    String pushStampTaxCalcResult; // 推送结果
    boolean status;                 // 是否成功
}
```

---

## 推送状态回写

### 更新字段

| 字段 | 更新内容 |
|------|----------|
| push_status | 推送状态 |
| push_result | 推送结果 |
| push_stamp_tax_calc_id | 关联的推送ID |

### 状态码映射

| 三方返回 | BIP 状态 |
|----------|----------|
| 成功 | push_success |
| 失败 | push_fail |
