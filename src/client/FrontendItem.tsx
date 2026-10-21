/**
 * The panel's front-end-source entry: one row that opens the source surface.
 *
 * Same gestures as its siblings — a dialog rather than a region of the 280px
 * strip, the panel's own dismissals standing down while it is up, and focus handed
 * back to the row on close. The mark, the name it is given, and the surface differ.
 *
 * The row is here rather than inside the Manager because the seat's projection
 * names every entry before any of them is mounted (`item-rows.ts`), and an entry
 * that is only reachable from inside itself would be a button the panel cannot
 * label.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { FrontendItemFace } from './slots.ts'
import { CodeMark, FrontendManager } from './frontend/FrontendManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * front-end source operations and the overlay announcement.
 */
export type FrontendItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<FrontendItemFace>
  & PropsLocale<'yonPanel'>

/**
 * Render the entry row and, while open, the source surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function FrontendItem({ t, label, pushOverlay, ...api }: FrontendItemProps) {
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
        <CodeMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <FrontendManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
