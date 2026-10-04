import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { BrowserItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's live open
 * state and this entry's name, and the inject face carries the browser operations.
 */
export type BrowserItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<BrowserItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the browser surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function BrowserItem({ t, label, pushOverlay, ...api }: BrowserItemProps): import("react").JSX.Element;
