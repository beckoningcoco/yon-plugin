// @vitest-environment jsdom
/**
 * The click coordinate, held to its arithmetic.
 *
 * Why this needs its own spec: a wrong offset is invisible everywhere else. The pointer
 * press really happens, the tool really reports "clicked", and the element it landed on is
 * simply not the one that was asked for. Measured on an NCC workbench: every click inside
 * the node page landed 44px high — the height of the workbench's own top bar — which is
 * exactly the frame offset that was not being added.
 *
 * jsdom lays nothing out, so every `getBoundingClientRect` there returns zeros; the frames
 * are given their geometry by hand. That is the point: the arithmetic under test is "add up
 * the frame chain", not "ask the browser where things are".
 */
import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_HELPERS } from '../src/host/browser-interact.ts'

/** A point, as the helper returns it. */
interface Offset {
  readonly x: number
  readonly y: number
}

/** Run the page helpers in this DOM and measure one element, the way `locate` does. */
function offsetOf(el: Element): Offset {
  const evaluate = eval as (source: string) => unknown
  const mainFrameOffset = evaluate(
    `(() => { ${PAGE_HELPERS}; return mainFrameOffset })()`,
  ) as (node: Element) => Offset
  return mainFrameOffset(el)
}

/** Give an element the geometry jsdom would not: a frame sitting at (left, top). */
function place(el: Element, left: number, top: number, border = 0): void {
  el.getBoundingClientRect = () => ({
    x: left, y: top, left, top,
    right: left + 200, bottom: top + 200,
    width: 200, height: 200,
    toJSON: () => ({}),
  }) as DOMRect
  Object.defineProperty(el, 'clientLeft', { value: border, configurable: true })
  Object.defineProperty(el, 'clientTop', { value: border, configurable: true })
}

/** An element inside a fresh frame appended to `parent` — a document or an element. */
function elementInFrame(parent: Document | Element): { frame: HTMLIFrameElement; el: Element } {
  // A Document has `.body`, an Element does not: enough to tell them apart across realms,
  // where `instanceof Document` is not reliable.
  const isDoc = (parent as Document).body !== undefined
  const ownerDoc = isDoc ? (parent as Document) : ((parent as Element).ownerDocument ?? document)
  const host: Element = isDoc ? ((parent as Document).body as Element) : (parent as Element)
  const frame = ownerDoc.createElement('iframe')
  host.appendChild(frame)
  const inner = frame.contentDocument
  if (inner === null) throw new Error('jsdom gave the frame no document')
  const el = inner.createElement('input')
  inner.body.appendChild(el)
  return { frame, el }
}

afterEach(() => { document.body.innerHTML = '' })

describe('mainFrameOffset', () => {
  it('adds nothing for an element in the top document', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(offsetOf(div)).toEqual({ x: 0, y: 0 })
  })

  it('adds the frame the element lives in — the case that made clicks land 44px high', () => {
    const { frame, el } = elementInFrame(document.body)
    place(frame, 0, 44)
    expect(offsetOf(el)).toEqual({ x: 0, y: 44 })
  })

  it('adds the frame\'s own border, which the rect starts outside of', () => {
    const { frame, el } = elementInFrame(document.body)
    place(frame, 10, 20, 3)
    expect(offsetOf(el)).toEqual({ x: 13, y: 23 })
  })

  it('adds up a nested chain rather than only the innermost frame', () => {
    const outer = document.createElement('iframe')
    document.body.appendChild(outer)
    const middle = outer.contentDocument
    if (middle === null) throw new Error('jsdom gave the frame no document')
    const { frame: innerFrame, el } = elementInFrame(middle)
    place(outer, 5, 40)
    place(innerFrame, 7, 2)
    expect(offsetOf(el)).toEqual({ x: 12, y: 42 })
  })
})
