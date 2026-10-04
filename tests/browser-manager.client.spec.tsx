// @vitest-environment jsdom
/**
 * The browser surface driven through its injected API.
 *
 * ## What these cases are guarding
 *
 * Two things on this surface are unlike its seven siblings, and both are asserted here
 * rather than left to the preview images.
 *
 * **It saves before it starts.** 「启动」 writes the form and *then* launches with an empty
 * input. A launch that carried the form's values would leave the row holding the previous
 * port and profile, so the next start would come up somewhere else — and the panel would
 * have been showing one thing while the host remembered another. The case below pins the
 * order of the two calls and the emptiness of the second one's input.
 *
 * **It is the only surface here that ends a process.** Stopping is therefore two-step: the
 * first press asks, and only the second one calls the host. That is not decoration — the
 * case asserts that the first press sends nothing, and that a host which declined to act
 * is reported as a refusal rather than as a success.
 *
 * The face arrives as a spread, so the component must not depend on the object it is
 * given; one case re-renders with a fresh spread to say so (see the sibling installation
 * spec for what that failure mode looks like — it is a 100% CPU spin, not a red test).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type {
  BrowserListPayload, BrowserRunView, BrowserView, SaveBrowserInput,
  ScanBrowsersPayload, StopBrowserResult,
} from '../src/shared/types.ts'
import type { BrowserApi } from '../src/client/browser/api.ts'
import { BrowserManager, type BrowserManagerProps } from '../src/client/browser/BrowserManager.tsx'
import { zh } from '../src/client/locales.ts'
// The stubbed half above, so the copy case can assert on what actually reached it.
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, size: _size, icon: _icon, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...rest} />,
  Modal: ({ title, closeLabel, onClose, children }: Record<string, unknown>) => (
    <div role="dialog" aria-label={String(title)}>
      <button type="button" aria-label={String(closeLabel)} onClick={onClose as () => void} />
      {children as ReactElement}
    </div>
  ),
  writeClipboard: vi.fn(async () => true),
}))

afterEach(cleanup)

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** Translate through one dictionary, substituting `{name}` params as the seat does. */
const seatOver = (dict: Record<string, string>) =>
  (key: string, params?: Record<string, unknown>): string => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
  }

const PROFILE_ROOT = 'E:/gitproject/dsh-plugin-yon-panel/.browser-profile'

/** One registered browser with everything a case does not care about filled in. */
function browser(overrides: Partial<BrowserView> & { readonly id: string }): BrowserView {
  return {
    family: 'chromium',
    product: `Product ${overrides.id}`,
    path: `C:/Program Files/${overrides.id}/app.exe`,
    profileDir: `${PROFILE_ROOT}/${overrides.id}`,
    port: 9222,
    startUrl: '',
    pathExists: true,
    stale: false,
    logPath: `${PROFILE_ROOT}/${overrides.id}/browser-launch.log`,
    ...overrides,
  }
}

/** One instance this panel started. */
function run(overrides: Partial<BrowserRunView> & { readonly runId: string }): BrowserRunView {
  return {
    browserId: 'edge',
    label: 'Product edge',
    family: 'chromium',
    port: 9222,
    profileDir: `${PROFILE_ROOT}/edge`,
    startedAt: '2026-10-04T05:12:00.000Z',
    endpoint: 'http://127.0.0.1:9222/json/version',
    ready: true,
    alive: 'alive',
    ...overrides,
  }
}

/** What a read comes back with when a case does not say otherwise. */
function payload(
  rows: readonly BrowserView[],
  runs: readonly BrowserRunView[],
  options: StubOptions,
): BrowserListPayload {
  return {
    browsers: rows,
    runs,
    configPath: 'C:/Users/99558/.dsh/yon-panel/browser_config.json',
    runsPath: 'C:/Users/99558/.dsh/yon-panel/browser_runs.json',
    platform: options.platform ?? 'win32',
    scanSupported: options.scanSupported ?? true,
    scannedAt: '2026-10-04T05:00:00.000Z',
    complete: true,
    ...(options.note === undefined ? {} : { note: options.note }),
  }
}

/** What a case may vary about the host's answers. */
interface StubOptions {
  readonly browsers?: readonly BrowserView[]
  readonly runs?: readonly BrowserRunView[]
  /** Make the read itself fail, as a corrupt registration file does. */
  readonly listError?: Error
  /** What a launch comes back with; `ready` is the interesting member. */
  readonly launchRun?: BrowserRunView
  /** What a stop comes back with. */
  readonly stopResult?: StopBrowserResult
  readonly scan?: ScanBrowsersPayload
  /** The machine's name, as the read reports it. Defaults to the Windows case. */
  readonly platform?: string
  /** Whether this machine can be scanned at all. */
  readonly scanSupported?: boolean
  /** Whatever the host wants said about this reading; drawn verbatim. */
  readonly note?: string
}

/**
 * An in-memory stand-in for the host, recording every mutating call in order.
 *
 * `calls` is a single ordered list rather than counters, because the case that matters
 * most here is about the *sequence* of two calls, not about how many of each happened.
 */
function stubApi(options: StubOptions = {}) {
  const rows = options.browsers ?? [browser({ id: 'edge' })]
  const calls: string[] = []
  const args: { save?: SaveBrowserInput; launch?: unknown } = {}

  const api: BrowserApi = {
    listBrowsers: vi.fn(async (): Promise<BrowserListPayload> => {
      if (options.listError !== undefined) throw options.listError
      return payload(rows, options.runs ?? [], options)
    }),
    scanBrowsers: vi.fn(async (): Promise<ScanBrowsersPayload> => options.scan ?? {
      browsers: rows, added: [], updated: [], stale: [], scannedAt: '2026-10-04T05:30:00.000Z',
    }),
    saveBrowser: vi.fn(async (id: string, patch: SaveBrowserInput) => {
      calls.push('saveBrowser')
      args.save = patch
      const row = rows.find(entry => entry.id === id) ?? rows[0]!
      return {
        browser: {
          ...row,
          path: patch.path ?? row.path,
          profileDir: patch.profileDir ?? row.profileDir,
          port: patch.port ?? row.port,
          startUrl: patch.startUrl ?? row.startUrl,
        },
      }
    }),
    launchBrowser: vi.fn(async (_id: string, input: unknown) => {
      calls.push('launchBrowser')
      args.launch = input
      return { run: options.launchRun ?? run({ runId: 'r1' }) }
    }),
    stopBrowser: vi.fn(async (runId: string): Promise<StopBrowserResult> => {
      calls.push('stopBrowser')
      return options.stopResult ?? { runId, removed: true, stopped: true, method: 'cdp' }
    }),
  }
  return { api, calls, args }
}

const Manager = BrowserManager as unknown as (props: BrowserManagerProps) => ReactElement

/** The one status line the surface shows, as text. */
const statusText = (): string =>
  screen.queryAllByRole('status').map(node => node.textContent ?? '').join(' | ')

/** Render the surface over a fresh stand-in. */
function bench(options: StubOptions = {}) {
  const { api, calls, args } = stubApi(options)
  const t = seatOver(zh)
  const close = vi.fn()
  const view = render(<Manager {...api} t={t} onClose={close} />)
  return { ...view, api, calls, args, t, close }
}

describe('browser surface', () => {
  it('reads once on mount, and not again when the face is spread in anew', async () => {
    // `rerender` is spread out of the render result by `bench`, so this is the one case
    // that needs it named.
    const { api, rerender, t, close } = bench()
    await screen.findByRole('combobox')

    // The entry hands the surface a fresh `{ ...face }` on every one of its own renders,
    // so a dependency list holding the object rather than a member of it re-runs the read
    // each time — and the re-read sets state, which renders again: the spin the sibling
    // installation spec documents. Each `rerender` below is one such hand-over.
    for (let turn = 0; turn < 3; turn += 1) {
      rerender(<Manager {...api} t={t} onClose={close} />)
    }
    // Several turns of the timer queue with nothing to change, so a read started by any of
    // those renders has had every chance to land.
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(api.listBrowsers).toHaveBeenCalledTimes(1)
  })

  it('seeds the form from the row, port and profile directory included', async () => {
    bench({
      browsers: [browser({
        id: 'edge',
        product: 'Microsoft Edge',
        port: 9223,
        startUrl: 'http://localhost:3000',
      })],
    })

    const picker = await screen.findByRole('combobox')
    expect((picker as HTMLSelectElement).value).toBe('edge')
    // The remembered port is the whole reason the row keeps one: the form shows what the
    // next start will use, not a default that would silently override it.
    expect((screen.getByLabelText(at('browser.port')) as HTMLInputElement).value).toBe('9223')
    expect((screen.getByLabelText(at('browser.profileDir')) as HTMLInputElement).value)
      .toBe(`${PROFILE_ROOT}/edge`)
    expect((screen.getByLabelText(at('browser.startUrl')) as HTMLInputElement).value)
      .toBe('http://localhost:3000')
  })

  it('refuses a port that is not a number before it reaches the host', async () => {
    const { api, calls } = bench()
    await screen.findByRole('combobox')

    fireEvent.change(screen.getByLabelText(at('browser.port')), { target: { value: '9222abc' } })
    fireEvent.click(screen.getByRole('button', { name: at('browser.save') }))

    // Said as a field complaint, and nothing was sent: the host's refusal would come back
    // as a failure line as well, but by then the operator has already lost the field.
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(at('browser.portNotNumber')) })
    expect(calls).toEqual([])
    expect(api.saveBrowser).not.toHaveBeenCalled()
  })

  it('saves the form before it starts, and starts with nothing but what the row remembers', async () => {
    const { calls, args } = bench({
      browsers: [browser({ id: 'edge', port: 9223 })],
    })
    await screen.findByRole('combobox')

    fireEvent.change(screen.getByLabelText(at('browser.port')), { target: { value: '9333' } })
    fireEvent.click(screen.getByRole('button', { name: at('browser.start') }))

    await waitFor(() => { expect(calls).toEqual(['saveBrowser', 'launchBrowser']) })
    // The saved patch is the form, trimmed.
    expect(args.save).toEqual({
      path: 'C:/Program Files/edge/app.exe',
      profileDir: `${PROFILE_ROOT}/edge`,
      port: 9333,
      startUrl: '',
    })
    // …and the launch carries none of it. Sending the members here would make the launch
    // disagree with the row the moment the two drift, which is the thing the order avoids.
    expect(args.launch).toEqual({})
  })

  it('says a start whose port has not answered yet, with the log to read', async () => {
    const slow = run({ runId: 'r1', ready: false, alive: 'unknown', port: 9333 })
    const { api } = bench({ browsers: [browser({ id: 'edge' })], launchRun: slow })
    await screen.findByRole('combobox')

    fireEvent.click(screen.getByRole('button', { name: at('browser.start') }))

    // Not a failure: the process is up and the port may simply be slow. The line points at
    // the browser's own output rather than inventing a verdict.
    await waitFor(() => { expect(statusText()).toContain(`${PROFILE_ROOT}/edge/browser-launch.log`) })
    expect(api.launchBrowser).toHaveBeenCalledTimes(1)
  })

  it('names the endpoint of what is running, and copies it', async () => {
    const endpoint = 'http://127.0.0.1:9222/json/version'
    bench({ runs: [run({ runId: 'r1', endpoint })] })

    await screen.findByText(endpoint)
    fireEvent.click(screen.getByLabelText(at('browser.copy')))

    // The endpoint is the one fact this surface exists to hand over, so it is text on the
    // page and one press from the clipboard.
    await waitFor(() => { expect(writeClipboard).toHaveBeenCalledWith(endpoint) })
    await waitFor(() => { expect(screen.getByTitle(at('browser.copied'))).toBeTruthy() })
  })

  it('asks before it stops, and sends nothing on the first press', async () => {
    const { api } = bench({ runs: [run({ runId: 'r1' })] })
    await screen.findByText(at('browser.stop'))

    fireEvent.click(screen.getByRole('button', { name: at('browser.stop') }))

    // Ending the wrong process here is somebody's debugging session, so the first press is
    // a question and the question is on the page.
    expect(screen.getByRole('button', { name: at('browser.stopYes') })).toBeTruthy()
    expect(statusText()).toContain(at('browser.stopAsk'))
    expect(api.stopBrowser).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('browser.stopYes') }))
    await waitFor(() => { expect(api.stopBrowser).toHaveBeenCalledWith('r1') })
  })

  it('reports a stop the host declined to perform as a refusal, not as success', async () => {
    const note = '端口上那个进程已经不是本面板启动的浏览器了，没有动手。'
    bench({
      runs: [run({ runId: 'r1' })],
      stopResult: { runId: 'r1', removed: false, stopped: false, method: 'none', note },
    })
    await screen.findByText(at('browser.stop'))

    fireEvent.click(screen.getByRole('button', { name: at('browser.stop') }))
    fireEvent.click(screen.getByRole('button', { name: at('browser.stopYes') }))

    // The host's own words, verbatim: a guessed "stopped" here would leave the operator
    // believing a browser was closed while it still holds the port.
    await waitFor(() => { expect(statusText()).toContain(note) })
    expect(statusText()).not.toContain(at('browser.stopped'))
  })

  it('offers the re-scan from the empty state, where the hint tells the operator to press it', async () => {
    // The empty state is where a machine that scanned clean ends up, and its hint names
    // this button. Pinned as a *control on the page*, not as the string: the hint itself
    // contains 「重新扫描」, so a text check here would pass with no button at all.
    const { api } = bench({ browsers: [] })
    await screen.findByRole('combobox')

    fireEvent.click(screen.getByRole('button', { name: at('browser.rescan') }))
    await waitFor(() => { expect(api.scanBrowsers).toHaveBeenCalledTimes(1) })
    // and the same state does not offer what it cannot do
    expect(screen.queryByRole('button', { name: at('browser.start') })).toBeNull()
    expect(screen.queryByRole('button', { name: at('browser.save') })).toBeNull()
  })

  it('offers no re-scan where the scanner cannot run, and does not hint at the button either', async () => {
    const note = '自动扫描目前只支持 Windows；当前系统是 darwin。请在配置文件里手写浏览器路径。'
    const { api } = bench({
      browsers: [],
      platform: 'darwin',
      scanSupported: false,
      note,
    })
    await screen.findByRole('combobox')

    // The button is gone because pressing it could not find anything, and the empty
    // state's hint names that button — so it has to go with it. What is left is the
    // host's own sentence, which says what to do instead.
    expect(screen.queryByRole('button', { name: at('browser.rescan') })).toBeNull()
    expect(screen.queryByText(at('browser.emptyHint'))).toBeNull()
    expect(screen.getByText(note)).toBeTruthy()
    expect(api.scanBrowsers).not.toHaveBeenCalled()
  })

  it('lists and can stop a running instance with no registration selected', async () => {
    // What a corrupt `browser_config.json` — or any platform the scanner cannot serve —
    // leaves this surface in: no rows at all, while the ledger file still holds live
    // instances. The running list used to sit inside the row-selected branch, so exactly
    // the state where an abandoned browser most needs stopping showed nothing to stop.
    const endpoint = 'http://127.0.0.1:9222/json/version'
    const { api } = bench({ browsers: [], runs: [run({ runId: 'r1', endpoint })] })
    await screen.findByRole('combobox')

    // The address is how a person tells which instance this is, and the stop control is
    // the only way out of it; both have to be on the page with no row selected.
    expect(screen.getByText(endpoint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: at('browser.stop') }))
    fireEvent.click(screen.getByRole('button', { name: at('browser.stopYes') }))
    await waitFor(() => { expect(api.stopBrowser).toHaveBeenCalledWith('r1') })

    // and nothing offers to start a browser when there is none registered to start
    expect(screen.queryByRole('button', { name: at('browser.start') })).toBeNull()
    expect(screen.queryByRole('button', { name: at('browser.save') })).toBeNull()
  })

  it('cannot start a row whose path is gone', async () => {
    bench({ browsers: [browser({ id: 'edge', pathExists: false, stale: true })] })
    await screen.findByRole('combobox')

    // The row keeps its registration — deleting it would orphan the profile directory —
    // and the surface says why it cannot be used rather than failing at spawn time.
    await screen.findByText(at('browser.pathMissing'))
    expect((screen.getByRole('button', { name: at('browser.start') }) as HTMLButtonElement).disabled)
      .toBe(true)
  })

  it('says a read that failed and offers the retry', async () => {
    const { api } = bench({ listError: new Error('browser_config.json 读不出来') })
    await screen.findByRole('alert')

    expect(screen.getByRole('alert').textContent).toContain('browser_config.json 读不出来')
    expect(api.listBrowsers).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: at('browser.retry') }))
    await waitFor(() => { expect(api.listBrowsers).toHaveBeenCalledTimes(2) })
  })

  it('walks the machine again on re-scan and reports what changed in one line', async () => {
    const { api } = bench({
      browsers: [browser({ id: 'edge' })],
      scan: {
        browsers: [browser({ id: 'edge' }), browser({ id: 'chrome' })],
        added: ['chrome'], updated: [], stale: [], scannedAt: '2026-10-04T06:00:00.000Z',
      },
    })
    await screen.findByRole('combobox')

    fireEvent.click(screen.getByRole('button', { name: at('browser.rescan') }))

    await waitFor(() => { expect(api.scanBrowsers).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(statusText()).toContain('chrome') })
  })
})
