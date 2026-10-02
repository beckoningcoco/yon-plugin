/**
 * 项目管理面板的预览样本。
 *
 * 与 digest 的样本有一个根本差别：那份是一张死表，这份得是一个内存 store。
 * ProjectManager 的每个动作都会回读（`load` 重列一遍、每个 mutation 再取一次
 * detail），只给静态返回值的话，点一行、改一个字段，界面就会停在旧值上——而
 * 预览页是用来判断视觉设计的，一屏对不上的数据比没有数据更误导。
 *
 * store 只活在内存里，一个请求都不发：预览页是静态 HTML，背后没有宿主。
 *
 * 样本要覆盖的边界，都能在同一屏里看到：
 * - 10 个未归档 + 2 个已归档 -> 超过 SEARCH_THRESHOLD（8），搜索框出现
 * - 一个 15 字段、一个 14 字段的项目 -> 字段表长到要滚
 * - 一个 0 字段、一个字段值为空串 -> 空态与空值
 * - 一个编码留空、一个编号很长的编码 -> 列表行的两种宽度
 * - 进行中 / 已暂停 / 已完成三种状态齐全
 * - 值为数组、对象、数字、布尔、null 各一 -> 值不是纯文本时的渲染
 * - 默认选中那个项目上，值的四种读法各有一样：长文本（联调记录，要换行）、
 *   JSON 文本（数据库连接串，真实 store 里数据源配置就是这么存的）、嵌套对象
 *   （扩展参数，退回缩进的 JSON）、数组（应用服务器，列成条目）
 *
 * 字段值里的凭据一律是编的（`FAKE` 前缀）：真实 store 那一格存着明文口令，
 * 样本照形状写，绝不照内容抄。
 */
import type { ProjectDetail, ProjectSummary } from '../../src/shared/types.ts'
import type { ProjectApi } from '../../src/client/project/api.ts'

/** 样本的时间基准：2026-09-30T00:00:00Z（`new Date(BASE).toISOString()` 核过）。
 *  写死而不用 `Date.now()`：预览页要能逐次比对，每次刷新都变的时间戳比不了。 */
const BASE = 1_790_726_400_000

/** 一天。列表行的相对时间与字段的新旧都靠它算。 */
const DAY = 86_400_000

/**
 * 一份项目样本，去掉 `fieldCount`。
 *
 * 那个数由 `fields` 算出来，不手写：列表行上的「12 个字段」、删除确认里的
 * 「全部 12 个字段」都读它，手写一份就会漂移，而这一处漂移看起来正好像是
 * 字段表漏了行——最不该在预览里出现的一种误解。
 */
export type ProjectSeed = Omit<ProjectDetail, 'fieldCount'>

/**
 * 去掉只读的那份样本类型。
 *
 * 样本本身是只读的（那是数据的形状），但 store 里的那一份要能被改：面板每存一次
 * 名字或字段，回写的都是同一行。
 */
type MutableSeed = { -readonly [K in keyof ProjectSeed]: ProjectSeed[K] }

/**
 * 十二个样本项目，按列表的真实顺序。
 *
 * 名字、编码、字段名都取自真实项目的叫法（NCC / BIP 客开、报表上卷、接口联调、
 * MDD 单据扩展），因为空壳数据看不出排版问题：真正会撑破一行的是「中石化易派客
 * BIP 采购协同（二期）」这种长名字，和「测试 http://… 生产 http://…」这种长值。
 */
export const projectSeeds: readonly ProjectSeed[] = [
  {
    // 默认选中的就是它（列表第一行），所以字段最全：首屏要能看出字段表的密度。
    projectId: 'prj-ncc-tj',
    name: '用友 NCC 客开',
    code: 'NCC-2409',
    status: 'active',
    archived: false,
    createdAt: BASE - 46 * DAY,
    updatedAt: BASE - 2 * DAY,
    fields: {
      环境信息: '测试 http://ncc-test.tj.local:8080 · 生产 http://ncc.tj.local:8080',
      部署路径: '/opt/yonbip/ncc/domains/nccserver',
      版本号: 'NCC 2312 HF3',
      数据库账号: 'ncc_app（口令见密码库）',
      // JSON 文本：真实 store 里数据源配置、密码库条目就是这种一格一长串的存法。
      // 凭据是编的，形状是真的。
      数据库连接串: '{"数据源key":"FAKE-ncc-test-01","类型":"NCC2312","地址":"jdbc:oracle:thin:@10.20.31.9:1521:ncctest","账号":"FAKE_NCC_APP","口令":"FAKE-PWD-见密码库"}',
      // 嵌套两层：读不成键值列表，退回缩进的 JSON。
      扩展参数: {
        来源系统: { 编码: 'NCC2312', 名称: '用友 NCC' },
        目标系统: { 编码: 'BIP2507', 名称: '用友 BIP 旗舰版' },
      },
      // 长文本：要整段换行显示，不能被单行框截掉尾巴。
      联调记录: '2026-09-20 14:00 与客户李工、王工在会议室联调，前台保存走 biz.do 不走 execute；09-21 复现「库存组织为空」，实为卡片初始化未完成（约 1.1s 空窗）；09-22 修复并回归 29/29。',
      中间件: 'WAS 9.0.5.7 集群（2 节点）',
      应用服务器: ['10.20.31.7', '10.20.31.8'],
      数据库类型: 'Oracle 19c',
      客户联系人: '李工 13800138000',
      合同号: 'HT-2024-0917',
      上线时间: '2026-10-15',
      备份策略: '每日 02:00 全备，保留 30 天',
      备注: '',
    },
  },
  {
    projectId: 'prj-bip-qjb',
    name: 'BIP 旗舰版客开',
    code: 'BIP-2410',
    status: 'active',
    archived: false,
    createdAt: BASE - 31 * DAY,
    updatedAt: BASE - 1 * DAY,
    fields: {
      环境信息: 'https://bip.gtzl.com.cn/iuap-metadata-base',
      租户: 'gtzl',
      部署路径: '/home/yonbip/mservice',
      版本号: 'BIP 2507',
      数据库类型: 'PostgreSQL 14',
      账套: 'gtzl_bip_prod',
      对接人: '王工',
      上线时间: '2026-11-01',
    },
  },
  {
    // 已暂停：状态药丸里不该只有一种高亮。
    projectId: 'prj-tj-test',
    name: '天九 NCC 测试环境',
    code: 'TJ-NCC-TEST',
    status: 'paused',
    archived: false,
    createdAt: BASE - 120 * DAY,
    updatedAt: BASE - 17 * DAY,
    fields: {
      环境信息: 'http://10.30.1.21:8080',
      部署路径: '/opt/ncc/test',
      版本号: 'NCC 2111',
      数据库账号: 'ncc_test（口令见密码库）',
      备注: '客户侧网络策略调整，暂停联调',
    },
  },
  {
    projectId: 'prj-xdbx-nc65',
    name: '现代保险 NC65 固定资产集成',
    code: 'XDBX-NC65',
    status: 'active',
    archived: false,
    createdAt: BASE - 74 * DAY,
    updatedAt: BASE - 3 * DAY,
    fields: {
      环境信息: 'NC65 单机 http://10.40.2.9:8088',
      部署路径: '/home/nc65/ufsoft',
      集成方式: 'H1-00 / HG-01 / HG-14 三个接口',
      数据库类型: 'Oracle 11g',
      客户联系人: '张工',
      上线时间: '2026-08-20',
      备注: '已上线，遗留两条规则待确认',
    },
  },
  {
    // 已完成
    projectId: 'prj-lzlj-bip',
    name: '泸州老窖 BIP 接口联调',
    code: 'LZLJ-BIP-INT',
    status: 'done',
    archived: false,
    createdAt: BASE - 96 * DAY,
    updatedAt: BASE - 21 * DAY,
    fields: {
      环境信息: 'https://bip.lzlj.com.cn',
      对接人: '刘工 13900139000',
      验收时间: '2026-09-05',
      备注: '验收通过，转入维护',
    },
  },
  {
    projectId: 'prj-sxny-rpt',
    name: '三峡新能源 报表上卷',
    code: 'SXNY-RPT',
    status: 'active',
    archived: false,
    createdAt: BASE - 12 * DAY,
    updatedAt: BASE - 1 * DAY,
    fields: {
      报表口径: '按组织树上卷，子级去重',
      环境信息: 'https://bip.sxny.com.cn',
      负责人: '陈工',
    },
  },
  {
    // 0 字段：字段表的空态。
    projectId: 'prj-ynby-scm',
    name: '云南白药 供应链对账',
    code: 'YNBY-SCM',
    status: 'paused',
    archived: false,
    createdAt: BASE - 9 * DAY,
    updatedAt: BASE - 9 * DAY,
    fields: {},
  },
  {
    // 编码留空：列表行上「编码」那一段整个不出现。
    projectId: 'prj-self-panel',
    name: 'DSH 用友面板插件（自用）',
    code: '',
    status: 'done',
    archived: false,
    createdAt: BASE - 210 * DAY,
    updatedAt: BASE - 5 * DAY,
    fields: {
      仓库: 'E:/gitproject/dsh-plugin-yon-panel',
      发布方式: 'build-installer.bat 一条命令出安装包',
    },
  },
  {
    // 字段最多，且值的类型最杂：数组、对象、数字、布尔、null 全在这一身上。
    projectId: 'prj-df-mdd',
    name: '东风汽车 MDD 单据扩展',
    code: 'DF-MDD',
    status: 'active',
    archived: false,
    createdAt: BASE - 58 * DAY,
    updatedAt: BASE - 4 * DAY,
    fields: {
      环境信息: 'https://bip.dfmc.com.cn/iuap-metadata-base',
      租户ID: '20240917153000001',
      单据编码: 'QTRK',
      表单模板: 'MDF 库存入库单',
      自定义按钮: 3,
      启用审批流: true,
      停用日期: null,
      扩展字段: { pk_org: '库存组织', vbatchcode: '批次号', nnum: '数量' },
      联调负责人: '赵工',
      联调窗口: '每日 20:00 之后',
      灰度范围: '武汉工厂 1 号库',
      回滚方案: '停用按钮 + 还原元数据',
      关联需求单: 'REQ-2026-0413',
      备注: '前台保存走 biz.do，不走 execute',
    },
  },
  {
    // 长名字：列表行要靠省略号收住，靠 title 才能看全。
    projectId: 'prj-epec-bip',
    name: '中石化易派客 BIP 采购协同（二期）',
    code: 'SPEC-EPEC-2',
    status: 'active',
    archived: false,
    createdAt: BASE - 25 * DAY,
    updatedAt: BASE - 6 * DAY,
    fields: {
      环境信息: 'https://bip.epec.com.cn',
      对接人: '孙工',
      采购范围: '易派客商城 + 内部采购申请',
      接口清单: ['订单同步', '发票回传', '库存查询'],
      上线时间: '2026-12-01',
      备注: '二期，含三家供应商',
    },
  },
  {
    // 已归档：默认列表看不见，勾上「显示已归档」才出现。
    projectId: 'prj-hk-legacy',
    name: '华科 2024 遗留整改',
    code: 'HK-2024-LEGACY',
    status: 'done',
    archived: true,
    createdAt: BASE - 400 * DAY,
    updatedAt: BASE - 300 * DAY,
    fields: {
      环境信息: 'http://10.50.8.3:8080',
      整改范围: '固定资产三张接口单',
      结论: '已并入现代保险项目',
      归档原因: '客户侧无人跟进',
      备注: '保留备查',
    },
  },
  {
    // 已归档 + 编码留空：归档药丸和空编码同时出现在一行上。
    projectId: 'prj-temp-2608',
    name: '临时验证 2026-08（可删）',
    code: '',
    status: 'paused',
    archived: true,
    createdAt: BASE - 60 * DAY,
    updatedAt: BASE - 44 * DAY,
    fields: {
      用途: '验证字段表在长值下的换行',
    },
  },
]

/**
 * 一个样本项目在列表行上的样子：主表能独立答出的那几个字段。
 *
 * 与 {@link buildDetail} 分开写而不是从 detail 上剥掉 `fields`，是为了让返回
 * 类型受 `ProjectSummary` 约束——以后给主表加一列，这里编译不过，而不是悄悄
 * 少一列。
 * @param row - 样本项目。
 * @returns 列表行要的行。
 */
function buildSummary(row: ProjectSeed): ProjectSummary {
  return {
    projectId: row.projectId,
    name: row.name,
    code: row.code,
    status: row.status,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fieldCount: Object.keys(row.fields).length,
  }
}

/**
 * 一个样本项目的完整样子。
 *
 * `fields` 只做浅拷贝：面板从不就地改值（每次编辑都是新造一个 JsonValue），
 * 所以数组和对象值可以共用一份。
 * @param row - 样本项目。
 * @returns 面板要的 detail。
 */
function buildDetail(row: ProjectSeed): ProjectDetail {
  return { ...buildSummary(row), fields: { ...row.fields } }
}

/**
 * 建一个只活在内存里的 {@link ProjectApi}。
 *
 * 三处刻意与真实后端对齐，因为预览页要靠它们判断界面行为：
 * - `listProjects` 按 `archived` 过滤，勾「显示已归档」才会真的换一屏；
 * - 每个写操作都回读并返回改动后的 detail，面板的 `applyDetail` 拿它刷新；
 * - 未知 id 直接拒绝（真实后端答 404），面板会把它渲染成「读取失败」那一行。
 * @param seeds - 起始项目；默认是全量样本，传 `[]` 就是「还没有项目」那一屏。
 * @returns 面板驱动的那八个方法。
 */
export function createProjectFixture(seeds: readonly ProjectSeed[] = projectSeeds): ProjectApi {
  const store = new Map<string, MutableSeed>(
    seeds.map((seed): [string, MutableSeed] => [seed.projectId, { ...seed, fields: { ...seed.fields } }]),
  )
  let created = 0

  /** 取一个必须存在的样本；缺了就是样本或 id 写错了。 */
  const rowOf = (projectId: string): MutableSeed => {
    const row = store.get(projectId)
    if (row === undefined) throw new Error(`未找到项目 ${projectId}`)
    return row
  }

  return {
    async listProjects(includeArchived = false) {
      return [...store.values()]
        .filter(row => includeArchived || !row.archived)
        .map(buildSummary)
    },

    async getProject(projectId) {
      return buildDetail(rowOf(projectId))
    },

    async createProject(input) {
      const projectId = `prj-new-${++created}`
      // 新建的项目排在最后，和真实 store 的自增主键一致；面板自己会把它滚进视野。
      store.set(projectId, {
        projectId,
        name: input.name,
        code: input.code ?? '',
        status: input.status ?? 'active',
        archived: false,
        createdAt: BASE,
        updatedAt: BASE,
        fields: { ...input.fields },
      })
      return buildDetail(rowOf(projectId))
    },

    async updateProject(projectId, patch) {
      const row = rowOf(projectId)
      if (patch.name !== undefined) row.name = patch.name
      if (patch.code !== undefined) row.code = patch.code
      if (patch.status !== undefined) row.status = patch.status
      if (patch.archived !== undefined) row.archived = patch.archived
      row.updatedAt = BASE
      return buildDetail(row)
    },

    async setField(projectId, fieldKey, value) {
      const row = rowOf(projectId)
      row.fields[fieldKey] = value
      row.updatedAt = BASE
      return buildDetail(row)
    },

    async removeField(projectId, fieldKey) {
      const row = rowOf(projectId)
      delete row.fields[fieldKey]
      row.updatedAt = BASE
      return buildDetail(row)
    },

    async archiveProject(projectId, archived) {
      const row = rowOf(projectId)
      row.archived = archived
      row.updatedAt = BASE
      return buildDetail(row)
    },

    async removeProject(projectId) {
      if (!store.delete(projectId)) throw new Error(`未找到项目 ${projectId}`)
    },
  }
}

/**
 * 一份只装「值的读法」的 store：短文本、长文本、空值、JSON 文本、嵌套对象、数组、
 * 数字各一条。
 *
 * 与上面那十二份分开，是因为默认选中那个项目的字段太多，长值都落在折叠线以下：
 * 要比较「谁被遮住、谁换行」，得让这几种值同时出现在一屏里。字段名就是这一条要
 * 说明的事，所以照读法命名——这一份是给人看的一页说明，不是项目数据。
 */
export const valueShapeFixture: ProjectApi = createProjectFixture([
  {
    projectId: 'prj-values',
    name: '值的读法',
    code: 'VALUES',
    status: 'active',
    archived: false,
    createdAt: BASE - 3 * DAY,
    updatedAt: BASE - DAY,
    fields: {
      短文本: 'NCC 2312 HF3',
      长文本: '2026-09-20 14:00 与客户李工、王工在会议室联调，前台保存走 biz.do 不走 execute；09-21 复现「库存组织为空」，实为卡片初始化未完成（约 1.1s 空窗）；09-22 修复并回归 29/29。',
      空值: '',
      数字: 2312,
      JSON文本: '{"数据源key":"FAKE-ncc-test-01","类型":"NCC2312","地址":"jdbc:oracle:thin:@10.20.31.9:1521:ncctest","账号":"FAKE_NCC_APP","口令":"FAKE-PWD-见密码库"}',
      嵌套对象: { 来源系统: { 编码: 'NCC2312', 名称: '用友 NCC' } },
      数组: ['10.20.31.7', '10.20.31.8'],
    },
  },
])

/**
 * 一份只装归档样本的 store：两条归档行长什么样。
 *
 * 不能用全量样本出这张图。归档行按样本顺序排在最后，十二个项目里它们是第 11、12 行——
 * 而列表是滚动区、落盘的是静态 HTML，截出来的永远是滚到顶的那一屏，要看的行根本不在
 * 画面里。只装这两条，它们就落在第一屏。
 *
 * 「已归档」药丸与那个长编码（HK-2024-LEGACY）同时出现在一行上，正是这一页要回答的
 * 问题：第二行放不放得下三者。
 */
export const archivedFixture: ProjectApi = createProjectFixture(
  projectSeeds.filter(seed => seed.archived),
)

/**
 * 一份现成的样本 store，给「渲染一次看一眼」的用例直接用。
 *
 * 它是有状态的：同一个 spec 文件里渲染多次，前一次改过的名字会留到下一次。
 * 要比对两种改动过的状态，或者要在同一份文件里多跑几个用例，用
 * {@link createProjectFixture} 各建一份。
 */
export const projectFixture: ProjectApi = createProjectFixture()
