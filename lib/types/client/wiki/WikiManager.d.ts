import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { WikiApi } from './api.ts';
/** Props the entry hands this surface. */
export interface WikiManagerProps extends WikiApi, PropsLocale<'yonPanel'> {
    /** Close the surface. */
    onClose(): void;
}
/**
 * Render the knowledge base dialog.
 * @param props - the wiki API, the copy, and the close gesture.
 * @returns the dialog.
 */
export declare function WikiManager({ listVaults, rebuildVault, recentWrites, onClose, t }: WikiManagerProps): import("react").JSX.Element;
