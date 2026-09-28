# 资产包 OpenAPI Resources 开发模式（FIP 外部接口单）

## 适用范围 ⚠️

> **仅适用于 FIP 外部接口单（TXBill）这种通过 `IFipMessageService.sendMessage()` 流程的单据。**
>
> **不适用于**：付款单、收款单、销售订单等其他单据类型。其他单据有自己的 Service 入口（如 `IPaybillService`、`ISaleOrderService` 等），不能用 `sendMessage()` 去创建和删除。

## 背景

此模式基于**资产包**（本公司客开框架），代码结构基本固定。当用户提到"用资产包开发一个 OpenAPI / 写一个 Resources 类"时，参考此模式。

> **📌 通用骨架**：JAX-RS 注解、JSON 解析（Jackson）、`transferBill()` 调用、`ResultMessageUtil` 响应、`try-catch` 异常处理，这些与 [NCC资产包接口开发指南 §4.1](../../references/NCC资产包接口开发指南.md#四rest-接口标准代码模板) 的模板完全一致。本文档**仅列 FIP 特有的差异部分**——`IFipMessageService.sendMessage()` 消息管道。

## 核心类路径

| 类 | 路径 | 说明 |
|----|------|------|
| 基类 | `nccloud.api.AbstractRestResource` | 资产包基类（**不是** `AbstractNCCRestResource`） |
| 单据转换 | `AbstractRestResource.transferBill(单据类型, map)` | JSON → AggVO 自动映射 |
| 消息服务 | `nc.pubitf.fip.service.IFipMessageService` | 通过 `NCLocator` 获取 |
| 消息 VO | `nc.vo.fip.service.FipMessageVO` | 消息体，含 messagetype + messageinfo + billVO |
| 路由信息 | `nc.vo.fip.service.FipRelationInfoVO` | 消息路由信息（集团、组织、单据类型等） |
| 返回结果 | `nc.vo.fip.service.FipMsgResultVO` | `sendMessage()` 返回结果 |
| 持久化查询 | `nc.bs.dao.BaseDAO` | 用于按条件查询（非 sendMessage 链路） |
| JSON 工具 | `com.fasterxml.jackson.databind.ObjectMapper` | 资产包使用 Jackson（非 fastjson） |
| VO 实体 | `nc.vo.fip.txbill.AggTXBillVO` | 外部接口单聚合 VO |
| 头 VO | `nc.vo.fip.txbill.TXBillVO` | 外部接口单头（public 字段） |
| 子表 VO | `nc.vo.fip.txbill.TXBillItemVO` | 外部接口单子表（public 字段） |

## 模块注册

```java
@Override
public String getModule() {
    return "fip2207";
}
```

## 完整代码模板

> **JAX-RS 通用部分**（`@Path`、`@POST`、`ObjectMapper`、`transferBill()`、`ResultMessageUtil`、`try-catch`）见 [NCC资产包接口开发指南 §4.1](../../references/NCC资产包接口开发指南.md#四rest-接口标准代码模板)，此处不再重复。以下仅展示 FIP 特有的差异代码。

### 新增（ADD）

```java
@POST
@Path("add")
@Consumes({"application/json"})
@Produces({"application/json"})
public JSONString add(JSONString str) {
    String json = str.toJSONString();
    try {
        // 1. JSON → Map → AggVO（按单据类型自动转换）
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> map = mapper.readValue(json,
                new TypeReference<Map<String, Object>>() {});
        AggTXBillVO aggVo = (AggTXBillVO) transferBill("TX01", map);

        // 2. 补默认值（集团、操作员、NEW 状态、金额汇总）
        setDefaultValue(aggVo);

        // 3. 构建消息路由信息
        TXBillVO billVo = aggVo.getParentVO();
        FipMessageVO fipmessagevo = new FipMessageVO();
        fipmessagevo.setMessagetype(FipMessageVO.MESSAGETYPE_ADD);
        fipmessagevo.setMessageinfo(buildMessageInfo(billVo));
        fipmessagevo.setBillVO(aggVo);

        // 4. 走消息管道（触发完整事件链）
        FipMsgResultVO resultVO = getFipMessageService().sendMessage(fipmessagevo);
        return ResultMessageUtil.toJSON(resultVO.getRelations(), "保存成功");
    } catch (Exception e) {
        return ResultMessageUtil.exceptionToJSON(e);
    }
}
```

### setDefaultValue 模板

```java
private void setDefaultValue(AggTXBillVO aggVo) {
    TXBillVO billVo = aggVo.getParentVO();

    // 集团（未传则取当前上下文）
    if (billVo.getPk_group() == null) {
        billVo.setPk_group(InvocationInfoProxy.getInstance().getGroupId());
    }
    // 操作员
    if (billVo.getPk_operator() == null) {
        billVo.setPk_operator(InvocationInfoProxy.getInstance().getUserId());
    }

    billVo.setStatus(VOStatus.NEW);

    // 汇总子表金额到头的 billmoney
    TXBillItemVO[] itemVos = aggVo.getBodyVOs();
    if (itemVos != null) {
        UFDouble total = UFDouble.ZERO_DBL;
        for (TXBillItemVO itemVo : itemVos) {
            if (itemVo.getAmount() != null) {
                total = total.add(itemVo.getAmount());
            }
        }
        billVo.setBillmoney(total);
    }
}
```

### buildMessageInfo 模板

```java
private FipRelationInfoVO buildMessageInfo(TXBillVO billVo) {
    FipRelationInfoVO messageinfo = new FipRelationInfoVO();
    messageinfo.setPk_group(billVo.getPk_group());
    messageinfo.setPk_org(billVo.getPk_org());
    BilltypeVO billtype = FipBaseDataProxy.getBilltype(
            messageinfo.getPk_group(), billVo.getPk_billtypeid());
    messageinfo.setPk_billtype(billtype.getPk_billtypecode());
    messageinfo.setPk_system(billtype.getSystemcode());
    messageinfo.setBusidate(billVo.getBusidate());
    messageinfo.setPk_operator(billVo.getPk_operator());
    messageinfo.setFreedef1(billVo.getBillno());
    messageinfo.setFreedef2((String) billVo.getAttributeValue("billexplain"));
    messageinfo.setFreedef3(String.valueOf(billVo.getBillmoney()));
    return messageinfo;
}
```

### 删除（DELETE）

```java
@POST
@Path("delete")
@Consumes({"application/json"})
@Produces({"application/json"})
public JSONString delete(JSONString str) {
    String json = str.toJSONString();
    try {
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> map = mapper.readValue(json,
                new TypeReference<Map<String, Object>>() {});
        AggTXBillVO aggVo = (AggTXBillVO) transferBill("TX01", map);

        // 1. 先查是否存在
        BaseDAO baseDAO = new BaseDAO();
        Collection c = baseDAO.retrieveByClause(AggTXBillVO.class,
                "pk_txbill = '" + aggVo.getParentVO().getPrimaryKey() + "'",
                new String[]{"pk_txbill"});
        List<AggTXBillVO> list = new ArrayList(c);
        if (list == null || list.size() == 0) {
            return ResultMessageUtil.exceptionToJSON(
                    new BusinessException("要删除的数据不存在"));
        }

        // 2. 走消息管道删除
        TXBillVO billVo = aggVo.getParentVO();
        FipMessageVO fipmessagevo = new FipMessageVO();
        fipmessagevo.setMessagetype(FipMessageVO.MESSAGETYPE_DEL);
        fipmessagevo.setMessageinfo(buildMessageInfo(billVo));
        fipmessagevo.setBillVO(aggVo);
        getFipMessageService().sendMessage(fipmessagevo);
        return ResultMessageUtil.toJSON(null, "删除成功");
    } catch (Exception e) {
        return ResultMessageUtil.exceptionToJSON(e);
    }
}
```

### 延迟加载 Service

```java
private IFipMessageService fipMessageService = null;

private IFipMessageService getFipMessageService() {
    if (this.fipMessageService == null) {
        this.fipMessageService = NCLocator.getInstance().lookup(IFipMessageService.class);
    }
    return this.fipMessageService;
}
```

## 核心链路图

```
HTTP JSON 入参
    │
    ▼
transferBill("TX01", map)    ─── 资产包方法，按单据类型自动 JSON → AggTXBillVO
    │
    ├── setDefaultValue()     ─── 补集团、操作员、状态、金额汇总
    │
    ├── buildMessageInfo()    ─── 构建 FipRelationInfoVO（路由信息）
    │
    ▼
FipMessageVO                 ─── 封装：消息类型(ADD/DEL) + 路由信息 + 单据数据
    │
    ▼
IFipMessageService.sendMessage()  ─── 走消息管道
    │
    └── 触发完整业务链：
        ├── 数据校验
        ├── 业务插件
        ├── 保存事件
        ├── 下游数据生成
        └── 返回 FipMsgResultVO（含关联关系）
```

## 与标准 OpenAPI 的差异对比

| | 标准 OpenAPI（openapi-dev.md） | 资产包模式（本文档） |
|---|---|---|
| **基类** | `AbstractNCCRestResource` | `AbstractRestResource` |
| **JSON→VO** | 手动 `JSON.parseObject()` + 逐字段 set | `transferBill(单据类型, map)` 自动转换 |
| **JSON 库** | fastjson (`com.alibaba.fastjson.JSON`) | Jackson (`com.fasterxml.jackson.databind.ObjectMapper`) |
| **持久化** | `MDPersistenceService` 直接写库 | `IFipMessageService.sendMessage()` 走消息管道 |
| **事件触发** | ❌ 裸写库不触发 | ✅ 走完整事件链 |
| **适用单据** | 简单实体表（无复杂业务规则） | 外部接口单（FIP TXBill 体系） |
| **修改方法** | 有 update | **无**（外部接口单不支持修改） |
| **模块名** | 项目自定义（如 `st`） | `fip2207` |
| **查询存在** | `MDPersistenceService.queryBillVOByPrimaryKey()` | `BaseDAO.retrieveByClause()` |

## 关键约束

1. **不支持修改**：外部接口单只有新增和删除，没有 update 方法
2. **必须走 sendMessage**：不能直接用 `MDPersistenceService`、`BaseDAO` 等裸写库
3. **TX01 是单据类型编码**：`transferBill("TX01", map)` 中的 `"TX01"` 是外部接口单在系统中的单据类型编码，不同项目可能不同
4. **Jackson 不是 fastjson**：资产包统一用 Jackson 做 JSON 解析，不要混用
5. **FipRelationInfoVO 关键字段**：`pk_group`、`pk_org`、`pk_billtype`、`pk_system`、`pk_operator` 是消息路由的必填信息
