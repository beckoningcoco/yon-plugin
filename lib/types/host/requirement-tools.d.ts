import type { Context } from '@deepseek-ai/cordis';
import type { YonRequirementsService } from './requirement-service.ts';
import type { YonProjectsService } from './service.ts';
/**
 * 这个模块拥有的工具，**顺序与 `registerYonRequirementTools` 的注册顺序一致**。
 *
 * 这不是摆设：`host-plugin.spec.ts` 与 `requirement-tools.spec.ts` 都拿它当「注册
 * 了什么、按什么顺序」的期望值。加工具时随手插在语义上顺眼的位置，测试会红——那
 * 正是它该提醒的：要么按注册顺序放，要么把注册也挪过去。
 */
export declare const REQUIREMENT_TOOL_NAMES: readonly ["requirement_list", "requirement_read", "requirement_file_list", "requirement_file_read", "requirement_create", "requirement_annotate", "requirement_update", "requirement_archive", "requirement_file_import", "requirement_artifact_write"];
/**
 * 注册需求条目的工具与闸门。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param service - 需求台账服务。
 * @param projects - 项目台账，用来把「项目」引用解析成 id。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonRequirementTools(ctx: Context, service: YonRequirementsService, projects: YonProjectsService): () => void;
