# 事件监听开发指南

## 核心概念

- **事件**：业务对象状态变化
- **事件源（sourceId）**：事件类型的分组标识
- **事件类型（eventType）**：具体业务动作
- **订阅（监听）**：注册回调接口处理事件

## ⚠️ 前置步骤：查询事件信息（必须先执行）

> **重要**：在实现事件监听之前，必须先通过 `事件查询（见 events/ 目录下事件订阅配置指南）` 技能查询事件编码和事件报文。
>
> **禁止臆想事件编码和报文结构！**

### 查询步骤

```bash
# Step 1: 查询事件类型列表，获取 eventCode
python scripts/event_query.py --query "待办"

# 返回示例：
# eventId: 1814933938926448649
# eventCode: TODO_CENTER_ADD_TODO
# eventName: 待办新增事件

# Step 2: 查询事件详情，获取报文结构
python scripts/event_query.py --detail 1814933938926448649 --json

# 返回事件报文示例：
# {
#     "model": {
#         "id": "xxx",
#         "code": "xxx",
#         ...
#     }
# }
```

### 返回信息说明

| 字段 | 说明 | 用途 |
|------|------|------|
| eventId | 事件ID | 查询详情时使用 |
| eventCode | 事件编码 | 在事件中心注册时使用 |
| eventName | 事件名称 | 业务标识 |
| example | 事件报文 | 解析 userObject 字段结构 |

## 开发步骤

1. **查询事件信息**（调用 事件查询（见 events/ 目录下事件订阅配置指南））
2. 确定事件源与事件类型
3. 在事件中心注册监听
4. 在业务系统实现监听接口
5. 验证与运维

## REST监听实现（最常用）

### REST监听接口

```java
@ResponseBody
@RequestMapping(value = "/event/demoListener", method = RequestMethod.POST)
public Object onEvent(HttpServletRequest request) {
    // 1. 获取事件入参
    String sourceID = request.getParameter("sourceID");
    String eventType = request.getParameter("eventType");
    String userObject = request.getParameter("userObject");
    String queueName = request.getParameter("queueName");
    String tenantCode = request.getParameter("tenantCode");

    // MDD框架订阅额外参数：
    // String tenantId = request.getParameter("tenantId");
    // String id = request.getParameter("id");
    // String yhtAccessToken = request.getParameter("yht_access_token");

    // 2. 幂等处理（关键！）
    if (alreadyProcessed(sourceID, eventType, userObject)) {
        Map<String, String> response = new HashMap<>();
        response.put("success", "true");
        response.put("msg", "repeat request, ignore");
        return response;
    }

    try {
        // 3. 业务处理
        handleBusiness(sourceID, eventType, userObject, tenantCode);

        // 4. 成功返回
        Map<String, String> response = new HashMap<>();
        response.put("success", "true");
        return response;
    } catch (Exception e) {
        // 5. 失败返回
        Map<String, String> response = new HashMap<>();
        response.put("success", "false");
        response.put("msg", e.getMessage());
        return response;
    }
}
```

## 返回值规范

| 返回 | 含义 |
|------|------|
| `{"success":"true"}` | 成功 |
| `{"success":"false"}` | 失败，事件中心会重试 |
| 已处理返回 `{"success":"true"}` | 幂等处理 |

## RPC监听实现

```java
public class DemoRpcEventReceiveServiceImpl implements IEventReceiveService {

    @Override
    public String onEvent(BusinessEvent businessEvent, String queueName) {
        String sourceId = businessEvent.getSourceId();
        String eventType = businessEvent.getEventType();
        Object userObject = businessEvent.getUserObject();

        // 幂等处理
        if (alreadyProcessed(businessEvent)) {
            return StringResponseUtil.success("repeat request, ignore");
        }

        try {
            handleBusiness(businessEvent, queueName);
            return StringResponseUtil.success("ok");
        } catch (Exception e) {
            return StringResponseUtil.fail(e.getMessage());
        }
    }
}
```

## RPC服务声明

```java
@Configuration
public class RpcConfig {

    @Bean
    public RemoteCallInfo initEventReceiveService() {
        RemoteCallInfo rci = new RemoteCallInfo();
        rci.setClassName(IEventReceiveService.class.getName());
        rci.setAppCode("iuap-event-server");
        rci.setNameSpace("namespace值");
        RemoteCallInfoManagerService.regRemoteCall(rci);
        return rci;
    }
}
```

## 监听注册关键字段

| 字段 | 说明 |
|------|------|
| nodeCode | 节点编码，同一事件类型下必须唯一 |
| receiveStrategy | 重试策略：默认/循环/禁止 |
| nodeConsumer | 调用方式：REST/RPC/token/协同 |
| listenerUrl | REST：直接写URL；RPC：填写接口名 |
| rateLimit | 限流值（秒） |
| async | 是否异步请求 |
| needSort | 是否有序 |

## 异步回调

监听方业务异步处理，完成后回调事件中心：

```
POST /event-pub/pub/rest/asyncCallBack
Content-Type: application/json

{
  "success": true,
  "msg": "ok",
  "needRetry": false,
  "eventId": "xxxx-xxxx-xxxx"
}
```

## 拉取模式

主动调用拉取事件：

```
POST /event-center/pull/pullMessage
Content-Type: application/json

{
  "size": 10,
  "sourceId": "事件源id",
  "eventTypeCode": "事件类型编码",
  "nodeCode": "监听节点编码"
}
```

## 常见错误

| 错误 | 修复 |
|------|------|
| 幂等未实现，重复执行 | 以事件ID或业务主键做幂等键 |
| 已处理返回失败 | 已处理返回 `success: "true"` |
| REST返回值不规范 | `success` 必须为字符串 `"true"` |
| 拉取模式调用过于频繁 | 合理设置定时任务频率 |