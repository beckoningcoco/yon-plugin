/**
 * 记忆库的服务层：写入、改正、召回，以及两个「不许发生」。
 *
 * 三条用例盯着这套设计最要紧的地方：
 *
 * - **索引与文件分工**：注入路径（`recent`）只读索引——把文件删掉它照样答得出来；
 *   召回路径（`list`）读文件——所以文件没了它就不给这一条。这不是优化，是
 *   `docs/yon-memory-design.md` §6 定下的：注入要被每次 `project_read` 调用，不能
 *   每次开五个文件。
 * - **文件是真相**：手工改过 markdown 之后，`update` 只动它改的那个字段，别的手改
 *   留着。反过来（拿索引覆盖文件）会让使用者的手改凭空消失。
 * - **索引读不出来时一个字都不写**：把那时的空列表当成真的，下一次写入会把整个库
 *   替换成一条新记忆。
 *
 * 记忆一律建在临时目录里；默认路径是使用者自己的库，用例往那儿写就是在他的机器上
 * 留记录。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore } from '../src/host/memory-store.ts'
import { BODY_SOFT_MAX, createYonMemoryService, type YonMemoryService } from '../src/host/memory-service.ts'
import type { ProjectDetail } from '../src/shared/types.ts'
import type { YonProjectsService } from '../src/host/service.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One project as the registry would hold it. */
interface FakeProject {
  readonly projectId: string
  readonly name: string
  readonly code?: string
}

/**
 * A project registry with the two methods this service uses.
 *
 * Cast rather than implemented in full for `host-tools.spec.ts`'s reason: the rest of
 * `YonProjectsService` is the project panel's business, and a spec that faked all of it
 * would be asserting the fake.
 */
function projectsOf(rows: readonly FakeProject[]): YonProjectsService {
  const details: ProjectDetail[] = rows.map(row => ({
    projectId: row.projectId,
    name: row.name,
    code: row.code ?? '',
    status: 'active',
    archived: false,
    fieldCount: 0,
    fields: {},
    createdAt: 0,
    updatedAt: 0,
  }))
  return {
    list: () => details,
    resolve: (ref: string) => {
      const found = details.find(project =>
        project.projectId === ref || project.name === ref || project.code === ref)
      return found === undefined ? { kind: 'none' } : { kind: 'found', project: found }
    },
  } as unknown as YonProjectsService
}

/** 两个项目，一个记不住名字的长 id，一个短 code。 */
const WATER = 'd16df4e7-6c76-4bde-8f9b-bd4e2517f6a2'
const SKY = '53e2b753-fbc9-4416-9b87-465b5a19414a'

/**
 * Mount the service over a scratch directory.
 * @param seedIndex - written into `index.json` before the service sees it; omitted
 *   means the bank does not exist yet.
 * @returns the service, the directory, and the two file readers.
 */
async function bench(seedIndex?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'yon-memory-service-'))
  temporary.push(dir)
  const store = createMemoryStore(dir)
  if (seedIndex !== undefined) await writeFile(join(dir, 'index.json'), seedIndex, 'utf8')

  const projects = projectsOf([
    { projectId: WATER, name: '水投', code: 'shuitou' },
    { projectId: SKY, name: '天九', code: 'tianjiu' },
  ])
  const service: YonMemoryService = createYonMemoryService(store, projects)

  /** One memory file as it is on disk, or undefined when there is none. */
  const readFileText = async (id: string): Promise<string | undefined> =>
    await readFile(join(dir, `${id}.md`), 'utf8').catch(() => undefined)

  /** The index as it is on disk. */
  const readIndexText = async (): Promise<string> =>
    await readFile(join(dir, 'index.json'), 'utf8')

  return { service, store, dir, readFileText, readIndexText }
}

/** The three fields every filing needs. */
const filing = {
  project: '水投',
  title: '达梦下按时间范围查询必须走索引',
  body: '不带时间范围时全表扫，68.11.100.7 上要 40 秒。',
  source: '实测于 2026-10-05 会话，datasource_query',
} as const

describe('the memory service', () => {
  it('writes both halves of a filing, and reads back what it wrote', async () => {
    const { service, readFileText, readIndexText } = await bench()

    const { memory: saved, created } = await service.create(filing)

    expect(created).toBe(true)
    expect(saved.id).toMatch(/^mem-\d{8}-\d{6}-[a-z0-9]{4}$/)
    expect(saved.projectName).toBe('水投')
    expect(saved.type).toBe('lesson')

    const text = await readFileText(saved.id)
    expect(text).toContain('title: 达梦下按时间范围查询必须走索引')
    expect(text).toContain('不带时间范围时全表扫')

    // 索引里那一条是给注入用的：标题与类型必须在，否则注入就得去开文件。
    const index = JSON.parse(await readIndexText()) as Array<Record<string, unknown>>
    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({
      id: saved.id,
      projectId: WATER,
      type: 'lesson',
      title: '达梦下按时间范围查询必须走索引',
      file: `${saved.id}.md`,
    })

    expect((await service.read(saved.id)).body).toBe(filing.body)
  })

  it('refuses a filing with no source', async () => {
    // 出处是取消状态标签之后，记忆与「模型随口一说」之间剩下的唯一分界。
    const { service } = await bench()

    await expect(service.create({ ...filing, source: '  ' }))
      .rejects.toThrow(/source/)
    await expect(service.create({ ...filing, title: '' })).rejects.toThrow(/title/)
    await expect(service.create({ ...filing, body: '' })).rejects.toThrow(/body/)
  })

  it('accepts a long body and says nothing about it here', async () => {
    // 「软」上限是软的：拒掉它比它挡住的问题更糟——一条经验常常要同时装下表名、
    // SQL 片段和报错原文。长度由 memory_write 的报告与 memory_sweep 去说。
    const { service } = await bench()
    const long = '很'.repeat(BODY_SOFT_MAX + 50)

    const { memory: saved } = await service.create({ ...filing, body: long })

    expect(saved.body).toBe(long)
  })

  it('refuses a body that is a document, not a memory', async () => {
    const { service } = await bench()
    await expect(service.create({ ...filing, body: '字'.repeat(4001) }))
      .rejects.toThrow(/body 太长了/)
  })

  it('does not file the same title twice in one project', async () => {
    const { service } = await bench()

    const first = await service.create(filing, { dedupe: true })
    const again = await service.create(
      { ...filing, title: '  达梦下按时间范围查询必须走索引  ' },
      { dedupe: true },
    )

    expect(again.created).toBe(false)
    expect(again.memory.id).toBe(first.memory.id)
    expect((await service.list()).rows).toHaveLength(1)
  })

  it('does not confuse two projects that filed the same title', async () => {
    const { service } = await bench()

    await service.create(filing, { dedupe: true })
    const other = await service.create({ ...filing, project: '天九' }, { dedupe: true })

    expect(other.created).toBe(true)
    expect((await service.list()).rows).toHaveLength(2)
  })

  it('answers a recall from the index alone when asked for the newest', async () => {
    // 这就是注入路径：它只读 index.json。把文件删掉之后仍然答得出来，是这条分工的
    // 判据——它证明 recent() 没有偷偷去开文件（那会让每次 project_read 都慢下来）。
    const { service, dir } = await bench()
    const { memory: saved } = await service.create(filing)
    await rm(join(dir, `${saved.id}.md`))

    const newest = await service.recent(WATER, 5)

    expect(newest).toHaveLength(1)
    expect(newest[0]?.title).toBe(filing.title)
    // 而召回路径必须开文件，所以同一时刻它什么都不给：宁可少给，也不给一个读不到
    // 正文的标题。
    expect((await service.list()).rows).toHaveLength(0)
  })

  it('searches the body, not only the title', async () => {
    const { service } = await bench()
    await service.create({ ...filing, body: '68.11.100.7 上的全表扫要 40 秒。' })
    await service.create({ ...filing, title: '另一条', body: '和达梦无关。' })

    const found = await service.list({ query: '68.11.100.7' })

    expect(found.rows).toHaveLength(1)
    expect(found.rows[0]?.title).toBe(filing.title)
    expect(found.rows[0]?.snippet).toContain('40 秒')
  })

  it('corrects a memory instead of filing a second one', async () => {
    const { service, readIndexText } = await bench()
    const { memory: saved } = await service.create(filing)

    const updated = await service.update(saved.id, { body: '带范围后 0.2 秒。' })

    expect(updated.body).toBe('带范围后 0.2 秒。')
    expect(updated.title).toBe(filing.title)
    expect(updated.updatedAt >= saved.updatedAt).toBe(true)
    // 索引也是当前值：召回时注入的标题若还停在旧版，改这条就白改了。
    const index = JSON.parse(await readIndexText()) as Array<Record<string, unknown>>
    expect(index[0]).toMatchObject({ title: filing.title })
  })

  it('writes nothing when an update changes nothing', async () => {
    const { service } = await bench()
    const { memory: saved } = await service.create(filing)

    const same = await service.update(saved.id, { title: filing.title })

    expect(same.updatedAt).toBe(saved.updatedAt)
  })

  it('treats the file as the truth when a person has edited it', async () => {
    // 使用者（或另一个会话）直接在编辑器里改了正文。改写必须建立在那份内容上，否则
    // 他的手改会凭空消失——而记忆库是一叠 markdown 文件，这正是它允许的用法。
    const { service, dir } = await bench()
    const { memory: saved } = await service.create(filing)
    const path = join(dir, `${saved.id}.md`)
    const handEdited = (await readFile(path, 'utf8')).replace('40 秒', '四十秒')
    await writeFile(path, handEdited, 'utf8')

    const updated = await service.update(saved.id, { body: '带范围后 0.2 秒。' })

    expect(updated.body).toBe('带范围后 0.2 秒。')
    // 只改了 body：手改留下的那份正文被这一次改写覆盖，但别的手改字段仍在。
    const text = await readFile(path, 'utf8')
    expect(text).toContain(`source: ${filing.source}`)
  })

  it('refuses every write while the index cannot be read', async () => {
    const { service } = await bench('{ 这不是 JSON')

    await expect(service.create(filing)).rejects.toThrow(/不是合法的 JSON/)

    // 读那一侧仍然答话，只是把原因说出来：一个看不见文件的读者，至少该知道为什么。
    const listed = await service.list()
    expect(listed.rows).toEqual([])
    expect(listed.error).toContain('不是合法的 JSON')
  })

  it('drops a record the index cannot use, and keeps the rest', async () => {
    const { service, readIndexText } = await bench()
    const { memory: saved } = await service.create(filing)
    const index = JSON.parse(await readIndexText()) as unknown[]
    // 手工在索引里塞两行坏记录：没有 title 的、和 id 重复的。
    await writeFile(join(service.indexPath), JSON.stringify([
      ...index,
      { id: 'mem-x', projectId: WATER, type: 'pitfall' },
      index[0],
    ]), 'utf8')

    const listed = await service.list()

    expect(listed.rows.map(row => row.id)).toEqual([saved.id])
  })

  it('will not turn an id into a path out of the bank', async () => {
    const { service } = await bench()

    await expect(service.read('../index')).rejects.toThrow(/记忆库里没有这一条/)
    await expect(service.update('../../etc/passwd', { body: 'x' }))
      .rejects.toThrow(/记忆库里没有这一条/)
  })

  it('names a memory whose project is gone by its id rather than hiding it', async () => {
    // 项目被删掉之后，这条记忆仍然读得出来。它挂着项目的那条线索断了，但「有一条记忆
    // 属于一个不存在的项目」正是体检与人都要看的东西，不是把它藏起来的理由。
    const first = await bench()
    const { memory: saved } = await first.service.create({ ...filing, project: '水投' })

    // 同一个目录，换一张空的登记表：项目没了，记忆还在。
    const alone = createYonMemoryService(createMemoryStore(first.dir), projectsOf([]))
    const found = await alone.list()

    expect(found.rows.map(row => row.id)).toEqual([saved.id])
    expect(found.rows[0]?.projectName).toBe(WATER)
  })

  it('deletes one memory, leaving neither the file nor the record behind', async () => {
    const { service, dir } = await bench()
    const { memory: saved } = await service.create(filing)

    expect(await service.remove(saved.id)).toBe(saved.id)

    expect((await service.list()).rows).toHaveLength(0)
    // 文件也没了。两份都留下的「删除」下一次体检会当成孤儿报出来。
    expect(await readFile(join(dir, `${saved.id}.md`), 'utf8').catch(() => undefined)).toBeUndefined()
    await expect(service.read(saved.id)).rejects.toThrow(/记忆库里没有这一条/)
  })

  it('refuses to delete what it cannot find, or from an index it cannot read', async () => {
    const { service } = await bench()

    await expect(service.remove('mem-20260101-000000-zzzz')).rejects.toThrow(/记忆库里没有这一条/)
    // 不安全的 id 走的是同一条路：先拒绝，再谈文件。
    await expect(service.remove('../index')).rejects.toThrow(/记忆库里没有这一条/)

    // 索引读不出来时一个字都不动：把空索引当成真的再写回去，等于抹掉整个库。
    const broken = await bench('{ 这不是 JSON')
    await expect(broken.service.remove('mem-x')).rejects.toThrow(/不是合法的 JSON/)
  })
})
