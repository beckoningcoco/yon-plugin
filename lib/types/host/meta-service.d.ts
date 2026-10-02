import { type MetaBuildProgress, type MetaFreshness, type MetaIndex, type StoredMetaIndex } from './meta-index.ts';
import type { MetaIndexStatusView } from '../shared/types.ts';
/** One Home, as the metadata service needs it. */
export interface MetaHome {
    readonly id: string;
    readonly path: string;
    readonly version: string;
    readonly product: string;
}
/** One entity a query matched, with the fields that matched it. */
export interface MetaEntityHit {
    readonly name: string;
    readonly filename: string;
    readonly displayName: string;
    readonly tableName: string;
    readonly fullClassName: string;
    readonly module: string;
    readonly file: string;
    readonly primary: boolean;
    /** How many fields the entity has in total. */
    readonly fieldCount: number;
    /** The fields that matched the query; empty for an entity-name query. */
    readonly matched: readonly string[];
}
/** One enumeration a query matched. */
export interface MetaEnumHit {
    readonly name: string;
    readonly displayName: string;
    readonly fullClassName: string;
    readonly module: string;
    readonly file: string;
    readonly items: readonly (readonly [string, string])[];
}
/** A query's answer, whatever it was asked about. */
export interface MetaQueryAnswer {
    readonly home: string;
    readonly version: string;
    readonly kind: 'entity' | 'field' | 'enum';
    readonly term: string;
    readonly total: number;
    readonly truncated: boolean;
    readonly entities: readonly MetaEntityHit[];
    readonly enums: readonly MetaEnumHit[];
    /** True when the stored index no longer matches the installation. */
    readonly stale: boolean;
    readonly freshness?: MetaFreshness;
}
/** One field of an entity, with everything the file says about it. */
export interface MetaFieldDetail {
    readonly name: string;
    readonly label: string;
    readonly dbtype: string;
    readonly fieldType: string;
    readonly typeName: string;
    readonly length: number;
    readonly precise: number;
    readonly isKey: boolean;
    readonly isNullable: boolean;
    readonly isReadOnly: boolean;
    readonly isHide: boolean;
    readonly defaultValue: string;
    /** The value set, when the field's type resolves to an enumeration in the same file. */
    readonly values?: readonly (readonly [string, string])[];
}
/** One entity's full field list, read from the file that defines it. */
export interface MetaDetailAnswer {
    readonly home: string;
    readonly version: string;
    readonly entity: string;
    readonly filename: string;
    readonly displayName: string;
    readonly tableName: string;
    readonly fullClassName: string;
    readonly module: string;
    readonly file: string;
    readonly fields: readonly MetaFieldDetail[];
    /** Other files that also define an entity of this name, when there are any. */
    readonly others: readonly string[];
}
/** What `startBuild` was asked to do, and whether it was already being done. */
export interface MetaBuildHandle {
    readonly started: boolean;
    readonly status: MetaIndexStatusView;
}
/** The metadata index, as the tools and the panel use it. */
export interface YonMetaService {
    status(homeId: string, withFreshness?: boolean): Promise<MetaIndexStatusView>;
    startBuild(homeId: string): Promise<MetaBuildHandle>;
    query(homeId: string, kind: 'entity' | 'field' | 'enum', term: string, limit: number): Promise<MetaQueryAnswer>;
    detail(homeId: string, entity: string, file?: string): Promise<MetaDetailAnswer>;
    /** Every index stored, for the panel's summary. */
    list(): Promise<readonly StoredMetaIndex[]>;
    dispose(): void;
}
/**
 * Open the service.
 *
 * @param resolve - look one registered Home up by id.
 * @param build - the builder, injected so a test can run it without a real tree.
 * @param write - where a built index goes, injected for the same reason.
 * @param read - where a stored index comes from. Defaults to the real store; a test
 *   hands it its own map so that neither half of the pair touches the operator's disk.
 * @returns the service.
 */
export declare function createYonMetaService(resolve: (id: string) => Promise<MetaHome>, build: (home: string, version: string, previous: MetaIndex | undefined, onProgress: (progress: MetaBuildProgress) => void) => Promise<MetaIndex>, write: (built: MetaIndex) => Promise<string>, read?: (version: string) => Promise<MetaIndex | undefined>): YonMetaService;
