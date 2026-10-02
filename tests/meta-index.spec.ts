/**
 * The metadata index: what it walks, what it stores, and what it reuses.
 *
 * The tree every case here builds is a temporary directory, never a real
 * installation — a case asserting against one vendor's 2014 build would be checking
 * that build rather than the rules. Two of the rules are the reason this file exists
 * at all, because nothing else can see them go wrong:
 *
 * - **The fingerprint is keyed by Home-relative path**, which is what makes an index
 *   built for `2111` at one installation answer for another one holding the same
 *   version (`docs/yon-meta-index-plan.md` §2). If an absolute path ever leaks into
 *   the key, that still "works" on the machine that built it and quietly stops
 *   matching everywhere else.
 * - **A rebuild only re-reads what moved.** The count that proves it is
 *   `onProgress`'s `total`, which is the number of files this run re-parsed — not the
 *   number the walk found.
 *
 * Storage is driven into a temporary directory through the `dir` seam rather than the
 * operator's `~/.dsh/yon-panel/knowledge`: a case that wrote there would be editing
 * the installation it is checking.
 */
import { mkdir, mkdtemp, readFile, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  asQueryKind, buildMetaIndex, checkFreshness, clampQueryLimit, DEFAULT_QUERY_LIMIT,
  findBmfFiles, findEntities, findEnums, findFields, listMetaIndexes, MAX_QUERY_LIMIT,
  metaIndexPath, readMetaIndex, shortFile, writeMetaIndex,
  type MetaIndex, type StoredEntity, type StoredEnum,
} from '../src/host/meta-index.ts'

/** One document, written the way the real ones are: XML declaration, one element per line. */
function document(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\r\n' + body
}

/** An entity element with a name, a table and the fields given as `名字|中文名`. */
function entityXml(name: string, table: string, fields: readonly string[]): string {
  const written = fields.map(pair => {
    const [fieldName, label] = pair.split('|')
    const display = label === undefined ? '' : ` displayName="${label}"`
    return `                <attribute fieldName="${fieldName}"${display}/>`
  }).join('\n')
  return `<component name="${name}">
    <celllist>
        <entity id="id-${name}" name="${name}" tableName="${table}" fullClassName="nc.vo.${name}VO">
            <attributelist>
${written}
            </attributelist>
        </entity>
    </celllist>
</component>`
}

/**
 * Write one `.bmf` into a tree, making the directories on the way.
 * @param root - the tree's root.
 * @param rel - the file's path relative to the root, with forward slashes.
 * @param body - the document.
 * @param stamp - when given, the mtime to force on the file.
 * @returns the absolute path written.
 */
async function writeBmf(root: string, rel: string, body: string, stamp?: Date): Promise<string> {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, document(body), 'utf8')
  if (stamp !== undefined) await utimes(abs, stamp, stamp)
  return abs
}

/** A fresh temporary directory. */
async function tempTree(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'meta-index-'))
}

/**
 * An index built by hand, for the query cases.
 *
 * Written as a literal rather than produced by a build so the order the cases assert
 * against is the order they wrote, not the order a walk happened to return.
 */
function indexOf(
  entities: readonly Partial<StoredEntity>[],
  enums: readonly Partial<StoredEnum>[] = [],
): MetaIndex {
  const full = entities.map(entity => ({
    name: entity.name ?? '',
    filename: entity.filename ?? entity.name ?? '',
    displayName: entity.displayName ?? '',
    tableName: entity.tableName ?? '',
    fullClassName: entity.fullClassName ?? '',
    module: entity.module ?? 'test',
    file: entity.file ?? 'modules/test/METADATA/test.bmf',
    primary: entity.primary ?? false,
    fields: entity.fields ?? [],
  }))
  return {
    version: 'test',
    builtAt: '2026-10-02T00:00:00.000Z',
    sourceHomes: ['E:/test/home'],
    counts: {
      files: 1,
      entities: full.length,
      enums: enums.length,
      fields: full.reduce((total, entity) => total + entity.fields.length, 0),
      enumItems: 0,
    },
    fingerprint: {},
    entities: full,
    enums: enums.map(enumeration => ({
      name: enumeration.name ?? '',
      displayName: enumeration.displayName ?? '',
      fullClassName: enumeration.fullClassName ?? '',
      module: enumeration.module ?? 'test',
      file: enumeration.file ?? 'modules/test/METADATA/test.bmf',
      items: enumeration.items ?? [],
    })),
  }
}

describe('findBmfFiles', () => {
  it('walks modules/*/METADATA recursively, and nothing else', async () => {
    const root = await tempTree()
    try {
      await writeBmf(root, 'modules/a/METADATA/one.bmf', entityXml('one', 't_one', ['f|字段']))
      // Two levels below METADATA is real: `psndoc.bmf` sits at
      // `modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf`.
      await writeBmf(root, 'modules/a/METADATA/deep/deeper/two.bmf', entityXml('two', 't_two', ['g|字段']))
      // Outside METADATA, and not a .bmf: neither is metadata the index answers for.
      await writeBmf(root, 'modules/a/classes/three.bmf', entityXml('three', 't_three', []))
      await writeFile(join(root, 'modules/a/METADATA/readme.txt'), 'not metadata', 'utf8')

      const found = await findBmfFiles(root)
      // Sorted here because the walk itself makes no promise about order: it is a
      // directory read per module and a stack within it. What it does promise is the
      // relative path, the module and the basename, which is what the index stores.
      const byPath = [...found].sort((a, b) => a.rel.localeCompare(b.rel))
      expect(byPath.map(file => file.rel)).toEqual([
        'modules/a/METADATA/deep/deeper/two.bmf',
        'modules/a/METADATA/one.bmf',
      ])
      expect(byPath.map(file => file.module)).toEqual(['a', 'a'])
      expect(byPath.map(file => file.filename)).toEqual(['two', 'one'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('answers a tree with no modules/ with nothing rather than a throw', async () => {
    const root = await tempTree()
    try {
      expect(await findBmfFiles(root)).toEqual([])
      expect(await findBmfFiles(join(root, 'does-not-exist'))).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('buildMetaIndex', () => {
  it('counts what it parsed and stores both layers', async () => {
    const root = await tempTree()
    try {
      await writeBmf(root, 'modules/a/METADATA/bill.bmf', entityXml('bill', 't_bill', ['pk_bill|主键', 'status|单据状态']))
      const withEnum = entityXml('named', 't_named', ['kind|种类'])
        .replace('</celllist>', `    <Enumerate id="uuid-kind" name="kindtype" displayName="种类">
            <enumitemlist>
                <enumitem enumID="uuid-kind" enumValue="1" enumDisplay="主"/>
                <enumitem enumID="uuid-kind" enumValue="2" enumDisplay="辅"/>
            </enumitemlist>
        </Enumerate>
    </celllist>`)
      await writeBmf(root, 'modules/b/METADATA/named.bmf', withEnum)

      const index = await buildMetaIndex(root, '2111')
      expect(index.counts).toEqual({ files: 2, entities: 2, enums: 1, fields: 3, enumItems: 2 })
      expect(index.version).toBe('2111')
      expect(index.sourceHomes).toEqual([root.replace(/\\/g, '/')])
      // The pairs are stored the way the field query reads them.
      expect(index.entities.find(entity => entity.name === 'bill')?.fields).toEqual(['pk_bill|主键', 'status|单据状态'])
      expect(index.enums[0]?.items).toEqual([['1', '主'], ['2', '辅']])
      // Three of the four `.bmf`-adjacent things the walk skipped: the fingerprint covers
      // exactly the files that were parsed, so a file added later shows up as `added`.
      expect(Object.keys(index.fingerprint).sort()).toEqual([
        'modules/a/METADATA/bill.bmf',
        'modules/b/METADATA/named.bmf',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('re-reads only what moved, and drops what was deleted', async () => {
    const root = await tempTree()
    try {
      await writeBmf(root, 'modules/a/METADATA/keep.bmf', entityXml('keep', 't_keep', ['a|甲']))
      await writeBmf(root, 'modules/a/METADATA/edit.bmf', entityXml('edit', 't_edit', ['b|乙']))
      await writeBmf(root, 'modules/a/METADATA/gone.bmf', entityXml('gone', 't_gone', ['c|丙']))
      const first = await buildMetaIndex(root, '2111')
      expect(first.counts.entities).toBe(3)

      // One file edited (its size changes, so its fingerprint does too), one added, one
      // deleted — the three things a freshness check reports separately.
      await writeBmf(root, 'modules/a/METADATA/edit.bmf', entityXml('edit', 't_edit', ['b|乙', 'd|丁']))
      await writeBmf(root, 'modules/a/METADATA/added.bmf', entityXml('added', 't_added', ['e|戊']))
      await unlink(join(root, 'modules/a/METADATA/gone.bmf'))

      const freshness = await checkFreshness(root, first.fingerprint)
      expect(freshness).toMatchObject({ state: 'stale', changed: 1, added: 1, removed: 1 })

      const progress: { parsed: number; total: number; files: number }[] = []
      const second = await buildMetaIndex(root, '2111', first, update => { progress.push({ ...update }) })
      // The whole point of the fingerprint: one file edited plus one added is two files
      // re-parsed, out of the three the walk found — not three.
      expect(progress).toHaveLength(1)
      expect(progress[0]).toMatchObject({ parsed: 2, total: 2, files: 3 })
      // One field kept, the edited entity's two, the added one's one.
      expect(second.counts).toEqual({ files: 3, entities: 3, enums: 0, fields: 4, enumItems: 0 })
      expect(second.entities.map(entity => entity.name).sort()).toEqual(['added', 'edit', 'keep'])
      expect(second.entities.find(entity => entity.name === 'edit')?.fields).toEqual(['b|乙', 'd|丁'])
      // Unchanged from the previous build rather than re-derived: the kept entity's
      // fields are the same strings, which is what "reused" has to mean here.
      expect(second.entities.find(entity => entity.name === 'keep')?.fields).toEqual(['a|甲'])
      expect(await checkFreshness(root, second.fingerprint)).toMatchObject({ state: 'fresh', changed: 0 })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keys the fingerprint by Home-relative path, so a second installation agrees', async () => {
    // Two installations of the same version: same modules, same files, different roots.
    // The mtime is forced identical because that is what `fingerprintOf` reads, and the
    // claim being tested is about the *key* — an absolute path in it would make the
    // second Home look entirely changed.
    const stamp = new Date('2026-01-02T03:04:05.000Z')
    const one = await tempTree()
    const two = await tempTree()
    try {
      const rel = 'modules/a/METADATA/same.bmf'
      const body = entityXml('same', 't_same', ['a|甲'])
      await writeBmf(one, rel, body, stamp)
      await writeBmf(two, rel, body, stamp)

      const first = await buildMetaIndex(one, '2111')
      expect(Object.keys(first.fingerprint)).toEqual([rel])
      // Fresh at the other root, without a build: nothing this index describes moved.
      expect(await checkFreshness(two, first.fingerprint)).toMatchObject({ state: 'fresh' })

      const progress: number[] = []
      const second = await buildMetaIndex(two, '2111', first, update => { progress.push(update.total) })
      // Nothing to re-parse and so nothing is reported: progress is emitted per file
      // re-read, and a build with no work is over before the first report would be due.
      expect(progress).toEqual([])
      expect(second.counts.entities).toBe(1)
      // And the index now says both Homes went into it, which is what a version-keyed
      // index over two installations honestly is.
      expect(second.sourceHomes).toEqual([one.replace(/\\/g, '/'), two.replace(/\\/g, '/')])
    } finally {
      await rm(one, { recursive: true, force: true })
      await rm(two, { recursive: true, force: true })
    }
  })

  it('reports progress once at the end of a small build', async () => {
    // `PROGRESS_EVERY` is 200, so a tree this size reports exactly once — and that one
    // report has to be the finished state, or the panel would sit at 99% forever.
    const root = await tempTree()
    try {
      await writeBmf(root, 'modules/a/METADATA/one.bmf', entityXml('one', 't_one', ['a|甲']))
      await writeBmf(root, 'modules/a/METADATA/two.bmf', entityXml('two', 't_two', ['b|乙']))
      const progress: string[] = []
      await buildMetaIndex(root, '2111', undefined, update => { progress.push(update.current) })
      expect(progress).toHaveLength(1)
      expect(progress[0]?.endsWith('.bmf')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('storage', () => {
  it('round-trips through a directory it is given, and lists what is there', async () => {
    const dir = await tempTree()
    try {
      const index = indexOf([{ name: 'bill', tableName: 't_bill', fields: ['a|甲'] }])
      const written = await writeMetaIndex(index, dir)
      expect(written).toBe(metaIndexPath('test', dir))

      const read = await readMetaIndex('test', dir)
      expect(read?.entities.map(entity => entity.name)).toEqual(['bill'])
      expect(read?.counts.entities).toBe(1)

      const listed = await listMetaIndexes(dir)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.version).toBe('test')
      expect(listed[0]?.counts.entities).toBe(1)
      // The size reported is the stored file's, so the panel's byte figure is the one
      // on disk rather than a guess from the object.
      const info = await stat(written)
      expect(listed[0]?.bytes).toBe(info.size)

      // A version nobody stored is undefined, not an empty index: the caller has to be
      // able to tell "not built" from "built and empty".
      expect(await readMetaIndex('never', dir)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips a file that is not an index, and a directory that is not there', async () => {
    const dir = await tempTree()
    try {
      await writeFile(join(dir, 'meta_index_broken.json'), '{ not json', 'utf8')
      await writeFile(join(dir, 'meta_index_wrong.json'), JSON.stringify({ version: 'wrong' }), 'utf8')
      await writeFile(join(dir, 'class_index_2111.json'), JSON.stringify({ version: '2111' }), 'utf8')
      expect(await listMetaIndexes(dir)).toEqual([])
      expect(await readMetaIndex('broken', dir)).toBeUndefined()
      expect(await readMetaIndex('wrong', dir)).toBeUndefined()
      expect(await listMetaIndexes(join(dir, 'nope'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes one line, because the stored document is a lookup table', async () => {
    const dir = await tempTree()
    try {
      const path = await writeMetaIndex(indexOf([{ name: 'bill' }]), dir)
      const raw = await readFile(path, 'utf8')
      expect(raw.includes('\n')).toBe(false)
      // And the filename carries the version, sanitised, so two versions cannot collide
      // on a name the filesystem would reject.
      expect(metaIndexPath('2111:beta', dir)).toBe(join(dir, 'meta_index_2111_beta.json'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('queries', () => {
  it('keeps every entity when one name is defined by more than one file', async () => {
    // Measured on the reference Home: two files declare an entity called `psndoc`
    // (baseapp and uapbd), and `modules/hrhi/METADATA/psndoc/psndoc.bmf` declares one
    // named `bd_psndoc` — so a bare "psndoc" has three real answers, and resolving it
    // to one of them would be a guess the model cannot see. See
    // `docs/yon-home-design.md` §12.
    const index = indexOf([
      { name: 'psndoc', filename: 'psndoc', file: 'modules/baseapp/METADATA/psndoc.bmf' },
      { name: 'psndoc', filename: 'psndoc', file: 'modules/uapbd/METADATA/psndoc.bmf' },
      { name: 'bd_psndoc', filename: 'psndoc', file: 'modules/hrhi/METADATA/psndoc/psndoc.bmf' },
      { name: 'bd_psndoc', filename: 'bd_psndoc', file: 'modules/hrhi/METADATA/psndoc/bd_psndoc.bmf' },
    ])

    const hits = findEntities(index, 'psndoc', 10)
    // Declared names first (both of them, in the order they were stored), then the
    // file-name spelling, then the name that merely contains it: a class order that is a
    // property of the query rather than of the walk.
    expect(hits.map(entity => [entity.name, entity.file])).toEqual([
      ['psndoc', 'modules/baseapp/METADATA/psndoc.bmf'],
      ['psndoc', 'modules/uapbd/METADATA/psndoc.bmf'],
      ['bd_psndoc', 'modules/hrhi/METADATA/psndoc/psndoc.bmf'],
      ['bd_psndoc', 'modules/hrhi/METADATA/psndoc/bd_psndoc.bmf'],
    ])
    // A limit trims the tail rather than dropping the declarations.
    const trimmed = findEntities(index, 'psndoc', 2)
    expect(trimmed.map(entity => entity.name)).toEqual(['psndoc', 'psndoc'])
    expect(findEntities(index, '   ', 10)).toEqual([])
  })

  it('answers a field query with the entities that own the field', async () => {
    const index = indexOf([
      { name: 'aa_asset', tableName: 't_asset', fields: ['pk_org|所属组织', 'pk_dept|部门'] },
      { name: 'bb_bill', tableName: 't_bill', fields: ['cworkman|员工', 'pk_org|所属组织'] },
      { name: 'cc_free', tableName: 't_free', fields: ['note'] },
    ])

    // A Chinese label finds the entities, which is the direction the model asks in.
    expect(findFields(index, '员工', 5).map(hit => hit.entity.name)).toEqual(['bb_bill'])
    expect(findFields(index, '员工', 5)[0]?.fields).toEqual(['cworkman|员工'])
    // Exact matches sort before fragments of them.
    expect(findFields(index, 'pk_org', 5).map(hit => hit.entity.name)).toEqual(['aa_asset', 'bb_bill'])
    expect(findFields(index, 'org', 5).map(hit => hit.entity.name)).toEqual(['aa_asset', 'bb_bill'])
    // A field with neither a name nor a label is stored as the bare name and matched
    // by it.
    expect(findFields(index, 'note', 5)[0]?.fields).toEqual(['note'])
    expect(findFields(index, '', 5)).toEqual([])
  })

  it('finds an enumeration by a name, a label, or a value inside it', async () => {
    const index = indexOf([], [
      { name: 'billstatus', displayName: '单据状态', items: [['1', '待提交'], ['2', '待审批']] },
      { name: 'paystatus', displayName: '付款状态', items: [['0', '未付款']] },
    ])

    // By a label of one of its items — the way a question about "待审批" actually arrives.
    expect(findEnums(index, '待审批', 5).map(hit => hit.name)).toEqual(['billstatus'])
    // By display name, and by the exact name (which sorts first).
    expect(findEnums(index, '付款状态', 5).map(hit => hit.name)).toEqual(['paystatus'])
    expect(findEnums(index, 'billstatus', 5)[0]?.items).toEqual([['1', '待提交'], ['2', '待审批']])
    expect(findEnums(index, 'nothing', 5)).toEqual([])
  })
})

describe('the query contract', () => {
  it('refuses a kind outside the closed set and clamps a limit', () => {
    expect(asQueryKind('entity')).toBe('entity')
    expect(asQueryKind(' enum ')).toBe('enum')
    expect(() => asQueryKind('table')).toThrow(/entity \/ field \/ enum/)
    expect(() => asQueryKind(undefined)).toThrow()

    expect(clampQueryLimit(undefined)).toBe(DEFAULT_QUERY_LIMIT)
    expect(clampQueryLimit('10')).toBe(DEFAULT_QUERY_LIMIT)
    expect(clampQueryLimit(Number.NaN)).toBe(DEFAULT_QUERY_LIMIT)
    expect(clampQueryLimit(3.7)).toBe(3)
    expect(clampQueryLimit(0)).toBe(1)
    expect(clampQueryLimit(9999)).toBe(MAX_QUERY_LIMIT)
  })

  it('shortens a stored path to its basename for a one-line display', () => {
    expect(shortFile('modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf')).toBe('psndoc.bmf')
    expect(shortFile('psndoc.bmf')).toBe('psndoc.bmf')
  })
})
