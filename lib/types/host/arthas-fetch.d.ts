/** Where the boot jar comes from. Measured to answer with 148,033 bytes. */
export declare const ARTHAS_BOOT_URL = "https://arthas.aliyun.com/arthas-boot.jar";
/** The file name the rest of the feature looks for. */
export declare const ARTHAS_BOOT_JAR = "arthas-boot.jar";
/** What arrived, once verified. */
export interface DownloadedArthas {
    /** Absolute path of the jar on disk. */
    readonly path: string;
    readonly bytes: number;
}
/** What a directory turned out to contain. */
export interface ArthasPathProbe {
    /** The path as given, for the error message. */
    readonly path: string;
    readonly exists: boolean;
    /** The boot jar inside it, when one was found. */
    readonly bootJar?: string;
    /** The version directory under `~/.arthas/lib`, when the filesystem names one. */
    readonly version?: string;
}
/**
 * Fetch the boot jar into the plugin's data directory.
 *
 * @param signal - cancellation from the tool call.
 * @param distDir - where to put it; defaults to the plugin's own directory.
 * @returns the path and size of the verified jar.
 * @throws ArthasError when the network, the response, or the bytes are wrong.
 */
export declare function downloadBootJar(signal?: AbortSignal, distDir?: string): Promise<DownloadedArthas>;
/**
 * What is at this path?
 *
 * Accepts either the jar itself or a directory that holds one, and looks one
 * level down as well, because the distribution unpacks to `arthas-bin/` inside
 * whatever directory a person downloaded it into. One level is the whole of the
 * search: a recursive walk would make "register this directory" take an
 * unpredictable amount of time on a directory somebody pointed at by mistake.
 *
 * @param path - a file or directory the operator named.
 * @returns what was found; `exists: false` when the path is not there at all.
 */
export declare function probeArthasPath(path: string): Promise<ArthasPathProbe>;
/**
 * The version Arthas unpacked itself into, if it has run here before.
 *
 * Reads `~/.arthas/lib/<version>/`. The directory is created by Arthas on first
 * attach, so before that there is nothing to read and the answer is undefined —
 * which is the truth, and is rendered as "未探测" rather than as a version.
 *
 * @param libDir - the lib directory to read; defaults to the operator's own.
 * @returns the newest-looking version directory name, or undefined.
 */
export declare function versionOfLibDir(libDir?: string): Promise<string | undefined>;
/**
 * The first bytes of a file, for a caller that wants to verify what it has.
 *
 * Exists so a registered distribution can be checked for the same reason a
 * downloaded one is: a path that holds an HTML page named `.jar` is a mistake
 * someone will make, and it is cheaper to catch here than at attach time.
 *
 * Reads only the header rather than the file. The jars this may be pointed at
 * include generated classpath jars, and slurping a large one to look at four
 * bytes would be a strange way to spend a second.
 *
 * @param path - the file to read.
 * @param length - how many bytes to read; 4 is enough for a zip header.
 * @returns the bytes, or undefined when the file cannot be read.
 */
export declare function readHeader(path: string, length?: number): Promise<Uint8Array | undefined>;
/**
 * Is this path a plausible boot jar?
 *
 * @param path - the file to check.
 * @returns true when the file reads as a zip.
 */
export declare function isBootJarShaped(path: string): Promise<boolean>;
