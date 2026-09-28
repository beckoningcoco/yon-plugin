# MDF参照过滤

## 页面加载后设置查询条件

```javascript
viewModel.on('afterLoadData', function (args) {
    const vendorId = viewModel.get('vendor').getValue();

    if (vendorId) {
        fetchVendorMaterials(viewModel, vendorId);
    }
});
```

## 监听值变化

```javascript
viewModel.get('vendor_name').on('afterValueChange', function (data) {
    const vendorId = data.value.id;

    if (vendorId) {
        fetchVendorMaterials(viewModel, vendorId);
    } else {
        viewModel.setCache('allowedMaterialIds', []);
    }
    clearMaterialInfo(viewModel);
});
```

## 获取子表gridModel

```javascript
const gridModel = viewModel.get('purchaseOrders');
```

## 清空参照选择的值

```javascript
function clearMaterialInfo(viewModel) {
    const rows = gridModel.getRows();
    rows.forEach((row, index) => {
        gridModel.setCellValue(index, 'product', null);
        gridModel.setCellValue(index, 'product_cCode', null);
        gridModel.setCellValue(index, 'product_cName', null);
        gridModel.setCellValue(index, 'productsku', null);
        gridModel.setCellValue(index, 'materialClassId', null);
    });
}
```

## 调用后端接口获取过滤参数

```javascript
function fetchVendorMaterials(viewModel, vendorId) {
    var url = '/pu/purchaseorder/queryMaterialsByVendor';
    var proxy = cb.rest.DynamicProxy.create({
        ensure: {
            url: url,
            method: 'GET',
            options: {
                async: true,
                domainKey: 'c-kk-fn-aicoding',
            },
        },
    });

    const params = { vendorId: vendorId };
    proxy.ensure(params, function (err, result) {
        const materialIds = result;
        viewModel.setCache('allowedMaterialIds', materialIds);
    });
}
```

## 主表参照过滤

```javascript
viewModel?.get('product_cCode')?.on('beforeBrowse', function (data) {
    const vendorId = viewModel.get('vendor').getValue();

    if (!vendorId) {
        cb.utils.alert('请先选择供应商', 'warning');
        return false;
    }

    const materialIds = viewModel.getCache('allowedMaterialIds');
    if (materialIds && materialIds.length > 0) {
        const filter = {
            isExtend: true,
            simpleVOs: [
                {
                    field: 'id',
                    op: 'in',
                    value1: materialIds.join(','),
                },
            ],
        };
        this.setFilter(filter);
    } else {
        const filter = {
            isExtend: true,
            simpleVOs: [
                { field: 'id', op: 'eq', value1: '-1' },
            ],
        };
        this.setFilter(filter);
    }
});
```

## 子表参照过滤

```javascript
gridModel?.getEditRowModel()?.get('product_cCode')?.on('beforeBrowse', function (data) {
    const vendorId = viewModel.get('vendor').getValue();

    if (!vendorId) {
        cb.utils.alert('请先选择供应商', 'warning');
        return false;
    }

    const materialIds = viewModel.getCache('allowedMaterialIds');
    if (materialIds && materialIds.length > 0) {
        const filter = {
            isExtend: true,
            simpleVOs: [
                { field: 'id', op: 'in', value1: materialIds.join(',') },
            ],
        };
        this.setFilter(filter);
    } else {
        const filter = {
            isExtend: true,
            simpleVOs: [
                { field: 'id', op: 'eq', value1: '-1' },
            ],
        };
        this.setFilter(filter);
    }
});
```

## 过滤条件格式

```javascript
const filter = {
    isExtend: true,
    simpleVOs: [
        {
            field: '字段名',
            op: '操作符',  // eq, in, like, not_eq 等
            value1: '值',
        },
    ],
};

// 表型参照
this.setFilter(filter);

// 树形参照
this.setTreeFilter(filter);
```

## 常用操作符

| 操作符 | 说明 |
|--------|------|
| `eq` | 等于 |
| `in` | 包含（多个值逗号分隔） |
| `like` | 模糊匹配 |
| `not_eq` | 不等于 |
| `not_in` | 不包含 |