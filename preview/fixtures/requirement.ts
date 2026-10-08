/**
 * 需求条目面板的预览样本：面板 mount 后跑的那一次 `list()` 与 `listProjects()`，答案
 * 全在这里。
 *
 * 样本要摆进去的是这一屏**每一种状态**，否则某些样式压根不会出现在图上：
 *   · **六个状态各一条**——`statusTag` 给「待验收」一条失败色、给「已完成」一条成功色、
 *     其余四条共用中性色。只摆两条的话，那三个 tag 分支里有两个在整批图里没有第二次
 *     机会被看到，而它们的差别正是这一屏要给的第一眼结论；
 *   · **一个长名称**（37 字的项目名那种）——`.rowName` 吃掉剩余宽度、tag 永不被挤下去，
 *     这件事只有名称长到会顶出去才看得出；
 *   · **三个目录都有内容，且各含一个读不了的**——`user/` 是这一屏唯一由使用者亲自放
 *     东西进去的地方，它空着与满着是两句不同的话；而「读不了」的行**不给**「读」按钮、
 *     只在行下写一句原因，这条分支只有摆一个 xlsx/doc 才会被画到；
 *   · **追溯里带删除线的旧说法**——这一屏存在的理由之一就是"看得出改过什么"，而
 *     `~~` 那条渲染是 MarkdownText 给的，不摆就看不出它到底长什么样。
 *
 * 不摆 `dropped` 之外的空正文：`proseEmpty` 那句是另一屏的事，与默认页无关。
 *
 * 数据是常量，九个方法一律返回已 resolve 的 Promise：这里**不发任何请求、不碰磁盘**，
 * 预览页要能在没有 host 的机器上打开。时间戳因此是编的，但要编得像真的——六条落在同一
 * 个季度里，才看得出「建 … · 最近改动 …」那一行的日期是有信息量的。
 *
 * 项目名不另编：直接借项目面板那份样本（`createProjectFixture`），因为这一屏的项目
 * 选择器与详情里的「项目：」读的就是它——两处编两套名字，图上就会自相矛盾。
 */
import { createProjectFixture } from './project.ts'
import type { ProjectApi } from '../../src/client/project/api.ts'
import type { RequirementApi } from '../../src/client/requirement/api.ts'
import type {
  RequirementFile, RequirementFileList, RequirementFileRead,
  RequirementListPayload, RequirementSummary, RequirementView,
} from '../../src/shared/types.ts'

/** 库根，面板脚注里显示的那一行。编的，与真机上的默认路径同形。 */
const ROOT = 'C:/Users/99558/.dsh/yon-panel/requirements'

/** 条目目录的绝对路径，`openEntry` 拿到的 `fileList` 里会带一句。 */
const ENTRY_DIR = `${ROOT}/rq-7c1a`

/** 六个状态各一条。id 短、像自增过的十六进制，与宿主 `newId()` 出来的形状一致。 */
const ROWS: readonly RequirementSummary[] = [
  {
    id: 'rq-7c1a',
    projectId: 'prj-ncc-tj',
    name: '采购订单表头数量与表体合计对不上',
    status: 'review',
    createdAt: '2026-09-22T01:14:00.000Z',
    updatedAt: '2026-10-06T07:38:00.000Z',
    file: 'rq-7c1a/entry.md',
  },
  {
    id: 'rq-2f83',
    projectId: 'prj-bip-qjb',
    name: '出差申请单保存后附件不落库',
    status: 'working',
    createdAt: '2026-09-25T06:02:00.000Z',
    updatedAt: '2026-10-05T09:20:00.000Z',
    file: 'rq-2f83/entry.md',
  },
  {
    id: 'rq-9b40',
    projectId: 'prj-tj-test',
    name: '主数据分发到测试环境时缺了「库存组织」这一层',
    status: 'proposed',
    createdAt: '2026-10-02T03:47:00.000Z',
    updatedAt: '2026-10-02T03:47:00.000Z',
    file: 'rq-9b40/entry.md',
  },
  {
    id: 'rq-4e17',
    projectId: 'prj-self-panel',
    name: '需求条目管理面板（第九格）：列表 ↔ 详情两个视图',
    status: 'done',
    createdAt: '2026-09-12T08:00:00.000Z',
    updatedAt: '2026-10-01T11:05:00.000Z',
    file: 'rq-4e17/entry.md',
  },
  {
    id: 'rq-6d92',
    projectId: 'prj-xdbx-nc65',
    name: 'HG-01 固定资产卡片接口重复推送同一条记录',
    status: 'onHold',
    createdAt: '2026-08-28T02:30:00.000Z',
    updatedAt: '2026-09-19T05:12:00.000Z',
    file: 'rq-6d92/entry.md',
  },
  {
    id: 'rq-1a55',
    projectId: 'prj-hk-legacy',
    name: '旧版对账报表（2024 之前那套）不再维护',
    status: 'dropped',
    createdAt: '2026-07-15T01:00:00.000Z',
    updatedAt: '2026-09-08T10:41:00.000Z',
    file: 'rq-1a55/entry.md',
  },
]

/** 一条附件的盘上事实。`readable` 与 `note` 照宿主 `classifyFile` 的原话抄。 */
function fileOf(
  dir: RequirementFile['dir'],
  name: string,
  bytes: number,
  modifiedAt: string,
  note?: string,
): RequirementFile {
  return {
    dir,
    name,
    file: `rq-7c1a/${dir}/${name}`,
    bytes,
    modifiedAt,
    readable: note === undefined,
    ...note === undefined ? {} : { note },
  }
}

/**
 * 三个目录。
 *
 * `user/` 里那两件是「他给的」：一件可读的对照表、一件 xlsx——后者**没有**「读」这个
 * 按钮，只在行下写一句「这是 Office 的压缩包格式（xlsx），正文要解开压缩包才拿得到」，
 * 那句话是宿主 `requirement-files.ts:81` 的原话，一字未改（图上那句话要能当真）。
 */
export const REQUIREMENT_GROUPS: RequirementFileList = {
  id: 'rq-7c1a',
  entry: '采购订单表头数量与表体合计对不上',
  dir: ENTRY_DIR,
  groups: [
    {
      dir: 'user',
      bytes: 61_952 + 248,
      files: [
        fileOf('user', '卡片接口清单.xlsx', 61_952, '2026-09-23T02:10:00.000Z',
          '这是 Office 的压缩包格式（xlsx），正文要解开压缩包才拿得到，现在还读不了。'),
        fileOf('user', '新旧字段对照.txt', 248, '2026-09-23T02:12:00.000Z'),
      ],
    },
    {
      dir: 'generated',
      bytes: 9_411 + 1_820 + 42_008,
      files: [
        fileOf('generated', 'HG-01 接口设计.md', 9_411, '2026-10-05T04:31:00.000Z'),
        fileOf('generated', '表头表体差异排查.patch', 1_820, '2026-10-06T07:35:00.000Z'),
        fileOf('generated', '上一版需求.docx', 42_008, '2026-09-30T06:20:00.000Z',
          '这是 Office 的压缩包格式（docx），正文要解开压缩包才拿得到，现在还读不了。'),
      ],
    },
    {
      dir: 'patches',
      bytes: 1_820,
      files: [
        fileOf('patches', '表头表体差异排查.patch', 1_820, '2026-10-06T07:35:00.000Z'),
      ],
    },
  ],
}

/** 正文：一段话 + 一个三条的列表。真人写需求就是这个样子，不是一句标题。 */
const PROSE = [
  '采购订单保存后，表头的 `nqty`（数量）与表体各行数量之和差 1，客户方会计说这个差'
  + '每个月都对不上一笔。他们只在**手工改过表体行**的单子上看到，自动生成的不出现。',
  '',
  '现场给的三条线索：',
  '',
  '- 单号 `CG202609000123`，表头 12，表体 11；',
  '- 同一张单子撤销重做一次就对了；',
  '- 出问题的单子都在 9 月之后开的。',
].join('\n')

/**
 * 追溯三段，中间一段带删除线。
 *
 * 删除线那一段是这一屏的非卖点卖点：`requirement-doc.ts` 剥掉它给模型，留着它给人——
 * 一张没有 `~~` 的预览页看不出这件事到底有没有在画。
 */
const NOTES: readonly string[] = [
  '2026-09-24 与客户会计王工通了电话：他们那边确认「每个月都有一笔」，不是偶发。',
  '2026-09-28 先按 ~~把表头数量改成由表体汇总~~ 试了一版，客户否了：表头那个数是他们'
  + '手工录的，不是算出来的。改成**保存时校验**，对不上就提示。',
  '2026-10-06 补丁已给到测试环境，等客户那边回一次验收结论。这一条停在「待验收」。',
]

/** 详情：`openEntry` 那一次 `read(id, { history: true })` 的答案。 */
export const REQUIREMENT_DETAIL: RequirementView = {
  ...(ROWS[0] as RequirementSummary),
  body: `${PROSE}\n\n## 标注\n\n${NOTES.join('\n\n')}\n`,
  raw: `${PROSE}\n\n## 标注\n\n${NOTES.join('\n\n')}\n`,
  prose: PROSE,
  notes: NOTES,
}

/** 一屏样本的读。 */
export const REQUIREMENT_PAYLOAD: RequirementListPayload = {
  rows: ROWS,
  root: ROOT,
  unreadable: [],
}

/** 一行一条的摘要 → 一份能读的详情。没摆正文的那五条走这条路。 */
function viewOf(row: RequirementSummary): RequirementView {
  return { ...row, body: '', raw: '', prose: '', notes: [] }
}

/** 项目选择器的选项：借项目面板那份样本，两处名字是同一套。 */
const projectApi: ProjectApi = createProjectFixture()

/** 摆在 `user/` 那份对照表上的那几行，读出来就是这个。 */
const TEXT_OF: Readonly<Record<string, string>> = {
  'user/新旧字段对照.txt': [
    '旧字段名\t新字段名\t备注',
    'nqty\tnnum\t表头数量，客户手工录',
    'vbillcode\tcode\t单号',
    '',
  ].join('\n'),
  'generated/HG-01 接口设计.md': [
    '# HG-01 固定资产卡片接口',
    '',
    '## 入参',
    '',
    '| 字段 | 含义 |',
    '| --- | --- |',
    '| `pk_org` | 资产组织 |',
    '| `card_code` | 卡片编号 |',
    '',
    '## 校验',
    '',
    '保存前比对表头与表体，不一致返回 `QTY_MISMATCH`。',
  ].join('\n'),
  'generated/表头表体差异排查.patch': [
    '--- a/QtyCheck.java',
    '+++ b/QtyCheck.java',
    '@@ -18,6 +18,9 @@ public class QtyCheck {',
    '+    if (head.getNnum().compareTo(sum) != 0) {',
    '+        throw new BizException("QTY_MISMATCH");',
    '+    }',
  ].join('\n'),
  'patches/表头表体差异排查.patch': [
    '--- a/QtyCheck.java',
    '+++ b/QtyCheck.java',
    '@@ -18,6 +18,9 @@ public class QtyCheck {',
    '+    if (head.getNnum().compareTo(sum) != 0) {',
    '+        throw new BizException("QTY_MISMATCH");',
    '+    }',
  ].join('\n'),
}

/**
 * 面板那十二个方法，全部是常量答案。
 *
 * 写的那几个也要能跑：预览页是静态的、点不动，但 `render.spec.tsx` 里有几页是**先点开
 * 再落盘**的（详情、附件展开、新建表单），那些路径会真的调到 `read` / `fileRead` /
 * `fileList`。
 *
 * `list` 按 `projectId` / `status` 真的筛：面板把过滤交给宿主，样本要是无视参数一律回
 * 同一份，那"筛了没有"在图上就永远看不出来。
 */
export const REQUIREMENT_FIXTURE: RequirementApi & RequirementManagerExtras = {
  async list(query) {
    const rows = ROWS.filter(row =>
      (query?.projectId === undefined || row.projectId === query.projectId)
      && (query?.status === undefined || query.status === 'all' || row.status === query.status))
    return { ...REQUIREMENT_PAYLOAD, rows }
  },

  async read(id) {
    const row = ROWS.find(candidate => candidate.id === id)
    return row !== undefined && row.id === REQUIREMENT_DETAIL.id
      ? REQUIREMENT_DETAIL
      : viewOf(row ?? (ROWS[0] as RequirementSummary))
  },

  async create(input) {
    return {
      created: true,
      requirement: {
        ...(ROWS[0] as RequirementSummary),
        id: 'rq-new01',
        projectId: input.projectId,
        name: input.name,
        status: input.status ?? 'proposed',
        body: input.body ?? '',
      },
    }
  },

  async annotate() {
    return REQUIREMENT_DETAIL
  },

  async update() {
    return REQUIREMENT_DETAIL
  },

  async archive() {
    return { ...REQUIREMENT_DETAIL, status: 'dropped' }
  },

  async remove(id) {
    const row = ROWS.find(candidate => candidate.id === id) ?? (ROWS[0] as RequirementSummary)
    return { id: row.id, name: row.name, path: `${ROOT}/${row.id}` }
  },

  async fileList() {
    return REQUIREMENT_GROUPS
  },

  async fileRead(_id, dir, name): Promise<RequirementFileRead> {
    const file = REQUIREMENT_GROUPS.groups
      .flatMap(group => group.files)
      .find(candidate => candidate.dir === dir && candidate.name === name)
      ?? (REQUIREMENT_GROUPS.groups[0]?.files[0] as RequirementFile)
    const text = TEXT_OF[`${dir}/${name}`]
    return text === undefined
      ? { file, text: '', encoding: 'utf-8', truncated: false, note: file.note ?? '这个文件读不出文本。' }
      : { file, text, encoding: 'utf-8', truncated: false }
  },

  async importFile(_id, dir, picked) {
    const imported = fileOf(dir, picked.name, picked.size, '2026-10-07T02:00:00.000Z')
    return { entry: REQUIREMENT_GROUPS.entry, file: imported }
  },

  async removeFile(_id, dir, name) {
    const file = REQUIREMENT_GROUPS.groups
      .flatMap(group => group.files)
      .find(candidate => candidate.dir === dir && candidate.name === name)
      ?? (REQUIREMENT_GROUPS.groups[0]?.files[0] as RequirementFile)
    return { id: 'rq-7c1a', entry: REQUIREMENT_GROUPS.entry, file }
  },

  listProjects: projectApi.listProjects.bind(projectApi),
}

/** 这一屏还要项目清单，而它不是 `RequirementApi` 的一部分——单独取一下类型。 */
interface RequirementManagerExtras {
  listProjects: ProjectApi['listProjects']
}

/** 台账在、但一条都没记过：这一屏要说清「这里是什么、谁会写」。 */
export const REQUIREMENT_EMPTY: typeof REQUIREMENT_FIXTURE = {
  ...REQUIREMENT_FIXTURE,
  async list() {
    return { rows: [], root: ROOT, unreadable: [] }
  },
}

/** 台账文件坏了：与"还没记过"是完全不同的两句话，版面却几乎一样。 */
export const REQUIREMENT_READFAIL: typeof REQUIREMENT_FIXTURE = {
  ...REQUIREMENT_FIXTURE,
  async list() {
    return {
      rows: [],
      root: ROOT,
      unreadable: [],
      error: '无法解析 C:/Users/99558/.dsh/yon-panel/requirements/index.json：它不是合法的 JSON。',
    }
  },
}

/** 筛出来是空的：六条都在，只是这一格没有。标题那句话与上面两屏都不同。 */
export const REQUIREMENT_FILTERED: typeof REQUIREMENT_FIXTURE = {
  ...REQUIREMENT_FIXTURE,
  async list() {
    return { rows: [], root: ROOT, unreadable: [] }
  },
  async listProjects() {
    return []
  },
}
