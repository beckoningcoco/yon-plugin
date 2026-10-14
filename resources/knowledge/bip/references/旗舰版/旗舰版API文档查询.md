---
name: 旗舰版API文档查询
description: >
  用友 BIP 客开技能。当需要查询旗舰版/开放平台**有哪些 API 可用**，或**某个 API 的调用地址、请求方式、请求参数与返回值字段说明、描述、请求/返回示例、错误码**时参考。
  含连接集成平台「调用API → API文档」页面入口，以及 /iuap-ipaas-base/openPortal/api/ 下 search（按名字，一次请求）→ listIntegrateSys（整棵目录树，一次请求）→ groupApiByApiClassify（分类清单，认 domainAppCode + treeNodeType）→ getByVersionForTest（详情）→ getApiClassifyTree（分类路径）这组接口的完整查询链。
  注意：这与《旗舰版调用OpenAPI》互补——那篇讲拿到地址后怎么用 token 调，这篇讲**怎么找到地址和字段定义**。仅适用于 YonBIP/旗舰版，不适用于 NCC。
---

# 旗舰版 · API 文档查询（有哪些 API 可用 / 某个 API 的调用地址与字段）

> 适用：YonBIP / 旗舰版（BIP）。**不适用于 NCC**——两条产品线的接口与表结构互不相通。
> 实测环境：国投集团 `https://erpbip.sdic.com.cn` 与金隅 `https://dev-fssc.bbmg.com.cn`，实测日期 2026-10-13 / 10-14，下列接口均由浏览器内 `fetch` 带登录态逐个验证返回 200。

## 1. 页面入口与结构

菜单路径：**首页 → 连接集成平台 → 调用API → API文档**

- 菜单节点：`div#degree4th-ipass0010`（`service-node`，title=API文档）
- 同级节点：API调用 `degree4th-ipass0012`、API日志 `degree4th-yonLinker_api_rizhi`、API路由 `degree4th-yonlinker_apiluyou`
- 前端应用：**UCG-FE（API 文档中心）**，基座服务 `iuap-ipaas-base`

页面三块：

| 区域 | 内容 |
| --- | --- |
| 顶部 | 搜索框「请输入名称/路径」（**回车才发请求**，见 2.0）+ 单选：全部 / 自定义 / 原厂 |
| 左侧 | 分类树（用友 YonBIP → 财务云 / 应用平台 → 档案服务 / 数字化建模 → 档案利用 / 业务期间 → 各 API）——**共有 11 云 / 38 服务 / 141 分类 / 594 子分类**，见 2.1 |
| 右侧 | API 列表：序号 \| API名称 \| API描述 \| 所属分类；点 API 名进入详情 |

详情页 7 个 tab：`1.请求说明 2.请求参数 3.请求示例 4.返回值参数 5.正确返回示例 6.错误返回码 7.错误返回示例`，另有 **API测试工具** 按钮（OpenAPI Explorer 可直接运行）。

**「请求说明」包含的就是要的调用信息**：请求域名、请求地址、请求方式、ContentType、应用场景、API类别、事务和幂等性、多语。

页面 DOM 定位（供自动化取数用）：
- 详情正文容器 `.doc-view-content-right`；列表容器 `.doc-des-api-total-list`，每行 `a[title="{API名称}"][fieldid="{apiId 的 uuid}"]`
- 表格 `table.open-table-simple`；关闭页签按钮 `[fieldid="ipass0010_icon"]`

## 2. 数据接口（基址 `/iuap-ipaas-base/openPortal/api/`，除 2.0 的搜索是 POST 外都是 GET）

**先按名字搜（2.0），搜不到再去翻目录（2.1 → 2.4）**——目录接口只返回环境的一部分，按它下结论会错。

所有接口都必须带：
- 浏览器**登录态 cookie**（在已登录页面的上下文里发请求）
- `isAjax=1`
- `scene=open`（开放 API 视角）
- `isOrigin=1`（实测=原厂数据集；页面单选 全部/自定义/原厂）
- `ts=时间戳`（防缓存，可省）

### 2.0 ★ 按名字搜索（一次请求，**最省**的一发）

```
POST /iuap-ipaas-base/openPortal/api/search?isAjax=1
body: {"param":"条形码"}
```
返回 `data[]`，每条 `{ apiId, apiName, category, isOrigin, deprecated, … }`——**只有名称与分类名**，没有描述、没有地址、没有字段。实测 `{"param":"条形码"}` 命中 1 条、响应 335 字节：

```json
{ "apiId": "2414821069941112834", "apiName": "根据单据条形码查询件", "category": "档案利用",
  "isOrigin": 1, "deprecated": 0, "ytenantId": "0" }
```

这就是控制台搜索框**回车**时发的那一发（打字本身不发请求，本地过滤；回车才发）。它按名称与路径做子串匹配，**与目录树覆盖了多少无关**，所以「按名字找一个接口」应当先问它，拿到 `apiId` 再去 2.6 取地址与字段。整条链因此可以是 **1 次搜索 + 1 次详情 + 1 次分类路径 = 3 次请求**。

### 2.1 ★ 目录树：一次请求拿到全部云 / 服务 / 分类 / 子分类

```
GET /iuap-ipaas-base/openPortal/api/listIntegrateSys?scene=open&isAjax=1
```

**它不只返回集成系统**：`data[0]` 就是一棵递归树（实测响应 392,897 字节、**784 个节点**）：

```json
{ "id": "yonsuite", "name": "用友YonBIP", "type": "integrateSys", "children": [ … ] }
```

节点字段：`id / name / type / sort / enable / children / parentId / productId / code / hasChildren / isOrigin / order`。`type` 的含义（实测计数）：

| type | 含义 | 个数 |
| --- | --- | --- |
| 1 | 云（应用平台、财务云、供应链云、人力云、协同云、采购云、营销云、制造云…） | 11 |
| 2 | 服务 / 产品（数字化建模、档案服务、销售服务…） | 38 |
| 3 | 分类（档案利用、会员中心…） | 141 |
| 4 | 子分类 | 594 |

分类节点的 `id` 与 `code` 相同（如 `EAF_DALY`）。**查某个分类的接口清单要用它的 `code` 当 `domainAppCode`**，见 2.4。

### 2.2 产品列表（**只是树的一层，且不全**）

```
GET .../listProductByIntegrateSys?integrateSysId=yonsuite&scene=open&isOrigin=1&isAjax=1
```
返回 29 条，实测首条：`{ "id": "4d12434dd5de42c2b6fffd093e31e074", "name": "数字化建模" }`

**注意**：这条只回答「一部分服务」，实测在某租户只给回 14 条，**漏掉整个财务云、供应链云**——控制台左树的完整目录请用 2.1。按它遍历，会得到「这个环境没有这个 API」这种错误的确定性结论（真事，见 4.9）。

### 2.3 分类列表（按产品）

```
GET .../listApiClassifyByParent?productId={productId}&scene=open&isOrigin=1&integrateSysId=yonsuite&isAjax=1
```
返回 99 条，实测首条：`{ "id": "2201720546625847300", "name": "业务期间", "hasChildren": 0 }`

节点结构：`id / name / type / sort / enable / children / parentId / productId / code / isOrigin / hasChildren / order`

### 2.4 分类下的 API 清单（**带描述，页面表格就是它**）

```
GET .../groupApiByApiClassify?scene=open&domainAppCode={classifyCode}&treeNodeType=3&isOrigin=0&integrateSysId=yonsuite&isAjax=1
```

**形状是这一对参数说了算**：`domainAppCode`（= 分类节点的 `code`）配 `treeNodeType`（= 分类节点的 `type`，3 或 4）。实测同一个分类（`EAF_DALY` 档案利用）：用这个形状查回**恰好 1 条**（根据单据条形码查询件），而用下面的老形状查回的是**空数组**：

```
GET .../groupApiByApiClassify?scene=open&apiClassifyId=EAF_DALY&isOrigin=1&integrateSysId=yonsuite&isAjax=1   → data: []
```

老形状（`apiClassifyId` + `isOrigin=1`）对 2.2/2.3 那批产品树里的分类仍然有效，所以两套都要会。返回依旧是按分组：
```json
[ { "id": "2201720546625847300", "name": "业务期间", "code": "", "sort": 1,
    "apiList": [ { "apiId": "2201778107777548296",
                   "apiName": "业务期间详情分页查询-新集成",
                   "describe": "业务期间详情分页查询（新集成）",
                   "category": "业务期间",
                   "isOrigin": true } ] } ]
```
`apiList[].apiId` 就是后面查详情要用的 id。

### 2.5 同一分类的另一种返回（树节点形态，**无描述**）

```
GET .../listApiByApiClassifyId?scene=open&apiClassifyId={classifyId}&isOrigin=1&integrateSysId=yonsuite&isAjax=1
```
返回 `id / name / hasChildren / parentId / type / sort ...`。要描述请用 2.4。

### 2.6 ★ API 详情（调用地址 + 字段说明 + 描述）

```
GET .../getByVersionForTest/{apiId}/running?scene=open&isOrigin=1&isAjax=1
```

`data` 里的关键字段（实测「业务期间详情分页查询-新集成」，响应约 97 KB）：

| 字段 | 含义 | 实测值 |
| --- | --- | --- |
| `name` / `description` | API 名称 / 描述 | 业务期间详情分页查询-新集成 / 业务期间详情分页查询（新集成） |
| **`address`** | **完整调用地址** | `https://erpbip.sdic.com.cn/iuap-api-gateway/yonbip/digitalModel/basedoc/businessperiod/batchQueryDetail` |
| `proxyUrl` / `completeProxyUrl` | 网关内相对路径 | `/yonbip/digitalModel/basedoc/businessperiod/batchQueryDetail` |
| `connectUrl` | 集成 IPaaS 的地址 | `/openApi/ucfbasedoc.businessperiodscheme_card/batchQueryDetail` |
| `httpRequestType` / `serviceHttpMethod` | 请求方式 | `POST` |
| `contentType` | 报文类型 | `application/json` |
| `requestProtocol` | 协议 | `HTTP` |
| `requestParamsDemo` | 请求示例文本 | `Url: /yonbip/... ?access_token=访问令牌` + Body JSON |
| `apiClassifyId` / `apiClassifyName` | 所属分类 | 2201720546625847300 / 业务期间 |
| `productId` / `productCode` / `productName` | 所属产品 | 数字化建模 |
| `publishStatus` / `openApi` / `preset` | 发布状态 / 是否开放API / 是否预置 | true / true / true |
| **`paramDTOS[]`** | **请求参数（字段说明）** | 见下 |
| `queryParamDTOS[]` | query 位置参数（如 `access_token`） | |
| **`paramReturnDTOS[]`** | **返回值参数** | |
| `apiDemoReturnDTO.content` | 正确返回示例 JSON | |
| `apiDemoReturnDTOError.content` | 错误返回示例 JSON | |
| `errorCodeDTOS[]` | 错误码表 | |
| `tokenSet` / `auth` / `authPlugin` | 鉴权相关信息 | |

`paramDTOS[]` 每项的字段（页面「2.请求参数」表格的来源）：

| 字段 | 含义 |
| --- | --- |
| `name` | 参数名（如 `pageIndex`） |
| `paramDesc` | 中文描述（如「页码」） |
| `paramType` | 类型（`number` / `string` / `boolean` / `date` / `object`） |
| `required` | 是否必填 → 页面的「必填」列 |
| `requestParamType` | 参数位置（`BodyParam` / query） |
| `array` | 是否数组 |
| `visible` | 页面是否展示（`false` 的参数页面不显示，如 `needCount`） |
| `children[]` | 嵌套子参数（object/array 递归） |
| `maxLength` / `decimals` / `format` / `defaultValue` / `example` | 长度、小数位、格式（如 `yyyy-MM-dd HH:mm:ss`）、默认值、示例 |
| `regularRule` / `refType` | 校验正则 / 是否参照 |

`paramReturnDTOS[]` 同构，额外含嵌套 `children`（实测 `data.recordList[]` 展开到 `BusinessYearVOList → BusinessPeriodVOList` 三层）。

### 2.7 定位某个 API 所在分类（**回答里那条「财务云 / 档案服务 / 档案利用」就是它**）

```
GET .../getApiClassifyTree?scene=open&apiId={apiId}&isOrigin=1&isAjax=1
```

返回从集成系统根到该分类的**链**（实测 `data` 自 `{id:'2519581541260591114', code:'current_yonbip_default_sys'}` 起，逐层 `type` 1 → 2 → 3）。取每层 `name` 拼起来就是控制台左树里那条路径，**跳过集成系统那层**（`type` 为 `'integrateSys'`）。

为什么要它：2.6 的详情里 `apiClassifyName` 与 `productName` 实测**都是 null**（只有一个 `apiClassifyCode`），只照着详情写「分类：未知」会让人以为这条接口不属于任何分类。

## 3. 一条完整查询链（可直接跑）

在**已登录的该环境页面**里执行（浏览器控制台，或 Y 面板的 `browser_eval`）：

```js
const B = '/iuap-ipaas-base/openPortal/api';
const q = p => fetch(`${B}/${p}`, { credentials: 'include', headers: { isAjax: '1' } }).then(r => r.json());
const post = (p, body) => fetch(`${B}/${p}`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', isAjax: '1' }, body: JSON.stringify(body),
}).then(r => r.json());

// 0) 按名字搜（最省的一发；空了再往下翻目录）——控制台搜索框回车就是它
const found = (await post('search?isAjax=1', { param: '条形码' })).data;
// [{ apiId: '2414821069941112834', apiName: '根据单据条形码查询件', category: '档案利用' }]

// 1) 某个 API → 详情（调用地址 / 字段说明 / 示例）
const d = (await q(`getByVersionForTest/${found[0].apiId}/running?scene=open&isOrigin=1&isAjax=1`)).data;
console.log(d.address);        // 调用地址
console.log(d.paramDTOS);      // 请求参数（name/paramDesc/paramType/required/...）
console.log(d.paramReturnDTOS);// 返回值参数
console.log(d.apiDemoReturnDTO.content);  // 正确返回示例

// 1b) 它在控制台左树的哪条路上（详情里的 apiClassifyName / productName 实测是 null）
const chain = (await q(`getApiClassifyTree?scene=open&apiId=${found[0].apiId}&isOrigin=1&isAjax=1`)).data;
// 逐层取 name、跳过 type === 'integrateSys' 的根 → '财务云 / 档案服务 / 档案利用'

// ── 只有搜索空手而归时才需要下面这条链（想按目录浏览，或要拿某分类的全部接口）──
// 2) 目录树：一次请求拿到全部云 / 服务 / 分类 / 子分类，集成系统 id 在根上
const tree = (await q('listIntegrateSys?scene=open&isAjax=1')).data[0];   // {id:'yonsuite', children:[…]}
const flat = [];
(function walk(nodes, path) {
  for (const one of nodes || []) {
    const here = [...path, String(one.name || '')];
    if (Number(one.type) >= 3) flat.push({ code: one.code, type: Number(one.type), path: here.join(' / ') });
    walk(one.children, here);
  }
})(tree.children, []);

// 3) 分类 → API 清单（含描述）：用 code 当 domainAppCode、type 当 treeNodeType
const target = flat.find(one => one.path.includes('档案利用'));
const groups = (await q(`groupApiByApiClassify?scene=open&domainAppCode=${target.code}`
  + `&treeNodeType=${target.type}&isOrigin=0&integrateSysId=${tree.id}&isAjax=1`)).data;
const apis = groups.flatMap(g => g.apiList);   // [{apiId, apiName, describe, category}]
```

## 4. 实测笔记与坑

1. **必须带登录态**：接口只认浏览器 cookie，直接 curl / Postman 裸调会被拦。要程序化查，就在已登录页面上下文里发请求。
2. **搜索框：打字不发请求，回车才发**：实测在「请输入名称/路径」里用真实键盘输入关键词时**不产生任何请求**（`fetch`/XHR 钩子 0 捕获），那是前端本地过滤；但**按下回车就会发出 2.0 那一发 `POST search`**，右侧随即出结果。要按名字找 API，先问 2.0，别从遍历分类开始。（本文件早先只写了前半句，照它写的工具于是只会翻目录，后果见 4.9。）
3. **`isOrigin` 的含义未做穷尽验证**：页面有 全部 / 自定义(tenant) / 原厂(originalIsv) 三选一；实测 `isOrigin=1` 返回原厂数据。换数据集时优先照着页面发出的实际参数抄。
4. **菜单节点要用合成点击打开**：真实指针点在「连接集成平台」「API文档」节点上无反应（工具回「已点击」但页面不变），需用 `mode: "dom"` 的页面内合成点击。
5. **详情数据不在列表接口里**：2.4 只给 `apiId/apiName/describe/category`，要地址和字段必须再调 2.6。
6. **`paramDTOS` 比页面显示的多**：`visible=false` 的参数（实测 `needCount`）页面不显示，但接口会返回——写代码时值得看全量。
7. **一遍全量扫描到底要多少次请求，以及「按分类名收网」为什么常常收不到网**：实测某租户（金隅）14 个产品 / 51 个分类 / **330 个 API**：集成系统 1 次 + 产品 1 次 + 每产品一次分类共 14 次 + 每个分类一次清单共 51 次 = **67 次**。**这个租户的分类名是模块级的**——销售服务、客户管理、到货单、B2C订单中心、CRM公共……没有任何一个分类叫「销售订单」，所以按分类名收网（分类名含关键词 / 关键词含分类名 / 含关键词的某个词）对「销售订单保存」这类**单据名或接口名**收不到网，只能全量扫。
8. **定位图要连接口名一起存，否则省不掉最贵的那一层**（bip_api_find 的 `~/.dsh/yon-panel/bip-api-index.json`）：只存「产品 → 分类」时，全量 67 次里只省下前 16 次，清单那 51 次照付（实测复跑 1972 / 2193 ms）。把这一趟看到的**接口名跟着分类一起记**下来（本环境 330 个名字 ≈13 KB，49/51 个分类有名字），同一句话第二次就只查图上那一个分类：实测 **67 次 → 1 次**、108 ms，命中与全量完全一致（`sameHits: true`）。两处讲究：(a) 名字要**在判命中之前**就收进图（只收命中的名字，图会越用越窄）；(b) 存档时新图覆盖旧图前要把旧图的名字**带过来**——一次扫描只看到扫过的分类（按分类名收网时只扫一两个），直接覆盖会让其余几十个分类的名字凭空消失。图上只有 id、名字、分类归属与查询形状（`domainAppCode` / `treeNodeType`），**没有地址、没有字段**，所以图过期最多是多扫一轮，不会给出一个看着笃定的错地址。
9. **按名字找接口要先问 2.0，翻目录只是退路**：曾经的工具只走 2.2 → 2.3 → 2.4，而 2.2 在某租户只给回 14 个服务（漏掉整个财务云、供应链云），于是使用者问「根据单据条形码查询件」时，工具答了「**这个环境没有这个 API**」——它其实存在：用友YonBIP / 财务云 / 档案服务 / 档案利用，`apiId 2414821069941112834`。教训两条：(a) 目录接口返回了多少，不代表环境里有多少，「我没扫到」不是「不存在」，这种结论不能替使用者下；(b) 2.0 那一发与目录覆盖无关，一次请求就能定性。现行顺序是 **先 `POST search`；空了才读 2.1 的整棵树枚举，再按定位图（分类 → 接口名）收网**。实测本环境：搜索命中 1 次请求 207 ms；随后详情 2 次请求（2.6 + 2.7）129 ms，地址与「财务云 / 档案服务 / 档案利用」都对。

## 5. 相关既有知识

- 《旗舰版调用OpenAPI》：拿到地址之后**怎么调**（access_token / HmacSHA256 签名 / POST-GET 封装）。
- 《旗舰版发布API》：把自己系统的能力发布成 API（发布 → 授权 → 拿 appKey/appSecret）。
- 《问题处理/开放平台接口使用需要绑定用户》：`OrgId无使用权限` 一类的鉴权坑。
