import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NccApiItemFace } from './slots.ts';
/** 组合后的 props。 */
export type NccApiItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<NccApiItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the API surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function NccApiItem({ t, label, pushOverlay, ...api }: NccApiItemProps): import("react").JSX.Element;
