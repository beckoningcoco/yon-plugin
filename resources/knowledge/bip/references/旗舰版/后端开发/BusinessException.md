# BusinessException 异常处理

**类路径**: `com.yonyou.iuap.BusinessException`

## 概述

`BusinessException` 是用友BIP提供的企业级业务异常类，继承自 `BaseException`，属于非受查异常（RuntimeException）。

## 核心特性

| 特性 | 说明 |
|------|------|
| 错误码支持 | 支持 `displayCode` 展示错误码 |
| TraceId追踪 | 自动从MDC获取traceId注入 |
| 异常级别 | 支持设置异常级别（level） |
| 详细消息 | 支持设置详细错误信息（detailMsg） |
| 确认ID列表 | 支持二次确认场景 |

## 构造方法

### 基础构造

```java
// 基础构造：展示错误码 + 错误消息
new BusinessException(String displayCode, String message)

// 带原始异常
new BusinessException(String displayCode, String message, Throwable cause)

// 带详细消息
new BusinessException(String displayCode, String message, Throwable cause, String detailMsg)
```

### 带异常级别

```java
new BusinessException(String displayCode, String message, Throwable cause,
    String detailMsg, Integer level)
```

### 带确认ID列表

```java
new BusinessException(String displayCode, String message, Throwable cause,
    String detailMsg, Integer level, List<String> confirmIds)
```

## 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `displayCode` | String | 展示错误码 |
| `message` | String | 错误消息 |
| `cause` | Throwable | 原始异常 |
| `detailMsg` | String | 详细错误信息 |
| `level` | Integer | 异常级别（0-普通，1-警告，2-错误） |
| `confirmIds` | List<String> | 确认ID列表 |

## 异常编码规范

### 格式

```
领域前缀-6位序号
```

### 序号含义

| 序号范围 | 类别 | 说明 |
|----------|------|------|
| 0xxxxx | 公共类 | DBException |
| 1xxxxx | 公共类 | FrameworkException |
| 2xxxxx | 公共类 | MiddlewareException |
| 3xxxxx | 公共类 | NetworkException |
| 5xxxxx-7xxxxx | 业务类 | 不重试 |
| 8xxxxx | 业务类 | 可重试 |
| 9xxxxx | 业务类 | 预留 |

## 使用示例

### 基础异常

```java
throw new BusinessException("BIZ-500001", "业务处理失败");
```

### 带详细消息

```java
throw new BusinessException("BIZ-500001", "订单处理失败",
    originalException, "订单号：" + orderNo);
```

### 带异常级别

```java
// 警告级别
throw new BusinessException("BIZ-500001", "数据校验警告",
    null, "部分字段为空", 1);

// 错误级别
throw new BusinessException("BIZ-500002", "业务处理失败",
    originalException, "数据库连接超时", 2);
```

### 带确认ID列表

```java
List<String> confirmIds = Arrays.asList("confirm_001", "confirm_002");
throw new BusinessException("BIZ-700001", "存在关联数据，是否继续操作？",
    null, "该操作将影响3条关联数据", 1, confirmIds);
```

### 异常处理

```java
@Service
public class OrderService {

    public void processOrder(String orderNo) {
        try {
            validateOrder(orderNo);
            processPayment(orderNo);
        } catch (SQLException e) {
            throw new BusinessException("BIZ-000001",
                "订单处理失败，数据库操作异常", e, "SQL执行异常");
        } catch (BusinessException e) {
            throw e;  // 直接抛出
        } catch (Exception e) {
            throw new BusinessException("BIZ-999999",
                "订单处理发生未知错误", e, "未知错误");
        }
    }

    private void validateOrder(String orderNo) {
        if (StringUtils.isBlank(orderNo)) {
            throw new BusinessException("BIZ-400001", "订单号不能为空");
        }
    }
}
```

## 最佳实践

### 异常使用原则

1. 所有领域业务异常需继承 `BusinessException`
2. 必须定义明确的异常编码
3. 异常名称必须以 `Exception` 结尾
4. 必须包含异常链（cause）
5. 错误提示需支持多语
6. 提供有意义的详细消息

### 异常处理原则

1. 区分异常类型，避免直接抛出 `RuntimeException`
2. 使用有业务含义的自定义异常
3. 异常描述要说明发生原因
4. 精确捕获，最一般的异常放最后
5. 资源使用要加 finally 释放
6. 不要吃掉可能导致业务问题的异常

## 注意事项

1. `BusinessException` 继承自 `RuntimeException`，属于非受查异常
2. traceId 从MDC自动获取
3. 错误信息返回前端时按实际异常编码返回
4. 异常不要用于流程控制
5. try块放到事务代码中时，注意手动回滚事务