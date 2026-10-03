/**
 * The flagship-edition metadata: what it reads, what it refuses to invent, and what
 * the shipped corpus actually contains.
 *
 * Two different kinds of case live here, and they answer different questions.
 *
 * The fixture cases build a temporary directory and check the *rules*: that a failed
 * capture is skipped rather than parsed into an entity called `undefined`, that a
 * column is told from a sub-table by whether the payload named it a column, that a
 * child's table is filled in only when the child is in the corpus. Checking those
 * against the real shipped snapshots would check that vendor build rather than the
 * rules.
 *
 * The last group checks the *shipped corpus itself*, and that is deliberate: these
 * snapshots are data files that travel inside the package, so "the package is missing
 * them" and "someone added a broken capture" are both failures that nothing else in
 * the suite would notice. They are also the cases that pin the one claim the design
 * rests on — that a sub-table link is exactly an attribute with no `columnName`, with
 * no guessing and no second list.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BIP_META_ROOT, bipCandidates, bipEntityOf, clampBipLimit, DEFAULT_BIP_LIMIT,
  findBipColumns, findBipEntities, findBipEnums, loadBipMetadata, MAX_BIP_LIMIT,
} from '../src/host/bip-meta.ts'

/** Every temp directory a case made, removed when the file is done. */
const temporary: string[] = []

/** A fresh temp directory. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bip-meta-'))
  temporary.push(dir)
  return dir
}

afterAll(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One attribute, written the way a payload writes one. */
function attribute(fields: {
  name: string
  columnName?: string
  displayName?: string
  type?: string
  typeUri?: string
  length?: string
  nullable?: string
  isKey?: string
  isCode?: string
  enumType?: string
  defaultValue?: string
}): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    name: fields.name,
    displayName: fields.displayName ?? '',
    type: { name: fields.type ?? 'String', id: fields.type ?? 'String' },
    typeUri: fields.typeUri ?? fields.type ?? 'String',
  }
  if (fields.columnName !== undefined) raw.columnName = fields.columnName
  if (fields.length !== undefined) raw.length = fields.length
  if (fields.nullable !== undefined) raw.nullable = fields.nullable
  if (fields.isKey !== undefined) raw.isKey = fields.isKey
  if (fields.isCode !== undefined) raw.isCode = fields.isCode
  if (fields.enumType !== undefined) raw.enumType = fields.enumType
  if (fields.defaultValue !== undefined) raw.defaultValue = fields.defaultValue
  return raw
}

/** One successful capture, in the platform's envelope. */
function snapshot(entity: {
  name: string
  uri: string
  tableName?: string
  domain?: string
  tenantId?: string
  buildTime?: string
  displayName?: string
  attributes?: readonly Record<string, unknown>[]
}): string {
  return JSON.stringify({
    code: '200',
    data: {
      resultCode: '200',
      data: {
        name: entity.name,
        uri: entity.uri,
        tableName: entity.tableName ?? '',
        domain: entity.domain ?? '',
        tenantId: entity.tenantId ?? 'tenant-a',
        buildTime: entity.buildTime ?? '2026-01-01 00:00:00.0000',
        displayName: entity.displayName ?? '',
        attributes: entity.attributes ?? [],
      },
    },
  })
}

/** One failed capture, as the platform writes one. */
function failed(uri: string): string {
  return JSON.stringify({
    code: '200',
    data: { msg: `Does not exist in DB. uri: ${uri}, tenantId: tenant-a`, resultCode: '500' },
  })
}

describe('reading the snapshots', () => {
  it('skips a failed capture instead of parsing it into an entity', async () => {
    const dir = await scratch()
    await writeFile(join(dir, 'metadata_a.json'),
      snapshot({ name: 'Alpha', uri: 'x.alpha.Alpha', tableName: 'alpha' }), 'utf8')
    await writeFile(join(dir, 'metadata_b.json'), failed('x.beta.Beta'), 'utf8')
    const corpus = await loadBipMetadata(dir)
    expect(corpus.entities.map(entity => entity.name)).toEqual(['Alpha'])
    expect(corpus.skipped).toEqual(['metadata_b.json'])
  })

  it('skips a payload that is not an entity model', async () => {
    const dir = await scratch()
    // Envelope intact, inner object present, but neither a name nor a uri — the two
    // things every later step keys on.
    await writeFile(join(dir, 'metadata_partial.json'),
      JSON.stringify({ code: '200', data: { resultCode: '200', data: { tableName: 'orphan' } } }), 'utf8')
    await writeFile(join(dir, 'metadata_broken.json'), '{ not json', 'utf8')
    const corpus = await loadBipMetadata(dir)
    expect(corpus.entities).toEqual([])
    expect(corpus.skipped).toEqual(['metadata_broken.json', 'metadata_partial.json'])
  })

  it('orders entities by URI so two reads of one corpus agree', async () => {
    const dir = await scratch()
    await writeFile(join(dir, 'metadata_z.json'), snapshot({ name: 'Zulu', uri: 'x.z.Zulu' }), 'utf8')
    await writeFile(join(dir, 'metadata_a.json'), snapshot({ name: 'Alpha', uri: 'x.a.Alpha' }), 'utf8')
    const corpus = await loadBipMetadata(dir)
    expect(corpus.entities.map(entity => entity.uri)).toEqual(['x.a.Alpha', 'x.z.Zulu'])
  })

  it('reports the tenant only when every snapshot agrees', async () => {
    const one = await scratch()
    await writeFile(join(one, 'metadata_a.json'), snapshot({ name: 'A', uri: 'x.a.A' }), 'utf8')
    expect((await loadBipMetadata(one)).tenant).toBe('tenant-a')

    const two = await scratch()
    await writeFile(join(two, 'metadata_a.json'), snapshot({ name: 'A', uri: 'x.a.A' }), 'utf8')
    await writeFile(join(two, 'metadata_b.json'),
      snapshot({ name: 'B', uri: 'x.b.B', tenantId: 'tenant-b' }), 'utf8')
    expect((await loadBipMetadata(two)).tenant).toBe('')
  })
})

describe('columns and sub-tables', () => {
  /** One entity with two columns, one sub-table whose target is present, one that is not. */
  async function corpus(): Promise<Awaited<ReturnType<typeof loadBipMetadata>>> {
    const dir = await scratch()
    await writeFile(join(dir, 'metadata_child.json'),
      snapshot({ name: 'Child', uri: 'x.a.Child', tableName: 'a_child' }), 'utf8')
    await writeFile(join(dir, 'metadata_main.json'), snapshot({
      name: 'Main',
      uri: 'x.a.Main',
      tableName: 'a_main',
      attributes: [
        attribute({ name: 'id', columnName: 'id', displayName: 'ID', type: 'Long', isKey: 'true' }),
        attribute({ name: 'billNo', columnName: 'bill_no', displayName: '单据编号', length: '50', isCode: 'true' }),
        // No `columnName` — this is a link to a child entity, not a column.
        attribute({ name: 'childLines', displayName: '子表', typeUri: 'x.a.Child' }),
        attribute({ name: 'missingLines', displayName: '缺失子表', typeUri: 'x.a.Missing' }),
      ],
    }), 'utf8')
    return await loadBipMetadata(dir)
  }

  it('tells a column from a sub-table by whether the payload named a column', async () => {
    const main = bipEntityOf(await corpus(), 'Main')
    expect(main?.columns.map(column => column.column)).toEqual(['id', 'bill_no'])
    expect(main?.children.map(child => child.property)).toEqual(['childLines', 'missingLines'])
  })

  it('fills a child table in when the child is in the corpus, and leaves it empty when not', async () => {
    const main = bipEntityOf(await corpus(), 'Main')
    const byProperty = new Map(main?.children.map(child => [child.property, child]))
    expect(byProperty.get('childLines')?.tableName).toBe('a_child')
    expect(byProperty.get('missingLines')?.tableName).toBe('')
  })

  it('reads the flags, the length and the enum name off a column', async () => {
    const main = bipEntityOf(await corpus(), 'Main')
    const id = main?.columns.find(column => column.column === 'id')
    expect(id?.property).toBe('id')
    expect(id?.label).toBe('ID')
    expect(id?.type).toBe('Long')
    expect(id?.isKey).toBe(true)
    expect(id?.isCode).toBe(false)
  })

  it('claims nothing about nullability the payload did not say', async () => {
    // `nullable` is absent on both fixture columns, so neither may be reported as NOT
    // NULL — an absent flag is not a "false". Only an explicit `nullable="false"` is.
    const absent = bipEntityOf(await corpus(), 'Main')
    expect(absent?.columns.every(column => column.notNull === false)).toBe(true)

    const dir = await scratch()
    await writeFile(join(dir, 'metadata_strict.json'), snapshot({
      name: 'Strict',
      uri: 'x.a.Strict',
      attributes: [
        attribute({ name: 'id', columnName: 'id', nullable: 'false' }),
        attribute({ name: 'note', columnName: 'note', nullable: 'true' }),
        attribute({ name: 'silent', columnName: 'silent' }),
      ],
    }), 'utf8')
    const strict = bipEntityOf(await loadBipMetadata(dir), 'Strict')
    expect(strict?.columns.map(column => column.notNull)).toEqual([true, false, false])
  })
})

describe('searching', () => {
  async function corpus(): Promise<Awaited<ReturnType<typeof loadBipMetadata>>> {
    const dir = await scratch()
    await writeFile(join(dir, 'metadata_main.json'), snapshot({
      name: 'PurInRecord',
      uri: 'st.purinrecord.PurInRecord',
      tableName: 'st_purinrecord',
      displayName: '采购入库单主表',
      attributes: [
        attribute({ name: 'certificateVersion', columnName: 'certificate_version',
          displayName: '库存移动记录版本', type: 'Long' }),
        attribute({ name: 'status', columnName: 'status', displayName: '单据状态', enumType: 'aa_boolean' }),
        attribute({ name: 'writeOff', columnName: 'write_off', displayName: '核销',
          enumType: 'st_writeOffStatus' }),
      ],
    }), 'utf8')
    await writeFile(join(dir, 'metadata_other.json'), snapshot({
      name: 'SalesOut', uri: 'st.salesout.SalesOut', tableName: 'st_salesout', displayName: '销售出库单',
    }), 'utf8')
    return await loadBipMetadata(dir)
  }

  it('finds an entity by every name it goes by', async () => {
    const loaded = await corpus()
    for (const term of ['PurInRecord', 'purinrecord', 'st_purinrecord', 'st.purinrecord.PurInRecord']) {
      expect(findBipEntities(loaded, term, 20).map(entity => entity.name), term).toContain('PurInRecord')
    }
  })

  it('finds an entity by a fragment of its Chinese label', async () => {
    const hits = findBipEntities(await corpus(), '采购', 20)
    expect(hits.map(entity => entity.name)).toEqual(['PurInRecord'])
  })

  it('returns nothing for a term that matches nothing, rather than everything', async () => {
    expect(findBipEntities(await corpus(), 'zzzz', 20)).toEqual([])
    expect(findBipColumns(await corpus(), 'zzzz', 20)).toEqual([])
    expect(findBipEnums(await corpus(), 'zzzz', 20)).toEqual([])
  })

  it('never returns more than the limit asked for', async () => {
    const loaded = await corpus()
    expect(findBipEntities(loaded, 'st', 1)).toHaveLength(1)
    expect(findBipColumns(loaded, 'a', 1)).toHaveLength(1)
  })

  it('finds a column by its physical name, its Java property and its label', async () => {
    const loaded = await corpus()
    for (const term of ['certificate_version', 'certificateVersion', '库存移动记录版本']) {
      const hits = findBipColumns(loaded, term, 20)
      expect(hits.map(hit => hit.entity.name), term).toEqual(['PurInRecord'])
      expect(hits[0]?.columns.map(column => column.column), term).toEqual(['certificate_version'])
    }
  })

  it('finds which columns use an enumeration, and carries no value set', async () => {
    const loaded = await corpus()
    const exact = findBipEnums(loaded, 'aa_boolean', 20)
    expect(exact.map(hit => hit.name)).toEqual(['aa_boolean'])
    expect(exact[0]?.refs.map(ref => ref.column.column)).toEqual(['status'])
    // The payloads carry the enum's name and not its values, so a hit has nowhere to
    // put one: the answer's whole shape is the name and the columns that use it.
    expect(Object.keys(exact[0] ?? {}).sort()).toEqual(['name', 'refs'])
    expect(findBipEnums(loaded, 'st_writeOff', 20).map(hit => hit.name)).toEqual(['st_writeOffStatus'])
    expect(findBipEnums(loaded, 'zzz', 20)).toEqual([])
  })

  it('matches an entity exactly, and reports candidates when it cannot', async () => {
    const loaded = await corpus()
    expect(bipEntityOf(loaded, 'PurInRecord')?.tableName).toBe('st_purinrecord')
    expect(bipEntityOf(loaded, 'st_purinrecord')?.name).toBe('PurInRecord')
    expect(bipEntityOf(loaded, 'PurIn')).toBeUndefined()
    expect(bipCandidates(loaded, 'PurIn', 8).map(entity => entity.name)).toEqual(['PurInRecord'])
  })

  it('clamps a limit into range', () => {
    expect(clampBipLimit(undefined)).toBe(DEFAULT_BIP_LIMIT)
    expect(clampBipLimit('5')).toBe(DEFAULT_BIP_LIMIT)
    expect(clampBipLimit(0)).toBe(1)
    expect(clampBipLimit(2.7)).toBe(2)
    expect(clampBipLimit(10_000)).toBe(MAX_BIP_LIMIT)
  })
})

describe('the corpus this package ships', () => {
  /**
   * These cases read `resources/` as the package will, through the default root. They
   * are the only place in the suite that asserts the shipped data is present and
   * parseable — a build that dropped `resources/**` or a capture added in a broken
   * state fails here and nowhere else.
   */
  it('loads every snapshot without skipping any', async () => {
    const corpus = await loadBipMetadata()
    expect(corpus.skipped).toEqual([])
    expect(corpus.entities.length).toBeGreaterThanOrEqual(8)
    expect(corpus.tenant).toBe('nfkwaryp')
  })

  it('locates the snapshots relative to the module, so one path serves src and lib', () => {
    expect(BIP_META_ROOT.replace(/\\/g, '/')).toMatch(/\/resources\/bip-meta\/$/)
  })

  it('keeps the snapshots out of the knowledge tree the knowledge_* tools walk', () => {
    // 3.53 MB of bare payloads is 56% of that corpus's bytes in 1.9% of its documents, and
    // the walk takes every `.json` it finds (there is no exclusion list). Moving them back
    // under `resources/knowledge/` would silently make a metadata dump answer as often as a
    // written page, so the negative half of this assertion is the load-bearing one.
    const root = BIP_META_ROOT.replace(/\\/g, '/')

    expect(root).not.toContain('/knowledge/')
    expect(root).toContain('/resources/')
  })

  it('pins the claim that a sub-table is an attribute with no column name', async () => {
    // The design says the split needs no second list. This is that claim, checked
    // against the one snapshot whose child list is known: the names of the attributes
    // carrying no `columnName` must be exactly its `childAttributes` names.
    const { readFile } = await import('node:fs/promises')
    const raw = JSON.parse(await readFile(
      join(BIP_META_ROOT, 'metadata_st_purinrecord_PurInRecord.json'), 'utf8')) as {
      data: { data: { attributes: readonly Record<string, unknown>[]; childAttributes: readonly Record<string, unknown>[] } }
    }
    const entity = raw.data.data
    const withoutColumn = entity.attributes
      .filter(attribute => !attribute.columnName && !attribute.fieldName)
      .map(attribute => String(attribute.name))
      .sort()
    const declared = entity.childAttributes.map(child => String(child.name)).sort()
    expect(withoutColumn).toEqual(declared)
    expect(declared.length).toBeGreaterThan(0)
  })

  it('reads a real entity: its table, its columns and its sub-tables', async () => {
    const corpus = await loadBipMetadata()
    const purchase = bipEntityOf(corpus, 'st.purinrecord.PurInRecord')
    expect(purchase?.tableName).toBe('st_purinrecord')
    expect(purchase?.domain).toBe('ustock')
    expect(purchase?.label).toBe('采购入库单主表')
    expect(purchase?.columns.length).toBeGreaterThan(100)
    expect(purchase?.columns.find(column => column.isCode)?.column).toBe('code')
    expect(purchase?.children.map(child => child.property)).toContain('paymentSchedules')
  })
})
