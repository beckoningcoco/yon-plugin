import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RequirementItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's live open
 * state and this entry's name, and the inject face carries the ledger operations.
 */
export type RequirementItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<RequirementItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the requirement surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function RequirementItem({ t, label, pushOverlay, ...api }: RequirementItemProps): import("react").JSX.Element;
