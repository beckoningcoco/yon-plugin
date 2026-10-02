import type { HomeFindPayload, HomeReadPayload } from '../shared/types.ts';
/**
 * One failure a Home call reports.
 *
 * Defined here rather than beside the service because this is the module that
 * raises most of them, and the service imports this one — the reverse would be a
 * cycle for a value, which ESM resolves but readers do not.
 */
export declare class HomeError extends Error {
    readonly code: 'not-found' | 'invalid-input';
    constructor(code: 'not-found' | 'invalid-input', message: string);
}
/**
 * Resolve one caller-supplied path inside a Home, or refuse it.
 *
 * @param root - the registered Home root.
 * @param requested - a relative path, or an absolute one that is inside the root.
 * @returns the canonical absolute path, which exists and is inside the root.
 * @throws HomeError `not-found` when the root or the target cannot be resolved,
 *   `invalid-input` when the target escapes the root.
 */
export declare function resolveInside(root: string, requested: string): Promise<string>;
/** Whether a buffer looks like binary data. */
export declare function isBinary(bytes: Buffer): boolean;
/**
 * The encoding an XML prologue declares, if this file has one.
 *
 * Only honoured when the file actually starts with a prologue. A `.java` file may
 * mention `encoding="UTF-8"` in a licence header or a comment, and treating that
 * as a declaration would decode a GBK file as UTF-8 — the exact failure the
 * whole-file probe exists to avoid, reintroduced from the other side.
 */
export declare function declaredEncoding(head: Buffer): string | undefined;
/** A decoded document and the encoding that produced it. */
export interface DecodedText {
    readonly text: string;
    readonly encoding: string;
}
/**
 * Turn a file's bytes into text.
 *
 * @param bytes - the whole file (or the first `MAX_READ_BYTES` of it).
 * @param override - an explicit encoding from the caller, which wins over every
 *   guess.
 * @returns the text and the encoding used, so the answer can say which.
 * @throws HomeError `invalid-input` when `override` names an encoding this reader
 *   does not know — silently falling back would hide a typo behind mojibake.
 */
export declare function decodeText(bytes: Buffer, override?: string): DecodedText;
/** Masked text, and which key names caused it. */
export interface MaskedText {
    readonly text: string;
    readonly masked: readonly string[];
}
/**
 * Replace the values of secret keys with a length hint.
 *
 * @param text - the document about to be handed to the model.
 * @returns the text with secret values masked, and the names that were hit.
 */
export declare function redactSecrets(text: string): MaskedText;
/** What `findIn` was asked for. */
export interface FindQuery {
    /** Case-insensitive substring of the file name. */
    readonly name?: string;
    /** Extension, with or without the dot. */
    readonly ext?: string;
    /** A directory inside the Home to start from; the root when omitted. */
    readonly under?: string;
    readonly limit: number;
}
/** Clamp a caller's limit into the range one answer may carry. */
export declare function clampFindLimit(limit: unknown): number;
/**
 * Find files under a Home by name and extension.
 *
 * @param root - the registered Home root.
 * @param query - what to match, where to start, and how many to return.
 * @returns matches with Home-relative paths, plus how much was walked.
 * @throws HomeError when `under` escapes the root or does not exist.
 */
export declare function findIn(root: string, query: FindQuery): Promise<HomeFindPayload>;
/** What `readIn` was asked for. */
export interface ReadOptions {
    readonly encoding?: string;
    /** 1-based first line to include; the start of the file when omitted. */
    readonly from?: number;
    /** 1-based last line to include; the end of the file when omitted. */
    readonly to?: number;
}
/**
 * Read one text file inside a Home.
 *
 * @param root - the registered Home root.
 * @param requested - a path relative to it.
 * @param options - an encoding override and an optional 1-based line window.
 * @returns the decoded text, the encoding, the line window actually returned, and
 *   which secret keys were masked.
 * @throws HomeError `not-found`, `invalid-input` (escape, directory, binary,
 *   unknown encoding, empty line range).
 */
export declare function readIn(root: string, requested: string, options?: ReadOptions): Promise<HomeReadPayload>;
