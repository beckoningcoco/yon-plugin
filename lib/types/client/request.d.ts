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
/**
 * Send one file to a route that takes raw bytes, not JSON.
 *
 * This cannot go through {@link request}: that one forces a JSON content type, and here
 * the body *is* the file. The name has to travel somewhere, and it rides in a header
 * rather than in the URL — **URL-encoded**, because an HTTP header value is latin-1 and
 * 「卡片接口清单.xlsx」 put in raw arrives as mojibake. The route itself is the only place
 * that decodes it.
 *
 * The body is handed over as the `File` itself, so it is streamed: a 50 MB attachment
 * never becomes a 50 MB string in this process.
 * @param path - path after the API prefix.
 * @param file - the file to send.
 * @returns the parsed answer.
 */
export declare function upload<T>(path: string, file: File): Promise<T>;
