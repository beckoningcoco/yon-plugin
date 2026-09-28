# NCC 元数据（Metadata）涉及表与关联关系

> 数据来源：NCC 元数据模块 ER 关系图（第 1.2 节）
> 适用场景：通过 SQL 直接查询 NCC 元数据定义（实体、属性、关联、物理表映射等）
> 最后更新：2026-04-27

---

## 1. 概述

NCC 元数据体系由 **11 张核心表** 组成，描述了从 **模块 → 组件 → 实体 → 属性 → 物理表 → 字段** 的完整层级关系，以及实体间的**连接线/关联**、**业务接口映射**等扩展信息。

### 1.1 表总览

| 序号 | 表名 | 说明 | 核心职责 |
|------|------|------|----------|
| 1 | `md_module` | 元数据所属模块信息 | 最顶层——定义元数据所属的模块 |
| 2 | `md_component` | 元数据组件信息 | 模块下的组件容器 |
| 3 | `md_class` | 元数据实体信息 | ⭐ 核心表——定义实体/枚举/接口 |
| 4 | `md_property` | 元数据实体属性信息 | 实体的字段/属性定义 |
| 5 | `md_association` | 元数据连接线信息 | 实体之间的关联关系 |
| 6 | `md_accessorpara` | 聚合类ID和全类名信息 | 聚合类的辅助参数 |
| 7 | `md_bizitfmap` | 实体-业务接口属性映射 | 业务接口与实体属性的对应 |
| 8 | `md_ormap` | 实体属性-物理列映射 | ORM 映射关系 |
| 9 | `md_table` | 元数据物理表信息 | 实体对应的数据库表 |
| 10 | `md_column` | 元数据物理列信息 | 物理表的字段定义 |
| 11 | `md_enumvalue` | 枚举值信息 | 枚举类型的取值列表 |

---

## 2. 各表详细结构

### 2.1 md_module（模块表）— 最顶层

**说明**：元数据所属的模块定义，整个元数据体系的根节点。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（模块ID） |
| VERSIONTYPE | VARCHAR | 版本 |

**子表**：
- `md_component`（通过 OWNMODULE → md_module.ID，1:N）

---

### 2.2 md_component（元数据组件）

**说明**：存放模块下的元数据组件，是模块和实体之间的中间层。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（组件ID） |
| namespace | VARCHAR | 命名空间（⚠️ 关联到 md_module） |
| VERSIONTYPE | VARCHAR | 版本 |
| INDUSTRY | VARCHAR | 基础行业 |
| OWNMODULE | VARCHAR | 所属模块ID → `md_module.ID` |

**关联关系**：
- 父表：`md_module`（OWNMODULE → ID，N:1）
- 子表：`md_class`（ID → COMPONENTID，1:N）

> 图2注：`md_component` 根据 `namespace` 关联 `md_module`，呈现 **1:n** 关系。

---

### 2.3 md_class（元数据实体、枚举、接口）⭐ 核心表

**说明**：元数据体系的**核心表**，定义所有实体类、枚举、接口。几乎所有其他表都通过 `classId` / `CLASSID` 与之关联。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（实体ID） |
| **COMPONENTID** | VARCHAR | 所属组件ID → `md_component.ID` |
| VERSIONTYPE | VARCHAR | 版本 |
| INDUSTRY | VARCHAR | 基础行业 |
| DEFAULTTABLENAME | VARCHAR | 默认物理表名/ID → `md_table.ID` |

**关联关系（作为父表，被以下表引用）**：

| 子表 | 外键字段 | 关系 |
|------|----------|------|
| `md_property` | CLASSID → ID | 1:N（一个实体多个属性） |
| `md_association` | STARTBEANID / ENDELEMENTID → ID | 1:N（实体的起点/终点） |
| `md_accessorpara` | ID → ID | 1:N |
| `md_bizitfmap` | CLASSID → ID | 1:N |
| `md_ormap` | CLASSID → ID | 1:N |
| `md_table` | （隐含 DEFAULTTABLENAME） | 1:1 或 1:N |
| `Md_enumvalue` | ID → ID | 1:N（枚举值归属实体） |

---

### 2.4 md_property（元数据属性）

**说明**：存储元数据实体的主子表属性及长度信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（属性ID） |
| **CLASSID** | VARCHAR | 所属实体ID → `md_class.ID` |
| VERSIONTYPE | VARCHAR | 版本 |
| INDUSTRY | VARCHAR | 基础行业 |

**关联关系**：
- 父表：`md_class`（CLASSID → ID，N:1）
- 子表：
  - `md_bizitfmap`（CLASSATTRID → ID，业务接口映射中的实体属性侧）
  - `md_ormap`（ATTRIBUTEID → ID，ORM 映射中的实体属性侧）

---

### 2.5 md_association（实体连接线信息）

**说明**：描述元数据实体之间的**关联/连接线**（如主子表关系、参照关系等）。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键 |
| **COMPONENTID** | VARCHAR | 所在组件ID → `md_component.ID` |
| **STARTBEANID** | VARCHAR | 起始实体ID → `md_class.ID` |
| **STARTELEMENTID** | VARCHAR | 起始实体属性ID → `md_property.ID` |
| **ENDELEMENTID** | VARCHAR | 结束实体属性ID → `md_property.ID` |

**关联关系**：
- 父表：`md_component`（COMPONENTID → ID，N:1）
- 引用：`md_class`（STARTBEANID → ID，起点实体）
- 引用：`md_property`（STARTELEMENTID / ENDELEMENTID → ID，起止属性）

---

### 2.6 md_accessorpara（聚合类信息）

**说明**：存放聚合类 ID 和聚合类的**全类名**（fully qualified class name）。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（= 元数据实体ID）→ `md_class.ID` |
| paravalue | VARCHAR | 全类名字符串 |
| ASSOSEQUENCE | INT | 聚合顺序（默认0） |

**关联关系**：父表 `md_class`（ID → ID，1:N）

---

### 2.7 md_bizitfmap（实体属性 ↔ 业务接口映射）

**说明**：定义实体属性与**业务接口**属性之间的映射关系（用于 VO 属性与接口字段的转换）。

| 字段 | 类型 | 说明 |
|------|------|------|
| **CLASSID** | VARCHAR | 元数据实体ID → `md_class.ID` |
| **INTATTRID** | VARCHAR | 业务接口属性ID |
| **CLASSATTRID** | VARCHAR | 元数据实体属性ID → `md_property.ID` |
| **BIZINTERFACEID** | VARCHAR | 业务接口ID |

**关联关系**：
- `md_class`（CLASSID → ID，N:1）
- `md_property`（CLASSATTRID → ID，N:1）— ⚠️ 图2注：**字段ID : 属性ID = 1:1**

---

### 2.8 md_ormap（实体属性 ↔ 物理列映射）⭐ 重要

**说明**：定义元数据实体属性与生成的 **SQL 数据库表字段**之间的**对应关系**（ORM 核心）。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ATTRIBUTEID** | VARCHAR | 实体属性ID → `md_property.ID` |
| **CLASSID** | VARCHAR | 实体ID → `md_class.ID` |
| **TABLEID** | VARCHAR | 表ID → `md_table.ID` |
| **COLUMNID** | VARCHAR | 列ID → `md_column.ID` |

**关联关系**：
- `md_class`（CLASSID → ID，N:1）
- `md_property`（ATTRIBUTEID → ID，N:1）
- `md_table`（TABLEID → ID，N:1）
- `md_column`（COLUMNID → ID，N:1）

---

### 2.9 md_table（物理表信息）

**说明**：存储元数据对应的**物理数据库表**的定义信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键 = 表名 |
| displayname | VARCHAR | 显示名称 |

**关联关系**：
- 被引用：`md_class.DEFAULTTABLENAME` → ID（实体默认对应物理表）
- 子表：`md_column`（TABLEID → ID，1:N）
- 子表：`md_ormap`（TABLEID → ID，1:N）

> 图2注：**tableId : classId = 1:1**（一张物理表对应一个实体类）

---

### 2.10 md_column（物理列信息）

**说明**：存储元数据物理表的**列/字段**定义。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键（列ID） |
| **TABLEID** | VARCHAR | 所属表ID → `md_table.ID` |

**关联关系**：父表 `md_table`（TABLEID → ID，N:1；即 **表ID : 列ID = 1:N**）

---

### 2.11 md_enumvalue（枚举值信息）

**说明**：存储**枚举类型**的可选值列表。

| 字段 | 类型 | 说明 |
|------|------|------|
| **ID** | VARCHAR | 主键 = 元数据实体ID → `md_class.ID` |
| VERSIONTYPE | VARCHAR | 版本 |
| VALUE | VARCHAR | 枚举值 |
| INDUSTRY | VARCHAR | 基础行业 |

**关联关系**：父表 `md_class`（ID → ID，1:N）

---

## 3. 完整 ER 关系图

```
                          ┌─────────────────────┐
                          │    Md_enumvalue      │
                          │   (枚举值信息)        │
                          ├─────────────────────┤
                          │ ID (PK) ←───┐       │
                          │ VERSIONTYPE  │       │
                          │ VALUE       │       │
                          │ INDUSTRY    │       │
                          └─────────────┼───────┘
                                        │ 1:N
                                        ▼
┌──────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│    Md_module     │         │      Md_class        │         │   Md_accessorpara   │
│     (模块表)      │ 1    N  │  (元数据实体/枚举/接口) │ 1    N  │   (聚合类信息)       │
├──────────────────┤─────────├─────────────────────┤─────────├─────────────────────┤
│ ID (PK) ────────┼────────→│ ID (PK) ◄───────────┼────────►│ ID (PK)             │
│ VERSIONTYPE      │  OWNMOD │ COMPONENTID ────────┼───┐     │ paravalue           │
└──────────────────┘   ULE   │ VERSIONTYPE         │   │     │ ASSOSEQUENCE        │
                                INDUSTRY            │   │     └─────────────────────┘
                                DEFAULTTABLENAME ───┼───┼──────────┐
                                └───────────────────┼───┼──────────┼──────────┐
                      1:N          │               │   │          │          │
                      ▼            │               │   │          │          │
┌──────────────────────┐    1:N    │    1:N        │   │    1:N   │    1:N   │
│    Md_component      │           ▼              ▼   ▼          ▼          ▼
│   (元数据组件)        │  ┌──────────────┐  ┌──────────┐ ┌──────────┐ ┌──────────────┐
├──────────────────────┤  │ Md_property  │  │Md_asocia- │ │Md_bizitf-│ │  Md_ormap    │
│ ID (PK)             │  │ (元数据属性)   │  │  tion    │ │   map    │ │(实体-物理列映 │
│ namespace ──────────┼─→│ ID (PK)      │  │(连接线)   │ │(业务接口  │ │    射)        │
│ VERSIONTYPE          │  │ CLASSID (FK) │  │ ID (PK)  │ │ 映射)    │  ├──────────────┤
│ INDUSTRY            │  │ VERSIONTYPE  │  │ COMPONE- │  ├──────────┤ │ ATTRIBUTEID  │
│ OWNMODULE (FK)      │  │ INDUSTRY     │  │ TID(FK)  │  │CLASSID   │ │ CLASSID      │
└──────────────────────┘  └──────┬───────┘  │ STARTBE- │  │INTATTRID │ │ TABLEID      │
                                  │         │ ANID(FK) │  │CLASSATTR │ │ COLUMNID     │
                           1:1    │         │ STARTEL- │  │ID(FK)    │ └──────┬───────┘
                           │      │         │ EMENTID  │  │BIZINTER- │        │
                           ▼      │         │ ENDELEM- │  │FACEID    │   1:N  │
                    ┌────────────┴──┐       │ ENTID    │  └──────────┘       ▼
                    │ Md_bizitfmap  │       └──────────┘             ┌────────────┐
                    │(业务接口属性映 │                                 │ Md_column  │
                    │    射关系)     │                                 │ (物理列)    │
                    │ CLASSID       │                                 ├────────────┤
                    │ INTATTRID     │                                 │ ID (PK)    │
                    │ CLASSATTRID   │                                 │ TABLEID FK │
                    │ BIZINTERFACEID│                                 └────────────┘
                    └────────────────┘

  ┌────────────────┐                1:1                 1:N
  │   Md_table     │─────────────────────────────────────┘
  │  (物理表)       │
  ├────────────────┤
  │ ID (PK) = 表名  │
  │ displayname    │
  └────────────────┘
```

---

## 4. 关联关系速查表

| # | 子表 | 父表 | 外键字段 | 关系 | 说明 |
|---|------|------|----------|------|------|
| 1 | `md_component` | `md_module` | OWNMODULE → ID | N:1 | 组件属于模块 |
| 2 | `md_class` | `md_component` | COMPONENTID → ID | N:1 | 实体属于组件 |
| 3 | `md_class` | `md_module` | （间接 via component） | — | 实体间接属于模块 |
| 4 | `md_property` | `md_class` | CLASSID → ID | N:1 | 属性属于实体 |
| 5 | `md_association` | `md_component` | COMPONENTID → ID | N:1 | 连接线属于组件 |
| 6 | `md_association` | `md_class` | STARTBEANID → ID | N:1 | 起点（实体级） |
| 7 | `md_association` | `md_property` | STARTELEMENTID → ID | N:1 | 起点（属性级） |
| 8 | `md_association` | `md_property` | ENDELEMENTID → ID | N:1 | 终点（属性级） |
| 9 | `md_accessorpara` | `md_class` | ID → ID | 1:N | 聚合类参数属于实体 |
| 10 | `md_bizitfmap` | `md_class` | CLASSID → ID | N:1 | 接口映射属于实体 |
| 11 | `md_bizitfmap` | `md_property` | CLASSATTRID → ID | N:1 | 映射目标为实体属性 |
| 12 | `md_ormap` | `md_class` | CLASSID → ID | N:1 | ORM映射属于实体 |
| 13 | `md_ormap` | `md_property` | ATTRIBUTEID → ID | N:1 | ORM源为实体属性 |
| 14 | `md_ormap` | `md_table` | TABLEID → ID | N:1 | ORM目标为物理表 |
| 15 | `md_ormap` | `md_column` | COLUMNID → ID | N:1 | ORM目标为物理列 |
| 16 | `md_column` | `md_table` | TABLEID → ID | N:1 | 列属于表 |
| 17 | `md_enumvalue` | `md_class` | ID → ID | 1:N | 枚举值属于实体 |

---

## 5. 层级关系总结

```
md_module（模块）
  └─ md_component（组件）─── namespace 关联 md_module
       └─ md_class（实体/枚举/接口）⭐ 核心中枢
            ├─ md_property（属性）              ← 实体的字段定义
            │    ├─ md_bizitfmap（业务接口映射）  ← 属性↔接口字段
            │    └─ md_ormap（ORM映射）           ← 属性↔物理列
            ├─ md_association（关联线）           ← 实体间的关系
            ├─ md_accessorpara（聚合类参数）       ← 辅助信息
            ├─ md_enumvalue（枚举值）             ← 枚举取值列表
            └─ md_table（物理表）                 ← 对应的数据库表
                 └─ md_column（物理列）            ← 表的字段定义
```

---

## 6. 常用查询示例

### 6.1 查询某实体及其所有属性

```sql
SELECT 
    c.id          AS entity_id,
    c.DEFAULTTABLENAME AS table_name,
    p.id          AS property_id
FROM md_class c
LEFT JOIN md_property p ON p.classid = c.id
WHERE c.id = '你的实体ID';
```

### 6.2 查询实体属性到物理列的完整 ORM 映射

```sql
SELECT 
    c.id                  AS entity_id,
    c.DEFAULTTABLENAME    AS physical_table,
    p.id                  AS property_id,
    t.id                  AS table_name,
    t.displayname         AS table_display,
    col.id                AS column_id,
    om.attributeid,
    om.columnid
FROM md_class c
LEFT JOIN md_property p   ON p.classid = c.id
LEFT JOIN md_ormap om      ON om.classid = c.id AND om.attributeid = p.id
LEFT JOIN md_table t       ON t.id = om.tableid
LEFT JOIN md_column col    ON col.id = om.columnid
WHERE c.id = '你的实体ID';
```

### 6.3 查询某组件下的所有实体及其关联关系

```sql
SELECT 
    comp.id        AS component_id,
    comp.namespace AS namespace,
    cls.id         AS entity_id,
    cls.DEFAULTTABLENAME AS table_name,
    ass.id         AS association_id,
    ass.startbeanid,
    ass.startelementid,
    ass.endelementid
FROM md_component comp
JOIN md_class cls       ON cls.componentid = comp.id
LEFT JOIN md_association ass ON ass.componentid = comp.id
WHERE comp.id = '你的组件ID';
```

### 6.4 查询模块下完整的 元数据 → 物理 表链路

```sql
-- 从模块到物理表的完整路径
SELECT DISTINCT
    m.id           AS module_id,
    comp.id        AS component_id,
    comp.namespace,
    cls.id         AS entity_id,
    cls.DEFAULTTABLENAME AS default_table,
    t.id           AS actual_table,
    t.displayname  AS table_display
FROM md_module m
JOIN md_component comp ON comp.ownmodule = m.id
JOIN md_class cls      ON cls.componentid = comp.id
LEFT JOIN md_table t    ON t.id = cls.DEFAULTTABLENAME
WHERE m.id = '你的模块ID'
ORDER BY comp.namespace, cls.id;
```

### 6.5 查询枚举实体及其所有可选值

```sql
SELECT 
    cls.id          AS enum_entity_id,
    ev.value        AS enum_value,
    ev.industry
FROM md_class cls
JOIN md_enumvalue ev ON ev.id = cls.id
WHERE cls.id = '枚举实体ID';
```

---

## 7. 注意事项

1. **大小写问题**：实际数据库中表名通常为**大写**（`MD_CLASS`、`MD_PROPERTY` 等），SQL 查询时注意大小写匹配。
2. **ID 格式**：各表的主键 ID 通常为 UUID 格式的字符串。
3. **DEFAULTTABLENAME**：`md_class` 中的此字段指向 `md_table.ID`（即物理表名），是实体到物理表的桥梁。
4. **软删除**：NCC 表通常包含 `DR`（删除标志, 0=正常, 1=已删）和 `TS`（时间戳）字段，查询时建议加 `AND (dr IS NULL OR dr = 0)` 过滤。
5. **多租户**：部分场景需注意 `pk_group`（集团）、`pk_org`（组织）等租户隔离字段。
