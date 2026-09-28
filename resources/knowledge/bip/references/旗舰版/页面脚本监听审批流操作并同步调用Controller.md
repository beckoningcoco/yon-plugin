---
name: 页面脚本监听审批流操作并同步调用Controller
description: >
  用友 BIP 客开技能。当用户需要在页面脚本中监听审批流操作（驳回/退回等）并通过 beforeWorkflowAction 事件同步调用后端 Controller 处理业务逻辑（如代理 ensureSync、Controller 返回报文格式要求）时，参考该文档内容。
---

# 页面脚本监听审批流操作并同步调用Controller

## 页面脚本

```js
// 监听审批流中的退回审批
viewModel.on('beforeWorkflowAction', (data) => {
  console.log('审批操作数据:', JSON.stringify(data));
  debugger;
  // 判断是否为退回操作（actionCode 需根据实际动作码调整）
  const actionCode = data.data.requestParams.actionCode;
  if (actionCode === 'reject') {
    console.log('退回意见:', data.comment);
    var cardData = viewModel.getData();
    let param = { data: cardData.id };
    var options = { domainKey: 'c-kk-lzlj-cwgx' };
    const baseurl = cb.env.getMainOriginUrl();
    const url = baseurl + '/c-kk-lzlj-cwgx/znbz/newexpensebill/gc05/reject';
    var proxy = cb.rest.DynamicProxy.create({
      ensure: {
        url: url,
        method: 'POST',
        options: options,
      },
    });
    // 使用 ensureSync 同步调用
    const result = proxy.ensureSync(param);
    var rsponse = result.data;
    if (rsponse.code != '200') {
      cb.utils.alert('退回失败数据！原因：' + rsponse.message);
      return false;
    }
  }
  // 允许其他操作继续执行
  return true;
});
```

## Controller 返回格式要求

Controller 的返回报文**必须**包含 `data` 字段，否则 `proxy.ensureSync` 解析不出来：

```java
@PostMapping("/reject")
public Map<String, Object> billReject(@RequestBody Map<String, Object> reqBody) {
    Map<String, Object> response = new HashMap<>();
    Map<String, Object> res = new HashMap<>();
    response.put("data", res);  // 必须要有 data 字段
    res.put("code", "200");
    res.put("message", "操作成功");
    try {
        String billId = (String) reqBody.get("data");
        // 执行业务逻辑...
    } catch (Exception e) {
        res.put("code", "999");
        res.put("message", "执行失败：" + e.getMessage());
    }
    return response;
}
```
