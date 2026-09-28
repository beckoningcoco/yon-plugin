import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { DataSourceApi } from './api.ts';
import type { DataSourceItemFace } from '../slots.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface DataSourceManagerProps extends DataSourceApi {
    readonly t: TranslateNS<'yonPanel'>;
    /**
     * The projects a connection may be bound to. Borrowed from the entry's face
     * rather than redeclared, so the picker and the project surface cannot come to
     * name two different sets.
     */
    listProjects: DataSourceItemFace['listProjects'];
    onClose(): void;
}
/**
 * Render the datasource surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export declare function DataSourceManager({ t, onClose, ...api }: DataSourceManagerProps): import("react").JSX.Element;
