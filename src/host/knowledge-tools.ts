/**
 * The reference documents this package ships, exposed to the agent as two tools.
 *
 * ## The gap these close
 *
 * `resources/knowledge/` holds 450 documents migrated out of the operator's skill
 * directories: the platform notes, the code recipes, the troubleshooting
 * write-ups. The skills that used to introduce them referred to them by relative
 * path (`references/GBK文件编辑.md`), and that is exactly what stops working once
 * a skill is bundled — a skill body is inlined at build time, so it can never name
 * a runtime path. The documents arrived; the way to reach them did not.
 *
 * ## Why two tools and not a directory listing
 *
 * The library is 9 MB across two trees. Handing the model a path and letting it
 * read files assumes it can guess which of 450 documents answers the question, and
 * its guesses are worse than a search. `knowledge_search` returns the matching
 * lines with their documents, which is enough to decide what to read;
 * `knowledge_read` then returns one document in full.
 *
 * ## Not the same thing as the `wiki_` tools
 *
 * This library is fixed and read-only: it travels with the package and is the same
 * on every machine. A wiki vault is the operator's own knowledge base, edited and
 * grown over time. "How does this platform behave" belongs here; "what is this
 * entity's physical table" belongs in the vault. Keeping them separate keeps one
 * from being mistaken for the other.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const KNOWLEDGE_TOOL_NAMES = ['knowledge_search', 'knowledge_read'] as const

/**
 * The shipped library, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works
 * for the compiled plugin and for a spec running against the sources.
 */
export const KNOWLEDGE_ROOT = fileURLToPath(new URL('../../resources/knowledge/', import.meta.url))

/** How many matching documents one search reports at most. */
const MAX_FILES = 12

/** How many matching lines are reported per document. */
const MAX_HITS_PER_FILE = 6

/** How much of a matching line is echoed back. */
const MAX_LINE_CHARS = 200

/** What a call can fail with. */
export class KnowledgeError extends Error {
  constructor(readonly code: 'invalid-input' | 'not-found', message: string) {
    super(message)
    this.name = 'KnowledgeError'
  }
}

/** One document in the library. */
interface Doc {
  /** Path relative to {@link KNOWLEDGE_ROOT}, forward-slashed. */
  readonly rel: string
  readonly full: string
  readonly size: number
}

/**
 * The library's documents, cached for the life of the process.
 *
 * They ship inside the package and do not change while it runs, so one walk is
 * enough; a search that re-walked 450 files per call would pay for nothing.
 */
let cached: readonly Doc[] | undefined

/** Walk the library, skipping anything that is not a document. */
async function listDocuments(root = KNOWLEDGE_ROOT): Promise<readonly Doc[]> {
  if (cached !== undefined) return cached
  const found: Doc[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!/\.(md|txt|sql|json|py|java|js)$/i.test(entry.name)) continue
      const info = await stat(full)
      found.push({
        rel: path.relative(root, full).split(path.sep).join('/'),
        full,
        size: info.size,
      })
    }
  }
  await walk(root)
  found.sort((a, b) => a.rel.localeCompare(b.rel, 'zh'))
  cached = found
  return found
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new KnowledgeError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/**
 * Resolve a document path, refusing anything outside the library.
 *
 * The model supplies this path, so it is the one place a `../..` could escape into
 * the rest of the installation. Resolution happens against the real root and the
 * result is checked to still be inside it, rather than the input being sanitised —
 * a check on the outcome cannot be walked around by an encoding the input filter
 * did not anticipate.
 *
 * @param requested - the path as the model gave it.
 * @returns the document, or undefined when no such document exists.
 */
async function resolveDocument(requested: string): Promise<Doc | undefined> {
  const root = path.resolve(KNOWLEDGE_ROOT)
  const cleaned = requested.replace(/^[/\\]+/, '')
  const target = path.resolve(root, cleaned)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new KnowledgeError('invalid-input', `路径必须在知识库目录内：${requested}`)
  }
  const documents = await listDocuments()
  const normalised = path.relative(root, target).split(path.sep).join('/')
  const exact = documents.find(doc => doc.rel === normalised)
  if (exact !== undefined) return exact

  // A bare file name is what a model has when a skill body mentioned the document
  // by name alone; accept it when exactly one document matches, and report the
  // ambiguity rather than guessing when more than one does.
  if (!normalised.includes('/')) {
    const byName = documents.filter(doc => doc.rel.split('/').pop() === normalised)
    if (byName.length === 1) return byName[0]
    if (byName.length > 1) {
      throw new KnowledgeError(
        'invalid-input',
        `有 ${byName.length} 个文档叫「${normalised}」，请给出完整路径：\n`
          + byName.map(doc => `  ${doc.rel}`).join('\n'),
      )
    }
  }
  return undefined
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
        throw new KnowledgeError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new KnowledgeError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** The JSON Schema of a search's answer. */
const SEARCH_VALUE = {
  type: 'object',
  required: ['query', 'files', 'scanned'],
  properties: {
    query: { type: 'string' },
    scanned: { type: 'number' },
    files: { type: 'array', items: { type: 'object' } },
  },
} as const

/** The JSON Schema of a read's answer. */
const READ_VALUE = {
  type: 'object',
  required: ['path', 'text'],
  properties: {
    path: { type: 'string' },
    size: { type: 'number' },
    truncated: { type: 'boolean' },
    text: { type: 'string' },
  },
} as const

/** One document's answer, as the search tool shapes it. */
interface SearchFile {
  readonly path: string
  readonly hits: readonly { readonly line: number; readonly text: string }[]
}

/** How much of a document one read returns before it says it truncated. */
const MAX_READ_CHARS = 60_000

/**
 * Register the knowledge library tools.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonKnowledgeTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_search',
    description: 'Search the platform reference library this plugin ships: around 450 documents of '
      + 'YonBIP and NCC notes, code recipes and troubleshooting write-ups, kept under '
      + 'resources/knowledge/{bip,ncc}. Use it when the question is about how the platform behaves, '
      + 'what an error means, or how something is done — the library is fixed and read-only, unlike '
      + 'the operator\'s own wiki vault, which wiki_lookup searches. The match is literal and '
      + 'case-insensitive, so search for a distinctive phrase rather than a whole question. Follow up '
      + 'with knowledge_read, passing a path exactly as returned.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'A distinctive phrase to look for, matched literally and case-insensitively.' },
        scope: { type: 'string', description: 'Optional subtree to search: "bip" or "ncc". Both when omitted.' },
      },
    },
    outputSchema: SEARCH_VALUE,
    async execute(args) {
      const query = asString(args.query, 'query')
      const scope = typeof args.scope === 'string' && args.scope !== '' ? args.scope.replace(/\/+$/, '') : undefined
      const documents = await listDocuments()
      const needle = query.toLowerCase()
      const files: SearchFile[] = []
      let scanned = 0

      for (const doc of documents) {
        if (scope !== undefined && !doc.rel.startsWith(`${scope}/`)) continue
        scanned++
        if (files.length >= MAX_FILES) continue
        const text = await readFile(doc.full, 'utf8').catch(() => '')
        const hits: { line: number; text: string }[] = []
        const lines = text.split(/\r?\n/)
        for (let i = 0; i < lines.length && hits.length < MAX_HITS_PER_FILE; i++) {
          const line = lines[i]
          if (line === undefined || !line.toLowerCase().includes(needle)) continue
          const trimmed = line.trim()
          hits.push({
            line: i + 1,
            text: trimmed.length > MAX_LINE_CHARS ? `${trimmed.slice(0, MAX_LINE_CHARS)}…` : trimmed,
          })
        }
        if (hits.length > 0) files.push({ path: doc.rel, hits })
      }

      return { query, files: files as unknown as readonly SearchFile[], scanned }
    },
    render(value) {
      const result = value as { query: string; files: readonly SearchFile[]; scanned: number }
      if (result.files.length === 0) {
        return [
          `在参考库里没有找到「${result.query}」（已扫描 ${result.scanned} 个文档）。`,
          '',
          '可以试试：换用更短的、更有辨识度的词组；或确认这条知识属于平台参考库，'
            + '而不是使用者自己的知识库（后者用 wiki_lookup 查）。',
        ].join('\n')
      }
      const lines = [
        `「${result.query}」命中 ${result.files.length} 个文档（已扫描 ${result.scanned} 个）：`,
        '',
      ]
      for (const file of result.files) {
        lines.push(`  ${file.path}`)
        for (const hit of file.hits) lines.push(`      ${String(hit.line).padStart(5)}  ${hit.text}`)
        lines.push('')
      }
      lines.push('用 knowledge_read 传上面的路径读全文。')
      return lines.join('\n')
    },
    presentCall(args) {
      return { card: 'generic', title: `查参考库：${String(args.query ?? '')}`, kind: 'read' }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_read',
    description: 'Read one document from the platform reference library this plugin ships. Pass a '
      + 'path exactly as knowledge_search returned it, such as '
      + '"bip/references/旗舰版/数据库查询约束.md", or just a file name when it is unique. Long '
      + 'documents are truncated, and the answer says so when it is. Every document in the library '
      + 'is read-only and identical on every machine.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the library root, as knowledge_search returned it; a unique file name also works.',
        },
      },
    },
    outputSchema: READ_VALUE,
    async execute(args) {
      const requested = asString(args.path, 'path')
      const doc = await resolveDocument(requested)
      if (doc === undefined) {
        throw new KnowledgeError(
          'not-found',
          `参考库里没有这个文档：${requested}\n先用 knowledge_search 找到确切的路径。`,
        )
      }
      const text = await readFile(doc.full, 'utf8')
      const truncated = text.length > MAX_READ_CHARS
      return {
        path: doc.rel,
        size: doc.size,
        truncated,
        text: truncated
          ? `${text.slice(0, MAX_READ_CHARS)}\n\n…（文档共 ${text.length} 字符，此处截断）`
          : text,
      }
    },
    render(value) {
      const doc = value as { path: string; text: string; truncated: boolean }
      return [`${doc.path}${doc.truncated ? '（已截断）' : ''}`, '', doc.text].join('\n')
    },
    presentCall(args) {
      return { card: 'generic', title: `读参考文档：${String(args.path ?? '')}`, kind: 'read', rawInput: args.path }
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
