/**
 * 数据源面板的预览样本：面板 mount 后跑的那一次 `load()`，答案全在这里。
 *
 * 为什么样本要长这样，而不是随手编几行：预览图的用途是判断视觉设计，所以样本
 * 必须把面板真实会遇到的**每一种行**都摆进去，否则某些样式压根不会出现在图上——
 *   · 已绑定项目 / 未绑定（详情页那个下拉是选中态，还是「未绑定」）；
 *   · 已存密码 / 未存密码（详情页那行是「已保存」还是「未保存」）；
 *   · 一个登录名 / 多个登录名（详情页用 ` / ` 连接）；
 *   · 库名为空（详情页那格画的是 `—`）；
 *   · 查询脚本没有连接器的类型（列表行被 `.rowUnsupported` 压暗）。
 *
 * 「不支持的库类型」落在 `mssql` 上是有据的：host 侧 `PROBEABLE_TYPES` 只认
 * oracle / dm / mysql / postgresql（见 `src/host/datasource-catalog.ts`），
 * 其余类型——包括新建表单里能选到的 oceanbase、mssql——都只能是
 * `probeable: false`。压暗的判据是 `probeable` 这个布尔值，不是 dbType 的字面
 * 值：面板写的是 `!source.probeable ? css.rowUnsupported : undefined`。
 *
 * 数据是常量，方法一律返回已 resolve 的 Promise：这里**不发任何请求**，预览页
 * 要能在没有 host、没有配置文件的机器上打开。整个文件也没有任何密码字段——
 * 服务端返回的 `DataSourceView` 本来就不带，这里也不替它补一个。
 */
import type { DataSourceApi } from '../../src/client/datasource/api.ts'
import type {
  DataSourceListPayload, DataSourceProbeResult, DataSourceView, ProjectSummary,
  SaveDataSourceInput,
} from '../../src/shared/types.ts'

/**
 * 预览要注入给 `DataSourceManager` 的那一份：接口本身，外加面板额外借来的
 * `listProjects`（面板不重新声明项目，见 `DataSourceManager.tsx:109`）。
 */
export type DataSourceFixture = DataSourceApi & {
  /**
   * 连接可以绑定的项目。签名照抄 `ProjectApi['listProjects']`，好让这份样本和
   * 面板 props 的类型永远对得上。
   */
  readonly listProjects: (includeArchived?: boolean) => Promise<readonly ProjectSummary[]>
}

/** host 侧 `PROBEABLE_TYPES` 的同款：没有连接器的类型只能是 `probeable: false`。 */
const PROBEABLE_TYPES: readonly string[] = ['oracle', 'dm', 'mysql', 'postgresql']

/**
 * 四行来源里的项目，含一个已归档的。
 *
 * 名字里不带「已归档」三个字：那三个字由面板自己拼（`project.archived`），
 * 写进 name 会让下拉里出现两遍。
 */
export const DATASOURCE_PROJECTS: readonly ProjectSummary[] = [
  {
    projectId: 'prj-jxy-ncc',
    name: '江西盐业 NCC',
    code: 'JXY-NCC',
    status: 'active',
    archived: false,
    createdAt: Date.parse('2026-06-18T02:31:00.000Z'),
    updatedAt: Date.parse('2026-09-28T07:05:00.000Z'),
    fieldCount: 4,
  },
  {
    projectId: 'prj-gtzl-bip',
    name: '贵州铁投 BIP 旗舰版',
    code: 'GTZL-BIP',
    status: 'active',
    archived: false,
    createdAt: Date.parse('2026-04-02T05:12:00.000Z'),
    updatedAt: Date.parse('2026-09-27T11:44:00.000Z'),
    fieldCount: 9,
  },
  {
    projectId: 'prj-jxyz-bip',
    name: '江西邮政 BIP 分析库',
    code: 'JXYZ-ANA',
    status: 'paused',
    archived: false,
    createdAt: Date.parse('2026-05-21T08:00:00.000Z'),
    updatedAt: Date.parse('2026-09-12T03:18:00.000Z'),
    fieldCount: 2,
  },
  {
    projectId: 'prj-lzlj-bip',
    name: '泸州老窖 BIP',
    code: 'LZLJ-BIP',
    status: 'done',
    archived: true,
    createdAt: Date.parse('2025-11-09T01:20:00.000Z'),
    updatedAt: Date.parse('2026-03-30T09:40:00.000Z'),
    fieldCount: 11,
  },
]

/**
 * 八条连接，一行为一个环境分支。
 *
 * 八这个数正好压在面板的 `SEARCH_THRESHOLD` 上：多了这一行，列表上才会出现那个
 * 搜索框（`sources.length >= SEARCH_THRESHOLD` 才渲染）。想让预览图里没有搜索
 * 框，删掉最后一行即可。
 *
 * 顺序即渲染顺序，第一行会被默认选中（`load()` 里 `payload.sources[0]?.key`），
 * 所以被压暗的那条放在**末尾**：默认那张图里，右侧详情页应该是一条第 1 行的正常
 * 数据源，而不是一条不能测试的。
 */
export const DATASOURCE_SOURCES: readonly DataSourceView[] = [
  {
    key: 'jxy-ncc-test::test',
    configKey: 'jxy-ncc-test',
    env: 'test',
    dbType: 'oracle',
    host: '10.10.20.31',
    port: 1521,
    serviceName: 'nctest',
    userNames: ['ncc'],
    hasPassword: true,
    probeable: true,
    binding: { projectId: 'prj-jxy-ncc', projectName: '江西盐业 NCC' },
  },
  {
    // 同一个项目名下的第二个环境：绑定到同一个项目，列表上看起来是一对。
    key: 'jxy-ncc-prod::prod',
    configKey: 'jxy-ncc-prod',
    env: 'prod',
    dbType: 'oracle',
    host: '10.10.20.61',
    port: 1521,
    serviceName: 'ncprod',
    userNames: ['nccloud'],
    hasPassword: true,
    probeable: true,
    binding: { projectId: 'prj-jxy-ncc', projectName: '江西盐业 NCC' },
  },
  {
    key: 'gtzl-bip-test::test',
    configKey: 'gtzl-bip-test',
    env: 'test',
    dbType: 'postgresql',
    host: '172.16.8.14',
    port: 5432,
    serviceName: 'gtzl_bip',
    userNames: ['postgres'],
    hasPassword: true,
    probeable: true,
    binding: { projectId: 'prj-gtzl-bip', projectName: '贵州铁投 BIP 旗舰版' },
  },
  {
    // 登录名多过一个：详情页会把它们用 ` / ` 连起来排。
    key: 'tj-ncc-test::test',
    configKey: 'tj-ncc-test',
    env: 'test',
    dbType: 'oracle',
    host: '10.50.6.18',
    port: 1521,
    serviceName: '',
    userNames: ['nc65', 'ncc_admin'],
    hasPassword: true,
    probeable: true,
  },
  {
    // 达梦：连接器认它，所以照样可测。
    key: 'jxyz-bip-analysis::analysis',
    configKey: 'jxyz-bip-analysis',
    env: 'analysis',
    dbType: 'dm',
    host: '10.20.1.9',
    port: 5236,
    serviceName: 'JXYZ',
    userNames: ['SYSDBA'],
    hasPassword: true,
    probeable: true,
    binding: { projectId: 'prj-jxyz-bip', projectName: '江西邮政 BIP 分析库' },
  },
  {
    // 没存密码：详情页那行画「未保存」，登录名还是有的。
    key: 'lzlj-bip-test::test',
    configKey: 'lzlj-bip-test',
    env: 'test',
    dbType: 'mysql',
    host: '10.30.4.22',
    port: 3306,
    serviceName: 'lzlj',
    userNames: ['lzlj'],
    hasPassword: false,
    probeable: true,
  },
  {
    key: 'drcb-bip-test::test',
    configKey: 'drcb-bip-test',
    env: 'test',
    dbType: 'mysql',
    host: '192.168.30.7',
    port: 3306,
    serviceName: 'drcb_bip',
    userNames: ['root'],
    hasPassword: true,
    probeable: true,
  },
  {
    // 这一条就是 `.rowUnsupported`：mssql 不在 PROBEABLE_TYPES 里，列表行被压暗，
    // 选中后详情页会多一行「查询脚本没有 mssql 的连接器…」，测试按钮也是禁用的。
    key: 'mgp-bip-test::test',
    configKey: 'mgp-bip-test',
    env: 'test',
    dbType: 'mssql',
    host: '10.40.2.5',
    port: 1433,
    serviceName: 'mgp',
    userNames: ['sa'],
    hasPassword: true,
    probeable: false,
  },
]

/**
 * `GET /datasources` 的答案。
 *
 * `seededFrom` 故意不写：host 侧注释说它「在每一份普通答案里都不出现」，只在
 * 首次运行采纳了本机旧配置时出现一次。要让预览图里多出那条「已从 … 采纳」的
 * 说明行，自己加一个 `seededFrom`（真实值是
 * `C:/Users/operator/.claude/skills/yonyou-bip-dev/db_config.json`）。
 */
export const DATASOURCE_PAYLOAD: DataSourceListPayload = {
  sources: DATASOURCE_SOURCES,
  configPath: 'C:/Users/operator/.dsh/yon-panel/db_config.json',
  complete: true,
  probeAvailable: true,
}

/** 把一次保存的输入折成列表读的那一行，形状照 `src/host/datasource-catalog.ts`。 */
function viewOf(input: SaveDataSourceInput): DataSourceView {
  const userNames = Object.keys(input.users ?? {})
  return {
    key: `${input.configKey}::${input.env}`,
    configKey: input.configKey,
    env: input.env,
    dbType: input.dbType,
    host: input.host,
    port: input.port,
    serviceName: input.serviceName ?? '',
    userNames,
    // 只写进来、不读回去：这里能说的也只有「存了没有」。
    hasPassword: userNames.length > 0,
    probeable: PROBEABLE_TYPES.includes(input.dbType),
  }
}

/**
 * 造一份可注入的接口实现。
 * @param payload - 每次 `listDataSources` 都返回它；默认 {@link DATASOURCE_PAYLOAD}。
 * @returns 面板要的那几个方法，全部立即 resolve，不碰网络。
 */
export function datasourceFixture(
  payload: DataSourceListPayload = DATASOURCE_PAYLOAD,
): DataSourceFixture {
  return {
    listDataSources: () => Promise.resolve(payload),

    // 面板调的是 `listProjects(true)`；不过滤那份已归档，它要能出现在下拉里并带上
    // 「(已归档)」。参数缺失时按面板的语义过滤掉归档项。
    listProjects: (includeArchived = false) => Promise.resolve(
      includeArchived ? DATASOURCE_PROJECTS : DATASOURCE_PROJECTS.filter(row => !row.archived),
    ),

    saveDataSource: input => Promise.resolve(viewOf(input)),

    // 预览里的写操作不落地：下一次 load() 读到的还是同一份 payload，所以删掉的行
    // 会再回来。静态预览图要的正是这个确定性。
    removeDataSource: () => Promise.resolve(),

    bindDataSource: () => Promise.resolve(),

    probeDataSource: (key, user): Promise<DataSourceProbeResult> => {
      const row = payload.sources.find(source => source.key === key)
      if (row === undefined || !row.probeable) {
        return Promise.resolve({
          ok: false,
          latencyMs: 3,
          error: row === undefined ? `unknown key: ${key}` : `no connector for ${row.dbType}`,
        })
      }
      // 成功那一支：面板据此画「连通，用时 N 毫秒，返回 1 行」。登录名分开写是
      // 因为 `exactOptionalPropertyTypes` 不接受显式给可选字段塞一个 undefined。
      const used = user ?? row.userNames[0]
      return Promise.resolve(used === undefined
        ? { ok: true, latencyMs: 46, rowCount: 1 }
        : { ok: true, latencyMs: 46, user: used, rowCount: 1 })
    },
  }
}

/**
 * 直接摊给 spec 的那一份：
 * `render(<DataSourceManager t={t} onClose={() => {}} {...DATASOURCE_FIXTURE} />)`。
 */
export const DATASOURCE_FIXTURE: DataSourceFixture = datasourceFixture()
