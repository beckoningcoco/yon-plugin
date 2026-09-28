// @vitest-environment jsdom
/**
 * The panel's built-in entry: a glyph cell that owns the project surface.
 *
 * The entry is a pure shell — it receives every operation through its inject face
 * — so these cases only check what the cell itself promises: an icon-only button
 * with an accessible name, and one toggle that mounts the surface.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { en, zh } from '../src/client/locales.ts'
import type { ProjectApi } from '../src/client/project/api.ts'
import { ProjectItem, type ProjectItemProps } from '../src/client/ProjectItem.tsx'

afterEach(cleanup)

/** The shares this entry reads: its copy, plus the operations it forwards. */
type HarnessProps = Pick<ProjectItemProps, 't'> & ProjectApi

const Item = ProjectItem as unknown as (props: HarnessProps) => ReactElement

/** Translate through one dictionary, falling back to the key (as the `t` seat does). */
const seatOver = (dict: Record<string, string>) => (key: string): string => dict[key] ?? key

/** Operations the surface would call; an empty list keeps it to one call. */
const apiStub = (): ProjectApi => ({
  listProjects: async () => [],
  getProject: async () => { throw new Error('unused: nothing is selected') },
  createProject: async () => { throw new Error('unused') },
  updateProject: async () => { throw new Error('unused') },
  setField: async () => { throw new Error('unused') },
  removeField: async () => { throw new Error('unused') },
  archiveProject: async () => { throw new Error('unused') },
  removeProject: async () => { throw new Error('unused') },
})

describe('project management entry', () => {
  it('renders one glyph cell named by its full description', () => {
    render(<Item t={seatOver(zh)} {...apiStub()} />)

    const button = screen.getByRole('button', { name: '项目管理面板' })

    // The cell's own text stays empty: the icon carries the meaning, the
    // description arrives through the accessible name and the hover tooltip.
    expect(button.textContent).toBe('')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('carries the English description when that dictionary is active', () => {
    render(<Item t={seatOver(en)} {...apiStub()} />)

    expect(screen.getByRole('button', { name: 'Project management panel' })).toBeTruthy()
  })

  it('opens and closes the project surface from the same cell', async () => {
    render(<Item t={seatOver(zh)} {...apiStub()} />)

    const button = screen.getByRole('button', { name: '项目管理面板' })
    fireEvent.click(button)

    expect(await screen.findByRole('dialog', { name: '项目管理面板' })).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the surface through its own close control', async () => {
    render(<Item t={seatOver(zh)} {...apiStub()} />)

    fireEvent.click(screen.getByRole('button', { name: '项目管理面板' }))
    fireEvent.click(await screen.findByLabelText('关闭面板'))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// The baseline UI kit is supplied by the DSH page at runtime, and its published
// client half is a loader artifact rather than source. The specs stub it, so the
// unit under test is this plugin's own surface.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: ReactElement }) => children,
  useAnchoredPosition: () => ({ left: 12, top: 12 }),
  useDismissOnOutsidePointer: () => {},
}))
