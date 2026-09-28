/**
 * The skills this plugin ships, as data.
 *
 * A skill body is inlined at build time rather than read from disk at runtime
 * ({@link file://./skill-catalog.generated.ts} is produced by
 * `scripts/build-skills.mjs`). That choice is what makes the lifecycle the
 * operator asked for possible:
 *
 * - **Nothing to clean up.** The bodies are plain same-process values, so
 *   registering them writes no file anywhere. Uninstalling the plugin cannot
 *   leave a half-removed skill directory behind, because none was ever created.
 * - **No path to resolve.** A runtime read would have to locate `skills/`
 *   relative to a bundle the shell may have loaded from anywhere, and would fail
 *   on a deployment without a real filesystem.
 * - **Nothing to fetch.** Registration is synchronous, so the catalog is
 *   complete the moment the plugin is applied.
 *
 * The `skills/<name>/SKILL.md` files stay the authored source: they are
 * ordinary skill bundles, editable and reviewable like any other, and the
 * generated module is only their transport.
 */
/** One skill shipped inside this plugin. */
export interface YonBundledSkill {
    /** Kebab-case identifier; also the directory name under `skills/`. */
    readonly name: string;
    /** One line, exactly as the model and the operator see it while routing. */
    readonly description: string;
    /** Optional extra routing guidance; omitted rather than empty. */
    readonly whenToUse?: string;
    /** The Markdown body, without frontmatter. */
    readonly content: string;
}
