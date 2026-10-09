/**
 * Reading a vault's `log.md`: which lines are entries, and in what order.
 *
 * Two defects live here, and both were invisible from the tool's own answer —
 * `wiki_recent` reported an empty history over a real vault holding twenty-odd
 * entries, and the message it fell back on ("this base was never written to")
 * named the wrong cause.
 *
 * 1. **The parser knew one shape.** It matched `- 2026-06-17 …` only, which is
 *    what this plugin appends. A hand-kept `log.md` writes
 *    `## 2026-06-17 ingest | 标题` down from its title instead, and every one of
 *    those entries was skipped. Two writers, one format read.
 * 2. **Order came from position.** The log was assumed append-only, so the file
 *    was reversed. It is not: the hand-kept half runs newest-first from the top
 *    while `recordWrite` appends at the bottom, so reversing returned the
 *    *oldest* entries under a newest-first promise. Order now comes from the date
 *    each entry carries, and the case below writes the same three entries in both
 *    directions to hold that.
 *
 * A third shape is deliberately **not** an entry: the `- wiki/sources/xxx.md`
 * lines that make up a log entry's body. They lead with a path, not a date, so
 * they fall out — and the first case asserts the count, not just the dates, so a
 * pattern that grew too greedy would show up here.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWikiStore } from '../src/host/wiki-store.ts'
import { createYonWikiService, type YonWikiService } from '../src/host/wiki-service.ts'
import { createWikiUsageLog } from '../src/host/wiki-usage.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/** A scratch store and one registered vault, with whatever `log.md` the case wants. */
interface Bench {
  readonly service: YonWikiService
  readonly vault: string
}

/**
 * Build the bench.
 * @param logText - the vault's `log.md`; omitted leaves the file absent.
 * @returns the service and the vault it is registered against.
 */
async function bench(logText?: string): Promise<Bench> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-recent-'))
  temporary.push(dir)
  const store = createWikiStore(join(dir, 'wiki_config.json'))
  // An empty list rather than no file: a read of an absent document seeds the
  // guessed vaults, and those are real vaults on a machine that has them.
  await store.write([])
  const vault = join(dir, 'obsidian', 'yon-bip-obsidian')
  await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
  if (logText !== undefined) await writeFile(join(vault, 'log.md'), logText, 'utf8')
  const service = createYonWikiService(store, createWikiUsageLog(join(dir, 'usage.jsonl')))
  await service.saveVault({ label: 'BIP 知识库', path: vault })
  return { service, vault }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('recent', () => {
  it('reads the shape a hand-kept log uses, and not the body lines under it', async () => {
    const { service } = await bench([
      '# 操作日志',
      '',
      '> 记录知识库的所有变更历史',
      '',
      '## 2026-06-17 ingest | 线程池 yms-executors 实践',
      '',
      '**新增 source 页（1）**：',
      '- wiki/sources/2025-05-20-线程池-yms-executors-实践.md',
      '',
      '## 2026-06-14 batch-ingest | iuap 红皮书系列 ×6',
      '',
    ].join('\n'))

    const entries = await service.recent()
    // Count asserted as well as dates: `- wiki/sources/…` is an entry body, and a
    // pattern loose enough to read a dated path would count it as a third entry.
    expect(entries).toHaveLength(2)
    expect(entries.map(entry => entry.date)).toEqual(['2026-06-17', '2026-06-14'])
    expect(entries[0]?.text).toBe('ingest | 线程池 yms-executors 实践')
  })

  it('still reads the list-item shape this plugin writes', async () => {
    const { service } = await bench([
      '# 操作日志',
      '',
      '## 2026-06-17 ingest | 线程池 yms-executors 实践',
      '',
      '- 2026-10-09 新建 [[销售订单]]（doc，BIP V5）',
      '',
    ].join('\n'))

    const entries = await service.recent()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.date).toBe('2026-10-09')
    expect(entries[0]?.text).toBe('新建 [[销售订单]]（doc，BIP V5）')
  })

  it('answers newest-first whichever direction the file itself runs', async () => {
    const lines = ['## 2026-01-01 早', '', '## 2026-05-05 中', '', '## 2026-09-09 晚', '']
    const ascending = await bench(['# 操作日志', '', ...lines].join('\n'))
    const descending = await bench(['# 操作日志', '', ...[...lines].reverse().slice(1)].join('\n'))

    const newestFirst = ['2026-09-09', '2026-05-05', '2026-01-01']
    expect((await ascending.service.recent()).map(entry => entry.date)).toEqual(newestFirst)
    expect((await descending.service.recent()).map(entry => entry.date)).toEqual(newestFirst)
  })

  it('keeps the file order among entries sharing a day, which carry no time', async () => {
    const { service } = await bench('# 操作日志\n\n- 2026-05-30 甲\n- 2026-05-30 乙\n- 2026-05-30 丙\n')
    // A day is all a line knows, so same-day order is the writer's order and the
    // sort has to preserve it rather than reshuffle it.
    expect((await service.recent()).map(entry => entry.text)).toEqual(['甲', '乙', '丙'])
  })

  it('takes the limit after ordering, so the newest are the ones kept', async () => {
    const { service } = await bench([
      '# 操作日志',
      '',
      '## 2026-01-01 早',
      '',
      '## 2026-05-05 中',
      '',
      '## 2026-09-09 晚',
      '',
    ].join('\n'))
    expect((await service.recent(undefined, 2)).map(entry => entry.date))
      .toEqual(['2026-09-09', '2026-05-05'])
  })

  it('answers an empty list, rather than failing, when the vault has no log.md', async () => {
    const { service } = await bench()
    expect(await service.recent()).toEqual([])
  })
})
