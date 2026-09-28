/**
 * Join CSS-module class names.
 *
 * The stylesheet map is typed `Record<string, string>` and this project compiles
 * with `noUncheckedIndexedAccess`, so every lookup reads as `string | undefined`
 * even for a class that is certainly there. The primitives this plugin composes
 * declare `className?: string` (no `undefined` under
 * `exactOptionalPropertyTypes`), so the narrowing happens once, here, instead of
 * as `?? ''` at every call site.
 */
/**
 * Join the class names that are present.
 * @param names - class names, or falsy values to skip.
 * @returns one space-separated class attribute value.
 */
export declare function cn(...names: ReadonlyArray<string | undefined | false>): string;
