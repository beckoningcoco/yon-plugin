/**
 * Writing the pages that are not entities: `wiki/topics/` and `wiki/sources/`.
 *
 * These are the pages a digestion produces — one chapter or subject per topic page, one
 * piece of source material per source page — and until now nothing could write them.
 * `wiki_write` writes entity pages and requires a URI, which a topic page does not have;
 * so a real vault's 7746 digested pages were all written by hand, outside every check and
 * outside `log.md`.
 *
 * What is asserted here is the handful of properties that make the tool worth having
 * rather than a `write` to a path:
 *
 * - the destination is derived, not given — a caller picks `topics` or `sources`, never a
 *   path, and cannot name a page that escapes the directory;
 * - a name already taken is refused, so there is still no way to lose a page's text;
 * - **every entry in `sources` must exist in the vault**, which is the one refusal that
 *   earns its keep: `digest_audit` pairs a page back to its source through that field, and
 *   one measured vault holds 21 pages whose source was a PDF path that was never copied
 *   in, and which are now permanently unverifiable;
 * - the write reaches `log.md`, which is what `wiki_recent` reads.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createWikiStore } from '../src/host/wiki-store.ts'
import { createYonWikiService, type YonWikiService } from '../src/host/wiki-service.ts'
import { createWikiUsageLog } from '../src/host/wiki-usage.ts'
import { registerYonWikiWriteTools, WIKI_WRITE_TOOL_NAMES } from '../src/host/wiki-write.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** A scratch vault, the registered store over it, and the tools that write into it. */
interface Bench {
  readonly registered: YonToolDefinition[]
  readonly vault: string
  readonly call: (name: string, args: unknown) => Promise<Record<string, unknown>>
  readonly gate: (name: string, args: unknown) => Promise<{ kind: string; reason?: string }>
}

/**
 * Build the bench over a vault that is real enough to be recognised: `wiki/entities`
 * exists, which is what `entityDirOf` looks for.
 * @returns the registry, the vault and the two callers.
 */
async function bench(): Promise<Bench> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-page-'))
  temporary.push(dir)
  const store = createWikiStore(join(dir, 'wiki_config.json'))
  await store.write([])
  const vault = join(dir, 'obsidian', 'yon-bip-obsidian')
  await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
  // A source file the vault actually holds, so `sources` has something true to point at.
  await mkdir(join(vault, 'raw', 'articles'), { recursive: true })
  await writeFile(join(vault, 'raw', 'articles', '2026-05-20-线程池实践.md'), '# 抽取文本\n', 'utf8')

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  ctx.provide('tools', {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  } as never)

  const wiki: YonWikiService = createYonWikiService(store, createWikiUsageLog(join(dir, 'usage.jsonl')))
  await wiki.saveVault({ label: 'BIP 知识库', path: vault })
  registerYonWikiWriteTools(ctx, wiki, store)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }
  const execution = (name: string, args: unknown): YonToolExecution => ({
    name,
    arguments: args,
    callId: 'call-1',
    signal: liveSignal,
    agent: { session: { seq: 0, eventAt: () => undefined } },
  })

  return {
    registered,
    vault,
    call: async (name, args) => await tool(name).execute(args, execution(name, args)) as Record<string, unknown>,
    gate: async (name, args) => await ctx.waterfall(
      'tools/pre-execute',
      execution(name, args),
      () => Promise.resolve({ kind: 'allow' as const }),
    ) as { kind: string; reason?: string },
  }
}

/** One well-formed call to the new tool, for the cases that vary a single field. */
const GOOD = {
  dir: 'topics',
  page: '线程池实践',
  content: '## 获取线程池\n\n`YmsExecutors.get()`。（p3）\n',
  sourceType: 'doc',
  sources: ['raw/articles/2026-05-20-线程池实践.md'],
  tags: ['YMS', '线程池'],
  platformVersion: 'BIP V5',
} as const

describe('wiki_page_write', () => {
  it('is registered beside wiki_write, in the order the names declare', async () => {
    const { registered } = await bench()
    // The same coupling `requirement-tools.spec.ts` holds: the array is the expectation
    // for what is registered, so a tool added in a nicer-looking place turns this red.
    expect(registered.map(definition => definition.name)).toEqual([...WIKI_WRITE_TOOL_NAMES])
  })

  it('writes a topic page where the vault keeps them, with the frontmatter digest_audit reads', async () => {
    const { vault, call } = await bench()
    const answer = await call('wiki_page_write', GOOD)

    expect(answer.file).toBe('wiki/topics/线程池实践.md')
    const text = await readFile(join(vault, 'wiki', 'topics', '线程池实践.md'), 'utf8')
    // The eight fields the digest skill requires; `sources` is the one that carries the
    // page's evidence, and `status` is unverified because a document is not a check.
    expect(text).toContain('tags: [YMS, 线程池]')
    expect(text).toContain('sources: [raw/articles/2026-05-20-线程池实践.md]')
    expect(text).toContain('platform_version: "BIP V5"')
    expect(text).toContain('status: unverified')
    expect(text).toContain('source_type: doc')
    expect(text).toMatch(/last_verified: \d{4}-\d{2}-\d{2}/)
    // The title is generated from the page name, so the page reads as its own name.
    expect(text).toContain('# 线程池实践')
    expect(text).toContain('## 获取线程池')
  })

  it('keeps a source page beside the topic pages, not in with the entities', async () => {
    const { vault, call } = await bench()
    const answer = await call('wiki_page_write', { ...GOOD, dir: 'sources', page: '线程池-索引' })
    expect(answer.file).toBe('wiki/sources/线程池-索引.md')
    expect(await readFile(join(vault, 'wiki', 'sources', '线程池-索引.md'), 'utf8')).toContain('# 线程池-索引')
  })

  it('enters log.md, which is what wiki_recent reads', async () => {
    const { vault, call } = await bench()
    await call('wiki_page_write', GOOD)
    // Without this the new tool would write pages that no history mentions — the same
    // blind spot that left every hand-written page out of this vault's log.
    expect(await readFile(join(vault, 'log.md'), 'utf8'))
      .toMatch(/## \d{4}-\d{2}-\d{2} 新建 topics 页 \[\[线程池实践\]\]（doc）/)
  })

  it('refuses a name already taken, rather than replacing the page', async () => {
    const { call } = await bench()
    await call('wiki_page_write', GOOD)
    // There is still no way to lose a page's text. The refusal has to name the page, or
    // the caller learns nothing about which name collided.
    await expect(call('wiki_page_write', { ...GOOD, content: '重写一遍' }))
      .rejects.toThrow(/wiki\/topics\/线程池实践\.md 已经存在/)
  })

  it('refuses a source the vault does not hold, and names it', async () => {
    const { vault, call } = await bench()
    await expect(call('wiki_page_write', { ...GOOD, sources: ['raw/articles/不存在.md'] }))
      .rejects.toThrow(/raw\/articles\/不存在\.md/)
    // Refused before anything was written: a page whose evidence is missing is one that
    // can never be checked again, and nothing about it would say so afterwards.
    await expect(readFile(join(vault, 'wiki', 'topics', '线程池实践.md'), 'utf8')).rejects.toThrow()
  })

  it('accepts a page with no sources, which is how a page with no evidence reads', async () => {
    const { call } = await bench()
    // Not refused: plenty of pages are written from a conversation rather than a file.
    // The approval prompt is where the gap is said out loud, not the tool.
    const answer = await call('wiki_page_write', { ...GOOD, sources: [] })
    expect(answer.ok).toBe(true)
  })

  it('cannot be steered out of its directory by the page name', async () => {
    const { call } = await bench()
    // The directory is an enum and the name is checked, so neither half of the path is
    // the caller's to choose.
    await expect(call('wiki_page_write', { ...GOOD, page: '../../entities/销售订单' }))
      .rejects.toThrow(/不带目录也不带 \.md/)
    await expect(call('wiki_page_write', { ...GOOD, page: '线程池实践.md' }))
      .rejects.toThrow(/不带目录也不带 \.md/)
    await expect(call('wiki_page_write', { ...GOOD, dir: 'entities' }))
      .rejects.toThrow(/dir 只能是 topics \/ sources/)
  })

  it('will not let an inference call itself verified', async () => {
    const { call } = await bench()
    // The same rule wiki_write enforces: a page marked verified on a model's own
    // deduction makes every genuinely verified page beside it worth less.
    await expect(call('wiki_page_write', { ...GOOD, sourceType: 'inference', status: 'verified' }))
      .rejects.toThrow(/只能是 unverified/)
  })

  it('stops for approval, and says when a page will have no evidence behind it', async () => {
    const { gate } = await bench()
    const asked = await gate('wiki_page_write', { ...GOOD, sources: [] })
    expect(asked.kind).toBe('ask')
    expect(asked.reason).toContain('wiki/topics/')
    // The prompt has to say the quiet part: without sources this page cannot be checked
    // against anything later, and the person approving is the one who can still fix that.
    expect(asked.reason).toContain('没给 sources')

    const withEvidence = await gate('wiki_page_write', GOOD)
    expect(withEvidence.reason).toContain('raw/articles/2026-05-20-线程池实践.md')
  })
})
