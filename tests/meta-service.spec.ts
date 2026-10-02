/**
 * The metadata service, where "which file defines this" is decided.
 *
 * The rule this file exists for: the caller is asked to choose **a file**, so every
 * count and every list here is per file. An index record carries the defining file's
 * basename as a second spelling of the entity name (`meta-index.ts` `StoredEntity`), so
 * one file containing several entities matches under one name many times over. Measured
 * on 机械院 2111: asking for `psndoc` matched 34 records behind **2** other files, and the
 * raw lists said "34 个文件" and repeated `modules/hrhi/…/psndoc.bmf` 31 times — a number
 * a model reading the answer would take at face value, and a list that hides the choice
 * it is asking for.
 *
 * The tree is a temporary directory and storage is a `Map`, both injected, so neither
 * half of the read/write pair touches the operator's installation or its
 * `~/.dsh/yon-panel/knowledge`. The `read` seam is the fourth parameter of
 * `createYonMetaService` for exactly this case.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMetaIndex, type MetaIndex } from '../src/host/meta-index.ts'
import { createYonMetaService } from '../src/host/meta-service.ts'

const VERSION = '2111'

/** The file the entity is named after, holding it and a second entity besides. */
const NAMED_FILE = 'modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf'
/** A different module defining the same name — the choice the caller has to make. */
const OTHER_FILE = 'modules/hrhi/METADATA/psndoc/psndoc.bmf'

/** One document, written the way the real ones are: XML declaration, one element per line. */
function document(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\r\n' + body
}

/** One entity element, with the fields given as `名字|中文名`. */
function entityXml(name: string, table: string, fields: readonly string[]): string {
  const written = fields.map(pair => {
    const [fieldName, label] = pair.split('|')
    return `                <attribute fieldName="${fieldName}"${label === undefined ? '' : ` displayName="${label}"`}/>`
  }).join('\n')
  return `    <entity name="${name}" tableName="${table}" displayName="${name} 显示名">
        <attributelist>
${written}
        </attributelist>
    </entity>`
}

/** Write one `.bmf` under the Home, creating the directories it needs. */
async function plant(home: string, rel: string, entities: readonly string[]): Promise<void> {
  const target = join(home, ...rel.split('/'))
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, document(`<component name="c">\n  <celllist>\n${entities.join('\n')}\n  </celllist>\n</component>`))
}

describe('the metadata service', () => {
  let home = ''

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'yon-meta-service-'))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  /**
   * A service over a freshly built index for the tree just planted.
   *
   * The build is the real one — a fixture index written by hand would not exercise the
   * rule under test, which is about what the walk actually stores.
   */
  async function bench() {
    const stored = new Map<string, MetaIndex>()
    const service = createYonMetaService(
      async (id) => {
        expect(id).toBe('h')
        return { id, path: home, version: VERSION, product: 'ncc' }
      },
      buildMetaIndex,
      async (built) => { stored.set(VERSION, built); return '(memory)' },
      async (version) => stored.get(version),
    )
    await service.startBuild('h')
    for (let tick = 0; tick < 200; tick += 1) {
      if ((await service.status('h', false)).build?.running !== true) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return service
  }

  it('counts and lists the files a name is defined in, once each, not the records', async () => {
    // Two files, three matching records: `psndoc.bmf` declares `psndoc` and `psnjob`,
    // and both match the name `psndoc` through the filename.
    await plant(home, NAMED_FILE, [
      entityXml('psndoc', 'bd_psndoc', ['pk_psndoc|主键', 'name|姓名']),
      entityXml('psnjob', 'bd_psnjob', ['pk_psnjob|主键']),
    ])
    await plant(home, OTHER_FILE, [entityXml('psndoc', 'hi_psndoc', ['pk_psndoc|主键'])])
    const service = await bench()

    const refusal = await service.detail('h', 'psndoc').catch((error: Error) => error.message)

    expect(refusal).toContain('在 2 个文件里')
    // Each path exactly once: a list that names the same file thirty times is not a list
    // of choices.
    for (const path of [NAMED_FILE, OTHER_FILE]) {
      expect(String(refusal).split(path)).toHaveLength(2)
    }
    // The tables are what tells two entities in one file apart, so they travel with it.
    expect(refusal).toContain('bd_psndoc / bd_psnjob')
    service.dispose()
  })

  it('answers with every other file, and only those files', async () => {
    await plant(home, NAMED_FILE, [
      entityXml('psndoc', 'bd_psndoc', ['pk_psndoc|主键', 'name|姓名']),
      entityXml('psnjob', 'bd_psnjob', ['pk_psnjob|主键']),
    ])
    await plant(home, OTHER_FILE, [entityXml('psndoc', 'hi_psndoc', ['pk_psndoc|主键'])])
    const service = await bench()

    const detail = await service.detail('h', 'psndoc', NAMED_FILE)

    expect(detail.file).toBe(NAMED_FILE)
    expect(detail.others).toEqual([OTHER_FILE])
    // And the answer describes the file that was asked for: the entity named after it,
    // with the fields the file gives that entity.
    expect(detail.tableName).toBe('bd_psndoc')
    expect(detail.fields.map(field => field.name)).toEqual(['pk_psndoc', 'name'])
    service.dispose()
  })

  it('does not ask a question with one answer: one file is not a choice', async () => {
    // `two.bmf` holds `alpha` and `beta`, so both match the name `two` by filename — but
    // there is only ever one file to read, and the entity wanted is found inside it.
    await plant(home, 'modules/any/METADATA/two.bmf', [
      entityXml('alpha', 't_alpha', ['pk_alpha|主键']),
      entityXml('beta', 't_beta', ['pk_beta|主键']),
    ])
    const service = await bench()

    const detail = await service.detail('h', 'two')

    expect(detail.file).toBe('modules/any/METADATA/two.bmf')
    expect(detail.others).toEqual([])
    expect(detail.entity).toBe('alpha')
    service.dispose()
  })
})
