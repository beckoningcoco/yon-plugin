/**
 * 迭代表板给模型的那两个工具：能记什么、读回来是什么样，以及——最要紧的那半——
 * **它做不到什么**。
 *
 * 工具的权限正好是「写一条现场笔记」：只能追加。最后一条用例钉住这一点：这个族
 * 只有两个名字，将来谁想加 `iteration_update` / `iteration_remove`，那条用例会红。
 * 模型若能自己把一条标成「已修复」，它就成了本功能专门要挡掉的那个角色——一个
 * 自治的产品负责人。
 *
 * 台账一律建在临时目录里；默认路径是使用者自己的台账，用例往那儿写就等于在跑测试
 * 的机器上留笔记。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIterationStore } from '../src/host/iteration-store.ts'
import { createYonIterationService, type YonIterationService } from '../src/host/iteration-service.ts'
import { ITERATION_TOOL_NAMES, registerYonIterationTools } from '../src/host/iteration-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

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

/**
 * Mount the ledger's tools over a scratch document.
 * @param seed - lines written into the document before the tools see it; omitted
 * means the document does not exist yet.
 * @returns the registry, the service, the tools by name, and the two callers.
 */
async function bench(seed?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'yon-iteration-tools-'))
  temporary.push(dir)
  const path = join(dir, 'iteration.json')
  if (seed !== undefined) await writeFile(path, seed, 'utf8')

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)

  const service = createYonIterationService(createIterationStore(path))
  const dispose = registerYonIterationTools(ctx, service)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  /** Run one call and return the value, not the rendered text. */
  const call = async (name: string, args: unknown): Promise<Record<string, never> & Record<string, unknown>> =>
    await tool(name).execute(args, execution(name)) as Record<string, never> & Record<string, unknown>

  /** Run one call and return the text the model would read. */
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }

  return { registered, service, path, tool, call, render, dispose }
}

describe('iteration tools', () => {
  it('registers exactly the two declared names', async () => {
    const { registered, dispose } = await bench()
    expect(registered.map(definition => definition.name)).toEqual([...ITERATION_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(200)
      expect(definition.parameters).toMatchObject({ type: 'object', additionalProperties: false })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
    dispose()
    expect(registered).toHaveLength(0)
  })

  it('offers the model nothing that changes or deletes a row', async () => {
    const { registered } = await bench()
    // 这是本功能的立身之本，不是实现细节：模型只能追加。状态、优先级、删除都在
    // 面板里，由人做。将来加第三个工具时这条用例会红，那正是它存在的理由。
    expect([...ITERATION_TOOL_NAMES]).toEqual(['iteration_add', 'iteration_list'])
    for (const definition of registered) {
      expect(definition.name).not.toMatch(/update|remove|delete|status|fixed/)
    }
  })

  it('says in both descriptions that the rows are not a to-do list', async () => {
    const { tool } = await bench()
    // 提示词里也钉了同样的话（`prompt.spec.ts`）；工具描述是模型真正逐字读到的那份。
    expect(tool('iteration_list').description).toContain('NOT a to-do list')
    expect(tool('iteration_list').description).toContain('do not rank')
    expect(tool('iteration_add').description).toContain('a notebook, not a fix')
    expect(tool('iteration_add').description).toContain('Do not change the plugin')
  })

  it('carries the fifth hard signal, so the two thresholds cannot drift', async () => {
    const { tool } = await bench()
    // 提示词里的第五条硬信号是「某个工具给的答案看着笃定但事后发现是错的」
    // （`prompt.spec.ts`）。模型是在**决定要不要调用**的那一刻读这份描述的，所以
    // 只改提示词会让它在描述里找不到这一条，从而把自己劝退——两个门槛必须同一份。
    expect(tool('iteration_add').description).toContain('answered confidently and turned out to be wrong')
    expect(tool('iteration_add').description).toContain('did not line up')
  })
})

describe('iteration_add', () => {
  it('files a row from kind and symptom alone', async () => {
    const { call, service } = await bench()
    const value = await call('iteration_add', { kind: 'gap', symptom: '为了拿到表名绕了三步' })
    expect(value.created).toBe(true)

    const { rows } = await service.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.symptom).toBe('为了拿到表名绕了三步')
    // 宿主盖的时间戳与缺省的优先级，都是模型没传的那两项。
    expect(rows[0]?.severity).toBe('medium')
    expect(rows[0]?.status).toBe('open')
    expect(Number.isNaN(Date.parse(rows[0]?.at ?? ''))).toBe(false)
  })

  it('tells the model it filed a note and to carry on', async () => {
    const { render } = await bench()
    const report = await render('iteration_add', { kind: 'improvement', symptom: '这一步可以一次问全' })
    expect(report).toContain('【建议】已记下')
    expect(report).toContain('这一步可以一次问全')
    // 记录不是改动——这句话是模型返回后是否继续改插件的分界。
    expect(report).toContain('这是一条记录，不是一项改动')
    expect(report).toContain('回到手上的活')
  })

  it('answers a repeat with 「已经记过」 instead of a second row', async () => {
    const { render, service } = await bench()
    const args = { kind: 'gap', symptom: '同一件事', target: 'wiki_lookup' }
    await render('iteration_add', args)
    const report = await render('iteration_add', args)

    expect(report).toContain('已经记过这一条了')
    expect(report).not.toContain('已记下')
    expect((await service.list()).rows).toHaveLength(1)
  })

  it('refuses a bad kind or an empty symptom, naming what it wanted', async () => {
    const { call, service } = await bench()
    await expect(call('iteration_add', { kind: 'bug', symptom: 'x' })).rejects.toThrow(/gap 或 improvement/)
    await expect(call('iteration_add', { kind: 'gap', symptom: '   ' })).rejects.toThrow(/symptom/)
    await expect(call('iteration_add', null)).rejects.toThrow(/对象参数/)
    expect((await service.list()).rows).toEqual([])
  })

  it('leaves the severity vocabulary to the service, and surfaces its refusal', async () => {
    const { call } = await bench()
    // 工具不复制那张取值表；服务是唯一权威，它的拒绝带着三个合法取值回到模型面前。
    await expect(call('iteration_add', { kind: 'gap', symptom: 'x', severity: 'urgent' }))
      .rejects.toThrow(/high \/ medium \/ low/)
  })
})

describe('iteration_list', () => {
  it('shows the untriaged rows by default and everything when asked', async () => {
    const { call, service } = await bench()
    const open = await service.create({ kind: 'gap', symptom: '还开着的' })
    const closed = await service.create({ kind: 'gap', symptom: '已经修好的' })
    await service.update(closed.row.id, { status: 'fixed' })

    const defaults = await call('iteration_list', {})
    expect(defaults.count).toBe(1)
    expect(String(defaults.report)).toContain('还开着的')

    // 缺省若落到服务那一层的 `all`，模型每次翻台账都会被已关闭的行淹掉——那句
    // 「Defaults to the untriaged rows」就成了空话，所以这条用例盯的是缺省值本身。
    const everything = await call('iteration_list', { status: 'all' })
    expect(everything.count).toBe(2)
    expect(String(everything.report)).toContain('已经修好的')
    expect(open.row.status).toBe('open')
  })

  it('renders one row per line, with its id and the operator\'s own words for it', async () => {
    const { call, service } = await bench()
    const { row } = await service.create({
      kind: 'gap', symptom: '为了拿到表名绕了三步', target: 'wiki_lookup', severity: 'high',
    })
    const report = String((await call('iteration_list', {})).report)
    expect(report).toContain(`${row.id}  能力不足 · 高 · 待处理  为了拿到表名绕了三步（wiki_lookup）`)
    // 收尾那句每次都在：模型读完之后要做的是回到手上的活，不是开工。
    expect(report).toContain('这些是使用者的笔记，不是待办：不要据此开工，也不要替他排序。')
  })

  it('caps the screenful and says how many were left out', async () => {
    const { call, service } = await bench()
    for (let index = 0; index < 25; index += 1) {
      await service.create({ kind: 'gap', symptom: `第 ${index} 条` })
    }
    const page = await call('iteration_list', {})
    expect(page.count).toBe(20)
    expect(String(page.report)).toContain('共 25 条符合条件，这里显示 20 条')

    // 单次调用的上限也是硬的：模型不能要一屏 1000 行把上下文吃掉。
    expect((await call('iteration_list', { limit: 1000 })).count).toBe(25)
    expect((await call('iteration_list', { limit: 5 })).count).toBe(5)
  })

  it('narrows by kind', async () => {
    const { call, service } = await bench()
    await service.create({ kind: 'gap', symptom: '缺一步' })
    await service.create({ kind: 'improvement', symptom: '可以更快' })
    const gaps = await call('iteration_list', { kind: 'gap', status: 'all' })
    expect(gaps.count).toBe(1)
    expect(String(gaps.report)).toContain('缺一步')
  })

  it('says so plainly when there is nothing recorded', async () => {
    const { call } = await bench()
    const report = String((await call('iteration_list', {})).report)
    expect(report).toContain('台账里没有符合条件的记录。')
    expect(report).toContain('不是待办')
  })

  it('reports an unreadable ledger instead of throwing at the model', async () => {
    const { call } = await bench('{"rows": [{"id": "it-1", ')
    const value = await call('iteration_list', {})
    expect(value.count).toBe(0)
    // 读不出来是一件事，读出来是空的又是另一件事——模型必须能分清，否则它会
    // 以为没人记过，于是把同一件事再记一遍。
    expect(String(value.report)).toContain('台账读取失败')
    expect(String(value.report)).toContain('读不出来，所以这一屏看不到任何记录。')
  })
})
