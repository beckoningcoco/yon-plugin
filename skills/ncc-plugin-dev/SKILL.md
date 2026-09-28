---
name: ncc-plugin-dev
description: NCC（用友NC Cloud）业务插件（事件监听器）开发技能。当用户需要编写、生成、审查 NCC 业务插件代码时使用此技能。 触发场景包括但不限于：写一个审批后/新增后/修改后的事件监听、销售订单审批后自动生成采购入库单、 单据审批后自动回写字段、写一个业务插件、NCC事件监听、IBusinessListener、doAction、 单据转换 runChangeDataAry、saveCommit 保存提交、采购发票/销售订单/库存单据的业务插件开发、 NCC客开、NCC二开、用友NC Cloud插件开发、NCC定制开发。
---

# NCC 业务插件开发指南

## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**（非旗舰版 BIP）。

> **版本区分**：旗舰版（BIP）→ `yon-bip-dev` | NCC → `yon-ncc-dev`
>
> 收到问题时务必先判断版本。记录问题时注意路由到对应的技能目录。

---

> **本 skill 是 `ncc-dev`（NCC 定制开发总技能）的子技能，专注于业务插件（事件监听器）开发。**
> 通用素材（事件码表、单据类型表、编码规范、通用 API）请查阅 `ncc-dev` skill 的 `references/common/` 目录。

## 核心概念

**业务插件 = 事件监听器**，是实现 `nc.bs.businessevent.IBusinessListener` 接口的 Java 类。
通过 `event.getEventType()` 获取事件类型码（如 1020 表示审批后），在 `doAction()` 方法中编写业务逻辑。

> **注意**：`IBusinessEvent` 接口中**没有定义事件码常量**，必须在当前类中自定义常量来引用事件码，不要使用魔法值直接写在逻辑中。例如：`private static final int EVENT_APPROVE_AFTER = 1020;`

## 参考资料

### 场景专用资料

- **插件示例代码**：读取 `references/examples.md` — 三种典型模式的完整代码和解读（单据转换、字段回写、自定义档案同步）

### 通用资料（来自 ncc-dev，按需读取）

- **事件码表**：`ncc-dev` skill 的 `references/common/event-codes.md` — 查找需要的事件码
- **单据类型代码**：`ncc-dev` skill 的 `references/common/bill-types.md` — 查找单据类型代码
- **编码规范**：`ncc-dev` skill 的 `references/common/coding-standard.md` — 命名、注释、异常处理等规范
- **通用 API**：`ncc-dev` skill 的 `references/common/common-api.md` — 自定义档案操作、持久化查询、批量操作等
- **销售管理 VO**：`ncc-dev` skill 的 `references/common/so-vo-reference.md` — 销售管理模块 VO 与表名对照表
- **采购管理 VO**：`ncc-dev` skill 的 `references/common/pu-vo-reference.md` — 采购管理模块 VO 与表名对照表
- **库存管理 VO**：`ncc-dev` skill 的 `references/common/ic-vo-reference.md` — 库存管理模块 VO 与表名对照表

## 开发流程

### 第一步：理解需求

从用户的描述中提取以下关键信息：

| 需要确认的信息 | 说明 |
|--------------|------|
| **源单据** | 哪个单据触发的？（如销售订单 30） |
| **目标单据** | 要生成/回写哪个单据？（如请购单 20） |
| **触发时机** | 什么事件触发？（如审批后 1020） |
| **业务逻辑** | 具体做什么？（过滤条件、转换规则、回写字段等） |
| **模块代码** | 源单据和目标单据所属的模块（如 so、pu、ic） |

如果用户没有明确说明，主动询问。

> **建议：字段/表名定位顺序**（写码涉及具体表名、字段编码、枚举取值时，建议按下述优先级确认，而不是直接连库猜）：
> 1. **项目内既有同类产物 / 记忆** — 同需求可能已在别处实现过，搜一下现有 plugin/代码，可直接复用其字段结论。
> 2. **以上都无法确认的业务语义** — 用 AskUserQuestion 向用户澄清，不要反复猜测。
>
> 顺序原则：`本地字典 → 既有代码/记忆 → 问用户`，尽量少做"连库猜字段"这种费时且易错的事。

### 第二步：确定包路径和类名

客户化前缀为 `hk`，包路径遵循以下规则：

```
nc.hk.bs.{模块}.{业务组件}.listener
```

- `bs` = 业务组件层
- `模块`：so（销售）、pu（采购）、ic（库存）、ar（应收）、ap（应付）等
- `业务组件`：具体业务对象名称

类名建议：`{源单据}{动作描述}Listener`，如 `SaleOrderCreatePrayBillListener`

### 第三步：编写代码骨架

每个业务插件都必须遵循以下骨架：

```java
package nc.hk.bs.{模块}.{业务组件}.listener;

import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.framework.common.NCLocator;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;

// 根据需要导入其他类...

/**
 * {简短描述业务功能}
 */
public class {类名} implements IBusinessListener {

    // 事件码常量（IBusinessEvent 中没有定义，需自定义）
    private static final int EVENT_APPROVE_AFTER = 1020;

    @Override
    public void doAction(IBusinessEvent event) throws BusinessException {
        try {
            // 1. 获取事件数据
            // 2. 类型转换和空值检查
            // 3. 业务逻辑处理
            // 4. 异常封装（非 EJB 边界）
        } catch (Exception e) {
            ExceptionUtils.wrappException(e);
        }
    }
}
```

### 第四步：根据场景填充业务逻辑

#### 场景A：单据转换 + 保存提交（最常见）

典型模式：审批后自动从源单据生成目标单据。

```java
// 1. 获取事件对象
Object obj = busiEvent.getObjs();
if (obj == null) return;
if (!(obj instanceof SaleOrderVO[])) return;
SaleOrderVO[] vos = (SaleOrderVO[]) obj;
if (vos.length == 0) return;

// 2. 过滤/校验（按需）
// - 交易类型过滤
// - 自定义字段条件过滤
// - 防重复检查（查询目标单据是否已存在）

// 3. 单据转换
IPfExchangeService transferService = NCLocator.getInstance()
    .lookup(IPfExchangeService.class);
TargetBillVO[] result = (TargetBillVO[]) transferService.runChangeDataAry(
    "源单据类型代码", "目标单据类型代码", 源VO数组, null);

// 4. 设置行号（转换后必须）
for (TargetBillVO vo : result) {
    TargetItemVO[] children = vo.getBVO();
    int count = 0;
    for (TargetItemVO item : children) {
        item.setAttributeValue("pseudocolumn", count++);
        item.setCrowno(count + "0");
    }
}

// 5. 保存提交
PfUserObject pfUserObject = new PfUserObject();
ISCMPubSaveCommitService saveCommitService =
    (ISCMPubSaveCommitService) NCLocator.getInstance()
        .lookup(ISCMPubSaveCommitService.class);
saveCommitService.saveCommit(result, pfUserObject, TargetBillVO.class,
    "SAVEBASE", "SAVE", POBillType.XXX.getCode());
```

**关键 API 说明**：

| API | 说明 |
|-----|------|
| `IPfExchangeService.runChangeDataAry(源类型, 目标类型, 源VO, null)` | 调用单据转换模板，参数为单据类型代码字符串 |
| `ISCMPubSaveCommitService.saveCommit(VO, pfObj, clazz, "SAVEBASE", "SAVE", billType)` | 保存并提交单据 |
| `MDPersistenceService.lookupPersistenceQueryService().queryBillOfVOByCond(clazz, whereSql, false)` | 按条件查询 VO（详见通用 API 手册） |

#### 场景B：字段回写/校验

典型模式：新增/修改后回写关联单据的字段。

```java
// 1. 获取 VO 和字段值
String targetId = (String) headerVO.getAttributeValue("vdef2");

// 2. 查询目标 VO（通用持久化查询方式）
IMDPersistenceQueryService queryService =
    MDPersistenceService.lookupPersistenceQueryService();
TargetVO[] targetVOs = (TargetVO[]) queryService.queryBillOfVOByCond(
    TargetVO.class, "pk_source = '" + sourcePk + "' and dr = 0", false);

// 3. 修改字段
targetVO.setAttributeValue("目标字段", value);

// 4. 保存更新
BatchOperateVO batchVO = new BatchOperateVO();
batchVO.setUpdObjs(new TargetVO[]{targetVO});
someService.batchSave(pk_org, batchVO);
```

**关键点**：
- 访问自定义字段用 `getAttributeValue("字段名")` / `setAttributeValue("字段名", value)`
- 自定义字段通常是 `vdef1`、`vdef2` 等或 `def1`、`def2` 等命名
- 批量更新时按 `pk_org` 分组

#### 场景B2：同步数据到自定义档案（DefdocVO）

典型模式：审批后/新增后将单据数据同步写入 BD 自定义档案。

> **自定义档案的完整 API 用法**（查询、新增、更新）请查阅 `ncc-dev` 的 `references/common/common-api.md`。

**同步策略（先查后写）**：

```java
// 1. 通过档案定义编码加载全部档案记录
DefdocVO[] allDocs = getDefDocArrayByListCode(DEFDOC_LIST_CODE);

// 2. 在内存中按编码匹配
DefdocVO existingDoc = null;
if (allDocs != null) {
    for (DefdocVO doc : allDocs) {
        if (projectCode.equals(doc.getCode())) {
            existingDoc = doc;
            break;
        }
    }
}

// 3. 存在则更新，不存在则新增
if (existingDoc != null) {
    existingDoc.setAttributeValue("def1", projectName);
    updateDefdoc(existingDoc);
} else {
    DefdocVO newDoc = new DefdocVO();
    newDoc.setCode(projectCode);
    newDoc.setName(projectName);
    newDoc.setPk_org(headerVO.getPk_org());
    newDoc.setAttributeValue("def1", projectName);
    insertDefdoc(newDoc);
}
```

#### 场景C：事件分发模式

当一个类需要在多种事件下执行不同逻辑时：

```java
public void doAction(IBusinessEvent event) throws BusinessException {
    try {
        int eventType = event.getEventType();
        Object obj = event.getObjs();
        if (obj == null) return;

        InvoiceVO[] vos = (InvoiceVO[]) obj;

        switch (eventType) {
            case 1001: // 新增前
                checkBeforeInsert(vos);
                break;
            case 1002: // 新增后
                handleAfterInsert(vos);
                break;
            case 1003: // 修改前
                checkBeforeUpdate(oldVos, newVos);
                break;
            case 1004: // 修改后
                handleAfterUpdate(oldVos, newVos);
                break;
            case 1005: // 删除前
                checkBeforeDelete(vos);
                break;
            case 1006: // 删除后
                handleAfterDelete(vos);
                break;
        }
    } catch (Exception e) {
        ExceptionUtils.wrappException(e);
    }
}
```

## 输出要求

1. **生成完整的 Java 文件**，包含包声明、导入、类注释
2. **类注释用中文**，说明功能用途
3. **方法注释说明功能**，复杂的算法/逻辑添加行内注释
4. **遵循编码规范**：命名、格式、异常处理
5. 如果需求不明确，先列出需要确认的问题，等用户回答后再生成代码
6. 如果涉及单据类型代码或事件码，主动查阅参考表并确认
7. 需要操作自定义档案时，查阅 `ncc-dev` 的通用 API 手册
