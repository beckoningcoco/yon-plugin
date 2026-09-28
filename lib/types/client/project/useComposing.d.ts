import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
/** The handlers a text field needs, plus the question to ask on Enter. */
export interface ComposingGuard {
    /** The operator started composing (an IME candidate window is open). */
    onCompositionStart(): void;
    /** The composition ended — either committed or discarded. */
    onCompositionEnd(): void;
    /**
     * Whether this key event belongs to an in-flight composition.
     * @param event - the field's key event.
     * @returns true when the key must not be read as a submit.
     */
    isComposing(event: ReactKeyboardEvent<HTMLElement>): boolean;
}
/**
 * Track one input's composition window.
 * @returns the composition handlers and the Enter guard.
 */
export declare function useComposingGuard(): ComposingGuard;
