/**
 * Bundles the browser half only.
 *
 * The host half is emitted by `tsc -p tsconfig.lib.json` as plain ESM, which
 * Node loads directly; a bundler there would only get in the way (it left this
 * package's own relative modules as unresolvable `./x.ts` imports, and bundling
 * a harness library would give the host a second copy of it).
 *
 * A DSH client plugin bundle is not an ordinary ES module: the shell fetches it
 * outside Vite's graph and evaluates it as a closure factory
 * (`window.__ModuleLoader__.load({ id, factory })`) whose `require` is answered
 * by the page's frozen module table. Two rules keep the artifact correct:
 *
 * 1. Every module specifier the shell seeds into its table stays a `require()`
 *    call (see {@link PLATFORM_MODULES}); anything else is inlined, because a
 *    `require()` the table cannot answer throws at activation.
 * 2. CSS Modules are compiled here and injected as a plugin-owned `<style>` tag,
 *    so the bundle carries its own styling and no stylesheet file is fetched.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** The package name stamped into the loader handoff and the injected style tags. */
const ID = 'dsh-plugin-yon-panel'

/**
 * Module-table baseline the DSH web shell seeds (mirrors
 * `@deepseek-ai/dsh-client-web/src/platform.ts` in the harness). These stay
 * external; a plugin may not bundle its own copy of any of them, because the
 * page's copy is the one with live runtime identity.
 */
const PLATFORM_MODULES: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Non-baseline specifiers this plugin requests from the module table (none today). */
const REQUESTED_EXTERNALS: readonly string[] = []

const isExternal = (specifier: string): boolean =>
  PLATFORM_MODULES.includes(specifier) || REQUESTED_EXTERNALS.includes(specifier)

/** Virtual-id wrapper keeping module CSS away from tsdown's own CSS pipeline. */
const CSS_VIRTUAL_PREFIX = '\0yon-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Order two CSS-module export entries by their local name.
 * @param left - one `[local, export]` entry.
 * @param right - the other entry.
 * @returns a negative, zero, or positive number, as `left` sorts first.
 */
function byLocalName([left]: [string, unknown], [right]: [string, unknown]): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Compile one `.module.css` into a class map plus a plugin-owned style tag.
 * @param fileId - absolute path of the stylesheet being loaded.
 * @returns module source exporting the hashed class map.
 */
async function stylesheetModule(fileId: string): Promise<string> {
  const source = await readFile(fileId)
  const { code, exports } = transform({
    filename: fileId,
    code: source,
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  const classMap: Record<string, string> = {}
  // Sorted, because lightningcss hands its export map back in an order that
  // varies between runs: without this, rebuilding unchanged styles reorders the
  // class map and every build shows up as a diff against a committed artifact
  // that is in fact identical. The hashes themselves are already stable.
  for (const [local, value] of Object.entries(exports ?? {}).sort(byLocalName)) {
    classMap[local] = value.name
  }
  const tagId = `${ID}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(code.toString())};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** Inline CSS Modules as a class map plus a tagged style injection. */
function cssModulesInline(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'yon-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      return CSS_VIRTUAL_PREFIX + resolvePath(dirname(importer), source) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      // The virtual id hides the real path from Rolldown's watch graph.
      this.addWatchFile(fileId)
      return await stylesheetModule(fileId)
    },
  }
}

export default {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  // The shell imports `lib/client.js` by exact name; `.cjs` would miss.
  fixedExtension: false,
  // Plugin code is fetched outside Vite's module graph, so its own bundle must
  // carry the source mapping the browser uses.
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: isExternal,
    // Anything the module table cannot answer must be inlined: the `require`
    // handed to the factory is synchronous and cannot wait for a fetch.
    alwaysBundle: (specifier: string) => !isExternal(specifier),
  },
  inputOptions: {
    resolve: {
      conditionNames: ['production', 'browser', 'import', 'module', 'default'],
    },
  },
  // Bundled dependencies read these at module scope; the substitution keeps a
  // CJS artifact from tripping over `import.meta`.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [cssModulesInline()],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig
