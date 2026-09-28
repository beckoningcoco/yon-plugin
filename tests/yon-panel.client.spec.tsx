// @vitest-environment jsdom
/**
 * The panel shell: the sidebar-foot trigger, the panel it opens, and the two
 * dismissals the panel yields while something stands above it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { createYonPanelStore } from '../src/client/panel-store.ts'
import { en, zh } from '../src/client/locales.ts'
import { YonPanelRoot, type YonPanelRootProps } from '../src/client/YonPanelRoot.tsx'

afterEach(cleanup)

/**
 * The shares this surface actually reads. The framework's global standard seats
 * (`useSessions`, `useWorkspaces`, `useSessionPendingInteraction`) are delivered
 * to every root-scope component but never read here, so the harness types only
 * the driven shares (including the sidebar's own `wide` column state) and adapts
 * the component to them.
 */
type HarnessProps = Pick<
  YonPanelRootProps,
  'wide' | 'usePanel' | 'onToggle' | 'onSetOpen' | 'renderSlot' | 't'
>

const Panel = YonPanelRoot as unknown as (props: HarnessProps) => ReactElement

/** Translate through one dictionary, falling back to the key (as the `t` seat does). */
const seatOver = (dict: Record<string, string>) => (key: string): string => dict[key] ?? key

/** The snapshot shape the panel hook selects over. */
type PanelSnapshot = { readonly open: boolean; readonly overlayDepth: number }

/** Bind a store as the framework binds a `hooks` source: one selector hook per source. */
const panelHook = (store: ReturnType<typeof createYonPanelStore>): HarnessProps['usePanel'] =>
  <T,>(select: (snapshot: PanelSnapshot) => T): T => select(useSyncExternalStore(
    onStoreChange => store.subscribe(onStoreChange),
    () => store.getSnapshot(),
  ))

function harness(renderSlot = vi.fn(() => <span>contributed</span>), wide = true) {
  const store = createYonPanelStore()
  const props: HarnessProps = {
    wide,
    usePanel: panelHook(store),
    onToggle: () => { store.toggle() },
    onSetOpen: (open) => {
      if (open) store.open()
      else store.close()
    },
    renderSlot,
    t: seatOver(zh),
  }
  return { store, renderSlot, ...render(<Panel {...props} />) }
}

/** The trigger's accessible name, which is the panel's own name. */
const TRIGGER = 'yon 面板'

describe('yon panel surface', () => {
  it('renders the closed mark trigger and no panel', () => {
    harness()
    const trigger = screen.getByRole('button', { name: TRIGGER })

    // The mark is decorative copy; the button's accessible name is the label.
    expect(trigger.textContent).toBe('Y')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps its icon cell in the collapsed rail', () => {
    harness(undefined, false)

    // The action owns one icon cell in both column widths: the rail centers it
    // rather than hiding it.
    expect(screen.getByRole('button', { name: TRIGGER })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the panel on the trigger gesture and renders the declared seat', () => {
    const { renderSlot } = harness()

    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    expect(screen.getByRole('dialog', { name: TRIGGER })).toBeTruthy()
    expect(screen.getByText('contributed')).toBeTruthy()
    expect(renderSlot).toHaveBeenCalledWith('yon.panel.item', { open: true })
  })

  it('closes from the panel close control', () => {
    harness()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    fireEvent.click(screen.getByRole('button', { name: '关闭面板' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape while open', () => {
    harness()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves Escape to the layer above while one is up', () => {
    const { store } = harness()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    // The project surface announces itself; from then on one Escape closes that
    // surface, not the panel behind it.
    let release = (): void => {}
    act(() => { release = store.pushOverlay() })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()

    act(() => { release() })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores other keys', () => {
    harness()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('carries the English copy when that dictionary is active', () => {
    const store = createYonPanelStore()
    const props: HarnessProps = {
      wide: true,
      usePanel: panelHook(store),
      onToggle: () => { store.toggle() },
      onSetOpen: (open) => {
        if (open) store.open()
        else store.close()
      },
      renderSlot: vi.fn(() => null),
      t: seatOver(en),
    }
    render(<Panel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'yon panel' }))

    expect(screen.getByRole('dialog', { name: 'yon panel' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeTruthy()
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
