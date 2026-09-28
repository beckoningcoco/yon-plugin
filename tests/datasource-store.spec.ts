/**
 * The store's promises: a write is atomic and self-contained, and a document
 * that exists but cannot be parsed is reported rather than replaced.
 *
 * The seeding path is deliberately not exercised here: it reads a fixed legacy
 * location in the operator's home directory, so a spec that covered it would
 * pass or fail according to what happens to be installed on the machine running
 * it. That path is covered by the store's own integration behaviour instead.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDataSourceStore } from '../src/host/datasource-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-datasource-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A document shaped the way the query script stores one. */
const DOCUMENT = {
  projects: {
    X: {
      type: 'oracle',
      test: { host: '10.0.0.1', port: 1521, service_name: 'ORCL', users: { U: 'secret' } },
    },
  },
}

describe('createDataSourceStore', () => {
  it('round-trips a document', async () => {
    const path = join(await scratch(), 'nested', 'db_config.json')
    const store = createDataSourceStore(path)
    await store.write(DOCUMENT)
    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.path).toBe(path)
    expect(read.config).toEqual(DOCUMENT)
  })

  it('creates the directory and leaves no temporary sibling behind', async () => {
    const dir = await scratch()
    const parent = join(dir, 'deep', 'deeper')
    await createDataSourceStore(join(parent, 'db_config.json')).write(DOCUMENT)
    expect(await readdir(parent)).toEqual(['db_config.json'])
  })

  it('writes parseable JSON that ends in a newline', async () => {
    const path = join(await scratch(), 'db_config.json')
    await createDataSourceStore(path).write(DOCUMENT)
    const text = await readFile(path, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(DOCUMENT)
  })

  it('reports an unparseable document instead of overwriting it', async () => {
    const path = join(await scratch(), 'db_config.json')
    await writeFile(path, '{ not json', 'utf8')
    const read = await createDataSourceStore(path).read()
    expect(read.exists).toBe(true)
    expect(read.error).toBeDefined()
    expect(read.config).toEqual({})
    // Still untouched: the operator's own edits are theirs to fix, not ours to
    // discard because a parser disagreed with them.
    expect(await readFile(path, 'utf8')).toBe('{ not json')
  })

  it('serialises concurrent writes instead of interleaving them', async () => {
    const path = join(await scratch(), 'db_config.json')
    const store = createDataSourceStore(path)
    await Promise.all([
      store.write({ projects: { A: { type: 'oracle' } } }),
      store.write({ projects: { B: { type: 'mysql' } } }),
    ])
    const read = await store.read()
    // Either document may win, but a half of each would be a corrupted file.
    expect(Object.keys(read.config.projects ?? {})).toHaveLength(1)
  })

  it('keeps a rejection from poisoning the writes that follow it', async () => {
    const path = join(await scratch(), 'db_config.json')
    const store = createDataSourceStore(path)
    // A payload JSON cannot carry: the write must fail...
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(store.write(circular as never)).rejects.toThrow()
    // ...and the queue must still accept the next one.
    await store.write(DOCUMENT)
    expect((await store.read()).config).toEqual(DOCUMENT)
  })
})
