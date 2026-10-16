/**
 * 那一行计数提示真的到了模型的眼前。
 *
 * `memory-session.spec.ts` 测的是这一行的**规则**（谁记得住项目、去重怎么算），这里测的是
 * **接线**：三个工具族在拿到一个提示函数之后，它那句话确实出现在渲染出来的文本里；没拿到
 * 的时候一个字都不多。
 *
 * 为什么值得单测一层：注入的写法是把提示并进返回值、再在包装器的 render 里拼上去（四个模块
 * 各一份包装器），这条链上有两处都容易少接一根线，而两边都不报错——只是模型永远看不到那
 * 句话。类型检查只能证明参数对得上。
 *
 * `bip_meta_find` 不在这里：它要加载随包的快照，代价与它证明的东西不成比例，而它的包装器与
 * 另外三个是同一段代码。
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonDataSourceTools } from '../src/host/datasource-tools.ts'
import { registerYonWikiTools } from '../src/host/wiki-tools.ts'
import { registerYonMetaTools } from '../src/host/meta-tools.ts'
import { schemaViolations } from './output-schema.ts'
import type { MemoryHintLine } from '../src/host/memory-session.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** The line every case here pretends a project has earned. */
const LINE = '本项目记着 3 条记忆（memory_recall 可查，memory_read 读全文）。'

/** A session stand-in: this suite only needs its object identity. */
const session = (): object => ({ seq: 0, eventAt: () => undefined })

/** One recorded execution. */
function execution(): YonToolExecution {
  return {
    name: 'x',
    arguments: {},
    callId: 'call-1',
    signal: new AbortController().signal,
    agent: { session: session() as never },
  }
}

/** Mount one family's tools over a recording registry. */
function bench(register: (ctx: Context, service: never, hint?: MemoryHintLine) => () => void, service: unknown, hint?: MemoryHintLine) {
  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)
  register(ctx, service as never, hint)
  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }
  /** Run one call and return the text the model would read. */
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await tool(name).execute(args, execution())
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }
  /** Run one call and return the raw value beside the schema it has to satisfy. */
  const raw = async (name: string, args: unknown): Promise<{ value: unknown; schema: Record<string, unknown> }> => ({
    value: await tool(name).execute(args, execution()),
    schema: tool(name).output.schema as Record<string, unknown>,
  })
  return { render, raw }
}

/**
 * The datasource family takes the project store as well, because a write can bind a
 * connection to a project by name. This suite binds nothing, so the stub is empty —
 * and the family stays callable through the same three-argument shape the other two
 * use here.
 * @param ctx - the recording context.
 * @param service - the datasource service stand-in.
 * @param hint - the hint line to inject, when the case wants one.
 * @returns the family's disposer.
 */
function dataSourceTools(
  ctx: Context,
  service: never,
  hint?: MemoryHintLine,
): () => void {
  return registerYonDataSourceTools(ctx, service, {} as never, hint)
}

/** The three services, each answering the least it can be asked for. */
const sources = {
  query: vi.fn(async () => ({ ok: true, configKey: '水投::test', env: 'test', output: 'ID\n1' })),
}
const wiki = {
  lookup: vi.fn(async () => ({ term: '订单', hits: [], indexAge: '刚刚', scanned: 0, unindexed: [] })),
}
const meta = {
  query: vi.fn(async () => ({
    home: 'home-1', version: '2312', kind: 'entity', term: '订单', total: 0,
    truncated: false, stale: false, entities: [], enums: [],
  })),
}

/** A hint that always fires, and one that never does. */
const loud: MemoryHintLine = async () => LINE
const silent: MemoryHintLine = async () => undefined

describe('the memory signpost the neighbouring tools carry', () => {
  it('appends the line to a datasource query', async () => {
    const withLine = await bench(dataSourceTools, sources, loud)
      .render('datasource_query', { key: '水投::test', sql: 'SELECT 1' })
    expect(withLine).toContain(LINE)

    const without = await bench(dataSourceTools, sources)
      .render('datasource_query', { key: '水投::test', sql: 'SELECT 1' })
    expect(without).not.toContain('memory_recall')
  })

  it('appends the line to a wiki lookup', async () => {
    const withLine = await bench(registerYonWikiTools, wiki, loud).render('wiki_lookup', { term: '订单' })
    expect(withLine).toContain(LINE)

    const without = await bench(registerYonWikiTools, wiki).render('wiki_lookup', { term: '订单' })
    expect(without).not.toContain('memory_recall')
  })

  it('appends the line to an NCC metadata lookup', async () => {
    const withLine = await bench(registerYonMetaTools, meta, loud)
      .render('ncc_meta_find', { home: 'home-1', kind: 'entity', q: '订单' })
    expect(withLine).toContain(LINE)

    const without = await bench(registerYonMetaTools, meta)
      .render('ncc_meta_find', { home: 'home-1', kind: 'entity', q: '订单' })
    expect(without).not.toContain('memory_recall')
  })

  it('says nothing when the hint has nothing to say', async () => {
    // 项目里一条记忆都没有、或者这个会话已经提示过：路牌不出现，而工具照常答话。
    const quiet = await bench(dataSourceTools, sources, silent)
      .render('datasource_query', { key: '水投::test', sql: 'SELECT 1' })
    expect(quiet).toContain('ID')
    expect(quiet).not.toContain('memory_recall')
  })

  it('keeps the injected field inside each tool\'s declared schema', async () => {
    // 这一行是**加**在值上的一个字段（`withMemoryHint`），而每个工具的输出 schema 是它自己
    // 声明的：哪一族一旦写上 additionalProperties: false，注入就不再是「多一句话」，而是
    // 「整个工具不可用」——宿主校验不过会丢掉整次调用，与 project_read 上发生过的一模一样
    // （那里多带的是记忆的字段）。所以每个接过这一行的工具都要在这里过一遍；`bip_meta_find`
    // 不在这里，与上面几个用例同一个理由。
    const families: ReadonlyArray<{
      readonly tool: string
      readonly args: unknown
      readonly mount: (ctx: Context, hint?: MemoryHintLine) => () => void
    }> = [
      {
        tool: 'datasource_query',
        args: { key: '水投::test', sql: 'SELECT 1' },
        mount: (ctx, hint) => dataSourceTools(ctx, sources, hint),
      },
      {
        tool: 'wiki_lookup',
        args: { term: '订单' },
        mount: (ctx, hint) => registerYonWikiTools(ctx, wiki, hint),
      },
      {
        tool: 'ncc_meta_find',
        args: { home: 'home-1', kind: 'entity', q: '订单' },
        mount: (ctx, hint) => registerYonMetaTools(ctx, meta, hint),
      },
    ]

    for (const family of families) {
      const { raw } = bench((ctx, _service, hint) => family.mount(ctx, hint), {} as never, loud)
      const answer = await raw(family.tool, family.args)
      expect((answer.value as { memoryHint?: string }).memoryHint, family.tool).toBe(LINE)
      expect(schemaViolations(answer.value, answer.schema), family.tool).toEqual([])
    }
  })
})
