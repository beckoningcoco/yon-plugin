/**
 * 面板内建的第九个格子：一行按钮，点开需求条目这一屏。
 *
 * 手势与旁边八个一样——开的是对话框而不是 280px 那条窄栏里的一块、打开期间面板自己的
 * 关闭手势让位、关掉后焦点还给这一行。不同的只有记号、面板给它的名字、以及里面那一屏。
 *
 * 侧栏标签是「需求」二字（需求设计文档 §十九.5），屏内标题仍是「需求条目」：侧栏那一列
 * 只放得下两个字的宽度，而屏内要让第一次点进来的人一眼看出这里记的是什么东西。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { RequirementItemFace } from './slots.ts'
import { RequirementManager } from './requirement/RequirementManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's live open
 * state and this entry's name, and the inject face carries the ledger operations.
 */
export type RequirementItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<RequirementItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a sheet with three lines and a tick — a list of things to do, one
 * of them done.
 * @returns the decorative svg.
 */
function LedgerMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.4 2.4h9.2v11.2H3.4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5.6 6.2h4.8M5.6 9h3.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M5.4 11.7l1.1 1.1 2.3-2.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the requirement surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function RequirementItem({ t, label, pushOverlay, ...api }: RequirementItemProps) {
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
        <LedgerMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <RequirementManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
