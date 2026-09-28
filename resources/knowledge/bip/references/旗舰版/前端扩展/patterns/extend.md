
# 扩展与加载

## cb.extend 扩展注册

### 扩展类型

| 类型 | 说明 |
|------|------|
| `script` | 脚本扩展 |
| `component` | 组件扩展 |
| `reducer` | Redux reducer扩展 |
| `route` | 路由扩展 |
| `bizAction` | BizAction扩展 |
| `env` | 环境扩展 |
| `i18n` | 多语言扩展 |
| `style` | 样式扩展 |

### 注册扩展

```javascript
// 注册脚本
cb.extend.register({
  type: 'script',
  name: 'custom-script',
  path: '/scripts/custom.js'
});

// 注册BizAction
cb.extend.register({
  type: 'bizAction',
  name: 'customAction',
  action: function(billNo, viewModel, params, beforeAct, afterAct) {
    if (beforeAct && !beforeAct()) return;

    var data = viewModel.getData();
    // 自定义逻辑
    doPrint(data);

    if (afterAct) afterAct();
  }
});
```

### 获取扩展

```javascript
var action = cb.extend.get('bizAction', 'customAction');
var script = cb.extend.get('script', 'custom-script');
```

## cb.loader 资源加载

### runCommandLine

```javascript
// 命令行方式加载
cb.loader.runCommandLine(command, params);

// 常用命令
cb.loader.runCommandLine('view', { billno: 'xxx', billid: 'id' });
cb.loader.runCommandLine('url', { url: '/xxx.html' });
cb.loader.runCommandLine('bill', { billno: 'xxx', id: 'id' });
cb.loader.runCommandLine('list', { billno: 'xxx' });
cb.loader.runCommandLine('newWindow', { url: '/xxx.html' });
cb.loader.runCommandLine('replace', { url: '/xxx.html' });
cb.loader.runCommandLine('preview', { url: '/preview/file', fileType: 'pdf' });
```

### 资源加载

```javascript
// 按域加载资源
cb.loader.loadResourceByDomain(domainKey, resourcePath).then(function(resource) {
  // 使用资源
});

// 加载脚本
cb.loader.loadScript(url).then(function() {
  console.log('脚本已加载');
});

// 加载样式
cb.loader.loadStyle(url).then(function() {
  console.log('样式已加载');
});
```

## cb.require 模块加载

```javascript
// 内部模块加载
cb.requireInner(modulePath, callback);

// 定义内部模块
cb.defineInner(moduleName, factory);
```

## cb.components.engine 解析引擎

```javascript
// 解析容器
var container = cb.components.engine.parseContainer(config);

// 解析控件
var control = cb.components.engine.parseControl(controlConfig);

// 解析多个控件
var controls = cb.components.engine.parseControls(configArray);
```

## 典型场景

### 注册自定义 BizAction

```javascript
cb.extend.register({
  type: 'bizAction',
  name: 'customPrint',
  action: function(billNo, viewModel, params, beforeAct, afterAct) {
    if (beforeAct && !beforeAct()) return;

    var data = viewModel.getData();
    doPrint(data);

    if (afterAct) afterAct();
  }
});
```

### 动态加载组件

```javascript
viewModel.on('afterLoadMeta', function() {
  cb.loader.loadScript('/components/custom-widget.js').then(function() {
    // 组件加载完成后初始化
    initCustomWidget();
  });
});
```

### 动态解析元数据

```javascript
viewModel.on('afterLoadMeta', function() {
  var viewmeta = viewModel.getViewMeta();

  // 解析自定义控件
  var customControls = viewmeta.customControls || [];
  var controls = cb.components.engine.parseControls(customControls);

  // 添加到页面
  controls.forEach(function(ctrl) {
    // 处理控件
  });
});
```

## AI使用建议

- BizAction 扩展用 `cb.extend.register`
- 页面跳转用 `cb.loader.runCommandLine`
- 资源加载用 `cb.loader.loadScript/loadStyle`
- 元数据解析用 `cb.components.engine`
