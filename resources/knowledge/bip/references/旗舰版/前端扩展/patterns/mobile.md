
# 移动端 BizAction

## 移动端特有 Action

### 流程操作

```javascript
var biz = viewModel.biz;
var action = biz.action;

// 提交
action.commit(billNo, viewModel, params, beforeAct, afterAct);

// 审批
action.approve(billNo, viewModel, params, beforeAct, afterAct);

// 驳回
action.reject(billNo, viewModel, params, beforeAct, afterAct);

// 作废
action.abandon(billNo, viewModel, params, beforeAct, afterAct);
```

### 分享

```javascript
// 分享
action.share(billNo, viewModel, params, beforeAct, afterAct);

// 行级分享
action.rowShare(billNo, viewModel, params, beforeAct, afterAct);
```

### 附件

```javascript
// 附件相关操作
action.attachment(billNo, viewModel, params, beforeAct, afterAct);
```

### 移动打印

```javascript
// WIFI打印
action.wifiPrint(billNo, viewModel, params, beforeAct, afterAct);

// 蓝牙打印
action.bluetoothPrint(billNo, viewModel, params, beforeAct, afterAct);
```

### 保存特殊参数

```javascript
action.save(billNo, viewModel, {
  mobileParam: 'xxx'
}, beforeAct, afterAct);
```

## 移动端特有事件

### 分享事件

```javascript
// 分享前
viewModel.on('beforeShare', function(data) {
  // 修改分享参数
  data.params = data.params || {};
  data.params.customField = 'xxx';
  return true;
});

// 分享后
viewModel.on('afterShare', function(data) {
  // 分享后处理
});
```

### EMS 物流事件

```javascript
// 物流列表变更
viewModel.on('emsListChange', function(data) {
  var emsList = data.emsList;
  // 处理物流信息
});
```

## 典型场景

### 分享前注入自定义参数

```javascript
viewModel.on('beforeShare', function(data) {
  data.params = data.params || {};
  data.params.customField = 'xxx';
  return true;
});
```

### 物流信息处理

```javascript
viewModel.on('emsListChange', function(data) {
  var emsList = data.emsList;
  if (emsList && emsList.length > 0) {
    // 显示物流信息
    var firstEms = emsList[0];
    viewModel.get('emsCode').setValue(firstEms.code);
    viewModel.get('emsStatus').setValue(firstEms.status);
  }
});
```

### 移动端打印

```javascript
var printBtn = viewModel.get('btnPrint');
if (printBtn) {
  printBtn.on('click', function() {
    var biz = viewModel.biz;
    var action = biz.action;

    // WIFI打印
    action.wifiPrint(billNo, viewModel, params, function() {
      cb.utils.alert('正在打印...', 'success');
    });
  });
}
```

## AI使用建议

- 移动端 Action 与 PC 端类似
- 移动端特有：分享、WIFI/蓝牙打印、EMS 物流
- 分享参数可通过 `beforeShare` 注入
- EMS 物流查询监听 `emsListChange` 事件
