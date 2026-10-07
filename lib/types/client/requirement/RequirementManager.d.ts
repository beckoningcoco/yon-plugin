import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProjectApi } from '../project/api.ts';
import type { RequirementApi } from './api.ts';
/** Props of the surface: the injected APIs, the copy seat, and the close verb. */
export interface RequirementManagerProps extends RequirementApi {
    /**
     * 项目选择器的选项。
     *
     * 借的是项目 API 自己那一次调用，与数据源面板挑绑定项目同一个理由：再实现一遍就会多出
     * 第二份「哪些项目该出现在选择器里」的规则（归档的排不排除）。
     */
    listProjects: ProjectApi['listProjects'];
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the requirement ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export declare function RequirementManager({ list, read, create, annotate, update, archive, remove, fileList, fileRead, importFile, removeFile, listProjects, onClose, t, }: RequirementManagerProps): import("react").JSX.Element;
