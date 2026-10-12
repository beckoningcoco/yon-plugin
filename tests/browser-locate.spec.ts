// @vitest-environment jsdom
/**
 * Element location, for the two ways it silently picked the wrong thing.
 *
 * Both were found the same afternoon on an NCC node page, and both look identical from the
 * outside — "the click did nothing":
 *
 * - The page helpers run in the top document, so an element inside a frame is
 *   `instanceof HTMLElement === false` (the constructor belongs to another realm). Any
 *   visibility check written as an identity check therefore calls every framed element
 *   invisible.
 * - A CSS locator returns the first match, and NCC keeps several hidden shells of the same
 *   dialog in the DOM. The first `.refer-pop-window .cancel-btn` was one of those shells: a
 *   zero rect, so the centre came out (0,0) and the press landed in the corner of the page.
 *
 * jsdom lays nothing out, so visibility is supplied by hand — which is the point: what is
 * under test is the ordering rule, not the browser's opinion of what is on screen.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_HELPERS } from '../src/host/browser-interact.ts'

/** One locator call, as the tools make it. */
interface Spec {
  readonly by: string
  readonly value: string
  readonly index: number
}

/** Run the page helpers in this DOM and locate, exactly as `locate` does. */
function locate(spec: Spec): Element | null {
  const evaluate = eval as (source: string) => unknown
  const matchesTarget = evaluate(
    `(() => { ${PAGE_HELPERS}; return matchesTarget })()`,
  ) as (given: Spec) => Element | null
  return matchesTarget(spec)
}

/** Give an element the geometry jsdom would not. */
function visible(el: Element): void {
  Object.defineProperty(el, 'offsetWidth', { value: 10, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 10, configurable: true })
  Object.defineProperty(el, 'getClientRects', { value: () => ({ length: 1 }), configurable: true })
}

function hidden(el: Element): void {
  Object.defineProperty(el, 'offsetWidth', { value: 0, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 0, configurable: true })
  Object.defineProperty(el, 'getClientRects', { value: () => ({ length: 0 }), configurable: true })
}

/** Append an element to a document's body. */
function add(doc: Document, className: string, text?: string): HTMLElement {
  const el = doc.createElement('div')
  el.className = className
  if (text !== undefined) el.textContent = text
  ;(doc.body as HTMLElement).appendChild(el)
  return el
}

/** A frame with its own document, appended to this page. */
function frameDocument(): Document {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  const inner = frame.contentDocument
  if (inner === null) throw new Error('jsdom gave the frame no document')
  return inner
}

afterEach(() => { document.body.innerHTML = '' })

describe('matchesTarget', () => {
  it('prefers a visible match over an earlier hidden one', () => {
    const shell = add(document, 'thing')
    const real = add(document, 'thing')
    hidden(shell)
    visible(real)

    // The first match in document order is the shell; the one a person means is the other.
    expect(locate({ by: 'css', value: '.thing', index: 0 })).toBe(real)
    // And index still counts everything, invisible ones included, in their original order.
    expect(locate({ by: 'css', value: '.thing', index: 1 })).toBe(shell)
  })

  it('keeps document order when nothing is visible, rather than refusing outright', () => {
    const first = add(document, 'ghost')
    const second = add(document, 'ghost')
    hidden(first)
    hidden(second)
    expect(locate({ by: 'css', value: '.ghost', index: 0 })).toBe(first)
  })

  it('finds text inside a frame, where an identity check would call it a non-element', () => {
    const save = add(frameDocument(), 'btn', '保存')
    visible(save)
    expect(locate({ by: 'text', value: '保存', index: 0 })).toBe(save)
  })
})
