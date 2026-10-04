/**
 * 迭代表板，暴露给 agent 的两个工具。
 *
 * ## 这个工具族在做什么
 *
 * 插件的能力边界只有它的作者知道，而作者不在现场。真正会遇到「这个工具在这个
 * 场景下不够用」的，是**拿它干活的模型**——它为了拿到一个本该直接给出的答案绕了
 * 路，同一件事反复问使用者，或者只能靠猜。这些时刻今天全部丢失：插件拿不到会话
 * 记录（唯一会话句柄 `tools.ts:46-73` 只读 `sandbox/mode` 与 `approval/policy`），
 * 模型注意到了也没地方说，会话一结束就没了。
 *
 * `iteration_add` 就是那个地方。一次调用写一行，插件**只记不改**。
 *
 * ## 为什么只有两个工具，没有 update / remove
 *
 * 模型若能自己把一条标成 `fixed`，它就变成了这个功能专门要挡掉的那个角色：
 * **一个自治的产品负责人**。它会开始「这条我顺手修了」「这条不重要，划掉吧」，
 * 而台账是给人看的——改不改、先改哪条，是使用者的决定。删除也一样：那是有损的，
 * 只存在于面板里，由人两步确认，与 `project_create` 直写、`project_delete` 要确认
 * 是同一条线（`tools.ts:768-782`）。
 *
 * 于是模型的权限正好等于「写一条现场笔记」：追加，不能改，不能删。
 *
 * ## 为什么没有闸门
 *
 * `dispositionOf`（`tools.ts:430-434`）对纯追加写返回 `run`。记一条不影响使用者
 * 拥有任何东西，也不丢数据；而 `tools.ts:10-15` 主张闸门要少。更重要的是这个
 * 功能的前提：**记录几乎不花成本、绝不烦人**——加一道审批会把「顺手记一条」变成
 * 「要打断使用者一次」，模型于是学会不记，这正是本功能唯一的失败方式。
 *
 * ## 为什么没有第二个「人工录入」工具
 *
 * 行里没有作者字段，使用者说「记一条」时走的就是 `iteration_add`（描述里写了）。
 * 多一个 schema 几乎相同的工具，只会多一次模型选错的机会。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonIterationService } from './iteration-service.ts';
/** 这个模块拥有的工具。 */
export declare const ITERATION_TOOL_NAMES: readonly ["iteration_add", "iteration_list"];
/**
 * 注册迭代表板的工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param iteration - 台账服务。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonIterationTools(ctx: Context, iteration: YonIterationService): () => void;
