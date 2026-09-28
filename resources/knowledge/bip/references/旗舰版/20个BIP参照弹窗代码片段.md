---
name: 20个BIP参照弹窗代码片段
description: >
  用友 BIP 客开技能。当用户需要编写参照弹窗相关页面脚本，包括 beforeBrowse 参照过滤、afterReferOkClick 选择确认、树形参照权限过滤、动态联动过滤、triggerReferBrowse 程序化设置参照值等场景时，参考该文档内容。
---

# 20个BIP参照弹窗代码片段

## 基础参照事件

### 1. beforeBrowse 参照过滤

```javascript
viewModel.get('fieldName_name').on('beforeBrowse', function(data){
    var condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({
        field: 'id', op: 'in', value1: ['id1', 'id2']
    });
    this.setFilter(condition);
});
```

### 2. afterReferOkClick 选择确认

```javascript
viewModel.get('fieldName_name').on('afterReferOkClick', function(data){
    var selectedId = data[0].id;
    var selectedName = data[0].name;
    viewModel.get('relatedField').setValue(selectedId);
});
```

### 3. afterBrowse 选择后校验

```javascript
viewModel.get('supplier_name').on('afterBrowse', function(data){
    viewModel.get('taxno').setValue('');
    var supplier = viewModel.get('supplier').getValue();
    if(supplier){
        cb.rest.invokeFunction('functionId', {supplier: supplier}, function(err, res){
            if(res.id === ''){
                cb.utils.alert('供应商银行账户非启用状态，请检查!');
                viewModel.get('supplier_name').setValue('');
                viewModel.get('supplier').setValue('');
            }
        });
    }
});
```

## 参照权限过滤

### 4. 树形参照权限过滤（setTreeFilter）

```javascript
viewModel.get('orgName_name').on('beforeBrowse', function(data){
    var treeCondition = { "isExtend": true, simpleVOs: [] };
    treeCondition.simpleVOs.push({
        field: 'id', op: 'in', value1: findedOrg.orgdept
    });
    this.setTreeFilter(treeCondition);  // 树形参照专用
});
```

### 5. 查询区参照权限过滤

```javascript
var searchModel = viewModel.getCache('FilterViewModel');
searchModel.on('afterInit', function(data){
    var orgName = searchModel.get('companyName');
    orgName.getFromModel().on('beforeBrowse', function(data){
        var nameCondition = { "isExtend": true, simpleVOs: [] };
        nameCondition.simpleVOs.push({
            field: 'id', op: 'in', value1: findedOrg.orgdept
        });
        this.setTreeFilter(nameCondition);
    });
});
```

### 6. 多条件组合参照过滤

```javascript
viewModel.get('BasicOrgDataReport_billName').on('beforeBrowse', function(data){
    var treeCondition = { "isExtend": true, simpleVOs: [] };
    treeCondition.simpleVOs.push({ field: 'id', op: 'in', value1: findedOrg.orgdept });
    treeCondition.simpleVOs.push({ field: 'verifystate', op: 'eq', value1: '2' });
    this.setTreeFilter(treeCondition);
});
```

## 参照联动与动态过滤

### 7. 根据字段值动态设置参照过滤

```javascript
var value = viewModel.get("ecoSituation").getValue();
if("26" == value){
    viewModel.get("detailList").getEditRowModel().get('coName_coName').on('beforeBrowse', function(data){
        this.setFilter({ "isExtend": true, simpleVOs: [] });  // 空条件=不过滤
    });
} else {
    var orgList = JSON.parse(viewModel.get("orgList").getValue());
    viewModel.get("detailList").getEditRowModel().get('coName_coName').on('beforeBrowse', function(data){
        var condition = { "isExtend": true, simpleVOs: [] };
        condition.simpleVOs.push({ field: 'org_id', op: 'in', value1: orgList });
        this.setFilter(condition);
    });
}
```

### 8. 子表参照根据主表联动过滤

```javascript
viewModel.get('detailList').getEditRowModel().get('projectCode_projectCode').on('beforeBrowse', function(data){
    var investmentType = viewModel.get("investmentType").getValue();
    var orgName = viewModel.get('orgName').getValue();
    if(!investmentType){ cb.utils.alert("请选择投资类型!"); return false; }
    let condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({ field: 'projectType', op: 'eq', value1: investmentType });
    condition.simpleVOs.push({ field: 'investor', op: 'eq', value1: orgName });
    this.setFilter(condition);
});
```

### 9. 参照打开前前置校验（cancel 拦截）

```javascript
viewModel.get('adjustType_name').on('beforeBrowse', function(data){
    var fundPlanId_code = viewModel.get('fundPlanId_code').getValue();
    if(!fundPlanId_code || fundPlanId_code == ''){
        cb.utils.alert('请先选择资金计划方案', 'error');
        data.cancel = true;  // 关键拦截语句
        return false;
    }
});
```

## 参照选择确认处理

### 10. beforeReferOkClick 选择确认前校验

```javascript
viewModel.get('QuestionTake_docName').on('beforeReferOkClick', function(referArr){
    let pass = true;
    if(referArr && referArr.length > 0){
        for(let i = 0; i < referArr.length; i++){
            if(!(referArr[i] && referArr[i].verifystate == 2)){
                pass = false; break;
            }
        }
    }
    if(!pass){ cb.utils.alert("所选参照须为已审核状态", "error"); return false; }
});
```

### 11. 参照选择后字段联动赋值

```javascript
viewModel.get('staff_name').on('afterValueChange', function(data){
    const proxy = viewModel.setProxy({
        getStaffData: { url: '/staff/queryDetailInfoByStaffId', method: 'Post' }
    });
    const staffId = viewModel.get('staff').getValue();
    let result = proxy.getStaffData({id: staffId});
    if(result.status == '200'){
        if(result.data.csny) viewModel.get('birthday').setValue(result.data.csny);
        if(result.data.rzbm){
            cb.utils.triggerReferBrowse(viewModel.get('dept_name'),
                [{field: 'id', op: 'eq', value1: result.data.rzbm}]);
        }
    }
});
```

## 高级用法

### 12. triggerReferBrowse 程序化设置参照值

```javascript
const secretLevelField = viewModel.get('secretLevel_secretName');
if(secretLevelField){
    cb.utils.triggerReferBrowse(secretLevelField,
        [{field: 'id', op: 'eq', value1: id}]);
}
```

### 13. 子表单元格参照联动过滤

```javascript
adjustAmountDetailList.getEditRowModel().get('moneySourceType_docName').on('beforeBrowse', function(data){
    var condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({ field: 'enable', op: 'eq', value1: '1' });
    this.setFilter(condition);
});
```

### 14. 参照根据已选部门过滤人员

```javascript
viewModel.get('changePerson_name').on('beforeBrowse', function(data){
    var changeDept = viewModel.get("changeDept").getValue();
    if(!changeDept){ cb.utils.alert("请先选择编制部门!"); return false; }
    var condition = { "isExtend": true, simpleVOs: [] };
    condition.simpleVOs.push({ field: 'mainJobList.dept_id', op: 'eq', value1: changeDept });
    condition.simpleVOs.push({ field: 'enable', op: 'eq', value1: '1.00' });
    this.setFilter(condition);
});
```

## 关键 API

| API | 说明 |
|-----|------|
| `this.setFilter(condition)` | 设置普通参照过滤 |
| `this.setTreeFilter(condition)` | 设置树形参照过滤 |
| `data.cancel = true` | 阻止参照弹窗打开 |
| `cb.utils.triggerReferBrowse(field, conditions)` | 程序化设置参照值 |
