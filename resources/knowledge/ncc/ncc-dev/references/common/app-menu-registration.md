# NCC 菜单注册与功能注册 — 常用数据表关联关系

> 来源：NCC 高级版官方文档「1.3 常用数据表」第 7 节「最终表关系图」 + 社区整理（2024-08）

---

## 一、表清单总览

| 序号 | 表名 | 用途 |
|------|------|------|
| 1 | `sm_appmenureg` | 菜单注册（菜单组/注册头表） |
| 2 | `sm_appmenuitem` | 菜单项（具体菜单节点） |
| 3 | `sm_appregister` | 应用注册（核心表） |
| 4 | `sm_apppage` | 页面注册（卡片/列表页面） |
| 5 | `sm_appbutnregister` | 按钮注册 |
| 6 | `pub_page_templet` | 页面模板注册 |
| 7 | `pub_area` | 页面区域（表头区/表体区等） |
| 8 | `pub_form_property` | 卡片模板字段属性（Form/Grid 区域） |
| 9 | `pub_query_property` | 列表模板字段属性（Query 区域） |

> ⚠️ **注意**：原始 PDF 中还包含 `sm_appparam`（参数注册），但 ER 关系图中未画出该表的连线，故此处不纳入核心关联关系图。

---

## 二、ER 关系图（ASCII）

```
┌──────────────────┐         ┌─────────────────────┐         ┌──────────────────┐
│ SM_APPMENUREG    │         │ SM_APPMENUITEM      │         │ SM_APPREGISTER   │
│──────────────────│         │─────────────────────│         │──────────────────│
│ MODIFIER         │◄────────│ PK_MENU          ✓ │         │ PARENT_ID        │
│ PK_MENU       ✓  │  1:N    │ APPCODE            │         │ PK_APPREGISTER ✓ │
└──────────────────┘         │ APPID           ✓ │────┐    └──────┬───────────┘
                              │ DR                 │    │           │
                              │ MENUDES            │    │ 1:N       │ 1:N
                              │ MENUITEMCODE       │    │           │
                              │ MENUNAME           │    │           ▼
                              │ PARENTECODE        │    │   ┌──────────────────────┐
                              │ PK_GROUP           │    └──►│ SM_APPBUTNREGISTER   │
                              └─────────────────────┘        │──────────────────────│
                                                                │ APPID           ✓  │
                                                                │ BTNCODE            │
                                                                └──────────────────────┘

┌──────────────────┐                                     ┌──────────────────────┐
│ PUB_FORM_PROPERTY│                                     │ SM_APPPAGE           │
│──────────────────│                                     │──────────────────────│
│ AREADID       ✓  │◄────────────────────────────────────│ MODIFIER             │
│ CLASSID         │         ┌──────────────────┐         │ PAGECODE          ✓  │────┐
│ CODE            │         │ PUB_AREA          │         │ PAGEDESC            │    │
└──────────────────┘         │──────────────────│         │ PAGENAME            │    │
                              │ PAGINATION       │         │ PAGEURL             │    │
┌──────────────────┐         │ PK_AREA        ✓  │◄──────── PARENT_ID        ✓  │    │
│PUB_QUERY_PROPERTY│         │ POSITION         │  1:N    │ PK_APPPAGE       ✓  │    │
│──────────────────│         │ RELATIONCODE     │         └──────────────────────┘    │
│ AREADID       ✓  │◄────────│ RESID                │                                   │
│ CLASSID         │         │ TEMPLETID      ✓  │────┐                                  │
│ CODE            │         └──────────────────┘    │ 1:N                               │
└──────────────────┘                                 │                                   │
                                                     ▼                                   │
                                           ┌──────────────────────┐                     │
                                           │ PUB_PAGE_TEMPLET     │◄────────────────────┘
                                           │──────────────────────│  1:N (通过 PAGECODE)
                                           │ MODIFIER             │
                                           │ NAME                 │
                                           │ PAGECODE          ✓  │
                                           │ PARENTID             │
                                           │ PK_GROUP             │
                                           │ PK_ORG               │
                                           │ PK_PAGE_TEMPLET   ✓  │
                                           └──────────────────────┘
```

---

## 三、表间关联详解

### 3.1 核心链路一：应用 → 菜单

```
sm_appregister (应用注册 — 核心表)
│
├── pk_appregister (主键)
│   ├── 1:N → sm_appmenuitem.APPID          (菜单项：通过 APPID 关联应用)
│   └── 1:N → sm_appbutnregister.APPID      (按钮注册：通过 APPID 关联应用)
│
└── PARENT_ID                               (父节点，支持树形结构)

sm_appmenureg (菜单注册头表 / 菜单组)
│
└── pk_menu (主键)
    └── 1:N → sm_appmenuitem.PK_MENU        (菜单项：通过 PK_MENU 关联菜单组)
```

### 3.2 核心链路二：应用 → 页面 → 模板 → 区域 → 字段属性

```
sm_appregister (应用注册)
│
└── pk_appregister
    └── 1:N → sm_apppage.PARENT_ID          (页面注册：通过 PARENT_ID 关联应用)

sm_apppage (页面注册)
│
├── pk_apppage (主键)
│
├── PAGECODE ─────────┐
│                     │  N:1 (通过 PAGECODE 匹配)
│                     ▼
│              pub_page_templet (页面模板)
│              │
│              ├── pk_page_templet (主键)
│              │
│              └── pk_page_templet
│                  └── 1:N → pub_area.TEMPLETID   (页面区域)
│                                      │
│                                      └── pk_area (主键)
│                                          ├── 1:N → pub_form_property.AREADID   (卡片字段属性)
│                                          └── 1:N → pub_query_property.AREADID  (列表字段属性)
```

### 3.3 关联关系速查表

| 子表 | 外键字段 | 父表 | 主键字段 | 说明 |
|------|---------|------|---------|------|
| sm_appmenuitem | **PK_MENU** | sm_appmenureg | PK_MENU | 菜单项属于哪个菜单组 |
| sm_appmenuitem | **APPID** | sm_appregister | PK_APPREGISTER | 菜单项属于哪个应用 |
| sm_appbutnregister | **APPID** | sm_appregister | PK_APPREGISTER | 按钮属于哪个应用 |
| sm_apppage | **PARENT_ID** | sm_appregister | PK_APPREGISTER | 页面属于哪个应用 |
| sm_apppage | **PAGECODE** | pub_page_templet | PAGECODE | 页面对应的模板编码 |
| pub_area | **TEMPLETID** | pub_page_templet | PK_PAGE_TEMPLET | 区域属于哪个模板 |
| pub_form_property | **AREADID** | pub_area | PK_AREA | 字段属于哪个区域 |
| pub_query_property | **AREADID** | pub_area | PK_AREA | 字段属于哪个区域 |

---

## 四、各表关键字段

### 4.1 sm_appmenureg — 菜单注册头表（菜单组）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_menu` | VARCHAR(20) | **主键** |
| `modifier` | VARCHAR(?) | 最后修改人 |

> 注册菜单组信息。一个菜单组下可包含多个菜单项。

### 4.2 sm_appmenuitem — 菜单项

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_menu` | VARCHAR(20) | **主键** → `sm_appmenureg.pk_menu`（所属菜单组） |
| `appid` | VARCHAR(20) | 所属应用 → `sm_appregister.pk_appregister` |
| `appcode` | VARCHAR(?) | 应用编码 |
| `menuitemcode` | VARCHAR(?) | 菜单项编码（编码前缀体现层级，如 `50` 顶级、`5002%` 应用级） |
| `menuname` | VARCHAR(?) | 菜单项名称 |
| `menudes` | VARCHAR(?) | 菜单项描述 |
| `parentcode` | VARCHAR(?) | 上级菜单编码（同级菜单间的父子关系） |
| `dr` | INT | 删除标志（0=正常, -1=已删除） |
| `pk_group` | VARCHAR(?) | 分组标识 |

> **查询示例**：
> ```sql
> -- 查询某应用下的菜单项（通过 appid）
> SELECT * FROM sm_appmenuitem
> WHERE appid = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101');
>
> -- 查询某菜单组下的所有菜单项（通过 pk_menu）
> SELECT * FROM sm_appmenuitem WHERE pk_menu = 'xxxxx';
>
> -- 修改菜单上级
> UPDATE sm_appmenuitem SET parentcode = 'H4H101' WHERE menuitemcode LIKE '%H4H10102%';
> ```

### 4.3 sm_appregister — 应用注册（核心表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_appregister` | VARCHAR(20) | **主键** |
| `parent_id` | VARCHAR(?) | 父节点（支持应用树的层级结构） |
| `code` / `code` | VARCHAR(20) | 应用编码（如 `H4H10101`） |

> **查询示例**：
> ```sql
> SELECT * FROM sm_appregister WHERE code = 'H4H10101';
> ```

### 4.4 sm_apppage — 页面注册

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_apppage` | VARCHAR(?) | **主键** |
| `pagecode` | VARCHAR(?) | **页面编码** → `pub_page_templet.pagecode`（关联模板） |
| `pagename` | VARCHAR(?) | 页面名称 |
| `pagedesc` | VARCHAR(?) | 页面描述 |
| `pageurl` | VARCHAR(?) | 页面 URL 路径 |
| `parent_id` | VARCHAR(?) | 所属应用 → `sm_appregister.pk_appregister` |
| `modifier` | VARCHAR(?) | 最后修改人 |

> **查询示例**：
> ```sql
> -- 查询某应用的卡片/列表页面
> SELECT * FROM sm_apppage
> WHERE parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101');
>
> -- 通过 pagecode 关联查询对应的模板
> SELECT p.*, t.name as template_name, t.pk_page_templet
> FROM sm_apppage p
> LEFT JOIN pub_page_templet t ON p.pagecode = t.pagecode
> WHERE p.parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101');
> ```

### 4.5 sm_appbutnregister — 按钮注册

| 字段 | 类型 | 说明 |
|------|------|------|
| `appid` | VARCHAR(20) | 所属应用 → `sm_appregister.pk_appregister` |
| `btncode` | VARCHAR(?) | 按钮编码 |

> **查询示例**：
> ```sql
> SELECT * FROM sm_appbutnregister
> WHERE appid = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101');
> ```

### 4.6 pub_page_templet — 页面模板

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_page_templet` | VARCHAR(?) | **主键** |
| `pagecode` | VARCHAR(?) | **页面编码** → `sm_apppage.pagecode`（被页面注册引用） |
| `name` | VARCHAR(?) | 模板名称 |
| `parentid` | VARCHAR(?) | 父模板 ID |
| `pk_group` | VARCHAR(?) | 分组标识 |
| `pk_org` | VARCHAR(?) | 组织标识 |
| `modifier` | VARCHAR(?) | 最后修改人 |

> **查询示例**：
> ```sql
> -- 通过 pagecode 查询模板（与 sm_apppage 关联方式）
> SELECT * FROM pub_page_templet WHERE pagecode IN (
>     SELECT pagecode FROM sm_apppage
>     WHERE parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101')
> );
>
> -- 直接按应用编码筛选（需确认是否有 appcode 或间接关联）
> SELECT DISTINCT t.* FROM pub_page_templet t
> JOIN sm_apppage p ON t.pagecode = p.pagecode
> WHERE p.parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101');
> ```

### 4.7 pub_area — 页面区域

| 字段 | 类型 | 说明 |
|------|------|------|
| `pk_area` | VARCHAR(?) | **主键** |
| `templetid` | VARCHAR(?) | 所属模板 → `pub_page_templet.pk_page_templet` |
| `position` | INT/VARCHAR(?) | 区域位置序号 |
| `relationcode` | VARCHAR(?) | 关联编码 |
| `resid` | VARCHAR(?) | 资源 ID |
| `pagination` | VARCHAR(?) | 是否分页配置 |

> 常见区域类型：表头区（head）、表体区（body）、子表区（sub）等。

> **查询示例**：
> ```sql
> SELECT * FROM pub_area
> WHERE templetid IN (
>     SELECT pk_page_templet FROM pub_page_templet
>     WHERE pagecode IN (
>         SELECT pagecode FROM sm_apppage
>         WHERE parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101')
>     )
> );
> ```

### 4.8 pub_form_property — 卡片模板字段属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `areaid` | VARCHAR(?) | 所属区域 → `pub_area.pk_area` |
| `classid` | VARCHAR(?) | 类/组件 ID |
| `code` | VARCHAR(?) | 字段编码 |

> 存储单据卡片模板中各字段的显示/编辑/必填等属性配置。

> **查询示例**：
> ```sql
> SELECT * FROM pub_form_property
> WHERE areaid IN (
>     SELECT pk_area FROM pub_area
>     WHERE templetid IN (
>         SELECT pk_page_templet FROM pub_page_templet
>         WHERE pagecode IN (
>             SELECT pagecode FROM sm_apppage
>             WHERE parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101')
>         )
>     )
> );
> ```

### 4.9 pub_query_property — 列表模板字段属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `areaid` | VARCHAR(?) | 所属区域 → `pub_area.pk_area` |
| `classid` | VARCHAR(?) | 类/组件 ID |
| `code` | VARCHAR(?) | 字段编码 |

> 存储列表查询模板中各字段的显示/查询条件等属性配置。

> **查询示例**：
> ```sql
> SELECT * FROM pub_query_property
> WHERE areaid IN (
>     SELECT pk_area FROM pub_area
>     WHERE templetid IN (
>         SELECT pk_page_templet FROM pub_page_templet
>         WHERE pagecode IN (
>             SELECT pagecode FROM sm_apppage
>             WHERE parent_id = (SELECT pk_appregister FROM sm_appregister WHERE code = 'H4H10101')
>         )
>     )
> );
> ```

---

## 五、一键查询脚本

以下脚本可根据应用编码一键查询该应用的全部注册信息：

```sql
-- 替换为实际应用编码
DEFINE app_code = 'H4H10101';

-- 0. 先获取应用主键
SELECT @app_pk := pk_appregister FROM sm_appregister WHERE code = '&app_code';

-- 1. 应用注册
SELECT * FROM sm_appregister WHERE code = '&app_code';

-- 2. 菜单注册头表（菜单组）
SELECT m.* FROM sm_appmenureg m
JOIN sm_appmenuitem mi ON m.pk_menu = mi.pk_menu
WHERE mi.appid = @app_pk;

-- 3. 菜单项
SELECT * FROM sm_appmenuitem WHERE appid = @app_pk;

-- 4. 页面注册（卡片/列表）— 通过 parent_id 关联应用
SELECT * FROM sm_apppage WHERE parent_id = @app_pk;

-- 5. 按钮注册
SELECT * FROM sm_appbutnregister WHERE appid = @app_pk;

-- 6. 页面模板 — 通过 pagecode 与 sm_apppage 关联
SELECT t.* FROM pub_page_templet t
WHERE t.pagecode IN (SELECT pagecode FROM sm_apppage WHERE parent_id = @app_pk);

-- 7. 页面区域
SELECT * FROM pub_area WHERE templetid IN (
    SELECT pk_page_templet FROM pub_page_templet
    WHERE pagecode IN (SELECT pagecode FROM sm_apppage WHERE parent_id = @app_pk)
);

-- 8. 卡片模板属性
SELECT * FROM pub_form_property WHERE areaid IN (
    SELECT pk_area FROM pub_area WHERE templetid IN (
        SELECT pk_page_templet FROM pub_page_templet
        WHERE pagecode IN (SELECT pagecode FROM sm_apppage WHERE parent_id = @app_pk)
    )
);

-- 9. 列表模板属性
SELECT * FROM pub_query_property WHERE areaid IN (
    SELECT pk_area FROM pub_area WHERE templetid IN (
        SELECT pk_page_templet FROM pub_page_templet
        WHERE pagecode IN (SELECT pagecode FROM sm_apppage WHERE parent_id = @app_pk)
    )
);
```

---

## 六、备注

- **sm_appmenureg vs sm_appmenuitem**：`sm_appmenureg` 是菜单组（头表），`sm_appmenuitem` 是具体菜单项（行），两者通过 `PK_MENU` 关联（1:N）
- **sm_apppage 与 pub_page_templet 的关联方式**：通过 **PAGECODE** 字段匹配（N:1），而非之前误写的 appcode/pk_page_templet 直接关联
- **pub_page_templet 的定位**：它是中间层——上被 `sm_apppage.PAGECODE` 引用，下通过 `pk_page_templet` 驱动 `pub_area`
- **pub_form_property / pub_query_property 的外键名**：图中显示为 AREADID（可能是 AREAID 的 OCR 变体或数据库实际命名），以数据库实际 DDL 为准
- 页面路径：首页 → 动态建模平台 → 开发配置 → 应用管理 → 菜单注册
