/**
 * The probe's promises: it classifies a directory by what is in it, counts names
 * without opening anything, and answers a path it cannot read with a result
 * rather than a rejection.
 *
 * Every case builds its fixture in a scratch directory. The real installations on
 * this machine are deliberately not read: a case that asserts "237 modules" would
 * pass on one workstation and fail on the next, and the classification rules are
 * about shape, not about a particular tree.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeHome } from '../src/host/home-probe.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-home-probe-'))
  temporary.push(dir)
  return dir
}

/**
 * Create every path under a root.
 * @param root - the fixture root.
 * @param parts - each relative path to create as a directory.
 */
async function dirs(root: string, ...parts: string[]): Promise<void> {
  for (const part of parts) await mkdir(join(root, ...part.split('/')), { recursive: true })
}

/**
 * Create every file under a root.
 * @param root - the fixture root.
 * @param parts - each relative path to create, with one byte of content.
 */
async function files(root: string, ...parts: string[]): Promise<void> {
  for (const part of parts) {
    const full = join(root, ...part.split('/'))
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, 'x', 'utf8')
  }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('probeHome', () => {
  it('classifies an NCC installation by modules/ plus ierp/bin', async () => {
    const root = await scratch()
    await dirs(root, 'modules/aert/META-INF', 'modules/aert/METADATA', 'modules/aert/classes',
      'ierp/bin', 'resources', 'bin')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('ncc-home')
    expect(profile.modules).toBe(1)
    expect(profile.capped).toBe(false)
    expect(profile.warnings).toEqual([])
  })

  it('accepts bin/startup.* as the other half of an installation', async () => {
    const root = await scratch()
    await dirs(root, 'modules/aert', 'bin')
    await files(root, 'bin/startup.bat')
    // BIP ships without ierp/, and both products put their launcher in bin/.
    expect((await probeHome(root)).shape).toBe('ncc-home')
  })

  it('classifies modules/ without ierp/ or a launcher as a BIP installation', async () => {
    const root = await scratch()
    await dirs(root, 'modules/aert')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('bip-home')
    expect(profile.warnings.join()).toContain('BIP')
  })

  it('classifies a flat jar collection as such, and says what it cannot do', async () => {
    const root = await scratch()
    await dirs(root, 'iuap-core', 'iuap-meta')
    await files(root, 'iuap-core/a.jar', 'iuap-meta/b.jar')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('jar-collection')
    expect(profile.modules).toBe(0)
    expect(profile.jars).toBe(2)
    expect(profile.warnings.join()).toContain('.bmf')
  })

  it('counts jars at any depth, and skips a bundled JDK', async () => {
    const root = await scratch()
    await dirs(root, 'modules/a/lib', 'ufjdk/jre/lib')
    await files(root, 'modules/a/lib/one.jar', 'modules/a/deep/two.JAR', 'ufjdk/jre/lib/tools.jar')
    const profile = await probeHome(root)
    // Two claims, both of them about agreement rather than about jars. `two.JAR`
    // does not count because the match is case-sensitive — which is what
    // `class-index.ts:178` does when it decides which jars to index, and a probe
    // that counted one the index would skip would report a number the index
    // could not be built from. `ufjdk/` does not count because a bundled JDK is
    // not the installation's own code, the same exclusion the index makes.
    expect(profile.jars).toBe(1)
  })

  it('names the path in the warning when the directory cannot be read', async () => {
    const root = join(await scratch(), 'gone')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('not-found')
    expect(profile.keys.every(key => !key.exists)).toBe(true)
    expect(profile.warnings[0]).toContain(root)
  })

  it('says so when a directory is not an installation at all', async () => {
    const root = await scratch()
    await dirs(root, 'somewhere')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('not-found')
    expect(profile.warnings.join()).toContain('modules/')
  })

  it('answers the module subdirectories once any one module settles them', async () => {
    const root = await scratch()
    await dirs(root, 'modules/alpha/classes', 'modules/beta', 'ierp/bin')
    const profile = await probeHome(root)
    expect(profile.modules).toBe(2)
    const byRel = new Map(profile.keys.map(key => [key.rel, key.exists]))
    expect(byRel.get('modules/*/classes')).toBe(true)
    expect(byRel.get('modules/*/META-INF')).toBe(false)
    expect(byRel.get('modules/*/METADATA')).toBe(false)
  })

  it('reports the canonical paths it found, in display order', async () => {
    const root = await scratch()
    await dirs(root, 'modules/a', 'ierp/bin', 'resources')
    const profile = await probeHome(root)
    expect(profile.present).toEqual(['modules', 'ierp/bin', 'resources'])
    expect(profile.keys).toHaveLength(11)
    expect(profile.keys[0]?.role).toBe('模块根')
    expect(profile.keys[0]?.rel).toBe('modules')
  })

  it('never rejects, whatever the path holds', async () => {
    const root = await scratch()
    // A file where a directory is expected: every readdir under it fails.
    await files(root, 'modules')
    const profile = await probeHome(root)
    expect(profile.shape).toBe('not-found')
    expect(profile.probedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
