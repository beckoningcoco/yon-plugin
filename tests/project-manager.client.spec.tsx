// @vitest-environment jsdom
/**
 * The project surface driven through its injected API.
 *
 * The stand-in is an in-memory store rather than a table of mock returns: the
 * point of these cases is the round trip (edit → call → refreshed view), and a
 * store keeps that honest without the host. The surface holds no data access of
 * its own, so nothing else has to be faked.
 *
 * The surface selects the first project as soon as it loads, and a project's own
 * name renders both in the list and in the detail pane, so a case that needs a
 * different selection waits for the detail pane to change rather than reaching
 * into render state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { JsonValue, ProjectDetail } from '../src/shared/types.ts'
import type { ProjectApi } from '../src/client/project/api.ts'
import { ProjectManager, type ProjectManagerProps } from '../src/client/project/ProjectManager.tsx'
import { zh } from '../src/client/locales.ts'

// The baseline UI kit reaches the page from the DSH host bundle rather than from
// a published module, so the specs stub the one hook this surface uses.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  useDismissOnOutsidePointer: () => {},
}))

afterEach(cleanup)

/** One row of the stand-in store. */
interface Row {
  name: string
  code: string
  archived: boolean
  fields: Record<string, JsonValue>
}

/** A project with no fields, active and unarchived. */
const blank = (name: string): Row => ({ name, code: '', archived: false, fields: {} })

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
      status: 'active',
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
        archived: false,
        fields: { ...input.fields },
      })
      return detail(projectId)
    }),
    updateProject: vi.fn(async (projectId, patch) => {
      const row = rows.get(projectId) as Row
      if (patch.name !== undefined) row.name = patch.name
      if (patch.code !== undefined) row.code = patch.code
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

/**
 * Wait for the opening load to settle.
 *
 * The surface disables its controls while any call is in flight, so a case that
 * means to click something must first let the load that runs on mount finish —
 * otherwise the click lands on a disabled button. The code box is the signal:
 * nothing else gates it.
 */
async function settle(): Promise<void> {
  await waitFor(() => {
    expect((screen.getByLabelText(at('project.code')) as HTMLInputElement).disabled).toBe(false)
  })
}

/** Render the surface over a fresh stand-in store. */
function bench(seed: Record<string, Row> = {}) {
  const { api, rows } = stubApi()
  for (const [projectId, row] of Object.entries(seed)) rows.set(projectId, row)
  const onClose = vi.fn()
  const view = render(<Manager {...api} t={seatOver(zh)} onClose={onClose} />)
  return { ...view, api, rows, onClose }
}

describe('project manager surface', () => {
  it('says so when there is nothing to list', async () => {
    bench()

    expect(await screen.findByText(at('project.empty'))).toBeTruthy()
    expect(screen.getByText(at('project.pickHint'))).toBeTruthy()
  })

  it('creates a project and shows it in the list', async () => {
    const { api } = bench()
    await settle()

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: '用友 NCC 客开' } })
    fireEvent.change(screen.getByLabelText(at('project.code')), { target: { value: 'NCC-1' } })
    fireEvent.click(screen.getByText(at('project.new')))

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith({ name: '用友 NCC 客开', code: 'NCC-1' })
    })
    // The name shows in the list and again as the just-created selection.
    await waitFor(() => { expect(screen.getAllByText('用友 NCC 客开')).toHaveLength(2) })
    expect(screen.getByText('NCC-1')).toBeTruthy()
  })

  it('keeps the create button offering nothing until a name is typed', async () => {
    const { api } = bench()
    await settle()

    const create = screen.getByText(at('project.new')) as HTMLButtonElement
    expect(create.disabled).toBe(true)

    // A nameless press is not a call: the store never sees an empty project.
    fireEvent.click(create)
    expect(api.createProject).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: 'x' } })
    expect(create.disabled).toBe(false)
  })

  it('shows the selected project dynamic fields and saves an edited value', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', archived: false, fields: { 环境信息: { host: '10.0.0.1' } } },
    })

    const value = await screen.findByLabelText(`环境信息 · ${at('project.fieldValue')}`)
    fireEvent.change(value, { target: { value: '{"host":"10.0.0.9"}' } })
    fireEvent.blur(value)

    await waitFor(() => {
      expect(api.setField).toHaveBeenCalledWith('p1', '环境信息', { host: '10.0.0.9' })
    })
    // The saved value comes back from the store as the row's new text.
    await screen.findByDisplayValue('{"host":"10.0.0.9"}')
  })

  it('leaves an unedited field alone when the row loses focus', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', archived: false, fields: { 环境信息: '10.0.0.1' } },
    })

    fireEvent.blur(await screen.findByLabelText(`环境信息 · ${at('project.fieldValue')}`))

    await screen.findByText(at('project.fields'))
    expect(api.setField).not.toHaveBeenCalled()
  })

  it('adds a field the operator invents, keeping plain text as text', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.change(await screen.findByLabelText(at('project.fieldKey')), { target: { value: '环境信息new' } })
    fireEvent.change(screen.getByLabelText(at('project.fieldValue')), { target: { value: '10.0.0.9' } })
    fireEvent.click(screen.getByText(at('project.addField')))

    // "10.0.0.9" is not JSON, so it stays the string the operator typed.
    await waitFor(() => {
      expect(api.setField).toHaveBeenCalledWith('p1', '环境信息new', '10.0.0.9')
    })
    await screen.findByLabelText(`环境信息new · ${at('project.fieldValue')}`)
  })

  it('reads a value that is JSON back as JSON', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.change(await screen.findByLabelText(at('project.fieldKey')), { target: { value: '端口' } })
    fireEvent.change(screen.getByLabelText(at('project.fieldValue')), { target: { value: '[1,2]' } })
    fireEvent.click(screen.getByText(at('project.addField')))

    await waitFor(() => { expect(api.setField).toHaveBeenCalledWith('p1', '端口', [1, 2]) })
  })

  it('removes one field without touching the others', async () => {
    const { api } = bench({
      p1: { name: 'proj', code: '', archived: false, fields: { a: 1, b: 2 } },
    })

    fireEvent.click(await screen.findByLabelText(`${at('project.removeField')}: a`))

    await waitFor(() => { expect(api.removeField).toHaveBeenCalledWith('p1', 'a') })
    await screen.findByText('b')
    expect(screen.queryByText('a')).toBeNull()
  })

  it('switches the detail pane to the project that was clicked', async () => {
    bench({ p1: blank('first'), p2: { ...blank('second'), fields: { 环境信息: '10.0.0.2' } } })

    // The first project is selected on load, so its name is in both panes.
    await waitFor(() => { expect(screen.getAllByText('first')).toHaveLength(2) })

    fireEvent.click(listRow('p2'))

    await waitFor(() => { expect(screen.getAllByText('second')).toHaveLength(2) })
    await screen.findByDisplayValue('10.0.0.2')
  })

  it('archives a project and drops it from the default list', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByText(at('project.archive')))

    await waitFor(() => { expect(api.archiveProject).toHaveBeenCalledWith('p1', true) })
    await screen.findByText(at('project.empty'))
  })

  it('keeps an archived project listed when asked for', async () => {
    const { api } = bench({ p1: { ...blank('proj'), archived: true } })
    await settle()

    fireEvent.click(screen.getByLabelText(at('project.showArchived')))

    await waitFor(() => { expect(api.listProjects).toHaveBeenLastCalledWith(true) })
    await waitFor(() => { expect(screen.getAllByText('proj').length).toBeGreaterThan(0) })
  })

  it('asks twice before deleting a project permanently', async () => {
    const { api } = bench({ p1: blank('proj') })

    fireEvent.click(await screen.findByText(at('project.remove')))
    expect(api.removeProject).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(`${at('project.remove')}?`))
    await waitFor(() => { expect(api.removeProject).toHaveBeenCalledWith('p1') })
  })

  it('reports a failing call instead of swallowing it', async () => {
    const { api } = bench()
    await settle()
    vi.mocked(api.createProject).mockRejectedValueOnce(new Error('boom'))

    fireEvent.change(screen.getByLabelText(at('project.name')), { target: { value: 'x' } })
    fireEvent.click(screen.getByText(at('project.new')))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('boom')
  })

  it('closes on its own control', async () => {
    const { onClose } = bench()

    fireEvent.click(screen.getByLabelText(at('panel.close')))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
