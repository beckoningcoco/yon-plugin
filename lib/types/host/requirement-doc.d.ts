/**
 * The text layer of a requirement entry: `entry.md`'s frontmatter, its body, and
 * the strikethrough convention that turns one file into a ledger.
 *
 * Pure on purpose — no `node:fs`, no clock, no exceptions. Everything here is a
 * rule about text, and both `requirement-store.ts` (which moves bytes) and
 * `requirement-service.ts` (which decides what to write) depend on the same
 * rules, so they live in one place instead of being spelled twice and drifting.
 *
 * ## What the file looks like
 *
 *     ---
 *     name: H1-00 固定资产接口对接
 *     status: working
 *     created: 2026-09-12T03:11:20.000Z
 *     updated: 2026-10-05T06:02:41.000Z
 *     ---
 *
 *     写清这个需求是什么。
 *
 *     ## 标注
 *
 *     2026-09-12 使用者提供的资料：华科给的三个接口文档。
 *     ~~字段 A 必填~~ → 使用者澄清：可空。
 *
 * Three things about that shape are deliberate:
 *
 * - **frontmatter keys are English.** `name:`/`status:` rather than `名称:`/`状态:`.
 *   It is read by code and written by code, and the status value has to be one of
 *   `REQUIREMENT_STATUSES`; keeping the surface ASCII means no half-width /
 *   full-width colon ambiguity in a parser that has to be certain. The Chinese
 *   status names exist only for display (`REQUIREMENT_STATUS_TEXT`).
 * - **facts in frontmatter, prose after it.** The frontmatter is rewritten in
 *   place with no trace (see `withFields`), because a machine needs one current
 *   value, not a history of them.
 * - **history goes in the notes, never by rewriting a line.** A note is appended
 *   and never edited; a claim that turns out wrong is struck through and the new
 *   claim appended under it. Two readers get two renderings: `bodyText()` returns
 *   the model's copy (strikethrough removed — the model needs what is true now),
 *   `bodyText(doc, { keepStrikethrough: true })` returns the human's copy.
 */
import { type RequirementStatus } from '../shared/types.ts';
/** One entry's parsed content. */
export interface RequirementEntryDoc {
    readonly name: string;
    readonly status: RequirementStatus;
    /** ISO 时间戳，来自 frontmatter。 */
    readonly created: string;
    /** ISO 时间戳，来自 frontmatter；每次写入都要往前推。 */
    readonly updated: string;
    /** 这一条需求是什么。删除线原样保留。 */
    readonly body: string;
    /** 追加段，最早的在前。删除线原样保留。 */
    readonly notes: readonly string[];
}
/** The Chinese name of one status, as a person reads it in prose and on screen. */
export declare const REQUIREMENT_STATUS_TEXT: Record<RequirementStatus, string>;
/**
 * Parse one `entry.md`.
 *
 * @param text - the file's whole content.
 * @returns the document, or undefined when the file does not carry the shape
 *   above. Undefined is the honest answer for a file that has been replaced,
 *   truncated, or hand-edited into something else — the caller reports it as a
 *   broken entry rather than guessing a name out of the wreckage.
 */
export declare function parseEntry(text: string): RequirementEntryDoc | undefined;
/**
 * Write one `entry.md`.
 *
 * The inverse of {@link parseEntry} for every document that function returns:
 * `parseEntry(serializeEntry(doc))` gives back the same fields. Blank lines inside
 * the body are preserved; blank lines at either end are not, because they carry no
 * meaning here and would otherwise accumulate on every rewrite.
 */
export declare function serializeEntry(doc: RequirementEntryDoc): string;
/**
 * The entry's full text as one reader or the other should see it.
 *
 * @param doc - a parsed entry.
 * @param options.keepStrikethrough - true gives the human's copy (history intact),
 *   omitted gives the model's copy (struck spans removed).
 * @returns body and notes joined, notes under their heading. Notes that are
 *   entirely struck through disappear from the model's copy along with the heading
 *   if they all do — an empty 「## 标注」 reads as "there is nothing to know here",
 *   which in that state is true.
 */
export declare function bodyText(doc: RequirementEntryDoc, options?: {
    readonly keepStrikethrough?: boolean;
}): string;
/**
 * Remove every `~~struck~~` span.
 *
 * What is left behind is deliberate and looks a little odd: the arrow and the
 * replacement stay, so `~~A 必填~~ → 使用者澄清：可空` reaches the model as
 * `→ 使用者澄清：可空`. The result is not prose, but it is honest — the model sees
 * that a position was revised without being told the superseded position as if it
 * still held.
 */
export declare function stripStrikethrough(text: string): string;
/**
 * `YYYY-MM-DD` for the day the operator is actually having.
 *
 * The date stamps on notes are the one timestamp a person reads and compares
 * against a calendar, so this is the one that must be local.
 */
export declare function localDate(date: Date): string;
/**
 * The line the host appends when a frontmatter field changes.
 *
 * Strikethrough cannot reach inside the frontmatter (there is no prose there to
 * strike), so a field change leaves its trace in the notes instead. The host
 * writes this, not the model: `IterationRowView.at` sets the precedent — the
 * session's own clock is not trustworthy enough to be an input.
 */
export declare function traceLine(at: string, field: 'name' | 'status', from: string, to: string): string;
/**
 * The key two names are compared by when asking "is this the same requirement?"
 *
 * Trim, collapse runs of whitespace, lower-case. Deliberately dumb, for the reason
 * `iteration-service.ts` gives about its own dedupe: a fuzzy match needs a
 * threshold nobody can justify, and here a wrong "same thing" does not lose an
 * entry — it files one requirement's note onto another. Erring toward "different"
 * costs one extra entry, which the operator can merge by hand.
 */
export declare function normalizeName(name: string): string;
/** Copy a document with a note appended and `updated` moved forward. */
export declare function withNote(doc: RequirementEntryDoc, note: string, at: string): RequirementEntryDoc;
