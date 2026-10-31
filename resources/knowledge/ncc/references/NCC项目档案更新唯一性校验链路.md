# 项目档案（bd_project）更新时的编码唯一性校验链路

> 环境：NCC 2111（环卫），Home `NCC2111UAP_bak_20261015Win`
> 现象：更新项目时返回
> `下列字段值已存在，不允许重复，请检查：\n[项目编码: 9999]`
> 而同一编码**新增时可以成功**，两条数据并存。
> 本文全部结论来自反编译源码（`cfr-0.152`）+ 库表实测。

## 1. 报错从哪来

栈顶三段就是入口：

```
nc.impl.pmpub.uap.billrule.BDUniqueValidateRule.process
  → nc.impl.pubapp.pattern.rule.processer.CompareAroundProcesser.before
  → nc.impl.pubapp.pattern.data.bill.template.UpdateBPTemplate.update
  → nc.bs.pmpub.uap.project.bp.ProjectUpdateBP.update
  → nc.impl.pmpub.project.ProjectImpl.updateProjectbills / update
```

`BDUniqueValidateRule` 本身只有十几行，把活全交给 `nc.vo.util.BDUniqueRuleValidate`：

```java
public class BDUniqueValidateRule<E extends AbstractBill> implements IRule<E> {
    public void process(E[] vos) {
        if (ArrayUtils.isEmpty(vos)) return;
        ValidationFailure failure = new BDUniqueRuleValidate().validate(vos[0].getParentVO());
        if (failure != null) ExceptionUtils.wrappBusinessException(failure.getMessage());
    }
}
```

## 2. 为什么新增能过、更新被拦

关键在两条 BP 的规则链**不一样**（`modules/uapbd/META-INF/lib/uapbd_pmbase_rt.jar`）：

```java
// ProjectInsertBP —— 没有唯一性校验
FillInsertDataRule → DurationRule → FieldLengthCheckRule

// ProjectUpdateBP —— 有
FieldLengthCheckRule → DurationRule → BDUniqueValidateRule → UpdateAuditInfoBeforeRule
```

所以：

- **新增**：任何编码都能插进去（跨组织重复、甚至完全重复，只要长度/工期等规则通过）；
- **更新**：一旦保存，`BDUniqueValidateRule` 就会拿"更新后的编码"去查重。

这也解释了本项目的实测现象：同编码在 HW001、HW002 各建一条能成功（TC-A-02），
但之后对其中一条做任何更新，就会撞上另一条。

## 3. 唯一性范围是怎么算出来的

`BDUniqueRuleValidate` 有两个钩子：

```java
protected Collection<BDUniqueruleVO> getUniqueRules(IBean bean, SuperVO[] vos) {
    return this.getService().getBDUniqueruleVOById(bean.getID());   // 该实体的所有唯一性规则
}

protected String getUniqueScopeWhere(SuperVO vo, IBean bean) {
    return UniqueConditionUtil.getUniqueConditionByBean(vo, bean, null);   // 范围条件
}
```

### 3.1 唯一性字段：`BD_UNIQUERULE` + `BD_UNIQUERULE_ITEM`

项目档案实体 `md_class.id = 2ee58f9b-781b-469f-b1d8-1816842515c3`：

```sql
SELECT PK_RULE, RULECONTENT, ERRORCODE, ISCHECKNULL, ISDEFAULT
  FROM BD_UNIQUERULE WHERE MDCLASSID = '2ee58f9b-781b-469f-b1d8-1816842515c3';
-- PK_RULE=0001E11000000003HHT0  RULECONTENT=项目编码唯一  ERRORCODE=32001  ISCHECKNULL=Y

SELECT MDCOLUMNNAME FROM BD_UNIQUERULE_ITEM WHERE PK_RULE = '0001E11000000003HHT0';
-- 项目编码        ← 只有这一个字段
```

注意 `ISCHECKNULL=Y`：该规则的 `checknullFlag=true`，走的是"空值也校验"的分支。

### 3.2 范围：档案管控模式 `BD_MODE_SELECTED.UNIQUESCOPE`

```sql
SELECT MANAGEMODE, UNIQUESCOPE, VISIBLESCOPE FROM BD_MODE_SELECTED
 WHERE MDCLASSID = '2ee58f9b-781b-469f-b1d8-1816842515c3';
-- MANAGEMODE=6  UNIQUESCOPE=6  VISIBLESCOPE=6
```

`UniqueConditionUtil` 用 `UNIQUESCOPE` × `NODE_TYPE` 查表得条件。节点类型由数据自己决定：

```java
private static NODE_TYPE getNodeTypeByPk_groupAndPk_org(String pk_group, String pk_org) {
    if (pk_org 非空 && pk_group 非空 && pk_org.equals(pk_group)) return GROUP_NODE;
    if (pk_org 非空 && pk_org != pk_group && pk_org != "GLOBLE00000000000000") return ORG_NODE;
    return GLOBE_NODE;
}
```

`UNIQUESCOPE=6` 那一行的三种节点：

| 节点 | 条件 SQL | 含义 |
|---|---|---|
| GLOBE | 报错消息（`UniqueConditionUtil-000002`） | 全局数据不允许该规则 |
| GROUP | `pk_group = '{pk_group}'` | 同集团 |
| ORG | `pk_org = '{pk_group}' or pk_org = '{pk_org}'` | **集团组织 或 本组织** |

> 项目档案的数据一般挂组织（`pk_org != pk_group`），走 **ORG_NODE**，
> 所以实际口径是「**本组织 + 集团组织**这两处合起来唯一」，不是单纯"组织内唯一"。

### 3.3 最终 SQL

`BDUniqueruleQryServiceImpl.getBreakRules()`：

```java
where = <唯一性字段等值> + uniquescope + filterMsg + " and isnull(dr,0) = 0";
String sql = "select " + vo.getPKFieldName() + " from " + bean.getTable().getName() + " where " + where;
ArrayList<String> existDBPKS = execQuery(sql, ...);
if (存在结果 && !toBeValidatePKList.contains(existDBPKS.get(0))) 判定重复;
```

其中 `filterMsg` 来自 `getFilterWhere()`，**排除自身**：

```java
protected String getFilterWhere(IBean bean, SuperVO vo) {
    if (vo.getPrimaryKey() 非空) return " " + column.getName() + " <> '" + vo.getPrimaryKey() + "'";
    return null;
}
```

拼出来大致是：

```sql
select pk_project from bd_project
 where project_code = ?                                  -- 唯一性字段
   and (pk_org = '<集团组织>' or pk_org = '<本组织>')      -- UNIQUESCOPE=6 + ORG
   and pk_project <> '<自身主键>'                          -- 有主键时
   and isnull(dr, 0) = 0
```

查到任何一行 → 报 `下列字段值已存在，不允许重复，请检查：[项目编码: xxx]`。

## 4. 用库里的数据对一遍

`9999` 在库里只有一条，组织是集团组织：

```
pk_project = 1001E1100000003GK406
project_code = 9999
project_name = 预算表
pk_org = 0001E1100000000021BE   ← 集团组织
```

更新的那条项目挂在 HW001（`0001E110000000001329`），节点类型为 ORG，
条件 `pk_org='0001E1100000000021BE' or pk_org='0001E110000000001329'` ——
正好命中那条集团组织的 `9999`，于是报重复。

**与"编码是否被别的组织占用"无关，是"集团组织上也有个同编码"导致的。**

## 5. 对接口开发的影响

本项目在 `ProjectResource.add()` 里自己实现了"组织内唯一"（按 `pk_org` 精确匹配），
和 NCC 的"集团组织 + 本组织"**口径不一致**：

| 场景 | 我们的前置校验 | NCC 的 update 校验 | 结果 |
|---|---|---|---|
| 同编码，分别建在 HW001 / HW002 | 放行 | — | 新增成功 |
| 更新其中一条（编码不变） | 放行（自身排除） | 若集团组织无同编码则过 | 正常 |
| 更新某条，编码改成集团组织上的既有编码 | 放行（不同组织） | **拦** | 报"已存在" |
| 新增时不校验，库里已有多条同编码 | — | 更新任一条都可能被拦 | 报"已存在" |

## 6. 处置选项

1. **与 NCC 对齐**（改动最小）：把接口的前置校验改成 `pk_org in (本组织, 集团组织)`，
   提前给出包含组织信息的错误，而不是让 NCC 的通用文案兜底。
2. **调整管控模式**：`BD_MODE_SELECTED.UNIQUESCOPE` 改为更合适的值
   （参照 `UniqueConditionUtil` 的 7×3 矩阵）。改的是"基础档案管控模式"，影响该档案所有入口。
3. **停用这条唯一性规则**：删除/停用 `BD_UNIQUERULE` 里 `0001E11000000003HHT0`
   （项目编码唯一）。注意 `ProjectInsertBP` 本来就没挂它，停用只影响更新。
4. **补齐新增侧校验**：`ProjectInsertBP` 不带唯一性规则，如果业务要求"编码唯一"，
   新增侧必须由接口或事件补上——本项目的 `checkProjectCodeUnique` 正是在做这件事。

> ⚠️ 选项 1 与 4 属于接口层兜底；2 与 3 动的是平台配置，会同时影响标准产品的
> 列表新增/修改入口，改前请和业务确认"项目编码到底是全集团唯一，还是组织内唯一"。

## 7. 排查清单（下次遇到同类问题直接照做）

```sql
-- 1. 该实体有哪些唯一性规则、包含哪些字段
SELECT r.PK_RULE, r.RULECONTENT, r.ERRORCODE, r.ISCHECKNULL, i.MDCOLUMNNAME
  FROM BD_UNIQUERULE r
  LEFT JOIN BD_UNIQUERULE_ITEM i ON i.PK_RULE = r.PK_RULE
 WHERE r.MDCLASSID = '<实体 md_class.id>' AND NVL(r.DR,0)=0;

-- 2. 该实体的档案管控模式（决定唯一性/可见性范围）
SELECT MANAGEMODE, UNIQUESCOPE, VISIBLESCOPE
  FROM BD_MODE_SELECTED WHERE MDCLASSID = '<实体 md_class.id>';

-- 3. 冲突数据到底在哪
SELECT project_code, pk_org, pk_group, enablestate
  FROM bd_project WHERE project_code = '<编码>' AND NVL(dr,0)=0;
```

反编译命令（本机已有 cfr 与 ufjdk）：

```bash
java -jar resources/knowledge/ncc/cfr-0.152.jar \
  <解压出来的 class 文件> > out.java
```

`BDUniqueValidateRule` / `ProjectUpdateBP` / `ProjectInsertBP` 在
`modules/uapbd/META-INF/lib/uapbd_pmbase_rt.jar`；
`BDUniqueRuleValidate` / `AbstractUniqueRuleValidate` / `UniqueConditionUtil` 在
`modules/baseapp/lib/pubbaseapp_appctrlmode_rtLevel-1.jar`；
`BDUniqueruleQryServiceImpl` 在 `modules/baseapp/META-INF/lib/baseapp_appctrlmode_rtLevel-1.jar`。
