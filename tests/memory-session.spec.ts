/**
 * 会话登记处与它算出来的那一行：谁记得住「现在在哪个项目上」，以及去重是按什么算的。
 *
 * 这一层没有文件系统、没有时钟，测的是三条规则：没有会话时什么都不做、一个会话对一个项目
 * 只提示一次、以及提示并进值里之后原值一个字段都没少（那四个工具的输出契约还得成立）。
 */
import { describe, expect, it } from 'vitest'
import {
  createYonMemorySession, memoryHintLine, withMemoryHint, type MemoryHintLine,
} from '../src/host/memory-session.ts'
import type { YonToolExecution } from '../src/host/tools.ts'

/** A session stand-in: this suite only needs its object identity. */
const session = (): object => ({ seq: 0, eventAt: () => undefined })

/** One recorded execution, optionally without a session. */
function execution(withSession: object | undefined): YonToolExecution {
  return {
    name: 'datasource_query',
    arguments: {},
    callId: 'call-1',
    signal: new AbortController().signal,
    ...withSession === undefined ? {} : { agent: { session: withSession as never } },
  }
}

describe('the memory session registry', () => {
  it('remembers which project a session resolved to', () => {
    const registry = createYonMemorySession()
    const one = session()

    expect(registry.current(one)).toBeUndefined()
    registry.note(one, 'prj-water')
    expect(registry.current(one)).toBe('prj-water')
    // 换一个会话就是另一件事：项目是模型推断出来的，不是全局状态。
    expect(registry.current(session())).toBeUndefined()
  })

  it('does nothing at all without a session', () => {
    // 直接派发没有「这一次对话」可归属，猜一个会把别人的项目当成它的。
    const registry = createYonMemorySession()

    registry.note(undefined, 'prj-water')

    expect(registry.current(undefined)).toBeUndefined()
    expect(registry.claim(undefined, 'prj-water')).toBe(false)
  })

  it('claims a project once per session, and once per project', () => {
    const registry = createYonMemorySession()
    const one = session()
    const other = session()

    expect(registry.claim(one, 'prj-water')).toBe(true)
    expect(registry.claim(one, 'prj-water')).toBe(false)
    // 另一个项目是这个会话还没见过的，另一个会话则整个是新的。
    expect(registry.claim(one, 'prj-sky')).toBe(true)
    expect(registry.claim(other, 'prj-water')).toBe(true)
  })

  it('leaves the value untouched when there is nothing to add', async () => {
    const value = { ok: true, output: 'rows' }
    const silent: MemoryHintLine = async () => undefined

    // 没有记忆服务的部署、没有项目的会话、没有记忆的项目，走的都是这条路：值原样返回，
    // 连一个 memoryHint 键都不多出来。
    expect(await withMemoryHint(value, undefined, execution(session()))).toBe(value)
    expect(await withMemoryHint(value, silent, execution(session()))).toBe(value)
    expect(Object.keys(await withMemoryHint(value, silent, execution(session())))).toEqual(['ok', 'output'])
  })

  it('adds the line without disturbing what the tool answered', async () => {
    const value = { ok: true, output: 'rows' }
    const loud: MemoryHintLine = async () => '本项目记着 3 条记忆。'

    const withLine = await withMemoryHint(value, loud, execution(session()))

    expect(withLine).toEqual({ ok: true, output: 'rows', memoryHint: '本项目记着 3 条记忆。' })
    // 原来的对象没被改：调用方还可能握着它。
    expect(value).toEqual({ ok: true, output: 'rows' })
  })

  it('renders the line as its own paragraph, or not at all', () => {
    expect(memoryHintLine({ memoryHint: '本项目记着 3 条记忆。' })).toBe('\n\n本项目记着 3 条记忆。')
    expect(memoryHintLine({ memoryHint: '' })).toBe('')
    expect(memoryHintLine({})).toBe('')
    // 一个把手写坏的值不该让整条回答炸掉：读不出来就当没有。
    expect(memoryHintLine(null)).toBe('')
    expect(memoryHintLine('nonsense')).toBe('')
    expect(memoryHintLine({ memoryHint: 42 })).toBe('')
  })
})
