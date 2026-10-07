/**
 * The store's promises: a write is atomic and self-contained, an index that exists
 * but cannot be used is reported rather than replaced, one bad row costs that row
 * rather than the ledger, and an entry is a directory with the three folders the
 * operator and the model fill in.
 *
 * What is deliberately not exercised: the default root. It reads the operator's own
 * `~/.dsh/yon-panel/requirements/`, and a case covering it would pass or fail
 * according to what happens to be on the machine running it. Every case here passes
 * its own scratch root, which is also why `createRequirementStore(root)` takes one.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RequirementEntryDoc } from '../src/host/requirement-doc.ts'
import {
  createRequirementStore,
  defaultRequirementRoot,
  isSafeId,
  REQUIREMENT_SUBDIRS,
  type RequirementRecord,
} from '../src/host/requirement-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty root for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-requirement-store-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One index row, shaped the way the service writes one. */
const RECORD: RequirementRecord = {
  id: 'rq-20260912-abcd',
  projectId: 'prj-1',
  file: 'rq-20260912-abcd/entry.md',
  createdAt: '2026-09-12T03:11:20.000Z',
}

/** One entry, shaped the way the service builds one. */
const DOC: RequirementEntryDoc = {
  name: 'H1-00 固定资产接口对接',
  status: 'working',
  created: '2026-09-12T03:11:20.000Z',
  updated: '2026-10-05T06:02:41.000Z',
  body: '华科给的三个接口要接到固定资产模块上。',
  notes: ['2026-09-12 使用者提供的资料：三份接口文档已拷进 user/。'],
}

describe('index.json', () => {
  it('reads back exactly what was written', async () => {
    const store = createRequirementStore(await scratch())
    await store.writeIndex([RECORD, { ...RECORD, id: 'rq-20260912-efgh' }])
    const read = await store.readIndex()
    expect(read.records).toEqual([RECORD, { ...RECORD, id: 'rq-20260912-efgh' }])
    expect(read.exists).toBe(true)
    expect(read.skipped).toBe(0)
    expect(read.error).toBeUndefined()
  })

  it('reports an absent index as absent, not as broken', async () => {
    const store = createRequirementStore(await scratch())
    const read = await store.readIndex()
    expect(read).toMatchObject({ records: [], exists: false, skipped: 0 })
    expect(read.error).toBeUndefined()
  })

  it('reports an unparseable index and leaves its bytes alone', async () => {
    const root = await scratch()
    const store = createRequirementStore(root)
    const broken = '{ 这不是 json'
    await writeFile(store.indexPath, broken, 'utf8')
    const read = await store.readIndex()
    expect(read.exists).toBe(true)
    expect(read.error).toContain('不是合法的 JSON')
    expect(await readFile(store.indexPath, 'utf8')).toBe(broken)
  })

  it('reports an index that is not an array', async () => {
    const store = createRequirementStore(await scratch())
    await writeFile(store.indexPath, '{"rows":[]}', 'utf8')
    expect((await store.readIndex()).error).toContain('应该是一个数组')
  })

  it('drops the unusable rows and counts them', async () => {
    const store = createRequirementStore(await scratch())
    await writeFile(
      store.indexPath,
      JSON.stringify([RECORD, { id: 42, projectId: 'prj-1' }, { id: 'rq-x' }, 'nonsense']),
      'utf8',
    )
    const read = await store.readIndex()
    expect(read.records).toEqual([RECORD])
    expect(read.skipped).toBe(3)
    expect(read.error).toBeUndefined()
  })

  it('keeps the first of two rows claiming the same id', async () => {
    const store = createRequirementStore(await scratch())
    await writeFile(
      store.indexPath,
      JSON.stringify([RECORD, { ...RECORD, projectId: 'prj-2' }]),
      'utf8',
    )
    const read = await store.readIndex()
    expect(read.records).toEqual([RECORD])
    expect(read.skipped).toBe(1)
  })

  it('fills in the entry path when a hand-written row omits it', async () => {
    const store = createRequirementStore(await scratch())
    await writeFile(store.indexPath, JSON.stringify([{ id: 'rq-1', projectId: 'prj-1' }]), 'utf8')
    expect((await store.readIndex()).records[0]?.file).toBe('rq-1/entry.md')
  })
})

describe('an entry on disk', () => {
  it('reads back exactly what was written', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await store.writeEntry(RECORD.id, DOC)
    const read = await store.readEntry(RECORD.id)
    expect(read.exists).toBe(true)
    expect(read.doc).toEqual(DOC)
    expect(read.error).toBeUndefined()
  })

  it('makes the entry directory with its three folders', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    expect((await readdir(store.dirPath(RECORD.id))).sort()).toEqual([...REQUIREMENT_SUBDIRS].sort())
  })

  it('reports a missing entry as missing', async () => {
    const store = createRequirementStore(await scratch())
    const read = await store.readEntry(RECORD.id)
    expect(read).toMatchObject({ exists: false })
    expect(read.doc).toBeUndefined()
    expect(read.error).toBeUndefined()
  })

  it('reports an entry that does not parse, and leaves its bytes alone', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    const broken = '就是一份普通的 md'
    await writeFile(store.entryPath(RECORD.id), broken, 'utf8')
    const read = await store.readEntry(RECORD.id)
    expect(read.exists).toBe(true)
    expect(read.doc).toBeUndefined()
    expect(read.error).toContain('frontmatter')
    expect(await readFile(store.entryPath(RECORD.id), 'utf8')).toBe(broken)
  })

  it('lists a folder\'s files sorted with size and mtime, and an absent folder as empty', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    expect(await store.statFiles(RECORD.id, 'user')).toEqual([])
    await writeFile(join(store.dirPath(RECORD.id), 'user', 'b.pdf'), 'xyz')
    await writeFile(join(store.dirPath(RECORD.id), 'user', 'a.docx'), 'x')
    const rows = await store.statFiles(RECORD.id, 'user')
    expect(rows.map(row => [row.name, row.bytes])).toEqual([
      ['a.docx', 1],
      ['b.pdf', 3],
    ])
    for (const row of rows) expect(Number.isNaN(Date.parse(row.modifiedAt))).toBe(false)
  })

  it('skips a hand-made sub-directory instead of offering it as a file', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await mkdir(join(store.dirPath(RECORD.id), 'user', 'nested'), { recursive: true })
    await writeFile(join(store.dirPath(RECORD.id), 'user', 'real.txt'), 'x')
    expect((await store.statFiles(RECORD.id, 'user')).map(row => row.name)).toEqual(['real.txt'])
  })

  it('reads only the head of a file, and reports the size of the whole one', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await writeFile(join(store.dirPath(RECORD.id), 'user', 'long.txt'), 'abcdefghij')
    const head = await store.readFileHead(RECORD.id, 'user', 'long.txt', 4)
    expect(head?.data.toString('utf8')).toBe('abcd')
    expect(head?.bytes).toBe(10)
    expect(head?.name).toBe('long.txt')
    const whole = await store.readFileHead(RECORD.id, 'user', 'long.txt', 1000)
    expect(whole?.data.toString('utf8')).toBe('abcdefghij')
  })

  it('reports a missing file on read as undefined rather than throwing', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    expect(await store.readFileHead(RECORD.id, 'user', 'nope.txt', 16)).toBeUndefined()
  })

  it('writes bytes into user/ verbatim and makes the folder on the way', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await rm(join(store.dirPath(RECORD.id), 'user'), { recursive: true, force: true })
    // 0x00 and a lone 0xc3 are not valid UTF-8: anything that went through a text
    // encode would come back different, which is the whole point of this case.
    const bytes = Buffer.from([0x00, 0x41, 0xc3, 0xff, 0x42])
    const written = await store.writeFileBytes(RECORD.id, 'user', 'raw.bin', bytes)
    expect(written.bytes).toBe(5)
    expect(await readFile(store.filePath(RECORD.id, 'user', 'raw.bin'))).toEqual(bytes)
  })

  it('removes one file, and says so when it is not there', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await store.writeFileBytes(RECORD.id, 'patches', 'a.patch', Buffer.from('patch'))
    await store.removeFile(RECORD.id, 'patches', 'a.patch')
    expect(await store.statFiles(RECORD.id, 'patches')).toEqual([])
    await expect(store.removeFile(RECORD.id, 'patches', 'a.patch')).rejects.toThrow()
  })

  it('removes an entry outright', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await store.writeEntry(RECORD.id, DOC)
    await store.removeEntry(RECORD.id)
    expect((await readdir(store.root))).toEqual([])
  })
})

describe('writes', () => {
  it('leaves no temporary file behind', async () => {
    const store = createRequirementStore(await scratch())
    await store.createEntryDir(RECORD.id)
    await store.writeIndex([RECORD])
    await store.writeEntry(RECORD.id, DOC)
    const names = [...(await readdir(store.root)), ...(await readdir(store.dirPath(RECORD.id)))]
    expect(names.filter(name => name.includes('.tmp-'))).toEqual([])
  })

  it('serialises concurrent writes instead of interleaving them', async () => {
    const store = createRequirementStore(await scratch())
    await Promise.all(
      [1, 2, 3, 4, 5].map(length =>
        store.writeIndex(Array.from({ length }, (_, index) => ({ ...RECORD, id: `rq-${index}` }))),
      ),
    )
    const read = await store.readIndex()
    expect(read.error).toBeUndefined()
    expect(read.records.map(record => record.id)).toEqual(['rq-0', 'rq-1', 'rq-2', 'rq-3', 'rq-4'])
  })
})

describe('ids that become paths', () => {
  it('accepts the ids the service generates', () => {
    expect(isSafeId('rq-20261005-ab12')).toBe(true)
  })

  it('rejects anything that would walk out of the root', () => {
    for (const bad of ['../escape', 'a/b', 'a\\b', '..', '', '.hidden']) {
      expect(isSafeId(bad), bad).toBe(false)
    }
  })
})

describe('the default root', () => {
  it('sits beside the iteration ledger', () => {
    expect(defaultRequirementRoot()).toMatch(/\.dsh[\\/]yon-panel[\\/]requirements$/)
  })
})
