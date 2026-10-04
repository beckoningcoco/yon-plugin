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
import type {
  ClassIndexStatusView, HomeListPayload, HomeView, MetaIndexStatusView,
} from '../src/shared/types.ts'
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
function stubApi(
  rows: readonly HomeView[],
  statuses: Record<string, MetaIndexStatusView>,
  classStatuses: Record<string, ClassIndexStatusView> = {},
) {
  const calls: { id: string; fresh: boolean }[] = []
  /**
   * The class reads, kept apart from the metadata ones.
   *
   * Two recorders rather than one list: the cases below count "how many status reads
   * happened for this row", and merging the two kinds would make every count a sum of
   * two different things — the assertion that a render does not re-read would pass or
   * fail depending on the other walk's behaviour.
   */
  const classCalls: string[] = []
  /** A member no case here calls, present so the stand-in is the whole face. */
  const unused = <T,>(): T => vi.fn(async () => { throw new Error('this case does not call it') }) as T

  const api: HomeApi = {
    listHomes: vi.fn(async (): Promise<HomeListPayload> => ({
      homes: rows,
      configPath: 'C:/Users/99558/.dsh/yon-panel/home_config.json',
      complete: true,
      mirrorPath: 'C:/Users/99558/.claude/skills/ncc-asset-hawk/ncc_home_path.json',
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
    // Not `unused()`: the pane asks this one as soon as a row is selected, so a stub
    // that threw would fail every case here rather than the ones that ask for it.
    classStatus: vi.fn(async (id: string): Promise<ClassIndexStatusView> => {
      classCalls.push(id)
      return classStatuses[id] ?? { indexed: false, version: rows.find(row => row.id === id)?.version ?? '' }
    }),
    buildClass: unused(),
    removeClassIndex: unused(),
  }
  return { api, calls, classCalls }
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
  classStatuses: Record<string, ClassIndexStatusView> = {},
) {
  const { api, calls, classCalls } = stubApi(rows, statuses, classStatuses)
  const view = render(<Manager {...api} t={seatOver(zh)} onClose={vi.fn()} />)
  return { ...view, api, calls, classCalls }
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

  it('reads the class status once per selection, on its own account', async () => {
    // The class effect is a second effect with its own dependency chain — it reaches the
    // list through `watchClass` → `load` → `listHomes` — so the metadata case above
    // passing says nothing about this one. What it would look like if it went wrong is
    // the same 100% CPU spin the header of this component documents: the status arrives
    // as a new object, the render re-runs the effect, the effect asks again. Sixty
    // milliseconds is several turns of the timer queue with nothing to change.
    const { classCalls } = bench(undefined, undefined, {
      a: { indexed: true, version: '2111', builtAt: '2026-09-28T16:02:41.000Z',
        totalClasses: 143_908, bytes: 12_884_901 },
    })
    await waitFor(() => { expect(classCalls).toEqual(['a']) })

    await new Promise(resolve => setTimeout(resolve, 60))
    expect(classCalls).toEqual(['a'])
  })

  it('offers to build the class index, and says what building it buys', async () => {
    bench([home({ id: 'a' })], {}, {})

    // 没有索引那一句说的是"这一格是空的"，另一句说的是"这东西是什么"——后者只在还没有
    // 索引时出现，也只有在那一屏它是可读的：那正是使用者要不要按下按钮的那一刻。
    expect(await screen.findByText(at('home.indexNone'))).toBeTruthy()
    expect(screen.getByText(at('home.classBuild'))).toBeTruthy()
    expect(screen.getByText(at('home.classWhy'))).toBeTruthy()
    // A delete button for a file that is not there is a button that can only answer
    // "there was nothing to delete".
    expect(screen.queryByText(at('home.classRemove'))).toBeNull()
  })

  it('labels a stored class index with its own counts, and offers both acts', async () => {
    bench(undefined, undefined, {
      a: { indexed: true, version: '2111', builtAt: '2026-09-28T16:02:41.000Z',
        totalClasses: 143_908, bytes: 12_884_901 },
    })

    expect(await screen.findByText(/143908 个类/)).toBeTruthy()
    expect(screen.getByText(at('home.classRebuild'))).toBeTruthy()
    expect(screen.getByText(at('home.classRemove'))).toBeTruthy()
    // Already indexed, so the explanation of what an index is has no reader left.
    expect(screen.queryByText(at('home.classWhy'))).toBeNull()
  })

  it('keeps the verbs above the content, where no sticky rule can park them over the table', async () => {
    // A probed row, so the key-path table this case is about is actually on the page.
    bench([home({
      id: 'a',
      profile: {
        probedAt: '2026-09-29T03:08:00.000Z',
        shape: 'ncc-home',
        present: ['modules', 'ierp'],
        modules: 237,
        jars: 3517,
        capped: false,
        keys: [{ role: '模块根', rel: 'modules', exists: true }],
        warnings: [],
      },
    })])

    // The four verbs used to be the *last* child of the scrolling column, which is what
    // made the shared `.detailActions:last-child` rule pin them to the pane's foot:
    // measured, they then sat at offsetTop 487 in a 450px pane — outside it until you
    // scrolled, and covering up to 3 of the 11 key-path rows once you did. What this case
    // locks is the *order*, not the pixels: every verb comes before the blocks it acts on.
    // Move the row back to the bottom and this fails, whether or not anyone re-measures.
    const verb = await screen.findByRole('button', { name: at('home.probe') })
    for (const heading of [at('home.metaTitle'), at('home.keyPaths')]) {
      const block = screen.getByText(heading)
      expect(verb.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('folds where the registration lives instead of spending the list column on it', async () => {
    bench()
    await screen.findByText(at('home.metaTitle'))

    // Both paths used to sit under the list: measured 116px of a 450px column (25%), three
    // long paths wrapped into six ragged lines in the 196px of width that column has. They
    // are a fact about the registry and are read rarely, so they fold — and fold *closed*,
    // because the height was the entire complaint. The mirror *warning* stays outside this
    // element on purpose (a mirror that failed to write must be legible without unfolding);
    // that is a separate state and not what this case is about.
    const fold = document.querySelector('details')
    expect(fold).not.toBeNull()
    expect(fold!.open).toBe(false)
    expect(fold!.className).toMatch(/storageFold/)
    expect(fold!.textContent).toContain(at('home.configPath'))

    // …and it is not in the list column, which is the whole point of the move: that
    // column is 229px wide, so the same three paths there cost 116 of its 450px.
    const list = document.querySelector('[class*="listPane"]')
    expect(list).not.toBeNull()
    expect(list!.contains(fold)).toBe(false)
    expect(list!.textContent).not.toContain(at('home.configPath'))
  })

  it('keeps the class hooks the card face and the accent bars hang on', async () => {
    // The "make it less plain" pass is CSS plus four class names, and a class name
    // dropped in a refactor is invisible to everything else here: `tsc` sees a string
    // either way, no other case in this file reads these elements, and the preview
    // images are not asserted on. The numbers recorded for that pass in
    // docs/yon-panel-ui-design.md §一 are attached to *these* elements, so if the
    // hooks go the measurements quietly stop describing what ships.
    bench([home({
      id: 'a',
      profile: {
        probedAt: '2026-09-29T03:08:00.000Z',
        shape: 'ncc-home',
        present: ['modules', 'ierp'],
        modules: 237,
        jars: 3517,
        capped: false,
        keys: [{ role: '模块根', rel: 'modules', exists: true }],
        warnings: [],
      },
    }), home({ id: 'b' })])
    await screen.findByText(at('home.metaTitle'))

    // Two: the path/product/index grid, and the probe's reading. The card on one and
    // not the other is exactly the drift this catches.
    expect(document.querySelectorAll('[class*="card"]')).toHaveLength(2)
    // One: the tool row under the title. The form's own action row is the shared
    // sticky band and deliberately does not carry it.
    expect(document.querySelectorAll('[class*="verbRow"]')).toHaveLength(1)
    // Four: 元数据索引 and 类索引 (the two blocks that act), 探测结果 (the `.subTitle`)
    // and 关键路径. The index grid's own two rows are *not* accents — they are facts a
    // reader looks up, and the accent is what marks the blocks you press a button in.
    expect(document.querySelectorAll('[class*="accent"]')).toHaveLength(4)
    // Only the selected row, and it is the selected row.
    const marked = document.querySelectorAll('[class*="rowOn"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.getAttribute('data-key')).toBe(row('a').getAttribute('data-key'))
    expect(row('a').getAttribute('aria-selected')).toBe('true')
  })
})
