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

/**
 * What the anchor hook reports. Hoisted so the mock factory below can read it,
 * and mutable so a case can stand in for the frame before the first measurement
 * (when a real hook has no coordinates yet).
 */
const anchorState = vi.hoisted(() => ({
  value: { left: 12, top: 12 } as Record<string, unknown> | null,
}))

afterEach(() => {
  cleanup()
  anchorState.value = { left: 12, top: 12 }
})

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

/** The trigger's accessible name, which is also the panel's. */
const TRIGGER = 'Yon 按钮面板'

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

  it('closes from the trigger itself, since the panel has no header', () => {
    harness()
    const trigger = screen.getByRole('button', { name: TRIGGER })

    // The title row and its close button are gone: the panel's name already sits
    // on the trigger, so the trigger is the control that closes it.
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts the panel before it has coordinates, hidden', () => {
    // The regression this guards: an upward panel is placed at
    // `anchorTop - gap - height`, so a panel that is not mounted for the first
    // measurement reports height zero and hangs downward over the sidebar. It
    // has to be in the layout from the first frame, just not visible yet.
    anchorState.value = null
    harness()

    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))

    // Queried by role alone, with `hidden: true`: a hidden element sits outside
    // the accessibility tree, so it has no accessible name left to match on —
    // and being laid out yet unpainted is exactly the state under test.
    const panel = screen.getByRole('dialog', { hidden: true })
    expect(panel.style.visibility).toBe('hidden')
    expect(panel.style.top).toBe('')
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

    fireEvent.click(screen.getByRole('button', { name: 'Yon button panel' }))

    expect(screen.getByRole('dialog', { name: 'Yon button panel' })).toBeTruthy()
    // The headerless panel owns no close control of its own.
    expect(screen.queryByRole('button', { name: 'Close panel' })).toBeNull()
  })
})

// The baseline UI kit is supplied by the DSH page at runtime, and its published
// client half is a loader artifact rather than source. The specs stub it, so the
// unit under test is this plugin's own surface.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: ReactElement }) => children,
  useAnchoredPosition: () => anchorState.value,
  useDismissOnOutsidePointer: () => {},
}))
