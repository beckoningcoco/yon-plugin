---
name: BIP微服务与库schema地图
description: >
  用友 BIP 旗舰版（YonBIP）的"哪个微服务归哪个库、哪些表"索引。当拿到一份链路报告看不懂
  里面的 `iuap-apcom-xxx`、要判断一条慢 SQL 是哪个服务打的、该去哪个库核对，或者想弄清
  旗舰版同一个人为什么有三个 id 时，参考本文档。内容从 2026-10-14 金隅共享环境一次全链路
  录制报告里扒出，是**现场实测事实**，不是产品架构图。NCC（NC Cloud）是另一条产品线，
  微服务、库与表互不相通。
---

# BIP微服务与库schema地图

> 来源：2026-10-14 在**金隅共享 `dev-fssc.bbmg.com.cn`** 录的一段操作（搜索框输入"供应商"），
> 由哈勃/BPR 报告给出的跨微服务链路与 SQL 原文反推。
> **这是那一个环境的现场快照**：微服务清单、内网 IP、库表名都可能随版本与部署变化。
> 用它的方式是**当索引用**（"这个名字大概是干什么的、该去哪个库找"），落到具体表前仍要核对。

## 一、微服务地图

| 微服务 | 职责 | 实测内网地址 |
|---|---|---|
| `iuap-apcom-workbench` | 工作台外壳：首页、全文检索入口 | 本机相对路径 |
| `iuap-apcom-messagecenter` | 消息中心 / 通讯录 | |
| `iuap-apcom-auth` | 权限、角色、服务鉴权 | `10.233.64.10:8080` |
| `iuap-apcom-org` | 组织、部门 | `10.233.64.29:8080` |
| `iuap-apcom-staffdoc` | 人员档案 | `10.233.111.28:8080` |
| `iuap-aip-search` | 智能搜索（AIP） | |
| `iuap-uuas-user` | 用户中心（租户-用户关系） | |
| `iuap-uuas-tenant` | 租户中心 | |
| `yonbip-ec-base` | 企业协同基础（通讯录） | `10.233.85.207:8080` |

**命名规律**（可用来猜没见过的服务）：

- `iuap-apcom-*` = 应用平台公共组件（workbench / auth / org / messagecenter / staffdoc…）
- `iuap-uuas-*` = 统一用户与租户（user / tenant）
- `iuap-aip-*` = AI 平台（search…）
- `yonbip-ec-*` = 企业协同域

## 二、库 schema 地图

一台**达梦**库（`jdbc:dm://192.168.22.103:5236`），按 schema 隔离各域：

| schema | 实测表 | 归哪个域 |
|---|---|---|
| `iuap_apcom_benchservice` | `wb_service`、`wb_fulltext_manager`、`wb_extension_impl` | 工作台（全文检索配置、扩展点注册） |
| `iuap_apdoc_basedoc` | `org_orgs`、`bd_staff`、`bd_staff_job`、`bd_duty`、`bd_grade`、`bd_rank`、`bd_position` | 基础档案（组织、人员、职务） |
| `iuap_apcom_auth` | `user_role` | 权限（用户-角色） |
| `iuap_uuas_usercenter` | `pub_tenant_user_relation`、`pub_tenant_ml` | 租户-用户关系、租户多语言 |
| `yonbip_ec_contacts` | `qz_contacts_rule`、`qz_contacts_config`、`qz_digital_staff`、`qz_personnel_show_rule`、`qz_contacts_field_global_setting` | 通讯录规则与配置 |

**要点**：

- 这些是**平台域**的库。业务单据（订单、付款单、发票）在各自的业务库里，**不在这里** ——
  别拿这份地图去找业务表。
- 前缀规律：`wb_*` = workbench、`bd_*` = base data、`org_*` = 组织、`qz_*` = 通讯录、`pub_*` = 公共。
- 公共列：`dr` 逻辑删除（0 有效）、`ts`/`pubts` 时间戳、`ytenant_id` 租户、`id` 主键。

## 三、三个身份字段（写 SQL 前必须认对）

旗舰版**同一个人有三个 id**，混用会查到 0 行：

| 字段 | 实测值 | 说明 |
|---|---|---|
| `ytenant_id` | `jd4ofb7k` | **租户**。几乎每张平台表都带，是第一个过滤条件 |
| `yht_user_id` / `user_id` | `ec4326d0-d490-4d5a-9105-260b51fd16d0` | 用户中心（YHT）的 UUID；前端 URL 与请求里的 `userId` 就是它 |
| `yxyuser_id` | `1646881115134230536` | 用户的**数字** id；`iuap_apcom_auth.user_role` 等表用它 |

前端能拿到的 `userId` 是 **UUID**，而权限类表按 **数字 id** 存 —— 它们是同一个人。
实测 `user_role` 的查询原文：

```sql
SELECT role_id FROM iuap_apcom_auth.user_role
WHERE ytenant_id = 'jd4ofb7k' AND system_code = 'diwork'
  AND begin_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
  AND (yxyuser_id = 1646881115134230536)
```

## 四、服务之间怎么调

### 4.1 RPC（同步）

```text
POST http://{内网IP}:8080/CloudRemoteCall/{接口全名}/{方法}
```

实测四条：

```text
POST http://10.233.111.28:8080/CloudRemoteCall/com.yonyou.hrcloud.staffinfo.service.IStaffQueryService/getUserBaseInfo
POST http://10.233.64.10:8080/CloudRemoteCall/com.yonyou.diwork.service.auth.IDiWorkPermissionService/checkAuthedServiceCodes
POST http://10.233.64.29:8080/CloudRemoteCall/com.yonyou.iuap.data.service.itf.FuncOrgDataQryXTService/paginationSubOrgForXT
POST http://10.233.85.207:8080/CloudRemoteCall/com.yonyou.ec.ezone.base.inapi.api.QzInvocationService/getMemberIdAndQzId
```

同域内的调用可能走**本机相对路径**（`/CloudRemoteCall/...`，不带 IP）。
接口全名有规律：`com.yonyou.{域}.{模块}.service.{接口}/{方法}`，域如 `iuap` / `hrcloud` / `diwork` / `ec`。

### 4.2 会话与鉴权（CAS）

每个服务调对方 REST 之前，都先换一次会话票据：

```text
POST https://{host}/cas/yhtsession/get
     ?ts={毫秒时间戳}
     &username=developer
     &appId={该服务注册的 appId，GUID}
     &springApplicationName={微服务名}
     &datacenterCode=dccore1
```

- `datacenterCode=dccore1` 是数据中心编码
- `appId` 是**按服务注册的 GUID**（实测 messagecenter 的是 `fbd37395-7a90-412b-875f-941ca46098c5`）
- 服务之间的 REST 也有固定形态，例如租户与管理员的判断：

```text
GET https://{host}/iuap-uuas-tenant/apptenant/rest/tenantrest/isadminnew/{userId}?tenantId={ytenant_id}&...
GET https://{host}/iuap-uuas-tenant/apptenant/rest/tenant/id/{ytenant_id}?...
```

**排查含义**：链路里如果"卡"在某个服务真正干活之前很久，先看这段 CAS 换票 ——
它是**每次跨服务调用都做**的一次网络往返，也是跨服务耗时的常见来源。

## 五、一份真实调用链（2026-10-14 金隅）

只搜了一次"供应商"（`GET /fullText/suggest`，222ms）：

```text
iuap-apcom-workbench       222ms  GET /fullText/suggest
 └ iuap-apcom-messagecenter 158ms  POST /out-api/user/search
    └ iuap-apcom-staffdoc     87ms  IStaffQueryService.getUserBaseInfo
 └ iuap-aip-search           64ms  ISearchClientRpcEndpoint/getQueryDTO
 └ iuap-apcom-org            13ms  FuncOrgDataQryXTService.paginationSubOrgForXT
```

它落到 5 个 schema、10 条 SQL，其中：

| schema | 表 | 耗时 / 结果集 |
|---|---|---|
| `iuap_apcom_benchservice` | `wb_service` | 10ms / 11 行 |
| `iuap_apdoc_basedoc` | `org_orgs` | 7ms / 0 行 |
| `iuap_apcom_benchservice` | `wb_fulltext_manager` | 1ms / 3 行 |
| `iuap_apcom_auth` | `user_role` | 0ms / 7 行 |
| `iuap_uuas_usercenter` | `pub_tenant_user_relation` | 1ms / 1 行 |
| `yonbip_ec_contacts` | `qz_contacts_rule` / `qz_digital_staff` / `qz_contacts_config` / `qz_personnel_show_rule` / `qz_contacts_field_global_setting` | 各 1ms |

## 六、怎么用它排查

1. **看到陌生微服务名** → 查第一节知道它归哪个域；再查 4.1 确认它是不是跨机调用
2. **看到慢 SQL** → 用第二节判断"这是平台域还是业务域的问题"
   （`wb_*` / `bd_*` 这类平台表通常很小很快，若出现几百毫秒就是异常）
3. **要自己上库核对** → 先把第三节的三个 id 认对，再用 `yon-db-query`
4. **要把整条链路看清楚** → 打开**哈勃报告**按 TraceId 追；
   **要看 SQL 原文与库连接串** → 打开 **BPR 报告的 SQL耗时TOP10**
   （这两份报告怎么录出来，见同目录《操作录制与性能报告》）

## 七、还没验过的

- 4.1 的内网 IP 是**那一次调用**观察到的；服务多副本，IP 会变，**不要当固定地址用**
- 其他域（财务、供应链、人力业务）的微服务名与库 schema 没在这次录制里出现
- `datacenterCode` / `appId` 是否每个环境不同（实测只见过 `dccore1` 一个环境）
- `iuap-apcom-*` 之外还有多少微服务（这次只观察到 9 个）
