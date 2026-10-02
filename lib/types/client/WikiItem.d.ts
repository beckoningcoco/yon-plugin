import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WikiItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * knowledge base operations.
 */
export type WikiItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<WikiItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the knowledge base surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function WikiItem({ t, label, pushOverlay, ...api }: WikiItemProps): import("react").JSX.Element;
