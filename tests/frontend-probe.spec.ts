/**
 * The front-end probe's promises: it tells a source project from a deployed
 * bundle, counts page entries along the one convention this scaffold uses, and
 * answers a path it cannot read with a result rather than a rejection.
 *
 * Every case builds its fixture in a scratch directory. The real projects on this
 * machine are deliberately not read: a case that asserts "315 pages" would pass on
 * one workstation and fail on the next, and the classification rules are about
 * shape, not about a particular tree.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeFrontend } from '../src/host/frontend-probe.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-probe-'))
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
 * @param parts - each relative path; content is one byte unless a size is given.
 */
async function files(root: string, ...parts: string[]): Promise<void> {
  for (const part of parts) {
    const full = join(root, ...part.split('/'))
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, 'x', 'utf8')
  }
}

/** Write a file of `size` bytes, so a size share can be asserted. */
async function big(root: string, rel: string, size: number): Promise<void> {
  const full = join(root, ...rel.split('/'))
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, Buffer.alloc(size))
}

/** The build config the reference project carries, trimmed to what is read. */
const CONFIG = JSON.stringify({
  buildEntryPath: ['./src/cmp/bank/bankcontrast_tzwy/*/index.js'],
  proxy: 'http://127.0.0.1:8083',
  devPort: 3006,
  buildWithoutHTML: ['uapbd/refer'],
})

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('probeFrontend', () => {
  it('classifies a src/ plus config.json tree as a source project', async () => {
    const root = await scratch()
    await dirs(root, 'src/cmp/bank/node/list', 'src/cmp/bank/node/card', 'config')
    await files(root, 'src/cmp/bank/node/list/index.js', 'src/cmp/bank/node/card/index.js',
      'src/cmp/bank/node/list/events/save.js', 'config.json', 'package.json')
    await writeFile(join(root, 'config.json'), CONFIG, 'utf8')
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'nc-multipage-demo' }), 'utf8')

    const profile = await probeFrontend(root)

    expect(profile.shape).toBe('scaffold')
    // Two entries, one node: `list` and `card` are two builds of the same page,
    // and the operator's question ("which functions does this cover") is about
    // the node.
    expect(profile.pages).toBe(2)
    expect(profile.nodes).toBe(1)
    expect(profile.pageTypes).toEqual(['card', 'list'])
    expect(profile.domains.map(domain => domain.name)).toEqual(['cmp'])
    expect(profile.buildEntry).toEqual(['./src/cmp/bank/bankcontrast_tzwy/*/index.js'])
    expect(profile.proxy).toBe('http://127.0.0.1:8083')
    expect(profile.devPort).toBe(3006)
    expect(profile.packageName).toBe('nc-multipage-demo')
    expect(profile.capped).toBe(false)
  })

  it('calls an installation hotwebs a deployed bundle, not source', async () => {
    const root = await scratch()
    await dirs(root, 'nccloud/resources/cmp/bank')
    await files(root, 'nccloud/resources/cmp/bank/index.js')
    const profile = await probeFrontend(root)
    // The distinction this whole feature rests on: the installation ships compiled
    // pages in exactly this shape, and reading them as source would hand the model
    // minified files and let it believe it is looking at the code.
    expect(profile.shape).toBe('deployed')
    expect(profile.pages).toBe(0)
    expect(profile.warnings.join()).toContain('部署产物')
  })

  it('points at hotwebs/ when the operator picked the project folder above it', async () => {
    const root = await scratch()
    await dirs(root, 'hotwebs/src/cmp/bank/node/list')
    await files(root, 'hotwebs/src/cmp/bank/node/list/index.js', 'hotwebs/config.json')
    const profile = await probeFrontend(root)
    expect(profile.shape).toBe('not-a-project')
    expect(profile.warnings.join()).toContain('hotwebs/')
  })

  it('counts page entries at four levels under src/ and nothing shallower', async () => {
    const root = await scratch()
    await dirs(root, 'src/a/b/c/list', 'src/a/b/c/card', 'src/a/b/c')
    await files(root, 'src/a/b/c/list/index.js', 'src/a/b/c/card/index.js',
      // Three levels under src/: a module's own index, not a page entry.
      'src/a/b/c/index.js')
    await writeFile(join(root, 'config.json'), '{}', 'utf8')
    const profile = await probeFrontend(root)
    expect(profile.pages).toBe(2)
    expect(profile.nodes).toBe(1)
  })

  it('skips node_modules/ and dist/ when counting, and says it did', async () => {
    const root = await scratch()
    await dirs(root, 'src/cmp/bank/node/list', 'node_modules/react', 'dist/cmp')
    await files(root, 'src/cmp/bank/node/list/index.js', 'node_modules/react/index.js', 'dist/cmp/index.js')
    await writeFile(join(root, 'config.json'), '{}', 'utf8')
    const profile = await probeFrontend(root)
    expect(profile.files).toBe(2)
    expect(profile.hasNodeModules).toBe(true)
    expect(profile.hasDist).toBe(true)
    expect(profile.warnings.join()).toContain('node_modules')
  })

  it('says when src/platform/ is most of the project', async () => {
    const root = await scratch()
    await dirs(root, 'src/cmp/bank/node/list', 'src/platform')
    await files(root, 'src/cmp/bank/node/list/index.js')
    await big(root, 'src/platform/react.js', 4096)
    await writeFile(join(root, 'config.json'), '{}', 'utf8')
    const profile = await probeFrontend(root)
    expect(profile.warnings.join()).toContain('src/platform')
    expect(profile.domains.find(domain => domain.name === 'platform')?.bytes).toBe(4096)
  })

  it('says so when buildEntryPath names only one page', async () => {
    const root = await scratch()
    await dirs(root, 'src/cmp/bank/node/list')
    await files(root, 'src/cmp/bank/node/list/index.js')
    await writeFile(join(root, 'config.json'), CONFIG, 'utf8')
    const profile = await probeFrontend(root)
    // The single most expensive switch in this scaffold: once it names a page, the
    // rest are not compiled at all, and "改了没生效" is usually this line.
    expect(profile.warnings.join()).toContain('buildEntryPath')
  })

  it('names the path in the warning when the directory cannot be read', async () => {
    const root = join(await scratch(), 'gone')
    const profile = await probeFrontend(root)
    expect(profile.shape).toBe('not-found')
    expect(profile.warnings[0]).toContain(root)
  })

  it('never rejects, whatever the path holds', async () => {
    const root = await scratch()
    // A file where a directory is expected: every readdir under it fails.
    await files(root, 'src')
    const profile = await probeFrontend(root)
    expect(profile.shape).toBe('not-a-project')
    expect(profile.probedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
