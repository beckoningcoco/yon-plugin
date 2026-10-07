/**
 * 需求条目给模型的那九个工具，以及它们自己的闸门。
 *
 * 这份用例里最要紧的两条，都不是「能干什么」：
 *
 * - **撞名是工具读盘读出来的**，因为闸门（`isDestructiveWrite`）是同步纯函数、
 *   读不了 `index.json`。所以用例直接钉住那条链：第一次调用一个字都不写；带
 *   `acknowledgeDuplicate` 且值确实是那条时才建；值不对——抄来的、过期的、想省事
 *   填的——一样不建，而且返回里点名真正冲突的那条。
 * - **追加不打断、改字段与废弃才问**。这条如果反过来，模型就会学会根本不记——
 *   那是这个功能唯一的失败方式（`iteration-tools.ts:24-29` 说明过同一件事）。
 *
 * 附件的两个工具是**只读**的，所以它们连闸门都到不了（`WRITE_TOOL_NAMES` 里没有
 * 它们）。要在这里钉住的是另外两件事：读一个 docx 得到的是**一句说明**而不是异常，
 * 以及读出来的文本里像密钥的值**已经被遮住**——这一条不在服务里做，只在进模型
 * 上下文的那一层做。
 *
 * 库一律建在临时目录里：默认路径是使用者自己的需求库，用例往那儿写就等于在跑测试
 * 的机器上留条目。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequirementStore } from '../src/host/requirement-store.ts'
import {
  createYonRequirementsService,
  type YonRequirementsService,
} from '../src/host/requirement-service.ts'
import {
  REQUIREMENT_TOOL_NAMES,
  registerYonRequirementTools,
} from '../src/host/requirement-tools.ts'
import type { YonProjectsService } from '../src/host/service.ts'
import type {
  YonPermissions,
  YonSessionLike,
  YonToolDefinition,
  YonToolExecution,
} from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** A session stand-in whose log carries whatever permission events a case needs. */
function sessionWith(permissions: YonPermissions | undefined): YonSessionLike {
  const events: Array<{ type: string; data: unknown }> = []
  if (permissions?.sandbox !== undefined) events.push({ type: 'sandbox/mode', data: { mode: permissions.sandbox } })
  if (permissions?.approval !== undefined) events.push({ type: 'approval/policy', data: { policy: permissions.approval } })
  return { seq: events.length, eventAt: (seq: number) => events[seq] }
}

/** One recorded execution, as the registry would hand it over. */
function execution(name: string, args: unknown, permissions?: YonPermissions): YonToolExecution {
  return {
    name,
    arguments: args,
    callId: 'call-1',
    signal: liveSignal,
    agent: { session: sessionWith(permissions) },
  }
}

/**
 * A project store stand-in: only `resolve` is ever reached, and it answers by id or
 * name the way the real one does.
 */
function projectsStub(): YonProjectsService {
  const rows = [
    { projectId: 'prj-1', name: '现代保险 NC65 集成' },
    { projectId: 'prj-2', name: '天九' },
  ]
  return {
    resolve: (ref: string) => {
      const hit = rows.find(row => row.projectId === ref || row.name === ref)
      return hit === undefined
        ? { kind: 'not-found', ref }
        : { kind: 'found', project: hit }
    },
  } as unknown as YonProjectsService
}

/**
 * Mount the ledger's tools over a scratch root.
 * @returns the registry, the service, the root, the tools by name, and the callers.
 */
async function bench() {
  const root = await mkdtemp(join(tmpdir(), 'yon-requirement-tools-'))
  temporary.push(root)

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)

  const service = createYonRequirementsService(createRequirementStore(root))
  const dispose = registerYonRequirementTools(ctx, service, projectsStub())

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }
  const call = async (name: string, args: unknown): Promise<Record<string, unknown>> =>
    await tool(name).execute(args, execution(name, args)) as Record<string, unknown>
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }
  /**
   * Ask the family's own gate what it would do with one call. `allow` means the hook
   * let it through to the tool; `ask` carries the approval card's text.
   */
  const gate = async (
    name: string,
    args: unknown,
    permissions?: YonPermissions,
  ): Promise<{ kind: string; reason?: string }> =>
    await ctx.waterfall(
      'tools/pre-execute',
      execution(name, args, permissions),
      () => Promise.resolve({ kind: 'allow' as const }),
    ) as { kind: string; reason?: string }

  return { registered, service, root, tool, call, render, gate, dispose }
}

describe('这一族注册了什么', () => {
  it('registers exactly the nine declared names', async () => {
    const { registered, dispose } = await bench()
    expect(registered.map(definition => definition.name)).toEqual([...REQUIREMENT_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(200)
      expect(definition.parameters).toMatchObject({ type: 'object', additionalProperties: false })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
    dispose()
    expect(registered).toHaveLength(0)
  })

  it('offers the model nothing that deletes an entry or a file', async () => {
    const { registered } = await bench()
    // 模型能把条目废弃（`requirement_archive`，可恢复），但删不掉它；附件也一样——
    // 它能读、能列，删只能由面板上的人做。将来谁加了 `requirement_delete` 或
    // `requirement_file_remove`，这条会红。
    expect([...REQUIREMENT_TOOL_NAMES]).toEqual([
      'requirement_list',
      'requirement_read',
      'requirement_file_list',
      'requirement_file_read',
      'requirement_create',
      'requirement_annotate',
      'requirement_update',
      'requirement_archive',
      'requirement_artifact_write',
    ])
    for (const definition of registered) {
      expect(definition.name).not.toMatch(/delete|remove/)
    }
  })

  it('does not let a tool write into user/', async () => {
    const { tool } = await bench()
    // kind 的枚举里没有 user：那个目录是使用者放自己材料的地方，一个模型写得进去
    // 的目录，「这是使用者给的」就不再是真的。
    const kind = (tool('requirement_artifact_write').parameters as {
      properties: { kind: { enum: string[] } }
    }).properties.kind
    expect(kind.enum).toEqual(['generated', 'patches'])
  })
})

describe('requirement_create', () => {
  it('files an entry and says where it landed', async () => {
    const { root, render, service } = await bench()
    const report = await render('requirement_create', {
      project: '现代保险 NC65 集成',
      name: 'HG-01 固定资产卡片接口',
      body: '要接三个接口，先做卡片。',
    })

    expect(report).toContain('已建档')
    expect(report).toContain('HG-01 固定资产卡片接口')
    const rows = (await service.list()).rows
    expect(rows).toHaveLength(1)
    // 项目引用按名称解析成了 id——工具的入参是名字，落盘的是 id。
    expect(rows[0]?.projectId).toBe('prj-1')
    expect(rows[0]?.name).toBe('HG-01 固定资产卡片接口')
    expect(report).toContain(`${root}/${rows[0]?.id}/`)
  })

  it('writes nothing on a name already in use, and hands back both routes', async () => {
    const { root, render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const before = (await readdir(root)).slice().sort()

    const report = await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    expect(report).toContain('没有建档')
    expect(report).toContain('已经有同名条目')
    // 两条路都要写出来，模型的下一步就在这两句里。
    expect(report).toContain('requirement_annotate')
    expect(report).toContain('acknowledgeDuplicate')
    expect(report).toContain('先问使用者')

    expect((await service.list()).rows).toHaveLength(1)
    expect((await readdir(root)).slice().sort()).toEqual(before)
  })

  it('creates the twin once the acknowledged id is the entry that actually conflicts', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const twin = (await service.list()).rows[0]
    const report = await render('requirement_create', {
      project: 'prj-1',
      name: '接口对接',
      acknowledgeDuplicate: twin?.id,
    })
    expect(report).toContain('已建档')
    expect((await service.list()).rows).toHaveLength(2)
  })

  it('still refuses when the acknowledged id is not the entry that conflicts', async () => {
    const { render, service } = await bench()
    // 第二个项目下先放一条真的同名条目，于是「认错了的 id」有两种：
    // 一个台账里根本没有的 id，和**另一条确实存在、但不是冲突那条**的 id。
    // 两者都不算凭据——服务拿它跟「此刻真正冲突的那条」比相等，比不中就照旧不写。
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    await render('requirement_create', { project: '天九', name: '接口对接' })
    const other = (await service.list({ projectId: 'prj-2' })).rows[0]

    for (const bogus of ['rq-20260101-aaaa', other?.id ?? '']) {
      const report = await render('requirement_create', {
        project: 'prj-1',
        name: '接口对接',
        acknowledgeDuplicate: bogus,
      })
      expect(report).toContain('没有建档')
    }
    expect((await service.list()).rows).toHaveLength(2)
  })

  it('does not treat a same-named entry in another project as a conflict', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const report = await render('requirement_create', { project: '天九', name: '接口对接' })
    expect(report).toContain('已建档')
    expect((await service.list({ projectId: 'prj-2' })).rows).toHaveLength(1)
  })
})

describe('requirement_annotate', () => {
  it('appends a dated note and says so', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接', body: '原始要求。' })
    const entry = (await service.list()).rows[0]
    const report = await render('requirement_annotate', {
      ref: entry?.id,
      text: '使用者说字段 A 可以空。',
    })

    expect(report).toContain('已追加到')
    expect(report).toContain('字段 A 可以空')
    const view = await service.read(entry?.id ?? '')
    // 日期是宿主盖的，不是模型写的。
    expect(view.body).toMatch(/\d{4}-\d{2}-\d{2} 使用者说字段 A 可以空。/)
    expect(view.body).toContain('原始要求。')
  })

  it('refuses an empty note and an unknown entry', async () => {
    const { tool } = await bench()
    await expect(tool('requirement_annotate').execute({ ref: 'rq-没这个', text: '一句话' }, execution('requirement_annotate', {})))
      .rejects.toMatchObject({ code: 'not-found' })
    await expect(tool('requirement_annotate').execute({ ref: 'rq-x', text: '  ' }, execution('requirement_annotate', {})))
      .rejects.toBeInstanceOf(Error)
  })
})

describe('requirement_read 与 requirement_list', () => {
  it('gives the model the struck-free body and the human the original', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const entry = (await service.list()).rows[0]
    await render('requirement_annotate', { ref: entry?.id, text: '~~这条作废~~ 改成不空。' })

    const plain = await render('requirement_read', { ref: entry?.id })
    expect(plain).not.toContain('~~')
    expect(plain).toContain('改成不空。')
    // 目录要说出来，模型才知道附件与产物在哪儿。
    expect(plain).toContain('generated/')

    const historic = await render('requirement_read', { ref: entry?.id, history: true })
    expect(historic).toContain('~~这条作废~~')
  })

  it('lists newest change first, filters by project name and status, and shows the library root', async () => {
    const { render, root } = await bench()
    await render('requirement_create', { project: 'prj-1', name: 'A' })
    await render('requirement_create', { project: '天九', name: 'B' })
    await render('requirement_create', { project: 'prj-1', name: 'C' })

    const all = await render('requirement_list', {})
    expect(all).toContain('A')
    expect(all).toContain('B')
    expect(all).toContain(root)

    const scoped = await render('requirement_list', { project: '现代保险 NC65 集成' })
    expect(scoped).toContain('A')
    expect(scoped).toContain('C')
    expect(scoped).not.toContain('B')

    const none = await render('requirement_list', { status: 'done' })
    expect(none).toContain('没有符合条件的条目')
  })

  it('names the state in Chinese, so the model does not have to translate', async () => {
    const { render } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    expect(await render('requirement_list', {})).toContain('[待开发]')
  })
})

describe('requirement_file_list 与 requirement_file_read', () => {
  /** 建一条条目，往三个目录里各放一个文件，回它的 id。 */
  async function seeded(service: YonRequirementsService): Promise<string> {
    const created = await service.create({ projectId: 'prj-1', name: '接口对接' })
    if (!created.created) throw new Error('预期新建')
    const id = created.requirement.id
    await service.importFile(id, 'user', '华科接口文档.txt', Buffer.from('三个接口：卡片、变动、对照。', 'utf8'))
    await service.importFile(id, 'user', '接口文档.docx', Buffer.from('PK\u0003\u0004', 'binary'))
    await service.importFile(id, 'generated', '方案.md', Buffer.from('# 方案', 'utf8'))
    return id
  }

  it('lists all three folders with sizes, and marks what cannot be read', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    const report = await render('requirement_file_list', { ref: id })

    for (const dir of ['user/', 'generated/', 'patches/']) expect(report).toContain(dir)
    expect(report).toContain('华科接口文档.txt')
    expect(report).toContain('方案.md')
    // 空目录也要出现：「他给的」那一块空着本身是一句有用的话。
    expect(report).toContain('（空）')
    // docx 的可读性判断要说出来，模型才不会反复去试。
    expect(report).toContain('压缩包')
    // 归属必须写清楚：这是记录的核心区分。
    expect(report).toContain('使用者提供的材料，不是你生成的')
  })

  it('narrows to one folder when asked', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    const report = await render('requirement_file_list', { ref: id, dir: 'generated' })
    expect(report).toContain('方案.md')
    expect(report).not.toContain('华科接口文档.txt')
  })

  it('reads a file as text and says which encoding it used', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    const report = await render('requirement_file_read', { ref: id, file: '华科接口文档.txt' })
    expect(report).toContain('三个接口：卡片、变动、对照。')
    expect(report).toContain('utf-8')
    expect(report).toContain('user/华科接口文档.txt')
    expect(report).toContain('不是本插件生成的')
  })

  it('answers a docx with a reason instead of throwing', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    const report = await render('requirement_file_read', { ref: id, file: '接口文档.docx' })
    expect(report).toContain('读不出正文')
    expect(report).toContain('压缩包')
    // 而且给出下一步：让他另存为文本，而不是让模型自己想一个办法。
    expect(report).toContain('另存成')
  })

  it('masks what looks like a secret before it reaches the model', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    await service.importFile(
      id,
      'user',
      '连接说明.txt',
      Buffer.from('host = 10.0.0.8\ndb.password=Sup3rSecret\nport = 1521\n', 'utf8'),
    )
    const report = await render('requirement_file_read', { ref: id, file: '连接说明.txt' })

    // 连接的三要素照旧看得见——遮的只是值，不是整行。
    expect(report).toContain('10.0.0.8')
    expect(report).toContain('1521')
    expect(report).not.toContain('Sup3rSecret')
    expect(report).toContain('***（11 字符）')
    expect(report).toContain('db.password')
  })

  it('says how much it left out when it truncates', async () => {
    const { render, service } = await bench()
    const id = await seeded(service)
    const long = Array.from({ length: 8000 }, (_, index) => `第 ${index} 行`).join('\n')
    await service.importFile(id, 'user', 'long.txt', Buffer.from(long, 'utf8'))
    const report = await render('requirement_file_read', { ref: id, file: 'long.txt' })
    expect(report).toContain('只读到这里')
    expect(report).toContain('60000')
  })

  it('refuses a file that is not there, and one whose name is a path', async () => {
    const { tool, call, service } = await bench()
    const id = await seeded(service)
    await expect(call('requirement_file_read', { ref: id, file: '没有这个.txt' }))
      .rejects.toMatchObject({ code: 'not-found' })
    // 名字先过服务那道闸，所以 `../../etc/passwd` 是一条拒绝理由，而不是一次读取。
    await expect(call('requirement_file_read', { ref: id, file: '../../etc/passwd' }))
      .rejects.toThrow(/不能用作文件名/)
    expect(tool('requirement_file_read').parameters).toMatchObject({
      required: ['ref', 'file'],
      additionalProperties: false,
    })
  })

  it('never reaches the gate — both tools are read-only', async () => {
    const { gate } = await bench()
    // 不在 `WRITE_TOOL_NAMES` 里，所以钩子直接放行，连参数都不看。
    expect(await gate('requirement_file_list', { ref: 'rq-x' })).toEqual({ kind: 'allow' })
    expect(await gate('requirement_file_read', { ref: 'rq-x', file: 'a.txt' })).toEqual({ kind: 'allow' })
  })
})

describe('requirement_update 与 requirement_archive', () => {
  it('reports the change it made, naming both values', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const entry = (await service.list()).rows[0]
    const report = await render('requirement_update', { ref: entry?.id, status: 'done' })

    expect(report).toContain('已更新')
    expect(report).toContain('状态：待开发 → 已完成')
    expect((await service.read(entry?.id ?? '')).status).toBe('done')
  })

  it('says plainly that a call which changes nothing changed nothing', async () => {
    const { render } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const report = await render('requirement_update', { ref: '接口对接', status: 'proposed' })
    expect(report).toContain('没有任何改动')
  })

  it('refuses a call with neither name nor status', async () => {
    const { tool } = await bench()
    await expect(tool('requirement_update').execute({ ref: 'rq-x' }, execution('requirement_update', {})))
      .rejects.toThrow(/name 或 status/)
  })

  it('archives with a reason and refuses to archive twice', async () => {
    const { render, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const entry = (await service.list()).rows[0]
    const report = await render('requirement_archive', { ref: entry?.id, reason: '需求方撤了' })

    expect(report).toContain('已置为「已废弃」')
    expect(report).toContain('需求方撤了')
    expect(report).toContain('文件没有删')
    await expect(service.archive(entry?.id ?? ''))
      .rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('requirement_artifact_write', () => {
  it('writes into generated/ and patches/, and refuses user/', async () => {
    const { render, service, tool } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const entry = (await service.list()).rows[0]

    const generated = await render('requirement_artifact_write', {
      ref: entry?.id, kind: 'generated', name: '方案.md', content: '# 方案\n',
    })
    expect(generated).toContain('generated/')
    expect(generated).toContain('方案.md')

    await render('requirement_artifact_write', {
      ref: entry?.id, kind: 'patches', name: 'fix.patch', content: 'diff --git a b\n',
    })
    // `user` 不是合法 kind：条目是真的，被拒的是目录，所以这里不能靠 ref 找不到来蒙混。
    await expect(tool('requirement_artifact_write').execute(
      { ref: entry?.id, kind: 'user', name: 'a.md', content: '正文' },
      execution('requirement_artifact_write', {}),
    )).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('闸门', () => {
  it('asks before changing a field, and the card shows old beside new', async () => {
    const { render, gate } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const decision = await gate('requirement_update', { ref: '接口对接', status: 'done' })
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('状态：待开发 → 已完成')
  })

  it('asks about a rename too, and says so when there is nothing to change', async () => {
    const { render, gate } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const renamed = await gate('requirement_update', { ref: '接口对接', name: 'H1-00 接口对接' })
    expect(renamed.reason).toContain('名称：「接口对接」→「H1-00 接口对接」')

    const noop = await gate('requirement_update', { ref: '接口对接', status: 'proposed' })
    expect(noop.reason).toContain('没有任何改动')
  })

  it('asks before retiring an entry', async () => {
    const { render, gate } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const decision = await gate('requirement_archive', { ref: '接口对接', reason: '需求方撤了' })
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('已废弃')
    expect(decision.reason).toContain('需求方撤了')
    expect(decision.reason).toContain('仍然读得到')
  })

  it('lets an append and a file write straight through', async () => {
    const { render, gate } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    // 纯追加不丢任何东西：加一道审批会把「顺手记一条」变成「要打断使用者一次」，
    // 模型于是学会不记——这正是本功能唯一的失败方式。
    expect((await gate('requirement_annotate', { ref: '接口对接', text: '一句话' })).kind).toBe('allow')
    expect((await gate('requirement_artifact_write', { ref: '接口对接', kind: 'generated', name: 'a.md', content: 'x' })).kind)
      .toBe('allow')
    expect((await gate('requirement_create', { project: 'prj-1', name: '全新的' })).kind).toBe('allow')
  })

  it('asks about a create that acknowledges a duplicate, and names the twin', async () => {
    const { render, gate, service } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    const twin = (await service.list()).rows[0]
    const decision = await gate('requirement_create', {
      project: '现代保险 NC65 集成',
      name: '接口对接',
      acknowledgeDuplicate: twin?.id,
    })
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('另建一条')
    expect(decision.reason).toContain(twin?.id ?? 'x')
  })

  it('refuses every write in a read-only session, and says how to proceed', async () => {
    const { render, gate } = await bench()
    await render('requirement_create', { project: 'prj-1', name: '接口对接' })
    for (const [name, args] of [
      ['requirement_annotate', { ref: '接口对接', text: '一句话' }],
      ['requirement_update', { ref: '接口对接', status: 'done' }],
      ['requirement_archive', { ref: '接口对接' }],
      ['requirement_create', { project: 'prj-1', name: '新的' }],
    ] as Array<[string, unknown]>) {
      const decision = await gate(name, args, { sandbox: 'read-only', approval: undefined })
      expect(decision.kind).toBe('deny')
      expect(decision.reason).toContain('仅可查看')
    }
  })

  it('runs without asking in a session that has said nobody can be asked', async () => {
    const { gate } = await bench()
    // `never` 是使用者的选择：那边没有人能批准，所以破坏性写在这里直接跑，而不是
    // 失败关闭。这条口径与 project 工具族一致（`tools.ts:445-454`）。
    expect((await gate('requirement_archive', { ref: '接口对接' }, { sandbox: undefined, approval: 'never' })).kind)
      .toBe('allow')
  })

  it('gets out of the way when the reference cannot be read', async () => {
    const { gate } = await bench()
    // 引用解析不出来是工具自己会报的错；问一张跑不起来的卡是噪声。
    expect((await gate('requirement_update', { ref: '没有这条', status: 'done' })).kind).toBe('allow')
    expect((await gate('requirement_update', { status: 'done' })).kind).toBe('allow')
  })

  it('does not touch a read tool', async () => {
    const { gate } = await bench()
    expect((await gate('requirement_list', {}, { sandbox: 'read-only', approval: undefined })).kind).toBe('allow')
  })
})
