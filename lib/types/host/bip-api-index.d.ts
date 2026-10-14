/** 一个产品，只留身份与显示名。 */
export interface TaxonomyProduct {
    readonly id: string;
    readonly name: string;
    readonly code?: string;
}
/** 一个分类：它是谁、属于哪个产品，以及它下面有哪些接口名。 */
export interface TaxonomyClassify {
    readonly id: string;
    readonly name: string;
    readonly productId: string;
    readonly productName: string;
    /**
     * 这个分类下的**接口名**——只有名字，没有 id、没有地址、没有字段。
     *
     * 它换来的东西是实测出来的：租户的分类名常常是模块级的（销售服务、客户管理…），
     * 按分类名收不到「销售订单保存」这种单据名，那就得把 51 个分类的清单全拉一遍。有了这些
     * 名字，下一次按接口名提问就能直接收到一两个分类。
     *
     * 名字会变（改名、新增、下架），但过期只会**收错或收不到**：那一趟落空，宿主整份作废并
     * 重扫全量。所以它最多让人多扫一轮，不会漏掉一条真实存在的接口。
     */
    readonly apis?: readonly string[];
    /**
     * 查这个分类的接口清单用哪套形状：树节点的 **code**（`domainAppCode`）与它的 `type`
     * （`treeNodeType`）。实测同一个分类，用 `apiClassifyId=EAF_DALY` 查回空数组，用
     * `domainAppCode=EAF_DALY&treeNodeType=3` 才拿到那一条接口——所以这两个键必须随图存下来，
     * 否则从图上收的网一条也查不动。老图没有它们，页面会退回 `apiClassifyId` 那条形状。
     */
    readonly domainAppCode?: string;
    readonly treeNodeType?: number;
    /** 控制台左树里那条路（财务云 / 档案服务 / 档案利用）：收网与显示都用它。 */
    readonly path?: string;
}
/**
 * 一个环境的定位图：云 / 服务 / 分类，以及每个分类下的接口名。
 *
 * 按 origin + 集成系统存：同一个地址下的两个集成系统是两套分类，混用会查出别人的东西。
 */
export interface TaxonomySnapshot {
    readonly origin: string;
    readonly systemId: string;
    /** 建图时刻（ISO）。有效期从它算起。 */
    readonly at: string;
    /**
     * 图里存的是哪一版的形状；写入时由存储盖，调用方不必给。
     *
     * 读的时候对不上 {@link BIP_API_TAXONOMY_SHAPE} 就当这份图不存在。这不是洁癖：实测一份
     * 「产品 → 分类」形状的旧图（没有 `domainAppCode`）会让「按服务浏览」答出一个空的
     * 「图上分类 0」——一张查不动的图比没有图更坏，而重建它的代价只是一轮请求。
     */
    readonly shape?: number;
    readonly products: readonly TaxonomyProduct[];
    readonly classifies: readonly TaxonomyClassify[];
}
/**
 * 当前图的形状版本。
 *
 * 2 = 树上的云 / 服务 / 分类，分类带 `domainAppCode` + `treeNodeType`（外加 `path` 与接口名）。
 * 1 = 早先那版「产品 → 分类」，没有查询形状——它落在盘上时一律当没有。
 */
export declare const BIP_API_TAXONOMY_SHAPE = 2;
/** 交给页面脚本的那一份：origin、系统与时刻由宿主管，不进页面。 */
export interface Taxonomy {
    readonly products: readonly TaxonomyProduct[];
    readonly classifies: readonly TaxonomyClassify[];
}
/** 一次定位图读取，整份文档的样子。 */
export interface IndexStoreRead {
    readonly path: string;
    readonly snapshots: readonly TaxonomySnapshot[];
    readonly exists: boolean;
    readonly error?: string;
}
/** 取到一张图时，连同它有多旧。 */
export interface TaxonomyLookup {
    readonly snapshot: TaxonomySnapshot;
    readonly stale: boolean;
    readonly ageMs: number;
}
/** 定位图的读写，按环境取用。 */
export interface BipApiIndexStore {
    readonly path: string;
    read(): Promise<IndexStoreRead>;
    /** 这个环境的图，没有（或读不出来）就是 undefined。 */
    get(origin: string, systemId?: string): Promise<TaxonomyLookup | undefined>;
    /**
     * 记下（或覆盖）一个环境的图；整份没有分类时什么都不写，返回 false。分类以这一份为准，
     * 但**上一次记下的接口名会留下**（见 {@link keepKnownNames}）：一次扫描看不到全部分类。
     */
    put(snapshot: TaxonomySnapshot): Promise<boolean>;
    /** 作废一个环境的图：它已经不成立了，或者它落空过。 */
    forget(origin: string, systemId?: string): Promise<void>;
}
/** 一张图的有效期：超过它就宁可按全量重扫一遍。 */
export declare const BIP_API_INDEX_TTL_MS: number;
/**
 * 一张图的「新鲜窗口」：这么新的图**不因为一次落空就作废重扫**。
 *
 * 落空最常见的原因是关键词本来就不存在，而不是图错了；那种情况下重扫只是把同一批请求
 * （图上每个分类问一遍清单）原样再发一次，答案不可能变。窗口内唯一会漏的是「图建好之后
 * 新加的分类里的接口」——新加进**已有分类**的接口不受影响，名字对不上时本来就会把图上
 * 所有分类都查一遍，现场清单里有它。等价的说法：环境新增一个分类，最多被延后这么久才被
 * 看见；急着要就删掉图文件再问（工具输出里给出了它的路径）。
 */
export declare const BIP_API_INDEX_FRESH_MS: number;
/** 定位图文件的位置：与这一族其它文档同处 `~/.dsh/yon-panel/`。 */
export declare function defaultBipApiIndexPath(): string;
/**
 * 打开定位图文档。
 * @param path - 文档位置；默认是操作者自己那份。
 * @param ttlMs - 一张图的有效期；默认 {@link BIP_API_INDEX_TTL_MS}。测试用它把过期做成确定的事。
 * @returns 按它读写的存储。
 */
export declare function createBipApiIndexStore(path?: string, ttlMs?: number): BipApiIndexStore;
