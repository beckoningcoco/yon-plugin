/**
 * The service's promises: a create writes a directory, a document and a row and
 * nothing else; a name already in use stops a create without touching the disk; an
 * append never disturbs what was there; a change leaves a trace and a non-change
 * leaves none; and no mutation ever runs against an index that could not be read.
 *
 * The clock is injected, and built from local components — so the date stamps these
 * cases assert are the same on every machine, in every zone.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createYonRequirementsService,
  RequirementError,
  type YonRequirementsService,
} from '../src/host/requirement-service.ts'
import { createRequirementStore } from '../src/host/requirement-store.ts'
import type { CreateRequirementInput, RequirementStatus, RequirementView } from '../src/shared/types.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one root and a service over it, with a clock this spec drives.
 * @returns the root, the service, the store (for reaching past the service), and a
 *   way to move the clock.
 */
async function setup(): Promise<{
  root: string
  service: YonRequirementsService
  setClock: (hour: number) => void
}> {
  const root = await mkdtemp(join(tmpdir(), 'yon-requirement-service-'))
  temporary.push(root)
  let clock = new Date(2026, 9, 5, 10, 0, 0)
  const service = createYonRequirementsService(createRequirementStore(root), { now: () => clock })
  return {
    root,
    service,
    // Only the hour moves, so every stamp in a case reads 2026-10-05 unless the
    // case says otherwise.
    setClock: hour => {
      clock = new Date(2026, 9, 5, hour, 0, 0)
    },
  }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** Create one entry, failing the case if it came back as a conflict. */
async function mustCreate(
  service: YonRequirementsService,
  input: CreateRequirementInput,
): Promise<RequirementView> {
  const created = await service.create(input)
  if (!created.created) {
    throw new Error(`预期新建，却撞上了 ${created.conflict.id}`)
  }
  return created.requirement
}

describe('新建', () => {
  it('writes the entry, its three folders, and the index row — in that order', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, {
      projectId: 'prj-1',
      name: 'H1-00 接口对接',
      body: '要接三个接口。',
    })

    expect(entry.id).toMatch(/^rq-20261005-[a-z0-9]{4}$/)
    expect(entry.status).toBe('proposed')
    expect(entry.body).toBe('要接三个接口。')
    expect(entry.file).toBe(`${entry.id}/entry.md`)

    const md = await readFile(join(root, entry.id, 'entry.md'), 'utf8')
    expect(md).toContain('name: H1-00 接口对接')
    expect(md).toContain('status: proposed')
    // Nothing has happened yet, so there is nothing to announce.
    expect(md).not.toContain('## 标注')

    // Exactly the document and the three folders — nothing else has any business
    // being in a fresh entry.
    expect((await readdir(join(root, entry.id))).sort()).toEqual([
      'entry.md',
      'generated',
      'patches',
      'user',
    ])

    const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8')) as unknown[]
    expect(index).toEqual([
      {
        id: entry.id,
        projectId: 'prj-1',
        file: `${entry.id}/entry.md`,
        createdAt: entry.createdAt,
      },
    ])
  })

  it('accepts an entry with no description at all', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '只有名字' })
    expect(entry.body).toBe('')
  })

  it('refuses an empty name, a name that is too long, and an empty project', async () => {
    const { service } = await setup()
    for (const input of [
      { projectId: 'prj-1', name: '   ' },
      { projectId: 'prj-1', name: 'x'.repeat(121) },
      { projectId: '', name: '名字' },
    ]) {
      await expect(service.create(input)).rejects.toBeInstanceOf(RequirementError)
    }
  })
})

describe('撞名', () => {
  it('refuses to create a second entry with the same name, and writes nothing', async () => {
    const { root, service } = await setup()
    const first = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const second = await service.create({ projectId: 'prj-1', name: '接口对接' }, { dedupe: true })

    expect(second.created).toBe(false)
    if (second.created) throw new Error('unreachable')
    expect(second.conflict.id).toBe(first.id)
    // The refusal has to be total: no second directory, no second row.
    expect((await readdir(root)).sort()).toEqual(['index.json', first.id].sort())
    expect((await service.list()).rows).toHaveLength(1)
  })

  it('treats names that differ only in case or spacing as the same', async () => {
    const { service } = await setup()
    const first = await mustCreate(service, { projectId: 'prj-1', name: 'H1-00 接口对接' })
    const second = await service.create(
      { projectId: 'prj-1', name: '  h1-00   接口对接 ' },
      { dedupe: true },
    )
    expect(second.created).toBe(false)
    if (second.created) throw new Error('unreachable')
    expect(second.conflict.id).toBe(first.id)
  })

  it('does not treat a name in another project as a conflict', async () => {
    const { service } = await setup()
    await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const second = await service.create({ projectId: 'prj-2', name: '接口对接' }, { dedupe: true })
    expect(second.created).toBe(true)
  })

  it('lets a caller who means it create the twin anyway', async () => {
    const { service } = await setup()
    await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    // The panel's behaviour: no dedupe, so a person typing the same words twice
    // gets two entries and the reason is theirs.
    const second = await service.create({ projectId: 'prj-1', name: '接口对接' })
    expect(second.created).toBe(true)
    expect((await service.list()).rows).toHaveLength(2)
  })
})

describe('标注', () => {
  it('appends a dated note and leaves the description alone', async () => {
    const { root, service, setClock } = await setup()
    const entry = await mustCreate(service, {
      projectId: 'prj-1',
      name: '接口对接',
      body: '原始描述。',
    })
    setClock(11)
    const view = await service.annotate(entry.id, '使用者说字段 A 可以空。')

    expect(view.body).toContain('原始描述。')
    expect(view.body).toContain('2026-10-05 使用者说字段 A 可以空。')
    expect(view.updatedAt).not.toBe(entry.updatedAt)
    expect(await readFile(join(root, entry.id, 'entry.md'), 'utf8')).toContain('## 标注')
  })

  it('keeps every note, in the order they were added', async () => {
    const { service, setClock } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    setClock(11)
    await service.annotate(entry.id, '第一条。')
    setClock(12)
    const view = await service.annotate(entry.id, '第二条。')

    expect(view.body.indexOf('第一条。')).toBeLessThan(view.body.indexOf('第二条。'))
    expect(view.body).toContain('2026-10-05 第一条。')
  })

  it('refuses an empty note', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await expect(service.annotate(entry.id, '   ')).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('改字段', () => {
  it('moves the status and leaves a dated trace naming both values', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const view = await service.update(entry.id, { status: 'done' })

    expect(view.status).toBe('done')
    expect(view.body).toContain('2026-10-05 状态：待开发 → 已完成')
    expect(await readFile(join(root, entry.id, 'entry.md'), 'utf8')).toContain('status: done')
  })

  it('moves the name and leaves a trace naming both', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const view = await service.update(entry.id, { name: 'H1-00 接口对接' })

    expect(view.name).toBe('H1-00 接口对接')
    expect(view.body).toContain('2026-10-05 名称：接口对接 → H1-00 接口对接')
    expect((await service.list()).rows[0]?.name).toBe('H1-00 接口对接')
  })

  it('writes nothing at all when the value is already the one asked for', async () => {
    const { service, setClock } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    setClock(11)
    const view = await service.update(entry.id, { status: entry.status })

    // No trace line reading 「旧 → 旧」, and no moved timestamp: an update that
    // changed nothing must not become a change in the history.
    expect(view.updatedAt).toBe(entry.updatedAt)
    expect(view.body).toBe(entry.body)
  })

  it('refuses a status it does not know', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await expect(
      service.update(entry.id, { status: 'nope' as RequirementStatus }),
    ).rejects.toBeInstanceOf(RequirementError)
  })

  it('archives with a reason, and refuses to archive twice', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const view = await service.archive(entry.id, '需求方撤了')

    expect(view.status).toBe('dropped')
    expect(view.body).toContain('2026-10-05 状态：待开发 → 已废弃')
    expect(view.body).toContain('2026-10-05 废弃原因：需求方撤了')
    await expect(service.archive(entry.id)).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('产物', () => {
  it('writes one file into generated/ and answers where it landed', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const written = await service.artifactWrite(entry.id, 'generated', '方案.md', '# 方案\n')

    expect(written.id).toBe(entry.id)
    expect(written.entry).toBe('接口对接')
    expect(written.kind).toBe('generated')
    expect(written.file).toBe(`${entry.id}/generated/方案.md`)
    expect(written.path).toBe(join(root, entry.id, 'generated', '方案.md'))
    // Bytes, not characters: `# 方案\n` is 9 utf-8 bytes (the two CJK ones are 3 each).
    expect(written.bytes).toBe(9)
    expect(await readFile(written.path, 'utf8')).toBe('# 方案\n')
  })

  it('writes a patch into patches/, and takes the entry by its name too', async () => {
    const { root, service } = await setup()
    await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const written = await service.artifactWrite('接口对接', 'patches', 'fix.patch', 'diff --git a b\n')
    // The file name is one segment by construction: the kind is the folder, and
    // nothing in the name may add another level.
    expect(await readdir(join(root, written.id, 'patches'))).toEqual(['fix.patch'])
  })

  it('refuses user/, a name that is a path, and an empty body', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    // user/ is where the operator's own material lives; a directory the model can
    // write is a directory where "the operator gave us this" stops being true.
    const badKinds = ['user', '../user', '']
    for (const kind of badKinds) {
      await expect(service.artifactWrite(entry.id, kind as 'generated', 'ok.md', '正文'))
        .rejects.toMatchObject({ code: 'invalid-input' })
    }
    const badNames = ['../escape.md', 'a/b.md', 'a\\b.md', '.hidden', 'x. ', '', 'y'.repeat(121)]
    for (const name of badNames) {
      await expect(service.artifactWrite(entry.id, 'generated', name, '正文'))
        .rejects.toMatchObject({ code: 'invalid-input' })
    }
    await expect(service.artifactWrite(entry.id, 'generated', 'ok.md', '   '))
      .rejects.toMatchObject({ code: 'invalid-input' })
    // No refusal wrote anything, and none of them escaped the entry.
    expect(await readdir(join(root, entry.id, 'generated'))).toEqual([])
    expect(await readdir(join(root, entry.id, 'patches'))).toEqual([])
    expect((await readdir(root)).sort()).toEqual(['index.json', entry.id])
  })
})

describe('真删（只有面板走得到）', () => {
  it('removes the row and the directory, and reports what went', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const removed = await service.remove(entry.id)

    expect(removed).toEqual({ id: entry.id, name: '接口对接', path: join(root, entry.id) })
    expect((await service.list()).rows).toEqual([])
    expect(await readdir(root)).toEqual(['index.json'])
    await expect(service.read(entry.id)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('leaves the other entries alone', async () => {
    const { service } = await setup()
    const keep = await mustCreate(service, { projectId: 'prj-1', name: '留下' })
    const drop = await mustCreate(service, { projectId: 'prj-1', name: '删掉' })
    await service.remove(drop.id)

    expect((await service.list()).rows.map(row => row.id)).toEqual([keep.id])
    expect((await service.read(keep.id)).name).toBe('留下')
  })

  it('refuses when the index cannot be read, so a delete cannot take the ledger with it', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await writeFile(join(root, 'index.json'), '{ 这不是 json', 'utf8')
    await expect(service.remove(entry.id)).rejects.toMatchObject({ code: 'invalid-input' })
    // The directory is still there: nothing was removed.
    expect((await readdir(join(root, entry.id))).sort()).toEqual([
      'entry.md', 'generated', 'patches', 'user',
    ])
  })
})

describe('查', () => {
  it('lists newest change first, and filters by project and status', async () => {
    const { service, setClock } = await setup()
    await mustCreate(service, { projectId: 'prj-1', name: 'A' })
    setClock(11)
    await mustCreate(service, { projectId: 'prj-2', name: 'B' })
    setClock(12)
    const c = await mustCreate(service, { projectId: 'prj-1', name: 'C' })

    expect((await service.list()).rows.map(row => row.name)).toEqual(['C', 'B', 'A'])
    expect((await service.list({ projectId: 'prj-1' })).rows.map(row => row.name)).toEqual(['C', 'A'])

    await service.update(c.id, { status: 'done' })
    expect((await service.list({ status: 'done' })).rows.map(row => row.name)).toEqual(['C'])
    expect((await service.list({ status: 'proposed' })).rows).toHaveLength(2)
  })

  it('gives the model the struck-free body and the human the original, split for the trace', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, {
      projectId: 'prj-1',
      name: '接口对接',
      body: '要接三个接口。',
    })
    await service.annotate(entry.id, '~~这条作废~~ → 改成这样')

    const plain = await service.read(entry.id)
    expect(plain.body).not.toContain('~~')
    expect(plain.body).toContain('→ 改成这样')
    expect(plain.raw).toBeUndefined()
    // The two reader-side fields are as history-gated as `raw`: a caller who did not
    // ask to see what changed does not pay for the struck-through copy either.
    expect(plain.prose).toBeUndefined()
    expect(plain.notes).toBeUndefined()

    const historic = await service.read(entry.id, { history: true })
    expect(historic.raw).toContain('~~这条作废~~')
    // `prose` is the entry's own paragraph — the block the panel draws above the
    // notes, which `body` alone cannot give it: the notes heading is already in
    // there, so a panel rendering `body` would draw the trace twice.
    expect(historic.prose).toBe('要接三个接口。')
    expect(historic.body).toContain('要接三个接口。')
    // …and `notes` is that same original, handed over already cut into paragraphs, so
    // the panel never holds a second copy of the heading or the blank-line rule.
    expect(historic.notes).toEqual([`2026-10-05 ~~这条作废~~ → 改成这样`])
  })

  it('finds an entry by its name, and by its id', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: 'H1-00 接口对接' })
    expect((await service.read('h1-00 接口对接')).id).toBe(entry.id)
    expect((await service.read(entry.id)).id).toBe(entry.id)
  })

  it('refuses to guess when two projects hold the same name', async () => {
    const { service } = await setup()
    const one = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const two = await mustCreate(service, { projectId: 'prj-2', name: '接口对接' })
    // The refusal has to name both candidates, or the caller cannot pick one.
    await expect(service.read('接口对接')).rejects.toThrow(new RegExp(`${one.id}.*${two.id}`))
    // …and the ids still resolve unambiguously.
    expect((await service.read(one.id)).projectId).toBe('prj-1')
  })

  it('reports an unknown reference as not-found', async () => {
    const { service } = await setup()
    await expect(service.read('rq-没这个')).rejects.toMatchObject({ code: 'not-found' })
    await expect(service.read('没有这条需求')).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('坏掉的东西不写', () => {
  it('refuses every mutation while the index cannot be read, and leaves the bytes alone', async () => {
    const { root, service } = await setup()
    const broken = '{ 这不是 json'
    await writeFile(join(root, 'index.json'), broken, 'utf8')

    await expect(service.create({ projectId: 'prj-1', name: '新的' })).rejects.toMatchObject({
      code: 'invalid-input',
    })
    await expect(service.annotate('rq-x', '一句话')).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(service.update('rq-x', { status: 'done' })).rejects.toMatchObject({
      code: 'invalid-input',
    })

    // Nothing was created, and the unreadable index is exactly as it was.
    expect(await readdir(root)).toEqual(['index.json'])
    expect(await readFile(join(root, 'index.json'), 'utf8')).toBe(broken)
  })

  it('still answers a list, with the reason attached', async () => {
    const { root, service } = await setup()
    await writeFile(join(root, 'index.json'), '{ 这不是 json', 'utf8')
    const payload = await service.list()
    expect(payload.rows).toEqual([])
    expect(payload.error).toContain('不是合法的 JSON')
  })

  it('keeps an unreadable entry out of the rows without hiding it', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await writeFile(join(root, entry.id, 'entry.md'), '就是一份普通的 md', 'utf8')

    const payload = await service.list()
    expect(payload.rows).toEqual([])
    expect(payload.unreadable).toEqual([entry.id])
    await expect(service.read(entry.id)).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('reports an entry whose file was deleted as not-found, not as broken', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await rm(join(root, entry.id), { recursive: true, force: true })
    await expect(service.read(entry.id)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('exposes the root and the index path', async () => {
    const { root, service } = await setup()
    expect(service.root).toBe(root)
    expect(service.indexPath).toBe(join(root, 'index.json'))
  })
})

describe('附件', () => {
  it('lists the three folders, empty ones included', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })

    const empty = await service.fileList(entry.id)
    expect(empty.groups.map(group => group.dir)).toEqual(['user', 'generated', 'patches'])
    expect(empty.groups.every(group => group.files.length === 0)).toBe(true)
    expect(empty.entry).toBe('接口对接')
    expect(empty.dir).toContain(entry.id)

    const imported = await service.importFile(entry.id, 'user', '华科接口文档.txt', Buffer.from('三个接口', 'utf8'))
    expect(imported.file.bytes).toBe(12)
    expect(imported.renamedFrom).toBeUndefined()

    const listed = await service.fileList(entry.id, 'user')
    expect(listed.groups).toHaveLength(1)
    expect(listed.groups[0]?.files.map(file => file.name)).toEqual(['华科接口文档.txt'])
    expect(listed.groups[0]?.bytes).toBe(12)
    // A prediction from the name, marked readable — the bytes get the last word at
    // read time, and this case never reads.
    expect(listed.groups[0]?.files[0]?.readable).toBe(true)
  })

  it('predicts unreadable for a docx and says which batch it waits for', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'user', '接口文档.docx', Buffer.from('PK\u0003\u0004', 'binary'))

    const listed = await service.fileList(entry.id, 'user')
    const file = listed.groups[0]?.files[0]
    expect(file?.readable).toBe(false)
    expect(file?.note).toContain('压缩包')
  })

  it('keeps a name that is already taken by numbering the new file', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'user', '方案.md', Buffer.from('第一版', 'utf8'))
    const second = await service.importFile(entry.id, 'user', '方案.md', Buffer.from('第二版', 'utf8'))

    expect(second.file.name).toBe('方案-2.md')
    expect(second.renamedFrom).toBe('方案.md')
    const names = (await service.fileList(entry.id, 'user')).groups[0]?.files.map(file => file.name)
    expect(names).toEqual(['方案-2.md', '方案.md'])
    // Nothing was overwritten: the first version is still there, byte for byte.
    const first = await service.fileRead(entry.id, 'user', '方案.md')
    expect(first.text).toBe('第一版')
  })

  it('refuses an empty file, an oversize one, a bad name and a bad folder', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })

    await expect(
      service.importFile(entry.id, 'user', 'empty.txt', Buffer.alloc(0)),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(
      service.importFile(entry.id, 'user', 'huge.bin', Buffer.alloc(50 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(
      service.importFile(entry.id, 'user', '../escape.txt', Buffer.from('x', 'utf8')),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(
      service.importFile(entry.id, 'elsewhere', 'a.txt', Buffer.from('x', 'utf8')),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    // Nothing landed: a refused import is not a partial one.
    expect((await service.fileList(entry.id)).groups.every(group => group.files.length === 0)).toBe(true)
  })

  it('reads text with the encoding it used, and refuses to invent one for a binary', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'user', '说明.txt', Buffer.from('要接三个接口。\n第二行。', 'utf8'))
    const read = await service.fileRead(entry.id, 'user', '说明.txt')
    expect(read.text).toBe('要接三个接口。\n第二行。')
    expect(read.encoding).toBe('utf-8')
    expect(read.truncated).toBe(false)
    expect(read.note).toBeUndefined()
    expect(read.file.readable).toBe(true)

    // A .txt that is not text: the extension promised, the bytes refused.
    await service.importFile(entry.id, 'user', '骗人.txt', Buffer.from([0x41, 0x00, 0x42]))
    const liar = await service.fileRead(entry.id, 'user', '骗人.txt')
    expect(liar.text).toBe('')
    expect(liar.file.readable).toBe(false)
    expect(liar.note).toContain('NUL')
  })

  it('reads a GBK file as GBK rather than as mojibake', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    // 「接口」 in GBK, and these are the GBK bytes themselves — a utf-8 encoding of
    // the same two characters would be a different four bytes and prove nothing.
    await service.importFile(entry.id, 'user', 'gbk.txt', Buffer.from([0xbd, 0xd3, 0xbf, 0xda]))
    const read = await service.fileRead(entry.id, 'user', 'gbk.txt')
    expect(read.text).toBe('接口')
    expect(read.encoding).toBe('gb18030')
  })

  it('reports a docx read as an answer rather than as an error', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'user', '接口文档.docx', Buffer.from('PK\u0003\u0004', 'binary'))
    const read = await service.fileRead(entry.id, 'user', '接口文档.docx')
    // No text, a reason, and no throw: three outcomes with one shape, so neither the
    // panel nor the tool has to special-case "this one is a docx".
    expect(read.text).toBe('')
    expect(read.note).toContain('压缩包')
  })

  it('truncates at the character cap and says the file is longer', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    // 8000 lines of ~11 characters: comfortably past the 60k character cap and still
    // under the 1 MB byte cap, so this case is about one limit and not the other.
    const long = Array.from({ length: 8000 }, (_, index) => `第 ${index} 行的内容`).join('\n')
    await service.importFile(entry.id, 'user', 'long.txt', Buffer.from(long, 'utf8'))
    const read = await service.fileRead(entry.id, 'user', 'long.txt')
    expect(read.truncated).toBe(true)
    expect(read.text.length).toBeLessThanOrEqual(60_000)
    expect(read.note).toContain('60000')
    // Cut on a line boundary: the last line is a whole one, not half of one.
    expect(read.text.endsWith('行的内容')).toBe(true)
  })

  it('reads the head of a file bigger than the byte cap, and still gives text', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    // 1.2 MB on ONE line — a minified bundle, a one-line JSON, a SQL dump. Both caps
    // bite: only 1 MB is read off the disk, and only 60k characters fit. The thing
    // this case is really about is that a file with no line breaks still comes back
    // with text instead of with "it has no text".
    await service.importFile(entry.id, 'user', 'one-line.txt', Buffer.alloc(1_200_000, 0x61))
    const read = await service.fileRead(entry.id, 'user', 'one-line.txt')
    expect(read.truncated).toBe(true)
    expect(read.file.bytes).toBe(1_200_000)
    expect(read.text).toHaveLength(60_000)
    // Both reasons, in one sentence: the read was capped, and so was the decode.
    expect(read.note).toContain('第一行就比这长')
    expect(read.note).toContain('文件共 1.1 MB，上面只是开头 976.6 KB')
  })

  it('reports a missing file as not-found, for both the entry and the file', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await expect(service.fileRead(entry.id, 'user', 'nope.txt')).rejects.toMatchObject({ code: 'not-found' })
    await expect(service.removeFile(entry.id, 'user', 'nope.txt')).rejects.toMatchObject({ code: 'not-found' })
    await expect(service.fileList('rq-没这个')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('removes one attachment and leaves the rest alone', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'user', 'a.txt', Buffer.from('a', 'utf8'))
    await service.importFile(entry.id, 'user', 'b.txt', Buffer.from('b', 'utf8'))

    const removed = await service.removeFile(entry.id, 'user', 'a.txt')
    expect(removed.file.name).toBe('a.txt')
    expect(removed.entry).toBe('接口对接')
    const names = (await service.fileList(entry.id, 'user')).groups[0]?.files.map(file => file.name)
    expect(names).toEqual(['b.txt'])
  })

  it('does not touch entry.md when a file comes or goes', async () => {
    const { root, service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    const before = await readFile(join(root, entry.id, 'entry.md'), 'utf8')

    await service.importFile(entry.id, 'user', 'a.txt', Buffer.from('a', 'utf8'))
    await service.removeFile(entry.id, 'user', 'a.txt')

    // A trace line per upload would turn the operator's own material into noise in
    // the one place the entry's history is meant to be readable (rule 5).
    expect(await readFile(join(root, entry.id, 'entry.md'), 'utf8')).toBe(before)
  })

  it('imports into generated/ and patches/ as well as user/', async () => {
    const { service } = await setup()
    const entry = await mustCreate(service, { projectId: 'prj-1', name: '接口对接' })
    await service.importFile(entry.id, 'generated', '方案.md', Buffer.from('# 方案', 'utf8'))
    await service.importFile(entry.id, 'patches', 'fix.patch', Buffer.from('--- a\n+++ b\n', 'utf8'))

    const listed = await service.fileList(entry.id)
    expect(listed.groups.map(group => [group.dir, group.files.map(file => file.name)])).toEqual([
      ['user', []],
      ['generated', ['方案.md']],
      ['patches', ['fix.patch']],
    ])
  })
})
