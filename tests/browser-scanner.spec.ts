/**
 * Finding browsers on a machine, with the machine replaced by two functions.
 *
 * The transcripts below are **real output**, copied from this Windows box (10.0.26200)
 * rather than written to suit the parser, because that is the whole reason the parser
 * looks the way it does:
 *
 * - `reg query`'s value name comes back localized — the line reads `(默认)` on a Chinese
 *   Windows and `(Default)` on an English one. Anything matching a name would work on the
 *   developer's machine and nowhere else, so the parser matches `REG_SZ` and takes what
 *   follows it.
 * - A failed query answers in the console's language too, and its exit code is 1. The
 *   exit code is the signal; the text is not read at all.
 * - `HKLM` and `HKLM\SOFTWARE\WOW6432Node` return the *same* path for Edge on this
 *   machine (verified by hand: both answer
 *   `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). That is why the
 *   deduplication is load-bearing rather than defensive.
 */

import { describe, expect, it } from 'vitest'
import {
  BROWSER_RECIPES,
  parseRegistryDefault,
  registryKeysFor,
  scanBrowsers,
  toForwardSlashes,
  type ScanDeps,
  type ScanEnvironment,
} from '../src/host/browser-scan.ts'

/** The environment of this machine, abbreviated to the three roots the table reads. */
const WINDOWS_ENV: ScanEnvironment = {
  platform: 'win32',
  env: {
    PROGRAMFILES: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\op\\AppData\\Local',
  },
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** Deps over a fixed set of paths and registry answers. */
function deps(options: {
  readonly files?: readonly string[]
  readonly registry?: Readonly<Record<string, string>>
  readonly throwOn?: string
} = {}): ScanDeps & { readonly asked: string[] } {
  const files = new Set(options.files ?? [])
  const asked: string[] = []
  return {
    asked,
    exists: path => files.has(path),
    registryDefault: async (executable) => {
      asked.push(executable)
      if (options.throwOn === executable) throw new Error('reg is unavailable')
      return options.registry?.[executable]
    },
  }
}

/** A `reg query <key> /ve` transcript that succeeded. Copied from this machine. */
function regDefault(value: string): string {
  return `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe\r\n`
    + `    (默认)    REG_SZ    ${value}\r\n\r\n`
}

describe('scanBrowsers', () => {
  it('finds the browsers the default locations have, in table order', async () => {
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: [CHROME, EDGE, 'C:/Program Files/Mozilla Firefox/firefox.exe'],
    }))
    expect(outcome.supported).toBe(true)
    expect(outcome.browsers.map(browser => browser.id)).toEqual(['chrome', 'edge', 'firefox'])
    expect(outcome.browsers[0]).toEqual({
      id: 'chrome', family: 'chromium', product: 'Google Chrome', path: CHROME,
    })
    expect(outcome.browsers[2]?.family).toBe('firefox')
    // The registry is a fallback, not a second opinion: nothing was asked of it.
    expect(outcome.browsers).toHaveLength(3)
  })

  it('does not ask the registry when a default location already answered', async () => {
    const probe = deps({ files: [CHROME] })
    await scanBrowsers(WINDOWS_ENV, probe)
    expect(probe.asked).not.toContain('chrome.exe')
  })

  it('falls back to the registry for a browser installed somewhere else', async () => {
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: ['D:/绿色软件/chrome.exe'],
      registry: { 'chrome.exe': 'D:\\绿色软件\\chrome.exe' },
    }))
    expect(outcome.browsers).toHaveLength(1)
    // Forward slashes on the way out, so the stored spelling and a hand-typed one can be
    // compared as strings.
    expect(outcome.browsers[0]?.path).toBe('D:/绿色软件/chrome.exe')
  })

  it('refuses a registry path that is not there', async () => {
    // An uninstaller routinely leaves the key behind. A registration pointing at a
    // browser that is gone is worse than no registration: the panel would offer a start
    // button that could only ever fail.
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: [],
      registry: { 'chrome.exe': 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    }))
    expect(outcome.browsers).toEqual([])
  })

  it('counts one file once, even when the registry names the same path', async () => {
    // The measured case: on this machine both hives answer the same path for Edge. Two
    // rows for one browser would put two entries in the dropdown and two profile
    // directories on disk.
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: [CHROME],
      registry: { 'chrome.exe': 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    }))
    expect(outcome.browsers.map(browser => browser.path)).toEqual([CHROME])
  })

  it('skips a root variable that is not set instead of building a literal path', async () => {
    const probe = deps({ files: ['ProgramFiles(x86)/Microsoft/Edge/Application/msedge.exe'] })
    const outcome = await scanBrowsers({
      platform: 'win32',
      // No `PROGRAMFILES`: the candidate that would have used it must be dropped, not
      // turned into a path containing the text `ProgramFiles`.
      env: { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
    }, probe)
    expect(outcome.browsers).toEqual([])
  })

  it('reads a root variable whatever case it was given in', async () => {
    // Windows variable names are case-insensitive and Node hands back the process's own
    // spelling; `ProgramFiles(x86)` appears both ways in the wild.
    const outcome = await scanBrowsers({
      platform: 'win32',
      env: { PROGRAMFILES: 'C:\\Program Files' },
    }, deps({ files: [CHROME] }))
    expect(outcome.browsers.map(browser => browser.id)).toEqual(['chrome'])
  })

  it('treats a registry that cannot be read as a machine with only default locations', async () => {
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: [CHROME], throwOn: 'chrome.exe',
    }))
    expect(outcome.browsers).toHaveLength(1)
  })

  it('says plainly that it does not scan another platform', async () => {
    const outcome = await scanBrowsers({ platform: 'darwin', env: {} }, deps())
    // Not an empty list: an empty list on macOS would read as "you have no browsers",
    // which is a different and false statement.
    expect(outcome.supported).toBe(false)
    expect(outcome.browsers).toEqual([])
    expect(outcome.note).toContain('darwin')
  })

  it('keeps Chrome and Chromium apart even though they share a binary name', async () => {
    const outcome = await scanBrowsers(WINDOWS_ENV, deps({
      files: [CHROME, 'C:/Users/op/AppData/Local/Chromium/Application/chrome.exe'],
    }))
    expect(outcome.browsers.map(browser => browser.id)).toEqual(['chrome', 'chromium'])
    expect(outcome.browsers.every(browser => browser.family === 'chromium')).toBe(true)
  })
})

describe('the browser table', () => {
  it('gives every recipe a stable id, a family and an executable to ask the registry for', () => {
    expect(BROWSER_RECIPES.map(recipe => recipe.id)).toEqual(['chrome', 'edge', 'chromium', 'firefox'])
    for (const recipe of BROWSER_RECIPES) {
      expect(recipe.product).not.toBe('')
      expect(recipe.executable.endsWith('.exe')).toBe(true)
      expect(recipe.candidates.length).toBeGreaterThan(0)
      // The id is what a profile directory is named after, so it has to be a name a
      // filesystem takes as-is.
      expect(recipe.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
    // Firefox is the only non-CDP family, and the code that starts and stops it keys off
    // exactly this.
    expect(BROWSER_RECIPES.filter(recipe => recipe.family === 'firefox').map(recipe => recipe.id))
      .toEqual(['firefox'])
  })
})

describe('registryKeysFor', () => {
  it('asks the machine-wide keys before the per-user one, in both hive views', () => {
    expect(registryKeysFor('chrome.exe')).toEqual([
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    ])
  })
})

describe('parseRegistryDefault', () => {
  it('takes the path that follows REG_SZ, ignoring the localized value name', () => {
    // The real transcript, as printed on this machine. The name is `(默认)`; it is never
    // matched, which is what makes this work on an English Windows too.
    expect(parseRegistryDefault(regDefault('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')))
      .toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('prefers the executable over a sibling directory value', () => {
    // What the un-switched query returns: the default value is the exe, `Path` is its
    // directory. Both are REG_SZ.
    const transcript = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\...\\App Paths\\chrome.exe\r\n'
      + '    (默认)    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\r\n'
      + '    Path    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\r\n\r\n'
    expect(parseRegistryDefault(transcript))
      .toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('unwraps a quoted path and trims the padding', () => {
    expect(parseRegistryDefault('    (Default)    REG_SZ    "C:\\Program Files (x86)\\Edge\\msedge.exe"   '))
      .toBe('C:\\Program Files (x86)\\Edge\\msedge.exe')
  })

  it('answers undefined for the failure text', () => {
    // The real message on this machine: 错误: 系统找不到指定的注册表项或值。
    expect(parseRegistryDefault('错误: 系统找不到指定的注册表项或值。')).toBeUndefined()
    expect(parseRegistryDefault('')).toBeUndefined()
  })

  it('answers undefined when the only value is not an executable', () => {
    expect(parseRegistryDefault('    Path    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application'))
      .toBeUndefined()
  })
})

describe('toForwardSlashes', () => {
  it('gives one spelling for a path that arrived in any of the forms', () => {
    expect(toForwardSlashes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'))
      .toBe('C:/Program Files/Google/Chrome/Application/chrome.exe')
    expect(toForwardSlashes('  C:\\Program Files\\  ')).toBe('C:/Program Files')
    expect(toForwardSlashes('D:\\a\\\\b\\\\\\c')).toBe('D:/a/b/c')
    // A drive root keeps its slash: stripping it would leave `C:` , which means "the
    // current directory on C:" to Windows and is not the same path at all.
    expect(toForwardSlashes('C:\\')).toBe('C:/')
  })

  it('answers an empty value with an empty value, so blank stays blank', () => {
    // Load-bearing: the service spells "the operator chose nothing" as
    // `toForwardSlashes(x) === ''`, and a `'/'` here would turn a blank user-data
    // directory into a real one — a browser started with `--user-data-dir=/`.
    expect(toForwardSlashes('')).toBe('')
    expect(toForwardSlashes('   ')).toBe('')
    expect(toForwardSlashes('\\')).toBe('')
  })
})
