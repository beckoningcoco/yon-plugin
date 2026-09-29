/**
 * The reading the knowledge-base tools rest on: that a page's physical table, its
 * field count and its references come out of both of the vault's writing styles,
 * and that the graph built from them separates a reference that leads somewhere
 * from one that names an entity no page covers.
 *
 * Both styles appear in every case that could differ between them, because they
 * are not hypothetical: of the vault's 5374 pages, 4992 use Chinese headings and
 * 382 use English ones, the two sets do not overlap, and a reader that knew only
 * one style looked correct while being wrong about every page of the other. That
 * mistake was made three times before this file existed.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseEntityPage, type WikiIndex } from '../src/host/wiki-index.ts'
import { assessPage, buildGraph, gapsOf, relationsOf, summaryOf } from '../src/host/wiki-graph.ts'
import { createWikiUsageLog } from '../src/host/wiki-usage.ts'

/** A page in the Chinese style: a table, two fields, three references. */
const CHINESE_PAGE = `---
platform_version: "BIP V5"
status: verified
last_verified: 2026-06-03
---

# 订单详情 (\`voucher.order.OrderDetail\`)

## 基本信息

| 属性 | 值 |
|------|-----|
| 物理表 | \`orderdetail\` |
| domain/服务域 | \`udinghuo\` |
| 所属应用 | \`SCMSA\` |

## 全部直接属性（共 2 个）

| # | 字段名 | 显示名 | 数据库列 | 类型 |
|---|--------|--------|---------|------|
| 1 | \`id\` | 主键 | \`id\` | Long |
| 2 | \`rowno\` | 行号 | \`rowno\` | Integer |

## 关联属性（1个）

| # | 字段名 | 显示名 | 目标实体 | 隔离级 |
|---|--------|--------|---------|--------|
| 1 | \`orderId\` | 订单 | \`voucher.order.Order\` | None |

## 子表

| 字段名 | URI | 关系 |
|--------|-----|------|
| \`details\` | \`voucher.order.Details\` | composition |

## 继承接口 (1个, 1字段)

- **审计信息** (\`iuap.busiObj.IAuditInfo\`)
  - \`creator\` → \`creator\`
`

/** A page in the English style, whose labels and section names all differ. */
const ENGLISH_PAGE = `# 候选人 (\`hred.hrcandidate.HrCandidate\`)

## Basic Info

| Property | Value |
|----------|-------|
| tableName | bd_staff |
| domain | hrcloud-staff-mgr |
| applicationCode | HRED |
| superUri | hred.staff.Staff |

## All Fields (3)

| # | name | displayName | columnName | typeUri |
|---|------|-------------|------------|---------|
| 1 | id | 主键 | id |  |
| 2 | unitId | 组织 | unit_id | org.func.AdminOrg |
| 3 | deptId | 部门 | dept_id | org.func.AdminOrg |

## Reference Fields (2)

| # | name | displayName | columnName | typeUri |
|---|------|-------------|------------|---------|
| 1 | unitId | 组织 | unit_id | org.func.AdminOrg |
| 2 | postId | 岗位 | post_id | bd.duty.Position |

## Child Tables (2)

| # | name | displayName | typeUri |
|---|------|-------------|---------|
| 1 | ass | 绩效信息 | hred.hrcandidate.Ass |
| 2 | health | 健康信息 | hred.hrcandidate.HealthSituation |
`

const chinese = parseEntityPage(CHINESE_PAGE, 'wiki/entities/销售订单-OrderDetail.md', '销售订单-OrderDetail')
const english = parseEntityPage(ENGLISH_PAGE, 'wiki/entities/hred_hrcandidate_HrCandidate.md', 'hred_hrcandidate_HrCandidate')

/** The index the graph cases run against, built without touching a disk. */
const index: WikiIndex = {
  version: 2,
  vault: '/vault',
  builtAt: '2026-09-29T00:00:00.000Z',
  entities: [
    { ...chinese, uri: 'voucher.order.OrderDetail' },
    { ...english, uri: 'hred.hrcandidate.HrCandidate' },
    // Two pages that the references above can resolve to.
    { uri: 'voucher.order.Order', page: '销售订单元数据', file: 'wiki/entities/a.md', name: '销售订单' },
    { uri: 'org.func.AdminOrg', page: '元数据-org_func_AdminOrg', file: 'wiki/entities/b.md', name: '管理组织' },
  ],
}

/** Temp directories made by a case, removed after it. */
const made: string[] = []
afterEach(async () => {
  while (made.length > 0) {
    const dir = made.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe('parseEntityPage', () => {
  it('reads the Chinese style: labels, table and counted field heading', () => {
    expect(chinese.table).toBe('orderdetail')
    expect(chinese.domain).toBe('udinghuo')
    expect(chinese.app).toBe('SCMSA')
    expect(chinese.fieldCount).toBe(2)
    expect(chinese.version).toBe('BIP V5')
  })

  it('reads the English style, whose labels are entirely different words', () => {
    // Reading only `物理表` left all 382 English pages looking like entities with
    // no table, and the level badge then reported them as conceptual.
    expect(english.table).toBe('bd_staff')
    expect(english.domain).toBe('hrcloud-staff-mgr')
    expect(english.app).toBe('HRED')
  })

  it('takes the field count from All Fields, never from Reference Fields', () => {
    // `Reference Fields (2)` counts references, not fields. Accepting the bare word
    // `Fields` made this page claim 2 fields while listing 3.
    expect(english.fieldCount).toBe(3)
  })

  it('reads references out of Chinese section tables', () => {
    const kinds = (chinese.refs ?? []).map(ref => `${ref.kind}:${ref.uri}`)
    expect(kinds).toContain('reference:voucher.order.Order')
    expect(kinds).toContain('composition:voucher.order.Details')
    expect(kinds).toContain('implements:iuap.busiObj.IAuditInfo')
  })

  it('reads references out of English section tables', () => {
    const kinds = (english.refs ?? []).map(ref => `${ref.kind}:${ref.uri}`)
    expect(kinds).toContain('reference:org.func.AdminOrg')
    expect(kinds).toContain('reference:bd.duty.Position')
    expect(kinds).toContain('composition:hred.hrcandidate.Ass')
    expect(kinds).toContain('composition:hred.hrcandidate.HealthSituation')
    expect(kinds).toContain('extends:hred.staff.Staff')
  })

  it('finds the reference column by its header, not by its position', () => {
    // `关联属性` puts the target fourth and `Child Tables` puts it fourth of a
    // different set; both are found because the header says so. A page mixing the
    // two orders must therefore read the same.
    const mixed = parseEntityPage(
      '# x (`a.b.C`)\n\n## 子表\n\n| 关系 | URI |\n|------|-----|\n| composition | `a.b.D` |\n',
      'wiki/entities/x.md', 'x',
    )
    expect(mixed.refs).toEqual([{ uri: 'a.b.D', kind: 'composition' }])
  })

  it('leaves references absent on a page that names none', () => {
    const bare = parseEntityPage('# 枚举 (`a.b.Enum`)\n\n## 基本信息\n', 'wiki/entities/e.md', 'e')
    expect(bare.refs).toBeUndefined()
    expect(bare.fieldCount).toBeUndefined()
  })
})

describe('buildGraph', () => {
  it('resolves a reference to a page and counts the edge both ways', () => {
    const graph = buildGraph(index)
    expect(graph.byUri.get('voucher.order.Order')).toBe('销售订单元数据')
    expect(graph.incoming.get('销售订单元数据')).toEqual([
      { from: '销售订单-OrderDetail', kind: 'reference' },
    ])
    expect(graph.out.get('销售订单-OrderDetail')?.length).toBe(3)
  })

  it('keeps a reference to an uncovered entity as a hole rather than an edge', () => {
    const graph = buildGraph(index)
    // `voucher.order.Details` and `iuap.busiObj.IAuditInfo` have no page.
    expect(graph.missing.has('voucher.order.Details')).toBe(true)
    expect(graph.danglingEdges).toBeGreaterThan(0)
    expect(graph.resolvedEdges).toBeGreaterThan(0)
  })

  it('records who cites a hole, so the hole can be judged', () => {
    const graph = buildGraph(index)
    expect(graph.missing.get('iuap.busiObj.IAuditInfo')?.citedBy).toEqual(['销售订单-OrderDetail'])
  })

  it('counts connectivity, including the pages with neither direction', () => {
    const stats = summaryOf(index, buildGraph(index))
    expect(stats.pages).toBe(4)
    expect(stats.withOutgoing).toBe(2)
    expect(stats.withIncoming).toBe(2)
    // Every page here is reachable in one direction or the other, so none is
    // isolated — the case that matters is that the tally can say so.
    expect(stats.isolated).toBe(0)
  })
})

describe('assessPage', () => {
  const graph = buildGraph(index)

  it('grades a page with a table and a field list as able to answer a query', () => {
    const verdict = assessPage(chinese, graph)
    expect(verdict.level).toBe('query-ready')
    expect(verdict.table).toBe('orderdetail')
    expect(verdict.fieldCount).toBe(2)
    expect(verdict.lacks).toEqual([])
  })

  it('grades a page with a table but no field list as merely locatable', () => {
    const verdict = assessPage(
      { uri: 'a.b.C', page: 'c', file: 'f.md', name: 'C', table: 'c_table' },
      graph,
    )
    expect(verdict.level).toBe('locatable')
    expect(verdict.lacks.join('')).toContain('列名')
  })

  it('grades a page with no table as conceptual and says what to do instead', () => {
    const verdict = assessPage(
      { uri: 'a.b.D', page: 'd', file: 'f.md', name: 'D' },
      graph,
    )
    expect(verdict.level).toBe('concept')
    expect(verdict.lacks.join('')).toContain('物理表')
  })
})

describe('relationsOf', () => {
  const graph = buildGraph(index)

  it('keeps a reference whose target has no page, instead of dropping it', () => {
    // Dropping it understated the schema: a page naming 45 child tables has 45
    // child tables whether or not the vault documents them.
    const relations = relationsOf('销售订单-OrderDetail', graph)
    const composition = relations.outgoing.get('composition') ?? []
    expect(composition).toEqual(['voucher.order.Details'])
    expect(relations.unresolved.total).toBe(2)
  })

  it('reports the incoming direction, which a name search cannot', () => {
    const relations = relationsOf('销售订单元数据', graph)
    expect(relations.incoming.get('reference')).toEqual(['销售订单-OrderDetail'])
  })

  it('returns empty sides for a page the graph has never seen', () => {
    const relations = relationsOf('不存在的页面', graph)
    expect(relations.outgoing.size).toBe(0)
    expect(relations.incoming.size).toBe(0)
    expect(relations.unresolved.total).toBe(0)
  })
})

describe('gapsOf', () => {
  it('sorts the largest hole first', () => {
    const graph = buildGraph(index)
    const gaps = gapsOf(graph, 5)
    expect(gaps.length).toBeGreaterThan(0)
    const cited = gaps.map(gap => gap.cited)
    expect([...cited].sort((a, b) => b - a)).toEqual(cited)
  })
})

describe('createWikiUsageLog', () => {
  it('folds the log into what it could not answer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-usage-'))
    made.push(dir)
    const log = createWikiUsageLog(join(dir, 'usage.jsonl'))

    await log.record({ tool: 'wiki_lookup', term: '销售订单', hits: 49, top: '销售订单元数据' })
    await log.record({ tool: 'wiki_lookup', term: 'clm_contract', hits: 0 })
    await log.record({ tool: 'wiki_lookup', term: 'clm_contract', hits: 0 })
    await log.record({ tool: 'wiki_read', term: '没有的页面', hits: 0 })

    const summary = await log.summary()
    expect(summary.total).toBe(4)
    expect(summary.misses.map(miss => `${miss.term}×${miss.count}`)).toEqual(['clm_contract×2', '没有的页面×1'])
    expect(summary.popular[0]).toEqual({ term: 'clm_contract', count: 2 })
    expect(summary.since).toBeDefined()
  })

  it('starts empty rather than failing when no log exists yet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-usage-'))
    made.push(dir)
    const summary = await createWikiUsageLog(join(dir, 'absent.jsonl')).summary()
    expect(summary).toEqual({ total: 0, misses: [], popular: [] })
  })

  it('survives a half-written line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yon-wiki-usage-'))
    made.push(dir)
    const target = join(dir, 'usage.jsonl')
    const log = createWikiUsageLog(target)
    await log.record({ tool: 'wiki_lookup', term: 'ok', hits: 1 })
    const { appendFile } = await import('node:fs/promises')
    await appendFile(target, '{"tool":"wiki_lookup","term":\n', 'utf8')
    const summary = await log.summary()
    expect(summary.total).toBe(1)
  })
})
