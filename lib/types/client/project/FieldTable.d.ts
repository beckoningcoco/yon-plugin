import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { JsonValue } from '../../shared/types.ts';
/** Props of the field table. */
export interface FieldTableProps {
    /** Project the rows belong to; changing it drops every draft and row state. */
    projectId: string;
    /** Stored fields, keyed by the operator's own name. */
    fields: Record<string, JsonValue>;
    /** Copy seat. */
    t: TranslateNS<'yonPanel'>;
    /**
     * Store one field.
     * @param fieldKey - the field's name.
     * @param value - parsed value.
     */
    onSave(fieldKey: string, value: JsonValue): Promise<void>;
    /**
     * Remove one field.
     * @param fieldKey - the field's name.
     */
    onRemove(fieldKey: string): Promise<void>;
    /** Whether the "add a field" row is open. */
    adding: boolean;
    /** Open or close the "add a field" row. */
    onAddingChange(adding: boolean): void;
}
/**
 * Render the field table.
 * @param props - project identity, stored fields, and the table's verbs.
 * @returns the rows, the add-field row, and the removal confirmation.
 */
export declare function FieldTable({ projectId, fields, t, onSave, onRemove, adding, onAddingChange, }: FieldTableProps): import("react").JSX.Element;
