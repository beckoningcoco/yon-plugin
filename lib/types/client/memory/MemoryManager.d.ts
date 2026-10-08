import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProjectApi } from '../project/api.ts';
import type { MemoryApi } from './api.ts';
/** Props of the surface: the injected API, the project list, the copy seat, and the close verb. */
export interface MemoryManagerProps extends MemoryApi {
    readonly t: TranslateNS<'yonPanel'>;
    readonly listProjects: ProjectApi['listProjects'];
    onClose(): void;
}
/**
 * Render the memory dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export declare function MemoryManager({ list, read, remove, listProjects, onClose, t, }: MemoryManagerProps): import("react").JSX.Element;
