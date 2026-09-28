
# 弹窗与页面通信

## 打开弹窗

```javascript
viewModel.communication({
  type: 'modal',
  payload: {
    url: '/page/supplier-select',
    params: {
      orgId: viewModel.get('orgId').getValue()
    }
  },
  callback: function(data) {
    if (data) {
      // 回填数据
      viewModel.get('supplierId').setValue(data.id);
      viewModel.get('supplierName').setValue(data.name);
    }
  }
});
```

## 打开抽屉

```javascript
viewModel.communication({
  type: 'drawer',
  payload: {
    url: '/page/supplier-detail',
    params: { id: supplierId }
  },
  callback: function(data) {
    // 处理返回数据
  }
});
```

## 页面返回

```javascript
viewModel.communication({
  type: 'return',
  data: {
    id: 'xxx',
    name: 'xxx'
  }
});
```

## 自定义弹窗回填模式

```javascript
// 子页面（弹窗内）
var batchViewModel = viewModel.getCache('batchViewModel');
batchViewModel.setData({
  supplierId: selectedId,
  supplierName: selectedName
});

// 关闭弹窗
viewModel.communication({ type: 'close' });
```

## 禁止事项

```javascript
// ❌ afterOkClick 不是通用返回事件
// 参照弹窗确认用 afterOkClick
// 普通页面关闭用 communication({ type: 'return' })

// ❌ 自定义弹窗不要先引新UI依赖
// 优先用 communication({ type: 'modal' })
// 组件优先复用项目现有 modal 体系
```
