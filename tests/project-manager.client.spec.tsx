// @vitest-environment jsdom
/**
 * The project surface driven through its injected API.
 *
 * The stand-in is an in-memory store rather than a table of mock returns: the
 * point of these cases is the round trip (edit -> call -> refreshed view), and a
 * store keeps that honest without the host.
 *
 * The framework atoms are stubbed (their published half is a loader artifact this
 * suite cannot execute), but each stub keeps the contract the surface relies on:
 * a dialog renders its children into an element labelled by its title, and a
 * button refuses to fire while disabled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactElement } from 'react'
import type { JsonValue, ProjectDetail } from '../src/shared/types.ts'
import type { ProjectApi } from '../src/client/project/api.ts'
import { ProjectManager, type ProjectManagerProps } from '../src/client/project/ProjectManager.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, size: _size, icon: _icon, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...rest} />,
  Pill: ({ active: _active, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Modal: ({ open, onClose, title, closeLabel, children, footer }: Record<string, unknown>) => (open === true
    ? (
      <div role="dialog" aria-label={String(title)}>
        <button type="button" aria-label={String(closeLabel ?? 'close')} onClick={onClose as () => void} />
        {children as ReactElement}
        {footer as ReactElement}
      </div>
    )
    : null),
  RiskConfirmation: ({
    open, title, confirmLabel, cancelLabel, closeLabel, acknowledged, disabled,
    onAcknowledgedChange, onConfirm, onCancel,
  }: Record<string, unknown>) => (open === true
    ? (
      <div role="dialog" aria-label={String(title)}>
        <button type="button" aria-label={String(closeLabel)} onClick={onCancel as () => void} />
        <input
          type="checkbox"
          aria-label="ack"
          checked={acknowledged as boolean}
          onChange={event => (onAcknowledgedChange as (next: boolean) => void)(event.target.checked)}
        />
        <button
          type="button"
          disabled={disabled === true || acknowledged !== true}
          onClick={onConfirm as () => void}
        >
          {String(confirmLabel)}
        </button>
        <button type="button" onClick={onCancel as () => void}>{String(cancelLabel)}</button>
      </div>
    )
    : null),
  Tooltip: ({ children }: Record<string, unknown>) => children as ReactElement,
  useAnchoredPosition: () => ({ left: 12, top: 12 }),
  useDismissOnOutsidePointer: () => {},
  writeClipboard: vi.fn(async () => true),
}))

afterEach(cleanup)

// Every case starts from a clipboard that accepts the write.
beforeEach(() => { vi.mocked(writeClipboard).mockClear() })

// jsdom implements no scrolling, and the surface scrolls a freshly created
// project into view. Without this the effect throws and React unmounts the tree.
Element.prototype.scrollIntoView = () => {}

/** One row of the stand-in store. */
interface Row {
  name: string
  code: string
  status: 'active' | 'paused' | 'done'
  archived: boolean
  fields: Record<string, JsonValue>
}

/** A project with no fields, active and unarchived. */
const blank = (name: string): Row => ({ name, code: '', status: 'active', archived: false, fields: {} })

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** An in-memory stand-in for the host store, recording every call. */
function stubApi() {
  const rows = new Map<string, Row>()
  let sequence = 0

  const detail = (projectId: string): ProjectDetail => {
    const row = rows.get(projectId) as Row
    return {
      projectId,
      name: row.name,
      code: row.code,
      status: row.status,
      archived: row.archived,
      createdAt: 0,
      updatedAt: 0,
      fieldCount: Object.keys(row.fields).length,
      fields: { ...row.fields },
    }
  }

  const api: ProjectApi = {
    listProjects: vi.fn(async (includeArchived = false) =>
      [...rows.keys()]
        .map(detail)
        .filter(project => includeArchived || !project.archived)
        .map(({ fields: _fields, ...summary }) => summary)),
    getProject: vi.fn(async (projectId: string) => detail(projectId)),
    createProject: vi.fn(async (input) => {
      const projectId = `p${++sequence}`
      rows.set(projectId, {
        name: input.name,
        code: input.code ?? '',
        status: input.status ?? 'active',
        archived: false,
        fields: { ...input.fields },
      })
      return detail(projectId)
    }),
    updateProject: vi.fn(async (projectId, patch) => {
      const row = rows.get(projectId) as Row
      if (patch.name !== undefined) row.name = patch.name
      if (patch.code !== undefined) row.code = patch.code
      if (patch.status !== undefined) row.status = patch.status
      return detail(projectId)
    }),
    setField: vi.fn(async (projectId, fieldKey, value) => {
      ;(rows.get(projectId) as Row).fields[fieldKey] = value
      return detail(projectId)
    }),
    removeField: vi.fn(async (projectId, fieldKey) => {
      delete (rows.get(projectId) as Row).fields[fieldKey]
      return detail(projectId)
    }),
    archiveProject: vi.fn(async (projectId, archived) => {
      ;(rows.get(projectId) as Row).archived = archived
      return detail(projectId)
    }),
    removeProject: vi.fn(async (projectId: string) => { rows.delete(projectId) }),
  }
  return { api, rows }
}

const Manager = ProjectManager as unknown as (props: ProjectManagerProps) => ReactElement

/** Translate through one dictionary, substituting `{name}` params as the seat does. */
const seatOver = (dict: Record<string, string>) =>
  (key: string, params?: Record<string, unknown>): string => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
  }

/** The list row for one project; its name alone would also match the detail pane. */
const listRow = (projectId: string): HTMLElement => {
  const row = document.querySelector<HTMLElement>(`[data-project="${projectId}"]`)
  if (row === null) throw new Error(`no list row for ${projectId}`)
  return row
}

/** Render the surface over a fresh stand-in store. */
function bench(seed: Record<string, Row> = {}) {
  const { api, rows } = stubApi()
  for (const [projectId, row] of Object.entries(seed)) rows.set(projectId, row)
  const onClose = vi.fn()
  const view = render(<Manager {...api} t={seatOver(zh)} onClose={onClose} />)
  return { ...view, api, rows, onClose }
}

/** Open the create dialog. */
async function openCreate(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `+ ${at('project.new')}` }))
}

describe('project surface', () => {
  it('invites the first project instead of two competing empty hints', async () => {
    bench()

    expect(await screen.findByText(at('project.empty'))).toBeTruthy()
    expect(screen.getByText(at('project.emptyHint'))).toBeTruthy()
    expect(screen.queryByText(at('project.pickHint'))).toBeNull()
  })

  it('creates a project from a dialog and selects it', async () => {
    const { api } = bench()
    await openCreate()

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: '用友 NCC 客开' } })
    fireEvent.change(screen.getByLabelText(at('project.code')), { target: { value: 'NCC-1' } })
    fireEvent.click(screen.getByText(at('project.createConfirm')))

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith({ name: '用友 NCC 客开', code: 'NCC-1' })
    })
    await waitFor(() => { expect(screen.getAllByText('用友 NCC 客开').length).toBeGreaterThan(0) })
    expect(screen.queryByRole('dialog', { name: at('project.createTitle') })).toBeNull()
  })

  it('keeps the create button offering nothing until a name is typed', async () => {
    const { api } = bench()
    await openCreate()

    const create = screen.getByText(at('project.createConfirm')) as HTMLButtonElement
    expect(create.disabled).toBe(true)

    fireEvent.click(create)
    expect(api.createProject).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: 'x' } })
    expect(create.disabled).toBe(false)
  })

  it('does not submit on the Enter that picks an input-method candidate', async () => {
    const { api } = bench()
    await openCreate()

    const name = screen.getByLabelText(at('project.name'))
    fireEvent.change(name, { target: { value: '环境信' } })

    // The operator is mid-composition: this Enter belongs to the IME.
    fireEvent.compositionStart(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(api.createProject).not.toHaveBeenCalled()

    fireEvent.compositionEnd(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    await waitFor(() => { expect(api.createProject).toHaveBeenCalledWith({ name: '环境信', code: '' }) })
  })

  it('renames a project in place', async () => {
    const { api } = bench({ p1: blank('旧名字') })

    fireEvent.click(await screen.findByLabelText(at('project.renameProject')))
    const input = screen.getByLabelText(at('project.renameProject'))
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => { expect(api.updateProject).toHaveBeenCalledWith('p1', { name: '新名字' }) })
    await waitFor(() => { expect(screen.getAllByText('新名字').length).toBeGreaterThan(0) })
  })

  it('cancels an in-place rename with Escape', async () => {
    const { api } = bench({ p1: blank('旧名字') })

    fireEvent.click(await screen.findByLabelText(at('project.renameProject')))
    const input = screen.getByLabelText(at('project.renameProject'))
    fireEvent.change(input, { target: { value: '改了但不要' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(api.updateProject).not.toHaveBeenCalled()
    // The name shows in the list and again as the selected project's heading.
    expect(screen.getAllByText('旧名字').length).toBeGreaterThan(0)
  })

  it('switches status straight from the pills', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByRole('button', { name: at('project.status.paused') }))

    await waitFor(() => { expect(api.updateProject).toHaveBeenCalledWith('p1', { status: 'paused' }) })
  })

  it('edits the code in place and commits on blur', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByLabelText(at('project.changeCode')))
    const input = screen.getByLabelText(at('project.changeCode'))
    fireEvent.change(input, { target: { value: 'NCC-9' } })
    fireEvent.blur(input)

    await waitFor(() => { expect(api.updateProject).toHaveBeenCalledWith('p1', { code: 'NCC-9' }) })
  })

  it('saves an edited field value when the row loses focus', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 环境信息: '10.0.0.1' } },
    })

    const label = `环境信息 · ${at('project.fieldValue')}`
    // A value is read as text and becomes an input on click; one control holds
    // the label at a time, so the second query is the editor, not the reader.
    fireEvent.click(await screen.findByLabelText(label))
    const value = screen.getByLabelText(label)
    fireEvent.change(value, { target: { value: '10.0.0.9' } })
    fireEvent.blur(value)

    await waitFor(() => {
      expect(api.setField).toHaveBeenCalledWith('p1', '环境信息', '10.0.0.9')
    })
    await screen.findByText(at('project.fieldSaved'))
  })

  it('marks a failed save on its own row and retries it from there', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 环境信息: '10.0.0.1' } },
    })
    vi.mocked(api.setField).mockRejectedValueOnce(new Error('boom'))

    const label = `环境信息 · ${at('project.fieldValue')}`
    fireEvent.click(await screen.findByLabelText(label))
    const row = screen.getByLabelText(label)
    fireEvent.change(row, { target: { value: '10.0.0.9' } })
    fireEvent.blur(row)

    const retry = await screen.findByText(at('project.fieldFailed'))
    // A failure reopens the row with the text still in it, so the retry button
    // means "this text again" rather than "whatever happens to be stored".
    expect((screen.getByLabelText(label) as HTMLTextAreaElement).value).toBe('10.0.0.9')

    fireEvent.click(retry)
    await waitFor(() => {
      expect(api.setField).toHaveBeenLastCalledWith('p1', '环境信息', '10.0.0.9')
    })
    await screen.findByText(at('project.fieldSaved'))
  })

  it('reads a structured value as a key-value list, and the raw text on click', async () => {
    bench({
      p1: {
        name: 'proj',
        code: '',
        status: 'active',
        archived: false,
        fields: { 扩展参数: { 来源: 'NCC2312', 目标: 'BIP2507' } },
      },
    })

    const label = `扩展参数 · ${at('project.fieldValue')}`
    const read = await screen.findByLabelText(label)

    // The row shows the pairs themselves: keys and values are their own text, and
    // no brace from the JSON the value is stored as appears in it.
    expect(screen.getByText('来源')).toBeTruthy()
    expect(screen.getByText('NCC2312')).toBeTruthy()
    expect(read.textContent).not.toContain('{')
    // Nothing to type into until the value is clicked.
    expect(document.querySelector('textarea')).toBeNull()

    fireEvent.click(read)

    // The editor is seeded from the text that is stored, not from the list.
    expect((screen.getByLabelText(label) as HTMLTextAreaElement).value)
      .toBe('{"来源":"NCC2312","目标":"BIP2507"}')
  })

  it('lists an array one entry per line instead of one JSON blob', async () => {
    bench({
      p1: {
        name: 'proj',
        code: '',
        status: 'active',
        archived: false,
        fields: { 应用服务器: ['10.20.31.7', '10.20.31.8'] },
      },
    })

    const read = await screen.findByLabelText(`应用服务器 · ${at('project.fieldValue')}`)

    expect(screen.getByText('10.20.31.7')).toBeTruthy()
    expect(screen.getByText('10.20.31.8')).toBeTruthy()
    // An entry has no key of its own, so it gets the mark rather than an index.
    expect(screen.getAllByText('·')).toHaveLength(2)
    expect(read.textContent).not.toContain('[')
  })

  it('reads a value nested deeper than one level as JSON', async () => {
    bench({
      p1: {
        name: 'proj',
        code: '',
        status: 'active',
        archived: false,
        fields: { 扩展参数: { 来源: { 编码: 'NCC2312' } } },
      },
    })

    const read = await screen.findByLabelText(`扩展参数 · ${at('project.fieldValue')}`)

    // Indented JSON beats a key-value list indented two levels deep.
    expect(read.textContent).toContain('"编码": "NCC2312"')
  })

  it('leaves a JSON string a string while reading it as pairs', async () => {
    // How the real stores hold a datasource config: one long string of JSON.
    const stored = '{"数据源key":"FAKE-01","类型":"NCC2312"}'
    const { api } = bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 数据库连接串: stored } },
    })

    const label = `数据库连接串 · ${at('project.fieldValue')}`
    const read = await screen.findByLabelText(label)
    expect(screen.getByText('数据源key')).toBeTruthy()
    expect(screen.getByText('FAKE-01')).toBeTruthy()

    fireEvent.click(read)
    const editor = screen.getByLabelText(label) as HTMLTextAreaElement
    expect(editor.value).toBe(stored)

    // Read and typed text are the same, so looking at a value writes nothing.
    fireEvent.blur(editor)
    expect(api.setField).not.toHaveBeenCalled()
  })

  it('gives up an edit on Escape without writing', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 环境信息: '10.0.0.1' } },
    })

    const label = `环境信息 · ${at('project.fieldValue')}`
    fireEvent.click(await screen.findByLabelText(label))
    const editor = screen.getByLabelText(label)
    fireEvent.change(editor, { target: { value: '改了但不要' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(api.setField).not.toHaveBeenCalled()
    // Back to what is stored, with the editor closed again.
    expect(screen.getByText('10.0.0.1')).toBeTruthy()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('keeps a long digit string a string', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByRole('button', { name: `+ ${at('project.addField')}` }))
    fireEvent.change(await screen.findByLabelText(at('project.fieldKey')), { target: { value: '订单号' } })
    fireEvent.change(screen.getByLabelText(at('project.fieldValue')), { target: { value: '138001380001234567' } })
    fireEvent.click(screen.getByText(at('project.fieldAdd')))

    await waitFor(() => {
      expect(api.setField).toHaveBeenCalledWith('p1', '订单号', '138001380001234567')
    })
  })

  it('reads structured JSON as JSON', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByRole('button', { name: `+ ${at('project.addField')}` }))
    fireEvent.change(await screen.findByLabelText(at('project.fieldKey')), { target: { value: '端口' } })
    fireEvent.change(screen.getByLabelText(at('project.fieldValue')), { target: { value: '["8080","8443"]' } })
    fireEvent.click(screen.getByText(at('project.fieldAdd')))

    await waitFor(() => { expect(api.setField).toHaveBeenCalledWith('p1', '端口', ['8080', '8443']) })
  })

  it('copies a field value from its own row', async () => {
    bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 环境信息: { host: '10.0.0.1' } } },
    })

    fireEvent.click(await screen.findByLabelText('复制「环境信息」的值'))

    await waitFor(() => {
      expect(vi.mocked(writeClipboard)).toHaveBeenCalledWith('{"host":"10.0.0.1"}')
    })
    // The button that was pressed reports the outcome.
    await screen.findByLabelText(at('project.copied'))
  })

  it('says so when the host refuses the clipboard', async () => {
    vi.mocked(writeClipboard).mockResolvedValueOnce(false)
    bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 环境信息: '10.0.0.1' } },
    })

    fireEvent.click(await screen.findByLabelText('复制「环境信息」的值'))

    await screen.findByLabelText(at('project.copyFailed'))
  })

  it('offers nothing to copy on an empty value', async () => {
    bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { 备注: '' } },
    })

    const copy = await screen.findByLabelText('复制「备注」的值') as HTMLButtonElement
    expect(copy.disabled).toBe(true)
  })

  it('asks before removing a field', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', status: 'active', archived: false, fields: { a: 1, b: 2 } },
    })

    fireEvent.click(await screen.findByLabelText(`${at('project.fieldRemove')}: a`))
    expect(api.removeField).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(at('project.fieldRemoveYes')))

    await waitFor(() => { expect(api.removeField).toHaveBeenCalledWith('p1', 'a') })
    await waitFor(() => { expect(screen.queryByText('a')).toBeNull() })
  })

  it('archives a project and drops it from the default list', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByText(at('project.archive')))

    await waitFor(() => { expect(api.archiveProject).toHaveBeenCalledWith('p1', true) })
    await screen.findByText(at('project.empty'))
  })

  it('keeps an archived project listed when asked for', async () => {
    const { api } = bench({ p1: { ...blank('proj'), archived: true } })

    fireEvent.click(screen.getByLabelText(at('project.showArchived')))

    await waitFor(() => { expect(api.listProjects).toHaveBeenLastCalledWith(true) })
    await waitFor(() => { expect(screen.getAllByText('proj').length).toBeGreaterThan(0) })
  })

  it('deletes a project only after the risk is acknowledged', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByText(at('project.remove')))

    const confirm = await screen.findByText(at('project.removeConfirm')) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.click(confirm)
    expect(api.removeProject).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('ack'))
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => { expect(api.removeProject).toHaveBeenCalledWith('p1') })
  })

  it('lets the top dialog own the surface close control', async () => {
    const { onClose } = bench({ p1: blank('proj') })
    await screen.findByText(at('project.archive'))

    await openCreate()
    // The surface's own close control must not close the surface underneath the
    // dialog that is actually on top.
    fireEvent.click(screen.getByLabelText(at('project.close')))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText(at('project.cancel')))
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: at('project.createTitle') })).toBeNull() })

    fireEvent.click(screen.getByLabelText(at('project.close')))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('walks the list with the arrow keys', async () => {
    bench({ p1: blank('first'), p2: { ...blank('second'), fields: { 环境信息: '10.0.0.2' } } })
    await waitFor(() => { expect(screen.getAllByText('first').length).toBe(2) })

    fireEvent.keyDown(screen.getByRole('listbox', { name: at('project.list') }), { key: 'ArrowDown' })

    await waitFor(() => { expect(screen.getAllByText('second').length).toBe(2) })
  })

  it('offers a search box once the list is long enough to need one', async () => {
    const seed: Record<string, Row> = {}
    for (let index = 0; index < 9; index += 1) seed[`p${index}`] = blank(`项目${index}`)

    bench(seed)
    const search = await screen.findByLabelText(at('project.search'))
    fireEvent.change(search, { target: { value: '项目7' } })

    await waitFor(() => { expect(document.querySelectorAll('[data-project]')).toHaveLength(1) })
    expect(listRow('p7')).toBeTruthy()
  })

  it('reports a failed create inside the dialog instead of closing it', async () => {
    const { api } = bench()
    vi.mocked(api.createProject).mockRejectedValueOnce(new Error('boom'))
    await openCreate()

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: 'x' } })
    fireEvent.click(screen.getByText(at('project.createConfirm')))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('boom')
    expect(screen.getByRole('dialog', { name: at('project.createTitle') })).toBeTruthy()
  })
})
