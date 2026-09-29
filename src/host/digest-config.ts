/**
 * 消化验收的配置：阈值、识别模式、词表。
 *
 * ## 为什么这些数必须能改
 *
 * 七项指标的**设计**与具体文档无关，但它们的**参数**高度依赖文档类型。实测
 * 出来的每一条都咬过人：
 *
 * - 章节号写死成「1–2 位数字」，换成 `Part 3` 或纯 `###` 的文档就一条都认不出
 * - 页码引用写死成 `（pN）`，网页素材没有页码，这一项会永远 0%
 * - 通用词表是针对这份红皮书手写的，换一份文档就会有新的噪音词
 * - 阈值 85% / 98% 只在 MDD 红皮书一份上校准过
 *
 * 所以参数放在 `~/.dsh/yon-panel/digest_config.json`，随文档类型调整；不写就是
 * 下面这份默认值——它来自 MDD 红皮书（133 页）与 MDF 红皮书（1846 页）两次实测。
 *
 * ## 关于停用词表
 *
 * 词表是启发式的，**必然不全**。它的作用是砍掉 n-gram 抽出来的普通词组，不是
 * 精确分词——中文没有词边界，做不到精确。发现漏网的新噪音就加进去。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 各项指标的阈值。全部是比例（0–1），不是百分数。 */
export interface DigestThresholds {
  /** 中文术语、英文标识符、一级章节、约束句的覆盖率下限 */
  readonly coverage: number
  /** 二级章节覆盖率下限——比一级松，因为二级更容易被合并掉 */
  readonly level2: number
  /** 保真率下限 */
  readonly fidelity: number
  /** 溯源密度下限 */
  readonly provenance: number
  /** 重叠率**上限**：高于它就说明这份素材大部分已经在库里了 */
  readonly overlap: number
  /** 可寻址下限 */
  readonly addressable: number
  /**
   * 保真率的样本下限。
   *
   * 低于这个数时只报告臆造、不按比例判定：五个标识符里错一个就是 80%，这个
   * 比例没有意义。但**有臆造仍然要报**——实测里那份编造的摘要靠 5 个标识符
   * 拿到 100% 保真，正是分母太小造成的假合格。
   */
  readonly fidelitySample: number
}

/** 章节识别的模式与限制。 */
export interface DigestSectionConfig {
  /** 一级章节：中文数字章号，捕获组 1 是章号、组 2 是标题 */
  readonly chapterPattern: string
  /** 数字编号章节：捕获组 1 是编号、组 2 是标题 */
  readonly numberedPattern: string
  /** 标题最长多少个字符——再长就不是标题了 */
  readonly maxTitleLength: number
  /** 最多认到第几级编号（2 表示 `1.1`，3 表示 `1.1.1`） */
  readonly maxDepth: number
}

/** 术语抽取的参数。 */
export interface DigestTermConfig {
  /** 至少出现几次才算术语 */
  readonly minCount: number
  readonly minLength: number
  readonly maxLength: number
  /** 含这些字符的片段不算术语（虚词与助词） */
  readonly functionPattern: string
  /** 通用词表：单独出现时不含知识的词 */
  readonly generic: readonly string[]
  /**
   * 源文档里要剔除的行：封面、版权页、修订记录、目录、页眉。
   *
   * 不剔除不行。`版权`、`用友集团`、`本文档描述` 会被 n-gram 当成术语抽出来，
   * 但没有任何一份合格的产物会去覆盖版权声明——留着它们，覆盖率永远上不了
   * 85%，标准也就废了。
   */
  readonly noisePattern: string
  /** 页标记行（抽取器插入的），不计入正文 */
  readonly pageMarkPattern: string
  /** 目录行 */
  readonly tocLinePattern: string
}

/** 英文标识符抽取的参数。 */
export interface DigestIdentifierConfig {
  /** 标识符的形态：带分隔符的名、驼峰词、纯大写缩写 */
  readonly pattern: string
  readonly minLength: number
  readonly maxLength: number
  /**
   * 不承载知识点的通用英文词。
   *
   * 只放功能词和任何技术文档都会有的术语（HTTP、JSON）。**产品与框架缩写不放
   * 这里**——`MDD`、`MDF`、`BIP` 对各自的文档就是核心概念，滤掉等于把知识点
   * 从分母里删掉。
   */
  readonly stop: readonly string[]
}

/** 一份完整的消化验收配置。 */
export interface DigestConfig {
  readonly thresholds: DigestThresholds
  /** 体积比的预警区间：落在区间外只提示，不作判据 */
  readonly volume: { readonly min: number, readonly max: number }
  readonly sections: DigestSectionConfig
  readonly terms: DigestTermConfig
  readonly identifiers: DigestIdentifierConfig
  /** 产物页码引用的写法 */
  readonly pageMarkPattern: string
  /** 约束句的模态词 */
  readonly constraintPattern: string
  /** 产物 frontmatter 的必填字段 */
  readonly requiredFields: readonly string[]
  /** frontmatter 的已知字段，用于指出多余字段 */
  readonly knownFields: readonly string[]
  /** 编者注的判定：以这些字符开头的行不参与保真检查 */
  readonly noteLinePattern: string
  /** wikilink 的形态，比对前先剔除 */
  readonly wikilinkPattern: string
  /** 重叠门禁扫描 vault 的哪几个目录 */
  readonly vaultScopes: readonly string[]
}

/** 默认配置。数值来自 MDD（133 页）与 MDF（1846 页）两份红皮书的实测校准。 */
export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  thresholds: {
    coverage: 0.85,
    level2: 0.6,
    fidelity: 0.98,
    provenance: 0.5,
    overlap: 0.85,
    addressable: 0.7,
    fidelitySample: 20,
  },
  volume: { min: 0.01, max: 0.6 },
  sections: {
    chapterPattern: '^第([一二三四五六七八九十百]+)章[\\s　]+(\\S.*)$',
    numberedPattern: '^(\\d{1,2}(?:\\.\\d{1,2})*)[\\s　]+(\\S.*)$',
    maxTitleLength: 46,
    maxDepth: 2,
  },
  terms: {
    minCount: 3,
    minLength: 2,
    maxLength: 8,
    functionPattern: '[的了着过和与或及等在为被把从对向让使所之其而则]',
    generic: [
      '文件', '可能', '注意', '介绍', '示例', '以下', '以上', '内容', '方式', '情况',
      '时候', '问题', '方法', '操作', '说明', '需要', '使用', '进行', '实现', '提供',
      '包括', '通过', '根据', '对于', '如果', '因此', '所以', '但是', '而且', '或者',
      '以及', '例如', '比如', '我们', '他们', '可以', '不能', '不会', '没有', '一个',
      '这个', '那个', '什么', '怎么', '为了', '由于', '关于', '之后', '之前', '同时',
      '目前', '现在', '已经', '还是', '只是', '就是', '也是', '都是', '还有', '一些',
      '一样', '一定', '不同', '相同', '相关', '主要', '重要', '常见', '具体', '直接',
      '单独', '各自', '分别', '各种', '各个', '任何', '所有', '每个', '整个', '全部',
      '部分', '其他', '其它', '此外', '另外', '其中', '上面', '下面', '前面', '后面',
      '里面', '外面', '之间', '中间', '以后', '以前', '本文档', '文档', '版本', '日期',
      '作者', '标题', '目录', '摘要', '附图', '下表', '如下', '如上', '下文', '上文',
    ],
    noisePattern: '版权|©|修订号|著者|审阅者|未经.{0,6}许可|版权所有',
    pageMarkPattern: '^##\\s*第\\s*\\d+\\s*页\\s*$',
    tocLinePattern: '\\.{4,}\\s*\\d+\\s*$',
  },
  identifiers: {
    pattern: '\\b(?:[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z][A-Za-z0-9]*)+'
      + '|[a-z]+[A-Z][a-zA-Z0-9]*'
      + '|[A-Z][a-z]+[A-Z][a-zA-Z0-9]*'
      + '|[A-Z]{2,6})\\b',
    minLength: 3,
    maxLength: 60,
    stop: [
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'you', 'can', 'not', 'are', 'was',
      'will', 'has', 'have', 'may', 'must', 'should', 'use', 'used', 'using', 'when', 'what',
      'PDF', 'HTTP', 'HTTPS', 'JSON', 'XML', 'HTML', 'CSS', 'URL', 'URI', 'SQL', 'REST',
      'API', 'SDK', 'IDE', 'CPU', 'RAM', 'GPU', 'DNS', 'CDN', 'OSS', 'ABI',
      'true', 'false', 'null', 'undefined', 'String', 'Number', 'Boolean', 'Object', 'Array',
      'Promise', 'Note', 'Tips', 'Example', 'Page', 'Table', 'Figure',
    ],
  },
  pageMarkPattern: '[（(]\\s*p\\.?\\s*\\d+\\s*[）)]|第\\s*\\d+\\s*页',
  constraintPattern: '必须|禁止|不得|不能|不支持|不可以|需要注意|注意：|建议|务必|仅支持|只支持|限制|错误做法|正确做法',
  requiredFields: ['platform_version', 'last_verified', 'status', 'source_type', 'sources'],
  knownFields: [
    'platform_version', 'last_verified', 'status', 'source_type', 'sources',
    'title', 'type', 'date', 'tags', 'created', 'updated', 'project',
    'confidence', 'source', 'parent_entity', 'snapshot_of',
  ],
  noteLinePattern: '^\\s*>',
  wikilinkPattern: '\\[\\[[^\\]]*\\]\\]',
  vaultScopes: ['wiki/sources', 'wiki/topics', 'wiki/entities'],
}

/** 配置文件的位置。 */
export function digestConfigPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'digest_config.json')
}

/**
 * 递归可选的配置。
 *
 * `Partial<DigestConfig>` 不够用：它只让顶层字段可选，嵌套对象仍是完整类型，
 * 于是 `patch.thresholds ?? {}` 推成 `DigestThresholds | {}`，读 `.coverage`
 * 就报错。配置文件要支持的恰恰是「只写想改的那几个字段」，所以每一层都得可选。
 */
type DeepPartial<T> = {
  readonly [K in keyof T]?: T[K] extends readonly unknown[] ? T[K]
    : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/**
 * 把磁盘上的部分配置叠到默认值上。
 *
 * 逐层合并而不是整体替换：操作者只想改一个阈值时，不该被迫把整份默认值抄一遍
 * ——抄一遍的后果是他抄的那一刻的默认值被永久冻结，以后默认值改进他不受益。
 *
 * @param base - 默认配置。
 * @param patch - 从文件读到的部分配置。
 * @returns 合并后的配置。
 */
function mergeConfig(base: DigestConfig, patch: DeepPartial<DigestConfig>): DigestConfig {
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

  const thresholds: DeepPartial<DigestThresholds> = patch.thresholds ?? {}
  const volume: DeepPartial<DigestConfig['volume']> = patch.volume ?? {}
  const sections: DeepPartial<DigestSectionConfig> = patch.sections ?? {}
  const terms: DeepPartial<DigestTermConfig> = patch.terms ?? {}
  const identifiers: DeepPartial<DigestIdentifierConfig> = patch.identifiers ?? {}
  const list = (value: unknown, fallback: readonly string[]): readonly string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string') ? value : fallback

  return {
    thresholds: {
      coverage: num(thresholds.coverage, base.thresholds.coverage),
      level2: num(thresholds.level2, base.thresholds.level2),
      fidelity: num(thresholds.fidelity, base.thresholds.fidelity),
      provenance: num(thresholds.provenance, base.thresholds.provenance),
      overlap: num(thresholds.overlap, base.thresholds.overlap),
      addressable: num(thresholds.addressable, base.thresholds.addressable),
      fidelitySample: num(thresholds.fidelitySample, base.thresholds.fidelitySample),
    },
    volume: {
      min: num(volume.min, base.volume.min),
      max: num(volume.max, base.volume.max),
    },
    sections: {
      chapterPattern: typeof sections.chapterPattern === 'string' ? sections.chapterPattern : base.sections.chapterPattern,
      numberedPattern: typeof sections.numberedPattern === 'string' ? sections.numberedPattern : base.sections.numberedPattern,
      maxTitleLength: num(sections.maxTitleLength, base.sections.maxTitleLength),
      maxDepth: num(sections.maxDepth, base.sections.maxDepth),
    },
    terms: {
      minCount: num(terms.minCount, base.terms.minCount),
      minLength: num(terms.minLength, base.terms.minLength),
      maxLength: num(terms.maxLength, base.terms.maxLength),
      functionPattern: typeof terms.functionPattern === 'string' ? terms.functionPattern : base.terms.functionPattern,
      generic: list(terms.generic, base.terms.generic),
      noisePattern: typeof terms.noisePattern === 'string' ? terms.noisePattern : base.terms.noisePattern,
      pageMarkPattern: typeof terms.pageMarkPattern === 'string' ? terms.pageMarkPattern : base.terms.pageMarkPattern,
      tocLinePattern: typeof terms.tocLinePattern === 'string' ? terms.tocLinePattern : base.terms.tocLinePattern,
    },
    identifiers: {
      pattern: typeof identifiers.pattern === 'string' ? identifiers.pattern : base.identifiers.pattern,
      minLength: num(identifiers.minLength, base.identifiers.minLength),
      maxLength: num(identifiers.maxLength, base.identifiers.maxLength),
      stop: list(identifiers.stop, base.identifiers.stop),
    },
    pageMarkPattern: typeof patch.pageMarkPattern === 'string' ? patch.pageMarkPattern : base.pageMarkPattern,
    constraintPattern: typeof patch.constraintPattern === 'string' ? patch.constraintPattern : base.constraintPattern,
    requiredFields: list(patch.requiredFields, base.requiredFields),
    knownFields: list(patch.knownFields, base.knownFields),
    noteLinePattern: typeof patch.noteLinePattern === 'string' ? patch.noteLinePattern : base.noteLinePattern,
    wikilinkPattern: typeof patch.wikilinkPattern === 'string' ? patch.wikilinkPattern : base.wikilinkPattern,
    vaultScopes: list(patch.vaultScopes, base.vaultScopes),
  }
}

/** 读到的一份配置，连同它的来源说明。 */
export interface LoadedDigestConfig {
  readonly config: DigestConfig
  /** 配置文件的实际路径，便于操作者去改。 */
  readonly path: string
  /** 配置文件是否存在。 */
  readonly exists: boolean
  /** 读取或解析失败时的说明；成功时为 undefined。 */
  readonly problem?: string
}

/**
 * 读配置；没有文件、或文件坏了，都用默认值。
 *
 * 坏文件**不抛错**：验收是只读操作，一份写坏的配置不该让整个检查跑不起来，
 * 只该让人知道「这次用的是默认值」。
 *
 * @returns 配置，以及它从哪来。
 */
export async function loadDigestConfig(): Promise<LoadedDigestConfig> {
  const file = digestConfigPath()
  const raw = await readFile(file, 'utf8').catch(() => undefined)
  if (raw === undefined) {
    return { config: DEFAULT_DIGEST_CONFIG, path: file, exists: false }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        config: DEFAULT_DIGEST_CONFIG, path: file, exists: true,
        problem: '配置文件不是一个 JSON 对象，本次用默认值',
      }
    }
    return { config: mergeConfig(DEFAULT_DIGEST_CONFIG, parsed as DeepPartial<DigestConfig>), path: file, exists: true }
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { config: DEFAULT_DIGEST_CONFIG, path: file, exists: true, problem: `配置解析失败（${message}），本次用默认值` }
  }
}

/**
 * 把一份配置写回磁盘，覆盖已有文件。
 *
 * 先写临时文件再改名，与插件里其他几处配置落盘的做法一致：直接覆盖时若进程
 * 中途退出，留下的是半截 JSON，下次读就只能退回默认值了。
 *
 * @param config - 要写入的配置。
 */
export async function saveDigestConfig(config: DigestConfig): Promise<void> {
  const file = digestConfigPath()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await rename(temp, file)
}

/** 把配置里的正则编译出来；编译失败抛错，因为那是配置错误而不是数据问题。 */
export interface DigestPatterns {
  readonly identifier: RegExp
  readonly chapter: RegExp
  readonly numbered: RegExp
  readonly constraint: RegExp
  readonly pageMark: RegExp
  readonly tocLine: RegExp
  readonly sourcePageMark: RegExp
  readonly sourceNoise: RegExp
  readonly termFunction: RegExp
  readonly noteLine: RegExp
  readonly wikilink: RegExp
}

/**
 * 把配置里的模式字符串编译成正则。
 * @param config - 配置。
 * @returns 全部模式。
 * @throws 当某个模式不是合法正则时——这必须让人知道，静默退回默认模式会让人
 *   以为自己改的配置生效了。
 */
export function compilePatterns(config: DigestConfig): DigestPatterns {
  const build = (source: string, flags: string): RegExp => {
    try {
      return new RegExp(source, flags)
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`配置里的正则不合法「${source}」：${message}`)
    }
  }
  return {
    identifier: build(config.identifiers.pattern, 'g'),
    chapter: build(config.sections.chapterPattern, ''),
    numbered: build(config.sections.numberedPattern, ''),
    constraint: build(config.constraintPattern, ''),
    pageMark: build(config.pageMarkPattern, 'g'),
    tocLine: build(config.terms.tocLinePattern, ''),
    sourcePageMark: build(config.terms.pageMarkPattern, ''),
    sourceNoise: build(config.terms.noisePattern, ''),
    termFunction: build(config.terms.functionPattern, ''),
    noteLine: build(config.noteLinePattern, ''),
    wikilink: build(config.wikilinkPattern, 'g'),
  }
}
