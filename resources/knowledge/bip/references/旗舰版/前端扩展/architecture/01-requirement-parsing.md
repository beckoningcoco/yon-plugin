# 需求解析规范

## Intent 识别

从用户话术中识别技术意图，是三层架构的第一层。

## Intent 分类表

| Intent | 触发关键词 | 技术路线 |
|--------|-----------|---------|
| `FIELD_READ` | 读取、获取、显示值 | `field.getValue()` |
| `FIELD_WRITE` | 设置、赋值、回填 | `field.setValue()` |
| `FIELD_LINKAGE` | 联动、变化、触发 | `afterValueChange` |
| `GRID_READ` | 读取子表、单元格值 | `gridModel.getCellValue()` |
| `GRID_WRITE` | 写入子表、单元格赋值 | `gridModel.setCellValues()` |
| `GRID_ROW` | 增行、删行、插行 | `insertRow/deleteRow` |
| `REFER_FILTER` | 过滤、参照条件 | `ReferModel.setFilter()` |
| `BACKEND_QUERY` | 调用接口、查询数据 | `setProxy` |
| `BUTTON_EVENT` | 按钮点击、自定义事件 | `button.on('click')` |
| `VALIDATION` | 校验、保存校验 | `beforeSave` |
| `PAGE_COMM` | 弹窗、返回、通信 | `communication()` |

## 话术示例

### FIELD_READ
- "读取客户名称字段"
- "获取当前用户ID"
- "显示供应商的联系人"

### FIELD_WRITE
- "设置供应商字段值"
- "回填税率"
- "默认填充当前日期"

### FIELD_LINKAGE
- "当部门变化时，清空人员"
- "税率变化时重新计算金额"
- "选择产品后自动带出规格"

### GRID_READ
- "获取子表第二行的金额"
- "读取所有明细的税率"
- "统计子表数量"

### GRID_WRITE
- "给金额列批量赋值"
- "子表行填充默认值"
- "更新选中行的状态"

### GRID_ROW
- "点击按钮新增一行"
- "批量删除选中行"
- "复制上一行数据"

### REFER_FILTER
- "供应商要按组织过滤"
- "产品分类要联动"
- "参照打开前过滤"

### BACKEND_QUERY
- "调用接口获取税率"
- "查询供应商档案"
- "从后端获取配置"

### BUTTON_EVENT
- "点击自定义按钮"
- "按钮触发后端逻辑"
- "批量操作按钮"

### VALIDATION
- "保存前校验必填"
- "提交前检查金额"
- "审核前校验状态"

### PAGE_COMM
- "打开弹窗选择数据"
- "页面关闭时返回"
- "父子页面传参"

## 识别优先级

1. **业务关键词** > 技术关键词
2. **动词** > 名词
3. **动作** > 状态

## 组合识别

有时一句话包含多个 Intent：
- "读取子表金额，超过1000时清空供应商" → `GRID_READ` + `FIELD_WRITE`
- "勾选行后点击按钮，调用接口并回填" → `BUTTON_EVENT` + `BACKEND_QUERY` + `FIELD_WRITE`
