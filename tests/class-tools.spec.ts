/**
 * The class-index tools: the definitions the registry receives, and the text a
 * search renders.
 *
 * This file exists because the pair had **no direct coverage at all** before it, and
 * because `class-tools.ts:23-26` imports `listClassIndexes` / `readClassIndex` /
 * `writeClassIndex` straight from `class-index.ts` with no injection point — so
 * `execute` can only ever be exercised against the operator's real
 * `~/.dsh/yon-panel/knowledge/` directory. A test that wrote there would leave
 * indexes behind in someone's data directory (two such leftovers were found there:
 * `class_index_EMPTY.json` and `class_index_TEST.json`, both recorded against
 * `C:\Users\99558\Documents`).
 *
 * So nothing here calls `execute`. `render` is pure, and the behaviour added here —
 * naming the directory an index describes — lives entirely in the rendered text.
 *
 * Why that line is worth a test: an omitted `version` falls back to the newest
 * stored index (`class-tools.ts:260`). That fallback was observed answering from an
 * index of the operator's Documents folder, and the answer said only `索引 EMPTY` —
 * no directory, so nothing in it looked wrong.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { CLASS_TOOL_NAMES, registerYonClassTools } from '../src/host/class-tools.ts'
import type { YonClassService } from '../src/host/class-service.ts'
import type { YonToolDefinition } from '../src/host/tools.ts'

/**
 * A service that refuses to be used.
 *
 * This spec only renders, so nothing here should reach a service at all — and a
 * stand-in that throws is a better witness than one that quietly answers and lets a
 * future case pass while testing nothing. `createYonClassService` is exercised in
 * `tests/class-service.spec.ts`, over injected build/write/list.
 */
const unusedService = {
  status: () => { throw new Error('status should not be called from a render test') },
  startBuild: () => { throw new Error('startBuild should not be called from a render test') },
  build: () => { throw new Error('build should not be called from a render test') },
  remove: () => { throw new Error('remove should not be called from a render test') },
  dispose: () => undefined,
} as unknown as YonClassService

/** Mount the tools over a recording registry, the way the host half does. */
function bench() {
  const ctx = new Context()
  const tools = new Map<string, YonToolDefinition>()
  ctx.provide('tools', {
    register: (definition: YonToolDefinition) => {
      tools.set(definition.name, definition)
      return vi.fn()
    },
  } as never)
  // No `defaultVersion`: this spec only renders, and passing one would suggest the
  // version resolution is under test here. It is not — that needs `execute`.
  registerYonClassTools(ctx, unusedService)
  return tools
}

/** The text `ncc_class_search` would hand the model for one answer value. */
function rendered(value: Record<string, unknown>): string {
  const definition = bench().get('ncc_class_search')
  if (definition === undefined) throw new Error('ncc_class_search was not registered')
  return definition.output.render({}, value).map(block => block.text).join('')
}

/** One stored-index entry, as `listClassIndexes` reports it. */
function stored(version: string, home: string) {
  return { version, home, builtAt: '2026-01-01T00:00:00.000Z', totalJars: 7941, totalClasses: 1_234_567, bytes: 1 }
}

/** One search answer with a single hit. */
function answerWith(over: Record<string, unknown>): Record<string, unknown> {
  return {
    term: 'PaybillLinkImpl',
    version: '2111',
    hits: [{ className: 'nc.bs.pub.PaybillLinkImpl', path: 'modules/aeam/lib/aeam_amLevel-1.jar' }],
    totalClasses: 1_234_567,
    indexed: [stored('2111', 'E:/NCProject/NCC2111/home')],
    ...over,
  }
}

/** The text `knowledge_build_index` would hand the model after a finished build. */
function builtText(value: Record<string, unknown>): string {
  const definition = bench().get('knowledge_build_index')
  if (definition === undefined) throw new Error('knowledge_build_index was not registered')
  return definition.output.render({}, value).map(block => block.text).join('')
}

describe('the class-index tools', () => {
  it('registers exactly the names it exports', () => {
    expect([...bench().keys()].sort()).toEqual([...CLASS_TOOL_NAMES].sort())
  })

  it('names the directory the index describes, so a wrong index is visible', () => {
    const text = rendered(answerWith({}))
    expect(text).toContain('索引 2111')
    expect(text).toContain('E:/NCProject/NCC2111/home')
  })

  it('says where the classes came from even when nothing matched', () => {
    const text = rendered(answerWith({ hits: [] }))
    expect(text).toContain('没有匹配')
    expect(text).toContain('E:/NCProject/NCC2111/home')
  })

  it('prints a fallback index the way the operator would recognise it as wrong', () => {
    // The measured case: no registered default Home, so the newest stored index won.
    const text = rendered(answerWith({
      version: 'EMPTY',
      totalClasses: 5293,
      indexed: [stored('EMPTY', 'C:/Users/99558/Documents')],
    }))
    expect(text).toContain('索引 EMPTY')
    expect(text).toContain('C:/Users/99558/Documents')
  })

  it('drops the line rather than printing it empty when the index records no home', () => {
    // `StoredIndex.home` defaults to `''` for a file that does not carry one, and a
    // line reading "该索引描述的目录：" with nothing after it would be worse than no
    // line at all.
    const text = rendered(answerWith({ indexed: [stored('2111', '')] }))
    expect(text).not.toContain('该索引描述的目录')
    expect(text).toContain('索引 2111')
  })

  it('asks for a registered Home id and says in as many words that it is not a path', () => {
    // The whole of batch 3a, in one assertion. The tool used to take the Home's path as
    // its argument, and that is how two indexes came to exist for
    // `C:\Users\99558\Documents`: the model passed something path-shaped, and the walk
    // indexed it. A path cannot be wrong *as a path* — an id has to be looked up, and an
    // id that was never registered fails loudly instead of producing an index of a
    // Documents folder.
    const definition = bench().get('knowledge_build_index')
    expect(definition?.parameters.required).toEqual(['home'])
    const home = (definition?.parameters.properties as Record<string, { description: string }>).home
    expect(home?.description).toContain('id')
    expect(home?.description).toContain('not a path')
    // And a path-shaped second argument must not creep back in beside it.
    expect(Object.keys(definition?.parameters.properties ?? {})).toEqual(['home'])
  })

  it('names the version, the size of the walk, where it went, and what to do next', () => {
    const text = builtText({
      home: 'ncc-2111',
      version: '2111',
      totalJars: 7941,
      totalClasses: 143_908,
      path: 'C:/Users/99558/.dsh/yon-panel/knowledge/class_index_2111.json',
      seconds: 26.2,
    })
    expect(text).toContain('索引 2111 建好了')
    expect(text).toContain('7941 个 jar')
    expect(text).toContain('143908 个类')
    expect(text).toContain('26.2 秒')
    expect(text).toContain('class_index_2111.json')
    // The next step, with the version spelled out: a search with no version falls back to
    // the default Home, which need not be the one just built.
    expect(text).toContain('ncc_class_search')
    expect(text).toContain('version 传 2111')
  })

  it('tells the model to read a loose source file, not to decompile it', () => {
    // The hadc case: a module shipped with no jar, so the hit is a `.java` that is
    // already on disk. The jar advice would send the model after cfr for a file it
    // can open, and a source file through a decompiler is not the same artifact.
    const text = rendered(answerWith({
      hits: [{ className: 'nc.itf.hadc.accbook.IHadcDataCenter',
        path: 'modules/hadc/classes/nc/itf/hadc/accbook/IHadcDataCenter.java' }],
    }))
    expect(text).toContain('IHadcDataCenter.java')
    expect(text).toContain('ncc_home_read')
  })

  it('keeps the jar advice when every hit is a jar', () => {
    const text = rendered(answerWith({}))
    expect(text).toContain('cfr')
    expect(text).not.toContain('ncc_home_read')
  })

  it('does not tell the model to read a .class file, which is a binary', () => {
    // Measured on the registered 2312 home: 216 of the 762 loose entries are `.class`
    // files, and `ncc_home_read` refuses them by design ("这是二进制"). Sending the
    // model there would have the tool contradict the advice it just gave.
    const text = rendered(answerWith({
      hits: [{ className: 'nccloud.Other', path: 'modules/nojar/classes/nccloud/Other.class' }],
    }))
    expect(text).toContain('编译产物')
    expect(text).not.toContain('ncc_home_read')
  })
})
