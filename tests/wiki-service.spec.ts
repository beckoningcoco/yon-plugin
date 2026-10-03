/**
 * The two calls that write a *registration*: `saveVault` and `removeVault`.
 *
 * Before this batch nothing on the knowledge-base surface wrote anything, and the
 * store's read was the only entry point — which is why two of these cases exist at
 * all. The store answers an unreadable document with an empty list, which is true
 * for "what is registered" and a lie for "what should I write back": a save reads
 * the list and writes it back, so one save over a document with a typo in it would
 * have replaced a repairable list with a single vault. That hole is closed here and
 * the case below is what holds it shut.
 *
 * Every case runs on a scratch store **and a scratch vault**: `list()` answers by
 * reading each registered vault's index, and materialising that index writes the
 * derived `wiki/.yon-index.json` **inside the vault**. So pointing any of this at a
 * real vault would be editing the operator's repository from a test — which is also
 * the reason the bench writes an empty document instead of leaving the file absent:
 * an absent document seeds itself from the guessed vaults, and those are real paths
 * on the machine running the tests.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWikiStore } from '../src/host/wiki-store.ts'
import { createYonWikiService, type YonWikiService } from '../src/host/wiki-service.ts'
import { createWikiUsageLog } from '../src/host/wiki-usage.ts'
import { wikiIndexPath } from '../src/host/wiki-index.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/** A scratch store, usage log and vault directory. */
interface Bench {
  readonly service: YonWikiService
  /** The store's document, for the cases that read what was actually written. */
  readonly configPath: string
  /** A directory that *is* a vault: it has `wiki/entities`. */
  readonly vault: string
  /** A directory that is not one, for the state the panel calls 路径不可用. */
  readonly empty: string
}

/**
 * Build the bench.
 * @returns the service and the three paths.
 */
async function bench(): Promise<Bench> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-service-'))
  temporary.push(dir)
  const configPath = join(dir, 'wiki_config.json')
  const store = createWikiStore(configPath)
  // An empty list rather than no file: a read of an absent document seeds the
  // guessed vaults, and those are real vaults on a machine that has them.
  await store.write([])
  const vault = join(dir, 'obsidian', 'yon-bip-obsidian')
  await mkdir(join(vault, 'wiki', 'entities'), { recursive: true })
  const empty = join(dir, 'not-a-vault')
  await mkdir(empty, { recursive: true })
  return {
    service: createYonWikiService(store, createWikiUsageLog(join(dir, 'usage.jsonl'))),
    configPath,
    vault,
    empty,
  }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('saveVault', () => {
  it('mints the id from the directory the registration points at', async () => {
    const { service } = await bench()
    const saved = await service.saveVault({ label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian' })
    // The id is what the model passes as `vault`, so it has to read as the thing it
    // names — and it is derived rather than typed, which is why an edit cannot move it.
    expect(saved.id).toBe('yon-bip-obsidian')
    expect(saved.label).toBe('BIP 知识库')
    expect(saved.path).toBe('D:/yon-bip-obsidian/yon-bip-obsidian')
  })

  it('stores the path the way both platforms spell it', async () => {
    const { service } = await bench()
    const saved = await service.saveVault({ label: 'NCC', path: 'D:\\yon-ncc-obsidian\\yon-ncc-obsidian\\' })
    // Backslashes and a trailing separator describe the same directory, and two
    // spellings of one directory would be two registrations of one vault.
    expect(saved.path).toBe('D:/yon-ncc-obsidian/yon-ncc-obsidian')
    await expect(service.saveVault({ label: 'again', path: 'D:/yon-ncc-obsidian/yon-ncc-obsidian' }))
      .rejects.toThrow(/已经登记过了/)
  })

  it('numbers a second vault whose directory slugs to the same id', async () => {
    const { service } = await bench()
    await service.saveVault({ label: '一号', path: 'D:/a/reports' })
    const second = await service.saveVault({ label: '二号', path: 'D:/b/reports' })
    // Two rows sharing one id are two rows where only the first can be edited or
    // removed, because every verb addresses a registration by id.
    expect(second.id).toBe('reports-2')
  })

  it('falls back to a usable id when the directory name has no ASCII in it', async () => {
    const { service } = await bench()
    const saved = await service.saveVault({ label: '中文名', path: 'D:/知识库/实体库' })
    // `WikiVault.id` is documented as `/^[a-zA-Z0-9_-]+$/` and is used as a record
    // key and a URL segment, so an all-Chinese directory cannot slug to nothing.
    expect(saved.id).toBe('vault')
    expect(saved.id).toMatch(/^[a-zA-Z0-9_-]+$/)
  })

  it('keeps the id when a registration is edited, and moves what it points at', async () => {
    const { service, empty } = await bench()
    const first = await service.saveVault({ label: '一号', path: 'D:/a/reports' })
    const moved = await service.saveVault({ label: '改过的名字', path: empty }, first.id)
    expect(moved.id).toBe('reports')
    // Stored with forward slashes whatever the platform's own separator is, which
    // is the same normalisation the case above covers from the other direction.
    expect(moved.path).toBe(empty.replace(/\\/g, '/'))
    expect(moved.label).toBe('改过的名字')
    // Edited in place: one row, not two.
    expect((await service.list()).map(vault => vault.id)).toEqual(['reports'])
  })

  it('refuses a path that is not absolute, saying what one looks like', async () => {
    const { service } = await bench()
    await expect(service.saveVault({ label: 'x', path: 'yon-bip-obsidian' }))
      .rejects.toThrow(/从盘符或 \/ 开始/)
  })

  it('refuses an empty path and an empty name', async () => {
    const { service } = await bench()
    await expect(service.saveVault({ label: 'x', path: '   ' })).rejects.toThrow(/路径不能为空/)
    await expect(service.saveVault({ label: '  ', path: 'D:/a/b' })).rejects.toThrow(/名称不能为空/)
  })

  it('refuses an id that is not registered, naming the ones that are', async () => {
    const { service } = await bench()
    await service.saveVault({ label: '一号', path: 'D:/a/reports' })
    await expect(service.saveVault({ label: '二号', path: 'D:/b/other' }, 'nope'))
      .rejects.toThrow(/没有登记这个知识库：nope。已登记：reports/)
  })

  it('refuses a second registration of one directory, naming the first', async () => {
    const { service } = await bench()
    await service.saveVault({ label: '一号', path: 'D:/a/reports' })
    await expect(service.saveVault({ label: '二号', path: 'D:/a/reports' }))
      .rejects.toThrow(/已经登记过了：「一号」（reports）/)
  })

  it('accepts a directory that is not a vault, and does not call it ready', async () => {
    const { service, empty } = await bench()
    const saved = await service.saveVault({ label: '以后再说', path: empty })
    // Not refused: a picked directory the operator named is a real registration,
    // and refusing it would leave them with nothing to fix. Not ready either —
    // the panel's row dims and the pane says which four layouts were looked for.
    expect(saved.ready).toBe(false)
    expect(saved.pages).toBe(0)
  })

  it('answers a vault with the same view the list builds', async () => {
    const { service, vault } = await bench()
    const saved = await service.saveVault({ label: '真 vault', path: vault })
    const listed = await service.list()
    expect(saved.ready).toBe(true)
    expect(listed[0]?.ready).toBe(true)
    expect(listed[0]?.pages).toBe(saved.pages)
    // Reading a vault is what materialises its index, and this is where that file
    // lands: inside the vault, next to the pages it describes.
    expect(await readFile(wikiIndexPath(vault), 'utf8')).toContain('"entities"')
  })

  it('writes both of two saves in flight, rather than the later one winning alone', async () => {
    const { service } = await bench()
    // Both rounds read the list before either writes unless the rounds are
    // serialised — and the loser then reports success while being gone.
    await Promise.all([
      service.saveVault({ label: '一号', path: 'D:/a/reports' }),
      service.saveVault({ label: '二号', path: 'D:/b/other' }),
    ])
    expect((await service.list()).map(vault => vault.id).sort()).toEqual(['other', 'reports'])
  })

  it('refuses to write over a document it could not read', async () => {
    const { service, configPath } = await bench()
    const broken = '{"vaults": [ {"id": "bip", } ]}\n'
    await writeFile(configPath, broken, 'utf8')
    await expect(service.saveVault({ label: '一号', path: 'D:/a/reports' }))
      .rejects.toThrow(/登记文件读不出来/)
    // The point of refusing: the file the operator can still repair is still there,
    // byte for byte. A save that "succeeded" here would have replaced it with one row.
    expect(await readFile(configPath, 'utf8')).toBe(broken)
  })
})

describe('removeVault', () => {
  it('takes the registration out of the document and leaves the vault alone', async () => {
    const { service, vault, configPath } = await bench()
    const saved = await service.saveVault({ label: '真 vault', path: vault })
    // Read it once so the derived index exists inside the vault before the removal:
    // the case is about what removal does *not* touch, and there has to be something
    // there for that to mean anything.
    await service.list()
    const index = wikiIndexPath(vault)

    await service.removeVault(saved.id)

    expect(await service.list()).toEqual([])
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({ vaults: [] })
    // Nothing inside somebody's Obsidian repository is this panel's to delete — not
    // the pages, and not the derived cache either. It costs a rebuild, not a loss.
    expect(await readFile(index, 'utf8')).toContain('"entities"')
  })

  it('refuses an id that is not registered', async () => {
    const { service } = await bench()
    await expect(service.removeVault('bip')).rejects.toThrow(/没有登记这个知识库：bip。已登记：/)
  })

  it('leaves the other registrations where they were', async () => {
    const { service } = await bench()
    await service.saveVault({ label: '一号', path: 'D:/a/reports' })
    const second = await service.saveVault({ label: '二号', path: 'D:/b/other' })
    await service.removeVault('reports')
    expect((await service.list()).map(vault => vault.id)).toEqual([second.id])
  })
})
