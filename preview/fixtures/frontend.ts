/**
 * 前端源码面板的预览样本：面板 mount 后跑的那一次 `load()`，答案全在这里。
 *
 * 样本要摆进去的是面板**每一种行与每一种结论**：
 *   · 一条正常登记（页面索引已建，84 节点 / 87 入口）；
 *   · 一条路径失效的登记（`.rowNotReady` 压暗）；
 *   · 空账本（还没有登记）；
 *   · 索引未建的登记（详情里画的是「还没有页面索引」而不是数字）。
 *
 * 数据是常量，方法一律返回已 resolve 的 Promise：这里**不发任何请求**，预览页要能
 * 在没有 host、没有源码工程可读的机器上打开。路径与数字按真机 1909 抄：84 个页面
 * 节点、87 个入口、7579 个文件、559.6 MB，配置里只有一个构建入口。
 */
import type { FrontendApi } from '../../src/client/frontend/api.ts'
import type {
  FrontendDirPayload, FrontendListPayload, FrontendPagesPayload, FrontendPageStatusView,
  FrontendReadPayload, FrontendView,
} from '../../src/shared/types.ts'

/** 索引状态：按真机那一次建立的样子抄。 */
const STATUS: FrontendPageStatusView = {
  builtAt: '2026-10-18T11:22:45.000Z',
  nodes: 84,
  pages: 87,
  stale: false,
  path: 'C:/Users/99558/.dsh/yon-panel/frontend_index/fe-ncc-1909.json',
}

/** 页面树：截取前四个节点，够画一屏。 */
const TREE: FrontendPagesPayload = {
  frontend: 'fe-ncc-1909',
  builtAt: STATUS.builtAt,
  totalNodes: 84,
  totalPages: 87,
  matched: 4,
  nodes: [
    {
      domain: 'epmp',
      module: 'bcs_r',
      node: 'stockinvestrela',
      dir: 'src/epmp/bcs_r/stockinvestrela',
      entries: [
        { kind: 'card', rel: 'src/epmp/bcs_r/stockinvestrela/card/index.js', bytes: 9_600 },
        { kind: 'list', rel: 'src/epmp/bcs_r/stockinvestrela/list/index.js', bytes: 4_973 },
        { kind: 'main', rel: 'src/epmp/bcs_r/stockinvestrela/main/index.js', bytes: 1_200 },
      ],
      files: 14,
      bytes: 72_700,
    },
    {
      domain: 'epmp',
      module: 'bcs_r',
      node: 'stockInvestScheme',
      dir: 'src/epmp/bcs_r/stockInvestScheme',
      entries: [{ kind: 'list', rel: 'src/epmp/bcs_r/stockInvestScheme/list/index.js', bytes: 20_200 }],
      files: 6,
      bytes: 20_200,
    },
    {
      domain: 'epmp',
      module: 'bcs_r',
      node: 'personalizedCenter',
      dir: 'src/epmp/bcs_r/personalizedCenter',
      entries: [{ kind: 'list', rel: 'src/epmp/bcs_r/personalizedCenter/list/index.js', bytes: 31_000 }],
      files: 11,
      bytes: 118_000,
    },
    {
      domain: 'epmp',
      module: 'bcs_r',
      node: 'reportManage',
      dir: 'src/epmp/bcs_r/reportManage',
      entries: [{ kind: 'list', rel: 'src/epmp/bcs_r/reportManage/list/index.js', bytes: 24_800 }],
      files: 9,
      bytes: 64_000,
    },
  ],
}

/** 展开一个节点时列出来的那一层。 */
const DIR: FrontendDirPayload = {
  frontend: 'fe-ncc-1909',
  dir: 'src/epmp/bcs_r/stockinvestrela/list',
  entries: [
    { name: 'events', rel: 'src/epmp/bcs_r/stockinvestrela/list/events', directory: true, bytes: 0 },
    { name: 'index.js', rel: 'src/epmp/bcs_r/stockinvestrela/list/index.js', directory: false, bytes: 4_973 },
    { name: 'index.less', rel: 'src/epmp/bcs_r/stockinvestrela/list/index.less', directory: false, bytes: 1_180 },
  ],
}

/** 点开一个文件时预览的那一段。 */
const FILE: FrontendReadPayload = {
  frontend: 'fe-ncc-1909',
  rel: 'src/epmp/bcs_r/stockinvestrela/list/index.js',
  encoding: 'utf-8',
  bytes: 4_973,
  totalLines: 203,
  from: 1,
  to: 200,
  truncated: false,
  masked: [],
  text: [
    '/*Q1gi9+qtyrGXje1tK+BWIA==*/',
    '/**',
    ' * @author liuyzhm 2018.6',
    ' * @description 股权投资数据维护 节点',
    ' */',
    "import React, { Component } from 'react';",
    "import { createPage, base } from 'nc-lightapp-front';",
    "import './index.less';",
    '',
    'class StockInvestRela extends Component {',
    '  render() {',
    '    return <div className="stock-invest-rela">股权投资数据维护</div>;',
    '  }',
    '}',
    '',
    'export default createPage({})(StockInvestRela);',
  ].join('\n'),
}

/** 一条登记，只写它和别的不同的部分。 */
type Seed = Partial<FrontendView> & Pick<FrontendView, 'version'>

/**
 * 一条登记。
 * @param seed - 这条和默认那条不同的字段。
 * @returns 完整的一行。
 */
function view(seed: Seed): FrontendView {
  const path = seed.path ?? 'E:/源码整理/NCC1909/NCC_1909_2005_hotwebs/hotwebs'
  return {
    id: `fe-ncc-${seed.version}`,
    label: `NCC${seed.version}`,
    path,
    product: 'ncc',
    isDefault: seed.isDefault ?? true,
    ready: seed.ready ?? true,
    profile: {
      probedAt: '2026-10-18T11:20:00.000Z',
      shape: 'scaffold',
      nodes: 84,
      pages: 87,
      pageTypes: ['card', 'list', 'main'],
      domains: [
        { name: 'domain', pages: 1, bytes: 24_000 },
        { name: 'epmp', pages: 75, bytes: 36_000_000 },
        { name: 'platform', pages: 0, bytes: 207_000_000 },
        { name: 'uap', pages: 2, bytes: 88_000_000 },
        { name: 'uapbd', pages: 9, bytes: 211_000_000 },
        { name: 'workbench', pages: 0, bytes: 17_000_000 },
      ],
      files: 7_579,
      bytes: 559_600_000,
      capped: false,
      hasNodeModules: true,
      hasDist: true,
      buildEntry: ['./src/epmp/epm_p/*/*/index.js'],
      proxy: 'http://127.0.0.1:9009',
      packageName: 'nc-multipage-demo',
      warnings: [
        '工程里有 node_modules/，统计与文件检索都已排除它。',
        '工程里有 dist/，那是构建产物，统计与文件检索都已排除它。',
        'config.json 的 buildEntryPath 只列了 1 个入口（./src/epmp/epm_p/*/*/index.js），其余页面不会参与构建；排查「改了没生效」时先看这一行。',
        'src/platform 占 207.2 MB（37%），那是运行时库本体（react/axios/echarts），不是业务代码；检索时会跳过它。',
      ],
    },
    pageIndex: { builtAt: STATUS.builtAt, nodes: 84, pages: 87, stale: false },
    ...seed,
  }
}

/**
 * 一条没有页面索引的登记。
 *
 * 用解构去掉字段，而不是赋 `undefined`：`exactOptionalPropertyTypes` 区分
 * "没有这个字段"和"字段在但值是 undefined"，而面板的判断是 `pageIndex === undefined`
 * ——它要的正是前一种。
 * @param row - 有索引的那一行。
 * @returns 同一个行，去掉 `pageIndex`。
 */
function withoutIndex(row: FrontendView): FrontendView {
  const { pageIndex: _pageIndex, ...rest } = row
  return rest
}

/** 这份样本要回答的每一种行。 */
const ROWS: readonly FrontendView[] = [
  view({ version: '1909' }),
  withoutIndex(view({
    version: '2207',
    path: 'E:/源码整理/NCC2207/somewhere-else/hotwebs',
    isDefault: false,
    ready: false,
  })),
]

/** 空账本：一条都没登记。 */
const EMPTY: FrontendListPayload = {
  frontends: [],
  configPath: 'C:/Users/99558/.dsh/yon-panel/frontend_config.json',
  complete: true,
}

/**
 * 一套预览用的 API。
 * @param rows - 列表里要出现的那几行。
 * @param indexed - 是否给出页面索引（false 时详情画的是「还没有页面索引」）。
 * @returns 面板要的全部方法。
 */
export function frontendFixture(rows: readonly FrontendView[] = ROWS, indexed = true): FrontendApi {
  const payload: FrontendListPayload = {
    frontends: rows,
    configPath: 'C:/Users/99558/.dsh/yon-panel/frontend_config.json',
    complete: true,
  }
  const status = indexed ? STATUS : undefined
  return {
    listFrontends: async () => payload,
    saveFrontend: async () => rows[0] ?? view({ version: '1909' }),
    removeFrontend: async () => {},
    probeFrontend: async () => rows[0] ?? view({ version: '1909' }),
    setDefaultFrontend: async () => rows[0] ?? view({ version: '1909' }),
    pickPath: async () => ({ kind: 'native', path: 'E:/源码整理/NCC1909/NCC_1909_2005_hotwebs/hotwebs' }),
    pages: async () => TREE,
    pageStatus: async () => status,
    rebuildPages: async () => STATUS,
    listDir: async () => DIR,
    readFile: async () => FILE,
  }
}

/** 有登记、有索引：默认页。 */
export const FRONTEND_FIXTURE: FrontendApi = frontendFixture()

/** 空账本：面板先说"还没有登记"。 */
export const FRONTEND_EMPTY: FrontendApi = frontendFixture([], false)

/** 索引未建：详情里的页面区块画按钮，而不是数字。 */
export const FRONTEND_NO_INDEX: FrontendApi = frontendFixture([withoutIndex(view({ version: '1909' }))], false)
