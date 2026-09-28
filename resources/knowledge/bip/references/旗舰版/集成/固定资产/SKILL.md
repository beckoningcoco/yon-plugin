---
name: yonbip-c-fa-integration
description: 
  固定资产相关单据的集成能力，支持与第三方系统的双向集成（单据录入和单据推送）。
  适用于需要将外部系统数据传输到BIP固定资产模块、或将BIP固定资产单据推送到外部系统的场景。
  涉及的单据类型包括：固定资产新增、转移、处置、调整、调出、拆分、合并、重分类等。
  也适用于需要调用BIP OpenAPI接口进行数据查询、获取token等操作。
type: agent
---

# 固定资产集成技能

提供固定资产相关单据与第三方系统的双向集成能力。

## ⚠️ 代码生成重要说明

**问题**：生成的RPC调用代码总是找不到DTO的具体字段和映射关系。

**解决方案**：
1. **必须参考实际项目代码**：在生成代码前，先读取项目中已有的Service实现作为参考
   - 参考路径：D:\work\lty\c-cbu-pxkf-pxsz\c-cbu-pxkf-pxsz-be\dev-c-cbu-pxkf-pxsz-service\src\main\java\com\yonyou\iuap\fa\service\
   - 重点参考：FaAdditionService.java, FaDisposalService.java, FaSplitService.java

2. **严格按照字段映射表**：本文档已补充完整的DTO字段结构（见"RPC调用"章节）

3. **注意嵌套结构**：
   - FaAdditionDTO 有三个嵌套列表：bodies, assignments, sources
   - DisposalBillDto 是包装类，实际数据在 disposalBillDtos 列表中

4. **完整的convertToDTO方法**：生成代码时必须包含完整的字段映射逻辑，不能省略

## 🚫 严禁生成TODO

**重要规则**：在生成代码时，**绝对不允许**生成TODO注释或占位符。

**错误示例**（禁止）：
```java
// TODO: 需要根据实际情况设置
dto.setTaxItemId(requestDTO.getTaxItemId());

// TODO: 补充字段映射
// dto.setXXX(...);
```

**正确做法**：
1. **如果字段映射关系明确**：直接生成完整的代码
2. **如果字段映射关系不明确**：
   - ❌ 不要生成TODO
   - ✅ 立即询问用户："这个字段应该如何映射？"
   - ✅ 或者说明："我不确定XX字段的映射关系，请提供字段映射表"

**原因**：
- TODO会让用户以为代码已经完成，但实际上是不完整的
- TODO会增加后续的维护成本
- 用户希望得到完整可用的代码，或者明确的问题反馈，而不是半成品

---

## 前置条件

> **⚠️ 重要**：如果是单据录入场景，需要提醒客户引入pom文件后再进行生成代码

## 业务场景

### 单据录入

- 提供restful接口获取三方传递过来的单据数据（JSON格式）；

- 进行数据解析、校验；

- 调用固定资产RPC接口/OpenAPI接口进行保存并审核（必须使用）；

- 返回给三方系统信息。

### 单据推送

- 提供restful接口,根据单据id调用OPENAPI查询单据详细信息；

- 进行数据解析、转换为三方系统的数据格式；

- 调用三方系统提供的接口(没有指明接口方式，默认为无需鉴权的restful)；

- 获取三方返回的信息，解析数据并返回。


## 涉及单据

| 单据类型 | Controller | Service | 路径 | 调用标品方式 |
|---------|-----------|---------|------|----------|
| 固定资产新增 | AdditionBillController | FaAdditionBillService | efa-app/.../AdditionBillController.java | RPC方式 |
| 固定资产转移 | TransferController | TransferService | efa-app/.../TransferController.java | RPC方式 |
| 固定资产处置 | DisposalController | DisposalService | efa-app/.../DisposalController.java | RPC方式 |
| 固定资产调整 | FaAdjustmentController | FaAdjustmentService | efa-app/.../FaAdjustmentController.java | RPC方式 |
| 固定资产调出 | FaAllocateOutController | FaAllocateOutService | efa-app/.../FaAllocateOutController.java | RPC方式 |
| 固定资产拆分 | FaSplitController | FaSplitService | efa-app/.../FaSplitController.java | OpenAPI方式 |
| 固定资产合并 | FixedAssetMergeController | FixedAssetMergeService | efa-app/.../FixedAssetMergeController.java | OpenAPI方式 |
| 固定资产重分类 | ReclassBillController | ReclassBillService | efa-app/.../ReclassBillController.java | OpenAPI方式 |

## 通用API模式

所有单据提供统一的集成接口模式：
| 单据类型 | OpenAPI地址 |
|---------|------------|
| 固定资产拆分 | /iuap-api-gateway/yonbip/EFI/FaSplit/batchSaveAndAudit |
| 固定资产合并 | /iuap-api-gateway/yonbip/EFI/merge/batchSaveAndAudit |
| 固定资产重分类 | /iuap-api-gateway/yonbip/EFI/reclass_bill/save |

```
POST /单据路径/saveAndAudit
```

请求体为各单据对应的VO对象，响应返回包含id、code、sourceId的结果。

## OpenAPI模式

## 集成示例

### 固定资产新增

```java
// 请求
POST /additionBill/saveAndAudit
{
    "sourceId": "外部系统ID",
    "code": "单据编号",
    "assetCode": "资产编号",
    "tagno": "标签号",
    "accentityCode": "核算主体",
    "addWayCode": "增加方式",
    "assetCategoryCode": "资产类别",
    "assetSubcategoryCode": "资产子类",
    "beginTime": "2024-03-01",
    "bodies": [
        {
            "accbookCode": "账簿编码",
            "originalValue": 100000,
            "netValue": 90000
        }
    ]
}

// 响应
{
    "code": 200,
    "message": "操作成功",
    "data": {
        "id": "BIP生成的单据ID",
        "code": "FA000001",
        "sourceId": "外部系统ID"
    }
}
```

### 固定资产处置

```java
// 请求
POST /disposal/saveAndAudit
{
    "disposalBillDtos": [
        {
            "sourceId": "外部系统ID",
            "code": "单据编号",
            "accentityCode": "核算主体",
            "disposalType": 1,
            "vouchdate": "2024-05-07",
            "bodies": [
                {
                    "assetCode": "资产编号",
                    "disposalAmount": 10000,
                    "disposalOriValue": 900000
                }
            ]
        }
    ]
}
```

### 固定资产转移

```java
// 请求
POST /transfer/saveAndAudit
{
    "sourceId": "外部系统ID",
    "code": "单据编号",
    "transferType": 1,
    "transferDate": "2024-05-01",
    "bodies": [
        {
            "assetCode": "资产编号",
            "srcDeptCode": "原部门",
            "destDeptCode": "目标部门"
        }
    ]
}
```

### 固定资产调整

```java
// 请求
POST /adjust/saveAndAudit
{
    "sourceId": "外部系统ID",
    "code": "单据编号",
    "accentityCode": "核算主体",
    "vouchdate": "2024-04-24",
    "details": [
        {
            "assetCode": "资产编号",
            "name": {"zh_CN": "资产名称"},
            "mgmtDeptCode": "管理部门"
        }
    ]
}
```

### 固定资产调出

```java
// 请求
POST /faAllocateOut/saveAndAudit
{
    "sourceId": "外部系统ID",
    "code": "单据编号",
    "allocateOutDate": "2024-07-01",
    "bodies": [
        {
            "assetCode": "资产编号",
            "allocateOutQty": 1
        }
    ]
}
```

### 固定资产拆分

```json
// 请求
POST /faSplit/saveAndAudit
[
    {
        "sourceId": "外部系统ID",
        "code": "单据编号",
        "assetCode": "原资产编号",
        "splitAssetCodes": ["新资产1", "新资产2"]
    }
]
```

### 固定资产合并

```json
// 请求
POST /fixedAssetMerge/saveAndAudit
[
    {
        "sourceId": "外部系统ID",
        "code": "单据编号",
        "assetCodes": ["资产1", "资产2"],
        "mergedAssetCode": "合并后资产编号"
    }
]
```

## VO类位置

- FaAdditionVO: `efa-service/.../vo/addition/FaAdditionVO.java`
- TransferVO: `efa-service/.../vo/transfer/TransferVO.java`
- DisposalBillVO: `efa-service/.../vo/disposal/DisposalBillVO.java`
- FaAdjustmentVO: `efa-service/.../vo/adjust/FaAdjustmentVO.java`
- AllocateOutBillVO: `efa-service/.../vo/allocateout/AllocateOutBillVO.java`

## 推送第三方系统

单据审核后推送到外部系统的逻辑在 `efa-service/.../service/out/` 目录下：

- AdditionBill3Service / AdditionBill3Impl
- Transfer3Service / Transfer3Impl  
- Disposal3Service / Disposal3Impl
- FaAdjustment3Service / FaAdjustment3Impl
- FaAllocateOut3Service / FaAllocateOut3Impl
- Split3Service / Split3Impl
- Merge3Service / Merge3Impl

推送实现类在 `bill3action/impl/` 下，按业务领域分组（gongcheng工程类、zichan资产类）。

## OpenAPI 调用

调用skill技能的`iuap-c-openapi-integration`获取BIP OpenAPI接口，主要包括获取AccessToken和调用业务接口。

### 核心类

| 类名 | 路径 | 说明 |
|-----|------|------|
| OpenApiUtil | efa-service/.../utils/openapi/OpenApiUtil.java | OpenAPI工具类 |
| SignUtil | efa-service/.../utils/openapi/SignUtil.java | 签名工具类 |
| YmsConfigConstant | efa-service/.../utils/openapi/YmsConfigConstant.java | 配置常量类 |

### 配置项

在application.properties中配置：

```properties
# 环境域名
openApi.businessCenterUrl=https://xxx.yonyou.com
# API前缀
openApi.urlprefix=/iuap-api
# AppKey
openApi.appkeys=your_app_key
# AppSecret
openApi.appsecrets=your_app_secret
# 租户ID
yytrans.default.ytenant-id=your_tenant_id
```

### 获取AccessToken

```java
@Autowired
private OpenApiUtil openApiUtil;

@Autowired
private YmsConfigConstant ymsConfig;

public String getToken() throws Exception {
    // 使用缓存的token，自动处理过期刷新
    return openApiUtil.getCacheAccessToken(
        ymsConfig.getAppKey(),
        ymsConfig.getAppSecret()
    );
}
```

### 调用业务API

```java
public String callBusinessApi(String accessToken, String apiPath, Map<String, Object> params) {
    String url = ymsConfig.getBaseUrl() + apiPath;
    
    // 构建请求头
    Map<String, String> headers = new HashMap<>();
    headers.put("Authorization", "Bearer " + accessToken);
    headers.put("Content-Type", "application/json");
    headers.put("x-yTenantId", ymsConfig.getYtenantId());
    
    // 发送请求
    String result = HttpClientUtil.doPost(url, JSONObject.toJSONString(params), headers);
    return result;
}
```

### 签名算法

签名使用HmacSHA256算法，参考SignUtil：

```java
public static String sign(Map<String, String> params, String suiteSecret) {
    // 1. 按参数名排序
    TreeMap<String, String> treeMap = new TreeMap<>(params);
    
    // 2. 拼接参数名与值
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, String> entry : treeMap.entrySet()) {
        sb.append(entry.getKey()).append(entry.getValue());
    }
    
    // 3. HmacSHA256签名
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(suiteSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] signData = mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8));
    
    // 4. Base64编码并URL编码
    String base64String = Base64.getEncoder().encodeToString(signData);
    return URLEncoder.encode(base64String, "UTF-8");
}
```

### 使用示例

在Service中调用OpenAPI：

```java
@Service
public class MyFaService {

    @Autowired
    private OpenApiUtil openApiUtil;
    
    @Autowired
    private YmsConfigConstant ymsConfig;
    
    public void doSomething() throws Exception {
        // 1. 获取token
        String token = openApiUtil.getCacheAccessToken(
            ymsConfig.getAppKey(), 
            ymsConfig.getAppSecret()
        );
        
        // 2. 构建请求参数
        Map<String, Object> params = new HashMap<>();
        params.put("assetCode", "FA001");
        params.put("tenantId", ymsConfig.getYtenantId());
        
        // 3. 调用API
        String result = callApi("/iuap-api/fa/asset/query", token, params);
        
        // 4. 处理响应
        JSONObject response = JSONObject.parseObject(result);
        // ...
    }
    
    private String callApi(String apiPath, String token, Map<String, Object> params) {
        String url = ymsConfig.getBaseUrl() + apiPath;
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + token);
        headers.put("Content-Type", "application/json");
        headers.put("x-yTenantId", ymsConfig.getYtenantId());
        return HttpClientUtil.doPost(url, JSONObject.toJSONString(params), headers);
    }
}
```

### 常用API路径

- 获取Token: `/iuap-api-auth/open-auth/selfAppAuth/getAccessToken`
- 查询资产: `/iuap-api/fa/asset/query`
- 查询单据: `/iuap-api/fa/bill/query`
- 保存单据: `/iuap-api/fa/bill/save`

## RPC 调用

### ⚠️ 重要提示：DTO字段映射

生成RPC调用代码时，必须严格按照以下字段结构进行映射，避免"找不到字段"的问题。

### FaAdditionDTO 完整字段结构（固定资产新增）

**主表字段**：sourceId, accentity, assetCode, name(MultilingualDTO), assetModel(MultilingualDTO), assetCategoryId, assetSubcategoryId, addWayId, userId, mgmtDeptId, custodian, location(MultilingualDTO), vendorId(Long), beginTime(String), quantity(Integer), unitId, creator, createTime, auditor, auditTime

**嵌套对象 - bodies (List<FaAdditionCalculateDTO>)**：accbook, createAssetDate, fcOriValue, oriValue, taxItemId, addedTaxAmount, yearDeprAmount, deprAmount

**嵌套对象 - assignments (List<FaAdditionAssignmentDTO>)**：deptId, proportion, remarks(MultilingualDTO)

**嵌套对象 - sources (List<FaAdditionSourceDTO>)**：srcBillNo (可选)

### DisposalBillDto 完整字段结构（固定资产处置）

⚠️ **关键**：DisposalBillDto 是包装类，实际数据在 `disposalBillDtos` 列表中。

**DisposalBillDto**：disposalBillDtos (List<BatchSaveDisposalBillDto>)

**BatchSaveDisposalBillDto**：sourceId, code, accentityCode, vouchdate(String), disposalType(Short), bodies(List<DisposalBillDetailDto>)

**DisposalBillDetailDto**：assetIdCode, disposalAmount, disposalOriValue, discription(MultilingualDTO)

### TransferDTO 完整字段结构（固定资产转移）

**主表字段**：sourceId, code, accentity, transferType(Integer), transferDate(String), creator, createTime, auditor, auditTime

**嵌套对象 - bodies (List<TransferDetailDTO>)**：assetCode, srcDeptId, destDeptId, srcLocationId, destLocationId, srcUserId, destUserId, transferQty, remarks(MultilingualDTO)

**说明**：
- transferType：转移类型（1-部门转移，2-地点转移，3-使用人转移）
- srcDeptId/destDeptId：原部门ID/目标部门ID
- srcLocationId/destLocationId：原地点ID/目标地点ID
- srcUserId/destUserId：原使用人ID/目标使用人ID

### FaAdjustmentDTO 完整字段结构（固定资产调整）

**主表字段**：sourceId, code, accentity, vouchdate(String), adjustType(Integer), creator, createTime, auditor, auditTime

**嵌套对象 - details (List<FaAdjustmentDetailDTO>)**：assetCode, name(MultilingualDTO), assetModel(MultilingualDTO), mgmtDeptId, userId, custodian, location(MultilingualDTO), oriValue, netValue, remarks(MultilingualDTO)

**说明**：
- adjustType：调整类型（1-基本信息调整，2-价值调整）
- details：调整明细，包含调整后的字段值
- 只需要填写需要调整的字段，未调整的字段可以不填

### FaAllocateOutDTO 完整字段结构（固定资产调出）

**主表字段**：sourceId, code, accentity, allocateOutDate(String), allocateOutType(Integer), targetAccentity, creator, createTime, auditor, auditTime

**嵌套对象 - bodies (List<FaAllocateOutDetailDTO>)**：assetCode, allocateOutQty, allocateOutOriValue, allocateOutNetValue, remarks(MultilingualDTO)

**说明**：
- allocateOutType：调出类型（1-正常调出，2-报废调出）
- targetAccentity：目标会计主体（调出到哪个主体）
- allocateOutQty：调出数量
- allocateOutOriValue：调出原值
- allocateOutNetValue：调出净值

### FaSplitDTO 完整字段结构（固定资产拆分 - OpenAPI方式）

⚠️ **注意**：拆分使用OpenAPI方式，不是RPC方式。

**请求参数（Map<String, Object>）**：
- sourceId (String)：外部系统ID
- code (String)：单据编号
- assetCode (String)：原资产编号
- splitAssetCodes (List<String>)：拆分后的资产编号列表
- splitRatios (List<Double>)：拆分比例列表（可选，如[0.5, 0.5]表示平均拆分）
- remarks (String)：备注
- tenantId (String)：租户ID

**API路径**：/iuap-api-gateway/yonbip/EFI/FaSplit/batchSaveAndAudit

### FixedAssetMergeDTO 完整字段结构（固定资产合并 - OpenAPI方式）

⚠️ **注意**：合并使用OpenAPI方式，不是RPC方式。

**请求参数（Map<String, Object>）**：
- sourceId (String)：外部系统ID
- code (String)：单据编号
- assetCodes (List<String>)：待合并的资产编号列表
- mergedAssetCode (String)：合并后的资产编号
- mergedAssetName (String)：合并后的资产名称
- remarks (String)：备注
- tenantId (String)：租户ID

**API路径**：/iuap-api-gateway/yonbip/EFI/merge/batchSaveAndAudit

### ReclassBillDTO 完整字段结构（固定资产重分类 - OpenAPI方式）

⚠️ **注意**：重分类使用OpenAPI方式，不是RPC方式。

**请求参数（Map<String, Object>）**：
- sourceId (String)：外部系统ID
- code (String)：单据编号
- assetCode (String)：资产编号
- srcAssetCategoryId (String)：原资产类别ID
- destAssetCategoryId (String)：目标资产类别ID
- srcAssetSubcategoryId (String)：原资产子类别ID
- destAssetSubcategoryId (String)：目标资产子类别ID
- reclassDate (String)：重分类日期
- remarks (String)：备注
- tenantId (String)：租户ID

**API路径**：/iuap-api-gateway/yonbip/EFI/reclass_bill/save

### 代码生成模板参考

参考项目中的实际代码：
- D:\work\lty\c-cbu-pxkf-pxsz\c-cbu-pxkf-pxsz-be\dev-c-cbu-pxkf-pxsz-service\src\main\java\com\yonyou\iuap\fa\service\FaAdditionService.java
- D:\work\lty\c-cbu-pxkf-pxsz\c-cbu-pxkf-pxsz-be\dev-c-cbu-pxkf-pxsz-service\src\main\java\com\yonyou\iuap\fa\service\FaDisposalService.java

生成代码时，必须包含完整的 `convertToDTO` 方法，严格按照字段映射进行转换。

### 适用场景

外系统调用不走该场景

BIP内部RPC服务进行单据操作，使用IrisRpcUtil工具类获取远程服务。

### 核心类

| 类名 | 路径 | 说明 |
|-----|------|------|
| IrisRpcUtil | com.yonyou.ypd.bill.utils.IrisRpcUtil.java | Iris服务引用工具类 |
| IBillRepository | ypd-bill/.../IBillRepository.java | 单据仓储接口 |
| IBillQueryRepository | ypd-bill/.../IBillQueryRepository.java | 单据查询接口 |

### 获取RPC服务

```java
import com.yonyou.ypd.bill.utils.IrisRpcUtil;

// 获取固定资产新增RPC服务
IFaAdditionBillApiService iFaAdditionBillApiService = 
    IrisRpcUtil.getIrisReference("yonbip-fi-efa",IFaAdditionBillApiService.class);
```

### 固定资产RPC服务清单

| 服务接口 | Group | 说明 | 参数 |  返回 |
|---------|-------|------|-----|------|
| com.yonyoucloud.fi.efa.faaddition.api.IFaAdditionBillApiService | yonbip-fi-efa | 固定资产新增API | List<com.yonyoucloud.fi.efa.faaddition.dto.FaAdditionDTO> | com.yonyoucloud.fi.efa.common.dto.ResponseDTO |
| com.yonyoucloud.fi.efa.fatransferbill.api.ITransferApiService | yonbip-fi-efa | 固定资产转移API |  List<com.yonyoucloud.fi.efa.fatransferbill.dto.TransferDTO> | com.yonyoucloud.fi.efa.common.dto.ResponseDTO |
| com.yonyoucloud.fi.efa.fadisposalbill.api.IDisposalApiService | yonbip-fi-efa | 固定资产处置API | com.yonyoucloud.fi.efa.fadisposalbill.dto.DisposalBillDto | com.yonyoucloud.fi.efa.common.dto.ResponseDTO |
| com.yonyoucloud.fi.efa.faadjustment.api.IFaAdjustmentApiService | yonbip-fi-efa | 固定资产调整API | List<com.yonyoucloud.fi.efa.faadjustment.dto.FaAdjustmentDTO> | com.yonyoucloud.fi.efa.common.dto.ResponseDTO |
| com.yonyoucloud.fi.efa.faallocateout.api.IFaAllocateOutApiService | yonbip-fi-efa | 固定资产调出API | List<com.yonyoucloud.fi.efa.faallocateout.dto.FaAllocateOutDTO> | com.yonyoucloud.fi.efa.common.dto.ResponseDTO |

### 调用示例

```java
@Service
public class MyFaService {

    public Result saveAdditionBill(FaAdditionVO faAdditionVO) {
        // 1. 获取RPC服务
        IFaAdditionBillApiService iFaAdditionBillApiService = 
    IrisRpcUtil.getIrisReference("yonbip-fi-efa",IFaAdditionBillApiService.class);
        
        // 2. 转换DTO
        FaAdditionDTO faAdditionDTO = new FaAdditionDTO();
        BeanUtil.copyProperties(faAdditionVO, faAdditionDTO);
        
        // 3. 调用RPC接口
        List<FaAdditionDTO> dtoList = CollUtil.newArrayList(faAdditionDTO);
        ResponseDTO responseDTO = iFaAdditionBillApiService.apiSaveAndAudit(dtoList);
        
        // 4. 处理响应
        if (CollUtil.isEmpty(responseDTO.getSuccess())) {
            // 获取失败信息
            List<String> failed = responseDTO.getFailed();
            return Result.failedMsg(failed.stream().findFirst().orElse("未知错误"));
        }
        
        // 返回成功结果
        return Result.ok(responseDTO.getSuccess().stream().findFirst().get());
    }
}
```

### maven相关pom文件引入，具体版本请和产研老师确认

```xml
<!-- 固定资产标品RPC API -->       
<dependency>
    <groupId>com.yonyou.fi</groupId>
    <artifactId>yonbip-fi-efa_open-api</artifactId>
    <version>8.2.160.8-RELEASE</version>
</dependency>
```

### 使用IBillRepository操作单据

```java
@Autowired
private IBillRepository billRepository;

// 保存单据
Map<String, Object> billData = new HashMap<>();
billData.put("code", "FA001");
billData.put("name", "固定资产新增");
billData.put("accbookCode", "01001");
// ...

// 调用保存
billRepository.save(billData);

// 审核单据
billRepository.audit(billId);
```

### 使用IBillQueryRepository查询单据

```java
@Autowired
private IBillQueryRepository billQueryRepository;

// 查询单据
QueryCondition condition = QueryCondition.build("fa_addition")
    .eq("code", "FA001")
    .eq("dr", 0);

List<Map<String, Object>> result = billQueryRepository.query(condition);
```

### 单据操作类型

| 方法 | 说明 |
|-----|------|
| save | 保存单据 |
| audit | 审核单据 |
| unAudit | 弃审单据 |
| delete | 删除单据 |
| query | 查询单据 |
---

## 重要说明

### 关于DTO字段结构的来源

本文档中补充的DTO字段结构来自以下来源：

1. **已验证的实际代码**（推荐优先参考）：
   - FaAdditionDTO：基于项目实际代码 FaAdditionService.java
   - DisposalBillDto：基于项目实际代码 FaDisposalService.java
   - FaSplitDTO：基于项目实际代码 FaSplitService.java

2. **基于RPC接口推断**（需要验证）：
   - TransferDTO：基于 ITransferApiService 接口和固定资产业务逻辑推断
   - FaAdjustmentDTO：基于 IFaAdjustmentApiService 接口和固定资产业务逻辑推断
   - FaAllocateOutDTO：基于 IFaAllocateOutApiService 接口和固定资产业务逻辑推断
   - FixedAssetMergeDTO：基于 OpenAPI 路径和固定资产业务逻辑推断
   - ReclassBillDTO：基于 OpenAPI 路径和固定资产业务逻辑推断

### 使用建议

1. **优先使用已验证的单据类型**：
   - 固定资产新增、处置、拆分的字段结构已经过实际代码验证，可以直接使用

2. **其他单据类型需要验证**：
   - 转移、调整、调出、合并、重分类的字段结构是基于推断的
   - 在实际使用前，建议：
     - 联系产研老师确认字段结构
     - 或者查看 yonbip-fi-efa_open-api 依赖包的源码
     - 或者先在测试环境进行验证

3. **字段可能随版本变化**：
   - 本文档基于 yonbip-fi-efa_open-api 8.2.160.8-RELEASE 版本
   - 如果升级到新版本，字段结构可能有变化
   - 建议在升级后重新验证字段映射

### 反馈和改进

如果你在使用过程中发现：
- 字段结构与实际不符
- 缺少某些必要字段
- 字段类型不正确

请及时更新本文档，并记录：
- 发现问题的时间
- 使用的版本号
- 正确的字段结构

这样可以帮助后续使用者避免同样的问题。

---

## 版本记录

| 版本 | 日期 | 更新内容 | 更新人 |
|------|------|---------|--------|
| 1.0 | 2024-04-23 | 初始版本，包含基本的RPC和OpenAPI调用说明 | - |
| 2.0 | 2024-04-23 | 补充完整的DTO字段结构（新增、处置、拆分已验证，其他推断） | Darwin |

