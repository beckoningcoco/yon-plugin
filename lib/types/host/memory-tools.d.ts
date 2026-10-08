/**
 * 项目记忆，暴露给 agent 的四个工具。
 *
 * ## 这个工具族在做什么
 *
 * 需求条目记的是「他说过什么」，知识库记的是「跨项目仍然成立的东西」，两者都不装
 * 「这个项目上踩过的坑」。于是那类东西的归宿只有两个：丢掉，或者塞进语义错位的柜
 * 子。`memory_write` 是第三个归宿。
 *
 * 它与需求条目的关键差别是**可改**：条目是当时的原话，改了就不叫记录了；记忆是
 * 当前事实，事实变了就得改。所以这里有一个 `memory_update`，而 `requirement_update`
 * 之后紧接着就是这个差别带来的第二件事——**模型不提供删除**。真删只在面板里，由人
 * 做。改写走审批（`tools.ts` 的 `isDestructiveWrite` 里显式列了 `memory_update`：
 * 新建不丢东西，追加重写也不丢，但改写正文会盖掉原来那段话）。
 *
 * ## 为什么注入不在这里
 *
 * 记忆的价值一半在「模型会想起来去查」——而它不会，它不知道自己不知道。所以
 * `project_read` 的返回值里带这个项目最近的几条（`tools.ts`），`memory_recall` 的
 * 描述里也写了「开工前先调」。两处都不是这个模块的事：注入点在别人的返回值里。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonMemoryService } from './memory-service.ts';
/** 这个模块拥有的工具。 */
export declare const MEMORY_TOOL_NAMES: readonly ["memory_write", "memory_update", "memory_recall", "memory_read"];
/**
 * 注册项目记忆的工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param memory - 记忆服务。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonMemoryTools(ctx: Context, memory: YonMemoryService): () => void;
