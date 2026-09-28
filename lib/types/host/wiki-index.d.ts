/** One entity page, reduced to the facts a lookup answers with. */
export interface WikiPage {
    /** Entity URI from the title line, or null when the page has none. */
    readonly uri: string | null;
    /** Page name without the `.md` suffix; this is what `[[links]]` refer to. */
    readonly page: string;
    /** Path relative to the vault root, always with forward slashes. */
    readonly file: string;
    /** Display name from the title line, falling back to the page name. */
    readonly name: string;
    readonly table?: string;
    readonly domain?: string;
    readonly app?: string;
    readonly version?: string;
    readonly status?: string;
    readonly verified?: string;
}
/** A built index: every entity page a vault holds, as of one moment. */
export interface WikiIndex {
    readonly version: 1;
    readonly vault: string;
    readonly builtAt: string;
    readonly entities: readonly WikiPage[];
}
/** A vault the operator has registered, or one this module guessed at. */
export interface WikiVault {
    /** Stable short id, matching `/^[a-zA-Z0-9_-]+$/` so it can be a record key. */
    readonly id: string;
    /** Human label for the panel. */
    readonly label: string;
    /** Absolute vault root. */
    readonly path: string;
}
/** Whether a directory looks like a vault this module can read. */
export declare function isVault(root: string): boolean;
/**
 * The directory holding a vault's entity pages.
 * @param root - absolute vault root.
 * @returns the absolute directory, or undefined when none of the known layouts fit.
 */
export declare function entityDirOf(root: string): string | undefined;
/**
 * The vaults present on this machine, in the order {@link GUESSED} lists them.
 *
 * Duplicates by path are dropped, so a vault reachable at two guessed locations
 * is offered once.
 * @returns the vaults that exist; an empty list when none do.
 */
export declare function guessVaults(): readonly WikiVault[];
/** Where one vault's index is cached. */
export declare function wikiIndexPath(root: string): string;
/**
 * Read the facts one entity page carries.
 *
 * Every field past the name is optional on purpose: a VO or an enum has no
 * physical table, and a page written by hand may have no frontmatter at all.
 * Reporting what is there beats refusing to read what is not.
 *
 * @param text - the page's full markdown.
 * @param file - its path relative to the vault root, forward-slashed.
 * @param page - its name without the `.md` suffix.
 * @returns the page, with absent facts simply absent.
 */
export declare function parseEntityPage(text: string, file: string, page: string): WikiPage;
/**
 * Read every entity page in a vault and build a fresh index.
 *
 * Pages that fail to read are skipped rather than failing the whole build: a
 * knowledge base is edited by hand and by other tools, and one unreadable file
 * should not cost the model every other answer.
 *
 * @param root - absolute vault root.
 * @returns the index, ready to cache and to serve.
 * @throws when the root holds no entity directory at all.
 */
export declare function buildWikiIndex(root: string): Promise<WikiIndex>;
/**
 * Read a vault's cached index.
 * @param root - absolute vault root.
 * @returns the index, or undefined when none is cached or the file is unreadable.
 */
export declare function readWikiIndex(root: string): Promise<WikiIndex | undefined>;
/**
 * Write an index into its vault.
 * @param index - the index to cache.
 */
export declare function writeWikiIndex(index: WikiIndex): Promise<void>;
/**
 * A vault's index, rebuilt only when it is missing.
 *
 * Rebuilding 5400 pages takes a few seconds, which is cheap enough to do once and
 * too expensive to do per call, so a stale index is used until something asks for
 * a refresh rather than being detected and rebuilt behind the operator's back.
 *
 * @param root - absolute vault root.
 * @returns the cached index, or a freshly built and cached one.
 */
export declare function ensureWikiIndex(root: string): Promise<WikiIndex>;
/** Whether a path is a directory this process can list. */
export declare function isDirectory(target: string): Promise<boolean>;
