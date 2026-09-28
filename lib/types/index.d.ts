/**
 * Yon panel, host half: opens the project, skill-switch and datasource domains,
 * publishes them as `ctx.yonProjects`, `ctx.yonSkills` and `ctx.yonDataSources`,
 * offers the projects and the data sources to the agent as tools, contributes
 * this plugin's own skills to the skill registry, and — where a web server
 * exists — serves all three over `/yon/api`.
 *
 * Other plugins reach the data in three stable ways, none of which requires
 * importing this package: in-process through the services (`inject:
 * ['yonProjects']`, for a picker), by the agent through the tools, or from any
 * browser half through the prefix route (`fetch('/yon/api/projects')`).
 *
 * The data sources are the one part that is not stored in a storage domain.
 * They live in a JSON document under the operator's DSH directory because the
 * bundled query script reads that file directly — see `datasource-store.ts` for
 * why that trade is worth making.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './host/service.ts';
import { type YonSkillsService } from './host/skill-registry.ts';
import { type YonDataSourcesService } from './host/datasource-service.ts';
export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts';
export { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from './host/skill-domain.ts';
export { SkillError, YON_SKILL_SOURCE } from './host/skill-registry.ts';
export type { YonSkillRegistry, YonSkillsService } from './host/skill-registry.ts';
export { YON_BUNDLED_SKILLS } from './host/skill-catalog.generated.ts';
export type { YonBundledSkill } from './host/skill-catalog.ts';
export { ProjectError } from './host/service.ts';
export type { YonProjectsService } from './host/service.ts';
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts';
export { DataSourceError } from './host/datasource-service.ts';
export type { YonDataSourcesService } from './host/datasource-service.ts';
export { DATASOURCE_TOOL_NAMES } from './host/datasource-tools.ts';
export { defaultStorePath } from './host/datasource-store.ts';
export type { CreateProjectInput, DataSourceBinding, DataSourceListPayload, DataSourceProbeResult, DataSourceView, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, SaveDataSourceInput, SkillDetail, SkillView, UpdateProjectInput, } from './shared/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The project store, provided by this plugin while it is mounted. */
        yonProjects: YonProjectsService;
        /** This plugin's bundled skills and their switches. */
        yonSkills: YonSkillsService;
        /** The operator's database connections, and the runner that tries them. */
        yonDataSources: YonDataSourcesService;
    }
}
/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server, the skill registry and the subprocess service are deliberately
 * NOT here. Listing one makes this plugin sit pending forever on any deployment
 * that has none — and a pending entry takes the whole profile down (`--profile
 * headless` fails with "1 entry did not activate"). All three are waited for
 * separately, below, and the datasource runner reads its own service lazily on
 * every call for the same reason.
 */
export declare const inject: string[];
/**
 * Open all three stores, publish the services, and serve their API.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context): Promise<void>;
