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
import { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
import { createYonProjectsService } from "./host/service.js";
import { registerYonApi } from "./host/http.js";
import { registerYonProjectTools, YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from "./host/tools.js";
export { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
export { ProjectError } from "./host/service.js";
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from "./host/tools.js";
/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server is deliberately NOT here. Listing it makes this plugin sit
 * pending forever on any deployment that has none — and a pending entry takes
 * the whole profile down (`--profile headless` fails with "1 entry did not
 * activate"). It is waited for separately, below.
 */
export const inject = ['storageDomain', 'tools'];
/**
 * Open the store, publish it, and serve its API.
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
    // The HTTP face is optional. A deployment without a web server (headless, a
    // terminal profile) still gets the store and the tools; the route simply never
    // appears there.
    ctx.inject(['webServer'], (web) => {
        web.effect(() => registerYonApi(web, service), 'yon-panel: project api');
    });
}
