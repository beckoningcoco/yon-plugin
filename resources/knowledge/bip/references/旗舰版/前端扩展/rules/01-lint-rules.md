# Lint Rules - 禁止规则

## ESLint 规则

MDF 框架使用 `@gscm/mdf-lint-rules` 进行代码质量检查。

## 后端调用规范

**⚠️ 公有云项目默认使用 `invokeFunction`**

### invokeFunction（默认方式）

```javascript
// ✅ 正确：公有云默认调用 BIP API 脚本
try {
  cb.rest.invokeFunction('tenantId.package.func', params, function(err, res) {
    if (err) { cb.utils.alert(err.message, 'error'); return; }
    // handle res
  });
} catch (err) {
  cb.utils.alert(err, 'error');
}
```

### setProxy（仅限明确场景）

```javascript
// ⚠️ 仅在以下情况使用：
// 1. 调用外部第三方 API
// 2. 用户明确说明使用 API 脚本/函数
viewModel.setProxy({
  queryData: {
    url: '/external-api/endpoint',
    method: 'POST'
  }
});
```

### 禁止的 API

```javascript
// ❌ 禁止：已废弃
cb.rest.DynamicProxy.create({...});
cb.rest.ajax({...});

// ❌ 禁止：invokeFunction 不能调用外部 URL
cb.rest.invokeFunction('https://external-api.com/xxx', ...);

// ❌ 禁止：Token 由框架统一管理
cb.context.getYhtAccessToken();
cb.utils.getToken();
cb.rest.AppContext.yat;
```

### Token

```javascript
// ❌ 禁止
cb.context.getYhtAccessToken();
cb.utils.getToken();
cb.rest.AppContext.yat;

// 框架内部统一处理
```

### 字段操作

```javascript
// ❌ 禁止
field.set('value', 'newValue');

// ✅ 正确
field.setValue('newValue');
```

### 参照过滤

```javascript
// ❌ 禁止
refer.on('beforeBrowse', function(filter) {
  filter.orgId = '123';
  return filter; // 不生效！
});

// ✅ 正确
refer.on('beforeBrowse', function() {
  this.setFilter({
    isExtend: true,
    simpleVOs: [{ field: 'orgId', op: 'eq', value1: '123' }]
  });
});
```

## 事件参数

```javascript
// ❌ 禁止
field.on('afterValueChange', function(data) {
  var value = data.newValue; // 不存在！
});

// ✅ 正确
field.on('afterValueChange', function(data) {
  var value = data.value;
});
```

## 枚举字段

```javascript
// ❌ 禁止
if (status === 'AUDITED')

// ✅ 正确
if (status && status.value === 'AUDITED')
```

## 子表 childrenField

```javascript
// ❌ 禁止
viewModel.getGridModel('OrderDetail'); // 实体名

// ✅ 正确
viewModel.getGridModel('orderDetails'); // 数据字段名
```

## 主表/子表判定

```javascript
// ❌ 禁止：不查询元数据就臆想字段位置
var field = viewModel.get('supplier'); // 可能是主表也可能是子表

// ✅ 正确：必须先查询元数据判定
// 使用 iuap-c-metadata-info 查询字段所在实体
// 元数据显示字段在主表实体 → SimpleModel
// 元数据显示字段在子表实体 → GridModel
```

## 禁止的循环调用

```javascript
// ❌ 禁止
data.forEach(function(item, i) {
  gridModel.insertRow(i, item);
});

// ✅ 正确
var rows = data.map(function(item) {
  return { ...item, _status: cb.models.DataStates.Insert };
});
gridModel.insertRows(0, rows);
```

## 禁止的遍历

```javascript
// ❌ 禁止
for (let key in obj) {
  console.log(obj[key]);
}

// ✅ 正确
Object.keys(obj).forEach(function(key) {
  console.log(obj[key]);
});
```

## 禁止的 ES2023+ 方法

```javascript
// ❌ 禁止
arr.findLast(x => x > 0);
arr.findLastIndex(x => x > 0);
arr.toReversed();
str.isWellFormed();
str.toWellFormed();
Object.hasOwn(obj, 'key');
Object.groupBy(arr, fn);

// ✅ 正确
[...arr].reverse().find(x => x > 0);
obj.hasOwnProperty('key');
```

## 按钮拦截规则

```javascript
// ❌ 错误：自定义按钮用 viewModel.on 拦截
viewModel.on('beforeclick', function() { }); // 无效！viewModel 上不存在此事件

// ✅ 正确：标准动作用 viewModel.on
viewModel.on('beforeSave', function() { return false; });

// ✅ 正确：自定义按钮用 button.on
viewModel.get('btnCustom').on('beforeclick', function() { return false; });
viewModel.get('btnCustom').on('click', function() { /* 处理逻辑 */ });
```

## 规则速查表

| 规则 ID | 严重级别 | 说明 |
|---------|---------|------|
| `no-metadata-inference` | error | 禁止不查询元数据就臆想主表/子表 |
| `no-proxy-variable` | error | 禁止 DynamicProxy.create |
| `no-deprecated-token` | error | 禁止废弃的 Token 方法 |
| `no-for-funcs-variable` | error | 禁止循环中调用 Grid API |
| `no-nested-on-in-event-callback` | error | 禁止嵌套事件注册 |
| `no-for-in` | error | 禁止 for...in |
| `no-es2023-plus-methods` | error | 禁止 ES2023+ 方法 |
| `no-multi-lang-string` | error | 禁止硬编码中文 |
| `no-horizontal-spacing` | error | 禁止硬编码水平间距 |
| `no-react-legacy-methods` | error | 禁止遗留 React 方法 |
| `no-eval` | error | 禁止 eval |
| `no-wrong-button-intercept` | error | 按钮拦截方式错误 |
