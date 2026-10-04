/**
 * The ledger document's promises: a write is atomic and self-contained, a document
 * that exists but cannot be parsed is reported rather than replaced, and one bad
 * row costs that row rather than every note.
 *
 * What is deliberately not exercised: the default path. It reads the operator's own
 * `~/.dsh/yon-panel/`, and a case covering it would pass or fail according to what
 * happens to be recorded on the machine running it. Every case here passes its own
 * scratch path, which is also why `createIterationStore(path)` takes one.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createIterationStore, defaultIterationStorePath, type IterationRow,
} from '../src/host/iteration-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-iteration-store-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One note, shaped the way the service stores one. */
const ROW: IterationRow = {
  id: 'it-1',
  at: '2026-10-03T02:00:00.000Z',
  kind: 'gap',
  severity: 'high',
  scene: '查一张单据的字段',
  symptom: '为了拿到表名绕了三步',
  suggestion: '直接给实体对应的物理表',
  target: 'wiki_lookup',
  context: 'wiki_lookup 传实体名返回空',
  status: 'open',
}

describe('createIterationStore', () => {
  it('round-trips a row', async () => {
    const path = join(await scratch(), 'nested', 'iteration.json')
    const store = createIterationStore(path)
    await store.write([ROW])
    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.path).toBe(path)
    expect(read.rows).toEqual([ROW])
    expect(read.skipped).toBe(0)
    expect(read.error).toBeUndefined()
  })

  it('answers an absent document with an empty list, not an error', async () => {
    const path = join(await scratch(), 'iteration.json')
    const read = await createIterationStore(path).read()
    expect(read.exists).toBe(false)
    expect(read.rows).toEqual([])
    expect(read.skipped).toBe(0)
    // "Nothing recorded yet" and "the file is broken" must not look alike, so the
    // empty case carries no error and the broken one does.
    expect(read.error).toBeUndefined()
  })

  it('leaves no temporary file behind', async () => {
    const dir = await scratch()
    const store = createIterationStore(join(dir, 'iteration.json'))
    await store.write([ROW])
    await store.write([ROW, { ...ROW, id: 'it-2' }])
    expect(await readdir(dir)).toEqual(['iteration.json'])
  })

  it('reports a document it cannot parse, and does not touch its bytes', async () => {
    const dir = await scratch()
    const path = join(dir, 'iteration.json')
    // A truncated write, or a hand edit that lost a brace.
    const broken = '{"rows": [{"id": "it-1", '
    await writeFile(path, broken, 'utf8')

    const read = await createIterationStore(path).read()
    expect(read.exists).toBe(true)
    expect(read.rows).toEqual([])
    expect(read.error).toContain(path)

    // The reader must not have rewritten anything: the operator's file is the only
    // copy, and a reader that normalised it would destroy what it could not parse.
    expect(await readFile(path, 'utf8')).toBe(broken)
  })

  it('reads through a byte-order mark', async () => {
    const path = join(await scratch(), 'iteration.json')
    await writeFile(path, `﻿${JSON.stringify({ rows: [ROW] })}`, 'utf8')
    const read = await createIterationStore(path).read()
    expect(read.rows).toEqual([ROW])
    expect(read.error).toBeUndefined()
  })

  it('drops one bad row and keeps the rest', async () => {
    const path = join(await scratch(), 'iteration.json')
    await writeFile(path, JSON.stringify({
      rows: [
        ROW,
        // No symptom: a row with nothing behind it cannot be acted on.
        { id: 'it-bad', kind: 'gap' },
        null,
        // An unknown status falls back rather than rejecting: the note survives.
        { ...ROW, id: 'it-2', status: 'nonsense' },
      ],
    }), 'utf8')

    const read = await createIterationStore(path).read()
    expect(read.rows.map(row => row.id)).toEqual(['it-1', 'it-2'])
    expect(read.rows[1]?.status).toBe('open')
    // Counted, not silently swallowed: unlike a dropped Home registration — which is
    // visible as a missing row — a dropped note is one the operator never knew about.
    expect(read.skipped).toBe(2)
  })

  it('serialises two writes made at once', async () => {
    const dir = await scratch()
    const store = createIterationStore(join(dir, 'iteration.json'))
    const second = { ...ROW, id: 'it-2' }
    // Both queued before either finishes. Without the chain they would interleave
    // into one of the two files rather than the second one.
    await Promise.all([store.write([ROW]), store.write([second])])
    const read = await store.read()
    expect(read.rows).toEqual([second])
    expect(await readdir(dir)).toEqual(['iteration.json'])
  })

  it('names the document it writes', () => {
    // Not the exact path — that depends on the operator's home directory — but the
    // two parts that decide whether the panel and the model are looking at one file.
    expect(defaultIterationStorePath().replace(/\\/g, '/')).toMatch(/\/\.dsh\/yon-panel\/iteration\.json$/)
  })
})
