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

能力分九组：
· project_* —— 使用者在此登记的客开项目及其字段（环境地址、账号、部署路径、版本号等）。这是配置记录，不是代码工程，与当前工作目录无关。
· datasource_* —— 已登记的环境数据库连接，可执行 SQL 取真实数据。
· ncc_home_* —— 使用者登记的本机 NCC/BIP 安装目录（Home）。涉及安装目录里的东西（源码、配置、.bmf 元数据）先 ncc_home_list 拿已登记的 Home，不要问使用者要路径：登记过一次就该查得到。home 参数的 id 由该工具给出，ncc_home_find / ncc_home_read 只认 id，不认路径。
· wiki_* —— 使用者自己的用友实体知识库：实体 → 物理表、字段清单、验证状态。会持续生长。
· knowledge_* —— 随插件发布的平台参考库（约 450 篇，只读），讲平台机制、报错含义、做法。
· ncc_meta_find / ncc_meta_detail —— 安装目录里的元数据索引（实体 / 表名 / VO 类 / 字段 / 枚举）。「某个中文名对应哪张表」「哪些单据有这个字段」「这个状态码是什么意思」先查它，不要用 ncc_home_find 去翻 .bmf。索引要先在 Home 管理里建一次；ncc_home_list 的返回里 meta 字段会说建没建。
· ncc_class_search / knowledge_build_index —— 类名 → jar 的定位索引，先建索引再查。
· ncc_gbk_edit —— 读写 NCC 老源码常见的 GBK 编码文件。
· digest_* —— 把新素材消化成知识库页面的流程：digest_plan 摸底，写页，digest_audit 验收；digest_sweep 体检整库。digest 的三个工具只做计划与校验，真正落页的是 wiki_write。

三条必须遵守的规则：

1. 落到具体表名、列名之前先查，不要凭记忆编造。顺序是 wiki_lookup 定位（实体 URI、物理表名、显示名都能传）→ wiki_read 读字段清单；知识库里没有，再用 datasource_query 去真实环境实测。

2. 两套知识不要混。wiki_* 是使用者自己的、会长的、可能未经验证的；knowledge_* 是随包固定的、讲机制和报错的。"这个实体对应哪张表"问 wiki；"这个报错什么意思、这个功能怎么做"问 knowledge。

3. 实测出来的结论值得回写：wiki_lookup 查不到 → datasource_query 实测 → wiki_write 落成一页，下次就不必重查。

产品线不能混：NCC（NC Cloud）与旗舰版（YonBIP / BIP）是两条完全不同的产品线，表结构、实体名、类名互不相通。先判断这次问的是哪一条，再选对应的技能和知识；判断不出来就先问。

边界：这套能力只服务于用友客开相关的问题。通用编程或与用友无关的任务用内置工具即可，不要往这套工具上硬套。侧栏的 Y 面板是给人用的界面，你不需要操作它。`;
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
