/**
 * 一个附件最大多少字节。
 *
 * 使用者给的原件不是构建产物：超出一个数就该走「登记一条引用」，而不是把它拷进库里。
 * 这个数同时管着 HTTP 那一层（先按 `content-length` 挡一道，省得多传 40 MB 才被拒）。
 */
export declare const MAX_ATTACHMENT_BYTES: number;
/** 一次读最多从磁盘取多少字节。与 `home-files.ts` 的 `MAX_READ_BYTES` 同值同理由。 */
export declare const MAX_FILE_READ_BYTES = 1000000;
/** 一次读最多回多少字符。一个 1 MB 的 csv 也远超模型该看到的量。 */
export declare const MAX_FILE_READ_CHARS = 60000;
/**
 * 一个字节数，说成人话：`812 字节` / `12.3 KB` / `2.1 MB`。
 *
 * 放在这里、三个调用方共用（服务的拒绝理由、HTTP 的上传上限、工具的报告），因为一句
 * 「最多 50.0 MB」在一处改了另一处没改，就是在对着使用者说两个数。
 * @param bytes - the size.
 * @returns the size in the unit a person would say it in.
 */
export declare function sizeOf(bytes: number): string;
/** 小写扩展名，不含点；没有扩展名时是空串。 */
export declare function extensionOf(name: string): string;
/**
 * 一个文件**预期**能不能读成文本。
 *
 * 这是一句预测，读取那一刻还会再判一次（见模块头注释）。默认「能读」而不是「不能读」：
 * `.java` / `.patch` / `.sql` / `.yaml` 这些没有出现在任何名单里的扩展名，恰恰是这一族
 * 最常见的附件，把它们挡在外面等于把功能挡掉一半。
 * @param name - the file name.
 * @returns whether the extension looks like text, and why not when it does not.
 */
export declare function classifyFile(name: string): {
    readonly readable: boolean;
    readonly note?: string;
};
/** 一次读取的结果。 */
export interface AttachmentText {
    /** 读出来的文本；读不了时是空串。 */
    readonly text: string;
    /** 实际用的解码；读不了时是空串。 */
    readonly encoding: string;
    /** 被字符上限截断了。 */
    readonly truncated: boolean;
    /** 读不了或截断时的一句话。 */
    readonly note?: string;
}
/**
 * 把一段字节读成文本。
 *
 * @param bytes - 文件的开头一段（`MAX_FILE_READ_BYTES` 以内），不是整个文件。
 * @param limit - 最多回多少字符。
 * @returns 文本、用的解码、是否截断，以及拦下来或截断的原因。
 */
export declare function attachmentText(bytes: Buffer, limit?: number): AttachmentText;
/**
 * 撞名时下一个能用的名字：`方案.md` → `方案-2.md` → `方案-3.md`。
 *
 * 后缀加在**扩展名之前**，因为 `.patch` / `.xlsx` 这些后缀是给人看的：`方案.md-2` 打不开，
 * `方案-2.md` 才双击得动。这一条与 §十二「保留原文件名，撞名时加 -2」是同一件事的落地。
 * @param name - the requested name.
 * @param taken - names already in the folder.
 * @returns the first free name, or undefined when 99 are not enough.
 */
export declare function freeName(name: string, taken: readonly string[]): string | undefined;
