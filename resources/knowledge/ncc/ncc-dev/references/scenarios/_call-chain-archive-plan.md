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
| 1 | ✅ 供应商保存（**已建** → [供应商档案保存调用链.md](./供应商档案保存调用链.md)） | `uapbd.supplier.saveSupplier` | `SaveSupplierBaseInfoAction` | `bd_supplier` | 客户同族（`SupplierListener`），**照着已有档案做，最快，也最能验证模板可复制** |
| 2 | ✅ 物料保存（**已建** → [物料档案保存调用链.md](./物料档案保存调用链.md)） | `uapbd.material.saveMaterial`（见注 1） | `SaveMaterialAction` | `bd_material`（118 字段）+ 18 张 `bd_material*` 子表 | 基础档案第二大，`MaterialListener`；**已验证**主实体 `material` → `bd_material`，一个 bmf 里带 18 张子表（`bd_materialfi`/`pu`/`sale`/`stock` 140 字段/`plan`/`prod`…） |
| 3 | ✅ 会计科目保存（**已建** → [会计科目保存调用链.md](./会计科目保存调用链.md)） | `uapbd.account.SaveAccountAction` | `SaveAccountAction` | `bd_account` 一族 | 中间级科目、快辅、批改受控是**多条分支**，链比客户复杂 |
| 4 | ✅ 银行账户保存（**已建** → [银行账户保存调用链.md](./银行账户保存调用链.md)） | `uapbd.bankacc.cardSave`（见注 3） | `BankAccCardSaveAction` | `bd_bankaccbas` + `bd_bankaccsub` + `bd_bankaccuse` | 单位银行账户，与客户/供应商/物料同属基础档案族，但入口是 `ICommonAction`；**有子户与启停用，是 BD 模板的第二种写法** |
| 5 | ✅ 财务核算账簿保存（**已建** → [财务核算账簿保存调用链.md](./财务核算账簿保存调用链.md)） | `uapbd.accountingbook.save` | `AccountingBookSaveOneAction` | `org_accountingbook` + `org_accbook` + `org_acb_accchart` | 定义文件在 `org/accountingbook/`，**模块归属是 `org` 而不是 `uapbd`**；走 `MultiManageTypeBaseService`（**第二套 BD 模板**），16 个启用位 + 20 多个事件码 |
| 6 | ✅ 部门保存（**已建** → [部门保存调用链.md](./部门保存调用链.md)） | `baseapp.dept.cardsave` | `nccloud.web.org.dept.action.DeptSaveAction` | `org_dept` + `org_dept_v` + `org_reportorg` + `org_planbudget` + `org_orgmanager` | 组织主数据，很多单据的外键来源；**HR 侧另有一个同名入口**（见注 2）；走 `TreeBaseService`（**第三套 BD 模板**，树形 + 根分支锁），有部门版本机制与组织主数据四处同步 |
| 7 | ✅ 销售订单保存（**已建** → [销售订单保存调用链.md](./销售订单保存调用链.md)） | `so.saleorder.save` | `SaleOrderSaveAction` | `so_saleorder` + `so_saleorder_b` | **服务类单据**，实测**不走** BD 模板，走 **PFlow 流程引擎**（`ICloudScriptPFlowService` → `CloudPfUtil` → `IplatFormEntry` → `IPFBusiAction`）；表名经 `BillMetaFactory` 元数据反查；前 6 份链条形状的**反例**，13 维对照见档案第 10 节 |
| 8 | ✅ 销售订单提交（**已建** → [销售订单提交调用链.md](./销售订单提交调用链.md)） | `so.saleorder.commit` | `SaleOrderCommitAction` | `so_saleorder` + `so_saleorder_b`（改状态列） | 提交是"保存"之外的独立语义，且牵审批；本档案**验成了保存那份没验成的 `hasFlow` 分叉**（提交会被改写成 `SAVE` 或 `APPROVE`） |
| 9 | ✅ 采购订单保存（**已建** → [采购订单保存调用链.md](./采购订单保存调用链.md)） | `pu.poordercard.save` | `OrderSaveAction` | `po_order`（**未从 VO 核实**）+ 动作驱动 6 表 | 与销售订单对偶，可互相对照；本份**用 UPM 反查补齐了第 7、8 份的最大缺口**，并找到**业务动作处理器的真正位置**（`pub_actionconstrict` + `pub_function` 两张表） |
| 10 | ✅ 采购订单保存提交（**已建** → [采购订单保存提交调用链.md](./采购订单保存提交调用链.md)） | `pu.poorder.saveandcommit` | `OrderSaveCommit`（**类名无 `Action` 后缀**） | `po_order`（未核实）+ 动作驱动 2 表 | 保存与提交在同一个类里，看它怎么分支：实测是**两阶段执行**（同一引擎跑两遍，动作名 `save`/`commit` 不同），与销售订单保存提交**逐字同构、只差动作名** |
| 11 | ✅ 到货单保存提交（**已建** → [到货单保存提交调用链.md](./到货单保存提交调用链.md)） | `pu.arrival.saveandcommit` | `SaveAndCommitAction`（**类名极通用，须按 XML 定位**） | `po_arriveorder` + **4 张子表** | 库存-采购接口单据；走 `saveCommit` 两阶段（`"SAVEBASE"`+`"SAVE"`）；**入口基类 `DataPermissionAction` 带权限检查**，另有 `AskWithCheckException` 确认往返 |
| 12 | ✅ 请购单保存（**已建** → [请购单保存调用链.md](./请购单保存调用链.md)） | `pu.buyingreq.save` | `BuyingreqInfoSaveAction` | `po_praybill` + `po_praybill_b` | 请购单有 `save`/`newSave`/`copy`/`saveCommit` 四个 save 入口，**是"一个业务动作多个入口"的典型**：实测四个 label 全叫「请购单保存」，其中 `save`/`newSave` 逐行同构、`copy` 实为查询 |
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

## 六、当前进度（2026-10-15 续做中）

> **续做时从这里开始**。2026-10-15 曾暂停一次，同日续做，**第 1 批 16 份已全部完成**。

**已完成 16 份（第 1 批全部）**，档案文件全在本目录，总索引已登记：

| # | 业务动作 | 档案 | 入口（已复核） | 完整度 |
| --- | --- | --- | --- | --- |
| 1 | 供应商保存 | [供应商档案保存调用链.md](./供应商档案保存调用链.md) | `uapbd.supplier.saveSupplier` → `SaveSupplierBaseInfoAction` | ✅ 10 / ➖ 1 / ⬜ 5 |
| 2 | 物料保存 | [物料档案保存调用链.md](./物料档案保存调用链.md) | `uapbd.material.saveMaterial` → `SaveMaterialAction` | ✅ 11 / ➖ 1 / ⬜ 3 |
| 3 | 会计科目保存 | [会计科目保存调用链.md](./会计科目保存调用链.md) | `uapbd.account.SaveAccountAction` → `SaveAccountAction` | ✅ 11 / ➖ 1 / ⬜ 5 |
| 4 | 银行账户保存 | [银行账户保存调用链.md](./银行账户保存调用链.md) | `uapbd.bankacc.cardSave` → `BankAccCardSaveAction`（**见注 3，入口与初稿不同**） | ✅ 10 / ➖ 2 / ⬜ 5 |
| 5 | 财务核算账簿保存 | [财务核算账簿保存调用链.md](./财务核算账簿保存调用链.md) | `uapbd.accountingbook.save` → `AccountingBookSaveOneAction`（**第二套 BD 模板**） | ✅ 11 / ➖ 2 / ⬜ 4 |
| 6 | 部门保存 | [部门保存调用链.md](./部门保存调用链.md) | `baseapp.dept.cardsave` → `DeptSaveAction`（**第三套树形 BD 模板**） | ✅ 10 / ➖ 1 / ⬜ 6 |
| 7 | 销售订单保存 | [销售订单保存调用链.md](./销售订单保存调用链.md) | `so.saleorder.save` → `SaleOrderSaveAction`（**PFlow 流程式，非 BD 模板**） | ✅ 6 / ➖ 2 / ⬜ 9 |
| 8 | 销售订单提交（含收回） | [销售订单提交调用链.md](./销售订单提交调用链.md) | `so.saleorder.commit` → `SaleOrderCommitAction`（**验成 `hasFlow` 分叉**） | ✅ 10 / ➖ 3 / ⬜ 4 |
| 9 | 采购订单保存 | [采购订单保存调用链.md](./采购订单保存调用链.md) | `pu.poordercard.save` → `OrderSaveAction`（**顺带补齐 7、8 份缺口**） | ✅ 7 / ➖ 2 / ⬜ 6 |
| 10 | 采购订单保存提交 | [采购订单保存提交调用链.md](./采购订单保存提交调用链.md) | `pu.poorder.saveandcommit` → `OrderSaveCommit`（**两阶段执行**） | ✅ 7 / ➖ 0 / ⬜ 7 |
| 11 | 到货单保存提交 | [到货单保存提交调用链.md](./到货单保存提交调用链.md) | `pu.arrival.saveandcommit` → `SaveAndCommitAction`（**入口带权限检查**） | ✅ 8 / ➖ 0 / ⬜ 6 |
| 12 | 请购单保存 | [请购单保存调用链.md](./请购单保存调用链.md) | `pu.buyingreq.save` → `BuyingreqInfoSaveAction`（**四个同名入口**） | ✅ 7 / ➖ 0 / ⬜ 6 |
| 13 | 销售出库单保存 | [销售出库单保存调用链.md](./销售出库单保存调用链.md) | `ic.saleout.save` → `SaleOutSaveAction`（**库存链，35 行薄壳**） | ✅ 7 / ➖ 0 / ⬜ 7 |
| 14 | 采购入库单保存 | [采购入库单保存调用链.md](./采购入库单保存调用链.md) | `ic.purchasein.save` → `PurchaseInSaveAction`（**416 行自包含**） | ✅ 7 / ➖ 0 / ⬜ 6 |
| 15 | 未确认应收单保存 | [未确认应收单保存调用链.md](./未确认应收单保存调用链.md) | `arap.estirecbill.save` → `EstiRecBillSaveAction`（**财务链 `executeBatchPM`**） | ✅ 7 / ➖ 0 / ⬜ 6 |
| 16 | 暂估应付单保存 | [暂估应付单保存调用链.md](./暂估应付单保存调用链.md) | `arap.estipayablebill.billsaveaction` → `BillSaveAction`（**BO/BSAction 路径**，计划稿类名错） | ✅ 9 / ➖ 0 / ⬜ 6 |

（另有基线档案 [客户档案保存调用链.md](./客户档案保存调用链.md)，SPR 实测级，✅ 13 / ➖ 1 / ⬜ 2，不计入本批 16 份。）

**未开始 0 份 —— 第 1 批 16 份全部完成。**

**本批共发现五条形态不同的链**（这是 16 份合起来的最大价值）：

| 链 | 代表档案 | 入参形态 | 引擎 | 单据类型码来源 |
| --- | --- | --- | --- | --- |
| ① BD 基础档案（单条模板） | 客户/供应商/物料/科目 | 卡片 | `BDSingleBaseService` → `SingleBaseService` | `VO.getDefaultTableName()` **硬编码** |
| ② BD 组织类（多管理类型 / 树形） | 账簿 / 部门 | 卡片 | `MultiManageTypeBaseService` / `TreeBaseService` | 同上 |
| ③ 业务单据（PFlow，包装服务） | 销售/采购订单、到货单 | 卡片 / `OffsetTempCache` / `ResumeExceptionInfo` | `ICloudScriptPFlowService` → `CloudPfUtil` → `IplatFormEntry` → `PFBusiAction` → **动作驱动表** | 字面量 / `SOBillType` / `POBillType` 枚举 |
| ④ 库存单据（PFlow，模板方法） | 销售出库 / 采购入库 | `BillCard` / `ExtBillCard` | **同一个** `ICloudScriptPFlowService` | `ICBillType` 枚举（**带 In/Out/Adjust 分类**） |
| ⑤ 财务单据 | 未确认应收 / 暂估应付 | **`SaveInfo`（`cardData`+`uiState`）** | 应收走 PFlow；应付走 **BO → DAO / BSAction** | **从 VO 属性 `pk_billtype` 读** / 服务里声明 `"23E1"` |

**下一步（收尾工作，非新档案）**：

1. **抽样复检**：已做 1 次（供应商档案）。**第 4~16 份尚未复检**，按采集标准"每 3~5 份抽样复检一次"，
   本批欠 3~5 次，**续做应先补**。优先复检证据最弱的几份：
   - 第 7 份（销售订单保存，⬜10，原为最低）
   - 第 16 份（暂估应付，`EstiBillBO` 787 行只读 106 行）
   - 第 10 份（采购订单保存提交，"两趟是否同一事务"仍是推断）
2. **跨档案缺口补齐**（三处，都是"共性缺失"而非单份问题）：
   - **现存量更新与成本计算**（第 13、14 份）——库存链的核心业务，需连库查动作驱动表
   - **`EstiBillBO.saveEstiBills` 的 681 行**（第 16 份）
   - **`po_order` 表名未从 VO 核实**（第 9、10 份）
3. **SPR 校验单独一轮**（计划里一直写着"未开始"）：
   16 份全是**反编译级**证据，**没有一份有运行证据**。SPR 能验证的是"规则/动作到底跑没跑"。
4. **连库验证业务处理器清单**：每份档案都给了 SQL（`pub_actionconstrict` ⋈ `pub_function`），
   但没有 NCC2505 连接，**16 份的这个 ⬜ 是同一条**。
- 应付（`arap`）是财务单据，持久化路径可能与业务单据不同，**同样不要预设**。

**续做时的三条注意**：

1. **每份的入口先用 `query-action.js` 复核**再开挖——第 4 份的入口初稿就是错的（见注 3），label 重名会骗人。
2. **同族的直接引用、不重挖**：BD 通用模板（`BDSingleBaseService` / `SingleBaseService` 十步）、MD 持久化公共通道已在总索引「公共机制」表里，新档案引用即可。
3. **每 3~5 份抽样复检一次**：已复检 1 次（供应商档案，2026-10-15 回核属实并补入两处发现）。**第 4 份银行账户、第 5 份财务核算账簿、第 6 份部门尚未复检**，续做时补（下一个复检点在第 8~9 份）。

**共性卡点（剩余 10 份大概率同样遇到，不必重复尝试）**：

- **本机没有一个能连 NCC2505 的数据库连接**（`datasource_list` 16 个连接里没有），字段级实测做不了 → 所有档案的「字段实测」都是 ⬜。
- **事务真实边界**读不到（反编译层无显式事务，容器边界需读 UPM/SPR），多数档案会留 ⬜。
- **`ncc_meta_detail` 对"同为实体名与 bmf 文件名"的主实体匹配不精确**：第 5 份查 `accountingbook`
  （75 字段主实体）时两次都返回同 bmf 里的子表 `accountingbookaccchart`（6 字段）。
  → 遇到这种情况**改从 VO 反编译取字段**（`ncc_class_search` 找 VO → cfr 反编译 → grep 字段声明），
  并在档案的「未覆盖项」里注明字段清单不是元数据全量。已记迭代表板 `it-mvan8jju-ima9`（原条 `it-mvan0ftf-h9oh` 的改写版，看新的）。
- **同一个表名可能有多套实体定义，字段数互不相同**：第 6 份的 `org_dept` 就有
  **riaorg 56 / baseapp 50 / hrjf 38** 三套（各模块各自定义）。
  → **先确认业务走的是哪条线，再摘字段**；`ncc_meta_find` 一次会把几套都列出来，用它末尾的提示
  （"同名实体在另外 N 个文件里也有定义"）判断，别看到第一个就抄。
  同理 `ncc_class_search` 找 VO 时也要看清包名——部门版本 VO 在 **`nc.vo.vorg`** 而不是 `nc.vo.org`。
- **✅ 已验证有效：找服务实现类用「UPM 反查」，别指望 `ncc_class_search` 猜名字**（第 9 份实测成功）。
  `implements IPFBusiAction`、`PFBusiActionImpl`、`nc.bs.so.saleorder`、`SaleOrderSaveBP` **全部 0 命中**，
  第 7、8 份因此卡在"接口找得到、实现找不到"。
  → **招 1：UPM 反查**（最有效，已两次验证）。在模块的 `META-INF/*.upm` 里按**接口名**搜 `<implementation>`：
  · `modules/riawf/META-INF/P_platform50_rt.upm` 找到 `IPFBusiAction` → **`nc.bs.pub.pf.pfframe.PFBusiAction`**
    （**类名无 `Impl` 后缀**，靠猜永远猜不到）、`IplatFormEntry` → `PlatFormEntryImpl`；
  · `modules/uapbd/META-INF/B_Supplier60_rt.upm` 找到 `ISupplierBaseInfoService` → `SupplierBaseInfoImpl`。
  → **招 2：看接口所在模块**，实现类大概率在同模块的 `META-INF/lib/` 或 `lib/` 下。
  → **招 3：从调用方反向找**（`NCLocator.lookup(I.class)` 的上下文能推出业务域）。
  → **`ncc_class_search` 的宽词（如 `bd.supplier`）会灌回同 jar 的几十个邻居类，零增量**——
  要么用完整类名，要么用很独特的片段。
- **业务动作处理器的类名可能根本不在代码里**（第 9 份的新认识）：单据的业务类由
  `pub_actionconstrict` ⋈ `pub_function` 两张表配置，`classname`/`methodname` 是**数据**。
  **搜不到不是索引故障**。离线环境无法回答"这个动作跑了哪些类"，必须连库或运行时看。
- 证据等级统一为「反编译级」；SPR 校验单独排一轮，未开始。

## 七、验收口径

- [x] 16 份档案文件存在，且都含完成表（有统计行）——**16/16 通过**（2026-10-15 机械核对：文件名、行数、节数、统计行齐全；统计数字与档案内一致）
  - 注：早期 3 份（供应商/物料/会计科目）的检查表小标题是「还没验过的」、列名是「维度 / 状态 / 依据·理由」，
    与后期 13 份的「完成表」列名（「必查项」）**叫法不同、内容等价**，均为逐项清单 + 统计行。
- [x] 总索引新增 16 行，完整度列有值——**档案清单 16 行**（另加基线客户档案 1 行 = 17 行）
- [x] 每份的入口都经 `query-action.js` 复核——**16/16**；其中 **2 份的入口与计划稿不符，已修正**：
  第 4 份银行账户（`uapbd.custbankacc.doSave` → 实为 `uapbd.bankacc.cardSave`）、
  第 16 份暂估应付（`EstiPayableBillSaveAction` → 实为 `BillSaveAction`）
- [ ] 抽样复检 3~5 份，结论记录在案——**只做了 1 次**（供应商档案，2026-10-15）。
  按标准本批欠 3~5 次；优先复检：第 7 份（销售订单保存，确认 `PFBusiAction` 段）、
  第 16 份（`EstiBillBO` 只读 106/787 行）、第 10 份（"两趟是否同一事务"仍是推断）
- [x] ⬜ 项**写明了卡在哪**——每份档案的「未覆盖项的详情」都写了具体卡点（16/16 有该小节）；
  多数卡在"没有 2505 数据库连接"（88 个 ⬜ 里绝大部分是字段实测与运行时的业务处理器清单）
