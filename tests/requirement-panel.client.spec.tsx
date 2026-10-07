// @vitest-environment jsdom
/**
 * 需求条目这一屏：使用者在这一格里做的四件事——建条目、改状态、补标注、废掉或删掉。
 *
 * 这一屏与旁边两屏的契约有三处是反过来的，所以下面每一处都单独钉住：
 *
 * 1. **过滤走宿主**（`?project=` / `?status=`）。迭代那屏自己在前端筛，因为它上面那行
 *    数的是整份台账；这一屏的「共 N 条」数的是眼前这一屏，被筛掉的本来就不该被数进来。
 * 2. **一次写动作之后两处都重读**。改状态可能让这一行离开当前的状态筛选，所以台账那一遍
 *    是正确性要求，不是保险；详情那一遍是就地换掉，不让正文闪。
 * 3. **读的是带删除线的那一份**（`history: true`）。磁盘上只有一份 `entry.md`，模型读的是
 *    剥掉删除线的版本，人读的是留着它的版本——这一屏是人，所以「改过什么」要看得见。
 *
 * 框架原子按同目录其它面板用例的做法打桩：它们发布的那一半是这个用例跑不起来的加载
 * 产物。每个桩保留组件真正依赖的契约——对话框用标题标出自己，按钮带着点击处理与禁用位，
 * `MarkdownText` 把文本原样画出来（这一屏不测 markdown 渲染本身，只测哪一份文本被交给它）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import type {
  ProjectSummary, RequirementCreated, RequirementDir, RequirementFile, RequirementFileImport,
  RequirementFileList, RequirementFileRead, RequirementListPayload, RequirementStatus,
  RequirementSummary, RequirementView,
} from '../src/shared/types.ts'
import { REQUIREMENT_DIRS } from '../src/shared/types.ts'
import { RequirementManager, type RequirementManagerProps } from '../src/client/requirement/RequirementManager.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, size: _size, icon: _icon, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...rest} />,
  MarkdownText: ({ text }: { readonly text: string }) => <span>{text}</span>,
  Modal: ({ title, closeLabel, onClose, children }: Record<string, unknown>) => (
    <div role="dialog" aria-label={String(title)}>
      <button type="button" aria-label={String(closeLabel)} onClick={onClose as () => void} />
      {children as ReactElement}
    </div>
  ),
  writeClipboard: vi.fn(async () => true),
}))

import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

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

/** 库根，这个用例里到处都要断言它。 */
const ROOT = 'C:/Users/99558/.dsh/yon-panel/requirements'

/**
 * 按 id 取一个控件。
 *
 * 新建表单里的「项目」与顶上那个选择器叫同一个名字，按标签取会一次撞上两个——而那两个
 * 是两回事（一个是筛选，一个是归属），所以这里按 id 取，不按标签取。
 * @param id - the element id.
 * @returns the element.
 */
const control = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (found === null) throw new Error('控件不在页面上：' + id)
  return found
}

/** One ledger row with everything a case does not care about filled in. */
function row(overrides: Partial<RequirementSummary> & { readonly id: string }): RequirementSummary {
  return {
    projectId: 'prj-1',
    name: overrides.id,
    status: 'proposed',
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    file: overrides.id + '/entry.md',
    ...overrides,
  }
}

/** 同一条读全时的样子；默认那三个读者字段都在（面板取的就是 `history: true` 那一份）。 */
function view(summary: RequirementSummary, overrides: Partial<RequirementView> = {}): RequirementView {
  return {
    ...summary,
    body: '',
    raw: '',
    prose: '',
    notes: [],
    ...overrides,
  }
}

/** 一个附件，宿主描述它的那份形状。 */
function attachment(dir: RequirementDir, name: string, overrides: Partial<RequirementFile> = {}): RequirementFile {
  return {
    dir,
    name,
    file: `rq-1/${dir}/${name}`,
    bytes: 1234,
    modifiedAt: '2026-08-03T02:00:00.000Z',
    readable: true,
    ...overrides,
  }
}

/** 条目目录的绝对路径，附件那一块复制出来的路径要从它拼。 */
const ENTRY_DIR = 'C:/Users/99558/.dsh/yon-panel/requirements/rq-1'

/**
 * 三个目录一起给。
 *
 * **一个都不能少**：面板按 `REQUIREMENT_DIRS` 画那三格，少给一个目录就会让那一格显示
 * 「这个目录是空的」——而它可能是「这个目录没读到」。宿主那边保证三个都在（空目录也
 * 在），这一份假数据也照它来。
 */
function filesPayload(
  groups: Partial<Record<RequirementDir, readonly RequirementFile[]>> = {},
): RequirementFileList {
  return {
    id: 'rq-1',
    entry: '接口对接',
    dir: ENTRY_DIR,
    groups: REQUIREMENT_DIRS.map(dir => {
      const list = groups[dir] ?? []
      return { dir, files: [...list], bytes: list.reduce((sum, item) => sum + item.bytes, 0) }
    }),
  }
}

/** One project row, for the picker. */
function project(projectId: string, name: string): ProjectSummary {
  return {
    projectId,
    name,
    code: '',
    status: 'active',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    fieldCount: 0,
  }
}

/** What the host answered with, for the cases that need to inspect a call. */
interface Stub {
  readonly api: Pick<
    RequirementManagerProps,
    | 'list' | 'read' | 'create' | 'annotate' | 'update' | 'archive' | 'remove'
    | 'fileList' | 'fileRead' | 'importFile' | 'removeFile' | 'listProjects'
  >
  readonly list: ReturnType<typeof vi.fn>
  readonly read: ReturnType<typeof vi.fn>
  readonly create: ReturnType<typeof vi.fn>
  readonly annotate: ReturnType<typeof vi.fn>
  readonly update: ReturnType<typeof vi.fn>
  readonly archive: ReturnType<typeof vi.fn>
  readonly remove: ReturnType<typeof vi.fn>
  readonly fileList: ReturnType<typeof vi.fn>
  readonly fileRead: ReturnType<typeof vi.fn>
  readonly importFile: ReturnType<typeof vi.fn>
  readonly removeFile: ReturnType<typeof vi.fn>
  readonly listProjects: ReturnType<typeof vi.fn>
}

/** What a case can make the stand-in do. */
interface Options {
  readonly root?: string
  readonly unreadable?: readonly string[]
  /** 台账在、但读不出来（`payload.error`）。 */
  readonly payloadError?: string
  /** 读台账这一次调用本身失败。 */
  readonly listError?: unknown
  /** 读一条这一次调用本身失败。 */
  readonly readError?: unknown
  /** 读全时额外给的东西——正文与追溯那两段就在这里给。 */
  readonly detail?: Partial<RequirementView>
  readonly projects?: readonly ProjectSummary[]
  readonly projectsError?: unknown
  /** 三个目录里有什么；不给就是三个空目录。 */
  readonly files?: RequirementFileList
  /** 读附件清单这一次调用本身失败。 */
  readonly filesError?: unknown
  /** 读一个附件回什么。不给就是一段空文本（「它读不出文本」那一路）。 */
  readonly fileReadAnswer?: RequirementFileRead
  /** 归档回什么。不给就是「文件名照原样存下」；给了就走撞名那一支。 */
  readonly importAnswer?: RequirementFileImport
  readonly importError?: unknown
}

/**
 * An in-memory stand-in for the host.
 * @param rows - what the ledger holds.
 * @param options - see {@link Options}.
 * @returns the API face plus each call, for counting and asserting.
 */
function stubApi(rows: readonly RequirementSummary[], options: Options = {}): Stub {
  const root = options.root ?? ROOT
  const list = vi.fn(async (): Promise<RequirementListPayload> => {
    if (options.listError !== undefined) throw options.listError
    return {
      rows: [...rows],
      root,
      unreadable: [...options.unreadable ?? []],
      ...options.payloadError === undefined ? {} : { error: options.payloadError },
    }
  })
  const read = vi.fn(async (id: string): Promise<RequirementView> => {
    if (options.readError !== undefined) throw options.readError
    const found = rows.find(candidate => candidate.id === id) ?? row({ id })
    return view(found, options.detail)
  })
  const create = vi.fn(async (input: { readonly projectId: string, readonly name: string, readonly body?: string }):
  Promise<RequirementCreated> => ({
    created: true,
    requirement: view(row({ id: 'rq-new', projectId: input.projectId, name: input.name })),
  }))
  const annotate = vi.fn(async (id: string): Promise<RequirementView> => view(row({ id })))
  const update = vi.fn(async (id: string, patch: { readonly status?: RequirementStatus }): Promise<RequirementView> => {
    const found = rows.find(candidate => candidate.id === id) ?? row({ id })
    return view({ ...found, ...patch })
  })
  const archive = vi.fn(async (id: string): Promise<RequirementView> =>
    view(row({ id, status: 'dropped' })))
  const remove = vi.fn(async (id: string): Promise<{ readonly id: string, readonly name: string, readonly path: string }> =>
    ({ id, name: id, path: id }))
  const listProjects = vi.fn(async (): Promise<readonly ProjectSummary[]> => {
    if (options.projectsError !== undefined) throw options.projectsError
    return [...options.projects ?? [project('prj-1', '华科'), project('prj-2', '天九')]]
  })
  const fileList = vi.fn(async (): Promise<RequirementFileList> => {
    if (options.filesError !== undefined) throw options.filesError
    return options.files ?? filesPayload()
  })
  const fileRead = vi.fn(async (): Promise<RequirementFileRead> => options.fileReadAnswer ?? {
    file: attachment('user', 'a.txt'),
    text: '',
    encoding: '',
    truncated: false,
  })
  const importFile = vi.fn(async (
    _id: string,
    dir: RequirementDir,
    picked: File,
  ): Promise<RequirementFileImport> => {
    if (options.importError !== undefined) throw options.importError
    return options.importAnswer ?? { entry: '接口对接', file: attachment(dir, picked.name) }
  })
  const removeFile = vi.fn(async (id: string, dir: RequirementDir, name: string) => ({
    id, entry: '接口对接', file: attachment(dir, name),
  }))
  return {
    api: {
      list, read, create, annotate, update, archive, remove,
      fileList, fileRead, importFile, removeFile, listProjects,
    },
    list, read, create, annotate, update, archive, remove,
    fileList, fileRead, importFile, removeFile, listProjects,
  }
}

const Manager = RequirementManager as unknown as (props: RequirementManagerProps) => ReactElement

/** Render the surface over a stand-in. */
function bench(
  rows: readonly RequirementSummary[] = [row({ id: 'rq-1', name: '接口对接' })],
  options: Options = {},
) {
  const stub = stubApi(rows, options)
  const view0 = render(<Manager {...stub.api} t={seatOver(zh)} onClose={vi.fn()} />)
  return { ...view0, ...stub }
}

/**
 * The head button of one row — what a reader clicks to open it.
 *
 * Awaited, because the ledger only reaches the DOM once the read resolves: clicking
 * before that would be clicking a surface that still says 正在读需求条目….
 * @param name - the row's own text.
 * @returns the button, once it is on the page.
 */
const head = async (name: string): Promise<HTMLElement> =>
  await screen.findByRole('button', { name: new RegExp(name) })

/**
 * 打开一条，停在详情上。
 *
 * 四件事里有三件只在详情里做得到，所以这里把它抽出来；`read` 的断言留给单个用例。
 * @param name - the row's own text.
 * @returns the button that opened it.
 */
const open = async (name: string): Promise<HTMLElement> => {
  const trigger = await head(name)
  fireEvent.click(trigger)
  await screen.findByRole('button', { name: new RegExp(at('requirement.back')) })
  return trigger
}

/**
 * 附件那一块的文件夹开关。
 *
 * 按目录名取而不是按位置：三格的顺序来自 `REQUIREMENT_DIRS`，按位置写就等于把顺序也钉进
 * 用例里，而顺序不是这一条要钉的东西。名字是 `user/` 这种形状，目录名本身不翻译。
 * @param dir - the folder.
 * @returns the chip.
 */
const chip = (dir: RequirementDir): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^${dir}/`) })

describe('requirement surface', () => {
  it('says what the surface is for when nothing has ever been recorded', async () => {
    bench([])

    expect(await screen.findByText(at('requirement.empty'))).toBeTruthy()
    // 空态要说清这三件事：这里是什么、谁会写、写了以后谁决定。一句没有的空态会让
    // 使用者以为这格坏了。
    expect(screen.getByText(at('requirement.emptyWhy'))).toBeTruthy()
    expect(screen.getByText(at('requirement.emptyHow'))).toBeTruthy()
    // 计数与库路径在，方便当场核对，也方便直接去看那个目录。
    expect(screen.getByText(at('requirement.count').replace('{count}', '0'))).toBeTruthy()
    expect(screen.getByText(at('requirement.rootAt').replace('{path}', ROOT))).toBeTruthy()
  })

  it('lists the rows it was handed, each with its name and its status', async () => {
    bench([
      row({ id: 'rq-1', name: '接口对接', status: 'working' }),
      row({ id: 'rq-2', name: '报表上卷', status: 'done' }),
    ])

    // 状态是这一行唯一需要人一眼看出来的字段，所以它与名称同行而不是另起一列。断言落在那
    // 一行里面：顶上那个状态筛选器把六个状态名各写了一遍，整页找「开发中」会撞上它。
    const working = await head('接口对接')
    expect(within(working).getByText(at('requirement.status.working'))).toBeTruthy()
    const done = await head('报表上卷')
    expect(within(done).getByText(at('requirement.status.done'))).toBeTruthy()
  })

  it('filters through the host, because the count on this screen counts this screen', async () => {
    const { list } = bench([])
    await screen.findByText(at('requirement.empty'))
    expect(list).toHaveBeenCalledWith({})

    fireEvent.change(screen.getByLabelText(at('requirement.project')), { target: { value: 'prj-2' } })
    await waitFor(() => { expect(list).toHaveBeenCalledWith({ projectId: 'prj-2' }) })

    fireEvent.change(screen.getByLabelText(at('requirement.status')), { target: { value: 'done' } })
    await waitFor(() => { expect(list).toHaveBeenCalledWith({ projectId: 'prj-2', status: 'done' }) })

    // 退回「全部」要把筛掉的参数去掉，而不是送一个空串：宿主那边的口径是「没这个参数
    // 就是不筛」，送空串会变成「筛一个叫空串的项目」。
    fireEvent.change(screen.getByLabelText(at('requirement.project')), { target: { value: '' } })
    await waitFor(() => { expect(list).toHaveBeenCalledWith({ status: 'done' }) })
  })

  it('opens one entry as history, and draws the body and the trace as two blocks', async () => {
    const { read } = bench([row({ id: 'rq-1', name: '接口对接', status: 'working' })], {
      detail: {
        // 正文与追溯是宿主切好的两份，`body` 是它们拼起来的那一份（还带着标注标题）。
        prose: '要接三个接口。',
        body: '要接三个接口。\n\n## 标注\n\n2026-10-05 ~~旧说法~~',
        notes: ['2026-10-05 ~~旧说法~~', '2026-10-06 改成三个'],
      },
    })
    await open('接口对接')

    // 人是读者，所以取带删除线的那一份——「一眼看出改过什么」正是这一屏存在的理由。
    expect(read).toHaveBeenCalledWith('rq-1', { history: true })
    expect(await screen.findByText('要接三个接口。')).toBeTruthy()
    expect(screen.getByText('2026-10-05 ~~旧说法~~')).toBeTruthy()
    expect(screen.getByText('2026-10-06 改成三个')).toBeTruthy()
    // 正文那块画的是 `prose`，不是 `body`：`body` 里已经带着标注那一节，画它等于把追溯
    // 一块内容渲染两遍（一遍在正文里、一遍在追溯里），而标注标题本身从来不该露脸。
    expect(screen.queryByText(/## 标注/)).toBeNull()
  })

  it('folds the trace away on a click, and counts its notes next to the heading', async () => {
    bench([row({ id: 'rq-1', name: '接口对接' })], {
      detail: { notes: ['2026-10-05 第一段', '2026-10-06 第二段'] },
    })
    await open('接口对接')

    // 段数与最近一次改动写在标题旁边：折起来之后，读者仍要知道里面有几段、是什么时候的。
    expect(screen.getByText('（2 段 · 最近 2026-10-05）')).toBeTruthy()
    expect(screen.getByText('2026-10-05 第一段')).toBeTruthy()

    const toggle = screen.getByRole('button', { name: new RegExp(at('requirement.trace')) })
    fireEvent.click(toggle)
    await waitFor(() => { expect(screen.queryByText('2026-10-05 第一段')).toBeNull() })
    // 折起来只藏那几段，标题与段数留着——否则读者没法知道里面还有东西。
    expect(screen.getByRole('button', { name: new RegExp(at('requirement.trace')) })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(at('requirement.trace')) }))
    expect(await screen.findByText('2026-10-05 第一段')).toBeTruthy()
  })

  it('changes a status through the host, refreshing both the ledger and the entry', async () => {
    const { update, list, read } = bench([row({ id: 'rq-1', name: '接口对接', status: 'working' })])
    await open('接口对接')
    expect(list).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText(at('requirement.status')), { target: { value: 'done' } })

    await waitFor(() => { expect(update).toHaveBeenCalledWith('rq-1', { status: 'done' }) })
    // 台账那一遍是必须的，不是保险：改状态可能让这一行离开当前的状态筛选，只改本地那一行
    // 就会在屏幕上留下一行不该在这的。这一点与迭代表板正好相反。
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    // 详情那一遍也在，但它是原地换掉，不退回列表、也不把正文清空。
    await waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
    expect(screen.queryByText(at('requirement.loadingEntry'))).toBeNull()
    expect(await screen.findByText(at('requirement.saved'))).toBeTruthy()
  })

  it('refuses an empty note, and appends a real one through the host', async () => {
    const { annotate } = bench([row({ id: 'rq-1', name: '接口对接' })])
    await open('接口对接')

    const submit = screen.getByRole('button', { name: at('requirement.noteSubmit') })
    fireEvent.click(submit)
    // 空标注会让下一个人看到一行没有内容的痕迹，等于污染这份台账。
    expect(await screen.findByText(at('requirement.noteEmpty'))).toBeTruthy()
    expect(annotate).not.toHaveBeenCalled()

    fireEvent.change(control('yon-rq-note'), { target: { value: '  还要支持退货  ' } })
    fireEvent.click(screen.getByRole('button', { name: at('requirement.noteSubmit') }))

    // 前后空白由这一屏剪掉：宿主把这段话连日期一起写进 md，带进去的空格会一路留着。
    await waitFor(() => { expect(annotate).toHaveBeenCalledWith('rq-1', '还要支持退货') })
    expect(await screen.findByText(at('requirement.annotated'))).toBeTruthy()
  })

  it('makes dropping take two clicks, and lets the second thought win', async () => {
    const { archive } = bench([row({ id: 'rq-1', name: '接口对接' })])
    await open('接口对接')

    fireEvent.click(screen.getByRole('button', { name: at('requirement.archive') }))
    // 第一次点击只是问一句；此刻还没有任何调用。
    expect(await screen.findByText(at('requirement.archiveAsk'))).toBeTruthy()
    expect(archive).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('requirement.archiveNo') }))
    await waitFor(() => { expect(screen.queryByText(at('requirement.archiveAsk'))).toBeNull() })
    expect(screen.getByRole('button', { name: at('requirement.archive') })).toBeTruthy()
    expect(archive).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('requirement.archive') }))
    fireEvent.click(await screen.findByRole('button', { name: at('requirement.archiveYes') }))
    await waitFor(() => { expect(archive).toHaveBeenCalledWith('rq-1') })
    expect(await screen.findByText(at('requirement.archived'))).toBeTruthy()
  })

  it('makes deleting take two clicks, and goes back to the list afterwards', async () => {
    const { remove, list } = bench([row({ id: 'rq-1', name: '接口对接' })])
    await open('接口对接')

    fireEvent.click(screen.getByRole('button', { name: at('requirement.remove') }))
    // 真删连目录一起没，所以这一问必须落在这里、必须两步。
    expect(await screen.findByText(at('requirement.removeAsk'))).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('requirement.removeNo') }))
    await waitFor(() => { expect(screen.queryByText(at('requirement.removeAsk'))).toBeNull() })
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: at('requirement.remove') }))
    fireEvent.click(await screen.findByRole('button', { name: at('requirement.removeYes') }))

    await waitFor(() => { expect(remove).toHaveBeenCalledWith('rq-1') })
    // 删完停在详情上等于停在一个已经不存在的条目上，所以先退回列表再刷。
    expect(await screen.findByRole('button', { name: at('requirement.new') })).toBeTruthy()
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(at('requirement.removed'))).toBeTruthy()
  })

  it('reports a failed read with a retry, and leaves the ledger alone', async () => {
    const { list } = bench([], { listError: new Error('宿主掉线了') })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('宿主掉线了')
    expect(list).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: at('requirement.retry') }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
  })

  it('tells a broken ledger apart from an empty one', async () => {
    bench([], { payloadError: '无法解析 index.json：它不是合法的 JSON。' })

    // 「还没记过」与「记过但读不出来」在这一屏必须分得开：后者要人去修那份文件。
    expect(await screen.findByText(at('requirement.emptyUnreadable'))).toBeTruthy()
    expect(screen.queryByText(at('requirement.emptyWhy'))).toBeNull()
    expect(screen.getByText(new RegExp('无法解析 index.json'))).toBeTruthy()
  })

  it('degrades only the project picker when the project list will not load', async () => {
    bench([row({ id: 'rq-1', name: '接口对接' })], { projectsError: new Error('项目服务没起来') })

    // 台账读得出来，所以这一屏不算失败：选择器退化成只有「全部项目」，读者照样能读条目。
    expect(await screen.findByText(new RegExp('项目服务没起来'))).toBeTruthy()
    expect(screen.getByText('接口对接')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText(at('requirement.project'))).toBeTruthy()
  })

  it('names the ids it could not read rather than dropping them silently', async () => {
    bench([row({ id: 'rq-1', name: '接口对接' })], { unreadable: ['rq-20261005-abcd', 'rq-20261005-efgh'] })

    expect(await screen.findByText(new RegExp('有 2 条读不出来'))).toBeTruthy()
    // 两条 id 都要写出来：一条存在过却在列表里凭空不见的需求，比一条报错的更难查。
    expect(screen.getByText('rq-20261005-abcd、rq-20261005-efgh')).toBeTruthy()
  })

  it('refuses an entry with no project or no name, and files one that has both', async () => {
    const { create, list } = bench([])
    await screen.findByText(at('requirement.empty'))
    expect(list).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: at('requirement.new') }))
    fireEvent.click(await screen.findByRole('button', { name: at('requirement.formSubmit') }))
    // 条目总是属于某个项目的，没有项目的条目在哪一屏都找不到。
    expect(await screen.findByText(at('requirement.formNeedProject'))).toBeTruthy()
    expect(create).not.toHaveBeenCalled()

    fireEvent.change(control('yon-rq-new-project'), { target: { value: 'prj-2' } })
    fireEvent.click(screen.getByRole('button', { name: at('requirement.formSubmit') }))
    expect(await screen.findByText(at('requirement.formNeedName'))).toBeTruthy()
    expect(create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(at('requirement.formName')),
      { target: { value: '  固定资产卡片接口  ' } })
    fireEvent.change(control('yon-rq-new-body'), { target: { value: '要一张卡片。' } })
    fireEvent.click(screen.getByRole('button', { name: at('requirement.formSubmit') }))

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        projectId: 'prj-2', name: '固定资产卡片接口', body: '要一张卡片。',
      })
    })
    // 新条目可能落在当前筛选之外（正筛着「已完成」就是），所以重读台账而不是插到最前。
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(at('requirement.created'))).toBeTruthy()
    // 建完就收起来，让读者看见刚建的那一条落在列表的什么位置。
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: at('requirement.formSubmit') })).toBeNull()
    })
  })

  it('hands the library path to the clipboard, and says so', async () => {
    bench([])
    await screen.findByText(at('requirement.empty'))

    fireEvent.click(screen.getByRole('button', { name: at('requirement.copyRoot') }))

    // 库根在 `~/.dsh/` 这样的隐藏目录下面，面板里能点一下拿走路径，比让人去翻文件系统有用。
    await waitFor(() => { expect(vi.mocked(writeClipboard)).toHaveBeenCalledWith(ROOT) })
    expect(await screen.findByText(at('requirement.copied'))).toBeTruthy()
  })

  it('draws the three folders with their counts, and lists the one that is open', async () => {
    const { fileList } = bench([row({ id: 'rq-1', name: '接口对接' })], {
      files: filesPayload({
        user: [attachment('user', '卡片接口清单.txt')],
        generated: [attachment('generated', '方案.md')],
      }),
    })
    await open('接口对接')

    // 三个目录各带一个数。空目录也露脸：`patches/` 空着本身就是一句话，把它藏起来，
    // 读者会以为这一屏没做这件事。
    expect(chip('user').textContent).toBe('user/1')
    expect(chip('generated').textContent).toBe('generated/1')
    expect(chip('patches').textContent).toBe('patches/0')
    // 默认停在「他给的」那一格。
    expect(chip('user').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('卡片接口清单.txt')).toBeTruthy()
    // 大小与日期都来自磁盘上那一次 stat，不是台账里的记录。
    expect(screen.getByText(/1\.2 KB · 2026-08-03/)).toBeTruthy()

    fireEvent.click(chip('generated'))
    expect(await screen.findByText('方案.md')).toBeTruthy()
    expect(screen.queryByText('卡片接口清单.txt')).toBeNull()
    // 三个目录是一次取全的，所以切一格不该再发一次请求——切文件夹不是一次网络往返。
    expect(fileList).toHaveBeenCalledTimes(1)
    expect(fileList).toHaveBeenCalledWith('rq-1')

    fireEvent.click(chip('patches'))
    expect(await screen.findByText(at('requirement.filesEmpty'))).toBeTruthy()
  })

  it('does not offer to read a file the extension says is not text, and says why in place', async () => {
    const { fileRead } = bench([row({ id: 'rq-1', name: '接口对接' })], {
      files: filesPayload({
        user: [
          attachment('user', '方案.md'),
          attachment('user', '卡片接口清单.xlsx', {
            readable: false,
            note: '这是 Office 的压缩包格式（xlsx），正文要解开压缩包才拿得到，现在还读不了。',
          }),
        ],
      }),
    })
    await open('接口对接')

    // 两份文件只有一份给「读」：点一下再被告知「读不了」，等于拿一次等待换一句本来就看
    // 得到的话。扩展名只给预测，字节能读不能读要按下去才知道——所以这一条挡的是**预测**
    // 说读不了的那些，`.txt` 装着 zip 仍然进得来。
    expect(screen.getAllByRole('button', { name: at('requirement.fileRead') })).toHaveLength(1)
    expect(screen.getByText(/Office 的压缩包格式/)).toBeTruthy()
    expect(fileRead).not.toHaveBeenCalled()
  })

  it('reads a text attachment in place, names the encoding, and folds it again', async () => {
    const { fileRead } = bench([row({ id: 'rq-1', name: '接口对接' })], {
      files: filesPayload({ user: [attachment('user', '接口说明.txt')] }),
      fileReadAnswer: {
        file: attachment('user', '接口说明.txt'),
        text: '要接三个接口。\n第二个要退货。',
        encoding: 'gb18030',
        truncated: true,
        note: '一次最多读 60000 个字符，上面只是文件的前 2 行。',
      },
    })
    await open('接口对接')

    fireEvent.click(screen.getByRole('button', { name: at('requirement.fileRead') }))

    expect(await screen.findByText(/要接三个接口/)).toBeTruthy()
    expect(fileRead).toHaveBeenCalledWith('rq-1', 'user', '接口说明.txt')
    // 用的哪个解码要说出来：GBK 按 UTF-8 读的症状是乱码，而乱码本身看不出原因。
    expect(screen.getByText(at('requirement.fileEncoding').replace('{encoding}', 'gb18030'))).toBeTruthy()
    expect(screen.getByText(/一次最多读 60000 个字符/)).toBeTruthy()

    // 再点同一个就是收起——这一屏只有 450px，展开的正文占的是别人地方。
    fireEvent.click(screen.getByRole('button', { name: at('requirement.fileHide') }))
    await waitFor(() => { expect(screen.queryByText(/要接三个接口/)).toBeNull() })
  })

  it('copies the full path of an attachment, and says so', async () => {
    bench([row({ id: 'rq-1', name: '接口对接' })], {
      files: filesPayload({ user: [attachment('user', '接口说明.txt')] }),
    })
    await open('接口对接')

    fireEvent.click(screen.getByRole('button', { name: at('requirement.fileCopyPath') }))

    // 草图这里是「打开」，而本仓没有「用系统的文件管理器打开一个路径」这条宿主能力，
    // 所以退成复制完整路径（与库根那个按钮同一条结论）。
    await waitFor(() => {
      expect(vi.mocked(writeClipboard)).toHaveBeenCalledWith(`${ENTRY_DIR}/user/接口说明.txt`)
    })
    expect(await screen.findByText(at('requirement.copied'))).toBeTruthy()
  })

  it('makes deleting an attachment take two clicks, and refreshes the folder afterwards', async () => {
    const { removeFile, fileList } = bench([row({ id: 'rq-1', name: '接口对接' })], {
      files: filesPayload({ user: [attachment('user', '临时.txt')] }),
    })
    await open('接口对接')

    // 这一屏上同时有两个「删除」——一个是条目，一个是它的某个附件——所以先缩到这一行里
    // 再按名字取，否则取到的是动作行里那个。
    const line = screen.getByText('临时.txt').closest('li')
    if (line === null) throw new Error('附件那一行不在页面上')
    const remove = within(line)

    fireEvent.click(remove.getByRole('button', { name: at('requirement.fileRemove') }))
    expect(await screen.findByText(at('requirement.fileRemoveAsk'))).toBeTruthy()
    expect(removeFile).not.toHaveBeenCalled()

    fireEvent.click(remove.getByRole('button', { name: at('requirement.removeNo') }))
    await waitFor(() => { expect(screen.queryByText(at('requirement.fileRemoveAsk'))).toBeNull() })

    fireEvent.click(remove.getByRole('button', { name: at('requirement.fileRemove') }))
    fireEvent.click(await remove.findByRole('button', { name: at('requirement.removeYes') }))

    await waitFor(() => { expect(removeFile).toHaveBeenCalledWith('rq-1', 'user', '临时.txt') })
    // 删完必须重读清单：屏幕上那一行现在只活在这一份 state 里，磁盘上已经没有了。
    await waitFor(() => { expect(fileList).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(at('requirement.fileRemoved'))).toBeTruthy()
  })

  it('files a chosen file into user/, and says when the name had to change', async () => {
    const { importFile, fileList } = bench([row({ id: 'rq-1', name: '接口对接' })], {
      importAnswer: {
        entry: '接口对接',
        file: attachment('user', '卡片清单-2.xlsx'),
        renamedFrom: '卡片清单.xlsx',
      },
    })
    await open('接口对接')

    const picked = new File(['x'], '卡片清单.xlsx')
    fireEvent.change(control('yon-rq-upload'), { target: { files: [picked] } })

    // 一律进 `user/`：这个按钮存在的理由就是「归档使用者提供的原件」，而 generated/ 与
    // patches/ 是模型写自己产物的地方。这也是通往 `user/` 的唯一入口。
    await waitFor(() => { expect(importFile).toHaveBeenCalledWith('rq-1', 'user', picked) })
    await waitFor(() => { expect(fileList).toHaveBeenCalledTimes(2) })
    // 改过的名字必须说出来：不说，他回头在 user/ 里就找不到自己那个名字。
    expect(await screen.findByText(/你给的叫 卡片清单\.xlsx，库里这条叫 卡片清单-2\.xlsx/)).toBeTruthy()
  })

  it('keeps the entry readable when the attachment list will not load', async () => {
    bench([row({ id: 'rq-1', name: '接口对接' })], {
      detail: { prose: '要接三个接口。' },
      filesError: new Error('目录读不出来'),
    })
    await open('接口对接')

    // 附件读不出来不是这一条读不出来：正文在、动作行也在，只有那三格说它自己出了问题。
    expect(await screen.findByText(/附件清单读不出来/)).toBeTruthy()
    expect(screen.getByText('要接三个接口。')).toBeTruthy()
    expect(screen.getByRole('button', { name: at('requirement.archive') })).toBeTruthy()
  })
})
