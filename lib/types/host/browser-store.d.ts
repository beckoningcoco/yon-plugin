import { type BrowserFamily } from '../shared/types.ts';
/**
 * One registered browser as the document stores it.
 *
 * The same fields as the view minus what is derived by looking at the disk
 * (`pathExists`, `stale`, `logPath`). Declared separately rather than reusing
 * `BrowserView`, as `home-store.ts:44` does and for the same reason: this shape may
 * gain a field for the store's own reasons without the contract both halves share
 * moving, and a derived field that got persisted would be a second truth about the
 * filesystem that is wrong from the moment it is written.
 */
export interface StoredBrowser {
    readonly id: string;
    readonly family: BrowserFamily;
    readonly product: string;
    readonly path: string;
    readonly profileDir: string;
    readonly port: number;
    readonly startUrl: string;
    /** When this path was last seen by a scan. Absent on a row added by hand. */
    readonly lastFoundAt?: string;
}
/**
 * One launch as the ledger stores it.
 *
 * Mirrors `BrowserRunView` minus `alive` and `note`: liveness is a question asked of
 * the machine at read time, and a persisted answer to it would be a claim about a
 * process that may have exited while the file sat there. `pid` is stored because it
 * is a useful clue, but see `BrowserView`'s note on the view for why nothing is
 * decided by it.
 */
export interface StoredRun {
    readonly runId: string;
    readonly browserId: string;
    readonly label: string;
    readonly family: BrowserFamily;
    readonly pid?: number;
    readonly port: number;
    readonly profileDir: string;
    readonly startedAt: string;
    readonly endpoint: string;
    readonly ready: boolean;
    /** Chromium's identity token. Absent for Firefox, which has no such endpoint. */
    readonly debuggerUrl?: string;
}
/** One read of a document, with the reason it came back short when it did. */
export interface DocumentRead<Row> {
    readonly path: string;
    readonly rows: readonly Row[];
    /** False when the document does not exist yet — "nothing recorded". */
    readonly exists: boolean;
    /** How many stored rows could not be read back. Dropped, not fatal. */
    readonly skipped: number;
    /** Only the registration document has one: when it was last scanned. */
    readonly scannedAt?: string;
    /** Set only when the document exists and could not be used as written. */
    readonly error?: string;
}
/** A document, as the rest of the host uses it. */
export interface JsonDocument<Row> {
    readonly path: string;
    read(): Promise<DocumentRead<Row>>;
    /**
     * @param rows - the rows to store, in order.
     * @param scannedAt - written alongside them when present. Passing `undefined`
     *   omits the field, which is how "never scanned" is spelled.
     */
    write(rows: readonly Row[], scannedAt?: string): Promise<void>;
}
/** The registration document. */
export type BrowserConfigStore = JsonDocument<StoredBrowser>;
/** The run ledger. */
export type BrowserRunStore = JsonDocument<StoredRun>;
/** Where the registrations live. */
export declare function defaultBrowserConfigPath(): string;
/** Where the launch ledger lives. */
export declare function defaultBrowserRunsPath(): string;
/**
 * The alternative profile root, under the operator's DSH data directory.
 *
 * Exported because it is **offered**, not used: the default profile directory sits in
 * the plugin root, which the operator chose, and this is what the panel offers when that
 * turns out not to be writable. The trade is real and goes both ways — this one survives
 * a reinstall but is no longer next to the plugin it belongs to — so it stays an offer
 * rather than a fallback that happens quietly.
 */
export declare function defaultBrowserProfileRoot(): string;
/**
 * The plugin's own root, which is where the default profile directory hangs off.
 *
 * Both profile roots are named side by side here rather than one here and one at the
 * call site, because which one is in force is a single decision the panel's hint and the
 * design document both have to state the same way.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works for the
 * compiled plugin and for a spec running against the sources — the same reasoning
 * `knowledge-tools.ts:39-45` records for its shipped library.
 */
export declare function pluginRoot(): string;
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createBrowserConfigStore(path?: string): BrowserConfigStore;
/**
 * Open the launch ledger.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createBrowserRunStore(path?: string): BrowserRunStore;
