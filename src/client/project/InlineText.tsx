/**
 * A value that is edited where it is read.
 *
 * The project name and its code are the two things an operator notices wrong a
 * second after creating a project, so they are editable in place rather than
 * behind a dialog: click the text, type, and leave. Enter and blur both commit,
 * Escape puts the stored value back, and a composition is never mistaken for a
 * submit (see {@link useComposingGuard}).
 */
import { useRef, useState } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useComposingGuard } from './useComposing.ts'
import css from './panel.module.css'

/** Props of one in-place editable value. */
export interface InlineTextProps {
  /** The stored value. */
  value: string
  /** Accessible name of the field; the value itself is the visible text. */
  label: string
  /** Hint shown inside the input while it is empty. */
  placeholder?: string
  /** What to show in place of an empty value when it is not being edited. */
  emptyText?: string
  /** Whether editing is refused (a call is in flight). */
  disabled?: boolean
  /** `title` renders at the surface's heading weight. */
  variant?: 'title' | 'value'
  /** Extra class for placement. */
  className?: string
  /**
   * Store the edited value. Never called with the unchanged value, and never
   * called when the edit was cancelled.
   * @param next - the value the operator left behind.
   */
  onCommit(next: string): void
}

/**
 * Render one editable text value.
 * @param props - stored value, copy, and the commit callback.
 * @returns the read view, or the input while editing.
 */
export function InlineText({
  value, label, placeholder, emptyText, disabled = false, variant = 'value', className, onCommit,
}: InlineTextProps) {
  const guard = useComposingGuard()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // One edit commits once: Enter and the blur it causes must not both store.
  const settled = useRef(false)

  const start = (): void => {
    if (disabled) return
    settled.current = false
    setDraft(value)
    setEditing(true)
  }

  const finish = (commit: boolean): void => {
    if (settled.current) return
    settled.current = true
    setEditing(false)
    if (!commit) return
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }

  if (!editing) {
    const shown = value === '' ? (emptyText ?? placeholder ?? '') : value
    return (
      <button
        type="button"
        className={[css.inlineText, variant === 'title' ? css.inlineTitle : css.inlineValue, value === '' ? css.inlineEmpty : '', className].filter(Boolean).join(' ')}
        aria-label={label}
        title={value === '' ? placeholder : value}
        disabled={disabled}
        onClick={start}
      >
        {shown}
      </button>
    )
  }

  return (
    <Input
      className={[css.inputFill, className].filter(Boolean).join(' ')}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      autoFocus
      onChange={event => { setDraft(event.target.value) }}
      onCompositionStart={guard.onCompositionStart}
      onCompositionEnd={guard.onCompositionEnd}
      onBlur={() => { finish(true) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          if (guard.isComposing(event)) return
          event.preventDefault()
          finish(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          finish(false)
        }
      }}
    />
  )
}
