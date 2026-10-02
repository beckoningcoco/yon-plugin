/**
 * The installation surface: every registered Home on one side, and on the other
 * what that directory actually is — what the probe found, which standard paths it
 * has, and whether a class index exists for its version.
 *
 * ## Why this surface exists at all
 *
 * The registration is not for the panel's benefit. A Home path today reaches the
 * model only inside the sentence that asks for it, so every new conversation
 * starts by asking again. Registering one here puts it behind `ncc_home_list`,
 * and the same fact is mirrored into the skills' own `*_home_path.json` so
 * Claude Code's half of the toolchain reads it too.
 *
 * ## What the probe is, and is not
 *
 * A probe walks directory entries and counts what it sees. It does not open a
 * jar — `buildClassIndex` does, and that takes minutes. So the two numbers it
 * reports are counts of names, and when the walk hits its cap they are reported
 * as lower bounds (`capped`) rather than as figures that look precise and are
 * not. Nothing here builds an index either: this batch registers, probes and
 * reads, and the index line reports only whether a build already exists.
 *
 * Same shape as its five siblings, on purpose: the shared stylesheet carries the
 * pane split, the list, the property grid, the form rows, the action row, the
 * empty state and the error strip, and the dialog chrome comes from `Modal`.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject
 * face, which is what keeps this file testable without the host.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  HOME_PRODUCTS, HOME_VERSIONS, type HomeProduct, type HomeShape, type HomeView,
  type MetaIndexStatusView,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { YonPanelKey } from '../locales.ts'
import type { HomeApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Below this many rows the list is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/** How long a copy confirmation stays on screen. */
const COPY_LINGER_MS = 1600

/**
 * How often a running build is asked where it is.
 *
 * A build is ~3.6 s on the reference installation and reports every 200 files, so a tick
 * a second is enough to watch it move without the poll being the thing that costs.
 */
const META_POLL_MS = 1000

/** Which translation key names each shape the probe can conclude. */
const SHAPE_KEY: Record<HomeShape, YonPanelKey> = {
  'ncc-home': 'home.shape.ncc-home',
  'bip-home': 'home.shape.bip-home',
  'jar-collection': 'home.shape.jar-collection',
  'not-found': 'home.shape.not-found',
}

/** Which translation key names each product line. */
const PRODUCT_KEY: Record<HomeProduct, YonPanelKey> = {
  ncc: 'home.product.ncc',
  bip: 'home.product.bip',
}

/** What the create/edit form holds while it is open. */
interface Draft {
  /** The registration being edited, or undefined while creating. */
  readonly id?: string
  path: string
  product: HomeProduct
  version: string
  /** True when the version is being typed rather than picked from the list. */
  versionOther: boolean
  isDefault: boolean
}

/**
 * The version dropdown's escape-hatch entry.
 *
 * A closed list of six is a dead end the moment a seventh version ships, and it is
 * wrong by construction for the product line it does not mention. A sentinel rather
 * than an empty value, because "nothing picked yet" and "deliberately something not
 * on the list" are different states: the first should show the hint, the second
 * should show a text box.
 */
const OTHER_VERSION = '__other__'

/**
 * A blank draft, or one seeded from an existing registration.
 *
 * No name: a Home is called `<产品线><版本>` (`homeLabelOf`), and the same version
 * registered against two projects describes the same set of classes, so a name would
 * only be a second identity to invent for a row that already has one.
 */
function draftOf(row?: HomeView): Draft {
  if (row === undefined) {
    return {
      path: '', product: 'ncc', version: '', versionOther: false, isDefault: false,
    }
  }
  return {
    id: row.id,
    path: row.path,
    product: row.product,
    version: row.version,
    // A version outside the table — registered before it existed, or typed through
    // the escape hatch — has to render as itself rather than as some preset.
    versionOther: !HOME_VERSIONS[row.product].some(option => option.value === row.version),
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

/**
 * The mark in front of every row: the same house the entry cell uses.
 * @returns the decorative glyph.
 */
function HomeMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.1 8 2.6l5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 7.4v5.6a.7.7 0 0 0 .7.7h6.6a.7.7 0 0 0 .7-.7V7.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 13.7V10h2.4v3.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The copy affordance, matching the field table's in the project surface.
 * @returns the decorative svg.
 */
function CopyMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.25 3.75H3.9c-.6 0-1.15.5-1.15 1.15v6.35" stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" />
    </svg>
  )
}

/**
 * The confirmation that replaces it once the path is on the clipboard.
 * @returns the decorative svg.
 */
function CheckMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface HomeManagerProps extends HomeApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * Render the installation surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export function HomeManager({ t, onClose, ...api }: HomeManagerProps) {
  /**
   * The two members the effects below depend on, taken by name.
   *
   * The rest object is rebuilt on every render — the face arrives as a spread, so no
   * version of it outlives a render — which makes it unusable as a dependency: an
   * effect that lists it re-runs every time, and an effect that then stores a
   * freshly-read answer re-renders and runs again. That is a loop, not a slow list, and
   * it is what selecting a registered row did here: the index status came back as a new
   * object every time, the render it caused re-ran the effect, and the pane spun at 100%
   * CPU while the timer queue starved (the poll never ticked, the DOM never settled).
   * The members are the stable part — the apply world builds them once — so they are
   * what the dependency lists name. `WikiManager` and `DigestManager` read their APIs
   * the same way for the same reason.
   */
  const { listHomes, metaStatus: readMetaStatus } = api
  const [homes, setHomes] = useState<readonly HomeView[]>([])
  const [complete, setComplete] = useState(true)
  const [payloadError, setPayloadError] = useState<string>()
  const [configPath, setConfigPath] = useState('')
  const [mirrorPath, setMirrorPath] = useState<string>()
  const [mirrorWarning, setMirrorWarning] = useState<string>()
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [probeNote, setProbeNote] = useState<string>()
  /** What the metadata index endpoint last said about the selected Home. */
  const [metaStatus, setMetaStatus] = useState<MetaIndexStatusView>()
  /** True between pressing build and the request coming back — not while it runs. */
  const [metaBusy, setMetaBusy] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  /**
   * What the host says its chooser is, or undefined while it has not been asked.
   *
   * Not reset with the draft: the host's answer is a property of the machine, so
   * once known it holds for every form opened afterwards in this panel.
   */
  const [pickerKind, setPickerKind] = useState<string>()
  const [picking, setPicking] = useState(false)
  /** Whether copying the path worked, and the timer that clears the confirmation. */
  const [copied, setCopied] = useState<'copied' | 'failed' | undefined>(undefined)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const focusedOnce = useRef(false)
  const list = useRef<HTMLUListElement | null>(null)
  /** The progress poll, while a build is running. */
  const metaPoll = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /** Read every registration, so save and probe land on what was actually stored. */
  const load = useCallback((keepId?: string): Promise<void> => {
    setLoading(true)
    setFailure(undefined)
    return listHomes().then(
      (payload) => {
        setHomes(payload.homes)
        setComplete(payload.complete)
        setPayloadError(payload.error)
        setConfigPath(payload.configPath)
        setMirrorPath(payload.mirrorPath)
        setMirrorWarning(payload.mirrorWarning)
        setSelected(previous => {
          const wanted = keepId ?? previous
          if (wanted !== undefined && payload.homes.some(row => row.id === wanted)) return wanted
          return payload.homes[0]?.id
        })
      },
      (cause: unknown) => { setFailure(forget(cause)) },
    ).finally(() => { setLoading(false) })
  }, [listHomes])

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

  const current = homes.find(row => row.id === selected)

  /** True while a build for the selected Home is actually running. */
  const metaRunning = metaStatus?.build?.running === true

  /** Stop asking a running build where it is. */
  const stopMetaPoll = useCallback((): void => {
    if (metaPoll.current !== undefined) {
      clearInterval(metaPoll.current)
      metaPoll.current = undefined
    }
  }, [])

  /**
   * Follow a build until it stops, then take the full answer once.
   *
   * The ticks ask for the cheap form (`fresh=0`), because the fingerprint comparison
   * inside the full one walks the whole installation — 0.61 s per second of polling is
   * a disk scan nobody asked for. The fingerprint is worth taking exactly once, when the
   * build has stopped and the numbers it produces have stopped moving.
   */
  const watchMeta = useCallback((id: string): void => {
    stopMetaPoll()
    metaPoll.current = setInterval(() => {
      void readMetaStatus(id, false).then(
        (status) => {
          setMetaStatus(status)
          if (status.build?.running !== true) {
            stopMetaPoll()
            void readMetaStatus(id, true).then(setMetaStatus, () => undefined)
          }
        },
        () => { stopMetaPoll() },
      )
    }, META_POLL_MS)
  }, [readMetaStatus, stopMetaPoll])

  useEffect(() => () => { stopMetaPoll() }, [stopMetaPoll])

  // The index status belongs to the selected row, so it is re-read when the selection
  // changes and never merged across rows — a status left over from the previous Home
  // would be a row's metadata described by another row's numbers.
  useEffect(() => {
    stopMetaPoll()
    const id = current?.id
    if (id === undefined) {
      setMetaStatus(undefined)
      return
    }
    let live = true
    void readMetaStatus(id, true).then(
      (status) => {
        if (!live) return
        setMetaStatus(status)
        // A build started in another window, or before this pane was opened, is still
        // worth watching — the poll is what makes it visible here at all.
        if (status.build?.running === true) watchMeta(id)
      },
      () => { if (live) setMetaStatus(undefined) },
    )
    return () => { live = false }
  }, [readMetaStatus, current?.id, stopMetaPoll, watchMeta])

  /**
   * Start a build. Deliberately not through `act`: `act` raises `busy`, which disables
   * every control in the pane — right for a save that finishes in milliseconds, wrong for
   * a build that runs for seconds and whose whole point is that you can watch it.
   */
  const buildMeta = (row: HomeView): void => {
    setMetaBusy(true)
    setFailure(undefined)
    void (async () => {
      try {
        const answer = await api.buildMeta(row.id)
        setMetaStatus(answer.status)
        if (answer.status.build?.running === true || answer.started) watchMeta(row.id)
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setMetaBusy(false)
      }
    })()
  }


  /** Save the open draft, then select whatever it produced. */
  const save = (): void => {
    const open = draft
    if (open === undefined) return
    const body = {
      path: open.path.trim(),
      product: open.product,
      version: open.version.trim(),
      isDefault: open.isDefault,
    }
    act(async () => {
      const saved = await api.saveHome(open.id, body)
      setDraft(undefined)
      setProbeNote(undefined)
      await load(saved.id)
    }, open.id)
  }

  /** Walk the directory again and store what is there now. */
  const probe = (row: HomeView): void => {
    setProbeNote(undefined)
    act(async () => {
      const fresh = await api.probeHome(row.id)
      const profile = fresh.profile
      setProbeNote(profile === undefined
        ? t('home.never')
        : profile.capped
          ? t('home.probedCapped', { shape: t(SHAPE_KEY[profile.shape]) })
          : t('home.probed', { shape: t(SHAPE_KEY[profile.shape]), modules: profile.modules, jars: profile.jars }))
      await load(row.id)
    }, row.id)
  }

  /**
   * Open the host's folder chooser and take the directory it returns.
   *
   * The picker is asked lazily — on a click, not on mount — because asking is what
   * opens the dialog: there is no way to learn the host's kind without it. So the
   * button is what a fresh form shows, and a host that cannot back it is discovered
   * once and never again in this panel.
   *
   * Cancelling is a normal answer (`path: null`), not a failure: the field keeps
   * what it had. A host with no chooser is not a failure either — the form says so
   * under the field. There is no text box to fall back to: a typed path is exactly
   * the thing this field stops being able to be wrong about.
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

  /** Put the Home path on the clipboard, since it is a machine fact people paste. */
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
    ? homes
    : homes.filter(row =>
      row.label.toLowerCase().includes(needle)
      || row.path.toLowerCase().includes(needle)
      || row.version.toLowerCase().includes(needle))
  const tabbableId = selected ?? visible[0]?.id

  /** A timestamp as a person reads it, since the probe stores ISO. */
  const when = (iso: string): string => iso.slice(0, 19).replace('T', ' ')

  const row = (home: HomeView) => (
    <li key={home.id}>
      <button
        type="button"
        role="option"
        aria-selected={home.id === selected}
        tabIndex={home.id === tabbableId ? 0 : -1}
        className={cn(base.projectRow, !home.ready ? css.rowNotReady : undefined)}
        data-key={home.id}
        onClick={() => {
          setSelected(home.id)
          setDraft(undefined)
          setProbeNote(undefined)
          setConfirmingRemove(false)
        }}
      >
        <span className={cn(base.projectMark)} aria-hidden="true"><HomeMark /></span>
        <span className={cn(base.projectName)} title={home.label}>{home.label}</span>
        {/* The version is already in the name above, so what is left to say is
            whether this is the one an unqualified lookup lands on. */}
        <span className={cn(base.projectMeta)}>
          {home.isDefault ? t('home.defaultTag') : ''}
        </span>
      </button>
    </li>
  )

  /** The probe's reading: shape, the two counts, and the standard-path table. */
  const probeBlock = (home: HomeView) => {
    const profile = home.profile
    if (profile === undefined) {
      return <p className={cn(base.note)}>{t('home.never')}</p>
    }
    const atLeast = profile.capped ? t('home.atLeast') : ''
    return (
      <>
        <p className={cn(base.note)}>{t('home.probedAt', { at: when(profile.probedAt) })}</p>
        <dl className={cn(base.props)}>
          <dt className={cn(base.propLabel)}>{t('home.shape')}</dt>
          <dd className={cn(base.propValue)}>{t(SHAPE_KEY[profile.shape])}</dd>

          <dt className={cn(base.propLabel)}>{t('home.modules')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${profile.modules}`}</dd>

          <dt className={cn(base.propLabel)}>{t('home.jars')}</dt>
          <dd className={cn(base.propValue)}>{`${atLeast}${profile.jars}`}</dd>
        </dl>

        <h4 className={cn(css.subTitle)}>{t('home.keyPaths')}</h4>
        <div className={cn(css.keys)}>
          {profile.keys.map(key => (
            <Fragment key={key.rel}>
              <span className={cn(css.keyRole)}>{key.role}</span>
              <span className={cn(css.keyRel)}>{key.rel}</span>
              <span className={cn(key.exists ? css.keyState : css.keyStateNo)}>
                {key.exists ? t('home.keyYes') : t('home.keyNo')}
              </span>
            </Fragment>
          ))}
        </div>

        {profile.warnings.length > 0 && (
          <ul className={cn(css.warnList)}>
            {profile.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        {/* Said out loud because the two figures above look like exact counts: a
            probe counts names and opens no jar, so it takes seconds and says "at
            least" when the walk was cut off. */}
        <p className={cn(base.note)}>{t('home.probeNote')}</p>
      </>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('home.title')}
      closeLabel={t('home.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('home.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('home.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body)}>
        <section className={cn(base.listPane)} aria-label={t('home.list')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('home.list')}</span>
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
              {t('home.new')}
            </Button>
          </div>

          {homes.length >= SEARCH_THRESHOLD && (
            <Input
              type="search"
              className={cn(base.inputFill)}
              aria-label={t('home.search')}
              placeholder={t('home.search')}
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
            />
          )}

          {!complete && (
            <p className={cn(base.note)}>{t('home.loadFailed', { message: payloadError ?? '' })}</p>
          )}

          <ul ref={list} className={cn(base.projects)} role="listbox" aria-label={t('home.list')}>
            {visible.map(row)}
          </ul>

          {needle !== '' && visible.length === 0 && (
            <p className={cn(base.note)}>{t('home.searchEmpty', { query: query.trim() })}</p>
          )}
          {needle !== '' && visible.length > 0 && (
            <p className={cn(base.note)}>{t('home.showing', { shown: visible.length, total: homes.length })}</p>
          )}

          {/* Said out loud: the registrations live in a file the operator owns and
              may edit by hand, so the surface names it rather than implying the
              panel is the only way in. */}
          {configPath !== '' && (
            <p className={cn(base.note)} title={configPath}>
              {t('home.configPath')} <span className={cn(css.mono)}>{configPath}</span>
            </p>
          )}

          {/* The other half of the feature: the same registration, written where
              Claude Code's toolchain reads it. Named rather than assumed, and the
              warning is shown beside it when the mirror could not be written. */}
          {mirrorPath !== undefined && (
            <p className={cn(base.note)} title={mirrorPath}>
              {t('home.mirror')} <span className={cn(css.mono)}>{mirrorPath}</span>
            </p>
          )}
          {mirrorWarning !== undefined && (
            <p className={cn(base.note)} role="status">
              {t('home.mirrorWarn', { message: mirrorWarning })}
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
                  {draft.id === undefined ? t('home.newTitle') : t('home.editTitle')}
                </h3>

                <p className={cn(base.hint)}>
                  {draft.id === undefined ? t('home.createHint') : t('home.editHint')}
                </p>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-home-path">{t('home.pathLabel')}</label>
                  {/* Picked and never typed. The path is long, it has to exist, and a
                      typo in it is discovered only after a probe has walked the wrong
                      tree — none of which a text box can help with. So the field is a
                      readout of what the chooser returned. */}
                  <span className={cn(css.pathRow)}>
                    <Input
                      id="yon-home-path"
                      className={cn(base.inputFill, css.pathField)}
                      value={draft.path}
                      readOnly
                      placeholder={t('home.pathNone')}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || picking}
                      onClick={choosePath}
                    >
                      {picking ? t('home.picking') : t('home.pickDir')}
                    </Button>
                  </span>
                  {/* A host that has no local folder dialog — the panel reached over
                      SSH or a LAN address — is told so here rather than being handed a
                      button that cannot answer. There is deliberately no text box to
                      fall back to. */}
                  {pickerKind !== undefined && pickerKind !== 'native' && (
                    <p className={cn(base.hint)}>{t('home.pickUnavailable')}</p>
                  )}
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-home-product">{t('home.product')}</label>
                  <select
                    id="yon-home-product"
                    className={cn(css.select)}
                    value={draft.product}
                    disabled={draft.id !== undefined}
                    onChange={(event) => {
                      const product = event.target.value === 'bip' ? 'bip' : 'ncc'
                      // The two lists share no values, so a version picked under one
                      // product line cannot stay selected under the other. Clearing it
                      // back to "choose one" beats silently keeping `2111` while the
                      // dropdown reads BIP.
                      const keeps = HOME_VERSIONS[product].some(option => option.value === draft.version)
                      setDraft({ ...draft, product, ...keeps ? {} : { version: '', versionOther: false } })
                    }}
                  >
                    {HOME_PRODUCTS.map(product => (
                      <option key={product} value={product}>{t(PRODUCT_KEY[product])}</option>
                    ))}
                  </select>
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-home-version">{t('home.version')}</label>
                  <select
                    id="yon-home-version"
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
                        the form says about the version is "choose one" rather than a
                        version the operator did not choose. */}
                    <option value="" disabled>{t('home.versionPick')}</option>
                    {HOME_VERSIONS[draft.product].map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                    <option value={OTHER_VERSION}>{t('home.versionOther')}</option>
                  </select>
                  {/* The text box appears only for the escape hatch: the common path
                      then has nothing to mistype, and a version the table has never
                      heard of is still registrable. */}
                  {draft.versionOther && (
                    <Input
                      id="yon-home-version-text"
                      className={cn(base.inputFill)}
                      value={draft.version}
                      disabled={draft.id !== undefined}
                      placeholder={t('home.versionPlaceholder')}
                      onChange={(event) => { setDraft({ ...draft, version: event.target.value }) }}
                    />
                  )}
                  <p className={cn(base.hint)}>{t('home.versionHint')}</p>
                </div>

                {/* The shared sheet's `.archivedToggle` is a labelled checkbox row
                    with a rule above it — generic, and this is its second user; the
                    name is the shared sheet's business, not this surface's. */}
                <label className={cn(base.archivedToggle)}>
                  <input
                    type="checkbox"
                    checked={draft.isDefault}
                    onChange={(event) => { setDraft({ ...draft, isDefault: event.target.checked }) }}
                  />
                  {t('home.setDefault')}
                </label>

                <div className={cn(base.detailActions)}>
                  <Button type="submit" size="sm" disabled={busy}>
                    {busy ? t('home.saving') : t('home.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => { setDraft(undefined) }}
                  >
                    {t('home.cancel')}
                  </Button>
                </div>
              </form>
            )
            : current === undefined
              ? (
                <div className={cn(base.empty)}>
                  <span className={cn(base.emptyMark)} aria-hidden="true"><HomeMark /></span>
                  <p className={cn(base.emptyTitle)}>
                    {loading
                      ? t('home.loading')
                      : homes.length === 0 ? t('home.empty') : t('home.pickOne')}
                  </p>
                  {homes.length === 0 && !loading && (
                    <>
                      <p className={cn(base.note)}>{t('home.emptyWhy')}</p>
                      <p className={cn(base.note)}>{t('home.emptyHow')}</p>
                    </>
                  )}
                </div>
              )
              : (
                <>
                  <h3 className={cn(css.title)}>
                    {current.label}
                    {current.isDefault && <span className={cn(base.tagMuted)}>{t('home.defaultTag')}</span>}
                  </h3>

                  {!current.ready && <p className={cn(base.note)}>{t('home.notReady')}</p>}

                  <dl className={cn(base.props)}>
                    <dt className={cn(base.propLabel)}>{t('home.path')}</dt>
                    <dd className={cn(base.propValue)}>
                      <span className={cn(css.pathRow)}>
                        <span className={cn(css.mono)}>{current.path}</span>
                        <button
                          type="button"
                          className={cn(css.copyBtn,
                            copied === 'copied' ? css.copyOk : undefined,
                            copied === 'failed' ? css.copyBad : undefined)}
                          aria-label={copied === 'copied'
                            ? t('home.copied')
                            : copied === 'failed' ? t('home.copyFailed') : t('home.copy')}
                          title={t('home.copy')}
                          onClick={() => { copyPath(current.path) }}
                        >
                          {copied === 'copied' ? <CheckMark /> : <CopyMark />}
                        </button>
                      </span>
                    </dd>

                    <dt className={cn(base.propLabel)}>{t('home.product')}</dt>
                    <dd className={cn(base.propValue)}>{t(PRODUCT_KEY[current.product])}</dd>

                    <dt className={cn(base.propLabel)}>{t('home.indexTitle')}</dt>
                    <dd className={cn(base.propValue)}>
                      {current.index === undefined
                        ? t('home.indexNone')
                        : t('home.indexLine', {
                          classes: current.index.totalClasses,
                          size: bytes(current.index.bytes),
                          at: when(current.index.builtAt),
                        })}
                    </dd>

                    {/* The build button sits with the value rather than in the action
                        row at the foot of the pane, because it is the value's own
                        control: the row above it describes an index, and the thing you
                        do about that index belongs on the same line as the description.
                        The class index has no such button yet, which is why this reads
                        as one row that can act and one that cannot. */}
                    <dt className={cn(base.propLabel)}>{t('home.metaTitle')}</dt>
                    <dd className={cn(base.propValue)}>
                      <span className={cn(css.pathRow)}>
                        <span>
                          {metaStatus === undefined || metaStatus.indexed !== true
                            ? t('home.metaNone')
                            : t('home.metaLine', {
                              entities: metaStatus.counts?.entities ?? 0,
                              fields: metaStatus.counts?.fields ?? 0,
                              enums: metaStatus.counts?.enums ?? 0,
                              size: bytes(metaStatus.bytes ?? 0),
                              at: when(metaStatus.builtAt ?? ''),
                            })}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={metaBusy || metaRunning}
                          onClick={() => { buildMeta(current) }}
                        >
                          {metaRunning
                            ? t('home.metaBuilding')
                            : metaStatus?.indexed === true ? t('home.metaRebuild') : t('home.metaBuild')}
                        </Button>
                      </span>
                      {metaStatus?.build !== undefined && metaRunning && (
                        <p className={cn(base.note)} role="status">
                          {t('home.metaProgress', {
                            parsed: metaStatus.build.parsed,
                            total: metaStatus.build.total,
                            files: metaStatus.build.files,
                          })}
                        </p>
                      )}
                      {metaStatus?.build?.error !== undefined && (
                        <p className={cn(base.note)} role="alert">
                          {t('home.metaFailed', { error: metaStatus.build.error })}
                        </p>
                      )}
                      {metaStatus?.freshness !== undefined && (
                        <p className={cn(base.note)}>
                          {metaStatus.freshness.state === 'fresh'
                            ? t('home.metaFresh')
                            : t('home.metaStale', {
                              changed: metaStatus.freshness.changed,
                              added: metaStatus.freshness.added,
                              removed: metaStatus.freshness.removed,
                            })}
                        </p>
                      )}
                      {(metaStatus?.sourceHomes?.length ?? 0) > 0 && (
                        <p className={cn(base.note)}>
                          {t('home.metaFrom')}{' '}
                          <span className={cn(css.mono)}>
                            {(metaStatus?.sourceHomes ?? []).join('  ·  ')}
                          </span>
                        </p>
                      )}
                      {metaStatus === undefined && <p className={cn(base.note)}>{t('home.metaWhy')}</p>}
                    </dd>
                  </dl>

                  <h4 className={cn(css.subTitle)}>{t('home.probeTitle')}</h4>
                  {probeBlock(current)}

                  {probeNote !== undefined && (
                    <p className={cn(base.note)} role="status">{probeNote}</p>
                  )}

                  {/* The question goes **inside** the action row rather than on a
                      line above it. The shared sheet pins `.detailActions:last-child`
                      to the bottom of the pane, so a line above it scrolls out of
                      view — and the one moment that question must be readable is
                      exactly when the buttons it asks about are on screen. The
                      preview caught this: the confirm page showed the two buttons
                      and no question at all. */}
                  <div className={cn(base.detailActions)}>
                    {confirmingRemove && (
                      <span className={cn(base.note)}>
                        {t('home.removeAsk')} {t('home.removeAbout')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => { probe(current) }}
                    >
                      {busy ? t('home.probing') : t('home.probe')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || current.isDefault}
                      onClick={() => {
                        act(async () => { await api.setDefaultHome(current.id) }, current.id)
                      }}
                    >
                      {t('home.makeDefault')}
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
                      {t('home.edit')}
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
                                await api.removeHome(target)
                                setSelected(undefined)
                              })
                            }}
                          >
                            {t('home.removeYes')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => { setConfirmingRemove(false) }}
                          >
                            {t('home.cancel')}
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
                          {t('home.remove')}
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
