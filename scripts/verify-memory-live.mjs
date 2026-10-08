/**
 * Verify the compiled memory bank against the real machine.
 *
 * Two things a unit test cannot do honestly:
 *
 * 1. **Run the emitted `lib/` rather than the sources.** The type check reads one
 *    tree and the deployment runs another; this proves the file the plugin actually
 *    loads works on a real filesystem, with real paths under `~/.dsh/yon-panel/`.
 * 2. **Show the artifact a person will open.** A memory is deliberately a markdown
 *    file in a directory the operator owns, so the check prints one in full — if the
 *    frontmatter came out unreadable, or the body landed under the wrong fence, this
 *    is where that is visible rather than in a passing assertion.
 *
 * It writes nothing into the operator's own bank: the round trip runs against a
 * scratch directory, and only the *reading* of the real location happens here.
 *
 * Run: node scripts/verify-memory-live.mjs
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = 'file:///E:/gitproject/dsh-plugin-yon-panel/lib/host/'
const { createMemoryStore, defaultMemoryRoot } = await import(`${base}memory-store.js`)
const { createYonMemoryService } = await import(`${base}memory-service.js`)

/** A stand-in registry: this script checks the bank, not the project panel. */
const project = { projectId: 'prj-verify', name: '验证项目', code: 'verify' }
const projects = {
  list: () => [{
    ...project,
    status: 'active',
    archived: false,
    fieldCount: 0,
    fields: {},
    createdAt: 0,
    updatedAt: 0,
  }],
  resolve: (ref) => ref === '验证项目' || ref === 'verify' || ref === 'prj-verify'
    ? { kind: 'found', project: { ...project, status: 'active', archived: false, fieldCount: 0, fields: {}, createdAt: 0, updatedAt: 0 } }
    : { kind: 'none' },
}

console.log('real bank  :', defaultMemoryRoot())
const realStore = createMemoryStore()
const realRead = await realStore.readIndex()
console.log('exists     :', realRead.exists, '| records:', realRead.records.length, '| error:', realRead.error ?? '(none)')

const dir = await mkdtemp(join(tmpdir(), 'yon-memory-verify-'))
try {
  const service = createYonMemoryService(createMemoryStore(dir), projects)

  const { memory: saved, created } = await service.create({
    project: '验证项目',
    type: 'pitfall',
    title: '达梦下不带时间范围的查询会全表扫',
    body: '按 68.11.100.7 上的一张流水表实测：不带范围 40 秒，带上 0.2 秒。',
    tags: ['达梦', '性能'],
    source: 'verify-memory-live.mjs 的一次运行',
  })
  console.log('created    :', created, saved.id, '| project:', saved.projectName)

  // The two halves must agree, and the file must be what a person would expect.
  const onDisk = await readdir(dir)
  const text = await readFile(join(dir, `${saved.id}.md`), 'utf8')
  console.log('files      :', onDisk.sort().join(', '))
  console.log('')
  console.log(text.trimEnd())
  console.log('')

  const reread = await service.read(saved.id)
  console.log('body match :', reread.body === saved.body ? '✅' : '❌')

  // Correcting it is the operation that separates a memory from a ledger entry.
  const corrected = await service.update(saved.id, { body: '带上时间范围 0.2 秒。' })
  console.log('corrected  :', corrected.body === '带上时间范围 0.2 秒。' ? '✅' : '❌',
    '| updated moved:', corrected.updatedAt >= saved.updatedAt ? '✅' : '❌')

  // A repeat is not a second memory.
  const again = await service.create({
    project: '验证项目',
    type: 'pitfall',
    title: '达梦下不带时间范围的查询会全表扫',
    body: '再说一遍。',
    source: 'verify-memory-live.mjs 的一次运行',
  }, { dedupe: true })
  console.log('dedupe     :', again.created === false && again.memory.id === saved.id ? '✅' : '❌')

  // What `project_read` would carry: titles and ids, from the index alone.
  const hints = await service.recent('prj-verify', 5)
  console.log('injection  :', hints.map(hint => `[${hint.type}] ${hint.title} (${hint.id})`).join(' / ') || '(none)')

  const failures = [
    reread.body === saved.body,
    corrected.body === '带上时间范围 0.2 秒。',
    again.created === false,
    hints.length === 1,
  ].filter(ok => ok !== true).length
  if (failures > 0) process.exit(1)
} finally {
  await rm(dir, { recursive: true, force: true })
}
