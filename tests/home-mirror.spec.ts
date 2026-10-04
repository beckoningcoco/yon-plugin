/**
 * The skills-side mirror's promises: it merges rather than replaces, it never
 * claims an index it did not build, and it declines to write an unusable file
 * rather than discarding one.
 *
 * Every case passes `mirrorHomes` a scratch skills root. The default is the
 * operator's own `~/.claude/skills`, and a case that wrote there would be editing
 * the real toolchain's registry — which is why the root is a parameter at all.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mirrorHomes, mirrorPathOf } from '../src/host/home-mirror.ts'
import type { StoredHome } from '../src/host/home-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-home-mirror-'))
  temporary.push(dir)
  return dir
}

/**
 * A skills root with the one product's directory in it.
 * @param product - which skills directory to create.
 * @returns the scratch root.
 */
async function skillsTree(product: 'ncc' | 'bip' = 'ncc'): Promise<string> {
  const root = await scratch()
  await mkdir(join(root, product === 'ncc' ? 'ncc-asset-hawk' : 'yonyou-bip-dev'), { recursive: true })
  return root
}

/** One registration for the mirror to write. */
function home(overrides: Partial<StoredHome> = {}): StoredHome {
  return {
    id: 'ncc-2111',
    path: 'E:/NCProject/NCC/jixieyuan/home',
    product: 'ncc',
    version: '2111',
    isDefault: true,
    ...overrides,
  }
}

/**
 * Read the mirrored document back.
 * @param root - the scratch skills root.
 * @param product - which product's file to read.
 * @returns the parsed document.
 */
async function read(root: string, product: 'ncc' | 'bip' = 'ncc'): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(mirrorPathOf(product, root), 'utf8')) as Record<string, unknown>
}

/** One version entry, as an object. */
function entry(document: Record<string, unknown>, version: string): Record<string, unknown> {
  return (document.versions as Record<string, Record<string, unknown>>)[version] ?? {}
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('mirrorHomes', () => {
  it('writes the shape build_index.py writes', async () => {
    const root = await skillsTree()
    const result = await mirrorHomes('ncc', [home()], root)
    expect(result.warning).toBeUndefined()
    expect(result.path).toBe(mirrorPathOf('ncc', root))

    const text = await readFile(result.path, 'utf8')
    // build_index.py opens this file with encoding='utf-8' and json.load, which
    // raises on a BOM — so writing one would break the other half on its next run.
    expect(text.charCodeAt(0)).not.toBe(0xFEFF)

    const document = JSON.parse(text) as Record<string, unknown>
    expect(document.default_version).toBe('2111')
    expect(entry(document, '2111')).toEqual({
      path: 'E:/NCProject/NCC/jixieyuan/home',
      description: 'NCC 2111',
      index_file: 'class_index_2111.json',
      jdk_version: '?',
      indexed: false,
    })
  })

  it('writes the BIP file for a BIP registration', async () => {
    const root = await skillsTree('bip')
    const result = await mirrorHomes('bip', [home({ product: 'bip', version: '5.0' })], root)
    expect(result.path).toBe(mirrorPathOf('bip', root))
    expect(entry(await read(root, 'bip'), '5.0').description).toBe('BIP 旗舰版')
  })

  it('leaves a version the panel does not manage exactly as it was', async () => {
    const root = await skillsTree()
    const existing = {
      default_version: '2312',
      versions: {
        '2312': {
          path: 'E:/NCProject/other/home',
          description: 'NCC 2312',
          index_file: 'class_index_2312.json',
          jdk_version: '8',
          indexed: true,
        },
      },
    }
    await writeFile(mirrorPathOf('ncc', root), JSON.stringify(existing, null, 2), 'utf8')

    await mirrorHomes('ncc', [home()], root)

    const document = await read(root)
    expect(entry(document, '2312')).toEqual(existing.versions['2312'])
    expect(entry(document, '2111').path).toBe('E:/NCProject/NCC/jixieyuan/home')
  })

  it('keeps the index fields a run of build_index.py already answered', async () => {
    const root = await skillsTree()
    await writeFile(mirrorPathOf('ncc', root), JSON.stringify({
      default_version: '2111',
      versions: {
        '2111': {
          path: 'E:/old/home',
          description: 'NCC 2111',
          index_file: 'class_index_2111.json',
          jdk_version: '1.8.0_202',
          indexed: true,
        },
      },
    }, null, 2), 'utf8')

    await mirrorHomes('ncc', [home()], root)

    const written = entry(await read(root), '2111')
    // The path is the panel's to state; the index fields describe the skills
    // directory's own index, which this batch neither built nor removed.
    expect(written.path).toBe('E:/NCProject/NCC/jixieyuan/home')
    expect(written.jdk_version).toBe('1.8.0_202')
    expect(written.indexed).toBe(true)
  })

  it('withdraws a version the panel registered and never indexed', async () => {
    const root = await skillsTree()
    await mirrorHomes('ncc', [home()], root)
    // The same registration, dropped: the panel stops claiming this version.
    await mirrorHomes('ncc', [], root)
    expect((await read(root)).versions).toEqual({})
  })

  it('keeps an indexed entry even after its registration is gone', async () => {
    const root = await skillsTree()
    await writeFile(mirrorPathOf('ncc', root), JSON.stringify({
      default_version: '2111',
      versions: {
        '2111': { path: 'E:/h', description: 'NCC 2111', index_file: 'class_index_2111.json', jdk_version: '8', indexed: true },
      },
    }, null, 2), 'utf8')

    await mirrorHomes('ncc', [], root)

    // build_index.py:86 writes indexed: True unconditionally, so a true here means
    // an index file exists — dropping the entry would only make it unreachable.
    expect(entry(await read(root), '2111').indexed).toBe(true)
  })

  it('follows the default registration, and keeps the old default while it stands', async () => {
    const root = await skillsTree()
    const second = home({ id: 'ncc-2312', version: '2312', isDefault: false })
    await mirrorHomes('ncc', [home(), second], root)
    expect((await read(root)).default_version).toBe('2111')

    await mirrorHomes('ncc', [{ ...home(), isDefault: false }, { ...second, isDefault: true }], root)
    expect((await read(root)).default_version).toBe('2312')
  })

  it('declines to write when the skills directory is not there', async () => {
    const root = await scratch()
    const result = await mirrorHomes('ncc', [home()], root)
    expect(result.warning).toContain('ncc-asset-hawk')
    // No directory tree invented: a skills tree that is not installed must not
    // appear to be one.
    await expect(readFile(result.path, 'utf8')).rejects.toThrow()
  })

  it('writes nothing at all when there is nothing to register and no file', async () => {
    const root = await skillsTree()
    const result = await mirrorHomes('ncc', [], root)
    expect(result.warning).toBeUndefined()
    await expect(readFile(result.path, 'utf8')).rejects.toThrow()
  })

  it('refuses to overwrite a file it cannot parse', async () => {
    const root = await skillsTree()
    await writeFile(mirrorPathOf('ncc', root), '{ not json', 'utf8')
    const result = await mirrorHomes('ncc', [home()], root)
    expect(result.warning).toContain('JSON')
    expect(await readFile(result.path, 'utf8')).toBe('{ not json')
  })

  it('reads a file an editor left a BOM on', async () => {
    const root = await skillsTree()
    await writeFile(mirrorPathOf('ncc', root),
      `\uFEFF${JSON.stringify({ default_version: '2312', versions: { '2312': { path: 'E:/h', indexed: true } } })}`,
      'utf8')

    await mirrorHomes('ncc', [home()], root)

    const document = await read(root)
    expect(entry(document, '2312').path).toBe('E:/h')
    expect(entry(document, '2111').path).toBe('E:/NCProject/NCC/jixieyuan/home')
  })

  // The NCC skills directory was `yon-ncc-dev` until 2026-10-03. A tree that has
  // not been renamed yet is a normal installed tree, not an error, and the mirror
  // has to follow it there — otherwise the panel reports "技能目录不在" at someone
  // looking straight at the directory.
  describe('a skills tree that still carries the old directory name', () => {
    /** A scratch root holding only the pre-rename directory. */
    async function legacyTree(): Promise<string> {
      const root = await scratch()
      await mkdir(join(root, 'yon-ncc-dev'), { recursive: true })
      return root
    }

    it('writes there rather than at a path that does not exist', async () => {
      const root = await legacyTree()
      const result = await mirrorHomes('ncc', [home()], root)

      expect(result.warning).toBeUndefined()
      expect(result.path).toBe(join(root, 'yon-ncc-dev', 'ncc_home_path.json'))
      const document = JSON.parse(await readFile(result.path, 'utf8')) as Record<string, unknown>
      expect(entry(document, '2111').path).toBe('E:/NCProject/NCC/jixieyuan/home')
    })

    it('prefers the new directory once both are there', async () => {
      const root = await legacyTree()
      await mkdir(join(root, 'ncc-asset-hawk'), { recursive: true })

      const result = await mirrorHomes('ncc', [home()], root)

      expect(result.path).toBe(mirrorPathOf('ncc', root))
      await expect(readFile(join(root, 'yon-ncc-dev', 'ncc_home_path.json'), 'utf8')).rejects.toThrow()
    })

    it('leaves BIP alone — only the NCC directory was ever renamed', async () => {
      const root = await legacyTree()
      const result = await mirrorHomes('bip', [home({ product: 'bip', version: '5.0' })], root)
      // No `yonyou-bip-dev` either, so this is the ordinary missing-tree answer.
      expect(result.warning).toContain('yonyou-bip-dev')
    })
  })
})
