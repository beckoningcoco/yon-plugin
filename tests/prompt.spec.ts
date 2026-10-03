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
  BIP_META_TOOL_NAMES, CLASS_TOOL_NAMES, DATASOURCE_TOOL_NAMES, DIGEST_TOOL_NAMES, GBK_TOOL_NAMES,
  HOME_TOOL_NAMES, KNOWLEDGE_TOOL_NAMES, META_TOOL_NAMES, WIKI_TOOL_NAMES,
  WIKI_WRITE_TOOL_NAMES, YON_PROMPT_ORDER, YON_PROMPT_SECTION, YON_PROMPT_TEXT, YON_TOOL_NAMES,
} from '../src/index.ts'

/** Every tool this package registers. */
const ALL_TOOL_NAMES = [
  ...YON_TOOL_NAMES, ...DATASOURCE_TOOL_NAMES, ...WIKI_TOOL_NAMES, ...WIKI_WRITE_TOOL_NAMES,
  ...GBK_TOOL_NAMES, ...KNOWLEDGE_TOOL_NAMES, ...CLASS_TOOL_NAMES, ...HOME_TOOL_NAMES,
  ...META_TOOL_NAMES, ...BIP_META_TOOL_NAMES, ...DIGEST_TOOL_NAMES,
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
