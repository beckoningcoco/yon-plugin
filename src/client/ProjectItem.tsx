/**
 * The panel's built-in entry: one icon cell that opens the project surface.
 *
 * The surface is a fixed-position overlay rather than a region of the panel body
 * — a 280px strip cannot hold a list plus an editable field table — and this
 * entry owns it, so opening it needs no cross-seat coordination.
 */
import { useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectItemFace } from './slots.ts'
import { ProjectManager } from './project/ProjectManager.tsx'
import css from './ProjectItem.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the project operations.
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
 * Render the entry cell and, while open, the project surface.
 * @param props - composed slot props.
 * @returns the cell, plus the overlay when it is showing.
 */
export function ProjectItem({ t, ...api }: ProjectItemProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip label={t('item.project')} side="bottom" delayMs={300}>
        <button
          type="button"
          className={css.item}
          data-active={open ? '' : undefined}
          aria-label={t('item.project')}
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          <FolderMark />
        </button>
      </Tooltip>
      {open && <ProjectManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
