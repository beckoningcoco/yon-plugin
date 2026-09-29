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
 * ## What it shows
 *
 * - the tallies: how many checks ran, how many passed;
 * - **the averages** — a single verdict is an anecdote, the running average is the
 *   measurement. Averages are taken only over entries where the metric applies,
 *   so a plan (which has no fidelity rate) never drags that rate down;
 * - the recent rows, newest first, each expandable to its failing items.
 *
 * Read-only by design. The ledger is appended by the tools themselves; a browser
 * tab has no business writing a verdict it did not compute.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DigestLogEntryView, DigestSummaryPayload } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { DigestApi } from './api.ts'
import { METRIC_LABELS, METRIC_ORDER, OUTCOME_LABELS, entryLine } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Composed props of the ledger surface. */
export interface DigestManagerProps extends DigestApi, PropsLocale<'yonPanel'> {
  /** Close the dialog. */
  onClose(): void
}

/** 结局对应的色标类名。 */
function outcomeClass(outcome: string): string {
  if (outcome === 'pass') return css.outcomePass ?? ''
  if (outcome === 'fail') return css.outcomeFail ?? ''
  return css.outcomeNeutral ?? ''
}

/** 时间戳显示成本地短格式；空的就显示破折号。 */
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
 * Render the ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function DigestManager({ summary, entries, onClose, t }: DigestManagerProps) {
  const [data, setData] = useState<DigestSummaryPayload | undefined>(undefined)
  const [detail, setDetail] = useState<readonly DigestLogEntryView[] | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [openKey, setOpenKey] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [head, tail] = await Promise.all([summary(), entries(200)])
      setData(head)
      setDetail(tail.entries)
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [summary, entries])

  useEffect(() => { void load() }, [load])

  const rows = detail ?? data?.summary.recent ?? []
  const counts = data?.summary.byOutcome ?? {}
  const averages = data?.summary.averages ?? {}

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

      <div className={cn(base.body)}>
        <section className={cn(base.detailPane)} aria-label={t('digest.title')}>
          <div className={cn(css.tallyRow)}>
            <span className={cn(css.tally)}>
              <span className={cn(css.tallyValue)}>{data?.summary.total ?? 0}</span>
              <span className={cn(css.tallyLabel)}>{t('digest.tallyTotal')}</span>
            </span>
            <span className={cn(css.tally, css.outcomePass)}>
              <span className={cn(css.tallyValue)}>{counts.pass ?? 0}</span>
              <span className={cn(css.tallyLabel)}>{t('digest.tallyPass')}</span>
            </span>
            <span className={cn(css.tally, css.outcomeFail)}>
              <span className={cn(css.tallyValue)}>{counts.fail ?? 0}</span>
              <span className={cn(css.tallyLabel)}>{t('digest.tallyFail')}</span>
            </span>
            <span className={cn(css.tally)}>
              <span className={cn(css.tallyValue)}>{(counts.gate ?? 0) + (counts.plan ?? 0)}</span>
              <span className={cn(css.tallyLabel)}>{t('digest.tallyOther')}</span>
            </span>
            <span className={cn(css.tally)}>
              <span className={cn(css.tallyValue)}>{counts.sweep ?? 0}</span>
              <span className={cn(css.tallyLabel)}>{t('digest.tallySweep')}</span>
            </span>
            <span className={cn(css.spacer)} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
              {busy ? t('digest.loading') : t('digest.refresh')}
            </Button>
          </div>

          <p className={cn(css.hint)}>{t('digest.averageHint')}</p>
          <div className={cn(css.averageGrid)}>
            {METRIC_ORDER.map((key) => {
              const value = averages[key]
              const shown = typeof value === 'number'
              return (
                <div key={key} className={cn(css.averageCell)} data-empty={shown ? undefined : ''}>
                  <span className={cn(css.averageLabel)}>{METRIC_LABELS[key] ?? key}</span>
                  <span className={cn(css.averageValue)}>{percent(value ?? null)}</span>
                  <span
                    className={cn(css.averageBar)}
                    style={{ inlineSize: `${shown ? Math.max(2, Math.round(value * 100)) : 0}%` }}
                    aria-hidden="true"
                  />
                </div>
              )
            })}
          </div>

          <p className={cn(css.hint)}>
            {data?.summary.since === undefined
              ? t('digest.empty')
              : t('digest.since', { at: shortTime(data.summary.since) })}
          </p>

          {rows.length === 0 ? (
            <p className={cn(base.note)}>{t('digest.none')}</p>
          ) : (
            <ul className={cn(css.logList)}>
              {rows.map((entry, index) => {
                const key = `${entry.at}-${entry.tool}-${String(index)}`
                const open = openKey === key
                return (
                  <li key={key} className={cn(css.logRow)}>
                    <button
                      type="button"
                      className={cn(css.logHead)}
                      aria-expanded={open}
                      onClick={() => { setOpenKey(open ? undefined : key) }}
                    >
                      <span className={cn(css.logTime)}>{shortTime(entry.at)}</span>
                      <span className={cn(css.logLine)}>{entryLine(entry)}</span>
                      <span className={cn(css.logOutcome, outcomeClass(entry.outcome))}>
                        {OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
                      </span>
                    </button>
                    {open && (
                      <div className={cn(css.logDetail)}>
                        <dl className={cn(css.detailGrid)}>
                          <dt>{t('digest.fieldLabel')}</dt>
                          <dd>{entry.label === '' ? '—' : entry.label}</dd>
                          <dt>{t('digest.fieldSource')}</dt>
                          <dd className={cn(css.mono)}>{entry.source}</dd>
                          {entry.product !== '' && (
                            <>
                              <dt>{t('digest.fieldProduct')}</dt>
                              <dd className={cn(css.mono)}>{entry.product}</dd>
                            </>
                          )}
                          <dt>{t('digest.fieldSize')}</dt>
                          <dd>{`${(entry.sourceBytes / 1024).toFixed(0)} KB → ${(entry.productBytes / 1024).toFixed(1)} KB`}</dd>
                          <dt>{t('digest.fieldMs')}</dt>
                          <dd>{`${entry.ms} ms`}</dd>
                        </dl>
                        <div className={cn(css.metricStrip)}>
                          {METRIC_ORDER.map((key) => (
                            <span key={key} className={cn(css.metricChip)}>
                              {`${METRIC_LABELS[key] ?? key} ${percent(entry.metrics[key] ?? null)}`}
                            </span>
                          ))}
                        </div>
                        {entry.failed.length > 0 && (
                          <p className={cn(css.failedLine)}>
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
            <p className={cn(css.hint)}>
              <span className={cn(css.mono)}>{data.path}</span>
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
