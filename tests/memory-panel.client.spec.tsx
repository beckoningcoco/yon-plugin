// @vitest-environment jsdom
/**
 * 记忆面板这一屏：使用者在它里面能做的三件事——读、筛、删——以及一件它不提供的：
 * 新建。
 *
 * 最后一条否定是这个面板的立身之本（`memory/MemoryManager.tsx` 的头注释说了为什么），
 * 所以它在这里被钉住：整屏没有任何一个按钮会走到「写一条记忆」上。
 *
 * 框架原子按同目录其它面板用例的做法打桩：它们发布的那一半是这个用例跑不起来的加载
 * 产物。每个桩保留组件真正依赖的契约——对话框用标题标出自己，按钮带着点击处理。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { MemoryListRow, MemoryView, ProjectSummary } from '../src/shared/types.ts'
import { MemoryManager, type MemoryManagerProps } from '../src/client/memory/MemoryManager.tsx'
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

/** One memory row with everything a case does not care about filled in. */
function row(overrides: Partial<MemoryListRow> & { readonly id: string }): MemoryListRow {
  return {
    projectId: 'prj-water',
    projectName: '水投',
    type: 'pitfall',
    title: `${overrides.id} 的标题`,
    tags: [],
    source: '一次实测',
    createdAt: '2026-10-05T06:12:30.000Z',
    updatedAt: '2026-10-05T06:12:30.000Z',
    snippet: `${overrides.id} 的摘要`,
    ...overrides,
  }
}

/** The project list the filter draws from. */
const PROJECTS: readonly ProjectSummary[] = [
  { projectId: 'prj-water', name: '水投', code: 'shuitou', status: 'active', archived: false, fieldCount: 0, createdAt: 0, updatedAt: 0 },
  { projectId: 'prj-sky', name: '天九', code: 'tianjiu', status: 'done', archived: false, fieldCount: 0, createdAt: 0, updatedAt: 0 },
]

/** An in-memory stand-in for the host. */
function bank(rows: readonly MemoryListRow[]) {
  const list = vi.fn(async (_query?: unknown) => ({ rows, path: '/tmp/memory/index.json' }))
  const read = vi.fn(async (id: string) => ({ memory: { ...row({ id }), body: `${id} 的正文` } as MemoryView }))
  const remove = vi.fn(async (id: string) => ({ removed: id }))
  const listProjects = vi.fn(async () => PROJECTS)
  const api = { list, read, remove, listProjects } as unknown as Pick<
    MemoryManagerProps, 'list' | 'read' | 'remove' | 'listProjects'
  >
  return { api, list, read, remove, listProjects }
}

/** Render the surface over one bank. */
function open(stub: ReturnType<typeof bank>) {
  render(
    <MemoryManager
      {...stub.api}
      t={seatOver(zh)}
      onClose={() => {}}
    />,
  )
}

describe('the memory surface', () => {
  it('lists the bank with each memory\'s type, title and date', async () => {
    const stub = bank([row({ id: 'mem-1', title: '达梦下按时间范围查询必须走索引' })])
    open(stub)

    expect(await screen.findByText('达梦下按时间范围查询必须走索引')).toBeTruthy()
    expect(screen.getByText(at('memory.type.pitfall'))).toBeTruthy()
    expect(screen.getByText('2026-10-05')).toBeTruthy()
    // 摘要也摆出来：决定要不要展开，靠的是它。
    expect(screen.getByText('mem-1 的摘要')).toBeTruthy()
  })

  it('narrows by type through the host rather than in the browser', async () => {
    // 关键词要搜正文，而面板手上只有摘要——所以筛选一律交给后端，这一条钉住这个选择。
    const stub = bank([row({ id: 'mem-1' })])
    open(stub)
    await screen.findByText('mem-1 的标题')

    fireEvent.click(screen.getByText(at('memory.type.envFact')))

    await waitFor(() => {
      expect(stub.list).toHaveBeenLastCalledWith({ type: 'env-fact' })
    })
  })

  it('reads the full text only when a row is opened', async () => {
    const stub = bank([row({ id: 'mem-1' })])
    open(stub)
    const head = await screen.findByText('mem-1 的标题')

    // 列表不带正文：展开一条才去取，这是不给还没看的东西付代价。
    expect(stub.read).not.toHaveBeenCalled()

    fireEvent.click(head)

    expect(await screen.findByText('mem-1 的正文')).toBeTruthy()
    expect(stub.read).toHaveBeenCalledWith('mem-1')
    // 出处摆出来，因为它是这一屏唯一能判断「该不该信」的线索。
    expect(screen.getByText('一次实测')).toBeTruthy()
  })

  it('asks twice before deleting, and never offers to create', async () => {
    const stub = bank([row({ id: 'mem-1' })])
    open(stub)
    fireEvent.click(await screen.findByText('mem-1 的标题'))

    fireEvent.click(await screen.findByText(at('memory.remove')))
    // 第一次点击只是把确认摆出来：删除没有撤销，所以它必须比别的动作多一次。
    expect(stub.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(at('memory.removeConfirm')))

    await waitFor(() => { expect(stub.remove).toHaveBeenCalledWith('mem-1') })
    // 整屏没有「新建」：记忆是某人查出来的事实，不是一张可以填写的表。
    expect(screen.queryByText('新建')).toBeNull()
    expect(screen.queryByText('新建条目')).toBeNull()
  })
})
