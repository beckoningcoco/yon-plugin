/**
 * The browser surface: pick one of the browsers this machine has, say what port its
 * debugging server should listen on, start it, and see what is running.
 *
 * ## What this surface is for
 *
 * Every other surface in this panel is about something the operator already has — a
 * project list, a set of connections, a knowledge base. This one is about something that
 * has to be *made* first: the front-end automation line (`Playwright` over CDP) needs a
 * browser started with a debug port and its own user-data directory, and doing that by
 * hand means finding the exe, remembering the flags, and copying an endpoint out of
 * `/json/version` afterwards. The picker removes the finding, the form removes the flags,
 * and the running list is where the endpoint comes from.
 *
 * ## Why it saves before it starts
 *
 * 「启动」 writes the form first and then launches, rather than sending the form's values
 * along with the launch. The whole point of the port and the profile directory being on
 * this screen is that they are *remembered* — a launch that took them as one-off
 * arguments would leave the row still holding the old ones, and the next launch would
 * come up somewhere else. It also means a launch can never disagree with what the panel
 * is showing.
 *
 * ## What it will not do
 *
 * It does not adopt a browser it did not start: a debug port that answers but has no
 * ledger row behind it is somebody else's instance, and the most this surface says about
 * one is that the port was taken (the host's own `port-in-use` refusal). Stopping is
 * likewise per-row and two-step, because ending the wrong process here means somebody's
 * debugging session.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject face, which
 * is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Input, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BrowserListPayload, BrowserRunView, BrowserView, ScanBrowsersPayload,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import { ALIVE_LABEL_KEYS, type BrowserApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** How long the copy confirmation stays up, matching the field table's. */
const COPY_LINGER_MS = 1_600

/** What the form holds while it is open. Text, because a form field is text. */
interface Draft {
  readonly id: string
  path: string
  port: string
  profileDir: string
  startUrl: string
}

/** A draft seeded from one registered row. */
function draftOf(row: BrowserView): Draft {
  return {
    id: row.id,
    path: row.path,
    port: String(row.port),
    profileDir: row.profileDir,
    startUrl: row.startUrl,
  }
}

/** The parts of the list payload that are not rows. */
interface Facts {
  complete: boolean
  configPath: string
  runsPath: string
  platform: string
  scanSupported: boolean
  scannedAt?: string
  error?: string
  note?: string
}

/**
 * The mark in front of every row: a browser window with its address bar.
 * @returns the decorative glyph.
 */
function WindowMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.9 6.1h12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="4.1" cy="4.5" r="0.7" fill="currentColor" />
    </svg>
  )
}

/**
 * The copy affordance, matching the installation surface's.
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
 * The confirmation that replaces it once the endpoint is on the clipboard.
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

/**
 * A timestamp as a local short form. An empty one gets a dash rather than a plausible
 * time, the same rule the iteration surface follows.
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

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface BrowserManagerProps extends BrowserApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * Render the browser surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export function BrowserManager({ t, onClose, ...api }: BrowserManagerProps) {
  // Taken by name: the face arrives as a spread, so a dependency list holding the whole
  // object would change identity every render and re-run the read below forever. The
  // operations themselves come from the API client built once in `apply`, so these
  // references are stable.
  const { listBrowsers, scanBrowsers, saveBrowser, launchBrowser, stopBrowser } = api

  const [browsers, setBrowsers] = useState<readonly BrowserView[]>([])
  const [runs, setRuns] = useState<readonly BrowserRunView[]>([])
  const [facts, setFacts] = useState<Facts>({
    complete: true, configPath: '', runsPath: '', platform: '', scanSupported: true,
  })
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [stopAsk, setStopAsk] = useState<string>()
  const [copied, setCopied] = useState<'copied' | 'failed'>()
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const focusedOnce = useRef(false)
  const picker = useRef<HTMLSelectElement | null>(null)

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /**
   * Read the registrations, the ledger and the scan state in one call.
   *
   * `keepId` is passed by every caller that has one rather than read from this render's
   * selection: that keeps the callback's identity stable, so the mount effect runs once
   * instead of once per selection.
   * @param keepId - the row to keep selected, when it is still registered.
   */
  const load = useCallback(async (keepId?: string): Promise<void> => {
    setLoading(true)
    setFailure(undefined)
    try {
      const payload: BrowserListPayload = await listBrowsers()
      setBrowsers(payload.browsers)
      setRuns(payload.runs)
      setFacts({
        complete: payload.complete,
        configPath: payload.configPath,
        runsPath: payload.runsPath,
        platform: payload.platform,
        scanSupported: payload.scanSupported,
        // Spread rather than assigned: an optional member set to `undefined` is not the
        // same object as one that is absent, and this build distinguishes the two.
        ...payload.scannedAt === undefined ? {} : { scannedAt: payload.scannedAt },
        ...payload.error === undefined ? {} : { error: payload.error },
        ...payload.note === undefined ? {} : { note: payload.note },
      })
      const row = payload.browsers.find(entry => entry.id === keepId) ?? payload.browsers[0]
      setSelected(row?.id)
      setDraft(row === undefined ? undefined : draftOf(row))
    } catch (cause: unknown) {
      setFailure(forget(cause))
    } finally {
      setLoading(false)
    }
  }, [listBrowsers])

  useEffect(() => { void load() }, [load])

  /** Run one mutation, then re-read so the surface shows what was actually stored. */
  const act = (work: () => Promise<void>, keepId?: string): void => {
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      setStatus(undefined)
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

  /** The patch for the open draft, or undefined when a field says something impossible. */
  const patchOf = (open: Draft): {
    readonly path: string
    readonly profileDir: string
    readonly port: number
    readonly startUrl: string
  } | undefined => {
    const text = open.port.trim()
    // Checked here rather than left to the host, because the host's refusal travels back
    // as a failure line while this is a field the operator is looking at. Ten digits is
    // not a port either; the range itself stays the host's rule.
    if (!/^\d{1,10}$/.test(text)) {
      setFailure(t('browser.portNotNumber'))
      return undefined
    }
    return {
      path: open.path.trim(),
      profileDir: open.profileDir.trim(),
      port: Number.parseInt(text, 10),
      startUrl: open.startUrl.trim(),
    }
  }

  /** What a scan came back with, in one line. */
  const scanLine = (outcome: ScanBrowsersPayload): string => {
    const parts = [t('browser.scanDone', { count: String(outcome.browsers.length) })]
    if (outcome.added.length > 0) parts.push(t('browser.scanAdded', { ids: outcome.added.join(' / ') }))
    if (outcome.updated.length > 0) parts.push(t('browser.scanUpdated', { ids: outcome.updated.join(' / ') }))
    if (outcome.stale.length > 0) parts.push(t('browser.scanStale', { ids: outcome.stale.join(' / ') }))
    if (outcome.note !== undefined) parts.push(outcome.note)
    return parts.join(' ')
  }

  /** Walk the machine again and store what was found. */
  const scan = (): void => {
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      setStatus(undefined)
      try {
        const outcome = await scanBrowsers()
        await load(selected)
        setStatus(scanLine(outcome))
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setBusy(false)
      }
    })()
  }

  /** Store the open draft without starting anything. */
  const save = (): void => {
    const open = draft
    if (open === undefined) return
    const patch = patchOf(open)
    if (patch === undefined) return
    act(async () => {
      const { browser } = await saveBrowser(open.id, patch)
      setStatus(t('browser.saved', { product: browser.product }))
    }, open.id)
  }

  /** Store the open draft, then start it on the port that was just saved. */
  const start = (): void => {
    const open = draft
    if (open === undefined) return
    const patch = patchOf(open)
    if (patch === undefined) return
    act(async () => {
      const { browser } = await saveBrowser(open.id, patch)
      const { run } = await launchBrowser(open.id, {})
      // A port that has not answered yet is said so, with the log's path: the process is
      // up and may simply be slow, which is a different thing from a launch that failed.
      setStatus(run.ready
        ? t('browser.launched', { port: String(run.port) })
        : t('browser.launchedSlow', { port: String(run.port), path: browser.logPath }))
    }, open.id)
  }

  /** End one instance this panel started. */
  const stop = (runId: string): void => {
    setStopAsk(undefined)
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      setStatus(undefined)
      try {
        const result = await stopBrowser(runId)
        setStatus(result.stopped
          ? t('browser.stopped')
          : t('browser.stopKept', { note: result.note ?? '' }))
        await load(selected)
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setBusy(false)
      }
    })()
  }

  /** Put an endpoint on the clipboard: it is the thing people paste into a client. */
  const copy = (value: string): void => {
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

  // Focus lands inside the dialog rather than on the page behind it. On the picker and
  // not on the first text box: the first control on this surface asks which browser, and
  // that is the question the whole screen exists to answer.
  useEffect(() => {
    if (loading || focusedOnce.current) return
    focusedOnce.current = true
    picker.current?.focus()
  }, [loading])

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const current = browsers.find(row => row.id === selected)
  const canStart = current !== undefined && current.pathExists

  /**
   * The line under the picker, which is about where the paths came from.
   *
   * Three readings, and the middle one is why this is a function rather than an inline
   * ternary: where the platform cannot be scanned, the host's own `note` already carries
   * the sentence and the fix, so this adds nothing. Its only job there is the case where a
   * payload arrives without that note — hence the fallback.
   * @returns the line, or null when the host has already said it.
   */
  const scanProvenance = (): ReactNode => {
    if (facts.scannedAt !== undefined) {
      return <p className={cn(base.hint)}>{t('browser.scannedAt', { at: shortTime(facts.scannedAt) })}</p>
    }
    if (!facts.scanSupported) {
      return facts.note === undefined
        ? <p className={cn(base.hint)}>{t('browser.scanUnsupported', { platform: facts.platform })}</p>
        : null
    }
    return <p className={cn(base.hint)}>{t('browser.neverScanned')}</p>
  }

  /**
   * The re-scan control: one copy, in the actions row that now sits outside the row
   * branch.
   *
   * It used to be rendered twice — once in that row and once inside the empty state —
   * because the empty state's own hint says 「点『重新扫描』」 and a machine that scanned
   * clean would otherwise be told to press a control that was not on the page. Hoisting
   * the verbs out of the row branch removed the need for the second copy: the hint and
   * the button are in the same render path whatever the list holds.
   * @returns the button, or null where a scan cannot work (host's `scanSupported`).
   */
  const rescanButton = (): ReactNode => {
    if (!facts.scanSupported) return null
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={scan}>
        {busy ? t('browser.scanning') : t('browser.rescan')}
      </Button>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('browser.title')}
      closeLabel={t('browser.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('browser.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load(selected) }}>
            {t('browser.retry')}
          </button>
        </p>
      )}

      {/* A scan is a read of the whole machine, and its result is a sentence rather than
          a list — so it goes here, where it stays put instead of scrolling away. */}
      {status !== undefined && <p className={cn(base.note)} role="status">{status}</p>}

      <div className={cn(base.body)}>
        <section className={cn(base.detailPane)} aria-label={t('browser.title')}>
          <p className={cn(base.note)}>{t('browser.intro')}</p>

          {!facts.complete && (
            <p className={cn(base.note)}>
              {facts.error === undefined
                ? t('browser.partial')
                : t('browser.readFailed', { message: facts.error })}
            </p>
          )}
          {facts.note !== undefined && <p className={cn(base.note)}>{facts.note}</p>}

          <div className={cn(base.formRow)}>
            <label className={cn(base.formLabel)} htmlFor="yon-br-pick">{t('browser.pick')}</label>
            <select
              id="yon-br-pick"
              ref={picker}
              className={cn(css.select)}
              value={selected ?? ''}
              disabled={busy || browsers.length === 0}
              onChange={(event) => {
                const id = event.target.value
                const row = browsers.find(entry => entry.id === id)
                setSelected(id)
                setDraft(row === undefined ? undefined : draftOf(row))
                setStatus(undefined)
                setStopAsk(undefined)
              }}
            >
              {browsers.length === 0 && <option value="">{t('browser.empty')}</option>}
              {browsers.map(row => (
                <option key={row.id} value={row.id}>
                  {row.product}{row.stale ? ` — ${t('browser.pathStale')}` : ''}
                </option>
              ))}
            </select>
            {/* Said out loud, because it is the slow part and the reason the list exists
                at all: nothing below re-reads a directory on its own. */}
            {scanProvenance()}
          </div>

          {/* The branch is on `current` alone, so the other side of it is a narrowed row.
              The big empty mark is for the state with nothing at all to show — no row and
              no instance; a surface with instances but no rows still has to list them and
              still has to offer the way to stop them, which is what the sections below
              this one do. Only the row's own fields need a row. */}
          {current === undefined
            ? (runs.length === 0 && (
              <div className={cn(base.empty)}>
                <span className={cn(base.emptyMark)} aria-hidden="true"><WindowMark /></span>
                <p className={cn(base.emptyTitle)}>
                  {loading ? t('browser.loading') : t('browser.empty')}
                </p>
                {/* The hint names the re-scan button, so it is only true where that
                    button is on the page. On a platform the scanner cannot serve, the
                    empty list is explained by the host's own note (or by the platform
                    line above) instead of by an instruction to press something that
                    is not there. */}
                {!loading && facts.scanSupported
                  && <p className={cn(base.note)}>{t('browser.emptyHint')}</p>}
              </div>
            ))
            : (
              <>
                <h3 className={cn(css.title)}>
                  <span className={cn(base.projectMark)} aria-hidden="true"><WindowMark /></span>
                  {current.product}
                  <span className={cn(css.mono)}>{current.family}</span>
                </h3>

                {!current.pathExists && (
                  <p className={cn(base.note)}>{t('browser.pathMissing')}</p>
                )}

                <div className={cn(base.form)}>
                  <div className={cn(base.formRow)}>
                    <label className={cn(base.formLabel)} htmlFor="yon-br-path">
                      {t('browser.path')}
                    </label>
                    <Input
                      id="yon-br-path"
                      className={cn(base.inputFill)}
                      value={draft?.path ?? ''}
                      onChange={(event) => {
                        const value = event.target.value
                        setDraft(open => (open === undefined ? open : { ...open, path: value }))
                      }}
                    />
                    <p className={cn(base.hint)}>{current.id}</p>
                  </div>

                  <div className={cn(css.pair)}>
                    <div className={cn(base.formRow)}>
                      <label className={cn(base.formLabel)} htmlFor="yon-br-port">
                        {t('browser.port')}
                      </label>
                      <Input
                        id="yon-br-port"
                        className={cn(base.inputFill)}
                        value={draft?.port ?? ''}
                        onChange={(event) => {
                          const value = event.target.value
                          setDraft(open => (open === undefined ? open : { ...open, port: value }))
                        }}
                      />
                      <p className={cn(base.hint)}>{t('browser.portHint')}</p>
                    </div>
                    <div className={cn(base.formRow)}>
                      <label className={cn(base.formLabel)} htmlFor="yon-br-url">
                        {t('browser.startUrl')}
                      </label>
                      <Input
                        id="yon-br-url"
                        className={cn(base.inputFill)}
                        value={draft?.startUrl ?? ''}
                        onChange={(event) => {
                          const value = event.target.value
                          setDraft(open => (open === undefined ? open : { ...open, startUrl: value }))
                        }}
                      />
                      <p className={cn(base.hint)}>{t('browser.startUrlHint')}</p>
                    </div>
                  </div>

                  <div className={cn(base.formRow)}>
                    <label className={cn(base.formLabel)} htmlFor="yon-br-profile">
                      {t('browser.profileDir')}
                    </label>
                    <Input
                      id="yon-br-profile"
                      className={cn(base.inputFill)}
                      value={draft?.profileDir ?? ''}
                      onChange={(event) => {
                        const value = event.target.value
                        setDraft(open => (open === undefined ? open : { ...open, profileDir: value }))
                      }}
                    />
                    <p className={cn(base.hint)}>{t('browser.profileHint')}</p>
                    {/* The price of the location the operator asked for, said before it
                        is paid rather than discovered after a reinstall. */}
                    <p className={cn(base.hint)}>{t('browser.profileWarning')}</p>
                  </div>
                </div>
              </>
            )}

          {/* The verbs sit outside that branch on purpose. 重新扫描 belongs to the surface
              rather than to a row — the empty state's hint names it, and a machine with no
              rows is exactly where it gets pressed. 启动/保存 still need a row, so they are
              the conditional part. The row itself is skipped when it would hold nothing,
              so a platform where a scan cannot work leaves no empty band behind.

              The dock comes with the row and not with the empty state: it exists because
              the *form* pushes the verbs past the pane's edge (measured 437..465 in a 450
              pane before it), and in the empty state the row is one button under a short
              column — there the hairline and the opaque fill would be decoration. */}
          {(current !== undefined || facts.scanSupported) && (
            <div className={cn(base.detailActions, current === undefined ? undefined : css.actionsDock)}>
              {current !== undefined && (
                <>
                  <Button size="sm" disabled={busy || !canStart} onClick={start}>
                    {busy ? t('browser.starting') : t('browser.start')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={save}>
                    {busy ? t('browser.saving') : t('browser.save')}
                  </Button>
                </>
              )}
              {/* Not offered where it cannot work (see `rescanButton`). */}
              {rescanButton()}
            </div>
          )}

          <hr className={cn(base.rule)} />

          <h3 className={cn(css.title)}>{t('browser.running')}</h3>
          {runs.length === 0
            ? <p className={cn(base.note)}>{t('browser.runningEmpty')}</p>
            : (
              <ul className={cn(css.runs)}>
                {runs.map(run => (
                  <li key={run.runId} className={cn(css.run)}>
                    <span className={cn(css.runWho)} title={run.browserId}>
                      {run.label} · {run.port}
                    </span>
                    <span className={cn(css.runEndpoint)}>
                      <span className={cn(css.mono)}>{run.endpoint}</span>
                      <button
                        type="button"
                        className={cn(
                          base.rowIcon,
                          copied === 'copied' ? base.rowCopied : undefined,
                          copied === 'failed' ? base.rowCopyFailed : undefined,
                        )}
                        title={copied === 'copied'
                          ? t('browser.copied')
                          : copied === 'failed' ? t('browser.copyFailed') : t('browser.copy')}
                        aria-label={t('browser.copy')}
                        onClick={() => { copy(run.endpoint) }}
                      >
                        {copied === 'copied' ? <CheckMark /> : <CopyMark />}
                      </button>
                    </span>
                    <span className={cn(css.runState)}>
                      {t(ALIVE_LABEL_KEYS[run.alive])}
                      {!run.ready && ` · ${t('browser.notReady')}`}
                      {` · ${shortTime(run.startedAt)}`}
                    </span>
                    {stopAsk === run.runId
                      ? (
                        <>
                          <Button size="sm" variant="outline" className={cn(base.dangerButton, css.runButton)}
                            disabled={busy} onClick={() => { stop(run.runId) }}>
                            {t('browser.stopYes')}
                          </Button>
                          <Button size="sm" variant="outline" className={cn(css.runButton)}
                            disabled={busy} onClick={() => { setStopAsk(undefined) }}>
                            {t('browser.stopNo')}
                          </Button>
                        </>
                      )
                      : (
                        <Button size="sm" variant="outline" className={cn(base.dangerButton, css.runButton)}
                          disabled={busy} title={t('browser.stopAsk')}
                          onClick={() => { setStopAsk(run.runId) }}>
                          {busy ? t('browser.stopping') : t('browser.stop')}
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            )}
          {stopAsk !== undefined && (
            <p className={cn(base.note)} role="status">{t('browser.stopAsk')}</p>
          )}

          {runs.some(run => run.note !== undefined) && (
            <p className={cn(base.note)}>
              {runs.map(run => run.note).filter(note => note !== undefined).join(' ')}
            </p>
          )}

          {/* Named rather than implied: both files are the operator's, and the panel is
              not the only way in. */}
          {facts.configPath !== '' && (
            <p className={cn(base.note)} title={facts.configPath}>
              {t('browser.configPath', { path: facts.configPath })}
            </p>
          )}
          {facts.runsPath !== '' && (
            <p className={cn(base.note)} title={facts.runsPath}>
              {t('browser.runsPath', { path: facts.runsPath })}
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
