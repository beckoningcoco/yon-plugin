/**
 * The data sources, their statements and their one write, exposed to the agent as
 * tools.
 *
 * Why tools and not a skill telling the model to run a script: the plugin's
 * installation path differs on every machine, and a skill body is inlined at
 * build time, so it cannot name one. Hosting the call here means the model never
 * learns a path, a connection string, or a password — it names a connection and a
 * statement, and the plugin resolves everything else.
 *
 * The split between the three tools follows the one the operator can see:
 *
 * - `datasource_list` answers "what is there" and reads nothing secret. No gate.
 * - `datasource_upsert` registers or patches one environment branch. It is gated
 *   like a destructive write, and a secret only ever travels inward: it is written
 *   to the operator's document and appears in no answer, no preview and no log.
 * - `datasource_query` runs whatever statement it is given, which is why it is
 *   gated: a statement that could change data stops for the operator's approval,
 *   and a read-only session refuses it outright. The rule is the script's own
 *   keyword list, so the plugin and the script agree on what "destructive" means
 *   instead of drifting apart.
 *
 * The tool registry's contract is declared in `tools.ts`, which this module
 * reuses rather than redeclaring.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  splitDataSourceKey,
  type DataSourceProbeResult,
  type DataSourceView,
  type SaveDataSourceInput,
} from '../shared/types.ts'
import { DataSourceError, type YonDataSourcesService } from './datasource-service.ts'
import { ProjectError, type YonProjectsService } from './service.ts'
import { dispositionOf, locate, permissionsOf, sqlWriteDisposition } from './tools.ts'
import { memoryHintLine, withMemoryHint, type MemoryHintLine } from './memory-session.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition, YonToolExecution } from './tools.ts'

/** Every tool this module owns. */
export const DATASOURCE_TOOL_NAMES = ['datasource_list', 'datasource_upsert', 'datasource_query'] as const

/**
 * The statement heads a caller may run without asking anybody.
 *
 * A whitelist, because the blacklist it replaces was one it could not keep. A
 * blacklist has to name every way a database can be changed, and the list it
 * named missed the ways that never spell INSERT: `CALL some_proc()`, a PL/SQL
 * `BEGIN ... END`, `EXEC`, `RENAME`, `REPLACE`. Every one of those was read as a
 * read — and because the gate steps aside for a non-destructive statement
 * *before* it consults the session, they reached the database with nobody asked,
 * in a `read-only` session too.
 *
 * Inverted, the failure mode is the safe one: a statement nobody recognises is
 * treated as a write and goes to the gate, where a person decides. The price is
 * an occasional prompt for an exotic read; the alternative was a silent write.
 */
const READ_ONLY_LEAD = new Set([
  'SELECT', 'WITH', 'SHOW', 'DESC', 'DESCRIBE', 'EXPLAIN', 'PRAGMA', 'VALUES',
])

/**
 * Keywords that write, lock or reshape — wherever they appear.
 *
 * Searched across the whole statement rather than only its head, because a
 * read-shaped statement can still carry one: PostgreSQL's data-modifying CTE
 * (`WITH x AS (DELETE ... RETURNING ...) SELECT ...`), or two statements sent
 * through a driver that runs both.
 *
 * Kept word-for-word in step with `resources/db-query/db_query.py`. A
 * divergence in either direction is a bug: too narrow lets a write through
 * unapproved, too wide asks about a read.
 */
const WRITE_MARKERS: readonly RegExp[] = [
  /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|MERGE|GRANT|REVOKE)\b/i,
  /\b(?:CALL|EXEC|EXECUTE|DECLARE|BEGIN|RENAME|REPLACE|UPSERT|IMPORT|COPY|ANALYZE|VACUUM|COMMENT|LOCK)\b/i,
  /\bFOR\s+UPDATE\b/i,
]

/**
 * The head word of a statement, past any leading whitespace and comments.
 *
 * Comments are skipped rather than searched: `-- INSERT 前先备份` written above
 * a plain SELECT is a note about a read, and a keyword test that scans the raw
 * text reads it as the write itself.
 * @param sql - the statement.
 * @returns the upper-cased head word, or the empty string when there is none.
 */
function leadingWord(sql: string): string {
  let body = sql
  for (;;) {
    body = body.replace(/^\s+/, '')
    if (body.startsWith('--')) {
      const end = body.indexOf('\n')
      if (end < 0) return ''
      body = body.slice(end + 1)
      continue
    }
    if (body.startsWith('/*')) {
      const end = body.indexOf('*/')
      if (end < 0) return ''
      body = body.slice(end + 2)
      continue
    }
    break
  }
  const match = /^[A-Za-z_][A-Za-z0-9_$#]*/.exec(body)
  return match?.[0]?.toUpperCase() ?? ''
}

/**
 * Whether one statement is anything other than provably a read.
 *
 * "Provably" carries the meaning: true is the answer whenever this cannot show
 * the statement is a read, so an unparseable or comment-only statement counts as
 * a write and a person decides. The gate checks the arguments before calling
 * this, so an empty string is refused for honesty rather than to raise a prompt.
 * @param sql - the statement a call wants to run.
 * @returns true when the statement must not run without an approval.
 */
export function isDestructiveSql(sql: unknown): boolean {
  if (typeof sql !== 'string' || sql.trim() === '') return true
  if (!READ_ONLY_LEAD.has(leadingWord(sql))) return true
  return WRITE_MARKERS.some(marker => marker.test(sql))
}

/** One content block carrying text; the registry's only shape this package uses. */
function text(content: string): YonTextBlock[] {
  return [{ type: 'text', text: content }]
}

/** The pending-state card a UI renders for one call. */
function card(title: string, kind: 'read' | 'other', rawInput?: unknown): YonToolCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** One connection line for the model's list answer. */
function summarize(source: DataSourceView): string {
  const parts = [
    source.key,
    `[${source.dbType === '' ? '类型未填' : source.dbType}]`,
    `${source.host}:${source.port}`,
  ]
  if (source.serviceName !== '') parts.push(`service=${source.serviceName}`)
  parts.push(source.userNames.length === 0 ? '无登录名' : `登录名 ${source.userNames.join('/')}`)
  if (!source.hasPassword) parts.push('未存密码')
  if (!source.probeable) parts.push('无连接器')
  if (source.binding !== undefined) parts.push(`已绑定项目「${source.binding.projectName}」`)
  return parts.join(' · ')
}

/** Read one argument as a required string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DataSourceError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Read one argument as trimmed text, answering empty for anything else. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** One tool definition over the registry's contract. */
function defineTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  render(value: V): string
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<V>
  presentCall(args: Record<string, unknown>): YonToolCallView
}, hint?: MemoryHintLine): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => text(spec.render(value as V) + memoryHintLine(value)),
    },
    async execute(args: unknown, exec: YonToolExecution): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new DataSourceError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new DataSourceError('invalid-input', `${spec.name} 已被取消`)
      const value = await spec.execute(args as Record<string, unknown>, exec.signal)
      // The signpost, when this tool is one of the four that carry it. Injected here
      // rather than in the tool's own `execute` so that each of those four stays about its
      // own subject, and so the four cannot drift in how they say the same sentence.
      return hint === undefined ? value : await withMemoryHint(value as object, hint, exec)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** The JSON Schema of the list's answer. */
const LIST_VALUE = {
  type: 'object',
  required: ['count', 'sources'],
  properties: {
    count: { type: 'number' },
    sources: { type: 'array', items: { type: 'object' } },
  },
} as const

/** The JSON Schema of a query's answer. */
const QUERY_VALUE = {
  type: 'object',
  required: ['ok', 'configKey', 'env', 'output'],
  properties: {
    ok: { type: 'boolean' },
    configKey: { type: 'string' },
    env: { type: 'string' },
    output: { type: 'string' },
    rowCount: { type: 'number' },
    error: { type: 'string' },
  },
} as const

/** The JSON Schema of a write's answer. */
const UPSERT_VALUE = {
  type: 'object',
  required: ['key', 'created', 'changes', 'source'],
  properties: {
    key: { type: 'string' },
    created: { type: 'boolean' },
    changes: { type: 'array', items: { type: 'string' } },
    source: { type: 'object' },
    verify: { type: 'object' },
  },
} as const

/** One upsert call resolved against what is stored: what to write, and what it changes. */
interface UpsertPlan {
  /** The composite key, as the caller wrote it. */
  readonly key: string
  /** Whether this call brings the branch into existence. */
  readonly created: boolean
  /** What the write changes, one line each; empty when nothing would change. */
  readonly changes: readonly string[]
  /** Every field as it will be stored — what a create has to show, since it has no diff. */
  readonly summary: readonly string[]
  /** The service call's own input, already carrying the values the caller left out. */
  readonly input: SaveDataSourceInput
}

/**
 * Resolve one upsert call: validate it, fill in what the caller left out, and work
 * out what it would change.
 *
 * The fill-in is why this exists rather than a bare call to `sources.save`: that
 * service replaces a branch with whatever it is given, so a caller patching one
 * field has to be told every other field's current value first. Reading the store
 * once here serves all three purposes — the fallbacks, the diff, and the check for
 * whether this call would drop a stored login's password.
 * @param sources - the connection service, read and later written.
 * @param projects - the project store, for resolving a binding by name.
 * @param args - the raw tool arguments.
 * @returns the plan.
 */
async function planUpsert(
  sources: YonDataSourcesService,
  projects: YonProjectsService,
  args: Record<string, unknown>,
): Promise<UpsertPlan> {
  const key = trimmed(args.key)
  const parts = key === '' ? undefined : splitDataSourceKey(key)
  if (parts === undefined) {
    throw new DataSourceError(
      'invalid-input',
      `key 要写成「名称::环境」，例如 首创(NCC1909)::test；收到的是「${key}」`,
    )
  }

  const payload = await sources.list()
  const existing = payload.sources.find(
    row => row.configKey === parts.configKey && row.env === parts.env,
  )

  const rawType = args.db_type
  const dbType = rawType === undefined ? existing?.dbType ?? '' : trimmed(rawType)
  if (dbType === '') {
    throw new DataSourceError(
      'invalid-input',
      rawType === undefined
        ? '新建数据源必须给 db_type（oracle / dm / mysql / postgresql / oceanbase 等）'
        : 'db_type 不能为空',
    )
  }

  const rawHost = args.host
  const host = rawHost === undefined ? existing?.host ?? '' : trimmed(rawHost)
  if (host === '') {
    throw new DataSourceError(
      'invalid-input',
      rawHost === undefined ? '新建数据源必须给 host（数据库地址）' : 'host 不能为空',
    )
  }

  const rawPort = args.port
  const port = rawPort === undefined
    ? existing?.port ?? Number.NaN
    : typeof rawPort === 'number'
      ? rawPort
      : typeof rawPort === 'string' && rawPort.trim() !== ''
        ? Number.parseInt(rawPort.trim(), 10)
        : Number.NaN
  if (!Number.isInteger(port) || port <= 0) {
    throw new DataSourceError(
      'invalid-input',
      rawPort === undefined
        ? '新建数据源必须给 port（数据库端口，1–65535）'
        : `port 必须是 1–65535 的整数（收到「${String(rawPort)}」）`,
    )
  }

  // Omitted keeps the stored name; an empty string clears it. Same rule the login
  // table follows below, and the reason a caller can patch one field at a time.
  const serviceName = args.service_name === undefined
    ? existing?.serviceName
    : trimmed(args.service_name)

  const user = trimmed(args.user)
  const password = typeof args.password === 'string' ? args.password : undefined
  if (user === '' && password !== undefined) {
    throw new DataSourceError(
      'invalid-input',
      'password 必须和 user 一起给：要沿用已存登录名（连同密码）就别传这两个',
    )
  }
  if (user !== '' && password === undefined) {
    throw new DataSourceError(
      'invalid-input',
      'user 必须和 password 一起给：只改地址之类的字段就别传 user，密码会原样保留',
    )
  }
  if (password === '') {
    throw new DataSourceError('invalid-input', 'password 不能是空字符串')
  }

  // A branch's login table is replaced whole, so a call that names one login on a
  // branch holding several would take the others' secrets with it. That is a data
  // loss nobody can undo from the transcript, so it needs saying out loud.
  const existingLogins = existing?.userNames ?? []
  if (user !== '' && existingLogins.length > 1 && !existingLogins.includes(user)
    && args.replace_logins !== true) {
    throw new DataSourceError(
      'invalid-input',
      `「${key}」已存 ${existingLogins.length} 个登录名（${existingLogins.join('、')}），`
      + '只给一个会把其余的密码一并丢掉；确认要替换就再调一次并带 replace_logins: true，'
      + '或者改到面板里去编辑。',
    )
  }

  let projectId: string | undefined
  if (typeof args.project === 'string') {
    const ref = args.project.trim()
    if (ref === '') {
      projectId = ''
    } else {
      try {
        projectId = locate(projects, ref).projectId
      } catch (error) {
        // `locate` owns the ambiguous/not-found wording so this family cannot grow a
        // second copy of it; only the error's type has to change, because this tool's
        // callers map `DataSourceError` onto their own failure shapes.
        if (error instanceof ProjectError) throw new DataSourceError(error.code, error.message)
        throw error
      }
    }
  }

  const changes: string[] = []
  const summary: string[] = [
    `类型：${dbType}`,
    `地址：${host}:${port}${serviceName === undefined || serviceName === '' ? '' : ` / service=${serviceName}`}`,
    user === '' ? '登录名：沿用已存' : `登录名：${user}（密码将写入）`,
  ]

  if (existing === undefined) {
    changes.push(`新建数据源「${key}」（${dbType}）`)
  } else {
    if (dbType !== existing.dbType) changes.push(`类型：${existing.dbType} → ${dbType}`)
    if (host !== existing.host) changes.push(`地址：${existing.host} → ${host}`)
    if (port !== existing.port) changes.push(`端口：${existing.port} → ${port}`)
    if (serviceName !== undefined && serviceName !== existing.serviceName) {
      const before = existing.serviceName === '' ? '（无）' : existing.serviceName
      changes.push(serviceName === '' ? `库名已清空（原 ${before}）` : `库名：${before} → ${serviceName}`)
    }
  }
  if (user !== '') {
    // Three shapes, because "SCNCC → SCNCC" is what a branch looks like when the
    // login stays and only the secret is being reset — and a diff that says a thing
    // moved to where it already was reads as a bug to whoever approves it.
    if (existingLogins.length === 0) changes.push(`登录名：${user}（密码将写入）`)
    else if (existingLogins.length === 1 && existingLogins[0] === user) {
      changes.push(`重设登录名「${user}」的密码`)
    } else changes.push(`登录名：${existingLogins.join('、')} → ${user}（原密码一并替换）`)
  }

  if (projectId !== undefined) {
    if (projectId === '') {
      summary.push('绑定项目：解绑')
      if (existing?.binding !== undefined) changes.push(`解绑项目「${existing.binding.projectName}」`)
    } else {
      const name = projects.get(projectId)?.name ?? projectId
      summary.push(`绑定项目：${name}`)
      if (existing?.binding?.projectId !== projectId) {
        changes.push(existing?.binding === undefined
          ? `绑定项目：${name}`
          : `绑定项目：${existing.binding.projectName} → ${name}`)
      }
    }
  }

  return {
    key,
    created: existing === undefined,
    changes,
    summary,
    input: {
      configKey: parts.configKey,
      env: parts.env,
      dbType,
      host,
      port,
      ...serviceName === undefined ? {} : { serviceName },
      ...user === '' ? {} : { users: { [user]: password as string } },
      ...projectId === undefined ? {} : { projectId },
    },
  }
}

/** The operator-facing text of one plan: what the approval asks about, and what the call reports. */
function planText(plan: UpsertPlan): string {
  if (!plan.created && plan.changes.length === 0) {
    return `数据源「${plan.key}」没有任何改动（给的字段与已存的一致）。`
  }
  const head = plan.created ? `新建数据源「${plan.key}」` : `更新数据源「${plan.key}」`
  const lines = plan.created ? plan.summary : plan.changes
  return [head, ...lines.map(line => `· ${line}`)].join('\n')
}

/**
 * What one write would do, as the approval card reads it.
 *
 * Exported so the gate and the tests read the same sentence. Two rules hold here:
 * the preview is derived from the same plan the call itself runs, so what the
 * operator approves is what gets written, and **no secret is ever rendered** — a
 * password is reported as "will be written", never as a value.
 * @param sources - the connection service, read for the current values.
 * @param projects - the project store, for resolving a binding by name.
 * @param args - the raw tool arguments.
 * @returns the preview, or undefined when the arguments are unusable (the tool
 *   itself reports that, and asking about a call that cannot run is noise).
 */
export async function previewUpsert(
  sources: YonDataSourcesService,
  projects: YonProjectsService,
  args: unknown,
): Promise<string | undefined> {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  try {
    return planText(await planUpsert(sources, projects, args as Record<string, unknown>))
  } catch {
    return undefined
  }
}

/**
 * Register the datasource tools and their write gate.
 * @param ctx - host context carrying the tool registry.
 * @param sources - the service the tools read, run against and write through.
 * @param projects - the project store, so a binding can be given by name.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonDataSourceTools(
  ctx: Context,
  sources: YonDataSourcesService,
  projects: YonProjectsService,
  hint?: MemoryHintLine,
): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'datasource_list',
    description: 'List the database connections the operator registered, one row per environment, '
      + 'with the connection\'s key, type, address and login names. Use this before running any '
      + 'statement: the key it returns is the only identifier datasource_query accepts, and it is '
      + 'never a guess — the list is the single source of truth. Passwords are not included and are '
      + 'not available to you.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Optional keyword; keeps connections whose key, address or type contains it.',
        },
      },
    },
    outputSchema: LIST_VALUE,
    async execute(args) {
      const payload = await sources.list()
      const needle = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
      const matched = needle === ''
        ? payload.sources
        : payload.sources.filter(source =>
          source.key.toLowerCase().includes(needle)
          || source.host.toLowerCase().includes(needle)
          || source.dbType.toLowerCase().includes(needle))
      return { count: matched.length, sources: matched as unknown as readonly DataSourceView[] }
    },
    render(value) {
      const list = value as { count: number; sources: readonly DataSourceView[] }
      if (list.count === 0) return '没有登记任何数据源。可以在 Yon 面板的数据库入口里添加，或让本工具登记。'
      return [
        `${list.count} 个数据源（key · 类型 · 地址 · 登录名）：`,
        ...list.sources.map(source => `  ${summarize(source)}`),
        '',
        '用 datasource_query 时把完整 key 原样传入。',
      ].join('\n')
    },
    presentCall: () => card('列出数据源', 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'datasource_upsert',
    description: 'Register or update one database connection, one environment branch at a time, under '
      + 'a composite key (`名称::环境`, for example "首创(NCC1909)::test"). Fields left out keep their '
      + 'stored value — an omitted service_name stays as it is, an empty string clears it, and omitting '
      + 'user/password keeps the stored logins — so a call that only changes the address cannot wipe the '
      + 'rest. A password travels inward only: it is written to the operator\'s configuration file and '
      + 'never appears in any answer, so only pass one the operator gave you. The call stops for the '
      + 'operator\'s approval unless the session has been told not to ask, and a read-only session '
      + 'refuses it. Use `project` to bind the connection group to a project by id, exact name or code; '
      + 'an empty string unbinds it. This is the same document the Yon panel edits, so a connection '
      + 'written here shows up there immediately.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['key'],
      properties: {
        key: {
          type: 'string',
          description: 'The connection key, "名称::环境" (for example "首创(NCC1909)::test"). '
            + 'A key that does not exist yet is created.',
        },
        db_type: {
          type: 'string',
          description: 'Database type: oracle / dm / mysql / postgresql / oceanbase. '
            + 'Required when the key is new; kept as stored when omitted.',
        },
        host: { type: 'string', description: 'Database address. Required when the key is new.' },
        port: { type: 'integer', description: 'Database port, 1–65535. Required when the key is new.' },
        service_name: {
          type: 'string',
          description: 'Oracle service name, or the MySQL/PostgreSQL database. '
            + 'Omitted keeps the stored one; an empty string clears it.',
        },
        user: {
          type: 'string',
          description: 'Login name to store, together with `password`. '
            + 'Omit both to keep the stored logins unchanged.',
        },
        password: {
          type: 'string',
          description: 'The secret for `user`. Written only — it is never returned by any tool.',
        },
        project: {
          type: 'string',
          description: 'Bind the connection group to this project (id, exact name or code); '
            + 'an empty string unbinds it; omit to leave the binding alone.',
        },
        replace_logins: {
          type: 'boolean',
          description: 'Set true to accept replacing a branch that holds several logins with the single '
            + 'one given, losing the others\' passwords. Defaults to false, which refuses that.',
        },
        verify: {
          type: 'boolean',
          description: 'Run SELECT 1 after the write and report whether the connection answers. '
            + 'Defaults to false.',
        },
      },
    },
    outputSchema: UPSERT_VALUE,
    async execute(args) {
      const plan = await planUpsert(sources, projects, args)
      const source = await sources.save(plan.input)
      // A probe is evidence about the network, not about the write: the connection is
      // stored whether or not it answers, and the answer says which of the two failed.
      const verify = args.verify === true ? await sources.probe(source.key) : undefined
      return {
        key: source.key,
        created: plan.created,
        changes: plan.changes,
        source,
        ...verify === undefined ? {} : { verify },
      }
    },
    render(value) {
      const lines = [`已写入：${value.key}（${value.created ? '新建' : '更新'}）`]
      if (value.changes.length === 0) {
        lines.push('· 没有任何改动（写入的值与已存的一致）')
      } else {
        lines.push(...value.changes.map(change => `· ${change}`))
      }
      const verify = value.verify as DataSourceProbeResult | undefined
      if (verify === undefined) {
        lines.push('连通性可在面板点「测试连接」，或再调一次 datasource_query 跑 SELECT 1 验证。')
      } else if (verify.ok) {
        lines.push(`探活：连通，用时 ${verify.latencyMs} 毫秒`
          + `${verify.rowCount === undefined ? '' : `，返回 ${verify.rowCount} 行`}`)
      } else {
        lines.push(`写入已完成，但探活失败：${verify.error ?? '（没有更多信息）'}`)
      }
      return lines.join('\n')
    },
    presentCall(args) {
      return card(`写入数据源 ${trimmed(args.key)}`, 'other', trimmed(args.key))
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'datasource_query',
    description: 'Run one SQL statement against one registered connection and return the rows the '
      + 'database sent. Pass the key exactly as datasource_list returned it, not a short name: keys '
      + 'are matched exactly. Send one statement at a time and narrow large results with COUNT or a '
      + 'WHERE clause first — the whole result lands in the conversation. A statement that could '
      + 'change data stops for the operator\'s approval before it runs, and a read-only session '
      + 'refuses it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'sql'],
      properties: {
        key: {
          type: 'string',
          description: 'The connection key from datasource_list, exactly as returned (for example "天九(NCC2312)::test").',
        },
        sql: { type: 'string', description: 'One SQL statement. Oracle needs FROM DUAL for a bare SELECT.' },
        user: { type: 'string', description: 'Optional login name; the connection\'s first one is used when omitted.' },
      },
    },
    outputSchema: QUERY_VALUE,
    async execute(args) {
      const result = await sources.query(
        asString(args.key, 'key'),
        asString(args.sql, 'sql'),
        typeof args.user === 'string' ? args.user : undefined,
      )
      return result as unknown as { ok: boolean; configKey: string; env: string; output: string }
    },
    render(value) {
      const result = value as {
        ok: boolean
        configKey: string
        env: string
        output: string
        rowCount?: number
        error?: string
      }
      const head = `${result.configKey} / ${result.env}`
      if (!result.ok) return `${head} 查询失败：\n${result.error ?? '（没有更多信息）'}`
      return [head, result.output === '' ? '（没有输出）' : result.output].join('\n')
    },
    presentCall(args) {
      const sql = String(args.sql ?? '')
      return card(`执行 SQL：${sql.length > 80 ? `${sql.slice(0, 80)}…` : sql}`, 'other', args.key)
    },
  }, hint)))

  // The gate. Two kinds of call reach it, and they are deliberately not judged
  // the same way. A connection write follows the project tools' disposition, so a
  // single session-wide preset governs every store this plugin owns. A statement
  // aimed at a customer's database goes through `sqlWriteDisposition` instead,
  // which has no `run` in it at all. The difference is ownership: the operator
  // owns this plugin's stores and may reasonably say "do not ask me" about them,
  // while the rows in that database are nobody's to change unreviewed.
  disposers.push(ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name === 'datasource_upsert') {
      // Deliberately always "destructive": whether this call replaces a stored branch
      // or brings a new one into being is a fact on disk, not in the arguments, and a
      // silently overwritten password costs more than one click. A create could be
      // argued down to "additive" later; the judge would have to read the store.
      const disposition = dispositionOf(true, permissionsOf(exec.agent?.session))
      if (disposition === 'run') return next()
      if (disposition === 'refuse') {
        return {
          kind: 'deny' as const,
          reason: '当前会话是「仅可查看」权限，不能改动数据源配置。'
            + '要完成改动，请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
        }
      }
      return previewUpsert(sources, projects, exec.arguments).then(
        preview => (preview === undefined ? next() : { kind: 'ask' as const, reason: preview }),
      )
    }
    if (exec.name !== 'datasource_query') return next()
    const args = exec.arguments
    const sql = args !== null && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>).sql
      : undefined
    // A call the tool itself will reject is not worth a prompt — the rule the
    // connection write above already follows. The tool reports the bad argument.
    if (typeof sql !== 'string' || sql.trim() === '') return next()
    if (!isDestructiveSql(sql)) return next()

    const permissions = permissionsOf(exec.agent?.session)
    if (sqlWriteDisposition(permissions) === 'refuse') {
      return {
        kind: 'deny' as const,
        reason: permissions.sandbox === 'read-only'
          ? '当前会话是「仅可查看」权限，不能执行会改动数据的语句。'
            + '要执行请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。'
          // `never` says nobody can be asked, and this statement would otherwise
          // run unread. Naming the policy is the whole remedy — nothing else in
          // the session can grant it. "The sandbox is wide open" is not an answer
          // either: a sandbox says what the plugin may touch, not what a person
          // agreed to.
          : '当前会话的审批策略是「从不询问」，没有人能为这条会改动数据的语句负责，'
            + '所以它不会被执行。要执行请先把审批策略切回「询问」。',
      }
    }
    return {
      kind: 'ask' as const,
      reason: `这条语句可能改动数据，执行前请确认：\n\n  ${sql.slice(0, 400)}\n\n`
        + '生产库上的改动不可撤销。',
    }
  }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
