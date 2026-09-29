/**
 * 消化工具：章节识别、正文提取、术语与约束句抽取、摸底分段。
 *
 * 这个文件是**补出来的**。`digest-plan` / `digest-audit` / `digest-config` 合计约
 * 1500 行，此前一个测试都没有——验证靠的是 staging 里几个一次性 `.mjs` 脚本，
 * 那些脚本不进仓库、也不随代码演进。代价在实测里兑现了：
 *
 * 两个模块各写了一套章节识别，plan 侧有五条过滤规则，audit 侧一条都没有。于是同一
 * 份红皮书，plan 报 6 章而 audit 报 10 章——audit 把响应参数表里的
 * 「0 表示操作成功，和result 等同」当成了一个一级章节，**一份合格的产物被判成
 * 覆盖率不合格**。下面第一组用例就是钉住这次漂移。
 *
 * 注释与断言用中文，与 `src/` 保持一致。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DIGEST_CONFIG } from '../src/host/digest-config.ts'
import { headingsOf, planDigest } from '../src/host/digest-plan.ts'
import {
  bodyOnly, chineseTerms, constraints, identifierCounts, identifiers, sections,
} from '../src/host/digest-audit.ts'

const config = DEFAULT_DIGEST_CONFIG

/** 一份含「第X章」的迷你文档，正文里混进各种容易被误判为标题的行。 */
const SAMPLE = [
  '第一章 基本概念',
  '1.1 背景',
  '消息包括消息中心和消息平台两个服务。',
  '响应参数：',
  'flag',
  'Integer',
  '0 表示操作成功，和result 等同',
  '第二章 技术架构',
  '2.1 总体架构设计',
  '本章只有图。',
].join('\n')

describe('章节识别', () => {
  it('不把参数表里的「0 表示操作成功，和result 等同」当成一级章节', () => {
    // 这就是实测里那份合格产物被判不合格的原因：该行以数字开头、长度也在上限内，
    // 只有「一级标题禁含句读标点」这一条能拦住它（标题里有一对逗号）。
    const { level1 } = sections(SAMPLE, config)
    expect([...level1]).toEqual(['第一章 基本概念', '第二章 技术架构'])
  })

  it('sections() 与 headingsOf() 是同一套实现，同一份文本不会给出两个答案', () => {
    const { level1, level2 } = sections(SAMPLE, config)
    const headings = headingsOf(SAMPLE.split('\n'), config)
    expect([...level1]).toEqual(headings.filter(h => h.level === 1).map(h => h.title))
    expect([...level2]).toEqual(headings.filter(h => h.level === 2).map(h => h.title))
  })

  it('文档已经用「第X章」时，数字形态的一级编号一律不当章节', () => {
    const text = ['第一章 基本概念', '1 这是正文里的一行', '第二章 技术架构'].join('\n')
    const { level1 } = sections(text, config)
    expect([...level1]).toEqual(['第一章 基本概念', '第二章 技术架构'])
  })

  it('一级编号不递增时不认——正文里的「1 xxx」表格行靠这条滤掉', () => {
    const text = [
      '1 第一章标题', '2 第二章标题', '3 第三章标题',
      '1 正文里的一行', '2 又一行',
    ].join('\n')
    const { level1 } = sections(text, config)
    expect(level1.size).toBe(3)
  })

  it('一级标题超长时不认——编号步骤列表的每一条都是完整句子', () => {
    const first = '这一条其实是一个很长的完整句子而不是名词短语'
    const second = '这一条同样是一个很长的完整句子而不是名词短语'
    // 长度必须真的超过上限：第一版这里写短了两个字，20 字正好等于上限而不被过滤，
    // 断言假失败。让用例自证长度，免得下次改文案又踩。
    expect(first.length).toBeGreaterThan(config.sections.maxChapterTitleLength)
    expect(second.length).toBeGreaterThan(config.sections.maxChapterTitleLength)
    const text = [`1 ${first}`, `2 ${second}`].join('\n')
    const { level1 } = sections(text, config)
    expect(level1.size).toBe(0)
  })

  it('二级小节不受「第X章」影响，照常识别', () => {
    const { level2 } = sections(SAMPLE, config)
    expect([...level2]).toEqual(['1.1 背景', '2.1 总体架构设计'])
  })
})

describe('标识符抽取', () => {
  it('三种形态都抽：连字符连接、camelCase、全大写缩写', () => {
    const text = '使用 UCF-MDD 与 getQuerySchemmaByCond，以及 SLB 通道。'
    const found = identifiers(text, config)
    expect(found.has('UCF-MDD')).toBe(true)
    expect(found.has('getQuerySchemmaByCond')).toBe(true)
    expect(found.has('SLB')).toBe(true)
  })

  it('连字符标识符不会被长度下限滤掉（UCF-MDD 曾被误滤）', () => {
    const counts = identifierCounts('UCF-MDD UCF-MDD UCF-MDD', config)
    expect([...counts.keys()]).toContain('UCF-MDD')
  })
})

describe('正文提取', () => {
  it('bodyOnly 剥掉 frontmatter 与引用块——编者注里提到源文档没有的词不算幻觉', () => {
    const text = [
      '---',
      'tags: [x]',
      'platform_version: "BIP V5"',
      '---',
      '# 标题',
      '正文里有 MddRefService。',
      '> 原文拼写 MddRefServcie，疑为 MddRefService 的笔误。',
    ].join('\n')
    const body = bodyOnly(text, config)
    expect(body).toContain('MddRefService')
    expect(body).not.toContain('MddRefServcie')
    expect(body).not.toContain('platform_version')
  })
})

describe('术语与约束句', () => {
  it('中文术语能认出反复出现的业务名词', () => {
    const text = '消息通道的配置。消息通道的配置。消息通道需要配置资源。'
    const terms = chineseTerms(text, config)
    expect([...terms].some(term => term.includes('消息通道'))).toBe(true)
  })

  it('约束句抽得出来——「不支持」「必须」这类最容易在摘要里丢', () => {
    const text = '注意，扩展通道与原通道不能同时存在，并且扩展通道在公有云不提供支持，仅专属化允许。'
    const found = constraints(text, config)
    expect(found.length).toBeGreaterThan(0)
  })
})

describe('摸底分段', () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('章节范围按标题边界切，不按页号切——跨页的小节不会被切给下一章', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-plan-'))
    const file = path.join(dir, 'source.md')
    // 关键构造：1.2 那一节的正文落在「第2页」，而按页号切会把第 2 页整块算给
    // 第二章——实测里 2.3 部署架构的半节就是这样从知识库里消失的。
    await writeFile(file, [
      '# 文档',              // 1
      '',                    // 2
      '## 第1页',            // 3
      '',                    // 4
      '第一章 基本概念',      // 5
      '1.1 背景',            // 6
      '背景正文。',          // 7
      '',                    // 8
      '## 第2页',            // 9
      '',                    // 10
      '1.2 部署架构',        // 11
      '部署架构正文，关键字 SLB 与 Docker。', // 12
      '',                    // 13
      '第二章 技术架构',      // 14
      '2.1 总体架构设计',     // 15
      '总体正文。',          // 16
    ].join('\n'), 'utf8')

    const plan = await planDigest(file, config)
    expect(plan.chapters.length).toBe(2)
    const first = plan.chapters[0]
    const second = plan.chapters[1]
    // 第一章的范围必须覆盖到第 12 行（SLB 那行）。按页号切只会到第 8 行。
    expect(first?.endLine).toBeGreaterThanOrEqual(12)
    expect(first?.children).toContain('1.2 部署架构')
    // 切分必须无缝：第二章从第一章结束的下一行开始
    expect(second?.line).toBe((first?.endLine ?? 0) + 1)
  })

  it('页标记数量与行数报得出来', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-plan-'))
    const file = path.join(dir, 'source.md')
    await writeFile(file, ['## 第1页', '正文。', '## 第2页', '正文。'].join('\n'), 'utf8')
    const plan = await planDigest(file, config)
    expect(plan.pageMarks).toBe(2)
    expect(plan.lines).toBe(4)
  })
})
