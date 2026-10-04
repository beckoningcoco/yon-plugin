/**
 * The iteration ledger surface: what the model noticed about this plugin, and the
 * operator's triage of it.
 *
 * ## Why this surface exists
 *
 * The model is the only one in the room when a tool falls short — it took a detour
 * for an answer the tools should have given, it asked the operator the same thing
 * twice, it had to guess. Those moments leave no trace anywhere: the plugin has no
 * access to the transcript, and the session that produced them ends. `iteration_add`
 * is where the model puts them; this is where a person reads them.
 *
 * The split is the whole design. **The model appends and nothing else** — its two
 * tools cannot change a status or delete a row, because a model that could mark its
 * own note "fixed" would be acting as this plugin's product owner, which is exactly
 * what this feature exists to prevent. Every state change on this screen is a
 * person's decision, and the plugin never changes itself either way.
 *
 * ## The three things a reader does here
 *
 * Read (the list, newest first, with the untriaged ones called out), triage (status
 * and severity, changed in place on the row that is already open), and delete — which
 * asks twice, inline, because a note is the operator's and there is no undo. Filing
 * one by hand is the fourth, for the case where the person noticed and the model did
 * not; the same form the model's tool fills, minus the dedupe, because a person may
 * mean to record two similar things.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject face,
 * which is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  IterationKind, IterationRowView, IterationSeverity, IterationStatus,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { IterationApi } from './api.ts'
import {
  KINDS, KIND_LABEL_KEYS, SEVERITIES, SEVERITY_LABEL_KEYS, STATUS_FILTERS, STATUS_LABEL_KEYS,
  countRows,
} from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Below this many rows the ledger is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/** What the hand-filing form holds while it is open. */
interface Draft {
  kind: IterationKind
  severity: IterationSeverity
  symptom: string
  scene: string
  suggestion: string
  target: string
  context: string
}

/** A blank form. Defaults match what the service would have applied anyway. */
function blankDraft(): Draft {
  return { kind: 'gap', severity: 'medium', symptom: '', scene: '', suggestion: '', target: '', context: '' }
}

/**
 * 状态格的配色。
 *
 * 只有「待处理」用告警色：这一屏其余三格都是已经有人做过决定的，整排红绿会让人
 * 分不清哪条还在等人。已修复用成功色，已采纳与已忽略共用中性色——两者一个是
 * 「要做」一个是「不做」，但都只是「定了」。
 * @param status - the row's status.
 * @returns the shared tag class for it.
 */
function statusTag(status: IterationStatus): string | undefined {
  if (status === 'open') return base.tagFail
  if (status === 'fixed') return base.tagPass
  return base.tagMuted
}

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface IterationManagerProps extends IterationApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * 时间戳显示成本地短格式；空的连破折号也不给，免得看着像一条真记录。
 * @param at - the ISO stamp the host applied.
 * @returns the display form.
 */
function shortTime(at: string): string {
  if (at === '') return '—'
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The mark on an empty or still-loading pane — a page with a folded corner and two
 * written lines, which is what this surface is a stack of.
 * @returns the decorative svg.
 */
function LedgerMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2.2h5.3l3.1 3.2v8.4H4z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M9.3 2.2v3.2h3.1" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.1 8.1h4.2M6.1 10.5h2.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function IterationManager({ list, create, update, remove, onClose, t }: IterationManagerProps) {
  const [rows, setRows] = useState<readonly IterationRowView[]>([])
  const [path, setPath] = useState('')
  /** The host's own report that the file exists and could not be read. */
  const [unreadable, setUnreadable] = useState<string | undefined>(undefined)
  /** A call that failed outright, with a retry. */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<IterationStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [flash, setFlash] = useState<string | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  /**
   * The whole ledger, always.
   *
   * No status filter is sent, because the tally above the list counts the ledger
   * rather than the filtered view: asking the host for one status at a time would
   * make 「共 12 条记录」 turn into 「共 3 条」 the moment someone clicked 已修复, and a
   * count that changes meaning under the reader is worse than no count. The ledger
   * is tens of rows; filtering it here costs nothing.
   */
  const load = useCallback(async () => {
    setBusy(true)
    try {
      const payload = await list()
      setRows(payload.rows)
      setPath(payload.path)
      setUnreadable(payload.error)
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [list])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => countRows(rows), [rows])
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(row =>
      (filter === 'all' || row.status === filter)
      && (needle === ''
        || `${row.symptom} ${row.target} ${row.scene} ${row.suggestion} ${row.context}`
          .toLowerCase()
          .includes(needle)))
  }, [rows, filter, query])

  const loading = busy && rows.length === 0 && failure === undefined

  /** Re-triage one row, in place. */
  const change = async (id: string, patch: { status?: IterationStatus, severity?: IterationSeverity }): Promise<void> => {
    setFlash(undefined)
    try {
      const { row } = await update(id, patch)
      setRows(previous => previous.map(candidate => candidate.id === id ? row : candidate))
      setFlash(t('iteration.saved'))
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }

  /** Drop one row, after the row's own two-step ask. */
  const drop = async (id: string): Promise<void> => {
    setFlash(undefined)
    try {
      await remove(id)
      setRows(previous => previous.filter(candidate => candidate.id !== id))
      setConfirmId(undefined)
      setFlash(t('iteration.removed'))
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }

  /** File one by hand. */
  const file = async (): Promise<void> => {
    const symptom = draft.symptom.trim()
    if (symptom === '') {
      setFormError(t('iteration.formNeedSymptom'))
      return
    }
    setSaving(true)
    try {
      const { row } = await create({
        kind: draft.kind,
        symptom,
        severity: draft.severity,
        scene: draft.scene.trim(),
        suggestion: draft.suggestion.trim(),
        target: draft.target.trim(),
        context: draft.context.trim(),
      })
      // Prepended rather than appended: the host answers newest first, and the row
      // just filed is the newest one.
      setRows(previous => [row, ...previous])
      setDraft(blankDraft())
      setFormOpen(false)
      setFormError(undefined)
      setFlash(t('iteration.filed'))
      setFailure(undefined)
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const emptyTitle = loading
    ? t('iteration.loadingList')
    : unreadable !== undefined
      ? t('iteration.emptyUnreadable')
      : rows.length === 0
        ? t('iteration.empty')
        : t('iteration.emptyFiltered')

  const tally = (
    <>
      <span className={css.tallyItem}>
        <span className={css.tallyNum}>{counts.total}</span>
        {' '}{t('iteration.countTotal')}
      </span>
      {STATUS_FILTERS.filter((value): value is IterationStatus => value !== 'all').map(status => (
        <span key={status} className={css.tallyItem}>
          <span className={css.tallySep} aria-hidden="true">·</span>
          {' '}
          <span className={cn(css.tallyNum, status === 'open' ? css.tallyOpen : undefined)}>
            {counts.byStatus[status]}
          </span>
          {' '}{t(STATUS_LABEL_KEYS[status])}
        </span>
      ))}
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('iteration.title')}
      closeLabel={t('iteration.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('iteration.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('iteration.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body, css.scrollBody)}>
        <section className={cn(base.detailPane)} aria-label={t('iteration.title')}>
          <div className={css.toolbar}>
            <p className={cn(css.tally, loading ? css.dim : undefined)}>{tally}</p>
            <div className={css.actions}>
              <div className={css.filters} role="group" aria-label={t('iteration.filterAll')}>
                {STATUS_FILTERS.map(value => (
                  <button
                    key={value}
                    type="button"
                    className={cn(css.filter, filter === value ? css.filterOn : undefined)}
                    aria-pressed={filter === value}
                    onClick={() => { setFilter(value) }}
                  >
                    {value === 'all' ? t('iteration.filterAll') : t(STATUS_LABEL_KEYS[value])}
                  </button>
                ))}
              </div>
              {rows.length >= SEARCH_THRESHOLD && (
                <div className={css.search}>
                  <Input
                    type="search"
                    className={cn(base.inputFill)}
                    aria-label={t('iteration.search')}
                    placeholder={t('iteration.search')}
                    value={query}
                    onChange={(event) => { setQuery(event.target.value) }}
                  />
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                aria-expanded={formOpen}
                onClick={() => {
                  setFormOpen(value => !value)
                  setFormError(undefined)
                }}
              >
                {formOpen ? t('iteration.formClose') : t('iteration.formOpen')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
                {busy ? t('iteration.loading') : t('iteration.refresh')}
              </Button>
            </div>
          </div>

          {/* 这一屏没有一个词是自明的：「迭代」「短板」「谁改」都要一句话说清。 */}
          <p className={css.sectionNote}>{t('iteration.intro')}</p>

          {flash !== undefined && <p className={css.sectionNote} role="status">{flash}</p>}
          {unreadable !== undefined && (
            <p className={css.sectionNote}>{t('iteration.readFailed', { message: unreadable })}</p>
          )}

          {formOpen && (
            <div className={css.noteForm}>
              <p className={css.noteFormHead}>{t('iteration.formTitle')}</p>
              <div className={css.noteFormGrid}>
                <div className={css.field}>
                  <label className={css.fieldLabel} htmlFor="yon-it-kind">{t('iteration.formKind')}</label>
                  <select
                    id="yon-it-kind"
                    value={draft.kind}
                    onChange={(event) => { setDraft({ ...draft, kind: event.target.value as IterationKind }) }}
                  >
                    {KINDS.map(kind => (
                      <option key={kind} value={kind}>{t(KIND_LABEL_KEYS[kind])}</option>
                    ))}
                  </select>
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel} htmlFor="yon-it-severity">{t('iteration.formSeverity')}</label>
                  <select
                    id="yon-it-severity"
                    value={draft.severity}
                    onChange={(event) => { setDraft({ ...draft, severity: event.target.value as IterationSeverity }) }}
                  >
                    {SEVERITIES.map(severity => (
                      <option key={severity} value={severity}>{t(SEVERITY_LABEL_KEYS[severity])}</option>
                    ))}
                  </select>
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel} htmlFor="yon-it-target">{t('iteration.formTarget')}</label>
                  <Input
                    id="yon-it-target"
                    className={cn(base.inputFill)}
                    value={draft.target}
                    placeholder={t('iteration.formTargetHint')}
                    onChange={(event) => { setDraft({ ...draft, target: event.target.value }) }}
                  />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel} htmlFor="yon-it-scene">{t('iteration.formScene')}</label>
                  <Input
                    id="yon-it-scene"
                    className={cn(base.inputFill)}
                    value={draft.scene}
                    placeholder={t('iteration.formSceneHint')}
                    onChange={(event) => { setDraft({ ...draft, scene: event.target.value }) }}
                  />
                </div>
                <div className={cn(css.field, css.fieldWide)}>
                  <label className={css.fieldLabel} htmlFor="yon-it-symptom">{t('iteration.formSymptom')}</label>
                  <textarea
                    id="yon-it-symptom"
                    value={draft.symptom}
                    placeholder={t('iteration.formSymptomHint')}
                    onChange={(event) => { setDraft({ ...draft, symptom: event.target.value }) }}
                  />
                </div>
                <div className={cn(css.field, css.fieldWide)}>
                  <label className={css.fieldLabel} htmlFor="yon-it-suggestion">{t('iteration.formSuggestion')}</label>
                  <textarea
                    id="yon-it-suggestion"
                    value={draft.suggestion}
                    onChange={(event) => { setDraft({ ...draft, suggestion: event.target.value }) }}
                  />
                </div>
                <div className={cn(css.field, css.fieldWide)}>
                  <label className={css.fieldLabel} htmlFor="yon-it-context">{t('iteration.formContext')}</label>
                  <textarea
                    id="yon-it-context"
                    value={draft.context}
                    onChange={(event) => { setDraft({ ...draft, context: event.target.value }) }}
                  />
                </div>
              </div>
              {formError !== undefined && <p className={css.noteFormError} role="alert">{formError}</p>}
              <div className={css.noteFormActions}>
                <Button size="sm" variant="primary" disabled={saving} onClick={() => { void file() }}>
                  {saving ? t('iteration.formSaving') : t('iteration.formSubmit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setFormOpen(false); setFormError(undefined); setDraft(blankDraft()) }}
                >
                  {t('iteration.formCancel')}
                </Button>
                <span className={css.sectionNote}>{t('iteration.formHint')}</span>
              </div>
            </div>
          )}

          {loading || shown.length === 0
            ? (
              // The shared empty block rather than a bare paragraph: it centres the
              // pane the way the six sibling surfaces do, and its `flex: 1` fills the
              // height so an empty ledger does not leave the dialog half-drawn.
              <div className={cn(base.empty)}>
                <span className={cn(base.emptyMark)} aria-hidden="true"><LedgerMark /></span>
                <p className={cn(base.emptyTitle)}>{emptyTitle}</p>
                {/* 只有「压根还没记过」才解释这套东西是什么。筛没筛出结果、
                    文件读不出来，那两种情况下读者已经知道了。 */}
                {!loading && unreadable === undefined && rows.length === 0 && (
                  <>
                    <p className={cn(base.note)}>{t('iteration.emptyWhy')}</p>
                    <p className={cn(base.note)}>{t('iteration.emptyHow')}</p>
                  </>
                )}
              </div>
            )
            : (
              <ul className={css.list}>
                {shown.map((row) => {
                  const open = openId === row.id
                  return (
                    <li
                      key={row.id}
                      className={cn(css.row, row.status === 'open' ? undefined : css.rowDone)}
                    >
                      <button
                        type="button"
                        className={css.rowHead}
                        aria-expanded={open}
                        onClick={() => {
                          setOpenId(open ? undefined : row.id)
                          setConfirmId(undefined)
                        }}
                      >
                        <span className={css.rowTime}>{shortTime(row.at)}</span>
                        <span className={css.rowSymptom}>
                          {row.symptom}
                          {row.target !== '' && <span className={css.rowTarget}>（{row.target}）</span>}
                        </span>
                        <span className={css.rowTags}>
                          <span className={cn(base.tag, base.tagMuted)}>{t(KIND_LABEL_KEYS[row.kind])}</span>
                          <span className={cn(base.tag, base.tagMuted)}>{t(SEVERITY_LABEL_KEYS[row.severity])}</span>
                          <span className={cn(base.tag, statusTag(row.status))}>
                            {t(STATUS_LABEL_KEYS[row.status])}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className={css.detail}>
                          <dl className={css.detailGrid}>
                            <dt>{t('iteration.fieldSymptom')}</dt>
                            <dd>{row.symptom}</dd>
                            <dt>{t('iteration.fieldScene')}</dt>
                            <Field value={row.scene} />
                            <dt>{t('iteration.fieldSuggestion')}</dt>
                            <Field value={row.suggestion} />
                            <dt>{t('iteration.fieldTarget')}</dt>
                            <Field value={row.target} />
                            <dt>{t('iteration.fieldContext')}</dt>
                            <Field value={row.context} mono />
                            <dt>{t('iteration.at')}</dt>
                            <dd>{shortTime(row.at)}</dd>
                          </dl>

                          <div className={css.rowVerbs}>
                            <span className={css.editor}>
                              <label htmlFor={`yon-it-status-${row.id}`}>{t('iteration.status')}</label>
                              <select
                                id={`yon-it-status-${row.id}`}
                                value={row.status}
                                onChange={(event) => {
                                  void change(row.id, { status: event.target.value as IterationStatus })
                                }}
                              >
                                {STATUS_FILTERS.filter((value): value is IterationStatus => value !== 'all')
                                  .map(status => (
                                    <option key={status} value={status}>{t(STATUS_LABEL_KEYS[status])}</option>
                                  ))}
                              </select>
                            </span>
                            <span className={css.editor}>
                              <label htmlFor={`yon-it-sev-${row.id}`}>{t('iteration.severity')}</label>
                              <select
                                id={`yon-it-sev-${row.id}`}
                                value={row.severity}
                                onChange={(event) => {
                                  void change(row.id, { severity: event.target.value as IterationSeverity })
                                }}
                              >
                                {SEVERITIES.map(severity => (
                                  <option key={severity} value={severity}>{t(SEVERITY_LABEL_KEYS[severity])}</option>
                                ))}
                              </select>
                            </span>

                            {confirmId === row.id
                              ? (
                                // Two steps, inline, and the second step sits where the
                                // first one was — so a double click cannot land on both.
                                <span className={css.removeAsk}>
                                  {t('iteration.removeAsk')}
                                  <Button size="sm" variant="primary" onClick={() => { void drop(row.id) }}>
                                    {t('iteration.removeYes')}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setConfirmId(undefined) }}>
                                    {t('iteration.removeNo')}
                                  </Button>
                                </span>
                              )
                              : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setConfirmId(row.id) }}
                                >
                                  {t('iteration.remove')}
                                </Button>
                              )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

          {path !== '' && (
            <p className={css.foot}>
              <span>{t('iteration.logAt')}</span>
              <span className={css.footPath}>{path}</span>
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}

/**
 * 一格详情：空值显示破折号，不省略整行。
 *
 * 空着和「这一屏没有这一项」在视觉上必须分得开：一条只写了症状的记录，与一条
 * 期望栏被界面吃掉的记录，处理方式完全不同。
 *
 * @param props - the stored text, and whether it is a path or a command.
 * @returns the `<dd>`.
 */
function Field({ value, mono = false }: { readonly value: string, readonly mono?: boolean }) {
  if (value === '') return <dd className={css.detailEmpty}>—</dd>
  return <dd className={mono ? css.detailMono : undefined}>{value}</dd>
}
