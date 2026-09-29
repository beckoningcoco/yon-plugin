import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { DigestItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the ledger operations.
 */
export type DigestItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<DigestItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry cell and, while open, the ledger surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export declare function DigestItem({ t, pushOverlay, ...api }: DigestItemProps): import("react").JSX.Element;
