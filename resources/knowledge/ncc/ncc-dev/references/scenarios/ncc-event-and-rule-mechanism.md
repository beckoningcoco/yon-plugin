---
name: ncc-event-and-rule-mechanism
description: >
  NCC 里「规则」这个词对应两套完全不同的机制——一套是业务单据的事件/信息规则
  （IBusinessListener + AbsBdDocListener + *InformRule，客户、物料、供应商等基础档案走这条），
  另一套是 pubapp 的插件式规则链（IRule + RuleCollection + pub_pluginitem 表，服务类单据走这条）。
  本文件讲清两者怎么区分、各自的类与调用点、以及判断某个单据走哪条的取证方法。
  依据是 NCC2505（HOME_BYZY_BIP）的反编译，未做运行时验证。
---

# NCC 的「规则」机制：两套东西，别混

## 1. 什么时候读我

- 要判断**某个单据保存时会不会跑业务规则**、跑的是哪一套
- 要在单据上**挂钩子/加校验**，但不确定该实现 `IBusinessListener` 还是注册 `pub_pluginitem`
- 看到 `IRule`、`RuleCollection`、`*InformRule`、`pub_pluginitem`、`bcsi` 这些名字，要知道它们各属哪一层
- 有人问「客户保存的规则链在哪」——先看本文件第 4 节，别直接去翻 `IRule`

> **一句话区分**：
> **`IBusinessListener` 是"事件订阅"**（谁订阅了这个单据的事件，保存时被叫到）；
> **`IRule` + `RuleCollection` 是"插件链"**（服务单据在处理过程中按序跑一串规则，链上的项从 `pub_pluginitem` 表装配）。
> **客户、物料这类基础档案走的是前者，不是后者。**

## 2. `IRule` 这个类名有歧义——至少三个同名接口

按类名搜会得到一批同名接口，**它们互不相干**，选错就等于答错：

| 接口 | 所在 jar | 是什么 | 典型同族类 |
| --- | --- | --- | --- |
| **`nc.impl.pubapp.pattern.rule.IRule<E>`** | `pubpubapp_platformext_rtLevel-1.jar` | **插件式规则链**——本文要讲的那套 | `ICompareRule`、`RuleCollection`、`nc.bs.pubapp.pub.rule.*` |
| `nc.rule.datastruct.IRule` | `pubbaseapp_apprule_rtLevel-1.jar` | **查询模板的过滤规则**，与业务保存无关 | `AndRule`、`OrRule`、`QueryRule`、`nc.predicate.extend.*`、`nc.ui.querytemplate.*` |
| 其他模块自带的同名接口 | 各自模块 | 模块私有 | 按 jar 判断 |

**取证方法**：`ncc_class_search("IRule")` 之后**必须看 jar 名和同族的类**——
`pubpubapp_platformext` 下成组的才是插件链，`pubbaseapp_apprule` 下的是查询规则。

## 3. 插件式规则链：`IRule` + `RuleCollection` + `pub_pluginitem`

```java
// nc.impl.pubapp.pattern.rule.IRule
public interface IRule<E> { void process(E[] var1); }

// nc.impl.pubapp.pattern.rule.ICompareRule —— 前后对照用的变体
public interface ICompareRule<E> { void process(E[] var1, E[] var2); }
```

**实现类**在 `nc.bs.pubapp.pub.rule.*`（平台自带的一批通用校验）：
`ApproveStatusCheckRule` / `BillCodeCheckRule` / `CheckNotNullRule` / `CommitStatusCheckRule` /
`FieldLengthCheckRule` / `FillInsertDataRule` / `WorkflowCheckRule`，另有流程相关的
`nc.bs.pubapp.pf.rule.FlowBizRule`。

**例子（看形态）**：`CheckNotNullRule implements IRule` → 内部调 `BillBodyChecker.checkNoChildren((IBill[]) vos)`
——这是**给服务类单据（`IBill`）用的**，基础档案的 VO 不走这条。

**`RuleCollection`**（`nc/impl/pubapp/pattern/rule/plugin/`）是这条链的装配器，三个入口：

```java
add(...)            // 加入规则
addFinal(...)       // 加入"最后一定跑"的规则
addPluginRule(...)  // ★ 从外部注册的规则扩展里装配
```

`addPluginRule` 的关键几步（反编译读出）：

```java
List<RuleExtendVO> rules = RuleExtendManage.get(point, eventType);   // point/eventType 决定取哪一段
// ExtendType: AddBefore / AddAfter / Replace
IRule rule = (IRule) ObjectCreator.newInstance(vo.getSelfmodule(), vo.getSelf());
```

**扩展注册表是数据库表 `pub_pluginitem`**——客开通过它把自定义规则挂到某个扩展点（point）上。
装配失败时的原话是：

```
cann't create instance. ClassName: ... Please check register info in table pub_pluginitem
```

> ⚠️ 这条链的**运行证据还没验**：本环境（HOME_BYZY_BIP）的 `pub_pluginitem` 里到底有没有配置、
> 录 SPR 时到底跑没跑，都还没查（当时 `datasource_list` 里**没有能连 NCC2505 的库**）。

## 4. 客户档案走的**不是** `IRule`，是事件订阅

反编译客户保存链上的 14 个类，`Rule` **零命中**。客户档案的规则走另一条：

```java
// nc.bs.bcsi.rule.bd.listener.CustomerListener
public class CustomerListener extends AbsBdDocListener {
    protected AbsBdInformRule getInformRule() { return new CustomerInformRule(); }
}

// nc.bs.bcsi.rule.bd.listener.AbsBdDocListener implements IBusinessListener
public void doAction(IBusinessEvent event) {
    if (event instanceof BDCommonEvent) execInformRule();
}
```

事件类型常量：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `ADD` | `"1002"` | 新增 |
| `UPDATE` | `"1004"` | 修改 |
| `DELETE` | `"1006"` | 删除 |
| `BATCH_UPDATE` | `"1061"` | 批量修改 |

执行路径：

```java
rule.setOperType(operType);
Object[] vos = ((BDCommonEvent.BDCommonUserObj) event.getUserObject()).getNewObjects();
rule.process(vos);
```

**同族**：`MaterialListener`（物料）、`SupplierListener`（供应商）——基础档案都走这套；
`m21` / `m23` / `m30` / `m40` / `m4331` / `m4455` / `m45` / `m4k` / `m5x` / `m61` / `qc` 等模块下还有大量
`*ApproveRule` / `*UnApproveRule`。

**与保存调用链的接点**：`XxxServiceImpl.insertVO` 里的
`fireBeforeInsertEvent(vo)` / `fireAfterInsertEvent(vo)`（见 `客户档案保存调用链.md` 第 5 节）。
**代码链条已证，运行证据未验。**

## 5. 规则本身的配置（BCSI）

「业务规则配置」这个功能自身在 `bcsi` 模块：

| 层 | 类 |
| --- | --- |
| 界面 Action | `nccloud.web.bc.bcsirule.action.*` |
| 接口 | `nc.itf.bcsi.IBcsiRuleMaintain` |
| 后台 | `nc.bs.bcsi.maintain.BcsiRuleInsertBP` / `BcsiRuleUpdateBP` |
| VO | `nc.vo.bcsi.entity.AggBcsiRuleVO` / `BcsiRuleHVO` / `BcsiRuleBVO` / `BcsiRuleMVO` |
| 保存前校验 | `BcsiRuleInsertBeforeChkBP implements IRule<AggBcsiRuleVO>` → `BcsiRuleCommonRule.checkPropertyUnique` |

> 注意最后一行的形态：**规则配置这个功能自己的保存**用的确实是 `IRule`——
> **同一个类名在平台里服务不同的地方**，这正是第 2 节要强调的。

## 6. 怎么判断某个单据走哪条

按顺序取证，**不要凭单据类型猜**：

1. **反编译该单据的 Service 实现**（`XxxServiceImpl`），看 `insertVO` / `saveVO` 里有没有
   `fireBeforeInsertEvent` / `fireAfterInsertEvent` → 有则走**事件订阅**（第 4 节）
2. **搜有没有 `XxxListener extends AbsBdDocListener`**，或 `getInformRule()`
3. **搜规则链**：`ncc_class_search("RuleCollection")` 的调用方、或直接查 `pub_pluginitem` 表
   （需要能连该环境的库）
4. **最后才录 SPR 验证**：录一次只保存的 SPR，看「远程调用」里有没有规则相关的服务调用

## 7. 还没验过的

- `pub_pluginitem` 在本环境的实际内容（**当时 `datasource_list` 16 条里没有 NCC2505 的连接**）
- `CustomerInformRule.process(vos)` 内部到底做什么（只读到它被调用，没进去看）
- `AbsBdInformRule` 与 `IRule` 之间的关系——两者是不是同一个 `process` 协议，还是各有一套
- 上述行号/类名均来自 **NCC2505** 的 jar，**换版本可能漂移**（类名与调用顺序比行号稳定）
