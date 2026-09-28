---
name: 页面脚本调用后端
description: >
  用友 BIP 客开技能。当用户需要在前端页面脚本中调用后端获取数据时，包括两种方式：
  1. cb.rest.invokeFunction 调用 YMS 注册的 API 函数
  2. cb.rest.DynamicProxy 直接调用 Java Controller
---

# 旗舰版页面脚本调用后端

## 方式一：invokeFunction 调用 API 函数（推荐）

页面脚本通过 `cb.rest.invokeFunction` 调用 YMS 中注册的 API 函数（函数编码是 UUID）：

```javascript
viewModel.get('btnGetData') && viewModel.get('btnGetData').on('click', function (data) {
    let params = {
        code: viewModel.get('code').getValue(),
        orgId: viewModel.get('orgId').getValue()
    };

    cb.rest.invokeFunction("19c6a60fd6394cbe804b35ac7ea3b137", params, function (err, res) {
        if (err) {
            cb.utils.alert(err.message, 'error');
            return;
        }
        if (res) {
            viewModel.getGridModel('detailList').setDataSource(res);
        }
    });
});
```

对应的 API 函数（YMS → 函数管理 → API 函数）：

```javascript
let AbstractAPIHandler = require('AbstractAPIHandler');
class QueryDataHandler extends AbstractAPIHandler {
    execute(request) {
        let res = ObjectStore.queryByYonQL(
            "select id, code, name from ynfdev.ynfdev.YourEntity where code = '" + request.code + "'"
        );
        return res;
    }
}
exports({ entryPoint: QueryDataHandler });
```

## 方式二：DynamicProxy 调用 Java Controller

页面脚本通过 `cb.rest.DynamicProxy` 直接调用 Controller REST 接口：

```javascript
let option = { domainKey: 'c-kk-lzlj-cwgx' };
let baseUrl = cb.env.getMainOriginUrl();
let url = baseUrl + '/c-kk-lzlj-cwgx/monthlyCorporate/travelBill/queryLinkBtnData';

let proxy = cb.rest.DynamicProxy.create({
    ensure: { url: url, method: 'POST', options: option }
});
proxy.ensure(JSON.stringify(params), function (err, result) {
    if (err) {
        cb.utils.alert(err.message, 'error');
        return;
    }
    gridModel.setDataSource(result);
});
```

Controller：

```java
@PostMapping("/queryLinkBtnData")
public Map<String, Object> queryLinkBtnData(@RequestBody Map<String, Object> params) {
    Map<String, Object> result = new HashMap<>();
    result.put("success", true);
    result.put("data", yourService.queryData(params));
    return result;
}
```

## 对比

| 方式 | 调用对象 | 使用场景 |
|------|---------|---------|
| `invokeFunction` | YMS API 函数（JS） | 简单查询/更新，不需要额外部署 |
| `DynamicProxy` | Java Controller | 复杂业务逻辑，需要事务/SQL/第三方调用 |
