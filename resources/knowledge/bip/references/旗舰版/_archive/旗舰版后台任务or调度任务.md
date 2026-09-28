---
name: 旗舰版后台任务/调度任务
description: >
  用友 BIP 客开技能。当用户需要开发后台任务或调度任务（如定时生成确认单），涉及新建调度类型、编写 Controller、回调平台更新任务状态时，参考该文档内容。
---

# 旗舰版后台任务or调度任务

```
开发后台任务：当【出租合同】表头"是否自动确认收入"为是时，检查下后台任务执行时系统日期与【出租合同】单据<摊销>页签中"结束日期"为同一月、并且当前月没有【出租收入确认单】生成时，后台任务自动生成执行月的【出租收入确认单】；

开发方案：新增调度任务，调用后端controller RentalConfirmController，执行逻辑。
```

## 流程如下

### 新建调度类型

![image-20250722174508907](旗舰版后台任务or调度任务/image-20250722174508907.png)

![image-20250722174539150](旗舰版后台任务or调度任务/image-20250722174539150.png)

接口属性，对应的是后端的一个controller类，需要自己开发

### 新建后台任务

![image-20250722174746771](旗舰版后台任务or调度任务/image-20250722174746771.png)

![image-20250722174831443](旗舰版后台任务or调度任务/image-20250722174831443.png)

### 编写后端controller

```java
package com.yonyou.ucf.mdf.contract.controller;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.iuap.bd.org.privateutil.AuthHttpClientUtils;
import com.yonyou.ucf.mdf.contract.service.IRentalConfirmTaskService;
import com.yonyou.ucf.util.PropertyUtil;
import iuap.yms.thread.api.YmsExecutors;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/rentalConfirm")
public class RentalConfirmController {
    private ExecutorService ymsExecutor = YmsExecutors.getYmsExecutor();

    @Resource
    private IRentalConfirmTaskService rentalConfirmTaskService;

    @RequestMapping("/task/addConfirm")
    public Object addConfirm(HttpServletRequest request, @RequestBody(required = false) Map<String, Object> paramMap) {
        String logId = request.getHeader("logId");
        String execDate = paramMap == null ? null : (String) paramMap.get("execDate");
        if (StringUtils.isBlank(execDate)) {
            int timezone = 8;
            int offset_GMT = new Date().getTimezoneOffset();
            long nowDate = new Date().getTime();
            Date date = new Date(nowDate + offset_GMT * 60 * 1000 + timezone * 60 * 60 * 1000);
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            execDate = sdf.format(date);
        }

        String finalExecDate = execDate;
        ymsExecutor.execute(() -> {
            try {
                rentalConfirmTaskService.addConfirm(finalExecDate);
                callbackPlatform(logId, 1, "执行成功");
            } catch (Exception e) {
                log.error("RentalConfirmController.addConfirm 异常: ", e);
                String stackTrace = Arrays.stream(e.getStackTrace())
                        .map(StackTraceElement::toString)
                        .collect(Collectors.joining("\n"));
                callbackPlatform(logId, 0, "执行日期参数："+ finalExecDate + "\r" + e.getMessage()+" \r\n " + stackTrace);
            }
        });
        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("id", logId);
        resultMap.put("title", "生成出租收入确认单");
        resultMap.put("asynchronized", "true");
        return resultMap;
    }

    private void callbackPlatform(String logId, int status, String msg) {
        // 回调调度任务
        JSONObject param = new JSONObject();
        param.put("status", status);
        param.put("id", logId);
        try {
            param.put("content", msg);
            String url = PropertyUtil.getPropertyByKey("domain.iuap-apcom-coderule") + "/warning/warning/async/updateTaskLog";
            AuthHttpClientUtils.execPost(url, null, null, param.toString());
        } catch (Exception e) {
            log.error("回调平台，更改任务状态异常:{}", e.getMessage());
        }
    }
}
```

### AuthHttpClientUtils 实现（二选一）

#### 方案一：简化版（无外部依赖，仅 JDK HttpURLConnection）

```java
package com.yonyou.ucf.mdf.xxx.utils;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class AuthHttpClientUtils {

    private static final int CONNECT_TIMEOUT = 1000 * 30;
    private static final int READ_TIMEOUT = 1000 * 30;

    /**
     * 发送 POST 请求
     */
    public String execPost(String url, Map<String, String> queryParam,
                           Map<String, String> header, String jsonString) {
        HttpURLConnection connection = null;
        try {
            String fullUrl = url;
            if (queryParam != null && !queryParam.isEmpty()) {
                StringBuilder sb = new StringBuilder(url);
                sb.append(url.contains("?") ? "&" : "?");
                for (Map.Entry<String, String> e : queryParam.entrySet()) {
                    sb.append(e.getKey()).append("=").append(e.getValue()).append("&");
                }
                fullUrl = sb.substring(0, sb.length() - 1);
            }

            URL requestUrl = new URL(fullUrl);
            connection = (HttpURLConnection) requestUrl.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT);
            connection.setReadTimeout(READ_TIMEOUT);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");

            if (header != null) {
                for (Map.Entry<String, String> e : header.entrySet()) {
                    connection.setRequestProperty(e.getKey(), e.getValue());
                }
            }

            if (jsonString != null && !jsonString.isEmpty()) {
                try (OutputStream os = connection.getOutputStream()) {
                    os.write(jsonString.getBytes("UTF-8"));
                    os.flush();
                }
            }

            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
            }
            return response.toString();

        } catch (Exception e) {
            throw new RuntimeException("HTTP POST 请求失败: " + url, e);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
```

#### 方案二：Apache HttpClient + AuthSDKClient（框架内使用，支持加签鉴权）

```java
package com.yonyou.iuap.bd.customerdoc.utils;

import com.yonyou.cloud.middleware.embed.proteus.client.utils.AuthSDKClient;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.CustomerDocDefProperties;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.CustomerDocDetTemplate;
import com.yonyou.cloud.middleware.embed.sdk.base.BaseDocRestException;
import org.apache.commons.collections4.MapUtils;
import org.apache.http.HttpEntity;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.net.URI;
import java.util.Map;

@Component
public class AuthHttpClientUtils {

    @Resource
    private CustomerDocDetTemplate customerDocDetTemplate;

    @Autowired
    private CustomerDocDefProperties customerDocDefProperties;

    /**
     * 发送 POST 请求（带 BIP AccessKey 鉴权签名）
     *
     * @param url         请求地址
     * @param queryParam  URL 查询参数（可为 null）
     * @param header      请求头（可为 null）
     * @param jsonString  JSON 请求体
     * @return 响应字符串
     */
    public String execPost(String url, Map<String, String> queryParam,
                           Map<String, String> header, String jsonString) throws BaseDocRestException {
        HttpPost post = new HttpPost();

        if (MapUtils.isNotEmpty(header)) {
            for (Map.Entry<String, String> headerMap : header.entrySet()) {
                post.addHeader(headerMap.getKey(), headerMap.getValue());
            }
        }
        post.setHeader("Content-Type", ContentType.APPLICATION_JSON.getMimeType());

        url = customerDocDetTemplate.buildQueryParam(url, queryParam);
        post.setURI(URI.create(url));

        HttpEntity entity = new StringEntity(jsonString, "UTF-8");
        post.setEntity(entity);

        AuthSDKClient client = new AuthSDKClient(
                customerDocDefProperties.getAccessKey(),
                customerDocDefProperties.getAccessSecret());
        HttpResult result = client.execute(post);
        return result.getResponseString();
    }
}
```

> **区别**：方案二使用 `AuthSDKClient` 自动加签，适用于调用需要 BIP OpenAPI 鉴权的接口。方案一纯 JDK 实现，无外部依赖，适用于回调调度平台等不需要签名的场景。
