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
| 供应商档案保存 | `bd_supplier` | [供应商档案保存调用链.md](./供应商档案保存调用链.md) | NCC2505 | **8 项**：入口（action XML，四分支）、纵向链路、表落点（主表+版本+关系+4 子表）、**新增/修改/建版本三条路径**、事件与钩子、审计、版本机制、校验框架（三层）、客户↔供应商同步 | ✅ 10 / ➖ 1 / ⬜ 5 | 纯**反编译级**（无 SPR、无实测）；删除路径、事务真实边界与锁行为、**取号时机**、扩展表、同步配置表、地址表名、业务日志落表**未验**。**已抽样复检**（2026-10-15 回核 `SaveSupplierBaseInfoAction` :140-167 与 :196-197，代码属实；补入修改路径三道前置与「重复账号校验拼了报文没 throw」的缺陷） |
| 物料档案保存 | `bd_material` | [物料档案保存调用链.md](./物料档案保存调用链.md) | NCC2505 | **9 项**：入口（`opr` 三分）、纵向链路、表落点（主表+版本+2 子表+20+ PF 表）、**新增/修改/建版本/删除四条路径**、事件与钩子、审计、版本机制、校验框架（三层：action 3 + 插入 11 + 修改 13）、**编码规则完整闭环**、与供应商的模板差异对照 | ✅ 11 / ➖ 1 / ⬜ 3 | 纯**反编译级**；事务真实边界与锁行为、**PF 表群写入条件**、扩展表、规则链、UPM 未读**未验** |
| 会计科目保存 | `bd_account`（+`bd_accasoa`） | [会计科目保存调用链.md](./会计科目保存调用链.md) | NCC2505 | **11 项**：入口（action XML + 9 个同族动作）、纵向链路、表落点（主表+当期/历史科目表+当期/历史辅助核算+科目体系/制度）、**新增/修改/删除三条路径**、事件与钩子（mdId `23a89307-…`）、审计、**版本机制（期间分割，`endperiod` 判当期）**、**锁（`BDPKLockUtil.lockString(pk_accsystem)` 整本制度级）**、校验框架（三层：前置 2 + 框架 6×2 + 继承 2 + 删除 2）、编码规则（`bd_accsystem.acccoderule`）、**与 BD 通用模板的六维差异对照** | ✅ 11 / ➖ 1 / ⬜ 5 | 纯**反编译级**；**`AccountOptUpdate` 反编译取到 0 行**（修改路径靠同构推断，证据最弱）、事务真实边界（UPM `tx` 未读）、辅助核算与中间级/批改未展开、扩展表、规则链**未验** |
| 银行账户保存 | `bd_bankaccbas`（+`bd_bankaccsub`、`bd_bankaccuse`） | [银行账户保存调用链.md](./银行账户保存调用链.md) | NCC2505 | **10 项**：入口（action XML，`uapbd.bankacc.cardSave`，四分支）、纵向链路 10 跳、表落点（主表+子户+使用权+电票联行号，**三实体同表**）、**新增/修改/删除三条路径**、事件与钩子（**三个 mdId**：主表/子户/使用权）、审计、编码规则（`bankaccount` 取号器六环节 + 预置码）、校验框架（插入 9 + 更新按 enablestate 分支）、锁（`BizlockDataUtil` 新增 / `BDPKLockUtil` 修改 / `lockString` 子户）、UI 层按钮映射、与已建三份档案的横向对照 | ✅ 10 / ➖ 2 / ⬜ 5 | 纯**反编译级**（无 SPR、无实测）；事务真实边界（容器层未读）、锁的真实行为（`BankaccBizlockDataProvider` 未反编译）、扩展表、规则链、**字段实测**未验。另有 2 处疑似产品缺陷未复现：入口 `:84` 空指针风险、修改场景无条件重置子户 `fronzenstate=0` |
| 财务核算账簿保存 | `org_accountingbook`（+`org_accbook`、`org_acb_accchart`） | [财务核算账簿保存调用链.md](./财务核算账簿保存调用链.md) | NCC2505 | **11 项**：入口（action XML + 9 个同族含权限前置）、纵向链路 12 跳、表落点（主表+同步表+关联科目子表+5 张只读表）、**新增/修改/删除三条路径**、**三层模板**（入口→ManageImpl→`MultiManageTypeBaseService` 十步）、**16 个启用位与 20+ 事件码全表**、**`checkBookModuleHasInit` 九个模块号**、校验框架（插入 7/修改 7/删除 2）、四种锁的对照、`org_accbook` 三处同步、期间变更与主账簿切换 | ✅ 11 / ➖ 2 / ⬜ 4 | 纯**反编译级**；**`ncc_meta_detail('accountingbook')` 匹配不精确**（返回同 bmf 子表），主表 75 字段清单来自 VO 反编译非元数据；事务边界（三张表分三段写的回滚不明）、`PKLock` 真实行为、`switchbook` 展开、规则链**未验** |
| 部门保存 | `org_dept`（+`org_dept_v`、`org_reportorg`、`org_planbudget`、`org_orgmanager`） | [部门保存调用链.md](./部门保存调用链.md) | NCC2505 | **10 项**：入口（`baseapp.dept.cardsave`，**已辨析与 HR 同名入口**）+ 29 个同族入口、纵向链路 11 跳、表落点（主表+版本+报表组织+预算组织+组织主管+组织主数据）、**新增/修改路径**、**第三套树形模板**（`TreeBaseService` 十步 + `MDTreePersistenceUtil` + 根分支锁）、**部门版本机制**（`vno=年份+"01"`、六件套字段、子部门 innercode 联动）、**组织主数据四处同步**、**三个 mdId**、校验框架（插入 +1/修改 +2/删除透传）、编码规则六环节、**`org_dept` 三套同名定义辨析**（riaorg 56 / baseapp 50 / hrjf 38） | ✅ 10 / ➖ 1 / ⬜ 6 | 纯**反编译级**；删除路径未系统走、父类校验器挂载点未逐行核、组织主数据表名未查、事务边界（部门与组织分两次服务调用写的回滚不明）、结构版本表与规则链、**字段实测**未验 |
| 销售订单保存 | `so_saleorder`（+`so_saleorder_b`） | [销售订单保存调用链.md](./销售订单保存调用链.md) | NCC2505 | **机制判定**：不走任何 BD 模板，走 **PFlow 流程引擎**（`ICloudScriptPFlowService.exeScriptPFlow` → `CloudPfUtil.runAction` → `IplatFormEntry` → `IPFBusiAction`）；入口 `OffsetTempCache` 报文与行状态规范化；服务层三步（`beforeCheck`/`process`/`doAfterAction`）**全文仅 171 行**；`actionName="WRITE"` + `billType="30"` 字符串驱动；**`hasFlow` 逐张判审批流**（同批可混合）；表名经 **`BillMetaFactory` 元数据标识** `so.so_saleorder` 反查；`*EditRule implements IBeforeRule`（27 个，**编辑态联动非保存链规则**）；`doAfterAction` 金额回写上限；**Saga 四字段**；与前 6 份的 13 维横向对照 | ✅ 6 / ➖ 2 / ⬜ 9 | 纯**反编译级**；**最大缺口已于 2026-10-15 补齐**（第 10.5 节：`IPFBusiAction` 实现 = `PFBusiAction`，业务动作处理器在 `pub_actionconstrict` + `pub_function` 表里）；仍缺：保存链规则的**运行证据**、锁与事务（已读层只见 Saga 字段）、审计写入点、`vbillcode` 取号、续跑机制、字段实测**未验** |
| 销售订单提交（含收回） | `so_saleorder`（+`so_saleorder_b`） | [销售订单提交调用链.md](./销售订单提交调用链.md) | NCC2505 | **9 项**：入口（`so.saleorder.commit` + 同族 4 个入口）、纵向链路 9 跳、**`hasFlow` 分叉点验成**（`actionnames` 四元组 `{SAVE,APPROVE,UNSAVE,UNAPPROVE}` + 两个判定 `hasValidProcessDef`/`isApproveFlowStartup2`）、**提交的 actionName 初始值是 `"SAVE"`**（提交被翻译成保存或审批）、收回 `"UNSAVE"`、`AbstractGridAction` 列表动作模板 + `DataPermissionUtil` 权限、`AuditUtils` 场景 `cardCommit`、**批量部分成功语义**、`SOBillType` 13 个单据类型码全表、与保存那份的 11 维对照 | ✅ 10 / ➖ 3 / ⬜ 4 | 纯**反编译级**；**`IPFBusiAction` 实现类已于 2026-10-15 补齐**（见第 2.5 节）；**锁在已读层 0 命中**（不能说"没加锁"，锁应在未展开层）、审批流定义表、`WorkflowTypeEnum` 两种类型差别、`CommitAssignUtils`、字段实测**未验** |
| 采购订单保存 | `po_order`（**未从 VO 核实**）+ 动作驱动 6 表 | [采购订单保存调用链.md](./采购订单保存调用链.md) | NCC2505 | **7 项**：入口（`pu.poordercard.save`，55 行薄壳）、纵向链路 **11 跳全部定位到类**、**UPM 反查**（`P_platform50_rt.upm` → `IPFBusiAction` 实现 `PFBusiAction` 2948 行、`IplatFormEntry` → `PlatFormEntryImpl`）、**动作驱动表机制**（`pub_actionconstrict` ⋈ `pub_function`，驱动 SQL 全文 + `sysindex`/`isbefore`/`conditionXpression`/`configflag` 四控制位 + 客开做法）、`POBillType`（Order=`21`、到货单=`23`、请购单=`20`）、**三个 actionName 对照**（`WRITE`/`SAVE`/`SAVEBASE`）、`IRule` 插件链再次排除 | ✅ 7 / ➖ 2 / ⬜ 6 | 纯**反编译级**+UPM 配置；**`po_order` 表名未从 VO 核实**（计划里的 `po_order` 不当已核事实用）、业务处理器是**运行时的**（离线查不到，需连库）、`PFBusiAction` 跨单据驱动未展开、审批流那半未展开、锁**未验**。**本份顺带补齐了第 7、8 份的最大缺口** |
| 采购订单保存提交 | `po_order`（**未核实**）+ 动作驱动 2 表 | [采购订单保存提交调用链.md](./采购订单保存提交调用链.md) | NCC2505 | **7 项**：入口（`pu.poorder.saveandcommit` → `OrderSaveCommit`，**类名无 Action 后缀**，44 行全文）、纵向链路、**两阶段执行机制**（`saveCommit` 两趟 `service.run`，动作名 `save`/`commit`，`SCMCloudPFlowContext`，**`billVos` 显式重置**）、**`SaveAndCommitException` 语义**（提交失败带回现场，入口当结果返回 → "报错了但单据已在"是设计）、`IIgnoreNextActionCheck` 提前返回、`isSCC` 逐张动作名、信用+发票 `InvoiceSaveAndCommitFlag`、审计场景 `SaveAndCommit`、**销售 vs 采购逐字对照**、`runBacth` vs `run` 两入口辨析 | ✅ 7 / ➖ 0 / ⬜ 7 | 纯**反编译级**；**两趟是否同一事务未验（本档案最重要的未决项，从 `SaveAndCommitException` 设计反推更像两段独立事务）**、`po_order` 未核实、`AbstractOrderSaveAction` 父类未展开、权限检查位置因入口而异（本入口无、销售提交有）、`dealPseudoColumn`/`dealChildVOLengthChanged`、业务处理器清单需连库、字段实测**未验** |
| 到货单保存提交 | `po_arriveorder` + **4 张子表**（`po_arriveorder_b`/`_bb`/`_f`/`_bf`） | [到货单保存提交调用链.md](./到货单保存提交调用链.md) | NCC2505 | **8 项**：入口（`pu.arrival.saveandcommit` → `SaveAndCommitAction`，**类名极通用须按 XML 定位**，111 行）、纵向链路 9 跳、**入口基类 `DataPermissionAction` 与权限三抽象方法**（解开第 10 份的权限疑问）、**`AskWithCheckException` 确认往返**（`skipCodes` ↔ `ArrivalUIToBSEnv.setbBack/setbConfirm`）、两阶段执行（同 `saveCommit`，`"SAVEBASE"`+`"SAVE"`）、**表落点主表+4 子表**（100/219/27/66/115 字段）、`ArriveStatusEnum` 五态、保存后回填（`ArrivalScalaSetter` + `ArrivalPrecisionHandler`） | ✅ 8 / ➖ 0 / ⬜ 6 | 纯**反编译级**；**到货单有两个"保存提交"入口（`saveSend` vs `saveandcommit`）差别未查**、入参 `ResumeExceptionInfo` 全貌、`ArrivalUIToBSEnv`/`ArrivalScalaSetter`/`ArrivalPrecisionHandler`/`CommitAssignUtils.before` 内部、事务与锁、业务处理器清单需连库、字段实测**未验** |
| 请购单保存 | `po_praybill`（+`po_praybill_b`） | [请购单保存调用链.md](./请购单保存调用链.md) | NCC2505 | **7 项**：**四个同名入口全部反编译辨析**（`save`/`newSave` 逐行同构、`copy` 实为查询、`saveCommit` 真保存提交）、纵向链路 8 跳、`setDefaultValue` 子表挂主键、**第二种"两阶段"写法**（入口手写两趟 `runBacth`，与第 10 份的 `saveCommit` 公共服务写法 7 维对照）、**权限检查位置新形态**（`DataPermissionAction`，且在两趟之间判"保存成功后的 VO"）、`fbillstatus` 五态（多"关闭"）、`fpraysource` **15 个请购来源**、版本链与修订链字段、`DealResumeException`（续跑工具第 3 个变体） | ✅ 7 / ➖ 0 / ⬜ 6 | 纯**反编译级**；**两个保存提交入口（`saveCommit` vs `saveandcommit`）差别未查**、`pu.buyingreq_r.*` 修订链与 `buyingreqarrange` 安排链未展开、`setDefaultValue` 完整规则、`BuyingReqScaleUtil`、事务（手写两趟更疑为两段独立事务，仍属推断）、锁、字段实测**未验** |

## 公共机制（跨实体复用，不随实体变）

| 主题 | 文件 | 说明 |
| --- | --- | --- |
| 事件与规则机制 | [ncc-event-and-rule-mechanism.md](./ncc-event-and-rule-mechanism.md) | `IBusinessListener` 事件订阅 vs `IRule` + `RuleCollection` + `pub_pluginitem` 插件链；`IRule` 有三个同名接口 |
| MD 持久化公共通道 | 见 [客户档案保存调用链.md](./客户档案保存调用链.md) 第 3 节第四、五段 | 所有走元数据映射的单据共用（`BDSingleBaseService` → `VOPersister` → `JdbcPersistenceManager`） |
| **BD 基础档案有三套并行模板** | ① 单条版：[客户档案保存调用链.md](./客户档案保存调用链.md) 第 3 节第四段（`BDSingleBaseService` → `SingleBaseService#insertVO:123` 十步）<br>② 多管理类型版：[财务核算账簿保存调用链.md](./财务核算账簿保存调用链.md) 第 5 节（`OrgMultiManageTypeBaseService` → `MultiManageTypeBaseService#insertVO:220` 十步，数组签名 + `PKLock` 组织维度动态锁）<br>③ **树形版**：[部门保存调用链.md](./部门保存调用链.md) 第 6 节（`DeptTreeBaseService` → `TreeBaseService#insertVO:139` 十步，根分支锁 `RootLockUtil.lockBranchRoot` + `MDTreePersistenceUtil#insertVOWithInnerCode`） | 三套**步骤名同构、锁与落库方式各不相同**。<br>**挖新档案先分辨走哪支**——看构造函数参数形态：`(mdId, subAttrs)` = ①；`(mdId, entityClass, subAttrs)` = ②；`(mdId, treePersistenceStyle)` 且继承 `TreeBaseService` = ③。<br>树形版多一条约定：实体有 `innercode`（树内码），落库走 `insertVOWithInnerCode` |
| **基础档案"直连式" vs 单据"流程式"** | 直连式（前 6 份）：[客户档案保存调用链.md](./客户档案保存调用链.md) 第 3 节第四段<br>流程式：[销售订单保存调用链.md](./销售订单保存调用链.md) 第 3、10 节 | **基础档案**：`Action → XxxServiceImpl#insertVO → getPersistenceUtil/dbInsertVO → (MD 通道)`，业务逻辑在 Service 实现里，表名由 `VO.getDefaultTableName()` **硬编码**返回。<br>**单据（销售订单）**：`Action → XxxMaintainWebServiceImpl#save → ICloudScriptPFlowService.exeScriptPFlow(context) → CloudPfUtil.runAction → IplatFormEntry.processAction → IPFBusiAction.processAction → …`，动作被翻译成 **`actionName="WRITE"` + `billType="30"` 两个字符串**交给流程引擎，表名由 **`BillMetaFactory.getBillMeta("so.so_saleorder")` 元数据反查**。<br>→ 做单据客开时**别套基础档案的模板**；要找的是**动作处理器与规则**，不是 `insertVO`。单据还可能带 **Saga 分布式事务字段**（`saga_frozen/saga_gtxid/saga_btxid/saga_status`） |
| **单据的"提交"不是独立语义，由 `hasFlow` 决定真实动作** | 见 [销售订单提交调用链.md](./销售订单提交调用链.md) 第 5 节 | `IBatchRunScriptService.runBacth` 的 `actionnames = {"SAVE","APPROVE","UNSAVE","UNAPPROVE"}`；单据传进来的 `"SAVE"`/`"UNSAVE"` **会被按审批流改写**：<br>· `commit` + 无审批流 → **`APPROVE`**（提交=直接审批通过）<br>· `commit` + 有审批流 → `SAVE`（存下并送审）<br>· `uncommit` + 流程未在执行 → **`UNAPPROVE`**；流程在执行 → `UNSAVE`<br>**三处 hasFlow 判定别混**：`IWorkflowDefine.hasValidProcessDef`（有无流程定义）/ `IPFWorkflowQry.isApproveFlowStartup2`（流程是否在跑）/ `PfUtilTools.isHasStartFlow`（保存路径用的那个）。<br>另：单据的 `IFlowBizItf` 实现是按元数据取的（`PfMetadataTools.getBizItfImpl`），取不到直接抛 `04001004-0086` |
| **单据的业务动作处理器是"配表"的，不在代码里**（+ 找不到实现类时用 UPM 反查） | [采购订单保存调用链.md](./采购订单保存调用链.md) 第 5 节（含驱动 SQL 全文与字段语义） | **① UPM 反查**（适用范围不限本主题）：按接口名在 `<HOME>/modules/<模块>/META-INF/*.upm` 里找 `<implementation>`。实测 `modules/riawf/META-INF/P_platform50_rt.upm`：`IPFBusiAction` → **`nc.bs.pub.pf.pfframe.PFBusiAction`**（类名**无 `Impl` 后缀**，按名字猜永远 0 命中）、`IplatFormEntry` → `PlatFormEntryImpl`。<br>**② 动作驱动表**（单据业务逻辑的真正位置）：`PFBusiAction#queryActionDriveVOs` → `PfUtilDMO#queryDriveAction` → 查 **`pub_actionconstrict`**（`sysindex` 排序 / `isbefore` 前后 / `conditionXpression` 条件 / `configflag`+`operator` 生效范围 / `pk_billtype`+`actiontype` 定位）⋈ **`pub_function`**（`classname` + `methodname`）。<br>→ **所以"在 so/pu 模块里搜 `*SaveBP` 找不到"是正常的**，不是索引坏；想知道某动作跑了哪些类，只能连库查（SQL 示例见档案）。<br>→ **`IRule` 插件链在 `PFBusiAction`（2948 行）全文 0 命中**：这类单据走动作驱动表，不走 `IRule` |
| **"保存提交"是两阶段执行：同一引擎跑两遍**（+ `IBatchRunScriptService` 两个入口的区别） | [采购订单保存提交调用链.md](./采购订单保存提交调用链.md) 第 4、6 节 | `ISCMPubSaveCommitService#saveCommit(bills, userObj, clazz, **save**, **commit**, billtype)`：<br>① 第 1 趟 `context.setActionName(save)` → `service.run` → `utils.combine` 把结果合并回界面 VO；<br>② **显式重置 `billVos`** → `context.setActionName(commit)` → `service.run`（第 2 趟）。<br>· 提交失败抛 **`SaveAndCommitException`** 携带现场对象，**入口 catch 里当"结果"返回**——所以"报错了但单据已在"是**设计行为**。<br>· `IIgnoreNextActionCheck` 可提前返回（只保存不提交）；`isSCC` 时动作名逐张由 `PfServiceScmForSSC` 给。<br>· 用的是 **`SCMCloudPFlowContext`**（`CloudPFlowContext` 的子类，多一个 `actionNames` 数组）——这正是"逐张不同动作名"分支的来源。<br>**两个入口别混**：`runBacth(...)` = 单独保存/提交（内部按 `hasFlow` 改写动作名）；`run(...)` = `saveCommit` 的两趟（调用方**显式**传两个动作名）。`saveCommit` 与独立入口的对照：[销售订单保存提交](采购订单保存提交调用链.md) 用 `"WRITE"`+`"SAVE"`、采购用 `"SAVEBASE"`+`"SAVE"`——**`commit` 侧统一是 `"SAVE"`，`save` 侧各单不同** |
| **入口基类决定入口拥有哪些能力**（权限检查、参数形态、异常分支） | [到货单保存提交调用链.md](./到货单保存提交调用链.md) 第 6 节（三种形态全表 + `DataPermissionAction` 30 行全文） | 同一批单据里已见**三种**：<br>① 直接 `implements ICommonAction`（销售订单保存、采购订单保存/保存提交）——**无权限检查**；<br>② `extends AbstractGridAction<E>`（销售订单提交）——`doAction` 模板白送 `DataPermissionUtil` 权限；<br>③ `extends DataPermissionAction`（到货单保存提交）——**三种 `checkPermission` 重载**，子类实现 `getPermissioncode`/`getActioncode`/`getBillCodeField`。<br>→ **"这个入口有没有权限检查"不能按动作类型猜，要看它继承谁**。<br>⚠️ 这些基类**同名类极多**（`DataPermissionAction` 7+ 个、`AbstractGridAction` 7 个），**必须按包名/jar 分辨**；到货单用的是 `nccloud.web.scmpub.pub.action.DataPermissionAction` |
| **「保存提交」至少有两种实现写法**（不能假设都调 `saveCommit`） | ① 公共服务写法：[采购订单保存提交调用链.md](./采购订单保存提交调用链.md) 第 4 节<br>② 入口手写写法：[请购单保存调用链.md](./请购单保存调用链.md) 第 6 节 | ① `ISCMPubSaveCommitService#saveCommit(..., save, commit, billtype)` —— 用 **`SCMCloudPFlowContext`** + `service.run`，两趟动作名由调用方传入（采购/销售/到货单）。<br>② **入口自己写两趟**：两个普通 `CloudPFlowContext` + `runBacth`，动作名硬编码（请购单 `"SAVEBASE"`／`"SAVE"`）。<br>→ 排查"保存提交"时**先看入口调的是 `saveCommit` 还是手写两趟**；两者的权限检查、context 类型、审计摘要都不同。<br>→ **`checkPermission` 的位置已见 4 种**：入口基类白送（`AbstractGridAction`）/ 自己实现三抽象方法（`DataPermissionAction`）/ **在手写两趟之间、用"保存成功后的 VO"判**（请购单）/ 无（`ICommonAction`） |
| **一个业务动作可能有多个同名入口**（label 完全一样，用途不同） | [请购单保存调用链.md](./请购单保存调用链.md) 第 2、4 节 | 请购单有**四个** label 都叫「请购单保存」的入口：<br>· `pu.buyingreq.save`（`BuyingreqInfoSaveAction`）—— 真保存<br>· `pu.buyingreq.newSave`（`BuyingreqInfoNewSaveAction`）—— **与上一条逐行同构，重复入口**<br>· `pu.buyingreq.copy`（`BuyingreqCopyAction`）—— **label 是保存，实际调查询服务**（`IBuyingReqQueryCardInfoService`）<br>· `pu.buyingreq.saveCommit`（`BuyingreqInfoSaveCommitAction`）—— 保存提交<br>→ **定位入口只能用「动作名 + 类名」，绝不能只看 label**；挂客开钩子时**同构的重复入口要一起挂**，否则从另一个按钮进来不生效 |
| **库存（`ic`）链自成一套体系** | [销售出库单保存调用链.md](./销售出库单保存调用链.md) 第 4、5、7 节 | 库存链**不用** `SCM*` / `so` / `pu` 那套接口，而是：<br>· `ICBillVO`（单据 VO）· `ICBillCardOperator`（卡片转换）· **`IICFilterData`**（前置过滤 + 货位填充）· **`ICPFResumeExceptionUtil`**（续跑，`processBefore` **直接返回 context**）· **`ICBillType`**（单据类型，**多一个 `ICBillTypeConst` 的 In/Out/Adjust/Other 分类**）。<br>· **入口是模板方法**：子类只重写 `getBilltype()`（销售出库 `SaleOutSaveAction` 仅 35 行），全流程在 `nccloud.web.ic.pub.action.SaveAction`（259 行）。<br>· **表名规律**：**实体名去掉 `VO` + 部位后缀** —— `_h` 表头 / `_b` 表体 / `_l` 货位单品 / `_f` 费用项 / `_bf` 物料费用明细（基础档案是 `bd_*`、采购销售订单是主子表直接加 `_b`）。<br>· `actionName` 是 **`"WRITE"`**（与销售订单保存相同，但采购订单保存是 `"SAVEBASE"`）。<br>· **出库/入库走"签字"不走审批流**（表头有 `approver`/`taudittime` 注释即"签字"，**无 `fpfstatusflag`**）。 |
| 销售出库单保存 | `ic_saleout_h`（+`_b`、`_l`） | [销售出库单保存调用链.md](./销售出库单保存调用链.md) | NCC2505 | **7 项**：入口（`ic.saleout.save` → **35 行薄壳** `SaleOutSaveAction`，只重写 `getBilltype()`）、纵向链路 11 跳、**库存链独立体系**（`ICBillVO`/`ICBillCardOperator`/`IICFilterData`/`ICPFResumeExceptionUtil`/`ICBillType` 五件套）、**模板方法基类** `ic.pub.action.SaveAction`（259 行全文）、**表名后缀规律**（`_h`/`_b`/`_l`/`_f`/`_bf`）、`ICBillType` **37 个库存单据码 + In/Out/Adjust/Other 四分类**全表、`actionName="WRITE"`、状态是**签字**（无 `fpfstatusflag`）、库存七步收尾（含货位/承运商/精度） | ✅ 7 / ➖ 0 / ⬜ 7 | 纯**反编译级**；**现存量更新与成本计算未挖到（库存链核心业务，应在动作驱动表配的业务类里）**、`checkReferencedBill`/`checkncorrespond` 内部、**货位机制三处分工未理清**、`srcflag` 组装/拆卸含义、签字链与保存链的关系、WMS/异步字段、事务与锁、字段实测**未验** |
| 采购入库单保存 | `ic_purchasein_h`（+`_b`、`_l`、`_f`、`_bf`） | [采购入库单保存调用链.md](./采购入库单保存调用链.md) | NCC2505 | **7 项**：入口（`ic.purchasein.save` → `PurchaseInSaveAction`，**416 行自包含**，不继承模板基类）、**与销售出库逐步对照**、**费用项处理**（`PurchaseInVO#getFee()`，多两张 `_f`/`_bf`）、`actionName="WRITE"`、单据状态 `processICBillstatusForWeb`（**卡片字段 `icbillstatus` ≠ DB 列 `fbillflag`**）、精度处理器 `PurchaseInExtBillCardPrecisionHandler`、表落点（112/328/58/67/117）、**发现 `processPK` 是死代码** | ✅ 7 / ➖ 0 / ⬜ 6 | 纯**反编译级**；**现存量更新与成本计算未挖到**、两张费用子表写入时机、`PurchaseInExtBillCardPrecisionHandler`、`BillCombine` vs `ClientBillCombinServer` 的选择、`checkReferencedBill` 完整规则、`afterProcess`/`fillBill` 后半段（416 行只读到 :207）、主表字段全表、事务与锁、字段实测**未验**。**已验死代码**：`processPK` 常量池仅出现 1 次、无调用指令（全 jar 56 个同类扫描 + 字节级计数） |
| 未确认应收单保存 | `ar_estirecbill`（+`ar_estirecitem`） | [未确认应收单保存调用链.md](./未确认应收单保存调用链.md) | NCC2505 | **7 项**：入口（`arap.estirecbill.save` → `EstiRecBillSaveAction`，113 行）、**财务链第四种入参** `SaveInfo`（`cardData` + `uiState`）、**`ArapBillUIUtil.executeBatchPM`**（4 重载 + 最内层全文；**5 个与前 14 份不同的点**）、**`pk_billtype` 从 VO 属性读**（不是硬编码/枚举）、`eParam` 带 `nosendmessage=Y`、**arap 11 个动作类型常量全表**（含 `AUDIT="APPROVE"` 名值不一致）、`IValidationService` **外部注入**校验、**表落点 `ar_`/`ap_` 前缀规律** | ✅ 7 / ➖ 0 / ⬜ 6 | 纯**反编译级**；字段明细未取、`pk_billtype` 实际取值、`SaveInfo` 完整结构、`BillActionUtils.setBusiInfoParm`、**`BaseAggVO`/`BaseBillVO`/`BaseItemVO`（第三套 VO 族）**、暂存链（`SAVETEMP`/`EDITTEMPSAVE`）、事务与锁、字段实测**未验**。**表落点已于当日补全** |
| 暂估应付单保存 | `ap_estipayablebill`（+`ap_estipayableitem`） | [暂估应付单保存调用链.md](./暂估应付单保存调用链.md) | NCC2505 | **9 项**：入口（`arap.estipayablebill.billsaveaction` → **`BillSaveAction`，计划稿类名是错的**）、**应付/应收两套保存路径并存**（`executeBatchPM`→PFlow vs `Service→BO→BSAction`）、**arap 三层分工**（BO/DAO/BSAction）、服务实现模板方法（5 个 `getXxxBSAction()`）、**单据类型码 `"23E1"`**、**应收/应付靠 VO 属性 `syscode` 分流**（同一个 `EstiBillBO`）、**期初关账校验**（`IInitBillCloseService`，码 `02006pub-0077`）、`BillCardUtil.dealSubjcodeAndCheckNo`（科目+支票号）、表落点 | ✅ 9 / ➖ 0 / ⬜ 6 | 纯**反编译级**+UPM 配置；**`EstiBillBO.saveEstiBills` 787 行只读前 106 行（最大缺口）**、**落库到底经 DAO 还是 BSAction 未验**、5 个 BSAction 内部、`ArapBillBaseServiceImpl` 父类、`BillActionUtils.setBusiInfoParm`、事务与锁、字段实测**未验** |

## 还没建档案、但值得建的

> **批量采集计划在 [_call-chain-archive-plan.md](./_call-chain-archive-plan.md)**：
> 16 个待建动作的入口名（已用 `query-action.js` 与 `ncc_meta_find` 核过）、分三批的顺序、档位与验收口径。
> 没在下面重复列，避免两处维护。

（暂无单独列出项——待建的 16 项全部在 [_call-chain-archive-plan.md](./_call-chain-archive-plan.md) 里，按批次推进。）

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
