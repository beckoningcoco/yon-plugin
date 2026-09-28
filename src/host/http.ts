/**
 * The HTTP face of the store: one prefix route under {@link API_PREFIX}.
 *
 * A route rather than a Typert Remote on purpose — this plugin is distributed
 * outside the harness repository, where the Remote codec generator is not
 * available. A prefix route needs only the carrier service the Web profile
 * already mounts, and it is reachable from any plugin's browser half (this
 * panel, a future project picker) without a cross-package import.
 *
 *   GET    /yon/api/projects                        list (main table only)
 *   POST   /yon/api/projects                        create
 *   GET    /yon/api/projects/<id>                   detail (fields folded in)
 *   PATCH  /yon/api/projects/<id>                   rename / recode / restatus
 *   DELETE /yon/api/projects/<id>                   delete project + its fields
 *   POST   /yon/api/projects/<id>/archive           soft delete / restore
 *   PUT    /yon/api/projects/<id>/fields/<fieldKey> write one dynamic field
 *   DELETE /yon/api/projects/<id>/fields/<fieldKey> drop one dynamic field
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  API_PREFIX, PROJECT_STATUSES, type ApiError, type JsonValue, type SetFieldInput,
  type UpdateProjectInput,
} from '../shared/types.ts'
import { ProjectError, type YonProjectsService } from './service.ts'

/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 1_000_000

/** The slice of the webserver service this module registers against. */
interface RouteRegistrar {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Write one {@link ApiError} response. */
function sendFailure(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { code, message } satisfies ApiError)
}

/** Read a JSON request body; an absent body reads as undefined. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new ProjectError('invalid-input', `body exceeds ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(buffer)
  }
  if (size === 0) return undefined
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ProjectError('invalid-input', 'body must be JSON')
  }
}

/** Read one object body, rejecting a non-object payload. */
async function objectBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJsonBody(req)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProjectError('invalid-input', 'body must be a JSON object')
  }
  return body as Record<string, unknown>
}

/** Read a dynamic-field bag, rejecting a non-object payload. */
function fieldsOf(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectError('invalid-input', 'fields must be a JSON object')
  }
  return value as Record<string, JsonValue>
}

/** Read a status field, rejecting anything outside the declared vocabulary. */
function statusOf(value: unknown): UpdateProjectInput['status'] {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    throw new ProjectError('invalid-input', `status must be one of ${PROJECT_STATUSES.join(', ')}`)
  }
  return value as UpdateProjectInput['status']
}

/** Split a pathname into the decoded segments following the API prefix. */
function segmentsOf(pathname: string): string[] | undefined {
  if (!pathname.startsWith(API_PREFIX)) return undefined
  const rest = pathname.slice(API_PREFIX.length)
  if (rest === '' || rest === '/') return []
  if (!rest.startsWith('/')) return undefined
  return rest.slice(1).split('/').map(segment => decodeURIComponent(segment))
}

/**
 * Register the project API on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the store to expose.
 * @returns the disposer removing the route.
 */
export function registerYonApi(ctx: Context, service: YonProjectsService): () => void {
  const carrier = ctx.get('webServer') as RouteRegistrar | undefined
  if (carrier === undefined) {
    throw new Error('yon-panel: the webServer service is unavailable, so /yon/api cannot be served')
  }

  return carrier.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const method = req.method ?? 'GET'
        const segments = segmentsOf(url.pathname)
        if (segments === undefined || segments[0] !== 'projects') {
          sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`)
          return
        }
        const [, projectId, tail, fieldKey] = segments

        // /yon/api/projects
        if (projectId === undefined) {
          if (method === 'GET') {
            const includeArchived = url.searchParams.get('archived') === '1'
            sendJson(res, 200, { projects: service.list({ includeArchived }) })
            return
          }
          if (method === 'POST') {
            const body = await objectBody(req)
            const status = statusOf(body.status)
            const project = await service.create({
              name: typeof body.name === 'string' ? body.name : '',
              ...(body.code === undefined ? {} : { code: String(body.code) }),
              ...(status === undefined ? {} : { status }),
              ...(body.fields === undefined ? {} : { fields: fieldsOf(body.fields) }),
            })
            sendJson(res, 201, { project })
            return
          }
          sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
          return
        }

        // /yon/api/projects/<id>
        if (tail === undefined) {
          if (method === 'GET') {
            const project = service.get(projectId)
            if (project === undefined) {
              sendFailure(res, 404, 'not-found', `no project "${projectId}"`)
              return
            }
            sendJson(res, 200, { project })
            return
          }
          if (method === 'PATCH') {
            const body = await objectBody(req)
            const status = statusOf(body.status)
            const project = await service.update(projectId, {
              ...(body.name === undefined ? {} : { name: String(body.name) }),
              ...(body.code === undefined ? {} : { code: String(body.code) }),
              ...(status === undefined ? {} : { status }),
              ...(body.archived === undefined ? {} : { archived: Boolean(body.archived) }),
            })
            sendJson(res, 200, { project })
            return
          }
          if (method === 'DELETE') {
            await service.remove(projectId)
            sendJson(res, 200, { removed: projectId })
            return
          }
          sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
          return
        }

        // /yon/api/projects/<id>/archive
        if (tail === 'archive' && method === 'POST') {
          const body = await readJsonBody(req).then(
            value => (value !== null && typeof value === 'object' && !Array.isArray(value)
              ? value as Record<string, unknown>
              : {}),
          )
          const project = await service.update(projectId, {
            archived: body.archived === undefined ? true : Boolean(body.archived),
          })
          sendJson(res, 200, { project })
          return
        }

        // /yon/api/projects/<id>/fields/<fieldKey>
        if (tail === 'fields' && fieldKey !== undefined) {
          if (method === 'PUT') {
            const body = await objectBody(req) as Partial<SetFieldInput>
            if (!('value' in body)) {
              throw new ProjectError('invalid-input', 'body must carry a "value" member')
            }
            const project = await service.setField(projectId, fieldKey, body.value ?? null)
            sendJson(res, 200, { project })
            return
          }
          if (method === 'DELETE') {
            const project = await service.removeField(projectId, fieldKey)
            sendJson(res, 200, { project })
            return
          }
          sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
          return
        }

        sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`)
      } catch (error: unknown) {
        // Diagnostics first: the response may already be committed, and a
        // swallowed cause would leave nothing to debug with.
        console.error('[yon-panel] /yon/api failure', error)
        try {
          if (error instanceof ProjectError) {
            sendFailure(res, error.code === 'not-found' ? 404 : 400, error.code, error.message)
          } else {
            sendFailure(res, 500, 'internal', error instanceof Error ? error.message : String(error))
          }
        } catch (writeError: unknown) {
          // Writing the failure response is itself failing: end the socket so the
          // caller sees a broken response rather than a hung one.
          console.error('[yon-panel] /yon/api could not write its failure response', writeError)
          res.destroy()
        }
      }
    },
  })
}
