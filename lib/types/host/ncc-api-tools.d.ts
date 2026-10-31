/**
 * NCC OpenAPI 调用，暴露给模型的三件工具。
 *
 * - `ncc_api_list_envs` 回答“配了哪些环境”，不读 secret；
 * - `ncc_api_save_env` 新增/更新一条环境，secret 只向内写，回答里永远打码；
 * - `ncc_api_call` 取 token、签名、发请求，把状态码和响应体原样带回来。
 *
 * 三个工具都不碰数据库、不碰浏览器：HTTP 一条链路，签名算法在 `ncc-api.ts` 里，
 * 与随包的 Python 版逐行对齐。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 本模块的工具名，供注册与文档引用。 */
export declare const NCC_API_TOOL_NAMES: readonly ["ncc_api_list_envs", "ncc_api_save_env", "ncc_api_call"];
/**
 * 注册三个工具。
 * @param ctx - the plugin context whose `tools` registry receives them.
 * @returns a disposer that unregisters all three.
 */
export declare function registerYonNccApiTools(ctx: Context): () => void;
