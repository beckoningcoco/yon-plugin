// @vitest-environment jsdom
/**
 * The panel's built-in entry: a row that owns the project surface.
 *
 * The entry is a pure shell — every operation arrives through its inject face, and
 * the name it shows arrives from the panel — so these cases check what the row
 * itself promises: a glyph plus the name it was handed, one toggle that mounts the
 * surface, and the hand-off around that surface (the layer announcement, and focus
 * coming back to the row).
 *
 * Where the name *comes from* is not this file's subject: the seat's labels are
 * pinned in `browser-plugin.client.spec.ts`, and their resolution (including the
 * fallback for an entry that declares none) in `item-rows.client.spec.ts`.
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

/** The shares this entry reads: its copy, the name the panel supplies, and the face it forwards. */
type HarnessProps = Pick<ProjectItemProps, 't' | 'label'> & ProjectItemFace

const Item = ProjectItem as unknown as (props: HarnessProps) => ReactElement

/** Translate through one dictionary, falling back to the key (as the `t` seat does). */
const seatOver = (dict: Record<string, string>) => (key: string): string => dict[key] ?? key

/** The name the panel hands this row, as its seat resolves it for one dictionary. */
const NAME = '项目管理'

/**
 * Render the row with the shares the seat hands it.
 * @param face - the entry's injected operations.
 * @param options - the name the panel supplied, and the active dictionary.
 * @returns the render result.
 */
function renderEntry(
  face: ProjectItemFace,
  options: { label?: string; locale?: Record<string, string> } = {},
) {
  const { label = NAME, locale = zh } = options
  return render(<Item t={seatOver(locale)} label={label} {...face} />)
}

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
  it('draws the row the panel asked for: its glyph, then the name it was handed', () => {
    const { face } = faceStub()
    renderEntry(face)

    const button = screen.getByRole('button', { name: NAME })

    // The name is visible text — the glyph is the anchor beside it, not the whole
    // control — so the button's accessible name is its own content.
    expect(button.textContent).toBe(NAME)
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('takes its accessible name from the row, not from a hidden restatement', () => {
    const { face } = faceStub()
    renderEntry(face, { label: 'Project management', locale: en })

    const button = screen.getByRole('button', { name: 'Project management' })

    // An `aria-label` would override the visible text, and the two could then
    // drift apart — the classic way an icon-only button ends up announcing one
    // thing and showing another.
    expect(button.getAttribute('aria-label')).toBeNull()
  })

  it('opens and closes the project surface from the same row', async () => {
    const { face } = faceStub()
    renderEntry(face)

    const button = screen.getByRole('button', { name: NAME })
    fireEvent.click(button)

    expect(await screen.findByRole('dialog', { name: NAME })).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces the surface as a layer while it is up, and releases it after', async () => {
    const { face, pushOverlay } = faceStub()
    const release = vi.fn()
    pushOverlay.mockReturnValueOnce(release)
    renderEntry(face)

    fireEvent.click(screen.getByRole('button', { name: NAME }))
    await screen.findByRole('dialog', { name: NAME })
    expect(pushOverlay).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: NAME }))
    await waitFor(() => { expect(release).toHaveBeenCalledTimes(1) })
  })

  it('closes the surface through its own close control and returns focus', async () => {
    const { face } = faceStub()
    renderEntry(face)

    const button = screen.getByRole('button', { name: NAME })
    fireEvent.click(button)
    fireEvent.click(await screen.findByLabelText('关闭项目管理'))

    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    // Focus comes back to the row that opened the surface, not to the page.
    expect(document.activeElement).toBe(button)
  })
})
