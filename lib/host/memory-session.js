/**
 * Open the session registry.
 * @returns the registry, holding nothing that outlives a session.
 */
export function createYonMemorySession() {
    const current = new WeakMap();
    const claimed = new WeakMap();
    return {
        note(session, projectId) {
            if (session === undefined || projectId === '')
                return;
            current.set(session, projectId);
        },
        current(session) {
            return session === undefined ? undefined : current.get(session);
        },
        claim(session, projectId) {
            if (session === undefined || projectId === '')
                return false;
            const seen = claimed.get(session);
            if (seen?.has(projectId) === true)
                return false;
            if (seen === undefined)
                claimed.set(session, new Set([projectId]));
            else
                seen.add(projectId);
            return true;
        },
    };
}
/**
 * 把一行提示并进一个工具的结果里。
 *
 * 形态上是给值加一个 `memoryHint` 字段，而不是替换它：各工具的输出契约没有
 * `additionalProperties: false`，所以多一个字段仍然满足它自己的 schema，而那四个工具的
 * 值形状不必为了记住这一行而改。
 *
 * @param value - what the tool was going to return.
 * @param hint - the assembled hint provider, or undefined when the plugin has no bank.
 * @param exec - this call, for the session it belongs to.
 * @returns the value, with the line on it when there is one.
 */
export async function withMemoryHint(value, hint, exec) {
    // The plugin without a memory bank is the plugin before this feature existed: no hint
    // provider, no line, and no field on the value.
    if (hint === undefined)
        return value;
    const line = await hint(exec);
    // `exactOptionalPropertyTypes`: an absent hint must leave no key at all rather than a
    // key holding undefined, which is what a later `value.memoryHint !== undefined` reads as.
    return line === undefined ? value : { ...value, memoryHint: line };
}
/**
 * 那一行在渲染时怎么念：一个空行加那句话，或者什么都没有。
 *
 * 渲染是同步的，所以它只能读值里已经放着的那一行——提示是异步算出来的，在 `execute`
 * 里就已经并进值了。
 *
 * @param value - the value one tool returned.
 * @returns the text to append, empty when there is nothing to append.
 */
export function memoryHintLine(value) {
    const line = value === null || typeof value !== 'object'
        ? undefined
        : value.memoryHint;
    return typeof line === 'string' && line !== '' ? `\n\n${line}` : '';
}
