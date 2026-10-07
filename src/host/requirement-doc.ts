/**
 * The text layer of a requirement entry: `entry.md`'s frontmatter, its body, and
 * the strikethrough convention that turns one file into a ledger.
 *
 * Pure on purpose — no `node:fs`, no clock, no exceptions. Everything here is a
 * rule about text, and both `requirement-store.ts` (which moves bytes) and
 * `requirement-service.ts` (which decides what to write) depend on the same
 * rules, so they live in one place instead of being spelled twice and drifting.
 *
 * ## What the file looks like
 *
 *     ---
 *     name: H1-00 固定资产接口对接
 *     status: working
 *     created: 2026-09-12T03:11:20.000Z
 *     updated: 2026-10-05T06:02:41.000Z
 *     ---
 *
 *     写清这个需求是什么。
 *
 *     ## 标注
 *
 *     2026-09-12 使用者提供的资料：华科给的三个接口文档。
 *     ~~字段 A 必填~~ → 使用者澄清：可空。
 *
 * Three things about that shape are deliberate:
 *
 * - **frontmatter keys are English.** `name:`/`status:` rather than `名称:`/`状态:`.
 *   It is read by code and written by code, and the status value has to be one of
 *   `REQUIREMENT_STATUSES`; keeping the surface ASCII means no half-width /
 *   full-width colon ambiguity in a parser that has to be certain. The Chinese
 *   status names exist only for display (`REQUIREMENT_STATUS_TEXT`).
 * - **facts in frontmatter, prose after it.** The frontmatter is rewritten in
 *   place with no trace (see `withFields`), because a machine needs one current
 *   value, not a history of them.
 * - **history goes in the notes, never by rewriting a line.** A note is appended
 *   and never edited; a claim that turns out wrong is struck through and the new
 *   claim appended under it. Two readers get two renderings: `bodyText()` returns
 *   the model's copy (strikethrough removed — the model needs what is true now),
 *   `bodyText(doc, { keepStrikethrough: true })` returns the human's copy.
 */

import { REQUIREMENT_STATUSES, type RequirementStatus } from '../shared/types.ts'

/** The frontmatter keys, in the order `serializeEntry` writes them. */
const KEYS = ['name', 'status', 'created', 'updated'] as const

/** Marks the start and the end of the frontmatter block. */
const FENCE = '---'

/** The heading the appended notes live under. Roughly `## notes`. */
const NOTES_HEADING = '## 标注'

/**
 * A `~~struck through~~` span.
 *
 * `(?!~)` / `(?<!~)` keep it from eating one tilde out of a longer run, which
 * matters because the arrow line the host appends (`旧 → 新`) is written on the
 * same line as the struck text and is easy to over-consume. Unterminated `~~`
 * does not match at all and is left exactly as written.
 */
const STRIKE = /~~(?!~)[\s\S]*?(?<!~)~~/g

/** One entry's parsed content. */
export interface RequirementEntryDoc {
  readonly name: string
  readonly status: RequirementStatus
  /** ISO 时间戳，来自 frontmatter。 */
  readonly created: string
  /** ISO 时间戳，来自 frontmatter；每次写入都要往前推。 */
  readonly updated: string
  /** 这一条需求是什么。删除线原样保留。 */
  readonly body: string
  /** 追加段，最早的在前。删除线原样保留。 */
  readonly notes: readonly string[]
}

/** The Chinese name of one status, as a person reads it in prose and on screen. */
export const REQUIREMENT_STATUS_TEXT: Record<RequirementStatus, string> = {
  proposed: '待开发',
  working: '开发中',
  review: '待验收',
  done: '已完成',
  onHold: '搁置',
  dropped: '已废弃',
}

/** Statuses the parser will accept; anything else falls back to `proposed`. */
const statusOf = (raw: string | undefined): RequirementStatus =>
  REQUIREMENT_STATUSES.find(status => status === raw) ?? 'proposed'

/**
 * Parse one `entry.md`.
 *
 * @param text - the file's whole content.
 * @returns the document, or undefined when the file does not carry the shape
 *   above. Undefined is the honest answer for a file that has been replaced,
 *   truncated, or hand-edited into something else — the caller reports it as a
 *   broken entry rather than guessing a name out of the wreckage.
 */
export function parseEntry(text: string): RequirementEntryDoc | undefined {
  // Stripped by code point rather than by a pattern, for `iteration-store.ts`'s
  // reason: the BOM is invisible in the source and in a diff.
  const whole = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = whole.split(/\r?\n/)
  if (lines[0]?.trim() !== FENCE) return undefined

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE)
  if (end < 0) return undefined

  const fields = new Map<string, string>()
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    // Only the first colon separates, so a name like `H1-00：接口对接`
    // survives a round trip. First writer wins: a duplicate key is a hand-edit
    // mistake, and taking the later one would make the file's own beginning a lie.
    if (!fields.has(key)) fields.set(key, line.slice(at + 1).trim())
  }

  const name = fields.get('name') ?? ''
  if (name === '') return undefined

  const rest = lines.slice(end + 1)
  const headingAt = rest.findIndex(line => line.trim() === NOTES_HEADING)
  const body = headingAt < 0 ? rest : rest.slice(0, headingAt)
  const noteLines = headingAt < 0 ? [] : rest.slice(headingAt + 1)

  return {
    name,
    status: statusOf(fields.get('status')),
    created: fields.get('created') ?? '',
    updated: fields.get('updated') ?? '',
    body: body.join('\n').trim(),
    notes: paragraphsOf(noteLines),
  }
}

/**
 * Write one `entry.md`.
 *
 * The inverse of {@link parseEntry} for every document that function returns:
 * `parseEntry(serializeEntry(doc))` gives back the same fields. Blank lines inside
 * the body are preserved; blank lines at either end are not, because they carry no
 * meaning here and would otherwise accumulate on every rewrite.
 */
export function serializeEntry(doc: RequirementEntryDoc): string {
  const lines = [
    FENCE,
    `name: ${oneLine(doc.name)}`,
    `status: ${doc.status}`,
    `created: ${oneLine(doc.created)}`,
    `updated: ${oneLine(doc.updated)}`,
    FENCE,
    '',
  ]
  const body = doc.body.trim()
  if (body !== '') lines.push(body, '')
  if (doc.notes.length > 0) {
    lines.push(NOTES_HEADING, '')
    for (const note of doc.notes) lines.push(note.trim(), '')
  }
  // Exactly one trailing newline. A file that ends without one is a file that
  // ends mid-line, and git says so on every diff.
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * The entry's full text as one reader or the other should see it.
 *
 * @param doc - a parsed entry.
 * @param options.keepStrikethrough - true gives the human's copy (history intact),
 *   omitted gives the model's copy (struck spans removed).
 * @returns body and notes joined, notes under their heading. Notes that are
 *   entirely struck through disappear from the model's copy along with the heading
 *   if they all do — an empty 「## 标注」 reads as "there is nothing to know here",
 *   which in that state is true.
 */
export function bodyText(
  doc: RequirementEntryDoc,
  options: { readonly keepStrikethrough?: boolean } = {},
): string {
  const keep = options.keepStrikethrough === true
  const render = (text: string): string => (keep ? text.trim() : stripStrikethrough(text).trim())

  const parts: string[] = []
  const body = render(doc.body)
  if (body !== '') parts.push(body)
  const notes = doc.notes.map(render).filter(note => note !== '')
  if (notes.length > 0) parts.push(`${NOTES_HEADING}\n\n${notes.join('\n\n')}`)
  return parts.join('\n\n')
}

/**
 * Remove every `~~struck~~` span.
 *
 * What is left behind is deliberate and looks a little odd: the arrow and the
 * replacement stay, so `~~A 必填~~ → 使用者澄清：可空` reaches the model as
 * `→ 使用者澄清：可空`. The result is not prose, but it is honest — the model sees
 * that a position was revised without being told the superseded position as if it
 * still held.
 */
export function stripStrikethrough(text: string): string {
  return text.replace(STRIKE, '')
}

/**
 * `YYYY-MM-DD` for the day the operator is actually having.
 *
 * The date stamps on notes are the one timestamp a person reads and compares
 * against a calendar, so this is the one that must be local.
 */
export function localDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  // Local, not `toISOString().slice(0, 10)`: on a CST evening the UTC date is
  // still yesterday, and a note dated yesterday that was written today is a lie
  // the operator will notice before anyone else does.
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The line the host appends when a frontmatter field changes.
 *
 * Strikethrough cannot reach inside the frontmatter (there is no prose there to
 * strike), so a field change leaves its trace in the notes instead. The host
 * writes this, not the model: `IterationRowView.at` sets the precedent — the
 * session's own clock is not trustworthy enough to be an input.
 */
export function traceLine(at: string, field: 'name' | 'status', from: string, to: string): string {
  return `${at} ${field === 'name' ? '名称' : '状态'}：${from} → ${to}`
}

/**
 * The key two names are compared by when asking "is this the same requirement?"
 *
 * Trim, collapse runs of whitespace, lower-case. Deliberately dumb, for the reason
 * `iteration-service.ts` gives about its own dedupe: a fuzzy match needs a
 * threshold nobody can justify, and here a wrong "same thing" does not lose an
 * entry — it files one requirement's note onto another. Erring toward "different"
 * costs one extra entry, which the operator can merge by hand.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Copy a document with a note appended and `updated` moved forward. */
export function withNote(doc: RequirementEntryDoc, note: string, at: string): RequirementEntryDoc {
  return { ...doc, updated: at, notes: [...doc.notes, note] }
}

/** Split blank-line-separated paragraphs, dropping the empties. */
function paragraphsOf(lines: readonly string[]): string[] {
  const paragraphs: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) paragraphs.push(current.join('\n').trim())
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length > 0) paragraphs.push(current.join('\n').trim())
  return paragraphs.filter(paragraph => paragraph !== '')
}

/** Collapse anything that would break a one-line frontmatter value. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
