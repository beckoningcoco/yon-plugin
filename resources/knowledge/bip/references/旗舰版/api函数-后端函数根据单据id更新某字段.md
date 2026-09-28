---
name: api函数-后端函数根据单据id更新某字段
description: >
  用友 BIP 客开技能。当用户需要通过后端函数/API 函数根据单据 ID 更新某个字段，使用 ObjectStore.updateById 方法时，参考该文档内容。
---

# api函数/后端函数根据单据id更新某字段

```js
let AbstractAPIHandler = require('AbstractAPIHandler');
class MyAPIHandler extends AbstractAPIHandler {
  execute(request) {
    var object = { id: '2295302499099213828', dept: '2147407756992708624', bodyItem: [] };
    var res = ObjectStore.updateById('earap.payment.PaymentHeader', object, 'payment');
    return { res };
  }
}
exports({ entryPoint: MyAPIHandler });
```

## 参考

[【api发布】发布api更新原厂单据 - YonBIP开发者社区](https://community.yonyou.com/article/detail/10315)
