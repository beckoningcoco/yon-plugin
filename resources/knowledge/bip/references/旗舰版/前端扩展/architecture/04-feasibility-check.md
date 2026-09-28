# 需求可行性判断

## 功能概述

在编写扩展代码之前，先判断用户的需求是否可以通过扩展脚本实现。如果不能，立即给出理由并结束，避免浪费开发时间。

## 扩展脚本能做什么

扩展脚本在 `init(viewModel)` 中拿到的是框架根据 UI 元数据生成的 ViewModel 实例。它可以：

| 能力 | 说明 | 典型场景 |
|------|------|---------|
| **监听生命周期事件** | `viewModel.on('afterLoadData', handler)` | afterLoadData 后设置字段只读 |
| **拦截/监听 Action 事件** | 所有 `biz.do` 动作自动有 `before{Act}` / `after{Act}` 事件 | beforeSave 校验、afterDelete 刷新、beforeSubmit 拦截提交 |
| **操作字段状态** | `setVisible` / `setReadOnly` / `setState` | 根据条件隐藏/禁用字段 |
| **读写字段值** | `getValue` / `setValue` | 字段联动、自动计算 |
| **拦截按钮动作** | 标准动作：`viewModel.on('beforeSave', fn)`；自定义按钮：`model.on('beforeclick', fn)` + `return false` | 保存前校验、覆盖自定义按钮逻辑 |
| **参照过滤** | `on('beforeBrowse', handler)` | 按组织过滤参照数据 |
| **子表行操作** | `gridModel.insertRow` / `updateRow` / `deleteRow` | 增行、计算行合计 |
| **调用框架动作** | `viewModel.biz.do('save', viewModel)` | 触发保存、刷新 |
| **干预元数据** | `on('afterLoadMeta', handler)` 修改返回的协议 | 动态调整字段属性 |
| **自定义请求** | `viewModel.setProxy({...})` | 调用自定义后端接口 |

## 扩展脚本不能做什么（边界）

| 不能做的事 | 原因 | 建议方案 |
|-----------|------|---------|
| **新增页面上不存在的字段** | 需要修改 UI 元数据模板，不是扩展的范畴 | 在元数据设计器中添加字段 |
| **新增页面容器/分组** | 需要修改模板布局结构 | 在元数据设计器中调整布局 |
| **创建全新页面/路由** | 扩展只能基于现有页面 | 新建单据，在元数据设计器中创建 |
| **修改后端接口逻辑** | 扩展是纯前端的 | 后端 Java 代码修改 |
| **修改数据库表结构** | 不在前端扩展范畴 | 后端 DDL 变更 |
| **修改框架内置动作的核心逻辑** | 只能拦截 before/after，不能替换 | 用 before 事件 + `return false` 取消再自行处理 |

## 灰色地带（能做但不建议）

| 场景 | 为什么不建议 | 评估标准 |
|------|------------|---------|
| **通过 afterLoadMeta 动态添加字段** | 需要在协议回来后注入完整字段定义，比改模板复杂数倍 | 如果只加 1-2 个简单字段勉强可以，多了就不值得 |
| **通过 afterLoadMeta 改布局结构** | 修改 containers 嵌套结构极易出错 | 强烈不建议，应改模板 |
| **大量覆盖框架默认行为** | 维护成本极高，框架升级可能破坏 | 如果超过 5 个 before 事件取消+重写，应考虑其他方案 |

## 判断流程

```
用户需求
  ↓
1. 需求是否涉及后端/数据库？
   ├─ 是 → ❌ 不能，建议后端修改
   └─ 否 → 继续
  ↓
2. 需求是否要新增页面中不存在的字段/容器？
   ├─ 是 → ❌ 不建议，应改元数据模板
   └─ 否 → 继续
  ↓
3. 需求是否要创建全新页面？
   ├─ 是 → ❌ 不能，需要新建单据
   └─ 否 → 继续
  ↓
4. 需求涉及的字段在 UI 元数据的 Controls 中能找到吗？
   ├─ 找不到 → 委托 uimetadata-designer 执行 `yct dsl detail` 展开嵌套容器查找
   │   ├─ 还是找不到 → ❌ 字段不存在，需改 UI 元数据模板
   │   └─ 找到了 → 继续
   └─ 找到了 → 继续
  ↓
5. 需求对应的操作在扩展 API 能力范围内吗？
   （参考上面的"能做什么"表格）
   ├─ 是 → ✅ 标记为 feasible
   └─ 不确定 → 查行为规格确认
  ↓
6. 行为规格中能找到对应的事件和方法吗？
   （查 Layer 2 各模型文档中的事件表格）
   ├─ 能找到 → ✅ 标记为 feasible，记录用到的事件/方法
   └─ 找不到 → ❌ 标记为 out_of_scope，给出替代建议
```

## 输出格式

标准输出应收敛为 `scope_report`，至少包含：

```yaml
status: success | blocked
summary: 该需求可通过扩展脚本实现 / 该需求不建议通过扩展脚本实现
artifacts:
  - artifact_type: scope_report
    conclusion: feasible | not_recommended | out_of_scope
    key_points:
      - 目标字段与目标事件
      - 建议实现方式
      - 关键 API 或边界
assumptions: []
blockers: []
handoff_requests: []
```

### 可以实现

```
✅ 该需求可以通过扩展脚本实现。

分析：
- 目标字段：orgName (cShowCaption: "组织", cControlType: refer)
- 实现方式：在 beforeBrowse 事件中添加过滤条件
- 涉及 API：ReferModel.on('beforeBrowse')

结论：feasible
```

### 不能实现

```
❌ 该需求不建议通过扩展脚本实现。

原因：需要在页面上新增"审批意见"字段，但当前协议中不存在该字段。
建议：在元数据设计器中为该单据添加"审批意见"字段后，再通过扩展脚本添加业务逻辑。
```
