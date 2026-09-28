import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SkillItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the skill operations plus the
 * overlay announcement.
 */
export type SkillItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<SkillItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry cell and, while open, the skill surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export declare function SkillItem({ t, pushOverlay, ...api }: SkillItemProps): import("react").JSX.Element;
