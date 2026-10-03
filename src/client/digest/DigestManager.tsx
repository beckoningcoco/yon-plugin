/**
 * The digestion ledger surface: every check the checker has run, with its score.
 *
 * ## Why this surface exists
 *
 * `digest_audit` prints a verdict once and it is gone. The model reads it, maybe
 * reworks the page, and delivers — and afterwards there is no record that the
 * check ever happened, let alone how it went. That is the wrong shape for a
 * measurement: a score you cannot see later is a score you cannot act on.
 *
 * Measured on a real vault this surface is what turns a pile of summaries into a
 * chart: 27 pages whose term coverage ran from 0.2% to 42.5% against an 85% bar,
 * one PDF digested three separate times, and a 746-byte page that called a
 * messaging-platform manual a message-queue guide. Every one of those numbers was
 * computed at some point and thrown away.
 *
 * ## What it shows, and in what order
 *
 * One line of tallies (what has been checked), then the averages (how it has been
 * going), then the entries themselves (what exactly happened). The order is the
 * order of the questions: a reader arrives asking "is this thing working", and
 * only sometimes "what did the 3rd run say".
 *
 * Averages are taken only over entries where the metric applies, so a plan — which
 * has no fidelity rate — never drags that rate down, and the line above them names
 * how many audits they actually cover rather than saying "recent".
 *
 * Read-only by design. The ledger is appended by the tools themselves; a browser
 * tab has no business writing a verdict it did not compute.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DigestLogEntryView, DigestSummaryPayload } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { DigestApi } from './api.ts'
import { METRIC_ABOUT_KEYS, METRIC_LABELS, METRIC_ORDER, OUTCOME_LABELS, entryLine } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/**
 * How many recent entries the summary is asked for.
 *
 * Not "the ledger": this constant goes to `summary()`, which is `/digest/summary`
 * — and the host caps that route's `recent` at 200 (`http.ts:689`), so asking for
 * more would be silently clamped rather than honoured. The 2000 in the same file
 * is `/digest/log`'s cap (`http.ts:697`), a route this surface never calls.
 */
const SUMMARY_RECENT = 200

/** Which entries the list is showing. */
type Filter = 'all' | 'fail' | 'pass'

/** Composed props of the ledger surface. */
export interface DigestManagerProps extends DigestApi, PropsLocale<'yonPanel'> {
  /** Close the dialog. */
  onClose(): void
}

/**
 * A stable key for one entry.
 *
 * Deliberately not the array index: the list is refetched whenever the operator
 * hits refresh, and an index-keyed row would silently transfer its expanded state
 * to whatever entry slid into that position.
 * @param entry - the ledger row.
 * @returns the key.
 */
function keyOf(entry: DigestLogEntryView): string {
  return `${entry.at}|${entry.tool}|${entry.label}|${entry.source}`
}

/** 时间戳显示成本地短格式；空的就连破折号也不给，免得看着像一条真记录。 */
function shortTime(at: string): string {
  if (at === '') return '—'
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 百分比；null 显示破折号。 */
function percent(value: number | null | undefined): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—'
}

/**
 * The mark on an empty or still-loading pane — the same gauge as the panel entry,
 * larger, so an empty surface still says what it is a surface *of*.
 * @returns the decorative svg.
 */
function EmptyMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.6 12.2a5.6 5.6 0 0 1 10.8 0"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M8 12.2 10.9 8.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M3.1 13.6h9.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function DigestManager({ summary, onClose, t }: DigestManagerProps) {
  const [data, setData] = useState<DigestSummaryPayload | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [openKey, setOpenKey] = useState<string | undefined>(undefined)
  const [helpOpen, setHelpOpen] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      // One request, not two: the summary already carries the recent entries, so
      // asking for the tail separately would fetch the same rows twice and then
      // let one copy shadow the other.
      setData(await summary(SUMMARY_RECENT))
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [summary])

  useEffect(() => { void load() }, [load])

  const head = data?.summary
  const counts = head?.byOutcome ?? {}
  const averages = head?.averages ?? {}
  const all = head?.recent ?? []
  const rows = useMemo(
    () => (filter === 'all' ? all : all.filter(entry => entry.outcome === filter)),
    [all, filter],
  )

  const loading = data === undefined && busy
  // Each count is one element, not a loose number followed by a loose word: a
  // screen reader then reads "12 failed" as a phrase rather than three fragments,
  // and the pair survives being matched as text.
  const tally = (
    <>
      <span className={css.tallyItem}>
        <span className={css.tallyNum}>{head?.total ?? 0}</span>
        {' '}{t('digest.tallyTotal')}
      </span>
      <span className={css.tallySep} aria-hidden="true">·</span>
      <span className={css.tallyItem} title={t('digest.aboutAudit')}>
        <span className={cn(css.tallyNum, css.tonePass)}>{counts.pass ?? 0}</span>
        {' '}{t('digest.tallyPass')}
      </span>
      <span className={css.tallySep} aria-hidden="true">·</span>
      <span className={css.tallyItem} title={t('digest.aboutAudit')}>
        <span className={cn(css.tallyNum, css.toneFail)}>{counts.fail ?? 0}</span>
        {' '}{t('digest.tallyFail')}
      </span>
      <span className={css.tallySep} aria-hidden="true">·</span>
      <span className={css.tallyItem} title={t('digest.aboutPlan')}>
        <span className={css.tallyNum}>{counts.plan ?? 0}</span>
        {' '}{t('digest.tallyPlan')}
      </span>
      <span className={css.tallySep} aria-hidden="true">·</span>
      {/* 门禁与摸底分开计数。它们曾被并成一个数字，而那两种检查回答的是不同的
          问题（一个"这份素材值不值得做"，一个"分几章"）——合并之后既看不出各
          自几次，也看不出总数里有没有门禁。 */}
      <span className={css.tallyItem} title={t('digest.aboutGate')}>
        <span className={css.tallyNum}>{counts.gate ?? 0}</span>
        {' '}{t('digest.tallyGate')}
      </span>
      <span className={css.tallySep} aria-hidden="true">·</span>
      <span className={css.tallyItem} title={t('digest.aboutSweep')}>
        <span className={css.tallyNum}>{counts.sweep ?? 0}</span>
        {' '}{t('digest.tallySweep')}
      </span>
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('digest.title')}
      closeLabel={t('digest.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('digest.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('digest.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body, css.body)}>
        <section className={cn(base.detailPane)} aria-label={t('digest.title')}>
          <div className={css.toolbar}>
            <p className={cn(css.tally, loading ? css.dim : undefined)}>{tally}</p>
            <div className={css.actions}>
              <div className={css.filters} role="group" aria-label={t('digest.filterAll')}>
                {(['all', 'fail', 'pass'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    className={cn(css.filter, filter === value ? css.filterOn : undefined)}
                    aria-pressed={filter === value}
                    onClick={() => { setFilter(value) }}
                  >
                    {value === 'all'
                      ? t('digest.filterAll')
                      : value === 'fail' ? t('digest.filterFail') : t('digest.filterPass')}
                  </button>
                ))}
              </div>
              {/* 这一屏上的每个词都是这套流程的内部术语。把解释放在面板里，而不是
                  指望读者先读过 skill——一个要先读文档才读得懂的面板，等于没把结果
                  交付出去。 */}
              <button
                type="button"
                className={cn(css.helpToggle, helpOpen ? css.helpToggleOn : undefined)}
                aria-pressed={helpOpen}
                aria-controls="digest-help"
                onClick={() => { setHelpOpen(value => !value) }}
              >
                {helpOpen ? '×' : '?'} {t('digest.helpToggle')}
              </button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
                {busy ? t('digest.loading') : t('digest.refresh')}
              </Button>
            </div>
          </div>

          {helpOpen && (
            <div className={css.help} id="digest-help">
              <p className={css.helpBody}>{t('digest.helpIntro')}</p>
              <dl className={css.helpList}>
                <dt>{t('digest.tallyPlan')}</dt>
                <dd>{t('digest.helpAboutPlan')}</dd>
                <dt>{t('digest.tallyGate')}</dt>
                <dd>{t('digest.helpAboutGate')}</dd>
                <dt>{`${t('digest.tallyPass')} / ${t('digest.tallyFail')}`}</dt>
                <dd>{t('digest.helpAboutAudit')}</dd>
                <dt>{t('digest.tallySweep')}</dt>
                <dd>{t('digest.helpAboutSweep')}</dd>
              </dl>
              <p className={css.helpBody}>{t('digest.helpThreshold')}</p>
              <ul className={css.helpMetrics}>
                {METRIC_ORDER.map((key) => (
                  <li key={key}>
                    <b>{METRIC_LABELS[key] ?? key}</b>
                    {' — '}
                    {t(METRIC_ABOUT_KEYS[key] ?? 'digest.noSample')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 九格只在确实算得出均值时才出现。
              全部没有样本时它是一排九个破折号——占了这一屏三分之一的高度而
              零信息，还把上面那句话又说了一遍。空着比摆一排「—」诚实。 */}
          {(head?.averagedOver ?? 0) === 0
            ? <p className={css.sectionNote}>{t('digest.averageNone')}</p>
            : (
              <>
                <p className={css.sectionNote}>
                  {t('digest.averageHint', { count: head?.averagedOver ?? 0 })}
                </p>
                <div className={css.averageGrid}>
                  {METRIC_ORDER.map((key) => {
                    const value = averages[key]
                    const shown = typeof value === 'number'
                    // The component contributes the ratio; the geometry lives in the
                    // stylesheet, so a bar that has to align with its own label stays
                    // aligned when the padding changes.
                    const ratio = shown ? Math.max(0.02, Math.min(1, value)) : 0
                    return (
                      <div
                        key={key}
                        className={css.averageCell}
                        data-empty={shown ? undefined : ''}
                        title={t(METRIC_ABOUT_KEYS[key] ?? 'digest.noSample')}
                        style={{ '--bar-ratio': String(ratio) } as CSSProperties}
                      >
                        <span className={css.averageLabel}>{METRIC_LABELS[key] ?? key}</span>
                        <span className={css.averageValue}>{percent(value ?? null)}</span>
                        <span className={css.averageBar} aria-hidden="true" />
                      </div>
                    )
                  })}
                </div>
              </>
            )}

          {loading || rows.length === 0
            ? (
              // The shared empty block rather than a bare paragraph: it centres the
              // pane the way the other four surfaces do, and its `flex: 1` fills the
              // height so an empty ledger does not leave the dialog looking half-drawn.
              <div className={cn(base.empty)}>
                <span className={cn(base.emptyMark)} aria-hidden="true"><EmptyMark /></span>
                <p className={cn(base.emptyTitle)}>
                  {loading
                    ? t('digest.loadingList')
                    : all.length === 0 ? t('digest.empty') : t('digest.emptyFiltered')}
                </p>
              </div>
            )
            : (
              <ul className={css.logList}>
                  {rows.map((entry) => {
                    const key = keyOf(entry)
                    const open = openKey === key
                    return (
                      <li key={key} className={css.logRow}>
                        <button
                          type="button"
                          className={css.logHead}
                          aria-expanded={open}
                          onClick={() => { setOpenKey(open ? undefined : key) }}
                        >
                          <span className={css.logTime}>{shortTime(entry.at)}</span>
                          <span className={css.logLine}>{entryLine(entry)}</span>
                          <span className={cn(
                            base.tag,
                            entry.outcome === 'pass'
                              ? base.tagPass
                              : entry.outcome === 'fail' ? base.tagFail : undefined,
                          )}>
                            {OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
                          </span>
                        </button>
                        {open && (
                          <div className={css.logDetail}>
                            <dl className={css.detailGrid}>
                              <dt>{t('digest.fieldLabel')}</dt>
                              <dd>{entry.label === '' ? '—' : entry.label}</dd>
                              <dt>{t('digest.fieldSource')}</dt>
                              <dd className={css.mono}>{entry.source}</dd>
                              {entry.product !== '' && (
                                <>
                                  <dt>{t('digest.fieldProduct')}</dt>
                                  <dd className={css.mono}>{entry.product}</dd>
                                </>
                              )}
                              <dt>{t('digest.fieldSize')}</dt>
                              <dd>{`${(entry.sourceBytes / 1024).toFixed(0)} KB → ${(entry.productBytes / 1024).toFixed(1)} KB`}</dd>
                              <dt>{t('digest.fieldMs')}</dt>
                              <dd>{`${entry.ms} ms`}</dd>
                            </dl>
                            <div className={css.metricStrip}>
                              {METRIC_ORDER.map((metric) => (
                                <span key={metric} className={base.tag}>
                                  {`${METRIC_LABELS[metric] ?? metric} ${percent(entry.metrics[metric] ?? null)}`}
                                </span>
                              ))}
                            </div>
                            {entry.failed.length > 0 && (
                              <p className={css.failedLine}>
                                {`${t('digest.failedItems')}${entry.failed.join('、')}`}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

          {data !== undefined && (
            <p className={css.foot}>
              <span>{t('digest.logAt')}</span>
              <span className={css.mono}>{data.path}</span>
              {all.length < (head?.total ?? 0) && (
                <span>{t('digest.showing', { shown: all.length, total: head?.total ?? 0 })}</span>
              )}
              {head?.since !== undefined && (
                <span className={css.footSince}>{t('digest.since', { at: shortTime(head.since) })}</span>
              )}
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
