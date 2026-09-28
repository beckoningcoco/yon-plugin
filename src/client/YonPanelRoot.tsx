/** The yon_btn sidebar-foot action and the panel it opens above itself. */

import { useEffect, useRef } from 'react'
import {
  Tooltip, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { YonPanelRootFace, YonPanelSnapshot } from './slots.ts'
import css from './YonPanelRoot.module.css'

/** Composed props of the sidebar footer-action entry: all four shares, all derived. */
export type YonPanelRootProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsRenderSlots<'yon.panel.item'>
  & InjectFace<YonPanelRootFace>
  & PropsLocale<'yonPanel'>

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
export function YonPanelRoot({ usePanel, onToggle, onSetOpen, renderSlot, t }: YonPanelRootProps) {
  // The selector parameter is annotated so the hook's type stays readable no
  // matter how a given harness release types the injected `hooks` compartment.
  const open = usePanel((snapshot: YonPanelSnapshot) => snapshot.open)
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
  useDismissOnOutsidePointer(root, open, onSetOpen)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onSetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [open, onSetOpen])

  return (
    <div ref={root} className={css.action}>
      {open && anchor !== null && (
        <section
          ref={panel}
          className={css.panel}
          style={anchor}
          role="dialog"
          aria-label={t('panel.title')}
        >
          <header className={css.header}>
            <span className={css.title}>{t('panel.title')}</span>
            <button
              type="button"
              className={css.close}
              aria-label={t('panel.close')}
              onClick={() => { onSetOpen(false) }}
            >
              ×
            </button>
          </header>
          <div className={css.body}>
            {renderSlot('yon.panel.item', { open })}
          </div>
        </section>
      )}
      <Tooltip label={t('panel.title')} side="right" delayMs={400}>
        <button
          type="button"
          className={css.trigger}
          data-active={open ? '' : undefined}
          aria-expanded={open}
          aria-label={t('trigger.label')}
          onClick={onToggle}
        >
          <YonMark />
        </button>
      </Tooltip>
    </div>
  )
}
