/**
 * 知识库索引读什么，以及它坦白自己没读什么。
 *
 * 索引版本 3 起读三类页面：实体页（`wiki/entities`）、主题页（`wiki/topics`）
 * 与来源页（`wiki/sources`）。所以「已扫描 0 个实体页」不再等于空库，
 * `unindexedDirsOf` 也不再列那两个目录——它只回答「还有哪些目录没读」。
 *
 * 本文件守三件事：三类页面都进索引（含 frontmatter、摘要、章节标题这些检索
 * 要用的字段）、真正没读的目录仍被点名、`wiki_lookup` / `wiki_read` 都能到主题页。
 *
 * 每个知识库都建在临时目录里：`ensureWikiIndex` 会把派生索引写进 vault 内部
 * （`wiki/.yon-index.json`），指向真实知识库就等于用测试去改使用者的仓库。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildWikiIndex, unindexedDirsOf, type WikiVault } from '../src/host/wiki-index.ts'
import { createWikiStore } from '../src/host/wiki-store.ts'
import { createYonWikiService, type YonWikiService } from '../src/host/wiki-service.ts'
import { createWikiUsageLog } from '../src/host/wiki-usage.ts'
import { registerYonWikiTools } from '../src/host/wiki-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A scratch directory to build vaults in. */
async function scratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  temporary.push(dir)
  return dir
}

/** Write `count` markdown pages directly inside a directory. */
async function pages(dir: string, count: number): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (let i = 0; i < count; i += 1) await writeFile(join(dir, `p${i}.md`), `# p${i}\n`, 'utf8')
}

/** One page with a frontmatter block, under `dir`. */
async function writePage(dir: string, name: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${name}.md`), content, 'utf8')
}

/** A digested topic page, of the shape `wiki_page_write` produces. */
const TOPIC_PAGE = [
  '---',
  'tags: [NCC, 2312, 财务会计]',
  'platform_version: "NCC 2312"',
  'status: unverified',
  'updated: 2026-10-21',
  'sources: [raw/articles/x.md]',
  '---',
  '',
  '# 总账（NCC 2312）',
  '',
  '> 总账是财务会计的核心。',
  '',
  '## 概述',
  '',
  '正文。',
  '',
  '## 主要功能',
  '',
  '正文。',
  '',
].join('\n')

/** An entity page, enough for a lookup to find and rank it. */
const ENTITY_PAGE = '# 客户 (`bd.customer.Customer`)\n\n## 字段 (1)\n\n'
  + '| # | name | displayName | columnName |\n|---|---|---|---|\n| 1 | code | 编码 | code |\n'

/**
 * An absolute path as the module spells it.
 *
 * Forward slashes on every platform, matching `WikiVaultView.path`, so the path
 * the model is handed reads the same whichever machine built it.
 */
const abs = (...parts: string[]): string => join(...parts).replaceAll('\\', '/')

/** A service over the given registrations, with its store and log inside `root`. */
async function serviceOver(root: string, vaults: readonly WikiVault[]): Promise<YonWikiService> {
  const store = createWikiStore(join(root, 'wiki_config.json'))
  // A list rather than no file: an absent document seeds itself from the guessed
  // vaults, and those are real paths on the machine running these tests.
  await store.write(vaults)
  return createYonWikiService(store, createWikiUsageLog(join(root, 'usage.jsonl')))
}

describe('the index holds all three kinds', () => {
  it('indexes topic and source pages with the facts a search needs', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 1)
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）', TOPIC_PAGE)
    await writePage(join(vault, 'wiki', 'sources'), '[NCC 2312] 财务会计产品说明',
      '# [NCC 2312] 财务会计产品说明\n\n> 166 页产品说明的索引。\n')

    const index = await buildWikiIndex(vault)
    expect(index.version).toBe(3)
    expect(index.prose).toHaveLength(2)

    const topic = index.prose.find(page => page.kind === 'topic')
    expect(topic?.page).toBe('总账（NCC 2312）')
    expect(topic?.file).toBe('wiki/topics/总账（NCC 2312）.md')
    expect(topic?.name).toBe('总账（NCC 2312）')
    // The lead quote is the summary, not the body: a list needs one line, and the
    // body is 30–60 KB that the index deliberately does not keep.
    expect(topic?.summary).toBe('总账是财务会计的核心。')
    expect(topic?.tags).toEqual(['NCC', '2312', '财务会计'])
    expect(topic?.version).toBe('NCC 2312')
    expect(topic?.status).toBe('unverified')
    expect(topic?.updated).toBe('2026-10-21')
    expect(topic?.sources).toEqual(['raw/articles/x.md'])
    expect(topic?.headings).toEqual(['概述', '主要功能'])

    const source = index.prose.find(page => page.kind === 'source')
    expect(source?.page).toBe('[NCC 2312] 财务会计产品说明')
    expect(source?.summary).toBe('166 页产品说明的索引。')
  })

  it('leaves directories it does not read out of the index', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 1)
    await pages(join(vault, 'wiki', 'notes'), 3)

    const index = await buildWikiIndex(vault)
    expect(index.prose).toEqual([])
    // And the directory stays visible as unread, rather than vanishing.
    expect((await unindexedDirsOf({ id: 'ncc', label: 'NCC', path: vault })).map(entry => entry.dir))
      .toEqual(['wiki/notes'])
  })
})

describe('unindexedDirsOf', () => {
  it('does not report the topic and source directories as unindexed', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 2)
    await pages(join(vault, 'wiki', 'topics'), 13)
    await pages(join(vault, 'wiki', 'sources'), 120)
    await pages(join(vault, 'wiki', 'notes'), 4)

    // Topics and sources are read by the index since version 3, so calling them
    // "outside the index" would be a contradiction. Notes are not, and are named.
    expect(await unindexedDirsOf({ id: 'ncc', label: 'NCC', path: vault }))
      .toEqual([{ vault: 'ncc', dir: 'wiki/notes', path: abs(vault, 'wiki', 'notes'), pages: 4 }])
  })

  it('leaves out the entity directory itself, page-less directories and dot directories', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 2)
    await pages(join(vault, 'wiki', 'topics'), 1)
    // The editor's own state, and a directory holding something that is not a page.
    await pages(join(vault, 'wiki', '.trash'), 40)
    await mkdir(join(vault, 'wiki', 'attachments'), { recursive: true })
    await writeFile(join(vault, 'wiki', 'attachments', 'a.png'), 'x', 'utf8')

    expect(await unindexedDirsOf({ id: 'ncc', label: 'NCC', path: vault })).toEqual([])
  })

  it('does not adopt a nested vault as this vault unindexed pages', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'outer')
    // Root layout: the entity directory is `outer/entities` (nothing named
    // `wiki/entities` exists, and that name is tried first).
    await pages(join(vault, 'entities'), 1)
    // A second knowledge base that happens to sit inside this one's tree.
    await pages(join(vault, 'nested'), 1)
    await pages(join(vault, 'nested', 'entities'), 1)

    // `nested/` holds a loose page, so without the guard it would be reported here
    // as one of *this* vault's skipped pages.
    expect(await unindexedDirsOf({ id: 'outer', label: 'OUTER', path: vault })).toEqual([])
  })

  it('answers nothing for a directory that is not a vault', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const notAVault = join(root, 'notes')
    await pages(notAVault, 3)

    expect(await unindexedDirsOf({ id: 'notes', label: 'NOTES', path: notAVault })).toEqual([])
  })
})

describe('the service reads the prose pages', () => {
  it('finds a term that appears only in a topic page body', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）',
      '# 总账（NCC 2312）\n\n> 核心核算。\n\n## 概述\n\n支持多主币核算。\n')
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    // The term is in the body only — not the name, tags, headings or lead.
    const answer = await service.lookup('多主币')
    expect(answer.hits.map(hit => hit.page)).toEqual(['总账（NCC 2312）'])
    expect(answer.hits[0]?.matchedBy).toBe('body')

    // A source page does not get a body: those are indexes of documents, and the
    // BIP vault holds 7636 of them.
    const sources = await service.lookup('多主币', undefined, 'source')
    expect(sources.hits).toEqual([])
  })

  it('keeps at most three lead/body hits in the mixed mode', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    for (let i = 0; i < 5; i += 1) {
      await writePage(join(vault, 'wiki', 'topics'), `资金计划${i}`,
        `# 资金计划${i}\n\n> 现金流用于第${i}号计划。\n`)
    }
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    // Five pages mention the term in their lead and none is about it. The mixed
    // mode returns a sample; an explicit topic search still returns all five.
    expect((await service.lookup('现金流')).hits.length).toBe(3)
    expect((await service.lookup('现金流', undefined, 'topic')).hits.length).toBe(5)
  })

  it('answers a card for a topic page instead of a not-found', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）',
      '# 总账（NCC 2312）\n\n> 核心核算。\n\n## 概述\n\n正文。\n')
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    // The panel search returns topic pages now; clicking one used to hit a card
    // endpoint that only knew entity pages.
    const card = await service.card('总账（NCC 2312）')
    expect(card.kind).toBe('topic')
    expect(card.path).toBe('wiki/topics/总账（NCC 2312）.md')
    expect(card.uri).toBeNull()
    expect(card.name).toBe('总账（NCC 2312）')
    expect(card.summary).toBe('核心核算。')
    expect(card.lacks[0]).toContain('主题页')
  })

  it('counts topic and source pages on the vault view', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 3)
    await pages(join(vault, 'wiki', 'sources'), 2)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const [view] = await service.list()
    // The three numbers the card shows. Entity pages stay 0 here — that is the
    // situation the old card read as an empty knowledge base.
    expect(view?.pages).toBe(0)
    expect(view?.topicPages).toBe(3)
    expect(view?.sourcePages).toBe(2)
  })

  it('reports the same three counts on the health report', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 3)
    await pages(join(vault, 'wiki', 'sources'), 2)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const [report] = await service.health()
    expect(report?.pages).toBe(0)
    expect(report?.topicPages).toBe(3)
    expect(report?.sourcePages).toBe(2)
  })

  it('searches topics beside entities, with entity pages first', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await writePage(join(vault, 'wiki', 'entities'), '客户', ENTITY_PAGE)
    await writePage(join(vault, 'wiki', 'topics'), '客户画像分析（NCC 2312）',
      '# 客户画像分析（NCC 2312）\n\n> 客户主数据与画像。\n')

    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])
    const answer = await service.lookup('客户')
    expect(answer.hits.map(hit => hit.kind)).toEqual(['entity', 'topic'])
    // A hit on a prose page says which kind it is and how to read it.
    expect(answer.hits[1]?.path).toBe('wiki/topics/客户画像分析（NCC 2312）.md')
    expect(answer.scannedProse).toBe(1)

    const topics = await service.lookup('客户', undefined, 'topic')
    expect(topics.hits.map(hit => hit.kind)).toEqual(['topic'])

    const entities = await service.lookup('客户', undefined, 'entity')
    expect(entities.hits.map(hit => hit.kind)).toEqual(['entity'])
  })

  it('reads a topic page by its bare name', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）', TOPIC_PAGE)

    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])
    const page = await service.read('总账（NCC 2312）')
    expect(page.kind).toBe('topic')
    expect(page.path).toBe('wiki/topics/总账（NCC 2312）.md')
    expect(page.uri).toBeNull()
    expect(page.text).toContain('总账是财务会计的核心')
    // No entity facts to give: a topic page has no table and no edges, and an
    // assessment invented for one would read as "this page can answer SQL".
    expect(page.assessment).toBeUndefined()
    expect(page.relations).toBeUndefined()
  })

  it('reads a topic page by its vault-relative path', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）', TOPIC_PAGE)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const page = await service.read('wiki/topics/总账（NCC 2312）.md')
    expect(page.kind).toBe('topic')
    expect(page.path).toBe('wiki/topics/总账（NCC 2312）.md')
    expect(page.version).toBe('NCC 2312')
    expect(page.status).toBe('unverified')
  })

  it('refuses a path that leaves the vault', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const failure = await service.read('../../outside.md')
      .then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).toContain('没有这个文件')
  })

  it('lists topics before sources, then newest first, and filters by a term', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writePage(join(vault, 'wiki', 'topics'), '总账（NCC 2312）', TOPIC_PAGE)
    await writePage(join(vault, 'wiki', 'topics'), '固定资产（NCC 2312）',
      '# 固定资产（NCC 2312）\n\n> 卡片与折旧。\n')
    // A source page that is strictly newer: without the kind rule it would sort
    // first, and the index page of a document would lead a list of subjects.
    await writePage(join(vault, 'wiki', 'sources'), '[NCC 2312] 财务会计产品说明',
      '---\nupdated: 2026-10-22\n---\n\n# [NCC 2312] 财务会计产品说明\n\n> 166 页产品说明的索引。\n')
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const all = await service.proseList('', undefined, undefined, 10)
    expect(all.count).toBe(3)
    expect(all.hits.map(page => page.kind)).toEqual(['topic', 'topic', 'source'])

    const filtered = await service.proseList('总账', undefined, undefined, 10)
    expect(filtered.hits.map(page => page.page)).toEqual(['总账（NCC 2312）'])
    expect(filtered.hits[0]?.vault).toBe('ncc')

    const sourcesOnly = await service.proseList('', undefined, 'source', 10)
    expect(sourcesOnly.count).toBe(1)
  })

  it('names the unread directories on a read that missed', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'notes'), 4)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const failure = await service.read('客户画像').then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).toContain('没有名为「客户画像」的实体页或主题页')
    expect(failure?.message).toContain('wiki/topics/客户画像.md')
    expect(failure?.message).toContain('wiki/notes —— 4 页')
  })

  it('leaves the read miss alone when nothing sits outside the index', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'bip')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const service = await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }])

    const failure = await service.read('客户画像').then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).not.toContain('索引之外')
  })
})

describe('wiki_lookup says it out loud', () => {
  /** Mount the wiki tools over a service, as the host does. */
  async function bench(service: YonWikiService) {
    const ctx = new Context()
    const registered: YonToolDefinition[] = []
    ctx.provide('tools', {
      register(definition: YonToolDefinition): () => void {
        registered.push(definition)
        return () => { registered.splice(registered.indexOf(definition), 1) }
      },
    } as never)
    registerYonWikiTools(ctx, service)

    const tool = (name: string): YonToolDefinition => {
      const found = registered.find(candidate => candidate.name === name)
      if (found === undefined) throw new Error(`no tool ${name}`)
      return found
    }
    const render = async (name: string, args: unknown): Promise<string> => {
      const execution: YonToolExecution = {
        name,
        arguments: args,
        callId: 'call-1',
        signal: new AbortController().signal,
        agent: {},
      }
      const value = await tool(name).execute(args, execution)
      return tool(name).output.render(args, value).map(block => block.text).join('\n')
    }
    /** The text the model reads when deciding whether to call the tool at all. */
    const description = (name: string): string => tool(name).description
    return { render, description }
  }

  it('lists entity hits and prose hits in separate sections', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await writePage(join(vault, 'wiki', 'entities'), '客户', ENTITY_PAGE)
    await writePage(join(vault, 'wiki', 'topics'), '客户画像分析（NCC 2312）',
      '# 客户画像分析（NCC 2312）\n\n> 客户主数据与画像。\n')
    const { render } = await bench(await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }]))

    const text = await render('wiki_lookup', { term: '客户' })
    expect(text).toContain('实体页（可据此写 SQL）')
    expect(text).toContain('主题页 / 来源页（功能与流程参考，无表名，按路径读）')
    expect(text).toContain('页面：客户画像分析（NCC 2312）')
    expect(text).toContain('主题页（无表名与字段，按路径读）：wiki/topics/客户画像分析（NCC 2312）.md')
  })

  it('teaches the path when nothing matched and a directory is unread', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'notes'), 13)
    const { render } = await bench(await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }]))

    const text = await render('wiki_lookup', { term: '客户' })
    expect(text).toContain('已扫描 0 个实体页 + 0 个主题/来源页')
    // The whole point: 0 must not be readable as 「这个知识库是空的」.
    expect(text).toContain('另有 13 个页面')
    expect(text).toContain(`wiki/notes —— 13 页，${abs(vault, 'wiki', 'notes')}`)
    // And the way in: a path the reader can open, not just a confession of scope.
    expect(text).toContain('wiki/topics/客户.md')
  })

  it('says nothing about scope when there is nothing outside the index', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'bip')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const { render } = await bench(await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }]))

    expect(await render('wiki_lookup', { term: '客户' })).not.toContain('不在索引范围内')
  })

  it('hands the model to the reference library when the question was never an entity', async () => {
    const root = await scratch('yon-wiki-prose-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const { render, description } = await bench(await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }]))

    // 两本库各管一半：实体页与主题页答「哪张表 / 这份文档写了什么」，参考库答
    // 「平台怎么运作、报错什么意思」。查错库不是查不到，而是没人告诉它还有另一本。
    const text = await render('wiki_lookup', { term: '库存组织必填怎么绕' })
    expect(text).toContain('没有找到与「库存组织必填怎么绕」匹配的页面')
    expect(text).toContain('去 knowledge_search 查随包参考库')
    expect(text).toContain('也不是某份文档写了什么')

    // 描述里也要有这半句：模型是在**决定要不要调用**的那一刻读描述的。
    expect(description('wiki_lookup')).toContain('use knowledge_search')
  })
})
