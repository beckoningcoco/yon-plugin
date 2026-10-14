---
name: _call-chain-archive-index
description: >
  NCC 调用链档案的总索引——一行一个已走查过的业务动作，指向它的实体档案、适用版本与已覆盖的维度。
  走查任何 NCC 调用链之前先读本文件；命中就直接用档案答，档案没覆盖的维度才实测，
  实测完把新维度补回档案并在本表登记。
---

# NCC 调用链档案总索引

**怎么用**：要查某个 NCC 动作的调用链时，**先在这里找**。命中 → 读对应档案，先按它回答。
档案没覆盖你问的维度，或你读到的代码/表与档案不一致 → **才实测**；实测完**补进档案、并在下表登记**。

**为什么要有它**：同一个入口会被反复问不同维度（保存调了哪个 service / 规则链在哪 / 写哪几张表 /
事务边界），入口那一段完全重复。**档案按维度分节，新维度加一节，不要重写整篇。**

**规矩三条**：

1. **每条结论带依据**（类名、方法、行号、jar）——怀疑时能回去核
2. **标版本**：`NCC2505` 与 `NCC1909` 的类名可能不同，不标版本跨环境就是错答
3. **冲突时以实测为准，并回来改档案**——档案是先验假设，不是结论

## 档案清单

| 业务动作 | 实体/主表 | 档案文件 | 版本 | 已覆盖维度 | 完整度 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 客户档案保存 | `bd_customer` | [客户档案保存调用链.md](./客户档案保存调用链.md) | NCC2505 | **10 项**：入口（SPR + action XML）、纵向链路 24 跳、表落点、事件与规则链、**修改路径**、**删除路径**、**校验框架**、**事务与锁**、**版本机制**、**客户↔供应商同步** | ✅ 13 / ➖ 1 / ⬜ 2 | 纵向已验（SPR 实测）；事务真实边界与锁行为、规则链运行证据、`synchronizeBaseInfo` 逐字段规则**未验** |

## 公共机制（跨实体复用，不随实体变）

| 主题 | 文件 | 说明 |
| --- | --- | --- |
| 事件与规则机制 | [ncc-event-and-rule-mechanism.md](./ncc-event-and-rule-mechanism.md) | `IBusinessListener` 事件订阅 vs `IRule` + `RuleCollection` + `pub_pluginitem` 插件链；`IRule` 有三个同名接口 |
| MD 持久化公共通道 | 见 [客户档案保存调用链.md](./客户档案保存调用链.md) 第 3 节第四、五段 | 所有走元数据映射的单据共用（`BDSingleBaseService` → `VOPersister` → `JdbcPersistenceManager`） |

## 还没建档案、但值得建的

- **供应商保存**（`bd_supplier`）——与客户同族（`SupplierListener`），可对照
- **物料保存**（`bd_material`）——`MaterialListener`
- **销售订单保存**、**采购订单保存**——服务类单据，可能是 `IRule` 那条链的反例

## 登记格式（新增档案时照填）

```
| 业务动作 | 主表 | [档案文件名](./档案文件名) | NCC版本 | 覆盖了哪些维度 | 完整度（✅/➖/⬜ 统计） | 哪些验过/哪些没验 |
```

## action 索引（按钮名 → 入口类，不用开环境）

| 版本 | 索引文件 | 规模 | 建成 |
| --- | --- | --- | --- |
| NCC2505 | `~/.dsh/yon-panel/knowledge/action_index_2505.json`（11.1 MB） | 31401 条 / 2817 个 XML | 2026-10-14 |

**查询**：`node C:\Users\99558\.dsh\yon-panel\scripts\query-action.js`（`--label` / `--name` /
`--class` / 多关键词 AND / `--module` 过滤 / `--stats` / `--versions` / `--json`）。

**作用**：`label`（中文按钮名）↔ `name`（动作名）↔ `clazz` 三向互查，**不用开环境、不用录 SPR**。
SPR 从"必需"降为"校验"。

**限制**：`label` 重名极多（「打印」187 个、「查询」122 个、「保存」121 个、「删除」119 个；
含"保存"的 label 共 2126 个）——查到后**必须用模块/业务/定义文件确认是哪一个**。
索引只证明"XML 里有这条"，不证明"按钮现在还能用"。

**换版本怎么重建**：构建脚本在 `%TEMP%\build-action-index.ps1`，扫
`<HOME>/hotwebs/nccloud/WEB-INF/extend/yyconfig/modules/**/config/action/*.xml`。
两个坑：**PowerShell 5.1 下中文 `Write-Host` 会乱码并报错**（输出改用英文），
且**别用 `$Home`**（PowerShell 只读变量，变量名不区分大小写）——用 `$NcHome`。

## 还没验过的

- **action 索引的覆盖率**：31401 条里有多少是死配置、多少属于老 UAP 界面（`/app/...` 直接 servlet），
  没有抽样验证过
- **`name` ↔ URL 的换算**只印证了一个样本（`uapbd.customer.saveCustomer` ↔ `/nccloud/uapbd/customer/saveCustomer`）
- **规则链的运行证据**（`pub_pluginitem` 里本环境有没有配置、录制时到底调没调）还没验——
  本机 `datasource_list` 的 16 个连接里**没有能连 NCC2505 的**
- **索引目前只有 2505 一个版本**，其他 Home 要各扫一份
