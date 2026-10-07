/**
 * The browser half's one way to talk to `/yon/api`.
 *
 * Both feature APIs (projects and skills) call through here, so a component
 * still never fetches, never subscribes, and never learns a URL — it receives
 * methods through an inject face, and the URL lives in exactly one place.
 *
 * Two senders, one failure path: {@link request} for JSON and {@link upload} for a raw
 * file body. They differ only in what they put on the wire; what the panel shows when a
 * call fails is decided in one place, {@link readAnswer}.
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
 * Turn one answer into its body, or into the failure the API reported.
 *
 * Separate from the two senders below because the answers are the same JSON in both
 * cases — only the request differs. A second copy of this is a second answer to
 * "what does the panel say when a call fails", which is the thing that must not drift.
 * @param response - the answer.
 * @returns the parsed body.
 */
async function readAnswer<T>(response: Response): Promise<T> {
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
  return readAnswer<T>(response)
}

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
export async function upload<T>(path: string, file: File): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: 'POST',
    headers: { 'x-yon-file-name': encodeURIComponent(file.name) },
    body: file,
  })
  return readAnswer<T>(response)
}
