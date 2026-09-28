/**
 * The project store, exposed to the agent as tools.
 *
 * Why tools and not an LLM call inside this plugin: the model that reads
 * "把用友项目的环境信息改成 10.0.0.9" is the one the operator is already talking
 * to, and the agent loop already owns prompting, model choice, credentials,
 * retries, and the transcript. Handing it tools means this package carries no
 * model client at all, and the operator keeps one place where the work is
 * visible and auditable.
 *
 * Every write asks first. The gate is the framework's own `tools/pre-execute`
 * decision: returning `{kind:'ask'}` runs the call only after the approval
 * service answers `allowed-once`, so the preview below is what the operator
 * approves — and a call a person never saw cannot change their data.
 *
 * The tools speak the operator's vocabulary, not the schema's: a project may be
 * named by id, name, or code, and each preview is written as the diff a person
 * would check before saying yes.
 *
 * The registry contract is declared here rather than imported. The harness's
 * tool package publishes no installable dependency for a third-party plugin
 * (its dependency graph reaches a package that is not on the registry), and a
 * plugin that pinned one release's copy would be asserting a version it cannot
 * verify against the deployment actually running. The declarations below are the
 * documented shape the registry calls, and nothing more.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './service.ts';
/** One content block this package produces: text, always. */
export interface YonTextBlock {
    readonly type: 'text';
    readonly text: string;
}
/** The pending-state card a UI renders for one call. */
export interface YonToolCallView {
    readonly card: 'generic';
    readonly title: string;
    readonly kind: 'read' | 'other';
    readonly rawInput?: unknown;
}
/**
 * The slice of a session this package reads: its committed event log.
 *
 * The permission knobs live in that log (`sandbox/mode`, `approval/policy`)
 * rather than behind a service this plugin would have to depend on, and reading
 * the newest value of each is how a write learns what its session permits.
 */
export interface YonSessionLike {
    readonly seq: number;
    eventAt(seq: number): {
        readonly type: string;
        readonly data?: unknown;
    } | undefined;
}
/** The slice of an agent a tool call carries. */
export interface YonAgentLike {
    readonly session?: YonSessionLike;
}
/** Identity and cancellation of one running tool call. */
export interface YonToolExecution {
    /** The registered tool being called. */
    readonly name: string;
    /** Model-supplied arguments, unvalidated: each tool validates its own. */
    readonly arguments: unknown;
    readonly callId: string;
    readonly signal: AbortSignal;
    /** The agent on whose behalf the call runs; absent for a direct dispatch. */
    readonly agent?: YonAgentLike;
}
/** One tool definition, as the registry consumes it. */
export interface YonToolDefinition {
    readonly name: string;
    readonly description: string;
    /** JSON Schema of the argument object the model must supply. */
    readonly parameters: Record<string, unknown>;
    readonly output: {
        /** JSON Schema of the value `execute` returns. */
        readonly schema: Record<string, unknown>;
        /** Project one successful value into the model-facing content. */
        render(args: unknown, value: unknown): YonTextBlock[];
    };
    /** Run one accepted call; the returned value must match `output.schema`. */
    execute(args: unknown, exec: YonToolExecution): Promise<unknown>;
    /** Presentation of the pending call, derived from its arguments alone. */
    presentCall?(args: unknown): YonToolCallView | undefined;
}
/** What a pre-execute listener may decide about one call. */
export type YonPreToolDecision = {
    readonly kind: 'allow';
} | {
    readonly kind: 'deny';
    readonly reason: string;
} | {
    readonly kind: 'ask';
    readonly reason?: string;
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The tool registry, mounted by the harness's own tool runtime. */
        tools: {
            register(definition: YonToolDefinition): () => void;
        };
    }
    interface Events {
        /**
         * Waterfall deciding whether one tool call runs. `ask` runs the call only
         * after an approval service answers `allowed-once`, and fails closed
         * otherwise.
         */
        'tools/pre-execute'(exec: YonToolExecution, next: () => Promise<YonPreToolDecision>): Promise<YonPreToolDecision> | YonPreToolDecision;
    }
}
/** Every tool this package owns, in the order a caller should reach for them. */
export declare const YON_TOOL_NAMES: readonly ["project_list", "project_read", "project_create", "project_update", "project_delete"];
/** The subset that changes stored data; the gate inspects each of these. */
export declare const YON_WRITE_TOOL_NAMES: readonly ["project_create", "project_update", "project_delete"];
/**
 * Whether one write destroys something.
 *
 * The split the operator asked for is not "which tool" but "what would be lost":
 * a change that only adds or updates is cheap to make and cheap to notice — the
 * result lists exactly what changed — while removing a field, deleting a project
 * or archiving it out of the default list is neither. Creating a project
 * destroys nothing.
 * @param name - the tool being called.
 * @param args - the arguments of that call.
 * @returns true when running the call could lose data.
 */
export declare function isDestructiveWrite(name: string, args: unknown): boolean;
/** The session's permission knobs, as the newest value of each committed event. */
export interface YonPermissions {
    /** `read-only` refuses every write; the other two allow them. */
    readonly sandbox: 'read-only' | 'workspace-write' | 'danger-full-access' | undefined;
    /** `ask` wants a person for a destructive write; `never` wants nobody asked. */
    readonly approval: 'ask' | 'never' | undefined;
}
/**
 * Read the permission knobs from one session's log, newest value winning.
 * @param session - the calling agent's session, when the call has one.
 * @returns the effective knobs; an absent field means the log never set it.
 */
export declare function permissionsOf(session: YonSessionLike | undefined): YonPermissions;
/** What should happen to one write. */
export type YonWriteDisposition = 'run' | 'ask' | 'refuse';
/**
 * Decide one write from what it would cost and what its session permits.
 *
 * The policy follows the session instead of overruling it. A read-only session
 * refuses every write, because that is what read-only means. An additive write
 * runs wherever writing is allowed at all. A destructive write asks in a session
 * that wants to be asked, and — deliberately — runs in one that has said it does
 * not: `never` there means "nobody is available to approve", which is the
 * operator's own choice rather than an accident to fail closed on. An unset
 * policy keeps the safe default and asks.
 * @param destructive - whether the call could lose data.
 * @param permissions - the session's effective knobs.
 * @returns how the gate should answer.
 */
export declare function dispositionOf(destructive: boolean, permissions: YonPermissions): YonWriteDisposition;
/**
 * Explain one write in the terms a person checks before approving it.
 *
 * This is the whole preview: the approval card shows this text, so an update
 * that would change nothing says so, and an update that changes three things
 * lists exactly those three.
 * @param projects - the store, read for the current values.
 * @param name - the tool being previewed.
 * @param args - the arguments of that call.
 * @returns the preview, or undefined when the arguments are unusable (the tool
 *   itself reports that, and asking about a call that cannot run is noise).
 */
export declare function previewWrite(projects: YonProjectsService, name: string, args: unknown): string | undefined;
/**
 * Register the project tools and their preview gate.
 * @param ctx - host context carrying the tool registry.
 * @param projects - the store the tools read and write.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonProjectTools(ctx: Context, projects: YonProjectsService): () => void;
/**
 * Whether one tool name is a write this package gates behind an approval.
 * @param name - the tool name to test.
 * @returns true for the tools that change stored data.
 */
export declare function isYonWriteTool(name: string): boolean;
