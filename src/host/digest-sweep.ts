/**
 * 批量体检：把一整个目录的产物按**源文档**分组，逐组拿去验收。
 *
 * ## 为什么需要它
 *
 * `digest_audit` 一次只验一份。可「库里的消化做得到底怎么样」从来不是一个
 * 单份的问题——实测里为了回答这个问题，**连着写了四回一次性脚本**，每次都是
 * 自己遍历目录、自己从 frontmatter 里抠 `sources`、自己配对源文件、自己排表。
 * 第四次的时候就该明白了：那四回写的是同一个东西。
 *
 * ## 为什么必须按源分组
 *
 * 一份源文档常常被拆成多个主题页。**逐页对着整本源文档比覆盖率必然不合格**：
 * 实测一份 129 页文档拆成 10 页，单拿其中一页去比只有 12%–43%，十页合起来才是
 * 98.7%。第一版 `sweepDigests` 就是逐页比的，于是报告说「30 份全部不合格」——
 * 连刚验收合格的那批也在里面。这个假象是工具自己造成的，所以现在按源分组合并
 * 验收：一组的产物页一起当一份产物看。
 *
 * ## 它查出来的东西
 *
 * 一次扫描就掀开了三层：
 *
 * - 库里同一批源文档上并存着**两套互不知情的摘要**（`topics/` 与
 *   `topics/bip-platform/`），术语覆盖率 8%–18%，而合格线是 85%；
 * - 同一份 PDF 被消化过**三次**（6/1、6/14、9/30），三代产物互不引用；
 * - 一份 746 字节的摘要写着 `confidence: EXTRACTED`，正文把**消息平台**红皮书
 *   讲成了 MQ 开发指南（消息队列、生产者消费者、死信队列），六条没一条在原文里
 *   ——而 `index.md` 已经把这套说法当成事实写进了索引；
 * - `wiki/topics/` 93 份里 **59 份**的 `sources` 指向库外（一个 PDF 名），
 *   根本无从复核。
 *
 * 单看文件列表，这些产物和一份合格摘要长得一模一样。
 *
 * ## 与其他两个工具的分工
 *
 * ```
 * digest_audit(source, vault)          消化前：这一份值不值得做
 * digest_plan(source)                  摸底：分几章、每章哪行到哪行
 * digest_audit(source, product, vault) 消化后：这一份做得怎么样
 * digest_sweep(root)                   回头看：**库里这一批**做得怎么样
 * ```
 *
 * 前三个管一份，`digest_sweep` 管一批。
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { auditDigest, type DigestAudit } from './digest-audit.ts'
import type { DigestConfig } from './digest-config.ts'

/** 一组产物在体检里的结局。 */
export type SweepStatus =
  /** 找到了源文件，跑完了验收。 */
  | 'audited'
  /** frontmatter 里没有指向 vault 内的 `sources` —— 无法验收。 */
  | 'no-source-field'
  /** `sources` 指向的文件不存在 —— 来源丢了。 */
  | 'source-missing'
  /** 这一组的体量超过上限，整组没验 —— **它没有结论，不是不合格**。 */
  | 'skipped-large'
  /** 产物本身读不到。 */
  | 'unreadable'

/**
 * 流水账里对某一组产物的最近一次判定。
 *
 * 它回答的是「这一组**验过没有**」——这件事 `digest_sweep` 自己算不出来，因为
 * 验收记录不在库里，而在 `~/.dsh/` 的流水账里。
 *
 * 为什么要单列这一档：实测里一份文档的两道检查（摸底、门禁）都记了账，而**真正
 * 判定合格的那一次验收发生在仪表之外**——当时运行中的插件版本还没有「第X章」
 * 无空格的修复，走工具会把它认成 58 章、误判不合格，所以验收是在测试里直接调
 * `auditDigest` 跑的。结果是面板显示「2 次检查、合格 0、不合格 0」，读起来像
 * 「这份材料做完了检查、都没给判定」，而真相是判定跑了、只是没留下痕迹。
 *
 * **缺省不是「不合格」，也不是「合格」，是「没人验过」。** 把这三件事混成两件，
 * 报告就会替一份没验过的消化背书。
 */
export interface SweepVerdict {
  readonly outcome: 'pass' | 'fail'
  /** 判定时刻，ISO 字符串。 */
  readonly at: string
}

/**
 * 源文件路径在对账时用的键。
 *
 * 两个来源的写法不保证一致：日志里是运行当时手敲或拼出来的绝对路径，这边是
 * `path.join(root, rel)` 拼出来的。斜杠方向与大小写都可能不同，所以两边都先
 * 归一化再比——否则对账会静默地一条都配不上，然后把全部组报成「从未验收」。
 *
 * @param file - 源文件的绝对路径。
 * @returns 归一化后的键。
 */
export function sourceKey(file: string): string {
  return path.resolve(file).split(path.sep).join('/').toLowerCase()
}

/** 体检结果里的一行。 */
export interface SweepEntry {
  /** 这次验收涵盖的产物，相对 root 的路径。合并验收时会有多页。 */
  readonly products: readonly string[]
  readonly status: SweepStatus
  /** 相对 root 的源文件路径，解析到时才有。 */
  readonly source?: string
  /** frontmatter 的 `source_type`，用来区分「来源不是文件」的产物。 */
  readonly sourceType?: string
  /** frontmatter 里 `source:`（单数）声明的来源，指向库外时记在这里。 */
  readonly declaredSource?: string
  readonly audit?: DigestAudit
  /** 流水账里对同一个源的最近一次判定；**从未验收时缺省**。 */
  readonly verdict?: SweepVerdict
}

/** 一次批量体检的结果。 */
export interface DigestSweep {
  readonly root: string
  readonly under: string
  /** 扫到的 .md 总数。 */
  readonly scanned: number
  /**
   * 递归过程中读不到的目录（绝对路径）。
   *
   * 非空表示**这次统计不完整**：可能只是某个子目录读不到，也可能是 `root` 或
   * `under` 整个指错了——后者会让 `scanned` 为 0，而 0 很容易被读成「库里是空的」。
   * 两者必须分得开。
   */
  readonly unreadableDirs: readonly string[]
  /** 各结局的组数/份数。 */
  readonly counts: Readonly<Record<SweepStatus, number>>
  /** `no-source-field` 那一桶按 `source_type` 的分布；`(未标)` 表示没有该字段。 */
  readonly nonFileSourceTypes: Readonly<Record<string, number>>
  /**
   * 每个 `source_type` 的抽样页名（各取前 2 个）。
   *
   * 这一项是**为了让人能推翻报告**而存在的。实测两次错误结论——「94% 无来源」和
   * 「合格 0 组」——都是靠人工翻开 frontmatter 才发现的，而不是靠报告自己露馅。
   * 报告必须把判断所依据的样本摆出来，否则一个有说服力的错结论和一个对结论
   * 长得一模一样。
   */
  readonly nonFileSourceSamples: Readonly<Record<string, readonly string[]>>
  /** `no-source-field` 那一桶里，用 `source:` 指向库外的有多少，以及它们的取值分布。 */
  readonly declaredSources: Readonly<Record<string, number>>
  /** `source:` 指向库外文件的抽样页名与它们声明的来源。 */
  readonly declaredSourceSamples: readonly { readonly product: string, readonly declared: string }[]
  /** 能验收的**源文档份数**（不是产物页数）里，合格的组数。 */
  readonly passing: number
  /** 能验收的源文档份数里，不合格的组数。 */
  readonly failing: number
  /**
   * 能验收的组里，流水账里**没有任何判定记录**的组数。
   *
   * 「消化进库了，但没人验过」的规模。它必须单独一档：并进「合格」等于替没验过
   * 的消化背书，并进「不合格」则是冤枉——它连不合格都算不上，是没结论。
   */
  readonly neverAudited: number
  /** 能验收的组，按术语覆盖率升序——最差的排最前。 */
  readonly entries: readonly SweepEntry[]
}

/**
 * 从 frontmatter 里取第一个指向 vault 内的源路径。
 *
 * 只认 `raw/` 开头的值：`sources` 这个字段在库里有三种写法——指向 vault 内的
 * 抽取文本（可验收）、指向 vault 外的 PDF 名（验收不了）、空数组（没记来源）。
 * 后两种都该被算成「验收不了」而不是「合格」。
 *
 * @param text - 产物全文。
 * @returns 相对 vault 根的源路径；解析不到时为 undefined。
 */
export function sourcePathOf(text: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (block === null) return undefined
  const body = block[1] ?? ''

  const items: string[] = []
  const inline = /^sources:[ \t]*\[([^\]]*)\]/m.exec(body)
  if (inline !== null) {
    items.push(...(inline[1] ?? '').split(','))
  } else {
    const headed = /^sources:[ \t]*$/m.exec(body)
    if (headed !== null) {
      const after = body.slice(headed.index + headed[0].length)
      for (const line of after.split(/\r?\n/)) {
        // 空行要跳过而不是停：`sources:` 后面紧跟的就是一个换行，切出来第一项是
        // 空串。最初写成「不匹配就 break」，于是块列表式一条都读不到——是测试
        // 里那条块列表用例把它抓出来的。
        if (line.trim() === '') continue
        const item = /^[ \t]*-[ \t]*(.+)$/.exec(line)
        if (item === null) break
        items.push(item[1] ?? '')
      }
    }
  }

  for (const raw of items) {
    const value = raw.trim().replace(/^["']|["']$/g, '').trim()
    if (value.startsWith('raw/')) return value
  }
  return undefined
}

/**
 * 取 frontmatter 里某个标量字段的值。
 *
 * @param text - 产物全文。
 * @param key - 字段名。
 * @returns 去掉引号的值；没有该字段时为 undefined。
 */
export function frontmatterValueOf(text: string, key: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (block === null) return undefined
  const line = new RegExp(`^${key}:[ \t]*(.*)$`, 'm').exec(block[1] ?? '')
  if (line === null) return undefined
  const value = (line[1] ?? '').trim().replace(/^["']|["']$/g, '').trim()
  return value === '' ? undefined : value
}

/**
 * 递归列出目录下的全部 .md，并把**读不到的目录**一并带回来。
 *
 * 为什么不能只写 `catch(() => [])`：那样「目录不存在」和「目录是空的」返回同一个
 * 值——空数组。于是 `root` 或 `under` 指错时，体检会平静地报「扫描 0 份产物」，
 * 而那读起来像「这个库确实是空的」，不像「你把路径写错了」。和重叠排除那处是同
 * 一个形状：**参数没生效，却回一个合法的零**。
 *
 * @param dir - 要扫描的目录。
 * @returns 找到的文件，以及读不到的目录（含顶层与各层子目录）。
 */
async function markdownUnder(dir: string): Promise<{ files: string[], unreadable: string[] }> {
  const files: string[] = []
  const unreadable: string[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
    unreadable.push(dir)
    return []
  })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await markdownUnder(full)
      files.push(...sub.files)
      unreadable.push(...sub.unreadable)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full)
    }
  }
  return { files, unreadable }
}

/** 绝对路径 → 相对 root 的正斜杠路径。 */
function relOf(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

/**
 * 扫一个目录，把产物按它们各自声明的源文档分组，逐组验收。
 *
 * @param input - vault 根、限定子树、配置，以及可选的体量上限与返回条数上限。
 * @returns 逐组的验收结果与汇总。
 */
export async function sweepDigests(input: {
  readonly root: string
  readonly under?: string
  readonly config: DigestConfig
  /**
   * **按组**判定：一组的产物合计超过这么多字节，整组跳过、记为 `skipped-large`。
   *
   * 按组而不是按页，这条是被实测逼出来的：先前的实现逐页跳过大页面，于是
   * `MDD接口与工具类.md`（57.5 KB）被剔掉，它所在的那组只剩 4 页，覆盖率掉下去
   * ——扫描于是报「合格 0 组」，而那一组恰恰是整个库里唯一合格的一组。
   * **让组残缺比不验它更糟：残缺的组会给出一个错误的结论。**
   */
  readonly maxGroupBytes?: number
  /** 返回的明细条数上限；汇总永远是全量的。 */
  readonly limit?: number
  /**
   * 源文件路径 → 最近一次判定，由调用方从流水账读出后注入。
   *
   * 用注入而不是让这里自己去读日志：`digest-sweep` 只认文件系统，把 `~/.dsh/`
   * 下的状态引进来，既让它没法单独测，也让「扫一遍库」这件事悄悄依赖另一份
   * 可能存在也可能不存在的文件。
   */
  readonly verdicts?: ReadonlyMap<string, SweepVerdict>
}): Promise<DigestSweep> {
  const under = input.under ?? 'wiki'
  const { files, unreadable: unreadableDirs } = await markdownUnder(path.join(input.root, under))

  const counts: Record<SweepStatus, number> = {
    audited: 0, 'no-source-field': 0, 'source-missing': 0, 'skipped-large': 0, unreadable: 0,
  }
  const loose: SweepEntry[] = []
  /** 源文件绝对路径 → 引用它的产物页（绝对路径 + 字节数）。 */
  const groups = new Map<string, { file: string, bytes: number }[]>()
  const sourceCache = new Map<string, boolean>()
  let scanned = 0

  for (const file of files) {
    const rel = relOf(input.root, file)
    scanned += 1

    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      counts.unreadable += 1
      loose.push({ products: [rel], status: 'unreadable' })
      continue
    }

    const sourceRel = sourcePathOf(text)
    if (sourceRel === undefined) {
      counts['no-source-field'] += 1
      // 「没有 vault 内来源」不是一种情况而是两种，必须分开记：来源是**外部在线
      // 源**（如 OpenAPI 文档站抓取页，`source_type: community-api-docs`）的产物
      // 本来就没有本地文件可对照，那不是缺陷；而用 `source:` 指向一个**库外 PDF
      // 名**的，才是「页面在、依据没了」。第一版把两者混成一桶，报出「94% 无来源」，
      // 差点得出一个错误结论——抽样看 frontmatter 才发现绝大多数是前者。
      const sourceType = frontmatterValueOf(text, 'source_type')
      const declared = frontmatterValueOf(text, 'source')
      loose.push({
        products: [rel],
        status: 'no-source-field',
        ...(sourceType === undefined ? {} : { sourceType }),
        ...(declared === undefined ? {} : { declaredSource: declared }),
      })
      continue
    }

    const sourceAbs = path.join(input.root, sourceRel)
    let exists = sourceCache.get(sourceAbs)
    if (exists === undefined) {
      exists = await stat(sourceAbs).then(s => s.isFile()).catch(() => false)
      sourceCache.set(sourceAbs, exists)
    }
    if (!exists) {
      counts['source-missing'] += 1
      loose.push({ products: [rel], status: 'source-missing', source: sourceRel })
      continue
    }

    const size = Buffer.byteLength(text, 'utf8')
    const list = groups.get(sourceAbs)
    if (list === undefined) groups.set(sourceAbs, [{ file, bytes: size }])
    else list.push({ file, bytes: size })
  }

  let passing = 0
  let failing = 0
  let neverAudited = 0
  const audited: SweepEntry[] = []
  for (const [sourceAbs, members] of groups) {
    const sourceRel = relOf(input.root, sourceAbs)
    const productRels = members.map(m => relOf(input.root, m.file))
    const totalBytes = members.reduce((sum, m) => sum + m.bytes, 0)
    // 整组超限则整组不验。见 maxGroupBytes 的说明：让组残缺会给出错误结论。
    if (input.maxGroupBytes !== undefined && totalBytes > input.maxGroupBytes) {
      counts['skipped-large'] += 1
      loose.push({ products: productRels, status: 'skipped-large', source: sourceRel })
      continue
    }
    const audit = await auditDigest({
      source: sourceAbs,
      product: members.map(m => m.file),
      config: input.config,
      label: `${sourceRel}  ←  ${productRels.length} 页`,
    })
    counts.audited += 1
    if (audit.passed) passing += 1
    else failing += 1
    // 「验过没有」只有流水账知道：`digest_audit` 的结论说完就没了，而产物落进
    // 库里根本不需要任何验收记录。缺了这一项，报告会把「从没验过」和「验过且
    // 合格」显示成同一件事——实测里那份文档正是这样，判定合格的那次验收发生在
    // 仪表之外，面板上却显示「2 次检查、合格 0」。
    const verdict = input.verdicts?.get(sourceKey(sourceAbs))
    if (verdict === undefined) neverAudited += 1
    audited.push({
      products: productRels,
      status: 'audited',
      source: sourceRel,
      audit,
      ...(verdict === undefined ? {} : { verdict }),
    })
  }

  // 最差的排最前：体检的目的就是先看该修哪个
  audited.sort((a, b) => (a.audit?.coverage.terms.rate ?? 1) - (b.audit?.coverage.terms.rate ?? 1))

  // 「无 vault 内来源」要再拆一层——外部在线源不是缺陷，指向库外文件才是
  const nonFileSourceTypes: Record<string, number> = {}
  const nonFileSourceSamples: Record<string, string[]> = {}
  const declaredSources: Record<string, number> = {}
  const declaredSourceSamples: { product: string, declared: string }[] = []
  for (const entry of loose) {
    if (entry.status !== 'no-source-field') continue
    const key = entry.sourceType ?? '(未标 source_type)'
    nonFileSourceTypes[key] = (nonFileSourceTypes[key] ?? 0) + 1
    const samples = nonFileSourceSamples[key] ?? []
    if (samples.length < 2) {
      samples.push(entry.products[0] ?? '')
      nonFileSourceSamples[key] = samples
    }
    if (entry.declaredSource !== undefined) {
      const name = entry.declaredSource.replace(/\s*\(\s*\d+\s*页\s*\)\s*$/, '')
      declaredSources[name] = (declaredSources[name] ?? 0) + 1
      if (declaredSourceSamples.length < 6) {
        declaredSourceSamples.push({ product: entry.products[0] ?? '', declared: name })
      }
    }
  }

  const ordered = [...audited, ...loose]
  return {
    root: input.root,
    under,
    scanned,
    counts,
    nonFileSourceTypes,
    nonFileSourceSamples,
    declaredSources,
    declaredSourceSamples,
    passing,
    failing,
    neverAudited,
    unreadableDirs,
    entries: input.limit === undefined ? ordered : ordered.slice(0, input.limit),
  }
}
