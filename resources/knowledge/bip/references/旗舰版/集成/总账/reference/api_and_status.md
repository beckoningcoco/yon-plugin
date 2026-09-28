# API接口说明与状态追踪机制

## API认证

### 获取 Access Token

```java
// 认证URL
String authUrl = baseUrl + "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken";

// 签名方式：HmacSHA256
// signature = HmacSHA256(appSecret, appKey + timestamp)

// 请求参数
{
    "appKey": "应用Key",
    "timestamp": "时间戳",
    "signature": "签名"
}

// 响应
{
    "access_token": "token_string"
}
```

### AccessToken 工具类

```java
@Component
public class AccessToken {
    @Value("${domain.url}")
    private String baseUrl;

    @Autowired
    private SysUrlConstants sysUrlConstants; // 读取 bip.app.key/secret

    public String getAccessToken() {
        String appKey = sysUrlConstants.getAppKey();
        String appSecret = sysUrlConstants.getAppSecret();
        String timestamp = String.valueOf(System.currentTimeMillis());
        String signature = SignHelper.sign(appSecret, appKey + timestamp);

        // 调用认证接口获取token
        String url = baseUrl + "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken";
        // ...
        return token;
    }
}
```

## API端点汇总

### 期初保存API

| 项目 | 说明 |
|------|------|
| URL | `{domain}/iuap-api-gateway/{tenantId}/wanda_be/sync2/datamigrate/balance/auxiliarySave?access_token={token}` |
| 方法 | POST |
| 超时 | 600秒（10分钟） |
| Content-Type | application/json |
| 说明 | 自发布API（非标品），需基于前端按钮发布 |

**请求体**：SubjectAccountsInitVO 的 JSON 序列化

**响应体**：
```json
{
    "success": true,
    "reqid": "异步请求ID",
    "message": "错误信息（失败时）"
}
```

### 期初进度查询API

| 项目 | 说明 |
|------|------|
| URL | `{domain}/iuap-api-gateway/{tenantId}/wanda_be/sync2/datamigrate/balance/progress?access_token={token}` |
| 方法 | POST |
| 超时 | 600秒（10分钟） |

**请求体**：
```json
{ "reqid": "请求ID" }
```

**响应体**：
```json
{
    "success": "true/false",
    "progress": "0/1",     // 0=处理中, 1=完成
    "message": "错误信息"
}
```

**判断逻辑**：
| success | progress | 含义 | 操作 |
|---------|----------|------|------|
| true | 1 | 保存成功 | STATUS→Y |
| false | 1 | 保存失败 | STATUS→N, REMARK→message |
| true | 0 | 处理中 | 继续轮询 |
| false | 0 | 处理中(异常) | 继续轮询 |

### 凭证保存API

| 项目 | 说明 |
|------|------|
| URL | `{domain}/iuap-api-gateway/yonbip/fi/ficloud/openapi/voucher/addVoucher?access_token={token}` |
| 方法 | POST |
| 超时 | 600秒（10分钟） |
| Content-Type | application/json |
| 说明 | BIP标品OpenAPI |

**响应码处理**：

| code | 含义 | STATUS |
|------|------|--------|
| 200 | 保存成功 | Y |
| 310504 | 凭证已存在（重复） | T |
| 310074 | 凭证已存在（重复） | T |
| 其他 | 保存失败 | N |
| HTTP异常 | 网络错误 | E |

## 状态追踪

### 中间表 STATUS 字段

| STATUS | 含义 | 触发条件 |
|--------|------|---------|
| null | 待处理 | 初始状态 |
| Y | 成功 | API返回成功 |
| N | 失败 | API返回失败/校验失败/异常 |
| P | 跳过 | 借贷金额相减为0/凭证行为空 |
| T | 已存在 | BIP返回310504/310074（凭证重复） |
| E | HTTP错误 | HTTP请求异常 |

### 状态回写方式

#### 期初中间表

```java
// 按ID列表批量更新（分批900条）
subjectAccountDaoMapper.updateSubjectAccountMidIdByIds(
    tableName,       // 动态表名
    status,          // 状态
    remark,          // 备注/错误信息
    reqId,           // 异步请求ID
    null,            // 保留字段
    idList           // ID列表
);

// 按reqId更新（进度查询后）
SubjectAccountMid mid = new SubjectAccountMid();
mid.setSTATUS("Y");
mid.setTableName(tableName);
mid.setREMARK("成功");
mid.setREQID(reqId);
mid.setPARAMJSON("");
subjectAccountDaoMapper.updateSubjectAccountMidIdByReqId(mid);
```

#### 凭证中间表

```java
// 按凭证编号更新
voucherDaoMapper.updateVorchorByJuralNumber(
    tableName,    // 动态表名
    status,       // 状态
    remark,       // 错误信息
    juralNumber   // 凭证编号
);

// 按ID更新（单行跳过）
voucherDaoMapper.updateVorchorById(
    tableName,
    "P",
    "借贷金额相减为0跳过",
    id
);
```

### 错误信息存储

- **REMARK** 字段：存储简短错误描述（API返回的message，截断到字段长度）
- **PARAMJSON** 字段：存储详细错误信息（辅助核算缺失的详细信息拼接）

```java
StringBuilder errorLogBuilder = new StringBuilder();
// 收集错误
errorLogBuilder.append("产品服务段从档案中查询为空,编码为" + code);
errorLogBuilder.append("子目未匹配出具体内容，编码为" + subaccCode);
// ...
// 写入
mid.setPARAMJSON(errorLogBuilder.toString());
mid.setSTATUS("N");
```

## 导入后校验

### SQL校验方式

```sql
-- 1. 检查漏导
SELECT COUNT(*) FROM CUX_GL_B_SG_JOURNAL_2024_01
WHERE STATUS IS NULL OR STATUS = 'N';

-- 2. 检查重复导入
SELECT JURAL_NUMBER, COUNT(*) FROM figl.fi_voucher
WHERE def11 IN (
    SELECT DISTINCT JURAL_NUMBER FROM CUX_GL_B_SG_JOURNAL_2024_01 WHERE STATUS = 'Y'
)
GROUP BY JURAL_NUMBER HAVING COUNT(*) > 1;

-- 3. 金额核对
SELECT SUM(DEBIT_AMOUNT), SUM(CREDIT_AMOUNT)
FROM CUX_GL_B_SG_JOURNAL_2024_01 WHERE STATUS = 'Y';
```

### 报表核对

- 使用 BIP 总账提供的辅助余额表等报表
- 与原有 Oracle 系统数据进行比对
- 核对维度：科目余额、辅助核算余额、期间余额

### 数据核对关键字段

- **期初**：中间表 ID → BIP中通过 reqId 关联
- **凭证**：defInfo1(def11) → 存放Oracle原始凭证编号 JURAL_NUMBER
- **凭证**：defInfo3(def13) → 存放凭证批号 BATCH_NAME

## 重新导入失败数据

```sql
-- 1. 查看失败原因
SELECT ID, COM, ACC, PARAMJSON, REMARK
FROM CUX_GL_B_SG_BALANCE_2024_01
WHERE STATUS = 'N';

-- 2. 修正数据后重新导入（传status=N）
GET /subject/subjectAccountsInit?com=XXX&tableName=CUX_GL_B_SG_BALANCE_2024_01&status=N

-- 3. 或将STATUS置为null后重新导入
UPDATE CUX_GL_B_SG_BALANCE_2024_01 SET STATUS = NULL WHERE STATUS = 'N';
```
