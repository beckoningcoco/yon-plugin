# NCC 应用注册与页面按钮注册

> 适用：NCC nccloud 前端页面（hotwebs 脚手架）**新增或修改按钮**时。
> 一句话：**按钮先在「应用注册」里注册，前端只负责点击行为**。
> - 只改前端代码、不去注册 → 按钮可能"看起来出来了"，但它不在注册表里，进不了按钮权限/个性化；
> - 注册了、前端没写事件方法 → 按钮正常显示，**一点就报错**（点击按 key 分发）。
>
> 实测样本：NCC1909（首创环境）「集团报表报送管理」页，pagecode=`1886008000_list`，appcode=`1886008000`。

## 1. 按钮数据从哪来

```
「应用注册」界面（工作台 #/ar）
  ├─ 应用节点      SM_APPREGISTER
  ├─ 页面模板注册  PUB_PAGE_TEMPLET
  └─ 按钮注册      SM_APPBUTNREGISTER   ← 页面按钮的真正来源
         ↓  前端 createUIDom → POST /nccloud/platform/pub/mergerequest.do
             它把三个请求合并下发：
               /platform/templet/querypage.do           rqCode=template
               /platform/appregister/queryallbtns.do    rqCode=button   ← 按钮
               /platform/appregister/queryappcontext.do rqCode=context
         ↓  getTemplate() → setButton() → props.button.setButtons(button)
         ↓  createButtonApp({area:'epm-button-area'}) 渲染
         ↓  点击：onButtonClick(props, id) → this['mainTableEvent' + id]（id 即按钮 key）
```

`props.button.getButtons()` 拿到的按钮对象 ↔ 表列一一对应：

| 前端字段 | SM_APPBUTNREGISTER 列 |
| --- | --- |
| `id` | `PK_BTN` |
| `key` | `BTNCODE` |
| `title` | `BTNNAME` |
| `area` | `BTNAREA` |
| `btncolor` | `BTNCOLOR` |
| `type` | `BTNTYPE` |
| `order` | `BTNORDER` |
| `iskeyfunc` | `ISKEYFUNC` |

（`RESID`、`ISENABLE`、`DR`、`PAGECODE`、`APPID`、`PARENT_CODE`、`KEYBOARD`、`PAGEAREACODE`、`BTNDESC` 也在表里，界面不全部暴露。）

## 2. 两个必踩的坑

### 2.1 APPID —— 同一 pagecode 可能有多组注册

按钮注册是挂在 **APPID**（应用）上的。同一个 `PAGECODE` 在库里可以有多组、分属不同 APPID（产品给不同入口各注册了一套），**只有页面实际使用的那一组会被下发**。

判断当前生效的是哪一组：拿前端 `getButtons()` 返回的 `id`，去 `SM_APPBUTNREGISTER` 反查：

```sql
SELECT pk_btn, appid, pagecode, btncode, btnname, btnarea, btnorder
  FROM sm_appbutnregister
 WHERE pk_btn IN ('<getButtons() 里的 id>');
```

实测（1909 首创）：该 pagecode 有 3 组 APPID —— `0001Z…YF6`（CODE=1886008000「报送管理」，**当前生效**）、`1886008000400`（退回用）、`1886008000401`（新退回用）。用界面新增按钮时会自动挂到当前选中的页面所属 APPID，**不要手工写 SQL 硬编码 APPID**。

### 2.2 localStorage 元数据缓存 —— 注册完了看不见

`nc-lightapp-front` 把页面元数据缓存在浏览器 **localStorage**，key 形如：

```
appTempletStorage_<appcode>_<pagecode>_<内部id>_<语言>
例：appTempletStorage_1886008000_1886008000_list_1001E11000000097SVQ6_simpchn
```

命中缓存时前端不再请求服务端（或只带 `compareTs` 做时间戳比对），所以**新增的按钮看不到、改的标题不生效**。清掉再刷新即可：

```js
Object.keys(localStorage)
  .filter(k => k.startsWith('appTempletStorage_'))
  .forEach(k => localStorage.removeItem(k));
```

**怀疑注册没生效时，先绕过前端直接问服务端**（能区分"没注册成功"和"只是缓存"）：

```js
// 在页面上下文里（nc-lightapp-front 的 ajax）
nc.ajax({
  url: '/nccloud/platform/appregister/queryallbtns.do',
  data: { pagecode: '1886008000_list', appcode: '1886008000' },
  method: 'post',
  success: r => console.log(r.data)   // 返回的每个按钮都带 id/key/title/area/order
});
```

返回里有它 → 注册成功，问题在缓存；返回里没有 → 注册本身有问题（多半是 APPID/pagecode 不对）。

## 3. 新增一个按钮的完整步骤（以列表页为例）

1. **注册**：应用注册 → 左树选中目标页面 → 「按钮注册」页签 → 「增行」→ 填写
   - 按钮编码 `BTNCODE`（**英文，且要与前端事件方法名一致**，如 `ReportA`）
   - 按钮名称 `BTNNAME`（界面显示文字）
   - 按钮类型 = 常规按钮（`general_btn`）、按钮颜色 = 次要按钮（`button_secondary`）
   - 按钮区域 `BTNAREA`（列表页常见 `epm-button-area`；表格行内按钮常见 `dimPropsTable`）
   - 按钮功能描述 `BTNDESC`（如"报送管理-上报A"）
   - 父按钮编码 / 快捷键 / 页面区域编码留空即可
   - 保存 → 提示"操作成功"（后端 `platform.appregister.insertbutton` → `AddAppButtonAction`）
2. **前端事件**：在按钮区组件里加 `[EVENT_TABLE + 'ReportA']` 与 `[EVENT_DETAIL + 'ReportA']` 两个方法（列表页签/详情页签各一个），否则点击报错；
3. **启用规则**：把新 key 加进初始禁用列表（`setButtonDisabled([...], true)`）与勾选回调里的启用判断，否则按钮状态与其它按钮不一致；
4. **清缓存 + 刷新验证**（见 2.2）；
5. **需要调后端**时：写 Action 类，并在 `hotwebs/nccloud/WEB-INF/extend/yyconfig/modules/<模块>/<子模块>/config/action/*.xml` 里注册（该 `extend` 目录是客开扩展点，可随补丁走）。

## 4. 注册数据是环境数据，不在前端补丁里

`SM_APPBUTNREGISTER` 的写入发生在**目标环境的数据库**，前端补丁包带不走。换环境（测试→生产）要按第 3 步在界面上重做一遍。

若确实要用脚本，`APPID` 必须从同页面既有按钮反查，`PK_BTN` 交给平台生成（界面保存），**不要手写 20 位主键**。

## 5. 与"前端硬加按钮"的区别

在 `setButtons(buttons)` 之前往数组里 push 一个同结构对象，按钮**也会渲染出来**（渲染只认这份数组），点击也能通（只要事件方法在）。差别是：

| | 走注册 | 前端 push |
| --- | --- | --- |
| 数据在哪 | 数据库 | 前端代码 |
| 应用注册界面 | 可见可改 | 不可见 |
| 按钮权限 / 个性化 | 受管控 | 绕过（权限过滤在下发前完成，push 发生在之后） |
| 换环境 | 要重做注册 | 补丁自带 |

排查"按钮到底哪来的"最直接的办法：看 `getButtons()` 里它的 `id` —— 是 20 位平台主键就是注册下发的，是自定义前缀（如 `HK…`）就是前端造的。
