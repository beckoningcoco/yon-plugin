/**
 * The registration document's promises: a write is atomic and self-contained, a
 * document that exists but cannot be parsed is reported rather than replaced, and
 * one bad entry costs that entry rather than every registration.
 *
 * What is deliberately not exercised: the default path. It reads the operator's
 * own home directory, so a case covering it would pass or fail according to what
 * happens to be registered on the machine running it. Every case here passes its
 * own scratch path, which is also why `createHomeStore(path)` takes one.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHomeStore, defaultHomeStorePath, type StoredHome } from '../src/host/home-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-home-store-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One registration, shaped the way the panel stores one. */
const HOME: StoredHome = {
  id: 'ncc-2111',
  path: 'E:/NCProject/NCC/jixieyuan/home',
  product: 'ncc',
  version: '2111',
  isDefault: true,
}

describe('createHomeStore', () => {
  it('round-trips a registration', async () => {
    const path = join(await scratch(), 'nested', 'home_config.json')
    const store = createHomeStore(path)
    await store.write([HOME])
    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.path).toBe(path)
    expect(read.homes).toEqual([HOME])
    expect(read.error).toBeUndefined()
  })

  it('answers an absent document with an empty list, not an error', async () => {
    const path = join(await scratch(), 'home_config.json')
    const read = await createHomeStore(path).read()
    expect(read.exists).toBe(false)
    expect(read.homes).toEqual([])
    // "Nothing registered yet" and "the file is broken" must not look alike, so
    // only the second one carries a message.
    expect(read.error).toBeUndefined()
  })

  it('creates the directory and leaves no temporary sibling behind', async () => {
    const dir = await scratch()
    const parent = join(dir, 'deep', 'deeper')
    await createHomeStore(join(parent, 'home_config.json')).write([HOME])
    expect(await readdir(parent)).toEqual(['home_config.json'])
  })

  it('writes parseable JSON that ends in a newline', async () => {
    const path = join(await scratch(), 'home_config.json')
    await createHomeStore(path).write([HOME])
    const text = await readFile(path, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({ homes: [HOME] })
  })

  it('reports an unparseable document instead of overwriting it', async () => {
    const path = join(await scratch(), 'home_config.json')
    await writeFile(path, '{ not json', 'utf8')
    const read = await createHomeStore(path).read()
    expect(read.exists).toBe(true)
    expect(read.error).toContain(path)
    expect(read.homes).toEqual([])
    // Still untouched: the operator's own edits are theirs to fix, not ours to
    // discard because a parser disagreed with them.
    expect(await readFile(path, 'utf8')).toBe('{ not json')
  })

  it('reads a file that a hand-edit left a BOM on', async () => {
    const path = join(await scratch(), 'home_config.json')
    // The writer never emits one; an editor that adds it would otherwise make the
    // whole document unreadable, which is the one thing this file may not do.
    await writeFile(path, `\uFEFF${JSON.stringify({ homes: [HOME] })}`, 'utf8')
    const read = await createHomeStore(path).read()
    expect(read.error).toBeUndefined()
    expect(read.homes).toEqual([HOME])
  })

  it('skips a bad entry and keeps the rest', async () => {
    const path = join(await scratch(), 'home_config.json')
    const other = { ...HOME, id: 'ncc-2312', version: '2312', isDefault: false }
    await writeFile(path, JSON.stringify({
      homes: [HOME, { path: '/no/id' }, { id: 'no-path' }, other],
    }), 'utf8')
    const read = await createHomeStore(path).read()
    expect(read.homes.map(home => home.id)).toEqual([HOME.id, other.id])
  })

  it('fills in what a hand-written entry left out', async () => {
    const path = join(await scratch(), 'home_config.json')
    await writeFile(path, JSON.stringify({ homes: [{ id: 'x', path: 'E:/h' }] }), 'utf8')
    const read = await createHomeStore(path).read()
    // No `label` here at all: the name is not stored, it is derived from the two
    // fields below every time somebody reads the entry (`homeLabelOf`). So what a
    // hand-written line needs filled in is the version and the product line.
    expect(read.homes[0]?.version).toBe('')
    expect(read.homes[0]?.product).toBe('ncc')
    expect(read.homes[0]?.isDefault).toBe(false)
    expect(read.homes[0]).not.toHaveProperty('label')
  })

  it('serialises concurrent writes instead of interleaving them', async () => {
    const path = join(await scratch(), 'home_config.json')
    const store = createHomeStore(path)
    await Promise.all([
      store.write([HOME]),
      store.write([{ ...HOME, id: 'other' }]),
    ])
    const read = await store.read()
    // Either write may win, but half of each would be a corrupted document.
    expect(read.homes).toHaveLength(1)
  })

  it('snapshots the array at call time, not at write time', async () => {
    const path = join(await scratch(), 'home_config.json')
    const store = createHomeStore(path)
    const homes: StoredHome[] = [HOME]
    const pending = store.write(homes)
    homes.push({ ...HOME, id: 'late' })
    await pending
    // The caller's later edit must not reach a write that was already asked for.
    expect((await store.read()).homes.map(home => home.id)).toEqual([HOME.id])
  })

  it('keeps a rejection from poisoning the writes that follow it', async () => {
    const path = join(await scratch(), 'home_config.json')
    const store = createHomeStore(path)
    // A payload JSON cannot carry: the write must fail...
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(store.write([circular as never])).rejects.toThrow()
    // ...and the queue must still accept the next one.
    await store.write([HOME])
    expect((await store.read()).homes).toEqual([HOME])
  })
})

describe('defaultHomeStorePath', () => {
  it('names the document under the operator DSH directory', () => {
    expect(defaultHomeStorePath().replace(/\\/g, '/')).toContain('/.dsh/yon-panel/home_config.json')
  })
})
