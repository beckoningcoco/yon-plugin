/**
 * 浏览器面板的预览样本：面板 mount 后跑的那一次 `list()`，答案全在这里。
 *
 * 样本要摆进去的是这一屏**每一种状态**，否则某些样式压根不会出现在图上：
 *   · 两族都在（chromium 的 Chrome/Edge、firefox 的 Firefox）——`family` 那个小字
 *     在标题行里，只有两族同时出现才看得出它不是装饰；
 *   · **一条路径已失效的登记**：它的行在下拉里带「路径已失效」、选中后「启动」是禁用的、
 *     底下还要多出一段说明。没有它，`pathExists:false` 那三个分支一个都不会被画到；
 *   · **一个已经起来的实例**（alive + 可复制的 endpoint + 停止按钮）与
 *     **一个问不出来还在不在的实例**（`alive:'unknown'`、`ready:false`，多一段 note）——
 *     「正在运行」列表里两种行长得不一样，而它们的区别正是这一屏要说的事。
 *
 * `alive:'gone'` 不摆：宿主在 `list()` 里把已退出的记录**清账**（只清账、不杀进程），
 * 所以那个取值永远不会出现在面板拿到的 payload 里。画一个宿主不会给的状态，等于给
 * 「看着图做的判断」留一个假证据。
 *
 * 数据是常量，五个方法一律返回已 resolve 的 Promise：这里**不发任何请求、不起任何
 * 进程、不碰磁盘**，预览页要能在没有 host 的机器上打开。时间戳因此是编的，但要编得
 * 像真的——两条实例落在同一个小时里，才看得出「启动时间」这一列在起作用。
 *
 * 路径里的 profile 根写成插件根目录下的默认位置，因为那一行 hint 说的就是它。
 */
import type { BrowserApi } from '../../src/client/browser/api.ts'
import type {
  BrowserListPayload, BrowserRunView, BrowserView, SaveBrowserInput, ScanBrowsersPayload,
} from '../../src/shared/types.ts'

/** 登记文件与实例台账在面板脚注里显示的那两个路径。编的，与真机上的默认路径同形。 */
const CONFIG = 'C:/Users/99558/.dsh/yon-panel/browser_config.json'
const RUNS = 'C:/Users/99558/.dsh/yon-panel/browser_runs.json'
const PROFILE_ROOT = 'E:/gitproject/dsh-plugin-yon-panel/.browser-profile'

/** 扫到过、现在还在的三条里前两条，外加一条**已经不在**的 Firefox。 */
export const BROWSER_ROWS: readonly BrowserView[] = [
  {
    id: 'chrome',
    family: 'chromium',
    product: 'Google Chrome',
    path: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    profileDir: `${PROFILE_ROOT}/chrome`,
    port: 9222,
    startUrl: '',
    pathExists: true,
    stale: false,
    logPath: `${PROFILE_ROOT}/chrome/browser-launch.log`,
    lastFoundAt: '2026-10-04T05:17:14.000Z',
  },
  {
    id: 'edge',
    family: 'chromium',
    product: 'Microsoft Edge',
    path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    profileDir: `${PROFILE_ROOT}/edge`,
    port: 9223,
    startUrl: 'http://localhost:3000',
    pathExists: true,
    stale: false,
    logPath: `${PROFILE_ROOT}/edge/browser-launch.log`,
    lastFoundAt: '2026-10-04T05:17:14.000Z',
  },
  {
    id: 'firefox',
    family: 'firefox',
    product: 'Mozilla Firefox',
    path: 'C:/Program Files/Mozilla Firefox/firefox.exe',
    profileDir: `${PROFILE_ROOT}/firefox`,
    port: 9230,
    startUrl: '',
    pathExists: false,
    stale: true,
    logPath: `${PROFILE_ROOT}/firefox/browser-launch.log`,
    lastFoundAt: '2026-09-12T02:41:08.000Z',
  },
]

/** 面板起过的两个实例：一个活着，一个还在问。 */
export const BROWSER_RUNS: readonly BrowserRunView[] = [
  {
    runId: 'br-mh4p2c-9w1q',
    browserId: 'edge',
    label: 'Microsoft Edge',
    family: 'chromium',
    pid: 57_104,
    port: 9223,
    profileDir: `${PROFILE_ROOT}/edge`,
    startedAt: '2026-10-04T05:12:00.000Z',
    endpoint: 'http://127.0.0.1:9223/json/version',
    ready: true,
    alive: 'alive',
    debuggerUrl: 'ws://127.0.0.1:9223/devtools/browser/7d2e33b9-a4da-4678-953b-315e564f0857',
  },
  {
    runId: 'br-mh4p2c-2k7v',
    browserId: 'firefox',
    label: 'Mozilla Firefox',
    family: 'firefox',
    pid: 61_208,
    port: 9230,
    profileDir: `${PROFILE_ROOT}/firefox`,
    startedAt: '2026-10-04T04:58:31.000Z',
    // Firefox 那套协议没有 HTTP 端点可给，所以这里只是「它监听在这儿」。
    endpoint: 'tcp://127.0.0.1:9230',
    ready: false,
    alive: 'unknown',
    note: '端口 9230 没在时限内应答，问不出它还在不在；这一条没有动手结束过。',
  },
]

/** 一屏样本的读。 */
export const BROWSER_PAYLOAD: BrowserListPayload = {
  browsers: BROWSER_ROWS,
  runs: BROWSER_RUNS,
  configPath: CONFIG,
  runsPath: RUNS,
  platform: 'win32',
  scanSupported: true,
  scannedAt: '2026-10-04T05:17:14.000Z',
  complete: true,
}

/**
 * 面板的五个方法，全部是常量答案。
 *
 * 写的那两个也要能跑：预览页是静态的，点不动，但 `render.spec.tsx` 里有一张图是
 * **先点开停止确认再落盘**的（与迭代面板的删除确认同一做法），那条路径会真的调到
 * `stopBrowser`。不过那张图只画到「问出口」为止，所以这里返回的是最平常的答复。
 */
export const BROWSER_FIXTURE: BrowserApi = {
  async listBrowsers(): Promise<BrowserListPayload> {
    return BROWSER_PAYLOAD
  },
  async scanBrowsers(): Promise<ScanBrowsersPayload> {
    return {
      browsers: BROWSER_ROWS,
      added: [],
      updated: [],
      stale: ['firefox'],
      scannedAt: '2026-10-04T05:17:14.000Z',
    }
  },
  async saveBrowser(id: string, patch: SaveBrowserInput) {
    const row = BROWSER_ROWS.find(entry => entry.id === id) ?? (BROWSER_ROWS[0] as BrowserView)
    return {
      browser: {
        ...row,
        path: patch.path ?? row.path,
        profileDir: patch.profileDir ?? row.profileDir,
        port: patch.port ?? row.port,
        startUrl: patch.startUrl ?? row.startUrl,
      },
    }
  },
  async launchBrowser(id: string) {
    const row = BROWSER_ROWS.find(entry => entry.id === id) ?? (BROWSER_ROWS[0] as BrowserView)
    const run: BrowserRunView = {
      runId: 'br-preview-0001',
      browserId: row.id,
      label: row.product,
      family: row.family,
      port: row.port,
      profileDir: row.profileDir,
      startedAt: '2026-10-04T06:02:11.000Z',
      endpoint: row.family === 'firefox'
        ? `tcp://127.0.0.1:${String(row.port)}`
        : `http://127.0.0.1:${String(row.port)}/json/version`,
      ready: true,
      alive: 'alive',
    }
    return { run }
  },
  async stopBrowser(runId: string) {
    return { runId, removed: true, stopped: true, method: 'cdp' }
  },
}

/** 只有登记、一个实例都没起过：下半段是「还没有启动过」而不是实例列表。 */
export const BROWSER_FORM: BrowserApi = {
  ...BROWSER_FIXTURE,
  async listBrowsers(): Promise<BrowserListPayload> {
    return { ...BROWSER_PAYLOAD, runs: [] }
  },
}

/**
 * 还没扫过：`scannedAt` 没有、扫描也不支持——也就是**非 Windows** 上第一次打开的样子。
 *
 * 为什么不是「Windows 上第一次打开」：宿主的 `list()` 见到 `scannedAt` 为空就当场扫一遍
 * 并落盘（`browser-service.ts:461-482`），所以 Windows 上不存在「打开了、还没扫过」这一屏。
 * 唯一能拿到"没有 scannedAt"的返回值，就是扫描器自己说不支持（同一段代码 476-481 行），
 * 那时平台说明由宿主写在 `note` 里。样本照这个形状摆，才是宿主真会给的东西。
 */
export const BROWSER_UNSCANNED: BrowserApi = {
  ...BROWSER_FIXTURE,
  async listBrowsers(): Promise<BrowserListPayload> {
    return {
      browsers: [],
      runs: [],
      configPath: CONFIG,
      runsPath: RUNS,
      platform: 'darwin',
      scanSupported: false,
      complete: true,
      note: '自动扫描目前只支持 Windows；当前系统是 darwin。请在配置文件里手写浏览器路径。',
    }
  },
}

/**
 * 扫过了，而这台机器上确实一个都没有。
 *
 * 与上面那屏的区别正是这一屏存在的理由：两屏的下拉都是空的、都没有实例，差别只在
 * 「还没扫过」与「扫过了、没有」这两句话——而后者说得不对，使用者就会一直点「重新
 * 扫描」，以为是自己没扫到。
 */
export const BROWSER_EMPTY: BrowserApi = {
  ...BROWSER_FIXTURE,
  async listBrowsers(): Promise<BrowserListPayload> {
    return { ...BROWSER_PAYLOAD, browsers: [], runs: [] }
  },
}

/**
 * 登记文件读不出来（手改坏了）。
 *
 * `complete:false` 与「一个都没有」在面板上是两句不同的话：这一屏的下拉也是空的，
 * 但它必须说清"是文件坏了"，而不是让使用者以为这台机器没装浏览器。
 */
export const BROWSER_UNREADABLE: BrowserApi = {
  ...BROWSER_FIXTURE,
  async listBrowsers(): Promise<BrowserListPayload> {
    return {
      ...BROWSER_PAYLOAD,
      browsers: [],
      runs: [],
      complete: false,
      error: `无法解析 ${CONFIG}：它不是合法的 JSON。请修正该文件；在它修好之前，面板不会往里写。`,
    }
  },
}

/**
 * 同一份坏登记表，但实例台账里**还有活的实例**。
 *
 * 与上一屏只差一个 `runs`，而这一屏是批 4 修掉那个洞的证据：运行区原先嵌在「选中了
 * 某一行」那一支里，登记表一空就没有"某一行"——于是正在跑的实例**既看不见、也停不掉**。
 * 端口上有东西、面板上一片空，这一屏要说的就是这件事。
 */
export const BROWSER_NOROW: BrowserApi = {
  ...BROWSER_FIXTURE,
  async listBrowsers(): Promise<BrowserListPayload> {
    return {
      ...BROWSER_PAYLOAD,
      browsers: [],
      complete: false,
      error: `无法解析 ${CONFIG}：它不是合法的 JSON。请修正该文件；在它修好之前，面板不会往里写。`,
    }
  },
}
