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
import { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
import { createYonProjectsService } from "./host/service.js";
import { registerYonApi } from "./host/http.js";
import { registerYonProjectTools, YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from "./host/tools.js";
import { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from "./host/skill-domain.js";
import { createYonSkillsService, SkillError, YON_SKILL_SOURCE, } from "./host/skill-registry.js";
export { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
export { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from "./host/skill-domain.js";
export { SkillError, YON_SKILL_SOURCE } from "./host/skill-registry.js";
export { YON_BUNDLED_SKILLS } from "./host/skill-catalog.generated.js";
export { ProjectError } from "./host/service.js";
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from "./host/tools.js";
/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server and the skill registry are deliberately NOT here. Listing one
 * makes this plugin sit pending forever on any deployment that has none — and a
 * pending entry takes the whole profile down (`--profile headless` fails with
 * "1 entry did not activate"). Both are waited for separately, below.
 */
export const inject = ['storageDomain', 'tools'];
/**
 * Open both domains, publish the services, and serve their API.
 * @param ctx - host context.
 */
export async function apply(ctx) {
    // The domain loads into memory and owns its unit; the caller closes it, and
    // the facility closes anything still open when this plugin unmounts first.
    const domain = await ctx.storageDomain.open(YON_DOMAIN);
    ctx.effect(() => () => { void domain.close(); }, 'yon-panel: project domain');
    const { service, dispose } = createYonProjectsService(ctx, domain);
    ctx.effect(() => dispose, 'yon-panel: project store');
    ctx.provide('yonProjects', service);
    // The same store, also reachable by the agent as tools: the operator asks in
    // words, the model picks the call, and every write stops for approval with a
    // before/after preview before it touches anything.
    ctx.effect(() => registerYonProjectTools(ctx, service), 'yon-panel: model tools');
    const skillDomain = await ctx.storageDomain.open(YON_SKILL_DOMAIN);
    ctx.effect(() => () => { void skillDomain.close(); }, 'yon-panel: skill domain');
    const skills = createYonSkillsService(skillDomain);
    ctx.effect(() => skills.dispose, 'yon-panel: bundled skills');
    ctx.provide('yonSkills', skills.service);
    // A skill registered through the registry exists exactly as long as this
    // plugin does, which is what makes these skills shippable without ever
    // writing into the operator's own skill directories: installing the plugin
    // offers them, uninstalling it withdraws them, and there is no bundle left on
    // disk to clean up. Registration waits for the registry rather than requiring
    // it, so a deployment without one still gets the stores, the tools, and the
    // panel's skill list.
    ctx.inject(['skills'], (scope) => {
        scope.effect(() => skills.attach(scope.skills), 'yon-panel: skill registration');
    });
    // The HTTP face is optional, for the same reason. A deployment without a web
    // server (headless, a terminal profile) still gets the stores and the tools;
    // the route simply never appears there.
    ctx.inject(['webServer'], (web) => {
        web.effect(() => registerYonApi(web, service, skills.service), 'yon-panel: project api');
    });
}
