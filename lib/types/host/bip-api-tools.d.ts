/**
 * 旗舰版 API 文档，暴露给模型的两个工具。
 *
 * ## 为什么这两个工具不叫 `bip_meta_*`
 *
 * `bip_meta_find` / `bip_meta_detail` 读的是**随包发布的元数据快照**，离线可答，覆盖
 * 一部分实体；这一对读的是**某个环境当前发布的开放 API**，必须连上那个环境的登录态，
 * 但问的都是真实值。两件事的数据源、时效性和失败方式都不一样，所以分成 `bip_api_*`：
 * 名字里带 `api` 的那个，就要有页面。
 *
 * ## 页面从哪来
 *
 * 接口只认浏览器的登录态（裸 curl 会被拦），所以每次调用都要落到**一个已经登录的
 * 页签**上。调用方可以指名，但多数时候不必：不给就自己挑一个 http 页面，优先挑 URL 里
 * 带 `iuap-ipaas` 的那个。挑不到就直说，而不是拿一个空白页去撞。
 *
 * ## 一次查找的顺序：先问名字，再按图收网，最后翻目录
 *
 * 1. **名字搜索**——`POST search {"param": …}`，控制台自己那个搜索框背后的接口：一次请求，
 *    匹配接口名与分类路径。它与环境目录无关，所以不会被「目录只覆盖了一部分」这种事骗到。
 * 2. **路标**——这个说法上次落在哪个分类。一条路，直接查。
 * 3. **定位图**——这个环境有哪些云 / 服务 / 分类，以及**每个分类下有哪些接口名**。省掉枚举
 *    那一层，换个说法也不用重付。
 * 4. **翻目录**——都没有才走：一次请求拿回整棵树（实测 11 云 / 38 服务 / 141 分类 / 594
 *    子分类 = 784 个节点），再对候选分类逐个查清单。走完会把图记下来。
 *
 * 为什么搜索要排在第一步：目录曾经只覆盖 14 个产品（`listProductByIntegrateSys` 的返回），
 * 漏掉的是整个财务云、供应链云…；于是问一个真实存在的接口（「根据单据条形码查询件」，挂在
 * 财务云 / 档案服务 / 档案利用 下）得到的是「这个环境没有这个 API」——一个说得笃定的错答案。
 * `listIntegrateSys` 那棵树才是完整的，而搜索根本不依赖目录。
 *
 * 图上为什么要有接口名：分类名太粗。实测那个租户的分类名是模块级的（销售服务、客户管理、
 * B2C订单中心…），一个叫「销售订单」的分类都没有，于是「销售订单保存」这种**单据/接口名**
 * 按分类名收不到网，清单那一层（51 个分类 = 51 次请求）就得全量扫。接口名一挂上去，同一句
 * 话就能收到一两个分类（实测 330 个接口名 ≈13 KB，随分类一起存）。它只用来**缩小范围**：
 * 命中与否仍由这一次现取的清单说了算，所以图上多一条少一条接口名，最坏是多扫一轮，不会变成
 * 一句「没有」。
 *
 * 后三步都只是假设，落空时整份作废并重扫全量：路标回答 0 条、或者图里找不到那个分类，都不
 * 允许变成一句「没有」。地址、字段、必填项从来不进这两份文档——它们永远现取，所以过期的
 * 定位最多让人多扫一轮，不会给出一个看着笃定的错地址。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type BipApiRouteStore } from './bip-api.ts';
import { type BipApiIndexStore } from './bip-api-index.ts';
import type { YonBrowserCdpService } from './browser-cdp-service.ts';
/** Every tool this module owns, in the order they are registered. */
export declare const BIP_API_TOOL_NAMES: readonly ["bip_api_find", "bip_api_detail"];
/**
 * Register the API-document tools.
 * @param ctx - host context carrying the tool registry.
 * @param cdp - the browser surface the reads go through.
 * @param routes - where the "which classify answers which phrase" routes are kept.
 * @param index - where the "which products and classifies this environment has" 定位图 is kept.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonBipApiTools(ctx: Context, cdp: YonBrowserCdpService, routes?: BipApiRouteStore, index?: BipApiIndexStore): () => void;
