/**
 * The panel's sixth built-in entry: one row that opens the installation surface.
 *
 * Same gestures as its five siblings — a dialog rather than a region of the 280px
 * strip, the panel's own dismissals standing down while it is up, and focus handed
 * back to the row on close. The mark, the name it is given, and the surface differ.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { HomeItemFace } from './slots.ts'
import { HomeManager } from './home/HomeManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the Home
 * operations and the overlay announcement.
 */
export type HomeItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<HomeItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a house — the directory an installation lives in, which is
 * the whole of what this surface registers. Drawn here rather than imported so
 * the mark does not track one harness release's icon set.
 * @returns the decorative svg.
 */
function HomeMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.1 8 2.6l5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 7.4v5.6a.7.7 0 0 0 .7.7h6.6a.7.7 0 0 0 .7-.7V7.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 13.7V10h2.4v3.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the installation surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function HomeItem({ t, label, pushOverlay, ...api }: HomeItemProps) {
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
        <HomeMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <HomeManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
