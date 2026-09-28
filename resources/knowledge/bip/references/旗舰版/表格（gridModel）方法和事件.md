---
name: 表格（gridModel）方法和事件
description: >
  用友 BIP 客开技能。当用户需要操作页面表格（gridModel）的方法和事件，包括增删改查行、设置行列单元格状态、校验、脏数据、分页、选中行、导入数据源、嵌套表等完整 API 参考时，参考该文档内容。
---

# 表格（gridModel）方法和事件

## 1. 方法

### 数据获取
- **getData()** — 获取所有数据（含删除数据，有 `_status` 状态字段）
- **getEffeData()** — 深拷贝，获取 dataSource 中不含删除的数据（排序前、筛选前）
- **getRealData()** — 浅拷贝，获取 dataSource 中不含删除的数据（排序前、筛选前）
- **getRealViewRows()** — 浅拷贝，获取界面显示的数据（排序后、筛选后）
- **getRows(deep)** — 深拷贝（传 false 为浅拷贝），获取不含删除的数据（排序后、筛选前）
- **getRealRows()** — 浅拷贝，获取不含删除的数据（排序后、筛选前）
- **getRow(index)** — 深拷贝，按行索引获取某一行数据（排序后、筛选前）
- **getSelectedRows()** — 获取已选中行的数据
- **getSelectedRowIndexes()** — 获取已选中行的行号
- **getRowsByIndexes(rowIndexes)** — 根据行号集合获取数据

### 数据修改
- **setCellValue(rowIndex, cellName, value, check, blur)** — 设置单元格值
- **setCellValues([...])** — 批量设置单元格值
- **setColumnValue(cellName, value, check)** — 设置整列值
- **updateRow(rowIndex, rowData)** — 更新行数据（孙表需传4个参数）
- **updateRows([rowIndex,...], [rowData,...])** — 批量更新行

### 行操作
- **insertRow(rowIndex, rowData)** — 插行
- **insertRows(rowIndex, rowDatas)** — 批量插行
- **appendRow(rowData)** — 增行
- **deleteRows(rowIndexes)** — 删行
- **deleteAllRows(isAll)** — 删所有行（true 删除全部，默认 false 删除显示数据）
- **clear()** — 清除全部数据

### 列操作
- **getColumns(fields)** — 批量获取栏目信息（不传获取全部）
- **getColumns(field)** — 获取单列栏目信息
- **hasColumn(field)** — 判断是否包含该栏目
- **setColumns(columns, fieldNames)** — 设置 grid 栏目
- **addColumns(externalColumns, isShow)** — 添加表格栏目（动态列）

### 状态操作
- **setDirty(dirty)** — 设置脏数据，true 收集完整数据
- **setReadOnly(value)** — 设置 grid 可编辑状态
- **setFocusedRowIndex(index)** — 设置焦点行
- **getRowState(rowIndex, name)** — 获取行状态
- **setRowState(rowIndex, name, value)** — 设置行状态
- **setRowStates([...])** — 批量设置行状态
- **getColumnState(cellName, name)** — 获取列状态
- **setColumnState(cellName, name, value)** — 设置列状态
- **setColumnStates([...])** — 批量设置列状态
- **getCellState(rowIndex, cellName, name)** — 获取单元格状态
- **setCellState(rowIndex, cellName, propertyName, value)** — 设置单元格状态
- **setCellStates([...])** — 批量设置单元格状态

### 选中操作
- **select(rowIndexes)** — 设置选中行
- **unselect(rowIndexes)** — 取消选中行
- **selectAll()** — 选中所有行
- **unselectAll()** — 取消选中所有行

### 分页
- **setPageSize(pageSize)** — 设置页大小
- **setPageIndex(pageIndex)** — 设置页码
- **getPageSize()** — 获取页大小
- **getPageIndex()** — 获取当前页码

### 数据源
- **setDataSource(proxyConfig, queryParams, callback)** — dataSourceMode=local 时传数据，否则传请求配置
- **load(proxyConfig, params, callback)** — 同 setDataSource（非 local 模式）

### 校验
- **validate()** — 校验合法性、必输项
- **getDirtyData()** — 获取脏数据
- **getDirtyRowIndexes()** — 获取脏数据的行号集合

### 嵌套表
- **expandRow(index)** — 展开某行嵌套表
- **expandAllRow()** — 展开所有嵌套表
- **setShowExpand(true/false)** — 是否显示行展开符号

### 其他
- **getCellValue(rowIndex, cellName)** — 获取单元格值
- **setScrollCell** — 表格滚动到单元格
- **rowClick** — 表格行点击事件

## 2. 事件

### 值改变
- **beforeCellValueChange** / **afterCellValueChange** — 单元格数据改变前/后
- **beforeColumnValueChange** / **afterColumnValueChange** — 列值改变前/后

### 状态改变
- **beforeRowStateChange** / **afterRowStateChange** — 行状态改变前/后
- **beforeColumnStateChange** / **afterColumnStateChange** — 列状态改变前/后
- **beforeCellStateChange** / **afterCellStateChange** — 单元格状态改变前/后

### 列设置
- **beforeSetColumns** / **afterSetColumns** — 设置栏目 前/后

### 数据源
- **beforeSetDataSource** / **afterSetDataSource** — 设置数据 前/后

### 选中
- **beforeSelect** / **afterSelect** — 选中 前/后
- **beforeUnselect** / **afterUnselect** — 取消选中 前/后
- **beforeSelectAll** / **afterSelectAll** — 全选 前/后
- **beforeUnselectAll** / **afterUnselectAll** — 全消 前/后

### 行操作
- **beforeInsertRow** / **afterInsertRow** — 增行/插行 前/后
- **beforeDeleteRows** / **afterDeleteRows** — 删行 前/后

### 其他
- **beforeSort** / **afterSort** — 排序 前/后
- **beforeFilter** / **afterFilter** — 筛选 前/后
- **afterSetFocusedRowIndex** — 行获取焦点后
- **beforeRowClick** — 行点击前
