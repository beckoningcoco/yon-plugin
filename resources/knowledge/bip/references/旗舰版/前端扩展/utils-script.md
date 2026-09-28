# MDF 工具脚本规范

## 概述

本文档提供 MDF 前端扩展开发中常用的工具脚本，分为以下类别：

| 类别 | 说明 |
|------|------|
| [模型操作](#模型操作) | viewModel/GridModel 核心 API |
| [字符串操作](#字符串操作) | 字符串处理函数 |
| [格式转换](#格式转换) | JSON/字符串互转 |
| [URL/参数](#url参数) | URL 参数解析 |
| [验证类](#验证类) | 邮箱/Guid 验证 |
| [日期比较](#日期比较) | 日期判断 |
| [调试工具](#调试工具) | ⚠️ 仅开发环境使用 |

---

## 模型操作

### 获取页面全部数据

```javascript
// 获取 viewModel 全部数据
const data = viewModel.getAllData();

// 获取 GridModel 全部数据
const gridModel = viewModel.getGridModel('childrenField');
const gridData = gridModel.getAllData();
```

### 获取组件值

```javascript
// 获取字段值
const value = viewModel.get('fieldCode').getValue();

// 获取布尔值（带默认值）
const flag = viewModel.get('showForbidden').getValue() || false;
```

### 给组件赋值

```javascript
// 设置字段值
viewModel.get('fieldCode').setValue('newValue');

// 设置数字
viewModel.get('rechargeAmount').setValue(0);
```

### 组件显隐

```javascript
// 隐藏控件
viewModel.get('fieldCode').setVisible(false);

// 显示控件
viewModel.get('fieldCode').setVisible(true);
```

### 设置数据集

```javascript
// 设置 GridModel 数据
const gridModel = viewModel.getGridModel('childrenField');
gridModel.setDataSource(dataArray);
```

### 获取查询区模型

```javascript
// ✅ 正确写法
const filterVM = viewModel.getFilterViewModel();

// ⚠️ 不推荐（频率高但不是标准写法）
// const filterVM = viewModel.getCache('FilterViewModel');
```

---

## 字符串操作

### 替换

```javascript
const str = "Hello, world!";
const result = str.replace("world", "yonyou");  // "Hello, yonyou!"
```

### 分割

```javascript
const str = "today-is-Tuesday";
const arr = str.split("-");  // ["today", "is", "Tuesday"]

// 限制长度
const arr2 = str.split("-", 2);  // ["today", "is"]
```

### 拼接

```javascript
const arr = ['A', 'B', 'C'];
const str = arr.join("-");  // "A-B-C"
```

### 包含判断

```javascript
const str = "Hello world";
const has = str.includes("world");  // true
```

### 去除空白

```javascript
const str = "   yonbuilder   ";
const trimmed = str.trim();  // "yonbuilder"
```

### 截取

```javascript
const str = "Hello world!";
const sub = str.substring(3);  // "lo world!"
const sub2 = str.substring(0, 5);  // "Hello"
```

---

## 格式转换

### JSON 转字符串

```javascript
const obj = { name: "Bill Gates", age: 62 };
const str = JSON.stringify(obj);
// "{\"name\":\"Bill Gates\",\"age\":62}"
```

### 字符串转 JSON

```javascript
const str = '{"name":"Bill Gates","age":62}';
const obj = JSON.parse(str);
// { name: "Bill Gates", age: 62 }
```

### 首字母大写

```javascript
const capitalize = ([first, ...rest]) => first.toUpperCase() + rest.join('');

capitalize('fooBar');  // 'FooBar'
```

### 每个单词首字母大写

```javascript
const capitalizeEveryWord = str => str.replace(/\b[a-z]/g, char => char.toUpperCase());

capitalizeEveryWord('hello world!');  // 'Hello World!'
```

---

## URL参数

### 获取 URL 参数

```javascript
// URL: https://example.com/page?id=001&name=test
function getQueryString(name) {
  var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
  var r = window.location.search.substr(1).match(reg);
  if (r != null) return unescape(r[2]);
  return "";
}

getQueryString('id');  // "001"
getQueryString('name');  // "test"
```

### 数字前补零

```javascript
function prefixInteger(num, length) {
  return (num / Math.pow(10, length)).toFixed(length).substr(2);
}

prefixInteger(123, 10);  // "0000000123"
```

---

## 验证类

### 邮箱验证

```javascript
function validateEmail(str) {
  return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(str);
}

validateEmail('test@example.com');  // true
```

### 生成随机码

```javascript
function S4() {
  return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

S4();  // "3f2a"
```

### 生成 Guid

```javascript
function guid() {
  return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
}

guid();  // "60147312-33ec-968e-6eb2-901f4ebdbcd4"
```

---

## 日期比较

### 是否晚于

```javascript
const isAfterDate = (dateA, dateB) => dateA > dateB;

isAfterDate(new Date(2010, 10, 21), new Date(2010, 10, 20));  // true
```

### 是否早于

```javascript
const isBeforeDate = (dateA, dateB) => dateA < dateB;

isBeforeDate(new Date(2010, 10, 20), new Date(2010, 10, 21));  // true
```

---

## 调试工具

⚠️ **警告**：以下工具仅在开发/调试环境使用，禁止提交到生产代码。

### 打印日志

```javascript
// ⚠️ 生产环境禁止使用 console
console.log("debug info");
console.error("error message");
```

### 断点调试

```javascript
// ⚠️ 仅开发环境使用
debugger;
```

### 动态加载 JS

```javascript
// ⚠️ 仅开发环境使用
var script = document.createElement("script");
script.setAttribute("type", "text/javascript");
script.setAttribute("src", "/path/to/script.js");
document.body.insertBefore(script, document.body.lastChild);
```

### 动态加载 CSS

```javascript
// ⚠️ 仅开发环境使用
var link = document.createElement("link");
link.setAttribute("type", "text/css");
link.setAttribute("rel", "stylesheet");
link.setAttribute("href", "/path/to/style.css");
document.head.appendChild(link);
```

---

## 禁止的写法

| 禁止 | 正确 |
|------|------|
| `invokeFunction` | `setProxy` |
| `cb.rest.DynamicProxy.create` | `viewModel.setProxy` |
| `cb.rest.ajax` | `viewModel.setProxy` |
| `field.set('value', v)` | `field.setValue(v)` |
| `refer.on('beforeBrowse', fn) { return filter; }` | `this.setFilter({...})` |

详细规则见 [01-lint-rules.md](rules/01-lint-rules.md)
