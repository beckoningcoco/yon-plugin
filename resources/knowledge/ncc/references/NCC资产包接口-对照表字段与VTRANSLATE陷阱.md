# 资产包接口：对照表字段与 VTRANSLATE 的坑

> 场景：NCC 2111，资产包接口要接收外系统的组织编码（如九恒星司库传 `HW001`），
> 经对照表 `01JSSKZZ` 换成 NCC 组织编码，再翻译成组织主键写进 `bd_project.pk_org`。

## 配置长什么样

`pub_interuleitem` 里一条字段映射：

| 列 | 值 | 含义 |
|---|---|---|
| `VFIELD` / `VEXTFIELD` | `pk_org` | 实体字段 / 报文里的键 |
| `FCONVERT` | `2` | 对照表转换 |
| `VCONTRAST` | 对照表主键 | `pub_intecontrast.pk_intecontrast` |
| `VCONVERTPARAM` | `1` | 集团级翻译 |
| `VCONVERTRULE` | `1` | 按编码翻译 |
| `VTRANSLATE` | `0` 或 `1` | 见下 |

对照表主表 `pub_intecontrast`，明细表是 **`pub_contrastdata`**（不是 `pub_intecontrastdata`）：
`SRCVALUE` = 外系统编码，`DESVALUE` = **NCC 组织编码**（不是主键）。

## 两个必须知道的行为

源码：`modules/opm/classes/nccloud/api/AbstractRestResource.java`

### 1. `transfer()` 会把 null 变成字符串 `"null"`

对照表分支：

```java
value = valueMap.get(extField);          // 报文没传 → null
String[] values = String.valueOf(value).split(",");   // → ["null"]
value = "";
for (...) { ...查对照表...; value += original + ","; }
value = value.substring(0, value.length() - 1);       // → "null"
```

于是 `"null"` 通过了后面的 `value instanceof String && !isEmpty` 判断，进入翻译。

**后果（VTRANSLATE=1）**：翻译必然失败 → 抛

```
【pk_org管理组织】：null不存在！
```

也就是说：只要规则里挂了这条，`add` / `update` / `enable` / `disable` **全部**必须带这个字段，
哪怕某几个接口的业务上根本不需要它。

### 2. `VTRANSLATE` 非空会清空出参

`getReturnValue()`：

```java
if (vtranslate != null) {
    String translateValue = null;
    if (TRANSLATEENUM_ZIDINGYI4...) { translateValue = ...; }   // 只有"自定义翻译"会赋值
    value = translateValue;                                     // 其余一律 null
}
```

**后果**：查询/新增的返回报文里，这个字段永远是 null —— 接口出参拿不到它。
改成 0 也不行（0 同样非空）。要回显只能用"自定义翻译(4)"挂一个 Java 类。

### 3. `VTRANSLATE=0` 的副作用：脏值入库

`transfer()` 里 `value = translateValue`，而 `translate()` 查不到时**返回原值**（不是 null），
`VTRANSLATE=0` 又不报错 → 最终把 `"null"` 或原始编码（`XXX999`）原样写进实体字段。

## 推荐做法

```
FCONVERT = 2（对照表）
VCONTRAST = 对照表主键
VCONVERTPARAM = 1，VCONVERTRULE = 1
VTRANSLATE = 0
```

然后在资源类里自己校验（`ProjectResource.checkOrgExists`）：

```java
private void checkOrgExists(String pkOrg) throws BusinessException {
    if (pkOrg == null || pkOrg.trim().length() == 0 || "null".equalsIgnoreCase(pkOrg.trim())) {
        throw new BusinessException("管理组织（pk_org）不能为空，或组织编码未在对照表 xxxx 中维护");
    }
    BaseDAO dao = new BaseDAO();
    Collection<?> rows = dao.retrieveByClause(OrgVO.class,
            "pk_org = '" + pkOrg.replace("'", "''") + "' and nvl(dr, 0) = 0", new String[] { "pk_org" });
    if (rows == null || rows.isEmpty()) {
        throw new BusinessException("管理组织（pk_org）无效：对照表未维护或组织不存在，当前值【" + pkOrg + "】");
    }
}
```

要点：**必须判字面量 `"null"`**，只判空字符串拦不住。

## 实测结论（环卫 NCC2111，2026-10-27）

| 配置 | 不带字段的 update | 组织错误时 | 出参 |
|---|---|---|---|
| `VTRANSLATE=1` | 报 `null不存在` | 报 `XXX999不存在` | 无 |
| `VTRANSLATE=0`（无代码校验） | 正常 | **静默写 `"null"` / `XXX999`** | 无 |
| `VTRANSLATE=0` + 代码校验 | 正常 | 报错，不写脏值 | 无 |

`0 + 代码校验` 是唯一能同时满足「其他接口不用带组织」和「组织错了不落脏值」的组合。

## 排查用 SQL

```sql
-- 规则项
SELECT SERIALNO, VFIELD, VFIELDNAME, FCONVERT, VCONTRAST,
       VCONVERTPARAM, VCONVERTRULE, VTRANSLATE, VQUERYPARAM
  FROM pub_interuleitem WHERE PK_RULE = '<规则主键>' ORDER BY SERIALNO;

-- 对照表明细
SELECT SRCVALUE, DESVALUE FROM pub_contrastdata
 WHERE PK_INTECONTRAST = '<对照表主键>' AND nvl(dr, 0) = 0;

-- 脏值核查
SELECT COUNT(1) FROM bd_project WHERE nvl(dr, 0) = 0 AND (pk_org IS NULL OR pk_org = 'null');
```
