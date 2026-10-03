# 旗舰版元数据（批 1）：设计记录

> NCC 那一半的元数据索引写在 `yon-meta-index-plan.md` 与 `yon-home-design.md` 第十一节。
> 本文只讲**旗舰版/BIP**这条线，以及它为什么和 NCC 长得不一样。
> 所有 `file:line` 依据取自当前工作树。

## 一句话

旗舰版的元数据不在磁盘上，没法像 NCC 那样从安装目录里抽出一份索引来。这一批把它做成
**随包发布的快照 + 进程内解析**：两个工具、零构建步骤、零磁盘落盘，能离线回答实体 / 表名 /
字段 / 枚举名的问题，并且在答不了的地方（枚举取值）如实说答不了。

## 一、为什么这不是索引

NCC 的那一半**必须**是索引：3,600 个 `.bmf`、244.2 MB，按查询现扫是分钟级，所以先把整棵树
压平成一份按版本存的文件（`yon-home-design.md` 第十一节）。

旗舰版是反过来的问题。这一批随包的整个语料是 **8 份 payload、3.37 MB**，实测把 8 份全部解析完
**29 ms**。索引能买到的东西（避免重复解析）在这里一分钱都省不出来，所以：

| 索引会需要 | 这里 |
|---|---|
| 一个构建步骤 | 没有 —— 随包就是语料本身 |
| 磁盘上的一份索引文件 | 没有 —— 解析结果只活在进程内存里 |
| 保鲜 / 指纹比对 | 没有 —— 语料在进程运行期间不可能变 |
| 面板上的一个「去建索引」按钮 | 没有 |

`loadBipMetadata()`（`src/host/bip-meta.ts:301`）首次调用时解析，此后一直返回同一份；
唯一的失效入口是 `clearBipMetadataCache()（:314）`，而它只给测试用 —— 一个运行中的插件
没有任何办法让这份语料过期。

缓存**只对随包根生效**（`:302 if (cached !== undefined && root === BIP_META_ROOT) return cached`），
测试传自己的夹具目录时既不读也不写这份缓存。否则一个夹具会污染后续所有查询。

## 二、快照从哪来、租户为什么写在答案里

旗舰版元数据不在磁盘上，它在平台的 HTTP 接口后面（`queryByUri`、`searchByName` 等）。
所以它**不能**像 `.bmf` 那样从安装目录推导出来。这里的 8 份是抓取结果，抓自一个租户
（`nfkwaryp`），随包发布 —— 这正是这两个工具**可离线**回答的前提。

两条随之而来的事实，写进答案而不是藏起来：

- **租户是快照的事实，不是秘密。** 每个答案都带上它来自哪个租户，读到一个自定义字段时
  能知道是哪个环境定义的。`BipCorpus.tenant` 只在 8 份**一致**时才填（`:289`），不一致就留空 ——
  一个少数派的租户名会被读成"全部"。
- **只覆盖一部分实体，不是整套。** 工具描述里明说这一点。它答得出的是这 8 份快照里的东西。

### 快照放在 `resources/bip-meta/`，不在知识树里

这 8 份原先躺在 `resources/knowledge/bip/scripts/`，而 `resources/knowledge/` 正是
`knowledge_*` 走查的那棵树 —— 走查取**每一个** `.json`，没有排除清单
（`knowledge-tools.ts:87-90`）。后果实测如下（把走查逻辑原样复刻出来跑真实语料）：

| | 移动前 | 移动后 |
|---|---|---|
| 语料文档数 | 424 | 416 |
| 语料字节 | 6.16 MB | **2.80 MB** |
| 语料里的快照 | 8 | **0** |
| `自定义项` 的命中 | 12 条，其中 **7 条是裸 payload**，ncc 只有 1 条 | **9 条，0 条 payload，ncc 5 条** |
| `aa_boolean` / `write_off_status` | 4 / 3 条，全是 payload | **0 条**（归 `bip_meta_*` 管） |
| `采购入库单` 的命中 | 5 条（含 1 条 payload） | 4 条，全是真知识 |
| 单次搜索最坏读入 | 6.2 MB | 2.8 MB |

**1.9% 的文档占了 56% 的字节**，而 `knowledge_search` 会把每个命中文档整个读进内存
（`:257`）。一个像 `自定义项` 这样正常的业务词，12 个结果槽里有 7 个会被裸 JSON 占掉。

一处必须写下来的**反面**：普通词（`status`、`code`、`备注`）的命中里本来就没有快照 ——
快照在走查顺序里排在第 343 位，是 `bip/` 树的**末尾**，槽位预算在走到它之前就被前面的
`bip/` 文档用完了。所以别把这批改动说成"修好了普通词的污染"，它只修了**词本身出现在
payload 里**的那一类查询。（顺带记一笔：`ncc/` 在 `status`、`code`、`BIP` 这些查询下同样是
0 命中 —— 那是 `MAX_FILES = 12` 配 424 篇文档、且按走查顺序而非相关度排序的老问题，
与快照无关，本文档不处理。）

**只搬了 8 份 payload，没搬 `scripts/` 这个目录。** 理由是引用：
`skills/yonyou-bip-dev/SKILL.md:160` 那张表用相对知识根的路径指向
`bip/scripts/arthas_exec.py`（同表还有 `bip/references/…`、`bip/assets/mdf/`），而全仓只有
一份 `arthas_exec.py`，就在那个目录里；那段文字还会被内联进
`src/host/skill-catalog.generated.ts:1950` 给模型看。搬目录就打断这行指针。
`get_bip_token.py`、`baidu_check.py`、`clean_maven_remote.bat`、`fetch-yonby-article.ts`
留在原处 —— 它们是 `.py`/`.bat`/`.ts`，合起来 65 KB 量级，测不出来，不值得为它们动技能文档。

`tests/bip-meta.spec.ts` 里加了一条守卫，断言 `BIP_META_ROOT` **不在** `/knowledge/` 下 ——
搬回去会让这件事静默复发，正断言只是顺带。


## 三、列与子表的切分：不需要第二张表

BIP payload 里一个 attribute 什么时候是**列**、什么时候是**子表链接**？规则是：

> 给了 `columnName`（等价地 `fieldName`）的是列；没给的是子表。

这条规则不是猜的。实测：

- `fieldName` 与 `columnName` 在 **1,494 个 attribute 上从未分歧**，所以取哪个都行
  （`attributeOf()` `:157` 先取 `columnName` 再退 `fieldName`）。
- 在 `st_purinrecord.PurInRecord` 上，**没有 `columnName` 的 7 个 attribute，名字与它的
  `childAttributes` 完全一致**（paymentSchedules、paymentExeDetail、purInRecords、
  barcodeRecord、headItem、purinrecordExtend、defines），每个都在 `typeUri` 里带着子实体的 URI。

所以切分不需要猜、也不需要第二份列表：一个 attribute 自己就说了它是哪一种。
`tests/bip-meta.spec.ts` 里有一处断言把这条件当成设计中心来钉（读回真实快照，断言
无列属性名集合 == `childAttributes` 名集合）—— 这条规则要是哪天不成立了，那条用例先红。

子表的 `tableName` 在整份语料解析完之后再回填一次（`:282`），因为子实体可能在 corpus 里
也可能不在；不在时留空字符串，而不是编一个。这一步是唯一的跨实体工作，且它是一次查表，
不是第二个存储字段。

## 四、枚举只有名字，没有取值

payload 里的 `enumType` 是**名字**（`aa_boolean`、`st_writeOffStatus`、`st_purInType`），
不是 UUID —— 这是好事。但**枚举的取值集合根本不在 payload 里**。

所以 `kind=enum` 只能回答"哪些列用了这个枚举"，回答不了"这里的 `1` 是什么意思"。
工具描述和答案文本里都明说这一点（`bip-meta-tools.ts` 的描述 + `notesOf`）。返回一张编出来的
取值表，比返回"没有"更糟。

## 五、工具面：两个工具，不是一个 `product` 参数

新增 `bip_meta_find` / `bip_meta_detail`（`BIP_META_TOOL_NAMES`），而不是给现有的
`ncc_meta_*` 加一个 `product` 参数。

理由：这个插件文档里排名第一的风险就是**混产品线**。工具列表是模型最先看到、最不可能忘的地方，
把两条线在名字上分开，比在一个参数上分开更难误用。反方论据也存在 —— `ncc_home_*` 就是
一个 `ncc_` 前缀下同时管 NCC 和 BIP 的，且 `MetaHome.product`（`src/host/meta-service.ts`）
是一个现成但未被使用的接口 —— 但工具列表里的可见性赢了。

`kind` 的四类取值复用 `ncc_meta_*` 的同一组常量（`asQueryKind` / `META_QUERY_KINDS`），
所以两条线的查询面完全同构，只是背后的语料不同。

`src/index.ts` 里以 `ctx.effect(() => registerYonBipMetaTools(ctx), 'yon-panel: flagship metadata tools')`
挂载 —— 语料随包，工具不需要 service。

复用带来的一处泄漏，也在这一层挡掉：`kind` 由 `asQueryKind` 校验，而它是 **Home 模块**的
helper，抛的是 `HomeError`。真机验证时 `bip_meta_find {q:'status'}`（漏了 `kind`）报的就是
`HomeError` —— 错误码对，但一个旗舰版工具报 Home 的错误类，正是这个插件的头号风险里那类
跨产品线串味。`asBipKind()` 在边界上把类翻译过来（`bip-meta-tools.ts:42`），消息原样保留。
`tests/bip-meta-tools.spec.ts` 里有一条专门的用例钉住它。

## 六、随批清理

### 12 份失败的快照（已删）

抓取时失败的 payload 只有 139～162 字节，内容是平台报错而不是实体模型：

```json
{"code":"200","data":{"msg":"Does not exist in DB. uri: …, tenantId: nfkwaryp","resultCode":"500"}}
```

它们在知识库里是**可搜索的文本** —— `knowledge-tools.ts:90` 的知识走查索引
`\.(md|txt|sql|json|py|java|js)$`，`.json` 也在内 —— 所以留着不只是没用，是主动往检索结果里
掺噪声。删掉这 12 份，记在这里：

| 文件（已删） | 失败原因 |
|---|---|
| `metadata_pm_project_Project.json` | `Does not exist in DB. uri: pm.project.Project` |
| `metadata_pm_workHour.json` | `Does not exist in DB. uri: pm.workHour` |
| `metadata_pu_price_Price.json` | `Does not exist in DB. uri: pu.price.Price` |
| `metadata_pu_priceadjust_PriceAdjust.json` | `Does not exist in DB. uri: pu.priceadjust.PriceAdjust` |
| `metadata_pu_priceadjustment_PriceAdjustment.json` | `Does not exist in DB. uri: pu.priceadjustment.PriceAdjustment` |
| `metadata_scm_pm_PlanOrderVO.json` | `Does not exist in DB. uri: scm.pm.PlanOrderVO` |
| `metadata_st_saleoutrecord_SaleOutRecord.json` | `Does not exist in DB. uri: st.saleoutrecord.SaleOutRecord` |
| `metadata_st_salesoutrecord_SaleOutRecord.json` | `Does not exist in DB. uri: st.salesoutrecord.SaleOutRecord` |
| `metadata_st_salesoutrecord_SalesOutRecord.json` | `Does not exist in DB. uri: st.salesoutrecord.SalesOutRecord` |
| `metadata_ucfbasedoc_bd_billtype.json` | `Does not exist in DB. uri: ucfbasedoc.bd_billtype` |
| `metadata_ucfbasedoc_bd_billtypetree.json` | `Does not exist in DB. uri: ucfbasedoc.bd_billtypetree` |
| `metadata_ucfbasedoc_bd_billtypetreeref.json` | `Does not exist in DB. uri: ucfbasedoc.bd_billtypetreeref` |

租户一律是 `nfkwaryp` —— 抓的是同一个环境，所以失败是"这个 URI 在这个租户里没有"，
不是"接口不通"。想要这几个实体，得换一个真正定义了它们的租户再抓一次。

注意删除**是安全的**：解析器本来就是按结构而不是按文件名跳过失败 payload 的
（`payloadOf()` `:237`），一份被重新加回来的失败快照会变回 `skipped` 里的一项，
而不是变成一个名字叫 `undefined` 的实体。

### 2 个死桩（已删）

`resources/knowledge/bip/entity_mapping/{bip,ncc}_entities.json` —— 947 B / 2,249 B，
里面各 1 / 2 个实体，带一句 `generated_note: "请根据实际项目的元数据补充此文件…"`。
全仓没有任何代码引用它们（`grep -rn "entity_mapping\|bip_entities\|ncc_entities"` 无命中），
但它们和失败快照一样是可被搜索的文本。删掉。

## 七、提示词

`YON_PROMPT_TEXT` 加一条 `bip_meta_find / bip_meta_detail` 分组；原来那条元数据分组改写为
明确标注 **NCC**。计数 `二十三` → `二十七`，`九组` → `十组`。

`tests/prompt.spec.ts:36-41` 那条守卫要求每个注册的工具名在提示词里出现（或经它的
`family_*` 族名出现），而 family 是**读到第一个下划线为止**的，所以 `ncc_meta_find` 的
family 是没用的 `ncc_*` —— 这类工具必须在提示词里逐个点名。这正是当初抓到元数据分组
只写了 `ncc_meta_*` 的那条守卫。

## 八、不在这一批

- **枚举取值。** 语料里没有，得问平台。要做就得连环境，不在这批。
- **更多快照。** 目前 8 个实体，覆盖 `ustock`×5、`udinghuo`×1、`yuncai-upu-service`×1。
  要覆盖别的域就得再抓；抓取是这一个租户的一次快照，不是全量同步。
- **把快照接到 `wiki_*`。** 两边都可能描述同一个实体，合并语义没想清楚之前不做。

## 九、验收（这一批跑过的）

| 工序 | 结果 |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | 0 错 |
| `npx vitest run` | **386 passed**（30 个文件）—— 其中 `bip-meta.spec.ts` 21 条、`bip-meta-tools.spec.ts` 12 条 |
| `npx vitest run --config preview.config.ts` | 48 passed |
| `npm run build` | `lib/host/bip-meta.js` 16,993 B、`lib/host/bip-meta-tools.js` 19,287 B 进包 |
| `npm run verify` | `artifact ok — host ESM, client factory, externals, style injection, types, patch layer` |
| `npm pack --dry-run` | `resources/bip-meta/` 下 **8 份**进包；旧路径 `metadata_*` **0 份**；`entity_mapping` 已消失；`arthas_exec.py` 等 5 个脚本仍在 `resources/knowledge/bip/scripts/`（与 `SKILL.md:160` 一致） |

**产物级真机核对**（`%TEMP%` 里的一次性脚本，读的是 `lib/` 而不是 `src/`，跑完即弃）：8 个实体、
租户 `nfkwaryp`、`skipped: []`、1,457 列、37 个子表；`采购入库单` 命中 `st.purinrecord.PurInRecord`；
`vouchdate` 在三个主表里都命中并带出中文名「单据日期」；`st_writeOffStatus` 列出 3 个引用它的列；
`bip_meta_detail` 读回 135 列含主键 `id`、编号 `code`、7 个子表。**渲染出来的中文答案文本**逐条
看过 —— 这是模型真正读到的东西。

搬目录之后又跑了一遍同样的核对：`BIP_META_ROOT` = `…\resources\bip-meta\`，8 个实体、1,457 列、
租户不变，渲染文本一字不差 —— 这是唯一会静默坏掉的地方（路径改成对的了，但产物里没读到），
所以它必须在**产物**上再核一次，不能只看 `src/` 的测试绿。

一处交付前发现并修掉的缺陷记在 §五（`HomeError` 泄漏）。
