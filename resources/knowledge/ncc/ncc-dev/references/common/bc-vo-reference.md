# NCC 条码管理模块（bc）VO 与表名对照表

---

## 一、条码标签

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 条码标签 | `bc_barcodelabel` | `nc.vo.bc.barcodelabel.entity.BarcodeLabelHeadVO` |

## 二、条形码标签分配

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 条形码标签分配 | `bc_labelassign` | `nc.vo.bc.labelassign.entity.AssignVO` |

## 三、日志

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 日志表 | `bc_log` | `nc.vo.bcsi.entity.Log` |

> ⚠️ **注意**：该类名 `Log` 不以 `VO` 结尾，请以实际代码为准。

## 四、条码打印

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 条码打印清单 | `bc_print` | `nc.vo.application.bcprint.entity.BCPrintVO` |

## 五、转换规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 转换规则头 | `bc_sendrule` | `nc.vo.bcsi.entity.BcsiRuleHVO` |
| 表体 | 转换规则明细 | `bc_sendrule_b` | `nc.vo.bcsi.entity.BcsiRuleBVO` |
| 表体 | 转换xml配置 | `bc_sendrule_m` | `nc.vo.bcsi.entity.BcsiRuleMVO` |

> 聚合 VO：`nc.vo.bcsi.entity.AggBcsiRuleVO`

## 六、发送类型

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 发送类型头 | `bc_sendtype` | `nc.vo.bcsi.entity.BcsiTypeHVO` |
| 表体 | 发送类型明细 | `bc_sendtype_b` | `nc.vo.bcsi.entity.BcsiTypeBVO` |

> 聚合 VO：`nc.vo.bcsi.entity.AggBcsiTypeVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 条码标签 | 1 |
| 条形码标签分配 | 1 |
| 日志 | 1 |
| 条码打印 | 1 |
| 转换规则 | 4 |
| 发送类型 | 3 |
| **合计** | **11** |
