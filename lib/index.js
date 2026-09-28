/**
 * yon_btn panel, host half: opens the project domain, publishes the store as
 * `ctx.yonProjects`, and serves it over `/yon/api`.
 *
 * Other plugins reach the data in two stable ways, neither of which requires
 * importing this package: in-process through the service (`inject:
 * ['yonProjects']`, for a picker), or from any browser half through the prefix
 * route (`fetch('/yon/api/projects')`).
 */
import { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
import { createYonProjectsService } from "./host/service.js";
import { registerYonApi } from "./host/http.js";
export { DOMAIN_NAME, YON_DOMAIN } from "./host/domain.js";
export { ProjectError } from "./host/service.js";
/** Services this half needs: durable storage and an HTTP carrier. */
export const inject = ['storageDomain', 'webServer'];
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
    ctx.effect(() => registerYonApi(ctx, service), 'yon-panel: project api');
}
