
# 消息提示与快捷键

## 消息提示

### alert

```javascript
cb.utils.alert(message, type)

// 类型：success, error, warning, info
cb.utils.alert('操作成功', 'success');
cb.utils.alert('操作失败', 'error');
cb.utils.alert('警告信息', 'warning');
cb.utils.alert('提示信息', 'info');
```

### 结构化 alert

```javascript
cb.utils.alert({
  title: '错误',
  message: '详细错误信息',
  duration: 5000
});
```

### confirm

```javascript
cb.utils.confirm(message, callback)

cb.utils.confirm('确认删除吗?', function() {
  // 用户点击确定
  doDelete();
});
```

## 快捷键

### 注册动作

```javascript
// 注册动作
cb.shortcut.registerAction({
  key: 'ctrl+s',
  action: function() {
    viewModel.execute('save');
  },
  description: '保存'
});

// 注册命令
cb.shortcut.registerCommand({
  key: 'ctrl+d',
  command: function() {
    doSomething();
  }
});
```

### 常用快捷键

| 快捷键 | 说明 | 示例 |
|--------|------|------|
| `ctrl+s` | 保存 | 保存当前单据 |
| `ctrl+n` | 新增 | 新增单据 |
| `ctrl+d` | 删除 | 删除选中 |
| `esc` | 取消 | 取消编辑 |
| `enter` | 确认 | 确认操作 |

### 移除快捷键

```javascript
cb.shortcut.unregisterAction('ctrl+s');
cb.shortcut.unregisterCommand('ctrl+d');
cb.shortcut.unregisterAll();
```

## 典型场景

### 表单保存快捷键

```javascript
viewModel.on('afterLoadMeta', function() {
  cb.shortcut.registerAction({
    key: 'ctrl+s',
    action: function() {
      viewModel.execute('save');
    },
    description: '保存'
  });
});

viewModel.on('beforeClose', function() {
  cb.shortcut.unregisterAction('ctrl+s');
});
```

### 删除确认

```javascript
viewModel.on('afterLoadMeta', function() {
  var deleteBtn = viewModel.get('btnDelete');

  if (deleteBtn) {
    deleteBtn.on('click', function() {
      cb.utils.confirm('确认删除选中的数据?', function() {
        var gridModel = viewModel.getGridModel();
        var selected = gridModel.getSelectedRowIndexes();

        if (selected && selected.length > 0) {
          gridModel.deleteRows(selected);
          cb.utils.alert('删除成功', 'success');
        }
      });
    });
  }
});
```

### 表单校验提示

```javascript
viewModel.on('beforeSave', function() {
  var fieldA = viewModel.get('fieldA').getValue();

  if (!fieldA) {
    cb.utils.alert({
      title: '校验失败',
      message: '字段A不能为空'
    });
    return false;
  }

  return true;
});
```

## 批量操作确认

```javascript
viewModel.on('beforeBatchDelete', function() {
  var gridModel = viewModel.getGridModel();
  var selected = gridModel.getSelectedRows();

  if (selected.length > 10) {
    cb.utils.confirm('确认删除' + selected.length + '条数据?', function() {
      // 执行批量删除
    });
    return false;
  }

  return true;
});
```

## 禁止事项

```javascript
// ❌ 硬编码中文提示
cb.utils.alert('操作成功');

// ✅ 使用 i18n
cb.utils.alert(cb.lang.templateByUuid('UID:xxx', '操作成功'));
```

## 快捷键类型

| 类型 | 说明 |
|------|------|
| `registerAction` | 注册动作，与业务逻辑绑定 |
| `registerCommand` | 注册命令，执行函数 |
| `registerKeydown` | 注册按键事件 |

## 页面离开时清理

```javascript
viewModel.on('beforeClose', function() {
  // 清理快捷键
  cb.shortcut.unregisterAll();
  return true;
});
```
