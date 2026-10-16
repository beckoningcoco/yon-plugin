---
name: ncc-page-button
description: 给 NCC（用友 NC Cloud）的 nccloud 前端页面新增、修改或排查按钮。触发词：加按钮、新增按钮、页面按钮、按钮注册、应用注册、按钮不显示、按钮点了没反应、按钮置灰、按钮权限、setButtons、queryallbtns、SM_APPBUTNREGISTER。覆盖：在平台「应用注册」里注册按钮、前端补事件方法与启用规则、后端 Action 与 action 配置注册、注册后不生效的元数据缓存排查、按钮注册数据的换环境复刻。写业务插件本身用 ncc-plugin-dev；旗舰版（BIP / YonBIP）是另一条产品线，按钮机制互不相通，用 yonyou-bip-dev。
whenToUse: 使用者要求给 NCC 某个节点/页面加按钮、改按钮名称或位置、按钮点了没反应、按钮不显示或置灰不对时。
---

# NCC 页面按钮开发

> 对象：**nccloud 前端页面**（hotwebs 脚手架 + `nc-lightapp-front` + `createUIDom`）。
> 机制细节、实测样本与本机踩坑记录见知识库 `ncc/ncc-dev/references/frontend/app-register-and-buttons.md`（用 `knowledge_read` 读；本节是操作流程，那篇是原理与实测）。

## 0. 先确认是不是这一套

| 你看到的 | 走哪套 |
| --- | --- |
| 页面地址形如 `/nccloud/resources/<模块>/<目录>/index.html`，代码 `import { createPage } from 'nc-lightapp-front'`，按钮由 `props.button.setButtons(...)` 渲染 | **本技能**（nccloud 页面，按钮注册在 `SM_APPBUTNREGISTER`） |
| 老 NC 单据/档案页面，按钮挂在单据模板或功能注册上 | 另一套（单据模板 + 功能注册），不走本文流程 |

不确定就先问使用者：**要加在哪个节点、那个页面的 URL 是什么**；拿到 URL 再看它加载的是哪个前端目录。

## 1. 三条铁律

1. **按钮先在平台注册，前端只负责点击行为**。按钮数据在 `SM_APPBUTNREGISTER`（界面入口：应用注册 → 选页面 → 按钮注册），前端 `setButtons()` 只是把平台下发的数组渲染出来。
2. **注册与前端事件必须成对**：只注册不写前端事件 → 按钮显示但**一点就报错**（点击按 key 分发到 `mainTableEvent<key>`）；只写前端不注册 → 按钮能显示，但不在注册表里，**进不了按钮权限与个性化**。
3. **注册后不生效，先怀疑缓存，再怀疑 APPID**：前端把页面元数据缓存在 localStorage（`appTempletStorage_*`），命中缓存就不再请求服务端。

## 2. 标准流程（四步）

### 第 1 步 · 在「应用注册」里注册按钮

界面路径（工作台）：**应用注册**（地址带 `#/ar`）→ 左树选中目标**页面**节点 → 右侧「**按钮注册**」页签 → 「**增行**」→ 填写 → 「**保存**」（提示"操作成功"）。

逐格编辑的表格，要填的列与取值：

| 列 | 值 | 说明 |
| --- | --- | --- |
| 按钮编码 | `ReportA` 这类英文 | **必须与前端事件方法名一致**；它同时是前端按钮对象的 `key` |
| 按钮名称 | 界面上显示的文字 | 前端 `title`，如"上报A" |
| 按钮类型 | 常规按钮 | `general_btn` |
| 按钮颜色 | 次要按钮 / 主要按钮 | `button_secondary` / `button_main` |
| 按钮区域 | 列表页按钮区填 `epm-button-area` 一类；表格行内按钮填 `dimPropsTable` | 前端 `area`，**填错按钮就不显示在那个区域** |
| 按钮功能描述 | 如"报送管理-上报A" | 仅描述 |
| 父按钮编码 / 快捷键 / 页面区域编码 | 留空 | 现有按钮多数为空 |
| 关键功能 | 开关，保持关闭 | `ISKEYFUNC=N` |

保存走 `/nccloud/platform/appregister/insertbutton.do`（`AddAppButtonAction`）。

- **按钮区域（BTNAREA）取哪个值**：先看同页面既有按钮注册记录里的 `BTNAREA`，照着填——它对应前端 `createButtonApp({ area: '...' })` 的名字。
- **APPID 不用手填**：界面会带当前选中页面所属应用的 APPID。同一 pagecode 在库里可能有多组 APPID（产品给不同入口各注册一套），只有页面实际用的那组会下发。
- 旧按钮要改名称/顺序/颜色，直接在列表里「编辑」或在「操作」里改，不要新注册一条重名的。

### 第 2 步 · 前端补事件方法（不做就报错）

按钮点击是**纯前端按 key 分发**：`createButtonApp({ onButtonClick: (props, id) => this[EVENT_TABLE + id](props) })`，其中 `id` 就是按钮 `key`。所以在**按钮区组件**里要加同名方法，列表页通常列表页签/详情页签各一个：

```js
const EVENT_TABLE = 'mainTableEvent';
const EVENT_DETAIL = 'detailTableEvent';

// 列表页签
[EVENT_TABLE + 'ReportA'] = async (props) => {
    let pk_tasks = getPk_tasks(props);            // 取勾选行主键，沿用本页既有写法
    if (!pk_tasks.length) return _toast(ml[30] || '请选择数据!', SPELLING.warning);
    // …调后端
}

// 详情页签
[EVENT_DETAIL + 'ReportA'] = async (props) => {
    let checkData = tabsHelper.getCheckData(false);
    // …
}
```

- 事件方法名 = `mainTableEvent` / `detailTableEvent` + 按钮编码，**一个字母都不能错**，错了一个入口点了就没反应或报错。
- 按钮区组件不一定是同一个文件：先找到页面里 `createButtonApp` 所在组件（列表页常见 `components/PageButtons.js`）。
- 表格**行内按钮**走的是另一条路：`createOprationButton(buttonAry, { area:'...', onButtonClick })`，按钮编码写在行渲染的 `buttonAry` 数组里。

### 第 3 步 · 启用/置灰规则与多语

- 初始禁用列表：`props.button.setButtonDisabled(['Returned','UpdateTaskStatus', /* … */ 'ReportA'], true)`；
- 勾选/状态变化时放开：本页的勾选回调（列表页常见 `configButtonDisabled`）里按业务条件 `btnDis.ReportA = false`；
- **新按钮不加这两处**，别的按钮灰着它却亮着，或一直点不动。
- 需要多语时，按钮名称的多语跟着页面多语模块走；但注意**按钮标题来自注册表 `BTNNAME`**，改标题改注册数据，不是改前端。

### 第 4 步 · 后端接口（需要时才做）

1. 写 Action 类（参照同模块既有 Action 的写法与包名）；

   > **Action 里不写业务逻辑**（NCC 分层规范；实测被使用者纠正过——初版把取数、组装、落库全写在 Action 里，被指出"Action 类中不处理任何业务逻辑，都是建 Service 去处理的，你并没有建新接口"）。
   >
   > Action 只做「读参数 → lookup 服务 → 调方法 → 包装返回」，业务落在**服务接口 + 实现**，并在**模块的 `.upm` 注册**，`NCLocator.lookup` 才找得到：
   >
   > | 层 | 命名 | 实测例 |
   > | --- | --- | --- |
   > | 接口 | `nc.itf.<模块>.<子模块>.<业务>.IXxxService` | `nc.itf.epmp.bgr.IBgrReportSyncService` |
   > | 实现 | `nc.impl.<模块>.<子模块>.<业务>.XxxServiceImpl` | `nc.impl.epmp.bgr.BgrReportSyncServiceImpl` |
   > | 注册 | `<模块>/META-INF/<xxx>.upm` 的 `<public><component>` | `epmp/META-INF/epmp_bgr_sync.upm` |
   >
   > ```xml
   > <?xml version="1.0" encoding='gb2312'?>
   > <module name="epmp">
   >   <public>
   >     <component priority="0" singleton="true" remote="true" tx="CMT" supportAlias="true">
   >       <interface>nc.itf.epmp.bgr.IBgrReportSyncService</interface>
   >       <implementation>nc.impl.epmp.bgr.BgrReportSyncServiceImpl</implementation>
   >     </component>
   >   </public>
   > </module>
   > ```
   >
   > Action 侧写 `NCLocator.getInstance().lookup(IBgrReportSyncService.class)`——**模块服务用 `NCLocator`**；产品 nccloud 的 pubitf 服务（如 `IDataCenterService`）才是 `ServiceLocator.find`，两套别混。
   >
   > **这一层的部署落点与 nccloud 层不同**（比只有 Action 时多一层）：接口 → `<HOME>/modules/<模块>/classes/<包路径>/`；实现 → `<HOME>/modules/<模块>/META-INF/classes/<包路径>/`；upm → `<HOME>/modules/<模块>/META-INF/`。**upm 只在启动时扫描，不重启不生效。**
   >
   > 拿不准就先读同项目既有客开怎么注册的：`<工程>/hawk_ic_sapply/META-INF/*.upm`、`<HOME>/modules/hawk/META-INF/hawk.upm`（接口在 `nc.itf.hawk`、实现在 `nc.impl.hawk`），照它的模块与包名规律走。一个模块目录下可以有多个 `.upm`（产品的 `modules/epmp/META-INF/` 下就有一堆），所以**新建自己的 upm 文件即可，不必改别人那份**。

2. **两个配置都要写，缺一个按钮都不算能用**（实测被使用者纠正过：当时只写了 action、漏了 authorize）。它们在同一个子模块目录下的两个子目录：

   **a) action 注册** —— `…/modules/<模块>/<子模块>/config/action/*.xml`，activity 名 → 类：

   ```xml
   <actions>
     <action>
       <name>bcs.hbexecute.updatetask</name>
       <label>改变任务状态</label>
       <clazz>nccloud.web.bcs.execute.action.UpdateTaskStatusAction</clazz>
     </action>
   </actions>
   ```

   **b) 授权** —— `…/modules/<模块>/<子模块>/config/authorize/*.xml`，把 activity 授权给哪些功能节点（appcode）：

   ```xml
   <authorizes>
     <authorize>
       <appcode>1886008000</appcode>
       <actions>
         <action>epm.bgr.reporta</action>
         <action>epm.bgr.reportb</action>
       </actions>
     </authorize>
   </authorizes>
   ```

   authorize 里的 `<action>` 引用的就是 action 注册里的 `<name>`；`<appcode>` 填调用该功能的节点编码（页面 funcode / 前端 URL 的 `c` 参数），客开图省事也常写 `*`（放开给所有功能）。产品在同一子模块下就是成对出现的：`config/action/ncc_tb_bgr.xml` + `config/authorize/ncc_authorize_bgr.xml`。

3. 前端按 `/nccloud/<模块>/<子模块>/<name 最后一段>.do` 调用（`bcs.hbexecute.updatetask` → `/nccloud/bcs/hbexecute/updatetask.do`）。`extend` 目录是客开扩展点，可随补丁走。

**模块 / 子模块段怎么选（最容易选错的一步）**

- 按**业务归属的产品模块**选，不按"哪个目录方便"，更不要借别的业务的客开命名空间。实测踩过：给集团报表加按钮，把类放进 `hawkerm`，而它实际是「华科 + 费用报销 erm」的客开命名空间——业务归属完全错位。
- 拿不准就查产品自己的同类 action 注册在哪个模块/子模块下：
  `hotwebs/nccloud/WEB-INF/extend/yyconfig/modules/<模块>/<子模块>/config/action/*.xml`，
  照它的模块段来（集团报表报送管理的产品 action 在 `modules/epm/bgr/...`，报送管理查询/催报在 `modules/epm/urgereport/...`）。
- **怎么找到那个路径（四步，别凭记忆编）**：
  1. 从前端页面拿 pagecode：页面 `constant` 里的 `PAGEID`，或工作台 URL 的 `c` / `n` 参数（集团报表报送管理 = `bgr_urgereport`，funcode `1886008000`，前端资源在 `/nccloud/resources/epmp/epm_p/reportManage/list/`）；
  2. 按 pagecode 在 HOME 里搜文件（`ncc_home_find`，或按文件名片段搜）——命中的
     `extend\yyconfig\modules\<模块>\<子模块>\config\ui\page\*.json`，**它的目录结构就是模块/子模块的答案**（实测命中 `modules\epm\bgr\config\ui\page\ncc_bgr_urgereport.json`）；
  3. 再用按钮 key / 产品类名等关键词搜 `config\action\*.xml`，读出来确认 `<name>` ↔ `<clazz>`（实测命中 `modules\epm\bgr\config\action\ncc_tb_bgr.xml` 与 `modules\bcs\hbexecute\config\action\hbexecute.xml`）；
  4. 交叉验证：模块段要和**前端既有的 URL** 对得上（页面里 `/nccloud/epm/urgereport/queryurgereporttaskdefaction.do` 印证了 `epm`）。单一证据不算数，至少两处互印。
- **前端页面的模块目录名 ≠ action 注册的模块段**：前端资源在 `/nccloud/resources/epmp/...`、部署模块是 `HOME/modules/epmp`，但 action 注册与 URL 用的模块段是 `epm`。以 yyconfig 里实际看到的为准。
- name 的三段与**包名、配置文件所在目录**互相独立（`bcs.hbexecute.updatetask` 的类在 `nccloud.web.bcs.execute.action`）。所以改模块段只需挪配置、改 name 与前端 URL，包名可照旧——除非项目另有客开包名前缀约定。

**部署才生效（工程里写完 ≠ 能用）** —— 实测（NCC1909）：

Git 工程里的代码和配置**不会自动生效**，必须三步：

1. **编译产物进 Home**：`<HOME>\hotwebs\nccloud\WEB-INF\classes\<包路径>\<类>.class`（环境里其它客开类也是 `.class` 与 `.java` 并存）；
2. **配置进 Home**：`<HOME>\hotwebs\nccloud\WEB-INF\extend\yyconfig\modules\<模块>\<子模块>\config\` 下的 `action\` 与 `authorize\` 两个子目录，与产品配置并列；
3. **重启**服务（类和配置都要重新加载）。

未部署时的症状就是点按钮提示「找不到活动名：`<模块>/<子模块>/<activity>` 所对应的处理类」——所以看到这句先别怀疑前端，它恰恰证明 URL 规则是对的。

> `<HOME>\external\classes\...` 下也有一份产品/客开类（`.java` + `.class`），但本次实测生效的落点是 `hotwebs\nccloud\WEB-INF\classes\`。不确定时以使用者实际部署的位置为准，或两处都放。

## 3. 验证（照这个顺序，别跳）

1. **界面上**：保存后应用注册列表里出现新按钮，字段与填写一致；
2. **服务端直查**（绕过前端缓存的可靠办法）：在页面上下文里

   ```js
   nc.ajax({ url: '/nccloud/platform/appregister/queryallbtns.do',
             data: { pagecode: '<pagecode>', appcode: '<appcode>' },
             method: 'post', success: r => console.log(r.data) });
   ```

   返回里没有 → 注册本身有问题（多半 APPID/pagecode 不对）；返回里有 → 问题在缓存，继续第 3 步；
3. **清元数据缓存**再刷新业务页面：

   ```js
   Object.keys(localStorage).filter(k => k.startsWith('appTempletStorage_'))
     .forEach(k => localStorage.removeItem(k));
   ```

4. **看前端拿到的是什么**：`props.button.getButtons()` 里该按钮的 `id` —— **20 位平台主键 = 注册下发**，自定义前缀（如 `HK…`）= 有人在代码里 push 的；
5. **点一次**：勾选一行让按钮启用，点下去看是否走到自己的事件方法（先弹提示验证链路，再换真实逻辑）。

## 4. 排查表

| 症状 | 先查 |
| --- | --- |
| 按钮完全不显示 | ① `queryallbtns.do` 有没有返回它 ② `BTNAREA` 是否等于前端 `createButtonApp` 的 area ③ 注册数据的 `DR=0`/`ISENABLE='Y'`（界面删过的会 `DR=1`） ④ localStorage 缓存 |
| 显示了但点了没反应 | 前端事件方法名与 `BTNCODE` 不一致，或方法没加在正确的按钮区组件上 |
| 点了报错 | 同上；看控制台是否 `this[EVENT_TABLE+id] is not a function` |
| 一直置灰 | 初始禁用列表里加了但勾选回调里没放开，或业务条件没命中 |
| 别的地方也有这个按钮 | 同 pagecode 多组 APPID，检查是不是挂到了页面实际使用的那一组 |
| 标题/顺序不对 | 改注册数据的 `BTNNAME`/`BTNORDER`（界面里编辑），不是改前端 |
| 点下去提示「找不到活动名：`<模块>/<子模块>/<action>` 所对应的处理类」 | 前端已经通了，是后端没注册/没部署：① 核对 action name 的模块段与前端 URL 是否一致 ② 类有没有编译进环境 ③ 配置 xml 放没放对目录 ④ 平台是否要重启或清 action 注册缓存。反过来，看到这句也说明 URL 规则本身是对的 |
| 后端类与 action 都放了，功能仍不可用（或提示无权限） | 大概率漏了 `config/authorize/*.xml`：action 注册只管"地址 → 类"，**授权才让这个 activity 在该功能节点下允许被调用**。对照同子模块产品的 authorize 文件，把 activity 与 `<appcode>` 补齐 |

## 5. 两个容易漏的收尾

1. **注册数据是环境数据**，前端补丁带不走：测试环境注册完，生产/其他环境要在界面上重做一遍。不要手写 SQL 插 `SM_APPBUTNREGISTER`（`PK_BTN` 由平台生成、`APPID` 各环境不同）。
2. **按钮权限**：界面新增只写 `SM_APPBUTNREGISTER`，`SM_BUTNREGISTER`（按钮基础注册，含 `ISBUTTONPOWER`/`RESID`）不会同步。如果这个按钮要**按角色授权**，得先确认按钮基础注册的维护入口，别急着交付。
