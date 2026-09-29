/**
 * Writing into the knowledge base: three modes, no way to overwrite a page.
 *
 * ## What this is for
 *
 * A lookup that comes back empty means the entity has never been digested. Until
 * something can write, that stays true forever: the model can reach the database
 * and read the field list, but what it learns is gone the moment the session ends.
 * This is the way back into the vault.
 *
 * ## The one decision everything else follows from
 *
 * The danger is not writing, it is overwriting. A new page nobody reads is a page
 * somebody can delete; a page that replaced a `verified` one has destroyed work
 * that was checked against a running system, and nothing about the vault will say
 * so afterwards.
 *
 * So the dangerous operation is not gated — it does not exist. There is no
 * `replace` mode, and no argument combination produces one. A gate can be clicked
 * through; an operation that was never implemented cannot be. What remains is the
 * three ways a knowledge base actually grows:
 *
 * - `create` — the entity has no page for this platform version
 * - `append` — the page exists; add a section to it
 * - `frontmatter` — the page exists; correct its verification state
 *
 * ## Why the checks live here rather than in the model's instructions
 *
 * Every one of them is something a model could be told to do and would sometimes
 * forget. The vault's own schema states the rules; a tool that enforces them is
 * worth more than a paragraph asking nicely. Each check that fails names what it
 * found and what to do instead, because a refusal that does not say how to proceed
 * just teaches the model to try something else.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { entityDirOf, wikiIndexPath, type WikiPage, type WikiVault } from './wiki-index.ts'
import type { YonWikiService } from './wiki-service.ts'
import type { WikiStore } from './wiki-store.ts'
import { dispositionOf, permissionsOf } from './tools.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const WIKI_WRITE_TOOL_NAMES = ['wiki_write'] as const

/** The statuses a page may carry, as the vault's schema defines them. */
const STATUSES = ['verified', 'outdated', 'unverified', 'superseded'] as const

/** Where a page's knowledge came from, as the vault's schema defines it. */
const SOURCE_TYPES = ['source_code', 'doc', 'practice', 'inference', 'api_response'] as const

/** Fields `frontmatter` mode may correct. Deliberately short. */
const PATCHABLE = ['last_verified', 'status', 'project'] as const

/** The heading new pages are appended to in `index.md`. */
const INDEX_SECTION = '## 自动消化'

/** What a call can fail with. */
export class WikiWriteError extends Error {
  constructor(readonly code: 'invalid-input' | 'not-found' | 'conflict' | 'failed', message: string) {
    super(message)
    this.name = 'WikiWriteError'
  }
}

/** The outcome of one write. */
export interface WikiWriteResult {
  readonly ok: boolean
  readonly mode: string
  readonly vault: string
  readonly page: string
  readonly file: string
  /** What was written, in one line. */
  readonly summary: string
  /** Files touched besides the page itself. */
  readonly sideEffects: readonly string[]
}

/** One parsed frontmatter document. */
interface ParsedPage {
  readonly frontmatter: Record<string, string>
  /** The body after the closing `---`, verbatim. */
  readonly body: string
  /** The heading level-1 lines in the body. */
  readonly headings: readonly string[]
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WikiWriteError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Read an optional string. */
function asOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Parse a page into frontmatter plus body. */
function parsePage(text: string): ParsedPage {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  const frontmatter: Record<string, string> = {}
  let body = text
  if (m !== null) {
    for (const line of (m[1] ?? '').split(/\r?\n/)) {
      const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
      const key = pair?.[1]
      const value = pair?.[2]
      if (key !== undefined && value !== undefined) {
        frontmatter[key] = value.trim().replace(/^["']|["']$/g, '')
      }
    }
    body = text.slice(m[0].length)
  }
  const headings = [...body.matchAll(/^(#{1,3})\s+(.+?)\s*$/gm)]
    .map(hit => hit[2])
    .filter((heading): heading is string => heading !== undefined)
  return { frontmatter, body, headings }
}

/** The line a page identifies itself on. The index reads the URI out of it. */
function titleLine(name: string, uri: string): string {
  return `# ${name} (\`${uri}\`)`
}

/**
 * Build a new page's text.
 *
 * The frontmatter and the title line are generated here rather than accepted from
 * the caller: the title line is what the index reads the URI out of, so a page
 * whose title is malformed is a page that can never be found again — it would be
 * written, and invisible.
 *
 * @param fields - the facts the frontmatter carries.
 * @param body - the body the caller supplied.
 * @returns the whole document.
 */
function composePage(fields: {
  name: string
  uri: string
  sourceType: string
  status: string
  platformVersion: string
  project?: string
}, body: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const front = [
    '---',
    `tags: []`,
    `created: ${today}`,
    `updated: ${today}`,
    `sources: []`,
    `platform_version: "${fields.platformVersion}"`,
    `project: "${fields.project ?? ''}"`,
    `last_verified: ${today}`,
    `status: ${fields.status}`,
    `source_type: ${fields.sourceType}`,
    '---',
    '',
    titleLine(fields.name, fields.uri),
    '',
  ]
  return `${front.join('\n')}${body.trim()}\n`
}

/** Serialise one frontmatter record back into a document. */
function recomposePage(frontmatter: Record<string, string>, body: string): string {
  const lines = Object.entries(frontmatter).map(([key, value]) =>
    (value === '' ? `${key}: ""` : `${key}: ${/[\s"']/.test(value) ? `"${value}"` : value}`))
  return `---\n${lines.join('\n')}\n---\n${body}`
}

/** Write a file so that a reader never sees a half-written page. */
async function writeAtomic(target: string, content: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, target)
}

/** Append one line to a file, creating it when absent. */
async function appendLine(target: string, line: string): Promise<void> {
  const existing = await readFile(target, 'utf8').catch(() => '')
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const separator = existing === '' || existing.endsWith('\n') ? '' : eol
  await writeFile(target, `${existing}${separator}${line}${eol}`, 'utf8')
}

/**
 * Record a write in `log.md` and `index.md`.
 *
 * Both are appends. `index.md` is a hand-maintained 43 KB document with a
 * considered structure; deciding where a new page belongs inside it needs domain
 * knowledge the tool does not have, and guessing would corrupt the navigation. A
 * fixed section at the end is honest about being automatic.
 *
 * @param vault - the vault written to.
 * @param page - the page name.
 * @param line - a one-line description.
 * @returns the files touched.
 */
async function recordWrite(vault: WikiVault, page: string, line: string): Promise<readonly string[]> {
  const touched: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  const log = path.join(vault.path, 'log.md')
  await appendLine(log, `- ${today} ${line}`).then(() => touched.push('log.md')).catch(() => undefined)

  const index = path.join(vault.path, 'index.md')
  try {
    const existing = await readFile(index, 'utf8')
    const entry = `- [[${page}]] — ${line}`
    if (!existing.includes(entry)) {
      const withSection = existing.includes(INDEX_SECTION)
        ? `${existing.replace(/\s*$/, '')}\n${entry}\n`
        : `${existing.replace(/\s*$/, '')}\n\n${INDEX_SECTION}\n\n${entry}\n`
      await writeFile(index, withSection, 'utf8')
      touched.push('index.md')
    }
  } catch {
    // A vault without an index still accepts pages; the log alone is enough.
  }

  return touched
}

/** Resolve which vault a call means. */
async function pickVault(store: WikiStore, requested: string | undefined): Promise<WikiVault> {
  const { vaults } = await store.read()
  if (vaults.length === 0) {
    throw new WikiWriteError('not-found', '还没有登记任何知识库。先在 Yon 面板的「知识库」里添加 vault。')
  }
  const first = vaults[0]
  if (requested === undefined) {
    if (first === undefined) {
      throw new WikiWriteError('not-found', '登记的知识库列表是空的。')
    }
    return first
  }
  const found = vaults.find(vault => vault.id === requested)
  if (found === undefined) {
    throw new WikiWriteError('not-found', `没有 id 为「${requested}」的知识库。现有：${vaults.map(v => v.id).join(', ')}`)
  }
  return found
}

/** One existing page on disk. */
interface ExistingPage {
  readonly page: string
  readonly uri: string | null
  readonly version?: string
  readonly status?: string
  readonly file: string
  readonly full: string
  readonly text: string
  readonly headings: readonly string[]
  readonly frontmatter: Record<string, string>
  readonly body: string
}

/** Load every page of one vault that shares a URI. */
async function pagesWithUri(
  wiki: YonWikiService,
  vault: WikiVault,
  uri: string,
): Promise<readonly ExistingPage[]> {
  const found = await wiki.lookup(uri, vault.id)
  const exact = found.hits.filter(hit => hit.matchedBy === 'uri' && hit.uri === uri)
  const pages: ExistingPage[] = []
  for (const hit of exact) {
    const rel = await wikiPageFile(vault, hit.page)
    const full = path.join(vault.path, rel)
    const text = await readFile(full, 'utf8').catch(() => undefined)
    if (text === undefined) continue
    const parsed = parsePage(text)
    pages.push({
      page: hit.page,
      uri: hit.uri,
      ...(hit.version === undefined ? {} : { version: hit.version }),
      ...(hit.status === undefined ? {} : { status: hit.status }),
      file: rel,
      full,
      text,
      headings: parsed.headings,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    })
  }
  return pages
}

/** Ask the vault's index for one page's file path. */
async function wikiPageFile(vault: WikiVault, page: string): Promise<string> {
  const dir = entityDirOf(vault.path)
  if (dir === undefined) throw new WikiWriteError('failed', `知识库目录结构无法识别：${vault.path}`)
  const entries = await readFile(wikiIndexPath(vault.path), 'utf8').catch(() => undefined)
  if (entries !== undefined) {
    try {
      const parsed = JSON.parse(entries) as { entities?: readonly WikiPage[] }
      const hit = parsed.entities?.find(entry => entry.page === page)
      if (hit !== undefined) return hit.file
    } catch {
      // Fall through to the conventional location.
    }
  }
  return path.relative(vault.path, path.join(dir, `${page}.md`)).split(path.sep).join('/')
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
        throw new WikiWriteError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new WikiWriteError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/**
 * What the operator is shown before a write runs.
 *
 * The three modes need three different things on screen. Before, all of them got
 * the same 400-character slice of `content` — which for `frontmatter` is nothing at
 * all (it carries no content), and for `append` hides the thing that matters most,
 * which is where the text lands. A prompt somebody cannot judge is a prompt they
 * learn to click through.
 *
 * @param args - the call's arguments, unvalidated.
 * @param store - where the vault list lives, for reading the page a patch targets.
 * @returns the text to show before the call runs.
 */
async function describeWrite(args: Record<string, unknown>, store: WikiStore): Promise<string> {
  const mode = String(args.mode ?? '')
  const page = String(args.page ?? '')
  const source = String(args.sourceType ?? '')
  const body = typeof args.content === 'string' ? args.content : ''
  const clip = (text: string, limit = 1200): string =>
    text.length > limit ? `${text.slice(0, limit)}\n…（共 ${text.length} 字符）` : text

  if (mode === 'create') {
    return [
      '这次调用会在知识库里**新建一个页面**，执行前请确认：',
      '',
      `  页面名：${page}`,
      `  实体 URI：${String(args.uri ?? '')}`,
      `  显示名：${String(args.name ?? '')}`,
      `  平台版本：${String(args.platformVersion ?? '')}`,
      `  验证状态：${String(args.status ?? 'unverified')}（新建）`,
      `  知识来源：${source}`,
      '',
      '将要写入的正文：',
      '',
      clip(body),
      '',
      'create 只新建：同 URI 同版本的页面已存在时，工具会拒绝这次调用。',
    ].join('\n')
  }

  if (mode === 'append') {
    return [
      '这次调用会往已有页面**追加一节**，原正文不会被动，执行前请确认：',
      '',
      `  目标页面：${page}`,
      `  新增章节：## ${String(args.section ?? '')}`,
      `  知识来源：${source}`,
      '',
      '将要追加的内容：',
      '',
      clip(body),
      '',
      '该页面已有同名章节时，工具会拒绝并列出它现有的章节。',
    ].join('\n')
  }

  if (mode === 'frontmatter') {
    const fields = (args.fields ?? {}) as Record<string, unknown>
    // The old values are read here rather than inside the tool, because this is the
    // one mode where the change itself is the subject: "verified → unverified" is
    // the entire decision, and showing only the new value would hide it.
    let before: Record<string, string> | undefined
    const vault = await pickVault(store, asOptional(args.vault)).catch(() => undefined)
    if (vault !== undefined) {
      const rel = await wikiPageFile(vault, page).catch(() => undefined)
      if (rel !== undefined) {
        const text = await readFile(path.join(vault.path, rel), 'utf8').catch(() => undefined)
        if (text !== undefined) before = parsePage(text).frontmatter
      }
    }
    const changes = Object.entries(fields).map(([key, value]) =>
      `  ${key}:  ${before?.[key] ?? '（原值读不到）'}  →  ${String(value)}`)
    return [
      '这次调用会**更正页面的验证状态**，正文不会被动，执行前请确认：',
      '',
      `  页面：${page}`,
      `  知识来源：${source}`,
      '',
      '将要改动的字段：',
      '',
      ...changes,
      '',
      '把 status 从 verified 改成别的，等于撤回一次已在真实环境做过的验证——确认这是有意的。',
    ].join('\n')
  }

  return [
    `这次调用带着不认识的 mode「${mode}」，工具会拒绝它。`,
    '',
    '只有 create / append / frontmatter 三种；没有覆盖正文的模式。',
  ].join('\n')
}

/** The JSON Schema of a write's answer. */
const WRITE_VALUE = {
  type: 'object',
  required: ['ok', 'mode', 'vault', 'page', 'file', 'summary'],
  properties: {
    ok: { type: 'boolean' },
    mode: { type: 'string' },
    vault: { type: 'string' },
    page: { type: 'string' },
    file: { type: 'string' },
    summary: { type: 'string' },
    sideEffects: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * Register the knowledge base write tool and its gate.
 * @param ctx - host context carrying the tool registry.
 * @param wiki - the read service, used for the pre-write duplicate check.
 * @param store - where the vault list lives.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonWikiWriteTools(
  ctx: Context,
  wiki: YonWikiService,
  store: WikiStore,
): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'wiki_write',
    description: 'Write into the operator\'s Yon knowledge base. Three modes, and NO way to replace a '
      + 'page\'s existing text — a new page nobody reads can be deleted, but a page that overwrote a '
      + 'verified one has destroyed work that was checked against a running system.\n'
      + 'Use it AFTER wiki_lookup came back empty (create) or found a page (append), and after the '
      + 'facts were confirmed — against the database with datasource_query, or against decompiled '
      + 'source.\n'
      + '- create: a new entity page. Needs page, uri, name, platformVersion. Refused when a page for '
      + 'the same URI and platform version already exists; a DIFFERENT platform version is allowed, '
      + 'since the vault treats version differences as facts rather than conflicts.\n'
      + '- append: add one section to an existing page. Needs page, section, content. Refused when a '
      + 'heading of that name is already there.\n'
      + '- frontmatter: correct verification state. Needs page and fields; only last_verified, status '
      + 'and project may be changed.\n'
      + 'sourceType is required and states where the knowledge came from. inference — your own '
      + 'deduction — may only be written as status: unverified, never as verified. The write stops for '
      + 'the operator\'s approval, showing exactly what would be added.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'sourceType'],
      properties: {
        mode: { type: 'string', enum: ['create', 'append', 'frontmatter'] },
        sourceType: {
          type: 'string',
          enum: [...SOURCE_TYPES],
          description: 'Where the knowledge came from: source_code (decompiled), doc, practice (checked against a system), api_response, or inference (your deduction).',
        },
        vault: { type: 'string', description: 'Vault id; the first registered one when omitted.' },
        page: { type: 'string', description: 'create: the new page name. append/frontmatter: the existing page to change.' },
        uri: { type: 'string', description: 'create: the entity URI, e.g. voucher.order.Order.' },
        name: { type: 'string', description: 'create: the Chinese display name.' },
        platformVersion: { type: 'string', description: 'create: the platform this knowledge applies to, e.g. "BIP V5" or "NCC 2111".' },
        project: { type: 'string', description: 'create: the project it was verified on, if any.' },
        status: { type: 'string', enum: [...STATUSES], description: 'create: defaults to unverified.' },
        section: { type: 'string', description: 'append: the heading text of the section to add, without the ## markers.' },
        content: { type: 'string', description: 'create: the page body, without frontmatter or the title line (both are generated). append: the section body.' },
        fields: {
          type: 'object',
          description: 'frontmatter: the fields to correct.',
          additionalProperties: true,
        },
      },
    },
    outputSchema: WRITE_VALUE,
    async execute(args) {
      const mode = asString(args.mode, 'mode')
      const sourceType = asString(args.sourceType, 'sourceType')
      if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
        throw new WikiWriteError('invalid-input', `sourceType 只能是 ${SOURCE_TYPES.join(' / ')}`)
      }
      const vault = await pickVault(store, asOptional(args.vault))
      const status = asOptional(args.status) ?? 'unverified'
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new WikiWriteError('invalid-input', `status 只能是 ${STATUSES.join(' / ')}`)
      }
      // Check ④: an inference may never claim to be verified. The vault holds 5419
      // verified pages; one that is verified without evidence makes the other 5418
      // less useful.
      if (sourceType === 'inference' && status === 'verified') {
        throw new WikiWriteError(
          'invalid-input',
          'sourceType 是 inference（模型推断）时，status 只能是 unverified。'
            + '要让一条知识成为 verified，必须有外部依据 —— 用 datasource_query 实测，或读反编译源码。',
        )
      }

      const sideEffects: string[] = []

      if (mode === 'create') {
        const page = asString(args.page, 'page')
        const uri = asString(args.uri, 'uri')
        const name = asString(args.name, 'name')
        const platformVersion = asString(args.platformVersion, 'platformVersion')
        const content = asString(args.content, 'content')
        if (/^---/.test(content.trim()) || /^#\s/m.test(content)) {
          throw new WikiWriteError(
            'invalid-input',
            'content 里不要写 frontmatter 或一级标题 —— 这两部分由工具生成，'
              + '标题行的格式是索引提取 URI 的依据，写错就等于写了一页永远查不到的页面。',
          )
        }

        // Check ① + ②: duplicates, with platform version deciding conflict from
        // fact.
        const same = await pagesWithUri(wiki, vault, uri)
        const sameVersion = same.filter(entry => entry.version === platformVersion)
        if (sameVersion.length > 0) {
          const lines = sameVersion.map(entry =>
            `  ${entry.page}  版本 ${entry.version ?? '未标注'}  ${entry.status ?? '状态未标注'}  章节 ${entry.headings.length} 个`)
          throw new WikiWriteError(
            'conflict',
            `同 URI、同版本（${platformVersion}）的页面已经存在：\n${lines.join('\n')}\n\n`
              + '不要用 create 覆盖它。改用 append 往它里面补章节（例如新增「查询示例」或「实测结果」）。'
              + '若这确实是另一平台版本的知识，请把 platformVersion 写成那个版本。',
          )
        }
        if (same.length > 0) {
          sideEffects.push(`同 URI 已有其它版本页面：${same.map(entry => `${entry.page}(${entry.version ?? '未标注'})`).join('、')}`)
        }

        const dir = entityDirOf(vault.path)
        if (dir === undefined) throw new WikiWriteError('failed', `知识库目录结构无法识别：${vault.path}`)
        const target = path.join(dir, `${page}.md`)
        const existing = await readFile(target, 'utf8').catch(() => undefined)
        if (existing !== undefined) {
          throw new WikiWriteError('conflict', `文件已存在：${page}.md。改用 append。`)
        }

        const text = composePage(
          {
            name,
            uri,
            sourceType,
            status,
            platformVersion,
            ...(asOptional(args.project) === undefined ? {} : { project: asOptional(args.project) as string }),
          },
          content,
        )
        // Check ③: the page must be findable. Re-parse what was just composed and
        // refuse rather than write something the index cannot read.
        const verify = parsePage(text)
        if (!/^#\s+.+\(.+\)\s*$/m.test(verify.body)) {
          throw new WikiWriteError('failed', '生成的标题行不合规，已放弃写入（这本该不会发生）。')
        }
        await writeAtomic(target, text)
        await wiki.invalidate(vault.id)
        const touched = await recordWrite(vault, page, `新建 [[${page}]]（${sourceType}，${platformVersion}）`)
        sideEffects.push(...touched)

        return {
          ok: true,
          mode,
          vault: vault.id,
          page,
          file: path.relative(vault.path, target).split(path.sep).join('/'),
          summary: `新建页面 ${page}（${platformVersion}，${status}，来源 ${sourceType}）`,
          sideEffects: sideEffects as unknown as readonly string[],
        }
      }

      if (mode === 'append') {
        const page = asString(args.page, 'page')
        const section = asString(args.section, 'section')
        const content = asString(args.content, 'content')

        const file = await wikiPageFile(vault, page)
        const target = path.join(vault.path, file)
        const before = await readFile(target, 'utf8').catch(() => undefined)
        if (before === undefined) {
          throw new WikiWriteError('not-found', `页面「${page}」不存在。要新建请用 mode: create。`)
        }

        const parsed = parsePage(before)
        // Check ⑤: an append that lands on an existing heading is an overwrite in
        // disguise — the reader would see two sections with the same name.
        if (parsed.headings.some(heading => heading.trim() === section.trim())) {
          throw new WikiWriteError(
            'conflict',
            `「${page}」里已经有「${section}」这一节了。现有章节：\n`
              + parsed.headings.map(heading => `  ${heading}`).join('\n')
              + '\n\n换一个章节名（例如「实测结果（2026-09）」），或改用 frontmatter 模式只更正验证状态。',
          )
        }

        const eol = before.includes('\r\n') ? '\r\n' : '\n'
        const addition = [`## ${section}`, '', content.trim(), ''].join(eol)
        const after = `${before.replace(/\s*$/, '')}${eol}${eol}${addition}`
        await writeAtomic(target, after)
        await wiki.invalidate(vault.id)
        const touched = await recordWrite(vault, page, `追加 [[${page}]] §${section}（${sourceType}）`)
        sideEffects.push(...touched)

        return {
          ok: true,
          mode,
          vault: vault.id,
          page,
          file,
          summary: `往「${page}」追加章节「${section}」（原 ${before.length} → ${after.length} 字节，原内容未改动）`,
          sideEffects: sideEffects as unknown as readonly string[],
        }
      }

      if (mode === 'frontmatter') {
        const page = asString(args.page, 'page')
        const raw = args.fields
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new WikiWriteError('invalid-input', 'frontmatter 模式需要一个 fields 对象')
        }
        const fields = raw as Record<string, unknown>
        const keys = Object.keys(fields)
        if (keys.length === 0) {
          throw new WikiWriteError('invalid-input', 'fields 不能是空的')
        }
        const forbidden = keys.filter(key => !(PATCHABLE as readonly string[]).includes(key))
        if (forbidden.length > 0) {
          throw new WikiWriteError(
            'invalid-input',
            `只能改 ${PATCHABLE.join(' / ')}；收到 ${forbidden.join(', ')}。`
              + '其它字段（尤其是 platform_version）不能这样改 —— 版本是页面归属的一部分，'
              + '改它等于把一页知识悄悄挪到另一个平台上。',
          )
        }
        const nextStatus = asOptional(fields.status)
        if (nextStatus !== undefined && !(STATUSES as readonly string[]).includes(nextStatus)) {
          throw new WikiWriteError('invalid-input', `status 只能是 ${STATUSES.join(' / ')}`)
        }

        const file = await wikiPageFile(vault, page)
        const target = path.join(vault.path, file)
        const before = await readFile(target, 'utf8').catch(() => undefined)
        if (before === undefined) {
          throw new WikiWriteError('not-found', `页面「${page}」不存在。`)
        }
        const parsed = parsePage(before)
        if (nextStatus === 'verified' && sourceType === 'inference') {
          throw new WikiWriteError('invalid-input', 'inference 来源的内容不能标成 verified。')
        }
        const updated: Record<string, string> = { ...parsed.frontmatter }
        const changes: string[] = []
        for (const key of keys) {
          const value = asOptional(fields[key])
          if (value === undefined) continue
          const before_ = updated[key] ?? '（无）'
          if (before_ === value) continue
          updated[key] = value
          changes.push(`${key}: ${before_} → ${value}`)
        }
        if (changes.length === 0) {
          return {
            ok: true,
            mode,
            vault: vault.id,
            page,
            file,
            summary: `「${page}」的字段已经是目标值，未改动。`,
            sideEffects: [] as unknown as readonly string[],
          }
        }
        await writeAtomic(target, recomposePage(updated, parsed.body))
        await wiki.invalidate(vault.id)
        const touched = await recordWrite(vault, page, `更正 [[${page}]] frontmatter（${changes.join('；')}）`)
        sideEffects.push(...touched)

        return {
          ok: true,
          mode,
          vault: vault.id,
          page,
          file,
          summary: `更正「${page}」：${changes.join('；')}`,
          sideEffects: sideEffects as unknown as readonly string[],
        }
      }

      throw new WikiWriteError('invalid-input', `不认识的 mode「${mode}」；只有 create / append / frontmatter。`)
    },
    render(value) {
      const result = value as WikiWriteResult
      return [
        `✅ ${result.summary}`,
        `   vault ${result.vault}   ${result.file}`,
        ...(result.sideEffects.length === 0 ? [] : ['', '同时更新：', ...result.sideEffects.map(line => `   ${line}`)]),
        '',
        '索引缓存已失效，下次 wiki_lookup 会重建并包含这次写入。',
      ].join('\n')
    },
    presentCall(args) {
      const mode = String(args.mode ?? '')
      const target = mode === 'create' ? String(args.page ?? '') : String(args.page ?? '')
      return {
        card: 'generic',
        title: `写入知识库（${mode}）：${target}`,
        kind: 'other',
        rawInput: args.page,
      }
    },
  })))

  // The gate. Unlike the read tools, every mode stops here: a write into a knowledge
  // base is a deliberate act, and the approval shows what would be added rather than
  // asking whether files may be written.
  disposers.push(ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'wiki_write') return next()
    const disposition = dispositionOf(true, permissionsOf(exec.agent?.session))
    if (disposition === 'run') return next()
    const args = (exec.arguments ?? {}) as Record<string, unknown>
    if (disposition === 'refuse') {
      return {
        kind: 'deny' as const,
        reason: '当前会话是「仅可查看」权限，不能写入知识库。'
          + '要写入请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
      }
    }
    return { kind: 'ask' as const, reason: await describeWrite(args, store) }
  }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
