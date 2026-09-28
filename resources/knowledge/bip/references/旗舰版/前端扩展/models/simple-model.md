
# SimpleModel 主表字段操作

## 完整决策流程

```
用户需求（涉及主表字段）
       ↓
查询元数据 (iuap-c-metadata-info) ⚠️ 必须
       ↓
确认字段在主表实体定义
       ↓
根据需求选择操作：
├─ 读取值 → getValue()
├─ 写入值 → setValue()
├─ 显隐控制 → setVisible()
├─ 只读控制 → setReadOnly()
├─ 禁用控制 → setDisabled()
├─ 必填控制 → setState('bIsNull', false)
├─ 值变更联动 → afterValueChange
└─ 校验拦截 → beforeValueChange
```

## 获取字段模型

```javascript
// 获取字段模型
var field = viewModel.get('fieldName');

// 判断字段是否存在
if (field) {
  // 字段存在
}
```

---

## 1. 字段值操作

### API 列表

| API | 说明 |
|-----|------|
| `setValue(value, check?, isCharacter?)` | 设置值 |
| `getValue()` | 获取值 |
| `getData()` | 获取数据（等价于 getValue） |
| `setData(data, isCharacter?)` | 设置数据（内部调用 setValue） |
| `getText(showEmpty?)` | 获取显示文本 |
| `setPrevValue(value)` | 设置前值 |
| `clear(useDefault?)` | 清空字段值 |
| `getDefaultData()` | 获取默认值 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 读取值
    var value = self.get('fieldName').getValue();
    console.log('当前值:', value);

    // 设置值
    self.get('fieldName').setValue('newValue');

    // 获取显示文本
    var textObj = self.get('fieldName').getText();
    if (textObj) {
      console.log('标题:', textObj.title);
      console.log('文本:', textObj.text);
    }

    // 清空字段
    self.get('fieldName').clear(); // 使用默认值
    self.get('fieldName').clear(false); // 不使用默认值，置空

    // 获取默认值
    var defaultValue = self.get('fieldName').getDefaultData();
  }
});
```

**⚠️ 禁止使用 `field.set('value', v)`**

```javascript
// ❌ 错误
self.get('fieldName').set('value', 'newValue');

// ✅ 正确
self.get('fieldName').setValue('newValue');
```

---

## 2. 字段 UI 状态

### API 列表

| API | 说明 |
|-----|------|
| `setReadOnly(value, ctrlName?)` | 设置只读 |
| `setDisabled(value, ctrlName?)` | 设置禁用 |
| `setVisible(value, ctrlName?)` | 设置显隐 |
| `setState(name, value, ctrlName?)` | 设置扩展状态 |
| `getState(name, ctrlName?)` | 获取状态 |
| `setStyle(style)` | 设置样式 |
| `getStyle()` | 获取样式 |
| `setFocus(value)` | 设置焦点 |
| `setValidateMsg(val)` | 设置验证消息 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 设置只读
    self.get('fieldName').setReadOnly(true);

    // 设置禁用（字段置灰且不可编辑）
    self.get('fieldName').setDisabled(true);

    // 设置显隐
    self.get('fieldName').setVisible(false);

    // 设置验证错误
    self.get('fieldName').setValidateMsg({ message: '必填字段' });

    // 设置焦点
    self.get('fieldName').setFocus(true);

    // 设置扩展状态
    self.get('fieldName').setState('bCanModify', true);

    // 设置样式
    self.get('fieldName').setStyle({ backgroundColor: '#ffcccc' });

    // 数据加载后根据条件控制
    self.on('afterLoadData', function() {
      var mode = self.getParams().mode;
      var status = self.get('orderStatus').getValue();

      // 新增模式只读
      if (mode === 'add') {
        self.get('orderCode').setReadOnly(true);
      }

      // 已审核状态禁用
      if (status && status.value === 'APPROVED') {
        self.get('amount').setDisabled(true);
      }
    });
  }
});
```

---

## 3. 字段值变更事件

### afterValueChange

```javascript
cb.define({
  init: function() {
    var self = this;

    self.get('customer').on('afterValueChange', function(data) {
      // ⚠️ data.value 是新值，不是 data.newValue
      var newValue = data.value;
      var oldValue = data.oldValue;

      console.log('新值:', newValue);
      console.log('旧值:', oldValue);

      // 联动清空
      self.get('contact').setValue('');
      self.get('phone').setValue('');
    });
  }
});
```

**⚠️ 常见错误**

```javascript
// ❌ 错误
self.get('field').on('afterValueChange', function(data) {
  var value = data.newValue; // 不存在！
});

// ✅ 正确
self.get('field').on('afterValueChange', function(data) {
  var value = data.value;
});
```

### beforeValueChange（拦截变更）

```javascript
cb.define({
  init: function() {
    var self = this;

    // 拦截字段值变更
    self.get('amount').on('beforeValueChange', function(data) {
      var newValue = data.value;
      if (newValue < 0) {
        cb.utils.alert('金额不能为负数', 'error');
        return false; // 阻止变更
      }
      return true;
    });
  }
});
```

---

## 4. 枚举字段处理

### 枚举值结构

```javascript
{
  value: 'AUDITED',  // 实际值，用于判断
  text: '已审核'     // 显示文本，仅用于展示
}
```

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // ⚠️ 枚举字段判断必须用 .value
    var status = self.get('orderStatus').getValue();

    // ❌ 错误：直接比较
    if (status === 'APPROVED') { }

    // ✅ 正确：比较 value 属性
    if (status && status.value === 'APPROVED') {
      // 已审核状态处理
    }

    // ✅ 正确：判断是否为空
    if (!status || !status.value) {
      cb.utils.alert('请选择订单状态', 'warning');
      return;
    }

    // 设置枚举值
    self.get('orderStatus').setValue({ value: 'DRAFT', text: '草稿' });

    // 获取枚举文本
    var statusValue = self.get('orderStatus').getValue();
    if (statusValue) {
      console.log('状态值:', statusValue.value);
      console.log('状态文本:', statusValue.text);
    }
  }
});
```

---

## 5. 多语字段处理

### 多语值结构

```javascript
{
  zh_CN: '中文文本',
  en_US: 'English text'
}
```

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 设置多语字段值
    self.get('remark').setValue({
      zh_CN: '中文备注',
      en_US: 'English remark'
    });

    // ❌ 错误：设置普通文本到多语字段
    self.get('remark').setValue('普通文本');

    // ✅ 正确：获取值时判断结构
    var remark = self.get('remark').getValue();
    if (typeof remark === 'object') {
      console.log('多语值:', remark.zh_CN);
    } else {
      console.log('普通文本:', remark);
    }
  }
});
```

---

## 6. 特征字段

### 特征字段格式

```
特征组__特征编码
```

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 读取主表特征字段
    var colorFeature = self.get('freeCharacteristics__XXDD001').getValue();
    var sizeFeature = self.get('freeCharacteristics__XXDD002').getValue();

    // 设置主表特征字段
    self.get('freeCharacteristics__XXDD001').setValue({ value: 'RED', text: '红色' });

    // 监听特征字段变更
    self.get('freeCharacteristics__XXDD001').on('afterValueChange', function(data) {
      console.log('颜色特征变更:', data.value);
    });
  }
});
```

---

## 7. 基础数据访问

### API 列表

| API | 说明 |
|-----|------|
| `get(name)` | 从内部数据获取属性 |
| `getParent()` | 获取父模型 |
| `getRootParent()` | 获取根父模型 |
| `getPageBillModel()` | 获取页面单据模型 |
| `getProperty(key)` | 获取属性（公共 API） |
| `setProperty(key, value)` | 设置属性（公共 API） |
| `getFromModel()` | 获取底层模型（参照/列表字段） |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 获取参照字段的底层模型
    var orgIdModel = self.get('orgId');
    var fromModel = orgIdModel.getFromModel();

    // 在底层模型上设置过滤
    fromModel.on('beforeBrowse', function() {
      this.setFilter({
        isExtend: true,
        simpleVOs: [
          { field: 'orgid.enable', op: 'eq', value1: 1 }
        ]
      });
    });

    // 从底层模型获取值
    var orgId = self.get('orgId').getFromModel().getValue();

    // 获取父模型
    var parent = self.get('fieldName').getParent();

    // 获取页面单据模型
    var billModel = self.get('fieldName').getPageBillModel();
  }
});
```

---

## 8. 脏数据管理

### API 列表

| API | 说明 |
|-----|------|
| `setDirty(dirty)` | 设置脏标记 |
| `getDirtyData(necessary?)` | 获取脏数据 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // 设置脏标记
    self.get('fieldName').setDirty(true);

    // 获取脏数据
    var dirtyData = self.get('fieldName').getDirtyData();
    console.log('脏数据:', dirtyData);

    // 获取必要脏数据
    var necessaryDirtyData = self.get('fieldName').getDirtyData(true);
  }
});
```

---

## 禁止事项

| 禁止 | 正确 |
|-----|------|
| `field.set('value', v)` | `field.setValue(v)` |
| `data.newValue` | `data.value` |
| 直接比较枚举值 | `enum.value === 'xxx'` |
| 枚举值判断前非空判断 | `status && status.value === 'xxx'` |
| 传实体名获取子表 | `viewModel.getGridModel('childrenField')` |
