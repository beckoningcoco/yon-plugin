/**
 * 记忆库的体检：六项检查各查出什么，以及唯一那一项能自动修的东西真修好了。
 *
 * 三条用例盯着这套检查最要紧的地方：
 *
 * - **索引与文件对不上时它看得见**，而且看得见的两个方向都要（记录找不到文件、文件不在索引里）。
 *   这是这套存储自己的代价：索引是缓存，落后了注入里就会出现一个读不到正文的标题。
 * - **`repair` 只重建索引**：它不碰任何 `.md`。一条体检工具顺手改内容，就没法再当体检用了。
 * - **它只报不改**：所有 finding 都只是「哪几条、为什么」，判断留给看的人。
 *
 * 库一律建在临时目录里；默认路径是使用者自己的库。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore, recordOfDoc, type MemoryStore } from '../src/host/memory-store.ts'
import { serializeMemory, type MemoryDoc } from '../src/host/memory-doc.ts'
import { sweepMemories, titleOverlap } from '../src/host/memory-sweep.ts'
import type { ProjectDetail } from '../src/shared/types.ts'
import type { YonProjectsService } from '../src/host/service.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

const WATER = 'prj-water'

/** A project registry with the two methods this sweep uses. */
function projectsOf(rows: readonly { readonly projectId: string; readonly name: string }[]): YonProjectsService {
  const details: ProjectDetail[] = rows.map(row => ({
    projectId: row.projectId,
    name: row.name,
    code: '',
    status: 'active',
    archived: false,
    fieldCount: 0,
    fields: {},
    createdAt: 0,
    updatedAt: 0,
  }))
  return { list: () => details } as unknown as YonProjectsService
}

/** One memory with everything a case does not care about filled in. */
function doc(overrides: Partial<MemoryDoc> & { readonly id: string }): MemoryDoc {
  return {
    projectId: WATER,
    type: 'pitfall',
    title: `${overrides.id} 的标题`,
    tags: [],
    source: '一次实测',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    body: '正文。',
    ...overrides,
  }
}

/** A scratch bank. */
async function bench(): Promise<{ readonly store: MemoryStore; readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-memory-sweep-'))
  temporary.push(dir)
  return { store: createMemoryStore(dir), dir }
}

/** Write one memory file and add its record, as a healthy bank holds them. */
async function file(store: MemoryStore, entry: MemoryDoc): Promise<void> {
  const read = await store.readIndex()
  await store.writeEntry(entry)
  await store.writeIndex([...read.records, recordOfDoc(entry)])
}

/** The checks a report found, once each. */
const checksOf = (findings: readonly { readonly check: string }[]): string[] =>
  [...new Set(findings.map(finding => finding.check))].sort()

describe('the memory sweep', () => {
  it('finds nothing wrong with a healthy bank', async () => {
    const { store } = await bench()
    await file(store, doc({ id: 'mem-1' }))
    await file(store, doc({ id: 'mem-2', title: '完全不同的另一件事' }))

    const report = await sweepMemories(store, projectsOf([{ projectId: WATER, name: '水投' }]))

    expect(report.total).toBe(2)
    expect(report.findings).toEqual([])
  })

  it('sees the index drift in both directions', async () => {
    const { store } = await bench()
    await file(store, doc({ id: 'mem-1' }))
    // 文件在、索引没有：往目录里直接写一个 md，不动索引。
    await store.writeEntry(doc({ id: 'mem-stray', title: '没进索引的一条' }))
    // 索引有、文件没有：往索引里塞一条没有文件的记录。
    const read = await store.readIndex()
    await store.writeIndex([...read.records, recordOfDoc(doc({ id: 'mem-ghost', title: '只有记录的一条' }))])

    const report = await sweepMemories(store, projectsOf([{ projectId: WATER, name: '水投' }]))

    const drift = report.findings.find(finding => finding.check === 'index-drift')
    expect(drift).toBeDefined()
    // 这一项是六项里唯一不需要人拿主意的：索引能从文件重建。
    expect(drift?.needsPerson).toBe(false)
    expect(drift?.items.map(item => item.id).sort()).toEqual(['mem-ghost', 'mem-stray'])
  })

  it('repairs by rebuilding the index from the files, and touches nothing else', async () => {
    const { store, dir } = await bench()
    await file(store, doc({ id: 'mem-1' }))
    await store.writeEntry(doc({ id: 'mem-stray' }))
    const read = await store.readIndex()
    await store.writeIndex([...read.records, recordOfDoc(doc({ id: 'mem-ghost' }))])
    // 一条读不出来的文件：它不该被「修」掉，只该被重建后的索引漏掉。
    await writeFile(join(dir, 'mem-broken.md'), '这不是一条记忆', 'utf8')
    const before = await readFile(join(dir, 'mem-1.md'), 'utf8')

    const report = await sweepMemories(store, projectsOf([{ projectId: WATER, name: '水投' }]), { repair: true })

    expect(report.repair).toEqual({ records: 2, added: 1, dropped: 1 })
    const after = await store.readIndex()
    expect(after.records.map(record => record.id).sort()).toEqual(['mem-1', 'mem-stray'])
    // 文件一个字节都没动：体检的唯一写操作是重建那个缓存。
    expect(await readFile(join(dir, 'mem-1.md'), 'utf8')).toBe(before)
    expect(await readFile(join(dir, 'mem-broken.md'), 'utf8')).toBe('这不是一条记忆')
  })

  it('reports an orphan, a sourceless memory, an over-long body and a stale one', async () => {
    const { store } = await bench()
    await file(store, doc({ id: 'mem-orphan', projectId: 'prj-gone' }))
    await file(store, doc({ id: 'mem-nosource', source: '' }))
    await file(store, doc({ id: 'mem-long', body: '很'.repeat(201) }))
    await file(store, doc({ id: 'mem-stale', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }))

    const report = await sweepMemories(
      store,
      projectsOf([{ projectId: WATER, name: '水投' }]),
      { now: new Date('2026-10-08T00:00:00.000Z') },
    )

    expect(checksOf(report.findings)).toEqual(['no-source', 'orphan', 'stale', 'too-long'])
    // 孤儿那一项用 id 当名字：项目没了，报告里至少要看得出它原来挂在谁身上。
    expect(report.findings.find(finding => finding.check === 'orphan')?.projectName).toBe('prj-gone')
    // 每一项都要一个人拿主意——判断一条结论还成不成立，不是体检能做的事。
    expect(report.findings.every(finding => finding.needsPerson)).toBe(true)
    // 久未复核不判对错，这一点写在它自己的说明里。
    expect(report.findings.find(finding => finding.check === 'stale')?.detail).toContain('这不说明它错了')
  })

  it('pairs up two memories that look like the same finding', async () => {
    const { store } = await bench()
    await file(store, doc({ id: 'mem-a', title: '达梦下按时间范围查询必须走索引' }))
    await file(store, doc({ id: 'mem-b', title: '达梦下按时间范围查询必须走索引' }))
    await file(store, doc({ id: 'mem-c', title: '这个环境的数据库是达梦 8' }))

    const report = await sweepMemories(store, projectsOf([{ projectId: WATER, name: '水投' }]))

    const overlap = report.findings.find(finding => finding.check === 'overlap')
    expect(overlap?.items.map(item => item.id)).toEqual(['mem-a', 'mem-b'])
    // 报的是「可能重复，也可能互相矛盾」——这一层判不出来，也不假装判得出来。
    expect(overlap?.detail).toContain('可能重复，也可能互相矛盾')
  })

  it('compares two titles by character bigrams', () => {
    expect(titleOverlap('达梦下按时间范围查询必须走索引', '达梦下按时间范围查询必须走索引')).toBe(1)
    expect(titleOverlap('达梦下按时间范围查询必须走索引', '这个环境的数据库是达梦 8')).toBeLessThan(0.5)
    expect(titleOverlap('', '任何')).toBe(0)
  })
})
