import { type CreateRequirementInput, type RequirementCreated, type RequirementDir, type RequirementFile, type RequirementFileImport, type RequirementFileList, type RequirementFileRead, type RequirementListPayload, type RequirementStatus, type RequirementView, type UpdateRequirementInput } from '../../shared/types.ts';
import type { YonPanelKey } from '../locales.ts';
export { ApiError as RequirementApiError } from '../request.ts';
/** 一次读取要哪些行；两个成员都省掉就是整本台账。 */
export interface RequirementQuery {
    /** 只看某个项目的条目。空串与省略同义（「全部项目」）。 */
    readonly projectId?: string;
    /** 只看某个状态；`all` 与省略同义。 */
    readonly status?: RequirementStatus | 'all';
}
/** 这屏要用的调用。 */
export interface RequirementApi {
    list(query?: RequirementQuery): Promise<RequirementListPayload>;
    /**
     * 读一条。
     *
     * @param id - 条目的 id。这屏手里只有台账行，按 id 取，不用名称那条跨项目查找。
     * @param options.history - 要给人看的那一份：`raw` 与 `notes`（追溯按段显示要用）。
     */
    read(id: string, options?: {
        readonly history?: boolean;
    }): Promise<RequirementView>;
    /** 人的入口。**不去重**——同一个人把同一句话打两遍，理由是他的。 */
    create(input: CreateRequirementInput): Promise<RequirementCreated>;
    /** 追加一段标注；日期由宿主盖。 */
    annotate(id: string, text: string): Promise<RequirementView>;
    /** 改名称或状态。 */
    update(id: string, patch: UpdateRequirementInput): Promise<RequirementView>;
    /** 置为已废弃。`reason` 可省——不给原因也是一个完整的请求。 */
    archive(id: string, reason?: string): Promise<RequirementView>;
    /** 真删：条目连同它的目录一起没。只有这一屏走得到（模型没有这个工具）。 */
    remove(id: string): Promise<{
        readonly id: string;
        readonly name: string;
        readonly path: string;
    }>;
    /**
     * 三个目录连同里面的文件，一次取全。
     *
     * 一次给全是因为这一屏就是按目录画三块：分三次请求就是三次 `readdir` 的等待，而切一下
     * 文件夹不该有一次网络往返。传 `dir` 只取一个目录是省字节，不是省往返。
     */
    fileList(id: string, dir?: RequirementDir): Promise<RequirementFileList>;
    /**
     * 读一个附件。
     *
     * **读不了不是错误**：docx、PDF、二进制回的是一段空文本加一句原因，而不是抛出来——
     * 那三种情况这一屏都要画，把它们做成三种错误就要在上面写三支特判。只有「没有这条
     * 条目」和「没有这个文件」才是错的。
     */
    fileRead(id: string, dir: RequirementDir, name: string, version?: number): Promise<RequirementFileRead>;
    /**
     * 归档一件使用者原件。
     *
     * 面板走的是这一条；模型侧另有 `requirement_file_import`，它只把使用者指出的、
     * 本机已存在的文件复制进来，写不了内容本身——所以「这是他给的」仍然成立。两条路
     * 都不覆盖同名：回里的 `renamedFrom` 会说清它被改成了什么名字。
     */
    importFile(id: string, dir: RequirementDir, file: File): Promise<RequirementFileImport>;
    /** 删一个附件。与条目本身一样，是「只有这一屏走得到」的写。 */
    removeFile(id: string, dir: RequirementDir, name: string): Promise<{
        readonly id: string;
        readonly entry: string;
        readonly file: RequirementFile;
    }>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createRequirementApi(): RequirementApi;
/**
 * 每个状态在词典里的键。
 *
 * 与迭代表板同一手法：存键不存中文，类型写成 `YonPanelKey` 而不是 `string`，漏一个
 * 状态编译就不过。六个状态的中文名在 `requirement-doc.ts` 的 `REQUIREMENT_STATUS_TEXT`
 * 里已经有一份，但那一份是**宿主写给文件与工具报告**的（挂在同一个 i18n 之外的散文里），
 * 这一份是给界面用的——两边各自完整，没有谁从谁那里派生。
 */
export declare const STATUS_LABEL_KEYS: Readonly<Record<RequirementStatus, YonPanelKey>>;
/**
 * 三个目录各自「装的是什么」在词典里的说法。
 *
 * 键存的是**意思**，屏幕上画的是目录名本身（`user/`）——目录名是磁盘上的事实，两种语言
 * 下都长这样，翻译它反而让人对不上自己去看的那个文件夹。所以这六个键用在
 * `title` / `aria-label` 上：悬停与读屏要的是「这一格是什么」，肉眼要的是「它叫什么」。
 */
export declare const DIR_LABEL_KEYS: Readonly<Record<RequirementDir, YonPanelKey>>;
/** 过滤器要的取值表，按 `REQUIREMENT_STATUSES` 的顺序，前面加「全部」。 */
export declare const STATUS_FILTERS: readonly (RequirementStatus | 'all')[];
/** 六个状态，按面板上该显示的顺序。新建表单与状态选择器都用它。 */
export declare const STATUSES: readonly RequirementStatus[];
