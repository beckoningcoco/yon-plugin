/**
 * The prompt section's contract with the rest of the package.
 *
 * The text is hand-written and has to stay true as the plugin changes, so what
 * is checked here is exactly the coupling a person can forget: every tool the
 * package registers is accounted for in the map, both product lines are named,
 * and the placement stays clear of the orders the harness owns.
 */
import { describe, expect, it } from 'vitest'
import {
  BIP_META_TOOL_NAMES, CLASS_TOOL_NAMES, DATASOURCE_TOOL_NAMES, DIGEST_TOOL_NAMES,
  DOC_PARSE_TOOL_NAMES, GBK_TOOL_NAMES,
  HOME_TOOL_NAMES, ITERATION_TOOL_NAMES, KNOWLEDGE_TOOL_NAMES, META_TOOL_NAMES,
  REQUIREMENT_TOOL_NAMES, WIKI_TOOL_NAMES,
  WIKI_WRITE_TOOL_NAMES, YON_PROMPT_ORDER, YON_PROMPT_SECTION, YON_PROMPT_TEXT, YON_TOOL_NAMES,
} from '../src/index.ts'

/** Every tool this package registers. */
const ALL_TOOL_NAMES = [
  ...YON_TOOL_NAMES, ...DATASOURCE_TOOL_NAMES, ...WIKI_TOOL_NAMES, ...WIKI_WRITE_TOOL_NAMES,
  ...GBK_TOOL_NAMES, ...DOC_PARSE_TOOL_NAMES,
  ...KNOWLEDGE_TOOL_NAMES, ...CLASS_TOOL_NAMES, ...HOME_TOOL_NAMES,
  ...META_TOOL_NAMES, ...BIP_META_TOOL_NAMES, ...DIGEST_TOOL_NAMES, ...ITERATION_TOOL_NAMES,
  ...REQUIREMENT_TOOL_NAMES,
]

describe('the Yon prompt section', () => {
  it('names every registered tool, literally or through its family', () => {
    // Both are accepted because the text groups the tools deliberately — the
    // point is not that each name is printed, it is that no family is invisible.
    // A tool whose neither name nor `family_*` appears is one the model has no
    // way to know it should reach for.
    //
    // The family is read up to the *first* underscore, so an `ncc_`-prefixed tool
    // has no family of its own: the family of `ncc_meta_find` is `ncc_*`, not
    // `ncc_meta_*`. Writing `ncc_meta_*` in the text therefore accounts for
    // nothing, and the text names these tools the way it names `ncc_class_search`
    // and `ncc_home_find` — individually. This is exactly how the guard caught the
    // metadata group being listed as `ncc_meta_*` only.
    const unaccounted = ALL_TOOL_NAMES.filter(name => {
      const family = `${name.slice(0, name.indexOf('_'))}_*`
      return !YON_PROMPT_TEXT.includes(name) && !YON_PROMPT_TEXT.includes(family)
    })

    expect(unaccounted).toEqual([])
  })

  it('states which knowledge answers which question', () => {
    // The one routing rule no individual tool description can carry: two
    // libraries with near-identical names, and a reason to prefer one.
    expect(YON_PROMPT_TEXT).toContain('wiki_')
    expect(YON_PROMPT_TEXT).toContain('knowledge_')
    expect(YON_PROMPT_TEXT).toContain('两套知识不要混')
  })

  it('keeps the product-line split', () => {
    // NCC and the BIP/旗舰版 line share no table, entity or class names, and a
    // model that mixes them produces confident, wrong schema. This is the one
    // paragraph that prevents that, so its disappearance is a regression.
    expect(YON_PROMPT_TEXT).toContain('NCC')
    expect(YON_PROMPT_TEXT).toContain('旗舰版')
    expect(YON_PROMPT_TEXT).toContain('BIP')
    expect(YON_PROMPT_TEXT).toContain('产品线不能混')
  })

  it('does not tell the model that waiting for approval is normal', () => {
    // Deliberately removed: a model that has been told a gate is routine is a
    // model more willing to walk into one. The tool descriptions still say what
    // is gated; the prompt does not editorialise about it.
    expect(YON_PROMPT_TEXT).not.toContain('不是失败')
    expect(YON_PROMPT_TEXT).not.toContain('批准')
  })

  it('keeps the iteration ledger on the model\'s side of the line it may not cross', () => {
    // The iteration panel's whole design is that the model records and a person
    // decides. The tool definitions enforce the half of that a schema can (no
    // update, no remove — see `iteration-tools.spec.ts`); these four sentences are
    // the other half, and the only part of it a schema cannot enforce. Each one is
    // a different failure the prompt has to prevent, so none of them is decoration:
    // the model must know the record is not a change, that it must not act on its
    // own note, that it must not rank for the operator, and that a row counts only
    // once the operator has read it. Paraphrased away, the panel becomes a model
    // that quietly maintains its own backlog — the exact role this feature exists
    // to refuse.
    expect(YON_PROMPT_TEXT).toContain('记录不是改动，改不改由人决定')
    expect(YON_PROMPT_TEXT).toContain('不要因此改插件')
    expect(YON_PROMPT_TEXT).toContain('不要替使用者排序、挑选或把记录当待办')
    expect(YON_PROMPT_TEXT).toContain('每一条都要等他看过才算数')
    // …and the panel is not a surface the model drives, except for that one row it
    // writes. Saying only「你不需要操作它」would contradict the new paragraph.
    expect(YON_PROMPT_TEXT).toContain('只有迭代表板和需求条目这两条要由你写')
  })

  it('keeps the requirement ledger\'s two sides apart', () => {
    // The requirement ledger's one rule no tool schema can carry: the entry is the
    // operator's words, the notes are what was worked out about them, and a body
    // that mixes the two is a body neither side can read back. The rest is the
    // consequence: append while it happens (appending interrupts nobody), do not
    // move the state without the operator saying so, and do not write into the
    // folder that only they may fill.
    expect(YON_PROMPT_TEXT).toContain('不要把你的分析写进描述')
    expect(YON_PROMPT_TEXT).toContain('用 requirement_annotate 当场追加')
    expect(YON_PROMPT_TEXT).toContain('他没验收就别标「已完成」')
    expect(YON_PROMPT_TEXT).toContain('那个目录你不能写')
    expect(YON_PROMPT_TEXT).toContain('真删条目没有工具')
  })

  it('counts a confidently wrong answer as a signal, not only a missing one', () => {
    // The four signals that came first all describe *not getting* an answer: a
    // detour, a repeated question, a guess, a complaint. The fifth is the opposite
    // shape and the one more likely to survive unnoticed — the tool answered, in
    // full confidence, and the answer was wrong. A threshold that lists only the
    // first four teaches the model to record its own frustration and stay quiet
    // about a table name it caught later, which is the row a person can act on.
    expect(YON_PROMPT_TEXT).toContain('只在有硬信号时才记')
    expect(YON_PROMPT_TEXT).toContain('看着笃定但事后发现是错的')
    // `iteration_add`'s own description carries the same list — that is what the
    // model reads while deciding whether to call, and `iteration-tools.spec.ts`
    // holds that half so the two thresholds cannot drift apart.
  })

  it('places the section inside the harness’s empty band, not on a boundary', () => {
    // The harness's own orders run -1000 … 2900, then jump to 5000. Landing
    // strictly inside that gap keeps this section after the tool guidance it
    // complements and clear of anything the harness positions later.
    expect(YON_PROMPT_ORDER).toBeGreaterThan(2900)
    expect(YON_PROMPT_ORDER).toBeLessThan(5000)
  })

  it('namespaces the section so a tie stays legible', () => {
    // Orders collide; names decide, and `plugin:` sorts after the harness's
    // `tool:` and `app:` sections rather than among them by accident.
    expect(YON_PROMPT_SECTION).toBe('plugin:yon-panel')
  })
})
