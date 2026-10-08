/**
 * 面板的第九个内建格子：一行，点开是某个项目上记下来的事实。
 *
 * 与八个兄弟一样的手势——一个对话框而不是 280 像素条里的一块、面板自己的关闭动作在
 * 它升起时让位、关闭后焦点回到这一格。不同的只有标记、名字与里头那块面。
 *
 * 它和隔壁「需求」都属于同一类：**这一格里装的东西主要是模型写的**（需求条目是本轮
 * 的工作记录，记忆是项目上查出来的事实）。也正因为如此，那块面把人能做的事收窄到了
 * 「看」和「删」——见 `memory/MemoryManager.tsx` 的头注释。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryItemFace } from './slots.ts'
import { MemoryManager } from './memory/MemoryManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's live
 * open state and this entry's name, and the inject face carries the memory operations
 * plus the project list the filter needs.
 */
export type MemoryItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<MemoryItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a bookmark, which is what a memory is — something worth keeping
 * and coming back to. Drawn here rather than imported so the mark does not track one
 * harness release's icon set. Deliberately not the folded page the iteration and
 * requirement cells use: three cells in a row with one mark would be three cells
 * nobody can tell apart at a glance.
 * @returns the decorative svg.
 */
function MemoryMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.6 2.4h6.8v11.2L8 11.1l-3.4 2.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.6 5.4h2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the memory surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function MemoryItem({ t, label, pushOverlay, ...api }: MemoryItemProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  // The face may be rebuilt by the host between renders; the announcement must still
  // be made once per opening, with the newest function available.
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
        <MemoryMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <MemoryManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
