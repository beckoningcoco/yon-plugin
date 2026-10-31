/** 一条环境的对外视图：不含 secret。 */
export interface NccApiEnvView {
    readonly name: string;
    readonly host: string;
    readonly clientId: string;
    readonly bizCenter: string;
    readonly dsname: string;
    readonly version: string;
    readonly hasSecret: boolean;
    readonly pubkeyLength: number;
}
/** 环境列表。 */
export interface NccApiEnvsPayload {
    readonly path: string;
    readonly active: string;
    readonly envs: readonly NccApiEnvView[];
}
/** 保存一条环境的入参。secret/公钥留空表示沿用原值。 */
export interface NccApiSaveInput {
    readonly name: string;
    readonly host: string;
    readonly clientId: string;
    readonly bizCenter: string;
    readonly dsname?: string;
    readonly version?: 'new' | 'old';
    readonly clientSecret?: string;
    readonly pubkey?: string;
    readonly setActive?: boolean;
}
/** 一次调用的结果。 */
export interface NccApiCallResult {
    readonly status: number;
    readonly body: string;
    readonly tokenCostMs: number;
    readonly ok: boolean;
}
/** 面板要用到的操作。 */
export interface NccApiApi {
    listEnvs(): Promise<NccApiEnvsPayload>;
    saveEnv(input: NccApiSaveInput): Promise<{
        saved: string;
        created: boolean;
        active: string;
    }>;
    removeEnv(name: string): Promise<void>;
    call(input: {
        env: string;
        apiPath: string;
        body: string;
        timeoutMs?: number;
    }): Promise<NccApiCallResult>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createNccApiApi(): NccApiApi;
