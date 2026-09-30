# 系统提示词段落：设计记录

> 这份文档记录的是**为什么这样设计**、**支撑它的实测数据**、以及**它现在还不成立的地方**，
> 不是接口手册。代码在 `src/host/prompt.ts`，用法在它的 JSDoc 里，测试在 `tests/prompt.spec.ts`。
>
> 记录日期 2026-10-01。机制部分核对的是装在 `~/.dsh/profiles/node_modules` 的
> DSH 0.1.2-rc.1（`@deepseek-ai/dsh-system-prompt` 同名版本），源码行号指
> `deepseek-harness-neuron/packages/core/system-prompt/src/index.ts`。

## 一、要解决的问题

插件给模型带了 20 个工具、9 个技能，每一个都自带文档——工具的用法在工具描述里，技能的正文在
技能目录里。**缺的不是文档，是地图**：哪几组存在、各组解决什么问题、遇到一件事该先动哪一个。

这个缺口有具体的形状。模型同时看到 `wiki_lookup` 和 `knowledge_search`，两个名字都像"查知识"，
它没有任何理由偏好其中一个；而"写 SQL 前先把物理表查出来"这个几乎零成本的正确做法，就退化成
掷硬币。同一个清点里（37 个会话）47 个工具中有 19 个从未被调用过——工具在手上，不等于工具在
视野里。

所以这一段给的是**地图 + 守则**，不是工具手册：讲清有哪几组、彼此什么关系，以及三条任何单个
工具描述都装不下的规则（先查再写、两套知识不要混、实测结论回写）。工具各自的用法仍然只由它
自己的描述负责。

## 二、四条决定

| 决定 | 取值 | 理由 |
|---|---|---|
| 语言 | **中文** | 工具描述和技能正文都是中文，因为读它们的是使用者。这段虽然是写给模型看的，但模型要匹配的词汇——「实体」「物理表」「客开」「旗舰版」——只存在于中文语料里。翻成英文等于给同一件东西留两套名字。 |
| 产品线段 | **保留** | NCC（NC Cloud）与旗舰版（YonBIP / BIP）是两条产品线，表结构、实体名、类名互不相通。不写明，模型会自信地混用，产出一个看着像样的错误 schema。这是整段里最贵的一条，也是最不能省的一条。 |
| `order` | **3433** | 见第四节。 |
| "等待批准不是失败"段 | **删除** | 反过来考虑过：告诉模型闸门是常态，等于让模型更愿意走进闸门。哪些工具需要审批，工具自身的描述里已经写了；这段不替它做解释。 |

## 三、`order` 是什么（先澄清一个误解）

`order` **不是优先级，也不是覆盖**。它是排序键，而整个装配的产物只有一个字符串。

装配流程（`index.ts:573` 起）：

```
注册表里的所有 section
  → 按 order 升序排序，order 相同则按 name 的 code-unit 顺序（comparePromptSections，index.ts:227）
  → 逐条求值 text（可以是字符串，也可以是 (context) => string）
  → 用 "\n\n" 拼成一个字符串
  → 每个 step 跑一次
```

唯一产物是一个拼接后的字符串，所以 **`order` 只决定这段话在拼接结果里的位置**。两件事因此成立：

- **order 撞了不会报错、不会丢内容**，只影响顺序；同 order 时由名字决定平局（名字用
  code-unit 比较，与 locale 无关，所以是确定的）。
- **真正的硬冲突轴是名字，不是 order**：同 scope 内同名注册会抛
  `prompt section "x" is already registered`。覆盖走的是另一套机制（scope + 同名）。

分配原则随之而来：取唯一整数、相邻至少差 10、按百/千分组留空档。仓库自有的 section 全部走一张
中心表 `SECTION_ORDERS`，取值范围 -1000 … 2900（工具段），然后直接跳到 5000、9000、9900。

**一个容易踩的差别**：section 排序有名字兜底，**context 没有**——`index.ts:593` 是
`.sort((a, b) => a.order - b.order)`，order 相同时顺序不定。所以如果哪天想把这段内容改成
`context()`（见第五节），平局保护就没了。

## 四、3433 是怎么定的

三条一起决定的，不是随手取的中位数：

1. **落在空档里。** 中心表 2900 之后直接是 5000（`TOOLS_SDK`），3000–4999 整段没人用。
2. **邻居是对的。** 往前最后一个工具段在 2800（`tool:subagent`、`tool:subagent_fork`），
   往后是 5000 的 SDK 段和 9000 的交付引用段。3433 让这段紧跟在它补充的工具指引后面，
   又不插进 harness 自己的收尾语气里。
3. **不是整数。** 整数（3000、3500）是所有插件作者都会挑的；错开一个零头，用一个字的代价
   换开碰撞距离。真撞上也不致命——名字决定平局，而 `plugin:…` 会排在 `tool:…` 之后。

名字带命名空间（`plugin:yon-panel`）和 order 错开是同一件事的两半：**order 求不撞，名字求撞了
也读得懂**。

## 五、为什么是静态串

DSH 的提示词有三条互不相通的通道，选错通道是这里最容易犯的错：

| 通道 | 装什么 | 本插件 |
|---|---|---|
| ① system 段注册表 | 身份、工具指引、策略——每步重算 | **走这条** |
| ② 持久化的 user-role 注入 | agent-instructions、插件运行时快照、技能目录 | 技能目录由技能注册表自己发 |
| ③ agent preset 组合 | 整套 persona 与工具清单 | 不涉及 |

**会随会话或环境变的事实属于 `context()`，不属于 `section()`。** `context()` 产出的是
user-role 快照，落在 system 前缀之后；放进 `section()` 会让每一变都改写 system 前缀，而系统
前缀一改，缓存从那个 token 起全部失效。这段讲的是能力图景，不随会话变，所以它是 `section`。

选静态串而不是 provider 函数（`text: (context) => string`）的理由：

- **价值不在名字清单，在名字之间的句子。** "先建索引再查""两套知识不要混""实测结论回写"
  推不出来，只能人写。自动推导最多盖住清单，而清单恰好是最不容易错的那部分。
- **静态串能对确切的字节做断言。** `tests/prompt.spec.ts` 比的是常量本身；
  provider 函数算出来的文本做不到这一点。

## 六、代价

| 项 | 量 |
|---|---|
| 每请求固定开销 | **1,062 字符 / 22 行 ≈ 265 token**（实测 4.0 字符/token），每个会话每次请求都付 |
| 缓存 | system 前缀变了 → 启用后的第一次请求全量 cache miss。（此后它成为稳定前缀的一部分：实测 web 那次 `inputTokens` 16,153 中 `cacheReadTokens` 1,152。） |
| 维护耦合 | 文案是手写的，加一个工具族就要改它。文案里写死"七组"就是为了让它错得**看得见**。 |

## 七、已经漂了两处（未修）

静态串的断言和插件的真实状态之间**没有任何运行时连接**，所以它已经在说两件不成立的事：

| 文案 | 实际情况 | 数字的出处 |
|---|---|---|
| 「约 450 篇」 | `resources/knowledge/` 下是 **389 个 markdown 文档**（bip 320 + ncc 69）。450 是那个目录的**文件**总数：389 篇文档 + 61 个 json / java / js / py / sql / png / jar / bat。 | 这个口径在五处写着：`src/index.ts:182`、`src/host/knowledge-tools.ts:6,16,75,228`、`src/host/prompt.ts:103`。也就是说模型读得到的 `knowledge_search` 描述里也是错的——**不是本次引入的**。 |
| `wiki_lookup` "实体 URI、物理表名、显示名都能传" | 源码里是**五种**：`'uri' \| 'table' \| 'page' \| 'name' \| 'contains'`（`src/host/wiki-service.ts:58`）。少说的 `page` 是页面名，`contains` 是子串兜底。 | 第二种正是"少说了已有的能力"，模型因此不知道页面名也能直接查。 |

`tests/prompt.spec.ts` 只保证**每个工具族都被提到**，上面两条它都不查。这不是漏写测试——这是
这类测试的固有边界：它能挡"新加了一个工具族但文案没提"，挡不住"文案在说一件已经变了的事实"。

## 八、验证（2026-10-01，两次活体）

| profile | `header.system` | 工具数 | 段落位置 | 前后的邻居 |
|---|---|---|---|---|
| headless + `--patch` | 5,747 | 46 | 4,685 – 5,747（尾部） | 前：`tool:subagent`（2800）；后面没有别的段 |
| **web（真实）** | 8,086 | 47 | 6,723 – 7,785 | 前：`tool:subagent_fork`（2800）· 后：`deliverable:file-references`（9000） |

两次的段落文本**逐字节相同**，且与源码常量相同；出现次数都**恰好 1**（`inject` 没有重复注册）。
web 那次还顺带证了平局规则：`tool:subagent`(5998) 在 `tool:subagent_fork`(6358) 之前，两者
order 都是 2800，顺序由名字决定。

**方法（可复用）：**

1. **headless 直接跑**：`dsh --profile headless --patch <overlay.yml> "你好"`。
   overlay 只有一条 `insert`，因为 headless profile 本身没装这个插件。插件在 profile 的
   `node_modules` 里是**软链到仓库**的（`dsh-plugin-yon-panel -> /e/gitproject/dsh-plugin-yon-panel`），
   所以 `npm run build` 完再跑就是新代码，不用重装。
2. **会话日志**：`~/.dsh/sessions/<projectKey>/<sessionId>/session.jsonl.zstd`。
   它是**拼接的 zstd 帧**（第 1 帧是 header 行，之后是事件批），要**先扫帧边界再逐帧解压**，
   不能整文件一次解压。解码脚本 `dshdec.mjs`（`%TEMP%`，帧扫描 + 逐帧 `zstdDecompressSync`）。
3. **段落在哪**：`request/header` 事件的 `data.header.system`，是一条**已经拼好的字符串**。
   工具 schema 不在里面，单独在 `data.header.tools`。所以"prompt 多大"和"工具多大"是两个数。

## 九、已知限制：preset 会整段吃掉它

如果某个 agent preset 的 persona 段带 `complete: true`，那么**这个 scope 的 system prompt 就
只剩那一段**——它是在 `system-prompt/assemble` waterfall **之后**被恢复的
（`index.ts:608`：`sections: completeSection === undefined ? transformed.sections : [completeSection]`），
所以监听器改不动它，本插件的段落也不会出现。

随包发布的 `minimal` preset 就是这样（`presets/minimal/agent.cordis.yml:13`）。**在 minimal 下
这个段落不存在**，插件的工具仍然注册、仍然可调用。

## 十、没验证到的

**只证明了段落在、位置对、没重复。没有证明模型会照它挑工具。**

你那次测试让模型"无需回复"，它只回了"你好"。要测行为，得问一个真问题（比如让它查某个实体的
物理表），然后看它的动作序列是不是先 `wiki_lookup` 再 `wiki_read`、而不是直接写 SQL。
