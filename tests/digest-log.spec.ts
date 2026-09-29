/**
 * 消化检查流水账：记了什么、折出来是什么、坏行怎么办。
 *
 * 这一层值得单独测，因为它是**唯一事后能看到的证据**。一次验收的判定在会话
 * 结束后只剩这里的一行；折错了，面板上显示的「分数」就是个假数——而它看上去
 * 和真数一模一样。
 */
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDigestLog, type DigestLogEntry } from '../src/host/digest-log.ts'

let dir: string | undefined

afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

/** 一条最小可用的验收记录。 */
function auditEntry(over: Partial<Omit<DigestLogEntry, 'at'>> = {}): Omit<DigestLogEntry, 'at'> {
  return {
    tool: 'digest_audit',
    outcome: 'fail',
    label: '示例',
    source: '/vault/raw/articles/a.md',
    product: 'wiki/topics/a.md',
    pages: 1,
    failed: ['terms'],
    metrics: { terms: 0.5, fidelity: 0.9, provenance: 0.4 },
    sourceBytes: 1000,
    productBytes: 200,
    ms: 12,
    ...over,
  }
}

describe('消化检查流水账', () => {
  it('记一条就能读回来，时间是记的时候补的', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const log = createDigestLog(path.join(dir, 'log.jsonl'))
    await log.record(auditEntry())
    const entries = await log.read()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.tool).toBe('digest_audit')
    expect(entries[0]?.outcome).toBe('fail')
    // 调用方不传时间戳，由日志自己补——否则时间就成了调用方的责任，迟早有人忘
    expect(entries[0]?.at).not.toBe('')
    expect(Number.isNaN(Date.parse(entries[0]?.at ?? ''))).toBe(false)
  })

  it('均值只在该项有值的条目上算——摸底不该把保真率往下拉', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const log = createDigestLog(path.join(dir, 'log.jsonl'))
    await log.record(auditEntry({ outcome: 'pass', metrics: { terms: 0.9, fidelity: 0.98 } }))
    await log.record(auditEntry({ outcome: 'fail', metrics: { terms: 0.5, fidelity: 0.94 } }))
    // 摸底没有保真率；若把它算进分母，均值就会被一个不存在的 0 拉低
    await log.record({
      tool: 'digest_plan', outcome: 'plan', label: 'p', source: '/vault/a.md',
      product: '', pages: 0, failed: [], metrics: {}, sourceBytes: 10, productBytes: 0, ms: 1,
      chapters: 6,
    })

    const summary = await log.summary()
    expect(summary.total).toBe(3)
    expect(summary.averages.terms).toBeCloseTo((0.9 + 0.5) / 2, 6)
    expect(summary.averages.fidelity).toBeCloseTo((0.98 + 0.94) / 2, 6)
  })

  it('按结局与工具计数，最近一条排在最前', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const log = createDigestLog(path.join(dir, 'log.jsonl'))
    await log.record(auditEntry({ outcome: 'pass' }))
    await log.record(auditEntry({ outcome: 'fail' }))
    await log.record(auditEntry({ outcome: 'fail' }))
    await log.record({
      tool: 'digest_sweep', outcome: 'sweep', label: 'v', source: '/vault',
      product: '', pages: 0, failed: [], metrics: {}, sourceBytes: 0, productBytes: 0, ms: 900,
      scanned: 13100, passing: 1, failing: 11, neverAudited: 7,
    })

    const summary = await log.summary()
    expect(summary.byOutcome.pass).toBe(1)
    expect(summary.byOutcome.fail).toBe(2)
    expect(summary.byOutcome.sweep).toBe(1)
    expect(summary.byTool[0]).toEqual({ tool: 'digest_audit', count: 3 })
    // 新的在前：最后记的那条体检排第一
    expect(summary.recent[0]?.outcome).toBe('sweep')
    expect(summary.recent[0]?.scanned).toBe(13100)
    // 「从未验收」自己一档：并进合格等于替没人验过的消化背书，并进不合格是冤枉
    expect(summary.recent[0]?.neverAudited).toBe(7)
  })

  it('旧行里没有的字段读成 undefined，而不是 0——「没记录」不能冒充「验过」', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const file = path.join(dir, 'log.jsonl')
    // 手写一条旧格式的行：根本没有 neverAudited 这个字段
    await writeFile(file, `${JSON.stringify({
      at: '2026-09-01T00:00:00.000Z', tool: 'digest_sweep', outcome: 'sweep', label: 'v',
      source: '/vault', product: '', pages: 0, failed: [], metrics: {},
      sourceBytes: 0, productBytes: 0, ms: 1, scanned: 10, passing: 1, failing: 1,
    })}\n`, 'utf8')

    const entries = await createDigestLog(file).read()
    expect(entries[0]?.neverAudited).toBeUndefined()
    expect(entries[0]?.passing).toBe(1)
  })

  it('坏行被跳过，剩下的照读——不因为一行写坏就废掉整份报告', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const file = path.join(dir, 'log.jsonl')
    const log = createDigestLog(file)
    await log.record(auditEntry({ label: '好行' }))
    // 模拟写到一半崩掉：截断的 JSON。用 appendFile 而不是 writeFile——后者的
    // 第四参会被 Node 忽略，实际按 'w' 覆盖，把上面那行冲掉（这条测试第一版
    // 就是这么假失败的）。
    await appendFile(file, '{"tool":"digest_audit","sou\n', 'utf8')
    await log.record(auditEntry({ label: '又一条好行' }))

    const entries = await log.read()
    expect(entries.map(e => e.label)).toEqual(['好行', '又一条好行'])
  })

  it('文件不存在时读成空，不抛错', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    const log = createDigestLog(path.join(dir, '从来不存在.jsonl'))
    expect(await log.read()).toEqual([])
    const summary = await log.summary()
    expect(summary.total).toBe(0)
    expect(summary.since).toBeUndefined()
  })

  it('写不进去也不抛错——验收绝不能因为日志失败而失败', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-log-'))
    // 拿一个目录当文件用，appendFile 必然失败
    const log = createDigestLog(dir)
    await expect(log.record(auditEntry())).resolves.toBeUndefined()
  })
})
