/**
 * The panel's eighth built-in entry: one row that opens the browser surface.
 *
 * Same gestures as its seven siblings — a dialog rather than a region of the 280px strip,
 * the panel's own dismissals standing down while it is up, and focus handed back to the
 * row on close. The mark, the name it is given, and the surface differ.
 *
 * 「浏览器」 here is the *debug* browser this surface starts — not the browser the panel
 * is running in. The repo already calls the client half 「浏览器半」, which is why the
 * entry's own copy names a debug port rather than leaving the word to carry both.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserItemFace } from './slots.ts'
import { BrowserManager } from './browser/BrowserManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's live open
 * state and this entry's name, and the inject face carries the browser operations.
 */
export type BrowserItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<BrowserItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a browser window with its address bar.
 * @returns the decorative svg.
 */
function WindowMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.9 6.1h12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="4.1" cy="4.5" r="0.7" fill="currentColor" />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the browser surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function BrowserItem({ t, label, pushOverlay, ...api }: BrowserItemProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  // The face may be rebuilt by the host between renders; the announcement must still be
  // made once per opening, with the newest function available.
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
      {/* The panel's name for this row is its visible text, which is also its accessible
          name — nothing restates the line the pointer is already on. */}
      <button
        ref={trigger}
        type="button"
        className={css.item}
        data-active={open ? '' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(value => !value) }}
      >
        <WindowMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <BrowserManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
