---
name: _call-chain-collection-standard
description: >
  NCC 调用链档案的采集标准：每个实体必须逐项核查的维度清单、三种状态标注法（已覆盖 / 不适用 / 未覆盖）、
  证据强度分级（实测 / 反编译 / 推断）、完成表格式与抽样复检规则。
  建新档案、补档案或审查旧档案之前读本文件；索引见 _call-chain-archive-index.md。
---

# NCC 调用链档案采集标准

## 为什么要有这份标准

**省略是有歧义的**：

```
档案里没写"删除路径"  ==  这个实体没有删除？  还是  我没去查？
```

只要「确实没有」和「没去查」共用一个表现形式（**什么都不写**），就永远分不清。
没有标准的后果不是"写得差"，是**偷懒与正常在文档上长得一模一样**。

**本标准的支点只有一句：不许省略，只许标注。**

## 一、状态只有三种，每个维度都必须出现

| 状态 | 标记 | 必须带什么 |
| --- | --- | --- |
| 已覆盖 | ✅ | **依据**：类 / 方法 / 行号 / jar / 配置文件 |
| 不适用 | ➖ | **理由**：为什么这个实体没有这个机制 |
| 未覆盖 | ⬜ | **风险**：不知道会怎样、卡在哪、需要什么才能查 |

**「➖ 不适用」的理由必须是可驳的**——不能只写"没有"，要写"因为 `XxxAction` 不实现 `ICommonAction`"、
"`ncc_class_search '*CustomerTask*'` 0 命中"。这样"不适用"这个**判断本身也是可审的**。

## 二、必查清单（12 项，每份档案逐项标注）

| # | 维度 | 怎么查 | 典型状态 |
| --- | --- | --- | --- |
| 1 | **入口**：按钮名 / URL → 类 | `scripts/query-action.js --label/--name/--class`；没索引时录 SPR 读报告 | ✅ |
| 2 | **纵向链路** Action → SQL | `ncc_class_search` 定位 + cfr 逐层反编译 | ✅ |
| 3 | **表落点**：主表 / 子表 / 版本表 | `ncc_meta_find` + `ncc_meta_detail` | ✅ |
| 4 | **新增路径** | Service 实现类的 `insertXxxVO` | ✅ / ➖ |
| 5 | **修改路径** | `updateXxxVO` | ✅ / ➖ |
| 6 | **删除路径** | `deleteXxxVO` / `dbDeleteVO`｜**顺手记是否归还编码** | ✅ / ➖ |
| 7 | **事务与锁** | `*lockOperate`、`BDPKLockUtil`、`BizlockDataUtil`、`_RequiresNew` | ✅ / ⬜ |
| 8 | **客开钩子** | `fireXxxEvent`、`BDCommonEventUtil(mdId)`、扩展点 | ✅ |
| 9 | **审计信息** | `AuditInfoUtil` / `setInsertAuditInfo` / `setUpdateAuditInfo` | ✅ / ➖ |
| 10 | **版本机制** | `XxxVersionVO`、`insertXxxVersion`、`latest` 标记 | ✅ / ➖ |
| 11 | **扩展表机制** | `getExtendTableList()`、`VOPersister.saveItems` 的 `bExtTable` 分支 | ✅ / ➖ |
| 12 | **后台任务** | `ncc_class_search` 搜 `*Plugin`、`*Task`、`*Background*` | ✅ / ➖ |
| 13 | **校验框架** | `getInsertValidator` / `getUpdateValidator` / `getDeleteValidator`（通常 protected） | ✅ / ➖ |
| 14 | **编码规则** | `getBillCodeContext` / `insertWithAutoCode` / `returnBillCodeOnDelete` | ✅ / ➖ |

**按需项**（有就写、没有就在表里标 ➖ 并写一句"已查，无"）：
规则链（`IRule` / `RuleCollection` / `pub_pluginitem`）· 与其他实体的同步（如客户↔供应商）·
审批流 / 流程 · 权限 · 打印与导出 · 移动端/其他端入口。

> **清单是活的**：某个维度连续 5 个实体都判「➖ 不适用」，就该讨论它是否还留在必查里。
> 反过来，某个实体冒出清单没有的维度（如"生成下游单据"），**加进按需项**并在总索引记一笔。

## 三、证据强度必须分级

这一条防的是**"看着笃定、事后发现是错的"**。

| 级 | 含义 | 写法 |
| --- | --- | --- |
| **实测** | 连过环境 / 录过 SPR / 查过数据库 | 「实测 2026-10-14 首创，SPR 报告 `…_20261014223828.html`」 |
| **反编译** | 读了 `.class` / `.java` | 「反编译 `CustBaseInfoServiceImpl.insertVO:854`（NCC2505 `uapbd_customer.jar`）」 |
| **推断** | 从命名、惯例、同族类推的 | 「**推断**，未读代码」 |

**三条硬规矩**：

1. **推断不许写进「✅ 已覆盖」**——只能出现在正文里并显式标「推断」
2. **每条 ✅ 都要能在正文找到依据**，找不到依据的降级为 ⬜
3. **行号必须带版本**（`NCC2505` / `NCC1909`），行号会漂移，类名与调用顺序比行号稳定

## 四、完成表（每份档案末尾必须有）

写在档案最后一节，**不是散文**：

```markdown
## 完成表（按 _call-chain-archive-index.md 标注）

| # | 维度 | 状态 | 依据 / 理由 |
| --- | --- | --- | --- |
| 1 | 入口 | ✅ | action XML `Custbaseinfo.xml`；SPR 报告实测 |
| 2 | 纵向链路 | ✅ | 24 跳全，至 `JdbcPersistenceManager.insert:148` |
| 3 | 表落点 | ✅ | `bd_customer`（124 字段）+ 7 张子表 |
| 4 | 新增路径 | ✅ | `insertVO:854` 十步 |
| 5 | 修改路径 | ✅ | `updateCustomerVO:376` 11 步 |
| 6 | 删除路径 | ✅ | 三个入口；`deleteCustomerVO:158` 归还编码 |
| 7 | 事务与锁 | ⬜ | 锁已读（`lockOperate`）；**真实事务边界未验**（无事务注解，靠 `_RequiresNew` 派生） |
| 8 | 客开钩子 | ✅ | `fireBeforeInsertEvent` / `fireAfterInsertEvent` |
| 9 | 审计信息 | ✅ | `setInsertAuditInfo` / `setUpdateAuditInfo` |
| 10 | 版本机制 | ✅ | `insertCustomerVersion:895` |
| 11 | 扩展表机制 | ✅ | `VOPersister.saveItems` 的 `bExtTable` upsert 分支 |
| 12 | 后台任务 | ➖ | `ncc_class_search '*Customer*Task*'` 0 命中 |
| 13 | 校验框架 | ✅ | `getInsertValidator:542` 12 个校验器 |
| 14 | 编码规则 | ✅ | `insertWithAutoCode:917`；错误码 `32001` 重试 |
| 按需 | 规则链 | ⬜ | `CustomerListener → CustomerInformRule` 已读；**运行证据未验**（`pub_pluginitem` 查不了） |
| 按需 | 客户↔供应商同步 | ✅ | `synchronizeInfo` 两条路 + 配置驱动 |

**统计**：✅ 13 / ➖ 1 / ⬜ 2
```

**统计行是给总索引用的**，也是**唯一能一眼看出这份档案薄不薄的东西**。

## 五、抽样复检（规范不查就是纸）

**每建 3~5 份档案**，回头**随机抽一条**：

- 抽「➖ 不适用」→ 去验那个理由成不成立
- 抽「✅」→ 去核依据还在不在（尤其行号）
- 抽「推断」→ 去读代码，把它升级成反编译或推翻

**抽到错的，改档案并在该行注明"某次复检改正"**——不要悄悄改掉。

## 六、建档流程

1. **先查总索引** `_call-chain-archive-index.md`：已有档案就直接用，别重挖
2. **定位入口**：`query-action.js`（有索引）；没有索引就录 SPR 读报告
3. **定位类**：`ncc_class_search`（类名 → jar）
4. **看客开优先级**：代码工程 > Home；Home 的 `classes` > jar
5. **逐层反编译**：cfr，跟到 SQL 为止
6. **查表与字段**：`ncc_meta_find` / `ncc_meta_detail`
7. **逐项过必查清单**，三态标注，**写完成表**
8. **更新总索引**：登记一行 + 完整度统计

## 七、边界：轻档建档是允许的

`ncc-call-chain` 技能里的**轻 / 中 / 重三档仍然适用**：

| 档 | 建档结果 |
| --- | --- |
| 轻 | 完成表里 **1~3 项 ✅，其余大片 ⬜** |
| 中 | 必查清单基本填满，深层机制可能 ⬜ |
| 重 | 全部 ✅/➖，⬜ 只剩"需要环境才能验"的 |

**轻档不是失败。** 一片 ⬜ 但**写明了**，和一个假装完整的档案，前者有用得多。
**要防的从来不是"挖得少"，而是"挖得少却不说"。**
