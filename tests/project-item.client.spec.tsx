// @vitest-environment jsdom
/**
 * The panel's built-in entry: a glyph cell that owns the project surface.
 *
 * The entry is a pure shell - every operation arrives through its inject face -
 * so these cases check what the cell itself promises: an icon-only button with an
 * accessible name, one toggle that mounts the surface, and the hand-off around
 * that surface (the layer announcement, and focus coming back to the cell).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { en, zh } from '../src/client/locales.ts'
import type { ProjectItemFace } from '../src/client/slots.ts'
import { ProjectItem, type ProjectItemProps } from '../src/client/ProjectItem.tsx'

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
  RiskConfirmation: () => null,
  Tooltip: ({ children }: Record<string, unknown>) => children as ReactElement,
  useAnchoredPosition: () => ({ left: 12, top: 12 }),
  useDismissOnOutsidePointer: () => {},
  writeClipboard: async () => true,
}))

afterEach(cleanup)

/** The shares this entry reads: its copy, plus the face it forwards. */
type HarnessProps = Pick<ProjectItemProps, 't'> & ProjectItemFace

const Item = ProjectItem as unknown as (props: HarnessProps) => ReactElement

/** Translate through one dictionary, falling back to the key (as the `t` seat does). */
const seatOver = (dict: Record<string, string>) => (key: string): string => dict[key] ?? key

/** Operations the surface would call; an empty list keeps it to one call. */
function faceStub() {
  const pushOverlay = vi.fn(() => vi.fn())
  const face: ProjectItemFace = {
    listProjects: async () => [],
    getProject: async () => { throw new Error('unused: nothing is selected') },
    createProject: async () => { throw new Error('unused') },
    updateProject: async () => { throw new Error('unused') },
    setField: async () => { throw new Error('unused') },
    removeField: async () => { throw new Error('unused') },
    archiveProject: async () => { throw new Error('unused') },
    removeProject: async () => { throw new Error('unused') },
    pushOverlay,
  }
  return { face, pushOverlay }
}

describe('project management entry', () => {
  it('renders one glyph cell named by its full description', () => {
    const { face } = faceStub()
    render(<Item t={seatOver(zh)} {...face} />)

    const button = screen.getByRole('button', { name: '项目管理' })

    // The cell's own text stays empty: the icon carries the meaning, the
    // description arrives through the accessible name and the hover tooltip.
    expect(button.textContent).toBe('')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('carries the English description when that dictionary is active', () => {
    const { face } = faceStub()
    render(<Item t={seatOver(en)} {...face} />)

    expect(screen.getByRole('button', { name: 'Project management' })).toBeTruthy()
  })

  it('opens and closes the project surface from the same cell', async () => {
    const { face } = faceStub()
    render(<Item t={seatOver(zh)} {...face} />)

    const button = screen.getByRole('button', { name: '项目管理' })
    fireEvent.click(button)

    expect(await screen.findByRole('dialog', { name: '项目管理' })).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces the surface as a layer while it is up, and releases it after', async () => {
    const { face, pushOverlay } = faceStub()
    const release = vi.fn()
    pushOverlay.mockReturnValueOnce(release)
    render(<Item t={seatOver(zh)} {...face} />)

    fireEvent.click(screen.getByRole('button', { name: '项目管理' }))
    await screen.findByRole('dialog', { name: '项目管理' })
    expect(pushOverlay).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '项目管理' }))
    await waitFor(() => { expect(release).toHaveBeenCalledTimes(1) })
  })

  it('closes the surface through its own close control and returns focus', async () => {
    const { face } = faceStub()
    render(<Item t={seatOver(zh)} {...face} />)

    const button = screen.getByRole('button', { name: '项目管理' })
    fireEvent.click(button)
    fireEvent.click(await screen.findByLabelText('关闭项目管理'))

    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    // Focus comes back to the cell that opened the surface, not to the page.
    expect(document.activeElement).toBe(button)
  })
})
