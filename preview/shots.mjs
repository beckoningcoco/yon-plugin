/**
 * Render the preview pages to PNG, and print what the browser actually computed.
 *
 * `render.spec.tsx` writes the HTML; this turns those pages into images. They are
 * two steps on purpose: the HTML is the artifact under version-controllable review
 * (it is diffable, and it carries the real stylesheets), and the screenshot is how
 * a human actually looks at it.
 *
 * The second half is the part worth keeping. Every `panel-*.png` is a claim about
 * how the panel looks, and a claim a screenshot cannot check is a claim that rots:
 * a 1px hairline at 4% black, an elevation token that failed to resolve, a bar
 * whose track is drawn but invisible. Those all *look* like design decisions in an
 * image and are all actually missing CSS. So each page carries a probe that writes
 * computed values into a hidden node, and this prints them.
 *
 * Needs a Chromium on the machine (Chrome or Edge). Override with CHROME=/path.
 *
 *   node preview/shots.mjs            # all pages
 *   node preview/shots.mjs digest     # only pages whose name contains "digest"
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const previewDir = join(root, 'preview')

/** Business surfaces are ~680px wide and ~520px tall; 2x keeps the hairlines crisp. */
const WINDOW = '900,820'
const SCALE = '2'

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const chrome = CANDIDATES.find(candidate => existsSync(candidate))
if (chrome === undefined) {
  console.error('shots: no Chromium found. Set CHROME=/path/to/chrome and retry.')
  console.error(`shots: looked in\n  ${CANDIDATES.join('\n  ')}`)
  process.exit(1)
}

const filter = process.argv[2]
const pages = readdirSync(previewDir)
  .filter(name => name.startsWith('panel-') && name.endsWith('.html'))
  .filter(name => filter === undefined || name.includes(filter))
  .sort()

if (pages.length === 0) {
  console.error(filter === undefined
    ? 'shots: no panel-*.html in preview/ — run `npx vitest run --config preview.config.ts` first.'
    : `shots: nothing matches "${filter}".`)
  process.exit(1)
}

/** A throwaway profile, so this never touches the operator's own browser state. */
const profile = join(previewDir, '.chrome-profile')
rmSync(profile, { recursive: true, force: true })
mkdirSync(profile, { recursive: true })

/** Chrome wants a Windows path on Windows and a POSIX one elsewhere. */
const asPath = (value) => (process.platform === 'win32' ? value.replaceAll('/', '\\') : value)
const asUrl = (value) => `file:///${value.replaceAll('\\', '/').replace(/^\//, '')}`

let failures = 0
for (const page of pages) {
  const base = page.replace(/\.html$/, '')
  const html = join(previewDir, page)

  const shot = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${WINDOW}`,
    `--user-data-dir=${asPath(profile)}`,
    `--screenshot=${asPath(join(previewDir, `${base}.png`))}`,
    asUrl(html),
  ], { stdio: 'ignore' })

  if (shot.status !== 0) {
    console.error(`shots: ${base} FAILED to screenshot (chrome exit ${shot.status})`)
    failures += 1
    continue
  }

  // The probe renders even without a page to look at, so a missing PROBE line means
  // the injection itself broke — not that a value was absent. Worth failing on.
  const dom = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${asPath(profile)}`,
    '--dump-dom',
    asUrl(html),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

  const probe = /\bPROBE ([^<]*)/.exec(dom.stdout ?? '')
  if (probe === null) {
    console.error(`shots: ${base} — no probe output, the inline script did not run`)
    failures += 1
    continue
  }
  console.log(`${base}\n  ${probe[1]}`)
}

rmSync(profile, { recursive: true, force: true })

if (failures > 0) {
  console.error(`shots: ${failures} of ${pages.length} page(s) failed`)
  process.exit(1)
}
console.log(`shots: ${pages.length} page(s) -> preview/*.png`)
