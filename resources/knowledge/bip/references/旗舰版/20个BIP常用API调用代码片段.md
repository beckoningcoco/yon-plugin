---
name: 20个BIP常用API调用代码片段
description: >
  用友 BIP 客开技能。当用户需要编写 API 调用相关代码，包括前端 DynamicProxy 动态代理、cb.rest.invokeFunction 后端函数调用、AbstractAPIHandler/AbstractTrigger 后端 API、rootStore.utils.request 高级请求、Fetch API、带加载状态的 API 调用等场景时，参考该文档内容。
---

# 20个BIP常用API调用代码片段

## 前端 DynamicProxy 动态代理

### 1. 基础 DynamicProxy 创建与调用

```javascript
let proxy = cb.rest.DynamicProxy.create({
    settle: {
        url: '/employment/info/queryTransType',
        method: 'POST',
        options: { domainKey: 'c-hcc-ifound-ehr', async: false }
    }
});
var result = proxy.settle(params);
```

### 2. 保存前调用后端校验（链式调用）

```javascript
viewModel.onFirst('beforeSave', (data) => {
    var params = { chgtypeid: viewModel.getAllData().chgtypeid };
    let proxy = cb.rest.DynamicProxy.create({
        settle: { url: '/employment/info/queryTransType', method: 'POST' }
    });
    var result = proxy.settle(params);
    if (result) {
        let proxy1 = cb.rest.DynamicProxy.create({
            settle: { url: '/employment/info/batchSaveChange', method: 'POST' }
        });
        var result1 = proxy1.settle(saveData);
        if (result1?.error) {
            cb.utils.alert(result1.error.message, 'error');
            return false;
        }
    }
});
```

## 后端函数调用 invokeFunction

### 3. 调用后端函数进行数据操作

```javascript
var params = {
    entity: 'GT475AT11.GT475AT11.scapCapincInfoAe',
    billNo: '160b51ee',
    data: request
};
cb.rest.invokeFunction("af73c2219aad4c6e9eff8c386dc7ba64", params, function(err, resp) {
    if (err) { cb.utils.alert(JSON.stringify(err), 'error'); return; }
    // 根据结果进行更新或新增
    let parData = { transactionId: request.transactionId };
    cb.rest.invokeFunction("56bd4b38942a4e668b7e1102fb8040d5", { data: parData }, function(err, res) {
        let record = res.res[0];
        if (record) { /* 更新 */ } else { /* 新增 */ }
    });
});
```

## 后端 AbstractAPIHandler

### 4. 后端实体条件查询 API

```javascript
let AbstractAPIHandler = require('AbstractAPIHandler');
class MyAPIHandler extends AbstractAPIHandler {
    execute(request){
        var condition = request.condition || {};
        var datas = ObjectStore.selectByMap(request.entity, condition);
        return {datas};
    }
}
exports({"entryPoint": MyAPIHandler});
```

## 后端 AbstractTrigger

### 5. 后端触发器调用外部 API

```javascript
let AbstractTrigger = require('AbstractTrigger');
class MyTrigger extends AbstractTrigger {
    execute(context, param) {
        let env = ObjectStore.env();
        let header = { "Content-Type": "application/json;charset=UTF-8" };
        let url = env.url + "/c-scc-pmm-lrs-be/deliveryVoucher/checkCloseByLe";
        let body = { "billId": rowData.id, "billCode": rowData.code };
        let infoString = ObjectStore.postman("post", url, header, body);
        let infoObject = JSON.parse(infoString);
        if (infoObject.code != '200') { throw new Error(infoObject.message); }
        return infoObject;
    }
}
exports({ "entryPoint": MyTrigger });
```

### 6. 后端触发器同步数据到外部系统

```javascript
let AbstractTrigger = require('AbstractTrigger');
class MyTrigger extends AbstractTrigger {
    execute(context, param) {
        let env = ObjectStore.env();
        let header = {
            "Content-Type": "application/json;charset=UTF-8",
            "Cookie": "yht_access_token=" + env.token
        };
        let url = env.url + "/defArchive/nc/push/useFund";
        let resp = postman("post", url, JSON.stringify(header), JSON.stringify(param.billDOs[0]));
        let respJson = JSON.parse(resp);
        if (!respJson || !respJson.succeed) {
            return { succeed: false, message: "同步失败：" + respJson.message };
        }
        return { succeed: true };
    }
}
exports({ "entryPoint": MyTrigger });
```

## rootStore 高级请求

### 7. rootStore.utils.request 列表查询

```javascript
async function fetchrequestforQuery(warnStatus) {
    const url = '/c-iuap-train-ynfdev/ypd/bill/list';
    const data = {
        page: { pageIndex: 1, pageSize: 10 },
        extraCondition: {
            conditions: [{
                op: 'and',
                items: [{ op: 'eq', name: 'inventory_warning_status', v1: warnStatus }]
            }]
        }
    };
    const params = { busiObj: 'RequmAnalysis', billnum: 'RequmAnalysisStockList' };
    const res = await rootStore.utils.request({ url, method: 'POST', params, data });
    if (res.code === 200) {
        rootStore.TableStore2oi.setData(res.data.recordList);
    }
}
```

## 树形数据上报

### 8. 解绑并重新绑定按钮事件 + 树形数据上报

```javascript
viewModel.get('button5hf').un('click');
viewModel.get('button5hf').on('click', function () {
    let treeModle = viewModel.getTreeModel();
    let treeData = treeModle.getSelectedNodes();
    let proxy = cb.rest.DynamicProxy.create({
        ensure: { url: '/orgData/report?domainKey=scaprm', method: 'POST' }
    });
    var params = {
        billnum: viewModel.getParams().cardKey,
        treename: viewModel.getParams().treeName,
        data: JSON.stringify(treeData)
    };
    proxy.ensure(params, function (err, result) {
        if (err) { cb.utils.alert(err.message || '上报失败', 'error'); return; }
        cb.utils.alert('上报成功', 'success');
        viewModel.execute('refresh');
    });
});
```

## 带加载状态的 API 调用

### 9. loadingControl 加载控制

```javascript
let closeProcessPlan = (selectDatas) => {
    const diworkCode = viewModel.getParams()?.diworkCode;
    cb.utils.loadingControl.start({ diworkCode });
    const proxy = cb.rest.DynamicProxy.create({
        doProxy: {
            url: '/processPlanExtController/shutDownCutstatus', method: 'POST',
            options: { domainKey: 'c-lszz-lkylhf-mm1014', async: false }
        }
    });
    const ajaxResult = proxy.doProxy(selectDatas) || [];
    if (ajaxResult.error) {
        cb.utils.alert(ajaxResult.nodeError.message, 'error');
        cb.utils.loadingControl.end({ diworkCode });
        return;
    }
    parentModel.execute('refreshTaskList');
    cb.utils.loadingControl.end({ diworkCode });
    cb.utils.alert('操作成功', 'success');
};
```

## 关键 API 对照

| 调用方式 | 适用场景 | 关键代码 |
|----------|----------|----------|
| `cb.rest.DynamicProxy.create` | 前端调后端 Controller | `proxy.methodName(params)` |
| `cb.rest.invokeFunction` | 前端调后端函数 | `cb.rest.invokeFunction("funcId", params, callback)` |
| `ObjectStore.postman` | 后端触发器调外部 API | `postman("post", url, header, body)` |
| `rootStore.utils.request` | 高级列表查询 | `await rootStore.utils.request({...})` |
| `Fetch API` | 现代异步请求 | `fetch(url, {...}).then(...)` |
