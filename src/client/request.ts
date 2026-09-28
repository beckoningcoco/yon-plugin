/**
 * The browser half's one way to talk to `/yon/api`.
 *
 * Both feature APIs (projects and skills) call through here, so a component
 * still never fetches, never subscribes, and never learns a URL — it receives
 * methods through an inject face, and the URL lives in exactly one place.
 */
import { API_PREFIX } from '../shared/types.ts'

/** One failed call, carrying the API's machine code. */
export class ApiError extends Error {
  constructor(
    /** Machine code the API reported (`not-found`, `invalid-input`, `internal`, …). */
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** A response body that may or may not carry a failure. */
interface FailureBody {
  readonly code?: unknown
  readonly message?: unknown
}

/**
 * Perform one JSON call, turning a non-2xx answer into {@link ApiError}.
 * @param path - path after the API prefix (e.g. `/projects`).
 * @param init - fetch options; the JSON content type is added here.
 * @returns the parsed body.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  const text = await response.text()
  const body: unknown = text === '' ? undefined : JSON.parse(text) as unknown
  if (!response.ok) {
    const failure = (body ?? {}) as FailureBody
    throw new ApiError(
      typeof failure.code === 'string' ? failure.code : `http-${response.status}`,
      typeof failure.message === 'string' && failure.message !== ''
        ? failure.message
        : `HTTP ${response.status}`,
    )
  }
  return body as T
}
