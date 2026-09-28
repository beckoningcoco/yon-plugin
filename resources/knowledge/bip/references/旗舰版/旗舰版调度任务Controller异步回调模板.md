---
name: 旗舰版调度任务Controller异步回调模板
description: >
  BIP 旗舰版开发调度任务 Controller 的标准模板。包含 YmsExecutors 异步执行、
  平台回调 updateTaskLog、HttpRequestUtil 发请求的完整可编译代码。
  当用户需要开发新的调度任务 Controller 时，直接参考此模板。
---

# 旗舰版调度任务 Controller 异步回调模板

## 适用场景

- 在 YMS 控制台注册调度任务，需要编写后端 Controller 作为任务入口
- 任务执行耗时较长，需要异步执行防止超时
- 需要回调平台更新任务状态（成功/失败）

## 完整模板

```java
package com.yonyou.ucf.mdf.xxx.controller;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.ucf.mdf.ext.util.HttpRequestUtil;
import iuap.yms.thread.api.YmsExecutors;
import lombok.extern.slf4j.Slf4j;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;

import javax.servlet.http.HttpServletRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * XXX 调度任务 Controller
 *
 * @author xxx
 * @date 20xx/xx/xx
 */
@RestController
@Slf4j
@RequestMapping("/xxx")
public class MyTaskController {

    private Logger logger = LoggerFactory.getLogger(MyTaskController.class);

    private ExecutorService ymsExecutor = YmsExecutors.getYmsExecutor();

    @Autowired
    private IMyTaskService myTaskService;

    /**
     * 调度任务入口
     *
     * @param request 调度任务请求（含 logId header）
     * @param params  业务参数
     * @return {id, title, asynchronized: "true"}
     */
    @PostMapping("/executeTask")
    public Object executeTask(HttpServletRequest request, @RequestBody JSONObject params) {
        String logId = request.getHeader("logId");

        ymsExecutor.execute(() -> {
            try {
                // ========== 业务逻辑 ==========
                JSONObject result = myTaskService.doSomething(params);
                // =============================
                String msg = String.format("执行成功: %s", result.toJSONString());
                callbackPlatform(logId, 1, msg);
            } catch (Exception e) {
                logger.error("任务执行异常：" + e.getMessage(), e);
                String stackTrace = Arrays.stream(e.getStackTrace())
                        .map(StackTraceElement::toString)
                        .collect(Collectors.joining("\n"));
                callbackPlatform(logId, 0, "参数：" + params.toString()
                        + "\r\n" + e.getMessage() + " \r\n " + stackTrace);
            }
        });

        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("id", logId);
        resultMap.put("title", "XXX任务名称");
        resultMap.put("asynchronized", "true");
        return resultMap;
    }

    /**
     * 回调调度平台，更新任务执行状态
     *
     * @param logId  调度任务日志 ID（从 request header 获取）
     * @param status 1=成功, 0=失败
     * @param msg    执行结果描述
     */
    private void callbackPlatform(String logId, int status, String msg) {
        if (logId == null || logId.isEmpty()) {
            logger.error("logId 为空，跳过平台回调");
            return;
        }
        JSONObject param = new JSONObject();
        param.put("status", status);
        param.put("id", logId);
        try {
            param.put("content", msg);
            String url = System.getProperty("domain.iuap-apcom-coderule")
                    + "/warning/warning/async/updateTaskLog";
            HttpRequestUtil.doPost(url, null, param.toString());
        } catch (Exception e) {
            logger.error("回调平台，更改任务状态异常:{}", e.getMessage());
        }
    }
}
```

## 关键要点

| 要素 | 说明 |
|------|------|
| **异步执行** | `YmsExecutors.getYmsExecutor().execute(() -> {...})` |
| **logId 获取** | `request.getHeader("logId")` — 调度平台自动传入 |
| **立即返回** | 返回 `{id, title, asynchronized: "true"}`，格式固定 |
| **成功回调** | `callbackPlatform(logId, 1, "成功信息")` |
| **失败回调** | `callbackPlatform(logId, 0, "异常信息+堆栈")` |
| **回调地址** | `{domain.iuap-apcom-coderule}/warning/warning/async/updateTaskLog` |
| **HTTP 工具** | `HttpRequestUtil.doPost(url, null, jsonBody)` — 项目本地工具类 |
| **域名获取** | `System.getProperty("domain.iuap-apcom-coderule")` — 写死 key，不要用 `domain.url` 拼接 |

## 依赖

| 类 | 来源 | 说明 |
|----|------|------|
| `YmsExecutors` | `iuap.yms.thread.api` | YMS 平台线程池 |
| `HttpRequestUtil` | `com.yonyou.ucf.mdf.ext.util` | 项目本地 HTTP 工具（非平台类） |
| `System.getProperty("domain.iuap-apcom-coderule")` | JVM 属性 | YMS 框架注入 |

## 注意

- `HttpRequestUtil` 是**项目本地类**（`com.yonyou.ucf.mdf.ext.util`），不是 BIP 平台类。各项目可能放在不同包路径下，使用时确认路径。
- `domain.iuap-apcom-coderule` 是 BIP 平台标准域名 key，由 YMS 框架启动时注入，**不需要在 application.properties 中手动配置**。
- 回调平台接口 `/warning/warning/async/updateTaskLog` 是 BIP 平台标准接口，无需单独注册。
- `logId` 为空时跳过回调（兼容非调度任务直接 HTTP 调用的场景）。
