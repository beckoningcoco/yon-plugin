import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** What the dialog hands back on create. */
export interface CreateProjectDraft {
    /** Trimmed, non-empty name. */
    readonly name: string;
    /** Trimmed code; empty when the operator left it alone. */
    readonly code: string;
}
/** Props of the create dialog. */
export interface CreateProjectDialogProps {
    /** Whether the dialog is showing. */
    open: boolean;
    /** Copy seat. */
    t: TranslateNS<'yonPanel'>;
    /** Leave without creating. */
    onCancel(): void;
    /**
     * Create the project. A rejection is reported inside the dialog, which stays
     * open so the operator can correct the name instead of retyping it.
     * @param draft - the trimmed name and code.
     */
    onCreate(draft: CreateProjectDraft): Promise<void>;
}
/**
 * Render the create-project dialog.
 * @param props - open state, copy, cancel and create verbs.
 * @returns the dialog, or nothing while it is closed.
 */
export declare function CreateProjectDialog({ open, t, onCancel, onCreate }: CreateProjectDialogProps): import("react").JSX.Element;
