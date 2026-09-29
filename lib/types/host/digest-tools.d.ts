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
import { type OverlapCheck } from './digest-audit.ts';
import { type DigestLog } from './digest-log.ts';
import type { YonWikiService } from './wiki-service.ts';
/** 这个模块拥有的工具。 */
export declare const DIGEST_TOOL_NAMES: readonly ["digest_plan", "digest_audit", "digest_sweep"];
/**
 * 把一次验收渲染成人能读的报告。
 *
 * @param audit - 验收结果。
 * @param config - 配置，取阈值用。
 * @param gateOnly - 门禁模式：`product` 只是占位的源文档，1–5、7 各项都是拿源文档
 *   跟自己比（覆盖必然 100%、保真必然 100%），数字没有意义。曾经这里照渲染完整
 *   报告，末尾打出「判定：不合格 —— structure」，与开头那句「除第 6 项外无意义」
 *   自相矛盾——足够让人以为门禁没过而放弃一份值得做的素材。
 */
/**
 * 渲染重叠那一项。
 *
 * 抽成函数，是因为它此前在门禁模式与验收模式里**各写了一遍**。代价立刻兑现了两次：
 * 「两个口径并列」当初只加进了门禁分支，而真正需要它的验收模式一直没有；新加的
 * 「排除没生效」警告则相反，只加在门禁分支，于是每次门禁都误报一次——门禁的
 * product 是源文档自身，本就不在被扫描的三个目录里，必然「一个都没匹配到」。
 * **同一段逻辑写两遍，改一处漏一处，两次都漏了。**
 *
 * @param overlap - 重叠明细。
 * @param verdict - 该项判定；门禁模式下传 null 或实际值均可，只影响是否打出「有增量」。
 * @param threshold - 重叠阈值。
 * @param gateOnly - 门禁模式：`product` 只是占位，不报「排除没生效」。
 * @returns 要打的行。
 */
export declare function overlapLines(overlap: OverlapCheck, verdict: boolean | null, threshold: number, gateOnly: boolean): string[];
/**
 * 注册消化验收工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param wiki - 知识库服务，用来把 vault id 解析成路径。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonDigestTools(ctx: Context, wiki: YonWikiService, log?: DigestLog): () => void;
