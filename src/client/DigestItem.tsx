/**
 * The panel's fifth built-in entry: one icon cell that opens the digestion ledger.
 *
 * Same gestures as its four siblings — a dialog rather than a region of the 280px
 * strip, the panel's own dismissals standing down while it is up, and focus handed
 * back to the cell on close. Only the mark and the surface differ.
 */
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { DigestItemFace } from './slots.ts'
import { DigestManager } from './digest/DigestManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the ledger operations.
 */
export type DigestItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<DigestItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a gauge with its needle — a reading, which is what this
 * surface is. Drawn here rather than imported so the mark does not track one
 * harness release's icon set.
 * @returns the decorative svg.
 */
function DigestMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.6 12.2a5.6 5.6 0 0 1 10.8 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M8 12.2 10.9 8.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M3.1 13.6h9.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the entry cell and, while open, the ledger surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export function DigestItem({ t, pushOverlay, ...api }: DigestItemProps) {
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
      <Tooltip label={t('item.digest')} side="bottom" delayMs={300}>
        <span className={css.cell}>
          <button
            ref={trigger}
            type="button"
            className={css.item}
            data-active={open ? '' : undefined}
            aria-label={t('item.digest')}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => { setOpen(value => !value) }}
          >
            <DigestMark />
          </button>
        </span>
      </Tooltip>
      {open && <DigestManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
