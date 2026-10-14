---
name: ncc-call-chain
description: 走查 NCC（NC Cloud）某个业务动作的调用链——从按钮名或后端 URL 定位入口 Action 类，用 cfr 逐层反编译跟到业务 Service 与真正落库的 INSERT，并指出客开该挂的事件钩子、写哪几张表。触发词：调用链、这个动作从哪进、保存调了什么、按钮对应哪个类、行为对应哪张表、保存写哪几张表、反编译、类在哪个 jar、客开钩子在哪、源码走查、规则链。**先读档案缓存**：`ncc/ncc-dev/references/scenarios/_call-chain-archive-index.md` 里已建好的实体档案是第一手；档案没覆盖或与实际不符才实测，实测完把新维度补回档案。**只负责走查与沉淀**；写事件监听器/插件见 `ncc-plugin-dev`，录 SPR 见 `ncc-spr-recording`，报错与元数据问题见 `ncc-dev`。旗舰版（BIP / YonBIP）是另一条产品线，用 `yonyou-bip-dev`。
---

# 走查 NCC 调用链

> 本技能管**怎么把一个业务动作从入口追到 SQL**，以及**怎么把追出来的东西沉淀成档案**。
> 录 SPR 见 `ncc-spr-recording`；报告怎么读见 `ncc/ncc-dev/references/scenarios/spr-log-analysis.md`。

## 一、先读档案，不要一上来就翻 jar

**同一个入口会被反复问不同维度**：今天问「保存调了哪个 service」，明天问「规则链在哪」，
后天问「写哪几张表」——入口那一段完全重复。所以：

1. 先读 **`ncc/ncc-dev/references/scenarios/_call-chain-archive-index.md`**（档案总索引）
2. 命中 → 读那份实体档案，**先按它答**
3. 档案没覆盖这个维度，或读到的代码/表与档案不符 → **才实测**
4. 实测完 → **把新维度补进档案，并更新索引**；**冲突时改档案，不要改事实**

**档案是"先验假设"，不是结论。** 每条结论都带依据（类、方法、行号、jar），怀疑时回去核。

## 二、入口在哪：按钮 → 类 是**静态 XML**，不在代码里

这是本技能最有价值的一条事实。nccloud 的 Action 类反编译出来通常只有：

```java
public class CustomerSaveAction implements ICommonAction { ... }
```

**没有 `@RequestMapping`、没有 URL 常量**——路由不在注解里。映射在配置 XML：

```
<HOME>/hotwebs/nccloud/WEB-INF/extend/yyconfig/modules/{模块}/{业务}/{子业务}/config/action/{X}.xml
```

```xml
<action>
  <name>uapbd.customer.saveCustomer</name>      <!-- 动作名：点换斜杠 → /nccloud/uapbd/customer/saveCustomer -->
  <label>客户信息卡片保存</label>                <!-- 中文按钮名：人话 ↔ 机器名的唯一桥梁 -->
  <clazz>nccloud.web.uapbd.customer.baseinfo.action.CustomerSaveAction</clazz>
</action>
```

**规模（NCC2505 实测）**：`config/action` 下 **2817 个 XML / 6.41 MB / 31401 条 action**（去重后）。

**索引已经建好了，别每次现扫 XML**：
`~/.dsh/yon-panel/knowledge/action_index_<version>.json`（NCC2505 那份 11.1 MB / 31401 条，
与 `class_index_<version>.json` 同目录同风格），用 **`scripts/query-action.js`** 查：

```powershell
$q = "C:\Users\99558\.dsh\yon-panel\scripts\query-action.js"
node $q --label 客户信息卡片保存            # 按中文按钮名（精确 label 优先，否则模糊）
node $q --class CustomerSaveAction          # 按类名
node $q --name uapbd.customer.saveCustomer  # 按动作名
node $q 客户 保存                            # 模糊：多关键词按 AND
node $q 客户 保存 --module uapbd             # 组合过滤（★ 重名时靠它定位）
node $q --stats                             # 索引概况（版本 / Home / 总数 / 模块分布）
node $q --versions                          # 有哪些版本的索引
```

**`label` 重名很常见（实测数据，必须记住）**：「打印」187 个、「查询」122 个、「保存」121 个、
「删除」119 个、「打印卡片」86 个；**含"保存"两个字的 label 共 2126 个 / 2635 条**。
所以查到之后**必须用模块、业务或定义文件确认是哪一个**——`--module` 就是干这个的。

> ⚠️ **覆盖率未验**：老 UAP 界面（`/app/...`、直接 servlet）不走 nccloud action 注册。
> 找不到时先确认是不是这种情况，**别下"这个按钮没有对应类"的结论**。

## 三、三档力度——先问清楚要哪一档

| 档 | 什么时候 | 做什么 | 产出 |
| --- | --- | --- | --- |
| **轻** | 只想知道"这个动作走哪个类" | 查 action 索引（`scripts/query-action.js`） | 类名 + 定义 XML |
| **中** | 想知道"写哪张表""挂在哪个钩子上" | 上一档 + 反编译 2~3 跳 + `ncc_meta_find` | 类名 + 表名 + 钩子 |
| **重** | 要完整链路 / 要改逻辑 / 要写档案 | 跟到 SQL（第五段），必要时录 SPR 校验 | 完整档案一节 |

**别默认做"重"**：多数提问用「中」就够。重档耗时且容易在无关分支上跑偏。

## 四、反编译模板（实测可用）

```powershell
$cfr = "E:\gitproject\dsh-plugin-yon-panel\resources\knowledge\ncc\cfr-0.152.jar"
$jar = "E:\NCProject\NCC2505\HOME_BYZY_BIP\modules\uapbd\META-INF\lib\uapbd_customer.jar"
$out = "$env:TEMP\ncdec"; New-Item -ItemType Directory -Force -Path $out | Out-Null
Push-Location $out
& E:\JDK17\bin\jar.exe xf $jar "nc/impl/bd/cust/baseinfo/CustBaseInfoServiceImpl.class"
& E:\JDK17\bin\java.exe -jar $cfr "nc/impl/bd/cust/baseinfo/CustBaseInfoServiceImpl.class" --comments false |
    Out-File "CustBaseInfoServiceImpl.java" -Encoding utf8
Pop-Location
```

**找类在哪**：`ncc_class_search("CustomerSaveAction")`（Home 的类索引，见 `knowledge_build_index`）。

**类太大时**：先 `javap -p <class>` 看方法列表 → 用 `Select-String -Pattern 'private.*methodName'` 定位行号
→ 再 `Get-Content -TotalCount N | Select-Object -Skip M` 切片读。

**优先级（用户明确强调的规律）**：客开代码有两个位置，**都要看**——
1. **代码工程**（如 `E:\NCProject\NCC2505\yon-byzy-2505-ncc`，有 git 的话就是 git 工程）——**加载优先级高于 Home**；
   但有的工程是空框架（实测：某工程 `src` 下只有一个 IDEA 模板类、`module.xml` 的 `<public>/<private>` 全空，
   这种就**不用去工程里找**，先确认它是不是空的）。
2. **Home 里的 `classes` 目录**（如 `modules/{模块}/classes/`）——**`.class` 优先级高于同名的 jar 内类**。
   反编译时若发现 `classes` 下有同名类，**先看它**，那才是实际生效的一份。

**cfr 的三个坑**：
- `--jarfilter` 过滤的是 **jar 文件名**，不是 jar 内的类，**对单个 jar 无效**
- **不支持目录输入**，必须 `jar xf` 解出 `.class` 再喂给它（保持包路径，它按路径推包名）
- 输出重定向到文件时用 `-Encoding utf8`，否则中文注释乱码

## 五、公共骨架（换单据只是最上面几跳不同）

NCC 走元数据映射的单据，「保存」最终都汇到同一条通道。**记住这五段，任何单据都能对号入座**：

| 段 | 内容 |
| --- | --- |
| ① nccloud 层 | `POST /nccloud/{模块}/{业务}/{动作}` → `nccloud.web.{模块}.{业务}.action.XxxAction#doAction` |
| ② 服务接口 | `nc.itf.{模块}...IXxxService#insertXxxVO` |
| ③ 业务实现 | `nc.impl.bd.xxx.XxxServiceImpl#insertXxxVO` → `saveXxx` → `insertWithAutoCode` → `insertVO`（**业务逻辑都在这**） |
| ④ MD 持久化 | `BDSingleBaseService` → `SingleBaseService#dbInsertVO` → `MDPersistenceUtil#insertVO` → `MDPersistenceServiceImp#saveBillWithRealDelete` → `MDBaseDAO#saveBill` → `VOPersister#saveVOS` |
| ⑤ JDBC | `BaseDAO#insertObjectWithPK` → `JdbcPersistenceManager#insert` → `SQLHelper.getInsertSQL` 拼出 INSERT |

**①~③ 每个单据不同，④~⑤ 完全相同。** 所以新单据只需挖前 3 跳。

**`insertVO` 十步里的两个客开钩子（唯一该挂的位置）**：

```java
fireBeforeInsertEvent(vo);   // BDCommonEventUtil(mdId).dispatchInsertBeforeEvent(new Object[]{vo})
...
String pk = dbInsertVO(vo);  // ★ 真正落库
...
fireAfterInsertEvent(vo);    // BDCommonEventUtil(mdId).dispatchInsertAfterEvent(new Object[]{vo})
```

**不要动** `VOPersister` / `MDPersistenceUtil` / `JdbcPersistenceManager`（平台公共通道，改了影响所有单据）；
业务实现类也要用扩展/替换，不要直接覆盖。

## 六、样板：客户档案保存

已建好的实体档案：**`ncc/ncc-dev/references/scenarios/客户档案保存调用链.md`**
（20 跳全链路 + 表落点 + 事件规则链 + 还没验的）。**要挖新单据，照它的格式写。**

## 七、建档前先读采集标准：`_call-chain-collection-standard.md`

**写档案（新建、补节、审查旧档案）之前，先读**
`ncc/ncc-dev/references/scenarios/_call-chain-collection-standard.md`——
它管的是**完整性**，和"怎么追链"是两件事：

- **必查清单 14 项 + 按需项**：每个实体逐项标注，不许留空
- **三态标注**：✅ 已覆盖（必带依据）/ ➖ 不适用（理由必须**可驳**）/ ⬜ 未覆盖（必带风险）
- **证据强度分级**：实测 / 反编译 / 推断——**推断不许写进「✅」**
- **完成表**：每份档案末尾必须有（本节第八段那种表），带统计行；统计行就是总索引里的「完整度」列
- **抽样复检**：每建 3~5 份档案随机抽一条回去核，抽到错的改档案并注明

**为什么非标不可**：`档案里没写"删除路径"` == 这个实体没有删除？还是我没去查？
**"确实没有"和"没去查"共用一个表现形式（什么都不写），就永远分不清。**
所以一句话记住：**不许省略，只许标注。**

**轻档建档是允许的**：完成表里 1~3 项 ✅、其余大片 ⬜ 也没关系，
**要防的不是"挖得少"，是"挖得少却不说"**。

## 八、还想到的几件事（有档案后再补）

- **横向的「规则链」与纵向的「调用链」是两个维度**：纵向走 `Action→Service→DAO`，
  横向走 `事件→监听器→规则`（详见 `ncc/ncc-dev/references/scenarios/ncc-event-and-rule-mechanism.md`）。
  一个实体档案要**按维度分节**，新维度来了加一节，不要重写整篇。
- **档案必须标版本**：`NCC2505` 与 `NCC1909` 的 `uapbd` 类名可能不同，不标版本跨环境就是错答。
- **行号会漂移**，**类名与调用顺序比行号稳定**；引用行号时带上 jar 版本。

## 九、还没验过的

- **action XML 的覆盖率**：`label → clazz` 这条路的准确率没有抽样验证过（31401 条里有多少是死配置、
  多少属于老界面）。**索引只保证"XML 里有这条"，不保证"这个按钮现在还能用"。**
- **`name` ↔ URL 的换算**只印证了一个样本（`uapbd.customer.saveCustomer` ↔ `/nccloud/uapbd/customer/saveCustomer`）
- **规则链是否真被触发**：`CustomerListener → CustomerInformRule` 是反编译读出来的链条，
  **运行证据（`pub_pluginitem` 里本环境有没有配置、录制时到底调没调）还没验**——
  本机 `datasource_list` 的 16 个连接里**没有能连 NCC2505 的**，这条查不了，要查得先登记 2505 的库
- **索引目前只有 2505 一个版本**：换 Home 要重扫一份 `action_index_<version>.json`（构建脚本见档案索引文档）
