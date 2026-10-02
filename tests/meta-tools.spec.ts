/**
 * The metadata tools: what the model is offered, and what a call hands the service.
 *
 * Two rules are checked here rather than in the index's own cases, because they are
 * properties of the *tool* and not of the query:
 *
 * - **`kind` is closed.** The description tells the model there are exactly three, so a
 *   fourth has to be refused rather than quietly turned into a substring search — a
 *   misspelled `kind` that still answers is a wrong answer nobody can see.
 * - **The limit the model asks for is clamped, not obeyed.** `limit: 100000` must not
 *   put a hundred thousand entities in the conversation.
 *
 * The service is a stand-in that records its arguments: what is under test is the
 * boundary between the tool and the service, and the index's own behaviour is covered
 * where it lives (`meta-index.spec.ts`). Nothing here touches disk.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { META_TOOL_NAMES, registerYonMetaTools } from '../src/host/meta-tools.ts'
import { DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from '../src/host/meta-index.ts'
import type {
  MetaDetailAnswer, MetaQueryAnswer, YonMetaService,
} from '../src/host/meta-service.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** One recorded execution, as the registry would hand it over. */
function execution(signal: AbortSignal = liveSignal): YonToolExecution {
  return { name: 'call', arguments: {}, callId: 'call-1', signal, agent: {} }
}

/** One call a stand-in service was asked for. */
interface Recorded {
  readonly kind: string
  readonly home: string
  readonly term: string
  readonly limit: number
  readonly entity?: string
  readonly file?: string
}

/** A query answer with everything a case does not care about already filled in. */
function answer(overrides: Partial<MetaQueryAnswer> = {}): MetaQueryAnswer {
  return {
    home: 'ncc-2111',
    version: '2111',
    kind: 'entity',
    term: 'psndoc',
    total: 0,
    truncated: false,
    entities: [],
    enums: [],
    stale: false,
    ...overrides,
  }
}

/** Mount the tools over a service stand-in. */
function bench(query: MetaQueryAnswer = answer(), detail?: MetaDetailAnswer): {
  readonly tool: (name: string) => YonToolDefinition
  readonly calls: readonly Recorded[]
} {
  const calls: Recorded[] = []
  const meta = {
    async query(home: string, kind: 'entity' | 'field' | 'enum', term: string, limit: number) {
      calls.push({ home, kind, term, limit })
      return query
    },
    async detail(home: string, entity: string, file?: string) {
      calls.push({ home, kind: 'detail', term: entity, limit: 0, ...file === undefined ? {} : { file } })
      return detail ?? {
        home,
        version: '2111',
        entity,
        filename: entity,
        displayName: '',
        tableName: '',
        fullClassName: '',
        module: 'test',
        file: 'modules/test/METADATA/test.bmf',
        fields: [],
        others: [],
      }
    },
  } as unknown as YonMetaService

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  ctx.provide('tools', {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  } as never)
  registerYonMetaTools(ctx, meta)

  return {
    tool(name) {
      const found = registered.find(candidate => candidate.name === name)
      if (found === undefined) throw new Error(`no tool ${name}`)
      return found
    },
    calls,
  }
}

/** The text one tool's render produced, which is what the model actually reads. */
function textOf(tool: YonToolDefinition, value: unknown): string {
  const blocks = tool.output?.render({}, value) ?? []
  return blocks.map(block => block.text).join('\n')
}

describe('the registrations', () => {
  it('registers exactly the two names it exports', () => {
    const { tool } = bench()
    for (const name of META_TOOL_NAMES) expect(tool(name)).toBeTruthy()
    expect(META_TOOL_NAMES).toEqual(['ncc_meta_find', 'ncc_meta_detail'])
  })

  it('tells the model the kinds are a closed set of three, and that home is an id', () => {
    const { tool } = bench()
    const find = tool('ncc_meta_find')
    expect(find.description).toContain('entity / field / enum')
    expect(find.description).toContain('those are the only three')
    expect(find.description).toContain('never a path')
    // The measured fact behind "several files may define one name" belongs in the
    // description: without it the model treats a four-row answer as a bug.
    expect(find.description).toContain('psndoc')
    expect(tool('ncc_meta_detail').description).toContain('never a path')
  })

  it('withdraws both registrations when the plugin unloads', () => {
    const ctx = new Context()
    const registered: string[] = []
    ctx.provide('tools', {
      register(definition: YonToolDefinition): () => void {
        registered.push(definition.name)
        return () => { registered.splice(registered.indexOf(definition.name), 1) }
      },
    } as never)
    const dispose = registerYonMetaTools(ctx, {} as never)
    expect(registered.sort()).toEqual([...META_TOOL_NAMES].sort())
    dispose()
    expect(registered).toEqual([])
  })
})

describe('ncc_meta_find', () => {
  it('passes the kind, the term and a clamped limit through', async () => {
    const { tool, calls } = bench()
    await tool('ncc_meta_find').execute({ home: ' ncc-2111 ', kind: 'field', q: ' 员工 ' }, execution())
    await tool('ncc_meta_find').execute({ home: 'ncc-2111', kind: 'enum', q: '待审批', limit: 9999 }, execution())
    await tool('ncc_meta_find').execute({ home: 'ncc-2111', kind: 'entity', q: 'x', limit: 0.5 }, execution())
    // The tool description says 20 and 100, so the clamp has to be exactly those.
    expect(calls).toEqual([
      { home: 'ncc-2111', kind: 'field', term: '员工', limit: DEFAULT_QUERY_LIMIT },
      { home: 'ncc-2111', kind: 'enum', term: '待审批', limit: MAX_QUERY_LIMIT },
      { home: 'ncc-2111', kind: 'entity', term: 'x', limit: 1 },
    ])
  })

  it('refuses a kind outside the closed set', async () => {
    const { tool, calls } = bench()
    // `table` is the plausible mistake: the model has been reading NCC table names.
    await expect(tool('ncc_meta_find').execute(
      { home: 'ncc-2111', kind: 'table', q: 'bd_psndoc' }, execution(),
    )).rejects.toThrow(/entity \/ field \/ enum/)
    await expect(tool('ncc_meta_find').execute(
      { home: 'ncc-2111', q: 'bd_psndoc' }, execution(),
    )).rejects.toThrow(/entity \/ field \/ enum/)
    // Nothing reached the service, so nothing was searched for as a substring.
    expect(calls).toEqual([])
  })

  it('refuses a missing term or home rather than searching for nothing', async () => {
    const { tool } = bench()
    await expect(tool('ncc_meta_find').execute(
      { home: 'ncc-2111', kind: 'entity', q: '   ' }, execution(),
    )).rejects.toThrow(/q 必须是非空字符串/)
    await expect(tool('ncc_meta_find').execute(
      { kind: 'entity', q: 'x' }, execution(),
    )).rejects.toThrow(/home 必须是非空字符串/)
    await expect(tool('ncc_meta_find').execute(
      { home: '   ', kind: 'entity', q: 'x' }, execution(),
    )).rejects.toThrow(/home 必须是非空字符串/)
  })

  it('refuses a non-object argument and a cancelled call', async () => {
    const { tool } = bench()
    const find = tool('ncc_meta_find')
    await expect(find.execute([], execution())).rejects.toThrow(/需要一个对象参数/)
    await expect(find.execute(null, execution())).rejects.toThrow(/需要一个对象参数/)
    const aborted = new AbortController()
    aborted.abort()
    await expect(find.execute(
      { home: 'ncc-2111', kind: 'entity', q: 'x' }, execution(aborted.signal),
    )).rejects.toThrow(/已被取消/)
    // The pending-state card needs the arguments to be an object too, and an array is
    // not one — the UI shows no card rather than a card built from nonsense.
    expect(find.presentCall?.([])).toBeUndefined()
    expect(find.presentCall?.({ kind: 'entity', q: 'psndoc' })?.title).toContain('entity psndoc')
  })

  it('renders a field answer with the matched labels, the table and the file', () => {
    const { tool } = bench(answer({
      kind: 'field',
      term: '员工',
      total: 1,
      entities: [{
        name: 'bb_bill', filename: 'bb_bill', displayName: '单据', tableName: 't_bill',
        fullClassName: 'nc.vo.bb.BillVO', module: 'bb', file: 'modules/bb/METADATA/bill.bmf',
        primary: true, fieldCount: 12, matched: ['cworkman|员工', 'pk_org|所属组织'],
      }],
    }))
    const text = textOf(tool('ncc_meta_find'), {
      home: 'ncc-2111', version: '2111', kind: 'field', term: '员工', total: 1, truncated: false,
      stale: false, enums: [],
      entities: [{
        name: 'bb_bill', filename: 'bb_bill', displayName: '单据', tableName: 't_bill',
        fullClassName: 'nc.vo.bb.BillVO', module: 'bb', file: 'modules/bb/METADATA/bill.bmf',
        primary: true, fieldCount: 12, matched: ['cworkman|员工', 'pk_org|所属组织'],
      }],
    })
    expect(text).toContain('bb_bill（单据） · 表 t_bill · bb · 主实体')
    expect(text).toContain('命中字段：cworkman（员工）、pk_org（所属组织）')
    expect(text).toContain('modules/bb/METADATA/bill.bmf')
    // An entity-name answer has no matched fields, so it says how big the entity is
    // instead — otherwise the line would read "命中字段：" with nothing after it.
    const byName = textOf(tool('ncc_meta_find'), answer({
      entities: [{
        name: 'psndoc', filename: 'psndoc', displayName: '', tableName: 'bd_psndoc',
        fullClassName: '', module: 'uapbd', file: 'modules/uapbd/METADATA/psndoc.bmf',
        primary: false, fieldCount: 78, matched: [],
      }],
    }))
    expect(byName).toContain('78 个字段')
    expect(byName).toContain('ncc_meta_detail')
  })

  it('says the answer is stale, with the counts, before the hits', () => {
    const { tool } = bench()
    const text = textOf(tool('ncc_meta_find'), answer({
      stale: true,
      freshness: { state: 'stale', changed: 2, added: 1, removed: 3 },
    }))
    expect(text).toContain('2 个改动 · 1 个新增 · 3 个删除')
    expect(text).toContain('重建')
  })

  it('renders an enumeration answer with its values, and says so when there are none', () => {
    const { tool } = bench()
    const hit = {
      name: 'billstatus', displayName: '单据状态', fullClassName: 'nc.vo.BillStatusEnum',
      module: 'uapbd', file: 'modules/uapbd/METADATA/status.bmf',
      items: [['1', '待审批'], ['2', '已审批']] as const,
    }
    const text = textOf(tool('ncc_meta_find'), answer({ kind: 'enum', enums: [hit] }))
    expect(text).toContain('billstatus（单据状态） · uapbd')
    expect(text).toContain('取值：1=待审批、2=已审批')
    expect(text).toContain('定义：modules/uapbd/METADATA/status.bmf')

    // The empty answer has to point somewhere, because the likeliest reason a value
    // was not found is that it is not an enumeration but a plain coded column.
    const empty = textOf(tool('ncc_meta_find'), answer({ kind: 'enum', enums: [] }))
    expect(empty).toContain('没有匹配的枚举')
    expect(empty).toContain('ncc_meta_detail')
  })

  it('says a truncated answer is truncated, and how to narrow it', () => {
    // `total` is the count behind the limit and `entities` is what it was cut down to,
    // so an answer with nothing listed takes the "no match" branch instead — a case with
    // both is the only one where this footer exists.
    const { tool } = bench()
    const text = textOf(tool('ncc_meta_find'), answer({
      truncated: true,
      total: 412,
      entities: [{
        name: 'psndoc', filename: 'psndoc', displayName: '', tableName: 'bd_psndoc',
        fullClassName: '', module: 'uapbd', file: 'modules/uapbd/METADATA/psndoc.bmf',
        primary: false, fieldCount: 78, matched: [],
      }],
    }))
    expect(text).toContain('只列了前 1 个')
    expect(text).toContain('还有更多')
  })
})

describe('ncc_meta_detail', () => {
  it('passes the entity and the file, treating a blank file as none', async () => {
    const { tool, calls } = bench()
    const detail = tool('ncc_meta_detail')
    await detail.execute({ home: 'ncc-2111', entity: ' psndoc ' }, execution())
    await detail.execute({ home: 'ncc-2111', entity: 'psndoc', file: ' modules/uapbd/…/psndoc.bmf ' }, execution())
    await detail.execute({ home: 'ncc-2111', entity: 'psndoc', file: '   ' }, execution())
    expect(calls).toEqual([
      { home: 'ncc-2111', kind: 'detail', term: 'psndoc', limit: 0 },
      { home: 'ncc-2111', kind: 'detail', term: 'psndoc', limit: 0, file: 'modules/uapbd/…/psndoc.bmf' },
      { home: 'ncc-2111', kind: 'detail', term: 'psndoc', limit: 0 },
    ])
    await expect(detail.execute({ home: 'ncc-2111' }, execution())).rejects.toThrow(/entity 必须是非空字符串/)
  })

  it('renders the fields the way a data dictionary writes them', () => {
    const { tool } = bench()
    const detail: MetaDetailAnswer = {
      home: 'ncc-2111',
      version: '2111',
      entity: 'psndoc',
      filename: 'psndoc',
      displayName: '人员',
      tableName: 'bd_psndoc',
      fullClassName: 'nc.vo.bd.psn.PsndocVO',
      module: 'uapbd',
      file: 'modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf',
      fields: [
        { name: 'pk_psndoc', label: '主键', dbtype: 'char', fieldType: 'char', typeName: 'String', length: 20, precise: 0, isKey: true, isNullable: false, isReadOnly: false, isHide: false, defaultValue: '' },
        { name: 'salary', label: '薪金', dbtype: 'decimal', fieldType: 'decimal', typeName: 'Decimal', length: 20, precise: 8, isKey: false, isNullable: true, isReadOnly: true, isHide: false, defaultValue: '0' },
        { name: 'status', label: '', dbtype: '', fieldType: '', typeName: 'BillStatusEnum', length: 0, precise: 0, isKey: false, isNullable: true, isReadOnly: false, isHide: true, defaultValue: '', values: [['1', '待审批']] },
      ],
      others: ['modules/baseapp/METADATA/metadata/bbd/psninfo/psndoc.bmf'],
    }
    const text = textOf(tool('ncc_meta_detail'), detail)
    expect(text).toContain('psndoc（人员） · 表 bd_psndoc · nc.vo.bd.psn.PsndocVO')
    expect(text).toContain('3 个字段')
    expect(text).toContain('pk_psndoc（主键） char(20) [主键·非空]')
    expect(text).toContain('salary（薪金） decimal(20,8) [只读] 默认 0')
    // A field whose type resolves to an enumeration carries its values, and a field
    // with no dbtype falls back to the type name rather than printing nothing.
    expect(text).toContain('取值：1=待审批')
    expect(text).toContain('BillStatusEnum')
    expect(text).toContain('同名实体在另外 1 个文件里也有定义')
    expect(text).toContain('modules/baseapp/METADATA/metadata/bbd/psninfo/psndoc.bmf')
  })
})
