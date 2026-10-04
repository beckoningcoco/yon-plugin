/**
 * The switches, and the four parsers that read what Windows says back.
 *
 * `argvOf` is the one function in this feature that decides what the browser is actually
 * asked to do, so it is pinned down to the exact array — including what must **not** be
 * in it. `--remote-allow-origins=*` is the interesting absence: measured on Chrome 156,
 * a WebSocket from this same Node runtime reaches `/json/version`'s
 * `webSocketDebuggerUrl` with no `Origin` header and no such flag, so turning it on would
 * buy nothing and would offer an unauthenticated debug port to any page on the machine.
 *
 * The parsers are held to real transcripts, copied from this box:
 *
 * - `netstat -ano -p tcp` on a live debug Chrome prints **three** lines for one port — a
 *   `LISTENING` row and an `ESTABLISHED` row for the browser, plus an `ESTABLISHED` row
 *   for the client socket whose *remote* port happens to be 9333. A parser that matched on
 *   "the line mentions the port" would name the client's pid.
 * - `tasklist` answers the no-match case with a localized sentence **and exit code 0**, so
 *   the parser's refusal to invent a name is the only guard there is.
 * - console output is written in the machine's OEM code page: `信息` arrives as
 *   `0xD0 0xC5 0xCF 0xA2`, which UTF-8 decoding turns into replacement characters.
 */
import { describe, expect, it } from 'vitest'
import {
  argvOf,
  decodeConsole,
  imageMatchesFamily,
  ownerOnPort,
  parseNetstatListeners,
  parseTasklistImage,
} from '../src/host/browser-system.ts'

const PROFILE = 'E:/plugin/.browser-profile/edge'

describe('argvOf', () => {
  it('asks a Chromium browser for a loopback debug port and its own profile', () => {
    expect(argvOf({ family: 'chromium', port: 9222, profileDir: PROFILE, startUrl: '' })).toEqual([
      '--remote-debugging-port=9222',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
    ])
  })

  it('never lets a browser page drive the debug port', () => {
    const args = argvOf({ family: 'chromium', port: 9222, profileDir: PROFILE, startUrl: '' })
    // The security decision, asserted rather than commented. Only a CDP client running
    // inside a browser page needs this flag; ours runs in Node and sends no Origin.
    expect(args.some(arg => arg.startsWith('--remote-allow-origins'))).toBe(false)
    // And the debug port is bound to loopback by an explicit argument rather than by the
    // default, because it has no authentication at all.
    expect(args).toContain('--remote-debugging-address=127.0.0.1')
  })

  it('asks a Firefox for its own kind of debug server', () => {
    expect(argvOf({ family: 'firefox', port: 9333, profileDir: 'E:/p/firefox', startUrl: '' })).toEqual([
      '-profile', 'E:/p/firefox',
      // Without this, a launch is absorbed by an instance that is already running, and
      // that instance never opens the debugger.
      '-no-remote',
      '-start-debugger-server', '9333',
    ])
  })

  it('appends the address to open, and omits it entirely when there is none', () => {
    const withUrl = argvOf({
      family: 'chromium', port: 9222, profileDir: PROFILE, startUrl: 'http://localhost:3000',
    })
    expect(withUrl.at(-1)).toBe('http://localhost:3000')
    // Not `''`: a browser handed an empty argument opens a blank tab named by nothing, or
    // treats it as a file path to open — both different from "just start".
    const blank = argvOf({ family: 'chromium', port: 9222, profileDir: PROFILE, startUrl: '   ' })
    expect(blank).toHaveLength(5)
    expect(blank).not.toContain('')
  })

  it('carries a Windows path with spaces and Chinese in it as one argument', () => {
    const args = argvOf({
      family: 'chromium', port: 9222, profileDir: 'E:/我的 项目/.browser-profile/chrome', startUrl: '',
    })
    // Spawned with `shell: false`, so this stays one argument — which is the whole reason
    // the launcher never uses a shell.
    expect(args).toContain('--user-data-dir=E:/我的 项目/.browser-profile/chrome')
  })
})

/** One port's three lines, copied from `netstat -ano -p tcp` with a live Chrome on 9333. */
const NETSTAT = [
  '',
  '活动连接',
  '',
  '  协议  本地地址          外部地址        状态           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1968',
  '  TCP    127.0.0.1:9333         0.0.0.0:0              LISTENING       52032',
  '  TCP    127.0.0.1:9333         127.0.0.1:62003        ESTABLISHED     52032',
  '  TCP    127.0.0.1:62003        127.0.0.1:9333         ESTABLISHED     35572',
  '  UDP    0.0.0.0:500             *:*                                    1460',
  '',
].join('\r\n')

describe('parseNetstatListeners', () => {
  it('keeps the listener and drops the two established rows', () => {
    const listeners = parseNetstatListeners(NETSTAT)
    // The client's own socket has 9333 in its remote column; matching on the port's text
    // anywhere in the line would have added it, and its pid is nobody's browser.
    expect(listeners.map(listener => listener.pid)).toEqual([1968, 52032])
    expect(listeners.every(listener => listener.port > 0)).toBe(true)
  })

  it('ignores UDP rows, which have no state column', () => {
    expect(parseNetstatListeners(NETSTAT).some(listener => listener.pid === 1460)).toBe(false)
  })

  it('reads the localized header and any other unparseable line as nothing', () => {
    expect(parseNetstatListeners('活动连接\r\n  协议  本地地址          外部地址        状态           PID\r\n'))
      .toEqual([])
  })

  it('reads an IPv6 address out of its brackets', () => {
    // Not observed on this machine — nothing here listens on `[::1]` — so this is the one
    // case in this file that is synthetic. Kept because the address is what
    // `ownerOnPort` uses to tell loopback from a wider bind.
    const listeners = parseNetstatListeners('  TCP    [::1]:9222             [::]:0                 LISTENING       777')
    expect(listeners).toEqual([{ address: '::1', port: 9222, pid: 777 }])
  })
})

describe('ownerOnPort', () => {
  it('prefers the loopback listener over one bound to every interface', () => {
    // This feature only ever binds 127.0.0.1, so a wildcard listener on the same port is
    // somebody else's program and must not be the one this code offers to end.
    const listeners = parseNetstatListeners([
      '  TCP    0.0.0.0:9222           0.0.0.0:0              LISTENING       111',
      '  TCP    127.0.0.1:9222         0.0.0.0:0              LISTENING       222',
    ].join('\n'))
    expect(ownerOnPort(listeners, 9222)?.pid).toBe(222)
  })

  it('falls back to what it found rather than answering nothing', () => {
    const listeners = parseNetstatListeners('  TCP    0.0.0.0:9222           0.0.0.0:0              LISTENING       111')
    expect(ownerOnPort(listeners, 9222)?.pid).toBe(111)
    expect(ownerOnPort(listeners, 9223)).toBeUndefined()
  })
})

describe('parseTasklistImage', () => {
  it('reads the image name out of the CSV row', () => {
    expect(parseTasklistImage('"chrome.exe","52032","Console","1","199,824 K"\r\n')).toBe('chrome.exe')
  })

  it('answers undefined for the no-match sentence, which still exits 0', () => {
    // 「信息: 没有运行的任务匹配指定标准。」 on this machine, exit code 0 — so this
    // refusal is the only thing between a recycled pid and a process that gets ended.
    expect(parseTasklistImage('信息: 没有运行的任务匹配指定标准。\r\n')).toBeUndefined()
    expect(parseTasklistImage('')).toBeUndefined()
  })
})

describe('imageMatchesFamily', () => {
  it('accepts every Chromium build and only Firefox for firefox', () => {
    for (const image of ['chrome.exe', 'msedge.exe', 'chromium.exe', ' CHROME.EXE ']) {
      expect(imageMatchesFamily(image, 'chromium')).toBe(true)
      expect(imageMatchesFamily(image, 'firefox')).toBe(false)
    }
    expect(imageMatchesFamily('firefox.exe', 'firefox')).toBe(true)
  })

  it('refuses anything else, including a browser-family-adjacent process', () => {
    for (const image of ['svchost.exe', 'chrome_proxy.exe', 'firefox.exe.bak', '']) {
      expect(imageMatchesFamily(image, 'chromium')).toBe(false)
      expect(imageMatchesFamily(image, 'firefox')).toBe(false)
    }
  })
})

describe('decodeConsole', () => {
  it('decodes the console code page, which UTF-8 turns into replacement characters', () => {
    // GBK bytes for 信息, the head of every `reg` and `tasklist` message on this machine.
    const gbk = Buffer.from([0xD0, 0xC5, 0xCF, 0xA2])
    expect(decodeConsole(gbk)).toBe('信息')
    expect(gbk.toString('utf8')).not.toBe('信息')
  })

  it('leaves ASCII alone, which is the structure every parser here reads', () => {
    const ascii = Buffer.from('  TCP    127.0.0.1:9222         0.0.0.0:0              LISTENING       111', 'utf8')
    expect(decodeConsole(ascii)).toBe(ascii.toString('utf8'))
  })
})
