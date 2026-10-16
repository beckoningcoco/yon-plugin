/**
 * The one piece of the replay module that fails silently.
 *
 * Everything else in `replay-service.ts` talks to a process or a socket and is
 * covered by `tests/arthas-live.spec.ts` on a machine that has one. `manifestLines`
 * is different: it is pure, it is wrong in a way nothing reports, and the failure
 * it produces arrives much later and somewhere else — a manifest that breaks either
 * rule still gets written, still produces a jar, and still leaves a
 * `ClassNotFoundException` naming a class that is plainly on disk.
 *
 * So these cases check the two rules and, more importantly, check them the way the
 * manifest parser does: by joining the lines back up and comparing with what went in.
 */
import { describe, expect, it } from 'vitest'
import { manifestLines } from '../src/host/replay-service.ts'

/** Bytes, which is what the manifest rule counts. */
function width(line: string): number {
  return Buffer.byteLength(line, 'utf8')
}

/**
 * Join manifest lines the way the parser does.
 *
 * A continuation is `CRLF` + exactly one space, and the parser deletes that space —
 * which is precisely why a fold may not land on a value's own separator.
 * @param lines - the written lines.
 * @returns the value a reader would see.
 */
function joinLikeTheParser(lines: readonly string[]): string {
  return lines.map((line, index) => (index === 0 ? line : line.slice(1))).join('')
}

/** A realistic entry: a jar URL on this machine runs to roughly 100 bytes. */
function urlOf(index: number, pad = 40): string {
  return `file:/E:/NCProject/NCC1909/shouchuang/home/ncc1909new/modules/m${String(index).padStart(4, '0')}/META-INF/lib/${'p'.repeat(pad)}.jar`
}

describe('manifestLines', () => {
  it('keeps every line within the 72-byte limit', () => {
    // The limit is per line *including* the continuation marker, which is the part
    // a hand-rolled splitter forgets.
    for (const count of [1, 2, 50, 5481]) {
      const urls = Array.from({ length: count }, (_, index) => urlOf(index))
      const lines = manifestLines(`Class-Path: ${urls.join(' ')}`)
      const over = lines.filter(line => width(line) > 72)
      expect(over, `${count} entries produced ${over.length} over-long lines`).toEqual([])
    }
  })

  it('survives a round trip through the parser rules', () => {
    // The assertion that matters. A splitter can satisfy the byte rule and still
    // destroy the value — by folding on a separator, whose space the continuation
    // marker then eats, welding two entries into one path that exists nowhere.
    for (const count of [1, 3, 200, 5481]) {
      const urls = Array.from({ length: count }, (_, index) => urlOf(index, index % 7 === 0 ? 90 : 20))
      const value = `Class-Path: ${urls.join(' ')}`
      expect(joinLikeTheParser(manifestLines(value))).toBe(value)
    }
  })

  it('splits one entry that is longer than a whole line', () => {
    const long = `file:/E:/a/${'x'.repeat(400)}.jar`
    const value = `Class-Path: ${long} ${urlOf(1)}`
    const lines = manifestLines(value)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(72)
    expect(joinLikeTheParser(lines)).toBe(value)
  })

  it('starts a continuation with exactly one space and nothing else', () => {
    const lines = manifestLines(`Class-Path: ${Array.from({ length: 40 }, (_, i) => urlOf(i)).join(' ')}`)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines.slice(1)) {
      expect(line.startsWith(' ')).toBe(true)
      expect(line.startsWith('  ')).toBe(false)
    }
  })

  it('produces nothing for an empty value, and one line for a short one', () => {
    expect(manifestLines('')).toEqual([])
    expect(manifestLines('Class-Path: file:/a.jar')).toEqual(['Class-Path: file:/a.jar'])
  })
})
