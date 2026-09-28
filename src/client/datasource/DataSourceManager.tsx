/**
 * The datasource surface: every registered connection on one side, the selected
 * one's details on the other, and — the part that separates this surface from a
 * viewer — the ability to add, edit, test and bind them.
 *
 * ## Why this surface may write where the old one could not
 *
 * The connections live in a document this plugin owns, under the operator's DSH
 * directory (`datasource-store.ts` spells out why). Nothing here reaches into
 * another tool's files, so offering to change them is not a liberty — it is the
 * only way a fresh install can have any connection at all. An install with no
 * document and no way to add one would show an empty list forever.
 *
 * ## What this surface never sees, and why that shapes the form
 *
 * A password travels inward only: it is typed here, sent once, and never
 * returned. So the detail pane can say whether a secret is stored but not what
 * it is, and the edit form leaves the password field empty with an explicit
 * "leave blank to keep it" — because an empty box that silently meant "erase the
 * secret" would be a data loss disguised as an edit.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject
 * face, which is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DataSourceView, ProjectSummary } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { DataSourceApi } from './api.ts'
import type { DataSourceItemFace } from '../slots.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Below this many rows the list is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/** The database types the create form offers, before the free-text fallback. */
const KNOWN_TYPES: readonly string[] = ['oracle', 'dm', 'mysql', 'postgresql', 'oceanbase', 'mssql']

/** What the create/edit form holds while it is open. */
interface Draft {
  /** The composite key being edited, or undefined while creating. */
  readonly key?: string
  configKey: string
  env: string
  dbType: string
  host: string
  port: string
  serviceName: string
  user: string
  password: string
}

/** A blank draft, or one seeded from an existing row. */
function draftOf(row?: DataSourceView): Draft {
  if (row === undefined) {
    return {
      configKey: '', env: 'test', dbType: 'oracle', host: '', port: '', serviceName: '',
      user: '', password: '',
    }
  }
  return {
    key: row.key,
    configKey: row.configKey,
    env: row.env,
    dbType: row.dbType,
    host: row.host,
    port: row.port === 0 ? '' : String(row.port),
    serviceName: row.serviceName,
    user: row.userNames[0] ?? '',
    // Never a returned value: the host does not send one back.
    password: '',
  }
}

/**
 * The mark in front of every row: the same cylinder the entry cell uses.
 * @returns the decorative glyph.
 */
function CylinderMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="3.9" rx="5.25" ry="2.15" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.75 3.9v8.2c0 1.19 2.35 2.15 5.25 2.15s5.25-.96 5.25-2.15V3.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.75 8c0 1.19 2.35 2.15 5.25 2.15S13.25 9.19 13.25 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface DataSourceManagerProps extends DataSourceApi {
  readonly t: TranslateNS<'yonPanel'>
  /**
   * The projects a connection may be bound to. Borrowed from the entry's face
   * rather than redeclared, so the picker and the project surface cannot come to
   * name two different sets.
   */
  listProjects: DataSourceItemFace['listProjects']
  onClose(): void
}

/**
 * Render the datasource surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export function DataSourceManager({ t, onClose, ...api }: DataSourceManagerProps) {
  const [sources, setSources] = useState<readonly DataSourceView[]>([])
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [complete, setComplete] = useState(true)
  const [configPath, setConfigPath] = useState('')
  const [seededFrom, setSeededFrom] = useState<string>()
  const [probeAvailable, setProbeAvailable] = useState(true)
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [probeNote, setProbeNote] = useState<string>()
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const focusedOnce = useRef(false)
  const list = useRef<HTMLUListElement | null>(null)

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /** Read the rows and the project list together, so the picker is never stale. */
  const load = useCallback((keepKey?: string): Promise<void> => {
    setLoading(true)
    setFailure(undefined)
    return Promise.all([api.listDataSources(), api.listProjects(true)]).then(
      ([payload, list]) => {
        setSources(payload.sources)
        setComplete(payload.complete)
        setConfigPath(payload.configPath)
        setProbeAvailable(payload.probeAvailable)
        setSeededFrom(payload.seededFrom)
        setProjects(list)
        setSelected(previous => {
          const wanted = keepKey ?? previous
          if (wanted !== undefined && payload.sources.some(row => row.key === wanted)) return wanted
          return payload.sources[0]?.key
        })
      },
      (cause: unknown) => { setFailure(forget(cause)) },
    ).finally(() => { setLoading(false) })
  }, [api])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  /** Run one mutation, then re-read so the list reflects what was stored. */
  const act = (work: () => Promise<void>, keepKey?: string): void => {
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      try {
        await work()
        await load(keepKey)
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setBusy(false)
      }
    })()
  }

  const current = sources.find(row => row.key === selected)

  /** Save the open draft, then select whatever it produced. */
  const save = (): void => {
    const open = draft
    if (open === undefined) return
    const port = Number.parseInt(open.port, 10)
    const user = open.user.trim()
    act(async () => {
      const saved = await api.saveDataSource({
        configKey: open.configKey.trim(),
        env: open.env.trim(),
        dbType: open.dbType.trim(),
        host: open.host.trim(),
        port: Number.isFinite(port) ? port : 0,
        serviceName: open.serviceName.trim(),
        // Only sent when a password was actually typed: an empty box means "keep
        // the stored one", which is the opposite of sending an empty secret.
        ...open.password === '' ? {} : { users: { [user]: open.password } },
      })
      setDraft(undefined)
      setProbeNote(undefined)
      await load(saved.key)
    }, `${open.configKey.trim()}::${open.env.trim()}`)
  }

  /** Run `SELECT 1` against the selected row. */
  const probe = (row: DataSourceView): void => {
    setProbeNote(undefined)
    setBusy(true)
    setFailure(undefined)
    void api.probeDataSource(row.key, row.userNames[0]).then(
      (result) => {
        if (!result.ok) {
          setProbeNote(t('datasource.testFailed', { message: result.error ?? '' }))
          return
        }
        setProbeNote(result.rowCount === undefined
          ? t('datasource.testOk', { ms: result.latencyMs })
          : t('datasource.testOkRows', { ms: result.latencyMs, rows: result.rowCount }))
      },
      (cause: unknown) => { setFailure(forget(cause)) },
    ).finally(() => { setBusy(false) })
  }

  // Focus lands inside the dialog rather than on the page behind it.
  useEffect(() => {
    if (loading || focusedOnce.current) return
    focusedOnce.current = true
    list.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [loading])

  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? sources
    : sources.filter(row =>
      row.key.toLowerCase().includes(needle)
      || row.host.toLowerCase().includes(needle)
      || row.dbType.toLowerCase().includes(needle))
  const tabbableKey = selected ?? visible[0]?.key

  const row = (source: DataSourceView) => (
    <li key={source.key}>
      <button
        type="button"
        role="option"
        aria-selected={source.key === selected}
        tabIndex={source.key === tabbableKey ? 0 : -1}
        className={cn(base.projectRow, !source.probeable ? css.rowUnsupported : undefined)}
        data-key={source.key}
        onClick={() => {
          setSelected(source.key)
          setDraft(undefined)
          setProbeNote(undefined)
          setConfirmingRemove(false)
        }}
      >
        <span className={cn(base.projectMark)} aria-hidden="true"><CylinderMark /></span>
        <span className={cn(base.projectName)} title={source.key}>{source.configKey}</span>
        <span className={cn(base.projectMeta)}>{source.env}</span>
      </button>
    </li>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('datasource.title')}
      closeLabel={t('datasource.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('datasource.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('datasource.retry')}
          </button>
        </p>
      )}

      {seededFrom !== undefined && (
        <p className={cn(base.note)}>{t('datasource.seeded', { path: seededFrom })}</p>
      )}

      <div className={cn(base.body)}>
        <section className={cn(base.listPane)} aria-label={t('datasource.list')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('datasource.list')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(draftOf())
                setProbeNote(undefined)
                setConfirmingRemove(false)
              }}
            >
              {t('datasource.new')}
            </Button>
          </div>

          {sources.length >= SEARCH_THRESHOLD && (
            <Input
              type="search"
              className={cn(base.inputFill)}
              aria-label={t('datasource.search')}
              placeholder={t('datasource.search')}
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
            />
          )}

          {!complete && <p className={cn(base.note)}>{t('datasource.partial')}</p>}

          <ul ref={list} className={cn(base.projects)} role="listbox" aria-label={t('datasource.list')}>
            {visible.map(row)}
          </ul>

          {needle !== '' && visible.length === 0 && (
            <p className={cn(base.note)}>{t('datasource.searchEmpty', { query: query.trim() })}</p>
          )}

          {/* Said out loud: the connections live in a file the operator owns and
              may edit by hand, so the surface names it rather than implying the
              panel is the only way in. */}
          {configPath !== '' && (
            <p className={cn(base.note)} title={configPath}>
              {t('datasource.pathHint', { path: configPath })}
            </p>
          )}
        </section>

        <section className={cn(base.detailPane)}>
          {draft !== undefined
            ? (
              <form
                className={cn(base.form)}
                onSubmit={(event) => { event.preventDefault(); save() }}
              >
                <h3 className={cn(css.title)}>
                  {draft.key === undefined ? t('datasource.createTitle') : t('datasource.editTitle')}
                </h3>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-key">{t('datasource.key')}</label>
                  <Input
                    id="yon-ds-key"
                    className={cn(base.inputFill)}
                    value={draft.configKey}
                    disabled={draft.key !== undefined}
                    placeholder={t('datasource.keyPlaceholder')}
                    onChange={(event) => { setDraft({ ...draft, configKey: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-env">{t('datasource.env')}</label>
                  <Input
                    id="yon-ds-env"
                    className={cn(base.inputFill)}
                    value={draft.env}
                    disabled={draft.key !== undefined}
                    placeholder={t('datasource.envPlaceholder')}
                    onChange={(event) => { setDraft({ ...draft, env: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-type">{t('datasource.dbType')}</label>
                  <select
                    id="yon-ds-type"
                    className={cn(css.select)}
                    value={draft.dbType}
                    onChange={(event) => { setDraft({ ...draft, dbType: event.target.value }) }}
                  >
                    {[...new Set([...KNOWN_TYPES, ...draft.dbType === '' ? [] : [draft.dbType]])]
                      .map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                <div className={cn(css.pair)}>
                  <div className={cn(base.formRow)}>
                    <label className={cn(base.formLabel)} htmlFor="yon-ds-host">{t('datasource.host')}</label>
                    <Input
                      id="yon-ds-host"
                      className={cn(base.inputFill)}
                      value={draft.host}
                      placeholder={t('datasource.hostPlaceholder')}
                      onChange={(event) => { setDraft({ ...draft, host: event.target.value }) }}
                    />
                  </div>
                  <div className={cn(base.formRow)}>
                    <label className={cn(base.formLabel)} htmlFor="yon-ds-port">{t('datasource.port')}</label>
                    <Input
                      id="yon-ds-port"
                      className={cn(base.inputFill)}
                      value={draft.port}
                      placeholder={t('datasource.portPlaceholder')}
                      onChange={(event) => { setDraft({ ...draft, port: event.target.value }) }}
                    />
                  </div>
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-service">{t('datasource.service')}</label>
                  <Input
                    id="yon-ds-service"
                    className={cn(base.inputFill)}
                    value={draft.serviceName}
                    placeholder={t('datasource.servicePlaceholder')}
                    onChange={(event) => { setDraft({ ...draft, serviceName: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-user">{t('datasource.logins')}</label>
                  <Input
                    id="yon-ds-user"
                    className={cn(base.inputFill)}
                    value={draft.user}
                    placeholder={t('datasource.userPlaceholder')}
                    onChange={(event) => { setDraft({ ...draft, user: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ds-secret">{t('datasource.password')}</label>
                  <Input
                    id="yon-ds-secret"
                    type="password"
                    className={cn(base.inputFill)}
                    value={draft.password}
                    placeholder={t('datasource.passwordPlaceholder')}
                    onChange={(event) => { setDraft({ ...draft, password: event.target.value }) }}
                  />
                  <p className={cn(base.hint)}>{t('datasource.usersHint')}</p>
                </div>

                <div className={cn(base.detailActions)}>
                  <Button type="submit" size="sm" disabled={busy}>
                    {busy ? t('datasource.saving') : t('datasource.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => { setDraft(undefined) }}
                  >
                    {t('datasource.cancel')}
                  </Button>
                </div>
              </form>
            )
            : current === undefined
              ? (
                <div className={cn(base.empty)}>
                  <span className={cn(base.emptyMark)} aria-hidden="true"><CylinderMark /></span>
                  <p className={cn(base.emptyTitle)}>
                    {loading
                      ? t('datasource.loading')
                      : sources.length === 0 ? t('datasource.empty') : t('datasource.pickHint')}
                  </p>
                  {sources.length === 0 && !loading && (
                    <p className={cn(base.note)}>{t('datasource.emptyHint')}</p>
                  )}
                </div>
              )
              : (
                <>
                  <h3 className={cn(css.title)}>
                    {current.configKey}
                    <span className={cn(base.projectMeta)}>{current.env}</span>
                  </h3>

                  {!current.probeable && (
                    <p className={cn(base.note)}>{t('datasource.noConnector', { type: current.dbType })}</p>
                  )}

                  <dl className={cn(base.props)}>
                    <dt className={cn(base.propLabel)}>{t('datasource.type')}</dt>
                    <dd className={cn(base.propValue)}>{current.dbType === '' ? '—' : current.dbType}</dd>

                    <dt className={cn(base.propLabel)}>{t('datasource.host')}</dt>
                    <dd className={cn(base.propValue)}>
                      <span className={cn(css.mono)}>{current.host}:{current.port}</span>
                    </dd>

                    <dt className={cn(base.propLabel)}>{t('datasource.service')}</dt>
                    <dd className={cn(base.propValue)}>{current.serviceName === '' ? '—' : current.serviceName}</dd>

                    <dt className={cn(base.propLabel)}>{t('datasource.logins')}</dt>
                    <dd className={cn(base.propValue)}>
                      {current.userNames.length === 0 ? '—' : current.userNames.join(' / ')}
                    </dd>

                    <dt className={cn(base.propLabel)}>{t('datasource.password')}</dt>
                    <dd className={cn(base.propValue)}>
                      {current.hasPassword ? t('datasource.passwordStored') : t('datasource.passwordNone')}
                    </dd>

                    <dt className={cn(base.propLabel)}>{t('datasource.binding')}</dt>
                    <dd className={cn(base.propValue)}>
                      <select
                        className={cn(css.select)}
                        aria-label={t('datasource.binding')}
                        value={current.binding?.projectId ?? ''}
                        disabled={busy}
                        onChange={(event) => {
                          const projectId = event.target.value
                          act(
                            () => api.bindDataSource(current.key, projectId),
                            current.key,
                          )
                        }}
                      >
                        <option value="">{t('datasource.bindingNone')}</option>
                        {projects.map(project => (
                          <option key={project.projectId} value={project.projectId}>
                            {project.name}{project.archived ? ` (${t('project.archived')})` : ''}
                          </option>
                        ))}
                      </select>
                    </dd>
                  </dl>

                  <p className={cn(base.hint)}>{t('datasource.bindHint')}</p>

                  {probeNote !== undefined && (
                    <p className={cn(base.note)} role="status">{probeNote}</p>
                  )}
                  {!probeAvailable && (
                    <p className={cn(base.note)}>{t('datasource.probeUnavailable')}</p>
                  )}

                  <div className={cn(base.detailActions)}>
                    <Button
                      size="sm"
                      disabled={busy || !probeAvailable || !current.probeable}
                      onClick={() => { probe(current) }}
                    >
                      {busy ? t('datasource.testing') : t('datasource.test')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setDraft(draftOf(current))
                        setProbeNote(undefined)
                      }}
                    >
                      {t('datasource.edit')}
                    </Button>
                    {confirmingRemove
                      ? (
                        <>
                          <span className={cn(base.note)}>
                            {t('datasource.removeConfirm', { key: current.key })}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(base.dangerButton)}
                            disabled={busy}
                            onClick={() => {
                              const target = current.key
                              setConfirmingRemove(false)
                              act(async () => {
                                await api.removeDataSource(target)
                                setSelected(undefined)
                              })
                            }}
                          >
                            {t('datasource.removeYes')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => { setConfirmingRemove(false) }}
                          >
                            {t('datasource.cancel')}
                          </Button>
                        </>
                      )
                      : (
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(base.dangerButton)}
                          disabled={busy}
                          onClick={() => { setConfirmingRemove(true) }}
                        >
                          {t('datasource.remove')}
                        </Button>
                      )}
                  </div>
                </>
              )}
        </section>
      </div>
    </Modal>
  )
}
