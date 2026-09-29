/**
 * 消化前的摸底：拿到源文档的骨架与分段范围。
 *
 * ## 它替代了什么
 *
 * 实测消化一份 133 页红皮书时，为了搞清「有多少页、分几章、每章从哪行到哪行」，
 * 当场写了三个一次性脚本：一个抽页标记、一个抽目录、一个把章节映射到行号。
 * **下一次还要重写一遍。** 这个模块把那三个脚本变成永久能力。
 *
 * ## 为什么范围必须按标题边界切
 *
 * 这是踩过的坑，而且踩得很实在。当时按**页号**切章：第 2 章从 p12 起、第 3 章
 * 从 p15 起。但 2.3 部署架构那一节的内容延续到了 p15–p16——按页切就把它的尾部
 * 划给了第 3 章，而负责第 3 章的人按「只写第 3 章」处理，**那半节就此消失**，
 * 直到最后核对时才发现知识库里有个洞。
 *
 * 按标题边界切就没这个问题：每章的范围从本章标题起，到下一章标题的前一行止。
 * 跨页的章节自然被完整包含。
 *
 * ## 输出可以直接喂给 read
 *
 * 每个 `offset` / `limit` 就是 read 工具的两个参数，复制即用。
 */
import { readFile } from 'node:fs/promises'
import { compilePatterns, type DigestConfig } from './digest-config.ts'

/** 一个章节在源文档里的位置与范围。 */
export interface PlanChapter {
  /** 章节标题，含编号。 */
  readonly title: string
  /** 1 表示一级章节，2 表示二级小节。 */
  readonly level: number
  /** 标题所在行，1-based。 */
  readonly line: number
  /** 内容结束行（下一章标题的前一行），1-based。 */
  readonly endLine: number
  /** 本章字符数。 */
  readonly characters: number
  /** 标题所在的 PDF 物理页号；源文档没有页标记时为 undefined。 */
  readonly page?: number
  /** 本章之下的二级小节标题，按出现顺序。 */
  readonly children: readonly string[]
}

/** 一份源文档的骨架。 */
export interface DigestPlan {
  readonly source: string
  readonly bytes: number
  readonly characters: number
  readonly lines: number
  /** 抽取器插入的页标记数量。 */
  readonly pageMarks: number
  /** 每页字符数的分布——用来判断哪些页内容密集、哪些是空页。 */
  readonly pageChars: { readonly median: number, readonly min: number, readonly max: number }
  /** 一级章节；源文档没有一级章节时为空。 */
  readonly chapters: readonly PlanChapter[]
  /** 二级小节总数。 */
  readonly sectionCount: number
  /** 值得注意的地方：跨页边界、疑似只有图题的图、范围切分提示。 */
  readonly notes: readonly string[]
}

/**
 * 一个标题及其行号。
 *
 * 这是**全插件唯一的章节识别结果结构**：`digest-plan` 用它算范围，`digest-audit`
 * 的 `sections()` 也调用同一个 `headingsOf()`。
 */
export interface Heading {
  readonly title: string
  readonly level: number
  readonly line: number
}

/**
 * 抽出全部有编号的标题及其行号。
 *
 * **这是章节识别的唯一实现**，`digest-plan` 与 `digest-audit` 共用。
 *
 * 曾经这里踩过一个坑：两个模块各写了一套识别逻辑，plan 侧有五条过滤规则
 * （有「第X章」时数字一级编号作废、一级编号须严格递增、一级标题长度上限、
 * 一级标题禁含句读标点、跳过页标记与页眉），audit 侧一条都没有。结果同一份
 * 文档，plan 报 6 章而 audit 报 10 章——audit 把参数表里的
 * 「0 表示操作成功，和result 等同」当成了一个一级章节，于是**合格产物被判
 * 覆盖率不合格（假阴性）**。两套逻辑必然漂移，所以合并到这里。
 *
 * 一级编号要求**严格递增**，这条是踩出来的：实测一份 1846 页的文档报出 58 个
 * 一级章节，而它只有 10 章——正文里的 `1 xxx` 这类表格行、列表项被当成了标题。
 * 真章节的编号是 1,2,3…连续递增的，误判的则是零散的。
 *
 * @param lines - 源文档按行切开的数组。
 * @param config - 配置。
 * @returns 标题列表，按行号升序。
 */
export function headingsOf(lines: readonly string[], config: DigestConfig): readonly Heading[] {
  const patterns = compilePatterns(config)
  const found: Heading[] = []

  // 先扫一遍，看文档有没有用「第X章」。**同一份文档不会混用两套章号**，所以一旦
  // 有「第X章」，数字形态的一级编号就都不可信了。这条规则很硬：实测一份文档里
  // 混着 `第四章 Web 端UI 组件` 和 `1 key 为ctTplId 的合同模版ID` 这样的正文行，
  // 靠长度和标点过滤还剩两个漏网的，靠这条一次清干净。
  const usesChapterWord = lines.some((raw) => {
    const line = (raw ?? '').trim()
    if (line === '' || line.length > config.sections.maxTitleLength) return false
    if (patterns.tocLine.test(line)) return false
    return patterns.chapter.test(line)
  })

  let lastLevel1 = 0
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    if (line === '' || line.length > config.sections.maxTitleLength) continue
    if (patterns.tocLine.test(line)) continue                      // 目录行
    if (patterns.sourcePageMark.test(line)) continue               // 页标记本身就是一行
    if (/^第\s*\d+\s*页$/.test(line)) continue                     // 正文页眉
    if (patterns.sourceNoise.test(line)) continue                  // 版权/修订

    const chapter = patterns.chapter.exec(line)
    if (chapter !== null) {
      const title = (chapter[2] ?? '').trim()
      // The same two guards the numbered branch uses, and for the same reason.
      //
      // Until the chapter pattern learned that the space after 章 is optional, the
      // space itself did this job: prose beginning 「第一章…」 could not match. With
      // the space optional, a sentence like
      // 「第一章介绍了元数据的基本概念、分层结构与查询方案，以及对外接口。」 matches
      // perfectly, and only its length and its punctuation give it away.
      const tooLong = title.length > config.sections.maxChapterTitleLength
      const punctuated = [...config.sections.chapterTitleForbidden].some(ch => title.includes(ch))
      if (title.length >= 2 && !tooLong && !punctuated && !/^[；，,;]/.test(title)) {
        found.push({ title: `第${chapter[1] ?? ''}章 ${title}`, level: 1, line: i + 1 })
      }
      continue
    }

    const numbered = patterns.numbered.exec(line)
    if (numbered === null) continue
    const number = numbered[1] ?? ''
    const depth = number.split('.').length
    if (depth > config.sections.maxDepth) continue
    const title = (numbered[2] ?? '').trim()
    if (title.length < 2 || /[。；，,;]$/.test(title)) continue
    if (/^\d/.test(title)) continue
    if (/^(年|月|日|修订|页)/.test(title)) continue
    if (/^[、，。；：,.;:（）()【】]/.test(title)) continue
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(title)) continue

    if (depth === 1) {
      // 文档已经用「第X章」时，数字一级编号一律不当章节
      if (usesChapterWord) continue
      const value = Number(number)
      if (!Number.isFinite(value) || value <= lastLevel1) continue  // 不递增 = 误判
      // 长度与标点这两条，拦的是「编号步骤列表」——它编号连续递增，把递增那条
      // 也骗过去了，但它的每一条都是完整句子而不是名词短语
      if (title.length > config.sections.maxChapterTitleLength) continue
      if ([...config.sections.chapterTitleForbidden].some(ch => title.includes(ch))) continue
      lastLevel1 = value
    }
    found.push({ title: `${number} ${title}`, level: depth, line: i + 1 })
  }
  return found
}

/**
 * 把「只有二级编号」的文档按编号前缀分组为章。
 *
 * 有些文档的正文里不写一级标题——章是隐含在 `3.1`、`3.2`、`3.3` 的前缀里的。
 * 实测一份 133 页的文档就是如此：正文里一个「第X章」都没有，也没有独立的一级
 * 编号行，于是摸底报出「没有识别到一级章节」，整个 range 都给不出来。
 *
 * 分组规则：前缀相同（都是 `3.x`）的二级小节算同一章，章的范围从组内第一个
 * 小节起，到下一组第一个小节的前一行止。
 *
 * @param sections - 二级标题列表，按行号升序。
 * @param lines - 源文档按行切开的数组。
 * @param totalLines - 总行数。
 * @returns 推出来的章列表。
 */
function groupByPrefix(
  sections: readonly Heading[],
  lines: readonly string[],
  totalLines: number,
): readonly PlanChapter[] {
  const groups = new Map<string, Heading[]>()
  for (const heading of sections) {
    const prefix = (heading.title.split(/[\s　]+/)[0] ?? '').split('.')[0] ?? ''
    if (prefix === '') continue
    const list = groups.get(prefix)
    if (list === undefined) groups.set(prefix, [heading])
    else list.push(heading)
  }

  const ordered = [...groups.entries()].sort((a, b) => (a[1][0]?.line ?? 0) - (b[1][0]?.line ?? 0))
  return ordered.map(([prefix, list], index) => {
    const first = list[0]
    const start = first?.line ?? 1
    const nextGroup = ordered[index + 1]
    const endLine = (nextGroup?.[1][0]?.line ?? totalLines + 1) - 1
    return {
      title: `第 ${prefix} 章（编号从正文的「${first?.title ?? prefix}」推出）`,
      level: 1,
      line: start,
      endLine,
      characters: lines.slice(start - 1, endLine).join('\n').length,
      children: list.map(h => h.title),
    }
  })
}

/**
 * 摸清一份源文档的骨架。
 *
 * @param source - 源文档路径（PDF 抽取出来的文本）。
 * @param config - 配置。
 * @returns 骨架与分段范围。
 * @throws 当源文档读不到时。
 */
export async function planDigest(source: string, config: DigestConfig): Promise<DigestPlan> {
  const text = await readFile(source, 'utf8')
  const lines = text.split(/\r?\n/)
  const patterns = compilePatterns(config)

  // 页标记与每页字符数
  const marks: { page: number, line: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s*第\s*(\d+)\s*页\s*$/.exec((lines[i] ?? '').trim())
    if (m !== null && m[1] !== undefined) marks.push({ page: Number(m[1]), line: i + 1 })
  }
  const pageChars: number[] = []
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i]?.line ?? 0
    const to = (marks[i + 1]?.line ?? lines.length + 1) - 1
    pageChars.push(lines.slice(from, to).join('\n').length)
  }
  const sorted = [...pageChars].sort((a, b) => a - b)
  const pageOf = (line: number): number | undefined => {
    let page: number | undefined
    for (const mark of marks) { if (mark.line <= line) page = mark.page; else break }
    return page
  }

  const headings = headingsOf(lines, config)
  const roots = headings.filter(h => h.level === 1)
  const seconds = headings.filter(h => h.level === 2)

  // 范围按**标题边界**切：从本章标题到下一章标题的前一行。这样跨页的章节是完整的
  // ——按页号切会把章节的尾巴划给下一章，实测里 2.3 部署架构就这么丢了半节。
  //
  // 没有一级标题时，改从二级编号的前缀推章分组：有些文档的章是隐含在 `3.1`、
  // `3.2` 的前缀里的，正文里根本不写一级标题。
  const chapters: readonly PlanChapter[] = roots.length > 0
    ? roots.map((root, index) => {
      const next = roots[index + 1]
      const endLine = next === undefined ? lines.length : next.line - 1
      const children = headings
        .filter(h => h.level === 2 && h.line > root.line && h.line <= endLine)
        .map(h => h.title)
      const page = pageOf(root.line)
      return {
        title: root.title,
        level: 1,
        line: root.line,
        endLine,
        characters: lines.slice(root.line - 1, endLine).join('\n').length,
        ...(page === undefined ? {} : { page }),
        children,
      }
    })
    : groupByPrefix(seconds, lines, lines.length)

  const notes: string[] = []
  const sectionCount = seconds.length
  const inferred = roots.length === 0 && chapters.length > 0

  if (chapters.length === 0) {
    notes.push('没有识别到章节。源文档可能用的是其他编号形态（如 Part N、纯 ###），'
      + '需要调整配置里的 sections.chapterPattern 或 sections.numberedPattern；'
      + '在调整之前给不出 range，请按页标记手动分段。')
  }
  if (inferred) {
    notes.push(`正文里没有一级标题，下面的 ${chapters.length} 章是从二级编号的前缀`
      + '（如 `3.1`、`3.2` 同属第 3 章）推出来的。章标题因此是生成的，'
      + '**引用时请用它的范围，不要照抄标题名**。')
  }
  if (marks.length === 0) {
    notes.push('没有页标记，来源可能不是 PDF。产物里的页码引用（溯源密度）会永远为 0，'
      + '可以考虑改用其他溯源方式（URL 锚点、小节名），并在配置里调整 pageMarkPattern。')
  }
  if (marks.length > 0 && roots.length > 0) {
    // 章边界与页边界不一致时明说：这正是「按页切会切丢内容」的场景
    const misaligned = chapters.filter(c => {
      const startPage = pageOf(c.line)
      const endPage = pageOf(c.endLine)
      return startPage !== undefined && endPage !== undefined && startPage !== endPage
    })
    if (misaligned.length > 0) {
      notes.push(`有 ${misaligned.length} 章跨越了页边界（如「${misaligned[0]?.title ?? ''}」）。`
        + '**按页号分段会切掉章节的尾巴**——务必用下面给的 offset/limit，它按标题边界算。')
    }
  }

  // 疑似只有图题的图：`图N` 出现但附近没有正文，只能提示，不能断言
  const figureRefs = [...text.matchAll(/[（(]?\s*图\s*\d+/g)].length
  if (figureRefs > 0) {
    notes.push(`源文档提到 ${figureRefs} 处「图N」。PDF 抽取通常只留图题、丢掉图本身——`
      + '遇到时如实标注「原图未随文本抽取」，不要凭图题想象图的内容。')
  }

  const totalChars = text.length
  const coverage = chapters.reduce((sum, c) => sum + c.characters, 0)
  if (roots.length > 0 && coverage < totalChars * 0.5) {
    notes.push(`章节范围覆盖 ${(coverage / totalChars * 100).toFixed(0)}% 的字符，`
      + '剩下的在章节之前（封面、目录、前言）——那部分通常不必消化。')
  }

  return {
    source,
    bytes: Buffer.byteLength(text, 'utf8'),
    characters: totalChars,
    lines: lines.length,
    pageMarks: marks.length,
    pageChars: {
      median: sorted.length === 0 ? 0 : (sorted[Math.floor(sorted.length / 2)] ?? 0),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    },
    chapters,
    sectionCount,
    notes,
  }
}
