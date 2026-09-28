---
name: 20个BIP保存事件代码片段
description: >
  用友 BIP 客开技能。当用户需要编写保存事件的页面脚本，包括 beforeSave 基础校验、afterSave 保存后处理、保存前异步校验、主子表校验、保存前后数据状态控制等场景时，参考该文档内容。
---

# 20个BIP保存事件代码片段

## 基础保存事件

### 1. beforeSave 保存前校验

```javascript
viewModel.on("beforeSave", function(args){
    let data = JSON.parse(args.data.data);
    if(!data.fieldName){
        cb.utils.alert('字段不能为空', 'error');
        return false;  // 阻止保存
    }
    args.data.data = JSON.stringify(data);
});
```

### 2. afterSave 保存后处理

```javascript
viewModel.on('afterSave', function(data){
    if(!data.err){
        cb.utils.alert('保存成功', 'success');
        console.log('保存后的数据ID:', data.res.id);
    }
});
```

## 保存前数据校验

### 3. 日期范围校验

```javascript
viewModel.on('beforeSave', function(args){
    var creditStartDate = viewModel.get('creditStartDate').getValue();
    var creditEndDate = viewModel.get('creditEndDate').getValue();
    if(new Date(creditEndDate) < new Date(creditStartDate)){
        cb.utils.alert('【担保结束时间】应大于等于【担保开始时间】');
        return false;
    }
});
```

### 4. 主子表数据完整性校验

```javascript
viewModel.on('beforeSave', function(args){
    var gridModel = viewModel.getGridModel('detailList');
    var rows = gridModel.getRows();
    if(rows.length === 0){
        cb.utils.alert('明细表至少需添加一行数据', 'error');
        return false;
    }
    for(var i = 0; i < rows.length; i++){
        if(!rows[i].requiredField){
            cb.utils.alert('第' + (i+1) + '行必填字段不能为空', 'error');
            return false;
        }
    }
});
```

### 5. 多选字段数量限制校验

```javascript
viewModel.on('beforeSave', function(args){
    let gwsrlxq = viewModel.get('gwsrlxq').getValue() || [];
    if(gwsrlxq.length > 3){
        cb.utils.alert('岗位胜任力需求项最多选择3个，请删除多余项后重试');
        return false;
    }
});
```

### 6. 调用后端接口校验（同步）

```javascript
viewModel.on('beforeSave', function(param){
    const proxy = viewModel.setProxy({
        ensure: {
            url: '/evaluateApply/saveBefore',
            method: 'post',
            options: { async: false }  // 同步请求关键
        }
    });
    let params = {
        mainId: viewModel.getParams().mode === 'edit' ? viewModel.get('id').getValue() : null,
        evaAutoDuration: viewModel.get('evaAutoYear').getValue()
    };
    let res = proxy.ensure(params);
    if(res.error){
        cb.utils.alert(res.error.message, 'error');
        return false;
    }
});
```

## 保存数据状态控制

### 7. 强制修改数据状态（Insert→Update）

```javascript
viewModel.on("beforeSave", function(args){
    viewModel.get('id').setValue("2452623741341952");
    let data = JSON.parse(args.data.data);
    if(data._status === "Insert"){
        data._status = "Update";
        data.id = "2452623741341952";
    }
    args.data.data = JSON.stringify(data);
});
```

### 8. 根据新增/编辑模式执行不同逻辑

```javascript
viewModel.on("beforeSave", function(args){
    let data = JSON.parse(args.data.data);
    let mode = viewModel.getParams().mode;
    if(mode === 'add'){
        data.code = generateCode();
    } else if(mode === 'edit'){
        data.modifyTime = new Date().toISOString();
    }
    args.data.data = JSON.stringify(data);
});
```

## 保存后业务处理

### 9. 保存后更新关联数据状态

```javascript
viewModel.on('afterSave', function(data){
    if(!data.err){
        const gridModel = viewModel.getGridModel();
        let bodyItem = gridModel.getRows();
        const selectedIds = bodyItem.map((row) => row.inventoryTaskDetailId);
        let proxy = viewModel.setProxy({
            ensure: { url: '/asset/batchInventory', method: 'post' }
        });
        proxy.ensure({ ids: selectedIds }, function(err, res){
            if(err){
                cb.utils.alert(err.message, 'error');
            } else {
                viewModel.execute('refresh');
            }
        });
    }
});
```

### 10. 保存后回写数据到来源单据

```javascript
viewModel.on('afterSave', function(data){
    if(!data.err){
        let saveData = data.res;
        let proxy = viewModel.setProxy({
            doWriteBack: {
                url: '/workOrder/accidentReportWriteBack',
                method: 'POST'
            }
        });
        let params = {
            billnum: viewModel.getParams().billNo,
            data: JSON.stringify(saveData),
            custMap: { workOrderId: saveData.id }
        };
        proxy.doWriteBack(params, function(err, suc){
            if(!err){ cb.utils.alert('操作成功'); }
            else { cb.utils.alert(err.message, 'error'); }
        });
    }
});
```

### 11. 保存后阻止页面关闭

```javascript
let isSaveTriggered = false;
viewModel.on('afterSave', function(){ isSaveTriggered = true; });
viewModel.on('beforeClose', function(){
    if(isSaveTriggered){ isSaveTriggered = false; return false; }
    return true;
});
```

## 复杂业务保存

### 12. 主子表数据保存（根据ID自动判断新增/更新）

```javascript
function saveData(){
    var request = viewModel.getAllData();
    var entityName = "GT475AT11.GT475AT11.ScapFreexferInfo";
    var transactionId = request.transactionId;
    let parData = { transactionId: transactionId };
    var params = { entity: entityName, data: parData };
    cb.rest.invokeFunction("19c6a60fd6394cbe804b35ac7ea3b137", params, function(err, res){
        if(res && res.res[0]){
            request.id = res.res[0].id;
            request.pubts = res.res[0].pubts;
            updateEntity(request);
        } else {
            insertEntity(request);
        }
    });
}
```

### 13. 保存前 Promise 异步校验

```javascript
viewModel.on("beforeSave", function(args){
    let alertPromise = new cb.promise();
    validateData().then(function(result){
        if(result.success){
            alertPromise.resolve();
        } else {
            cb.utils.confirm('数据存在警告，是否继续保存？',
                function(){ alertPromise.resolve(); },
                function(){ alertPromise.reject(); }
            );
        }
    });
    return alertPromise;
});
```

### 14. 保存后更新 localStorage 缓存

```javascript
viewModel.on('afterSave', function(data){
    if(!data.err){
        var request = viewModel.getAllData();
        localStorage.setItem('acquiredCoId', request.targetCoName);
        localStorage.setItem('acquiredCoName', request.targetCoName_name);
        cb.utils.alert('保存成功', 'success');
    }
});
```
