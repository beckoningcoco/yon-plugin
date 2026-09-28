---
name: 表格GridModel-clear与deleteAllRows区别
description: >
  BIP 旗舰版前端表格（GridModel）中 clear() 和 deleteAllRows() 的区别。
  clear() 只清空界面不改变行状态，deleteAllRows() 将行标记为删除状态随 save 传递。
---

# 表格 clear() 与 deleteAllRows() 区别

## 核心结论

| 方法 | 界面效果 | 行状态 `_status` | save 后 |
|------|---------|-----------------|---------|
| `targetGridModel.clear()` | 表格清空 | **未改变** | ❌ 不会删除数据库行 |
| `targetGridModel.deleteAllRows()` | 表格清空 | 标记为**删除** | ✅ 行随 save 删除 |

## 原理

- `clear()` 只操作前端视图层，直接清空数据，底层数据模型的行状态不变，save 时不会传递删除操作
- `deleteAllRows()` 遍历所有行并将 `_status` 标记为删除，save 接口拿到后走真正的删除逻辑

## 使用场景

- 需要**永久删除**表体行且保存生效 → 用 `deleteAllRows()`
- 临时清空界面，不涉及保存 → 用 `clear()`
