---
name: 根据用户id获取 yht_access_token
description: >
  用友 BIP 客开技能。当用户提到使用后端代码，如何根据 用户id，user_id,用户身份，获取 yht_access_token时，参考此文档。 
---

```java
package com.hawk.ucf.mdf.common.utils.yonbip;

import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.cookie.Cookie;
import org.apache.http.impl.client.BasicCookieStore;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.imeta.spring.support.cache.RedisManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.yonyou.cloud.utils.StringUtils;
import com.yonyou.iuap.BusinessException;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@Component
public class YonBipTokenUtil {

    private static final String YHT_ACCESS_TOKEN_COOKIE = "yht_access_token";
    @Value("${domain.url}")
    private String baseUrl;
    @Autowired
    private RedisManager redisManager;
    @Autowired
    private YonBipUtil yonBipUtil;

    /**
     * 获取友互通token
     */
    public String getYhtAccessToken(String yhtUserId) {
        if (StringUtils.isBlank(yhtUserId)) {
            throw new BusinessException("999", "当前员工的yhtUserId为空");
        }
        String yhtAccessToken = redisManager.get(YHT_ACCESS_TOKEN_COOKIE + yhtUserId);
        if (StringUtils.isBlank(yhtAccessToken)) {
            Map<String, Object> resp = yonBipUtil.genLoginTokenByUserId(yhtUserId);
            String redirectUrl = buildRedirectUrl((String) resp.get("token"));
            String resultStr = yonBipUtil.doGet2(redirectUrl);
            yhtAccessToken = extractYhtAccessToken(resultStr);
            if (StringUtils.isBlank(yhtAccessToken) || yhtAccessToken.contains("<script>")) {
                throw new BusinessException("999", "获取yhtAccessToken失败");
            }
            redisManager.set(YHT_ACCESS_TOKEN_COOKIE + yhtUserId, yhtAccessToken, 60 * 60);
        }
        if (StringUtils.isBlank(yhtAccessToken)) {
            throw new BusinessException("999", "获取yhtAccessToken失败");
        }
        return yhtAccessToken;
    }

    private String buildRedirectUrl(String token) {
        try {
            String workBenchUrl = baseUrl + "/login?service=";
            String encodeRedirctUrl = URLEncoder.encode(baseUrl, StandardCharsets.UTF_8.toString());
            String sendRedirectUrl = URLEncoder.encode(workBenchUrl + encodeRedirctUrl,
                    StandardCharsets.UTF_8.toString());
            // 生成最终跳转链接
            return "/cas/login?token=" + token + "&service=" + sendRedirectUrl;
        } catch (UnsupportedEncodingException e) {
            throw new BusinessException("999", "生成跳转链接失败");
        }
    }

    private String extractYhtAccessToken(String responseStr) {
        if (StringUtils.isBlank(responseStr)) {
            return responseStr;
        }

        try {
            // 查找 location.href = " 模式，获取 URL 的起始位置
            int locationStart = responseStr.indexOf("location.href");
            if (locationStart == -1) {
                return responseStr;
            }
            // 找到 location.href 后面的第一个引号
            int firstQuote = responseStr.indexOf("\"", locationStart);
            if (firstQuote == -1) {
                return responseStr;
            }
            // 从第一个引号之后查找结束引号（应该是 "; 模式的一部分）
            int endQuote = responseStr.indexOf("\";", firstQuote);
            if (endQuote == -1) {
                return responseStr;
            }

            String locationHrefUrl = responseStr.substring(firstQuote + 1, endQuote);
            BasicCookieStore cookieStore = new BasicCookieStore();
            HttpGet httpGet = new HttpGet(locationHrefUrl);
            try (CloseableHttpClient httpClientMobile = HttpClients.custom().setDefaultCookieStore(cookieStore).build();
                    CloseableHttpResponse executeRes = httpClientMobile.execute(httpGet)) {
                EntityUtils.toString(executeRes.getEntity(), "utf-8");
                List<Cookie> cookiesMobile = cookieStore.getCookies();
                for (Cookie cookie : cookiesMobile) {
                    if (YHT_ACCESS_TOKEN_COOKIE.equals(cookie.getName())) {
                        return cookie.getValue();
                    }
                }
            }
        } catch (Exception e) {
            throw new BusinessException("999", "解析友互通token失败: " + e.getMessage(), e);
        }
        return responseStr;
    }
}

```

