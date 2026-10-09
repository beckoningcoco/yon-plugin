# NCC 前端脚手架 · 本工程二开现状

> **什么时候读我**：准备改某个标准页面之前。这份清单列出**已经确认被客户改过的地方**——
> 读标准源码时先看一眼，避免把"客户改动"当成"平台行为"照抄，也避免升级时被覆盖。

**工程**：`E:\NCProject\NCC2005\touziwuye\hotwebs`（客户代号 `tzwy`，疑为"投资物业"）

---

## 一、客户自建领域 `src/jytzwy/**`

**整个领域都是新加的**，不属于标准产品。它不是手写的，而是 NCC 开发工具「页面生成」的产物——
页面文件头部注释写着：

```
/**
 * 税收分类节点
 * @author 代码生成工具
 * @version NCC2005
 */
```

内容：

| 子模块 | 说明 |
| --- | --- |
| `jytzwy/taxclass/taxclass/main/` | 税收分类（单表增删改查，954 行，含官方教学注释） |
| `jytzwy/migrate/migrate/main/` | 结转/迁移 |
| `jytzwy/gatherdetails/gatherdetails/main/` | 汇总明细（含 `receiptModel/` 子弹窗） |
| `jytzwy/bankrule/bankrulevo/main/` | 银行（对账）规则 |
| `jytzwy/refer/*/` | 各实体的参照页（`*DefaultGridRef`） |
| `jytzwy/commom/` | 本地公共组件（CheckTable / PageJump / utils） |
| `jytzwy/public/lang/standard/simpchn/*.json` | 多语占位文件（内容是空 `{}`，实际由后端下发） |

后端接口全部落在 `/nccloud/jytzwy/{模块}/{Action}.do`。

**这个领域是理解"从零做一个 NCC 节点"的最好样本**：目录结构、`Utils.loadNCCResource`、
`createPage({initTemplate, billinfo, mutiLangCode})`、`ReactDOM.render(<Page/>, '#app')` 都是标准套路。

## 二、标准领域下新增的客户节点

### `src/cmp/bank/bankcontrast_tzwy/`（后缀 `_tzwy`）

在标准 `cmp/bank` 下另起一个节点，做「银行对账单 ↔ 公司收款明细」的**双向勾对**：

```
main/index.js     RenderRouter(routes, 'app')
main/router.js    '/' 和 '/list' 都指向 List
list/index.js     536 行，含 bank / corp 两侧表格、快速对账、自动对账、取消对账、对照/取消对照
list/events/      commom · main · search · quick · auto · cancel · compare · save（8 个文件）
```

后端接口：`/nccloud/cmp/tzwybankcontrast/query.do`、`.../{compare,cancelcontrast,autocontrast,...}.do`。

> **它也是 `config.json` 的 `buildEntryPath` 当前唯一指向的页面**。

## 三、标准源码已被直接改动的地方（3 处确认）

这是**风险最高的一类改动**：升级 NCC 版本时会被标准产品覆盖。

### 3.1 `list/index.js:537` —— 恒真三元表达式硬塞按钮

```js
{this.moduleId = '2052' ? (
    <div>
        <NCButton fieldid="sign" onClick={() => this.provisionBtnClick(this, 'provision')}>计提</NCButton>
        <NCButton fieldid="sign" onClick={() => this.provisionBtnClick(this, 'cancel')}>取消计提</NCButton>
    </div>
) : null}
```

`this.moduleId = '2052'` 是**赋值表达式**，永远为真 → 两个按钮永远显示。
（本意大概是 `this.moduleId == '2052'`，写成了赋值。）

### 3.2 `list/events/buttonClick.js:45` 与 `list/events/tableButtonClick.js:13` —— 客户业务判断写死在标准逻辑里

```js
let item = delObjs.find(v => v.pk_tradetype == 'D0' && (v.billmaker == '久其' || v.billmaker == '计费'));
if (item) { toast({ content: "存在数据为业务系统推送或已计提不允许删除！" }); return; }
```

判断依据是**制单人**（`billmaker`）等于"久其"/"计费"，且**中文没有走多语**——
与周围 `this.state.json[...]` 的写法明显不是一批，是后来加的。

### 3.3 标准页面调用客户接口

| 文件 | 调用的客户接口 |
| --- | --- |
| `arap/receivablebill/recbill/list/provisionModel/index.js:45` | `/nccloud/jytzwy/migrate/MigrationAccrualAction.do` |
| `arap/receivablebill/recbill/list/provisionModel/index.js:70` | `/nccloud/jytzwy/migrate/MigrationDelAction.do` |
| `arap/receivablebill/recbill_sd/list/provisionModel/index.js:64` | `/nccloud/jytzwy/migrate/CarryForwardAction.do` |
| `arap/receivablebill/recbill_sd/list/provisionModel/index.js:89` | `/nccloud/jytzwy/migrate/CarryForwardDelAction.do` |

### 3.4 存疑，未确认

`recbill` 与 `recbill_sd` 是**两个平行副本**（后者疑为标准产品的另一种形态，也可能本身就是产品自带的）。
**是否"改了标准源码"，需要跟一份干净的 NCC2005 前端源码做逐文件比对才能定论**——
目前手里没有干净副本，只能列为存疑。

## 四、升级/维护时的注意事项

1. **凡是本文列出的位置，升级前先做差异比对**，否则客户的改动会被静默覆盖；
2. 更稳妥的做法是走 `extendBuildEntryPath`（二开扩展入口，会改写成 `NCCExtend/extend_领域/...`）
   另起节点，而不是改标准文件；
3. **`config.json` 的 `buildEntryPath` 是本地调试用的临时收窄**，上线前必须改回全量或改成要发布的页面集合；
4. 本工程**没有任何 git 元数据**（只有 `.gitignore`），改动无法通过版本控制回溯——
   手工维护一份改动清单（即本文）是必要的。

## 五、还没读的部分（后续可补充）

- `card/` 侧的 `initTemplate.js` / `buttonClick.js` / `transferButtonClick.js`（与列表侧的差异）
- `transfer/` 转单页三件套：`btnClick/searchBtnClick.js`、`init/initTemplate.js`、`initTemplateFull.js`
- `verificationsheet/verifyap` 核销单（含自定义表格组件，比单据页复杂一个量级）
- `widget/` 小部件（用 `export default` 而非 `ReactDOM.render`，写法与普通页面不同）
- `arap/accountquery/**` 大量报表组件
