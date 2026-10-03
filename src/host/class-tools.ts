/**
 * The class index, exposed to the agent as two tools: build one, then look in it.
 *
 * The pair exists for one question — "which jar holds this class" — which is the
 * precondition for reading a platform implementation when the documentation runs
 * out. A stack trace gives a fully-qualified name; a search returns the jar; the
 * jar is then a `cfr` invocation away from being readable.
 *
 * ## Why building is a tool of its own
 *
 * Building walks an entire installation. It is slow — measured at 26.2 s on the
 * reference Home — it is deliberate, and it is done once per version rather than per
 * question. So it is a call the operator asks for, not something a search does behind
 * their back when it finds no index: a search over a missing index says which versions
 * *are* indexed instead.
 *
 * ## Why the build names a Home and not a path
 *
 * `knowledge_build_index` takes the id `ncc_home_list` returned, the same as every
 * other call that reaches an installation. It used to take a raw path, and that is
 * exactly how two indexes came to exist for `C:\Users\...\Documents` — a path the
 * model offered, a build that obeyed, and an index stored under a version label that
 * nothing else on the machine recognised. A path the operator registered cannot be
 * that, and the version comes from the registration rather than from the caller, so
 * the label under which an index is stored is decided once, by the person who owns
 * the installation.
 *
 * ## Why neither tool is gated
 *
 * They write nothing of the operator's: an index lands under the plugin's own data
 * directory, and a search only reads it. Gating them would train the operator to
 * approve without reading, which is the one habit a gate cannot afford.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  classIndexPath, listClassIndexes, readClassIndex, searchClassIndex,
  type ClassIndex, type ClassHit, type StoredIndex,
} from './class-index.ts'
import type { YonClassService } from './class-service.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const CLASS_TOOL_NAMES = ['knowledge_build_index', 'ncc_class_search'] as const

/** How many hits one search returns when the caller does not say. */
const DEFAULT_LIMIT = 25

/** The largest limit a caller may ask for. */
const MAX_LIMIT = 200

/** What a call can fail with. */
export class ClassIndexError extends Error {
  constructor(readonly code: 'invalid-input' | 'not-found' | 'failed', message: string) {
    super(message)
    this.name = 'ClassIndexError'
  }
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ClassIndexError('invalid-input', `${argument} 必须是非空字符串`)
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
        throw new ClassIndexError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new ClassIndexError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** The JSON Schema of a build's answer. */
const BUILD_VALUE = {
  type: 'object',
  required: ['home', 'version', 'totalJars', 'totalClasses', 'path', 'seconds'],
  properties: {
    home: { type: 'string' },
    version: { type: 'string' },
    totalJars: { type: 'number' },
    totalClasses: { type: 'number' },
    path: { type: 'string' },
    seconds: { type: 'number' },
  },
} as const

/** The JSON Schema of a search's answer. */
const SEARCH_VALUE = {
  type: 'object',
  required: ['term', 'version', 'hits', 'totalClasses', 'indexed'],
  properties: {
    term: { type: 'string' },
    version: { type: 'string' },
    hits: { type: 'array', items: { type: 'object' } },
    totalClasses: { type: 'number' },
    indexed: { type: 'array', items: { type: 'object' } },
  },
} as const

/** A byte count the model can read. */
function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Register the class index tools.
 * @param ctx - host context carrying the tool registry.
 * @param classes - the service that builds and reports on indexes. It is where the
 *   version label comes from: the caller names a Home, and the registration says
 *   which version that Home is.
 * @param defaultVersion - the version of the Home the operator marked as default,
 *   consulted when a search names no version. This is the one place a registration
 *   changes what an existing tool does: without it, "which index did you mean"
 *   falls back to "the one built most recently", which is a property of the last
 *   build rather than of the installation the operator is working on.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonClassTools(
  ctx: Context,
  classes: YonClassService,
  defaultVersion?: () => Promise<string | undefined>,
): () => void {
  const disposers: Array<() => void> = []

  /**
   * Indexes already read, keyed by version.
   *
   * An index is tens of megabytes of JSON; re-parsing one per search would
   * dominate the call.
   */
  const loaded = new Map<string, ClassIndex>()

  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_build_index',
    description: 'Build a class index for one YonBIP or NCC installation: walk its home directory, '
      + 'read the class names out of every .jar, note the loose .class and .java files a module may '
      + 'keep under its classes directory, and store a lookup table mapping each class to the file '
      + 'that holds it. Only the class names are read — nothing is decompressed — so a run takes tens '
      + 'of seconds rather than hours, but it does walk the whole installation, so ask for it '
      + 'deliberately rather than as a guess. The index lands under the plugin\'s own data directory, '
      + 'never inside the installation, and is stored under the Home\'s version — which is why the '
      + 'only argument is the id ncc_home_list returned. Call ncc_home_list first for that id; do not '
      + 'ask the operator for a path. ncc_class_search then uses the index.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['home'],
      properties: {
        home: {
          type: 'string',
          description: 'The id from ncc_home_list, exactly as returned — not a path. The index is '
            + 'stored under that registration\'s version.',
        },
      },
    },
    outputSchema: BUILD_VALUE,
    async execute(args, signal) {
      const home = asString(args.home, 'home')
      if (signal.aborted) throw new ClassIndexError('failed', '建索引已被取消')
      // Awaited, unlike the panel's: the model asked for this index and needs the answer,
      // and the walk is seconds. The same service runs it, so a build the panel started is
      // joined rather than duplicated.
      const built = await classes.build(home)
      if (signal.aborted) throw new ClassIndexError('failed', '建索引已被取消')
      return built
    },
    render(value) {
      const built = value as {
        home: string; version: string; totalJars: number; totalClasses: number
        path: string; seconds: number
      }
      return [
        `索引 ${built.version} 建好了：${built.totalJars} 个 jar、${built.totalClasses} 个类，用了 ${built.seconds} 秒。`,
        `存放于 ${built.path}`,
        '',
        `接下来用 ncc_class_search（version 传 ${built.version}，或不传也行）查类。`,
      ].join('\n')
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `建类索引：${String(args.home ?? '')} —— 会扫描整个安装目录`,
        kind: 'other',
      }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_class_search',
    description: 'Find which file holds a class, using an index built by knowledge_build_index. Pass a '
      + 'class name copied out of a stack trace, a simple name, or a fragment: an exact match ranks '
      + 'first, then a match on the simple name, then anything containing the term. Use it when you '
      + 'need to read a platform implementation and the reference documents do not cover it — the '
      + 'answer is the file to look in. That is usually a jar to decompile, but a module shipped '
      + 'without one answers with the .java or .class file itself, which ncc_home_read can open '
      + 'directly. When no index exists for a version, the answer lists the versions that are '
      + 'indexed rather than building one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['term'],
      properties: {
        term: {
          type: 'string',
          description: 'A fully-qualified class name, a simple class name, or a fragment of either.',
        },
        version: {
          type: 'string',
          description: 'Which index to search, for example "2111". When omitted: the version of the Home '
            + 'registered as default in the panel, if an index for it exists; otherwise the most recently '
            + 'built one.',
        },
        limit: {
          type: 'number',
          description: `How many hits to return at most; defaults to ${DEFAULT_LIMIT}, capped at ${MAX_LIMIT}.`,
        },
      },
    },
    outputSchema: SEARCH_VALUE,
    async execute(args) {
      const term = asString(args.term, 'term')
      const requested = typeof args.version === 'string' && args.version !== '' ? args.version : undefined
      const rawLimit = typeof args.limit === 'number' ? Math.floor(args.limit) : DEFAULT_LIMIT
      const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT)

      const stored = await listClassIndexes()
      if (stored.length === 0) {
        throw new ClassIndexError(
          'not-found',
          '还没有任何类索引。先调 ncc_home_list 拿一个 Home 的 id，再用 knowledge_build_index 传那个 id 建一个'
          + '（也可以在 Yon 面板的「Home 管理」里对某个 Home 点一次「建立类索引」）。',
        )
      }

      // The registered default first, the newest index second: a version the
      // operator marked as theirs, when it has an index, is a better answer than
      // whichever index happened to be built last. An index that does not exist
      // falls through rather than failing, so an unindexed default does not make
      // search unusable.
      const registered = requested === undefined ? await defaultVersion?.() : undefined
      const chosen: StoredIndex | undefined = requested !== undefined
        ? stored.find(entry => entry.version === requested)
        : (registered === undefined ? undefined : stored.find(entry => entry.version === registered)) ?? stored[0]
      if (chosen === undefined) {
        throw new ClassIndexError(
          'not-found',
          `没有 version 为「${requested}」的索引。现有：${stored.map(e => e.version).join(', ')}。`
          + '要建的话：先从 ncc_home_list 拿那个 Home 的 id，再 knowledge_build_index 传这个 id。',
        )
      }

      let index = loaded.get(chosen.version)
      if (index === undefined) {
        index = await readClassIndex(chosen.version)
        if (index === undefined) {
          throw new ClassIndexError('failed', `索引文件读不出来：${classIndexPath(chosen.version)}`)
        }
        loaded.set(chosen.version, index)
      }

      const hits = searchClassIndex(index, term, limit)
      return {
        term,
        version: chosen.version,
        hits: hits as unknown as readonly ClassHit[],
        totalClasses: index.totalClasses,
        indexed: stored as unknown as readonly StoredIndex[],
      }
    },
    render(value) {
      const result = value as {
        term: string
        version: string
        hits: readonly ClassHit[]
        totalClasses: number
        indexed: readonly StoredIndex[]
      }
      // Which directory this index describes. Without it a wrong-index answer reads
      // exactly like a right one: a version label alone ("2111") does not say whose
      // classes these are, and an omitted `version` falls back to the newest stored
      // index (`:260`). That fallback was observed answering from an index of the
      // operator's Documents folder, and nothing in the answer said so.
      const home = result.indexed.find(entry => entry.version === result.version)?.home ?? ''
      const source = home === '' ? [] : [`  该索引描述的目录：${home}`]

      if (result.hits.length === 0) {
        return [
          `索引 ${result.version}（${result.totalClasses} 个类）里没有匹配「${result.term}」的类。`,
          ...source,
          '',
          '可以试试：换用更短的类名片段；确认查的是对这个版本建的索引'
            + `（现有：${result.indexed.map(e => e.version).join(', ')}）。`,
        ].join('\n')
      }
      const lines = [
        `「${result.term}」在索引 ${result.version}（${result.totalClasses} 个类）里命中 ${result.hits.length} 个：`,
        ...source,
        '',
      ]
      for (const hit of result.hits) {
        lines.push(`  ${hit.className}`)
        lines.push(`      ${hit.path}`)
      }
      // What to do next depends on what the path is, and the three kinds are not
      // interchangeable: a jar has to be decompiled, a `.java` is the source itself,
      // and a `.class` is a binary that `ncc_home_read` will refuse. Giving one
      // blanket sentence would be wrong for two of them — and it was: measured, 216
      // of the 762 loose entries are `.class` files.
      const kinds = new Set(result.hits.map(hit =>
        hit.path.endsWith('.jar') ? 'jar' : (hit.path.endsWith('.java') ? 'source' : 'compiled')))
      const advice: string[] = []
      if (kinds.has('jar')) {
        advice.push('以 .jar 结尾的是 jar，用 cfr 反编译看实现'
          + '（cfr-0.152.jar 随本包放在 resources/knowledge/ncc/）')
      }
      if (kinds.has('source')) {
        advice.push('以 .java 结尾的是源码，路径相对这份索引的 Home，用 ncc_home_read 直接读')
      }
      if (kinds.has('compiled')) {
        advice.push('以 .class 结尾的是编译产物（二进制，读不了），要反编译或找同名的 .java')
      }
      lines.push('', `${advice.join('；')}。`)
      return lines.join('\n')
    },
    presentCall(args) {
      return { card: 'generic', title: `查类：${String(args.term ?? '')}`, kind: 'read' }
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** The indexes currently stored, for a surface that reports on them. */
export { listClassIndexes, mb }
