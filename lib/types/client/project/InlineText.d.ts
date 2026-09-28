/** Props of one in-place editable value. */
export interface InlineTextProps {
    /** The stored value. */
    value: string;
    /** Accessible name of the field; the value itself is the visible text. */
    label: string;
    /** Hint shown inside the input while it is empty. */
    placeholder?: string;
    /** What to show in place of an empty value when it is not being edited. */
    emptyText?: string;
    /** Whether editing is refused (a call is in flight). */
    disabled?: boolean;
    /** `title` renders at the surface's heading weight. */
    variant?: 'title' | 'value';
    /** Extra class for placement. */
    className?: string;
    /**
     * Store the edited value. Never called with the unchanged value, and never
     * called when the edit was cancelled.
     * @param next - the value the operator left behind.
     */
    onCommit(next: string): void;
}
/**
 * Render one editable text value.
 * @param props - stored value, copy, and the commit callback.
 * @returns the read view, or the input while editing.
 */
export declare function InlineText({ value, label, placeholder, emptyText, disabled, variant, className, onCommit, }: InlineTextProps): import("react").JSX.Element;
