// @vitest-environment jsdom
/**
 * 抓表时的两个「这不是全部」信号。
 *
 * 为什么值得单独守：一份**只渲染了可视区**的报表和一份完整的表，在返回值里长得一模一样。
 * 实测（NCC 报表数据查询页）：DOM 里 68 行、组件实例里 114 行——工具若不说，调用者拿到的
 * 就是一个看上去确定的错数，还会拿它去算合计、去数行数。所以这里守的不是"抓得对"，而是
 * **抓不全的时候有没有说**。
 *
 * 两个信号都在页面里算（要 DOM、要 fiber），所以它们是 `PAGE_HELPERS` 的一部分，在 jsdom
 * 里 eval 出来直接喂。jsdom 不做布局：`scrollHeight`/`clientHeight` 恒为 0，容器几何按真实
 * 报表上量到的数字手工给（2587 / 707），fiber 也按 React 挂的那个形状手工造。
 */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_HELPERS } from '../src/host/browser-interact.ts'
import { registerYonBrowserTools } from '../src/host/browser-tools.ts'
import type { YonBrowserCdpService } from '../src/host/browser-cdp-service.ts'
import type { YonToolDefinition } from '../src/host/tools.ts'

/** One truncation verdict, as `rowsTruncation` returns it. */
interface Truncation {
  readonly source: 'hot' | 'scroll'
  readonly shown: number
  readonly total?: number
  readonly contentHeight?: number
  readonly visibleHeight?: number
}

/** Run one page helper in this DOM. */
function helper<T>(name: string): T {
  const evaluate = eval as (source: string) => unknown
  return evaluate(`(() => { ${PAGE_HELPERS}; return ${name} })()`) as T
}

afterEach(() => { document.body.innerHTML = '' })

/**
 * A table inside a container that scrolls: three rows rendered, a much taller content.
 * @returns the first row, which is what the helper is handed.
 */
function scrollableTable(withHandsontable: boolean): { row: Element; host: HTMLElement } {
  const host = document.createElement('div')
  if (withHandsontable) host.className = 'handsontable'
  host.style.overflowY = 'auto'
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  for (let i = 0; i < 3; i += 1) {
    const tr = document.createElement('tr')
    tr.innerHTML = '<td>x</td>'
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  host.appendChild(table)
  document.body.appendChild(host)
  // jsdom lays nothing out, so the geometry the real page reported is given by hand.
  Object.defineProperty(host, 'scrollHeight', { value: 2587, configurable: true })
  Object.defineProperty(host, 'clientHeight', { value: 707, configurable: true })
  return { row: tbody.rows[0] as Element, host }
}

/** Hang a Handsontable instance off the container the way React does: on the fiber. */
function attachHotInstance(host: HTMLElement, totalRows: number): void {
  const hotInstance = { getData: () => new Array(totalRows).fill([]) as unknown[][] }
  const fiber = { stateNode: { hotInstance }, return: null }
  ;(host as unknown as Record<string, unknown>)['__reactFiber$spec'] = fiber
}

describe('rowsTruncation', () => {
  it('reads the real row count out of the component instance', () => {
    // 最准的一路：fiber.stateNode.hotInstance.getData().length —— 实测 68 行 DOM / 114 行数据。
    const { row, host } = scrollableTable(true)
    attachHotInstance(host, 114)

    expect(helper<(row: Element, n: number) => Truncation | null>('rowsTruncation')(row, 68))
      .toEqual({ source: 'hot', shown: 68, total: 114 })
  })

  it('says nothing when the component instance agrees with the DOM', () => {
    // 实例说 3 行、DOM 也是 3 行：没有证据说明缺了什么，就不该报。
    const { row, host } = scrollableTable(true)
    attachHotInstance(host, 3)

    expect(helper<(row: Element, n: number) => Truncation | null>('rowsTruncation')(row, 3)).toBeNull()
  })

  it('falls back to the scroll container, and does not invent a row count', () => {
    // 没有实例可问时只知道"内容比可视区高"。行数**不报**：这套表格量出来的行高是 0，
    // 按高度折算会给出一个编出来的数字，那正是这个工具最不该做的事。
    const { row } = scrollableTable(false)

    expect(helper<(row: Element, n: number) => Truncation | null>('rowsTruncation')(row, 3))
      .toEqual({ source: 'scroll', shown: 3, contentHeight: 2587, visibleHeight: 707 })
  })

  it('says nothing about an ordinary table that is not scrolled', () => {
    const table = document.createElement('table')
    table.innerHTML = '<tbody><tr><td>x</td></tr></tbody>'
    document.body.appendChild(table)

    const row = table.querySelector('tr') as Element
    expect(helper<(row: Element, n: number) => Truncation | null>('rowsTruncation')(row, 1)).toBeNull()
  })
})

describe('rowsInFrames', () => {
  it('points at a same-origin frame when the top document matched nothing', () => {
    // NCC 工作台把业务页整个装在一个 iframe 里，而抓取跑在主文档里：顶层 0 行，
    // 而 iframe 里有一整张表（实测 68 行）。不指出来，这一步就是静默地少掉整张表。
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const inner = frame.contentDocument
    if (inner === null) throw new Error('jsdom gave the frame no document')
    inner.body.innerHTML = '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>'

    const found = helper<(selector: string) => { url: string; rows: number }[]>('rowsInFrames')('tbody tr')

    expect(found).toHaveLength(1)
    expect(found[0]?.rows).toBe(2)
  })

  it('does not mention a frame that has no match', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const inner = frame.contentDocument
    if (inner === null) throw new Error('jsdom gave the frame no document')
    inner.body.innerHTML = '<div>没有表</div>'

    expect(helper<(selector: string) => unknown[]>('rowsInFrames')('tbody tr')).toEqual([])
  })
})

/** One page, as the tool would name it in prose. */
const PAGE = {
  targetId: 'target-1',
  index: 0,
  title: '报表数据查询',
  url: 'http://10.10.10.71:9003/nccloud/resources/workbench/',
  ours: false,
}

/** The registered `browser_scrape`, whose render half is what these cases read. */
function scrapeTool(): YonToolDefinition {
  const registered: YonToolDefinition[] = []
  const ctx = {
    tools: {
      register: (definition: YonToolDefinition): (() => void) => {
        registered.push(definition)
        return () => undefined
      },
    },
  } as unknown as Context
  // 只读 render，所以服务一旦被碰到就该炸——那比一个安静答话的替身更能说明问题。
  const cdp = new Proxy({} as YonBrowserCdpService, {
    get: () => () => { throw new Error('render-only test') },
  })
  registerYonBrowserTools(ctx, cdp)
  const found = registered.find(definition => definition.name === 'browser_scrape')
  if (found === undefined) throw new Error('browser_scrape 没有注册')
  return found
}

/** Render one scrape value the way the model would read it. */
function renderScrape(value: unknown): string {
  return scrapeTool().output.render({}, value).map(block => block.text).join('\n')
}

describe('what the answer says about a slice', () => {
  it('names the real row count when the component instance gave one', () => {
    const text = renderScrape({
      page: PAGE,
      rows: [{ 项目: '一' }],
      count: 68,
      truncated: false,
      truncation: { source: 'hot', shown: 68, total: 114 },
    })

    expect(text).toContain('可视区域')
    expect(text).toContain('114')
    expect(text).toContain('getData()')
  })

  it('says the rows cannot even be counted when only the container was measurable', () => {
    const text = renderScrape({
      page: PAGE,
      rows: [{ a: '1' }],
      count: 3,
      truncated: false,
      truncation: { source: 'scroll', shown: 3, contentHeight: 2587, visibleHeight: 707 },
    })

    expect(text).toContain('可视区域')
    expect(text).toContain('2587')
    expect(text).toContain('读接口')
  })

  it('points at the frame instead of blaming the selector', () => {
    const text = renderScrape({
      page: PAGE,
      rows: [],
      count: 0,
      truncated: false,
      frames: [{ url: 'http://10.10.10.71:9003/nccloud/resources/epmp/epm_p/bgrDataCenter/que', rows: 68 }],
    })

    expect(text).toContain('iframe')
    expect(text).toContain('68')
    // 这一屏的问题不是选择器写错了，就不该说那句话。
    expect(text).not.toContain('选择器真的匹配每一行')
  })

  it('stays quiet about an ordinary complete table', () => {
    const text = renderScrape({ page: PAGE, rows: [{ a: '1' }], count: 1, truncated: false })

    expect(text).not.toContain('⚠')
  })
})
