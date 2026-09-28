
# 页面跳转与弹窗

## 目录结构

```
patterns/page-jump/
├── SKILL.md           # 本文件
├── 页面跳转.md        # runCommandLine
└── 弹窗通信.md       # communication
```

## runCommandLine

### 打开单据

```javascript
// 打开单据
cb.loader.runCommandLine('view', {
  billno: 'saleorder',
  billid: 'xxx',
  mode: 'edit'
});

// 打开单据卡片
cb.loader.runCommandLine('bill', {
  billno: 'saleorder',
  id: 'xxx'
});
```

### 打开URL

```javascript
cb.loader.runCommandLine('url', {
  url: '/xxx/xxx.html',
  params: { key: 'value' }
});
```

### 打开新窗口

```javascript
// 新窗口打开
cb.loader.runCommandLine('newWindow', {
  url: '/xxx/xxx.html'
});

// 替换当前页面
cb.loader.runCommandLine('replace', {
  url: '/xxx/xxx.html'
});
```

### 常用命令

| 命令 | 说明 | 参数 |
|------|------|------|
| `view` | 打开单据 | billno, billid, mode |
| `url` | 打开URL | url, params |
| `bill` | 打开单据卡片 | billno, id |
| `list` | 打开单据列表 | billno |
| `newWindow` | 新窗口打开 | url |
| `replace` | 替换当前页面 | url |

## Modal 弹窗通信

### 打开 Modal 页面

```javascript
viewModel.communication({
  type: 'modal',
  url: '/xxx/modal.html',
  params: { key: 'value' },
  callback: function(data) {
    console.log('modal返回', data);
  }
});
```

### Modal 页面返回

```javascript
// 在 Modal 页面中返回数据
viewModel.communication({
  type: 'return',
  data: { result: 'success', data: {} }
});

// 关闭弹窗
viewModel.communication({ type: 'close' });
```

## 父子页面通信

### 父页面

```javascript
viewModel.communication({
  type: 'modal',
  url: '/subpage.html',
  params: { fromMain: 'value' },
  callback: function(data) {
    if (data) {
      viewModel.get('fieldA').setValue(data.value);
    }
  }
});
```

### 子页面回填

```javascript
// 子页面选择后回填父页面
var parentViewModel = viewModel.getCache('parentViewModel');
if (parentViewModel) {
  parentViewModel.communication({
    type: 'return',
    data: { id: selectedId, name: selectedName }
  });
}
```

### 通知模式

```javascript
// 发送通知
parentViewModel.communication({
  type: 'notify',
  data: { message: 'update' }
});
```

## iframe 集成

### 获取父页面

```javascript
// iframe 中获取父页面
var parentViewModel = cb.getParentViewModel();
```

### 发送消息

```javascript
// 发送消息给父页面
cb.postMessage({
  type: 'xxx',
  data: {}
});
```

## 典型场景

### 点击按钮打开单据

```javascript
viewModel.on('afterLoadMeta', function() {
  var btn = viewModel.get('btnOpenOrder');

  if (btn) {
    btn.on('click', function() {
      var orderId = viewModel.get('orderId').getValue();
      cb.loader.runCommandLine('view', {
        billno: 'saleorder',
        billid: orderId,
        mode: 'edit'
      });
    });
  }
});
```

### Modal 选择后回填

```javascript
viewModel.on('afterLoadMeta', function() {
  var selectBtn = viewModel.get('btnSelectCustomer');

  if (selectBtn) {
    selectBtn.on('click', function() {
      viewModel.communication({
        type: 'modal',
        url: '/customer/select.html',
        params: { multiSelect: false },
        callback: function(data) {
          if (data && data.customer) {
            viewModel.get('customerId').setValue(data.customer.id);
            viewModel.get('customerName').setValue(data.customer.name);
          }
        }
      });
    });
  }
});
```

## 禁止事项

```javascript
// ❌ 不要在事件回调中直接打开页面
viewModel.on('afterSave', function() {
  cb.loader.runCommandLine('view', {...}); // 可能导致问题
});

// ✅ 使用 callback 或 setTimeout
viewModel.on('afterSave', function() {
  setTimeout(function() {
    cb.loader.runCommandLine('view', {...});
  }, 100);
});
```
