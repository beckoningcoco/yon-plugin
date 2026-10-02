# 元数据索引（批 A）：可执行方案

> 设计理由在 `yon-home-design.md` 第十一节；本文只写**做什么、改哪里**。
> 所有 `file:line` 依据取自当前工作树。**批 A 不写 Home，只读。**

## 范围

把 `modules/*/METADATA/*.bmf` 变成一份按**版本**存、可按**名字反查**的索引，并给模型两个工具、
给面板一个建索引入口。四层：L0 指纹 / L1 身份 / L1.5 字段名 / L1.6 枚举项；L2（字段全属性）
不存，命中后现读那一个文件。

不做：bpf/rest/upm（批 B）、与类索引缝合（批 C）、镜像到技能侧（批 B 再说）、写 Home（不做）。

## 落地文件

| 文件 | 作用 |
|---|---|
| `src/host/meta-bmf.ts`（新） | bmf 解析器：标签正则 + 逐条容错规则 |
| `src/host/meta-index.ts`（新） | 索引文件：类型、路径、读写、指纹比对、增量重建 |
| `src/host/meta-service.ts`（新） | `list/status/build/query/detail`，错误码复用 `HomeError` |
| `src/host/meta-tools.ts`（新） | `ncc_meta_find` / `ncc_meta_detail` + `META_TOOL_NAMES` |
| `src/shared/types.ts` | 加 wire 类型（Home 段在 `:251`） |
| `src/host/http.ts` | `handleHomes` 加两条 tail 路由 |
| `src/host/home-service.ts` | `viewOf` 顺带挂元数据索引状态 |
| `src/client/home/HomeManager.tsx` | 类索引那块旁边加「元数据索引」块 |
| `src/client/locales.ts` | zh（`:299-378`）+ en（`:669-747`）两组词条 |
| `src/host/prompt.ts` | 新增一组，`九组` 计数跟着改 |

## 1. 解析器 `meta-bmf.ts`

规则全部来自 `scripts/_tmp-bmf-scan*.mjs` 与 `_tmp-layers.mjs` 的实测，**逐条写进注释**：

```ts
const ATTR = /([A-Za-z][A-Za-z0-9_]*)="([^"]*)"/g
const TAG = /<(entity|attribute|Enumerate|enumitem|Reference|dependfile|busiitfconnection|busimap)(?:\s[^>]*)?\/?>/g
```

四条必须写在代码里的规则（不是实现细节，是判据）：

1. **不用 XML DOM。** 253 MB、一行一元素；正则即可。
2. **一个文件多个 `<entity>` 是正常的**（实测 1 222 / 3 819 个文件如此），解析结果以
   entity 为单位返回，不是以文件为单位。
3. **`moduleName` 属性不可用**（实测：某文件 `moduleName="uap"` 而实际在 `modules/riawf`）。
   文件归属只从路径推。
4. **`<Reference mdFilePath>` 的解析规则要写死并断言**：去掉前导分隔符 → 先按原值在
   `modules/*/METADATA/` 后缀索引里查 → 命中唯一才用 → 否则去掉第一段再查 → 再否则按
   basename 唯一匹配 → 都不中记 `unresolved`。**同一条规则换一种容错，「找不到」可以从 61
   变成 7**（实测），所以容错策略必须是代码里的常量而不是实现者的临场判断。

## 2. 索引文件 `meta-index.ts`

路径复用类索引的目录与命名法（`class-index.ts:68-75`）：

- `metaIndexDir()` → `classIndexDir()`，即 `~/.dsh/yon-panel/knowledge`
- `metaIndexPath(version)` → `meta_index_<version 安全化>.json`（`[^A-Za-z0-9_-] → _`）

落盘形状：

```jsonc
{
  "version": "2111",
  "builtAt": "…",
  "sourceHomes": ["E:/NCProject/…/home"],   // 建/增量时读过的 Home，可多个
  "counts": { "files": 3819, "entities": 5831, "enums": 3170, "fields": 224339, "enumItems": 13204 },
  // L0：相对路径 -> "mtime:size"（不是绝对路径，见下）
  "fingerprint": { "modules/erm/METADATA/ermbilltype.bmf": "1728394830000:62822", "…": "…" },
  // L1 + L1.5：name -> 数组（重名全留，顺序固定）
  "entities": {
    "ermbilltype": [{
      "displayName": "报销单据类型", "tableName": "er_djlx",
      "fullClassName": "nc.vo.er.djlx.DjLXVO",     // 不能省：批 C 靠它接类索引
      "module": "erm", "file": "modules/erm/METADATA/ermbilltype.bmf",
      "fields": ["pk_djlx|单据类型主键", "djlxbm|单据类型编码", "…"]   // 名字|中文名
    }]
  },
  "enums": { "…": [{ "displayName": "…", "fullClassName": "…", "file": "…", "items": [["1","待审批"]] }] }
}
```

写盘照 `writeClassIndex`（`class-index.ts:209`）的做法：`mkdir` 后 `JSON.stringify` 不缩进。
读头照 `listClassIndexes`（`:257`，只解析必要字段、按新→旧排序）。

**体积下界约 5.6 MB**（指纹 0.44 + L1 1.40 + L1.5 3.64 + L1.6 0.16，全部按权威树口径）。
中文按 JS 字符数算，UTF-8 下占 3 字节，所以这是下界。

**实测落盘 8 738 903 字节（8.33 MiB）**（机械院 2111，`~/.dsh/yon-panel/knowledge/meta_index_2111.json`）。
比下界高 1.5× 的部分是 JSON 的键名与转义——`filename`/`displayName`/`tableName`/`fullClassName`
每个实体各一次、`名字|中文名` 每条字段一对，而每个键名都是一遍 5 573 或 217 140 次。
不缩进的 `JSON.stringify`（`class-index.ts:209` 同款）已经是能省的那部分。

### 字段中文名：已量，用按实体存（原计划的全局表被否掉）

批 A 的第一个动作已经做了（`scripts/_tmp-fieldlabels.mjs`），**结论推翻了原计划的「1:1」前提**：

| 事实 | 值 |
|---|---|
| 不同字段名 | **36 350**（217 140 是出现次数） |
| 有 >1 个中文名的字段名 | 7 645（**21.03%**） |
| 这些名字覆盖的属性出现 | 163 665（**75.37%**） |

全局表（0.73 MB）会让「按『授权人』反查」查不到——`creator` 的主要中文名是「创建人」，
「授权人」只占 8 次。**决定：按实体存 `名字\|中文名` 对（3.64 MB）**，比「名字 + 全局表」
多 0.74 MB，换正确性。

### 反查不建倒排

`fields` 是正排。反查时在内存里扫一遍（22 万条，毫秒级），**倒排是派生的、不落盘**。

## 3. 指纹与增量

两条独立的路，都要有：

- **状态查询**（每次 `ncc_meta_find`/`detail` 前，或面板打开时）：
  走 `modules/*/METADATA`（实测 163 / 167 / 172 ms）+ re-stat 已知文件（实测 466 / 483 ms）
  ≈ **0.61 s**，与 `fingerprint` 逐条比对，得出 `fresh | stale(changed/added/removed)`。
- **全量重建 ≈3.3 s**（走查 163 ms + 解析 3 131 ms，实测 78 MB/s）。
  **注意这个数**：早先记的 33.5 s 是把「走整棵 Home」（30～42 s）算进去了，而权威树只占
  96.5% 的字节却不含那棵大树。所以增量重建是**省 2.7 秒的优化，不是可行性的前提**——
  面板上的「重建」按钮即便每次都全量，也只有 3.3 秒。
- **增量重建**：只重解析 changed/added，按 `entity.file` 反查剔除 removed 的实体后合并。

**验收实测（机械院 2111，走面板那条路：`startBuild` → 轮询 → `status(fresh=true)`）**：
冷建 **4 302 ms**，改一个文件后重建 **835 ms**，把文件改回后再建 **821 ms**。
两个增量数都是「走查 3 600 个 + 重解析 1 个 + 重写 8.7 MB」，与 3.3 s / 4.3 s 的差对得上；
面板上的按钮因此是 0.8 秒的动作，不是 4 秒。

**指纹按相对路径存，这是「按版本复用」能成立的前提。** 按绝对路径存，换一个 Home 就全对不上，
等于没有指纹。两个会打破「同版本 = 同内容」的例外（`update/*/patch_*` 补丁副本、客开 bmf）
正好被这一条吃掉：切到同版本的另一个 Home，0.65 s 校一遍，差异文件增量重解析即可。

## 4. 服务 `meta-service.ts`

```
list()                        -> 各版本的索引摘要（对应 listClassIndexes）
status(homeId)                -> { indexed, builtAt, counts, bytes, freshness }
build(homeId, onProgress?)    -> 全量或增量重建；进度 {files, parsed, total}
query(homeId, kind, q, limit) -> kind ∈ entity | field
detail(homeId, entity, file?) -> 现读那个 bmf，返回该实体全字段属性
```

- 并发：与 `home-service.ts:142` 的队列同款，**同一版本同时只能有一次构建**。
- 错误：复用 `HomeError`（`home-files.ts:83`，码只有 `not-found | invalid-input`）。
- **重名**：`query` 返回数组，顺序固定为「排除补丁副本 → 按 module 名排序」。
  `detail` 遇到重名且没给 `file` 时，**返回候选列表而不是随便取一个**。

## 5. 工具 `meta-tools.ts`

照 `home-tools.ts` 的形状（`defineTool` 在 `:55`，注册器 `:169`，输出 schema `:124/:134/:146`）：

```ts
export const META_TOOL_NAMES = ['ncc_meta_find', 'ncc_meta_detail'] as const
```

| 工具 | 参数 | 说明 |
|---|---|---|
| `ncc_meta_find` | `home`, `kind`, `q`, `limit?` | `kind` 只有 `entity`（匹配 name/中文名/tableName/fullClassName）与 `field`（**反查**含该字段或该中文名的实体） |
| `ncc_meta_detail` | `home`, `entity`, `file?` | 现读原文件，返回字段全属性 |

工具描述里必须写死三句（否则模型会误用）：

> `home` 用 `ncc_home_list` 返回的 id，不是路径。**同名实体（如 `psndoc` 在 3 个模块里各有一份）会全部返回**，
> 请按 `module`/`file` 判断该用哪一个；拿不准就问使用者。**反查只有这两种**（实体名、字段名/字段中文名），
> 没有通用查询。

**「几份」是文件数，不是记录数。** 索引里一条记录的「第二个拼写」是定义它的文件名
（`StoredEntity.filename`），所以问 `psndoc` 会命中**在 `psndoc.bmf` 里定义的每一个实体**。
实测（机械院 2111）：34 条记录落在 2 个别的文件后面——`modules/hrhi/METADATA/psndoc/psndoc.bmf`
一个文件就贡献 31 条。按记录数报会说出「在 34 个文件里都有定义」并把同一个路径印 31 遍，
那是错的，也是模型据以选择的那段话。所以服务先按文件归并（附上每个文件里的表名），
计数、清单、`others` 三处都走同一个归并结果（`meta-service.ts` `detail`）。
「只有一个文件」也因此按文件判——一个文件里有两个同名候选不是选择题，那里没有歧义。

## 6. HTTP（`http.ts`）

`handleHomes`（`:280`）加两条 tail，派发点同 `:322-330`：

| 路由 | 语义 |
|---|---|
| `GET /yon/api/homes/<id>/meta-index` | 状态（`status()`） |
| `POST /yon/api/homes/<id>/meta-index` | 起构（`build()`），**立即返回**，进度靠 GET 轮询 |

错误映射已在 `:825-837`（`HomeError` → 404/400），无需改动。

## 7. 面板（`HomeManager.tsx`）

类索引那块（`:717-726`）旁边加同形状的一块「元数据索引」：版本、来源 Home、建成时间、
五类计数、体积、**新鲜度**（指纹比对的结论）；带「建立 / 重建」按钮与进度。

`load`/`act`（`:229`、`:254`）复用现有包装，不新造状态机。轮询走 `act` 之外的一支
（构建是长动作，不能被 `busy` 卡住整个面板）。

新词条加在 `locales.ts` 的 zh `:299-378` / en `:669-747` 两处，键名沿用 `<area>.<thing>`
（如 `meta.title`、`meta.none`、`meta.stale`、`meta.build`）。

## 8. 提示词（`prompt.ts`）

`:100-107` 是能力组清单，`:99` 写着「能力分八组：」——**那段文字自己写着「组数是写下来的，
对不上要看得见」**，所以加组必须同步改计数（八 → 九）。

新增一组：

> · `ncc_meta_*` —— NCC 安装目录里的元数据索引（实体/表名/VO/字段/枚举）。想知道「某个中文名
> 对应的表」「哪些表有这个字段」先查它，不要 `ncc_home_find` 去翻 `.bmf`。

**落地时改了一个字**：那一组在正文里写的是 **`ncc_meta_find / ncc_meta_detail`**，不是
`ncc_meta_*`。原因是 `tests/prompt.spec.ts` 那道「每个工具都要在提示词里出现」的守卫**认不了
`ncc_*_*` 这种三段名**——它的 family 取到第一个下划线为止，`ncc_meta_find` 的 family 算出来是
`ncc_*`。所以按 `ncc_meta_*` 写，守卫查不到名字、整个 metadata 组等于隐身，而**守卫当时也没
覆盖这两个 family**（那份手写清单漏了 `HOME_TOOL_NAMES`/`META_TOOL_NAMES`，已补）。补全后
守卫立刻报 `['ncc_meta_find','ncc_meta_detail']` 未记账——这正是它该做的。正文因此照
`ncc_class_search`、`ncc_home_find / ncc_home_read` 的写法点名，而不是放宽守卫。
`ncc_home_list` 的输出里同一句话也点了名（`home-tools.ts`）。

## 9. 测试

| 文件 | 覆盖 |
|---|---|
| `tests/meta-bmf.spec.ts`（新） | 夹具树里手写一个多 entity 的 bmf：一个文件多实体、重名实体、枚举项、空 `mdFilePath`、GBK 与 UTF-8 各一、引用解析的每条容错分支 |
| `tests/meta-index.spec.ts`（新） | 指纹比对（改一个文件只报一个 changed）、增量重建后计数正确、相对路径键跨 Home、重名返回数组且顺序稳定 |
| `tests/meta-tools.spec.ts`（新） | 照 `home-tools.spec.ts:98-152` 的 `bench()`：假 Home 树 + 假注册表 + `Context`；断言越界、`limit` 截断、重名提示、`kind` 闭集 |
| `tests/home-service.spec.ts` | 加一条：`viewOf` 挂了元数据索引状态（用 `:41-48` 的 `bench()`） |

**测试绝不写操作者的真实目录**：索引写进 `mkdtemp` 的临时目录，不碰 `~/.dsh`，
也不碰 `~/.claude/skills`（批 A 不镜像技能侧，天然满足）。

预览：`preview/fixtures/homes.ts` 加一份带元数据索引的 Home；`render.spec.tsx` 的
`PANELS` 里 home 那条（`:832-836`）不动。**实际加了四个状态用例**（fresh / stale / 无索引 /
建造中），共 48 个预览用例。

单测另加两个文件（都不碰操作者目录）：

- `tests/meta-service.spec.ts` —— 服务此前**没有**任何 spec，本轮真机跑出来的那个
  「按记录数报」的缺陷因此没人挡。三例：按文件计数与清单、`others` 只列别的文件、单文件不算选择题。
- `tests/home-manager.client.spec.tsx` —— 面板的渲染循环守卫（见 §12）。

另修一处**已有**守卫的漏：`tests/prompt.spec.ts` 的「每个注册的工具都要在提示词里出现」
用的是一份手写工具清单，漏了 `HOME_TOOL_NAMES` 与 `META_TOOL_NAMES`。补全后它立刻报
`ncc_meta_find`/`ncc_meta_detail` 未记账（原因见 §7），正文点名为准。

## 10. 验收（顺序不能省）

1. `npx tsc -p tsconfig.json`、`npx vitest run`、`npx vitest run --config preview.config.ts`
2. `npm run build` —— **tsc/vitest/预览出图都不产出可运行产物**
3. `npm run verify`
4. `node preview/shots.mjs home` 出图，肉眼过
5. 从 `lib/client.js` 里抠 CSS/词条，确认新增声明真进了产物
6. **真机一次**（机械院 2111）：建索引，量**时间与体积**；把 `counts` 与 `yon-home-design.md`
   第十二节的**权威树**口径逐项对（实体 5 573 / 枚举 2 947 / 字段 217 140 / 枚举项 11 916），
   建索引耗时应对得上 ~3.3 秒而不是 33 秒
7. 改一个 `.bmf`（改完记得改回），确认状态查询报 `stale(1)`、增量重建只重解析那一个
8. 端到端：让模型 `ncc_meta_find(kind=field, q=<某字段>)` 反查，再 `ncc_meta_detail` 取属性，
   核对字段类型与长度和文件里一致；`psndoc` 必须返回 4 条

**实跑结果（2026-10-02，机械院 2111）**：

| 步 | 期望 | 实测 |
|---|---|---|
| 6 | 四项计数与权威树一致 | **全部一致**：5 573 / 2 947 / 217 140 / 11 916，`files` 3 600 |
| 6 | 耗时对得上 3.3 s | **4 302 ms**（含 8.7 MB 落盘与 50 ms 轮询粒度）；体积 **8 738 903 字节** |
| 6 | `freshness` | `fresh`，`sourceHomes` 一行 |
| 7 | `stale(1)` | `{changed:1, added:0, removed:0}` |
| 7 | 只重解析那一个 | `parsed:1, total:1, files:3600`，`counts` 与冷建逐项相等，**835 ms** |
| 8 | 字段属性与文件一致 | `pk_psndoc` → `char(20)` `UFID` `isKey=true`，与文件里 `<attribute>` 逐属性一致；`pk_org` 的 `dbtype=""` `typeName=org` 也是文件里的原样 |
| 8 | `psndoc` 返回 4 条 | **改成 3 个文件**——原计划的「4 条」是把记录数当文件数了，见 §5；`entity` 查询的 10 条命中里 `psndoc` 这个名字只有 2 条，另 3 个文件是「在 `psndoc.bmf` 里定义」而命中的 |

第 7 步的收尾值得记一笔：**「改回」要把时间戳也改回，而这不够**。文件字节可以复原到
sha256 一致、`mtimeMs delta 0`（`utimes` 精确复原，NTFS 的亚毫秒位这次也没丢），但索引的
指纹是**上一次增量重建写下的那一份**，它记的是**改过之后**的 92 667 字节。所以「恢复文件」
之后再查状态仍报 `stale(1)`——不是恢复失败，是指纹停在编辑后的那次重建上。
再建一次（**821 ms**，同样 `total:1`）就一致了，`checkFreshness` 直连也报 `fresh`。
真机上「改回」的完整动作因此是三步：写回字节 → `utimes` 写回时间 → 再建一次索引。

## 11. 砍这一批的第一刀

`<Reference>` 解析与 UUID 依赖边（`dependfile`、`busiitfconnection`）**不是**上面四层的必需品。

- 依赖边只在**建索引时**需要完整的 cell id 空间（256 152 个）驻留内存来做解析；
  **落盘的是解析后的名字边，不落 UUID**——否则光 UUID 就是 9 MB，直接顶穿体积预算。
- 若批 A 想更小，先把这一项整体推到批 B。**它是这条线里唯一可以整块摘掉的部分。**

## 12. 收尾

`scripts/_tmp-census.mjs`、`_tmp-jars.mjs`、`_tmp-bmf-scan.mjs`、`_tmp-bmf-scan2.mjs`、
`_tmp-layers.mjs` 是这次实测留下的五个临时脚本。解析规则搬进 `src/host/meta-bmf.ts` 之后
**删掉它们**——留着会变成第二份会漂移的解析规则。

**已删（2026-10-02，批 A 收尾）**：上面五个，加上批 A 自己留下的
`_tmp-bmf-bytes.mjs`、`_tmp-fieldlabels.mjs`、`_tmp-names.mjs`、`_tmp-parse-split.mjs`、
`_tmp-reference.mjs`（§12.1 的 `<Reference>` 复量）、`tests/_tmp-realtree.spec.ts`、
`tests/_tmp-realmachine.spec.ts`（§10 的真机跑）、以及这些跑出来的
`_tmp-report.txt`、`_tmp-preview.txt`、`_tmp-realmachine.txt`、
`_tmp-realmachine-cold.txt`、`_tmp-bmf-backup.bin`、`_tmp-hang*.txt`。
数字都进了本文档与 `yon-home-design.md`；留着的下一次一定会漂移。

### 12.1 面板的渲染循环（本轮真机前发现的缺陷）

批 A 的预览套件一度**挂住**：没有红断言、没有报错、没有输出，进程 100% CPU 卡在文件中间。
定位靠两个脚本写的标记（`scripts/_tmp-hang.txt` 一步步写、`scripts/_tmp-hang-beat.txt` 每 50 ms
写一次心跳）：标记停在「点了那行」之后、心跳停在 `beat 1` —— 定时器队列被饿死，不是慢。

根因在 `HomeManager`：注入的面是个**每次渲染都新建的 spread**（`src/client/index.ts:85,192`、
`HomeItem.tsx:103`），而状态 effect 把 `api` 整个列进了依赖；它每次都要存一个新建的
status 视图，于是「渲染 → effect → setState → 渲染」。React 18 的自动批处理让这条链在
**微任务**里跑，定时器永远轮不上，所以是挂住而不是栈溢出。

修法：按名字取用到的两个成员（`const { listHomes, metaStatus: readMetaStatus } = api`），
依赖只列成员——`WikiManager`/`DigestManager` 本来就是这么写的。**这是产品缺陷不是测试假象**：
触发条件是「选中一行已登记的 Home」，也就是面板的日常状态，而且它会把 `metaStatus` 请求
一直打到真服务端上。

守卫在 `tests/home-manager.client.spec.tsx` 第一个用例：60 ms 后 `calls` 仍然只有一次。
**这个用例的失败形态是挂住而不是变红**——写进了用例头注释，改它之前先看那段。
