/**
 * The knowledge corpus this package ships.
 *
 * `resources/knowledge/` is the corpus every `knowledge_*` tool walks, and it travels
 * inside the package (`package.json`'s `files` includes `resources/**\/*`). Nothing in
 * the suite asserted on it before this file. Two things went wrong in it that nothing
 * noticed, and both are the kind of failure a "the tree is there" test would miss:
 *
 * - A **0-byte** document sat in `bip/references/旗舰版_业务模型/` from the migration
 *   commit onward. To a search it is a document that matches nothing; to a reader it
 *   is a page that exists and is blank.
 * - Eight bare metadata payloads (3.53 MB, 56% of the corpus's bytes in 1.9% of its
 *   documents) used to live under `bip/scripts/`. They were moved to
 *   `resources/bip-meta/` and `bip-meta.spec.ts` guards that direction from its own
 *   side; the case below guards the stats that made it worth doing.
 *
 * The counts are deliberately loose bounds, not equalities: this corpus is content and
 * grows. The bounds exist to catch a whole tree going missing — a build that dropped
 * `resources/**`, or an empty directory where the corpus should be.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The corpus, resolved the way `knowledge-tools.ts` resolves it — relative to the
 * source tree, so one path serves both `src` and `lib`.
 */
const CORPUS = fileURLToPath(new URL('../resources/knowledge/', import.meta.url))

/** Every file under the corpus, as paths relative to it. */
async function walk(dir: string, prefix = ''): Promise<readonly string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...await walk(join(dir, entry.name), rel))
    else found.push(rel)
  }
  return found
}

/** Every Markdown document, which is the bulk of the corpus. */
async function documents(): Promise<readonly string[]> {
  return (await walk(CORPUS)).filter(rel => rel.endsWith('.md'))
}

describe('the knowledge corpus this package ships', () => {
  it('is present, with both product lines in it', async () => {
    const docs = await documents()
    expect(docs.length).toBeGreaterThan(300)
    expect(docs.some(rel => rel.startsWith('bip/'))).toBe(true)
    expect(docs.some(rel => rel.startsWith('ncc/'))).toBe(true)
  })

  it('ships no blank document', async () => {
    // A 0-byte `.md` is not "a short page": it is a page a search can match and a
    // reader cannot read. The one that used to be here was removed.
    const blank: string[] = []
    for (const rel of await documents()) {
      if ((await stat(join(CORPUS, rel))).size === 0) blank.push(rel)
    }
    expect(blank).toEqual([])
  })

  it('keeps the bare metadata payloads out, so a search result is a written page', async () => {
    // The move's own invariant, from the corpus side: no `metadata_*.json` here. What
    // that bought, measured: `自定义项` returned 12 hits of which 7 were bare JSON, and
    // now returns 9 with none.
    const names = await walk(CORPUS)
    expect(names.filter(rel => /(^|\/)metadata_[^/]*\.json$/.test(rel))).toEqual([])
  })

  it('still carries the assets the tool text tells the model to use', async () => {
    // These two paths are named in text the model reads — `class-tools.ts` renders
    // "cfr-0.152.jar 随本包放在 resources/knowledge/ncc/", and the inlined
    // `SKILL.md` points at `bip/scripts/arthas_exec.py`. Nothing checked that the
    // files they promise are actually shipped, so a missing one would have the model
    // confidently name a path that is not there.
    const names = await walk(CORPUS)
    expect(names).toContain('ncc/cfr-0.152.jar')
    expect(names).toContain('bip/scripts/arthas_exec.py')
  })

  it('decodes as Chinese, which is the only thing that would catch a lost encoding', async () => {
    // The corpus is read with `readFile(..., 'utf8')` and nothing else, so a tree saved
    // in GBK would come back as replacement characters — and `knowledge_search` would
    // match nothing, silently. Every one of the 388 documents carries Chinese today, so
    // the bound below is only here to leave room for an English page being added later.
    //
    // Not asserted: "no U+FFFD". Twelve documents contain it on purpose — `char_translation.md`,
    // `GBK文件编辑.md` and their neighbours are *about* mojibake and print examples of it.
    const docs = await documents()
    let chinese = 0
    for (const rel of docs) {
      if (/[一-鿿]/.test(await readFile(join(CORPUS, rel), 'utf8'))) chinese++
    }
    expect(chinese).toBeGreaterThan(300)
  })
})
