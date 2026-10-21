/**
 * Content search: what it finds, what it refuses to look at, and how it says it
 * was cut short.
 *
 * The refusals are the point. `src/platform/` is 65–207 MB of bundled react/axios
 * per project; a search that descended into it would bury four real hits under a
 * hundred library matches, and the answer names the skip so that is visible.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { grepProject } from '../src/host/frontend-grep.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-grep-'))
  temporary.push(dir)
  return dir
}

/**
 * Create one file under a root, creating its directories.
 * @param root - the fixture root.
 * @param rel - the relative path.
 * @param content - what to write.
 */
async function file(root: string, rel: string, content: string | Buffer): Promise<void> {
  const full = join(root, ...rel.split('/'))
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One project with a hit in business code, a decoy in the library and a binary. */
async function project(): Promise<string> {
  const root = join(await scratch(), 'hotwebs')
  await file(root, 'src/cmp/bank/node/list/index.js',
    '// 银行对账\nconst url = "/nccloud/cmp/bank/bankcontrast.do";\nconst blockCode = "A";\n')
  await file(root, 'src/cmp/bank/node/list/events/save.js', 'export function save() { return blockCode; }\n')
  await file(root, 'src/cmp/bank/node/list/index.less', '.blockCode { color: red; }\n')
  // The runtime library: must never contribute a hit.
  await file(root, 'src/platform/react.js', 'const blockCode = "library";\n')
  await file(root, 'node_modules/pkg/index.js', 'blockCode\n')
  // A binary that happens to contain the text.
  await file(root, 'src/cmp/bank/node/list/logo.png',
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00]), Buffer.from('blockCode')]))
  // GBK: "// 中文注释 blockCode"
  await file(root, 'src/cmp/bank/node/list/gbk.js',
    Buffer.concat([
      Buffer.from('// '),
      Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0xD7, 0xA2, 0xCA, 0xCD]),
      Buffer.from(' blockCode\n'),
    ]))
  return root
}

describe('grepProject', () => {
  it('finds a literal case-insensitively and names the skips', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: 'BLOCKCODE' })

    const files = new Set(result.matches.map(hit => hit.rel))
    expect(files.has('src/cmp/bank/node/list/index.js')).toBe(true)
    expect(files.has('src/cmp/bank/node/list/events/save.js')).toBe(true)
    expect(files.has('src/cmp/bank/node/list/index.less')).toBe(true)
    expect(files.has('src/platform/react.js')).toBe(false)
    expect(files.has('node_modules/pkg/index.js')).toBe(false)
    expect(files.has('src/cmp/bank/node/list/logo.png')).toBe(false)
    expect(result.skipped).toContain('src/platform')
  })

  it('reports the line number and a trimmed snippet', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: '/nccloud/cmp/bank', regex: true })
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rel).toBe('src/cmp/bank/node/list/index.js')
    expect(result.matches[0]?.line).toBe(2)
    expect(result.matches[0]?.text).toContain('/nccloud/cmp/bank/bankcontrast.do')
  })

  it('reads a GBK file as GBK', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: '中文注释' })
    expect(result.matches.map(hit => hit.rel)).toContain('src/cmp/bank/node/list/gbk.js')
  })

  it('narrows by extension', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: 'blockCode', ext: 'less' })
    expect(result.matches.map(hit => hit.rel)).toEqual(['src/cmp/bank/node/list/index.less'])
  })

  it('narrows by directory', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: 'blockCode', under: 'src/cmp/bank/node/list/events' })
    expect(result.matches.map(hit => hit.rel)).toEqual(['src/cmp/bank/node/list/events/save.js'])
  })

  it('stops at the limit and says it did', async () => {
    const root = await project()
    const result = await grepProject(root, { pattern: 'blockCode', limit: 1 })
    expect(result.matches).toHaveLength(1)
    expect(result.capped).toBe(true)
  })

  it('refuses an empty pattern', async () => {
    const root = await project()
    await expect(grepProject(root, { pattern: '   ' })).rejects.toThrow(/不能为空/)
  })

  it('refuses a malformed regular expression, pointing at the alternative', async () => {
    const root = await project()
    await expect(grepProject(root, { pattern: '([', regex: true }))
      .rejects.toThrow(/正则写错了.*regex 去掉/s)
  })

  it('refuses a directory outside the project', async () => {
    const root = await project()
    await expect(grepProject(root, { pattern: 'x', under: '../../..' })).rejects.toThrow()
  })
})
