/** 一处 NCC 环境，字段与 Python 版的 config 一一对应。 */
export interface NccApiEnv {
    readonly name: string;
    /** `47.93.224.130:917`、`http://...`、`https://...` 都可以。 */
    readonly host: string;
    readonly client_id: string;
    readonly client_secret: string;
    /** RSA 公钥 base64（不含 PEM 头尾）。 */
    readonly pubkey: string;
    readonly biz_center: string;
    readonly dsname: string;
    /** `new` = NCC >= 2005（OAEP + 加盐），`old` = 更早版本。默认 new。 */
    readonly version?: 'new' | 'old';
}
/** 配置文档的形状：一个 active + 若干环境。 */
export interface NccApiConfig {
    readonly active: string;
    readonly envs: readonly NccApiEnv[];
}
/** 本模块自己的错误：带一个可分辨的 code，方便工具层翻译成人话。 */
export declare class NccApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** 配置落点：与 `db_config.json`、`home_config.json` 同一目录，换机器时随插件家目录走。 */
export declare function nccApiConfigPath(): string;
/** 读配置。文件不存在时给空文档，而不是抛错——第一次用本来就没有。 */
export declare function loadNccApiConfig(path?: string): NccApiConfig;
/** 写配置（整份覆盖）。 */
export declare function saveNccApiConfig(doc: NccApiConfig, path?: string): void;
/** 按名字找环境；没有就抛，消息里带上可选值。 */
export declare function findNccApiEnv(config: NccApiConfig, name: string): NccApiEnv;
/** NCC >= 2005 的 token 签名：`SHA256(data + base64(sha1prng(pubkey)))`。 */
export declare function saltedSha256(data: string, pubkey: string): string;
/** 一次 HTTP 应答。 */
export interface NccApiHttpAnswer {
    readonly status: number;
    readonly body: string;
}
/** 取 token 的结果。 */
export interface NccApiToken {
    readonly token: string;
    readonly expiresIn: number;
}
/** 步骤 1：用 client_id / secret / 公钥换 access_token。 */
export declare function fetchNccApiToken(env: NccApiEnv, timeoutMs?: number): Promise<NccApiToken>;
/** 一次业务调用的结果。 */
export interface NccApiCallResult extends NccApiHttpAnswer {
    readonly tokenCostMs: number;
    readonly apiPath: string;
    readonly env: string;
}
/** 步骤 2：带 token 调业务接口。 */
export declare function callNccApi(env: NccApiEnv, apiPath: string, requestBody: string, timeoutMs?: number): Promise<NccApiCallResult>;
