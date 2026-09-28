# 财务单据集成公共规范

## 概述

> **⚠️ 场景限制**：本技能支持应收发票、应付发票、收款单、付款单的双向集成

---

## skill技能调用

| 任务 | 触发条件 | 调用的 skill技能 |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 单据数据 | skill技能`iuap-c-openapi-integration `调用OpenAPI功能 |
| 档案查询 | 需要查询 BIP 档案数据 | skill技能`iuap-c-openapi-integration `getIBillQueryRepository |
| 数据持久化 | 需要执行 SQL 更新操作 | skill技能`iuap-c-openapi-integration `IYmsJdbcApi |

---

## 单据录入场景（第三方 → BIP）

### 通用处理流程

1. 接收第三方系统传入的单据数据
2. 数据校验（必填字段、格式校验）
3. 调用 BIP 保存并提交接口
4. 返回处理结果

### BIP API 路径

#### 应收发票

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/receivable/saveandsubmit | 应收发票保存并提交 |
| 查询 | /yonbip/EFI/receivable/detail | 应收发票详情查询 |

#### 应付发票

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/payable/saveandsubmit | 应付发票保存并提交 |
| 查询 | /yonbip/EFI/payable/detail | 应付发票详情查询 |

#### 收款单

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/collection/saveandsubmit | 收款单保存并提交 |
| 查询 | /yonbip/EFI/collection/detail | 收款单详情查询 |

#### 付款单

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/payment/saveandsubmit | 付款单保存并提交 |
| 查询 | /yonbip/EFI/payment/detail | 付款单详情查询 |

### Service 层实现规范（单据录入）

```java
public Map<String, Object> save(JSONObject json) {
    // 1. 数据预处理
    JSONObject processedJson = preprocess(json);
    
    // 2. 调用 BIP 保存接口
    String saveUrl = BIPIntegrationUtils.buildRequestUrl(bipSysHost + gatewayUrl + saveApiPath, accessToken);
    Map<String, Object> saveResult = BIPIntegrationUtils.sendPostRequest(saveUrl, processedJson);
    
    // 3. 判断保存是否成功
    if (BIPIntegrationUtils.isSuccessResponse(saveResult)) {
        // 4. 获取保存后的 ID
        String id = BIPIntegrationUtils.getIdFromResponse(saveResult);
        
        // 5. 调用 BIP 提交接口
        String submitUrl = BIPIntegrationUtils.buildRequestUrl(bipSysHost + gatewayUrl + submitApiPath, accessToken);
        Map<String, Object> submitResult = BIPIntegrationUtils.sendPostRequest(submitUrl, BIPIntegrationUtils.createRequestBody(id));
        
        // 6. 返回提交结果
        return submitResult;
    }
    
    // 7. 返回保存结果
    return saveResult;
}
```

---

## 单据推送场景（BIP → 第三方）

### 通用处理流程

1. 查询 BIP 单据数据（使用 skill技能`iuap-c-openapi-integration `调用OpenAPI功能
2. 解析单据明细
3. 处理档案参照（供应商、客户、银行账户等）
4. 字段映射转换
5. 调用第三方接口
6. 解析响应结果
7. 回写处理状态

### 付款单推送流程

```
1. 查询 BIP 付款单 → 2. 解析付款单明细 → 3. 处理银行账户信息 → 4. 字段映射转换 → 5. 调用三方接口
```

#### Step 1: 查询 BIP 付款单数据

> **skill技能调用**：`iuap-c-openapi-integration `调用OpenAPI功能
- 接口路径：/yonbip/ap/payment/detail
- 返回：BIP付款单 JSONObject 对象

#### Step 2: 解析付款单明细

| 信息类型 | BIP路径 | 说明 |
|---------|---------|------|
| 主表信息 | paymentMain | 付款单主表信息 |
| 明细列表 | paymentDetails | 付款单明细 JSONArray |

#### Step 3: 处理银行账户信息

| 信息类型 | 说明 | skill调用 |
|---------|------|---------|
| 供应商银行账户 | 供应商档案的银行账户信息 | skill技能的`iuap-c-metadata-info`的IBillQueryRepository |
| 组织银行账户 | 组织档案的银行账户信息 | skill技能的`iuap-c-metadata-info`的IBillQueryRepository |

### 发票推送金蝶流程

#### Step 1: 查询 BIP 应收发票数据

> **skill技能调用**：`iuap-c-openapi-integration `调用OpenAPI功能
- 接口路径：/yonbip/EFI/receivable/detail
- 返回：BIP应收发票 JSONObject 对象

#### Step 2: 判断发票类型

| 发票类型 | invoiceProperty | 说明 |
|---------|----------------|------|
| 蓝票(正票) | 1 | 正常开具发票 |
| 红票(红冲) | 0 | 红冲发票 |

#### Step 3: 构建推送数据

根据发票类型构建不同的推送数据结构

#### Step 4: 调用金蝶税务云接口

- 支持 AES 加密解密
- 支持签名验证

#### Step 5: 接收回调结果

- 成功：根据是否存在发票代码号码判断
- 失败：根据 errorCode 判断

### Service 层实现规范（单据推送）

```java
public Map<String, Object> push(String billId) {
    // 1. 查询 BIP 单据数据（使用 getOpenApiCall）
    JSONObject billData = queryBillData(billId);
    
    // 2. 解析单据明细
    JSONArray details = billData.getJSONArray("details");
    
    // 3. 处理档案参照（如需要）
    processArchiveReference(billData);
    
    // 4. 字段映射转换
    JSONObject mappedData = fieldMapper.map(billData);
    
    // 5. 调用第三方接口
    Map<String, Object> response = thirdPartyService.push(mappedData);
    
    // 6. 解析响应结果
    boolean success = parseResponse(response);
    
    // 7. 回写处理状态（使用 IYmsJdbcApi）
    writeBackStatus(billId, success, response);
    
    return response;
}
```

---

## 错误处理

### 单据录入错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| FIN001 | 单据保存失败 | 返回错误消息 |
| FIN002 | 单据提交失败 | 返回错误消息，记录已保存的单据ID |
| FIN003 | 必填字段缺失 | 返回校验错误 |

### 单据推送错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| FIN101 | 单据查询失败 | 返回错误消息 |
| FIN102 | 字段映射失败 | 返回错误消息 |
| FIN103 | 第三方接口调用失败 | 返回错误消息，记录失败原因 |
| FIN104 | 状态回写失败 | 记录日志，不影响主流程 |

---

## 字段映射规范

### 通用映射规则

1. **档案参照字段**：需要调用 skill技能的`iuap-c-metadata-info`的IBillQueryRepository 查询档案信息
2. **枚举字段**：参考 char_translation_spec.md 进行枚举翻译
3. **日期字段**：统一使用 yyyy-MM-dd 格式
4. **金额字段**：使用 BigDecimal 类型，保留2位小数

### 映射配置示例

```json
{
  "fieldMappings": [
    {
      "sourceField": "bill_code",
      "targetField": "billNo",
      "type": "string"
    },
    {
      "sourceField": "amount",
      "targetField": "totalAmount",
      "type": "decimal"
    },
    {
      "sourceField": "bill_date",
      "targetField": "billDate",
      "type": "date",
      "format": "yyyy-MM-dd"
    },
    {
      "sourceField": "customer",
      "targetField": "customerCode",
      "type": "reference",
      "archiveType": "customer"
    }
  ]
}
```

---

## 核心组件清单

### 单据录入组件

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| BillIntegrateRequest | 入参 DTO | Model |
| BillSaveService | 单据保存服务接口 | Service |
| BillSaveServiceImpl | 单据保存服务实现 | Service |
| BillApiResponse | 响应 DTO | Model |

### 单据推送组件

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| BillPushRequest | 入参 DTO | Model |
| BillQueryService | BIP 查询服务接口 | Service |
| BillOpenApiQueryService | BIP 查询服务实现 | Service |
| BillFieldMapper | 字段映射器 | Service |
| BillDetailProcessor | 单据明细处理器 | Service |
| ThirdPartyAuthService | 三方鉴权接口 | Service |
| ThirdPartyBillService | 三方单据接口 | Service |
| BillApiResponse | 响应 DTO | Model |
| ResponseParser | 响应解析器 | Service |
| BillResultWriteService | 结果回写服务 | Service |

---

## 检查清单

### 单据录入检查
- [ ] 入参验证：必填字段校验
- [ ] 数据预处理：格式转换、默认值设置
- [ ] BIP 保存：调用 BIP 保存接口
- [ ] BIP 提交：保存成功后调用提交接口
- [ ] 错误处理：异常捕获和错误消息返回
- [ ] 数据持久化：未使用 MyBatis Mapper

### 单据推送检查
- [ ] BIP 查询：使用 getOpenApiCall 查询单据数据
- [ ] 字段映射：从配置动态解析映射关系
- [ ] 档案参照：根据需要调用 getIBillQueryRepository
- [ ] 第三方调用：调用第三方接口推送数据
- [ ] 结果回写：使用 IYmsJdbcApi 更新单据状态
- [ ] 数据持久化：未使用 MyBatis Mapper
