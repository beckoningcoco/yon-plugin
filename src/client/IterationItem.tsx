/**
 * The panel's seventh built-in entry: one row that opens the iteration ledger.
 *
 * Same gestures as its six siblings — a dialog rather than a region of the 280px
 * strip, the panel's own dismissals standing down while it is up, and focus handed
 * back to the row on close. The mark, the name it is given, and the surface differ.
 *
 * The one thing that differs in kind rather than in appearance: this is the second
 * cell on the panel that reports on the model's own work rather than on the
 * operator's material, and the only one the model writes to. That is why its
 * surface refuses to let the model change anything it wrote — see
 * `iteration/IterationManager.tsx`.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { IterationItemFace } from './slots.ts'
import { IterationManager } from './iteration/IterationManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the ledger
 * operations.
 */
export type IterationItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<IterationItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a page with a folded corner and two written lines — a stack of
 * notes, which is what the surface is. Drawn here rather than imported so the mark
 * does not track one harness release's icon set.
 * @returns the decorative svg.
 */
function IterationMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2.2h5.3l3.1 3.2v8.4H4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9.3 2.2v3.2h3.1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path
        d="M6.1 8.1h4.2M6.1 10.5h2.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the ledger surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function IterationItem({ t, label, pushOverlay, ...api }: IterationItemProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  // The face may be rebuilt by the host between renders; the announcement must
  // still be made once per opening, with the newest function available.
  const announce = useRef(pushOverlay)
  announce.current = pushOverlay
  const wasOpen = useRef(false)

  // The panel's dismissals stand down for exactly as long as the surface is up.
  useEffect(() => {
    if (!open) return
    const release = announce.current()
    return () => { release() }
  }, [open])

  // Closing hands focus back to the cell, rather than dropping it on the page.
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <>
      {/* The panel's name for this row is its visible text, which is also its
          accessible name — nothing restates the line the pointer is already on. */}
      <button
        ref={trigger}
        type="button"
        className={css.item}
        data-active={open ? '' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(value => !value) }}
      >
        <IterationMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <IterationManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
