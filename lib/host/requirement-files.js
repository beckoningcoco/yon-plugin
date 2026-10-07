/**
 * 附件这一层的判断：哪些扩展名预期是文本，一段字节到底能不能读成文本，一次最多读多少。
 *
 * 这一层**不碰文件系统**，跟 `requirement-doc.ts` 一样：进来的是一段字节，出去的是一段
 * 文本或一句拒绝。目录遍历、`stat`、写盘都在 store 里。分开是为了让「什么算可读」这条
 * 规则能被单独钉死，不必为此造文件。
 *
 * ## 两层判断，不是一个白名单
 *
 * 扩展名给的是**预测**（清单上这一行能不能点「读」），字节给的是**裁决**（读的那一刻）。
 * 只看扩展名不行：一个 `.txt` 里装的是 zip 也是有的；只看字节也不行：一份 3 MB 的 xlsx
 * 头 64 个字节刚好没有 NUL，判成文本就会吐一屏乱码。所以两道都要，且**谁拦下来就说谁
 * 拦的**——`classifyFile` 的 note 与 `attachmentText` 的 note 是两句话，不是一句。
 *
 * ## 编码交给 home-files
 *
 * `decodeText` 是这一仓已经磨过一轮的东西（BOM、XML 声明、严格 UTF-8 试探、最后退到
 * gb18030），与 `ncc_home_read` 读 NCC 源码用的是同一份。使用者的资料大多是 Windows 上
 * 的中文文档，GBK 是常态而不是例外，所以这一条绝不能各写一份。
 */
import { decodeText, isBinary } from "./home-files.js";
/**
 * 一个附件最大多少字节。
 *
 * 使用者给的原件不是构建产物：超出一个数就该走「登记一条引用」，而不是把它拷进库里。
 * 这个数同时管着 HTTP 那一层（先按 `content-length` 挡一道，省得多传 40 MB 才被拒）。
 */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** 一次读最多从磁盘取多少字节。与 `home-files.ts` 的 `MAX_READ_BYTES` 同值同理由。 */
export const MAX_FILE_READ_BYTES = 1_000_000;
/** 一次读最多回多少字符。一个 1 MB 的 csv 也远超模型该看到的量。 */
export const MAX_FILE_READ_CHARS = 60_000;
/**
 * 一个字节数，说成人话：`812 字节` / `12.3 KB` / `2.1 MB`。
 *
 * 放在这里、三个调用方共用（服务的拒绝理由、HTTP 的上传上限、工具的报告），因为一句
 * 「最多 50.0 MB」在一处改了另一处没改，就是在对着使用者说两个数。
 * @param bytes - the size.
 * @returns the size in the unit a person would say it in.
 */
export function sizeOf(bytes) {
    if (bytes < 1024)
        return `${bytes} 字节`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** Office 的 zip 家族：正文在压缩包里，要自解才读得到。 */
const OFFICE_ZIP = ['docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'pptm', 'odt', 'ods', 'odp'];
/** 老的 OLE 复合文档。**明确不做**（§十三），所以话要说得比别的拒绝更死。 */
const OLE_DOCUMENTS = ['doc', 'xls', 'ppt', 'msg'];
/** 图片。 */
const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'tif', 'tiff', 'heic', 'psd'];
/** 影音。 */
const MEDIA = ['mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm', 'flac', 'ogg', 'm4a', 'wmv'];
/** 压缩包、可执行文件、类文件、数据库文件——没有可读正文的那一类。 */
const OPAQUE = [
    'zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz', 'tar', 'jar', 'war', 'apk', 'ipa',
    'exe', 'dll', 'so', 'dylib', 'msi', 'bin', 'dat', 'class', 'o', 'a', 'lib', 'pdb', 'node',
    'db', 'sqlite', 'sqlite3', 'mdb', 'accdb',
    'ttf', 'otf', 'woff', 'woff2', 'eot',
];
/**
 * 扩展名 → 「为什么现在读不了」。
 *
 * 图标的是**这一批**读不了还是**永远**读不了：Office 压缩包与 PDF 是「还没做」（批 5），
 * OLE 是「明确不做」，其余是「它本来就不是文本」。三种话不能混成一句，否则使用者会等着
 * 一个永远不会到的批。
 */
const BINARY_EXTENSIONS = new Map([
    ...OFFICE_ZIP.map((ext) => [
        ext,
        `这是 Office 的压缩包格式（${ext}），正文要解开压缩包才拿得到，现在还读不了。`,
    ]),
    ['pdf', 'PDF 要借 python 把文本抽出来，现在还读不了。'],
    ...OLE_DOCUMENTS.map((ext) => [
        ext,
        `这是老的 OLE 复合文档格式（${ext}），不打算支持——另存为 docx / xlsx 再放进来。`,
    ]),
    ...IMAGES.map((ext) => [ext, `这是图片（${ext}），里面没有可读的文本。`]),
    ...MEDIA.map((ext) => [ext, `这是影音文件（${ext}），里面没有可读的文本。`]),
    ...OPAQUE.map((ext) => [ext, `这是二进制文件（${ext}），里面没有可读的文本。`]),
]);
/** 小写扩展名，不含点；没有扩展名时是空串。 */
export function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    // A leading dot is a hidden file, not an extension: `.gitignore` has no extension.
    if (dot <= 0 || dot === name.length - 1)
        return '';
    return name.slice(dot + 1).toLowerCase();
}
/**
 * 一个文件**预期**能不能读成文本。
 *
 * 这是一句预测，读取那一刻还会再判一次（见模块头注释）。默认「能读」而不是「不能读」：
 * `.java` / `.patch` / `.sql` / `.yaml` 这些没有出现在任何名单里的扩展名，恰恰是这一族
 * 最常见的附件，把它们挡在外面等于把功能挡掉一半。
 * @param name - the file name.
 * @returns whether the extension looks like text, and why not when it does not.
 */
export function classifyFile(name) {
    const note = BINARY_EXTENSIONS.get(extensionOf(name));
    return note === undefined ? { readable: true } : { readable: false, note };
}
/**
 * 把一段字节读成文本。
 *
 * @param bytes - 文件的开头一段（`MAX_FILE_READ_BYTES` 以内），不是整个文件。
 * @param limit - 最多回多少字符。
 * @returns 文本、用的解码、是否截断，以及拦下来或截断的原因。
 */
export function attachmentText(bytes, limit = MAX_FILE_READ_CHARS) {
    if (isBinary(bytes)) {
        return {
            text: '',
            encoding: '',
            truncated: false,
            note: '它读不出文本：开头 64 个字节里有 NUL 字节，这是个二进制文件，扩展名骗了人。',
        };
    }
    const decoded = decodeText(bytes);
    // 按行累加而不是按字符切，理由与 `home-files.ts` 那条一样：答案不该停在一行中间。
    const picked = [];
    let chars = 0;
    let cut = false;
    let midLine = false;
    for (const line of decoded.text.split('\n')) {
        if (chars + line.length + 1 > limit) {
            cut = true;
            if (picked.length === 0) {
                // 第一行本身就比整个额度长：压过一行的 bundle、一行 JSON、一条 SQL 导出。
                // 这里若什么都不给，就会对着一个「整份都是文本」的文件回一句「它没有文本」——
                // 那是所有答案里唯一没用的一个。按行切只是**优先**，不是不许破例。
                picked.push(line.slice(0, limit));
                midLine = true;
            }
            break;
        }
        picked.push(line);
        chars += line.length + 1;
    }
    return {
        text: picked.join('\n'),
        encoding: decoded.encoding,
        truncated: cut,
        ...!cut ? {} : {
            note: midLine
                ? `一次最多读 ${limit} 个字符，而这个文件第一行就比这长，所以这里只是它的开头 ${limit} 个字符。`
                : `一次最多读 ${limit} 个字符，上面只是文件的前 ${picked.length} 行。`,
        },
    };
}
/**
 * 撞名时下一个能用的名字：`方案.md` → `方案-2.md` → `方案-3.md`。
 *
 * 后缀加在**扩展名之前**，因为 `.patch` / `.xlsx` 这些后缀是给人看的：`方案.md-2` 打不开，
 * `方案-2.md` 才双击得动。这一条与 §十二「保留原文件名，撞名时加 -2」是同一件事的落地。
 * @param name - the requested name.
 * @param taken - names already in the folder.
 * @returns the first free name, or undefined when 99 are not enough.
 */
export function freeName(name, taken) {
    const used = new Set(taken);
    if (!used.has(name))
        return name;
    const ext = extensionOf(name);
    const stem = ext === '' ? name : name.slice(0, name.length - ext.length - 1);
    const suffix = ext === '' ? '' : `.${ext}`;
    for (let n = 2; n <= 99; n += 1) {
        const candidate = `${stem}-${n}${suffix}`;
        if (!used.has(candidate))
            return candidate;
    }
    // A hundred collisions is not a name problem, it is a loop: say so instead of
    // returning a name that was already taken.
    return undefined;
}
