# 银行账户集成规范

## 概述

> **⚠️ 场景限制**：本技能仅生成**银行账户集成**场景代码
> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 银行账户数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |

---

## 银行账户同步服务

### 接口定义

| 方法 | 说明 |
|------|------|
| pushErpBank | 推送银行账户到ERP(NC65) |
| bankSaveAfterSyncErp | 银行新增同步 |
| bankSaveAfterAsyncErp | 银行启停异步同步 |

### 接口详情

#### 银行新增同步

```
POST /bankdot/saveAfter
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| params | JSONObject | 是 | 银行账户数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| msg | string | 消息 |
| code | int | 状态码 |

#### 银行启停异步同步

```
POST /bankdot/asynSaveAfter
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| params | JSONArray | 是 | 银行账户数据数组 |

---

## 数据处理流程

### 1. 银行新增同步流程

1. 接收司库系统传入的银行账户数据
2. 查询银行类别是否已同步
3. 调用 BIP 保存接口创建银行账户
4. 记录ID映射关系
5. 返回处理结果

### 2. 银行状态变更流程

1. 接收银行账户状态变更请求
2. 根据状态类型执行不同操作
3. 调用 NC65 接口同步数据
4. 返回处理结果

---

## 状态操作类型

| status值 | 操作说明 | 处理逻辑 |
|----------|---------|---------|
| normal | 新增/修改 | 调用BIP保存接口 |
| fronzen | 冻结 | 调用BIP冻结接口，传递freezeType |
| unfrozen | 解冻 | 调用BIP解冻接口 |
| close | 销户 | 调用BIP销户接口 |

### 冻结类型 (freezeType)

| 类型值 | 说明 |
|--------|------|
| 1 | 全部冻结 |
| 2 | 只收不付 |

---

## 字段映射（参考）

### 银行账户主表字段

| BIP 字段 | NC65字段 | 数据类型 | 说明 |
|---------|-----------|---------|------|
| bankaccount_code | accnum | String | 银行账户编码 |
| bankaccount_name | accname | String | 银行账户名称 |
| bank | bank | String | 开户银行 |
| account | account | String | 账号 |
| accountnature | accountnature | String | 账户性质 |
| acctstatus | acctstatus | String | 账户状态 |
| acctopentype | acctopentype | String | 账户类型 |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| BANK001 | 银行新增同步失败 | 返回错误消息，记录日志 |
| BANK002 | 银行类别未同步 | 返回错误消息，请先同步银行类别 |
| BANK003 | 状态变更失败 | 返回错误消息 |
| BANK004 | NC65接口调用失败 | 返回错误消息，记录日志 |

---

## BIP/NC65 接口路径

| 接口 | 路径 | 说明 |
|------|------|------|
| 银行新增 | /iuap-ipaas-dataintegration/gwmanage/gwportal/diwork/erpdata/task/dataview/addIDMapping/nc65_bank_syn | 银行新增同步 |
| 银行类别 | /iuap-ipaas-dataintegration/... | 银行类别同步 |
| NC65银行接口 | 自定义NC65接口 | 银行账户XML推送 |

---

## Service 层实现规范

```java
public Map<String, Object> pushErpBank(String id, String status, Map<String, Object> inmap) throws Exception {
    // 1. 根据状态类型执行不同操作
    switch (status) {
        case "fronzen":
            // 冻结处理
            if ("1".equals(inmap.get("freezeType"))) {
                // 全部冻结
            } else if ("2".equals(inmap.get("freezeType"))) {
                // 只收不付
            }
            break;
        case "unfronzen":
            // 解冻处理
            break;
        case "close":
            // 销户处理
            break;
        default:
            // 新增/修改处理
            break;
    }

    // 2. 调用NC65接口同步数据
    String xmlStr = buildXmlStr(inmap, status);
    String result = sendToNC65(url, xmlStr);

    // 3. 返回结果
    return parseResult(result);
}
```
