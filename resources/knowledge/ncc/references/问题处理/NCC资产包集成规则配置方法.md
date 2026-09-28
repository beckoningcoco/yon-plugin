---
name: NCC资产包集成规则配置方法
description: >
  NCC 使用资产包开发集成接口时，集成规则的完整配置方法，包括表头/表体配置要点、
  bmf 文件字段映射规则、常见坑点。
project: 水投
version: NCC 2207
status: 已解决
created: 2026-06-05
updated: 2026-07-01
---

# NCC 资产包集成规则配置方法

## 节点位置

应用管理平台 → 实施平台 → 集成实施工具 → **集成规则**

## 表头配置

必须配置的字段：**编码、名称、组织、描述、数据类型、基础档案类型、单据类型、目标系统**

- **外系统调用 NCC**：目标系统的"外系统"字段，需到数据库执行脚本，更新为 NCC 的**集团主键**
- **NCC 调用外系统**：目标系统到 **三方应用** 节点，新增一个系统数据

## 表体配置要点

1. **序号字段必填**，不填会报错
2. **翻译字段不管需不需要都配置上**，否则字段接不进来
3. **单据类型参照**有 bug，需在接口中特殊处理，集成规则翻译不出来

## 表体字段前缀 — bmf 文件查询流程（必读）

表体字段在集成规则中的 VFIELD 格式为 `{前缀}.{字段名}`（如 `er_busitem.defitem25`）。
此外，**JSON 请求报文中表体数组的 key 也使用这个前缀**。**严禁猜测前缀，必须按以下流程从 bmf 文件确认。**

### 步骤 1：定位 bmf 文件

进入 `HOME/modules/{模块}/METADATA/` 目录，找到聚合 VO 对应的 `.bmf` 文件：

- 差旅费报销单 → `expenseaccount.bmf`
- 借款单 → `loanmanage.bmf`
- 费用摊销 → `expamortizeinfo.bmf`

**不确定是哪个文件时**，用聚合 VO 类名搜索：
```bash
# 在 METADATA 目录下搜索包含聚合 VO 类名的 bmf 文件
grep -r "JKBXVO\|JKBXHeaderVO" HOME/modules/*/METADATA/*.bmf
```

### 步骤 2：查找 BodyOfAggVOAccessor

在 bmf 文件中搜索 `BodyOfAggVOAccessor`，取该 attribute 的 **`name`** 属性值：

```xml
<attribute accessStrategy="nc.md.model.access.BodyOfAggVOAccessor"
           name="er_busitem"
           dataType="ece96dd8-bdf8-4db3-a112-9d2f636d388f"
           displayName="报销单业务行" ... />
```

**`name` 的值就是前缀。** 本例：`name="er_busitem"` → 前缀为 `er_busitem`。

### 步骤 3：交叉验证 — entity 标签

在同一 bmf 文件中，找到 `dataType` 对应的 entity：

```xml
<entity name="er_busitem"
        displayName="报销单业务行"
        fullClassName="nc.vo.ep.bx.BXBusItemVO"
        tableName="er_busitem" ... >
```

验证：
- entity 的 `name` = BodyOfAggVOAccessor 的 `name` ✓
- entity 的 `tableName` = 数据库表名 ✓
- entity 的 `fullClassName` = 子表 VO 类名 ✓

### 步骤 4：应用前缀

确认后的前缀用于两处：

**① 集成规则 VFIELD**（pub_interuleitem 表）：
```sql
-- 格式: {前缀}.{VO字段名}
'er_busitem.defitem25'   -- 补助类型
'er_busitem.szxmid'      -- 收支项目
'er_busitem.vat_amount'  -- 补助金额
```

**② JSON 请求报文**（调用方发送的 JSON）：
```json
{
    "djlxbm": "264X-Cxx-11102",
    "pk_org": "111",
    "er_busitem": [           ← 数组 key 必须 = 前缀
        {
            "defitem25": "01",
            "defitem18": 1,
            "vat_amount": 300.00
        }
    ]
}
```

**⚠️ 常见错误**：猜测前缀（如用类名 `bxBusItemVO`、表名简写 `busitem` 等）。这些都不对，必须以 bmf 中 `BodyOfAggVOAccessor` 的 `name` 为准。

## 机科项目已验证前缀

| 单据 | bmf 文件 | BodyOfAggVOAccessor name | 报文数组 key |
|------|----------|--------------------------|-------------|
| 差旅费报销单 | `expenseaccount.bmf` | `er_busitem` | `er_busitem` |

## 表体字段配置 — bmf 文件映射规则

找到该单据对应的 `.bmf` 文件，在表头属性中查找：

```xml
<attribute accessStrategy="nc.md.model.access.BodyOfAggVOAccessor" ...>
```

取其中的 `name` 字段值。配置规则：

- bmf 中 `name = "items"` → 字段名填写 `items.pk_org`, `items.code`, ...
- 外系统字段名称保持一致即可

## 报文表体数组字段编码

看 bmf 文件中**表体的实体配置**，取 `name` 字段值作为数组编码。
