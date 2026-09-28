/**
 * The project store's own logic, exercised against an in-memory stand-in for
 * the storage domain.
 *
 * The stand-in is deliberate: the real backend's behaviour is the framework's
 * contract (covered by the harness's own suites plus this plugin's end-to-end
 * check), while what belongs to THIS package is the main/child-table split, the
 * fold that turns rows into a project detail, the cascade on delete, and the
 * write validation that keeps a bad row from making the domain unopenable.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createYonProjectsService } from '../src/host/service.ts'
import { fieldRecordKey, type ProjectFieldRow, type ProjectRow, type YonDomain } from '../src/host/domain.ts'

/** Minimal `KvTable` stand-in backed by a Map. */
function fakeTable<K extends string, V>() {
  const rows = new Map<K, V>()
  return {
    rows,
    get: (key: K): V | undefined => rows.get(key),
    entries: (): IterableIterator<[K, V]> => rows.entries(),
    keys: (): IterableIterator<K> => rows.keys(),
    get size(): number { return rows.size },
    async put(key: K, value: V): Promise<void> { rows.set(key, value) },
    async delete(key: K): Promise<boolean> { return rows.delete(key) },
    async update(key: K, fn: (current: V) => V): Promise<V> {
      const current = rows.get(key)
      if (current === undefined) throw new Error(`missing-key: ${key}`)
      const next = fn(current)
      rows.set(key, next)
      return next
    },
  }
}

/** The two tables this plugin declares, plus a domain façade over them. */
function bench() {
  const ctx = new Context()
  const projects = fakeTable<string, ProjectRow>()
  const fields = fakeTable<string, ProjectFieldRow>()
  const domain = {
    name: 'yon_projects',
    table: (name: string) => (name === 'projects' ? projects : fields),
  } as unknown as YonDomain
  const handle = createYonProjectsService(ctx, domain)

  /** The real backend emits this after each durable write; the stand-in does not. */
  const durabilityOf = (key: string): void => {
    ctx.emit('domain/changed', {
      domain: 'yon_projects', table: 'projects', key, operation: 'put', value: {},
    } as never)
  }
  return { ctx, projects, fields, service: handle.service, durabilityOf, handle }
}

describe('project store', () => {
  it('creates a project with its starting fields', async () => {
    const { service, durabilityOf } = bench()

    const created = await service.create({
      name: '  用友 NCC 客开  ',
      code: 'NCC-1',
      fields: { '环境信息': { host: '10.0.0.1' }, '负责人': '张三' },
    })
    durabilityOf(created.projectId)

    expect(created.name).toBe('用友 NCC 客开')
    expect(created.code).toBe('NCC-1')
    expect(created.status).toBe('active')
    expect(created.fields).toEqual({ '环境信息': { host: '10.0.0.1' }, '负责人': '张三' })

    const listed = service.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.fieldCount).toBe(2)
  })

  it('refuses a nameless project and an unknown status', async () => {
    const { service } = bench()

    await expect(service.create({ name: '   ' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(service.create({ name: 'ok', status: 'nope' as never }))
      .rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('adds and removes dynamic fields without touching the others', async () => {
    const { service, durabilityOf } = bench()
    const created = await service.create({ name: 'proj', fields: { '环境信息': 'old' } })

    // A new key the operator invented, alongside the retained one.
    const afterAdd = await service.setField(created.projectId, '环境信息new', { host: '10.0.0.9' })
    durabilityOf(created.projectId)
    expect(afterAdd.fields).toEqual({
      '环境信息': 'old',
      '环境信息new': { host: '10.0.0.9' },
    })

    const afterRemove = await service.removeField(created.projectId, '环境信息')
    durabilityOf(created.projectId)
    expect(afterRemove.fields).toEqual({ '环境信息new': { host: '10.0.0.9' } })
  })

  it('keeps concurrent edits to different fields from overwriting each other', async () => {
    const { service, durabilityOf } = bench()
    const created = await service.create({ name: 'proj' })

    await Promise.all([
      service.setField(created.projectId, 'a', 1),
      service.setField(created.projectId, 'b', 2),
    ])
    durabilityOf(created.projectId)

    // One child row per field is exactly why the second write cannot drop the first.
    expect((await Promise.resolve(service.get(created.projectId)))?.fields).toEqual({ a: 1, b: 2 })
  })

  it('rejects a field value the medium could not carry', async () => {
    const { service } = bench()
    const created = await service.create({ name: 'proj' })

    await expect(service.setField(created.projectId, 'fn', (() => {}) as never))
      .rejects.toMatchObject({ code: 'invalid-input' })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    await expect(service.setField(created.projectId, 'cycle', cyclic as never))
      .rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('archives softly and keeps archived projects out of pickers', async () => {
    const { service, durabilityOf } = bench()
    const created = await service.create({ name: 'zzz' })

    await service.update(created.projectId, { archived: true })
    durabilityOf(created.projectId)

    expect(service.list()).toHaveLength(0)
    expect(service.list({ includeArchived: true })).toHaveLength(1)
  })

  it('cascades the child rows when a project is deleted', async () => {
    const { service, fields } = bench()
    const created = await service.create({ name: 'proj', fields: { a: 1, b: 2 } })
    expect(fields.size).toBe(2)

    await service.remove(created.projectId)

    expect(fields.size).toBe(0)
    expect(service.get(created.projectId)).toBeUndefined()
  })

  it('reports an unknown project as not-found', async () => {
    const { service } = bench()

    await expect(service.update('ghost', { name: 'x' })).rejects.toMatchObject({ code: 'not-found' })
    await expect(service.setField('ghost', 'a', 1)).rejects.toMatchObject({ code: 'not-found' })
    await expect(service.remove('ghost')).rejects.toMatchObject({ code: 'not-found' })
    expect(service.get('ghost')).toBeUndefined()
  })

  it('notifies subscribers on each durable change, and stops on unsubscribe', async () => {
    const { service, durabilityOf } = bench()
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)

    const created = await service.create({ name: 'proj' })
    durabilityOf(created.projectId)
    expect(listener).toHaveBeenCalledTimes(1)

    await service.setField(created.projectId, 'a', 1)
    durabilityOf(created.projectId)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    await service.setField(created.projectId, 'b', 2)
    durabilityOf(created.projectId)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('orders the list by name and refreshes the cached snapshot', async () => {
    const { service, durabilityOf } = bench()

    for (const name of ['丙项目', '甲项目', '乙项目']) {
      const created = await service.create({ name })
      durabilityOf(created.projectId)
    }
    const first = service.getSnapshot()

    expect(first.map(project => project.name)).toEqual(['丙项目', '乙项目', '甲项目'].sort(
      (left, right) => left.localeCompare(right, 'zh-Hans-CN'),
    ))
    // The snapshot identity is stable until the next change.
    expect(service.getSnapshot()).toBe(first)
  })

  it('stores field names a record key cannot carry verbatim', async () => {
    const { service, durabilityOf } = bench()
    const created = await service.create({ name: 'proj' })

    // Chinese, a slash, an underscore, a dot, a space: every one of these is a
    // legal field name and none of them is legal inside a per-record key.
    const oddNames = ['环境信息new', 'a/b', 'a_b', 'v1.2', 'has space']
    for (const [index, name] of oddNames.entries()) {
      await service.setField(created.projectId, name, index)
    }
    durabilityOf(created.projectId)

    const detail = service.get(created.projectId)
    expect(Object.keys(detail?.fields ?? {}).sort()).toEqual([...oddNames].sort())
    expect(detail?.fields['a/b']).toBe(1)
    expect(detail?.fields['a_b']).toBe(2)
  })
})

describe('child-table record keys', () => {
  const SAFE = /^[a-zA-Z0-9_-]+$/

  it('stays inside the character set a per-record medium accepts', () => {
    for (const name of ['环境信息new', 'a/b', 'a_b', 'v1.2', 'has space', '']) {
      expect(SAFE.test(fieldRecordKey('6e37d940-18dd-4e03-b5b2-4a56df556f76', name))).toBe(true)
    }
  })

  it('keeps distinct field names distinct', () => {
    const keys = ['a/b', 'a_b', 'a-b', 'a b'].map(name => fieldRecordKey('p1', name))

    expect(new Set(keys).size).toBe(keys.length)
  })
})
