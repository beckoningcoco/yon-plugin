# NCC 资产包接口实战开发流程

> **状态**：待完善 | **适用版本**：NCC 2111/2312 | **最后更新**：2026-06-30
>
> 本文档是 [NCC资产包接口开发指南](./NCC资产包接口开发指南.md) 的实战配套文档，按步骤梳理从零开发一个资产包 REST 接口的完整流程。
>
> 关联参考：[元数据与bmf文件关联映射表](./元数据与bmf文件关联映射表.md)

---

## 一、整体流程概览

```
1. 确认需求
   ↓
2. 准备资产包模块（如 erm2111）
   ↓
3. 注册三方应用（pub_thirdsys）
   ↓
4. 生成集成规则配置文件（JSON）        ← 🆕 先写配置，审核通过再出SQL
   ↓
5. 根据配置文件生成 SQL 脚本（pub_interule + pub_interuleitem）
   ↓
6. 编写 REST 资源类（XxxResource.java）
   ↓
7. 注册 OpenAPI 路由（opm_apimanager）并授权（opm_relateapi）
   ↓
8. 配置对照表（如需字段值映射）
   ↓
9. 测试与调试
```

---

## 二、步骤详解

### 步骤1：确认需求

明确以下信息：

| 问题 | 示例 |
|------|------|
| 外部系统是什么？ | 上海OA系统 |
| 调用方向？ | OA → NCC（外系统调用NCC） |
| 业务单据是什么？ | 差旅费报销单 |
| 需要哪些操作？ | 新增/修改 + 审 |
| 开发环境数据库连接信息是否具备并可用？             |                                                              |
| 是否有特殊字段翻译？ | 参考接口文档。 |
| 放到哪个资产包模块？ | erm2111 |
| 接口文档位置？ |  |
| 检查开发环境数据库，是否已经包含了资产包资源补丁？ | 尝试查询集成规则表，若表不存在，则代表不包含资产包<br />资源补丁，请用户先去打资产包资源补丁。 |

### 步骤2：准备资产包模块

确认目标模块已存在（如 `erm2111`），且包含：

```
erm2111/
├── src/
│   ├── public/nccloud/api/erm/   ← REST 资源类放这里
│   └── private/                   ← 内部实现
├── META-INF/module.xml
└── .classpath / .project
```

如果模块不存在，从已有的同级模块复制一份，修改 `module.xml` 中的模块名。

### 步骤3：注册三方应用（可选，非必须）

- 向用户确认是否在 OPENAPI管理创建了外系统的 应用 （当NCC写接口给外系统调用时，为必要步骤。），建立完成后，根据 **SELECT** * **FROM** opm_thirdapp 从这个表中获取 OPENAPI 标准应用的相关信息。

在 NCC 管理后台 → **OPENAPI管理** → 新增应用：

1. 填写应用名称（如"上海OA系统"）
2. 系统自动生成 `client_id` 和 `client_secret`（记录备用）
3. 如需 NCC 主动调用外系统，填写 `ADDRESS`（外系统域名）；外系统调用 NCC 可留空
4. 勾选"同步到三方应用"，数据会写入 `pub_thirdsys` 表

也可以在数据库直接插入，（**此处明确，禁止直接在数据库执行 insert/update/delete/create 等变更语句，要在项目根目录或者桌面，生成统一SQL脚本文件，由用户执行插入数据操作！且脚本末尾必须包含对应的还原/回滚脚本：每条 INSERT 需配对应的 DELETE（按主键精确删除），每条 UPDATE 需配逆向 UPDATE，每条 CREATE 需配 DROP。**）

```sql
INSERT INTO pub_thirdsys (
    PK_THIRDSYS, CODE, NAME, CLIENT_ID, CLIENT_SECRET, 
    ADDRESS, PK_ORG, PK_GROUP, CREATOR, CREATIONTIME, DR
) VALUES (
    '主键', '编码', '上海OA系统', '生成的client_id', '生成的secret',
    'https://oa.example.com', '组织主键', '集团主键', '创建人', SYSDATE, 0
);
```

> 字段说明详见 [NCC资产包接口开发指南 - 三方应用字段说明](./NCC资产包接口开发指南.md#三方应用)

### 步骤4：生成集成规则配置文件（JSON）🆕

> **为什么要先出 JSON 再出 SQL？**
>
> 集成规则的字段多、逻辑复杂（ref/direct/fixed 三类、scope 判断、onNotFound 策略、md_class_id 取值来源区分），直接在脑子里过一遍就写 SQL 很容易出错。**先把每个字段的映射决策写成结构化的 JSON**，有以下好处：
>
> 1. **每个值都有 `{ value, desc }` 双栏** — 强制记录取值来源（SQL 查询结果 / 接口文档 / 决策原因），出问题时可溯源
> 2. **人工审核友好** — JSON 可比纯 SQL 更容易看出映射逻辑是否正确
> 3. **修改成本低** — 改一个字段的映射类型只需改一处，重新生成 SQL 即可
> 4. **数据库不可达时也能写** — 先用 SQL 查询语句作为 desc，等数据库通了再执行查询填入 value
>
> **配套参考文件**：
> - [**集成规则配置模板（可读版）**](./集成规则配置模板-可读版.md) — 🧑‍💻 **人类审核用**：Markdown 表格格式，按字段类型分表呈现
> - [`集成规则配置参考示例.json`](./集成规则配置参考示例.json) — 🤖 **AI 生成 SQL 用**：结构化 JSON，`{ value, desc }` 溯源格式
>
> **工作流**：开发者按可读版模板填表 → 用户审核可读版 → 审核通过后 AI 生成等价 JSON → JSON 生成 SQL。
> **所有 value 值需独立验证，禁止直接复用参考示例的值。**

#### 4.1 JSON 配置文件结构

配置文件由以下几个核心区块组成：

| 区块 | 说明 |
|------|------|
| `_rule` | 规则主表信息（code/name/pk_billtype/pk_org/provider…） |
| `header[]` | 表头字段数组，每个字段一个对象 |
| `body` | 表体配置（prefix + items[]） |
| `_mapping` | JSON → SQL 转换规则（固定模板，不需要改） |
| `_sql_template` | 三类字段（ref/direct/fixed）的 INSERT 语句模板 |
| `_excluded_fields` | 接口文档中有但明确不纳入规则的字段及排除原因 |

#### 4.2 字段类型决策

分析接口文档中每个字段，归入三类之一：

| 类型 | 判断依据 | FCONVERT | 必须填写 |
|------|---------|----------|---------|
| **ref** | 接口文档字段类型为"参照"或"编码"，需要把编码翻译成 NCC 主键 | 1 | ref(含md_class_id)、scope、onNotFound |
| **direct** | 字段类型为字符/日期/数字，值直接照搬 | 1 | field、source |
| **fixed** | 文档标注"固定"或"NCC自动生成"，外部系统不传 | 0 | field、value |

**⚠️ 关键判断：固定值≠不翻译。** 如接口文档说 `jsfs=3`（固定传3），但 `3` 是编码不是主键，仍需 type=ref 翻译为 `bd_balatype` 的主键。只有像 `djzt=1`（单据状态）这种本身就是主键/枚举值的，才用 fixed。

#### 4.3 ref 字段的取值流程

每个 ref 字段需要单独查询数据库确认以下属性：

**a) md_class_id（VFIELDTYPE）— 翻译用的参照档案 ID**

```
标准实体（OrgVO/DeptVO/PsndocVO 等）：
  → 按 fullclassname 查 md_class.id
  → 例: SELECT id FROM md_class WHERE fullclassname = 'nc.vo.org.DeptVO'

自定义档案（管理费用类别/差旅类型/CBS 等）：
  → 按 name 查 bd_defdoclist.pk_defdoclist   ← 注意：不是 md_class！
  → 例: SELECT pk_defdoclist FROM bd_defdoclist WHERE name = '管理费用类别' AND dr = 0

其他业务 VO：
  → 按 displayname 宽搜 md_class
  → 例: SELECT id, displayname FROM md_class WHERE displayname LIKE '%关键词%'
```

**b) scope（VCONVERTPARAM）— 翻译时查哪个组织范围**

| scope | VCONVERTPARAM | 适用场景 |
|-------|---------------|---------|
| group | 1 | 集团级维护的档案（人员、结算方式、差旅类型等） |
| org | 2 | 按业务单元隔离的档案（部门、自定义档案等） |
| global | 0 | 全局唯一的档案（币种等） |

**c) onNotFound（VTRANSLATE）— 编码找不到时怎么处理**

| onNotFound | VTRANSLATE | 适用场景 |
|------------|------------|---------|
| error | 1 | 必填参照，找不到必须报错 |
| ignore | NULL | 可选字段，找不到不报错（汇联易明确不传的字段） |

#### 4.4 desc 填写规范

每个 `{ value, desc }` 对象的 `desc` 必须记录取值来源：

| 来源类型 | 描述格式 | 示例 |
|---------|---------|------|
| 数据库查询 | `✅已验证: SELECT ... FROM ... WHERE ... → {环境}` | `✅已验证: SELECT pk_defdoclist FROM bd_defdoclist WHERE name='管理费用类别' AND dr=0 → jxy-ncc-test(NCC20250614)` |
| 接口文档 | `接口文档TEST1111V1.0：{原文}` | `接口文档TEST1111V1.0：报销单位编码，固定111` |
| 决策原因 | 说明为什么选这个值 | `VCONVERTPARAM=1：人员档案集团级维护` |
| NCC 惯例 | 引用的规范 | `NCC惯例，规则级pk_org取集团级` |

#### 4.5 配置文件审核检查清单

审核 JSON 时逐项确认：

- [ ] `_rule` 中所有 PK 值都通过数据库查询验证（不是从参考示例复制的）
- [ ] 每个 ref 字段的 `md_class_id` 确认来源正确（标准实体 / defdoc / 业务VO）
- [ ] 每个 ref 字段的 `scope` 有合理依据（集团级 or 组织级）
- [ ] 接口文档标注"固定"的字段，确认是 fixed 还是 ref（编码≠主键 → ref）
- [ ] `_excluded_fields` 记录了所有不纳入规则的字段及排除原因
- [ ] 表体 `prefix` 从 bmf 文件验证（非猜测）
- [ ] 所有 `desc` 都有可溯源的取值说明

#### 4.6 产出物

桌面生成 `{单据名}-集成规则配置.json`（如 `新测试264X.json`），作为步骤5 生成 SQL 的唯一输入源。

> **🔴 红线规则**：
> - **禁止将参考示例的 value 直接复制到新配置中**，所有值必须独立查数据库验证
> - 参考示例仅参考**结构**和 **desc 描述风格**，value 一律自己查

---

### 步骤5：根据配置文件生成 SQL 脚本

这是最关键的一步。根据步骤4生成的 JSON 配置文件，按 `_sql_template` 中的模板，将每个字段转换为 `pub_interule` 和 `pub_interuleitem` 的 INSERT 语句。

**不需要再从零分析字段，直接从 JSON 中取值即可**：

- `_rule.*.value` → 主表 `pub_interule` INSERT 的各列值
- `header[].field/source/type/ref/scope/onNotFound` → 子表各字段的值
- `body.prefix` → 表体 VFIELD/VEXTFIELD 前缀
- `body.items[]` → 表体子表记录

根据 JSON 配置文件，生成 集成规则 插入脚本。 （**此处明确，禁止直接在数据库执行 insert语句，要在项目根目录或者桌面，生成统一SQL脚本文件，由用户执行插入数据操作！且脚本内必须包含 清楚数据的delete脚本。**）

#### 5.1 新建主表记录（pub_interule）

在 NCC 管理后台 → **集成规则** → 新增，示例：

```sql
INSERT INTO pub_interule (
    PK_INTERULE, CODE, NAME, DESCRIPTION,
    PROVIDER, DESTSYS, SRCSYS,
    PK_BILLTYPE, DATATYPE,
    PK_ORG, PK_GROUP,
    CREATOR, CREATIONTIME, DR
) VALUES (
    '主键', '规则编码', '差旅费报销单-XX项目', '差旅费报销单接收接口',
    '三方应用PK', '三方应用PK', '三方应用PK',
    '交易类型PK', 1,
    '组织PK', '集团PK',
    '创建人', SYSDATE, 0
);
```

> **取值提示**：
> - `PK_BILLTYPE`：[替换] `SELECT pk_billtypeid FROM bd_billtype WHERE billtypename LIKE '%差旅费报销单%'`，取 `PK_BILLTYPEID`
> - `PROVIDER`：[固定] 永远为 `0001HAWK000000000001`（华科资产包标识），**不需要替换**
> - `DESTSYS`：[替换] 外系统调 NCC 时填 NCC 集团主键
> - `SRCSYS`：[替换] `SELECT PK_THIRDSYS FROM pub_thirdsys WHERE dr = 0`，取外系统对应的应用主键
> - `CREATOR`：[替换] `SELECT cuserid FROM sm_user WHERE user_code = '当前用户编码'`

#### 5.2 配置子表规则项（pub_interuleitem）

为每个需要映射的字段新增一条子表记录。以差旅费报销单为例：

```sql
-- 示例1：组织字段，来源传编码，翻译为ID
INSERT INTO pub_interuleitem (PK_ITEM, PK_RULE, SERIALNO, VFIELD, VFIELDNAME, 
    VFIELDTYPE, VEXTFIELD, FCONVERT, VCONVERTPARAM, VCONVERTRULE, VTRANSLATE) 
VALUES ('主键', '规则主键', 1, 'pk_org', '组织', 
    '组织docId', 'pk_org', 1, 2, 1, 1);

-- 示例2：币种字段，来源传编码，翻译为ID，找不到则忽略
INSERT INTO pub_interuleitem (PK_ITEM, PK_RULE, SERIALNO, VFIELD, VFIELDNAME, 
    VFIELDTYPE, VEXTFIELD, FCONVERT, VCONVERTPARAM, VCONVERTRULE, VTRANSLATE) 
VALUES ('主键', '规则主键', 2, 'pk_currtype', '币种', 
    '币种docId', 'pk_currtype', 1, 1, 1, 2);

-- 示例3：金额字段，直接映射，无需翻译
INSERT INTO pub_interuleitem (PK_ITEM, PK_RULE, SERIALNO, VFIELD, VFIELDNAME, 
    VEXTFIELD, FCONVERT) 
VALUES ('主键', '规则主键', 3, 'amount', '金额', 'amount', 1);

-- 示例4：默认值，固定字段无需外部传入
INSERT INTO pub_interuleitem (PK_ITEM, PK_RULE, SERIALNO, VFIELD, VFIELDNAME, 
    FCONVERT, VDEFAULTVALUE) 
VALUES ('主键', '规则主键', 4, 'djdl', '单据大类', 0, 'bx');
```

> 字段取值详见 [NCC资产包接口开发指南 - 集成规则子表字段描述](./NCC资产包接口开发指南.md#集成规则子表)

**配置策略表：**

| 场景 | FCONVERT | VCONVERTPARAM | VCONVERTRULE | VTRANSLATE |
|------|----------|---------------|--------------|------------|
| 直接映射（来源字段原样赋值） | 1 | 不填 | 不填 | 不填 |
| 编码→ID按组织翻译，找不到报错 | 1 | 2 | 1 | 1 |
| 编码→ID按集团翻译，找不到忽略 | 1 | 1 | 1 | 2 |
| 编码→ID按全局翻译，找不到新增 | 1 | 0 | 1 | 3 |
| 固定默认值 | 0 | 不填 | 不填 | 不填 |
| 对照表转换 | 2 | 不填 | 不填 | 不填 |

#### 5.3 VFIELDTYPE 取值逻辑（必读）

VFIELDTYPE 是 `md_class.id`，告诉集成规则框架"用哪个参照/档案来翻译编码→ID"。**必须在生成 SQL 前查询数据库确认，不允许留占位符。**

**⚠️ 前置步骤：先确认字段业务含义，再查 md_class**

同一个字段名，不同业务场景对应的 VO 完全不同。**禁止直接猜测 fullclassname 来缩小搜索范围。** 正确做法：

1. 看接口文档中该字段的注释（如"项目"是指"项目管理项目"还是"会计科目项目"）
2. 看字段在 NCC 界面上对应的参照名称
3. 如果不确定，**先用 `displayname` 宽搜，列出所有候选项，让用户确认**：
   ```sql
   SELECT id, displayname, fullclassname FROM md_class
   WHERE displayname = '关键词' OR displayname LIKE '%关键词%'
   ORDER BY fullclassname;
   ```

**典型翻车案例**：`jobid`（项目）在报销单中关联的是**项目管理**的项目档案 (`nc.vo.pmpub.project.ProjectHeadVO`)，不是会计科目项目 (`nc.vo.uapbd.accountingprojectsystem.FormProjectVO`)。二者 `fullclassname` 完全不同，用 `%FormProjectVO%` 搜会漏掉正确的。

---

**取值步骤：**

1. **标准 NCC 实体**（OrgVO、DeptVO、PsndocVO 等）→ 按 `fullclassname` 查 `md_class`：
   ```sql
   SELECT id, displayname FROM md_class WHERE fullclassname = 'nc.vo.org.OrgVO';     -- 组织
   SELECT id, displayname FROM md_class WHERE fullclassname = 'nc.vo.org.DeptVO';     -- 部门
   SELECT id, displayname FROM md_class WHERE fullclassname = 'nc.vo.bd.psn.PsndocVO';-- 人员
   ```

2. **自定义档案**（如管理费用类别、差旅类型、CBS等）→ 所有自定义档案的 `fullclassname` 都是 `nc.vo.bd.defdoc.DefdocVO`，按 `displayname` 区分：
   ```sql
   SELECT id, displayname FROM md_class
   WHERE fullclassname = 'nc.vo.bd.defdoc.DefdocVO'
     AND displayname LIKE '%关键词%';
   ```

3. **特殊情况**：部分字段不是自定义档案，而是特定业务 VO（如项目 `jobid` → `FormProjectVO`），按类名搜索：
   ```sql
   SELECT id, displayname, fullclassname FROM md_class
   WHERE displayname LIKE '%关键词%';
   ```

4. **直接映射/固定值字段**：不需要翻译，`VFIELDTYPE` 留空或不填。

**机科项目已验证的参照 docId：**

| 字段 | 类型 | VFIELDTYPE (md_class.id) | 说明 |
|------|------|--------------------------|------|
| `pk_org` | 标准实体 | `2cfe13c5-9757-4ae8-9327-f5c2d34bcb46` | 组织_业务单元_财务组织 (FinanceOrgVO) |
| `deptid` / `fydeptid_v` | 标准实体 | `b26fa3cb-4087-4027-a3b6-c83ab2a086a9` | 组织_部门 (DeptVO) |
| `jkbxr` | 标准实体 | `40d39c26-a2b6-4f16-a018-45664cac1a1f` | 人员管理信息 (PsndocVO) |
| `zyx26` | 自定义档案 | `1001A1100000000012OX` | 管理费用类别 |
| `zyx28` | 自定义档案 | `1001A11000000005LMOQ` | 差旅类型 |
| `zyx65` | 自定义档案 | `1001A8100000013NT2II` | 机科CBS科目 |
| `jobid` | 业务VO | `2ee58f9b-781b-469f-b1d8-1816842515c3` | 项目 (用户从数据库确认) |

### 步骤6：编写 REST 资源类

在 `erm2111/src/public/nccloud/api/erm/` 下新建 Java 文件。

> **代码骨架**（含 import、JAX-RS 注解、JSON 解析、异常处理）见 [NCC资产包接口开发指南 §4.1](./NCC资产包接口开发指南.md#四rest-接口标准代码模板)。
>
> 以下仅列出与通用模板的**差异部分**：

**差异1：具体 VO 和 Service 类型**

| 通用模板（开发指南） | 本接口（差旅费报销单） |
|---------------------|----------------------|
| `XxxVO` | `JKBXVO`（报销单聚合VO） |
| `ISomeService.save()` | `INewBXBillPublic.save()` |

**差异2：额外处理步骤**

```java
// ===== 在 transferBill() 之后、save() 之前插入 =====
setOACode(aggVo);  // 生成 OA 编码（报销单特有）
```

**差异3：服务获取**

```java
private INewBXBillPublic bxBillPublic = null;

private INewBXBillPublic getBXBillPublic() {
    if (this.bxBillPublic == null) {
        this.bxBillPublic = NCLocator.getInstance().lookup(INewBXBillPublic.class);
    }
    return this.bxBillPublic;
}
```

> 其余代码（`@Path`、`@POST`、`ObjectMapper`、`transferBill()`、`getReturnBill()`、`ResultMessageUtil`、`try-catch`）与通用模板完全一致，直接复用即可。

### 步骤7：注册 OpenAPI 路由

- （**此处明确，禁止直接在数据库执行 insert语句，要在项目根目录或者桌面，生成统一SQL脚本文件，由用户执行插入数据操作！且脚本内必须包含 清楚数据的delete脚本。**）

- API 路由表 : opm_apimanager  

- API路由表字段描述:

    经过测试，不同版本之间可能存在部分字段的差异，但是影响不是很大。
    
    | 字段编码 | 字段名称 | 描述 |
    |----------|----------|------|
    | PK_API | 主键 | API 路由主键，唯一标识一条路由记录 |
    | CODE | 编码 | API 路由编码,  命名规则: <br />参考下面的 API路由编码命名规则。 |
    | NAME | 名称 | API 路由名称 |
    | DESCRIBE | 描述 | API 接口功能描述说明 |
    | APIURI | 接口路径 | REST 接口的 URI 路径，并添加前缀 /nccloud/api/ ，如 `/nccloud/api/erm/travelexpense/add` |
    | MODULE_CODE | 模块编码 | 所属模块编码 ，取 **SELECT** * **FROM** sm_appregister **WHERE** NAME **LIKE** '差旅费报销单%' 的 own_module字段。 |
    | ISAPIDATA | 是否API数据 | 是否为 API 数据接口    默认为 Y |
    | DOCPATH | 文档路径 | 接口文档路径 可留空，一般留空即可 |
    | FK_PARENT | 父级主键 | 父级路由主键，用于构建树形路由结构   opm_apimanager表，将父级菜单的 pk_api设置到本条数据的 fk_parent中。 |
    | TS | 时间戳 | 乐观锁时间戳 |
    | DR | 删除标记 | 0=未删除，逻辑删除标识 |



- API路由编码命名规则:

  根据 MODULE_CODE 模糊查询现有的openAPI<br />根据查询结果中的code（一般是纯数字），仿照格式，递增即可。例如查询结果:<br />**SELECT** * **FROM** opm_apimanager **WHERE** module_code **like** '7035%' , 70350107,70350108,<br />最高到 70350108，则可以命名为 70350109，视数据情况而定。<br />因为是树状菜单，有个字段 ISAPIDATA 为 N 代表是菜单项 ， 在选择编码时，要判断下上游菜单选择的是否正确。<br />例如:  **SELECT** * **FROM** opm_apimanager **WHERE** module_code **like** '2011%' 查询到 6条结果 <br />

  code                       NAME

  201105                  报销单
  201110                商旅订单
  201115                 申请单
  20111505           申请单校验接口
  20110505           差旅月结报销单接口
  20111005           商旅订单同步
  20111099            商旅订单查询

- 可以发现，我们要写的是  差旅费报销单接口，隶属于报销单，所以，我们认为编码最大的那条 code应该是 20110505，接下来命名应该是 20110506

### 步骤8：配置对照表（可选）

当需要做**值映射**（如外系统传"是/否" → NCC 存"1/0"）时配置。

在 NCC 管理后台 → **对照表** → 新增：

| 来源值 | 目标值 |
|--------|--------|
| 是 | 1 |
| 否 | 0 |

然后在集成规则子表中设置 `FCONVERT=2`，`VCONTRAST=对照表主键`。

### 步骤9：测试与调试

#### 9.1 接口地址

```
POST http://{NCC_HOST}/service/erm/travelexpense/add
POST http://{NCC_HOST}/service/erm/travelexpense/approve
```

#### 9.2 测试请求示例

> **⚠️ 表体数组 key（如 `er_busitem`）必须从 bmf 文件中 `BodyOfAggVOAccessor` 的 `name` 值获取，严禁猜测。**
> 详细流程见 [NCC资产包集成规则配置方法 - 表体字段前缀 bmf 查询流程](./问题处理/NCC资产包集成规则配置方法.md#表体字段前缀--bmf-文件查询流程必读)

- 注意 表体的字段名称: 例如下面的: BXBusItemVO ,这个命名规则需要从 对应的 .bmf 元数据文件中获取。

- 在.bmf文件中，找到 `<attribute accessStrategy="nc.md.model.access.BodyOfAggVOAccessor" name="er_busitem" ...>` ，则 `name` 属性的值，就是请求报文中表体的字段编码（也是集成规则子表 VFIELD 的前缀）。

  以下是 `expenseaccount.bmf` 中 entity 的实际内容（用于交叉验证）：

   <entity accessorClassName="nc.md.model.access.javamap.NCBeanStyle" bizItfImpClassName="" componentID="34191cb9-6aa7-414d-bd1e-0d9091e554af" createIndustry="0" createTime="2010-01-18 10:12:41" creator="" czlist="" description="" displayName="报销单业务行" fullClassName="nc.vo.ep.bx.BXBusItemVO" height="100" help="" id="ece96dd8-bdf8-4db3-a112-9d2f636d388f" industryChanged="false" isAuthen="true" isCreateSQL="true" isExtendBean="false" isPrimary="false" isSource="false" keyAttributeId="22f06985-b929-4f66-81bd-71068e40d44e" modInfoClassName="" modifier="yonyouBQ" modifyIndustry="0" modifyTime="2023-02-13 10:52:10" name="er_busitem" resid="22011EXP-000026" stereoType="" tableName="er_busitem" userDefClassName="" versionType="0" visibility="public" width="87" x="580" y="131">
          

  

```json
{
    "djlxbm": "RBSM006",
    "pk_org": "01",
    "jkbxr": "1001A1100000005RBPHF",
    "deptid": "001",
    "pk_currtype": "CNY",
    "amount": 1000.00,
    "remark": "测试差旅费报销",
    "er_busitem": [
        {
            "amount": 500.00,
            "fee_type": "01",
            "remark": "交通费"
        }
    ]
}
```

#### 9.3 常见报错排查

| 报错 | 原因 | 解决 |
|------|------|------|
| `集成规则未配置` | transferBill 找不到匹配的 AggInteRuleVO | 检查步骤5主表的 PK_BILLTYPE 和 SRCSYS 是否正确 |
| `字段 XX 值不存在` | 编码翻译找不到对应基础数据 | 检查编码是否正确，或将 VTRANSLATE 改为 2（忽略） |
| `null pointer` | 必填字段未赋值 | 在 setDefaultValue() 中补充默认值 |
| `NCLocator 找不到服务` | 接口没有对应实现类 | 确认 NCC 服务注册中有该接口的实现 |

---

## 三、对照表（可选）

> 对照表的操作步骤已在 [§步骤8](#步骤8配置对照表可选) 中说明。此处补充数据库层面的参考信息。

### 3.1 使用场景

当外系统与 NCC 对同一概念使用不同的编码值时（如外系统传"是/否"、NCC 存"1/0"），使用对照表做值映射。

在集成规则子表中设置 `FCONVERT=2`，`VCONTRAST=对照表主键`。

### 3.2 数据库表

| 表 | 用途 |
|----|------|
| `pub_intecontrast` | 对照表主表，定义对照规则的基本信息（编码、名称等） |
| `pub_intecontrastdata` | 对照表子表，存储来源值→目标值的映射关系 |

> **待补充**：主表和子表的完整字段描述（字段编码、类型、含义）。当前项目中对照表使用较少，尚未积累足够的字段文档。

---

## 四、集成日志

### 4.1 自动记录

调用 `transferBill()` 和后续的 `save` / `update` 时，NCC 框架会自动记录集成日志。

### 4.2 查看方式

NCC 管理后台 → **集成日志** 节点 → 可按时间、单据类型、来源系统筛选。

### 4.3 日志内容

| 信息 | 用途 |
|------|------|
| 请求报文（原始 JSON） | 确认外系统传入的字段值和格式 |
| 翻译结果（转换后的 VO） | 确认 `transferBill()` 将编码翻译为 ID 是否正确 |
| 错误堆栈 | 定位保存失败的具体原因 |

### 4.4 排查流程

当 `transferBill` 返回的 VO 中某个字段为 null 时，按以下顺序排查：

1. **集成日志** → 看请求报文是否完整传递了该字段
2. **pub_interuleitem** → 检查该字段是否配置了集成规则项（VFIELD 前缀是否正确）
3. **VFIELDTYPE** → 检查 `md_class.id` 是否正确（参见 [§5.3 VFIELDTYPE 取值逻辑](#53-vfieldtype-取值逻辑必读)）
4. **VCONVERTPARAM** → 检查翻译范围（全局0/集团1/主组织2）是否匹配
5. **基础数据表** → 确认外系统传的编码在 NCC 中确实存在
6. **setDefaultValue()** → 检查代码中是否覆盖了翻译结果

> 排查时优先看集成日志的翻译结果，它能直接告诉你哪个字段翻译失败。

---

## 相关文档

- [NCC资产包接口开发指南](./NCC资产包接口开发指南.md) — 框架类、服务接口、字段翻译策略、核心代码模板
