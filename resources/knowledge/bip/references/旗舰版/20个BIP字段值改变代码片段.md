---
name: 20个BIP字段值改变代码片段
description: >
  用友 BIP 客开技能。当用户需要编写字段值改变事件页面脚本，包括 afterValueChange 联动赋值/显隐控制、afterCellValueChange 表格单元格改变、beforeValueChange 改变前校验、参照字段选择/确认事件、查询区字段联动等场景时，参考该文档内容。
---

# 20个BIP字段值改变代码片段

## afterValueChange — 字段值改变后

### 1. 基础事件绑定

```javascript
viewModel.get('taxpayerId_name').on('afterValueChange', function(data) {
    console.log('新值:', data.value);
    console.log('旧值:', data.oldValue);
});
```

### 2. 联动赋值

```javascript
viewModel.get('code').on('afterValueChange', function(data) {
    const code = viewModel.get('code').getValue();
    viewModel.get('remark').setValue(code);
});
```

### 3. 控制字段显隐

```javascript
viewModel.get('channelCustomer').on('afterValueChange', function(data) {
    if (data.value.value == '1') {
        viewModel.get('storeDefineCharacter__ZDSQ01').setVisible(true);
    } else {
        viewModel.get('storeDefineCharacter__ZDSQ01').setVisible(false);
    }
});
```

### 4. 控制字段禁用

```javascript
viewModel.get('merchantCharacter').get('I_FM_XX_D_PF001').on('afterValueChange', function(data) {
    var value = data.value.value;
    if (value === 'true') {
        viewModel.get("merchantCharacter__I_FM_XX_D_PF002").setDisabled(false);
    } else {
        viewModel.get("merchantCharacter__I_FM_XX_D_PF002").setDisabled(true);
    }
});
```

### 5. 调用后端接口查询数据

```javascript
viewModel.get('projectOper_name').on('afterValueChange', function(data) {
    let staffId = viewModel.get('projectOper').getValue();
    cb.rest.invokeFunction('cdgdkk.apiScript.getStaffPhone', { staffId: staffId }, function(err, res) {
        if (res.data.length > 0) {
            viewModel.get('projectOperPhone').setValue(res.data[0].mobile);
        }
    });
});
```

### 6. 批量回填多个字段

```javascript
viewModel.get('staffId_name').on('afterValueChange', function(data) {
    const proxy = viewModel.setProxy({
        getStaffData: { url: '/staff/queryDetailInfoByStaffId', method: 'Post', options: { async: false } }
    });
    let result = proxy.getStaffData({ id: viewModel.get('staffId').getValue() });
    if (result.status == '200') {
        if (result.data.byyxzg) viewModel.get('byxx').setValue(result.data.byyxzg);
        if (result.data.xb) viewModel.get('sex').setValue(result.data.xb);
    }
});
```

### 7. 校验并清空无效数据

```javascript
viewModel.get('supplier_name').on('afterValueChange', function(data) {
    var supplier = viewModel.get('supplier').getValue();
    if (supplier) {
        cb.rest.invokeFunction('functionId', { supplier: supplier }, function(err, res) {
            if (res.id === '') {
                cb.utils.alert('供应商银行账户非启用状态!');
                viewModel.get('supplier_name').setValue('');
                viewModel.get('supplier').setValue('');
            }
        });
    }
});
```

### 8. 批量控制字段状态

```javascript
viewModel.get('inputtype').on('afterValueChange', function(data) {
    let inputtype = viewModel.get('inputtype').getValue();
    let fields = ['purorg_name', 'purdate', 'revcomp', 'revaccount', 'currtype'];
    fields.forEach(field => {
        viewModel.get(field).setState('bCanModify', inputtype != '2');
        viewModel.get(field).setState('disabled', inputtype == '2');
    });
});
```

## afterCellValueChange — 表格值改变

### 9. 表格单元格改变后计算汇总

```javascript
viewModel.getGridModel('yanfuy_paydtlList').on('afterCellValueChange', function(data) {
    if (data.cellName === 'total') {
        let money = 0;
        viewModel.getGridModel('yanfuy_paydtlList').getRows().forEach(row => { money += row.total; });
        viewModel.get('money').setValue(money);
    }
});
```

### 10. 表格参照改变后联动其他列

```javascript
viewModel.get('packSchemeDetailList').getEditRowModel()
    .get('material_class_id_name').on('afterValueChange', function(data) {
    let index = viewModel.getGridModel().getFocusedRowIndex();
    if (cb.utils.isEmpty(data.value)) {
        viewModel.getGridModel().setCellValue(index, 'backpack', null);
        return;
    }
    viewModel.getGridModel().setCellValue(index, 'backpack', 0);
});
```

### 11. 表格改变后批量设置行数据

```javascript
viewModel.getGridModel('merchantsBasePriceManagement_bList').on('afterCellValueChange', function(data) {
    if (data.cellName == 'assetName_equip_name') {
        let fields = ['line_name', 'line', 'station', 'region'];
        fields.forEach(field => {
            viewModel.getGridModel('list').setCellValue(data.rowIndex, field, data.value.userDefines[field]);
        });
    }
});
```

### 12. 明细表值改变后计算本币金额

```javascript
adjustAmountDetailList.on("afterCellValueChange", function(data) {
    var exchangeRate = viewModel.get('exchangeRate').getValue();
    var rows = adjustAmountDetailList1.getRows();
    for (let j = 0; j < rows.length; j++) {
        if (data.cellName == "moneyAmount") {
            var val = rows[j].moneyAmount;
            var baseCurrency = val ? Math.round(val * exchangeRate * 100) / 100 : 0;
            adjustAmountDetailList1.setCellValue(j, 'moneyAmountBaseCurrency', baseCurrency, true);
        }
    }
});
```

## beforeValueChange — 值改变前

### 13. 改变前确认

```javascript
viewModel.get("changeDept_name").on('beforeValueChange', function(data) {
    var changeDeptId = viewModel.get("changeDept").getValue();
    var compilePerson = viewModel.get("changePerson_name").getValue();
    if (changeDeptId && data.value && changeDeptId != data.value.id && compilePerson != "") {
        let promise = new cb.promise();
        cb.utils.confirm("改变部门将清空【调整人】，是否继续？",
            function() { viewModel.get("changePerson_name").setValue(""); return promise.resolve(); },
            function() { promise.reject(); }
        );
        return promise;
    }
});
```

### 14. 改变前阻止变更

```javascript
viewModel.get("meetType_docName").on('beforeValueChange', function(data) {
    if (!check3Value()) { return false; }
});
```

## 参照字段特殊事件

### 15. 参照选择确认后回填

```javascript
taskSource_docName_obj.on('afterReferOkClick', function(data) {
    let rowIndex = viewModel.get("ScaptoMeetTopicList").getFocusedRowIndex();
    viewModel.get("ScaptoMeetTopicList").setCellValue(rowIndex, "taskSourceName", data[0].docName, false);
});
```

## 查询区字段联动

### 16. 查询区字段值改变联动格式

```javascript
datatype.getFromModel().on('afterValueChange', function(data) {
    var dtcode = data.value.dt_code;
    var format = ('annual' === dtcode) ? 'YYYY' : 'YYYY-MM';
    searchModel.execute('updateViewMeta', { code: 'dataPeriod', cFormatData: format });
});
```

## 复杂场景

### 17. 值改变后删除并重新插入表格数据

```javascript
viewModel.get('filing_assetValuationTile').on('afterValueChange', function(data) {
    cb.rest.invokeFunction('module.function', { id: data.value.id }, function(err, res) {
        viewModel.getGridModel('list').deleteAllRows();
        viewModel.getGridModel('list').insertRows(res.res.length, res.res);
    });
});
```

### 18. 评估机构值改变后维护子表

```javascript
viewModel.get('evalOrg_evalOrgName').on('afterValueChange', function(event) {
    let orgData = event.value;
    let newRow = { evalOrg: orgData.id, evalOrg_evalOrgName: orgData.evalOrgName };
    let evalOrgList = viewModel.get('ScapaaEvalorgInfoList');
    evalOrgList.getRows().forEach((item, index) => {
        if (item.winEvalOrg == '1') evalOrgList.deleteRows([index]);
    });
    evalOrgList.insertRow(0, newRow);
});
```

### 19. 投资类型值改变后控制表格列状态

```javascript
viewModel.get("investmentType_docName").on('afterValueChange', function(data) {
    var isEquity = viewModel.get("investmentType_docName").getValue() === "股权投资";
    var fields = ['item118lh', 'orgTotalInvestment'];
    fields.forEach(field => {
        investmentPlanProjectModel.setColumnState(field, 'bIsNull', !isEquity);
        investmentPlanProjectModel.setColumnState(field, 'bShowIt', isEquity);
    });
});
```

## 关键 API

| API | 说明 |
|-----|------|
| `viewModel.get('xxx').on('afterValueChange', fn)` | 字段值改变后 |
| `viewModel.get('xxx').on('beforeValueChange', fn)` | 字段值改变前（支持 promise 拦截） |
| `gridModel.on('afterCellValueChange', fn)` | 表格单元格值改变后 |
| `data.cellName` / `data.rowIndex` / `data.value` | 单元格改变事件参数 |
| `gridModel.setCellValue(index, field, value)` | 设置单元格值 |
| `gridModel.setColumnState(field, 'bShowIt', bool)` | 控制列显隐 |
| `gridModel.setColumnState(field, 'bIsNull', bool)` | 控制列必填 |
