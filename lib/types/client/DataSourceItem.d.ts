import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { DataSourceItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the datasource operations, the
 * project list, and the overlay announcement.
 */
export type DataSourceItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<DataSourceItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry cell and, while open, the datasource surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export declare function DataSourceItem({ t, pushOverlay, ...api }: DataSourceItemProps): import("react").JSX.Element;
