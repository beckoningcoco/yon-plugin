import type { Taxonomy } from './bip-api-index.ts';
/** 这一族工具的错误码。 */
export type BipApiErrorCode = 'invalid-input' | 'not-found' | 'no-page' | 'unusable' | 'protocol';
/** 这一族工具的错误类型。 */
export declare class BipApiError extends Error {
    /** What went wrong, in the vocabulary the tools speak. */
    readonly code: BipApiErrorCode;
    constructor(code: BipApiErrorCode, message: string);
}
/** 一个已经定位过的分类：路标存的就是它。 */
export interface RouteHint {
    readonly classifyId: string;
    readonly classifyName: string;
    readonly productId?: string;
    readonly productName?: string;
    /**
     * 查这个分类的接口清单用哪套形状：树节点给 `domainAppCode`（节点的 code）与 `treeNodeType`，
     * 早先那套只给 `classifyId`，走 `apiClassifyId` 的老形状。两条都留着：旧路标记的是后者。
     */
    readonly domainAppCode?: string;
    readonly treeNodeType?: number;
}
/** 一次查找的入参。JSON 序列化后内联进页面表达式。 */
export interface FindRequest {
    readonly keyword: string;
    /**
     * 集成系统 id。不给就去问一次 `listIntegrateSys`；宿主从定位图里带上来时，这一次也省掉。
     * 带错了不会变成错的答案：分类查询会空手而归，宿主据此作废重扫，那一趟会重新问到它。
     */
    readonly integrateSys?: string;
    /** 产品名片段或产品 id；缩小到这一个服务（树的 type 2 那一层）。这是在按目录浏览。 */
    readonly product?: string;
    /** 已知分类 id：直接只查它，这是最快的一条路。 */
    readonly classifyId?: string;
    /**
     * 跳过按名字那一发搜索（也跳过按名字收网），把目录里的分类从头扫过去。
     * 只有「接口名与路径里都不含关键词、只有描述里有」这种问法才用得上。
     */
    readonly deep?: boolean;
    readonly limit?: number;
    readonly classifyLimit?: number;
    /** 上一轮记下的路标；命中则只查它。 */
    readonly routes?: readonly RouteHint[];
    /**
     * 上一次全量扫描留下的「产品 → 分类」定位图：给了就跳过那 30 次预拉（见 `bip-api-index.ts`）。
     * 它只提供分类的身份，接口内容仍然是现取的。
     */
    readonly taxonomy?: Taxonomy;
}
/** 一次详情查询的入参。 */
export interface DetailRequest {
    readonly apiId: string;
    /** 只看某个参数节点（如 `data`、`orderDetails`）的字段清单。 */
    readonly section?: string;
    /** true 时连非必填参数一起返回。 */
    readonly full?: boolean;
    readonly demoChars?: number;
}
/**
 * 一次 `Runtime.evaluate` 要执行的表达式（查找）。
 * @param request - 查找的入参。
 * @returns 自包含的 async 表达式，其值为一段 JSON 文本。
 */
export declare function findExpression(request: FindRequest): string;
/**
 * 一次 `Runtime.evaluate` 要执行的表达式（详情）。
 * @param request - 详情的入参。
 * @returns 自包含的 async 表达式，其值为一段 JSON 文本。
 */
export declare function detailExpression(request: DetailRequest): string;
/** 页面回答里的一条命中。 */
export interface ApiHit {
    readonly apiId: string;
    readonly apiName: string;
    readonly describe: string;
    readonly category: string;
    readonly productName: string;
    readonly classifyId: string;
    readonly classifyName: string;
}
/** 页面回答里的一次查找结果。 */
export interface FindAnswer {
    readonly ok: true;
    readonly origin: string;
    readonly system: string;
    readonly keyword: string;
    readonly scanned: {
        readonly products: number;
        readonly classifies: number;
        readonly groups: number;
        readonly truncated: boolean;
        readonly viaRoute: boolean;
        /** True when the scan was narrowed from the stored 定位图 instead of re-listing products and classifies. */
        readonly viaIndex: boolean;
        /**
         * True when the narrowing came from the stored *interface names* rather than from classify names:
         * the tenant's classify names are module names (销售服务, 客户管理…), so the name of the document
         * being asked about is usually found on the API, not on the category. It matters to the reader
         * because one or two categories scanned looks exactly like a truncated scan.
         */
        readonly viaApi: boolean;
        /**
         * True when the name search answered (one request to the console's own search endpoint) and the
         * scan never had to walk the catalogue at all. It is the cheapest and the most trustworthy of the
         * four: the search endpoint matches names and paths, and it does not depend on how much of the
         * console's tree the enumerating API happens to return — the gap that once produced a confident
         * "this environment has no such API".
         */
        readonly viaSearch: boolean;
        /**
         * True when the name search was actually asked (whether or not it answered). A miss from a scan
         * that never asked it is a different thing from a miss after both nets came back empty, and the
         * answer says which one it was.
         */
        readonly searched?: boolean;
        /** True when the scan hit its time budget and stopped early. */
        readonly deadline: boolean;
    };
    readonly total: number;
    readonly hits: readonly ApiHit[];
    readonly routes: readonly RouteHint[];
    /**
     * The 定位图 this scan produced — present only when it had to list products and classifies itself.
     * The caller stores it so the next, differently-worded question does not pay that layer again.
     */
    readonly taxonomy?: Taxonomy;
    /** True when the outer budget ran out before the scan finished. */
    readonly timedOut?: boolean;
}
/** 路标里的一条。 */
export interface ApiRoute {
    readonly origin: string;
    readonly keyword: string;
    readonly routes: readonly RouteHint[];
    readonly at: string;
}
/** 一次路标读取。 */
export interface RouteStoreRead {
    readonly path: string;
    readonly routes: readonly ApiRoute[];
    readonly exists: boolean;
    readonly error?: string;
}
/** 路标的读写，按关键词取用。 */
export interface BipApiRouteStore {
    readonly path: string;
    read(): Promise<RouteStoreRead>;
    /** 这个环境 + 这个关键词记过的路标，没有就是空。 */
    hints(origin: string, keyword: string): Promise<readonly RouteHint[]>;
    /** 记下（或覆盖）一条路标。 */
    remember(origin: string, keyword: string, routes: readonly RouteHint[]): Promise<void>;
    /** 作废一条路标；上一轮记错了、或者它已经不成立了。 */
    forget(origin: string, keyword: string): Promise<void>;
}
/** 路标文件的位置：与这一族其它文档同处 `~/.dsh/yon-panel/`。 */
export declare function defaultBipApiRoutePath(): string;
/**
 * 打开路标文档。
 * @param path - 文档位置；默认是操作者自己那份。
 * @returns 按它读写的存储。
 */
export declare function createBipApiRouteStore(path?: string): BipApiRouteStore;
/** 一条命中在模型面前写成一行。 */
export declare function renderHit(hit: ApiHit): string;
