/**
 * 旗舰版 API 文档的「云 / 服务 / 分类 → 接口名」定位图。
 *
 * ## 这里存什么，以及为什么它可以存
 *
 * 一次查找的固定开销不在接口本身上，而在**定位**：先把目录读一遍，再对候选分类逐个拉接口
 * 清单。目录是一次请求——`listIntegrateSys` 给回整棵树（实测 11 云 / 38 服务 / 141 分类 /
 * 594 子分类 = 784 个节点）——贵的是清单那一层：按分类名收网收不动时，就是每个分类一次。
 *
 * （旧版按「产品 → 分类」列了两层，只覆盖 14 个产品 51 个分类：它漏掉整个财务云、供应链云，
 * 问一个真实存在的接口会得到一句笃定的「这个环境没有」。所以图的骨架换成了那棵树，分类还要
 * 连同它的 `domainAppCode` + `treeNodeType` 一起记——清单接口只认那一对。）
 *
 * 只存分类是不够的，这一点是实测把设想推翻的：那个租户的 51 个分类名是
 * **模块级**的（销售服务、客户管理、到货单、B2C订单中心…），没有一个分类叫「销售订单」，
 * 于是「销售订单保存」这种单据名/接口名按分类名根本收不到网，那 51 次清单请求照样全付——
 * 只省了 16/67。所以图里连每个分类下的**接口名**一起存（那个环境一共 330 个，约 13 KB）。
 *
 * 这张图里没有一个地址、没有一个字段、没有 `fieldVersion`：只有分类与产品的**身份**，加上
 * 接口的名字。所以 `bip-api.ts` 文件头那条「过期的索引会给出一个看着笃定的错地址」的顾虑
 * 不会回来——地址与字段永远现取。图错了的后果是**多扫一轮**（收错或收不到 → 那一趟落空 →
 * 整份作废并重扫全量），不是拿到错的答案。
 *
 * ## 过期与失效
 *
 * 产品与分类会被改名、新增、下架，所以图带一个 `at`：超过 {@link BIP_API_INDEX_TTL_MS}
 * 就判 stale。**stale 的图不拿来用**——一次查找宁可按全量重扫，也不要拿一张旧图给出一份
 * 「少了几条」的答案：条数少了，看的人是看不出来的。所以过期的代价是多扫一轮，而不是
 * 一个更小的数字。
 *
 * 在有效期内的图也可能落空（关键词对应的分类是新的，图里还没有）。这时由调用方整份
 * 作废（{@link BipApiIndexStore.forget}）并重扫一遍全量——那次重扫会顺手重建它。
 * 换句话说：**这张图只会让它少扫，从不允许它说「没有」**。
 *
 * 还有一种「过期」与时间无关：图的**形状**变了。盘上那份旧版图（只有「产品 → 分类」，
 * 没有分类的查询形状）拿来收网会一路收空——实测「按服务浏览」会答出一个空的「图上分类 0」。
 * 所以读的时候形状对不上就当它不存在（{@link BIP_API_TAXONOMY_SHAPE}），让它由下一趟
 * 全量扫描重建：代价是一轮请求，比一个错的空答案便宜得多。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 一个产品，只留身份与显示名。 */
export interface TaxonomyProduct {
  readonly id: string
  readonly name: string
  readonly code?: string
}

/** 一个分类：它是谁、属于哪个产品，以及它下面有哪些接口名。 */
export interface TaxonomyClassify {
  readonly id: string
  readonly name: string
  readonly productId: string
  readonly productName: string
  /**
   * 这个分类下的**接口名**——只有名字，没有 id、没有地址、没有字段。
   *
   * 它换来的东西是实测出来的：租户的分类名常常是模块级的（销售服务、客户管理…），
   * 按分类名收不到「销售订单保存」这种单据名，那就得把 51 个分类的清单全拉一遍。有了这些
   * 名字，下一次按接口名提问就能直接收到一两个分类。
   *
   * 名字会变（改名、新增、下架），但过期只会**收错或收不到**：那一趟落空，宿主整份作废并
   * 重扫全量。所以它最多让人多扫一轮，不会漏掉一条真实存在的接口。
   */
  readonly apis?: readonly string[]
  /**
   * 查这个分类的接口清单用哪套形状：树节点的 **code**（`domainAppCode`）与它的 `type`
   * （`treeNodeType`）。实测同一个分类，用 `apiClassifyId=EAF_DALY` 查回空数组，用
   * `domainAppCode=EAF_DALY&treeNodeType=3` 才拿到那一条接口——所以这两个键必须随图存下来，
   * 否则从图上收的网一条也查不动。老图没有它们，页面会退回 `apiClassifyId` 那条形状。
   */
  readonly domainAppCode?: string
  readonly treeNodeType?: number
  /** 控制台左树里那条路（财务云 / 档案服务 / 档案利用）：收网与显示都用它。 */
  readonly path?: string
}

/**
 * 一个环境的定位图：云 / 服务 / 分类，以及每个分类下的接口名。
 *
 * 按 origin + 集成系统存：同一个地址下的两个集成系统是两套分类，混用会查出别人的东西。
 */
export interface TaxonomySnapshot {
  readonly origin: string
  readonly systemId: string
  /** 建图时刻（ISO）。有效期从它算起。 */
  readonly at: string
  /**
   * 图里存的是哪一版的形状；写入时由存储盖，调用方不必给。
   *
   * 读的时候对不上 {@link BIP_API_TAXONOMY_SHAPE} 就当这份图不存在。这不是洁癖：实测一份
   * 「产品 → 分类」形状的旧图（没有 `domainAppCode`）会让「按服务浏览」答出一个空的
   * 「图上分类 0」——一张查不动的图比没有图更坏，而重建它的代价只是一轮请求。
   */
  readonly shape?: number
  readonly products: readonly TaxonomyProduct[]
  readonly classifies: readonly TaxonomyClassify[]
}

/**
 * 当前图的形状版本。
 *
 * 2 = 树上的云 / 服务 / 分类，分类带 `domainAppCode` + `treeNodeType`（外加 `path` 与接口名）。
 * 1 = 早先那版「产品 → 分类」，没有查询形状——它落在盘上时一律当没有。
 */
export const BIP_API_TAXONOMY_SHAPE = 2

/** 交给页面脚本的那一份：origin、系统与时刻由宿主管，不进页面。 */
export interface Taxonomy {
  readonly products: readonly TaxonomyProduct[]
  readonly classifies: readonly TaxonomyClassify[]
}

/** 一次定位图读取，整份文档的样子。 */
export interface IndexStoreRead {
  readonly path: string
  readonly snapshots: readonly TaxonomySnapshot[]
  readonly exists: boolean
  readonly error?: string
}

/** 取到一张图时，连同它有多旧。 */
export interface TaxonomyLookup {
  readonly snapshot: TaxonomySnapshot
  readonly stale: boolean
  readonly ageMs: number
}

/** 定位图的读写，按环境取用。 */
export interface BipApiIndexStore {
  readonly path: string
  read(): Promise<IndexStoreRead>
  /** 这个环境的图，没有（或读不出来）就是 undefined。 */
  get(origin: string, systemId?: string): Promise<TaxonomyLookup | undefined>
  /**
   * 记下（或覆盖）一个环境的图；整份没有分类时什么都不写，返回 false。分类以这一份为准，
   * 但**上一次记下的接口名会留下**（见 {@link keepKnownNames}）：一次扫描看不到全部分类。
   */
  put(snapshot: TaxonomySnapshot): Promise<boolean>
  /** 作废一个环境的图：它已经不成立了，或者它落空过。 */
  forget(origin: string, systemId?: string): Promise<void>
}

/** 一张图的有效期：超过它就宁可按全量重扫一遍。 */
export const BIP_API_INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 一张图的「新鲜窗口」：这么新的图**不因为一次落空就作废重扫**。
 *
 * 落空最常见的原因是关键词本来就不存在，而不是图错了；那种情况下重扫只是把同一批请求
 * （图上每个分类问一遍清单）原样再发一次，答案不可能变。窗口内唯一会漏的是「图建好之后
 * 新加的分类里的接口」——新加进**已有分类**的接口不受影响，名字对不上时本来就会把图上
 * 所有分类都查一遍，现场清单里有它。等价的说法：环境新增一个分类，最多被延后这么久才被
 * 看见；急着要就删掉图文件再问（工具输出里给出了它的路径）。
 */
export const BIP_API_INDEX_FRESH_MS = 60 * 60 * 1000

/** 定位图文件的位置：与这一族其它文档同处 `~/.dsh/yon-panel/`。 */
export function defaultBipApiIndexPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'bip-api-index.json')
}

/** 一个成员读成字符串，缺了就是空串。 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 读一个产品；没有 id 的就丢掉它。 */
function asProduct(value: unknown): TaxonomyProduct | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const one = value as Record<string, unknown>
  const id = textOf(one.id).trim()
  if (id === '') return undefined
  const code = textOf(one.code).trim()
  return { id, name: textOf(one.name), ...(code === '' ? {} : { code }) }
}

/** 读一个分类；没有 id 或没有产品归属的就丢掉它。一个分类下的接口名最多记 1000 个。 */
function asClassify(value: unknown): TaxonomyClassify | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const one = value as Record<string, unknown>
  const id = textOf(one.id).trim()
  const productId = textOf(one.productId).trim()
  if (id === '' || productId === '') return undefined
  const apis = (Array.isArray(one.apis) ? one.apis : [])
    .map(name => textOf(name).trim())
    .filter((name, at, all) => name !== '' && all.indexOf(name) === at)
    .slice(0, 1000)
  const domainAppCode = textOf(one.domainAppCode).trim()
  const path = textOf(one.path).trim()
  const type = Number(one.treeNodeType)
  return {
    id,
    name: textOf(one.name),
    productId,
    productName: textOf(one.productName),
    ...(apis.length === 0 ? {} : { apis }),
    ...(domainAppCode === '' ? {} : { domainAppCode }),
    ...(Number.isFinite(type) && type > 0 ? { treeNodeType: type } : {}),
    ...(path === '' ? {} : { path }),
  }
}

/**
 * 读一张图，读不出来就丢掉它——丢一张图的代价是多扫一轮。
 *
 * 一张没有一个分类的图是没用的（它只会让每一次查找都落空、再被作废），所以直接丢掉。
 */
function asSnapshot(value: unknown): TaxonomySnapshot | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const origin = textOf(entry.origin).trim()
  const systemId = textOf(entry.systemId).trim()
  const at = textOf(entry.at).trim()
  // 形状对不上就当这份图不存在：旧图没有查询形状，拿它收网会一路收空（见 BIP_API_TAXONOMY_SHAPE）。
  if (Number(entry.shape) !== BIP_API_TAXONOMY_SHAPE) return undefined
  const products = (Array.isArray(entry.products) ? entry.products : [])
    .map(asProduct).filter((one): one is TaxonomyProduct => one !== undefined)
  const classifies = (Array.isArray(entry.classifies) ? entry.classifies : [])
    .map(asClassify).filter((one): one is TaxonomyClassify => one !== undefined)
  if (origin === '' || systemId === '' || at === '' || classifies.length === 0) return undefined
  return { origin, systemId, at, shape: BIP_API_TAXONOMY_SHAPE, products, classifies }
}

/**
 * 把上一次记下的接口名留在图上。
 *
 * 一次扫描只给**扫过**的分类带回接口名（按分类名收网时只扫一两个分类），所以「新图直接覆盖
 * 旧图」会让其余几十个分类的名字凭空消失——那之后每个新说法又得把清单全量重拉一遍，而这张图
 * 的意义正在于此。名字只是线索：留错了最多让下一次收网落空、整份作废重扫，不会变成一个错的
 * 答案。分类本身以新图为准（环境里删掉的分类就是要消失）。
 */
function keepKnownNames(previous: TaxonomySnapshot | undefined, next: TaxonomySnapshot): TaxonomySnapshot {
  if (previous === undefined) return next
  const known = new Map(previous.classifies.map(one => [one.id, one.apis]))
  const classifies = next.classifies.map(one => {
    if (one.apis !== undefined && one.apis.length > 0) return one
    const apis = known.get(one.id)
    return apis === undefined || apis.length === 0 ? one : { ...one, apis }
  })
  return {
    origin: next.origin,
    systemId: next.systemId,
    at: next.at,
    ...(next.shape === undefined ? {} : { shape: next.shape }),
    products: next.products,
    classifies,
  }
}

/**
 * 打开定位图文档。
 * @param path - 文档位置；默认是操作者自己那份。
 * @param ttlMs - 一张图的有效期；默认 {@link BIP_API_INDEX_TTL_MS}。测试用它把过期做成确定的事。
 * @returns 按它读写的存储。
 */
export function createBipApiIndexStore(
  path = defaultBipApiIndexPath(),
  ttlMs = BIP_API_INDEX_TTL_MS,
): BipApiIndexStore {
  // 写串行，读不动它——与 `bip-api.ts` 里的路标、`iteration-store.ts` 同一套理由：丢更新
  // 只可能发生在读-改-写的循环里，而那正是这里要排队的部分。
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  const readNow = async (): Promise<IndexStoreRead> => {
    const text = await readFile(path, 'utf8').catch(() => undefined)
    if (text === undefined) return { path, snapshots: [], exists: false }
    try {
      const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
      const parsed = JSON.parse(body) as { snapshots?: unknown }
      const raw = Array.isArray(parsed.snapshots) ? parsed.snapshots : []
      const snapshots = raw.map(asSnapshot).filter((one): one is TaxonomySnapshot => one !== undefined)
      return { path, snapshots, exists: true }
    } catch {
      return { path, snapshots: [], exists: true, error: `无法解析 ${path}：它不是合法的 JSON。` }
    }
  }

  const writeNow = async (snapshots: readonly TaxonomySnapshot[]): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify({ snapshots }, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  const update = async (
    change: (snapshots: readonly TaxonomySnapshot[]) => readonly TaxonomySnapshot[],
  ): Promise<void> => {
    const current = await readNow()
    await writeNow(change(current.snapshots))
  }

  /** 一个环境是否就是这一条；没给 systemId 时只比 origin（同址多系统取最后写入的那张）。 */
  const matches = (one: TaxonomySnapshot, origin: string, systemId: string | undefined): boolean =>
    one.origin === origin && (systemId === undefined || one.systemId === systemId)

  return {
    path,

    read: readNow,

    async get(origin: string, systemId?: string): Promise<TaxonomyLookup | undefined> {
      const current = await readNow()
      // 「最后写入的那张」：put 会把同一个环境的旧图挪走，所以数组末尾就是最新的。
      const candidates = current.snapshots.filter(one => matches(one, origin, systemId))
      const snapshot = candidates[candidates.length - 1]
      if (snapshot === undefined) return undefined
      const built = Date.parse(snapshot.at)
      const ageMs = Number.isNaN(built) ? Number.POSITIVE_INFINITY : Date.now() - built
      return { snapshot, stale: !(ageMs <= ttlMs), ageMs }
    },

    async put(snapshot: TaxonomySnapshot): Promise<boolean> {
      // 一次「产品拉到了、分类一个都没拉到」的扫描不是证据，只是一次失败的网络往返：
      // 拿它覆盖一张好图，会让下一次查找白白落空一轮。
      if (snapshot.classifies.length === 0) return false
      await inLine(() => update(current => {
        const previous = current.filter(one => matches(one, snapshot.origin, snapshot.systemId))
        return [
          ...current.filter(one => !matches(one, snapshot.origin, snapshot.systemId)),
          keepKnownNames(previous[previous.length - 1], { ...snapshot, shape: BIP_API_TAXONOMY_SHAPE }),
        ]
      }))
      return true
    },

    forget(origin: string, systemId?: string): Promise<void> {
      return inLine(() => update(current => current.filter(one => !matches(one, origin, systemId))))
    },
  }
}
