/**
 * 知识库到底有多少页，以及它自己说漏了哪些。
 *
 * 全文检索只读实体页目录（`buildWikiIndex` 的全部输入就是 `entityDirOf(root)`），
 * 这是个决定，本身没有错；错的是它**不出声**。`yon-ncc-obsidian` 的 `wiki/topics`
 * 下躺着 12 页、`wiki/sources` 下 1 页，`wiki_lookup` 却只答「已扫描 0 个实体页」——
 * 一个只拿到这个数字的读者，得出的结论是「这个知识库是空的」。本文件守的就是这一句：
 * 被跳过的目录要被数出来、带上路、由工具自己说出口。
 *
 * 单元用例钉 `unindexedDirsOf` 的边界（数谁、不数谁、怎么排），服务用例钉它确实挂在
 * `lookup` / `health` 两条出口上，工具用例钉模型真能看到那句话。
 *
 * 每个知识库都建在临时目录里：`ensureWikiIndex` 会把派生索引写进 vault 内部
 * （`wiki/.yon-index.json`），指向真实知识库就等于用测试去改使用者的仓库。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { unindexedDirsOf, type WikiVault } from '../src/host/wiki-index.ts'
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

describe('unindexedDirsOf', () => {
  it('counts the page directories beside the entity directory, biggest first', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 2)
    await pages(join(vault, 'wiki', 'topics'), 13)
    await pages(join(vault, 'wiki', 'sources'), 120)

    expect(await unindexedDirsOf({ id: 'ncc', label: 'NCC', path: vault }))
      .toEqual([
        { vault: 'ncc', dir: 'wiki/sources', path: abs(vault, 'wiki', 'sources'), pages: 120 },
        { vault: 'ncc', dir: 'wiki/topics', path: abs(vault, 'wiki', 'topics'), pages: 13 },
      ])
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

    // `wiki/entities` holds pages and is exactly what the index reads, so it must
    // never come back as pages the index skipped.
    expect((await unindexedDirsOf({ id: 'ncc', label: 'NCC', path: vault })).map(entry => entry.dir))
      .toEqual(['wiki/topics'])
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

describe('the service carries the skipped pages', () => {
  it('names them, with the vault id, when the index could read nothing', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    // The shape the review hit: an entity directory that exists and is empty,
    // pages next to it. `ready` is true, `scanned` is 0, and without the list that
    // is indistinguishable from an empty knowledge base.
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 13)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const result = await service.lookup('客户')
    expect(result.scanned).toBe(0)
    expect(result.hits).toEqual([])
    expect(result.unindexed)
      .toEqual([{ vault: 'ncc', dir: 'wiki/topics', path: abs(vault, 'wiki', 'topics'), pages: 13 }])
  })

  it('carries nothing when every page is an entity page', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'bip')
    await pages(join(vault, 'wiki', 'entities'), 4)
    const service = await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }])

    const result = await service.lookup('客户')
    expect(result.scanned).toBe(4)
    expect(result.unindexed).toEqual([])
  })

  it('tags every entry with the vault it came from', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const ncc = join(root, 'ncc')
    const bip = join(root, 'bip')
    await mkdir(join(ncc, 'wiki', 'entities'), { recursive: true })
    await pages(join(ncc, 'wiki', 'topics'), 1)
    await pages(join(bip, 'wiki', 'entities'), 1)
    await pages(join(bip, 'wiki', 'sources'), 2)
    const service = await serviceOver(root, [
      { id: 'ncc', label: 'NCC', path: ncc },
      { id: 'bip', label: 'BIP', path: bip },
    ])

    const result = await service.lookup('客户')
    // Grouped by vault, in registration order — each entry names its vault, so
    // keeping one vault's pages together reads better than sorting them apart.
    expect(result.unindexed.map(entry => `${entry.vault}:${entry.dir}`))
      .toEqual(['ncc:wiki/topics', 'bip:wiki/sources'])
  })

  it('reports the same list on the health report the panel reads', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 13)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    const [report] = await service.health()
    // The number the panel shows under 实体页数 is this one; the list has to travel
    // with it, or the panel repeats the same 0 with the same silence.
    expect(report?.pages).toBe(0)
    expect(report?.unindexed)
      .toEqual([{ vault: 'ncc', dir: 'wiki/topics', path: abs(vault, 'wiki', 'topics'), pages: 13 }])
  })

  it('names the out-of-index directories on a read that missed', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 13)
    const service = await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }])

    // `wiki_read` is the second place a reader concludes 「没有这个页面」 about a page
    // that exists — one directory over from the one the index opens.
    const failure = await service.read('客户画像').then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).toContain('没有名为「客户画像」的页面')
    expect(failure?.message).toContain(`wiki/topics —— 13 页，${abs(vault, 'wiki', 'topics')}`)
  })

  it('leaves the read miss alone when nothing sits outside the index', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'bip')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const service = await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }])

    const failure = await service.read('客户画像').then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).not.toContain('索引只读实体页目录')
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

  it('tells the model the skipped pages exist, and where they are', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await pages(join(vault, 'wiki', 'topics'), 13)
    const { render } = await bench(await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }]))

    const text = await render('wiki_lookup', { term: '客户' })
    expect(text).toContain('已扫描 0 个实体页')
    // The whole point: 0 must not be readable as 「这个知识库是空的」.
    expect(text).toContain('另有 13 个页面')
    expect(text).toContain('不等于这个库是空的')
    // Batch 2: the index is not going to grow to cover these, so the answer has to
    // be actionable — a path the reader can open, not just a confession of scope.
    expect(text).toContain(`wiki/topics —— 13 页，${abs(vault, 'wiki', 'topics')}`)
    // And what the pages are not good for. This tool exists to stop a table or a
    // column being invented; prose is not a substitute for a field list.
    expect(text).toContain('这几种页面没有字段清单和表名，不能用它们写 SQL')
  })

  it('keeps to one line when the search did find something', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'bip')
    await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
    await writeFile(
      join(vault, 'wiki', 'entities', '客户.md'),
      '# 客户 (`bd.customer.Customer`)\n\n## 字段 (1)\n\n'
        + '| # | name | displayName | columnName |\n|---|---|---|---|\n| 1 | code | 编码 | code |\n',
      'utf8',
    )
    await pages(join(vault, 'wiki', 'sources'), 3)
    const { render } = await bench(await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }]))

    const text = await render('wiki_lookup', { term: '客户' })
    expect(text).toContain('匹配到 1 个页面')
    // The scope still travels with the count — a hit answer must not report a bare
    // 页数 either — but only as a line. The BIP vault carries two of these
    // directories, so the five-line version would repeat paths on every search of
    // the session, and the paths are only actionable on the search that found
    // nothing.
    expect(text).toContain('另有 3 页散在 wiki/sources')
    expect(text).not.toContain('wiki/sources —— 3 页')
  })

  it('says nothing about scope when there is nothing outside the index', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'bip')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const { render } = await bench(await serviceOver(root, [{ id: 'bip', label: 'BIP', path: vault }]))

    expect(await render('wiki_lookup', { term: '客户' })).not.toContain('不在索引范围内')
  })

  it('hands the model to the reference library when the question was never an entity', async () => {
    const root = await scratch('yon-wiki-unindexed-')
    const vault = join(root, 'ncc')
    await pages(join(vault, 'wiki', 'entities'), 2)
    const { render, description } = await bench(await serviceOver(root, [{ id: 'ncc', label: 'NCC', path: vault }]))

    // 两本库各管一半：实体页答「哪张表、哪些字段」，参考库答「平台怎么运作、报错什么意思」。
    // 查错库不是查不到，而是没人告诉它还有另一本——这一句就是那块指路牌，形状抄
    // knowledge_search 零命中里回头指 wiki_lookup 的那半（`knowledge-tools.ts`）。
    const text = await render('wiki_lookup', { term: '库存组织必填怎么绕' })
    expect(text).toContain('没有找到与「库存组织必填怎么绕」匹配的页面')
    expect(text).toContain('去 knowledge_search 查随包参考库')
    expect(text).toContain('那不在实体页的范围里')

    // 描述里也要有这半句：模型是在**决定要不要调用**的那一刻读描述的，只在零命中的
    // 返回里说，等于等它已经查错了才告诉它。
    expect(description('wiki_lookup')).toContain('use knowledge_search')
  })
})
