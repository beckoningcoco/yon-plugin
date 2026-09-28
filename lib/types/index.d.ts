/**
 * yon_btn panel, host half: opens the project domain, publishes the store as
 * `ctx.yonProjects`, and serves it over `/yon/api`.
 *
 * Other plugins reach the data in two stable ways, neither of which requires
 * importing this package: in-process through the service (`inject:
 * ['yonProjects']`, for a picker), or from any browser half through the prefix
 * route (`fetch('/yon/api/projects')`).
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './host/service.ts';
export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts';
export { ProjectError } from './host/service.ts';
export type { YonProjectsService } from './host/service.ts';
export type { CreateProjectInput, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, UpdateProjectInput, } from './shared/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The project store, provided by this plugin while it is mounted. */
        yonProjects: YonProjectsService;
    }
}
/** Services this half needs: durable storage and an HTTP carrier. */
export declare const inject: string[];
/**
 * Open the store, publish it, and serve its API.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context): Promise<void>;
