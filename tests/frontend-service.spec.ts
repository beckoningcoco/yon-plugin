/**
 * What the front-end service decides rather than stores: **what a project is
 * called**, **what its id is**, and **which version may own which directory**.
 *
 * The one rule that spans more than this file is the last: one version is one
 * source project. The operator asked for it explicitly, and the refusal names the
 * row it clashed with — which is a derived name, so a case here is also the check
 * that the derivation still works.
 *
 * A scratch store in every case: the default path is the operator's own document,
 * and a test writing that would be editing the machine it runs on.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFrontendStore } from '../src/host/frontend-store.ts'
import { createYonFrontendsService } from '../src/host/frontend-service.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/**
 * A scratch project plus the service over a scratch store.
 *
 * The project is a minimal real shape: `src/` with two page entries, one file
 * under `src/platform/`, and a `config.json` — enough for the probe to classify
 * it and enough for `find` to prove what it skips.
 */
async function bench() {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-service-'))
  temporary.push(dir)
  const root = join(dir, 'hotwebs')
  await mkdir(join(root, 'src', 'cmp', 'bank', 'node', 'list'), { recursive: true })
  await mkdir(join(root, 'src', 'platform'), { recursive: true })
  await writeFile(join(root, 'src', 'cmp', 'bank', 'node', 'list', 'index.js'),
    '// 页面入口\nimport React from "react";\n', 'utf8')
  await writeFile(join(root, 'src', 'platform', 'react.js'), '// runtime library\n', 'utf8')
  await writeFile(join(root, 'config.json'), JSON.stringify({ buildEntryPath: ['./src/**/*/index.js'] }), 'utf8')
  await writeFile(join(root, 'config.properties'), 'db.host=10.0.0.9\nclient_secret=abc1234567890\n', 'utf8')

  const store = createFrontendStore(join(dir, 'frontend_config.json'))
  return {
    service: createYonFrontendsService(store, join(dir, 'index')).service,
    store,
    dir,
    root,
    path: root.replace(/\\/g, '/'),
  }
}

describe('createYonFrontendsService naming', () => {
  it('derives the name and id from the product line and the version', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    expect(saved.label).toBe('NCC2005')
    // The `fe-` prefix is what makes an id from ncc_home_list visibly the wrong
    // argument here, instead of silently pointing at an installation directory.
    expect(saved.id).toBe('fe-ncc-2005')
  })

  it('keeps the id when a registration is edited', async () => {
    const { service, path, dir } = await bench()
    const first = await service.save({ path, product: 'ncc', version: '2005' })
    const moved = await service.save({ path: join(dir, 'hotwebs2').replace(/\\/g, '/'), product: 'ncc', version: '2005' }, first.id)
    // The path changed; which registration it is did not. An id that moved with
    // the path would break any conversation already holding the old one.
    expect(moved.id).toBe('fe-ncc-2005')
  })

  it('refuses a second registration of one version, naming the first', async () => {
    const { service, path, dir } = await bench()
    await service.save({ path, product: 'ncc', version: '2005' })
    await expect(service.save({ path: `${dir}/other`, product: 'ncc', version: '2005' }))
      .rejects.toThrow(/已经由「NCC2005」登记过了/)
  })

  it('refuses a relative path', async () => {
    const { service } = await bench()
    await expect(service.save({ path: 'hotwebs', product: 'ncc', version: '2005' }))
      .rejects.toThrow(/从盘符或 \//)
  })

  it('refuses another product line instead of reading it as NCC', async () => {
    const { service, path } = await bench()
    await expect(service.save({ path, product: 'bip' as never, version: 'V5' }))
      .rejects.toThrow(/只支持 NCC/)
  })

  it('refuses an empty version', async () => {
    const { service, path } = await bench()
    await expect(service.save({ path, product: 'ncc', version: '  ' }))
      .rejects.toThrow(/版本不能为空/)
  })

  it('promotes the first survivor when the default is removed', async () => {
    const { service, path, dir } = await bench()
    const first = await service.save({ path, product: 'ncc', version: '2005' })
    const second = await service.save({ path: join(dir, 'hotwebs').replace(/\\/g, '/'), product: 'ncc', version: '1909' })
    expect(second.isDefault).toBe(false)
    await service.remove(first.id)
    const listed = await service.list()
    // A list with no default has no answer for "which source", so the first
    // survivor takes over — exactly as the Home list does.
    expect(listed.frontends.map(row => [row.version, row.isDefault])).toEqual([['1909', true]])
  })

  it('moves the default without touching any other row', async () => {
    const { service, path, dir } = await bench()
    const first = await service.save({ path, product: 'ncc', version: '2005' })
    const second = await service.save({ path: join(dir, 'hotwebs').replace(/\\/g, '/'), product: 'ncc', version: '1909' })
    await service.setDefault(second.id)
    const listed = await service.list()
    expect(listed.frontends.find(row => row.id === first.id)?.isDefault).toBe(false)
    expect(listed.frontends.find(row => row.id === second.id)?.isDefault).toBe(true)
  })
})

describe('createYonFrontendsService probing and reading', () => {
  it('probes on save, so the list already knows what the directory is', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    expect(saved.profile?.shape).toBe('scaffold')
    expect(saved.profile?.pages).toBe(1)
    expect(saved.ready).toBe(true)
  })

  it('finds files, skipping the runtime library', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    const index = await service.find(saved.id, { name: 'index.js', limit: 10 })
    expect(index.matches.map(match => match.rel)).toContain('src/cmp/bank/node/list/index.js')
    expect(index.skipped).toContain('src/platform')

    // `src/platform/` is the runtime library, not business code: a search that
    // returned it would bury the page sources under 65 MB of react.
    const runtime = await service.find(saved.id, { name: 'react', limit: 10 })
    expect(runtime.matches).toEqual([])
  })

  it('refuses a path that escapes the registered root', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    await expect(service.find(saved.id, { under: '..', name: 'index.js' }))
      .rejects.toThrow()
  })

  it('reads a file and masks a secret value', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    const read = await service.read(saved.id, 'config.properties', {})
    expect(read.encoding).toBe('utf-8')
    expect(read.text).toContain('db.host=10.0.0.9')
    expect(read.text).not.toContain('abc1234567890')
    expect(read.masked).toContain('client_secret')
  })

  it('reads a GBK source file as GBK', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    // "中文" in GBK, spelled as bytes because a UTF-8 fixture would pass against
    // a reader that never left UTF-8.
    await writeFile(join(path, 'src', 'cmp', 'bank', 'node', 'list', 'gbk.js'),
      Buffer.from([0xD6, 0xD0, 0xCE, 0xC4]))
    const read = await service.read(saved.id, 'src/cmp/bank/node/list/gbk.js', {})
    expect(read.encoding).toBe('gb18030')
    expect(read.text).toContain('中文')
  })

  it('names the registrations when an unknown id is asked for', async () => {
    const { service, path } = await bench()
    await service.save({ path, product: 'ncc', version: '2005' })
    await expect(service.read('fe-ncc-9999', 'x.js', {}))
      .rejects.toThrow(/没有登记这个前端源码工程：fe-ncc-9999.*fe-ncc-2005/)
  })

  it('re-probes in place and stores the result', async () => {
    const { service, path, root } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    await mkdir(join(root, 'src', 'gl', 'voucher', 'v', 'card'), { recursive: true })
    await writeFile(join(root, 'src', 'gl', 'voucher', 'v', 'card', 'index.js'), '// x', 'utf8')
    const probed = await service.probe(saved.id)
    expect(probed.profile?.pages).toBe(2)
    const listed = await service.list()
    expect(listed.frontends[0]?.profile?.pages).toBe(2)
  })
})

describe('createYonFrontendsService page index', () => {
  it('builds the index lazily on the first ask, then serves it', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    expect(await service.pageStatus(saved.id)).toBeUndefined()

    const tree = await service.pages(saved.id)
    expect(tree.totalNodes).toBe(1)
    expect(tree.totalPages).toBe(1)
    expect(tree.nodes[0]?.dir).toBe('src/cmp/bank/node')

    // The second ask reads the stored document rather than walking again; the
    // `builtAt` it was stored with is what it keeps.
    const again = await service.pages(saved.id)
    expect(again.builtAt).toBe(tree.builtAt)
    expect((await service.pageStatus(saved.id))?.nodes).toBe(1)
  })

  it('filters nodes by term and by domain/module/node', async () => {
    const { service, path, root } = await bench()
    await mkdir(join(root, 'src', 'gl', 'voucher', 'v', 'card'), { recursive: true })
    await writeFile(join(root, 'src', 'gl', 'voucher', 'v', 'card', 'index.js'), '// x', 'utf8')
    const saved = await service.save({ path, product: 'ncc', version: '2005' })

    expect((await service.pages(saved.id, { term: 'voucher' })).nodes.map(node => node.dir))
      .toEqual(['src/gl/voucher/v'])
    expect((await service.pages(saved.id, { domain: 'cmp' })).matched).toBe(1)
    expect((await service.pages(saved.id, { domain: 'nope' })).matched).toBe(0)
    // A term matching nothing is an empty answer, not an error.
    expect((await service.pages(saved.id, { term: 'zzz' })).nodes).toEqual([])
  })

  it('rebuilds on demand and reports the fresh status', async () => {
    const { service, path, root } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    await mkdir(join(root, 'src', 'gl', 'voucher', 'v', 'card'), { recursive: true })
    await writeFile(join(root, 'src', 'gl', 'voucher', 'v', 'card', 'index.js'), '// x', 'utf8')

    const status = await service.rebuildPages(saved.id)
    expect(status.nodes).toBe(2)
    expect(status.pages).toBe(2)
    expect(await service.pages(saved.id)).toMatchObject({ totalNodes: 2 })
  })

  it('drops the index and says whether there was one', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })
    await service.pages(saved.id)
    expect(await service.removePages(saved.id)).toBe(true)
    expect(await service.removePages(saved.id)).toBe(false)
  })

  it('carries the index summary on the list row', async () => {
    const { service, path } = await bench()
    const saved = await service.save({ path, product: 'ncc', version: '2005' })

    // Nothing built yet: the row says nothing rather than "0 nodes", which would
    // read as an empty project.
    expect((await service.list()).frontends[0]?.pageIndex).toBeUndefined()

    await service.pages(saved.id)
    const row = (await service.list()).frontends[0]
    expect(row?.pageIndex).toMatchObject({ nodes: 1, pages: 1, stale: false })
    expect(row?.pageIndex?.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('lists one directory level for the tree, skipping the library', async () => {
    const { service, path, root } = await bench()
    await writeFile(join(root, 'src', 'cmp', 'bank', 'node', 'list', 'events.js'), '// x', 'utf8')
    const saved = await service.save({ path, product: 'ncc', version: '2005' })

    const listing = await service.dir(saved.id, 'src/cmp/bank/node/list')
    expect(listing.entries.map(entry => entry.name)).toEqual(['events.js', 'index.js'])
    // The runtime library is not something the operator browses.
    const src = await service.dir(saved.id, 'src')
    expect(src.entries.some(entry => entry.name === 'platform')).toBe(false)
  })
})
