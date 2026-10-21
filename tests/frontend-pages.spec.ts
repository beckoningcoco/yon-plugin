/**
 * The page index: what one walk collects, and what a stored document says about
 * the project it was built from.
 *
 * The walk is shared with the probe, so these cases are also the definition of
 * what "一个页面节点" means: `src/{领域}/{模块}/{节点}`, with page entries as its
 * builds. A four-level `index.js` that is a component or a refer folder is not
 * a page and must not create a node.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readPageIndex, removePageIndex, scanProject, writePageIndex,
} from '../src/host/frontend-pages.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-pages-'))
  temporary.push(dir)
  return dir
}

/**
 * Create one file under a root, creating its directories.
 * @param root - the fixture root.
 * @param rel - the relative path.
 * @param content - what to write.
 */
async function file(root: string, rel: string, content = 'x'): Promise<void> {
  const full = join(root, ...rel.split('/'))
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A project with two page nodes, one component folder and one runtime library. */
async function project(): Promise<string> {
  const root = join(await scratch(), 'hotwebs')
  await file(root, 'src/cmp/bank/node/list/index.js')
  await file(root, 'src/cmp/bank/node/list/events/save.js')
  await file(root, 'src/cmp/bank/node/card/index.js')
  await file(root, 'src/cmp/other/node/main/index.js')
  // A component folder that happens to sit four levels deep: source, not a page.
  await file(root, 'src/uap/common/components/Foo/index.js')
  // The runtime library: counted as files and bytes, never as pages.
  await file(root, 'src/platform/react.js', 'x'.repeat(4096))
  // Never counted at all.
  await file(root, 'node_modules/pkg/index.js')
  return root
}

describe('scanProject', () => {
  it('collects page nodes, their entries and their files', async () => {
    const root = await project()
    const scan = await scanProject(root)

    expect(scan.nodes).toBe(2)
    expect(scan.pages).toBe(3)
    expect(scan.pageTypes).toEqual(['card', 'list', 'main'])
    expect(scan.pageNodes.map(node => `${node.domain}/${node.module}/${node.node}`))
      .toEqual(['cmp/bank/node', 'cmp/other/node'])

    const bank = scan.pageNodes[0]
    expect(bank?.dir).toBe('src/cmp/bank/node')
    expect(bank?.entries.map(entry => `${entry.kind}:${entry.rel}`)).toEqual([
      'card:src/cmp/bank/node/card/index.js',
      'list:src/cmp/bank/node/list/index.js',
    ])
    // Every file under the node, not only the entry files.
    expect(bank?.files).toBe(3)
  })

  it('does not make a node out of a component or refer folder', async () => {
    const scan = await scanProject(await project())
    expect(scan.pageNodes.some(node => node.dir.includes('components'))).toBe(false)
  })

  it('counts the runtime library as bytes but gives it no pages', async () => {
    const scan = await scanProject(await project())
    const platform = scan.domains.find(domain => domain.name === 'platform')
    expect(platform?.pages).toBe(0)
    expect(platform?.bytes).toBe(4096)
  })

  it('skips node_modules entirely', async () => {
    const scan = await scanProject(await project())
    expect(scan.files).toBe(6)
  })
})

describe('page index documents', () => {
  it('round-trips a document and keeps the root it describes', async () => {
    const dir = await scratch()
    const root = await project()
    const scan = await scanProject(root)
    const index = { version: '2005', root, builtAt: '2026-10-18T10:00:00.000Z', nodes: scan.pageNodes }

    await writePageIndex('fe-ncc-2005', index, dir)
    const read = await readPageIndex('fe-ncc-2005', root, dir)

    expect(read.stale).toBe(false)
    expect(read.error).toBeUndefined()
    expect(read.index?.nodes).toHaveLength(2)
    expect(read.index?.version).toBe('2005')
  })

  it('marks a document built for another root as stale', async () => {
    const dir = await scratch()
    const root = await project()
    const scan = await scanProject(root)
    await writePageIndex('fe-ncc-2005', { version: '2005', root, builtAt: 'x', nodes: scan.pageNodes }, dir)

    const read = await readPageIndex('fe-ncc-2005', `${root}-moved`, dir)
    // The registration's path was edited: the nodes describe a directory that is
    // no longer the registered one, and serving them would be worse than a rebuild.
    expect(read.stale).toBe(true)
  })

  it('reports an unparseable document instead of pretending there is none', async () => {
    const dir = await scratch()
    await writeFile(join(dir, 'fe-ncc-2005.json'), '{ not json', 'utf8')
    const read = await readPageIndex('fe-ncc-2005', 'E:/x', dir)
    expect(read.index).toBeUndefined()
    expect(read.error).toContain('fe-ncc-2005.json')
  })

  it('removes a document, and says so the second time', async () => {
    const dir = await scratch()
    await writePageIndex('fe-ncc-2005', { version: '2005', root: 'E:/x', builtAt: 'x', nodes: [] }, dir)
    expect(await removePageIndex('fe-ncc-2005', dir)).toBe(true)
    expect(await removePageIndex('fe-ncc-2005', dir)).toBe(false)
  })
})
