import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemoryItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's live
 * open state and this entry's name, and the inject face carries the memory operations
 * plus the project list the filter needs.
 */
export type MemoryItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<MemoryItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the memory surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function MemoryItem({ t, label, pushOverlay, ...api }: MemoryItemProps): import("react").JSX.Element;
