/**
 * The registered Home directories, exposed to the agent as three tools.
 *
 * The question this answers is "where is the installation, and what is in it" —
 * which today the model can only ask the operator, and then forgets at the end of
 * the session. `ncc_home_list` is that answer, made durable: the operator
 * registered a Home once, and afterwards the model looks it up instead of asking.
 * The other two make the answer usable: find a file, then read it in its actual
 * encoding.
 *
 * ## Why the model gets an id and never a path
 *
 * `ncc_home_find` and `ncc_home_read` take an `id` that `ncc_home_list` returned,
 * exactly as `datasource_query` takes a connection key rather than a connection
 * string. Two reasons, and the second is the one that matters:
 *
 * - A path is a thing the model would guess. It has seen `E:/NCProject/.../home`
 *   in a conversation before and will offer it again for a different installation.
 * - The id is resolved against the operator's own registrations, so a path that
 *   nobody registered cannot be read at all — a prompt-injected "read
 *   C:/Users/.../.ssh/id_rsa" has no id to name.
 *
 * ## Why none of the three is gated
 *
 * They write nothing. `class-tools.ts` makes the same argument for the same
 * reason: a gate on a read trains the operator to approve without reading, which
 * costs more than it protects.
 */
import type { Context } from '@deepseek-ai/cordis'
import { HomeError } from './home-files.ts'
import type { YonHomesService } from './home-service.ts'
import type { HomeView } from '../shared/types.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const HOME_TOOL_NAMES = ['ncc_home_list', 'ncc_home_find', 'ncc_home_read'] as const

/** How many files a find returns when the caller does not say. */
const DEFAULT_FIND_LIMIT = 50

/** The pending-state card a UI renders for one call. */
function card(title: string): YonToolCallView {
  return { card: 'generic', title, kind: 'read' }
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HomeError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
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
}): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => [{ type: 'text', text: spec.render(value as V) }] as YonTextBlock[],
    },
    async execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new HomeError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new HomeError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/**
 * A line window written the way a person writes one.
 *
 * `120-180` is a range, `120` is one line, and `120-` is everything from there on.
 * A malformed window is refused rather than ignored: silently reading the whole
 * file would put 60,000 characters in the conversation when the caller asked for
 * forty lines, and they would have no way to tell it had happened.
 */
function parseLines(raw: unknown): { readonly from?: number; readonly to?: number } {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  const text = raw.trim()
  const range = /^(\d+)\s*[-~,]\s*(\d*)$/.exec(text)
  if (range !== null) {
    const from = Number(range[1])
    const to = range[2] === '' ? undefined : Number(range[2])
    return { from, ...to === undefined ? {} : { to } }
  }
  if (/^\d+$/.test(text)) {
    const line = Number(text)
    return { from: line, to: line }
  }
  throw new HomeError('invalid-input', `lines 要写成「起始-结束」或一个行号，例如 120-180；收到的是「${raw}」`)
}

/** The one-line summary of a Home, for the list's answer. */
function summarize(home: HomeView): string {
  const parts = [
    home.id,
    home.label,
    `[${home.product.toUpperCase()}${home.version === '' ? '' : ` ${home.version}`}]`,
    home.path,
  ]
  if (home.isDefault) parts.push('默认')
  if (!home.ready) parts.push('路径读不出来')
  return parts.join(' · ')
}

/** The JSON Schema of the list's answer. */
const LIST_VALUE = {
  type: 'object',
  required: ['count', 'homes'],
  properties: {
    count: { type: 'number' },
    homes: { type: 'array', items: { type: 'object' } },
  },
} as const

/** The JSON Schema of a find's answer. */
const FIND_VALUE = {
  type: 'object',
  required: ['home', 'matches', 'scanned', 'capped'],
  properties: {
    home: { type: 'string' },
    matches: { type: 'array', items: { type: 'object' } },
    scanned: { type: 'number' },
    capped: { type: 'boolean' },
  },
} as const

/** The JSON Schema of a read's answer. */
const READ_VALUE = {
  type: 'object',
  required: ['home', 'rel', 'encoding', 'totalLines', 'from', 'to', 'text'],
  properties: {
    home: { type: 'string' },
    rel: { type: 'string' },
    encoding: { type: 'string' },
    bytes: { type: 'number' },
    totalLines: { type: 'number' },
    from: { type: 'number' },
    to: { type: 'number' },
    truncated: { type: 'boolean' },
    masked: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
  },
} as const

/**
 * Register the Home tools.
 * @param ctx - host context carrying the tool registry.
 * @param homes - the service holding the operator's registrations.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonHomeTools(ctx: Context, homes: YonHomesService): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_home_list',
    description: 'List the NCC/BIP installation directories (Homes) the operator registered on this '
      + 'machine: the id to address each one by, its label, product line, version, path, and what an '
      + 'earlier probe found inside it — whether it is really an installation, how many modules and jars '
      + 'it has, which standard paths exist, and which indexes the version has: the class index that '
      + 'ncc_class_search reads, and the metadata index that ncc_meta_find reads. Call this '
      + 'whenever a question involves the installation itself: sources, configuration files, .bmf '
      + 'metadata, module registration. Do not ask the operator for the installation path — the answer is '
      + 'here, and the id it returns is the only identifier ncc_home_find and ncc_home_read accept.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: LIST_VALUE,
    async execute() {
      const payload = await homes.list()
      return { count: payload.homes.length, homes: payload.homes as unknown as readonly HomeView[] }
    },
    render(value) {
      const list = value as { count: number; homes: readonly HomeView[] }
      if (list.count === 0) {
        return '还没有登记任何 NCC/BIP 的 Home 目录。请使用者在 Yon 面板的「Home 管理」入口里登记一个，'
          + '登记之后我就能自己查安装目录里的源码、配置和 .bmf 元数据。'
      }
      const lines = [`${list.count} 个已登记的 Home：`, '']
      for (const home of list.homes) {
        lines.push(`  ${summarize(home)}`)
        if (home.profile !== undefined) {
          const shape = home.profile.shape === 'ncc-home'
            ? 'NCC 安装目录'
            : home.profile.shape === 'bip-home'
              ? 'BIP 安装目录'
              : home.profile.shape === 'jar-collection'
                ? '只是 jar 集合（没有 modules/）'
                : '不像安装目录'
          const counts = `${home.profile.capped ? '≥' : ''}${home.profile.modules} 个模块 · `
            + `${home.profile.capped ? '≥' : ''}${home.profile.jars} 个 jar`
          lines.push(`      ${shape} · ${counts}`)
          const hit = home.profile.keys.filter(key => key.exists).map(key => key.rel)
          if (hit.length > 0) lines.push(`      有的路径：${hit.join('、')}`)
          for (const warning of home.profile.warnings) lines.push(`      ⚠ ${warning}`)
        } else {
          lines.push('      还没有探测过')
        }
        lines.push(home.index === undefined
          ? '      类索引：没有'
          : `      类索引：${home.index.totalClasses} 个类，${home.index.builtAt.slice(0, 10)} 建`)
        // Whether a metadata index exists is what decides whether `ncc_meta_*` can
        // answer at all, so it belongs in the one answer the model reads first.
        lines.push(home.meta === undefined
          ? '      元数据索引：没有（ncc_meta_* 用不了，要先在「Home 管理」里建一次）'
          : `      元数据索引：${home.meta.counts.entities} 个实体 · ${home.meta.counts.fields} 个字段 · `
            + `${home.meta.counts.enums} 个枚举，${home.meta.builtAt.slice(0, 10)} 建`)
      }
      lines.push('', '用 ncc_home_find 找文件、ncc_home_read 读文件时，home 参数传上面的 id（不是路径）。')
      return lines.join('\n')
    },
    presentCall: () => card('列出已登记的安装目录'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_home_find',
    description: 'Find files inside one registered Home by file name and/or extension, and return their '
      + 'paths relative to the Home. Use it to locate .bmf metadata (ext "bmf"), module registration '
      + 'files, configuration, or the .java sources that sit beside the .class files. At least one of '
      + 'name and ext is required; each match is one line of the answer, so prefer a narrow extension '
      + 'over a bare substring. The bundled JDK directory (ufjdk) is skipped, and there is an upper '
      + 'bound on both the number of matches and how much of the tree is walked.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['home'],
      properties: {
        home: {
          type: 'string',
          description: 'The id from ncc_home_list, exactly as returned — not a path.',
        },
        name: {
          type: 'string',
          description: 'Case-insensitive substring of the file name, for example "QueryScheme".',
        },
        ext: {
          type: 'string',
          description: 'Extension, with or without the dot, for example "bmf" or ".java".',
        },
        under: {
          type: 'string',
          description: 'A directory inside the Home to start from, relative to it — for example '
            + '"modules/aert". The whole Home when omitted.',
        },
        limit: {
          type: 'number',
          description: `How many matches to return at most; defaults to ${DEFAULT_FIND_LIMIT}, capped at 200.`,
        },
      },
    },
    outputSchema: FIND_VALUE,
    async execute(args) {
      const home = asString(args.home, 'home')
      const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : undefined
      const ext = typeof args.ext === 'string' && args.ext.trim() !== '' ? args.ext.trim() : undefined
      if (name === undefined && ext === undefined) {
        throw new HomeError('invalid-input', 'name 和 ext 至少要给一个，否则会把整个 Home 的文件都列出来。')
      }
      const result = await homes.find(home, {
        ...name === undefined ? {} : { name },
        ...ext === undefined ? {} : { ext },
        ...typeof args.under === 'string' && args.under.trim() !== '' ? { under: args.under.trim() } : {},
        ...typeof args.limit === 'number' ? { limit: args.limit } : {},
      })
      return result as unknown as { home: string; matches: readonly unknown[]; scanned: number; capped: boolean }
    },
    render(value) {
      const result = value as {
        home: string
        matches: readonly { rel: string; size: number }[]
        scanned: number
        capped: boolean
      }
      if (result.matches.length === 0) {
        return `没有找到匹配的文件（扫描了 ${result.scanned} 个目录项）。`
          + '可以放宽一点：换更短的片段、去掉 ext、或用 under 指定一个更可能的子树。'
      }
      return [
        `找到 ${result.matches.length} 个（扫描了 ${result.scanned} 个目录项${result.capped ? '，已到上限' : ''}）：`,
        ...result.matches.map(match => `  ${match.rel}`),
        '',
        `用 ncc_home_read 读的时候，path 传这里的相对路径。`,
      ].join('\n')
    },
    presentCall(args) {
      const what = [args.name, args.ext].filter(part => typeof part === 'string' && part !== '').join(' / ')
      return card(`在安装目录里找文件：${what === '' ? '（没给条件）' : what}`)
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_home_read',
    description: 'Read one text file inside a registered Home. The file is decoded the way it is '
      + 'actually stored, not assumed to be UTF-8: NCC sources and many config files are GBK, .bmf '
      + 'metadata is UTF-8 XML, and a file that declares its own encoding is read as declared. The '
      + 'answer names the encoding it used, so a mojibake reading is visible rather than silent. Values '
      + 'of secret keys (passwords, client_secret, tokens, private keys) come back masked; every other '
      + 'value is returned as stored. Binary files are refused, and a large file is read up to a '
      + 'character budget — use lines to read a window of one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['home', 'path'],
      properties: {
        home: {
          type: 'string',
          description: 'The id from ncc_home_list, exactly as returned — not a path.',
        },
        path: {
          type: 'string',
          description: 'Path to the file, relative to the Home — as ncc_home_find returned it.',
        },
        lines: {
          type: 'string',
          description: 'Optional line window, "起始-结束" (1-based, inclusive), for example "120-180". '
            + 'A single number reads that one line; "120-" reads from there to the end.',
        },
        encoding: {
          type: 'string',
          description: 'Optional encoding override, for example "gb18030". Rarely needed: the default '
            + 'detection already handles GBK, UTF-8 and declared encodings. Use it when the answer '
            + 'reports a decoding you can see is wrong.',
        },
      },
    },
    outputSchema: READ_VALUE,
    async execute(args) {
      const home = asString(args.home, 'home')
      const path = asString(args.path, 'path')
      const window = parseLines(args.lines)
      const encoding = typeof args.encoding === 'string' && args.encoding.trim() !== ''
        ? args.encoding.trim()
        : undefined
      const result = await homes.read(home, path, {
        ...window,
        ...encoding === undefined ? {} : { encoding },
      })
      return result as unknown as { home: string; rel: string; encoding: string; totalLines: number; from: number; to: number; text: string }
    },
    render(value) {
      const result = value as {
        home: string
        rel: string
        encoding: string
        bytes: number
        totalLines: number
        from: number
        to: number
        truncated: boolean
        masked: readonly string[]
        text: string
      }
      const head = `${result.rel}（${result.bytes} 字节，共 ${result.totalLines} 行；`
        + `按 ${result.encoding} 解码，这里是第 ${result.from}-${result.to} 行）`
      const notes: string[] = []
      if (result.truncated) notes.push('内容有截断，见文末说明。')
      if (result.masked.length > 0) {
        notes.push(`有 ${result.masked.length} 处密钥值被打码（${result.masked.join('、')}），键名与非敏感项照常。`)
      }
      return [head, ...notes.map(note => `  · ${note}`), '', result.text].join('\n')
    },
    presentCall(args) {
      return card(`读安装目录里的文件：${String(args.path ?? '')}`)
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
