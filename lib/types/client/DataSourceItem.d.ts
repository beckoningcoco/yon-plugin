import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { DataSourceItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * datasource operations, the project list, and the overlay announcement.
 */
export type DataSourceItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<DataSourceItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the datasource surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function DataSourceItem({ t, label, pushOverlay, ...api }: DataSourceItemProps): import("react").JSX.Element;
