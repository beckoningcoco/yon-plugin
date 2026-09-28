/**
 * yon_btn panel, host half: opens the project domain, publishes the store as
 * `ctx.yonProjects`, and serves it over `/yon/api`.
 *
 * Other plugins reach the data in two stable ways, neither of which requires
 * importing this package: in-process through the service (`inject:
 * ['yonProjects']`, for a picker), or from any browser half through the prefix
 * route (`fetch('/yon/api/projects')`).
 */

import type { Context } from '@deepseek-ai/cordis'
import { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts'
import { createYonProjectsService, type YonProjectsService } from './host/service.ts'
import { registerYonApi } from './host/http.ts'

export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts'
export { ProjectError } from './host/service.ts'
export type { YonProjectsService } from './host/service.ts'
export type {
  CreateProjectInput, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, UpdateProjectInput,
} from './shared/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The project store, provided by this plugin while it is mounted. */
    yonProjects: YonProjectsService
  }
}

/** Services this half needs: durable storage and an HTTP carrier. */
export const inject = ['storageDomain', 'webServer']

/**
 * Open the store, publish it, and serve its API.
 * @param ctx - host context.
 */
export async function apply(ctx: Context): Promise<void> {
  // The domain loads into memory and owns its unit; the caller closes it, and
  // the facility closes anything still open when this plugin unmounts first.
  const domain = await ctx.storageDomain.open(YON_DOMAIN)
  ctx.effect(() => () => { void domain.close() }, 'yon-panel: project domain')

  const { service, dispose } = createYonProjectsService(ctx, domain)
  ctx.effect(() => dispose, 'yon-panel: project store')
  ctx.provide('yonProjects', service)

  ctx.effect(() => registerYonApi(ctx, service), 'yon-panel: project api')
}
