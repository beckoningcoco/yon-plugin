---
name: 后端函数postman传xml格式参数
description: >
  用友 BIP 客开技能。当用户需要在后端函数中通过 postman 工具发送 XML 格式的 POST 请求，并解析 XML 响应为 JSON 时，参考该文档内容。
---

# 后端函数postman传xml格式参数

```js
let header = {
  'Content-Type': 'text/xml;charset=UTF-8',
};
let strResponse = postman('post', url, 'xml', JSON.stringify(header), xmlString);
var jsonString = xml2json(strResponse)
```
