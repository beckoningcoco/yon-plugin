/**
 * 消化验收，暴露给 agent 的一个工具。
 *
 * `digest_audit` 回答一个问题：**这次消化做到位了没有？** 它把源素材与知识页
 * 放在一起比，算出七项指标，逐项给出合格与不合格。
 *
 * ## 为什么这个工具必须存在
 *
 * 一份编造的摘要和一份合格产物，在文件列表里长得一模一样——都是 `.md`，都有
 * frontmatter，都可能标着「已抽取」。实测过一份 1.1 KB 的摘要，正文列了六章
 * 内容，与文档真实的六章**没有一条对得上**，而它写的是 `confidence: EXTRACTED`。
 *
 * 这个工具的价值不在于给产物打分，而在于**让模型在交付前能自己发现这件事**。
 *
 * ## 用法
 *
 * 消化完成后调用它。不合格就按报告指出的项返工——报告会说明每一处缺什么：
 * 是术语没覆盖、页码没标、还是出现了原文没有的标识符。
 *
 * 消化**之前**也可以先用它：只给 `source` 和 `vault`、不给 `product`，等于只跑
 * 重叠门禁，用来判断这份素材值不值得消化（内容大部分已在库里的话，先确认增量）。
 *
 * ## 它管不了的
 *
 * 只验证「覆盖」与「保真」，**验证不了「正确」**。产物照录了原文的错误取值，
 * 它会判合格。正确性必须对照真实环境。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonWikiService } from './wiki-service.ts';
/** 这个模块拥有的工具。 */
export declare const DIGEST_TOOL_NAMES: readonly ["digest_audit"];
/**
 * 注册消化验收工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param wiki - 知识库服务，用来把 vault id 解析成路径。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonDigestTools(ctx: Context, wiki: YonWikiService): () => void;
