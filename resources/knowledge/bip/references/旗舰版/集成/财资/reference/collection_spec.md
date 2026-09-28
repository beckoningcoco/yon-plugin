# 资金收款单推送规范

## 概述

> **⚠️ 场景限制**：本技能仅生成**资金收款单推送集成**场景代码
> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 收款单数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |

---

## 收款单推送服务

### 接口定义

| 方法 | 说明 |
|------|------|
| pushErpGatherbill | 推送收款单到财务系统 |
| approveGather | 审批签字 |
| checkGather | 校验收款单 |
| updateCharacter | 更新收款单状态 |

### 接口详情

#### 收款单推送

```
POST /pusherp/gatherbill
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 收款单数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| code | int | 状态码 |
| result | string | 推送结果 |
| resultcode | string | 结果码 |

#### 收款单校验

```
POST /pusherp/checkgatherbill
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 收款单数据 |

---

## 数据处理流程

### 1. 收款单推送流程

1. 接收收款单推送请求
2. 按组织过滤（pushorgcode）
3. 按交易类型过滤（receivetrade）
4. 构建XML格式数据
5. 调用财务系统接口推送
6. 推送成功则调用审批签字接口
7. 更新收款单推送状态

### 2. 审批签字流程

1. 推送成功后自动触发
2. 调用财务系统审批签字接口
3. 返回审批结果

### 3. 状态更新流程

1. 审批签字成功后
2. 更新收款单的结果码
3. 记录推送状态

---

## 配置参数

| 参数名称 | 说明 | 默认值 |
|----------|------|--------|
| receivetrade | 允许推送的交易类型 | cmp_fundcollection_general;cmp_fundcollection_other;cmp_fundcollection_purchase |
| pushorgcode | 允许推送的组织 | 102;103 |

---

## 交易类型

| 交易类型 | 说明 |
|----------|------|
| cmp_fundcollection_general | 一般资金收款 |
| cmp_fundcollection_other | 其他资金收款 |
| cmp_fundcollection_purchase | 采购资金收款 |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| COLL001 | 收款单推送失败 | 返回错误消息 |
| COLL002 | 审批签字失败 | 记录日志，返回错误消息 |
| COLL003 | 校验收款单失败 | 返回错误消息 |
| COLL004 | 组织不在推送范围 | 不执行推送 |
| COLL005 | 交易类型不支持 | 不执行推送 |

---

## 数据格式

### XML 格式示例

```xml
<?xml version="1.0" encoding='UTF-8'?>
<ufinterface account="YTLZ" billtype="F2" businessunitcode="" filename=""
groupcode="YTLZ" isexchange="Y" orgcode="" receiver="" replace="Y"
roottag="" sender="BIP02">
    <!-- 收款单数据 -->
</ufinterface>
```

---

## Service 层实现规范

```java
public Map<String, Object> pushErpGatherbill(Map<String, Object> map) throws Exception {
    // 1. 构建XML格式数据
    String xmlStr = buildXmlStr(map);

    // 2. 调用财务系统接口
    Map<String, String> result = sendXML(doc);

    // 3. 返回推送结果
    return result;
}

public boolean approveGather(Map<String, Object> datamap) throws Exception {
    // 1. 调用审批签字接口
    // 2. 返回审批结果
    return true;
}

public boolean checkGather(String id) throws Exception {
    // 1. 查询收款单是否存在
    // 2. 返回校验结果
    return true;
}
```

---

## 参照的原始资产文档地址

- **触发条件**：参照资产文档
- **返回结果**：https://docs.yongoucloud.com/l/88e915749966
