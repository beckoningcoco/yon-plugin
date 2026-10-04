/**
 * The two things the service decides rather than stores: **what a Home is called**
 * and **what its id is**.
 *
 * Neither is an input any more. A name is `<产品线><版本>` (`homeLabelOf`), because
 * two installations of the same version from two different projects describe the
 * same classes and are interchangeable for everything these registrations are used
 * for; asking for one would only be a second identity to invent for a row that
 * already has one. The id follows the same identity — `<产品线>-<版本>` — so the
 * string the model passes to `ncc_home_find` reads as the thing it names.
 *
 * The rules that live here and nowhere else:
 *
 *   · saving without any name produces one (nothing in the request carries it);
 *   · editing a row keeps its id, so the name cannot drift away from the identity;
 *   · a second registration of one version under one product line is refused, and
 *     the refusal names the row it clashed with — which is a *derived* name, and
 *     therefore the one place a missing derivation would surface as `undefined`.
 *
 * A scratch store **and a scratch skills tree** in every case: `save` mirrors into
 * the skills' own registry, and pointing that at the operator's real
 * `~/.claude/skills` from a test would be editing the toolchain the test is about.
 * Hence the second parameter of `createYonHomesService`.
 */
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHomeStore } from '../src/host/home-store.ts'
import { createYonHomesService } from '../src/host/home-service.ts'
import { mirrorPathOf } from '../src/host/home-mirror.ts'
import { homeLabelOf } from '../src/shared/types.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * A scratch store plus the skills tree its mirror writes into.
 * @returns the service over them, and the two paths.
 */
async function bench() {
  const dir = await mkdtemp(join(tmpdir(), 'yon-home-service-'))
  temporary.push(dir)
  const skillsRoot = join(dir, 'skills')
  await mkdir(join(skillsRoot, 'ncc-asset-hawk'), { recursive: true })
  const store = createHomeStore(join(dir, 'home_config.json'))
  return { service: createYonHomesService(store, skillsRoot).service, store, skillsRoot, dir }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('homeLabelOf', () => {
  it('names a version the table knows after the entry the dropdown shows', () => {
    expect(homeLabelOf('ncc', '2111')).toBe('NCC2111')
    expect(homeLabelOf('bip', 'V5')).toBe('BIP V5')
  })

  it('still names a version that shipped after this table was written', () => {
    // A version reached through the form's 「其他」 escape has no entry to copy, and
    // it must still get a name: the row is registrable, so it is nameable.
    expect(homeLabelOf('ncc', '2405')).toBe('NCC2405')
    expect(homeLabelOf('bip', 'V9')).toBe('BIPV9')
  })
})

describe('createYonHomesService naming', () => {
  it('derives the name from the product line and the version', async () => {
    const { service } = await bench()
    const saved = await service.save({ path: 'E:/NCProject/NCC/jixieyuan/home', product: 'ncc', version: '2111' })
    expect(saved.label).toBe('NCC2111')
    // The id is the same identity spelled for a machine, which is what makes
    // `ncc_home_find`'s `home` argument readable at the call site.
    expect(saved.id).toBe('ncc-2111')
  })

  it('names a BIP registration from the BIP table', async () => {
    const { service } = await bench()
    const saved = await service.save({ path: 'C:/YonBIP/v5/home', product: 'bip', version: 'V5' })
    expect(saved.label).toBe('BIP V5')
    expect(saved.id).toBe('bip-v5')
  })

  it('keeps the id when a registration is edited', async () => {
    const { service } = await bench()
    const first = await service.save({ path: 'E:/a/home', product: 'ncc', version: '2111' })
    const moved = await service.save({ path: 'E:/b/home', product: 'ncc', version: '2111' }, first.id)
    // The path changed; which registration it is did not. An id that moved with the
    // path would break any conversation already holding the old one.
    expect(moved.id).toBe('ncc-2111')
    expect(moved.path).toBe('E:/b/home')
  })

  it('refuses a second registration of one version under one product line, naming the first', async () => {
    const { service } = await bench()
    await service.save({ path: 'E:/a/home', product: 'ncc', version: '2111' })
    // The name in this message is derived, so a derivation that stopped working
    // would not fail loudly — it would print `undefined` at the operator. This is
    // the assertion that catches that.
    await expect(service.save({ path: 'E:/b/home', product: 'ncc', version: '2111' }))
      .rejects.toThrow(/已经由「NCC2111」登记过了/)
  })

  it('allows the same version number under the other product line', async () => {
    const { service } = await bench()
    await service.save({ path: 'E:/a/home', product: 'ncc', version: '2111' })
    // The skills-side files are per product line, so `2111` under BIP is a
    // different entry in a different file — not a clash with the NCC one.
    const other = await service.save({ path: 'C:/YonBIP/home', product: 'bip', version: '2111' })
    expect(other.id).toBe('bip-2111')
    expect(other.label).toBe('BIP2111')
  })

  it('reads the name back out of a stored entry whose version was hand-edited', async () => {
    const { service, store, skillsRoot } = await bench()
    await service.save({ path: 'E:/a/home', product: 'ncc', version: '2111' })
    const written = await store.read()
    // Somebody edited the document by hand. Nothing needs migrating and no stored
    // name can go stale, because there is no stored name — the surface computes it
    // from the two fields on every read.
    await store.write(written.homes.map(home => ({ ...home, version: '2312' })))
    const listed = await service.list()
    expect(listed.homes[0]?.label).toBe('NCC2312')
    expect(listed.homes[0]?.id).toBe('ncc-2111')
    // The mirror still points at the injected tree, so `list` names the file the
    // service actually writes rather than the operator's.
    expect(listed.mirrorPath).toBe(mirrorPathOf('ncc', skillsRoot))
  })

  it('mirrors the registration into the skills tree it was given', async () => {
    const { service, skillsRoot } = await bench()
    await service.save({ path: 'E:/a/home', product: 'ncc', version: '2111' })
    const text = await readFile(mirrorPathOf('ncc', skillsRoot), 'utf8')
    const document = JSON.parse(text) as { default_version: string; versions: Record<string, { path: string }> }
    expect(document.default_version).toBe('2111')
    expect(document.versions['2111']?.path).toBe('E:/a/home')
  })

  it('leaves the metadata index off a row whose version has none', async () => {
    // Only the negative half is assertable from here: `viewOf` reads the stored indexes
    // out of the operator's own knowledge directory, which this spec has no seam into —
    // the same place `listClassIndexes` already reads, and for the same reason (there is
    // one shared directory per machine, keyed by version). So the version is one no
    // index can be stored under, and the positive half is covered where an index is
    // written: `meta-index.spec.ts` for the storage, the panel and tool fixtures for
    // what is drawn from it.
    const { service } = await bench()
    const saved = await service.save({ path: 'E:/a/home', product: 'ncc', version: 'zz-meta-spec' })
    expect('meta' in saved).toBe(false)
    const listed = await service.list()
    expect(listed.homes[0]?.meta).toBeUndefined()
  })
})
