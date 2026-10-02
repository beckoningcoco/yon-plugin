/** The Yon sidebar-foot action and the panel it opens above itself. */

import { Fragment, useEffect, useRef, type CSSProperties } from 'react'
import {
  Tooltip, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { YonPanelItemRow, YonPanelRootFace, YonPanelSnapshot } from './slots.ts'
import css from './YonPanelRoot.module.css'

/** Composed props of the sidebar footer-action entry: all four shares, all derived. */
export type YonPanelRootProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsRenderSlots<'yon.panel.item'>
  & InjectFace<YonPanelRootFace>
  & PropsLocale<'yonPanel'>

/**
 * The panel's style for the frame between opening and the first measurement.
 *
 * `visibility: hidden` still lays the element out, which is the point: the
 * anchor hook has to measure a real height to place an upward panel, and
 * `display: none` would measure zero and bring back the bug this guards against.
 */
const HIDDEN_UNTIL_PLACED: CSSProperties = { visibility: 'hidden' }

/**
 * The trigger's glyph: a single-Y monogram in one icon-sized outlined block. It
 * is decorative — the button carries the accessible name — and both the border
 * and the letter take the theme's strongest foreground alias.
 * @returns the mark element.
 */
function YonMark() {
  return <span className={css.mark} aria-hidden="true">Y</span>
}

/**
 * Render the trigger and, while open, its surface above the trigger. The panel
 * hangs upward because the action sits at the sidebar foot, with the settings
 * row below it; the sidebar clips overflow, so the panel is a fixed-position
 * element placed from the trigger's measured rect rather than from document
 * flow. The trigger keeps one icon cell in both column widths.
 * @param props - composed slot props.
 * @returns the trigger plus the open panel.
 */
export function YonPanelRoot({
  usePanel, useItems, onToggle, onSetOpen, renderSlot, t,
}: YonPanelRootProps) {
  // The selector parameter is annotated so the hook's type stays readable no
  // matter how a given harness release types the injected `hooks` compartment.
  const open = usePanel((snapshot: YonPanelSnapshot) => snapshot.open)
  const overlayDepth = usePanel((snapshot: YonPanelSnapshot) => snapshot.overlayDepth)
  // The panel's rows: one per entry registered against its seat, in seat order.
  // The source hands back the same array until the registration or the language
  // moves, so reading it here costs no re-renders of its own. Annotated like the
  // selector above, and for the same reason — the row type is proved at the
  // inject site (the source this face carries is a `PanelSource<readonly
  // YonPanelItemRow[]>`, and the face's declaration is what the registration
  // checks), not re-derived from whatever the hook is typed as here.
  const items: readonly YonPanelItemRow[] = useItems((rows: readonly YonPanelItemRow[]) => rows)
  const root = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLElement | null>(null)
  const anchor = useAnchoredPosition({
    open,
    anchorRef: root,
    panelRef: panel,
    side: 'top',
    gap: 8,
    margin: 8,
  })
  // While a layer stands above the panel (the project surface and its dialogs),
  // its clicks are not outside clicks and its Escape is not the panel's.
  useDismissOnOutsidePointer(root, open && overlayDepth === 0, onSetOpen)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && overlayDepth === 0) onSetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [open, overlayDepth, onSetOpen])

  return (
    <div ref={root} className={css.action}>
      {/* Mounted whenever it is open, even before the first measurement: the
          anchor hook needs the panel's real height to place an upward panel
          (`top = anchorTop - gap - height`), and measuring a panel that is not
          mounted yet yields zero — which would hang the panel from its top edge
          and grow it downward over the sidebar. Hidden for that first frame
          instead, so nothing paints at the wrong place. */}
      {open && (
        <section
          ref={panel}
          className={css.panel}
          style={anchor ?? HIDDEN_UNTIL_PLACED}
          role="dialog"
          aria-label={t('panel.title')}
        >
          {/* No header bar. The panel's own name already sits on the trigger
              beside it, so a title row only repeats it — and on a 280px surface
              it costs a whole row of buttons. Escape, a click outside, or the
              trigger itself close the panel; the accessible name above keeps it
              announceable. */}
          <div className={css.body}>
            {/* One row per entry, each dispatched by its own registration id.
                The panel drives the row list from the seat instead of asking the
                seat to render itself: it knows which entries it hosts, in which
                order, under which names — and hands each entry its own name. The
                row still renders through the entry, because only the entry knows
                its glyph and the surface that glyph opens. */}
            {items.map(item => (
              <Fragment key={item.id}>
                {renderSlot('yon.panel.item', { open, label: item.label }, { only: item.id })}
              </Fragment>
            ))}
          </div>
        </section>
      )}
      <Tooltip label={t('trigger.label')} side="right" delayMs={400}>
        <button
          type="button"
          className={css.trigger}
          data-active={open ? '' : undefined}
          aria-expanded={open}
          aria-label={t('trigger.aria')}
          onClick={onToggle}
        >
          <YonMark />
        </button>
      </Tooltip>
    </div>
  )
}
