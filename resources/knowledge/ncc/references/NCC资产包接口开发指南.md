# NCC 资产包接口开发指南

> **状态**：待完善 | **适用版本**：NCC 2111/2312 | **最后更新**：2026-06-30
>
> 配套实战文档：[NCC资产包接口实战开发流程](./NCC资产包接口实战开发流程.md)

---

## 一、概述

本文档描述 NCC 中开发外部 REST API 接口（OpenAPI）的标准模式，涵盖模块结构、代码模板、核心服务、通用流程等。

### 1.1 什么是"资产包接口"

"资产包"是 NCC 按业务模块+版本号组织的代码单元（如 `erm2111`、`arap2312`）。

在此模块下，借助华科客开积累代码，沿用华科客开模式，借助 集成规则，对照表，三方应用，集成日志等节点，编写协助开发 REST 接口供外部系统（OA、ERP 等）调用，即为"资产包接口"。

## 二、目录结构

资产包模块遵循固定的目录规范：

```
erm2111/                          # 模块根目录（业务模块名+版本号）
├── src/
│   ├── public/                   # 公开接口（API、Service 接口等）
│   │   └── nccloud/
│   │       └── api/
│   │           └── erm/          # REST 资源类放在这里
│   │               ├── BaseResource.java        # 模块基类（可选）
│   │               ├── JkbxResource.java        # 借款报销接口
│   │               ├── TravelExpenseResource.java # 差旅费报销接口
│   │               └── XxxResource.java         # 其他接口...
│   │
│   └── private/                  # 内部实现（BO、Listener 等）
│       └── nc/
│           ├── bs/erm/           # 业务组件
│           └── impl/erm/         # 服务实现
│
├── META-INF/
│   └── module.xml               # 模块元数据
└── .classpath / .project        # Eclipse 项目配置
```

---

## 三、核心框架类

### 3.1 继承链

```
AbstractNCCRestResource                         (NCC 平台基类)
  └── AbstractRestResource   (opm/opm2111)      (通用 REST 能力：transferBill, getReturnBill, 附件上传等)
        └── BaseResource       (erm)             (ERM 模块基类：影像上传、版本服务)
              └── XxxResource  (erm2111)         (你的接口类)
```

### 3.2 AbstractRestResource 核心方法

| 方法 | 用途 |
|------|------|
| `transferBill(billType, valueMap)` | JSON Map → AggregatedVO（**按集成规则自动翻译编码→ID**） |
| `getReturnBill(billType, voList)` | AggregatedVO → JSON Map（**按集成规则转换输出**） |

> **关键机制**：`transferBill()` 内部调用 `transfer()` → `translate()` 方法，根据 NCC 管理后台配置的**集成规则（AggInteRuleVO）**自动完成编码→主键翻译。不需要在代码里手写币种、部门、职级等标准引用字段的翻译逻辑，前提是规则已配置。

### 3.3 BaseResource

```java
public abstract class BaseResource extends AbstractRestResource {
    // 影像上传
    protected JSONString uploadImag(AggregatedValueObject billVo,
        List<Map> list, String billId, String pk_psndoc, String userId);

    // 获取当前版本服务
    protected ICurrentVersionService getCurrentVersionService();

    // 模块标识
    @Override
    public String getModule() { return "erm"; }
}
```

---

## 四、集成规则详解

### 4.1 概述

- `transferBill()` 主要通过集成规则进行字段翻译。例如 `pk_org` 外系统传 `01`（编码），通过集成规则配置，代码能自动将编码翻译为 ID。
- 集成规则对应主子表结构：一个单据接口对应主表的 1 条规则 + 子表的多条规则项。
- 数据库表：主表 `pub_interule`，子表 `pub_interuleitem`。

> **🔑 关键概念：表体字段前缀（bmf 前缀）**
>
> 集成规则中表体字段的 VFIELD 格式为 `{前缀}.{字段名}`（如 `er_busitem.defitem25`），JSON 请求报文中表体数组的 key 也使用这个前缀。**前缀必须从 bmf 元数据文件中 `BodyOfAggVOAccessor` 的 `name` 属性获取，严禁猜测。**
>
> 查询流程见：[集成规则配置方法 - bmf 文件查询流程](./问题处理/NCC资产包集成规则配置方法.md#表体字段前缀--bmf-文件查询流程必读)

### 4.2 主表 pub_interule 字段说明

以下为一条差旅费报销单集成规则的完整主表示例（机科项目真实数据）：

    | PROVIDER             | DESTSYS              | SRCSYS               | PK_BILLTYPE          | BDTYPE | DATATYPE | MODIFIEDTIME | MODIFIER | CREATIONTIME    | CREATOR              | DESCRIPTION          | NAME              | CODE           | PK_ORG               | PK_GROUP             | PK_INTERULE          | TS              | DR   |
    | -------------------- | -------------------- | -------------------- | -------------------- | ------ | -------- | ------------ | -------- | --------------- | -------------------- | -------------------- | ----------------- | -------------- | -------------------- | -------------------- | -------------------- | --------------- | ---- |
    | 0001HAWK000000000001 | 0001HAWK000000000001 | 0001HAWK000000000001 | 1001A1100000002PRBVH |        | 1        |              | ~        | 2026/6/30 10:53 | 1001A1100000005RBPHF | 差旅费报销单接收接口 | 差旅费报销单-机科 | 264X-Cxx-11102 | 0001A110000000000A2N | 0001A110000000000A2N | 1001A8100000013QWU9G | 2026/6/30 10:53 | 0    |

> **标注说明**：🔒 = 华科固定值，不用改 | ⚠️ = 需查询替换 | ✏️ = 手工填写
>
> | 字段 | 标注 | 取值方式 |
> |------|------|---------|
> | `PROVIDER` | 🔒 固定 | 华科资产包标识，永远为 `0001HAWK000000000001` |
> | `DESTSYS` | ⚠️ 替换 | 目标系统 PK。外系统调 NCC 时填 NCC 集团主键 |
> | `SRCSYS` | ⚠️ 替换 | `SELECT pk_thirdsys FROM pub_thirdsys WHERE dr = 0`，取外系统对应的应用主键 |
> | `PK_BILLTYPE` | ⚠️ 替换 | `SELECT pk_billtypeid FROM bd_billtype WHERE pk_billtypecode = '你的单据类型编码'` |
> | `PK_ORG` | ⚠️ 替换 | `SELECT pk_org FROM org_orgs WHERE code = '你的组织编码'` |
> | `PK_GROUP` | ⚠️ 替换 | `SELECT pk_group FROM org_group WHERE code = '你的集团编码'` |
> | `CREATOR` | ⚠️ 替换 | `SELECT cuserid FROM sm_user WHERE user_code = '你的用户编码'` |
> | `PK_INTERULE` | ✏️ 生成 | 按 NCC 主键格式生成 20 位唯一值 |
> | `CODE` | ✏️ 手工 | 一般取单据类型编码，不重复即可 |
> | `NAME` | ✏️ 手工 | 格式：`{单据名}-{项目名}` |
> | `CREATIONTIME` / `MODIFIEDTIME` | ✏️ 填 | 使用 `SYSDATE` 或当前时间 |
> | `TS` | ✏️ 填 | 使用 `SYSDATE` |

  - 集成规则主表（pub_interule）字段描述

    | 字段编码 | 字段名称 | 描述 |
    |----------|----------|------|
    | PK_INTERULE | 主键 | 集成规则主键，唯一标识一条规则   char(20) |
    | CODE | 编码 | 规则编码，手工录入 （无硬性规则，不重复即可，一般取单据类型编码） |
    | NAME | 名称 | 规则名称 （无硬性规则，方便辨识即可） |
    | DESCRIPTION | 描述 | 规则描述说明 |
    | PROVIDER | 服务提供方 | 固定值 `0001HAWK000000000001`（华科 ，可以去三方应用数据库表里查询主键字段。） |
    | DESTSYS | 目标系统 | 固定值 `0001HAWK000000000001`（NCC 本系统 可以去三方应用数据库表里查询主键字段。） |
    | SRCSYS | 来源系统 | 三方应用节点注册的外部系统主键 （可以去三方应用数据库表里查询主键字段。） |
    | PK_BILLTYPE | 单据类型 | 关联单据类型主键，指定本规则用于哪个交易类型 （参考下面，交易类型取值方式） |
    | BDTYPE | 基础数据类型 | 基础数据类型的 bean 全名，档案类规则使用  ，当数据类型是档案时必填，为单据时不填，参考下面 基础数据类型取值方式 |
    | DATATYPE | 数据类型 | 1=单据，区分是单据规则还是 0 = 档案规则 |
    | PK_ORG | 所属组织 | 规则所属组织主键 一般取集团级  使用 **SELECT** * **FROM** org_group，取pk_group，有多条向用户确认。 |
    | PK_GROUP | 所属集团 | 规则所属集团主键 使用 **SELECT** * **FROM** org_group，取pk_group，有多条向用户确认。 |
    | CREATOR | 创建人 | 创建人用户主键，问一下用户，用的创建人是谁，用户输入编码，使用 **SELECT** CUSERID **FROM** sm_user **WHERE** user_code = 'wur' 查询。 |
    | CREATIONTIME | 创建时间 | 创建时间 默认当前时间 |
    | MODIFIER | 修改人 | 最后修改人用户主键 = 创建人 |
    | MODIFIEDTIME | 修改时间 | 最后修改时间 默认当前时间 |
    | TS | 时间戳 | 乐观锁时间戳，用于并发控制 默认当前时间 |
    | DR | 删除标记 | 0=未删除，逻辑删除标识 |



- 集成规则主表，交易类型取值方式  : 查数据库表 bd_billtype  例如差旅费报销单，就查询  

  **SELECT** * **FROM** bd_billtype **WHERE** billtypename **like** '%差旅费报销单%'   此时查询出了 4条结果，提供 BILLTYPENAME ， PARENTBILLTYPE  ,PK_BILLTYPECODE ， PK_BILLTYPEID ， PK_GROUP ， SYSTEMCODE  让用户选择使用哪一个，则取值 PK_BILLTYPEID 字段作为主键即可。

- 集成规则主表， 基础数据类型取值方式  : 我以供应商基础档案为例，查询SQL

  **SELECT** * **FROM** md_class  **INNER** **JOIN** md_component

  **ON** md_class.componentid = md_component.id 

  **WHERE**  md_component.displayname **LIKE** '%供应商%' **AND** md_class.DEFAULTTABLENAME = 'bd_supplier'

  md_class.DEFAULTTABLENAME 这个字段的条件，一般查询数据字典里，有表名。

  查询结果有多条时，可以问用户选哪个。 最后取  md_component.namespace,md_component.name 两个字段，以   .  拼接为整体，例如 uap.supplier 赋值到基础数据类型字段即可。

  

- 第三方应用 数据库表: **select**  * **from** pub_thirdsys *pub_thirdsys* **WHERE** dr = 0  取  PK_THIRDSYS字段。



### 4.3 子表 pub_interuleitem 字段说明

    | 字段编码 | 字段名称 | 描述 |
    |----------|----------|------|
    | PK_ITEM | 主键 | 子表主键，唯一标识一条规则项 |
    | PK_RULE | 规则主键 | 关联主表 pub_interule 的 PK_INTERULE |
    | SERIALNO | 序号 | 规则项的排序序号 必填不能为空 例如 1 ，2,3 ....... |
    | VFIELD | 字段编码 | 目标字段编码。<br>**表头字段**: 直接写 VO 字段名，如 `pk_org`。<br>**表体字段**: 格式为 `{前缀}.{字段名}`，如 `er_busitem.defitem25`。前缀从 bmf 文件的 `BodyOfAggVOAccessor` 属性的 `name` 值获取，**严禁猜测**。<br>详见 [NCC资产包集成规则配置方法 - 表体字段前缀 bmf 查询流程](./问题处理/NCC资产包集成规则配置方法.md#表体字段前缀--bmf-文件查询流程必读) |
    | VFIELDNAME | 字段名称 | 字段的中文显示名 |
    | VFIELDTYPE | 字段类型 | 引用字段的档案 docId（即 `md_class.id`），用于编码转换时定位基础数据。<br>**取值方法详见** [实战流程 §5.3 VFIELDTYPE 取值逻辑](./NCC资产包接口实战开发流程.md#53-vfieldtype-取值逻辑必读)（含标准实体/自定义档案/业务VO 三种查询方式及 SQL 模板）。见下方字段类型取值方式 |
    | VEXTFIELD | 扩展字段 | 来源 JSON 中的字段名。**必须与 VFIELD 保持一致**：表头字段直接写字段名，表体字段同样加 `{前缀}.`（如 `er_busitem.defitem25`）。 |
    | VEXTFIELDNAME | 扩展字段名称 | 来源字段的中文显示名，一般与 VFIELD 相同 |
    | FCONVERT | 取值方式 | 0=默认值 / 1=映射 / 2=对照表 一般为映射，偶尔为默认，极少为 对照表，依据情况决定。 |
    | VDEFAULTVALUE | 默认值 | 当 FCONVERT=0 时使用的固定值，根据接口文档决定使用什么值。 |
    | VCONTRAST | 对照表 | 当 FCONVERT=2 时，关联对照表主键 |
    | VCONVERTPARAM | 翻译范围 | 0=全局 / 1=集团 / 2=主组织，编码翻译时的组织范围 ，如果字段类型为空时，不需要填！ |
    | VCONVERTRULE | 翻译规则 | 1=按编码 / 2=按名称，将来源编码翻译为 NCC 主键的方式，如果字段类型为空时，不需要填！ |
    | VTRANSLATE | 翻译策略 | 0=不处理 / 1=报错 / 2=忽略 / 3=自动新增 / 4=自定义类 ，大部分情况为 空不填值，当需要指定自定义翻译类时，填 4 |
    | VCONVERTCLASS | 自定义翻译类 | VTRANSLATE=4 时，自定义翻译类的全路径（`包名.类名.方法名`），翻译银行账户等复杂字段时，需要复杂的查询逻辑，此时需要指定 自定义翻译类   nccloud.api.TransferUtil.自定义方法名，例如  nccloud.api.TransferUtil.getIsbusinessunit<br /> 如果不需要，则允许为空！ |
    | VQUERYPARAM | 查询条件 | 0=非查询条件 / 1=等于 / 2=必输，用于查询接口的 where 条件生成 ，一般为空。 |
    | TS | 时间戳 | 乐观锁时间戳  默认当前时间 |
    | DR | 删除标记 | 0=未删除，逻辑删除标识 |



### 4.4 字段类型（VFIELDTYPE）取值方式

数据来源数据库表 `md_class`，取 `id` 字段。查询方式见 [实战流程 §5.3](./NCC资产包接口实战开发流程.md#53-vfieldtype-取值逻辑必读)。

过滤条件: 像是 pk_org组织字段，它可能在不同的单据参考的是不同的参照，例如 库存组织，财务组织，行政组织等等...可以参考  md_class  表的 REFMODELNAME  DISPLAYNAME 模糊匹配，如果根据接口字段文档无法判断是参考的哪个组织，则询问用户。



## 五、三方应用与授权

### 5.1 什么是三方应用

- 数据库表: *pub_thirdsys* 
- 一般与外系统对接时，会在NCC的 OPENAPI管理处 新增一个 专门供外系统使用的 应用。 这个应用主要包含 client_id ，CLIENT_SECRET，ADDRESS（外系统域名，当BIP调用外系统时需要维护，当外系统调用BIP时，无需维护），外系统会根据  client_id ，CLIENT_SECRET 生成签名来调用NCC的API。 在OPENAPI管理处新增应用后，可以选择同步在 三方应用处新增一条数据，用于资产包接口开发时使用。
- **三方应用字段说明:**

    | 字段编码 | 字段名称 | 描述 |
    |----------|----------|------|
    | PK_THIRDSYS | 主键 | 三方应用主键，唯一标识一个外部系统应用，赋给集成规则主表的 SRCSYS/DESTSYS/PROVIDER |
    | CODE | 编码 | 应用编码 |
    | NAME | 名称 | 应用名称 |
    | CLIENT_ID | 客户端ID | OPENAPI 管理处注册应用时生成的 client_id，外系统用此生成签名 |
    | CLIENT_SECRET | 客户端密钥 | OPENAPI 管理处注册应用时生成的 client_secret，配对 client_id 使用 |
    | REDIRECT_URI | 回调地址 | OAuth 回调地址，一般不需要配置 |
    | ADDRESS | 外系统地址 | 外系统域名/IP，当 NCC 主动调用外系统时需要维护，外系统调用 NCC 时可留空 |
    | PK_ORG | 所属组织 | 应用所属组织主键,一般留空 |
    | PK_GROUP | 所属集团 | 应用所属集团主键 |
    | CREATOR | 创建人 | 创建人用户主键 |
    | CREATIONTIME | 创建时间 | 创建时间 |
    | MODIFIER | 修改人 | 最后修改人用户主键 |
    | MODIFIEDTIME | 修改时间 | 最后修改时间 |
    | TS | 时间戳 | 乐观锁时间戳 |
    | DR | 删除标记 | 0=未删除，逻辑删除标识 |

---

## 六、REST 接口标准代码模板

### 6.1 最小可用结构

```java
package nccloud.api.erm;

// JAX-RS 注解
import javax.ws.rs.Consumes;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;

// NCC 框架
import nc.bs.framework.common.NCLocator;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.dao.BaseDAO;
import nc.bs.logging.Logger;
import nc.vo.pub.BusinessException;

// JSON 处理
import com.fasterxml.jackson.databind.ObjectMapper;
import nccloud.api.rest.utils.ResultMessageUtil;
import org.json.JSONString;

@Path("erm/xxx")                     // 接口路径前缀
public class XxxResource extends BaseResource {

    // 服务引用（懒加载）
    private ISomeService someService = null;

    // ============ 新增 ============
    @POST
    @Path("add")
    @Consumes({"application/json"})
    @Produces({"application/json"})
    public JSONString add(JSONString str) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> map = mapper.readValue(
                str.toJSONString(), new TypeReference<Map<String, Object>>() {});

            // 1. JSON → VO（自动处理编码→ID翻译）交易类型编码
            String djlxbm = (String) map.get("djlxbm");
            XxxVO aggVo = (XxxVO) transferBill(djlxbm, map);

            // 2. 设置默认值
            setDefaultValue(aggVo);

            // 3. 保存
            aggVo = getService().save(aggVo);

            // 4. VO → JSON 返回
            List valueList = getReturnBill(djlxbm, Collections.singletonList(aggVo));
            return ResultMessageUtil.toJSON(valueList.get(0), "保存成功");

        } catch (Exception e) {
            Logger.error("xxx异常", e);
            return ResultMessageUtil.exceptionToJSON(e);
        }
    }

    // ============ 服务获取 ============
    private ISomeService getService() {
        if (this.someService == null) {
            this.someService = NCLocator.getInstance().lookup(ISomeService.class);
        }
        return this.someService;
    }
}
```

### 6.2 响应格式

使用 `ResultMessageUtil` 统一响应：

```java
// 成功响应
ResultMessageUtil.toJSON(data, "操作成功");
// → {"success": true, "code": "200", "message": "操作成功", "data": {...}}

// 失败响应
ResultMessageUtil.exceptionToJSON(new BusinessException("错误信息"));
// → {"success": false, "code": "999", "message": "错误信息", "errorStack": "..."}
```

---

### 6.3 OPENAPI 授权给应用（opm_relateapi）

注册OPENAPI是在 OPM_APIMANAGER 这个表里插入一条数据，拿到这条数据的 主键 PK_API，作为条件查询 OPM_RELATEAPI

为空，则代表没有授权。

此时要做的就是插入一条数据做授权 (**此处明确要求，不得擅自向数据库内执行 insert update delete等语句，要先在项目根目录或桌面生成SQL脚本！**)

OPM_RELATEAPI 表字段描述

| 字段编码 | 字段名称 | 描述 |
|----------|----------|------|
| PK_RELATEAPI | 主键 | 关联关系主键，唯一标识一条 API 与三方应用的授权记录 char(20) |
| PK_API | API 主键 | 关联 OPM_APIMANAGER 的 PK_API，指定被授权的 API |
| PK_THIRDAPP | 三方应用主键 | 关联 pub_thirdsys 的 PK_THIRDSYS，指定被授权访问的三方应用 |
| APP_ID | 应用ID | 三方应用的 client_id，与 pub_thirdsys 中 CLIENT_ID 对应例如 ：JHX |
| APIURI | 接口路径 | API 的 URI 路径，如 `/nccloud/api/erm/jkbx/add` |
| TS | 时间戳 | 乐观锁时间戳，用于并发控制，默认当前时间 |
| DR | 删除标记 | 0=未删除，逻辑删除标识 |

## 七、核心服务接口速查

### 7.1 报销单服务

| 接口 | 类路径 | 关键方法 |
|------|--------|----------|
| `INewBXBillPublic` | `nc.itf.arap.pub.INewBXBillPublic` | `save()`, `update()`, `commit()` |
| `IBXBillPrivate` | `nc.itf.arap.prv.IBXBillPrivate` | `queryHeadersByPrimaryKeys()`, `retriveItems()`, `audit()` |
| `IJkbxOACodeService` | `nc.itf.erm.IJkbxOACodeService` | `queryAndSaveOACode_RequiresNew()` |
| `IPFBusiAction` | `nc.itf.uap.pf.IPFBusiAction` | `processAction(actionCode, djlxbm, ...)` |

### 7.2 服务定位方式

```java
// 通过 NCLocator 获取，不要用 @Autowired
SomeService service = NCLocator.getInstance().lookup(ISomeService.class);
```

---

## 八、报销单通用流程

### 8.1 新增流程

```
JSON 请求
  → transferBill(djlxbm, map)       // JSON→VO，框架自动翻译编码→ID
  → 自定义字段翻译（如有特殊需求）
  → setDefaultValue()                // 补全必填字段默认值
  → setOACode()                      // 生成 OA 编码
  → INewBXBillPublic.save()          // 保存
  → getReturnBill(djlxbm, list)     // VO→JSON 返回
```

### 8.2 修改流程

```
JSON 请求（含 pk_jkbx）
  → queryTravelExpenseByPk()         // 查询原单据
  → transferBill()                   // 解析新数据
  → 保留原单关键字段（pk, ts, creator, djbh）
  → 旧表体标记 DELETED + 新表体标记 NEW → 合并
  → INewBXBillPublic.update()        // 更新
```

### 8.3 审核流程

```
JSON 请求（含 pk_jkbx）
  → queryByPk()                      // 查询单据
  → 判断审批状态 spzt:
      -1/null  → 未提交，先 processAction("SAVE") 提交
      1        → 已审批通过，报错
      2        → 审批中，报错
      3        → 正常，执行 audit()
  → IBXBillPrivate.audit()           // 审核
  → 返回 {pk_jkbx, djbh, djzt, spzt}
```

### 8.4 审批状态码含义

| spzt | 含义 |
|------|------|
| -1 | 未提交（自由态） |
| 0 | 待提交 |
| 1 | 已审批通过 |
| 2 | 审批中 |
| 3 | 已提交待审批 |

---

## 九、默认值设置模板

```java
private void setDefaultValue(JKBXVO aggVo) throws BusinessException {
    JKBXHeaderVO headVo = aggVo.getParentVO();

    // 集团
    if (headVo.getPk_group() == null) {
        headVo.setPk_group(InvocationInfoProxy.getInstance().getGroupId());
    }
    // 财务组织 = 主组织
    if (headVo.getPk_fiorg() == null) {
        headVo.setPk_fiorg(headVo.getPk_org());
    }
    // 币种默认本位币
    if (headVo.getBzbm() == null) {
        headVo.setBzbm("1002Z0100000000001K1");  // 示例主键
    }
    // 汇率默认1
    if (headVo.getBbhl() == null) {
        headVo.setBbhl(UFDouble.ONE_DBL);
    }
    // 单据状态默认8
    if (headVo.getDjzt() == null) {
        headVo.setDjzt(8);
    }
    // 制单人
    if (headVo.getOperator() == null) {
        headVo.setOperator(InvocationInfoProxy.getInstance().getUserId());
    }
    // 单据大类
    if (headVo.getDjdl() == null) {
        headVo.setDjdl("bx");
    }
    // 创建时间
    if (headVo.getCreationtime() == null) {
        headVo.setCreationtime(new UFDateTime());
    }
    // ... 更多默认值见实际项目需要
}
```

---

## 十、编码→ID 翻译策略

### 10.1 标准翻译（推荐，零代码）

在 NCC 管理后台配置**集成规则（AggInteRuleVO）**，`transferBill()` 会自动执行翻译：

- `vconvertparam`：翻译范围（全局0/集团1/主组织2）
- `vconvertrule`：翻译方式（按编码1/按名称2）
- `vtranslate`：未找到时行为（忽略0/报错1/忽略2/新增3/自定义4）
- `vfieldtype`：引用档案的 docId

### 10.2 自定义翻译（代码实现，特殊场景）

当集成规则无法覆盖时（如手机号→用户ID），在代码中实现：

```java
private void translateCreatorCode(JKBXHeaderVO headVo) {
    String creatorCode = headVo.getCreator();
    if (StringUtils.isBlank(creatorCode) || creatorCode.matches("\\d{18,}")) {
        return;  // 已是主键格式，跳过
    }
    BaseDAO baseDAO = new BaseDAO();
    String whereStr = " (mobile = '" + creatorCode
        + "' OR user_code = '" + creatorCode + "') AND dr = 0";
    Collection<?> c = baseDAO.retrieveByClause(
        nc.vo.sm.UserVO.class, whereStr,
        new String[]{"cuserid", "user_code"});
    if (c != null && !c.isEmpty()) {
        nc.vo.sm.UserVO userVo = (nc.vo.sm.UserVO) c.toArray()[0];
        headVo.setCreator(userVo.getCuserid());
        InvocationInfoProxy.getInstance().setUserId(userVo.getCuserid());
    }
}
```

---

## 十一、常见问题

### 11.1 transferBill 后编码没有翻译成ID？

检查 NCC 管理后台是否已配置对应的集成规则（AggInteRuleVO）。规则的条件通过 `pk_billtype` 和 `srcsys` 匹配。

### 11.2 NCLocator.lookup 返回 null？

确认对应的接口在 NCC 服务注册中有实现。常见实现类命名：`XxxServiceImpl` → `nc.impl.xxx.XxxServiceImpl`。

### 11.3 修改单据时如何避免覆盖系统字段？

保留原单据的关键字段不变：
```java
newHeader.setPk_jkbx(oldHeader.getPk_jkbx());    // 主键
newHeader.setTs(oldHeader.getTs());               // 时间戳（防并发冲突）
newHeader.setCreator(oldHeader.getCreator());      // 创建人
newHeader.setCreationtime(oldHeader.getCreationtime()); // 创建时间
newHeader.setDjbh(oldHeader.getDjbh());            // 单据编号
```

### 11.4 如何知道 NCC 用户表是哪个？

NCC 的 `nc.vo.sm.UserVO` 对应 `sm_user` 表。关键字段：
- `cuserid` — 用户主键（20位）
- `user_code` — 用户编码
- `mobile` — 手机号
- `email` — 邮箱

### 11.5 集成规则配置参照类型时保存报错（字符串截断）？

**原因**：`pub_interuleitem` 表的 `vfieldtype` 字段建表长度默认 20，当参照的 `md_class.id` 超过 20 位时（如自定义档案的 ID），写入时字符串被截断导致报错。

**解决方案**（按数据库类型选择）：

```sql
-- Oracle
ALTER TABLE pub_interuleitem MODIFY (vfieldtype VARCHAR2(64));

-- 达梦 (Dameng)
ALTER TABLE pub_interuleitem MODIFY vfieldtype VARCHAR(64);

-- PostgreSQL / PolarDB (NCC 2312)
ALTER TABLE pub_interuleitem ALTER COLUMN vfieldtype TYPE VARCHAR(64);
```

> **注意**：此 bug 在部分 NCC 2207 环境中出现。**已确认 NCC2312 未修复** —— 天九测试环境（tj-ncc-test）实测 `pub_interuleitem.vfieldtype` 仍为 `character varying(20)`（schema=`bipuser`）。
>
> 判断方法：只要集成规则里用了 **36 位 GUID 的参照**（标准实体都是，如财务组织 `2cfe13c5-9757-4ae8-9327-f5c2d34bcb46`），就必须先扩列；只用 20 位自定义档案 ID 的话碰不到。
>
> 执行 DDL 前建议先 `SELECT MAX(LENGTH(vfieldtype)) FROM pub_interuleitem` 确认当前数据（天九环境 133 行、max=20，扩列不丢数据）。这是**环境级**修复，测试和生产要各执行一次。

---

### 11.6 传来的 JSON 字段没落库？——transfer() 只映射「已配置的规则项」

**现象**：外系统明明传了某个字段，集成日志里请求报文也有，但保存后 NCC 单据上那个字段是空的。

**原因**：`AbstractRestResource.transfer()` 是**按集成规则项逐条遍历**的，不是按 JSON key 反查：

```java
// AbstractRestResource.java:1030 transfer(InteRuleItemVO itemVo, Map valueMap, SuperVO vo)
Integer convert = itemVo.getFconvert();
...
} else if (ConvertEnum.CONVERTENUM_YINGSHE1.equalsValue(convert)) {
    value = valueMap.get(extField);     // ← 只处理"规则里配了"的字段
}
```

**没有对应规则项的 JSON 字段会被静默丢弃**，不报错、不告警。这一点在请求报文和日志里都看不出来，只能靠比对单据字段发现。

#### 最典型的翻车：验重键没配

后台任务/接口常拿某个自定义项当**验重键**（如 `def31` 存外系统单号，先按它查 NCC 是否已有单据，有则先删后增）。如果只配了业务字段、**忘了配这个验重键**：

```
NCC 单据的 def31 永远为空
  → 下次拉取前按 def31 in (...) 查 NCC 查不到
    → 判定"系统中不存在该单"
      → 每次都当新单插入
        → 重复单据越积越多（正是"先删后增"要防的情况）
```

而且**单次测试看不出来**——第一次跑只有新增没有重复，跑第二次才会暴露。

#### 排查步骤

1. 抓集成日志里的**请求报文**，确认该字段确实传了、key 名拼写正确
2. `SELECT vfield, vextfield, fconvert FROM pub_interuleitem WHERE pk_rule = '规则主键'` —— 看有没有这一项
3. 没有就补一条：
   ```sql
   INSERT INTO pub_interuleitem
       (PK_ITEM, PK_RULE, SERIALNO, VFIELD, VFIELDNAME, VFIELDTYPE, VEXTFIELD, VEXTFIELDNAME,
        FCONVERT, VCONTRAST, DR)
   VALUES
       ('20位唯一主键', '规则主键', 序号, 'def31', '中文名', '~', 'def31', '来源字段名', 1, '~', 0);
   ```
4. `VFIELDTYPE` 填 `~`（不需要翻译时）；`VEXTFIELD` 必须与报文里的 key 完全一致

> **规律**：**凡是要在 NCC 单据上看到的字段，都必须有一条规则项**——包括纯存值、不参与翻译的字段（验重键、外系统单号、第三方主键等）。
>
> 配置集成规则时建议先把字段分三类过一遍：① 要翻译的（配 VFIELDTYPE + VCONVERTRULE）② 直接存值的（FCONVERT=1，VFIELDTYPE=~）③ 固定默认值的（FCONVERT=0 + VDEFAULTVALUE）。**②最容易漏**，因为界面上看起来"不需要配置"。

#### 相关：表体前缀与报文数组 key 不是同一个东西

- **VFIELD 前缀** = bmf 里 `BodyOfAggVOAccessor` 的 `name` 属性（如收款单是 `bodys`）
- **报文表体数组的 key** = 该子表 entity 的 `name`（如收款单是 `gatheritem`）

`transfer()` 取表体列表用的是后者：

```java
List<Map> valueList = (List<Map>) valueMap.get(bean.getName());   // bean.getName() = entity 名
```

两者对**报销单**恰好同名（都是 `er_busitem`），容易让人以为"报文 key = 前缀"，但收款单就对不上（`bodys` vs `gatheritem`）。**别按前缀去拼报文数组 key。**

---

## 十二、补充说明

> **[待完善]** 以下内容需要补充：
>
> - 不同业务模块的服务接口清单（采购、销售、财务、HR 等）
> - 集成规则配置的详细截图/步骤
> - 常用的 docId 常量列表（币种、组织、部门、职级等）
> - 文件上传/影像上传的完整示例
> - 查询接口的分页写法
> - 异常处理最佳实践
> - 调度任务集成方案
>
> 请在实际项目中遇到并解决后，逐步补充到此文档中。

