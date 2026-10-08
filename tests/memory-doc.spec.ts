/**
 * 一条记忆的文本层：frontmatter 与正文怎么互相转换，以及读不出来的那些长什么样。
 *
 * 这一层没有文件系统、没有时钟，所以它测的是**规则**：往返一致、容错回退、以及
 * 「什么样的文件不算一条记忆」。规则错了，store 与 service 会一起错，所以它们只有
 * 这一处抄写。
 */
import { describe, expect, it } from 'vitest'
import { parseMemory, serializeMemory, type MemoryDoc } from '../src/host/memory-doc.ts'

/** One complete document, as the service would build it. */
function document(overrides: Partial<MemoryDoc> = {}): MemoryDoc {
  return {
    id: 'mem-20261005-141230-a1b2',
    projectId: 'd16df4e7-6c76-4bde-8f9b-bd4e2517f6a2',
    type: 'pitfall',
    title: '达梦下按时间范围查询必须走索引',
    tags: ['达梦', '性能'],
    source: '实测于 2026-10-05 会话，datasource_query 对 68.11.100.7',
    createdAt: '2026-10-05T06:12:30.000Z',
    updatedAt: '2026-10-05T06:12:30.000Z',
    body: '不带时间范围时全表扫。',
    ...overrides,
  }
}

describe('one memory document', () => {
  it('survives a round trip', () => {
    const doc = document()
    const parsed = parseMemory(serializeMemory(doc))

    expect(parsed).toEqual(doc)
  })

  it('keeps a colon in the title', () => {
    // 标题里出现中文冒号或英文冒号都很常见，而解析只认第一个冒号作分隔。
    const doc = document({ title: '达梦：区间查询必须带范围' })
    expect(parseMemory(serializeMemory(doc))?.title).toBe('达梦：区间查询必须带范围')
  })

  it('reads tags written by hand as well as by the host', () => {
    const body = (tags: string): string => [
      '---',
      'id: mem-1',
      'project: p-1',
      'type: pitfall',
      'title: 标题',
      `tags: ${tags}`,
      'source: 一次实测',
      'created: 2026-10-05T06:12:30.000Z',
      'updated: 2026-10-05T06:12:30.000Z',
      '---',
      '',
      '正文。',
    ].join('\n')

    // 宿主写的是方括号形式；手写的人多半直接逗号分隔，中日文逗号都会出现。
    expect(parseMemory(body('[达梦, 性能]'))?.tags).toEqual(['达梦', '性能'])
    expect(parseMemory(body('达梦, 性能'))?.tags).toEqual(['达梦', '性能'])
    expect(parseMemory(body('达梦，性能'))?.tags).toEqual(['达梦', '性能'])
    expect(parseMemory(body('[]'))?.tags).toEqual([])
  })

  it('falls back on an unknown type rather than refusing the memory', () => {
    // 枚举值写错了不该连这一条记忆一起丢掉：正文还在，读者仍需要它。
    const text = serializeMemory(document()).replace('type: pitfall', 'type: 坑')
    expect(parseMemory(text)?.type).toBe('lesson')
  })

  it('refuses a file that is not a memory', () => {
    // 没有 frontmatter、frontmatter 不闭合、以及缺 id 或 title：都不算一条记忆。
    // 返回 undefined 而不是猜一个标题出来，是这一层的诚实之处。
    expect(parseMemory('就是一段普通文本。')).toBeUndefined()
    expect(parseMemory('---\nid: mem-1\ntitle: 标题\n')).toBeUndefined()
    expect(parseMemory('---\nproject: p-1\ntitle: 标题\n---\n正文')).toBeUndefined()
    expect(parseMemory('---\nid: mem-1\nproject: p-1\n---\n正文')).toBeUndefined()
  })

  it('takes an empty body', () => {
    // 正文空着是允许的：标题本身可能已经把事情说完，而拒绝它没有好处。
    expect(parseMemory(serializeMemory(document({ body: '' })))?.body).toBe('')
  })

  it('writes the frontmatter keys in one order, every time', () => {
    // 顺序固定，改一条记忆时 diff 里只有真正变了的那一行。
    const lines = serializeMemory(document()).split('\n')
    expect(lines.slice(1, 9)).toEqual([
      'id: mem-20261005-141230-a1b2',
      'project: d16df4e7-6c76-4bde-8f9b-bd4e2517f6a2',
      'type: pitfall',
      'title: 达梦下按时间范围查询必须走索引',
      'tags: [达梦, 性能]',
      'source: 实测于 2026-10-05 会话，datasource_query 对 68.11.100.7',
      'created: 2026-10-05T06:12:30.000Z',
      'updated: 2026-10-05T06:12:30.000Z',
    ])
  })
})
