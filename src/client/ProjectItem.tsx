/** The panel's built-in Project management entry: one icon cell, described on hover. */

import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ProjectItem.module.css'

/**
 * Composed props of one panel button seat. The owner share carries the panel's
 * live open state; this entry is interactive chrome for the section it will
 * open, so it renders its own label instead of the panel's copy.
 */
export type ProjectItemProps =
  PropsRuntime<'yon.panel.item'>
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
 * Render the Project management entry: an icon cell whose full description
 * arrives on hover and as the accessible name, so the panel stays a compact
 * grid of glyphs while every entry stays identifiable.
 * @param props - composed slot props.
 * @returns the entry button.
 */
export function ProjectItem({ t }: ProjectItemProps) {
  return (
    <Tooltip label={t('item.project')} side="bottom" delayMs={300}>
      <button
        type="button"
        className={css.item}
        aria-label={t('item.project')}
      >
        <FolderMark />
      </button>
    </Tooltip>
  )
}
