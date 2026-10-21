/**
 * The front-end source surface: every registered project on one side, and on the
 * other what that directory actually is — whether it is source or a deployed
 * bundle, how many page entries it has, which domains they sit in, and the build
 * switches in its `config.json`.
 *
 * ## Why the page count is the headline
 *
 * The operator's reason for registering a project is "查这个版本的页面源码".
 * A version number and a path answer where it is; the page entry count and the
 * domain breakdown answer whether it is the project they think it is — the
 * installation's `hotwebs/` and a real source project sit in similar-looking
 * directories, and the count is what tells them apart at a glance.
 *
 * ## What this pane deliberately does not do
 *
 * It does not edit source. Reading a file is the model's job through
 * `ncc_fe_read`; changing one is `ncc_gbk_edit`'s, which has its own rules about
 * encoding. A file tree with a preview arrives with the page index; this pane is
 * the registration and its probe.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject
 * face, which is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  FRONTEND_VERSIONS, type FrontendDirEntryView, type FrontendPageNodeView,
  type FrontendPagesPayload, type FrontendPageStatusView, type FrontendReadPayload,
  type FrontendShape, type FrontendView,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { YonPanelKey } from '../locales.ts'
import type { FrontendApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Below this many rows the list is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/** How long a copy confirmation stays on screen. */
const COPY_LINGER_MS = 1600

/** Which translation key names each shape the probe can conclude. */
const SHAPE_KEY: Record<FrontendShape, YonPanelKey> = {
  scaffold: 'frontend.shape.scaffold',
  deployed: 'frontend.shape.deployed',
  'not-a-project': 'frontend.shape.not-a-project',
  'not-found': 'frontend.shape.not-found',
}

/** What the create/edit form holds while it is open. */
interface Draft {
  /** The registration being edited, or undefined while creating. */
  readonly id?: string
  path: string
  version: string
  /** True when the version is being typed rather than picked from the list. */
  versionOther: boolean
  isDefault: boolean
}

/**
 * The version dropdown's escape-hatch entry.
 *
 * A closed list is a dead end the moment a version ships that this file has not
 * heard of, and NCC's front-end projects outlive the list. A sentinel rather than
 * an empty value, because "nothing picked yet" and "deliberately something not on
 * the list" are different states.
 */
const OTHER_VERSION = '__other__'

/**
 * A blank draft, or one seeded from an existing registration.
 *
 * No name: a project is called `<版本>` (`frontendLabelOf`), because one version
 * is one source project — a name would only be a second identity to invent for a
 * row that already has one.
 */
function draftOf(row?: FrontendView): Draft {
  if (row === undefined) {
    return { path: '', version: '', versionOther: false, isDefault: false }
  }
  return {
    id: row.id,
    path: row.path,
    version: row.version,
    versionOther: !FRONTEND_VERSIONS[row.product].some(option => option.value === row.version),
    isDefault: row.isDefault,
  }
}

/**
 * A byte count in the unit a person reads it in.
 * @param value - the size in bytes.
 * @returns the formatted size.
 */
function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}

/** Props of the surface: the injected API and the close verb. */
export interface FrontendManagerProps extends FrontendApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * Render the front-end source surface.
 * @param props - injected API and close verb.
 * @returns the dialog.
 */
export function FrontendManager({ t, onClose, ...api }: FrontendManagerProps) {
  /**
   * The two members the effects below depend on, taken by name.
   *
   * The rest object is rebuilt on every render — the face arrives as a spread, so
   * no version of it outlives a render — which makes it unusable as a dependency.
   * `HomeManager` documents the loop that cost: an effect listing the rest object
   * re-runs on every render, stores a freshly-read answer, and re-renders again.
   */
  const {
    listFrontends,
    pageStatus: readPageStatus,
    pages: readPages,
    rebuildPages: rebuildIndex,
    listDir,
    readFile,
  } = api
  const [frontends, setFrontends] = useState<readonly FrontendView[]>([])
  const [complete, setComplete] = useState(true)
  const [payloadError, setPayloadError] = useState<string>()
  const [configPath, setConfigPath] = useState('')
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [probeNote, setProbeNote] = useState<string>()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  /** What the host says its chooser is, or undefined while it has not been asked. */
  const [pickerKind, setPickerKind] = useState<string>()
  const [picking, setPicking] = useState(false)
  /** Whether copying the path worked, and the timer that clears the confirmation. */
  const [copied, setCopied] = useState<'copied' | 'failed' | undefined>(undefined)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const focusedOnce = useRef(false)
  const list = useRef<HTMLUListElement | null>(null)
  /** undefined = not read yet; null = no index stored; a value = what is stored. */
  const [pageStatus, setPageStatus] = useState<FrontendPageStatusView | null>()
  const [pageTree, setPageTree] = useState<FrontendPagesPayload>()
  const [pagesBusy, setPagesBusy] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [dirFiles, setDirFiles] = useState<ReadonlyMap<string, readonly FrontendDirEntryView[]>>(new Map())
  const [preview, setPreview] = useState<FrontendReadPayload>()
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /** Read every registration, so save and probe land on what was actually stored. */
  const load = useCallback((keepId?: string): Promise<void> => {
    setLoading(true)
    setFailure(undefined)
    return listFrontends().then(
      (payload) => {
        setFrontends(payload.frontends)
        setComplete(payload.complete)
        setPayloadError(payload.error)
        setConfigPath(payload.configPath)
        setSelected(previous => {
          const wanted = keepId ?? previous
          if (wanted !== undefined && payload.frontends.some(row => row.id === wanted)) return wanted
          return payload.frontends[0]?.id
        })
      },
      (cause: unknown) => { setFailure(forget(cause)) },
    ).finally(() => { setLoading(false) })
  }, [listFrontends])

  useEffect(() => { void load() }, [load])

  /** Run one mutation, then re-read so the list reflects what was stored. */
  const act = (work: () => Promise<void>, keepId?: string): void => {
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      try {
        await work()
        await load(keepId)
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setBusy(false)
      }
    })()
  }

  const current = frontends.find(row => row.id === selected)

  // The page tree belongs to the selected row, so it is re-read when the
  // selection changes and never merged across rows. A status read is cheap; the
  // tree is only fetched when an index actually exists, because asking for it
  // would build one — a walk of the project — for a pane nobody opened.
  useEffect(() => {
    const id = current?.id
    setPageStatus(undefined)
    setPageTree(undefined)
    setExpanded(new Set())
    setDirFiles(new Map())
    setPreview(undefined)
    if (id === undefined) return
    let live = true
    void readPageStatus(id).then(
      (status) => {
        if (!live) return
        setPageStatus(status ?? null)
        if (status === undefined) return
        void readPages(id).then(
          (tree) => { if (live) setPageTree(tree) },
          () => { /* the status line already says whether an index exists */ },
        )
      },
      () => { if (live) setPageStatus(null) },
    )
    return () => { live = false }
  }, [readPageStatus, readPages, current?.id])

  /** Walk the project again, then read the new tree. */
  const rebuildPageIndex = (row: FrontendView): void => {
    setPagesBusy(true)
    setFailure(undefined)
    void (async () => {
      try {
        const status = await rebuildIndex(row.id)
        setPageStatus(status)
        setPageTree(await readPages(row.id))
        setExpanded(new Set())
        setDirFiles(new Map())
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setPagesBusy(false)
      }
    })()
  }

  /** Expand one node, loading its directory the first time it is opened. */
  const toggleNode = (node: FrontendPageNodeView): void => {
    const key = node.dir
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    if (dirFiles.has(key) || current === undefined) return
    void listDir(current.id, node.dir).then(
      (payload) => { setDirFiles(previous => new Map(previous).set(key, payload.entries)) },
      (cause: unknown) => { setFailure(forget(cause)) },
    )
  }

  /** Read the first lines of one file into the preview. */
  const openPreview = (rel: string): void => {
    if (current === undefined) return
    setPreviewBusy(true)
    setFailure(undefined)
    void readFile(current.id, rel, 1, 200).then(
      (payload) => { setPreview(payload) },
      (cause: unknown) => { setFailure(forget(cause)) },
    ).finally(() => { setPreviewBusy(false) })
  }

  /** Save the open draft, then select whatever it produced. */
  const save = (): void => {
    const open = draft
    if (open === undefined) return
    act(async () => {
      const saved = await api.saveFrontend(open.id, {
        path: open.path.trim(),
        product: 'ncc',
        version: open.version.trim(),
        isDefault: open.isDefault,
      })
      setDraft(undefined)
      setProbeNote(undefined)
      await load(saved.id)
    }, open.id)
  }

  /** Walk the directory again and store what is there now. */
  const probe = (row: FrontendView): void => {
    setProbeNote(undefined)
    act(async () => {
      const fresh = await api.probeFrontend(row.id)
      const profile = fresh.profile
      setProbeNote(profile === undefined
        ? t('frontend.never')
        : profile.shape === 'deployed'
          ? t('frontend.probedDeployed', { shape: t(SHAPE_KEY[profile.shape]) })
          : t('frontend.probed', {
            shape: t(SHAPE_KEY[profile.shape]),
            pages: profile.pages,
            files: profile.files,
          }))
      await load(row.id)
    }, row.id)
  }

  /**
   * Open the host's folder chooser and take the directory it returns.
   *
   * The picker is asked lazily — on a click, not on mount — because asking is what
   * opens the dialog. Cancelling is a normal answer (`path: null`), not a failure:
   * the field keeps what it had.
   */
  const choosePath = (): void => {
    void (async () => {
      setPicking(true)
      try {
        const answer = await api.pickPath()
        setPickerKind(answer.kind)
        const chosen = answer.kind === 'native' && typeof answer.path === 'string' ? answer.path : ''
        if (chosen !== '') {
          setDraft(open => (open === undefined ? open : { ...open, path: chosen }))
        }
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setPicking(false)
      }
    })()
  }

  /** Put the project path on the clipboard, since it is a machine fact people paste. */
  const copyPath = (value: string): void => {
    const settle = (outcome: 'copied' | 'failed'): void => {
      setCopied(outcome)
      if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopied(undefined) }, COPY_LINGER_MS)
    }
    void writeClipboard(value).then(
      accepted => { settle(accepted ? 'copied' : 'failed') },
      () => { settle('failed') },
    )
  }

  // Focus lands inside the dialog rather than on the page behind it.
  useEffect(() => {
    if (loading || focusedOnce.current) return
    focusedOnce.current = true
    list.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [loading])

  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? frontends
    : frontends.filter(row =>
      row.label.toLowerCase().includes(needle)
      || row.path.toLowerCase().includes(needle)
      || row.version.toLowerCase().includes(needle))
  const tabbableId = selected ?? visible[0]?.id

  /** A timestamp as a person reads it, since the probe stores ISO. */
  const when = (iso: string): string => iso.slice(0, 19).replace('T', ' ')

  const row = (frontend: FrontendView) => (
    <li key={frontend.id}>
      <button
        type="button"
        role="option"
        aria-selected={frontend.id === selected}
        tabIndex={frontend.id === tabbableId ? 0 : -1}
        className={cn(base.projectRow,
          !frontend.ready ? css.rowNotReady : undefined,
          frontend.id === selected ? css.rowOn : undefined)}
        data-key={frontend.id}
        onClick={() => {
          setSelected(frontend.id)
          setDraft(undefined)
          setProbeNote(undefined)
          setConfirmingRemove(false)
        }}
      >
        <span className={cn(base.projectMark)} aria-hidden="true"><CodeMark /></span>
        <span className={cn(base.projectName)} title={frontend.label}>{frontend.label}</span>
        {/* The version is already in the name above, so what is left to say is
            whether this is the one an unqualified lookup lands on. */}
        <span className={cn(base.projectMeta)}>
          {frontend.isDefault ? t('frontend.defaultTag') : ''}
        </span>
      </button>
    </li>
  )

  /** The probe's reading: shape, the three counts, the domains, and the warnings. */
  const probeBlock = (frontend: FrontendView) => {
    const profile = frontend.profile
    if (profile === undefined) {
      return <p className={cn(base.note)}>{t('frontend.never')}</p>
    }
    const atLeast = profile.capped ? '≥' : ''
    const withPages = profile.domains.filter(domain => domain.pages > 0)
    return (
      <>
        <p className={cn(base.note)}>{t('frontend.probedAt', { at: when(profile.probedAt) })}</p>
        <dl className={cn(base.props, css.card)}>
          <dt className={cn(base.propLabel)}>{t('frontend.shape')}</dt>
          <dd className={cn(base.propValue)}>{t(SHAPE_KEY[profile.shape])}</dd>

          <dt className={cn(base.propLabel)}>{t('frontend.nodes')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${profile.nodes}`}</dd>

          <dt className={cn(base.propLabel)}>{t('frontend.pages')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${profile.pages}`}</dd>

          <dt className={cn(base.propLabel)}>{t('frontend.files')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${profile.files}`}</dd>

          <dt className={cn(base.propLabel)}>{t('frontend.size')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${bytes(profile.bytes)}`}</dd>

          <dt className={cn(base.propLabel)}>{t('frontend.buildEntry')}</dt>
          <dd className={cn(base.propValue)}>
            {profile.buildEntry.length === 0
              ? t('frontend.buildEntryNone')
              : profile.buildEntry.join('、')}
          </dd>

          {profile.proxy !== undefined && (
            <>
              <dt className={cn(base.propLabel)}>{t('frontend.proxy')}</dt>
              <dd className={cn(base.propValue)}>{profile.proxy}</dd>
            </>
          )}
        </dl>

        {withPages.length > 0 && (
          <>
            <h4 className={cn(css.subTitle)}>{t('frontend.domains')}</h4>
            <ul className={cn(css.domainList)}>
              {withPages.map(domain => (
                <li key={domain.name} className={cn(css.domainRow)}>
                  <span className={cn(css.domainName)}>{domain.name}</span>
                  <span className={cn(css.domainCount)}>
                    {t('frontend.domainLine', { pages: domain.pages, size: bytes(domain.bytes) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {profile.warnings.length > 0 && (
          <ul className={cn(css.warnList)}>
            {profile.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        {/* Said out loud because the figures above look exact: a probe counts
            names and sizes and opens no file, so it takes seconds and says "at
            least" when the walk was cut off. */}
        <p className={cn(base.note)}>{t('frontend.probeNote')}</p>
      </>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('frontend.title')}
      closeLabel={t('frontend.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('frontend.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('frontend.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body)}>
        <section className={cn(base.listPane)} aria-label={t('frontend.list')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('frontend.list')}</span>
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
              {t('frontend.new')}
            </Button>
          </div>

          {frontends.length >= SEARCH_THRESHOLD && (
            <Input
              type="search"
              className={cn(base.inputFill)}
              aria-label={t('frontend.search')}
              placeholder={t('frontend.search')}
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
            />
          )}

          {!complete && (
            <p className={cn(base.note)}>{t('frontend.loadFailed', { message: payloadError ?? '' })}</p>
          )}

          <ul ref={list} className={cn(base.projects)} role="listbox" aria-label={t('frontend.list')}>
            {visible.map(row)}
          </ul>

          {needle !== '' && visible.length === 0 && (
            <p className={cn(base.note)}>{t('frontend.searchEmpty', { query: query.trim() })}</p>
          )}
          {needle !== '' && visible.length > 0 && (
            <p className={cn(base.note)}>{t('frontend.showing', { shown: visible.length, total: frontends.length })}</p>
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
                  {draft.id === undefined ? t('frontend.newTitle') : t('frontend.editTitle')}
                </h3>

                <p className={cn(base.hint)}>
                  {draft.id === undefined ? t('frontend.createHint') : t('frontend.editHint')}
                </p>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-fe-path">{t('frontend.pathLabel')}</label>
                  {/* Picked and never typed. The path is long, it has to exist, and a
                      typo in it is discovered only after a probe has walked the wrong
                      tree — none of which a text box can help with. */}
                  <span className={cn(css.pathRow)}>
                    <Input
                      id="yon-fe-path"
                      className={cn(base.inputFill, css.pathField)}
                      value={draft.path}
                      readOnly
                      placeholder={t('frontend.pathNone')}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || picking}
                      onClick={choosePath}
                    >
                      {picking ? t('frontend.picking') : t('frontend.pickDir')}
                    </Button>
                  </span>
                  {pickerKind !== undefined && pickerKind !== 'native' && (
                    <p className={cn(base.hint)}>{t('frontend.pickUnavailable')}</p>
                  )}
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-fe-version">{t('frontend.version')}</label>
                  <select
                    id="yon-fe-version"
                    className={cn(css.select)}
                    value={draft.versionOther ? OTHER_VERSION : draft.version}
                    disabled={draft.id !== undefined}
                    onChange={(event) => {
                      const chosen = event.target.value
                      setDraft(chosen === OTHER_VERSION
                        ? { ...draft, version: '', versionOther: true }
                        : { ...draft, version: chosen, versionOther: false })
                    }}
                  >
                    {/* Shown only while nothing is picked (a disabled option cannot be
                        re-picked once a real value is selected), so the first thing
                        the form says about the version is "choose one". */}
                    <option value="" disabled>{t('frontend.versionPick')}</option>
                    {FRONTEND_VERSIONS.ncc.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                    <option value={OTHER_VERSION}>{t('frontend.versionOther')}</option>
                  </select>
                  {draft.versionOther && (
                    <Input
                      id="yon-fe-version-text"
                      className={cn(base.inputFill)}
                      value={draft.version}
                      disabled={draft.id !== undefined}
                      placeholder={t('frontend.versionPlaceholder')}
                      onChange={(event) => { setDraft({ ...draft, version: event.target.value }) }}
                    />
                  )}
                  <p className={cn(base.hint)}>{t('frontend.versionHint')}</p>
                </div>

                <label className={cn(base.archivedToggle)}>
                  <input
                    type="checkbox"
                    checked={draft.isDefault}
                    onChange={(event) => { setDraft({ ...draft, isDefault: event.target.checked }) }}
                  />
                  {t('frontend.setDefault')}
                </label>

                <div className={cn(base.detailActions)}>
                  <Button type="submit" size="sm" disabled={busy}>
                    {busy ? t('frontend.saving') : t('frontend.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => { setDraft(undefined) }}
                  >
                    {t('frontend.cancel')}
                  </Button>
                </div>
              </form>
            )
            : current === undefined
              ? (
                <div className={cn(base.empty)}>
                  <span className={cn(base.emptyMark)} aria-hidden="true"><CodeMark /></span>
                  <p className={cn(base.emptyTitle)}>
                    {loading
                      ? t('frontend.loading')
                      : frontends.length === 0 ? t('frontend.empty') : t('frontend.pickOne')}
                  </p>
                  {frontends.length === 0 && !loading && (
                    <>
                      <p className={cn(base.note)}>{t('frontend.emptyWhy')}</p>
                      <p className={cn(base.note)}>{t('frontend.emptyHow')}</p>
                    </>
                  )}
                </div>
              )
              : (
                <>
                  <h3 className={cn(css.title)}>{current.label}</h3>

                  {!current.ready && <p className={cn(base.note)}>{t('frontend.notReady')}</p>}

                  <div className={cn(base.detailActions, css.verbRow)}>
                    {confirmingRemove && (
                      <span className={cn(base.note)}>
                        {t('frontend.removeAsk')} {t('frontend.removeAbout')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => { probe(current) }}
                    >
                      {busy ? t('frontend.probing') : t('frontend.probe')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || current.isDefault}
                      onClick={() => {
                        act(async () => { await api.setDefaultFrontend(current.id) }, current.id)
                      }}
                    >
                      {t('frontend.makeDefault')}
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
                      {t('frontend.edit')}
                    </Button>
                    {confirmingRemove
                      ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(base.dangerButton)}
                            disabled={busy}
                            onClick={() => {
                              const target = current.id
                              setConfirmingRemove(false)
                              act(async () => {
                                await api.removeFrontend(target)
                                setSelected(undefined)
                              })
                            }}
                          >
                            {t('frontend.removeYes')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setConfirmingRemove(false) }}>
                            {t('frontend.cancel')}
                          </Button>
                        </>
                      )
                      : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { setConfirmingRemove(true) }}
                        >
                          {t('frontend.remove')}
                        </Button>
                      )}
                  </div>

                  {probeNote !== undefined && <p className={cn(base.note)}>{probeNote}</p>}

                  <div className={cn(base.formRow)}>
                    <span className={cn(base.formLabel)}>{t('frontend.path')}</span>
                    <span className={cn(css.pathRow)}>
                      <code className={cn(css.pathField, css.mono)}>{current.path}</code>
                      <Button size="sm" variant="outline" onClick={() => { copyPath(current.path) }}>
                        {copied === 'copied'
                          ? t('frontend.copied')
                          : copied === 'failed' ? t('frontend.copyFailed') : t('frontend.copy')}
                      </Button>
                    </span>
                  </div>

                  <h4 className={cn(css.subTitle)}>{t('frontend.probeTitle')}</h4>
                  {probeBlock(current)}

                  <div className={cn(css.blockHead)}>
                    <h4 className={cn(css.subTitle)}>{t('frontend.pagesTitle')}</h4>
                    <span className={cn(css.blockVerbs)}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || pagesBusy}
                        onClick={() => { rebuildPageIndex(current) }}
                      >
                        {pagesBusy
                          ? t('frontend.pagesBuilding')
                          : pageStatus === undefined || pageStatus === null
                            ? t('frontend.pagesBuild')
                            : t('frontend.pagesRebuild')}
                      </Button>
                    </span>
                  </div>

                  {pageStatus === undefined
                    ? <p className={cn(base.note)}>{t('frontend.pagesLoading')}</p>
                    : pageStatus === null
                      ? <p className={cn(base.note)}>{t('frontend.pagesNone')}</p>
                      : (
                        <p className={cn(base.note)}>
                          {t('frontend.pagesLine', {
                            nodes: pageStatus.nodes,
                            pages: pageStatus.pages,
                            at: when(pageStatus.builtAt),
                          })}
                          {pageStatus.stale ? ` ${t('frontend.pagesStale')}` : ''}
                        </p>
                      )}

                  {pageTree !== undefined && (
                    <ul className={cn(css.tree)}>
                      {pageTree.nodes.map((node) => {
                        const key = node.dir
                        const open = expanded.has(key)
                        return (
                          <li key={key} className={cn(css.treeItem)}>
                            <button
                              type="button"
                              className={cn(css.treeRow)}
                              aria-expanded={open}
                              onClick={() => { toggleNode(node) }}
                            >
                              <span className={cn(css.treeToggle)} aria-hidden="true">{open ? '▾' : '▸'}</span>
                              <span className={cn(css.treeLabel)}>{`${node.domain}/${node.module}/${node.node}`}</span>
                              <span className={cn(css.treeMeta)}>
                                {`${node.entries.map(entry => entry.kind).join('/')} · ${node.files}`}
                              </span>
                            </button>
                            {open && (
                              <ul className={cn(css.fileList)}>
                                {(dirFiles.get(key) ?? []).map(entry => (
                                  <li key={entry.rel}>
                                    <button
                                      type="button"
                                      className={cn(css.fileRow)}
                                      disabled={entry.directory}
                                      onClick={() => { if (!entry.directory) openPreview(entry.rel) }}
                                    >
                                      <span className={cn(css.fileName)}>{entry.name}</span>
                                      {entry.directory
                                        ? null
                                        : <span className={cn(css.fileMeta)}>{bytes(entry.bytes)}</span>}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {previewBusy && <p className={cn(base.note)}>{t('frontend.previewLoading')}</p>}
                  {preview !== undefined && (
                    <div className={cn(css.preview)}>
                      <div className={cn(css.previewHead)}>
                        <span className={cn(css.previewPath)}>{preview.rel}</span>
                        <span className={cn(css.previewMeta)}>
                          {t('frontend.previewMeta', {
                            encoding: preview.encoding,
                            from: preview.from,
                            to: preview.to,
                            total: preview.totalLines,
                          })}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => { setPreview(undefined) }}>
                          {t('frontend.previewClose')}
                        </Button>
                      </div>
                      <pre className={cn(css.previewBody)}>{preview.text}</pre>
                    </div>
                  )}

                  <p className={cn(base.note)}>{t('frontend.configPath')} {configPath}</p>
                </>
              )}
        </section>
      </div>
    </Modal>
  )
}

/**
 * The entry's glyph: a source file with a code bracket.
 * @returns the decorative svg.
 */
export function CodeMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.8h5.2L12.8 5.4v8.8a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9 1.9v3.6h3.7" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path
        d="m6.6 8.4-1.3 1.4 1.3 1.4M9.4 8.4l1.3 1.4-1.3 1.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
