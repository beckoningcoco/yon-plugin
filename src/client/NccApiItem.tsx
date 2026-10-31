/**
 * The panel's API-call entry: one row that opens the NCC OpenAPI surface.
 *
 * 和 data source 那一行同一套手势：打开时告诉面板"上面压了一层"（面板停止响应
 * Escape 与外部点击），关闭时把焦点还给这个按钮。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { NccApiItemFace } from './slots.ts'
import { NccApiManager } from './nccapi/NccApiManager.tsx'
import css from './panel-item.module.css'

/** 组合后的 props。 */
export type NccApiItemProps =
  PropsRuntime<'yon.panel.item'>
  & InjectFace<NccApiItemFace>
  & PropsLocale<'yonPanel'>

/**
 * The entry's glyph: braces, the shape an API call has.
 * @returns the decorative svg.
 */
function BracesMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.4 2.8c-1.5 0-2 .7-2 2v1.4c0 .9-.4 1.4-1.2 1.4.8 0 1.2.5 1.2 1.4V11c0 1.3.5 2 2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.6 2.8c1.5 0 2 .7 2 2v1.4c0 .9.4 1.4 1.2 1.4-.8 0-1.2.5-1.2 1.4V11c0 1.3-.5 2-2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the entry row and, while open, the API surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export function NccApiItem({ t, label, pushOverlay, ...api }: NccApiItemProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const announce = useRef(pushOverlay)
  announce.current = pushOverlay
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) return
    const release = announce.current()
    return () => { release() }
  }, [open])

  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={css.item}
        data-active={open ? '' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(value => !value) }}
      >
        <BracesMark />
        <span className={css.label}>{label}</span>
      </button>
      {open && <NccApiManager t={t} onClose={() => { setOpen(false) }} {...api} />}
    </>
  )
}
