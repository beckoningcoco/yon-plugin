/** One failed call, carrying the API's machine code. */
export declare class ApiError extends Error {
    /** Machine code the API reported (`not-found`, `invalid-input`, `internal`, …). */
    readonly code: string;
    constructor(
    /** Machine code the API reported (`not-found`, `invalid-input`, `internal`, …). */
    code: string, message: string);
}
/**
 * Perform one JSON call, turning a non-2xx answer into {@link ApiError}.
 * @param path - path after the API prefix (e.g. `/projects`).
 * @param init - fetch options; the JSON content type is added here.
 * @returns the parsed body.
 */
export declare function request<T>(path: string, init?: RequestInit): Promise<T>;
