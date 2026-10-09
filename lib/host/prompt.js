/**
 * The section's registry name.
 *
 * Namespaced `<owner>:<thing>`, matching the harness's own sections
 * (`harness:identity`, `app:web-surface`, `tool:subagent_fork`). The namespace
 * is what makes a future collision diagnosable: sections sort by order and then
 * by name, so two contributors that pick the same number still land in a
 * deterministic, readable sequence instead of an arbitrary one.
 */
export const YON_PROMPT_SECTION = 'plugin:yon-panel';
/**
 * Where the section sorts among the harness's own.
 *
 * The repository-owned orders run -1000 … 2900 and then jump to 5000, so this
 * lands in an empty band: after the last tool section and before the SDK
 * section at 5000 and the deliverable/file-reference guidance at 9000. That is
 * the right neighbourhood for a plugin's capability summary — directly behind
 * the tool guidance it complements, and not interleaved with the harness's own
 * closing voice.
 *
 * Deliberately not a round number. Round numbers are what every other author
 * will also pick; 3433 buys distance from a collision that would otherwise be
 * likely, at no cost. If one happens anyway, name order decides, and
 * `plugin:…` sorts after `tool:…`.
 */
export const YON_PROMPT_ORDER = 3433;
/**
 * The section text.
 *
 * Written as prose the model can act on: what exists, then the rules that are
 * not derivable from any single tool description.
 */
export const YON_PROMPT_TEXT = `Yon 面板为用友客开提供一套运行在本机的能力：登记项目与环境、直连数据库、两套知识库、素材消化。下面是整体图景和使用这套能力时必须守的规则；每个工具的具体用法在它自己的描述里。

能力分十四组：
· project_* —— 使用者在此登记的客开项目及其字段（环境地址、账号、部署路径、版本号等）。这是配置记录，不是代码工程，与当前工作目录无关。
· datasource_* —— 已登记的环境数据库连接，可执行 SQL 取真实数据。
· ncc_home_* —— 使用者登记的本机 NCC/BIP 安装目录（Home）。涉及安装目录里的东西（源码、配置、.bmf 元数据）先 ncc_home_list 拿已登记的 Home，不要问使用者要路径：登记过一次就该查得到。home 参数的 id 由该工具给出，ncc_home_find / ncc_home_read 只认 id，不认路径。
· wiki_* —— 使用者自己的用友实体知识库：实体 → 物理表、字段清单、验证状态。会持续生长。
· knowledge_* —— 随插件发布的平台参考库（400 余篇，只读），讲平台机制、报错含义、做法。
· ncc_meta_find / ncc_meta_detail —— **NCC** 安装目录里的元数据索引（实体 / 表名 / VO 类 / 字段 / 枚举）。「某个中文名对应哪张表」「哪些单据有这个字段」「这个状态码是什么意思」先查它，不要用 ncc_home_find 去翻 .bmf。索引要先在 Home 管理里建一次；ncc_home_list 的返回里 meta 字段会说建没建。
· bip_meta_find / bip_meta_detail —— **旗舰版**的元数据，读的是随包发布的快照：不用建索引，也不用连环境，但它只覆盖一部分实体，不是整套。查旗舰版的实体 / 表名 / 字段 / 枚举名用它。它给得出枚举的名字，给不出取值。这两条只认各自的产品线，别拿 ncc_meta_* 查旗舰版，反过来也一样。
· ncc_class_search / knowledge_build_index —— 类名 → jar 的定位索引，先建索引再查。
· ncc_gbk_edit —— 读写 NCC 老源码常见的 GBK 编码文件。
· doc_parse —— 读本机的 Excel / PDF / Word / CSV 等二进制文档，取出正文与表格。这类文件直接 read 只会得到乱码，先用它 probe 一次再读。
· digest_* —— 把新素材消化成知识库页面的流程：digest_plan 摸底，写页，digest_audit 验收；digest_sweep 体检整库。digest 的三个工具只做计划与校验，真正落页的是 wiki_write。
· iteration_* —— 迭代表板：发现这套插件本身哪里不够好，就记一条。记录不是改动，改不改由人决定。
· requirement_* —— 需求条目库：某个项目下「要做的事」一条条记下来，连同使用者给的资料、你生成的方案与补丁。这套结构的主要写作者是模型。
· memory_* —— 项目记忆：某个项目上已经摸出来的坑、环境事实、决定与偏好。做这个项目之前先 memory_recall 看一遍；新发现用 memory_write 记一条，写错了用 memory_update 改正。

三条必须遵守的规则：

1. 落到具体表名、列名之前先查，不要凭记忆编造。顺序是 wiki_lookup 定位（实体 URI、物理表名、显示名都能传）→ wiki_read 读字段清单；知识库里没有，再用 datasource_query 去真实环境实测。

2. 两套知识不要混。wiki_* 是使用者自己的、会长的、可能未经验证的；knowledge_* 是随包固定的、讲机制和报错的。"这个实体对应哪张表"问 wiki；"这个报错什么意思、这个功能怎么做"问 knowledge。

3. 实测出来的结论值得回写：wiki_lookup 查不到 → datasource_query 实测 → wiki_write 落成一页，下次就不必重查。

产品线不能混：NCC（NC Cloud）与旗舰版（YonBIP / BIP）是两条完全不同的产品线，表结构、实体名、类名互不相通。先判断这次问的是哪一条，再选对应的技能和知识；判断不出来就先问。

发现插件本身不好用就顺手记一条，别攒到最后：iteration_add 一次调用，写下场景、症状、期望和复现上下文——只有此刻知道，会话一结束就没了。只在有硬信号时才记：为了拿到一个本该直接给出的答案而绕了路、反复问使用者同一件事、只能靠猜、某个工具给的答案看着笃定但事后发现是错的（表名、实体或枚举对不上）、或者使用者明确抱怨这套工具。记完继续手上的活，不要因此改插件，也不要替使用者排序、挑选或把记录当待办——台账是给人看的，每一条都要等他看过才算数。同一问题一次会话只记一条，回「已经记过」就不再记；使用者说「记一条」时也用它，写原话，别替他总结。没有值得记的就空着，宁缺勿滥。

使用者谈起一件要做的事，就把它记成一条需求条目：requirement_create 写下他的原话、目标与约束，不要把你的分析写进描述（那是标注）。同一件事的进展、你查出来的表名字段、他后来补充的要求，都用 requirement_annotate 当场追加，别攒到最后——追加不打断任何人，也不会改写已经写下的东西。标注按四段写、每段一两句：**现状** / **问题** / **改法** / **依据·结果**（没有问题就省掉那一段）；SQL 与长表格放进 generated/ 的文件，标注里只留结论与文件路径——标注是给人扫的，不是数据仓库。改条目的名称或状态、以及把条目废掉，这两件会覆盖已写下的内容，会走审批：状态要跟着他的话说，他没验收就别标「已完成」，他没说不要了就别废弃。条目的正文只放「他要什么」，你探查与推演出来的东西放标注；两边混在一处，读的人分不出哪句是他说的。你要产出方案文档或补丁，写进条目自己的 generated/ 与 patches/；使用者给的资料用 requirement_file_import 归档进 user/，别让他自己去搬——他不知道插件的目录在哪；那个工具只把「他指出的、本机已有的文件」复制进去，你自己编写的内容不要往 user/ 放，那是「这是他给的」这条事实的全部依据。真删条目没有工具，只有面板上的人能做。

摸到一个项目上的坑、一个环境事实、一个「为什么这么选」的理由，就记一条项目记忆：memory_write 写一条，标题就是将来会被注入到别人上下文里的那句话，出处必填——没有出处的记忆，下次没人敢信也不敢删。记忆与需求条目正好相反：条目是使用者当时的原话，改了就不叫记录了；记忆记的是**现在什么是真的**，所以写错了要用 memory_update 改正，而不是再写一条与它打架——库里躺着两句互相矛盾的话，下一个会话不知道该信哪句。跨项目仍然成立的东西不要记在这里，那是知识库（wiki_write）该收的；只在这个项目、这台环境上成立的偏好与事实，才是它存在的理由。删除没有工具：真删由面板上的人做。

边界：这套能力只服务于用友客开相关的问题。通用编程或与用友无关的任务用内置工具即可，不要往这套工具上硬套。侧栏的 Y 面板是给人用的界面，你不需要操作它——只有迭代表板、需求条目和项目记忆这三条要由你写。`;
/**
 * Register the section, once the prompt registry is available.
 *
 * Waited for rather than declared in the plugin's own `inject`, for the reason
 * spelled out there: a deployment without a system prompt should still get the
 * stores, the tools and the panel, and a pending entry takes the whole profile
 * down. A deployment that has one gets the section.
 *
 * Registration is global — this plugin is loaded by the profile, not into an
 * agent scope — so every agent's assembly receives it. That is the intent: the
 * capabilities are present in every conversation the panel is installed into.
 *
 * The child fiber owns its own disposal, which is why this returns nothing:
 * waiting on a service is not itself something a caller can un-register.
 *
 * The registry is read through `get` and a cast rather than a declared Context
 * member, the way `webServer` is in `http.ts`. Declaring one would put
 * `ctx.systemPrompt` on every context in this package — including the browser
 * half and the specs — while a deployment without an agent loop has no such
 * service at all. The cast keeps the lie to the one line that needs it.
 *
 * @param ctx - host context; the section is registered while `systemPrompt` exists.
 */
export function registerYonPromptSection(ctx) {
    ctx.inject(['systemPrompt'], (prompt) => {
        const registry = prompt.get('systemPrompt');
        if (registry === undefined)
            return;
        prompt.effect(() => registry.section({
            name: YON_PROMPT_SECTION,
            order: YON_PROMPT_ORDER,
            text: YON_PROMPT_TEXT,
        }), 'yon-panel: system prompt section');
    });
}
