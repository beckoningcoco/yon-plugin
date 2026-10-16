---
name: _call-chain-archive-plan
description: >
  调用链档案的批量采集计划：待建档案的动作清单、分批顺序与档位、每批的验收口径。
  采集标准见 _call-chain-collection-standard.md，已建档案见 _call-chain-archive-index.md。
  这份文件是「待办」不是「结论」——某动作建完档案就把它从本表移走，登记进总索引。
---

# NCC 调用链档案采集计划

## 一、这次要解决什么

action 索引（NCC2505，31401 条 action / 2817 个 action XML）已经建好，
**入口定位不再需要开环境**。现在缺的是**入口之后的那条链**：
Action → 业务 Service → 元数据持久化 → SQL → 表落点，以及挂在链上的校验、事件、锁、编码规则。

客户档案（`bd_customer`）已经走完一遍，产出了档案模板与采集标准。
本计划是**照着那个模板批量复制到其它常用动作**上。

**产出**：每个动作一份 `xxx调用链.md`，落在本目录，并在 `_call-chain-archive-index.md` 登记一行。

## 二、开工前的两个硬约束（先说清楚，免得白干）

| 约束 | 现状 | 对采集的影响 |
| --- | --- | --- |
| **没有 NCC2505 的数据库连接** | `datasource_list` 16 个连接里没有 2505（有 1909/2111/2312，都不是） | **表落点可以查**（`ncc_meta_find`/`ncc_meta_detail` 读的是 Home 里的 .bmf 索引，不需要连库）；**字段级实测、真实数据分布查不了**。凡是要看库里实际数据的结论，只能标 ⬜ 并写明"需要 2505 连接" |
| **运行时证据要靠录 SPR** | 浏览器已登录测试环境 | 纯静态可拿「反编译」级证据；要拿「实测」级，需按档案里记的入口去页面点一次、录一段 SPR。**不录不影响建档**，但完成表里要如实标 ⬜ |

> 依据级别照采集标准：**实测 / 反编译 / 推断**。反编译能覆盖大头，所以**没有库也能建成中档档案**。

## 三、候选清单与分批

档位按采集标准第七节的轻/中/重：**本批统一按「中档」建**——
必查清单基本填满，只有"需要环境才能验"的留 ⬜。

### 第 1 批（P0，建议先做这 16 份）

| # | 业务动作 | 入口 action（NCC2505） | 入口类 | 目标表 | 先做的理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | 供应商保存 | `uapbd.supplier.saveSupplier` | `SaveSupplierBaseInfoAction` | `bd_supplier` | 客户同族（`SupplierListener`），**照着已有档案做，最快，也最能验证模板可复制** |
| 2 | 物料保存 | `uapbd.material.saveMaterial`（见注 1） | `SaveMaterialAction` | `bd_material`（118 字段）+ 18 张 `bd_material*` 子表 | 基础档案第二大，`MaterialListener`；**已验证**主实体 `material` → `bd_material`，一个 bmf 里带 18 张子表（`bd_materialfi`/`pu`/`sale`/`stock` 140 字段/`plan`/`prod`…） |
| 3 | ✅ 会计科目保存（**已建** → [会计科目保存调用链.md](./会计科目保存调用链.md)） | `uapbd.account.SaveAccountAction` | `SaveAccountAction` | `bd_account` 一族 | 中间级科目、快辅、批改受控是**多条分支**，链比客户复杂 |
| 4 | ✅ 银行账户保存（**已建** → [银行账户保存调用链.md](./银行账户保存调用链.md)） | `uapbd.bankacc.cardSave`（见注 3） | `BankAccCardSaveAction` | `bd_bankaccbas` + `bd_bankaccsub` + `bd_bankaccuse` | 单位银行账户，与客户/供应商/物料同属基础档案族，但入口是 `ICommonAction`；**有子户与启停用，是 BD 模板的第二种写法** |
| 5 | 财务核算账簿保存 | `uapbd.accountingbook.save` | `AccountingBookSaveOneAction` | 核算账簿主表 | 定义文件在 `org/accountingbook/`，**模块归属是 `org` 而不是 `uapbd`**，是模块边界的现成样本 |
| 6 | 部门保存（见注 2） | `baseapp.dept.cardsave` | `nccloud.web.org.dept.action.DeptSaveAction` | `org_dept` 一族 | 组织主数据，很多单据的外键来源；**HR 侧另有一个同名入口**，见注 2 |
| 7 | 销售订单保存 | `so.saleorder.save` | `SaleOrderSaveAction` | `so_saleorder` + `so_saleorder_b` | **服务类单据**，大概率走 RuleCollection 而不是 `BDSingleBaseService`——是客户档案那条链的**反例**，价值最高的对照 |
| 8 | 销售订单提交 | `so.saleorder.commit` | `SaleOrderCommitAction` | 同上 + 审批流 | 提交是"保存"之外的独立语义，且牵审批 |
| 9 | 采购订单保存 | `pu.poordercard.save` | `OrderSaveAction` | `po_order` 主+子 | 与销售订单对偶，可互相对照 |
| 10 | 采购订单保存提交 | `pu.poorder.saveandcommit` | `OrderSaveCommit` | 同上 | 保存与提交在同一个类里，看它怎么分支 |
| 11 | 到货单保存提交 | `pu.arrival.saveandcommit` | `SaveAndCommitAction` | 到货单主+子 | 库存-采购接口单据 |
| 12 | 请购单保存 | `pu.buyingreq.save` | `BuyingreqInfoSaveAction` | 请购单主+子 | 请购单有 `save`/`newSave`/`copy`/`saveCommit` 四个 save 入口，**是"一个业务动作多个入口"的典型** |
| 13 | 销售出库保存 | `ic.saleout.save` | `SaleOutSaveAction` | `ic_saleout` 主+子 | 出库影响现存量，链上有存量更新 |
| 14 | 采购入库保存 | `ic.purchasein.save` | `PurchaseInSaveAction` | `ic_purchasein` 主+子 | 入库同上 |
| 15 | 未确认应收单保存 | `arap.estirecbill.save` | `EstiRecBillSaveAction` | 应收单主+子 | 财务单据，与业务单据的持久化路径可能不同 |
| 16 | 暂估应付单保存 | `arap.estipayablebill.billsaveaction` | `BillSaveAction` | 应付单主+子 | 与 15 对偶 |

**注 1（物料）**：`uapbd.material.*` 下 action 数最多，**保存入口是分开的**——
`saveMaterial`（保存物料基本信息）/ `saveMaterialfi`（财务信息）/ `saveMaterialpu`（采购信息）/
`saveMaterialsale`（销售信息）/ `saveMaterialstock`（库存信息）/ `saveMaterialplan` / `saveMaterialprod` / `saveMaterialpfc`。
**一个"物料保存"按钮实际是 N 个 tab 各自的 action**，本档案以 `saveMaterial` 为主入口，
其余 tab 的 action 作为"同一业务的其它入口"列在档案里（这本身就是物料档案要解决的第一个问题）。

**注 2（部门有两个入口，别混）**：
- `hrjf.hrdept.HRDeptSaveAction` —— **HR 模块**的部门保存（`hrjf/hrdept/config/action/hrdept.xml`）
- `baseapp.dept.cardsave` → `nccloud.web.org.dept.action.DeptSaveAction` —— **基础档案模块**的部门卡片保存
  （`org/dept/config/action/dept.xml`）

两者都叫「部门保存/部门-卡保存」，**目标机制可能不同**。本档案取 `baseapp.dept.cardsave`
（基础档案那条，与客户档案同族），HR 那条作为对照在档案里点出来。
—— 这正是索引 label 重名的典型：**必须用定义文件确认是哪一个**。

**注 3（银行账户入口已更正）**：计划初稿写的是 `uapbd.custbankacc.doSave` → `CustBankSaveOrSaveAddAction`，
目标是"客户/供应商银行账户子表"。**建档时核实为错**——那是客户档案内的银行账户子表入口。
「银行账户」这个业务动作指的是**单位银行账户**（基础档案模块），入口在
`uapbd/sminfo/bankaccount/config/action/bankAccbase.xml` 的 `uapbd.bankacc.cardSave` → `BankAccCardSaveAction`，
目标表 `bd_bankaccbas`。
四个银行账户 XML 别混：`uapbd/bankacc/`（**银行档案** BankDoc）、`uapbd/sminfo/bankaccount/`（**单位银行账户**）、
`uapbd/psnbankacc/`（个人银行账户）、`uapbd/customer/baseinfo/`（客户银行账户）。

### 第 2 批（P1，第 1 批验收后再说）

- 凭证新增 `gl.voucher.insert` / 凭证保存 `gl.nvoucher.insertAll`（总账，机制与业务单据差最远）
- 资金收款单保存 `cmp.recbill.recbillinsert`（**注意：收付款单在 `cmp` 模块，不在 `arap`**，
  按 arap 找会是 0 命中——这是索引的 label 陷阱）
- 人员保存 `hrhi.psndoc.PsndocSaveDoAction`（**一个业务动作被拆成 校验 / 暂存 / 执行 三个 action**，是另一类形态）
- 其它出库保存 `ic.generalout.save`、产成品入库 `ic.productin.save`、材料出库 `ic.materialout.save`
- 应收单/应付单正式单据保存（`arap` 里 label 是「单据新增、修改保存」这种模板 label，
  要用 `--name` 按业务模块名找，不能按「应收单保存」找）

### 第 3 批（P2，明确先不做，留个记录）

HR（岗位/基准岗位）、资产卡片（`aim.equip.save`）、销售合同、委外订单（`sc.scorder.save`）、
运输单（`dm.delivbill.save`）、报销单（`erm`）、收票登记（`fbm`）、客商同步配置。
—— 不是不重要，是**先让前两批把模板和坑摸干净**；这些动作的入口名都已记在上面候选表来源里，随时可捡起来。

## 四、每份档案的固定交付物

1. **档案正文** `本目录/{业务动作}调用链.md`，章节对齐客户档案：
   ①什么时候读我 ②怎么拿到这条链 ③完整链路（按段拆，每跳带类/方法/行号）④表落点
   ⑤事件与规则链 ⑥修改路径 ⑦删除路径 ⑧校验框架 ⑨事务与锁 ⑩版本机制 ⑪扩展表/子表机制
   ⑫客开该关注的位置 ⑬排查时的用法 ⑭完成表
2. **完成表**（第 14 节，格式照采集标准第四节）+ 统计行 `✅ x / ➖ y / ⬜ z`
3. **总索引登记一行**：`| 业务动作 | 主表 | [档案](./档案) | NCC2505 | 已覆盖维度 | ✅ x / ➖ y / ⬜ z | 哪些验过/没验 |`

## 五、约束与纪律

1. **入口名必须核**：索引只证明"XML 里有这条"，不证明"按钮还能用"。每份档案的入口都要用
   `query-action.js` 复核 label/name/clazz 三者一致。
2. **行号必带版本**：统一 `NCC2505`，行号会漂移，类名与调用顺序比行号稳定。
3. **推断不进 ✅**：只能写在正文并显式标「推断」。
4. **同族的别重挖**：遇到客户↔供应商同步、MD 持久化公共通道这类已在
   `_call-chain-archive-index.md` 公共机制表里的，**直接引用，不复制正文**。
5. **不在本计划内的事**：不改插件源码、不建 Yon 需求条目（这是插件自身的知识库建设）。
6. **每 3~5 份抽样复检一次**（采集标准第五节），抽到错的改档案并在该行注明"某次复检改正"。

## 六、当前进度（2026-10-15 暂停）

> **续做时从这里开始**。用户于 2026-10-15 要求暂停，后续有时间再继续。

**已完成 4 份（第 1 批 16 份里）**，档案文件全在本目录，总索引已登记：

| # | 业务动作 | 档案 | 入口（已复核） | 完整度 |
| --- | --- | --- | --- | --- |
| 1 | 供应商保存 | [供应商档案保存调用链.md](./供应商档案保存调用链.md) | `uapbd.supplier.saveSupplier` → `SaveSupplierBaseInfoAction` | ✅ 10 / ➖ 1 / ⬜ 5 |
| 2 | 物料保存 | [物料档案保存调用链.md](./物料档案保存调用链.md) | `uapbd.material.saveMaterial` → `SaveMaterialAction` | ✅ 11 / ➖ 1 / ⬜ 3 |
| 3 | 会计科目保存 | [会计科目保存调用链.md](./会计科目保存调用链.md) | `uapbd.account.SaveAccountAction` → `SaveAccountAction` | ✅ 11 / ➖ 1 / ⬜ 5 |
| 4 | 银行账户保存 | [银行账户保存调用链.md](./银行账户保存调用链.md) | `uapbd.bankacc.cardSave` → `BankAccCardSaveAction`（**见注 3，入口与初稿不同**） | ✅ 10 / ➖ 2 / ⬜ 5 |

（另有基线档案 [客户档案保存调用链.md](./客户档案保存调用链.md)，SPR 实测级，✅ 13 / ➖ 1 / ⬜ 2，不计入本批 16 份。）

**未开始 12 份**（第 1 批剩余）：财务核算账簿(5)、部门(6)、销售订单保存(7)、销售订单提交(8)、采购订单保存(9)、采购订单保存提交(10)、到货单保存提交(11)、请购单保存(12)、销售出库(13)、采购入库(14)、未确认应收单(15)、暂估应付单(16)。

**下一步就是清单里的第 5 份「财务核算账簿保存」**（`uapbd.accountingbook.save` → `AccountingBookSaveOneAction`，定义文件在 `org/accountingbook/`，模块归属是 `org` 而非 `uapbd`）。

**续做时的三条注意**：

1. **每份的入口先用 `query-action.js` 复核**再开挖——第 4 份的入口初稿就是错的（见注 3），label 重名会骗人。
2. **同族的直接引用、不重挖**：BD 通用模板（`BDSingleBaseService` / `SingleBaseService` 十步）、MD 持久化公共通道已在总索引「公共机制」表里，新档案引用即可。
3. **每 3~5 份抽样复检一次**：已复检 1 次（供应商档案，2026-10-15 回核属实并补入两处发现）。第 4 份银行账户**尚未复检**，续做时补。

**共性卡点（12 份大概率同样遇到，不必重复尝试）**：

- **本机没有一个能连 NCC2505 的数据库连接**（`datasource_list` 16 个连接里没有），字段级实测做不了 → 所有档案的「字段实测」都是 ⬜。
- **事务真实边界**读不到（反编译层无显式事务，容器边界需读 UPM/SPR），多数档案会留 ⬜。
- 证据等级统一为「反编译级」；SPR 校验单独排一轮，未开始。

## 七、验收口径

- [ ] 16 份档案文件存在，且都含第 14 节完成表（有统计行）
- [ ] 总索引新增 16 行，完整度列有值
- [ ] 每份的入口都经 `query-action.js` 复核
- [ ] 抽样复检 3~5 份，结论记录在案
- [ ] ⬜ 项**写明了卡在哪**（多数会卡在"没有 2505 数据库连接"和"没录 SPR"）
