# Backend Query - 后端接口调用

## 调用决策流程

```
┌─────────────────────────────────────────────────────────────┐
│                    判断调用方式                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 明确说"调用Java后端"、"三方接口"、"外部API"              │
│     ↓                                                       │
│     使用 Java 后端接口（具体方式由用户提供）                   │
│                                                             │
│  2. 明确说"API脚本"、"函数"、"invokeFunction"                │
│     ↓                                                       │
│     使用 setProxy 调用外部 API                                │
│                                                             │
│  3. 公有云 + 未明确说明调用方式 ⚠️ 默认                       │
│     ↓                                                       │
│     使用 invokeFunction 调用 API 脚本                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 模式一：invokeFunction（默认方式）

**适用场景**：公有云项目，调用 BIP 后端 Java 工程提供的 API 脚本

### 标准写法

```javascript
try {
  cb.rest.invokeFunction(
    'API脚本标识',      // 例如: 'AT1D447CBE04A8000B.apiMenu.AgentInvoice'
    {                   // 请求参数
      name: 'yonyou'
    },
    function(err, res) {  // 回调函数
      if (err) {
        cb.utils.alert(err.message, 'error');
      } else {
        // 处理返回数据
        viewModel.get('fieldA').setValue(res.data);
      }
    }
  );
} catch (err) {
  cb.utils.alert(err, 'error');
}
```

### 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| API脚本标识 | 格式: `租户ID.包名.函数名` | `AT1D447CBE04A8000B.apiMenu.AgentInvoice` |
| 请求参数 | JSON 对象 | `{ name: 'value' }` |
| 回调函数 | (err, res) => {} | 处理返回结果 |

### 典型场景

#### 查询数据

```javascript
try {
  cb.rest.invokeFunction(
    '租户ID.包名.queryApi',
    {
      id: id
    },
    function(err, res) {
      if (err) {
        cb.utils.alert(err.message, 'error');
        return;
      }
      if (res.success) {
        viewModel.get('name').setValue(res.data.name);
      }
    }
  );
} catch (err) {
  cb.utils.alert(err, 'error');
}
```

#### 保存数据

```javascript
try {
  cb.rest.invokeFunction(
    '租户ID.包名.saveApi',
    {
      name: viewModel.get('name').getValue(),
      amount: viewModel.get('amount').getValue()
    },
    function(err, res) {
      if (err) {
        cb.utils.alert(err.message, 'error');
        return;
      }
      cb.utils.alert('保存成功', 'success');
    }
  );
} catch (err) {
  cb.utils.alert(err, 'error');
}
```

---

## 模式二：setProxy（仅限明确场景）

**适用场景**：调用外部第三方 API、需要自定义 HTTP 请求

### 定义代理

```javascript
viewModel.on('afterLoadMeta', function() {
  viewModel.setProxy({
    queryData: {
      url: '/api/query',
      method: 'POST',
      options: { mask: true, uniform: true }
    }
  });
});
```

### 调用代理

```javascript
var proxy = viewModel.getProxy('queryData');
proxy.ensure({
  param1: 'value1'
}, function(resp) {
  if (resp.success) {
    viewModel.get('fieldA').setValue(resp.data);
  }
}, function(resp) {
  cb.utils.alert('查询失败', 'error');
});
```

---

## 禁止的写法

| 禁止 | 说明 |
|------|------|
| `cb.rest.DynamicProxy.create()` | 已废弃 |
| `cb.rest.ajax()` | 已废弃 |
| `cb.rest.invokeFunction()` + 外部 URL | 只能调用内部 API 脚本 |
| `cb.context.getYhtAccessToken()` | Token 由框架统一管理 |
| `cb.utils.getToken()` | Token 由框架统一管理 |

---

## 常见错误

### 错误 1：跨域调用

```javascript
// ❌ 错误：invokeFunction 不能调用外部 URL
cb.rest.invokeFunction('https://external-api.com/xxx', ...)

// ✅ 正确：外部 API 使用 setProxy 或 jQuery.ajax
```

### 错误 2：未 try-catch

```javascript
// ❌ 错误：缺少异常处理
cb.rest.invokeFunction('api', params, callback)

// ✅ 正确：添加 try-catch
try {
  cb.rest.invokeFunction('api', params, callback);
} catch (err) {
  cb.utils.alert(err, 'error');
}
```

### 错误 3：回调内未处理 err

```javascript
// ❌ 错误：未检查错误
function(err, res) {
  viewModel.get('name').setValue(res.data);  // err 可能不为空
}

// ✅ 正确：先检查 err
function(err, res) {
  if (err) {
    cb.utils.alert(err.message, 'error');
    return;
  }
  viewModel.get('name').setValue(res.data);
}
```
