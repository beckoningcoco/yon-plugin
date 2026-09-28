
# 缓存与存储

## 目录结构

```
patterns/storage/
├── SKILL.md           # 本文件
├── 全局缓存.md        # cb.cache
├── 本地存储.md        # cb.indexDB
└── 模型缓存.md       # model.setCache
```

## cb.cache 全局缓存

### 基本操作

```javascript
// 设置缓存
cb.cache.set(key, value);

// 获取缓存
var value = cb.cache.get(key);

// 删除缓存
cb.cache.remove(key);

// 清空缓存
cb.cache.clear();
```

### 域基础地址缓存

```javascript
// 获取域基础地址
var baseUrl = cb.cache.getDomainBaseUrl(domainKey);

// 设置域基础地址
cb.cache.setDomainBaseUrl(domainKey, baseUrl);
```

### 模板缓存

```javascript
// 获取模板缓存
var template = cb.cache.getTemplate(templateKey);

// 设置模板缓存
cb.cache.setTemplate(templateKey, template);
```

## model.setCache/getCache 模型缓存

```javascript
var model = viewModel.get('fieldName');

// 设置模型缓存
model.setCache('hasInit', true);
model.setCache('customData', { key: 'value' });

// 获取模型缓存
var hasInit = model.getCache('hasInit');
var customData = model.getCache('customData');

// 清除模型缓存
model.clearCache('hasInit');
```

## cb.indexDB 本地数据库

### 初始化

```javascript
// 打开数据库
cb.indexDB.open(dbName, version).then(function(db) {
  console.log('数据库已打开');
});
```

### 存储数据

```javascript
// 添加数据
cb.indexDB.add(storeName, data).then(function(id) {
  console.log('数据已添加，ID:', id);
});

// 更新数据
cb.indexDB.update(storeName, data).then(function() {
  console.log('数据已更新');
});
```

### 查询数据

```javascript
// 获取单条数据
cb.indexDB.get(storeName, id).then(function(data) {
  console.log('查询结果:', data);
});

// 获取所有数据
cb.indexDB.getAll(storeName).then(function(dataList) {
  console.log('所有数据:', dataList);
});

// 按索引查询
cb.indexDB.getByIndex(storeName, indexName, value).then(function(dataList) {
  console.log('索引查询结果:', dataList);
});
```

### 删除数据

```javascript
// 删除单条数据
cb.indexDB.delete(storeName, id).then(function() {
  console.log('数据已删除');
});

// 清空存储
cb.indexDB.clear(storeName).then(function() {
  console.log('存储已清空');
});
```

## 典型场景

### 防止重复初始化

```javascript
viewModel.on('afterLoadMeta', function() {
  if (!viewModel.getCache('hasInit')) {
    // 初始化逻辑
    initCustomLogic();
    viewModel.setCache('hasInit', true);
  }
});
```

### 缓存查询条件

```javascript
viewModel.on('afterLoadMeta', function() {
  // 从缓存恢复查询条件
  var savedCondition = cb.cache.get('queryCondition');
  if (savedCondition) {
    viewModel.getGridModel().setCondition(savedCondition);
  }
});

viewModel.on('beforeReturn', function() {
  // 保存查询条件
  var condition = viewModel.getGridModel().getCondition();
  cb.cache.set('queryCondition', condition);
});
```

### 离线草稿存储

```javascript
viewModel.on('afterLoadMeta', function() {
  var saveBtn = viewModel.get('btnSave');

  if (saveBtn) {
    saveBtn.on('click', function() {
      cb.indexDB.add('drafts', {
        id: 'draft-001',
        billNo: 'xxx',
        data: viewModel.getData(),
        createTime: new Date()
      }).then(function() {
        cb.utils.alert('数据已暂存，稍后上传', 'success');
      });
    });
  }
});

// 加载草稿
cb.indexDB.get('drafts', 'draft-001').then(function(draft) {
  if (draft) {
    viewModel.setData(draft.data);
    cb.utils.alert('草稿已加载', 'success');
  }
});
```

## AI使用建议

- 临时缓存用 `model.setCache/getCache`
- 跨页面缓存用 `cb.cache`
- 持久化存储用 `cb.indexDB`
- 防重复初始化用缓存标记
