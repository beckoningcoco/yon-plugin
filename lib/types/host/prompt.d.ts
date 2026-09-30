/**
 * The one paragraph this plugin adds to the system prompt.
 *
 * ## Why a section exists at all
 *
 * Every capability here already documents itself: twenty tool descriptions and
 * nine skill bodies. What none of them says is the shape of the whole — which
 * groups exist, what each is for, and which one to reach for first. A model
 * shown `wiki_lookup` beside `knowledge_search` has two similar names and no
 * reason to prefer either, and the step that costs nothing to get right (look
 * the physical table up rather than recall it) becomes a coin toss.
 *
 * So this section states the map and the standing rules, and deliberately does
 * not restate the tools. It is not a manual; it is the sentence that makes the
 * manual reachable.
 *
 * ## Why the text is Chinese
 *
 * The tool descriptions are Chinese and so are the skills, because the operator
 * reads them. This text is written for the model, but the vocabulary the model
 * has to match against — 「实体」「物理表」「客开」「旗舰版」 — only exists in the
 * Chinese corpus it will be searching. Translating the rules would leave the
 * model with two sets of names for one thing.
 *
 * ## Why the section is static
 *
 * It is a plain string rather than a provider function, so it cannot go stale
 * against the *deployment*. It can go stale against this package — adding a
 * tool group means editing the text — which is why the group count is written
 * down: a mismatch is meant to be visible rather than silent.
 *
 * A provider would let the text name only the tools actually registered in the
 * assembling scope. That is not worth the complexity today: nothing in this
 * plugin restricts its own surface per scope, so the assembled set is the
 * registered set.
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * The section's registry name.
 *
 * Namespaced `<owner>:<thing>`, matching the harness's own sections
 * (`harness:identity`, `app:web-surface`, `tool:subagent_fork`). The namespace
 * is what makes a future collision diagnosable: sections sort by order and then
 * by name, so two contributors that pick the same number still land in a
 * deterministic, readable sequence instead of an arbitrary one.
 */
export declare const YON_PROMPT_SECTION = "plugin:yon-panel";
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
export declare const YON_PROMPT_ORDER = 3433;
/**
 * The section text.
 *
 * Written as prose the model can act on: what exists, then the rules that are
 * not derivable from any single tool description.
 */
export declare const YON_PROMPT_TEXT = "Yon \u9762\u677F\u4E3A\u7528\u53CB\u5BA2\u5F00\u63D0\u4F9B\u4E00\u5957\u8FD0\u884C\u5728\u672C\u673A\u7684\u80FD\u529B\uFF1A\u767B\u8BB0\u9879\u76EE\u4E0E\u73AF\u5883\u3001\u76F4\u8FDE\u6570\u636E\u5E93\u3001\u4E24\u5957\u77E5\u8BC6\u5E93\u3001\u7D20\u6750\u6D88\u5316\u3002\u4E0B\u9762\u662F\u6574\u4F53\u56FE\u666F\u548C\u4F7F\u7528\u8FD9\u5957\u80FD\u529B\u65F6\u5FC5\u987B\u5B88\u7684\u89C4\u5219\uFF1B\u6BCF\u4E2A\u5DE5\u5177\u7684\u5177\u4F53\u7528\u6CD5\u5728\u5B83\u81EA\u5DF1\u7684\u63CF\u8FF0\u91CC\u3002\n\n\u80FD\u529B\u5206\u4E03\u7EC4\uFF1A\n\u00B7 project_* \u2014\u2014 \u4F7F\u7528\u8005\u5728\u6B64\u767B\u8BB0\u7684\u5BA2\u5F00\u9879\u76EE\u53CA\u5176\u5B57\u6BB5\uFF08\u73AF\u5883\u5730\u5740\u3001\u8D26\u53F7\u3001\u90E8\u7F72\u8DEF\u5F84\u3001\u7248\u672C\u53F7\u7B49\uFF09\u3002\u8FD9\u662F\u914D\u7F6E\u8BB0\u5F55\uFF0C\u4E0D\u662F\u4EE3\u7801\u5DE5\u7A0B\uFF0C\u4E0E\u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55\u65E0\u5173\u3002\n\u00B7 datasource_* \u2014\u2014 \u5DF2\u767B\u8BB0\u7684\u73AF\u5883\u6570\u636E\u5E93\u8FDE\u63A5\uFF0C\u53EF\u6267\u884C SQL \u53D6\u771F\u5B9E\u6570\u636E\u3002\n\u00B7 wiki_* \u2014\u2014 \u4F7F\u7528\u8005\u81EA\u5DF1\u7684\u7528\u53CB\u5B9E\u4F53\u77E5\u8BC6\u5E93\uFF1A\u5B9E\u4F53 \u2192 \u7269\u7406\u8868\u3001\u5B57\u6BB5\u6E05\u5355\u3001\u9A8C\u8BC1\u72B6\u6001\u3002\u4F1A\u6301\u7EED\u751F\u957F\u3002\n\u00B7 knowledge_* \u2014\u2014 \u968F\u63D2\u4EF6\u53D1\u5E03\u7684\u5E73\u53F0\u53C2\u8003\u5E93\uFF08\u7EA6 450 \u7BC7\uFF0C\u53EA\u8BFB\uFF09\uFF0C\u8BB2\u5E73\u53F0\u673A\u5236\u3001\u62A5\u9519\u542B\u4E49\u3001\u505A\u6CD5\u3002\n\u00B7 ncc_class_search / knowledge_build_index \u2014\u2014 \u7C7B\u540D \u2192 jar \u7684\u5B9A\u4F4D\u7D22\u5F15\uFF0C\u5148\u5EFA\u7D22\u5F15\u518D\u67E5\u3002\n\u00B7 ncc_gbk_edit \u2014\u2014 \u8BFB\u5199 NCC \u8001\u6E90\u7801\u5E38\u89C1\u7684 GBK \u7F16\u7801\u6587\u4EF6\u3002\n\u00B7 digest_* \u2014\u2014 \u628A\u65B0\u7D20\u6750\u6D88\u5316\u6210\u77E5\u8BC6\u5E93\u9875\u9762\u7684\u6D41\u7A0B\uFF1Adigest_plan \u6478\u5E95\uFF0C\u5199\u9875\uFF0Cdigest_audit \u9A8C\u6536\uFF1Bdigest_sweep \u4F53\u68C0\u6574\u5E93\u3002digest \u7684\u4E09\u4E2A\u5DE5\u5177\u53EA\u505A\u8BA1\u5212\u4E0E\u6821\u9A8C\uFF0C\u771F\u6B63\u843D\u9875\u7684\u662F wiki_write\u3002\n\n\u4E09\u6761\u5FC5\u987B\u9075\u5B88\u7684\u89C4\u5219\uFF1A\n\n1. \u843D\u5230\u5177\u4F53\u8868\u540D\u3001\u5217\u540D\u4E4B\u524D\u5148\u67E5\uFF0C\u4E0D\u8981\u51ED\u8BB0\u5FC6\u7F16\u9020\u3002\u987A\u5E8F\u662F wiki_lookup \u5B9A\u4F4D\uFF08\u5B9E\u4F53 URI\u3001\u7269\u7406\u8868\u540D\u3001\u663E\u793A\u540D\u90FD\u80FD\u4F20\uFF09\u2192 wiki_read \u8BFB\u5B57\u6BB5\u6E05\u5355\uFF1B\u77E5\u8BC6\u5E93\u91CC\u6CA1\u6709\uFF0C\u518D\u7528 datasource_query \u53BB\u771F\u5B9E\u73AF\u5883\u5B9E\u6D4B\u3002\n\n2. \u4E24\u5957\u77E5\u8BC6\u4E0D\u8981\u6DF7\u3002wiki_* \u662F\u4F7F\u7528\u8005\u81EA\u5DF1\u7684\u3001\u4F1A\u957F\u7684\u3001\u53EF\u80FD\u672A\u7ECF\u9A8C\u8BC1\u7684\uFF1Bknowledge_* \u662F\u968F\u5305\u56FA\u5B9A\u7684\u3001\u8BB2\u673A\u5236\u548C\u62A5\u9519\u7684\u3002\"\u8FD9\u4E2A\u5B9E\u4F53\u5BF9\u5E94\u54EA\u5F20\u8868\"\u95EE wiki\uFF1B\"\u8FD9\u4E2A\u62A5\u9519\u4EC0\u4E48\u610F\u601D\u3001\u8FD9\u4E2A\u529F\u80FD\u600E\u4E48\u505A\"\u95EE knowledge\u3002\n\n3. \u5B9E\u6D4B\u51FA\u6765\u7684\u7ED3\u8BBA\u503C\u5F97\u56DE\u5199\uFF1Awiki_lookup \u67E5\u4E0D\u5230 \u2192 datasource_query \u5B9E\u6D4B \u2192 wiki_write \u843D\u6210\u4E00\u9875\uFF0C\u4E0B\u6B21\u5C31\u4E0D\u5FC5\u91CD\u67E5\u3002\n\n\u4EA7\u54C1\u7EBF\u4E0D\u80FD\u6DF7\uFF1ANCC\uFF08NC Cloud\uFF09\u4E0E\u65D7\u8230\u7248\uFF08YonBIP / BIP\uFF09\u662F\u4E24\u6761\u5B8C\u5168\u4E0D\u540C\u7684\u4EA7\u54C1\u7EBF\uFF0C\u8868\u7ED3\u6784\u3001\u5B9E\u4F53\u540D\u3001\u7C7B\u540D\u4E92\u4E0D\u76F8\u901A\u3002\u5148\u5224\u65AD\u8FD9\u6B21\u95EE\u7684\u662F\u54EA\u4E00\u6761\uFF0C\u518D\u9009\u5BF9\u5E94\u7684\u6280\u80FD\u548C\u77E5\u8BC6\uFF1B\u5224\u65AD\u4E0D\u51FA\u6765\u5C31\u5148\u95EE\u3002\n\n\u8FB9\u754C\uFF1A\u8FD9\u5957\u80FD\u529B\u53EA\u670D\u52A1\u4E8E\u7528\u53CB\u5BA2\u5F00\u76F8\u5173\u7684\u95EE\u9898\u3002\u901A\u7528\u7F16\u7A0B\u6216\u4E0E\u7528\u53CB\u65E0\u5173\u7684\u4EFB\u52A1\u7528\u5185\u7F6E\u5DE5\u5177\u5373\u53EF\uFF0C\u4E0D\u8981\u5F80\u8FD9\u5957\u5DE5\u5177\u4E0A\u786C\u5957\u3002\u4FA7\u680F\u7684 Y \u9762\u677F\u662F\u7ED9\u4EBA\u7528\u7684\u754C\u9762\uFF0C\u4F60\u4E0D\u9700\u8981\u64CD\u4F5C\u5B83\u3002";
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
export declare function registerYonPromptSection(ctx: Context): void;
