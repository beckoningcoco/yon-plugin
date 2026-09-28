
# 字段联动模式

## 目录结构

```
patterns/
├── SKILL.md              # 本文件
├── field-linkage/         # 字段联动
│   ├── SKILL.md
│   └── 字段联动.md
├── grid-linkage/          # 表格联动
│   └── SKILL.md
├── backend-query/         # 后端查询
│   ├── SKILL.md
│   └── 接口调用.md
├── modal/                # 弹窗通信
│   ├── SKILL.md
│   └── communication.md
└── common-patterns/       # 公共模式
    └── SKILL.md
```

## 基础联动

```javascript
viewModel.on('afterLoadMeta', function() {
  var fieldA = viewModel.get('fieldA');

  fieldA.on('afterValueChange', function(data) {
    var value = data.value;
    var oldValue = data.oldValue;

    // 联动设置 fieldB
    var fieldB = viewModel.get('fieldB');
    fieldB.setValue(computeValue(value));

    // 清空 fieldC
    var fieldC = viewModel.get('fieldC');
    fieldC.setValue(null);
  });
});
```

## 枚举字段联动

```javascript
fieldA.on('afterValueChange', function(data) {
  var fieldB = viewModel.get('fieldB');

  // 枚举值判断
  if (data.value && data.value.value === 'TYPE_A') {
    fieldB.setValue('defaultValue');
    fieldB.setDisabled(true);
  } else {
    fieldB.setDisabled(false);
  }
});
```

## 异步联动（带接口调用）

```javascript
fieldA.on('afterValueChange', function(data) {
  var fieldB = viewModel.get('fieldB');

  // 调用接口获取数据
  viewModel.communication({
    type: 'post',
    url: '/api/getFieldBValue',
    data: { fieldA: data.value },
    callback: function(resp) {
      if (resp.success) {
        fieldB.setValue(resp.data.value);
      }
    }
  });
});
```

## 联动与校验

```javascript
fieldA.on('afterValueChange', function(data) {
  var fieldB = viewModel.get('fieldB');

  if (!data.value) {
    // 清空并校验
    fieldB.setValue(null);
    fieldB.setRequired(true);
    fieldB.resetServiceData();
  }
});
```

## 禁止事项

```javascript
// ❌ 错误：afterValueChange 中使用 newValue
field.on('afterValueChange', function(data) {
  var value = data.newValue; // 不存在！
});

// ✅ 正确
field.on('afterValueChange', function(data) {
  var value = data.value;
});
```
