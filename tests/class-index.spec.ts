/**
 * Building a class index, against a hand-made Home.
 *
 * The case this file exists for: a module can ship with **no jar at all**, keeping its
 * classes loose on disk. Measured on the registered 2312 home, exactly one of 263
 * modules is like that — `hadc`, 284 `.java` and 323 `.class`, all interfaces and
 * implementations of one customer's extension — and a scan of all 2,779 jars in that
 * home found none of those names. Before this, `ncc_class_search` could not reach any
 * of them: the walk skipped every entry that was not a `.jar`.
 *
 * The jar here is written by hand rather than by a zip library, because that is all the
 * reader uses: `classNamesOf` walks the central directory and nothing else, so a file
 * with a central directory and an EOCD but no local data is a faithful stand-in. It
 * also means this file fails if that contract changes, which is what we want.
 */
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildClassIndex, listClassIndexes, summaryOf, writeClassIndex } from '../src/host/class-index.ts'

/** Every temp directory a case made, removed when the file is done. */
const temporary: string[] = []

/** A fresh temp directory. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'class-index-'))
  temporary.push(dir)
  return dir
}

afterAll(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** The signature that opens one central-directory entry. */
const CENTRAL_SIGNATURE = 0x02014b50

/** The signature that opens the end-of-central-directory record. */
const EOCD_SIGNATURE = 0x06054b50

/**
 * Bytes for a file that is a valid jar as far as `classNamesOf` is concerned: a
 * central directory listing `names`, followed by the EOCD record. No local headers and
 * no compressed data — the reader never looks for them.
 * @param names - the entry names the archive claims to hold.
 * @returns the file's bytes.
 */
function fakeJar(names: readonly string[]): Buffer {
  const parts: Buffer[] = []
  let offset = 0
  for (const name of names) {
    const nameBytes = Buffer.from(name, 'utf8')
    const header = Buffer.alloc(46)
    header.writeUInt32LE(CENTRAL_SIGNATURE, 0)
    header.writeUInt16LE(nameBytes.length, 28)
    parts.push(header, nameBytes)
    offset += 46 + nameBytes.length
  }
  const directory = Buffer.concat(parts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(names.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(0, 16)
  return Buffer.concat([directory, eocd])
}

/** Write a file, creating whatever directories it needs. */
async function put(root: string, rel: string, body: string | Buffer): Promise<void> {
  const full = join(root, rel)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, body)
}

/**
 * A Home covering every case this file asserts on.
 *
 * `withjar` holds a jar and also loose copies of some of its classes; `nojar` is the
 * `hadc` shape — loose only, under two different class roots; `oddball` keeps a
 * `.class` where no `classes` segment says what package it belongs to.
 * @returns the fixture's root directory.
 */
async function home(): Promise<string> {
  const root = await scratch()
  await put(root, 'modules/withjar/lib/thing.jar', fakeJar([
    'nc/demo/InJar.class', 'nc/demo/Both.class', 'nc/demo/module-info.class',
  ]))
  await put(root, 'modules/withjar/classes/nc/demo/Both.class', '')
  await put(root, 'modules/withjar/classes/nc/demo/Also.java', 'package nc.demo;')
  await put(root, 'modules/withjar/classes/nc/demo/Also.class', '')
  await put(root, 'modules/nojar/META-INF/classes/nc/impl/hadc/Thing.java', 'package nc.impl.hadc;')
  await put(root, 'modules/nojar/META-INF/classes/nc/impl/hadc/Thing.class', '')
  await put(root, 'modules/nojar/classes/nccloud/Other.class', '')
  await put(root, 'modules/oddball/stuff/Random.class', '')
  await put(root, 'ufjdk/lib/bundled.jar', fakeJar(['java/lang/String.class']))
  await put(root, 'README.txt', 'not a class')
  return root
}

describe('building a class index', () => {
  it('indexes the classes of a module that ships no jar', async () => {
    const built = await buildClassIndex(await home(), 'test')
    expect(built.index['nc.impl.hadc.Thing'])
      .toBe('modules/nojar/META-INF/classes/nc/impl/hadc/Thing.java')
    expect(built.index['nccloud.Other']).toBe('modules/nojar/classes/nccloud/Other.class')
  })

  it('prefers the jar when a class is loose and in a jar at the same time', async () => {
    // The jar is what the installation loads. A file left in `classes/` is a build
    // artifact whose provenance is unknown, and it need not match the compiled code.
    const built = await buildClassIndex(await home(), 'test')
    expect(built.index['nc.demo.Both']).toBe('modules/withjar/lib/thing.jar')
    expect(built.index['nc.demo.InJar']).toBe('modules/withjar/lib/thing.jar')
  })

  it('prefers a source file over a bare class file for the same class', async () => {
    const built = await buildClassIndex(await home(), 'test')
    expect(built.index['nc.demo.Also']).toBe('modules/withjar/classes/nc/demo/Also.java')
  })

  it('skips a loose file whose path names no package', async () => {
    // `modules/oddball/stuff/Random.class` has no `classes` segment, so the class name
    // is not derivable. Indexing it under a guessed name would make a search answer
    // confidently with a name that belongs to no class.
    const built = await buildClassIndex(await home(), 'test')
    expect(Object.keys(built.index).some(name => name.includes('Random'))).toBe(false)
  })

  it('leaves out module descriptors, the bundled JDK, and non-class files', async () => {
    const built = await buildClassIndex(await home(), 'test')
    expect(Object.keys(built.index).some(name => name.includes('module-info'))).toBe(false)
    expect(Object.keys(built.index).some(name => name.startsWith('java.lang'))).toBe(false)
    expect(Object.keys(built.index).some(name => name.includes('README'))).toBe(false)
  })

  it('counts jars apart from class entries', async () => {
    // `totalClasses` counts what was found, not distinct names — a class loose on disk
    // and inside a jar is two entries that merge into one lookup. That was already true
    // for a class in two jars, before loose files were read at all.
    const built = await buildClassIndex(await home(), 'test')
    expect(built.totalJars).toBe(1)
    expect(built.totalClasses).toBe(8)
    expect(Object.keys(built.index).length).toBe(5)
  })

  it('walks past a jar it cannot read instead of failing the run', async () => {
    // One truncated archive in an installation must not cost the other 2,778. The
    // reader returns an empty list for anything it cannot parse, so the walk carries
    // on — and `totalJars` still counts the file, because it is one.
    const root = await home()
    await put(root, 'modules/withjar/lib/corrupt.jar', 'not a zip at all')
    const built = await buildClassIndex(root, 'test')
    expect(built.totalJars).toBe(2)
    expect(built.index['nc.demo.InJar']).toBe('modules/withjar/lib/thing.jar')
  })
})

/**
 * Storing one, and listing what is stored.
 *
 * The listing reads each file's **head** and stops at `"index":` rather than parsing the
 * document — the table is where hundreds of thousands of entries live, and a status read
 * that parsed it whole would be the difference between a panel that polls and one that
 * cannot (measured: 1 ms against 372 ms on a 43.2 MB index). That trick depends on
 * something no type can enforce — `writeClassIndex` serialises the five summary fields
 * *before* the table — so it needs a case that fails the moment somebody reorders them.
 *
 * Everything here runs in a temporary directory. The functions default to the operator's
 * `~/.dsh/yon-panel/knowledge/`, and two index files left behind there by an earlier test
 * (`class_index_EMPTY.json`, `class_index_TEST.json`, both describing a Documents folder)
 * are the reason the `dir` parameter exists: a case that writes an index must be able to
 * say where.
 */
describe('storing a class index', () => {
  it('writes the five summary fields ahead of the table', async () => {
    const dir = await scratch()
    // Enough entries that the document runs well past the 4 KiB the head reads, so the
    // summary it returns cannot have come from a whole-file parse that happened to be
    // short. The table is the point: it is the part the head must stop before.
    const entries: Record<string, string> = {}
    for (let i = 0; i < 400; i += 1) entries[`nc.demo.Cls${i}`] = 'modules/demo/lib/demo.jar'
    const written = await writeClassIndex({
      version: '2111',
      home: 'E:/NCProject/NCC/home',
      builtAt: '2026-10-03T09:00:00.000Z',
      totalJars: 7941,
      totalClasses: 143_908,
      index: entries,
    }, dir)

    const { size } = await stat(written)
    expect(size).toBeGreaterThan(4096)
    const summary = await summaryOf(written)
    expect(summary).toEqual({
      version: '2111',
      home: 'E:/NCProject/NCC/home',
      builtAt: '2026-10-03T09:00:00.000Z',
      totalJars: 7941,
      totalClasses: 143_908,
    })
  })

  it('gives up on a head it cannot summarise rather than guessing', async () => {
    const dir = await scratch()
    // A file the panel did not write: the home path is long enough to push `"index":`
    // past the head, so the summary is simply not there to read. The point of returning
    // nothing is that the caller falls back to the whole document instead of reporting
    // the fields it happened to recognise.
    const body = {
      version: '2111',
      home: `E:/${'x'.repeat(5000)}/home`,
      builtAt: '2026-10-03T09:00:00.000Z',
      totalJars: 7,
      totalClasses: 9,
      index: {},
    }
    await put(dir, 'class_index_wide.json', JSON.stringify(body))
    expect(await summaryOf(join(dir, 'class_index_wide.json'))).toBeUndefined()

    // And the listing is still right — slower for this one file, never wrong.
    const listed = await listClassIndexes(dir)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.totalClasses).toBe(9)
    expect(listed[0]?.home).toBe(body.home)
  })

  it('skips a file it cannot read at all', async () => {
    const dir = await scratch()
    await put(dir, 'class_index_broken.json', 'not json at all')
    await put(dir, 'notes.json', JSON.stringify({ version: 'x' }))
    // The `notes.json` above is the control: a readable file that is simply not an index
    // is not listed either — only the `class_index_*.json` name is looked at, and then
    // only if it parses.
    expect(await listClassIndexes(dir)).toEqual([])
  })

  it('lists the newest build first and reports the size of each file it found', async () => {
    const dir = await scratch()
    const older = await writeClassIndex({
      version: '2111', home: 'E:/a', builtAt: '2026-09-28T16:02:41.000Z',
      totalJars: 1, totalClasses: 2, index: {},
    }, dir)
    await writeClassIndex({
      version: '2312', home: 'E:/b', builtAt: '2026-10-01T02:40:11.000Z',
      totalJars: 3, totalClasses: 4, index: {},
    }, dir)

    const listed = await listClassIndexes(dir)
    expect(listed.map(entry => entry.version)).toEqual(['2312', '2111'])
    expect(listed[1]?.totalClasses).toBe(2)
    expect(listed[1]?.bytes).toBe((await stat(older)).size)
  })

  it('reads nothing out of a directory that is not there', async () => {
    // The very first run: `~/.dsh/yon-panel/knowledge/` does not exist yet, and an
    // empty list is the answer — not an error the panel would have to explain.
    expect(await listClassIndexes(join(tmpdir(), 'yon-class-index-absent-xyz'))).toEqual([])
  })
})
