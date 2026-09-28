---
name: 后端脚本调用发布API使用ObjectStore.openLinkerPure
description: >
  用友 BIP 旗舰版通用知识。在后端脚本（规则/函数）中调用已发布或标准原厂 API，使用 ObjectStore.openLinkerPure 方法，
  无需传 access_token，通过 APPCODE 鉴权。
---

# 后端脚本调用发布/标准原厂 API

## 适用场景

在后端脚本（规则链、后端函数等）中调用已发布出来的客开 API 或标准原厂 API。

## 核心方法

```javascript
let env = ObjectStore.env().url;
let url = env + '/iuap-api-gateway/jd4ofb7k/yonbip/FCC/UpdateFeatByIds';
let body = {
  ids: includedList,
};
let infoString = ObjectStore.openLinkerPure('POST', url, 'yonbip-fi-revenue', body);
```

### 方法签名

`ObjectStore.openLinkerPure(method, url, appCode, body)`

| 参数 | 说明 |
|------|------|
| `method` | HTTP 方法，`'POST'` 或 `'GET'` |
| `url` | 完整 API 地址，格式：`{网关域名}/iuap-api-gateway/{租户id}/{产品}/{接口路径}` |
| `appCode` | API 授权对应的 APPCODE，**不是 AppKey** |
| `body` | 请求体（JSON 对象），GET 请求可不传 |

> **无需传 `access_token`**，`openLinkerPure` 内部自动处理鉴权。

## 如何获取 APPCODE

1. 进入**开放平台 → API 调用**节点
2. 按 `F12` 打开开发者工具，切换到 **网络（Network）** 页签
3. 刷新页面，找到请求 **`getPageKeys...`**
4. 在响应中查找你的 API 授权给哪个 AppKey，对应的 `appCode` 就是第三个参数

响应示例（关注 `appCode` 字段）：

```json
{
  "data": {
    "content": [
      {
        "appKey": "9f4baa2dfede4d6792f0245aa800e47a",
        "appCode": "cxHDKK",
        "description": "HD客开"
      },
      {
        "appKey": "73ea15e946c44bf88625c1499a3170e6",
        "appCode": "kkcs",
        "description": "YonBIP"
      }
    ]
  }
}
```

关键字段说明：

| 字段 | 说明 |
|------|------|
| `appKey` | 应用的唯一标识（不是这个） |
| `appCode` | **API 调用时使用的编码（用这个）** |
| `description` | 应用描述，用于辨认是哪个应用 |

## 完整示例

```javascript
// 调用标准原厂 API 批量更新特征字段
let env = ObjectStore.env().url;
let url = env + '/iuap-api-gateway/jd4ofb7k/yonbip/FCC/UpdateFeatByIds';
let body = {
  ids: includedList
};

let infoString = ObjectStore.openLinkerPure('POST', url, 'cxHDKK', body);
console.error('调用结果: ' + infoString);
```
