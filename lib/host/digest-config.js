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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** 默认配置。数值来自 MDD（133 页）与 MDF（1846 页）两份红皮书的实测校准。 */
export const DEFAULT_DIGEST_CONFIG = {
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
        // 章号与标题之间的空白是**可选**的。
        //
        // 原先是 `[\s　]+`（至少一个），因为第一份实测文档写的是「第一章 基本概念」。
        // 第二份红皮书写的是「第一章基本概念」——中文排版里加不加空格都常见——于是
        // 整个章节识别失效：一份 58 页、6 章的文档被报成「3 章、覆盖 6% 的字符」，
        // 剩下 94% 被当成「封面、目录、前言」，而那 94% 全是正文。
        //
        // 放宽之后靠两条既有规则兜住误判：标题长度上限（maxChapterTitleLength）与
        // 标题内禁用的句读标点（chapterTitleForbidden）。正文里以「第一章」开头的
        // 句子通常带标点。
        chapterPattern: '^第([一二三四五六七八九十百]+)章[\\s　]*(\\S.*)$',
        numberedPattern: '^(\\d{1,2}(?:\\.\\d{1,2})*)[\\s　]+(\\S.*)$',
        maxTitleLength: 46,
        maxChapterTitleLength: 20,
        chapterTitleForbidden: '，。；、,.;:！？',
        // 不含顿号：`推单、拉单与回写` 是正常的小节名，而逗号句号出现在标题里就是句子。
        // 也不含半角句点：`MDF.node 服务`、`MDF.js 框架` 这类名字必然带点，禁掉它等于让
        // 整类标题消失——实测一份 MDF 红皮书的第一章因此少了两个小节（1.7、1.8）。
        // 末尾的句点仍由 rejectTitle 里「以句读结尾」那条拦着，去掉它不会放进句子。
        sectionTitleForbidden: '，。；！？,;!?',
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
    // 三种写法都要认：`（p23）`（正文里的小节标注）、`第 23 页`，以及 `p23` / `p23–p31`
    // 这种**不带括号**的形式——来源行常写成「PDF 物理页 p23–p31」，不认它的话，一页
    // 把每节都标了页码却照样算「没标」：实测 4 页、151 个小节只有 67 处被计入，溯源密度
    // 44.4% 卡在阈值之下；作者把来源行从 22 条加到 132 条，这个数一动不动，于是误判成
    // 「该指标不随内容联动」。**是格式没被认出，不是指标坏了。**
    pageMarkPattern: '[（(]\\s*p\\.?\\s*\\d+\\s*[）)]|第\\s*\\d+\\s*页|\\bp\\.?\\s*\\d+',
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
};
/** 配置文件的位置。 */
export function digestConfigPath() {
    return join(homedir(), '.dsh', 'yon-panel', 'digest_config.json');
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
function mergeConfig(base, patch) {
    const num = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const thresholds = patch.thresholds ?? {};
    const volume = patch.volume ?? {};
    const sections = patch.sections ?? {};
    const terms = patch.terms ?? {};
    const identifiers = patch.identifiers ?? {};
    const list = (value, fallback) => Array.isArray(value) && value.every(item => typeof item === 'string') ? value : fallback;
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
            maxChapterTitleLength: num(sections.maxChapterTitleLength, base.sections.maxChapterTitleLength),
            chapterTitleForbidden: typeof sections.chapterTitleForbidden === 'string'
                ? sections.chapterTitleForbidden
                : base.sections.chapterTitleForbidden,
            sectionTitleForbidden: typeof sections.sectionTitleForbidden === 'string'
                ? sections.sectionTitleForbidden
                : base.sections.sectionTitleForbidden,
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
    };
}
/**
 * 读配置；没有文件、或文件坏了，都用默认值。
 *
 * 坏文件**不抛错**：验收是只读操作，一份写坏的配置不该让整个检查跑不起来，
 * 只该让人知道「这次用的是默认值」。
 *
 * @returns 配置，以及它从哪来。
 */
export async function loadDigestConfig() {
    const file = digestConfigPath();
    const raw = await readFile(file, 'utf8').catch(() => undefined);
    if (raw === undefined) {
        return { config: DEFAULT_DIGEST_CONFIG, path: file, exists: false };
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {
                config: DEFAULT_DIGEST_CONFIG, path: file, exists: true,
                problem: '配置文件不是一个 JSON 对象，本次用默认值',
            };
        }
        return { config: mergeConfig(DEFAULT_DIGEST_CONFIG, parsed), path: file, exists: true };
    }
    catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return { config: DEFAULT_DIGEST_CONFIG, path: file, exists: true, problem: `配置解析失败（${message}），本次用默认值` };
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
export async function saveDigestConfig(config) {
    const file = digestConfigPath();
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(temp, file);
}
/**
 * 把配置里的模式字符串编译成正则。
 * @param config - 配置。
 * @returns 全部模式。
 * @throws 当某个模式不是合法正则时——这必须让人知道，静默退回默认模式会让人
 *   以为自己改的配置生效了。
 */
export function compilePatterns(config) {
    const build = (source, flags) => {
        try {
            return new RegExp(source, flags);
        }
        catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            throw new Error(`配置里的正则不合法「${source}」：${message}`);
        }
    };
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
    };
}
