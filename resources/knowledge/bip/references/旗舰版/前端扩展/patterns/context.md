
# 上下文与配置

## 上下文 Context

### 获取上下文

```javascript
// 获取当前用户
cb.context.getUser().then(function(user) {
  var userId = user.id;
  var userName = user.name;
  var userCode = user.code;
});

// 获取当前组织
cb.context.getOrg().then(function(org) {
  var orgId = org.id;
  var orgName = org.name;
  var orgCode = org.code;
});

// 获取当前租户
cb.context.getTenant().then(function(tenant) {
  var tenantId = tenant.id;
  var tenantName = tenant.name;
});

// 获取当前语言
var locale = cb.context.getLocale();
```

### 多语言

```javascript
// 获取多语言文本
var text = cb.context.getI18n(key);

// 获取格式化文本
var text = cb.context.getI18n(key, { param1: 'xxx' });
```

### 全局数据格式

```javascript
// 获取日期格式
var dateFormat = cb.context.global.getDataFormat('date');

// 获取金额格式
var moneyFormat = cb.context.global.getDataFormat('money');

// 获取数量格式
var numFormat = cb.context.global.getDataFormat('number');

// 获取当前时区
var timezone = cb.context.global.getTimezone();
```

## 环境 Env

### 获取环境信息

```javascript
// 获取服务地址
var serviceUrl = cb.utils.getServiceUrl();

// 获取当前环境
var env = cb.env;

// 获取平台信息
var platform = cb.platform;
```

### 判断环境

```javascript
// 是否移动端
if (cb.env.isMobile) {
  // 移动端逻辑
}

// 是否开发环境
if (cb.env.isDev) {
  // 开发环境逻辑
}

// 是否生产环境
if (cb.env.isProd) {
  // 生产环境逻辑
}
```

## Config 配置

### 获取域编码

```javascript
var domainKey = process.env.__DOMAINKEY__;
```

### 获取应用配置

```javascript
var config = cb.config;
var appCode = config.appCode;
```

## 时间格式与时区

### cb.format

```javascript
// 格式化日期
var dateStr = cb.format.formatDate(date, format);

// 转换时区
var localTime = cb.format.transferDatetimeTimezone(utcTime, targetTimezone);

// 解析日期
var date = cb.format.parseDate(str, format);

// 转换到本地时区
var localDate = cb.format.toLocalTime(utcDate);

// 转换到UTC
var utcDate = cb.format.toUTC(localDate);
```

## 典型场景

### 根据租户显示不同内容

```javascript
viewModel.on('afterLoadMeta', function() {
  cb.context.getTenant().then(function(t) {
    if (t.id === 'tenant1') {
      viewModel.get('fieldA').setState('visible', true);
      viewModel.get('fieldB').setState('visible', false);
    }
  });
});
```

### 根据语言切换提示

```javascript
viewModel.on('afterLoadMeta', function() {
  var locale = cb.context.getLocale();

  var tips = {
    'zh_CN': '请选择',
    'en_US': 'Please select'
  };

  var tip = tips[locale] || tips['zh_CN'];
  viewModel.get('fieldName').setState('placeholder', tip);
});
```

### 根据环境加载不同资源

```javascript
if (cb.env.isDev) {
  // 开发环境使用测试接口
  var apiUrl = 'http://localhost:8080/api';
} else {
  // 生产环境使用正式接口
  var apiUrl = 'https://api.example.com';
}
```

## AI使用建议

- 用户/组织/租户用 `cb.context.getXxx()`
- 多语言用 `cb.context.getI18n()`
- 时间格式用 `cb.format.*`
- 环境判断用 `cb.env.*`
