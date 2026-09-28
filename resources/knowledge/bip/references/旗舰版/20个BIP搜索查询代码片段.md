---
name: 20个BIP搜索查询代码片段
description: >
  用友 BIP 客开技能。当用户需要编写搜索查询相关代码，包括 FilterViewModel 查询区操作、beforeSearch 动态添加过滤条件、simpleVOs AND/OR 条件构建、树形参照过滤、阻止默认搜索、YonQL 查询、自定义搜索按钮等场景时，参考该文档内容。
---

# 20个BIP搜索查询代码片段

## 查询区模型基础操作

### 1. 获取查询区模型

```javascript
viewModel.on('afterMount', function (data) {
    var searchModel = viewModel.getCache('FilterViewModel');
    searchModel.on('afterInit', function(){
        // 查询区初始化完成，可安全操作查询字段
    });
});
```

### 2. 阻止默认搜索

```javascript
viewModel.on('beforeSearch', function(){ return false; });
```

### 3. 控制列表加载不自动查询

```javascript
filtervm.on('afterInit', function(){
    filtervm.getParams().autoLoad = false;
});
```

### 4. 重置按钮事件

```javascript
filtervm.on("afterResetClick", function(data){
    return false;  // 阻止重置后自动查询
});
```

## 查询条件构建

### 5. beforeSearch 动态添加过滤条件

```javascript
viewModel.on('beforeSearch', function(args){
    args.isExtend = true;
    var conditions = args.params.condition;
    conditions.simpleVOs = [{
        field: 'debtUnit', op: 'in', value1: findedOrg.orgdept
    }];
});
```

### 6. 多条件 AND 查询

```javascript
viewModel.on('beforeSearch', function(args){
    args.isExtend = true;
    args.params.condition.simpleVOs = [
        { field: 'verifystate', op: 'eq', value1: '2' },
        { field: 'effectiveDate', op: 'elt', value1: effectiveDate },
        { field: 'enable', op: 'eq', value1: 1 }
    ];
});
```

### 7. 复杂查询条件（含 OR）

```javascript
viewModel.on('beforeSearch', function(args){
    args.isExtend = true;
    args.params.condition.simpleVOs = [
        { field: 'verifystate', op: 'eq', value1: '2' },
        {
            "logicOp": "or",
            "conditions": [
                { field: "expirationDate", op: "egt", value1: expirationDate },
                { field: "expirationDate", op: "is_null" }
            ]
        }
    ];
});
```

### 8. 移除默认查询条件

```javascript
viewModel.on('beforeSearch', function(args){
    let list = args.params.condition.commonVOs;
    args.params.condition.commonVOs = list.filter(item => {
        return item.itemName != "effectiveDate" && item.itemName != "expirationDate";
    });
});
```

### 9. 查询前处理特定条件

```javascript
viewModel.on('beforeSearch', (args) => {
    const commonVOs = args.params?.condition?.commonVOs;
    if (commonVOs) {
        const _index = commonVOs.findIndex((item) => item.itemName === 'isLast');
        if (_index !== -1) {
            if (commonVOs[_index].value1) commonVOs.splice(_index, 1);
            else commonVOs[_index].value1 = true;
        }
    }
});
```

## 参照过滤

### 10. 普通参照过滤

```javascript
filtervm.get('bondType').getFromModel().on('beforeBrowse', function (data) {
    let condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({ field: 'enable', op: 'eq', value1: 1 });
    this.setFilter(condition);
});
```

### 11. 树形参照过滤

```javascript
filtervm.get('debtUnit').getFromModel().on('beforeBrowse', function (data) {
    let condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({ field: 'id', op: 'in', value1: findedOrg.orgdept });
    this.setTreeFilter(condition);
});
```

### 12. 多条件联动参照过滤

```javascript
filtervm.get('orgMain').getFromModel().on('beforeBrowse', function (data) {
    var dataPeriod = searchModel.get('dataPeriod').getFromModel().getValue();
    var dataType = searchModel.get('dataType').getFromModel().getValue();
    var nameCondition = { "isExtend": true, simpleVOs: [] };
    nameCondition.simpleVOs.push({ field: 'report_type', op: 'eq', value1: dataType });
    nameCondition.simpleVOs.push({ field: 'data_period', op: 'eq', value1: period });
    this.setTreeFilter(nameCondition);
});
```

## 查询区字段操作

### 13. 设置查询区默认值

```javascript
var date = new Date();
var year = date.getFullYear();
var month = date.getMonth();
var newdate = (month == 0) ? (year-1) + '-12' : year + '-' + (month < 10 ? '0' + month : month);
searchModel.get('dataPeriod').getFromModel().setValue(newdate);
```

### 14. 动态更新字段显示格式

```javascript
datatype.getFromModel().on('afterValueChange', function(data){
    var dtcode = data.value.dt_code;
    var format = ('annual' === dtcode) ? 'YYYY' : 'YYYY-MM';
    searchModel.execute('updateViewMeta', { code: 'dataPeriod', cFormatData: format });
});
```

### 15. 设置查询区字段禁用

```javascript
filtervm.get('EffectiveDate').getFromModel().setDisabled(true);
filtervm.get('ExpirationDate').getFromModel().setDisabled(true);
```

## 后端查询

### 16. YonQL 条件查询

```javascript
let AbstractAPIHandler = require('AbstractAPIHandler');
class MyAPIHandler extends AbstractAPIHandler {
    execute(request){
        var res = ObjectStore.queryByYonQL(
            'select count(id) as needProcessedNum from ynfdev.ynfdev.RequmApply where applyStatus=1'
        );
        return { needProcessedNum: res[0].needProcessedNum };
    }
}
exports({"entryPoint": MyAPIHandler});
```

### 17. 带参数的安全查询

```javascript
let userId = ObjectStore.user().id;
var object = { creator: userId, dr: '0' };
var res = ObjectStore.selectByMap('ynfdev.ynfdev.EqumApply', object);
```

## 自定义搜索按钮

### 18. 完全自定义查询逻辑

```javascript
viewModel.get('button38gd').on('click', function(data) { initFeedTotalDetail(); });
function initFeedTotalDetail(){
    viewModel.get('material_feeding_detailList').clear();
    var startTime = viewModel.get("item174ij")?.getValue();
    var endTime = viewModel.get("item324gj")?.getValue();
    var params = { startTime, endTime };
    const proxy = viewModel.setProxy({
        ensure: { url: '/lk/feedTotal/getFeedTotal', method: 'POST', options: { async: true } }
    });
    proxy.ensure(params, function (err, res) {
        if (err) { cb.utils.alert('查询失败 '+err.message, 'error'); return; }
        viewModel.get('material_feeding_bodyList').insertRows(1, res.tlzb);
    });
}
```

## 条件操作符对照

| 操作符 | 含义 |
|--------|------|
| `eq` | 等于 |
| `in` | 在范围内 |
| `elt` | 小于等于 |
| `egt` | 大于等于 |
| `like` | 模糊匹配 |
| `is_null` | 为空 |
| `is_not_null` | 非空 |
