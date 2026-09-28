import { buildClassIndex, classIndexPath, listClassIndexes, readClassIndex, searchClassIndex, writeClassIndex, } from "./class-index.js";
/** Every tool this module owns. */
export const CLASS_TOOL_NAMES = ['knowledge_build_index', 'ncc_class_search'];
/** How many hits one search returns when the caller does not say. */
const DEFAULT_LIMIT = 25;
/** The largest limit a caller may ask for. */
const MAX_LIMIT = 200;
/** What a call can fail with. */
export class ClassIndexError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ClassIndexError';
    }
}
/** Read one required argument as a non-empty string. */
function asString(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ClassIndexError('invalid-input', `${argument} 必须是非空字符串`);
    }
    return value.trim();
}
/** One tool definition over the registry's contract. */
function defineTool(spec) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => [{ type: 'text', text: spec.render(value) }],
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new ClassIndexError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new ClassIndexError('invalid-input', `${spec.name} 已被取消`);
            return await spec.execute(args, exec.signal);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** The JSON Schema of a build's answer. */
const BUILD_VALUE = {
    type: 'object',
    required: ['version', 'totalJars', 'totalClasses', 'path'],
    properties: {
        version: { type: 'string' },
        home: { type: 'string' },
        totalJars: { type: 'number' },
        totalClasses: { type: 'number' },
        path: { type: 'string' },
    },
};
/** The JSON Schema of a search's answer. */
const SEARCH_VALUE = {
    type: 'object',
    required: ['term', 'version', 'hits', 'totalClasses', 'indexed'],
    properties: {
        term: { type: 'string' },
        version: { type: 'string' },
        hits: { type: 'array', items: { type: 'object' } },
        totalClasses: { type: 'number' },
        indexed: { type: 'array', items: { type: 'object' } },
    },
};
/** A byte count the model can read. */
function mb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/**
 * Register the class index tools.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonClassTools(ctx) {
    const disposers = [];
    /**
     * Indexes already read, keyed by version.
     *
     * An index is tens of megabytes of JSON; re-parsing one per search would
     * dominate the call. Cleared when a build replaces one.
     */
    const loaded = new Map();
    disposers.push(ctx.tools.register(defineTool({
        name: 'knowledge_build_index',
        description: 'Build a class index for one YonBIP or NCC installation: walk its home directory, '
            + 'read the class names out of every .jar, and store a lookup table mapping each class to the '
            + 'jar that holds it. Only the class names are read — nothing is decompressed — so a run takes '
            + 'minutes rather than hours, but it does walk the whole installation, so ask for it deliberately '
            + 'rather than as a guess. The index lands under the plugin\'s own data directory, never inside '
            + 'the installation. Build one per version; ncc_class_search then uses it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['home', 'version'],
            properties: {
                home: {
                    type: 'string',
                    description: 'The installation\'s home directory to scan, for example E:/NCProject/NCC2111/home.',
                },
                version: {
                    type: 'string',
                    description: 'A label to store the index under, matching the installation, for example "2111" or "BIP_V5".',
                },
            },
        },
        outputSchema: BUILD_VALUE,
        async execute(args, signal) {
            const home = asString(args.home, 'home');
            const version = asString(args.version, 'version');
            const built = await buildClassIndex(home, version, (progress) => {
                // Long runs need a heartbeat, or an operator watching sees nothing and
                // assumes the call has hung.
                console.error(`[yon-panel] 建索引 ${version}：已扫描 ${progress.jars} 个 jar，${progress.classes} 个类`);
            });
            if (signal.aborted)
                throw new ClassIndexError('failed', '建索引已被取消');
            if (built.totalJars === 0) {
                throw new ClassIndexError('not-found', `${home} 下没有找到任何 .jar —— 确认这是 NCC/BIP 的 home 目录（不是项目目录或 jar 存放目录）。`);
            }
            const written = await writeClassIndex(built);
            loaded.set(version, built);
            return {
                version,
                home,
                totalJars: built.totalJars,
                totalClasses: built.totalClasses,
                path: written,
            };
        },
        render(value) {
            const built = value;
            return [
                `索引 ${built.version} 建好了：${built.totalJars} 个 jar，${built.totalClasses} 个类。`,
                `存放于 ${built.path}`,
                '',
                '接下来用 ncc_class_search 传 version:' + built.version + ' 查类。',
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `建类索引：${String(args.version ?? '')}（${String(args.home ?? '')}）—— 会扫描整个安装目录`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'ncc_class_search',
        description: 'Find which jar holds a class, using an index built by knowledge_build_index. Pass a '
            + 'class name copied out of a stack trace, a simple name, or a fragment: an exact match ranks '
            + 'first, then a match on the simple name, then anything containing the term. Use it when you '
            + 'need to read a platform implementation and the reference documents do not cover it — the '
            + 'answer is the jar to look in. When no index exists for a version, the answer lists the '
            + 'versions that are indexed rather than building one.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['term'],
            properties: {
                term: {
                    type: 'string',
                    description: 'A fully-qualified class name, a simple class name, or a fragment of either.',
                },
                version: {
                    type: 'string',
                    description: 'Which index to search, for example "2111". The most recently built one when omitted.',
                },
                limit: {
                    type: 'number',
                    description: `How many hits to return at most; defaults to ${DEFAULT_LIMIT}, capped at ${MAX_LIMIT}.`,
                },
            },
        },
        outputSchema: SEARCH_VALUE,
        async execute(args) {
            const term = asString(args.term, 'term');
            const requested = typeof args.version === 'string' && args.version !== '' ? args.version : undefined;
            const rawLimit = typeof args.limit === 'number' ? Math.floor(args.limit) : DEFAULT_LIMIT;
            const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
            const stored = await listClassIndexes();
            if (stored.length === 0) {
                throw new ClassIndexError('not-found', '还没有任何类索引。先用 knowledge_build_index 传 home 和 version 建一个。');
            }
            const chosen = requested === undefined
                ? stored[0]
                : stored.find(entry => entry.version === requested);
            if (chosen === undefined) {
                throw new ClassIndexError('not-found', `没有 version 为「${requested}」的索引。现有：${stored.map(e => e.version).join(', ')}`);
            }
            let index = loaded.get(chosen.version);
            if (index === undefined) {
                index = await readClassIndex(chosen.version);
                if (index === undefined) {
                    throw new ClassIndexError('failed', `索引文件读不出来：${classIndexPath(chosen.version)}`);
                }
                loaded.set(chosen.version, index);
            }
            const hits = searchClassIndex(index, term, limit);
            return {
                term,
                version: chosen.version,
                hits: hits,
                totalClasses: index.totalClasses,
                indexed: stored,
            };
        },
        render(value) {
            const result = value;
            if (result.hits.length === 0) {
                return [
                    `索引 ${result.version}（${result.totalClasses} 个类）里没有匹配「${result.term}」的类。`,
                    '',
                    '可以试试：换用更短的类名片段；确认查的是对这个版本建的索引'
                        + `（现有：${result.indexed.map(e => e.version).join(', ')}）。`,
                ].join('\n');
            }
            const lines = [
                `「${result.term}」在索引 ${result.version}（${result.totalClasses} 个类）里命中 ${result.hits.length} 个：`,
                '',
            ];
            for (const hit of result.hits) {
                lines.push(`  ${hit.className}`);
                lines.push(`      ${hit.jar}`);
            }
            lines.push('', '拿到 jar 之后可以用 cfr 反编译看实现（cfr-0.152.jar 随本包放在 resources/knowledge/ncc/）。');
            return lines.join('\n');
        },
        presentCall(args) {
            return { card: 'generic', title: `查类：${String(args.term ?? '')}`, kind: 'read' };
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
/** The indexes currently stored, for a surface that reports on them. */
export { listClassIndexes, mb };
