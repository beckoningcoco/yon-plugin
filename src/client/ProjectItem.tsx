/**
 * The panel's built-in entry: one row that opens the project surface.
 *
 * The row is the panel's — it decides which entries exist, in what order, and
 * under what names — and this entry supplies the two things only it knows: the
 * glyph, and the surface the glyph opens. So the name arrives as an owner prop
 * instead of being read from this package's dictionary, and what stays here is
 * the open state of this one surface.
 *
 * The surface is a dialog rather than a region of the panel body — a 280px strip
 * cannot hold a list beside a field table — and this entry owns it, so opening it
 * needs no cross-seat coordination. While the surface is up the entry also tells
 * the panel to stand down, and when it closes the entry hands focus back to the
 * row that opened it.
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectItemFace } from './slots.ts'
import { ProjectManager } from './project/ProjectManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the project
 * operations plus the overlay announcement.
 */
export type ProjectItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<ProjectItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a filing-box outline drawn here instead of imported, so the
 * mark's shape and name do not track one harness release's icon set.
 * @returns the decorative svg.
 */
function FolderMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="1.75"
        y="3.25"
        width="12.5"
        height="9.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M1.75 6h12.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.25 3.25V2.4a.9.9 0 0 1 .9-.9h3.7a.9.9 0 0 1 .9.9v.85"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the project surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function ProjectItem({ t, label, pushOverlay, ...api }: ProjectItemProps) {
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
      {/* The name is visible text, so the button takes its accessible name from
          its own content: no `aria-label` restating what the row already shows,
          and no tooltip repeating the line the pointer is already on. The glyph
          is hidden from the accessibility tree — it is the anchor, not the name. */}
      <button
        ref={trigger}
        type="button"
        className={css.item}
        data-active={open ? '' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(value => !value) }}
      >
        <FolderMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <ProjectManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
