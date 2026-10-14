/**
 * 旗舰版 API 文档那一对工具：编排、路标，以及它们怎么失败。
 *
 * 这里不碰真实环境——环境部分由 `bip-api.ts` 的页面脚本承担，而那段脚本的正确性只能
 * 在那个环境里验（它对 fetch、登录态和接口形状负责）。这个文件守的是**宿主侧那一半**：
 * 页面引用怎么选、路标什么时候记、落空时怎么作废重扫、详情按名字找要先走一轮查找、
 * 以及没有可用页面时说清楚而不是交一个空白答案。只有一条用例把那段脚本真的跑起来
 * （fetch 是记账的替身），它守的是**请求数**——图省掉的那几十次请求，别悄悄回来。
 *
 * 浏览器是一个照剧本回答的替身，所以每一次求值的表达式都留了下来——"第二次有没有带上
 * 路标""重扫时有没有把路标摘掉"这类事，只能从表达式本身看出来。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BipApiError, createBipApiRouteStore, detailExpression, findExpression, type FindRequest } from '../src/host/bip-api.ts'
import { createBipApiIndexStore, type Taxonomy, type TaxonomySnapshot } from '../src/host/bip-api-index.ts'
import { BIP_API_TOOL_NAMES, registerYonBipApiTools } from '../src/host/bip-api-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** These tools await a page round-trip; nothing here is cancellable. */
const liveSignal = new AbortController().signal

/** One page the fake browser reports. */
interface FakePage {
  readonly targetId: string
  readonly index: number
  readonly title: string
  readonly url: string
  readonly ours: boolean
}

const API_PAGE: FakePage = {
  targetId: 'T1', index: 0, title: '国投集团',
  url: 'https://erpbip.sdic.com.cn/iuap-ipaas-base/ucf-wh/console-fe/index.html', ours: false,
}

/** Temporary route documents this file made, removed after each case. */
const made: string[] = []

afterEach(async () => {
  while (made.length > 0) {
    const dir = made.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

/** A browser that replays a scripted list of answers and remembers every expression. */
function fakeCdp(answers: Array<Record<string, unknown> | Error>, pages: readonly FakePage[] = [API_PAGE]) {
  const seen: string[] = []
  const queue = [...answers]
  return {
    seen,
    queue,
    service: {
      async pages() {
        return { run: { id: 'run-1', label: 'edge' }, pages: [...pages] }
      },
      async evaluate(input: { readonly expression: string }) {
        seen.push(input.expression)
        const next = queue.shift()
        if (next === undefined) throw new Error('这台替身浏览器的剧本用完了')
        if (next instanceof Error) throw next
        return {
          page: API_PAGE,
          value: JSON.stringify(next),
          chars: 0,
          truncated: false,
        }
      },
    } as never,
  }
}

/** One answer from the page script: a find result with the given hits. */
function findAnswer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    origin: 'https://erpbip.sdic.com.cn',
    system: 'yonsuite',
    keyword: '销售订单保存',
    scanned: {
      products: 29, classifies: 120, groups: 1, truncated: false, viaRoute: false, viaSearch: false,
    },
    total: 0,
    hits: [],
    routes: [],
    ...overrides,
  }
}

/** One hit, as the page script reports it. */
const HIT = {
  apiId: 'dde3e06ebb8d4119aed9f118e17c2cdd',
  apiName: '销售订单单个保存',
  describe: '用于新增/修改时，保存销售订单单个数据的接口',
  category: '销售订单',
  productName: '销售服务',
  classifyId: 'C1',
  classifyName: '销售订单',
}

/** Mount the pair over a recording registry and a scripted browser. */
async function bench(
  answers: Array<Record<string, unknown> | Error>,
  pages: readonly FakePage[] = [API_PAGE],
) {
  const dir = await mkdtemp(join(tmpdir(), 'bip-api-spec-'))
  made.push(dir)
  const routes = createBipApiRouteStore(join(dir, 'routes.json'))
  // The map goes to the temporary directory too: without this, a case that builds one would
  // write into the operator's own `~/.dsh/yon-panel/bip-api-index.json`.
  const index = createBipApiIndexStore(join(dir, 'index.json'))
  const cdp = fakeCdp(answers, pages)
  const ctx = new Context()
  const tools = new Map<string, YonToolDefinition>()
  const dispose = vi.fn()
  ctx.provide('tools', {
    register: (definition: YonToolDefinition) => {
      tools.set(definition.name, definition)
      return dispose
    },
  } as never)
  const unmount = registerYonBipApiTools(ctx, cdp.service, routes, index)
  return { ctx, tools, dispose, unmount, cdp, routes, index, dir }
}

/** One call, as the registry would hand it over. */
function execution(name: string, args: unknown): YonToolExecution {
  return { name, arguments: args, callId: 'call-1', signal: liveSignal }
}

/** The text a call hands the model. */
async function answer(
  tools: Map<string, YonToolDefinition>,
  name: string,
  args: unknown,
): Promise<string> {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`not registered: ${name}`)
  const value = await definition.execute(args, execution(name, args))
  return definition.output.render(args, value).map(block => block.text).join('')
}

/** The error a call raises, or nothing when it unexpectedly succeeds. */
async function failure(
  tools: Map<string, YonToolDefinition>,
  name: string,
  args: unknown,
): Promise<unknown> {
  try {
    await answer(tools, name, args)
    return undefined
  } catch (error) {
    return error
  }
}

/** The map one full scan would have brought back, as the page reports it. */
const MAP = {
  products: [{ id: 'P1', name: '销售服务' }],
  classifies: [{
    id: 'C1',
    name: '销售订单',
    productId: 'P1',
    productName: '销售服务',
    // 分类名是模块级的（销售服务…），单据名只出现在接口名上——图里没有它，换个说法就得
    // 把每个分类的清单重拉一遍。
    apis: ['销售订单单个保存', '销售订单批量保存'],
  }],
}

/** The 定位图 as it would sit on disk, for a case that starts from a known environment. */
function mapSnapshot(overrides: Partial<TaxonomySnapshot> = {}): TaxonomySnapshot {
  return {
    origin: 'https://erpbip.sdic.com.cn',
    systemId: 'yonsuite',
    at: new Date().toISOString(),
    products: MAP.products,
    classifies: MAP.classifies,
    ...overrides,
  }
}

/** 被注入页面那段代码的回答，只声明跑脚本那条用例用到的字段。 */
interface PageFindAnswer {
  readonly total: number
  readonly hits: ReadonlyArray<{ readonly apiId: string, readonly apiName: string }>
  readonly scanned: {
    readonly viaIndex: boolean
    readonly viaApi: boolean
    readonly viaSearch: boolean
    readonly products: number
    readonly classifies: number
    readonly groups: number
  }
  readonly taxonomy?: Taxonomy
}

/**
 * 一个照剧本回答的环境，用来跑那段注入代码：控制台自己的目录树里两个云、两个服务、每个服务
 * 一个分类，接口名里带着单据名。
 *
 * 分类名是模块级的（销售服务），所以按分类名收不到「销售订单保存」这种网——这正是图上要记
 * 接口名的原因。清单那一路只认 `domainAppCode` + `treeNodeType`：用老的 `apiClassifyId`
 * 形状问，这个环境答的是空数组（实测如此，也是工具先前误报「不存在」的近因之一）。
 */
function catalogue(path: string): unknown {
  const name = path.split('?')[0] ?? path
  if (name === 'listIntegrateSys') {
    return [{
      id: 'yonsuite',
      name: '用友YonBIP',
      type: 'integrateSys',
      children: [
        {
          id: 'PFC',
          name: '应用平台',
          type: 1,
          children: [{
            id: 'P1',
            name: '销售服务',
            type: 2,
            children: [{ id: 'C1', name: '销售服务', code: 'C1', type: 3, children: [] }],
          }],
        },
        {
          id: 'FCC',
          name: '财务云',
          type: 1,
          children: [{
            id: 'P2',
            name: '客户管理',
            type: 2,
            children: [{ id: 'C2', name: '客户管理', code: 'C2', type: 3, children: [] }],
          }],
        },
      ],
    }]
  }
  if (name === 'groupApiByApiClassify') {
    if (!path.includes('domainAppCode=')) return []
    return path.includes('domainAppCode=C1')
      ? [{
        apiList: [
          { apiId: 'A1', apiName: '销售订单保存接口', describe: '保存销售订单' },
          { apiId: 'A2', apiName: '销售订单列表查询', describe: '查询销售订单' },
        ],
      }]
      : [{ apiList: [{ apiId: 'A3', apiName: '客户保存', describe: '保存客户' }] }]
  }
  return []
}

describe('the API-document tools', () => {
  it('registers both tools, and withdraws them on unmount', async () => {
    const mounted = await bench([])
    expect([...mounted.tools.keys()]).toEqual([...BIP_API_TOOL_NAMES])

    mounted.unmount()
    expect(mounted.dispose).toHaveBeenCalledTimes(BIP_API_TOOL_NAMES.length)
  })

  it('answers a first search from the environment, then remembers where to look', async () => {
    const mounted = await bench([findAnswer({ total: 1, hits: [HIT], routes: [{ classifyId: 'C1', classifyName: '销售订单', productId: 'P1', productName: '销售服务' }] })])
    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })

    expect(text).toContain('销售订单单个保存')
    expect(text).toContain('销售订单')
    // The first search carries no route, and it is the page that scanned the categories.
    expect(mounted.cdp.seen[0]).toContain('"keyword":"销售订单保存"')
    expect(mounted.cdp.seen[0]).not.toContain('"routes"')

    const hints = await mounted.routes.hints('https://erpbip.sdic.com.cn', '销售订单保存')
    expect(hints).toHaveLength(1)
    expect(hints[0]?.classifyId).toBe('C1')
  })

  it('reads a remembered phrase from one category, not the whole catalogue', async () => {
    const mounted = await bench([findAnswer({
      total: 1,
      hits: [HIT],
      routes: [{ classifyId: 'C1', classifyName: '销售订单' }],
    })])
    await mounted.routes.remember('https://erpbip.sdic.com.cn', '销售订单保存', [
      { classifyId: 'C1', classifyName: '销售订单' },
    ])

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(text).toContain('走了路标')
    expect(mounted.cdp.seen[0]).toContain('"routes"')
    expect(mounted.cdp.seen[0]).toContain('"C1"')
  })

  it('throws a stale route away and rescans when it comes back empty', async () => {
    // The route is an assumption, not a fact: when it stops holding, the answer must not be
    // "没有" — the scan is redone without it, and only then is the answer the model's.
    const mounted = await bench([
      findAnswer({ total: 0, hits: [], routes: [] }),
      findAnswer({ total: 1, hits: [HIT], routes: [{ classifyId: 'C1', classifyName: '销售订单' }] }),
    ])
    await mounted.routes.remember('https://erpbip.sdic.com.cn', '销售订单保存', [
      { classifyId: 'stale', classifyName: '已经不在了' },
    ])

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(mounted.cdp.seen).toHaveLength(2)
    expect(mounted.cdp.seen[0]).toContain('stale')
    expect(mounted.cdp.seen[1]).not.toContain('"routes"')
    expect(text).toContain('原路标落空，已作废并重扫')
    expect(text).toContain('销售订单单个保存')

    const hints = await mounted.routes.hints('https://erpbip.sdic.com.cn', '销售订单保存')
    expect(hints[0]?.classifyId).toBe('C1')
  })

  it('narrows from the environment map instead of listing every product again', async () => {
    // The map is what makes the *second* phrase cheap: the 30 requests that list products and
    // their categories answer a question about the environment, not about the keyword.
    const mounted = await bench([findAnswer({ total: 1, hits: [HIT] })])
    await mounted.index.put(mapSnapshot())

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(mounted.cdp.seen[0]).toContain('"taxonomy"')
    expect(mounted.cdp.seen[0]).toContain('销售服务')
    // 图里还记着建图时用的集成系统，带上它连 `listIntegrateSys` 那一次也省了。
    expect(mounted.cdp.seen[0]).toContain('"integrateSys":"yonsuite"')
    expect(mounted.cdp.seen[0]).not.toContain('"routes"')
    expect(text).toContain('走了定位图')
    expect(text).toContain('销售订单单个保存')
  })

  it('keeps the map a full scan produced', async () => {
    const mounted = await bench([findAnswer({ total: 1, hits: [HIT], taxonomy: MAP })])
    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })

    // A full scan carries the map back with its answer; throwing it away is what made every
    // new phrase pay the same 30 requests again.
    const stored = await mounted.index.get('https://erpbip.sdic.com.cn')
    expect(stored?.snapshot.classifies.map(one => one.id)).toEqual(['C1'])
    // The interface names ride along: they are what a later phrase is located by.
    expect(stored?.snapshot.classifies[0]?.apis).toEqual(['销售订单单个保存', '销售订单批量保存'])
    expect(text).toContain('定位图已更新：')
    expect(text).toContain('index.json')
  })

  it('says the net was the remembered interface names, not a truncated scan', async () => {
    // One or two categories scanned looks exactly like a scan that ran out of budget, so how the
    // net was cast has to be in the answer.
    const mounted = await bench([findAnswer({
      total: 1,
      hits: [HIT],
      scanned: {
        products: 1, classifies: 1, groups: 1, truncated: false,
        viaRoute: false, viaIndex: true, viaApi: true, deadline: false,
      },
    })])
    await mounted.index.put(mapSnapshot())

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(text).toContain('按图上记着的接口名收的网')
    // The names go down with the map, so the page can narrow without asking for the catalogue.
    expect(mounted.cdp.seen[0]).toContain('销售订单单个保存')
  })

  it('throws the map away and rescans when it comes back empty', async () => {
    // The map only knows the categories that existed when it was built. A phrase answered by a
    // newer category must still be found, so an empty answer discards the map and rescans —
    // provided the map is old enough that a newer category is a real possibility.
    const mounted = await bench([
      findAnswer({ total: 0, hits: [], routes: [] }),
      findAnswer({ total: 1, hits: [HIT], routes: [], taxonomy: MAP }),
    ])
    await mounted.index.put(mapSnapshot({
      at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      classifies: [{ id: 'old', name: '已经不在了', productId: 'P1', productName: '销售服务' }],
    }))

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(mounted.cdp.seen).toHaveLength(2)
    expect(mounted.cdp.seen[0]).toContain('"taxonomy"')
    expect(mounted.cdp.seen[1]).not.toContain('"taxonomy"')
    expect(text).toContain('原定位图落空，已作废并重扫全量')
    expect(text).toContain('销售订单单个保存')

    // The rescan rebuilt it, so the next phrase is cheap again.
    const stored = await mounted.index.get('https://erpbip.sdic.com.cn')
    expect(stored?.snapshot.classifies.map(one => one.id)).toEqual(['C1'])
  })

  it('takes a fresh map at its word instead of paying for the same scan twice', async () => {
    // A miss from a map built minutes ago is almost always a phrase that does not exist. Rescanning
    // would send the very same per-category requests again and could not change the answer, so the
    // call accepts the miss — and says so, with the file to delete if the reader disagrees.
    const mounted = await bench([findAnswer({ total: 0, hits: [], routes: [] })])
    await mounted.index.put(mapSnapshot())

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '不存在的说法' })
    expect(mounted.cdp.seen).toHaveLength(1)
    expect(text).toContain('找到 0 条')
    expect(text).toContain('定位图刚建过，没有因落空重扫')
    expect(text).toContain('index.json')
    // 图没有被作废：它并没有错，只是这个说法不在里面。
    expect((await mounted.index.get('https://erpbip.sdic.com.cn'))?.snapshot.classifies)
      .toHaveLength(1)
  })

  it('rebuilds on a miss when the map is what narrowed the search', async () => {
    // Here the map did make a claim — its remembered name matched, so only that category was
    // asked. A miss then means the claim itself is wrong, and a fresh map is no excuse.
    const mounted = await bench([
      findAnswer({
        total: 0, hits: [], routes: [],
        scanned: {
          products: 1, classifies: 1, groups: 1, truncated: false,
          viaRoute: false, viaIndex: true, viaApi: true, deadline: false,
        },
      }),
      findAnswer({ total: 1, hits: [HIT], routes: [], taxonomy: MAP }),
    ])
    await mounted.index.put(mapSnapshot())

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(mounted.cdp.seen).toHaveLength(2)
    expect(text).toContain('原定位图落空，已作废并重扫全量')
    expect(text).toContain('销售订单单个保存')
  })

  it('refuses a map past its shelf life rather than answering from it', async () => {
    const mounted = await bench([findAnswer({ total: 1, hits: [HIT], taxonomy: MAP })])
    await mounted.index.put(mapSnapshot({
      at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    }))

    await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    // A stale map answers with the categories it knew then and quietly misses the newer ones;
    // scanning again costs one round trip instead, and rebuilds it.
    expect(mounted.cdp.seen[0]).not.toContain('"taxonomy"')
  })

  it('says the answer came from the console search, not from the catalogue', async () => {
    // 名字搜索命中时，服务/分类/实查三个数字都是 0——不说清楚，读的人会把它当成扫描被截断。
    const mounted = await bench([findAnswer({
      total: 1,
      hits: [HIT],
      scanned: {
        products: 0, classifies: 0, groups: 0, truncated: false, viaRoute: false,
        viaSearch: true, searched: true,
      },
    })])

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '条形码' })
    expect(text).toContain('按名字搜索命中，没有翻目录')
    expect(text).toContain('销售订单单个保存')
  })

  it('tells a miss after both nets from a miss that never asked the name search', async () => {
    const asked = await bench([findAnswer({
      total: 0,
      hits: [],
      scanned: {
        products: 2, classifies: 2, groups: 2, truncated: false, viaRoute: false,
        viaSearch: false, searched: true,
      },
    })])
    expect(await answer(asked.tools, 'bip_api_find', { keyword: '不存在的说法' }))
      .toContain('名字搜索与目录枚举都空手而归')

    // 指名 deep（或 product / classify_id）时那一发是故意不问的，回答不该说「都问过了」。
    const browsed = await bench([findAnswer({
      total: 0,
      hits: [],
      scanned: {
        products: 2, classifies: 2, groups: 2, truncated: false, viaRoute: false,
        viaSearch: false, searched: false,
      },
    })])
    expect(await answer(browsed.tools, 'bip_api_find', { keyword: '不存在的说法', deep: true }))
      .toContain('这次是按目录浏览，没有问名字搜索')
  })

  it('does not throw a route away over a timeout', async () => {
    // A timed-out scan is not evidence that the route is wrong: it never got to ask.
    const mounted = await bench([findAnswer({ total: 0, hits: [], routes: [], timedOut: true })])
    await mounted.routes.remember('https://erpbip.sdic.com.cn', '销售订单保存', [
      { classifyId: 'C1', classifyName: '销售订单' },
    ])

    const text = await answer(mounted.tools, 'bip_api_find', { keyword: '销售订单保存' })
    expect(mounted.cdp.seen).toHaveLength(1)
    expect(await mounted.routes.hints('https://erpbip.sdic.com.cn', '销售订单保存')).toHaveLength(1)
    expect(text).toContain('时间预算')
  })

  it('looks a name up before it reads a detail', async () => {
    const mounted = await bench([
      findAnswer({ total: 1, hits: [HIT], routes: [{ classifyId: 'C1', classifyName: '销售订单' }] }),
      {
        ok: true,
        origin: 'https://erpbip.sdic.com.cn',
        api: {
          id: HIT.apiId, name: HIT.apiName, description: HIT.describe,
          address: 'https://erpbip.sdic.com.cn/iuap-api-gateway/yonbip/sd/voucherorder/singleSave',
          proxyUrl: '/yonbip/sd/voucherorder/singleSave', method: 'POST',
          contentType: 'application/json', productName: '销售服务', classifyName: '销售订单',
          publishStatus: true, openApi: true,
        },
        request: {
          total: 1, optionalCount: 0, nested: [],
          required: [{ name: 'data', type: 'object', desc: '销售订单', required: true, at: 'BodyParam' }],
        },
        returns: [{ name: 'code', type: 'string', desc: '返回码' }],
        successDemo: '{ "code": "200" }',
      },
    ])

    const text = await answer(mounted.tools, 'bip_api_detail', { api: '销售订单单个保存' })
    expect(mounted.cdp.seen).toHaveLength(2)
    expect(mounted.cdp.seen[0]).toContain('"keyword":"销售订单单个保存"')
    expect(mounted.cdp.seen[1]).toContain(HIT.apiId)
    expect(text).toContain('/yonbip/sd/voucherorder/singleSave')
    expect(text).toContain('POST')
    expect(text).toContain('data')
  })

  it('reads a detail straight through when it is handed an id', async () => {
    const mounted = await bench([{
      ok: true,
      origin: 'https://erpbip.sdic.com.cn',
      api: {
        id: HIT.apiId, name: HIT.apiName, description: '', address: 'https://x/yonbip/a/b/c',
        proxyUrl: '/yonbip/a/b/c', method: 'POST', publishStatus: true, openApi: true,
      },
      request: { total: 0, required: [], optionalCount: 0, nested: [] },
      returns: [],
    }])

    const text = await answer(mounted.tools, 'bip_api_detail', { api: HIT.apiId })
    // One evaluation only: an id needs no lookup.
    expect(mounted.cdp.seen).toHaveLength(1)
    expect(mounted.cdp.seen[0]).toContain(HIT.apiId)
    expect(text).toContain('https://x/yonbip/a/b/c')
  })

  it('says so when there is no page to read through', async () => {
    const blank: FakePage = { targetId: 'T9', index: 0, title: '新标签页', url: 'about:blank', ours: false }
    const mounted = await bench([], [blank])

    const error = await failure(mounted.tools, 'bip_api_find', { keyword: '销售订单' })
    expect(error).toBeInstanceOf(BipApiError)
    expect((error as BipApiError).code).toBe('no-page')
    expect((error as BipApiError).message).toContain('browser_targets')
  })

  it('refuses an empty keyword before it touches the browser', async () => {
    const mounted = await bench([])
    const error = await failure(mounted.tools, 'bip_api_find', { keyword: '   ' })
    expect(error).toBeInstanceOf(BipApiError)
    expect((error as BipApiError).code).toBe('invalid-input')
    expect(mounted.cdp.seen).toHaveLength(0)
  })

  it('survives a route document that is not JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bip-api-spec-'))
    made.push(dir)
    const path = join(dir, 'routes.json')
    await writeFile(path, '{ this is not json', 'utf8')
    const store = createBipApiRouteStore(path)

    const read = await store.read()
    expect(read.routes).toEqual([])
    expect(read.error).toContain('JSON')
    // A broken document is a lost route, not a lost answer: the lookup just comes back empty
    // and the scan happens again.
    expect(await store.hints('https://a', 'b')).toEqual([])
  })
})

describe('the injected expressions', () => {
  it('inline their arguments and parse as an expression', () => {
    const expression = findExpression({ keyword: '销售订单保存', deep: true })
    expect(expression).toContain('"keyword":"销售订单保存"')
    expect(expression).toContain('"deep":true')
    // Compiling it is the whole syntax check; running it needs a page.
    expect(() => new Function(`return ${expression}`)).not.toThrow()
  })

  it('carry no reference to the host module they came from', () => {
    // The function is stringified and shipped into the page, so anything it closes over is
    // `undefined` there. Nothing but the parameter may be named.
    const expression = detailExpression({ apiId: 'x', section: 'data' })
    expect(expression).toContain('"apiId":"x"')
    expect(expression).toContain('"section":"data"')
    expect(() => new Function(`return ${expression}`)).not.toThrow()
  })

  /** 把那段真会被注入页面的代码跑起来；fetch 是记账的替身，连方法与请求体一起记。 */
  const injected = async (request: FindRequest): Promise<{
    calls: Array<{ path: string, body: string }>
    answer: PageFindAnswer
  }> => {
    const calls: Array<{ path: string, body: string }> = []
    const fetchStub = async (url: string, init?: { readonly body?: string }): Promise<unknown> => {
      const path = String(url).replace('/iuap-ipaas-base/openPortal/api/', '')
      const body = String(init?.body ?? '')
      calls.push({ path, body })
      const name = path.split('?')[0] ?? path
      if (name === 'search') {
        // 控制台搜索框回车那一发：按名称/路径子串匹配，命中时只带回 apiId 与分类名。
        const rows = body.includes('条形码')
          ? [{ apiId: 'A9', apiName: '根据单据条形码查询件', category: '档案利用', deprecated: 0 }]
          : []
        return { ok: true, status: 200, json: async () => ({ data: rows }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: catalogue(path) }) }
    }
    const execute = new Function('location', 'fetch', `return ${findExpression(request)}`)
    const text = await execute({ origin: 'https://erpbip.sdic.com.cn' }, fetchStub)
    return { calls, answer: JSON.parse(String(text)) as PageFindAnswer }
  }

  it('asks the console its own search first, and stops there when it answers', async () => {
    // 使用者那条「根据单据条形码查询件」就长这样：控制台的搜索一发就中，而旧版只翻了那棵
    // 14 个产品的窄目录，于是答出「这个环境没有这个 API」。所以先问名字，问不到才翻目录。
    const { calls, answer: got } = await injected({ keyword: '条形码' })

    expect(got.total).toBe(1)
    expect(got.hits[0]?.apiName).toBe('根据单据条形码查询件')
    expect(got.scanned.viaSearch).toBe(true)
    // 一发，而且就是搜索那一发：目录一次都没有翻。
    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toContain('search')
    expect(calls[0]?.body).toContain('条形码')
  })

  it('cuts a new phrase down to the categories whose remembered API names match', async () => {
    // 搜索答不上来的说法仍然要翻目录。第一次是目录树 + 两个分类的清单（顺便把名字记下来），
    // 第二次带上图，就只查那一个分类——而且连目录树那一次也不再问。
    const first = await injected({ keyword: '销售订单保存' })
    expect(first.answer.total).toBe(1)
    expect(first.answer.scanned.viaIndex).toBe(false)
    expect(first.answer.scanned.viaSearch).toBe(false)
    expect(first.calls.filter(one => one.path.startsWith('listIntegrateSys'))).toHaveLength(1)
    expect(first.calls.filter(one => one.path.startsWith('groupApiByApiClassify'))).toHaveLength(2)
    // 名字是照着这一趟看见的记的：命中的那几个之外，同一个分类里别的不命中也要记下来，
    // 否则图会越用越窄。
    const mapped = first.answer.taxonomy
    expect(mapped?.classifies.find(one => one.id === 'C1')?.apis)
      .toEqual(['销售订单保存接口', '销售订单列表查询'])
    if (mapped === undefined) throw new Error('全量扫描没有把定位图带回来')

    const second = await injected({
      keyword: '销售订单保存',
      integrateSys: 'yonsuite',
      taxonomy: mapped,
    })
    expect(second.answer.total).toBe(1)
    expect(second.answer.scanned.viaIndex).toBe(true)
    expect(second.answer.scanned.viaApi).toBe(true)
    // 图上分类是全部（2 个），实查只有一个——回答里这两个数字都说出来，所以一两个分类
    // 的实查数不会被误读成「扫描被截断」。
    expect(second.answer.scanned.classifies).toBe(2)
    expect(second.answer.scanned.groups).toBe(1)
    // 目录树一次都没有再问；清单只有那一个分类，而且用的是控制台自己那套形状。
    expect(second.calls.some(one => one.path.startsWith('listIntegrateSys'))).toBe(false)
    const groups = second.calls.filter(one => one.path.startsWith('groupApiByApiClassify'))
    expect(groups).toHaveLength(1)
    expect(groups[0]?.path).toContain('domainAppCode=C1')
    expect(groups[0]?.path).toContain('treeNodeType=3')
  })

  it('goes back to the tree when the map has never heard of the service being browsed', async () => {
    // 实测的形状：盘上那张图是按旧目录建的，按「档案服务」浏览时图上没有这个服务，
    // 于是答出一个空的「图上分类 0」。图查不动的时候必须回到那棵树上去问——那一层是完整的，
    // 而且按服务只扫它自己的分类，很便宜。
    const { calls, answer: got } = await injected({
      keyword: '客户',
      product: '客户管理',
      integrateSys: 'yonsuite',
      taxonomy: {
        products: [{ id: 'P1', name: '销售服务' }],
        classifies: [{
          id: 'C1',
          name: '销售服务',
          productId: 'P1',
          productName: '销售服务',
          domainAppCode: 'C1',
          treeNodeType: 3,
          apis: ['销售订单保存接口'],
        }],
      },
    })

    expect(got.total).toBe(1)
    expect(got.hits[0]?.apiName).toBe('客户保存')
    expect(got.scanned.viaIndex).toBe(false)
    expect(got.scanned.products).toBe(1)
    expect(calls.filter(one => one.path.startsWith('listIntegrateSys'))).toHaveLength(1)
  })
})
