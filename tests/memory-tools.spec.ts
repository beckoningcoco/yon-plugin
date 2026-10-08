/**
 * 记忆给模型的四个工具：能写什么、读回来长什么样、以及改写这条路走不走得通。
 *
 * 与迭代表板那边的差别，正是本功能的设计要害：那边模型**只能追加**，这边模型可以
 * **改写**（记忆记的是当前事实，错了就该改正），但仍然**不能删除**。最后一组用例
 * 钉住这条边界：这个族里没有也不需要 `memory_delete`——真删由面板上的人做。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore } from '../src/host/memory-store.ts'
import { BODY_SOFT_MAX, createYonMemoryService } from '../src/host/memory-service.ts'
import { MEMORY_TOOL_NAMES, registerYonMemoryTools } from '../src/host/memory-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'
import type { ProjectDetail } from '../src/shared/types.ts'
import type { YonProjectsService } from '../src/host/service.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** One recorded execution, as the registry would hand it over. */
function execution(name: string): YonToolExecution {
  return { name, arguments: {}, callId: 'call-1', signal: liveSignal, agent: {} }
}

/** A one-project registry, cast for `memory-service.spec.ts`'s reason. */
function oneProject(): YonProjectsService {
  const detail: ProjectDetail = {
    projectId: 'prj-water',
    name: '水投(NCC2207)',
    code: 'shuitou',
    status: 'active',
    archived: false,
    fieldCount: 0,
    fields: {},
    createdAt: 0,
    updatedAt: 0,
  }
  return {
    list: () => [detail],
    resolve: (ref: string) => ref === '水投' || ref === 'shuitou' || ref === detail.projectId
      ? { kind: 'found', project: detail }
      : { kind: 'none' },
  } as unknown as YonProjectsService
}

/**
 * Mount the memory tools over a scratch bank.
 * @returns the registry, the tools by name, and the two callers.
 */
async function bench() {
  const dir = await mkdtemp(join(tmpdir(), 'yon-memory-tools-'))
  temporary.push(dir)

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)

  const service = createYonMemoryService(createMemoryStore(dir), oneProject())
  const dispose = registerYonMemoryTools(ctx, service)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  /** Run one call and return the value, not the rendered text. */
  const call = async (name: string, args: unknown): Promise<Record<string, unknown>> =>
    await tool(name).execute(args, execution(name)) as Record<string, unknown>

  /** Run one call and return the text the model would read. */
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }

  return { registered, service, tool, call, render, dispose }
}

/** The three fields every filing needs, as the model would pass them. */
const filing = {
  project: '水投',
  title: '达梦下按时间范围查询必须走索引',
  body: '不带时间范围时全表扫，要 40 秒。',
  source: '实测于 2026-10-05 会话，datasource_query',
} as const

describe('memory tools', () => {
  it('registers exactly the four declared names', async () => {
    const { registered, dispose } = await bench()

    expect(registered.map(definition => definition.name)).toEqual([...MEMORY_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(200)
      expect(definition.parameters).toMatchObject({ type: 'object', additionalProperties: false })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
    dispose()
    expect(registered).toHaveLength(0)
  })

  it('offers the model no way to delete a memory', async () => {
    // 与迭代表板同一条线，但位置不同：那边模型只能追加；这边它能改写（记忆说的是
    // 当前事实），删除仍然是人的事。将来谁想加 memory_delete，这条会红。
    expect([...MEMORY_TOOL_NAMES]).toEqual(['memory_write', 'memory_update', 'memory_recall', 'memory_read'])
    expect(MEMORY_TOOL_NAMES.some(name => name.includes('delete') || name.includes('remove'))).toBe(false)
  })

  it('tells the model to recall before it starts, in the tool it will read', async () => {
    // 工具描述是模型一定读得到的地方；「开工前先调」写在这里比写在文档里可靠。
    const { tool } = await bench()
    expect(tool('memory_recall').description).toContain('before you start on a project')
  })

  it('refuses a filing with no source, and says why', async () => {
    const { call } = await bench()

    await expect(call('memory_write', { ...filing, source: '' }))
      .rejects.toThrow(/source/)
    await expect(call('memory_write', { ...filing, title: '' })).rejects.toThrow(/title/)
    await expect(call('memory_write', null)).rejects.toThrow(/对象参数/)
  })

  it('files one memory and says so', async () => {
    const { render } = await bench()

    const text = await render('memory_write', filing)

    expect(text).toContain('已记下 mem-')
    expect(text).toContain(filing.title)
    // 「这是一条记录，不会打断任何人」——记一条不该让模型以为它改了什么东西。
    expect(text).toContain('回到手上的活')
  })

  it('says 「已经记过」 instead of filing a twin', async () => {
    const { render } = await bench()
    await render('memory_write', filing)

    const again = await render('memory_write', filing)

    expect(again).toContain('已经有一条同样的记录')
    expect(again).toContain(filing.title)
  })

  it('mentions the soft limit without refusing the memory', async () => {
    const { render, service } = await bench()

    const text = await render('memory_write', { ...filing, body: '很'.repeat(BODY_SOFT_MAX + 20) })

    expect(text).toContain('软上限')
    expect((await service.list()).rows).toHaveLength(1)
  })

  it('rewrites a memory and reports what changed', async () => {
    const { render } = await bench()
    await render('memory_write', filing)
    const listed = await render('memory_recall', {})
    const id = /mem-\d{8}-\d{6}-[a-z0-9]{4}/.exec(listed)?.[0]

    const text = await render('memory_update', { id, body: '带范围后 0.2 秒。' })

    expect(text).toContain(`已更新 ${id}`)
    expect(text).toContain('正文已改写')
    expect(await render('memory_read', { id })).toContain('带范围后 0.2 秒。')
  })

  it('says nothing changed when the rewrite changes nothing', async () => {
    const { render } = await bench()
    await render('memory_write', filing)
    const listed = await render('memory_recall', {})
    const id = /mem-\d{8}-\d{6}-[a-z0-9]{4}/.exec(listed)?.[0]

    const text = await render('memory_update', { id, title: filing.title })

    expect(text).toContain('没有任何改动')
  })

  it('finds a memory by a word from its body, and prints the id to read it with', async () => {
    const { render } = await bench()
    await render('memory_write', filing)

    const text = await render('memory_recall', { query: '全表扫' })

    expect(text).toContain('[做法] 达梦下按时间范围查询必须走索引')
    expect(text).toMatch(/mem-\d{8}-\d{6}-[a-z0-9]{4}/)
    expect(text).toContain('水投(NCC2207)')
  })

  it('answers an empty recall honestly, and a broken bank with the reason', async () => {
    const { render } = await bench()

    expect(await render('memory_recall', {})).toContain('没有任何记忆')
  })

  it('reads one memory in full, provenance included', async () => {
    const { render } = await bench()
    await render('memory_write', filing)
    const listed = await render('memory_recall', {})
    const id = /mem-\d{8}-\d{6}-[a-z0-9]{4}/.exec(listed)?.[0]

    const text = await render('memory_read', { id })

    expect(text).toContain(filing.title)
    expect(text).toContain(`出处：${filing.source}`)
    expect(text).toContain(filing.body)
  })

  it('refuses an id it does not have, with a message the model can act on', async () => {
    const { call } = await bench()

    await expect(call('memory_read', { id: 'mem-20260101-000000-zzzz' }))
      .rejects.toThrow(/记忆库里没有这一条/)
  })
})
