/**
 * 旗舰版 API 文档的定位图：它记什么、什么时候不能用，以及坏掉时的后果。
 *
 * 这份文档存在的理由是**省钱**（它替掉一次查找里那 30 次「产品 → 分类」），而它的风险是
 * **给出一个更小的答案**：拿一张旧图收网，少掉的那几条是看不出来的。所以这里守的不是
 * "存得下来"，而是这条界线——过期的、空的、读不出来的图，一律不许拿来回答。
 *
 * 图里没有一个地址、没有一个字段，所以这两件事是分开的：图错了的代价是多扫一轮，不是
 * 拿到一个错的调用地址。字段永远现取，那部分在 `bip-api.ts` 的页面脚本里。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BIP_API_TAXONOMY_SHAPE, createBipApiIndexStore, type TaxonomySnapshot } from '../src/host/bip-api-index.ts'

/** Temporary directories this file made, removed after each case. */
const made: string[] = []

afterEach(async () => {
  while (made.length > 0) {
    const dir = made.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

/** A fresh temporary directory holding an index document path. */
async function bench(ttlMs?: number) {
  const dir = await mkdtemp(join(tmpdir(), 'bip-api-index-spec-'))
  made.push(dir)
  const path = join(dir, 'bip-api-index.json')
  return {
    dir,
    path,
    store: ttlMs === undefined ? createBipApiIndexStore(path) : createBipApiIndexStore(path, ttlMs),
  }
}

/** One environment's map, as a full scan would have left it. */
function snapshot(overrides: Partial<TaxonomySnapshot> = {}): TaxonomySnapshot {
  return {
    origin: 'https://erpbip.sdic.com.cn',
    systemId: 'yonsuite',
    at: new Date().toISOString(),
    products: [{ id: 'P1', name: '销售服务', code: 'SD' }],
    classifies: [{ id: 'C1', name: '销售订单', productId: 'P1', productName: '销售服务' }],
    ...overrides,
  }
}

describe('the API-document index', () => {
  it('reads back the map it stored, one environment at a time', async () => {
    const { store } = await bench()
    await store.put(snapshot())
    await store.put(snapshot({
      origin: 'https://other.example.com',
      classifies: [{ id: 'C9', name: '采购订单', productId: 'P9', productName: '采购服务' }],
    }))

    const one = await store.get('https://erpbip.sdic.com.cn')
    expect(one?.snapshot.classifies.map(entry => entry.id)).toEqual(['C1'])
    expect(one?.snapshot.products.map(entry => entry.name)).toEqual(['销售服务'])
    expect(one?.stale).toBe(false)

    // A different origin is a different environment: its categories have nothing to do with ours.
    const other = await store.get('https://other.example.com')
    expect(other?.snapshot.classifies.map(entry => entry.id)).toEqual(['C9'])
    expect(await store.get('https://never-seen.example.com')).toBeUndefined()
  })

  it('keeps the same environment once, not once per scan', async () => {
    const { store } = await bench()
    await store.put(snapshot())
    await store.put(snapshot({ classifies: [{ id: 'C2', name: '销售出库单', productId: 'P1', productName: '销售服务' }] }))

    const read = await store.read()
    expect(read.snapshots).toHaveLength(1)
    const current = await store.get('https://erpbip.sdic.com.cn')
    expect(current?.snapshot.classifies.map(entry => entry.id)).toEqual(['C2'])
  })

  it('marks a map past its shelf life as stale instead of hiding it', async () => {
    const { store } = await bench(1000)
    await store.put(snapshot({ at: new Date(Date.now() - 2000).toISOString() }))

    const old = await store.get('https://erpbip.sdic.com.cn')
    // The map is still handed back — the caller is the one that must refuse it, and say so.
    expect(old?.snapshot.classifies).toHaveLength(1)
    expect(old?.stale).toBe(true)

    const { store: fresh } = await bench(1000)
    await fresh.put(snapshot())
    expect((await fresh.get('https://erpbip.sdic.com.cn'))?.stale).toBe(false)
  })

  it('refuses to keep a scan that found no categories', async () => {
    const { store, path } = await bench()
    // Products listed, zero categories: that is a failed round trip, not evidence about the
    // environment. Keeping it would make the next lookup fall back for nothing.
    expect(await store.put(snapshot({ classifies: [] }))).toBe(false)
    expect((await store.read()).snapshots).toEqual([])
    await expect(readFile(path, 'utf8')).rejects.toThrow()
  })

  it('forgets an environment when it stops holding', async () => {
    const { store } = await bench()
    await store.put(snapshot())
    await store.put(snapshot({ origin: 'https://other.example.com' }))

    await store.forget('https://erpbip.sdic.com.cn')
    expect(await store.get('https://erpbip.sdic.com.cn')).toBeUndefined()
    // Forgetting one environment must not touch another's map.
    expect((await store.read()).snapshots).toHaveLength(1)
    expect((await store.get('https://other.example.com'))?.snapshot.origin).toBe('https://other.example.com')
  })

  it('loses the map, not the answer, when the document is not JSON', async () => {
    const { store, path } = await bench()
    await writeFile(path, '{ this is not json', 'utf8')

    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.snapshots).toEqual([])
    expect(read.error).toContain('JSON')
    // A broken map is a lost shortcut: the lookup comes back empty and the scan happens again.
    expect(await store.get('https://erpbip.sdic.com.cn')).toBeUndefined()
  })

  it('ignores entries it cannot use', async () => {
    const { store, path } = await bench()
    await writeFile(path, JSON.stringify({
      snapshots: [
        { origin: 'https://a.example.com', systemId: 's', at: '2026-01-01T00:00:00.000Z', shape: BIP_API_TAXONOMY_SHAPE, classifies: [] },
        { systemId: 's', at: '2026-01-01T00:00:00.000Z', shape: BIP_API_TAXONOMY_SHAPE, classifies: [{ id: 'C', productId: 'P' }] },
        { origin: 'https://b.example.com', systemId: '', at: '2026-01-01T00:00:00.000Z', shape: BIP_API_TAXONOMY_SHAPE, classifies: [{ id: 'C', productId: 'P' }] },
        { origin: 'https://c.example.com', systemId: 's', at: '2026-01-01T00:00:00.000Z', shape: BIP_API_TAXONOMY_SHAPE, classifies: [{ id: 'C' }] },
        { origin: 'https://d.example.com', systemId: 's', at: '2026-01-01T00:00:00.000Z', shape: BIP_API_TAXONOMY_SHAPE, classifies: [{ id: 'C', productId: 'P' }], products: [{ name: '没有 id' }] },
      ],
    }), 'utf8')

    const read = await store.read()
    // Four unusable entries and one good one: a hand-edited document must not be able to break
    // a lookup, and an entry with no origin belongs to nobody, so it belongs nowhere.
    expect(read.snapshots).toHaveLength(1)
    expect(read.snapshots[0]?.origin).toBe('https://d.example.com')
    expect(read.snapshots[0]?.products).toEqual([])
  })

  it('remembers which APIs it saw under a category, and still no address or field', async () => {
    const { store } = await bench()
    await store.put(snapshot({
      classifies: [{
        id: 'C1',
        name: '销售订单',
        productId: 'P1',
        productName: '销售服务',
        apis: ['销售订单单个保存', '销售订单批量保存'],
      }],
    }))

    const stored = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot
    // The names are what makes a brand-new phrase cheap to locate; they are kept verbatim.
    expect(stored?.classifies[0]?.apis).toEqual(['销售订单单个保存', '销售订单批量保存'])
    // And nothing else came along with them: a name is not a call address. If the document ever
    // grows a field like that, this case is where it should be noticed.
    expect(Object.keys(stored?.classifies[0] ?? {}).sort())
      .toEqual(['apis', 'id', 'name', 'productId', 'productName'])
  })

  it('keeps the names it learned when a later scan could not look at every category', async () => {
    // 按分类名收网时只扫一两个分类，那一趟只带回一两个分类的接口名。若新图直接覆盖旧图，
    // 其余几十个分类的名字就凭空消失，下一个新说法又得全量重拉——图也就白建了。
    const { store } = await bench()
    await store.put(snapshot({
      classifies: [
        { id: 'C1', name: '销售服务', productId: 'P1', productName: '销售服务', apis: ['销售订单保存接口'] },
        { id: 'C2', name: '客户管理', productId: 'P2', productName: '客户服务', apis: ['客户保存'] },
      ],
    }))
    await store.put(snapshot({
      classifies: [
        { id: 'C1', name: '销售服务', productId: 'P1', productName: '销售服务' },
        { id: 'C2', name: '客户管理', productId: 'P2', productName: '客户服务', apis: ['客户新增'] },
        { id: 'C3', name: '新的分类', productId: 'P1', productName: '销售服务' },
      ],
    }))

    const stored = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot
    // C1 这一趟没扫（没有名字带回），上一次的名字留着；C2 扫过，以新的为准。
    expect(stored?.classifies.map(one => one.id)).toEqual(['C1', 'C2', 'C3'])
    expect(stored?.classifies[0]?.apis).toEqual(['销售订单保存接口'])
    expect(stored?.classifies[1]?.apis).toEqual(['客户新增'])
    expect(stored?.classifies[2]?.apis).toBeUndefined()
  })

  it('keeps the category when the API names are junk, and drops only the junk', async () => {
    const { store, path } = await bench()
    await writeFile(path, JSON.stringify({
      snapshots: [{
        origin: 'https://erpbip.sdic.com.cn',
        systemId: 'yonsuite',
        at: new Date().toISOString(),
        shape: BIP_API_TAXONOMY_SHAPE,
        products: [{ id: 'P1', name: '销售服务' }],
        classifies: [
          { id: 'C1', productId: 'P1', apis: ['保存', '', '保存', 42] },
          { id: 'C2', productId: 'P1', apis: '不是数组' },
          { id: 'C3', productId: 'P1', apis: Array.from({ length: 1200 }, (_, at) => `接口${String(at)}`) },
        ],
      }],
    }), 'utf8')

    const stored = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot
    expect(stored?.classifies.map(one => one.id)).toEqual(['C1', 'C2', 'C3'])
    // Blank and repeated names, and anything that is not a name at all, are dropped; the category
    // itself survives with no names, which sends the next lookup back to the classify-name net
    // instead of pretending its API list is empty.
    expect(stored?.classifies[0]?.apis).toEqual(['保存'])
    expect(stored?.classifies[1]?.apis).toBeUndefined()
    expect(stored?.classifies[2]?.apis).toHaveLength(1000)
  })

  it('keeps the shape a category is queried by, and the path it sits at', async () => {
    // 清单那一路只认 `domainAppCode` + `treeNodeType`：实测同一个分类，用 `apiClassifyId` 的
    // 形状问回的是空数组，所以这两个键要跟分类一起存下来——不然从图上收的网一条也查不动。
    // `path`（财务云 / 档案服务 / 档案利用）既是收网的判据，也是回答里给人看的那一行。
    const { store } = await bench()
    await store.put(snapshot({
      classifies: [{
        id: 'EAF_DALY',
        name: '档案利用',
        productId: 'EAF',
        productName: '档案服务',
        domainAppCode: 'EAF_DALY',
        treeNodeType: 3,
        path: '财务云 / 档案服务 / 档案利用',
        apis: ['根据单据条形码查询件'],
      }],
    }))

    const one = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot.classifies[0]
    expect(one?.domainAppCode).toBe('EAF_DALY')
    expect(one?.treeNodeType).toBe(3)
    expect(one?.path).toBe('财务云 / 档案服务 / 档案利用')
    // 多出来的仍然只有身份：没有地址，也没有字段。这一行就是这个库的边界，动了它要有人看见。
    expect(Object.keys(one ?? {}).sort())
      .toEqual(['apis', 'domainAppCode', 'id', 'name', 'path', 'productId', 'productName', 'treeNodeType'])
  })

  it('treats a shape it cannot use as no shape at all', async () => {
    const { store, path } = await bench()
    await writeFile(path, JSON.stringify({
      snapshots: [{
        origin: 'https://erpbip.sdic.com.cn',
        systemId: 'yonsuite',
        at: new Date().toISOString(),
        shape: BIP_API_TAXONOMY_SHAPE,
        classifies: [
          { id: 'C1', productId: 'P1', domainAppCode: '   ', treeNodeType: 'x', path: 7 },
          { id: 'C2', productId: 'P1', domainAppCode: 'C2', treeNodeType: 4 },
        ],
      }],
    }), 'utf8')

    const stored = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot
    // 空白、不是数字、不是字符串，一律当作「没有」：少一个键的代价是退回旧形状多问一次，
    // 而一个错的键会把清单请求发到一个不存在的分类上。
    expect(stored?.classifies[0]?.domainAppCode).toBeUndefined()
    expect(stored?.classifies[0]?.treeNodeType).toBeUndefined()
    expect(stored?.classifies[0]?.path).toBeUndefined()
    expect(stored?.classifies[1]?.domainAppCode).toBe('C2')
    expect(stored?.classifies[1]?.treeNodeType).toBe(4)
  })

  it('reads an old-shaped map as no map, and lets the next scan replace it', async () => {
    // 实测：盘上那份「产品 → 分类」形状的旧图（没有 domainAppCode）拿来收网会一路收空——
    // 「按服务浏览」答出一个空的「图上分类 0」。所以版本对不上就当它不存在：代价是一轮
    // 全量扫描，比一个错的空答案便宜。
    const { store, path } = await bench()
    await writeFile(path, JSON.stringify({
      snapshots: [
        { origin: 'https://erpbip.sdic.com.cn', systemId: 'yonsuite', at: new Date().toISOString(), shape: 1, classifies: [{ id: 'C1', name: '销售服务', productId: 'P1', productName: '销售服务' }] },
        { origin: 'https://old.example.com', systemId: 'yonsuite', at: new Date().toISOString(), classifies: [{ id: 'C2', name: '采购服务', productId: 'P2', productName: '采购服务' }] },
      ],
    }), 'utf8')

    expect(await store.get('https://erpbip.sdic.com.cn')).toBeUndefined()
    expect(await store.get('https://old.example.com')).toBeUndefined()

    // 下一趟扫描把同一环境写成当前形状，并且把旧条目一并清掉。
    await store.put(snapshot({
      classifies: [{ id: 'EAF_DALY', name: '档案利用', productId: 'EAF', productName: '档案服务', domainAppCode: 'EAF_DALY', treeNodeType: 3 }],
    }))
    const stored = (await store.get('https://erpbip.sdic.com.cn'))?.snapshot
    expect(stored?.shape).toBe(BIP_API_TAXONOMY_SHAPE)
    expect(stored?.classifies.map(one => one.id)).toEqual(['EAF_DALY'])
    // 读不出来的条目在写回时就消失了——旧形状的图不是被「升级」，而是被这一次扫描取代。
    const left = JSON.parse(await readFile(path, 'utf8')) as { snapshots: { origin: string }[] }
    expect(left.snapshots.map(one => one.origin)).toEqual(['https://erpbip.sdic.com.cn'])
  })
})
