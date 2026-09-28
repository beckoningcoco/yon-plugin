/**
 * Yon panel, host half: opens the project and skill-switch domains, publishes
 * them as `ctx.yonProjects` and `ctx.yonSkills`, offers the projects to the
 * agent as tools, contributes this plugin's own skills to the skill registry,
 * and — where a web server exists — serves both over `/yon/api`.
 *
 * Other plugins reach the data in three stable ways, none of which requires
 * importing this package: in-process through the services (`inject:
 * ['yonProjects']`, for a picker), by the agent through the `project_*` tools,
 * or from any browser half through the prefix route
 * (`fetch('/yon/api/projects')`).
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './host/service.ts';
import { type YonSkillsService } from './host/skill-registry.ts';
export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts';
export { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from './host/skill-domain.ts';
export { SkillError, YON_SKILL_SOURCE } from './host/skill-registry.ts';
export type { YonSkillRegistry, YonSkillsService } from './host/skill-registry.ts';
export { YON_BUNDLED_SKILLS } from './host/skill-catalog.generated.ts';
export type { YonBundledSkill } from './host/skill-catalog.ts';
export { ProjectError } from './host/service.ts';
export type { YonProjectsService } from './host/service.ts';
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts';
export type { CreateProjectInput, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, SkillDetail, SkillView, UpdateProjectInput, } from './shared/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The project store, provided by this plugin while it is mounted. */
        yonProjects: YonProjectsService;
        /** This plugin's bundled skills and their switches. */
        yonSkills: YonSkillsService;
    }
}
/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server and the skill registry are deliberately NOT here. Listing one
 * makes this plugin sit pending forever on any deployment that has none — and a
 * pending entry takes the whole profile down (`--profile headless` fails with
 * "1 entry did not activate"). Both are waited for separately, below.
 */
export declare const inject: string[];
/**
 * Open both domains, publish the services, and serve their API.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context): Promise<void>;
