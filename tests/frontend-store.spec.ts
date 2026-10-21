/**
 * The front-end registration document's promises, which are `home-store.ts`'s:
 * a write is atomic, a document that cannot be parsed is reported rather than
 * replaced, and one bad entry costs that entry rather than every registration.
 *
 * One rule is this document's own: a row whose `product` is not `ncc` is dropped.
 * The probe rules for another product line are not implemented here, so reading
 * such a row as NCC would be silently answering a question about the wrong thing.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFrontendStore, defaultFrontendStorePath, type StoredFrontend } from '../src/host/frontend-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-store-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One registration, shaped the way the panel stores one. */
const FRONTEND: StoredFrontend = {
  id: 'fe-ncc-2005',
  path: 'E:/NCProject/NCC2005/touziwuye/hotwebs',
  product: 'ncc',
  version: '2005',
  isDefault: true,
}

describe('createFrontendStore', () => {
  it('round-trips a registration', async () => {
    const path = join(await scratch(), 'nested', 'frontend_config.json')
    const store = createFrontendStore(path)
    await store.write([FRONTEND])
    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.frontends).toEqual([FRONTEND])
    expect(read.error).toBeUndefined()
  })

  it('answers an absent document with an empty list, not an error', async () => {
    const read = await createFrontendStore(join(await scratch(), 'frontend_config.json')).read()
    expect(read.exists).toBe(false)
    expect(read.frontends).toEqual([])
    expect(read.error).toBeUndefined()
  })

  it('creates the directory and leaves no temporary sibling behind', async () => {
    const dir = await scratch()
    const parent = join(dir, 'deep', 'deeper')
    await createFrontendStore(join(parent, 'frontend_config.json')).write([FRONTEND])
    expect(await readdir(parent)).toEqual(['frontend_config.json'])
  })

  it('writes parseable JSON that ends in a newline', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    await createFrontendStore(path).write([FRONTEND])
    const text = await readFile(path, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({ frontends: [FRONTEND] })
  })

  it('reports an unparseable document instead of overwriting it', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    await writeFile(path, '{ not json', 'utf8')
    const read = await createFrontendStore(path).read()
    expect(read.exists).toBe(true)
    expect(read.error).toContain(path)
    expect(read.frontends).toEqual([])
    expect(await readFile(path, 'utf8')).toBe('{ not json')
  })

  it('reads a file that a hand-edit left a BOM on', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    await writeFile(path, `\uFEFF${JSON.stringify({ frontends: [FRONTEND] })}`, 'utf8')
    const read = await createFrontendStore(path).read()
    expect(read.error).toBeUndefined()
    expect(read.frontends).toEqual([FRONTEND])
  })

  it('skips a bad entry and keeps the rest', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    const other = { ...FRONTEND, id: 'fe-ncc-1909', version: '1909', isDefault: false }
    await writeFile(path, JSON.stringify({
      frontends: [FRONTEND, { path: '/no/id' }, { id: 'no-path' }, other],
    }), 'utf8')
    const read = await createFrontendStore(path).read()
    expect(read.frontends.map(row => row.id)).toEqual([FRONTEND.id, other.id])
  })

  it('drops a row that names a product line this build does not implement', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    await writeFile(path, JSON.stringify({
      frontends: [FRONTEND, { id: 'fe-bip-v5', path: 'C:/YonBIP', product: 'bip', version: 'V5' }],
    }), 'utf8')
    const read = await createFrontendStore(path).read()
    // Reading it as NCC would answer a question about the wrong product line.
    expect(read.frontends.map(row => row.id)).toEqual([FRONTEND.id])
  })

  it('serialises concurrent writes instead of interleaving them', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    const store = createFrontendStore(path)
    await Promise.all([
      store.write([FRONTEND]),
      store.write([{ ...FRONTEND, id: 'fe-ncc-1909' }]),
    ])
    expect((await store.read()).frontends).toHaveLength(1)
  })

  it('snapshots the array at call time, not at write time', async () => {
    const path = join(await scratch(), 'frontend_config.json')
    const store = createFrontendStore(path)
    const frontends: StoredFrontend[] = [FRONTEND]
    const pending = store.write(frontends)
    frontends.push({ ...FRONTEND, id: 'late' })
    await pending
    expect((await store.read()).frontends.map(row => row.id)).toEqual([FRONTEND.id])
  })
})

describe('defaultFrontendStorePath', () => {
  it('names the document under the operator DSH directory', () => {
    expect(defaultFrontendStorePath().replace(/\\/g, '/')).toContain('/.dsh/yon-panel/frontend_config.json')
  })
})
