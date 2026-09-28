---
name: OA单点登录
description: >
  用友 BIP 客开技能。当用户需要实现泛微 OA 与 YonBIP 的单点登录（SSO），通过 AES 加密用户凭证重定向至 SSO 接口，使用 UserCenter 验证身份并生成登录 Token 自动登录时，参考该文档内容。
---

# OA单点登录

## 概述

实现泛微 OA（Weaver）与 YonBIP 的 SSO 集成。OA 使用 AES 加密用户凭证后重定向至 YonBIP SSO 接口，YonBIP 解密验证后生成登录 Token 自动登录。

## 请求地址

```
GET http://sjzt.cam.com.cn/c-yonbip-hawk-asset/sso/index?thirdapp=weaver&usercode=<AES加密>&password=<AES加密>
```

| 参数名   | 必填 | 说明                                                 |
| -------- | ---- | ---------------------------------------------------- |
| thirdapp | 是   | 第三方应用标识，固定传 weaver                        |
| usercode | 是   | 用户账号经 AES 加密 + Base64 编码后的字符串          |
| password | 是   | 用户密码经 AES 加密 + Base64 编码后的字符串          |

## 加密规范

- 算法：AES/ECB/PKCS5Padding
- 密钥长度：128 位（16 字节）
- 输出格式：加密字节 → Base64 编码
- 加密密钥：`MTIzNDU2Nzg5MGFiY2RlZg==`

## Java 加密示例

```java
public static String encrypt(String plainText, String key) {
    byte[] decodedKey = Base64.getDecoder().decode(key);
    SecretKeySpec secretKey = new SecretKeySpec(decodedKey, 0, decodedKey.length, "AES");
    Cipher cipher = Cipher.getInstance("AES");
    cipher.init(Cipher.ENCRYPT_MODE, secretKey);
    byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());
    return Base64.getEncoder().encodeToString(encryptedBytes);
}
```

## Controller 完整代码

核心流程：解密用户凭证 → UserCenter.createAccessToken 验证 → getLoginTokenByAccessToken 获取 token → 重定向到 CAS 登录页。

```java
@RestController
@RequestMapping("/sso")
public class SingleSignOnController {

    private static final String AES_KEY = "MTIzNDU2Nzg5MGFiY2RlZg==";
    @Value("${yht.sys_id}") private String sysId;
    @Value("${yht.client_id}") private String clientId;
    @Value("${yonbip.env}") private String env;
    @Value("${yonbip.tenantid}") private String tenantId;

    @GetMapping("/index")
    public void index(HttpServletRequest request, HttpServletResponse response) {
        String userId = auth(request);
        String redirect_uri = getRedirectUrl(env, userId);
        response.sendRedirect(redirect_uri);
    }

    private String auth(HttpServletRequest request) {
        return RobotExecutors.runAs(tenantId, () -> handleWeaver(request));
    }

    private String handleWeaver(HttpServletRequest request) {
        String usercode = request.getParameter("usercode");
        String password = request.getParameter("password");
        String decryptedUsercode = decrypt(usercode, AES_KEY);
        String result = UserCenter.createAccessToken(sysId, decryptedUsercode, decrypt(password, AES_KEY), clientId);
        Map<String, Object> resultMap = mapper.readValue(result, Map.class);
        Map<String, Object> data = (Map) resultMap.get("data");
        result = UserCenter.getLoginTokenByAccessToken((String) data.get("access_token"));
        resultMap = mapper.readValue(result, Map.class);
        return (String) resultMap.get("token");
    }

    private String getRedirectUrl(String domainUrl, String token) throws UnsupportedEncodingException {
        String encodeRedirctUrl = URLEncoder.encode(domainUrl, "UTF-8");
        String loginUrl = domainUrl + "/cas/login?token=%s&service=%s";
        String encodedLoginURL = URLEncoder.encode(domainUrl + "/login?service=" + encodeRedirctUrl, "UTF-8");
        return String.format(loginUrl, token, encodedLoginURL);
    }

    public static String decrypt(String encryptedData, String key) {
        byte[] decodedKey = Base64.getDecoder().decode(key);
        byte[] fixedKey = createFixedLengthKey(decodedKey);
        SecretKeySpec secretKey = new SecretKeySpec(fixedKey, "AES");
        Cipher cipher = Cipher.getInstance("AES");
        cipher.init(Cipher.DECRYPT_MODE, secretKey);
        byte[] decryptedBytes = cipher.doFinal(Base64.getDecoder().decode(encryptedData));
        return new String(decryptedBytes, "UTF-8");
    }

    private static byte[] createFixedLengthKey(byte[] inputKey) {
        byte[] fixedKey = new byte[16];
        if (inputKey.length >= 16) {
            System.arraycopy(inputKey, 0, fixedKey, 0, 16);
        } else {
            System.arraycopy(inputKey, 0, fixedKey, 0, inputKey.length);
            Arrays.fill(fixedKey, inputKey.length, 16, (byte) 0);
        }
        return fixedKey;
    }
}
```
