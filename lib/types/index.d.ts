/**
 * yon_btn panel, host half: opens the project domain, publishes the store as
 * `ctx.yonProjects`, offers it to the agent as tools, and — where a web server
 * exists — serves it over `/yon/api`.
 *
 * Other plugins reach the data in three stable ways, none of which requires
 * importing this package: in-process through the service (`inject:
 * ['yonProjects']`, for a picker), by the agent through the `project_*` tools,
 * or from any browser half through the prefix route (`fetch('/yon/api/projects')`).
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './host/service.ts';
export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts';
export { ProjectError } from './host/service.ts';
export type { YonProjectsService } from './host/service.ts';
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts';
export type { CreateProjectInput, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, UpdateProjectInput, } from './shared/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The project store, provided by this plugin while it is mounted. */
        yonProjects: YonProjectsService;
    }
}
/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server is deliberately NOT here. Listing it makes this plugin sit
 * pending forever on any deployment that has none — and a pending entry takes
 * the whole profile down (`--profile headless` fails with "1 entry did not
 * activate"). It is waited for separately, below.
 */
export declare const inject: string[];
/**
 * Open the store, publish it, and serve its API.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context): Promise<void>;
