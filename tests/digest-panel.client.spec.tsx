// @vitest-environment jsdom
/**
 * The digestion ledger surface: what a reader sees for an empty ledger, a busy
 * one, and a filtered one.
 *
 * These cases exist because the surface's whole value is that it tells the truth
 * about numbers nobody can see otherwise. A panel that renders "0 checks" while it
 * is still reading, or that shows a passing row under a "failed only" filter, is
 * worse than no panel — it is a confident wrong answer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  DigestLogEntryView, DigestLogSummaryView, DigestSummaryPayload,
} from '../src/shared/types.ts'
import { zh } from '../src/client/locales.ts'
import { DigestManager } from '../src/client/digest/DigestManager.tsx'

afterEach(cleanup)

// The baseline UI kit is supplied by the DSH page at runtime; the specs stub it so
// the unit under test is this plugin's own surface.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...rest }: { children: ReactNode }) => (
    <button type="button" {...rest}>{children}</button>
  ),
  Modal: ({ children, title, closeLabel, onClose }: {
    children: ReactNode, title: string, closeLabel: string, onClose(): void
  }) => (
    <div role="dialog" aria-label={title}>
      <button type="button" aria-label={closeLabel} onClick={onClose}>×</button>
      {children}
    </div>
  ),
}))

/** Translate through the zh dictionary, substituting `{name}` placeholders. */
const t = ((key: string, params?: Record<string, unknown>): string => {
  let out = (zh as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    out = out.replace(`{${name}}`, String(value))
  }
  return out
}) as never

/** One ledger row. */
function entry(over: Partial<DigestLogEntryView> = {}): DigestLogEntryView {
  return {
    at: '2026-09-30T03:20:14.000Z',
    tool: 'digest_audit',
    outcome: 'fail',
    label: '示例素材',
    source: '/vault/raw/articles/a.md',
    product: 'wiki/topics/a.md',
    pages: 1,
    failed: ['terms', 'provenance'],
    metrics: { terms: 0.12, fidelity: 0.99 },
    sourceBytes: 1024,
    productBytes: 2048,
    ms: 31,
    ...over,
  }
}

/** A payload with the given rows. */
function payload(rows: readonly DigestLogEntryView[], over: Partial<DigestLogSummaryView> = {}): DigestSummaryPayload {
  const summary: DigestLogSummaryView = {
    total: rows.length,
    averagedOver: rows.length,
    byOutcome: { pass: 1, fail: 1 },
    byTool: [{ tool: 'digest_audit', count: rows.length }],
    averages: { terms: 0.6, fidelity: 0.97 },
    recent: rows,
    ...over,
  }
  return { summary, path: '/home/.dsh/yon-panel/digest-log.jsonl' }
}

/** Render the surface with a stubbed ledger. */
function show(data: DigestSummaryPayload | Error, opts: { pending?: boolean } = {}) {
  const summary = opts.pending === true
    ? (): Promise<DigestSummaryPayload> => new Promise(() => {})
    : (): Promise<DigestSummaryPayload> => data instanceof Error
      ? Promise.reject(data)
      : Promise.resolve(data)
  render(<DigestManager summary={summary} onClose={() => {}} t={t} />)
}

/**
 * The rendered text of the whole surface.
 *
 * The counts are asserted through this rather than `getByText`, because each one is
 * a number span followed by its word — `12` has to be its own element to carry the
 * weight and colour — and `getByText` only reads an element's DIRECT text children,
 * so it sees `" 次检查"` and never `"12 次检查"`. The markup is right; the matcher
 * is the thing that cannot see across a child element.
 */
const bodyText = (): string => document.body.textContent ?? ''

describe('检查器面板', () => {
  it('空账本说明怎么让它有内容，而不是只显示零', async () => {
    show(payload([]))
    expect(await screen.findByText(zh['digest.empty'])).toBeTruthy()
  })

  it('还在读的时候不说「零次检查」——那是一个自信的错误答案', async () => {
    show(payload([]), { pending: true })
    expect(screen.getByText(zh['digest.loadingList'])).toBeTruthy()
    // 计数条确实渲染了，但还没读到数；关键是列表区说明自己在读
    expect(screen.queryByText(zh['digest.empty'])).toBeNull()
  })

  it('渲染计数、均值与记录行', async () => {
    show(payload([entry()]))
    // 均值那一格显示术语的均分
    expect(await screen.findByText('60.0%')).toBeTruthy()
    expect(bodyText()).toContain('1 次检查')
    // 行的摘要里带工具与分数
    expect(screen.getByText(/术语 12\.0%/)).toBeTruthy()
  })

  it('均值那一行写明依据是几次验收，不写「最近若干次」', async () => {
    show(payload([entry()], { averagedOver: 7 }))
    expect(await screen.findByText(/最近 7 次验收/)).toBeTruthy()
  })

  it('没有可算均值的记录时说明原因，而不是显示一排 0%', async () => {
    show(payload([], { averagedOver: 0 }))
    expect(await screen.findByText(zh['digest.averageNone'])).toBeTruthy()
  })

  it('「只看不合格」筛掉合格行，但计数条仍是全量', async () => {
    show(payload([
      entry({ outcome: 'fail', label: '坏的' }),
      entry({ outcome: 'pass', label: '好的', at: '2026-09-30T04:00:00.000Z' }),
    ]))
    expect(await screen.findByText(/术语/)).toBeTruthy()
    expect(bodyText()).toContain('2 次检查')
    // 行头是列表里唯一带 aria-expanded 的按钮，筛选用 aria-pressed，不会混进来
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: zh['digest.filterFail'] }))
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1)
    // 筛选筛的是列表，不是账本：计数条不该跟着变
    expect(bodyText()).toContain('2 次检查')
  })

  it('筛完没有匹配时，说「没有符合条件的」而不是「还没有记录」', async () => {
    show(payload([entry({ outcome: 'fail' })]))
    expect(await screen.findByText(/术语/)).toBeTruthy()
    expect(bodyText()).toContain('1 次检查')
    fireEvent.click(screen.getByRole('button', { name: zh['digest.filterPass'] }))
    expect(screen.getByText(zh['digest.emptyFiltered'])).toBeTruthy()
    expect(screen.queryByText(zh['digest.empty'])).toBeNull()
  })

  it('展开一行能看到源文档与未通过的项目', async () => {
    show(payload([entry()]))
    const head = await screen.findByRole('button', { expanded: false })
    fireEvent.click(head)
    expect(screen.getByText('/vault/raw/articles/a.md')).toBeTruthy()
    expect(screen.getByText(/未通过：terms、provenance/)).toBeTruthy()
  })

  it('读取失败时给出原因与重试', async () => {
    show(new Error('连接被拒绝'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/连接被拒绝/)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['digest.retry'] })).toBeTruthy()
  })
})
