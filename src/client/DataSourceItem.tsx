/**
 * The panel's third built-in entry: one row that opens the datasource surface.
 *
 * The surface is a dialog rather than a region of the panel body — a 280px strip
 * cannot hold a list beside a connection's details — and this entry owns it, so
 * opening it needs no cross-seat coordination. While the surface is up the entry
 * also tells the panel to stand down, and when it closes the entry hands focus
 * back to the row that opened it. Both gestures are the ones the project entry
 * already makes; the mark, the name it is given, and the surface differ.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { DataSourceItemFace } from './slots.ts'
import { DataSourceManager } from './datasource/DataSourceManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * datasource operations, the project list, and the overlay announcement.
 */
export type DataSourceItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<DataSourceItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a stacked-disk cylinder, drawn here instead of imported so
 * the mark's shape and name do not track one harness release's icon set.
 * @returns the decorative svg.
 */
function DatabaseMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="3.9" rx="5.25" ry="2.15" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.75 3.9v8.2c0 1.19 2.35 2.15 5.25 2.15s5.25-.96 5.25-2.15V3.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.75 8c0 1.19 2.35 2.15 5.25 2.15S13.25 9.19 13.25 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the datasource surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function DataSourceItem({ t, label, pushOverlay, ...api }: DataSourceItemProps) {
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
        <DatabaseMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <DataSourceManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
