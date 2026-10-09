import type { Context } from '@deepseek-ai/cordis';
import type { YonRequirementsService } from './requirement-service.ts';
import type { YonProjectsService } from './service.ts';
/** 这个模块拥有的工具。 */
export declare const REQUIREMENT_TOOL_NAMES: readonly ["requirement_list", "requirement_read", "requirement_file_list", "requirement_file_read", "requirement_file_import", "requirement_create", "requirement_annotate", "requirement_update", "requirement_archive", "requirement_artifact_write"];
/**
 * 注册需求条目的工具与闸门。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param service - 需求台账服务。
 * @param projects - 项目台账，用来把「项目」引用解析成 id。
 * @returns 撤回全部注册的处置函数。
 */
export declare function registerYonRequirementTools(ctx: Context, service: YonRequirementsService, projects: YonProjectsService): () => void;
