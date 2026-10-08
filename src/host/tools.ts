/**
 * The project store, exposed to the agent as tools.
 *
 * Why tools and not an LLM call inside this plugin: the model that reads
 * "把用友项目的环境信息改成 10.0.0.9" is the one the operator is already talking
 * to, and the agent loop already owns prompting, model choice, credentials,
 * retries, and the transcript. Handing it tools means this package carries no
 * model client at all, and the operator keeps one place where the work is
 * visible and auditable.
 *
 * Every write asks first. The gate is the framework's own `tools/pre-execute`
 * decision: returning `{kind:'ask'}` runs the call only after the approval
 * service answers `allowed-once`, so the preview below is what the operator
 * approves — and a call a person never saw cannot change their data.
 *
 * The tools speak the operator's vocabulary, not the schema's: a project may be
 * named by id, name, or code, and each preview is written as the diff a person
 * would check before saying yes.
 *
 * The registry contract is declared here rather than imported. The harness's
 * tool package publishes no installable dependency for a third-party plugin
 * (its dependency graph reaches a package that is not on the registry), and a
 * plugin that pinned one release's copy would be asserting a version it cannot
 * verify against the deployment actually running. The declarations below are the
 * documented shape the registry calls, and nothing more.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue, MemorySummary, ProjectDetail, ProjectStatus, ProjectSummary } from '../shared/types.ts'
import { MEMORY_TYPE_TEXT, PROJECT_STATUSES } from '../shared/types.ts'
import { ProjectError, type ProjectRefResolution, type YonProjectsService } from './service.ts'
// Type-only, so the arrow stays one-way: `memory-service.ts` imports `locate` and
// `asRef` from here at runtime, and a value import back would close the cycle.
import type { YonMemoryHints } from './memory-service.ts'

/** One content block this package produces: text, always. */
export interface YonTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The pending-state card a UI renders for one call. */
export interface YonToolCallView {
  readonly card: 'generic'
  readonly title: string
  readonly kind: 'read' | 'other'
  readonly rawInput?: unknown
}

/**
 * The slice of a session this package reads: its committed event log.
 *
 * The permission knobs live in that log (`sandbox/mode`, `approval/policy`)
 * rather than behind a service this plugin would have to depend on, and reading
 * the newest value of each is how a write learns what its session permits.
 */
export interface YonSessionLike {
  readonly seq: number
  eventAt(seq: number): { readonly type: string; readonly data?: unknown } | undefined
}

/** The slice of an agent a tool call carries. */
export interface YonAgentLike {
  readonly session?: YonSessionLike
}

/** Identity and cancellation of one running tool call. */
export interface YonToolExecution {
  /** The registered tool being called. */
  readonly name: string
  /** Model-supplied arguments, unvalidated: each tool validates its own. */
  readonly arguments: unknown
  readonly callId: string
  readonly signal: AbortSignal
  /** The agent on whose behalf the call runs; absent for a direct dispatch. */
  readonly agent?: YonAgentLike
}

/** One tool definition, as the registry consumes it. */
export interface YonToolDefinition {
  readonly name: string
  readonly description: string
  /** JSON Schema of the argument object the model must supply. */
  readonly parameters: Record<string, unknown>
  readonly output: {
    /** JSON Schema of the value `execute` returns. */
    readonly schema: Record<string, unknown>
    /** Project one successful value into the model-facing content. */
    render(args: unknown, value: unknown): YonTextBlock[]
  }
  /** Run one accepted call; the returned value must match `output.schema`. */
  execute(args: unknown, exec: YonToolExecution): Promise<unknown>
  /** Presentation of the pending call, derived from its arguments alone. */
  presentCall?(args: unknown): YonToolCallView | undefined
}

/** What a pre-execute listener may decide about one call. */
export type YonPreToolDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'ask'; readonly reason?: string }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The tool registry, mounted by the harness's own tool runtime. */
    tools: {
      register(definition: YonToolDefinition): () => void
    }
  }
  interface Events {
    /**
     * Waterfall deciding whether one tool call runs. `ask` runs the call only
     * after an approval service answers `allowed-once`, and fails closed
     * otherwise.
     */
    'tools/pre-execute'(
      exec: YonToolExecution,
      next: () => Promise<YonPreToolDecision>,
    ): Promise<YonPreToolDecision> | YonPreToolDecision
  }
}

/** Every tool this package owns, in the order a caller should reach for them. */
export const YON_TOOL_NAMES = [
  'project_list',
  'project_read',
  'project_create',
  'project_update',
  'project_delete',
] as const

/** The subset that changes stored data; the gate inspects each of these. */
export const YON_WRITE_TOOL_NAMES = ['project_create', 'project_update', 'project_delete'] as const

const WRITE_TOOLS: ReadonlySet<string> = new Set<string>(YON_WRITE_TOOL_NAMES)

/** How many characters of a value the previews show before eliding. */
const PREVIEW_LIMIT = 80

/** Copy for one status, as the operator reads it. */
const STATUS_TEXT: Record<ProjectStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  done: '已完成',
}

/** The stored fields of one project, as JSON Schema and as prose. */
const FIELDS_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description: 'Field values keyed by the field name the operator uses.',
} as const

/** One project as a list reads it. */
const SUMMARY_PROPERTIES = {
  project_id: { type: 'string', description: 'Stable identity; pass this back as `project`.' },
  name: { type: 'string' },
  code: { type: 'string', description: 'Short code; empty when the operator left it unset.' },
  status: { type: 'string', enum: PROJECT_STATUSES },
  archived: { type: 'boolean', description: 'Archived projects stay readable but leave pickers.' },
  field_count: { type: 'integer' },
} as const

/** One project with its dynamic fields. */
const DETAIL_PROPERTIES = {
  ...SUMMARY_PROPERTIES,
  fields: FIELDS_SCHEMA,
} as const

const LIST_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['matched', 'projects'],
  properties: {
    matched: { type: 'integer', description: 'How many projects the query matched.' },
    projects: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: Object.keys(SUMMARY_PROPERTIES), properties: SUMMARY_PROPERTIES },
    },
  },
} as const

const DETAIL_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['project'],
  properties: {
    project: { type: 'object', additionalProperties: false, required: Object.keys(DETAIL_PROPERTIES), properties: DETAIL_PROPERTIES },
  },
} as const

/**
 * What one memory costs the injection: three fields, and not one more.
 *
 * The list is a signpost, not the memory. Anything added here is paid for on every
 * `project_read` in every session — the body is a `memory_read` away, and the recall
 * line only has to be recognisable enough to decide whether to go and get it.
 */
const MEMORY_HINT_PROPERTIES = {
  id: { type: 'string', description: 'Pass this to `memory_read`.' },
  type: { type: 'string' },
  title: { type: 'string' },
} as const

/**
 * `project_read`'s value: the project, plus this project's newest memories.
 *
 * A separate schema from {@link DETAIL_VALUE} rather than an extra optional field, so
 * that the injection's absence is visible in the contract. `project_create` and
 * `project_update` return a project and nothing else, and widening their value would
 * make a memory list that is always empty look like a promise.
 */
const READ_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['project', 'memories'],
  properties: {
    project: { type: 'object', additionalProperties: false, required: Object.keys(DETAIL_PROPERTIES), properties: DETAIL_PROPERTIES },
    memories: {
      type: 'array',
      description: 'This project\'s newest memories, newest first. Read one with `memory_read`.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(MEMORY_HINT_PROPERTIES),
        properties: MEMORY_HINT_PROPERTIES,
      },
    },
  },
} as const

/** How many memories one `project_read` carries. Titles only; five costs about a hundred characters. */
const MEMORY_HINT_LIMIT = 5

const UPDATE_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['project', 'changes'],
  properties: {
    project: { type: 'object', additionalProperties: false, required: Object.keys(DETAIL_PROPERTIES), properties: DETAIL_PROPERTIES },
    changes: {
      type: 'array',
      description: 'What this call actually changed, one line each.',
      items: { type: 'string' },
    },
  },
} as const

const DELETE_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['removed', 'removed_fields'],
  properties: {
    removed: { type: 'string', description: 'Name of the project that is gone.' },
    removed_fields: { type: 'integer' },
  },
} as const

/** The value one project contributes to a tool result. */
interface ProjectValue {
  readonly project_id: string
  readonly name: string
  readonly code: string
  readonly status: ProjectStatus
  readonly archived: boolean
  readonly field_count: number
  readonly fields: Record<string, JsonValue>
}

/** Project a stored detail onto the value the tools return. */
function projectValue(project: ProjectDetail): ProjectValue {
  return {
    project_id: project.projectId,
    name: project.name,
    code: project.code,
    status: project.status,
    archived: project.archived,
    field_count: project.fieldCount,
    fields: project.fields,
  }
}

/** Render one value the way a person writes it down. */
function brief(value: JsonValue | undefined): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return ''
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text
}

/** One text block, which is all any of these tools returns. */
function textOf(content: string): YonTextBlock[] {
  return [{ type: 'text', text: content }]
}

/** Define one tool over the registry's contract. */
function defineYonTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  /** Model-facing text for one successful value. */
  render(value: V): string
  execute(args: Record<string, unknown>, exec: YonToolExecution): Promise<V>
  presentCall?(args: Record<string, unknown>): YonToolCallView
}): YonToolDefinition {
  const definition: YonToolDefinition = {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => textOf(spec.render(value as V)),
    },
    async execute(args: unknown, exec: YonToolExecution): Promise<unknown> {
      // The registry hands over the model's arguments untouched, so a malformed
      // call is refused here with a message the model can act on.
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new ProjectError('invalid-input', `${spec.name} expects an object of arguments`)
      }
      if (exec.signal.aborted) throw new ProjectError('invalid-input', `${spec.name} was cancelled`)
      return await spec.execute(args as Record<string, unknown>, exec)
    },
  }
  if (spec.presentCall !== undefined) {
    definition.presentCall = (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall?.(args as Record<string, unknown>)
  }
  return definition
}

/** Read an argument as a field map, refusing anything that is not an object. */
function asFieldMap(value: unknown, argument: string): Record<string, JsonValue> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectError('invalid-input', `${argument} must be an object of field name to value`)
  }
  return value as Record<string, JsonValue>
}

/**
 * Read an argument as a required project reference.
 *
 * Exported for the other tool families that name a project (`requirement-tools.ts`),
 * so the wording a caller gets for a missing reference is the same wherever it is
 * asked for.
 */
export function asRef(value: unknown, argument = 'project'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectError('invalid-input', `${argument} must be a project id, name, or code`)
  }
  return value.trim()
}

/**
 * Resolve a reference or explain why it could not be resolved.
 *
 * Exported alongside {@link asRef} for the same reason: a second family resolving
 * project names would otherwise grow a second copy of the ambiguous/not-found
 * wording, and the two copies would disagree the first time either changed.
 */
export function locate(projects: YonProjectsService, ref: string): ProjectDetail {
  const resolution: ProjectRefResolution = projects.resolve(ref)
  if (resolution.kind === 'found') return resolution.project
  if (resolution.kind === 'ambiguous') {
    const names = resolution.candidates.map(candidate => `"${candidate.name}" (${candidate.projectId})`)
    throw new ProjectError(
      'invalid-input',
      `"${ref}" matches ${resolution.candidates.length} projects: ${names.join(', ')}; pass the project_id`,
    )
  }
  throw new ProjectError('not-found', `no project matches "${ref}"`)
}

/** One project line for the model's list answer. */
function summarize(project: ProjectValue): string {
  const parts = [project.name]
  if (project.code !== '') parts.push(`[${project.code}]`)
  parts.push(`(${STATUS_TEXT[project.status]}, ${project.field_count} 个字段${project.archived ? ', 已归档' : ''})`)
  parts.push(project.project_id)
  return parts.join(' ')
}

/** One line describing a project column this call changed. */
function columnChange(column: string, value: unknown, before: ProjectDetail): string {
  switch (column) {
    case 'name':
      return `名称已改为「${String(value)}」`
    case 'code':
      return String(value) === '' ? '编码已清空' : `编码已改为「${String(value)}」`
    case 'status':
      return `状态已改为「${STATUS_TEXT[value as ProjectStatus] ?? String(value)}」`
    case 'archived':
      return value === true ? '已归档' : '已恢复'
    default:
      return `${column} 已更新（原值 ${brief(before[column as keyof ProjectDetail] as JsonValue)}）`
  }
}

/** The model-facing text of one project and its fields. */
function projectText(value: ProjectValue): string {
  const entries = Object.entries(value.fields)
  return [
    `${value.name}${value.code === '' ? '' : ` [${value.code}]`}`,
    `id: ${value.project_id}`,
    `status: ${value.status}${value.archived ? ' (archived)' : ''}`,
    ...entries.length === 0
      ? ['  (没有字段)']
      : entries.map(([fieldKey, field]) => `  ${fieldKey} = ${brief(field)}`),
  ].join('\n')
}

/** One memory as `project_read`'s answer carries it: enough to decide whether to read it. */
interface MemoryHintValue {
  readonly id: string
  readonly type: string
  readonly title: string
}

/**
 * The memory block one `project_read` answer ends with, or nothing at all.
 *
 * The empty case is the important one. A project with no memories gets no header, no
 * list and no 「（暂无）」: a line saying "there is nothing here" on every read of every
 * project is noise, and noise on the reads that carry nothing is what teaches a reader
 * to skim the reads that carry something.
 */
function memoryLines(memories: readonly MemoryHintValue[]): readonly string[] {
  if (memories.length === 0) return []
  return [
    '',
    `这个项目的记忆（${memories.length} 条；memory_read 读全文，memory_recall 按关键词查）：`,
    ...memories.map(hint =>
      `· [${MEMORY_TYPE_TEXT[hint.type as MemorySummary['type']] ?? hint.type}] ${hint.title} (${hint.id})`),
  ]
}

/**
 * Whether one write destroys something.
 *
 * The split the operator asked for is not "which tool" but "what would be lost":
 * a change that only adds or updates is cheap to make and cheap to notice — the
 * result lists exactly what changed — while removing a field, deleting a project
 * or archiving it out of the default list is neither. Creating a project
 * destroys nothing.
 * @param name - the tool being called.
 * @param args - the arguments of that call.
 * @returns true when running the call could lose data.
 */
export function isDestructiveWrite(name: string, args: unknown): boolean {
  if (name === 'project_delete') return true
  // The requirement family answers here too. Its gate is registered by
  // `requirement-tools.ts`, but the ruling belongs to one function: "what would be
  // lost" is one question, and a family that kept its own copy is a family whose
  // copy could drift from this one.
  if (name === 'requirement_update' || name === 'requirement_archive') return true
  if (name === 'requirement_create') {
    // A create loses nothing unless the caller is knowingly duplicating a name in
    // use, and the only half of that this function can judge is the flag: whether
    // the name really is in use lives on disk, where `requirement-service.ts`
    // decides it and hands back the entry it collided with. So presence is what is
    // checked here, and the tool verifies the value names the entry that actually
    // conflicts before anything is written.
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return true
    const acknowledged = (args as Record<string, unknown>).acknowledgeDuplicate
    return typeof acknowledged === 'string' && acknowledged.trim() !== ''
  }
  // Everything else in that family is additive (annotate, artifact_write) or a
  // read. A new requirement tool that could lose data must be named above, or it
  // will be treated as harmless here.
  if (name.startsWith('requirement_')) return false
  // The memory bank answers here too, and for the same reason: "what would be lost" is
  // one question, and a family that kept its own copy is a family whose copy could
  // drift from this one.
  //
  // Writing a memory, appending an annotation and reading lose nothing — a new memory
  // costs nobody anything. **Rewriting one does.** `memory_update` replaces the text
  // somebody may already be relying on, and that is the only loss this family can
  // cause, so it is the only name above. A new memory tool that could lose data must
  // be named here, or it will be treated as harmless.
  if (name === 'memory_update') return true
  if (name.startsWith('memory_')) return false
  if (name !== 'project_update') return false
  // Unreadable arguments are the tool's problem to reject, but they are not a
  // reason to treat a call as harmless.
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return true
  const input = args as Record<string, unknown>
  if (typeof input.archived === 'boolean') return true
  const removeFields = Array.isArray(input.remove_fields) ? input.remove_fields : []
  return removeFields.some(entry => typeof entry === 'string' && entry.trim() !== '')
}

/** The session's permission knobs, as the newest value of each committed event. */
export interface YonPermissions {
  /** `read-only` refuses every write; the other two allow them. */
  readonly sandbox: 'read-only' | 'workspace-write' | 'danger-full-access' | undefined
  /** `ask` wants a person for a destructive write; `never` wants nobody asked. */
  readonly approval: 'ask' | 'never' | undefined
}

/**
 * Read the permission knobs from one session's log, newest value winning.
 * @param session - the calling agent's session, when the call has one.
 * @returns the effective knobs; an absent field means the log never set it.
 */
export function permissionsOf(session: YonSessionLike | undefined): YonPermissions {
  let sandbox: YonPermissions['sandbox'] = undefined
  let approval: YonPermissions['approval'] = undefined
  if (session === undefined) return { sandbox, approval }
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event === undefined) continue
    if (event.type === 'sandbox/mode' && sandbox === undefined) {
      const mode = (event.data as { mode?: unknown } | undefined)?.mode
      if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
        sandbox = mode
      }
    } else if (event.type === 'approval/policy' && approval === undefined) {
      const policy = (event.data as { policy?: unknown } | undefined)?.policy
      if (policy === 'ask' || policy === 'never') approval = policy
    }
    if (sandbox !== undefined && approval !== undefined) break
  }
  return { sandbox, approval }
}

/** What should happen to one write. */
export type YonWriteDisposition = 'run' | 'ask' | 'refuse'

/**
 * Decide one write from what it would cost and what its session permits.
 *
 * The policy follows the session instead of overruling it. A read-only session
 * refuses every write, because that is what read-only means. An additive write
 * runs wherever writing is allowed at all. A destructive write asks in a session
 * that wants to be asked, and — deliberately — runs in one that has said it does
 * not: `never` there means "nobody is available to approve", which is the
 * operator's own choice rather than an accident to fail closed on. An unset
 * policy keeps the safe default and asks.
 * @param destructive - whether the call could lose data.
 * @param permissions - the session's effective knobs.
 * @returns how the gate should answer.
 */
export function dispositionOf(destructive: boolean, permissions: YonPermissions): YonWriteDisposition {
  if (permissions.sandbox === 'read-only') return 'refuse'
  if (!destructive) return 'run'
  return permissions.approval === 'never' ? 'run' : 'ask'
}

/**
 * Explain one write in the terms a person checks before approving it.
 *
 * This is the whole preview: the approval card shows this text, so an update
 * that would change nothing says so, and an update that changes three things
 * lists exactly those three.
 * @param projects - the store, read for the current values.
 * @param name - the tool being previewed.
 * @param args - the arguments of that call.
 * @returns the preview, or undefined when the arguments are unusable (the tool
 *   itself reports that, and asking about a call that cannot run is noise).
 */
export function previewWrite(projects: YonProjectsService, name: string, args: unknown): string | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  const input = args as Record<string, unknown>

  if (name === 'project_create') {
    const projectName = typeof input.name === 'string' ? input.name.trim() : ''
    if (projectName === '') return undefined
    let fields: Record<string, JsonValue>
    try {
      fields = asFieldMap(input.fields, 'fields')
    } catch {
      return undefined
    }
    const lines = [`新建项目「${projectName}」`]
    if (typeof input.code === 'string' && input.code.trim() !== '') lines.push(`· 编码：${input.code.trim()}`)
    if (typeof input.status === 'string') {
      lines.push(`· 状态：${STATUS_TEXT[input.status as ProjectStatus] ?? input.status}`)
    }
    for (const [fieldKey, value] of Object.entries(fields)) {
      lines.push(`· 初始字段「${fieldKey}」= ${brief(value)}`)
    }
    return lines.join('\n')
  }

  const ref = typeof input.project === 'string' ? input.project.trim() : ''
  if (ref === '') return undefined
  const resolution = projects.resolve(ref)
  if (resolution.kind !== 'found') return undefined
  const current = resolution.project

  if (name === 'project_delete') {
    return [
      `彻底删除项目「${current.name}」及其 ${current.fieldCount} 个字段。`,
      '此操作无法撤销。',
    ].join('\n')
  }

  if (name !== 'project_update') return undefined

  let setFields: Record<string, JsonValue>
  try {
    setFields = asFieldMap(input.set_fields, 'set_fields')
  } catch {
    return undefined
  }
  const removeFields = Array.isArray(input.remove_fields)
    ? input.remove_fields.filter((entry): entry is string => typeof entry === 'string')
    : []

  const changes: string[] = []
  const nextName = typeof input.name === 'string' ? input.name.trim() : ''
  if (nextName !== '' && nextName !== current.name) {
    changes.push(`名称：「${current.name}」→「${nextName}」`)
  }
  if (typeof input.code === 'string' && input.code.trim() !== current.code) {
    const shown = (code: string): string => (code === '' ? '未填写' : code)
    changes.push(`编码：「${shown(current.code)}」→「${shown(input.code.trim())}」`)
  }
  if (typeof input.status === 'string' && input.status !== current.status) {
    const next = STATUS_TEXT[input.status as ProjectStatus] ?? input.status
    changes.push(`状态：${STATUS_TEXT[current.status]} → ${next}`)
  }
  if (typeof input.archived === 'boolean' && input.archived !== current.archived) {
    changes.push(input.archived ? '归档这个项目（默认列表里不再出现）' : '恢复这个项目')
  }
  for (const [fieldKey, value] of Object.entries(setFields)) {
    const existing = current.fields[fieldKey]
    changes.push(existing === undefined
      ? `新增字段「${fieldKey}」= ${brief(value)}`
      : `字段「${fieldKey}」：「${brief(existing)}」→「${brief(value)}」`)
  }
  for (const fieldKey of removeFields) {
    const existing = current.fields[fieldKey]
    if (existing === undefined) continue
    changes.push(`删除字段「${fieldKey}」（原值 ${brief(existing)}）`)
  }

  if (changes.length === 0) return `项目「${current.name}」没有任何改动。`
  return [`修改项目「${current.name}」：`, ...changes.map(change => `· ${change}`)].join('\n')
}

/** The pending card for one call. */
function card(title: string, kind: 'read' | 'other', rawInput?: unknown): YonToolCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/**
 * Register the project tools and their preview gate.
 * @param ctx - host context carrying the tool registry.
 * @param projects - the store the tools read and write.
 * @param memory - the memory bank `project_read` carries a hint from. Optional, so a
 *   caller that has the project store and not the bank still gets every tool; the
 *   injection is the only part that goes missing.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonProjectTools(
  ctx: Context,
  projects: YonProjectsService,
  memory?: YonMemoryHints,
): () => void {
  const disposers: Array<() => void> = []
  /**
   * Register one definition, keeping its disposer in this function's teardown.
   * @param definition - the tool to register.
   */
  const register = (definition: YonToolDefinition): void => {
    disposers.push(ctx.tools.register(definition))
  }

  /**
   * Which projects one session has already been shown memories from.
   *
   * Keyed by the session object and not by a counter, because the point is not to save
   * bytes: a session that reads a project after every write would otherwise re-read the
   * same five titles into the conversation each time, and a model that sees a block
   * repeated six times learns to skim past it — which destroys exactly the text this
   * exists to make it read. A `WeakMap` so a finished session is collected rather than
   * held by this plugin for the life of the process.
   */
  const hinted = new WeakMap<object, Set<string>>()

  /**
   * This project's memories, once per session.
   *
   * A call with no session has no conversation to attribute the hint to, and showing it
   * anyway would be the un-deduped case; so the ambiguous one says nothing. The failure
   * is one missing signpost in a dispatch that has no user reading along.
   */
  const memoriesOf = async (
    projectId: string,
    exec: YonToolExecution,
  ): Promise<readonly MemorySummary[]> => {
    if (memory === undefined) return []
    const session = exec.agent?.session
    if (session === undefined) return []
    const shown = hinted.get(session)
    if (shown?.has(projectId) === true) return []
    const found = await memory.recent(projectId, MEMORY_HINT_LIMIT)
    // Marked whether or not anything came back: a project with no memories is a fact
    // this session has learned, and re-reading the index to learn it again on every
    // later read is work nobody asked for.
    if (shown === undefined) hinted.set(session, new Set([projectId]))
    else shown.add(projectId)
    return found
  }

  register(defineYonTool({
    name: 'project_list',
    description: 'List the projects in the operator\'s project store, with how many dynamic fields each '
      + 'one carries. Use this to find a project before reading or changing it; the store is small, so '
      + 'listing everything and choosing yourself beats guessing a name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Optional keyword; keeps projects whose name or code contains it (case-insensitive).',
        },
        include_archived: {
          type: 'boolean',
          description: 'Include archived projects. Defaults to false.',
        },
      },
    },
    outputSchema: LIST_VALUE,
    render: value => {
      const list = value as { matched: number; projects: readonly ProjectValue[] }
      if (list.matched === 0) return '没有匹配的项目。'
      return [`${list.matched} 个项目：`, ...list.projects.map(project => `  ${summarize(project)}`)].join('\n')
    },
    execute(args) {
      const everything = projects.list({ includeArchived: args.include_archived === true })
      const needle = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
      const matched = needle === ''
        ? everything
        : everything.filter(project =>
          project.name.toLowerCase().includes(needle) || project.code.toLowerCase().includes(needle))
      return Promise.resolve({
        matched: matched.length,
        projects: matched.map(project => ({
          project_id: project.projectId,
          name: project.name,
          code: project.code,
          status: project.status,
          archived: project.archived,
          field_count: project.fieldCount,
        })) as unknown as readonly ProjectSummary[],
      })
    },
    presentCall: () => card('List projects', 'read'),
  }))

  register(defineYonTool({
    name: 'project_read',
    description: 'Read one project and every dynamic field it carries. Read before you change anything: '
      + 'the field names belong to the operator, so the current values are the only way to know what a '
      + 'change would replace. The answer also carries this project\'s newest memories, which is how a '
      + 'past session\'s pitfalls reach you without your having to know to look for them.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['project'],
      properties: {
        project: { type: 'string', description: 'Project id, exact name, or exact code.' },
      },
    },
    outputSchema: READ_VALUE,
    render: value => {
      const read = value as { project: ProjectValue; memories: readonly MemoryHintValue[] }
      return [projectText(read.project), ...memoryLines(read.memories)].join('\n')
    },
    async execute(args, exec) {
      const project = locate(projects, asRef(args.project))
      return { project: projectValue(project), memories: await memoriesOf(project.projectId, exec) }
    },
    presentCall: args => card(`Read project “${String(args.project)}”`, 'read'),
  }))

  register(defineYonTool({
    name: 'project_create',
    description: 'Create one project, optionally with its first fields. The operator approves the exact '
      + 'name and starting fields before anything is stored. Prefer creating the project and then adding '
      + 'fields as the operator names them over inventing fields they did not ask for.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Project name as the operator says it.' },
        code: { type: 'string', description: 'Optional short code.' },
        status: { type: 'string', enum: PROJECT_STATUSES, description: 'Defaults to active.' },
        fields: { ...FIELDS_SCHEMA, description: 'Optional starting fields, keyed by field name.' },
      },
    },
    outputSchema: DETAIL_VALUE,
    render: value => `已创建：\n${projectText((value as { project: ProjectValue }).project)}`,
    async execute(args) {
      const status = args.status
      const project = await projects.create({
        name: asRef(args.name, 'name'),
        ...typeof args.code === 'string' ? { code: args.code } : {},
        ...typeof status === 'string' && (PROJECT_STATUSES as readonly string[]).includes(status)
          ? { status: status as ProjectStatus }
          : {},
        fields: asFieldMap(args.fields, 'fields'),
      })
      return { project: projectValue(project) }
    },
    presentCall: args => card(`Create project “${String(args.name)}”`, 'other', args.code),
  }))

  register(defineYonTool({
    name: 'project_update',
    description: 'Change one project: its name, code, status, or archived state, and any of its dynamic '
      + 'fields. Setting a field replaces that field only, and a new name creates it; listing a field in '
      + 'remove_fields deletes it. Changes that only add or update are applied at once and reported back as '
      + 'a list of what changed; removing a field or archiving the project stops for the operator\'s '
      + 'approval first, so pass exactly the changes they asked for.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['project'],
      properties: {
        project: { type: 'string', description: 'Project id, exact name, or exact code.' },
        name: { type: 'string', description: 'New project name.' },
        code: { type: 'string', description: 'New short code; an empty string clears it.' },
        status: { type: 'string', enum: PROJECT_STATUSES, description: 'New lifecycle status.' },
        archived: { type: 'boolean', description: 'true archives the project, false restores it.' },
        set_fields: {
          ...FIELDS_SCHEMA,
          description: 'Fields to write, keyed by field name; an existing name is replaced, a new one is added.',
        },
        remove_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field names to delete.',
        },
      },
    },
    outputSchema: UPDATE_VALUE,
    render: value => {
      const result = value as { project: ProjectValue; changes: readonly string[] }
      return [
        result.changes.length === 0 ? '没有任何改动。' : `已应用 ${result.changes.length} 项改动：`,
        ...result.changes.map(change => `· ${change}`),
        projectText(result.project),
      ].join('\n')
    },
    async execute(args) {
      const current = locate(projects, asRef(args.project))
      const changes: string[] = []
      const setFields = asFieldMap(args.set_fields, 'set_fields')
      const removeFields = (Array.isArray(args.remove_fields) ? args.remove_fields : [])
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(entry => entry !== '')

      const nextName = typeof args.name === 'string' ? args.name.trim() : ''
      const nextCode = typeof args.code === 'string' ? args.code.trim() : undefined
      const nextStatus = typeof args.status === 'string' ? args.status : undefined
      const nextArchived = typeof args.archived === 'boolean' ? args.archived : undefined

      const patch = {
        ...nextName === '' || nextName === current.name ? {} : { name: nextName },
        ...nextCode === undefined || nextCode === current.code ? {} : { code: nextCode },
        ...nextStatus === undefined || nextStatus === current.status
          ? {}
          : { status: nextStatus as ProjectStatus },
        ...nextArchived === undefined || nextArchived === current.archived ? {} : { archived: nextArchived },
      }
      if (Object.keys(patch).length > 0) await projects.update(current.projectId, patch)
      for (const [column, value] of Object.entries(patch)) {
        changes.push(columnChange(column, value, current))
      }

      for (const [fieldKey, value] of Object.entries(setFields)) {
        await projects.setField(current.projectId, fieldKey, value)
        changes.push(current.fields[fieldKey] === undefined
          ? `新增字段「${fieldKey}」`
          : `字段「${fieldKey}」已更新`)
      }
      for (const fieldKey of removeFields) {
        if (current.fields[fieldKey] === undefined) continue
        await projects.removeField(current.projectId, fieldKey)
        changes.push(`删除字段「${fieldKey}」`)
      }

      // Re-read rather than patching the copy: the answer is what the store now
      // holds, including anything another editor changed meanwhile.
      const project = locate(projects, current.projectId)
      return { project: projectValue(project), changes }
    },
    presentCall: args => card(`Update project “${String(args.project)}”`, 'other'),
  }))

  register(defineYonTool({
    name: 'project_delete',
    description: 'Delete one project permanently, together with every field it carries. The operator '
      + 'approves this by name and field count, and it cannot be undone. To take a project out of the way '
      + 'without losing it, use project_update with archived instead.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['project'],
      properties: {
        project: { type: 'string', description: 'Project id, exact name, or exact code.' },
      },
    },
    outputSchema: DELETE_VALUE,
    render: value => {
      const removed = value as { removed: string; removed_fields: number }
      return `已彻底删除项目「${removed.removed}」及其 ${removed.removed_fields} 个字段。`
    },
    async execute(args) {
      const project = locate(projects, asRef(args.project))
      await projects.remove(project.projectId)
      return { removed: project.name, removed_fields: project.fieldCount }
    },
    presentCall: args => card(`Delete project “${String(args.project)}”`, 'other'),
  }))

  // The gate: the session's own permission preset decides, and this package
  // follows it rather than overruling it. Read-only refuses every write; an
  // additive write runs wherever writing is allowed; a destructive write asks in
  // a session that wants to be asked and runs in one that asked not to be. The
  // `ask` branch resolves only through an approval, so a call nobody saw still
  // cannot run.
  disposers.push(ctx.on('tools/pre-execute', (exec, next) => {
    if (!WRITE_TOOLS.has(exec.name)) return next()
    const destructive = isDestructiveWrite(exec.name, exec.arguments)
    const disposition = dispositionOf(destructive, permissionsOf(exec.agent?.session))
    if (disposition === 'run') return next()
    if (disposition === 'refuse') {
      return {
        kind: 'deny' as const,
        reason: '当前会话是「仅可查看」权限，不能改动项目配置。'
          + '要完成改动，请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
      }
    }
    const preview = previewWrite(projects, exec.name, exec.arguments)
    return Promise.resolve(preview === undefined ? next() : { kind: 'ask' as const, reason: preview })
  }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}

/**
 * Whether one tool name is a write this package gates behind an approval.
 * @param name - the tool name to test.
 * @returns true for the tools that change stored data.
 */
export function isYonWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name)
}
