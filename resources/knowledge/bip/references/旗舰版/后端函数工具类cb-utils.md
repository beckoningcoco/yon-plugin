---
name: 后端函数工具类cb-utils
description: >
  用友 BIP 客开技能。当用户需要使用 cb.utils 工具类（isArray、extend、isEmpty、getNewId、stringToJSON、alert、confirm、isEmptyObject、loadingControl、queryString）和同步块 cb.rest.invokeFunction 时，参考该文档内容。
---

# 后端函数工具类 cb.utils

## cb.utils.isArray(data)

判断是否为数组，返回 Boolean。

```js
var isArry = cb.utils.isArray([1,2,3,4]); // => true
```

## cb.utils.extend(deep, target, obj)

拷贝对象/数组。deep=true 为深拷贝。

```js
var a = {a1:{a11:2}};
var b = cb.utils.extend(true, {}, a);
b.a1.a11 = 3;
// a => {a1:{a11:2}} ; b => {a1:{a11:3}}
```

## cb.utils.isEmpty(value)

判空，返回 Boolean。

```js
cb.utils.isEmpty('');   // => true
cb.utils.isEmpty(null); // => true
cb.utils.isEmpty(1);    // => false
```

## cb.utils.getNewId(prefix)

根据前缀返回递增 ID。

```js
var a = cb.utils.getNewId('yxy'); // => "yxy_1"
var b = cb.utils.getNewId('yxy'); // => "yxy_2"
```

## cb.utils.stringToJSON(value)

JSON 字符串转对象。

```js
const json = cb.utils.stringToJSON(value);
```

## cb.utils.alert(msg, type)

弹窗提示。type: error | warning | info | success。

```js
cb.utils.alert('错误信息提示', 'error');
```

## cb.utils.confirm(msg, success, cancel)

确认框提示。

```js
cb.utils.confirm('确定删除吗?',
  () => { /* 确定回调 */ },
  () => { /* 取消回调 */ }
);
```

## cb.utils.isEmptyObject(data)

判断是否为空对象。

```js
cb.utils.isEmptyObject({a:1}); // => false
cb.utils.isEmptyObject({});    // => true
```

## 开启/关闭 loading

```js
cb.utils.loadingControl.start(); // 开启
cb.utils.loadingControl.end();   // 关闭
```

## cb.utils.queryString()

处理 GET 请求参数。

```js
var qs = new cb.utils.queryString('www.baidu.com?a=1&b=2');
qs.get('a');   // => "1"
qs.set('c', 3);
qs.has('a');   // => true
qs.del('a');
qs.query;      // => {a: "1", b: "2"}
```

## cb.rest.invokeFunction 同步调用

```js
let result = cb.rest.invokeFunction(
    "GT102500AT53.backApi.queryOrgAndDept",
    { userId: user.userId },
    function(err, res) {},
    viewModel,
    { async: false }
);
```

## 其他常用方法

- `cb.utils.getFullNum(num)` — 科学计数法转数字
- `cb.utils.removeEmplyAttr(obj)` — 删除对象中空值
