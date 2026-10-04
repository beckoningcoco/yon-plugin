/**
 * 安装目录面板的预览样本：面板 mount 后跑的那一次 `load()`，答案全在这里。
 *
 * 样本要摆进去的是面板**每一种行和每一种结论**，否则某些样式压根不会出现在图上：
 *   · 正常的 NCC 安装目录（关键路径基本齐全、模块数与 jar 数都挂 `≥`）；
 *   · 还没建过类索引的目录（详情页那一格画的是「还没有建索引」而不是时间）；
 *   · `jar-collection`——半可用的那种：能建索引，读不到 `.bmf` 和模块配置，警告列表
 *     必须有内容。（注意那条 `.warnList` 在静态页上**拍不到**：它排在 11 行关键路径表
 *     之后，而详情栏的高度被共享表的 `.body{height:min(62vh,520px)}` 定死，窗口开多高
 *     都没用。它的验收因此落在断言上，见 `render.spec.tsx` 的「jar 集合行」用例。）
 *   · 路径失效的行（`.rowNotReady` 压暗；它是一条真实存在的登记，不隐藏）；
 *   · BIP 旗舰版（版本是另一套：`V5`，与 `bip_home_path.json` 里真机那个键同名）。
 *
 * **正经安装目录一律 `capped: true`，这是量出来的而不是选出来的**：真机上那个
 * `jixieyuan/home` 有 462 483 个目录项、7941 个 jar，而探测的上限是 6 万条——一次
 * 完整的走查要 24～32 秒，落在面板的「保存并探测」上没人受得了。所以真机的答案就是
 * 「≥237 个模块，≥681 个 jar，用时 3.4 秒」。第一版样本画的是 4182 个 jar、不截断，
 * 那是**一个真实机器上永远不会出现的状态**，用它当样本等于把那条 `≥` 路径从图上抹掉。
 *
 * 数据是常量，方法一律返回已 resolve 的 Promise：这里**不发任何请求**，预览页要能
 * 在没有 host、没有安装目录的机器上打开。也正因如此，样本里的路径是编的——它们
 * 只是给人看的字符串，没有任何一处代码会去 stat 它们；但上面那两件事（截断、警告）
 * 是按真机抄的。
 */
import type { HomeApi } from '../../src/client/home/api.ts'
import { homeLabelOf } from '../../src/shared/types.ts'
import type {
  ClassBuildView, ClassIndexStatusView, HomeKeyView, HomeListPayload, HomeProfileView, HomeView,
  MetaBuildView, MetaCountsView, MetaIndexStatusView, SaveHomeInput,
} from '../../src/shared/types.ts'

/**
 * 探测会逐条回答的那张表，顺序与 `src/host/home-probe.ts` 的 `KEYS` 一致。
 *
 * 逐字抄角色名而不是另起一套：预览图要判断的是这张表排出来好不好看，角色名一改，
 * 量到的列宽就不是真实的那一列了。
 */
const ROLES: readonly { readonly role: string; readonly rel: string }[] = [
  { role: '模块根', rel: 'modules' },
  { role: '模块注册', rel: 'modules/*/META-INF' },
  { role: '模块元数据', rel: 'modules/*/METADATA' },
  { role: '模块类与源码', rel: 'modules/*/classes' },
  { role: '运行时配置', rel: 'ierp/bin' },
  { role: '系统配置（含凭据）', rel: 'resources' },
  { role: '前端', rel: 'hotwebs/nccloud' },
  { role: '日志', rel: 'nclogs' },
  { role: '启动脚本', rel: 'bin' },
  { role: '补丁', rel: 'patchrule' },
  { role: '自带 JDK', rel: 'ufjdk' },
]

/**
 * 一张关键路径命中表。
 * @param present - 存在的那几条的 `rel`；其余为不存在。
 * @returns 十一条，按 {@link ROLES} 的顺序。
 */
function keysOf(...present: readonly string[]): readonly HomeKeyView[] {
  return ROLES.map(key => ({ role: key.role, rel: key.rel, exists: present.includes(key.rel) }))
}

/**
 * 一条登记，只写它和别的不同的部分。
 *
 * `label` 不在参数里：名字是 `homeLabelOf` 从产品线和版本算出来的，样本自己再写一份
 * 就成了第二个真相——图上会看见一个真机上永远不会出现的名字。`id` 同理，照
 * `home-service.ts` 的 `uniqueId` 写成 `<产品线>-<版本>`。
 */
type HomeSeed = Omit<Partial<HomeView>, 'label'> & Pick<HomeView, 'id' | 'path' | 'version'>

function home(seed: HomeSeed): HomeView {
  const filled = { product: 'ncc' as const, isDefault: false, ready: true, ...seed }
  return { ...filled, label: homeLabelOf(filled.product, filled.version) }
}

/**
 * 走到上限时探测器加的那句话，逐字抄自 `src/host/home-probe.ts:184`。
 *
 * 抄而不是另写：图上要判断的是这句话排出来占几行、会不会把 `.warnList` 撑破，
 * 改一个字就不是那句话的宽度了。
 */
const CAP_WARNING =
  '目录项超过 60000 上限，模块数与 jar 数只保证是「至少这么多」，不是精确值。'

/** 一个探测结论，只写它和别的不同的部分。 */
function profile(overrides: Partial<HomeProfileView> = {}): HomeProfileView {
  return {
    probedAt: '2026-10-01T09:14:22.000Z',
    shape: 'ncc-home',
    present: ['modules', 'ierp/bin', 'resources'],
    modules: 237,
    jars: 681,
    capped: true,
    keys: keysOf('modules', 'modules/*/META-INF', 'modules/*/METADATA', 'modules/*/classes',
      'ierp/bin', 'resources', 'hotwebs/nccloud', 'nclogs', 'bin', 'patchrule', 'ufjdk'),
    warnings: [CAP_WARNING],
    ...overrides,
  }
}

/**
 * 元数据索引的计数，照真机抄：机械院 2111 实测 3600 个 `.bmf`、5573 个实体、
 * 217140 个字段、2947 个枚举、11916 个枚举项，序列化后 8.33 MB。
 *
 * 抄而不是编，因为面板上「5 573 个实体 · 217 140 个字段」这一行要回答的是
 * 「这么多位数排进一格会不会挤」——数字一换，量的就不是那一行了。
 */
const META_2111: MetaCountsView = {
  files: 3600, entities: 5573, enums: 2947, fields: 217_140, enumItems: 11_916,
}

/** 2312 那台是**另一份**索引：数字与 2111 不同（这一版没有真机可量，只能按同量级写）。 */
const META_2312: MetaCountsView = {
  files: 3588, entities: 5561, enums: 2938, fields: 216_402, enumItems: 11_877,
}

/**
 * 两份索引的建成时间。
 *
 * 写成常量而不是在列表行和状态接口里各写一遍：`GET /homes` 上那一格和打开详情后
 * 那一格说的是同一件事，两个字符串一旦不同，图上就会出现「列表说 9-30、详情说
 * 10-01」这种真机上不可能有的样子。
 */
const META_BUILT_2111 = '2026-09-30T07:42:18.000Z'
const META_BUILT_2312 = '2026-10-01T02:40:11.000Z'

/**
 * 2111 那份**类**索引的三个数：建成时间、类数、体积。
 *
 * 单独拎出来，因为同一份索引在两个地方各说一遍：列表行上的 `index`（模型调
 * `ncc_home_list` 时读的）和详情栏的 `classStatus`。面板批 3a 之前只画前者，现在是
 * 后者——两个字符串一旦不同，图上就会出现「列表说 9-28、详情说别的」这种真机上不
 * 可能有的样子。类数与体积照前面的样本延续（`HOME_HOMES[0]` 用的就是这两个数）。
 */
const CLASS_BUILT_2111 = '2026-09-28T16:02:41.000Z'
const CLASS_TOTAL_2111 = 143_908
const CLASS_BYTES_2111 = 12_884_901

/**
 * 已建索引的两种结论，按**版本**记账——真机上那份文件就叫 `meta_index_<版本>.json`，
 * 两个 Home 用同一个版本号时共用一份，所以这里也按版本而不是按 id 答。
 *
 * `2111` 与真机一致（计数、来源 Home、8.33 MB）；`2312` 是**过期**的那一种：
 * 改过 2 个、加了 1 个、删了 0 个 `.bmf`，用来画 `home.metaStale` 那句。
 */
const META_SETTLED: Record<string, MetaIndexStatusView> = {
  '2111': {
    indexed: true,
    version: '2111',
    builtAt: META_BUILT_2111,
    counts: META_2111,
    bytes: 8_332_000,
    sourceHomes: ['E:/NCProject/NCC/jixieyuan/home20260302_newHome/home'],
    freshness: { state: 'fresh', changed: 0, added: 0, removed: 0 },
  },
  '2312': {
    indexed: true,
    version: '2312',
    builtAt: META_BUILT_2312,
    counts: META_2312,
    bytes: 8_301_000,
    sourceHomes: ['D:/NCProject/NCC/zhongduan/home'],
    freshness: { state: 'stale', changed: 2, added: 1, removed: 0 },
  },
}

/**
 * 一个版本存下来的**类**索引，按版本记账——理由与 {@link META_SETTLED} 完全相同：
 * 真机上那份文件叫 `class_index_<版本>.json`，两个 Home 用同一个版本号时共用一份。
 *
 * 只有 `2111` 建过：另外三条登记正好留出「还没有索引」那一格，而默认选中的就是
 * 2111，所以第一屏画的是建好的那种。这两件事与 `HOME_HOMES[0].index` 是同一份事实。
 */
const CLASS_SETTLED: Record<string, ClassIndexStatusView> = {
  '2111': {
    indexed: true,
    version: '2111',
    builtAt: CLASS_BUILT_2111,
    totalClasses: CLASS_TOTAL_2111,
    bytes: CLASS_BYTES_2111,
  },
}

/**
 * 一次**类**索引构建跑到一半的样子。
 *
 * 与 {@link buildingView} 不同，这一份没有分母：`ClassBuildView` 报的是已经扫过多少
 * 个 jar、多少个类（`src/host/class-service.ts` 的 progress），因为类索引是边扫边记，
 * 扫之前不知道总数。所以面板上那句进度只有两个数——这正是要看的。
 */
function classBuildingView(): ClassBuildView {
  return {
    running: true,
    jars: 3120,
    classes: 62_400,
    current: 'modules/arap/lib/arap_arap-1.jar',
    startedAt: '2026-10-02T03:11:40.000Z',
  }
}

/** 一次**失败**的构建：扫到一个读不开的 jar，或者根目录根本不是安装目录。 */
function classFailedView(error: string): ClassBuildView {
  return {
    running: false,
    jars: 12,
    classes: 0,
    current: '',
    startedAt: '2026-10-02T03:11:40.000Z',
    error,
  }
}

/**
 * 失败时服务端给的那句话，逐字抄自 `class-service.ts` 那条「不是安装目录」的答复。
 *
 * 抄而不是另写：面板那句「建立失败：{error}」要判断的是**这么长的一句话折进那一格会
 * 占几行、会不会把按钮挤下去**，换一句短的就不是那句话的长度了。路径是拼进去的，
 * 与真机一致——所以它跟着被选中的那一行走。
 * @param path - 那次构建的安装目录。
 * @returns 服务端会写进 `ClassBuildView.error` 的那句话。
 */
export function classPathError(path: string): string {
  return `${path} 里既没有 .jar，也没有 modules/*/classes 下的 .class 或 .java`
    + ' —— 确认这是 NCC/BIP 的 home 目录（不是项目目录或 jar 存放目录）。'
}

/**
 * 一个版本存下来的东西，按要不要比对指纹裁剪。
 *
 * `fresh=0` 的那一次不比对——与真机一致（`meta-service.ts:215-221`：比对是一次走查
 * 加 3600 次 stat，实测 0.61 秒，开面板时付得起、轮询每秒付一次不值）。所以
 * 「过期」这条结论只在真正比对过的那一次里出现，夹具也照这个来。
 */
function settledMeta(version: string, fresh: boolean): MetaIndexStatusView | undefined {
  const stored = META_SETTLED[version]
  if (stored === undefined) return undefined
  if (fresh || stored.freshness === undefined) return stored
  return {
    indexed: stored.indexed,
    version: stored.version,
    ...stored.builtAt === undefined ? {} : { builtAt: stored.builtAt },
    ...stored.counts === undefined ? {} : { counts: stored.counts },
    ...stored.bytes === undefined ? {} : { bytes: stored.bytes },
    ...stored.sourceHomes === undefined ? {} : { sourceHomes: stored.sourceHomes },
  }
}

/**
 * 一次构建跑到一半的样子。
 *
 * 分母用真的 3600：面板上那句进度要判断的是「3600 分之 1240 读起来像不像在动」，
 * 分母一换就不是了。字段含义照 `src/host/meta-index.ts:328-330`——`files` 是走查
 * 找到的总数，`total` 是这一次要重建的数量，首次构建两者相等。
 */
function buildingView(): MetaBuildView {
  return {
    running: true,
    parsed: 1240,
    total: 3600,
    files: 3600,
    current: 'modules/arap/METADATA/baddebts/dstlfactorvalue.bmf',
    startedAt: '2026-10-02T03:11:40.000Z',
  }
}

/**
 * 五条登记，覆盖上面列的每一种行。
 *
 * 路径全是编的，且刻意写成不同的形状——盘符大小写、正反斜杠已经归一、含中文的段——
 * 因为那条等宽换行样式（`.mono` 的 `word-break: break-all`）只在长路径上才会生效，
 * 而"它到底换不换行"正是这页要回答的问题。
 */
export const HOME_HOMES: readonly HomeView[] = [
  home({
    id: 'ncc-2111',
    path: 'E:/NCProject/NCC/jixieyuan/home20260302_newHome/home',
    version: '2111',
    isDefault: true,
    profile: profile(),
    index: { builtAt: CLASS_BUILT_2111, totalClasses: CLASS_TOTAL_2111, bytes: CLASS_BYTES_2111 },
    meta: { builtAt: META_BUILT_2111, counts: META_2111, bytes: 8_332_000 },
  }),
  home({
    id: 'ncc-2312',
    path: 'D:/NCProject/NCC/zhongduan/home',
    version: '2312',
    profile: profile({
      probedAt: '2026-09-30T02:40:11.000Z',
      modules: 241,
      jars: 697,
      keys: keysOf('modules', 'modules/*/META-INF', 'modules/*/METADATA', 'modules/*/classes',
        'ierp/bin', 'resources', 'bin', 'patchrule', 'ufjdk'),
    }),
  }),
  home({
    id: 'ncc-2207',
    path: 'E:/download2',
    version: '2207',
    // 这一条是**不截断**的那种：3517 个 jar 是一个个走到底数出来的（用时 1.9 秒），
    // 所以它身上没有 `≥`。五条里只有它可以画「精确计数」——真机上其余四条都是挂 `≥` 的。
    profile: profile({
      probedAt: '2026-09-29T11:08:00.000Z',
      shape: 'jar-collection',
      present: [],
      modules: 0,
      jars: 3517,
      capped: false,
      keys: keysOf(),
      warnings: ['这个目录里有 jar 但没有 modules/：能用来按版本建类索引，读不到 .bmf 和模块配置。'],
    }),
  }),
  home({
    id: 'bip-v5',
    path: 'C:/YonBIP/v5/home',
    version: 'V5',
    product: 'bip',
    profile: profile({
      probedAt: '2026-09-27T01:22:09.000Z',
      shape: 'bip-home',
      present: ['modules'],
      modules: 118,
      jars: 402,
      keys: keysOf('modules', 'modules/*/META-INF', 'modules/*/METADATA', 'modules/*/classes'),
      warnings: [CAP_WARNING, '有 modules/，但既没有 ierp/ 也没有 bin/startup.*，按 BIP 旗舰版的 Home 归类。'],
    }),
  }),
  home({
    id: 'ncc-2105',
    path: 'F:/NCProject/NCC/old/home',
    version: '2105',
    ready: false,
    profile: profile({
      probedAt: '2026-08-14T07:31:55.000Z',
      shape: 'not-found',
      present: [],
      modules: 0,
      jars: 0,
      capped: false,
      keys: keysOf(),
      warnings: ['路径读不出来：确认它存在、且运行 NEURON 的账号有权访问。F:/NCProject/NCC/old/home'],
    }),
  }),
]

/**
 * 目录选择器在预览里"选中"的那个目录。
 *
 * 断言是「点一下按钮，输入框里出现了它」。框一开始是**空的**（而且只读），所以这条
 * 断言验的是"选出来的值真的进去了"，而不是"框里本来就有这个字"。
 */
export const HOME_PICKED_PATH = 'E:/download2'

/** `GET /homes` 的答案。`mirrorPath` 两条都写上：那正是真实的两条产品线。 */
export const HOME_PAYLOAD: HomeListPayload = {
  homes: HOME_HOMES,
  configPath: 'C:/Users/operator/.dsh/yon-panel/home_config.json',
  complete: true,
  mirrorPath: 'C:/Users/operator/.claude/skills/ncc-asset-hawk/ncc_home_path.json'
    + '  ·  C:/Users/operator/.claude/skills/yonyou-bip-dev/bip_home_path.json',
}

/** 一台还没登记过任何东西的机器：面板的空态，也就是今天所有人的状态。 */
export const HOME_EMPTY: HomeListPayload = {
  homes: [],
  configPath: 'C:/Users/operator/.dsh/yon-panel/home_config.json',
  complete: true,
}

/**
 * 把一次保存的输入折成列表读的那一行，形状照 `src/host/home-service.ts`。
 *
 * 名字与 id 都是派生的（`homeLabelOf` / `uniqueId`），因为真实的服务就是这么做的：
 * 保存请求里根本没有名字可传，返回的那一行却仍然有一个。
 */
function viewOf(input: SaveHomeInput): HomeView {
  return home({
    id: [input.product, input.version].filter(part => part !== '').join('-'),
    path: input.path,
    product: input.product,
    version: input.version,
    isDefault: input.isDefault ?? false,
    profile: profile(),
  })
}

/**
 * 造一份可注入的接口实现。
 * @param payload - 每次 `listHomes` 都返回它；默认 {@link HOME_PAYLOAD}。
 * @returns 面板要的那几个方法，全部立即 resolve，不碰网络。
 */
export function homesFixture(payload: HomeListPayload = HOME_PAYLOAD): HomeApi {
  /**
   * 这一次「重建」按下去之后正在跑的那个 id。
   *
   * 放在闭包里而不是模块级：每份夹具各有一份，一个用例点了重建，下一个用例读到的
   * 仍然是没在跑的那份——静态预览图要的正是这个确定性。
   */
  let building = ''

  /** 类索引那一条的同一个开关，另起一份：两个构建各有各的进度。 */
  let classBuilding = ''

  /** 一个 Home 现在的索引状态：存下来的那份，外加（如果它在跑）构建进度。 */
  const statusOf = (id: string, fresh: boolean): MetaIndexStatusView => {
    const row = payload.homes.find(candidate => candidate.id === id) ?? HOME_HOMES[0] as HomeView
    const stored = settledMeta(row.version, fresh)
    const base: MetaIndexStatusView = stored ?? { indexed: false, version: row.version }
    return building === id ? { ...base, build: buildingView() } : base
  }

  /** 一个 Home 现在的类索引状态：存下来的那份，外加（如果它在跑）扫描进度。 */
  const classStatusOf = (id: string): ClassIndexStatusView => {
    const row = payload.homes.find(candidate => candidate.id === id) ?? HOME_HOMES[0] as HomeView
    const stored = CLASS_SETTLED[row.version]
    const base: ClassIndexStatusView = stored ?? { indexed: false, version: row.version }
    return classBuilding === id ? { ...base, build: classBuildingView() } : base
  }

  return {
    listHomes: () => Promise.resolve(payload),

    saveHome: (_id, input) => Promise.resolve(viewOf(input)),

    // 预览里的写操作不落地：下一次 load() 读到的还是同一份 payload，所以删掉的行
    // 会再回来。静态预览图要的正是这个确定性。
    removeHome: () => Promise.resolve(),

    probeHome: (id) => {
      const row = payload.homes.find(candidate => candidate.id === id)
      return Promise.resolve(row ?? HOME_HOMES[0] as HomeView)
    },

    // 宿主报的是 `native`（本地桌面上就是这个）：点一下就是选中一个目录。
    // 「这个宿主没有选择器」那条结论要另一个实现，见 {@link homesWithoutPicker}。
    pickPath: () => Promise.resolve({ kind: 'native', path: HOME_PICKED_PATH }),

    setDefaultHome: (id) => {
      const row = payload.homes.find(candidate => candidate.id === id)
      return Promise.resolve(
        row === undefined ? HOME_HOMES[0] as HomeView : { ...row, isDefault: true },
      )
    },

    // 五条登记在这里各答各的：2111 已建且新鲜、2312 已建但过期、其余三个还没建——
    // 三种结论在预览里各出现一次，否则某一段文案永远不上图。
    metaStatus: (id, fresh) => Promise.resolve(statusOf(id, fresh)),

    // 「重建」只走到「开始跑了」：进度停在这儿不再前进。真机上它会结束，但静态页要
    // 的是一张「正在建」的图，而不是一个会自己收尾的构建。
    //
    // `started: true` 与真机一致——面板据此开始轮询（`HomeManager.tsx:359`），
    // 而这里那份进度永远不前进，所以图上定格的就是「正在建」。
    buildMeta: (id) => {
      building = id
      return Promise.resolve({ started: true, status: statusOf(id, false) })
    },

    // 类索引那一条完全照做：进度定格在「正在建」，按钮改口叫「建立中…」。
    classStatus: (id) => Promise.resolve(classStatusOf(id)),

    buildClass: (id) => {
      classBuilding = id
      return Promise.resolve({ started: true, status: classStatusOf(id) })
    },

    // 删除不落地：下一次 `load()` 读到的还是同一份 payload，所以删掉的索引会回来。
    // 静态预览图要的正是这个确定性。真机上这里回 `false` 的那条分支（文件已经不在了）
    // 见 {@link homesWithVanishedIndex}。
    removeClassIndex: () => Promise.resolve(true),
  }
}

/**
 * 一台刚把类索引建**失败**过的机器。
 *
 * 与元数据那条不同的地方：失败是服务端**记着的**一句话（`class-service.ts` 把 error
 * 留在那次构建的状态里），所以它不需要点击就能画出来——这也正是真机上的样子，打开
 * 面板就会看见上一次失败的原因。
 *
 * 挑 `ncc-2105` 那条（路径失效的登记）当默认：它的失败理由最真，也正好把「失败」和
 * 「路径失效」两种红字排在同一个详情栏里，要判断的就是这两句会不会挤成一团。
 *
 * @param payload - `GET /homes` 的答案；默认 {@link HOME_PAYLOAD}。
 * @param failed - 报失败的那条登记的 id。
 * @returns 面板要的那几个方法；被点的那条 id 永远给出失败状态，其余照常。
 */
export function homesWithClassFailure(
  payload: HomeListPayload = HOME_PAYLOAD,
  failed = 'ncc-2105',
): HomeApi {
  const base = homesFixture(payload)
  return {
    ...base,
    classStatus: (id) => {
      const row = payload.homes.find(candidate => candidate.id === id) ?? HOME_HOMES[0] as HomeView
      const stored = CLASS_SETTLED[row.version]
      const state: ClassIndexStatusView = stored ?? { indexed: false, version: row.version }
      return Promise.resolve(id === failed
        ? { ...state, build: classFailedView(classPathError(row.path)) }
        : state)
    },
  }
}

/**
 * 一台「按下删除那一刻文件已经不在了」的机器。
 *
 * 这条分支只有点了删除才会出现：状态刚说「有索引」（按钮画出来了），点下去的时候文件
 * 已经被别的东西删掉。它的验收落在那一句答复上——「本来就没有索引文件，没有删掉任何
 * 东西」——因为不说这一句，使用者会以为删除成功了。
 *
 * @param payload - `GET /homes` 的答案；默认 {@link HOME_PAYLOAD}。
 * @returns 面板要的那几个方法；删除一律回 `false`。
 */
export function homesWithVanishedIndex(payload: HomeListPayload = HOME_PAYLOAD): HomeApi {
  return { ...homesFixture(payload), removeClassIndex: () => Promise.resolve(false) }
}

/**
 * 一台没有本地目录选择器的宿主：面板从局域网地址或 SSH 打开时就是这个样子。
 *
 * 只换掉 `pickPath`：这时表单下面会多出一句「在这台机器上登记不了 Home」的说明，
 * 而那条路径**永远不上图**（静态页模拟不了点击），所以它的验收落在断言上。
 */
export function homesWithoutPicker(payload: HomeListPayload = HOME_PAYLOAD): HomeApi {
  return {
    ...homesFixture(payload),
    pickPath: () => Promise.resolve({ kind: 'unavailable' }),
  }
}

/**
 * 直接摊给 spec 的那一份：
 * `render(<HomeManager t={t} onClose={() => {}} {...HOME_FIXTURE} />)`。
 */
export const HOME_FIXTURE: HomeApi = homesFixture()
