/**
 * 被动召回：`project_read` 的返回值里带上这个项目的记忆。
 *
 * 这是整套设计里唯一「不依赖模型想起来去搜」的地方——它不知道它不知道的东西，
 * 所以记忆必须搭在一次它本来就会发的调用上回来。三条用例盯着这个机制的要害：
 * 带的是什么（只有标题与 id，不是正文）、凭什么带（只带这个项目的）、以及**带几次**
 * （一次会话一次：同一段文字重复六遍，模型会学着跳过去，那正好毁掉这段文字存在的
 * 理由）。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore } from '../src/host/memory-store.ts'
import { createYonMemoryService, type YonMemoryHints } from '../src/host/memory-service.ts'
import { registerYonProjectTools, type YonToolDefinition, type YonToolExecution } from '../src/host/tools.ts'
import { createYonProjectsService } from '../src/host/service.ts'
import type { ProjectFieldRow, ProjectRow, YonDomain } from '../src/host/domain.ts'
import type { JsonValue } from '../src/shared/types.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** Minimal `KvTable` stand-in backed by a Map, as `host-tools.spec.ts` uses. */
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

/** A session stand-in: this spec only needs its object identity. */
function session(): object {
  return { seq: 0, eventAt: () => undefined }
}

/** One recorded execution sharing one session, so a case can call twice in it. */
function execution(name: string, args: unknown, shared: object = session()): YonToolExecution {
  return {
    name,
    arguments: args,
    callId: 'call-1',
    signal: new AbortController().signal,
    agent: { session: shared as never },
  }
}

/** One project and its memory bank, over a scratch directory. */
async function bench(options: { readonly withMemory?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yon-memory-injection-'))
  temporary.push(dir)

  const ctx = new Context()
  const projects = fakeTable<string, ProjectRow>()
  const fields = fakeTable<string, ProjectFieldRow>()
  const domain = {
    name: 'yon_projects',
    table: (name: string) => (name === 'projects' ? projects : fields),
  } as unknown as YonDomain
  const handle = createYonProjectsService(ctx, domain)
  // The real backend emits this after each durable write; the stand-in does not, and
  // the store rebuilds its cached list from it. Without it the projects below exist in
  // the table and not in the service, so every lookup answers "no project matches".
  const durabilityOf = (key: string): void => {
    ctx.emit('domain/changed', {
      domain: 'yon_projects', table: 'projects', key, operation: 'put', value: {},
    } as never)
  }
  const water = await handle.service.create({ name: '水投', code: 'shuitou' })
  durabilityOf(water.projectId)
  const sky = await handle.service.create({ name: '天九', code: 'tianjiu' })
  durabilityOf(sky.projectId)

  const memory = createYonMemoryService(createMemoryStore(dir), handle.service)
  await memory.create({
    project: '水投',
    title: '达梦下按时间范围查询必须走索引',
    body: '不带时间范围时全表扫。',
    source: '实测于 2026-10-05 会话',
    type: 'pitfall',
  })
  await memory.create({
    project: '天九',
    title: '这个环境用的是达梦 8',
    body: '不是 Oracle。',
    source: '登记环境时看到',
    type: 'env-fact',
  })

  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)

  const hints: YonMemoryHints = memory
  const dispose = registerYonProjectTools(ctx, handle.service, options.withMemory === false ? undefined : hints)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  /** One call, returning both the value and the text the model would read. */
  const read = async (
    exec: YonToolExecution,
  ): Promise<{ memories: readonly { id: string; type: string; title: string }[]; text: string }> => {
    const value = await tool('project_read').execute({ project: '水投' }, exec) as {
      memories: readonly { id: string; type: string; title: string }[]
    }
    const text = tool('project_read').output.render({}, value).map(block => block.text).join('\n')
    return { memories: value.memories, text }
  }

  return { memory, service: handle.service, read, dispose }
}

describe('the memory a project read carries', () => {
  it('brings this project\'s memories, as titles, into a call the model already makes', async () => {
    const { read } = await bench()

    const { memories, text } = await read(execution('project_read', { project: '水投' }))

    expect(memories).toHaveLength(1)
    expect(memories[0]?.title).toBe('达梦下按时间范围查询必须走索引')
    expect(memories[0]?.type).toBe('pitfall')
    // 正文不进来：注入的是路牌，不是那条记忆本身。
    expect(text).not.toContain('不带时间范围时全表扫')
    expect(text).toContain('[坑] 达梦下按时间范围查询必须走索引')
  })

  it('carries nothing from another project', async () => {
    const { read } = await bench()

    const { memories, text } = await read(execution('project_read', { project: '水投' }))

    expect(memories.map(memory => memory.title)).not.toContain('这个环境用的是达梦 8')
    expect(text).not.toContain('这个环境用的是达梦 8')
  })

  it('shows a session each project once, and not once per call', async () => {
    // 同一段文字在一次会话里重复出现，模型会学会跳过去——那正是这段注入唯一的失败方式。
    const { read } = await bench()
    const exec = execution('project_read', { project: '水投' })

    expect((await read(exec)).memories).toHaveLength(1)
    expect((await read(exec)).memories).toHaveLength(0)

    // 换个会话（新的 session 对象）就该重新带上：那是另一个上下文，它还没见过。
    expect((await read(execution('project_read', { project: '水投' }))).memories).toHaveLength(1)
  })

  it('says nothing at all when there is no memory bank', async () => {
    // 少一个域时，工具本身照旧能用：注入是附加物，不是前提。
    const { read } = await bench({ withMemory: false })

    const { memories, text } = await read(execution('project_read', { project: '水投' }))

    expect(memories).toEqual([])
    // 空的时候连标题行都不出现：一句「本项目暂无记忆」会在每次读每个项目时都出现，
    // 而读页上的噪声正是教人略读的原因。
    expect(text).not.toContain('记忆')
  })

  it('says nothing when the call has no session to attribute the hint to', async () => {
    const { read } = await bench()
    // 直接派发（没有 agent）时无从判断这个上下文已经看过什么，于是什么都不给。
    const { name, arguments: argv, callId, signal } = execution('project_read', { project: '水投' })
    const { memories } = await read({ name, arguments: argv, callId, signal })

    expect(memories).toEqual([])
  })
})
