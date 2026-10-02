// @vitest-environment jsdom
/**
 * The installation surface driven through its injected API, with the metadata block
 * (this batch's addition) in focus.
 *
 * ## What the first case is really guarding
 *
 * The face arrives as a spread, so `HomeManager` destructures a **new** API object on
 * every render — which is why the members it depends on are taken by name and only
 * those appear in dependency lists. When the whole object was listed instead, the
 * status effect re-ran on every render; it stores a freshly-built status object each
 * time, so it re-rendered, ran again, and never yielded. The pane froze at 100% CPU and
 * the timer queue starved — no poll ticked, no DOM settle, and the preview suite stopped
 * mid-file with no output at all. Hence the two assertions below: the read happens once,
 * and it is still once after the timer queue has been given several turns.
 *
 * The failure mode of that case is worth knowing before editing it: with the loop back,
 * the `waitFor` below never gets a timer and the case **hangs** rather than failing red.
 *
 * The framework atoms are stubbed, as the sibling surface specs do: their published half
 * is a loader artifact this suite cannot execute. Each stub keeps the contract the
 * surface relies on — a dialog renders its children labelled by its title, a button
 * carries its click handler and its disabled flag.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { HomeListPayload, HomeView, MetaIndexStatusView } from '../src/shared/types.ts'
import type { HomeApi } from '../src/client/home/api.ts'
import { HomeManager, type HomeManagerProps } from '../src/client/home/HomeManager.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, size: _size, icon: _icon, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...rest} />,
  Modal: ({ title, closeLabel, onClose, children, footer }: Record<string, unknown>) => (
    <div role="dialog" aria-label={String(title)}>
      <button type="button" aria-label={String(closeLabel)} onClick={onClose as () => void} />
      {children as ReactElement}
      {footer as ReactElement}
    </div>
  ),
  writeClipboard: vi.fn(async () => true),
}))

afterEach(cleanup)

// jsdom implements no scrolling, and the surface scrolls the selected row into view.
Element.prototype.scrollIntoView = () => {}

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** Translate through one dictionary, substituting `{name}` params as the seat does. */
const seatOver = (dict: Record<string, string>) =>
  (key: string, params?: Record<string, unknown>): string => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
  }

/** One registered Home with everything a case does not care about filled in. */
function home(overrides: Partial<HomeView> & { readonly id: string }): HomeView {
  return {
    label: overrides.id.toUpperCase(),
    path: `E:/NCProject/NCC/${overrides.id}/home`,
    product: 'ncc',
    version: '2111',
    isDefault: false,
    ready: true,
    ...overrides,
  } as HomeView
}

/** A stored index with the two numbers a case distinguishes rows by. */
function indexed(version: string, entities: number): MetaIndexStatusView {
  return {
    indexed: true,
    version,
    builtAt: '2026-09-30T07:42:18.000Z',
    counts: { files: 3600, entities, enums: 2947, fields: 217_140, enumItems: 11_916 },
    bytes: 8_332_000,
    sourceHomes: [`E:/NCProject/NCC/${version}/home`],
    freshness: { state: 'fresh', changed: 0, added: 0, removed: 0 },
  }
}

/** An in-memory stand-in for the host, recording every status read. */
function stubApi(rows: readonly HomeView[], statuses: Record<string, MetaIndexStatusView>) {
  const calls: { id: string; fresh: boolean }[] = []
  /** A member no case here calls, present so the stand-in is the whole face. */
  const unused = <T,>(): T => vi.fn(async () => { throw new Error('this case does not call it') }) as T

  const api: HomeApi = {
    listHomes: vi.fn(async (): Promise<HomeListPayload> => ({
      homes: rows,
      configPath: 'C:/Users/99558/.dsh/yon-panel/home_config.json',
      complete: true,
      mirrorPath: 'C:/Users/99558/.claude/skills/yon-ncc-dev/ncc_home_path.json',
    })),
    saveHome: unused(),
    removeHome: unused(),
    probeHome: unused(),
    setDefaultHome: unused(),
    buildMeta: unused(),
    pickPath: unused(),
    metaStatus: vi.fn(async (id: string, fresh: boolean): Promise<MetaIndexStatusView> => {
      calls.push({ id, fresh })
      return statuses[id] ?? { indexed: false, version: rows.find(row => row.id === id)?.version ?? '' }
    }),
  }
  return { api, calls }
}

const Manager = HomeManager as unknown as (props: HomeManagerProps) => ReactElement

/** The list row for one registration. */
const row = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-key="${id}"]`)
  if (found === null) throw new Error(`no row for ${id}`)
  return found
}

/** Render the surface over a fresh stand-in. */
function bench(
  rows: readonly HomeView[] = [home({ id: 'a' })],
  statuses: Record<string, MetaIndexStatusView> = { a: indexed('2111', 5573) },
) {
  const { api, calls } = stubApi(rows, statuses)
  const view = render(<Manager {...api} t={seatOver(zh)} onClose={vi.fn()} />)
  return { ...view, api, calls }
}

describe('home surface', () => {
  it('reads the selected row\'s index status once, and not again on every render', async () => {
    const { api, calls } = bench()

    // The pane selects the first row as soon as the list arrives, and asks with
    // `fresh` — opening the pane is the one moment the fingerprint walk is worth paying.
    await waitFor(() => { expect(calls).toEqual([{ id: 'a', fresh: true }]) })
    expect(api.listHomes).toHaveBeenCalledTimes(1)

    // Several turns of the timer queue with nothing to change. An effect that depends on
    // the injected object instead of on a member of it asks again every render, and the
    // render it causes asks again — unboundedly, and without ever letting a timer run.
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(calls).toEqual([{ id: 'a', fresh: true }])
    expect(api.listHomes).toHaveBeenCalledTimes(1)
  })

  it('re-reads only the row selected now, and never prints one row\'s numbers under another', async () => {
    const { calls } = bench(
      [home({ id: 'a' }), home({ id: 'b', version: '2312' })],
      { a: indexed('2111', 5573), b: indexed('2312', 5561) },
    )
    await waitFor(() => { expect(calls).toHaveLength(1) })
    expect(screen.getByText(/5573 个实体/)).toBeTruthy()

    fireEvent.click(row('b'))

    // The second row's own read, and only that one: a status merged across rows would
    // describe one installation with another installation's numbers.
    await waitFor(() => { expect(calls).toEqual([{ id: 'a', fresh: true }, { id: 'b', fresh: true }]) })
    expect(await screen.findByText(/5561 个实体/)).toBeTruthy()
    expect(screen.queryByText(/5573 个实体/)).toBeNull()
  })

  it('keeps a row whose directory is gone, with the path needed to fix it', async () => {
    bench([home({
      id: 'old',
      path: 'F:/NCProject/NCC/old/home',
      version: '2105',
      ready: false,
      profile: {
        probedAt: '2026-08-14T07:31:55.000Z',
        shape: 'not-found',
        present: [],
        modules: 0,
        jars: 0,
        capped: false,
        keys: [],
        warnings: ['确认它存在、且运行 NEURON 的账号有权访问。'],
      },
    })])

    // A registration is a real thing the operator wrote down, so a path that no longer
    // reads is dimmed rather than dropped. The list mark is styling — the row carries no
    // text for it — so this is the class, and the pane says it in words below.
    await waitFor(() => { expect(row('old').className).toMatch(/rowNotReady/) })
    expect(screen.getByText(at('home.notReady'))).toBeTruthy()
    // The path is the one fact needed to repair it, so a row that cannot be probed still
    // prints it.
    expect(screen.getByText('F:/NCProject/NCC/old/home')).toBeTruthy()
    expect(screen.getAllByText(at('home.shape.not-found')).length).toBeGreaterThan(0)
  })

  it('offers to build the index for a version that has none', async () => {
    bench([home({ id: 'a' })], {})

    // `metaNone` says what the absence costs, and the button is the only way out of it.
    expect(await screen.findByText(at('home.metaNone'))).toBeTruthy()
    expect(screen.getByText(at('home.metaBuild'))).toBeTruthy()
  })

  it('labels a stored index with its counts, and offers the rebuild', async () => {
    bench()

    expect(await screen.findByText(at('home.metaFresh'))).toBeTruthy()
    expect(screen.getByText(/5573 个实体 · 217140 个字段 · 2947 个枚举/)).toBeTruthy()
    expect(screen.getByText(at('home.metaRebuild'))).toBeTruthy()
    // Where the numbers came from, so an index built from another installation of the
    // same version is visible as exactly that. The path is its own element (`.mono`) so
    // that it wraps instead of clipping, which is why this is not a single lookup.
    expect(screen.getAllByText(/E:\/NCProject\/NCC\/2111\/home/).length).toBeGreaterThan(0)
  })
})
