# NCC OpenAPI 调用参数速查（取数版）

> **适用版本**：NCC 2111 / 2312（≥2005 用加盐 SHA256，见《NCC-OpenAPI-签名机制详解》）
> **状态**：部分实测（标注「实测」的来自环卫 NCC2111 dev，2026-10-21）
> **定位**：本文只回答「参数从哪取」。签名算法、token URL、请求头、OAEP 加密一律看
> [NCC-OpenAPI-签名机制详解](./NCC-OpenAPI-签名机制详解.md)，不要在这里重复推导。

---

## 一、取 token 要的 6 个参数

| 参数 | 来源 | 说明 |
|------|------|------|
| `client_id` | `opm_thirdapp.app_id` | OPENAPI 管理里应用的 ID |
| `client_secret` | `opm_thirdapp.app_secret` | 与 app_id 配对 |
| `pubKey` | `opm_thirdapp.public_key` | 加密 client_secret + token 签名加盐都用它 |
| `biz_center` | **`sm_busicenter.code`** | 账套编码（不是账套主键） |
| `dsname` | **`sm_busicenter.datasourcename`** | 数据源名。⚠️ 列名是 `datasourcename`，**不是** `datasources` |
| `NCC_HOST` | 环境地址 | 部署信息，不入库 |

> `sm_busicenter` 一个环境可能有多条（正式账套 + 备查/迁移账套），按 `code` 或 `islocked='N'` 选业务账套。
> `datasourcename` 通常与数据库登录名同名（环卫环境 `NCCHW` 即是）。

---

## 二、一条 SQL 查全（把 `:client_id` 换掉）

```sql
SELECT t.app_id            AS client_id,
       t.app_secret        AS client_secret,
       t.public_key        AS pubkey,
       t.security_level,
       b.code              AS biz_center,
       b.datasourcename    AS dsname,
       b.name              AS 账套名称
  FROM opm_thirdapp t
 CROSS JOIN sm_busicenter b
 WHERE t.dr = 0
   AND b.dr = 0
   AND t.app_id = 'NCC2111';      -- ← 目标应用
```

只要是有业务账套的环境，这条就能直接拼出 token 请求。

---

## 三、应用与账套清单

```sql
-- OpenAPI 应用（调用方身份）
SELECT pk_thirdapp, code, name, app_id, app_secret, security_level,
       tentant_id, user_code, third_userid, LENGTH(public_key) AS 公钥长度
  FROM opm_thirdapp WHERE dr = 0 ORDER BY code;

-- 账套（biz_center / dsname）
SELECT pk_busicenter, code, name, datasourcename, islocked, effectdate, expiredate
  FROM sm_busicenter WHERE dr = 0 ORDER BY code;
```

---

## 四、`pub_thirdsys` 与 `opm_thirdapp` 不是一回事

| 表 | 用途 | 谁写 |
|----|------|------|
| `opm_thirdapp` | OpenAPI 调用的应用凭证（app_id / app_secret / public_key） | 后台「OPENAPI 管理 → 应用」新增 |
| `pub_thirdsys` | 资产包集成规则的来源系统（`pub_interule.srcsys` 指向它） | 三方应用节点，或 OPENAPI 应用勾选「同步到三方应用」 |

两者**可能不同步**：环卫环境 `pub_thirdsys` 有 3 条（共享系统 / NCCloud / 九恒星司库），但 `client_id` 全为 NULL；`opm_thirdapp` 有 6 个应用，却没有任何一条对应九恒星。判断某外系统能否调用 OpenAPI，**看 `opm_thirdapp`，不要看 `pub_thirdsys`**。

```sql
-- 外系统是否已注册 OpenAPI 应用（pk_thirdapp 为空 = 还没建）
SELECT s.pk_thirdsys, s.code, s.name, s.address,
       t.pk_thirdapp, t.app_id, t.app_secret
  FROM pub_thirdsys s
  LEFT JOIN opm_thirdapp t ON t.app_id = s.client_id
 WHERE s.pk_thirdsys = '1001D61000000069ZS4N';
```

### 4.1 开发前必查：外系统应用建了没（踩过）

**现象**：需求开发到联调，才发现外系统在 `pub_thirdsys` 里有三方应用记录，但 `opm_thirdapp` 里没有对应应用——于是 `client_id` / `client_secret` / 公钥全是空，连 token 都取不到，后面的路由注册和接口测试全部停住。

**判断顺序**（两步，别跳）：

1. 三方应用在不在：`SELECT * FROM pub_thirdsys WHERE dr = 0`
2. OpenAPI 应用在不在：`SELECT * FROM opm_thirdapp WHERE dr = 0`；用 `LEFT JOIN` 一条出结论（见上面的 SQL）

**四种状态与处理**：

| 状态 | `pub_thirdsys` | `opm_thirdapp` | `opm_apimanager` 路由 | 该做什么 |
|------|----------------|----------------|------------------------|----------|
| 全无 | 无 | 无 | 无 | 先建 OpenAPI 应用，再注册路由，再授权 |
| 只有三方应用（**最常见**） | 有 | 无 | 无 | **停下来，请用户先去后台建应用**，拿到 client_id 再继续 |
| 有应用无路由 | 有 | 有 | 无 | 应用已就绪，去注册 `opm_apimanager` + `opm_relateapi` |
| 全有 | 有 | 有 | 有 | 只核对授权与 `apiuri` 是否对得上 |

**给用户的提示话术**（可直接说）：

> 环境里 `<外系统名>` 目前只有三方应用记录（`pub_thirdsys`，`client_id` 为空），OPENAPI 管理里没有对应的应用，所以现在拿不到 `client_id` / `client_secret` / 公钥，接口无法联调。
> 请先在 NCC 后台 → **OPENAPI 管理 → 应用** 新增应用（编码建议用外系统标识，如 `NineStar`），建完把 `client_id` 告诉我，我接着做路由注册和授权。

**两个容易漏的点**：

- 建应用时若**不勾「同步到三方应用」**，`pub_thirdsys.client_id/client_secret` 会一直是空。这不影响 OpenAPI 调用，但会让集成规则的“来源系统”语义落空。
- 建应用是**界面动作**，不要用 SQL 直接往 `opm_thirdapp` 插——`app_secret`、`public_key`、`private_key` 由平台生成，手插的值对不上签名。

---

## 五、API 是否已注册 / 已授权

```sql
-- 某路径是否注册（未注册 = 调用 404）
SELECT pk_api, code, name, apiuri, module_code, isapidata, fk_parent
  FROM opm_apimanager
 WHERE apiuri LIKE '%uapbd/newproject%';

-- 某应用授权了哪些 API
SELECT r.app_id, m.code, m.name, m.apiuri
  FROM opm_relateapi r
  JOIN opm_apimanager m ON m.pk_api = r.pk_api
 WHERE r.dr = 0 AND m.dr = 0 AND r.app_id = 'NCC2111'
 ORDER BY m.code;
```

> `opm_apimanager` 里 `isapidata='N'` 的是菜单节点（apiuri 为空），`='Y'` 才是真正的 API。
> 平台自带「项目档案」：`101421` 父节点，`10142101` 新增、`10142102` 修改、`10142103/04` 删除。
> 华科资产包的 `/nccloud/api/uapbd/newproject/*` 不属于平台自带，需要自己注册。

---

### 5.1 调用报 `token is not the same`

**结论（✅ 2026-10-21 实测）**：不是 `access_token` 失效，而是应用的 `user_code` 登录会话被顶掉——每次调用都会 `getNCToken` 重建会话，该账号在别处登录过就报这个错。

**解法**：OpenAPI 应用一律配**专用系统账号**，测试期间不要用它登录后台；换完立即恢复（已验证）。

**详情**：见 [问题处理/NCC-OpenAPI报错-token-is-not-the-same.md](./问题处理/NCC-OpenAPI报错-token-is-not-the-same.md)（报错原文、日志堆栈、源码链路、其他备选原因）。

---

## 六、坑（都是实际踩到的）

1. **`sm_busicenter` 的列名是 `datasourcename`**，写成 `datasources` 会报「无效的列名」。
2. **`SELECT *` 对 `org_accountingbook` / `sm_busicenter` 这类表可能返回 0 行**，而 `COUNT(*)` 正常（疑似结果集含大字段被整行丢弃）。查这类表**显式列名**，别用 `*`。
3. **`ALL_TAB_COLUMNS` 对部分业务表查不到列**（环卫环境 `bd_project`、`org_accountingbook` 返回空），`PUB_*`/`OPM_*` 正常。查不到时别断言表不存在，先用 `SELECT * ... ROWNUM = 1` 探。
4. **`public_key` 长度不一**：1024 位 RSA = 218 字符，2048 位 = 402 字符。加密分块大小随密钥长度变，见签名文档 §1.4。
5. **`security_level`（L0/L1）与签名版本（1/2）不是同一字段**：签名版本判断靠 `OpenApiVO.version`，该值**不在 `opm_thirdapp` 表里**，本环境未能从库中确认，按 NCC 版本（≥2005）走加盐 SHA256 即可。
6. 九恒星案例（环卫 2111）：`pub_thirdsys` 有记录、`ADDRESS` 有值，但 **OpenAPI 应用未创建**，也**没有任何 `newproject` 路由**——此时谈 client_id/secret 是空的。

---

## 七、相关文档

- [NCC-OpenAPI-签名机制详解](./NCC-OpenAPI-签名机制详解.md) — token URL、OAEP 加密、加盐签名、请求头、错误码
- [NCC三方应用配置读取](./NCC三方应用配置读取.md) — `pub_thirdsys` / `pub_thirdparam` 表结构
- [NCC资产包接口实战开发流程](./NCC资产包接口实战开发流程.md) — 步骤 7 注册 OpenAPI 路由（`opm_apimanager` + `opm_relateapi`）
