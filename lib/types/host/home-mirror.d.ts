import type { HomeProduct } from '../shared/types.ts';
import type { StoredHome } from './home-store.ts';
/** The outcome of one mirror: where it went, or why it did not. */
export interface MirrorResult {
    readonly path: string;
    readonly warning?: string;
}
/**
 * The skills-side file a product's registrations mirror into.
 *
 * @param product - which product line.
 * @param skillsRoot - the skills tree to write into; defaults to the operator's.
 * @returns the absolute path, whether or not it exists yet.
 */
export declare function mirrorPathOf(product: HomeProduct, skillsRoot?: string): string;
/**
 * Write the panel's registrations for one product into the skills' file.
 *
 * @param product - which product line, and therefore which file.
 * @param homes - every Home the panel registers for that product.
 * @param skillsRoot - the skills tree to write into; defaults to the operator's.
 *   Taking it as a parameter is the same seam the stores have: the operator's home
 *   directory is not a fixture a case can assert against, and the merge rules below
 *   are exactly what a case needs to assert.
 * @returns the path written, or the path it declined to write plus the reason.
 */
export declare function mirrorHomes(product: HomeProduct, homes: readonly StoredHome[], skillsRoot?: string): Promise<MirrorResult>;
