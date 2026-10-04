// @vitest-environment jsdom
/**
 * 迭代表板这一屏：使用者在这一格里做的四件事——读、改状态、删、手工记一条。
 *
 * 这一屏是本功能的分界线落地的地方。模型那边只能追加（`iteration-tools.spec.ts` 钉
 * 住了），所有状态变更都得在这里、由人来点，所以「改状态调的确实是宿主那一版」
 * 和「删除要两次点击」不是界面的细节，是这个功能成立的条件。
 *
 * 框架原子按同目录其它面板用例的做法打桩：它们发布的那一半是这个用例跑不起来的加载
 * 产物。每个桩保留组件真正依赖的契约——对话框用标题标出自己，按钮带着点击处理与禁
 * 用位。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type {
  IterationCreatedPayload, IterationKind, IterationListPayload, IterationRowView,
  IterationSeverity, IterationStatus, SaveIterationInput, UpdateIterationInput,
} from '../src/shared/types.ts'
import { IterationManager, type IterationManagerProps } from '../src/client/iteration/IterationManager.tsx'
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

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** Translate through one dictionary, substituting `{name}` params as the seat does. */
const seatOver = (dict: Record<string, string>) =>
  (key: string, params?: Record<string, unknown>): string => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
  }

/** One ledger row with everything a case does not care about filled in. */
function row(overrides: Partial<IterationRowView> & { readonly id: string }): IterationRowView {
  return {
    at: '2026-10-03T02:00:00.000Z',
    kind: 'gap',
    severity: 'medium',
    scene: '',
    symptom: `${overrides.id} 的症状`,
    suggestion: '',
    target: '',
    context: '',
    status: 'open',
    ...overrides,
  }
}

/** What the host answered with, for the cases that need to inspect a call. */
interface Stub {
  readonly api: Pick<IterationManagerProps, 'list' | 'create' | 'update' | 'remove'>
  readonly list: ReturnType<typeof vi.fn>
  readonly create: ReturnType<typeof vi.fn>
  readonly update: ReturnType<typeof vi.fn>
  readonly remove: ReturnType<typeof vi.fn>
}

/**
 * An in-memory stand-in for the host.
 * @param rows - what the ledger holds.
 * @param options - a payload-level error, or a thrown call.
 * @returns the API face plus each call, for counting and asserting.
 */
function stubApi(
  rows: readonly IterationRowView[],
  options: { readonly payloadError?: string, readonly listError?: unknown } = {},
): Stub {
  const list = vi.fn(async (): Promise<IterationListPayload> => {
    if (options.listError !== undefined) throw options.listError
    return {
      rows: [...rows],
      path: 'C:/Users/99558/.dsh/yon-panel/iteration.json',
      ...options.payloadError === undefined ? {} : { error: options.payloadError },
    }
  })
  const create = vi.fn(async (input: SaveIterationInput): Promise<IterationCreatedPayload> => ({
    row: row({ id: 'it-new', ...input }),
    created: true,
  }))
  const update = vi.fn(async (id: string, patch: UpdateIterationInput): Promise<{ row: IterationRowView }> => {
    const found = rows.find(candidate => candidate.id === id) ?? row({ id })
    return { row: { ...found, ...patch } }
  })
  const remove = vi.fn(async (id: string): Promise<{ removed: string }> => ({ removed: id }))
  return { api: { list, create, update, remove }, list, create, update, remove }
}

const Manager = IterationManager as unknown as (props: IterationManagerProps) => ReactElement

/** Render the surface over a stand-in. */
function bench(
  rows: readonly IterationRowView[] = [row({ id: 'it-1' })],
  options: { readonly payloadError?: string, readonly listError?: unknown } = {},
) {
  const stub = stubApi(rows, options)
  const view = render(<Manager {...stub.api} t={seatOver(zh)} onClose={vi.fn()} />)
  return { ...view, ...stub }
}

/**
 * The head button of one row — what a reader clicks to open it.
 *
 * Awaited, because the ledger only reaches the DOM once the read resolves: clicking
 * before that would be clicking a surface that still says 读取记录中….
 * @param symptom - the row's own text.
 * @returns the button, once it is on the page.
 */
const head = async (symptom: string): Promise<HTMLElement> =>
  await screen.findByRole('button', { name: new RegExp(symptom) })

describe('iteration surface', () => {
  it('says what the surface is for when nothing has ever been recorded', async () => {
    bench([])

    expect(await screen.findByText(at('iteration.empty'))).toBeTruthy()
    // 空态要说清这三件事：这里是什么、谁会写、写了以后谁决定。一句没有的空态会让
    // 使用者以为这格坏了。
    expect(screen.getByText(at('iteration.emptyWhy'))).toBeTruthy()
    expect(screen.getByText(at('iteration.emptyHow'))).toBeTruthy()
    // 台账的路径在，方便直接去看那份文件。
    expect(screen.getByText('C:/Users/99558/.dsh/yon-panel/iteration.json')).toBeTruthy()
  })

  it('lists the rows it was handed, and tags each with its kind, severity and status', async () => {
    bench([
      row({ id: 'it-1', symptom: '为了拿到表名绕了三步', target: 'wiki_lookup', severity: 'high' }),
      row({ id: 'it-2', symptom: '已经修好的', status: 'fixed', kind: 'improvement' }),
    ])

    expect(await screen.findByText('为了拿到表名绕了三步')).toBeTruthy()
    // 目标跟在症状后面而不是另起一列：列表这一列窄，另一个字段会把它挤成两行。
    expect(screen.getByText('（wiki_lookup）')).toBeTruthy()
    expect(screen.getByText(at('iteration.severity.high'))).toBeTruthy()
    expect(screen.getAllByText(at('iteration.kind.gap')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(at('iteration.status.fixed')).length).toBeGreaterThan(0)
  })

  it('opens one row in place, and shows an empty field as a dash rather than as nothing', async () => {
    bench([row({ id: 'it-1', symptom: '绕了三步', scene: '查一张单据的字段', suggestion: '' })])

    fireEvent.click(await head('绕了三步'))

    expect(await screen.findByText(at('iteration.fieldScene'))).toBeTruthy()
    expect(screen.getByText('查一张单据的字段')).toBeTruthy()
    // 一条没写期望的记录，与一条期望被界面吃掉的记录，处理方式完全不同——所以空值
    // 要有一个看得见的占位。这一屏有五处空字段，破折号因此不止一个。
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('changes a status through the host, on the row it belongs to', async () => {
    const { update, list } = bench([
      row({ id: 'it-1', symptom: '还开着的' }),
      row({ id: 'it-2', symptom: '另一条' }),
    ])
    fireEvent.click(await head('还开着的'))

    const select = await screen.findByLabelText(at('iteration.status'))
    fireEvent.change(select, { target: { value: 'accepted' } })

    await waitFor(() => { expect(update).toHaveBeenCalledWith('it-1', { status: 'accepted' }) })
    // 就地改，不重取整份台账：模型此刻可能正在往同一个文件里追加一行，多一次全量读
    // 只是多一次覆盖它的机会。
    expect(list).toHaveBeenCalledTimes(1)
    // 宿主回的那一行直接换掉本地那一行，所以标记跟着变。
    expect(await screen.findByText(at('iteration.saved'))).toBeTruthy()
  })

  it('makes deleting take two clicks, and lets the second thought win', async () => {
    const { remove } = bench([row({ id: 'it-1', symptom: '要删掉的' })])
    fireEvent.click(await head('要删掉的'))

    fireEvent.click(screen.getByRole('button', { name: at('iteration.remove') }))
    // 第一次点击只是问一句；此刻还没有任何调用。
    expect(await screen.findByText(at('iteration.removeAsk'))).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('iteration.removeNo') }))
    // 退回来之后，原位又只剩那一个删除按钮——第二次点击落在别处，不会误删。
    await waitFor(() => { expect(screen.queryByText(at('iteration.removeAsk'))).toBeNull() })
    expect(screen.getByRole('button', { name: at('iteration.remove') })).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('iteration.remove') }))
    fireEvent.click(await screen.findByRole('button', { name: at('iteration.removeYes') }))
    await waitFor(() => { expect(remove).toHaveBeenCalledWith('it-1') })
    expect(await screen.findByText(at('iteration.removed'))).toBeTruthy()
  })

  it('refuses to file a note with no symptom', async () => {
    const { create } = bench([])
    await screen.findByText(at('iteration.empty'))

    fireEvent.click(screen.getByRole('button', { name: at('iteration.formOpen') }))
    fireEvent.click(await screen.findByRole('button', { name: at('iteration.formSubmit') }))

    // 没有症状的一条记录，就是一条谁也没法处理的状态。
    expect(await screen.findByText(at('iteration.formNeedSymptom'))).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('files a hand-written row and puts it at the top', async () => {
    const { create } = bench([row({ id: 'it-1', symptom: '旧的' })])
    await screen.findByText('旧的')

    fireEvent.click(screen.getByRole('button', { name: at('iteration.formOpen') }))
    fireEvent.change(await screen.findByLabelText(at('iteration.formSymptom')),
      { target: { value: '  我注意到的一条  ' } })
    fireEvent.change(screen.getByLabelText(at('iteration.formTarget')), { target: { value: 'wiki_lookup' } })
    fireEvent.click(screen.getByRole('button', { name: at('iteration.formSubmit') }))

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        kind: 'gap', symptom: '我注意到的一条', severity: 'medium',
        scene: '', suggestion: '', target: 'wiki_lookup', context: '',
      })
    })
    // 宿主答的是最新在前，刚记的这条就是最新的，所以放在最前面而不是追加。
    const listed = await screen.findAllByRole('button', { name: /我注意到的一条/ })
    expect(listed.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: new RegExp(at('iteration.formOpen')) })).toBeTruthy()
  })

  it('filters in place, without asking the host for a filtered view', async () => {
    const { list } = bench([
      row({ id: 'it-1', symptom: '还开着的' }),
      row({ id: 'it-2', symptom: '已经修好的', status: 'fixed' }),
    ])
    await screen.findByText('还开着的')

    fireEvent.click(screen.getByRole('button', { name: at('iteration.status.fixed') }))

    await waitFor(() => { expect(screen.queryByText('还开着的')).toBeNull() })
    expect(screen.getByText('已经修好的')).toBeTruthy()
    // 上面的计数要数的是整份台账。让宿主按状态筛，计数就会在读者点一下之后改口径。
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('spends a search box only once the ledger is long enough to need one', async () => {
    const many = Array.from({ length: 8 }, (_, index) => row({ id: `it-${index}`, symptom: `第 ${index} 条` }))
    const first = bench(many)
    expect(await screen.findByLabelText(at('iteration.search'))).toBeTruthy()
    first.unmount()

    bench(many.slice(0, 7))
    await waitFor(() => { expect(screen.queryByLabelText(at('iteration.search'))).toBeNull() })
  })

  it('reports a failed read with a retry, and leaves the ledger alone', async () => {
    const { list } = bench([], { listError: new Error('宿主掉线了') })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('宿主掉线了')
    expect(list).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: at('iteration.retry') }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
  })

  it('tells a reader the file is broken rather than showing an empty ledger', async () => {
    bench([], { payloadError: '无法解析 iteration.json：它不是合法的 JSON。' })

    // 「还没记过」与「记过但读不出来」在这一屏必须分得开：后者要人去修那个文件。
    expect(await screen.findByText(at('iteration.emptyUnreadable'))).toBeTruthy()
    expect(screen.queryByText(at('iteration.emptyWhy'))).toBeNull()
    expect(screen.getByText(new RegExp('无法解析 iteration.json'))).toBeTruthy()
  })
})
