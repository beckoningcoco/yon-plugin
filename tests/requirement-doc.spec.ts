/**
 * The text layer's promises, one rule at a time: a document written by
 * `serializeEntry` reads back as itself, a document that does not carry the shape
 * reads back as nothing, and the two renderings of one file differ in exactly the
 * strikethrough spans.
 *
 * Nothing here touches the disk — that is the point of the module being pure, and
 * it is why these cases can be this specific without any setup.
 */
import { describe, expect, it } from 'vitest'
import {
  REQUIREMENT_STATUS_TEXT,
  bodyText,
  localDate,
  normalizeName,
  parseEntry,
  serializeEntry,
  stripStrikethrough,
  traceLine,
  withNote,
  type RequirementEntryDoc,
} from '../src/host/requirement-doc.ts'

/** One entry, shaped the way the service builds one. */
const DOC: RequirementEntryDoc = {
  name: 'H1-00 固定资产接口对接',
  status: 'working',
  created: '2026-09-12T03:11:20.000Z',
  updated: '2026-10-05T06:02:41.000Z',
  body: '华科给的三个接口要接到固定资产模块上。',
  notes: ['2026-09-12 使用者提供的资料：三份接口文档已拷进 user/。'],
}

describe('entry.md as a document', () => {
  it('reads back exactly what was written', () => {
    expect(parseEntry(serializeEntry(DOC))).toEqual(DOC)
  })

  it('reads back a document with no notes as having none', () => {
    const bare: RequirementEntryDoc = { ...DOC, notes: [] }
    expect(parseEntry(serializeEntry(bare))).toEqual(bare)
  })

  it('writes the frontmatter keys in English and the status as its stored key', () => {
    const text = serializeEntry(DOC)
    expect(text.startsWith('---\nname: H1-00 固定资产接口对接\nstatus: working\n')).toBe(true)
  })

  it('ends with exactly one newline', () => {
    const text = serializeEntry(DOC)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('keeps blank lines inside the body', () => {
    const doc: RequirementEntryDoc = { ...DOC, body: '第一段\n\n第二段' }
    expect(parseEntry(serializeEntry(doc))?.body).toBe('第一段\n\n第二段')
  })

  it('splits notes on blank lines', () => {
    const text = serializeEntry({ ...DOC, notes: ['第一条', '第二条'] })
    expect(parseEntry(text)?.notes).toEqual(['第一条', '第二条'])
  })

  it('reads a name that contains a colon', () => {
    const doc: RequirementEntryDoc = { ...DOC, name: 'H1-00: 接口对接' }
    expect(parseEntry(serializeEntry(doc))?.name).toBe('H1-00: 接口对接')
  })

  it('flattens a name that contains a newline rather than letting it break the block', () => {
    const text = serializeEntry({ ...DOC, name: '第一行\n第二行' })
    const nameLines = text.split('\n').filter(line => line.startsWith('name:'))
    expect(nameLines).toEqual(['name: 第一行 第二行'])
    expect(parseEntry(text)?.name).toBe('第一行 第二行')
  })

  it('reads a file written with a BOM', () => {
    expect(parseEntry(`﻿${serializeEntry(DOC)}`)).toEqual(DOC)
  })

  it('reports a file with no frontmatter as nothing', () => {
    expect(parseEntry('# 就是一份普通的 md')).toBeUndefined()
  })

  it('reports an unterminated frontmatter block as nothing', () => {
    expect(parseEntry('---\nname: x\n')).toBeUndefined()
  })

  it('reports a missing name as nothing', () => {
    expect(parseEntry('---\nstatus: done\n---\n正文\n')).toBeUndefined()
  })

  it('falls back to 待开发 for a status it does not know', () => {
    expect(parseEntry('---\nname: x\nstatus: 开发中\n---\n')?.status).toBe('proposed')
  })

  it('reads an entry with no notes heading as body-only', () => {
    const parsed = parseEntry('---\nname: x\n---\n只有正文\n')
    expect(parsed?.body).toBe('只有正文')
    expect(parsed?.notes).toEqual([])
  })
})

describe('strikethrough and the two renderings', () => {
  it('removes a struck span and leaves the arrow behind', () => {
    expect(stripStrikethrough('~~字段 A 必填~~ → 使用者澄清：可空。')).toBe(' → 使用者澄清：可空。')
  })

  it('removes two spans on one line', () => {
    expect(stripStrikethrough('~~a~~ 和 ~~b~~')).toBe(' 和 ')
  })

  it('leaves an unterminated span exactly as written', () => {
    expect(stripStrikethrough('~~没关掉')).toBe('~~没关掉')
  })

  it('gives the model the struck-free text and the human the original', () => {
    const doc: RequirementEntryDoc = { ...DOC, notes: ['~~作废的说法~~ → 现在的说法'] }
    expect(bodyText(doc)).toContain('→ 现在的说法')
    expect(bodyText(doc)).not.toContain('~~')
    expect(bodyText(doc, { keepStrikethrough: true })).toContain('~~作废的说法~~ → 现在的说法')
  })

  it('drops a note that is entirely struck through, heading and all', () => {
    const doc: RequirementEntryDoc = { ...DOC, notes: ['~~整条作废~~'] }
    const modelView = bodyText(doc)
    expect(modelView).not.toContain('标注')
    expect(modelView).toBe(doc.body)
    expect(bodyText(doc, { keepStrikethrough: true })).toContain('## 标注')
  })

  it('keeps the body and puts the notes under their heading', () => {
    const text = bodyText(DOC)
    expect(text.startsWith(`${DOC.body}\n\n## 标注\n\n2026-09-12 使用者提供的资料`)).toBe(true)
  })
})

describe('the small helpers the service leans on', () => {
  it('compares names after trimming, collapsing spaces, and folding case', () => {
    expect(normalizeName('  H1-00   接口 ')).toBe(normalizeName('h1-00 接口'))
  })

  it('keeps different names different', () => {
    expect(normalizeName('接口对接')).not.toBe(normalizeName('接口对接（追加）'))
  })

  it('stamps a date from the operator\'s own day', () => {
    // Built from local components, so this asserts the same thing in every zone.
    expect(localDate(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
    expect(localDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
  })

  it('writes a trace line naming the field and both values', () => {
    expect(traceLine('2026-10-05', 'status', '待开发', '已完成')).toBe('2026-10-05 状态：待开发 → 已完成')
    expect(traceLine('2026-10-05', 'name', '旧名', '新名')).toBe('2026-10-05 名称：旧名 → 新名')
  })

  it('appends a note and moves updated forward', () => {
    const next = withNote(DOC, '2026-10-05 又想到一点', '2026-10-05T07:00:00.000Z')
    expect(next.notes).toEqual([...DOC.notes, '2026-10-05 又想到一点'])
    expect(next.updated).toBe('2026-10-05T07:00:00.000Z')
    expect(next.body).toBe(DOC.body)
  })

  it('names every status for prose', () => {
    expect(REQUIREMENT_STATUS_TEXT).toEqual({
      proposed: '待开发',
      working: '开发中',
      review: '待验收',
      done: '已完成',
      onHold: '搁置',
      dropped: '已废弃',
    })
  })
})
