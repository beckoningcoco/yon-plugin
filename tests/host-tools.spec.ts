/**
 * The project tools: what the model is offered, what the operator is asked to
 * approve, and what actually happens to the store.
 *
 * The interesting half is the preview. A tool that changes stored data is only
 * reachable through an approval, so the text this package produces for that
 * approval is the safety boundary, and these cases assert it as content: the
 * before/after lines, the "nothing would change" answer, and the fact that a
 * reference matching two projects is never guessed at.
 */
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  isYonWriteTool, previewWrite, registerYonProjectTools, YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES,
  type YonToolDefinition, type YonToolExecution,
} from '../src/host/tools.ts'
import { createYonProjectsService, type YonProjectsService } from '../src/host/service.ts'
import type { ProjectFieldRow, ProjectRow, YonDomain } from '../src/host/domain.ts'
import type { JsonValue } from '../src/shared/types.ts'

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

/** A signal stand-in: these tools never await anything cancellable. */
const liveSignal = new AbortController().signal

/** One recorded execution, as the registry would hand it over. */
function execution(name: string, args: unknown): YonToolExecution {
  return { name, arguments: args, callId: 'call-1', signal: liveSignal }
}

/** Mount the tools over a real store and a recording registry. */
function bench() {
  const ctx = new Context()
  const projects = fakeTable<string, ProjectRow>()
  const fields = fakeTable<string, ProjectFieldRow>()
  const domain = {
    name: 'yon_projects',
    table: (name: string) => (name === 'projects' ? projects : fields),
  } as unknown as YonDomain
  const handle = createYonProjectsService(ctx, domain)

  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      const dispose = (): void => { registered.splice(registered.indexOf(definition), 1) }
      return dispose
    },
  }
  ctx.provide('tools', registry as never)

  // The real backend emits this after each durable write; the stand-in does not.
  // The store rebuilds its cached list from it, so every write here is announced
  // exactly as the backend would announce it.
  const durabilityOf = (key: string): void => {
    ctx.emit('domain/changed', {
      domain: 'yon_projects', table: 'projects', key, operation: 'put', value: {},
    } as never)
  }

  /** Store one project directly, so a case can start from a known shape. */
  const seed = async (
    name: string,
    code: string,
    initial: Record<string, JsonValue> = {},
  ): Promise<string> => {
    const created = await handle.service.create({ name, code, fields: initial })
    durabilityOf(created.projectId)
    return created.projectId
  }

  const dispose = registerYonProjectTools(ctx, handle.service)
  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  /** Run one call through the executable half of a tool. */
  const call = async (name: string, args: unknown): Promise<unknown> => {
    const result = await tool(name).execute(args, execution(name, args))
    durabilityOf('any')
    return result
  }

  /** Ask the registration's own gate what it would decide for one call. */
  const gate = async (name: string, args: unknown): Promise<{ kind: string; reason?: string }> =>
    await ctx.waterfall(
      'tools/pre-execute',
      execution(name, args),
      () => Promise.resolve({ kind: 'allow' as const }),
    ) as { kind: string; reason?: string }

  return {
    ctx, service: handle.service, projects, fields, registered,
    tool, call, gate, seed, dispose,
  }
}

describe('project tools', () => {
  it('registers every declared tool with an argument schema and a value schema', () => {
    const { registered } = bench()

    expect(registered.map(definition => definition.name)).toEqual([...YON_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(40)
      expect(definition.parameters).toMatchObject({ type: 'object' })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
      expect(typeof definition.execute).toBe('function')
    }
    // Five tools, three of them writes, and the two sets agree with each other.
    expect(YON_WRITE_TOOL_NAMES.every(name => isYonWriteTool(name))).toBe(true)
    expect(isYonWriteTool('project_list')).toBe(false)
    expect(isYonWriteTool('project_read')).toBe(false)
  })

  it('withdraws every registration on teardown', () => {
    const { registered, dispose } = bench()
    expect(registered).toHaveLength(YON_TOOL_NAMES.length)

    dispose()
    expect(registered).toHaveLength(0)
  })

  it('leaves a read alone at the gate', async () => {
    const { gate } = bench()

    expect(await gate('project_list', {})).toEqual({ kind: 'allow' })
    expect(await gate('project_read', { project: 'anything' })).toEqual({ kind: 'allow' })
  })

  it('asks before a write, with the change written out', async () => {
    const { gate, seed } = bench()
    await seed('用友 NCC 客开', 'NCC-1', { '环境信息': '10.0.0.1' })

    const decision = await gate('project_update', {
      project: '用友 NCC 客开',
      set_fields: { '环境信息': '10.0.0.9' },
      name: '用友 NCC',
    })

    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('修改项目「用友 NCC 客开」')
    expect(decision.reason).toContain('名称：「用友 NCC 客开」→「用友 NCC」')
    expect(decision.reason).toContain('字段「环境信息」：「10.0.0.1」→「10.0.0.9」')
  })

  it('separates a real change from a call that repeats what is stored', async () => {
    const { gate, seed } = bench()
    await seed('proj', '')

    const adding = await gate('project_update', { project: 'proj', set_fields: { '环境信息': '10.0.0.1' } })
    expect(adding.reason).toContain('新增字段「环境信息」')

    const noop = await gate('project_update', { project: 'proj', name: 'proj' })
    expect(noop.reason).toBe('项目「proj」没有任何改动。')
  })

  it('names the field it would delete, with its current value', async () => {
    const { gate, seed } = bench()
    await seed('proj', '', { '负责人': '张三' })

    const decision = await gate('project_update', { project: 'proj', remove_fields: ['负责人'] })

    expect(decision.reason).toContain('删除字段「负责人」（原值 张三）')
  })

  it('refuses to preview a deletion it cannot resolve', async () => {
    const { gate } = bench()

    // A call the tool itself will reject is not worth an approval prompt: the
    // gate steps aside and the tool reports the miss.
    expect(await gate('project_delete', { project: '不存在' })).toEqual({ kind: 'allow' })
  })

  it('spells out what a permanent deletion takes with it', async () => {
    const { gate, seed } = bench()
    await seed('proj', '', { a: 1, b: 2 })

    const decision = await gate('project_delete', { project: 'proj' })

    expect(decision.reason).toContain('彻底删除项目「proj」及其 2 个字段')
    expect(decision.reason).toContain('无法撤销')
  })

  it('lists what the store holds', async () => {
    const { call, seed } = bench()
    await seed('甲项目', 'A-1')
    await seed('乙项目', 'B-2')

    const all = await call('project_list', {}) as { matched: number }
    expect(all.matched).toBe(2)

    const filtered = await call('project_list', { query: 'b-2' }) as { matched: number }
    expect(filtered.matched).toBe(1)
  })

  it('reads one project by name, code, or id', async () => {
    const { call, seed } = bench()
    const projectId = await seed('用友 NCC 客开', 'NCC-1', { '环境信息': '10.0.0.1' })

    for (const reference of ['用友 NCC 客开', 'NCC-1', projectId]) {
      const answer = await call('project_read', { project: reference }) as { project: { fields: Record<string, unknown> } }
      expect(answer.project.fields).toEqual({ '环境信息': '10.0.0.1' })
    }
  })

  it('never guesses between two same-named projects', async () => {
    const { call, seed } = bench()
    await seed('同名', 'A-1')
    await seed('同名', 'B-2')

    await expect(call('project_read', { project: '同名' }))
      .rejects.toThrow(/matches 2 projects/)
  })

  it('reports a reference nothing matches', async () => {
    const { call } = bench()

    await expect(call('project_read', { project: '没有这个' })).rejects.toThrow(/no project matches/)
  })

  it('creates a project with its first fields', async () => {
    const { call, service } = bench()

    const created = await call('project_create', {
      name: '新项目',
      code: 'NEW-1',
      fields: { '环境信息': '10.0.0.1' },
    }) as { project: { name: string; code: string; fields: Record<string, unknown> } }

    expect(created.project.name).toBe('新项目')
    expect(created.project.fields).toEqual({ '环境信息': '10.0.0.1' })
    expect(service.list()).toHaveLength(1)
  })

  it('applies a rename, a field write and a field removal in one call', async () => {
    const { call, seed, service } = bench()
    await seed('旧名', '', { '旧字段': 'x' })

    const updated = await call('project_update', {
      project: '旧名',
      name: '新名',
      set_fields: { '负责人': '张三' },
      remove_fields: ['旧字段'],
    }) as { project: { name: string; fields: Record<string, unknown> }; changes: readonly string[] }

    expect(updated.project.name).toBe('新名')
    expect(updated.project.fields).toEqual({ '负责人': '张三' })
    expect(updated.changes).toHaveLength(3)

    const stored = service.list()[0]
    expect(stored?.name).toBe('新名')
    expect(stored?.fieldCount).toBe(1)
  })

  it('archives instead of deleting when asked to', async () => {
    const { call, seed, service } = bench()
    await seed('proj', '')

    await call('project_update', { project: 'proj', archived: true })

    expect(service.list()).toHaveLength(0)
    expect(service.list({ includeArchived: true })[0]?.archived).toBe(true)
  })

  it('deletes a project and every field row it owned', async () => {
    const { call, seed, service, fields } = bench()
    await seed('proj', '', { a: 1, b: 2 })
    expect(fields.rows.size).toBe(2)

    const removed = await call('project_delete', { project: 'proj' }) as { removed: string; removed_fields: number }

    expect(removed).toEqual({ removed: 'proj', removed_fields: 2 })
    expect(service.list()).toHaveLength(0)
    expect(fields.rows.size).toBe(0)
  })

  it('refuses arguments that are not the shape it declared', async () => {
    const { call } = bench()

    await expect(call('project_create', { name: '  ' })).rejects.toThrow(/name must be/)
    await expect(call('project_create', { name: 'x', fields: ['not', 'a', 'map'] }))
      .rejects.toThrow(/fields must be an object/)
    await expect(call('project_create', null)).rejects.toThrow(/expects an object/)
  })

  it('renders the value the model reads, not a JSON dump', async () => {
    const { tool, seed } = bench()
    await seed('用友 NCC 客开', 'NCC-1', { '环境信息': '10.0.0.1' })
    const value = await tool('project_list').execute({}, execution('project_list', {}))

    const blocks = tool('project_list').output.render({}, value)

    expect(blocks[0]?.type).toBe('text')
    expect(blocks[0]?.text).toContain('用友 NCC 客开')
    expect(blocks[0]?.text).toContain('NCC-1')
    expect(blocks[0]?.text).toContain('1 个字段')
  })
})

describe('write previews', () => {
  let service: YonProjectsService

  beforeEach(async () => {
    const mounted = bench()
    service = mounted.service
    await mounted.seed('用友 NCC 客开', 'NCC-1', { '环境信息': '10.0.0.1' })
  })

  it('describes a creation without a store round trip', () => {
    const preview = previewWrite(service, 'project_create', {
      name: '新项目',
      code: 'NEW-1',
      status: 'paused',
      fields: { '负责人': '张三' },
    })

    expect(preview).toBe([
      '新建项目「新项目」',
      '· 编码：NEW-1',
      '· 状态：已暂停',
      '· 初始字段「负责人」= 张三',
    ].join('\n'))
  })

  it('describes archiving as its own line', () => {
    const preview = previewWrite(service, 'project_update', { project: 'NCC-1', archived: true })

    expect(preview).toBe('修改项目「用友 NCC 客开」：\n· 归档这个项目（默认列表里不再出现）')
  })

  it('has nothing to say about a call it cannot parse', () => {
    expect(previewWrite(service, 'project_create', { name: 'x', fields: 'nope' })).toBeUndefined()
    expect(previewWrite(service, 'project_update', {})).toBeUndefined()
    expect(previewWrite(service, 'project_update', { project: '不存在', name: 'x' })).toBeUndefined()
    expect(previewWrite(service, 'project_list', {})).toBeUndefined()
  })

  it('truncates a value too long to read in a prompt', () => {
    const long = 'x'.repeat(200)
    const preview = previewWrite(service, 'project_update', {
      project: '用友 NCC 客开',
      set_fields: { '备注': long },
    })

    expect(preview).toContain('…')
    expect(preview?.length).toBeLessThan(long.length)
  })
})
