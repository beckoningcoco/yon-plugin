/**
 * The panel's fourth built-in entry: one row that opens the knowledge base
 * surface.
 *
 * Same gestures as its three siblings — a dialog rather than a region of the
 * 280px strip, the panel's own dismissals standing down while it is up, and focus
 * handed back to the row on close. The mark, the name it is given, and the
 * surface differ.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { WikiItemFace } from './slots.ts'
import { WikiManager } from './wiki/WikiManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * knowledge base operations.
 */
export type WikiItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<WikiItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: an open book with a bookmark, drawn here instead of imported
 * so the mark's shape does not track one harness release's icon set.
 * @returns the decorative svg.
 */
function WikiMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.75 3.25h4.1c.66 0 1.15.53 1.15 1.18v8.32H3.9a1.15 1.15 0 0 1-1.15-1.15z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M13.25 3.25h-4.1c-.66 0-1.15.53-1.15 1.18v8.32h4.1a1.15 1.15 0 0 0 1.15-1.15z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 4.43c-.55-.55-1.3-.9-2.15-.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the knowledge base surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function WikiItem({ t, label, pushOverlay, ...api }: WikiItemProps) {
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
        <WikiMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <WikiManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
