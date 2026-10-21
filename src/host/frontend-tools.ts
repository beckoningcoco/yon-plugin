/**
 * The registered front-end source projects, exposed to the agent as three tools.
 *
 * The question this answers is "where is the NCC front-end source for this
 * version, and what is in it" — which today the model can only ask the operator,
 * and then forgets at the end of the session. The three are deliberately shaped
 * like `ncc_home_*`, because they are the same kind of question asked about a
 * different directory: list what is registered, find a file, read it in its
 * actual encoding.
 *
 * ## Why the model gets an id and never a path
 *
 * Same argument as `home-tools.ts`, and the same consequence: a path is a thing
 * the model would guess from an earlier conversation, while an id is resolved
 * against the operator's own registrations. The `fe-` prefix on the id is the
 * one addition — it makes an id from `ncc_home_list` visibly the wrong argument
 * here, instead of silently pointing at an installation directory.
 *
 * ## Why none of the three is gated
 *
 * They write nothing. A gate on a read trains the operator to approve without
 * reading, which costs more than it protects.
 */
import type { Context } from '@deepseek-ai/cordis'
import { FrontendError, type YonFrontendsService } from './frontend-service.ts'
import type {
  FrontendGrepPayload, FrontendPagesPayload, FrontendView,
} from '../shared/types.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns, in registration order. */
export const FRONTEND_TOOL_NAMES = [
  'ncc_fe_list', 'ncc_fe_find', 'ncc_fe_read', 'ncc_fe_pages', 'ncc_fe_grep',
] as const

/** How many files a find returns when the caller does not say. */
const DEFAULT_FIND_LIMIT = 50

/** The pending-state card a UI renders for one call. */
function card(title: string): YonToolCallView {
  return { card: 'generic', title, kind: 'read' }
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FrontendError('invalid-input', `${argument} 必须是非空字符串`)
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
        throw new FrontendError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new FrontendError('invalid-input', `${spec.name} 已被取消`)
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
  throw new FrontendError('invalid-input', `lines 要写成「起始-结束」或一个行号，例如 120-180；收到的是「${raw}」`)
}

/** A byte count in the unit a person reads it in. */
function sizeText(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}

/** What the probe concluded, in the words the model needs. */
function shapeText(shape: NonNullable<FrontendView['profile']>['shape']): string {
  switch (shape) {
    case 'scaffold': return '前端源码工程'
    case 'deployed': return '部署产物（编译后的页面，不是源码）'
    case 'not-a-project': return '不像前端源码工程'
    case 'not-found': return '路径读不出来'
  }
}

/** The one-line summary of a project, for the list's answer. */
function summarize(row: FrontendView): string {
  const parts = [row.id, row.label, row.path]
  if (row.isDefault) parts.push('默认')
  if (!row.ready) parts.push('路径读不出来')
  return parts.join(' · ')
}

/** The JSON Schema of the list's answer. */
const LIST_VALUE = {
  type: 'object',
  required: ['count', 'frontends'],
  properties: {
    count: { type: 'number' },
    frontends: { type: 'array', items: { type: 'object' } },
  },
} as const

/** The JSON Schema of a find's answer. */
const FIND_VALUE = {
  type: 'object',
  required: ['frontend', 'matches', 'scanned', 'capped', 'skipped'],
  properties: {
    frontend: { type: 'string' },
    matches: { type: 'array', items: { type: 'object' } },
    scanned: { type: 'number' },
    capped: { type: 'boolean' },
    skipped: { type: 'array', items: { type: 'string' } },
  },
} as const

/** The JSON Schema of a read's answer. */
const READ_VALUE = {
  type: 'object',
  required: ['frontend', 'rel', 'encoding', 'totalLines', 'from', 'to', 'text'],
  properties: {
    frontend: { type: 'string' },
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

/** The JSON Schema of a pages answer. */
const PAGES_VALUE = {
  type: 'object',
  required: ['frontend', 'builtAt', 'totalNodes', 'totalPages', 'matched', 'nodes'],
  properties: {
    frontend: { type: 'string' },
    builtAt: { type: 'string' },
    totalNodes: { type: 'number' },
    totalPages: { type: 'number' },
    matched: { type: 'number' },
    nodes: { type: 'array', items: { type: 'object' } },
  },
} as const

/** The JSON Schema of a grep answer. */
const GREP_VALUE = {
  type: 'object',
  required: ['frontend', 'pattern', 'matches', 'filesScanned', 'filesMatched', 'capped', 'timedOut', 'skipped'],
  properties: {
    frontend: { type: 'string' },
    pattern: { type: 'string' },
    matches: { type: 'array', items: { type: 'object' } },
    filesScanned: { type: 'number' },
    filesMatched: { type: 'number' },
    capped: { type: 'boolean' },
    timedOut: { type: 'boolean' },
    skipped: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * Register the front-end source tools.
 * @param ctx - host context carrying the tool registry.
 * @param frontends - the service holding the operator's registrations.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonFrontendTools(ctx: Context, frontends: YonFrontendsService): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_fe_list',
    description: 'List the NCC front-end source projects (hotwebs 多页脚手架工程) the operator registered on '
      + 'this machine: the id to address each one by, its version, path, and what an earlier probe found — '
      + 'whether it is really a source project or a deployed bundle, how many page entries it has, its size, '
      + 'and the build switches in its config.json. Use this BEFORE asking the operator where the front-end '
      + 'source is, and before reading any page source: it is also the only place the id for ncc_fe_find / '
      + 'ncc_fe_read comes from. This is front-end SOURCE, not the installation directory — for backend '
      + 'sources, jars and .bmf metadata use ncc_home_list instead.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: LIST_VALUE,
    async execute() {
      const payload = await frontends.list()
      return { count: payload.frontends.length, frontends: payload.frontends as unknown as readonly FrontendView[] }
    },
    render(value) {
      const list = value as { count: number; frontends: readonly FrontendView[] }
      if (list.count === 0) {
        return '还没有登记任何 NCC 前端源码工程。请使用者在 Yon 面板的「前端源码」入口里登记一个——'
          + '路径指向 hotwebs 工程本身（有 src/ 与 config.json 的那一层），不是它的上一级，也不是安装目录。'
      }
      const lines = [`${list.count} 个已登记的前端源码工程：`, '']
      for (const row of list.frontends) {
        lines.push(`  ${summarize(row)}`)
        const profile = row.profile
        if (profile === undefined) {
          lines.push('      还没有探测过')
        } else {
          lines.push(`      ${shapeText(profile.shape)} · ${profile.nodes} 个页面节点（${profile.pages} 个入口） · `
            + `${profile.files} 个文件 · ${sizeText(profile.bytes)}`)
          if (profile.domains.length > 0) {
            const domains = profile.domains
              .filter(domain => domain.pages > 0)
              .map(domain => `${domain.name}(${domain.pages})`)
              .join('、')
            if (domains !== '') lines.push(`      页面领域：${domains}`)
          }
          if (profile.buildEntry.length > 0) {
            lines.push(`      config.json 构建入口：${profile.buildEntry.join('、')}`)
          }
          if (profile.proxy !== undefined) lines.push(`      后端代理：${profile.proxy}`)
          for (const warning of profile.warnings) lines.push(`      ⚠ ${warning}`)
        }
        // Whether a page index exists is what decides whether ncc_fe_pages answers
        // instantly or walks the project, so it belongs in the one answer the model
        // reads first — and a stale one is named, not left to be discovered later.
        lines.push(row.pageIndex === undefined
          ? '      页面索引：没有（ncc_fe_pages 第一次调用会建一次）'
          : `      页面索引：${row.pageIndex.nodes} 节点 · ${row.pageIndex.pages} 入口 · `
            + `${row.pageIndex.builtAt.slice(0, 16).replace('T', ' ')} 建`
            + (row.pageIndex.stale ? '（登记路径改过，已过期，需要重建）' : ''))
      }
      lines.push('', '用 ncc_fe_find 找文件、ncc_fe_read 读文件时，frontend 参数传上面的 id（不是路径）。'
        + '按功能找页面用 ncc_fe_pages，按内容找用 ncc_fe_grep。')
      return lines.join('\n')
    },
    presentCall: () => card('列出已登记的前端源码工程'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_fe_find',
    description: 'Find files inside one registered front-end source project by file name and/or extension, '
      + 'and return their paths relative to the project. Use it to locate a page directory, an event '
      + 'handler, a component, a less/json file, or every occurrence of a module name. At least one of name '
      + 'and ext is required. node_modules/, dist/ and src/platform/ (the runtime library, not business '
      + 'code) are skipped and named in the answer, and there is an upper bound on both the number of '
      + 'matches and how much of the tree is walked.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['frontend'],
      properties: {
        frontend: {
          type: 'string',
          description: 'The id from ncc_fe_list, exactly as returned — not a path.',
        },
        name: {
          type: 'string',
          description: 'Case-insensitive substring of the file name, for example "bankcontrast" or "index.js".',
        },
        ext: {
          type: 'string',
          description: 'Extension, with or without the dot, for example "js" or ".less".',
        },
        under: {
          type: 'string',
          description: 'A directory inside the project to start from, relative to it — for example '
            + '"src/cmp/bank". The whole project when omitted.',
        },
        limit: {
          type: 'number',
          description: `How many matches to return at most; defaults to ${DEFAULT_FIND_LIMIT}, capped at 200.`,
        },
      },
    },
    outputSchema: FIND_VALUE,
    async execute(args) {
      const frontend = asString(args.frontend, 'frontend')
      const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : undefined
      const ext = typeof args.ext === 'string' && args.ext.trim() !== '' ? args.ext.trim() : undefined
      if (name === undefined && ext === undefined) {
        throw new FrontendError('invalid-input', 'name 和 ext 至少要给一个，否则会把整个工程的近万个文件都列出来。')
      }
      const result = await frontends.find(frontend, {
        ...name === undefined ? {} : { name },
        ...ext === undefined ? {} : { ext },
        ...typeof args.under === 'string' && args.under.trim() !== '' ? { under: args.under.trim() } : {},
        ...typeof args.limit === 'number' ? { limit: args.limit } : {},
      })
      return result as unknown as {
        frontend: string
        matches: readonly unknown[]
        scanned: number
        capped: boolean
        skipped: readonly string[]
      }
    },
    render(value) {
      const result = value as {
        frontend: string
        matches: readonly { rel: string; size: number }[]
        scanned: number
        capped: boolean
        skipped: readonly string[]
      }
      const skipped = result.skipped.length === 0 ? '' : `；跳过 ${result.skipped.join('、')}`
      if (result.matches.length === 0) {
        return `没有找到匹配的文件（扫描了 ${result.scanned} 个目录项${skipped}）。`
          + '可以放宽一点：换更短的片段、去掉 ext、或用 under 指定一个更可能的子树。'
      }
      return [
        `找到 ${result.matches.length} 个（扫描了 ${result.scanned} 个目录项${result.capped ? '，已到上限' : ''}${skipped}）：`,
        ...result.matches.map(match => `  ${match.rel}（${sizeText(match.size)}）`),
        '',
        '用 ncc_fe_read 读的时候，path 传这里的相对路径。',
      ].join('\n')
    },
    presentCall(args) {
      const what = [args.name, args.ext].filter(part => typeof part === 'string' && part !== '').join(' / ')
      return card(`在前端源码里找文件：${what === '' ? '（没给条件）' : what}`)
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_fe_read',
    description: 'Read one text file inside a registered front-end source project. The file is decoded the '
      + 'way it is actually stored, not assumed to be UTF-8: NCC front-end projects mix UTF-8 and GBK, and a '
      + 'file that declares its own encoding is read as declared. The answer names the encoding it used, so '
      + 'a mojibake reading is visible rather than silent. Values of secret keys in config files come back '
      + 'masked. Binary files are refused, and a large file is read up to a character budget — use lines to '
      + 'read a window of one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['frontend', 'path'],
      properties: {
        frontend: {
          type: 'string',
          description: 'The id from ncc_fe_list, exactly as returned — not a path.',
        },
        path: {
          type: 'string',
          description: 'Path to the file, relative to the project — as ncc_fe_find returned it.',
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
      const frontend = asString(args.frontend, 'frontend')
      const path = asString(args.path, 'path')
      const window = parseLines(args.lines)
      const encoding = typeof args.encoding === 'string' && args.encoding.trim() !== ''
        ? args.encoding.trim()
        : undefined
      const result = await frontends.read(frontend, path, {
        ...window,
        ...encoding === undefined ? {} : { encoding },
      })
      return result as unknown as {
        frontend: string
        rel: string
        encoding: string
        totalLines: number
        from: number
        to: number
        text: string
      }
    },
    render(value) {
      const result = value as {
        frontend: string
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
      return card(`读前端源码文件：${String(args.path ?? '')}`)
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_fe_pages',
    description: 'List the page nodes of one registered front-end project: each node is '
      + 'src/{领域}/{模块}/{节点}, the unit a person calls "一个页面/一个功能", with its build entries '
      + '(list/card/main…) and how many files it holds. Use it to answer "which pages does this version '
      + 'cover", to find the directory of a page by name (term matches 领域/模块/节点), or to pick the path '
      + 'ncc_fe_read should read. The index is built on first ask and stored; `builtAt` says how old it is. '
      + 'Component and refer folders are not pages and do not appear here — use ncc_fe_find for those.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['frontend'],
      properties: {
        frontend: {
          type: 'string',
          description: 'The id from ncc_fe_list, exactly as returned — not a path.',
        },
        term: {
          type: 'string',
          description: 'Case-insensitive substring of 领域/模块/节点, for example "bank" or "bankcontrast".',
        },
        domain: {
          type: 'string',
          description: 'Narrow to one domain (the first directory under src/), for example "cmp".',
        },
        module: {
          type: 'string',
          description: 'Narrow to one module (the second directory under src/), for example "bank".',
        },
        node: {
          type: 'string',
          description: 'Narrow to one node (the third directory under src/), for example "bankcontrast_tzwy".',
        },
        limit: {
          type: 'number',
          description: 'How many nodes to return at most; defaults to 100, capped at 500.',
        },
      },
    },
    outputSchema: PAGES_VALUE,
    async execute(args) {
      const frontend = asString(args.frontend, 'frontend')
      const result = await frontends.pages(frontend, {
        ...typeof args.term === 'string' && args.term.trim() !== '' ? { term: args.term.trim() } : {},
        ...typeof args.domain === 'string' && args.domain.trim() !== '' ? { domain: args.domain.trim() } : {},
        ...typeof args.module === 'string' && args.module.trim() !== '' ? { module: args.module.trim() } : {},
        ...typeof args.node === 'string' && args.node.trim() !== '' ? { node: args.node.trim() } : {},
        ...typeof args.limit === 'number' ? { limit: args.limit } : {},
      })
      return result as unknown as {
        frontend: string
        builtAt: string
        totalNodes: number
        totalPages: number
        matched: number
        nodes: readonly unknown[]
      }
    },
    render(value) {
      const result = value as FrontendPagesPayload
      if (result.matched === 0) {
        return `没有匹配的页面节点（这个工程共 ${result.totalNodes} 个节点 / ${result.totalPages} 个入口）。`
          + '换一个更短的片段，或者用 ncc_fe_find 按文件名找组件与参照。'
      }
      const lines = [
        `${result.frontend}：共 ${result.totalNodes} 个页面节点 / ${result.totalPages} 个入口；`
          + `本次匹配 ${result.matched} 个（索引 ${result.builtAt.slice(0, 19).replace('T', ' ')} 建）：`,
        '',
      ]
      for (const node of result.nodes) {
        lines.push(`  ${node.domain}/${node.module}/${node.node}（${node.files} 个文件 · ${sizeText(node.bytes)}）`)
        for (const entry of node.entries.slice(0, 5)) {
          lines.push(`      ${entry.kind} → ${entry.rel}`)
        }
        if (node.entries.length > 5) lines.push(`      …还有 ${node.entries.length - 5} 个入口`)
      }
      lines.push('', '用 ncc_fe_read 读上面的 rel 路径；按内容找用 ncc_fe_grep。')
      return lines.join('\n')
    },
    presentCall: () => card('列前端页面（节点/入口）'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_fe_grep',
    description: 'Search the TEXT of one registered front-end project for a literal string or a regular '
      + 'expression, and return the matching lines with their file and line number. This is the tool for '
      + '"这个接口 / 字段 / 按钮 code / 提示语是在哪里写的" — a name search cannot answer that. It reads '
      + 'text extensions only, skips src/platform, node_modules, dist and .git (named in the answer), caps '
      + 'the hits per file and in total, and returns what it has with timedOut: true rather than failing '
      + 'when the time budget runs out. Narrow it with `under` or `ext` when the project is large.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['frontend', 'pattern'],
      properties: {
        frontend: {
          type: 'string',
          description: 'The id from ncc_fe_list, exactly as returned — not a path.',
        },
        pattern: {
          type: 'string',
          description: 'Literal text to find (case-insensitive), or a regular expression when regex is true. '
            + 'For example "bankcontrast" or "/nccloud/cmp/bank".',
        },
        regex: {
          type: 'boolean',
          description: 'Treat pattern as a regular expression (case-insensitive). Default false: literal text.',
        },
        ext: {
          type: 'string',
          description: 'One extension, with or without the dot, for example "js" or "less". Every text '
            + 'extension when omitted.',
        },
        under: {
          type: 'string',
          description: 'A directory inside the project to search, relative to it — for example '
            + '"src/cmp/bank". The whole of src/ when omitted.',
        },
        limit: {
          type: 'number',
          description: 'How many matching lines to return at most; defaults to 40, capped at 200.',
        },
      },
    },
    outputSchema: GREP_VALUE,
    async execute(args) {
      const frontend = asString(args.frontend, 'frontend')
      const pattern = asString(args.pattern, 'pattern')
      const result = await frontends.grep(frontend, {
        pattern,
        ...typeof args.regex === 'boolean' ? { regex: args.regex } : {},
        ...typeof args.ext === 'string' && args.ext.trim() !== '' ? { ext: args.ext.trim() } : {},
        ...typeof args.under === 'string' && args.under.trim() !== '' ? { under: args.under.trim() } : {},
        ...typeof args.limit === 'number' ? { limit: args.limit } : {},
      })
      return result as unknown as {
        frontend: string
        pattern: string
        matches: readonly unknown[]
        filesScanned: number
        filesMatched: number
        capped: boolean
        timedOut: boolean
        skipped: readonly string[]
      }
    },
    render(value) {
      const result = value as FrontendGrepPayload
      if (result.matches.length === 0) {
        return `没有找到「${result.pattern}」（读了 ${result.filesScanned} 个文本文件${result.timedOut ? '，时间到就停了' : ''}）。`
          + '可以换更短的片段、去掉 regex、或用 under 缩小目录。'
      }
      const lines = [
        `「${result.pattern}」命中 ${result.matches.length} 行，分布在 ${result.filesMatched} 个文件`
          + `（读了 ${result.filesScanned} 个文本文件${result.capped ? '，已到上限' : ''}${result.timedOut ? '，时间到就停了' : ''}；`
          + `跳过 ${result.skipped.join('、')}）：`,
        '',
      ]
      for (const hit of result.matches) {
        lines.push(`  ${hit.rel}:${hit.line}`)
        lines.push(`      ${hit.text}`)
      }
      lines.push('', '用 ncc_fe_read 读上下文时，path 传命中行前面的相对路径。')
      return lines.join('\n')
    },
    presentCall(args) {
      return card(`在前端源码里搜内容：${String(args.pattern ?? '')}`)
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
