# 定时任务/任务调度开发规范

> **本文档是用友 BIP 平台定时任务/任务调度的完整开发规范**
> **适用场景**：BIP 预警调度系统触发的**异步任务**开发
> **⚠️ 核心原则**：
> 1. **必须使用异步模式** — 禁止同步阻塞执行
> 2. **必须使用 BIP 产品框架线程池** — `YmsExecutors.getYmsExecutor()`
> 3. **定时任务 = 任务调度** — 两者是同一概念，本文档统一使用"任务调度"术语

---

## 目录

1. [概述](#1-概述)
2. [平台配置](#2-平台配置)
3. [异步执行核心规范](#3-异步执行核心规范)
4. [必须遵循的代码模板](#4-必须遵循的代码模板)
5. [错误写法反例](#5-错误写法反例)
6. [完整示例代码](#6-完整示例代码)
7. [检查清单](#7-检查清单)

---

## 1. 概述

### 1.1 任务调度执行流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BIP 任务调度异步执行流程                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: 平台调度触发（定时规则/Cron/事件）                              │
│  ├── BIP 预警调度系统根据配置触发                                        │
│  └── HTTP POST /dispatch/{module}/{action}                              │
│                                                                         │
│  Step 2: Controller 接收（同步入口，异步执行）                            │
│  ├── 从 request header 获取 logId                                       │
│  ├── 提交异步任务到 BIP 线程池                                           │
│  └── 立即返回 {"asynchronized": "true"} ← 必须立即返回，不能阻塞！        │
│                                                                         │
│  Step 3: 异步执行（后台线程，不阻塞调度平台）                             │
│  ├── YmsExecutors.getYmsExecutor() 获取线程池                          │
│  ├── ymsExecutor.execute(() -> { 业务逻辑 }) 异步执行                  │
│  └── 在后台线程中执行业务逻辑                                            │
│                                                                         │
│  Step 4: 回调平台                                                       │
│  ├── 执行成功: callbackPlatform(logId, 1)                               │
│  ├── 执行失败: callbackPlatform(logId, 0)                               │
│  └── 更新任务状态到 BIP 调度平台                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心要求（必须遵守）

| 要求项 | 规范 | 重要性 |
|--------|------|--------|
| **⚠️ 异步模式** | **必须使用异步执行，禁止同步阻塞！** | ⚠️ **强制** |
| **线程池** | 必须使用 `YmsExecutors.getYmsExecutor()` | ⚠️ **强制** |
| **回调平台** | 执行完成后必须回调调度平台 | ⚠️ **强制** |
| **返回标志** | 入口方法必须返回 `{"asynchronized": "true"}` | ⚠️ **强制** |
| **状态码** | 成功=`1`，失败=`0` | ⚠️ **强制** |

---

## 2. 平台配置

### 2.1 配置步骤

| 步骤 | 操作路径 | 内容 |
|------|---------|------|
| **Step 1** | 系统管理 > 预警调度 > 调度类型 | 创建任务描述信息，配置接口调用地址 |
| **Step 2** | 系统管理 > 预警调度 > 调度任务 | 引用调度类型，配置定时规则或消息配置 |

### 2.2 配置说明

- **调度类型**：定义任务的描述信息和调用接口地址
- **调度任务**：引用调度类型，配置具体的执行时间规则（如 Cron 表达式）
- **条件执行**：如需条件执行，在类型设置处配置条件

---

## 3. 异步执行核心规范

### 3.1 线程池规范（⚠️ 强制要求）

> **BIP 平台线程池必须使用 `YmsExecutors.getYmsExecutor()`**
> **禁止使用任何开源线程池实现！**

#### 为什么必须使用 BIP 线程池？

1. **上下文传递**：BIP 线程池经过特殊优化，能够正确传递上下文信息（logId、tenantId 等）
2. **调度平台集成**：与 BIP 预警调度系统深度集成，能够正确回调
3. **监控追踪**：与平台任务监控系统集成，支持日志追踪

#### ❌ 禁止使用的线程池写法

```java
// ❌ 禁止使用 Executors 工具类
Executors.newFixedThreadPool(n)
Executors.newCachedThreadPool()
Executors.newScheduledThreadPool(n)
Executors.newSingleThreadExecutor()
Executors.newWorkStealingPool()

// ❌ 禁止使用 ThreadPoolExecutor
new ThreadPoolExecutor(...)

// ❌ 禁止直接使用 Thread
new Thread().start()
new Thread(runnable).start()

// ❌ 禁止使用 CompletableFuture
CompletableFuture.runAsync(...)
CompletableFuture.supplyAsync(...)

// ❌ 禁止使用 Spring @Async
@Async
public void asyncMethod() { ... }
```

#### ✅ 正确写法
使用线程池异步处理，使用RobotExecutors.runAs()切换上下文
```java
@RequestMapping("/yourAsyncApi")
public Object asyncMethod(HttpServletRequest request, @RequestBody JSONObject paras) {
    String logId = request.getHeader("logId");
    String tenantId = request.getHeader("tenantId"); // 从请求头获取租户信息
    JSONObject retJson = new JSONObject();

    // 使用YMS线程池执行异步任务
    ymsExecutor.execute(RobotExecutors.runAs(tenantId, () -> {
        try {
            // 异步业务逻辑，例如处理大量数据
            // doHeavyWork(paras);
            // 执行成功后回调平台
            callbackPlatform(logId, "1", "执行成功");
        } catch (Exception e) {
            log.error("异步任务执行异常", e);
            callbackPlatform(logId, "0", e.getMessage());
        }
    }));

    retJson.put("asynchronized", true);
    retJson.put("status", "1");
    retJson.put("data", "异步任务已提交");
    return retJson;
}
```

---

## 4. 必须遵循的代码模板

> **⚠️ 以下代码模板必须严格遵循，禁止擅自修改关键代码结构！**

### 4.1 必须的导入语句

```java
// ✅ 正确的导入
import com.alibaba.fastjson.JSONObject;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.PropertyUtil;
import com.yonyou.iuap.bd.customerdoc.utils.AuthHttpClientUtils;
import iuap.yms.thread.api.YmsExecutors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
```

### 4.2 必须的成员变量（final + @Autowired组合）

```java
/** BIP预警调度回调地址常量 */
private static final String CALLBACK_URL = "/warning/warning/async/updateTaskLog";

/** 使用BIP产品框架线程池（必须使用final） */
private final ExecutorService ymsExecutor = YmsExecutors.getYmsExecutor();

@Autowired
private AuthHttpClientUtils authHttpClientUtils;
```

### 4.3 必须的回调方法实现

```java
/**
 * 回调平台更新任务状态
 *
 * ⚠️ 必须使用 PropertyUtil.getPropertyByKey 获取域名
 * ⚠️ 必须使用 AuthHttpClientUtils.execPost 发送请求
 * ⚠️ 禁止使用 RestTemplate 发送回调
 * ⚠️ 禁止使用 @Value 注入回调域名
 * ⚠️ 禁止硬编码回调URL
 */
private void callbackPlatform(String logId, int status, String message) {
    if (logId == null || logId.isEmpty()) {
        logger.warn("logId为空，跳过回调");
        return;
    }

    JSONObject param = new JSONObject();
    param.put("status", status);    // 1=成功, 0=失败
    param.put("id", logId);
    param.put("msg", message);
    param.put("content", message);

    try {
        // ✅ 必须使用 PropertyUtil.getPropertyByKey 获取域名
        String domain = PropertyUtil.getPropertyByKey("domain.iuap-apcom-coderule");
        String url = domain + CALLBACK_URL;

        // ✅ 必须使用 AuthHttpClientUtils.execPost 发送回调
        authHttpClientUtils.execPost(url, null, null, param.toString());

        logger.info("回调成功, logId={}, status={}, message={}", logId, status, message);
    } catch (Exception e) {
        logger.error("回调失败, logId={}", logId, e);
    }
}
```

### 4.4 禁止的写法汇总

| 禁止项 | 错误写法 | 正确写法 |
|--------|---------|---------|
| 禁止使用RestTemplate发送回调 | `restTemplate.postForEntity(...)` | `authHttpClientUtils.execPost(...)` |
| 禁止使用@Value注入回调域名 | `@Value("${callback.domain}")` | `PropertyUtil.getPropertyByKey(...)` |
| 禁止硬编码回调URL | `"http://xxx.com/..."` | `domain + CALLBACK_URL` |
| 禁止使用new RestTemplate() | `new RestTemplate()` | 使用注入的authHttpClientUtils |
| 禁止省略回调 | 无回调代码 | 必须调用callbackPlatform |

---

## 5. 错误写法反例

### 5.1 ❌ 错误：同步执行（阻塞）— ⚠️ 绝对禁止！

```java
// ❌ 绝对禁止：同步执行，会阻塞调度平台！
@RequestMapping("/execute")
public Object dispatch(HttpServletRequest request) {
    // 直接同步执行，任务耗时长时会阻塞整个调度平台！
    xxxService.execute();  // ❌ 可能执行 10 分钟甚至更久！

    Map<String, Object> retMap = new HashMap<>();
    retMap.put("result", "success");
    return retMap;  // ❌ 同步返回，调度平台会等待直到超时
}
```

### 5.2 ❌ 错误：使用开源线程池

```java
// ❌ 错误写法：使用开源线程池
private ExecutorService executor = Executors.newFixedThreadPool(10);

@RequestMapping("/execute")
public Object dispatch(HttpServletRequest request) {
    executor.execute(() -> {
        xxxService.execute();  // 业务逻辑
        callbackPlatform(logId, 1);  // 回调
    });

    Map<String, Object> retMap = new HashMap<>();
    retMap.put("asynchronized", "true");
    return retMap;
}
```

### 5.3 ❌ 错误：使用RestTemplate发送回调

```java
// ❌ 错误写法：使用RestTemplate发送回调
private final RestTemplate restTemplate = new RestTemplate();

private void callbackPlatform(String logId, int status) {
    String url = "https://xxx.com" + "/warning/warning/async/updateTaskLog";
    restTemplate.postForEntity(url, entity, String.class);  // ❌ 禁止！
}
```

### 5.4 ❌ 错误：缺少回调

```java
// ❌ 错误写法：没有回调平台
@RequestMapping("/execute")
public Object dispatch(HttpServletRequest request) {
    ymsExecutor.execute(() -> {
        xxxService.execute();
        // ❌ 没有回调
    });

    Map<String, Object> retMap = new HashMap<>();
    retMap.put("asynchronized", "true");
    return retMap;
}
```

### 5.5 ❌ 错误：返回值缺少异步标志

```java
// ❌ 错误写法：返回值不是异步标志
@RequestMapping("/execute")
public Object dispatch(HttpServletRequest request) {
    ymsExecutor.execute(() -> {
        xxxService.execute();
        callbackPlatform(logId, 1);
    });

    return "success";  // ❌ 返回值不是 {"asynchronized": "true"}
}
```

---

## 6. 完整示例代码

> **⚠️ 以下代码为标准模板，生成调度任务代码时必须以此为基准！**

```java
package com.yonyou.ypd.xxx.dispatch;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.PropertyUtil;
import com.yonyou.iuap.bd.customerdoc.utils.AuthHttpClientUtils;
import iuap.yms.thread.api.YmsExecutors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;

/**
 * 三方数据拉取定时任务
 *
 * 功能：从第三方系统拉取数据，保存到 BIP
 * 触发：BIP 预警调度系统定时触发
 * 规范：异步执行 + BIP线程池 + 回调平台
 */
@RestController
@RequestMapping("/dispatch/thirdparty")
public class ThirdPartyPullDispatchController {

    private static final Logger logger = LoggerFactory.getLogger(ThirdPartyPullDispatchController.class);

    /** BIP预警调度回调地址 */
    private static final String CALLBACK_URL = "/warning/warning/async/updateTaskLog";

    @Autowired
    private ThirdPartyPullService thirdPartyPullService;

    @Autowired
    private AuthHttpClientUtils authHttpClientUtils;

    /** 使用BIP产品框架线程池 */
    private final ExecutorService ymsExecutor = YmsExecutors.getYmsExecutor();

    /**
     * 定时任务入口
     *
     * 触发方式：BIP预警调度系统HTTP POST调用
     */
    @PostMapping("/pull")
    public Object dispatch(HttpServletRequest request,
            @RequestBody(required = false) Map<String, Object> paramMap) {

        // 从request header获取日志ID
        String logId = Optional.ofNullable(request.getHeader("logId")).orElse("");
        String tenantId = Optional.ofNullable(request.getHeader("tenantId")).orElse("");

        logger.info("【三方数据拉取】任务开始, logId={}, tenantId={}", logId, tenantId);

        Map<String, Object> retMap = new HashMap<>();

        // 使用BIP线程池异步执行
        ymsExecutor.execute(() -> {
            try {
                // 执行业务逻辑：拉取三方数据，保存到 BIP
                int count = thirdPartyPullService.pullAndSave(paramMap);

                // 执行成功后回调平台
                if (count >= 0) {
                    callbackPlatform(logId, 1, "成功拉取 " + count + " 条数据");
                    logger.info("【三方数据拉取】任务成功, logId={}, count={}", logId, count);
                } else {
                    callbackPlatform(logId, 0, "业务处理失败");
                    logger.warn("【三方数据拉取】任务业务处理失败, logId={}", logId);
                }
            } catch (Exception e) {
                // 执行失败后回调平台
                callbackPlatform(logId, 0, "执行异常: " + e.getMessage());
                logger.error("【三方数据拉取】任务异常, logId={}", logId, e);
            }
        });

        // 立即返回异步标志
        retMap.put("asynchronized", "true");
        return retMap;
    }

    /**
     * 回调平台更新任务状态
     *
     * @param logId   任务日志ID
     * @param status  执行状态（1=成功, 0=失败）
     * @param message 结果描述
     */
    private void callbackPlatform(String logId, int status, String message) {
        if (logId == null || logId.isEmpty()) {
            logger.warn("【三方数据拉取】logId为空，跳过回调");
            return;
        }

        JSONObject param = new JSONObject();
        param.put("status", status);
        param.put("id", logId);
        param.put("msg", message);
        param.put("content", message);

        try {
            // 必须使用PropertyUtil.getPropertyByKey获取域名
            String domain = PropertyUtil.getPropertyByKey("domain.iuap-apcom-coderule");
            String url = domain + CALLBACK_URL;

            // 必须使用AuthHttpClientUtils发送回调
            authHttpClientUtils.execPost(url, null, null, param.toString());

            logger.info("【三方数据拉取】回调成功, logId={}, status={}, message={}", logId, status, message);
        } catch (Exception e) {
            logger.error("【三方数据拉取】回调失败, logId={}", logId, e);
        }
    }
}
```

---

## 7. 检查清单

### 7.1 代码生成检查（⚠️ 生成代码时必须逐项验证）

| 检查项 | 检查内容 | 是否通过 |
|--------|---------|---------|
| 线程池 | 使用了 `YmsExecutors.getYmsExecutor()` | ☐ |
| 线程池变量 | 使用了 `final ExecutorService ymsExecutor` 成员变量 | ☐ |
| Header获取 | 从 request header 获取了 `logId` 和 `tenantId` | ☐ |
| 回调调用 | 执行完成后调用了 `callbackPlatform(logId, status, message)` | ☐ |
| 返回标志 | 返回了 `{"asynchronized": "true"}` | ☐ |
| 回调域名 | callbackPlatform 使用了 `PropertyUtil.getPropertyByKey` 获取域名 | ☐ |
| 回调工具 | callbackPlatform 使用了 `AuthHttpClientUtils.execPost` 发送请求 | ☐ |
| 回调地址 | 使用了 `CALLBACK_URL` 常量拼接完整URL | ☐ |
| 异常处理 | 有完整的 try-catch 异常处理 | ☐ |
| 日志记录 | 有任务开始、执行成功、执行失败的日志 | ☐ |
| 导入语句 | 导入了必要的类（见4.1节） | ☐ |

### 7.2 禁止项检查（⚠️ 绝对禁止以下写法）

| 禁止项 | 错误示例 | 正确示例 |
|--------|---------|---------|
| ☐ 禁止使用RestTemplate发送回调 | `restTemplate.postForEntity(...)` | `authHttpClientUtils.execPost(...)` |
| ☐ 禁止使用@Value注入回调域名 | `@Value("${callback.url}")` | `PropertyUtil.getPropertyByKey(...)` |
| ☐ 禁止硬编码回调URL | `"http://xxx.com/..."` | `domain + CALLBACK_URL` |
| ☐ 禁止使用new RestTemplate() | `new RestTemplate()` | 使用注入的authHttpClientUtils |
| ☐ 禁止省略回调 | 无callbackPlatform调用 | 必须调用 |
| ☐ 禁止同步执行 | 直接调用service方法 | 使用ymsExecutor.execute() |
| ☐ 禁止使用开源线程池 | `Executors.newFixedThreadPool()` | `YmsExecutors.getYmsExecutor()` |
| ☐ 禁止返回值缺少异步标志 | `return "success"` | `retMap.put("asynchronized", "true")` |

### 7.3 状态码规范

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| `1` | 成功 | 业务逻辑正常执行完成 |
| `0` | 失败 | 业务异常或执行出错 |

---

## 附录：相关依赖

### 导入包

```java
import com.alibaba.fastjson.JSONObject;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.PropertyUtil;
import com.yonyou.iuap.bd.customerdoc.utils.AuthHttpClientUtils;
import iuap.yms.thread.api.YmsExecutors;
import java.util.concurrent.ExecutorService;
```

> **本文档版本**：v2.0（强化版）
> **最后更新**：2026-05
> **维护责任**：iuap-c-server-codegen skill
