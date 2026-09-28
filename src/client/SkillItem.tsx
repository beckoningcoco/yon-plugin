/**
 * The panel's second built-in entry: one icon cell that opens the skill surface.
 *
 * Like the project cell it owns the dialog it opens, so opening it needs no
 * cross-seat coordination and the panel's own dismissals stand down while it is
 * up. The two cells are one visual part by construction — they share the entry
 * stylesheet — because a panel whose buttons are laid out differently from each
 * other reads as two features that happened to land in the same box.
 */
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillItemFace } from './slots.ts'
import { SkillManager } from './skill/SkillManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the skill operations plus the
 * overlay announcement.
 */
export type SkillItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<SkillItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a sheet with a folded corner. Drawn here instead of
 * imported, so the mark's shape tracks nothing but this file.
 * @returns the decorative svg.
 */
function DocMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.6 2.3h5.3l3.5 3.5v6.9a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.2a.9.9 0 0 1 .9-.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.75 2.5v3.4h3.4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Render the entry cell and, while open, the skill surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export function SkillItem({ t, pushOverlay, ...api }: SkillItemProps) {
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
      <Tooltip label={t('item.skills')} side="bottom" delayMs={300}>
        <span className={css.cell}>
          <button
            ref={trigger}
            type="button"
            className={css.item}
            data-active={open ? '' : undefined}
            aria-label={t('item.skills')}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => { setOpen(value => !value) }}
          >
            <DocMark />
          </button>
        </span>
      </Tooltip>
      {open && <SkillManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
