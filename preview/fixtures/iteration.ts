/**
 * 迭代表板面板的预览样本：面板 mount 后跑的那一次 `list()`，答案全在这里。
 *
 * 样本要摆进去的是这一屏**每一种行**，否则某些样式压根不会出现在图上：
 *   · 两种类型（能力不足 / 优化建议）——列表里的第一个药丸；
 *   · 三档优先级；
 *   · 四种状态各一——四种状态里有三种共用中性色、只有「待处理」是告警色，这一屏
 *     最容易画错的就是"整排都是红的"，只有四种同时出现才看得出那条规则；
 *   · **一条只写了症状的记录**：场景、期望、上下文全空，详情里的破折号就是给它画的；
 *     没有它，`Field` 那个空值分支在图上永远不出现，而"空着的字段"和"界面吃掉了这个
 *     字段"在视觉上必须分得开；
 *   · 一条没有 target 的行——列表行尾那个 `（目标）` 只在这条上不出现；
 *   · 一条长到必须折行的症状，列表那一列很窄，不测它就不知道折行好不好看。
 *
 * 数据是常量，四个方法一律返回已 resolve 的 Promise：这里**不发任何请求**，预览页
 * 要能在没有 host、没有台账文件的机器上打开。时间戳因此是编的，但要编得像真的——
 * 同一分钟里的六条会让「几点记的」这一列完全看不出作用。
 */
import type { IterationApi } from '../../src/client/iteration/api.ts'
import type {
  IterationCreatedPayload, IterationListPayload, IterationRowView, SaveIterationInput,
  UpdateIterationInput,
} from '../../src/shared/types.ts'

/** 台账文件在面板脚注里显示的那个路径。编的，与真机上的默认路径同形。 */
const PATH = 'C:/Users/99558/.dsh/yon-panel/iteration.json'

/** 六条样本，覆盖两种类型、三档优先级、四种状态。 */
export const ITERATION_ROWS: readonly IterationRowView[] = [
  {
    id: 'it-mh3k2a-7q1x',
    at: '2026-10-03T09:41:12.000Z',
    kind: 'gap',
    severity: 'high',
    scene: '查一张销售出库单的表名，要从实体名走到物理表',
    symptom: 'wiki_lookup 传实体名返回空，得先猜一个表名去 wiki_read 试，绕了三步才拿到。',
    suggestion: 'wiki_lookup 支持实体名查不到时回一条"没有这条，试试 ncc_meta_find"。',
    target: 'wiki_lookup',
    context: 'wiki_lookup(query="销售出库单") → rows: []；ncc_meta_find("销售出库单") 一次就命中。',
    status: 'open',
  },
  {
    id: 'it-mh3k2a-3f8p',
    at: '2026-10-03T02:15:40.000Z',
    kind: 'improvement',
    severity: 'medium',
    scene: '按字段名反查实体',
    symptom: '同一个字段名在几张单据上都有，元数据结果里没有区分哪张单据在用，只能一条条点开看。',
    suggestion: '结果行里带上所属单据，或者给一个按单据筛选的参数。',
    target: 'ncc_meta_find',
    context: 'ncc_meta_find(field="vbillcode") 回了 40 多条，大部分不属于我要的那张单。',
    status: 'accepted',
  },
  {
    id: 'it-mh1w9c-1d4v',
    at: '2026-10-02T13:02:55.000Z',
    kind: 'gap',
    severity: 'low',
    scene: '翻老源码找一段 GBK 注释',
    symptom: 'ncc_gbk_edit 读出来的注释是问号。',
    suggestion: '',
    target: '',
    context: '',
    status: 'fixed',
  },
  {
    id: 'it-mh1w9c-9t6b',
    at: '2026-10-01T21:38:07.000Z',
    kind: 'improvement',
    severity: 'high',
    scene: '连真实环境核对一笔单据的状态',
    symptom: 'datasource_query 的结果只给了行数，长文本列被截断到看不见的地方，还得再写一条 SQL 取子串。',
    suggestion: '返回里标出哪些列被截断了，或者给一个不截断的开关。',
    target: 'datasource_query',
    context: '一张 34 列的表，返回里 memo 列只剩前半句，没写任何截断提示；加 substr(memo,1,200) 也只多拿到 200 字。',
    status: 'dropped',
  },
  {
    id: 'it-mgzk4x-5r2n',
    at: '2026-09-30T08:20:31.000Z',
    kind: 'gap',
    severity: 'medium',
    scene: '',
    symptom: '两套知识库的名字太像，第一次用时分不清该查哪一个。',
    suggestion: '',
    target: '',
    context: '',
    status: 'open',
  },
  {
    id: 'it-mgzk4x-8w0s',
    at: '2026-09-29T16:07:03.000Z',
    kind: 'improvement',
    severity: 'low',
    scene: '一个会话里连着记了三条',
    symptom: '记第二条的时候没法确认第一条记的是不是同一件事，只好先 iteration_list 翻一遍，而列表默认只给待处理的，翻完还要自己比对症状文字。',
    suggestion: 'iteration_list 支持按 target 筛。',
    target: 'iteration',
    context: '同一会话里 iteration_add 三次，第二次和第三次各多花一次 iteration_list。',
    status: 'open',
  },
]

/** 一屏样本的读，附上文件路径。 */
export const ITERATION_PAYLOAD: IterationListPayload = { rows: ITERATION_ROWS, path: PATH }

/**
 * 面板的四个方法，全部是常量答案。
 *
 * 写的那三个也要能跑：预览页是静态的，点不动，但 `render.spec.tsx` 里有一张图是
 * **先点开表单再落盘**的（与消化面板的帮助展开同一做法），那条路径会真的调到 `create`。
 */
export const ITERATION_FIXTURE: IterationApi = {
  async list(): Promise<IterationListPayload> {
    return ITERATION_PAYLOAD
  },
  async create(input: SaveIterationInput): Promise<IterationCreatedPayload> {
    const row: IterationRowView = {
      id: 'it-preview-0001',
      at: '2026-10-03T10:00:00.000Z',
      kind: input.kind,
      severity: input.severity ?? 'medium',
      scene: input.scene ?? '',
      symptom: input.symptom,
      suggestion: input.suggestion ?? '',
      target: input.target ?? '',
      context: input.context ?? '',
      status: 'open',
    }
    return { row, created: true }
  },
  async update(id: string, patch: UpdateIterationInput): Promise<{ readonly row: IterationRowView }> {
    const found = ITERATION_ROWS.find(row => row.id === id) ?? ITERATION_ROWS[0]
    return { row: { ...(found as IterationRowView), ...patch } }
  },
  async remove(id: string): Promise<{ readonly removed: string }> {
    return { removed: id }
  },
}

/** 一条都还没记过的账本：第一屏那张图，也是这一屏最可能被看到的样子。 */
export const ITERATION_EMPTY: IterationApi = {
  ...ITERATION_FIXTURE,
  async list(): Promise<IterationListPayload> {
    return { rows: [], path: PATH }
  },
}

/** 台账文件坏了：面板要说的那句话与「还没记过」完全不同。 */
export const ITERATION_UNREADABLE: IterationApi = {
  ...ITERATION_FIXTURE,
  async list(): Promise<IterationListPayload> {
    return {
      rows: [],
      path: PATH,
      error: `无法解析 ${PATH}：它不是合法的 JSON。请修正该文件；在它修好之前，面板不会往里写。`,
    }
  },
}
