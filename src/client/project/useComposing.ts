/**
 * The Enter that confirms an input-method composition is not a submit.
 *
 * Every text field in this surface submits on Enter, and the operators are
 * typing Chinese: pressing Enter to pick a pinyin candidate is the normal way to
 * finish a word, not a request to create a project whose name is the half-typed
 * "环境信". A key event carries no reliable cross-browser "this Enter was mine"
 * flag on its own, so the guard tracks the composition window itself and also
 * honours the native flag when the browser does set it.
 */
import { useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** The handlers a text field needs, plus the question to ask on Enter. */
export interface ComposingGuard {
  /** The operator started composing (an IME candidate window is open). */
  onCompositionStart(): void
  /** The composition ended — either committed or discarded. */
  onCompositionEnd(): void
  /**
   * Whether this key event belongs to an in-flight composition.
   * @param event - the field's key event.
   * @returns true when the key must not be read as a submit.
   */
  isComposing(event: ReactKeyboardEvent<HTMLElement>): boolean
}

/**
 * Track one input's composition window.
 * @returns the composition handlers and the Enter guard.
 */
export function useComposingGuard(): ComposingGuard {
  const composing = useRef(false)
  return useMemo(() => ({
    onCompositionStart: () => { composing.current = true },
    onCompositionEnd: () => { composing.current = false },
    // Some engines clear `isComposing` before the closing keydown arrives; the
    // deprecated 229 code is the only signal left in that window.
    isComposing: (event: ReactKeyboardEvent<HTMLElement>): boolean =>
      composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229,
  }), [])
}
