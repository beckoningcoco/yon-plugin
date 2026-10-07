/**
 * 需求条目，暴露给模型的九个工具，以及它们自己的闸门。
 *
 * 后两个是附件的清单与读取（批 4），**都只读**：写 `user/` 的路只有面板那一条
 * （`POST .../files`），模型侧根本没有——「这是他给的」这件事由目录结构保证，
 * 不靠模型自述。
 *
 * ## 这个工具族在做什么
 *
 * 需求这个实体天生就是模型写的：真正知道「使用者刚才说了什么、这次改动是为了
 * 哪一条」的，是正在跟使用者对话的那个模型，而不是事后回头看面板的人。所以这一
 * 族的重点是**让模型写得起、写得准**，而不是让人多一个录入口。
 *
 * 于是分工是：新增与追加**不打断**（这是记录，不是改动），改字段与废弃**要审批**
 * （这两件会覆盖已经写下来的东西），删除**没有工具**（那是面板里两步确认的事）。
 *
 * ## 为什么追加与改字段是两个工具
 *
 * 闸门按「工具名 + 参数」判走向（`tools.ts:isDestructiveWrite`）。合成一个
 * `requirement_write`，追加就得陪着改字段一起被审批——那正是迭代表板踩过的坑：
 * 「加一道审批会把『顺手记一条』变成『要打断使用者一次』，模型于是学会不记」
 * （`iteration-tools.ts:24-29`）。拆开，两种语义各自拿到对的那条路。
 *
 * ## 撞名为什么是工具去读盘
 *
 * `isDestructiveWrite` 是同步纯函数、只看参数，它读不了 `index.json`，所以「同项目
 * 下有没有同名条目」这件事只能由拿着服务的工具发现（`requirement-service.ts` 的
 * `create` 带 `dedupe` 时不做任何写入就返回冲突）。闸门那一侧能看见的只有参数里的
 * `acknowledgeDuplicate`——**它的值是被撞上那条的 id，不是 `true`**。改成 id 而不是
 * 布尔的理由：服务会拿它跟「此刻真正冲突的那条」比相等，一个抄来的、过期的、或者
 * 想省事直接填的凭据过不了，于是「带个标志就能悄悄多建一条」这条路不存在。
 *
 * ## 闸门里的预览是真的读了盘的
 *
 * 本仓已有先例（`wiki-write.ts:751` 的钩子是 async 的，为了在审批卡上写出要加什么）。
 * 所以 `requirement_update` 的审批卡列得出 `旧 → 新`，而不是只有新值——与人核对一条
 * 改动靠的正是这个差。
 *
 * ## user/ 没有对应的工具
 *
 * `requirement_artifact_write` 只认 `generated` 与 `patches`。使用者自己放的资料
 * 只能从面板进 `user/`：一个模型写得进去的目录，「这是使用者给的」就不再是真的。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonRequirementsService } from './requirement-service.ts';
import type { YonProjectsService } from './service.ts';
/** 这个模块拥有的工具。 */
export declare const REQUIREMENT_TOOL_NAMES: readonly ["requirement_list", "requirement_read", "requirement_file_list", "requirement_file_read", "requirement_create", "requirement_annotate", "requirement_update", "requirement_archive", "requirement_artifact_write"];
/**
 * 注册需求条目的工具与闸门。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param service - 需求台账服务。
 * @param projects - 项目台账，用来把「项目」引用解析成 id。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonRequirementTools(ctx: Context, service: YonRequirementsService, projects: YonProjectsService): () => void;
