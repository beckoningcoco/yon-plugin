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
 *
 *   GET    /yon/api/skills                   list (this plugin's, then the operator's)
 *   GET    /yon/api/skills/<name>            one skill, body included
 *   PATCH  /yon/api/skills/<name>            switch one bundled skill on or off
 *
 *   GET    /yon/api/datasources              list (one row per connection env)
 *   PUT    /yon/api/datasources/<key>        create or replace one env branch
 *   DELETE /yon/api/datasources/<key>        drop one env branch
 *   POST   /yon/api/datasources/<key>/probe  run SELECT 1 through the bundled script
 *   PUT    /yon/api/datasources/<key>/binding bind the connection group to a project
 *
 *   GET    /yon/api/homes                    list, each with its last probe
 *   POST   /yon/api/homes                    register one installation directory
 *   PUT    /yon/api/homes/<id>               edit one registration (id is immutable)
 *   DELETE /yon/api/homes/<id>               drop one registration
 *   POST   /yon/api/homes/<id>/probe         re-read the directory and store the result
 *   PUT    /yon/api/homes/<id>/default       make this the Home a bare version means
 *   GET    /yon/api/homes/<id>/meta-index    metadata index status, and any build running
 *   POST   /yon/api/homes/<id>/meta-index    start building it (returns at once)
 *   GET    /yon/api/homes/<id>/class-index   class index status, and any build running
 *   POST   /yon/api/homes/<id>/class-index   start building it (returns at once)
 *   DELETE /yon/api/homes/<id>/class-index   drop the stored index (derived; rebuildable)
 *
 *   POST   /yon/api/pick-directory          open the host's own folder chooser
 *
 *   GET    /yon/api/wiki                    list the registered vaults
 *   POST   /yon/api/wiki/vaults             register one
 *   PUT    /yon/api/wiki/vaults/<id>        edit one registration (id is immutable)
 *   DELETE /yon/api/wiki/vaults/<id>        unlist one (nothing inside the vault moves)
 *   GET    /yon/api/wiki/recent             a vault's own log tail
 *   POST   /yon/api/wiki/rebuild            rebuild one index, or every one
 *   GET    /yon/api/wiki/health             level breakdown, references, holes, activity
 *   GET    /yon/api/wiki/search             pages answering a term
 *   GET    /yon/api/wiki/card               one page as a card
 *   GET    /yon/api/wiki/citers             who cites one entity URI
 *
 *   GET    /yon/api/iterations              the ledger, newest first (`?status=`, `?kind=`)
 *   POST   /yon/api/iterations              file one row by hand from the panel
 *   PATCH  /yon/api/iterations/<id>         re-triage one row (status / severity)
 *   DELETE /yon/api/iterations/<id>         drop one row
 *
 *   GET    /yon/api/memories                the memory bank (`?project=`, `?type=`, `?tag=`, `?query=`)
 *   GET    /yon/api/memories/<id>           one memory, body included
 *   DELETE /yon/api/memories/<id>           delete one (panel only — the model has no such tool)
 *
 *   GET    /yon/api/browsers                registrations, running instances, scan state
 *   POST   /yon/api/browsers/scan           re-scan this machine and store what was found
 *   PUT    /yon/api/browsers/<id>           edit one row (id / family / product are immutable)
 *   POST   /yon/api/browsers/<id>/launch    start one, with a debugging port (answers 201)
 *   POST   /yon/api/browsers/runs/<runId>/stop  end one this panel started
 *
 *   GET    /yon/api/requirements              the ledger, newest change first (`?project=`, `?status=`)
 *   GET    /yon/api/requirements/<id>         one entry (`?history=1` keeps the struck-through text)
 *   POST   /yon/api/requirements              create one from the panel (answers 201)
 *   PATCH  /yon/api/requirements/<id>         rename / restatus
 *   POST   /yon/api/requirements/<id>/annotations  append one note
 *   POST   /yon/api/requirements/<id>/archive      retire it, with a reason
 *   DELETE /yon/api/requirements/<id>         delete the entry and its directory (panel only)
 *   GET    /yon/api/requirements/<id>/files   the entry's attachments (`?dir=user|generated|patches`)
 *   POST   /yon/api/requirements/<id>/files   file one attachment — raw bytes, not JSON, and the
 *                                             name rides in `x-yon-file-name`, URL-encoded (answers 201)
 *   GET    /yon/api/requirements/<id>/files/<name>     read one as text (`?dir=`, default user)
 *   DELETE /yon/api/requirements/<id>/files/<name>     delete one (`?dir=`, default user)
 *
 * A datasource key is `<configKey>::<env>` and carries non-ASCII text, so every
 * route segment below is decoded (by {@link segmentsOf}) and every client call
 * encodes it. The key is opaque to this layer: it is split only where the
 * service expects a group and a branch.
 *
 * An attachment is uploaded as raw bytes, not as JSON, and its name rides in the
 * `x-yon-file-name` header — URL-encoded, because a header value is latin-1 in Node
 * and 「华科接口文档.docx」 is not. The reason it is not a JSON body with base64 in
 * it is {@link MAX_BODY_BYTES}: that cap is a property of every route in this file,
 * and a route that needed to exceed it would have to raise it for all of them. So
 * the upload gets its own reader with its own cap instead, and a name in a header
 * that is checked by the same rule as everything else (the service's).
 *
 * No response on this route ever carries a password. That is a property of the
 * service's own return types rather than a filter applied here — see
 * `datasource-catalog.ts` — so a future route cannot forget to strip one.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  API_PREFIX, ITERATION_KINDS, ITERATION_SEVERITIES, ITERATION_STATUSES, MEMORY_TYPES, PROJECT_STATUSES,
  REQUIREMENT_STATUSES,
  type ApiError, type DirectoryPickResult, type JsonValue, type LaunchBrowserInput,
  type SaveBrowserInput, type SaveHomeInput, type SaveVaultInput, type SetFieldInput,
  type UpdateProjectInput,
} from '../shared/types.ts'
import { ProjectError, type YonProjectsService } from './service.ts'
import { SkillError, type YonSkillsService } from './skill-registry.ts'
import { DataSourceError, type YonDataSourcesService } from './datasource-service.ts'
import { WikiError, type YonWikiService } from './wiki-service.ts'
import { digestLogPath, type DigestLog } from './digest-log.ts'
import { HomeError, type YonHomesService } from './home-service.ts'
import { IterationError, type YonIterationService } from './iteration-service.ts'
import { MemoryError, type YonMemoryService } from './memory-service.ts'
import { BrowserError, type YonBrowsersService } from './browser-service.ts'
import { RequirementError, type YonRequirementsService } from './requirement-service.ts'
import { MAX_ATTACHMENT_BYTES, sizeOf } from './requirement-files.ts'
import type { YonMetaService } from './meta-service.ts'
import type { YonClassService } from './class-service.ts'

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

/**
 * Read a whole upload body as bytes, up to `MAX_ATTACHMENT_BYTES`.
 *
 * A sibling of {@link readJsonBody} rather than a relaxation of it: that cap is what
 * keeps every JSON route from being a memory amplifier, and a route that needs more
 * gets its own reader instead of moving the ceiling on all the others.
 *
 * `content-length` is checked first, so a request that is honest about being 200 MB
 * is refused before any of it is buffered. It is only a shortcut — the running total
 * below is what actually enforces the cap, because a header can lie.
 * @param req - the request.
 * @returns the body.
 */
async function readAttachmentBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '')
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
    throw new RequirementError(
      'invalid-input',
      `一个附件最多 ${sizeOf(MAX_ATTACHMENT_BYTES)}，这个请求声明了 ${sizeOf(declared)}。`,
    )
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new RequirementError(
        'invalid-input',
        `一个附件最多 ${sizeOf(MAX_ATTACHMENT_BYTES)}，传到这里已经超了。`,
      )
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
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
 * Split one datasource key into the group name and the environment branch.
 *
 * The split takes the LAST separator, the same way the shared helper does, so a
 * group name that itself contains `::` still round-trips.
 * @param key - the composite key from the URL.
 * @returns the parts, or undefined when the key carries no separator.
 */
function keyParts(key: string): { configKey: string; env: string } | undefined {
  const at = key.lastIndexOf('::')
  if (at <= 0) return undefined
  const env = key.slice(at + 2)
  if (env === '') return undefined
  return { configKey: key.slice(0, at), env }
}

/**
 * Serve the `/yon/api/datasources` branch.
 *
 * Writes here touch the operator's own document, which is the same file the
 * panel edits; there is no privileged verb, so a key the caller cannot name is
 * simply not found.
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param sources - the datasource service.
 */
async function handleDataSources(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  sources: YonDataSourcesService,
): Promise<void> {
  const key = segments[1]
  const tail = segments[2]

  // /yon/api/datasources
  if (key === undefined) {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, await sources.list())
    return
  }

  // /yon/api/datasources/<key>
  if (tail === undefined) {
    if (method === 'PUT') {
      const parts = keyParts(key)
      if (parts === undefined) {
        sendFailure(res, 400, 'invalid-input', `无法解析数据源键「${key}」`)
        return
      }
      const body = await objectBody(req)
      const row = await sources.save({
        configKey: parts.configKey,
        env: parts.env,
        dbType: typeof body.dbType === 'string' ? body.dbType : '',
        host: typeof body.host === 'string' ? body.host : '',
        port: typeof body.port === 'number' ? body.port : Number.parseInt(String(body.port), 10),
        ...typeof body.serviceName === 'string' ? { serviceName: body.serviceName } : {},
        ...body.users === undefined || body.users === null || typeof body.users !== 'object'
          ? {}
          : { users: body.users as Record<string, string> },
        ...typeof body.projectId === 'string' ? { projectId: body.projectId } : {},
      })
      sendJson(res, 200, { source: row })
      return
    }
    if (method === 'DELETE') {
      await sources.remove(key)
      sendJson(res, 200, { removed: key })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/datasources/<key>/probe
  if (tail === 'probe' && method === 'POST') {
    const body = await readJsonBody(req).then(
      value => (value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}),
    )
    const result = await sources.probe(key, typeof body.user === 'string' ? body.user : undefined)
    sendJson(res, 200, { result })
    return
  }

  // /yon/api/datasources/<key>/binding
  if (tail === 'binding' && method === 'PUT') {
    const body = await objectBody(req)
    const projectId = body.projectId
    await sources.bind(key, typeof projectId === 'string' ? projectId : undefined)
    sendJson(res, 200, { bound: typeof projectId === 'string' ? projectId : '' })
    return
  }

  sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/datasources/...`)
}

/**
 * Read a Home registration body into the service's input shape.
 *
 * A caller that still sends a `label` gets it ignored rather than rejected: the name
 * is derived from the product line and the version (`homeLabelOf`), so there is
 * nothing for a body to say about it.
 */
function homeInputOf(body: Record<string, unknown>): SaveHomeInput {
  return {
    path: typeof body.path === 'string' ? body.path : '',
    product: body.product === 'bip' ? 'bip' : 'ncc',
    version: typeof body.version === 'string' ? body.version : '',
    ...body.isDefault === undefined ? {} : { isDefault: Boolean(body.isDefault) },
  }
}

/**
 * Read a vault registration body.
 *
 * Absent fields become the empty string rather than being rejected here, so the
 * refusal comes from the service with its own wording — one place that says what
 * a missing path means, rather than two.
 * @param body - the parsed request body.
 * @returns the input the service reads.
 */
function vaultInputOf(body: Record<string, unknown>): SaveVaultInput {
  return {
    label: typeof body.label === 'string' ? body.label : '',
    path: typeof body.path === 'string' ? body.path : '',
  }
}

/**
 * Serve the `/yon/api/homes` branch.
 *
 * A registration is identified by its generated id, and the id is not editable —
 * the same convention the datasource panel uses for a connection's key and
 * environment. Editing changes what an entry describes, never which entry it is,
 * so anything a conversation already referred to keeps meaning the same Home.
 *
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param homes - the Home service.
 * @param meta - the metadata index over those Homes.
 * @param classes - the class index over the same Homes.
 * @param search - the request's query string, for the one route that has a flag.
 */
async function handleHomes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  homes: YonHomesService,
  meta: YonMetaService,
  classes: YonClassService,
  search: URLSearchParams,
): Promise<void> {
  const id = segments[1]
  const tail = segments[2]

  // /yon/api/homes
  if (id === undefined) {
    if (method === 'GET') {
      sendJson(res, 200, await homes.list())
      return
    }
    if (method === 'POST') {
      const home = await homes.save(homeInputOf(await objectBody(req)))
      sendJson(res, 201, { home })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/homes/<id>
  if (tail === undefined) {
    if (method === 'PUT') {
      const home = await homes.save(homeInputOf(await objectBody(req)), id)
      sendJson(res, 200, { home })
      return
    }
    if (method === 'DELETE') {
      await homes.remove(id)
      sendJson(res, 200, { removed: id })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/homes/<id>/probe
  if (tail === 'probe' && method === 'POST') {
    sendJson(res, 200, { home: await homes.probe(id) })
    return
  }

  // /yon/api/homes/<id>/default
  if (tail === 'default' && method === 'PUT') {
    sendJson(res, 200, { home: await homes.setDefault(id) })
    return
  }

  // /yon/api/homes/<id>/meta-index
  //
  // GET is the status, and `fresh=0` skips the fingerprint comparison — a walk plus a
  // stat per file, measured at 0.61 s. A panel polling a running build wants the progress
  // and not a disk scan per second, so it asks for the cheap answer and takes the full
  // one when it opens and when the build finishes.
  if (tail === 'meta-index') {
    if (method === 'GET') {
      const status = await meta.status(id, search.get('fresh') !== '0')
      sendJson(res, 200, { home: id, status })
      return
    }
    if (method === 'POST') {
      // Returns as soon as the build is queued rather than when it finishes: the panel
      // polls GET for progress, and a request that blocks for minutes is one a proxy
      // will cut. `started: false` means one was already running for this version.
      const handle = await meta.startBuild(id)
      sendJson(res, 202, { home: id, ...handle })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/homes/<id>/class-index
  //
  // No `fresh` flag, unlike the metadata route beside it: this status reads each stored
  // index file's head rather than parsing it (measured 1 ms against 372 ms on an index
  // the size of the reference Home's), so there is no expensive half to skip.
  if (tail === 'class-index') {
    if (method === 'GET') {
      sendJson(res, 200, { home: id, status: await classes.status(id) })
      return
    }
    if (method === 'POST') {
      // Returns as soon as the walk is queued rather than when it finishes: the panel
      // polls GET for progress, and the reference installation's walk is 26.2 s.
      const handle = await classes.startBuild(id)
      sendJson(res, 202, { home: id, ...handle })
      return
    }
    if (method === 'DELETE') {
      // The file is derived and the same block can rebuild it, so this is not the
      // destructive verb the registration's own DELETE is. The answer says whether a
      // file was actually there, because "removed: false" and "removed: true" are
      // different states for a panel to report.
      sendJson(res, 200, { home: id, removed: await classes.remove(id) })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/homes/...`)
}

/**
 * The slice of the harness's directory-picker service this module drives.
 *
 * Declared structurally instead of imported: this plugin is installed as a
 * package outside the harness repository, so it may not depend on a host
 * package — and a host that mounts no picker at all has to degrade to "type the
 * path yourself" rather than fail to load. That is the same seam `webServer`
 * above uses, for the same reason.
 *
 * `kind` is deliberately a plain string. The harness composes one backend per
 * environment (a native chooser on a local desktop, a browser-side listing over
 * SSH or a LAN address) and owns that vocabulary, so a closed union here would be
 * this plugin claiming to know a list it does not. `native` is the one this side
 * implements; every other kind is reported back to the panel as-is and read there
 * as "no chooser to show", which is the rule the harness documents for a shape a
 * consumer does not implement: hide the picking affordance, do not fail.
 */
interface DirectoryPickerLike {
  capability(): {
    readonly kind: string
    pick?(signal: AbortSignal): Promise<string | null>
  }
}

/**
 * Serve `POST /yon/api/pick-directory`: ask the host to open its folder chooser.
 *
 * This has to live on the host because the answer is an absolute path and the
 * browser cannot produce one. `showDirectoryPicker()` returns a handle, and an
 * `<input webkitdirectory>` returns names relative to the picked root; neither
 * yields `E:/NCProject/NCC/jixieyuan/home`. The host's native chooser does, and
 * the operator is sitting at the host — this is a desktop app, so "open a dialog
 * on the server" and "open a dialog in front of me" are the same sentence.
 *
 * An empty `path` means the operator cancelled. That is a normal answer, not an
 * error: the caller leaves the field as it was.
 *
 * @param res - the response.
 * @param method - the HTTP method.
 * @param ctx - the host context, for the picker service.
 */
async function handlePickDirectory(
  res: ServerResponse,
  method: string,
  ctx: Context,
): Promise<void> {
  if (method !== 'POST') {
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  const picker = ctx.get('directoryPicker') as DirectoryPickerLike | undefined
  const capability = picker?.capability()
  // Only `native` is driven here, and that is checked before `pick` is trusted. The
  // harness's other backend lists a directory in the browser instead of opening a
  // dialog, and a `pick` appearing on some future kind promises nothing about what
  // it returns — while this field has to hold an absolute path. Anything else is
  // left alone rather than guessed at, which is the harness's own rule for a shape
  // a consumer does not implement: hide the affordance, do not fail.
  const native = capability?.kind === 'native' ? capability : undefined
  const pick = typeof native?.pick === 'function' ? native.pick.bind(native) : undefined
  if (pick === undefined) {
    // Never echo `native` back without a usable `pick`: the panel shows its button
    // on that one word, so saying it here would offer a control that can never
    // answer. Any other kind is passed through as-is — it is the host's vocabulary,
    // and the panel reads everything but `native` as "type the path".
    //
    // 200 rather than an error status either way: "this host has no chooser" is an
    // answer the form acts on, not a failure it should render as one.
    const kind = capability === undefined || capability.kind === 'native'
      ? 'unavailable'
      : capability.kind
    sendJson(res, 200, { kind } satisfies DirectoryPickResult)
    return
  }

  // A native dialog outlives the request that opened it. If the operator closes
  // the panel while it is up, nothing is left waiting on the answer, so abort the
  // pick instead of leaving an orphaned OS window with no one to receive it.
  const abort = new AbortController()
  const onClose = (): void => { abort.abort() }
  res.on('close', onClose)
  try {
    const path = await pick(abort.signal)
    // `native` literally rather than `native.kind`: reaching here is what makes it
    // native, and a kind that is not is not routed here at all.
    sendJson(res, 200, { kind: 'native', path } satisfies DirectoryPickResult)
  } finally {
    res.off('close', onClose)
  }
}

/**
 * Serve the `/yon/api/wiki` branch.
 *
 * Three groups. Which vaults exist, how big they are, and a rebuild. What the
 * vault's own contents say — its health, a search, one page as a card, and who
 * cites a missing entity. And the registration itself: `/vaults` adds one, edits
 * one, and unlists one, which is the only group here that changes anything.
 *
 * Search lives here rather than being left to the model's `wiki_lookup` because
 * the panel is where somebody looks something up for themselves. Reading a whole
 * page stays the model's business through `wiki_read`: the panel shows cards, and
 * a card is answerable from the index without opening a 70 KB file.
 *
 * The vault paths are returned as they are. They are the operator's own machine
 * paths, the panel displays them, and the operator may edit them — there is no
 * secret in any of this, unlike a datasource password.
 *
 * @param req - the request; read for the rebuild body.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param wiki - the knowledge base service.
 */
async function handleWiki(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  url: URL,
  wiki: YonWikiService,
): Promise<void> {
  const tail = segments[1]

  /** The `vault` query parameter, or undefined when absent or empty. */
  const vaultParam = (): string | undefined => {
    const value = url.searchParams.get('vault')
    return value === null || value === '' ? undefined : value
  }

  /** A `limit`-style query parameter, or undefined when absent or unparsable. */
  const numberParam = (name: string, cap: number): number | undefined => {
    const raw = Number.parseInt(url.searchParams.get(name) ?? '', 10)
    if (!Number.isFinite(raw)) return undefined
    return Math.min(Math.max(raw, 1), cap)
  }

  // /yon/api/wiki
  if (tail === undefined) {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, { vaults: await wiki.list() })
    return
  }

  // /yon/api/wiki/vaults, and /yon/api/wiki/vaults/<id>
  //
  // Registering a vault, which is the panel's own bookkeeping: what these three
  // verbs write is this plugin's `wiki_config.json`. None of them writes a page,
  // and none deletes anything inside a vault, so an id is a row in that file and
  // nothing more. (A save answers with the same view the list builds, so on a
  // directory that already *is* a vault it materialises the derived
  // `wiki/.yon-index.json` the way a read does.) The id is immutable on edit for
  // the same reason a Home's is: a conversation that narrowed a lookup to this
  // vault keeps meaning the same directory.
  if (tail === 'vaults') {
    const id = segments[2]
    if (id === undefined) {
      if (method === 'POST') {
        const vault = await wiki.saveVault(vaultInputOf(await objectBody(req)))
        sendJson(res, 201, { vault })
        return
      }
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    if (method === 'PUT') {
      sendJson(res, 200, { vault: await wiki.saveVault(vaultInputOf(await objectBody(req)), id) })
      return
    }
    if (method === 'DELETE') {
      await wiki.removeVault(id)
      sendJson(res, 200, { removed: id })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/wiki/recent
  if (tail === 'recent') {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, { entries: await wiki.recent(vaultParam(), numberParam('limit', 200)) })
    return
  }

  // /yon/api/wiki/rebuild
  if (tail === 'rebuild') {
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const body = await objectBody(req)
    const vaultId = typeof body.vault === 'string' && body.vault !== '' ? body.vault : undefined
    sendJson(res, 200, { vaults: await wiki.rebuild(vaultId) })
    return
  }

  // /yon/api/wiki/health
  if (tail === 'health') {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const reports = await wiki.health(vaultParam(), numberParam('gaps', 200))
    sendJson(res, 200, { reports })
    return
  }

  // /yon/api/wiki/search
  if (tail === 'search') {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const answer = await wiki.lookup(url.searchParams.get('term') ?? '', vaultParam())
    const limit = numberParam('limit', 200) ?? 40
    sendJson(res, 200, {
      term: answer.term,
      scanned: answer.scanned,
      hits: answer.hits.slice(0, limit).map(hit => ({
        page: hit.page,
        uri: hit.uri,
        name: hit.name,
        ...(hit.table === undefined ? {} : { table: hit.table }),
        ...(hit.app === undefined ? {} : { app: hit.app }),
        level: hit.level,
        ...(hit.fieldCount === undefined ? {} : { fieldCount: hit.fieldCount }),
        matchedBy: hit.matchedBy,
      })),
    })
    return
  }

  // /yon/api/wiki/card
  if (tail === 'card') {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, { card: await wiki.card(url.searchParams.get('page') ?? '', vaultParam()) })
    return
  }

  // /yon/api/wiki/citers
  if (tail === 'citers') {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const uri = url.searchParams.get('uri') ?? ''
    sendJson(res, 200, { uri, pages: await wiki.citers(uri, vaultParam()) })
    return
  }

  sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/wiki/...`)
}

/**
 * Serve the `/yon/api/skills` branch.
 *
 * A skill the operator owns is listed and readable but can never be switched:
 * `setEnabled` accepts only a name this plugin ships, and the service refuses
 * anything else. The panel therefore cannot use this route to disturb a skill
 * living in `~/.agents/skills`.
 * @param req - the request; read for the switch body.
 * @param res - the response.
 * @param method - HTTP method.
 * @param name - the skill-name segment, absent for the collection.
 * @param skills - the skill service.
 */
async function handleSkills(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  name: string | undefined,
  skills: YonSkillsService,
): Promise<void> {
  if (name === undefined) {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, await skills.list())
    return
  }
  if (method === 'GET') {
    const skill = await skills.read(name)
    if (skill === undefined) {
      sendFailure(res, 404, 'not-found', `no skill "${name}"`)
      return
    }
    sendJson(res, 200, { skill })
    return
  }
  if (method === 'PATCH') {
    const body = await objectBody(req)
    if (typeof body.enabled !== 'boolean') {
      throw new SkillError('invalid-input', 'body must carry a boolean "enabled"')
    }
    sendJson(res, 200, { skill: await skills.setEnabled(name, body.enabled) })
    return
  }
  sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
}

/**
 * Register the project, skill and datasource APIs on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the project store to expose.
 * @param skills - the skill service to expose.
 * @param sources - the datasource service to expose.
 * @param wiki - the knowledge base service to expose.
 * @returns the disposer removing the route.
 */
/**
 * Serve the `/yon/api/digest` branch.
 *
 * The digestion checker's own ledger, read-only. It answers what the checker has
 * been asked and how those answers went — which is exactly what a report shown
 * once inside a session cannot tell you afterwards.
 *
 * Nothing here writes: the ledger is appended by the tools themselves, and a
 * browser tab has no business adding a verdict it did not compute.
 *
 * @param res - the response.
 * @param method - the HTTP method.
 * @param segments - path segments after the prefix.
 * @param url - the parsed request URL, for the query parameters.
 * @param log - the ledger.
 */
async function handleDigest(
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  url: URL,
  log: DigestLog,
): Promise<void> {
  if (method !== 'GET') {
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }
  const num = (name: string, max: number): number | undefined => {
    const raw = url.searchParams.get(name)
    if (raw === null || raw === '') return undefined
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return undefined
    return Math.min(Math.floor(value), max)
  }
  const tail = segments[1]

  // /yon/api/digest/summary
  if (tail === 'summary') {
    const recent = num('recent', 200) ?? 50
    const window = num('window', 1000) ?? 100
    sendJson(res, 200, { summary: await log.summary(recent, window), path: digestLogPath() })
    return
  }

  // /yon/api/digest/log  （也是这一段默认的取法）
  if (tail === 'log' || tail === undefined) {
    const limit = num('limit', 2000) ?? 200
    sendJson(res, 200, { entries: await log.read(limit), path: digestLogPath() })
    return
  }

  sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/digest/...`)
}

/**
 * 一张字面量表里的成员，或 undefined。
 *
 * 这些值从 URL 进来，是任意字符串。传下去也不会出错——`list()` 拿它做等值比较，
 * 比不中就返回空——但那样一个拼错的 `?status=opne` 会安静地显示「什么都没有」，
 * 而真相是没人叫这个名字。所以在这里挡一次，并说清有哪些。
 */
function memberOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (value === null || value === '') return undefined
  return (allowed as readonly string[]).includes(value) ? value as T : undefined
}

/**
 * Serve the `/yon/api/iterations` branch.
 *
 * The operator's side of the iteration ledger: read it, triage a row, edit a note by
 * hand, delete one. Nothing here is reachable by the model — its own two tools stop
 * at append, and the reasoning for that split is in `iteration-tools.ts`.
 *
 * `DELETE` removes a row outright rather than marking it. A ledger holds a few dozen
 * notes and an operator who wants one gone means gone; the panel asks twice before
 * calling this, which is where the safety belongs, not in a tombstone.
 *
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param url - the parsed request URL, for the query parameters.
 * @param iteration - the ledger service.
 */
async function handleIterations(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  url: URL,
  iteration: YonIterationService,
): Promise<void> {
  const id = segments[1]

  // /yon/api/iterations
  if (id === undefined) {
    if (method === 'GET') {
      // An unknown filter is refused rather than silently answered with an empty
      // list — see {@link memberOf}.
      const rawStatus = url.searchParams.get('status')
      const status = memberOf(rawStatus, [...ITERATION_STATUSES, 'all'])
      if (rawStatus !== null && rawStatus !== '' && status === undefined) {
        throw new IterationError('invalid-input',
          `status 只能是 ${[...ITERATION_STATUSES, 'all'].join(' / ')}`)
      }
      const rawKind = url.searchParams.get('kind')
      const kind = memberOf(rawKind, ITERATION_KINDS)
      if (rawKind !== null && rawKind !== '' && kind === undefined) {
        throw new IterationError('invalid-input', `kind 只能是 ${ITERATION_KINDS.join(' / ')}`)
      }
      sendJson(res, 200, await iteration.list({
        ...status === undefined ? {} : { status },
        ...kind === undefined ? {} : { kind },
      }))
      return
    }
    if (method === 'POST') {
      const body = await objectBody(req)
      const kind = memberOf(typeof body.kind === 'string' ? body.kind : null, ITERATION_KINDS)
      if (kind === undefined) {
        throw new IterationError('invalid-input', `kind 只能是 ${ITERATION_KINDS.join(' / ')}`)
      }
      const severity = memberOf(typeof body.severity === 'string' ? body.severity : null, ITERATION_SEVERITIES)
      if (body.severity !== undefined && severity === undefined) {
        throw new IterationError('invalid-input', `severity 只能是 ${ITERATION_SEVERITIES.join(' / ')}`)
      }
      const { row, created } = await iteration.create({
        kind,
        symptom: typeof body.symptom === 'string' ? body.symptom : '',
        ...severity === undefined ? {} : { severity },
        scene: typeof body.scene === 'string' ? body.scene : '',
        suggestion: typeof body.suggestion === 'string' ? body.suggestion : '',
        target: typeof body.target === 'string' ? body.target : '',
        context: typeof body.context === 'string' ? body.context : '',
      })
      sendJson(res, 201, { row, created })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/iterations/<id>
  if (method === 'PATCH') {
    const body = await objectBody(req)
    const status = memberOf(typeof body.status === 'string' ? body.status : null, ITERATION_STATUSES)
    if (body.status !== undefined && status === undefined) {
      throw new IterationError('invalid-input', `status 只能是 ${ITERATION_STATUSES.join(' / ')}`)
    }
    const severity = memberOf(typeof body.severity === 'string' ? body.severity : null, ITERATION_SEVERITIES)
    if (body.severity !== undefined && severity === undefined) {
      throw new IterationError('invalid-input', `severity 只能是 ${ITERATION_SEVERITIES.join(' / ')}`)
    }
    if (status === undefined && severity === undefined) {
      throw new IterationError('invalid-input', '这条改动里没有 status 也没有 severity')
    }
    sendJson(res, 200, {
      row: await iteration.update(id, {
        ...status === undefined ? {} : { status },
        ...severity === undefined ? {} : { severity },
      }),
    })
    return
  }
  if (method === 'DELETE') {
    sendJson(res, 200, { removed: await iteration.remove(id) })
    return
  }
  sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
}

/**
 * Serve the `/yon/api/memories` branch.
 *
 * The operator's side of the project memory bank, and the one thing that makes it
 * lopsided: **there is no create and no update here.** A memory is what somebody found
 * out about a project, and there is no way to type "what we found out" into a form
 * without inventing it — the model writes those, through its own four tools
 * (`memory-tools.ts`). What a person does with a wrong memory is delete it, or say so
 * in the conversation and let the model correct it.
 *
 * `DELETE` removes the file outright rather than marking it. The bank holds a few
 * dozen memories per project, and an operator who wants one gone means gone; the panel
 * asks twice before calling this, which is where the safety belongs, not in a
 * tombstone. There is no status to mark it with — see `docs/yon-memory-design.md` §3.
 *
 * @param req - the request; unused, kept for the signature its siblings share.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param url - the parsed request URL, for the query parameters.
 * @param memory - the memory service.
 */
async function handleMemories(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  url: URL,
  memory: YonMemoryService,
): Promise<void> {
  void req
  const id = segments[1]

  // /yon/api/memories
  if (id === undefined) {
    if (method === 'GET') {
      // An unknown filter is refused rather than silently answered with an empty list
      // — see {@link memberOf}. An empty screen that means "you typed the type wrong"
      // is the one failure this screen cannot afford.
      const rawType = url.searchParams.get('type')
      const type = memberOf(rawType, MEMORY_TYPES)
      if (rawType !== null && rawType !== '' && type === undefined) {
        throw new MemoryError('invalid-input', `type 只能是 ${MEMORY_TYPES.join(' / ')}`)
      }
      const project = url.searchParams.get('project')
      const tag = url.searchParams.get('tag')
      const query = url.searchParams.get('query')
      sendJson(res, 200, await memory.list({
        ...project === null || project === '' ? {} : { project },
        ...type === undefined ? {} : { type },
        ...tag === null || tag === '' ? {} : { tag },
        ...query === null || query === '' ? {} : { query },
      }))
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // /yon/api/memories/<id>
  if (method === 'GET') {
    sendJson(res, 200, { memory: await memory.read(id) })
    return
  }
  if (method === 'DELETE') {
    sendJson(res, 200, { removed: await memory.remove(id) })
    return
  }
  sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
}

/**
 * Serve the `/yon/api/requirements` branch.
 *
 * Every route here is the panel's, not the model's: the model reaches this ledger
 * through its own tools (`requirement-tools.ts`), which is where the name-conflict
 * handshake and the approval gate live. That is why `POST` does not take a
 * `dedupe` flag — a person typing the same words twice gets two entries, and the
 * reason is theirs (see `requirement-service.ts`, rule 3).
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param url - the request URL, read for `?project=`, `?status=`, `?history=`.
 * @param requirements - the ledger service.
 */
async function handleRequirements(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  url: URL,
  requirements: YonRequirementsService,
): Promise<void> {
  const id = segments[1]
  const tail = segments[2]

  // /yon/api/requirements
  if (id === undefined) {
    if (method === 'GET') {
      // An unknown filter is refused rather than silently answered with an empty
      // list — the same rule `handleIterations` applies, for the same reason.
      const project = url.searchParams.get('project')
      const rawStatus = url.searchParams.get('status')
      const status = memberOf(rawStatus, REQUIREMENT_STATUSES)
      if (rawStatus !== null && rawStatus !== '' && status === undefined) {
        throw new RequirementError('invalid-input', `status 只能是 ${REQUIREMENT_STATUSES.join(' / ')}`)
      }
      sendJson(res, 200, await requirements.list({
        ...project === null || project === '' ? {} : { projectId: project },
        ...status === undefined ? {} : { status },
      }))
      return
    }
    if (method === 'POST') {
      const body = await objectBody(req)
      const status = memberOf(typeof body.status === 'string' ? body.status : null, REQUIREMENT_STATUSES)
      if (body.status !== undefined && status === undefined) {
        throw new RequirementError('invalid-input', `status 只能是 ${REQUIREMENT_STATUSES.join(' / ')}`)
      }
      // `projectId`, not a project name: the panel already holds the list and picks
      // by id, and accepting a second spelling here would be a second way to spell
      // one request (the reason `ref` is a tool-side concern).
      sendJson(res, 201, await requirements.create({
        projectId: typeof body.projectId === 'string' ? body.projectId : '',
        name: typeof body.name === 'string' ? body.name : '',
        body: typeof body.body === 'string' ? body.body : '',
        ...status === undefined ? {} : { status },
      }))
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }

  // The sub-resources are decided before `id` is used as an id, so a spelling like
  // `/requirements/archive` can never be read as an entry named "archive". The same
  // rule `pick-directory` forced at `:1196`.
  if (tail === 'annotations') {
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const body = await objectBody(req)
    const requirement = await requirements.annotate(id, typeof body.text === 'string' ? body.text : '')
    sendJson(res, 201, { requirement })
    return
  }
  if (tail === 'archive') {
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    // The body is optional here: archiving without a reason is a complete request.
    const body = await optionalObjectBody(req)
    const requirement = await requirements.archive(
      id,
      typeof body.reason === 'string' ? body.reason : undefined,
    )
    sendJson(res, 200, { requirement })
    return
  }
  if (tail === 'files') {
    // `segments[3]` is the file name — decoded by `segmentsOf` like every other
    // segment, so a Chinese name arrives as itself. An empty one (`…/files/`) reads
    // as absent, because a trailing slash is a spelling of the folder, not a file
    // named "".
    const named = segments[3]
    const name = named === undefined || named === '' ? undefined : named
    const dir = url.searchParams.get('dir')
    if (name === undefined) {
      if (method === 'GET') {
        sendJson(res, 200, await requirements.fileList(id, dir === null || dir === '' ? undefined : dir))
        return
      }
      if (method === 'POST') {
        const header = req.headers['x-yon-file-name']
        const encoded = typeof header === 'string' ? header : ''
        if (encoded === '') {
          throw new RequirementError(
            'invalid-input',
            '上传要带 x-yon-file-name 头，值是 URL 编码过的文件名。',
          )
        }
        let fileName: string
        try {
          fileName = decodeURIComponent(encoded)
        } catch {
          throw new RequirementError('invalid-input', 'x-yon-file-name 不是合法的 URL 编码。')
        }
        const bytes = await readAttachmentBody(req)
        sendJson(res, 201, await requirements.importFile(
          id,
          dir === null || dir === '' ? 'user' : dir,
          fileName,
          bytes,
        ))
        return
      }
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    if (method === 'GET') {
      // `?version=N` reads the N-th archived version instead of the current file.
      // Only `generated/` and `patches/` keep history — `user/` never overwrites.
      const raw = url.searchParams.get('version')
      const parsed = raw === null || raw === '' ? Number.NaN : Number.parseInt(raw, 10)
      sendJson(res, 200, await requirements.fileRead(
        id,
        dir === null || dir === '' ? 'user' : dir,
        name,
        Number.isInteger(parsed) ? parsed : undefined,
      ))
      return
    }
    if (method === 'DELETE') {
      // Wrapped the same way the entry's own DELETE wraps its answer, so a client
      // reading `removed` is reading the same field on both routes.
      sendJson(res, 200, {
        removed: await requirements.removeFile(id, dir === null || dir === '' ? 'user' : dir, name),
      })
      return
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
    return
  }
  if (tail !== undefined) {
    sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`)
    return
  }

  // /yon/api/requirements/<id>
  if (method === 'GET') {
    const requirement = await requirements.read(id, { history: url.searchParams.get('history') === '1' })
    sendJson(res, 200, { requirement })
    return
  }
  if (method === 'PATCH') {
    const body = await objectBody(req)
    const status = memberOf(typeof body.status === 'string' ? body.status : null, REQUIREMENT_STATUSES)
    if (body.status !== undefined && status === undefined) {
      throw new RequirementError('invalid-input', `status 只能是 ${REQUIREMENT_STATUSES.join(' / ')}`)
    }
    if (body.name === undefined && status === undefined) {
      throw new RequirementError('invalid-input', '这条改动里没有 name 也没有 status')
    }
    const requirement = await requirements.update(id, {
      ...body.name === undefined ? {} : { name: String(body.name) },
      ...status === undefined ? {} : { status },
    })
    sendJson(res, 200, { requirement })
    return
  }
  if (method === 'DELETE') {
    sendJson(res, 200, { removed: await requirements.remove(id) })
    return
  }
  sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
}

/**
 * Read a body that is allowed to be absent, treating "no body at all" as `{}`.
 *
 * Distinct from {@link objectBody}, which refuses a missing body. On the launch route
 * every member means "use what this row remembers", so a request that sends nothing is
 * complete rather than malformed, and refusing it would be a second way to spell the
 * same request.
 * @param req - the request.
 * @returns the parsed object, or an empty one.
 */
async function optionalObjectBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJsonBody(req)
  if (body === undefined) return {}
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BrowserError('invalid-input', 'body must be a JSON object')
  }
  return body as Record<string, unknown>
}

/**
 * Read one optional text member.
 *
 * Absent and `null` both mean "leave it alone". A present-but-not-text member is refused
 * here rather than passed on: the service normalises these with `toForwardSlashes`, which
 * would take a number and answer a 500 for it.
 * @param body - the parsed request body.
 * @param key - the member to read.
 * @returns the text, or undefined when the caller did not say.
 */
function optionalText(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new BrowserError('invalid-input', `「${key}」要是一段文字；收到的是 ${typeof value}。`)
  }
  return value
}

/**
 * Read the port member as a number.
 *
 * Digits only, so `9222abc` is refused instead of being read as 9222. The range itself is
 * the service's business and is not repeated here — one place that says what a port may
 * be, and one wording for it.
 * @param body - the parsed request body.
 * @returns the number, or undefined when the caller did not say.
 */
function optionalPort(body: Record<string, unknown>): number | undefined {
  const value = body.port
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d+$/.test(text)) {
    throw new BrowserError('invalid-input', `「port」要是一个数字；收到的是「${String(value)}」。`)
  }
  return Number.parseInt(text, 10)
}

/**
 * Read the four members `PUT /yon/api/browsers/<id>` accepts.
 *
 * Absent means "leave it as it is", which is why none of them defaults to the empty
 * string: an empty string is itself a value — blank a profile directory and it goes back
 * to the default — so the two must not be spelled the same way.
 *
 * `id`/`family`/`product` are not read at all rather than refused. They decide the launch
 * arguments and the probe, so letting a body change one would swap the row for a
 * different thing while its profile directory stayed put; dropping them means a body that
 * carries them writes the row it already had.
 * @param body - the parsed request body.
 * @returns the input the service reads.
 */
function browserPatchOf(body: Record<string, unknown>): SaveBrowserInput {
  const path = optionalText(body, 'path')
  const profileDir = optionalText(body, 'profileDir')
  const startUrl = optionalText(body, 'startUrl')
  const port = optionalPort(body)
  return {
    ...path === undefined ? {} : { path },
    ...profileDir === undefined ? {} : { profileDir },
    ...port === undefined ? {} : { port },
    ...startUrl === undefined ? {} : { startUrl },
  }
}

/**
 * Read the three members `POST /yon/api/browsers/<id>/launch` accepts.
 *
 * The same three the row remembers, and nothing else — there is no launch argument a
 * request can supply that the registration does not already hold, deliberately, so a
 * launch cannot be aimed at a browser other than the one it names.
 * @param body - the parsed request body.
 * @returns the input the service reads.
 */
function launchInputOf(body: Record<string, unknown>): LaunchBrowserInput {
  const port = optionalPort(body)
  const startUrl = optionalText(body, 'startUrl')
  const profileDir = optionalText(body, 'profileDir')
  return {
    ...port === undefined ? {} : { port },
    ...startUrl === undefined ? {} : { startUrl },
    ...profileDir === undefined ? {} : { profileDir },
  }
}

/**
 * Serve the `/yon/api/browsers` branch.
 *
 * Registrations are addressed by the id their recipe gave them, and that id is not
 * editable: it names the profile directory on disk, so changing it would orphan one. The
 * same convention a datasource key and a Home id follow.
 *
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param browsers - the browser service.
 */
async function handleBrowsers(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  segments: readonly string[],
  browsers: YonBrowsersService,
): Promise<void> {
  const first = segments[1]
  const second = segments[2]
  const third = segments[3]

  // /yon/api/browsers
  if (first === undefined) {
    if (method !== 'GET') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, await browsers.list())
    return
  }

  // /yon/api/browsers/scan
  if (first === 'scan') {
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, await browsers.scan())
    return
  }

  // /yon/api/browsers/runs/<runId>/stop
  //
  // Read before `first` is taken as a browser id, and it has to be: an id is opaque at
  // this layer, so nothing below could tell the word `runs` from a browser actually named
  // that. This repo has been here before — see the note on `pick-directory` further down.
  if (first === 'runs') {
    if (second === undefined || third !== 'stop') {
      sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/browsers/runs/...`)
      return
    }
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, await browsers.stop(second))
    return
  }

  // /yon/api/browsers/<id>
  if (second === undefined) {
    if (method !== 'PUT') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    sendJson(res, 200, { browser: await browsers.save(first, browserPatchOf(await objectBody(req))) })
    return
  }

  // /yon/api/browsers/<id>/launch
  //
  // `third === undefined` is part of the match: without it, `/edge/launch/now` would
  // launch, and a URL this layer does not serve would be answered as though it did.
  if (second === 'launch' && third === undefined) {
    if (method !== 'POST') {
      sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`)
      return
    }
    const input = launchInputOf(await optionalObjectBody(req))
    // 201, and `ready:false` is still a 201: the port not answering yet is not the same
    // statement as the launch having failed, and only an exiting process is that.
    sendJson(res, 201, { run: await browsers.launch(first, input) })
    return
  }

  sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/browsers/...`)
}

export function registerYonApi(
  ctx: Context,
  service: YonProjectsService,
  skills: YonSkillsService,
  sources: YonDataSourcesService,
  wiki: YonWikiService,
  digestLog: DigestLog,
  homes: YonHomesService,
  meta: YonMetaService,
  classes: YonClassService,
  iteration: YonIterationService,
  browsers: YonBrowsersService,
  requirements: YonRequirementsService,
  memory: YonMemoryService,
): () => void {
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
        if (segments === undefined) {
          sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`)
          return
        }
        if (segments[0] === 'skills') {
          await handleSkills(req, res, method, segments[1], skills)
          return
        }
        if (segments[0] === 'datasources') {
          await handleDataSources(req, res, method, segments, sources)
          return
        }
        if (segments[0] === 'wiki') {
          await handleWiki(req, res, method, segments, url, wiki)
          return
        }
        if (segments[0] === 'digest') {
          await handleDigest(res, method, segments, url, digestLog)
          return
        }
        if (segments[0] === 'iterations') {
          await handleIterations(req, res, method, segments, url, iteration)
          return
        }
        if (segments[0] === 'homes') {
          await handleHomes(req, res, method, segments, homes, meta, classes, url.searchParams)
          return
        }
        if (segments[0] === 'browsers') {
          await handleBrowsers(req, res, method, segments, browsers)
          return
        }
        if (segments[0] === 'requirements') {
          await handleRequirements(req, res, method, segments, url, requirements)
          return
        }
        if (segments[0] === 'memories') {
          await handleMemories(req, res, method, segments, url, memory)
          return
        }
        // A segment of its own, not `/homes/pick-directory`: `handleHomes` reads
        // `segments[1]` as an id, so that spelling would be a "no Home named
        // pick-directory" 404 long before any picker ran.
        if (segments[0] === 'pick-directory') {
          await handlePickDirectory(res, method, ctx)
          return
        }
        if (segments[0] !== 'projects') {
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
          if (
            error instanceof ProjectError
            || error instanceof SkillError
            || error instanceof DataSourceError
            || error instanceof WikiError
            || error instanceof HomeError
            || error instanceof IterationError
            || error instanceof BrowserError
            || error instanceof RequirementError
            || error instanceof MemoryError
          ) {
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
