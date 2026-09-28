# 元数据集成

## 强制前置

**⚠️ 任何 MDF 前端扩展开发前，必须先查询元数据**

## 使用 iuap-c-metadata-info

必须查询以下信息：

### 1. 字段位置

判断字段是主表还是子表：
- 主表字段：直接在 ViewModel 上操作
- 子表字段：需要通过 GridModel 操作

### 2. childrenField（子表数据字段名）

**⚠️ 这是最容易出错的地方**

```javascript
// ❌ 错误：传实体名
var gridModel = viewModel.getGridModel('OrderDetail');

// ✅ 正确：传数据字段名
var gridModel = viewModel.getGridModel('orderDetails');
```

### 3. 特征组和特征编码

特征字段格式：`特征组__特征编码`

```javascript
// 主表特征
viewModel.get('freeCharacteristics__XXDD002').getValue();

// 子表特征
gridModel.getCellValue(rowIndex, 'applyOrdersDefineCharacter__XXDD002');
```

## 查询流程

```
1. 用户提出需求
       ↓
2. 触发 iuap-c-metadata-info
       ↓
3. 查询字段位置（主表/子表）
       ↓
4. 查询 childrenField
       ↓
5. 查询特征组和特征编码
       ↓
6. 基于元数据决策技术路线
       ↓
7. 生成代码
```

## 元数据示例

### 主表字段

```javascript
{
  cItemName: 'supplierName',
  cItemText: '供应商',
  cModelType: 'SimpleModel',
  cControlType: 'Refer',
  iEnableRefer: true,
  referConfig: {
    refCode: 'supplier',
    refName: '供应商档案'
  }
}
```

### 子表字段

```javascript
{
  cItemName: 'orderDetails',        // 数据字段名（childrenField）
  cItemText: '订单明细',
  cModelType: 'GridModel',         // GridModel
  childrenField: 'orderDetails',   // 子表数据字段名
  children: [
    {
      cItemName: 'productName',
      cItemText: '产品名称',
      cModelType: 'SimpleModel'
    },
    {
      cItemName: 'qty',
      cItemText: '数量',
      cModelType: 'SimpleModel'
    }
  ]
}
```

### 特征字段

```javascript
{
  cItemName: 'freeCharacteristics',  // 特征组
  cModelType: 'ReferModel',
  bIsDefineChar: true,             // 特征标识
  childrenField: 'defineCharacters',
  defineChars: [
    { charCode: 'XXDD001', charName: '特征1' },
    { charCode: 'XXDD002', charName: '特征2' }
  ]
}
```

## 错误案例

### 错误1：childrenField 传错

```javascript
// 用户元数据中 childrenField 是 'orderDetails'
// 但错误地传了实体名

var gridModel = viewModel.getGridModel('OrderDetail'); // ❌
var gridModel = viewModel.getGridModel('orderDetails'); // ✅
```

### 错误2：特征编码格式错误

```javascript
// ❌ 错误：直接用编码
gridModel.getCellValue(0, 'XXDD002');

// ✅ 正确：特征组__特征编码
gridModel.getCellValue(0, 'freeCharacteristics__XXDD002');
```
