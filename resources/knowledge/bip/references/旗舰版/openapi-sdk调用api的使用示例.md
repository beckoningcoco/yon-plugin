---
name: openapi-sdk调用api的使用示例
description: >
  用友 BIP 客开技能。当用户需要从零搭建 Maven 工程，通过 openapi-sdk 依赖包调用 BIP 的 OpenAPI，包括 POM 依赖配置、独立 JAR 包引入、调用示例代码时，参考该文档内容。
---

# openapi-sdk调用api的使用示例

从零搭建 maven 工程，通过依赖包 openapi-sdk，调用 BIP 的 api 示例。

## POM 依赖

### SDK 核心依赖（必选）

```xml
<dependency>
    <groupId>com.yonyou.iuap</groupId>
    <artifactId>iuap-ip-openapi-sdk</artifactId>
    <version>8.2.100-RELEASE</version>
</dependency>
```

### 其他依赖

SDK 内部依赖 jackson，如果项目中没有需要手动引入；以下为独立工程从零搭建所需的完整依赖：

```xml
<dependencies>
    <dependency>
        <groupId>com.yonyou.iuap</groupId>
        <artifactId>iuap-ip-openapi-sdk</artifactId>
        <version>8.2.100-RELEASE</version>
    </dependency>
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
        <version>2.19.2</version>
    </dependency>
    <dependency>
        <groupId>org.apache.commons</groupId>
        <artifactId>commons-lang3</artifactId>
        <version>3.19.0</version>
    </dependency>
    <dependency>
        <groupId>commons-codec</groupId>
        <artifactId>commons-codec</artifactId>
        <version>1.19.0</version>
    </dependency>
    <dependency>
        <groupId>org.apache.httpcomponents</groupId>
        <artifactId>httpclient</artifactId>
        <version>4.5.13</version>
    </dependency>
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>1.7.36</version>
    </dependency>
</dependencies>
```

## 导包路径（注意，容易导错）

> **正确的包路径如下：**
> ```
> import com.yonyou.iuap.open.builder.OpenServiceBuilder;
> import com.yonyou.iuap.open.http.model.HttpResponse;
> import com.yonyou.iuap.open.invoke.InputParam;
> import com.yonyou.iuap.open.invoke.Invoke;
> ```
>
> **常见错误：** 网上流传的旧版本示例用的是 `com.yonyou.iuap.openapi.*` 包路径，新版已改为 `com.yonyou.iuap.open.*`，导入旧路径会导致编译错误。

## 独立的 JAR 包依赖（不使用 Maven 时的手动引入方式）

- **iuap-ip-openapi-sdk-8.2.jar** — 下载地址: [用友iuap开放平台](https://community.yonyou.com/iuap-ipaas-base/ucf-wh/console-fe/open-home/index.html#/sdk-center)
- **expiringmap-0.5.10.jar** — 下载地址: [Maven Central](https://repo1.maven.org/maven2/net/jodah/expiringmap/0.5.10/)

## 设置超时时间，防止 Read timed out

调用 OpenAPI 出现 `Read timed out` 异常时，通过 `HttpOptions` 设置超时参数（尤其是 SocketTimeout）：

```java
HttpOptions httpOptions = new HttpOptions()
        .setConnectionRequestTimeout(30 * 1000)  // 连接池获取连接超时：30秒
        .setConnectionTimeout(30 * 1000)          // 建立连接超时：30秒
        .setSocketTimeout(180 * 1000);            // 读取响应超时：180秒（关键）
OpenServiceBuilder openServiceBuilder = new OpenServiceBuilder()
        .setHttpOptions(httpOptions)
        .setAppKey(appKey)
        .setAppSecret(appSecret)
        .setEnv(env);
```

```xml
<dependency>
    <groupId>net.jodah</groupId>
    <artifactId>expiringmap</artifactId>
    <version>0.5.10</version>
</dependency>
```

## 调用示例代码

```java
public class TestController {

    private static ObjectMapper mapper = new ObjectMapper();
    private static String appKey = "2baa0826025b411283ae52f5fd87862f";
    private static String appSecret = "1d0f980c676fd90181608ebc35fecd0fc699e0c9";
    private static String env = "https://jhbip.arura.cn/";

    @Test
    public void test1() {
        String url = "https://jhbip.arura.cn/iuap-api-gateway/tiednzak/yonbip/QMS_QIT/qmsqit/checkapply/save";
        Map<String, Object> root = new HashMap<>();
        root.put("sourcebillType", "po_finishedreport");

        List<Map<String, String>> llSourceInfoList = new ArrayList<>();
        Map<String, String> sourceInfo = new HashMap<>();
        sourceInfo.put("sourceid", "2422348575515082754");
        sourceInfo.put("sourceautoid", "2422348575515082755");
        llSourceInfoList.add(sourceInfo);
        root.put("LLSourceInformationList", llSourceInfoList);

        doPost(url, root);
    }

    private Object doPost(String url, Map<String, Object> reqBodyMap) {
        try {
            OpenServiceBuilder openServiceBuilder = new OpenServiceBuilder()
                    .setAppKey(appKey)
                    .setAppSecret(appSecret)
                    .setEnv(env);
            InputParam inputParam = new InputParam()
                    .setUrl(url)
                    .setBody(reqBodyMap)
                    .setContentType("application/json")
                    .setMethod("POST");
            HttpResponse result = Invoke.getResult(openServiceBuilder, inputParam);

            Map<String, Object> resultMap = mapper.readValue(result.getResult(),
                    new TypeReference<Map<String, Object>>() {});
            int statusCode = result.getStatusCode();
            if (statusCode == 200) {
                String code = String.valueOf(resultMap.get("code"));
                if ("200".equals(code)) {
                    return resultMap.get("data");
                } else {
                    throw new RuntimeException((String) resultMap.get("message"));
                }
            } else {
                throw new RuntimeException((String) resultMap.get("message"));
            }
        } catch (Exception e) {
            throw new RuntimeException("解析结果异常");
        }
    }
}
```
