/**
 * 面板的第十个内建格子：一行，点开是模型在一个正在服务的进程里观测到什么、跑过什么命令。
 *
 * 与九个兄弟一样的手势——一个对话框而不是 280 像素条里的一块、面板自己的关闭动作在
 * 它升起时让位、关闭后焦点回到这一格。不同的只有标记、名字与里头那块面。
 *
 * 它与隔壁「记忆」「迭代」「需求」属于同一类：**这一格里装的东西是模型产生的**。
 * 但那三个格子里的内容是模型**写下**的（事实、短处、要做的事），而这一格是模型
 * **做过**的——它记录的是动作，不是结论。所以那块面上唯一的两件事（attach、停止会话）
 * 都只是让观测继续或停下，没有一处能替模型放开被拒的命令；见 `ArthasManager.tsx` 的头注释。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ArthasItemFace } from './slots.ts'
import { ArthasManager } from './arthas/ArthasManager.tsx'
import css from './panel-item.module.css'

/**
 * Composed props of this panel button seat: the owner share carries the panel's live
 * open state and this entry's name, and the inject face carries the debugger
 * operations.
 */
export type ArthasItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<ArthasItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: a pulse trace, which is what this cell is about — something
 * that is *running*, and what it did while it ran. Drawn here rather than imported
 * so the mark does not track one harness release's icon set, and deliberately not
 * the bookmark/page/magnifier the neighbours use: a row of cells sharing one mark is
 * a row nobody can tell apart at a glance.
 * @returns the decorative svg.
 */
function ArthasMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.6 8.4h2.6l1.5-4.2 2.3 8.4 1.6-5.4 1.1 1.2h3.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the debugger surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function ArthasItem({ t, label, pushOverlay, ...api }: ArthasItemProps) {
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
        <ArthasMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <ArthasManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
