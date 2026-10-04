import { type WikiUnindexedDir } from '../shared/types.ts';
/**
 * How one page points at another entity.
 *
 * These are not invented categories: they are the eight section kinds this
 * vault's pages actually use to name another entity, in both of its writing
 * styles. Keeping the kind matters because the same target means different
 * things — a `composition` is a child table you can join to, an `implements` is
 * an interface whose fields this entity already carries.
 */
export type WikiRefKind = 
/** `关联属性` / `Reference Fields` / `All Fields`: a foreign key to another entity. */
'reference'
/** `关联引用` / `Suppliers`: the reference type a field is typed by. */
 | 'refType'
/** `继承接口`: an interface this entity implements. */
 | 'implements'
/** `子表` / `Child Tables`: a child entity this one composes. */
 | 'composition'
/** `依赖接口`: an interface this entity depends on. */
 | 'depends'
/** The `superUri` the page's own Basic Info names. */
 | 'extends'
/** The `parent_entity` the page's frontmatter names. */
 | 'parent';
/** One entity a page points at. */
export interface WikiRef {
    /** The target's entity URI, as the page writes it. */
    readonly uri: string;
    readonly kind: WikiRefKind;
}
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
    /**
     * Entities this page points at, deduplicated by target and kind.
     *
     * A page states its relationships in tables — `关联属性` lists a 目标实体 per
     * field, `子表` lists child URIs, `继承接口` lists interfaces — but never as an
     * Obsidian `[[link]]`. Measured on the BIP vault: 93.5% of pages point at
     * something, and 23,052 of those 52,580 edges name an entity no page covers.
     * That gap is only visible if the edges are read, which is why they are here.
     *
     * Absent when the page names nothing.
     */
    readonly refs?: readonly WikiRef[];
    /**
     * How many fields the page says it lists, when it says so.
     *
     * Read from the heading (`直接属性（30个）`, `All Fields (30)`) or from the
     * lead line of the grouped style (`> 共 26 个直连字段`), so that a caller can
     * tell "this page can answer a column-name question" from "this page only
     * knows which table to look in" without reading 70 KB of markdown.
     */
    readonly fieldCount?: number;
}
/** A built index: every entity page a vault holds, as of one moment. */
export interface WikiIndex {
    readonly version: 2;
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
 * The page directories this index skips, with how many pages each holds.
 *
 * Entity pages are the whole of what every reader here can answer from, so a
 * bare count of them is not the vault's size — and read as one it says a vault
 * holding 13 pages under `wiki/topics` is an empty knowledge base. Skipping
 * those directories is the decision; leaving the skip invisible is what produced
 * that reading, so they are counted and named instead.
 *
 * One level deep, beside the entity directory: that is where the layouts put
 * them (`wiki/topics` next to `wiki/entities`), and a deeper walk would traverse
 * a whole vault to describe pages this module is not going to open anyway.
 *
 * @param vault - the registration.
 * @returns one entry per sibling directory holding at least one page, most pages
 * first; empty when the vault has no entity directory or nothing beside it.
 */
export declare function unindexedDirsOf(vault: WikiVault): Promise<WikiUnindexedDir[]>;
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
 * is offered once; duplicates by **id** are dropped too, and that half is not
 * cosmetic. A vault is addressed by id everywhere — the panel selects a row by
 * it, `wiki_lookup` is narrowed by it, the registration route deletes by it — so
 * two rows sharing one id are two rows where only the first can ever be edited or
 * removed. {@link GUESSED} lists the NCC vault at two locations, and a machine
 * holding both would have produced exactly that pair.
 *
 * First one wins, which keeps the order the list is written in as the priority.
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
