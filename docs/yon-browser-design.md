# 调试浏览器面板（browser）：设计记录

> 这份文档记录**为什么这样设计**、**支撑它的实测数字**，以及**它现在还不成立的地方**，不是接口手册。
> 代码在 `src/host/browser-{scan,store,system,service}.ts` 与 `src/client/browser/`，用法在各自的 JSDoc 里，
> 测试在 `tests/browser-{store,scanner,launch,service}.spec.ts`、`tests/http-browsers.spec.ts`、
> `tests/browser-manager.client.spec.tsx`、`tests/browser-plugin.client.spec.ts`；界面在预览里出图
> （`preview/fixtures/browser.ts`、`node preview/shots.mjs browser`）。
>
> 记录日期 2026-10-04。

## 一、先说词汇：这里的「浏览器」不是那个「浏览器半」

本仓一直用「**浏览器半**」称呼插件的客户端那一半（`README.md` 的「按钮面板（浏览器半）」、
`tests/browser-plugin.client.spec.ts` 的文件名、`src/index.ts` 里成片的 "browser half"）。新面板
也叫「浏览器」，是使用者的原话，所以保留，但两者毫无关系：

| 说法 | 指什么 |
|---|---|
| **浏览器半**（browser half） | 插件跑在客户端的那一半代码：React 组件、CSS、`window.__ModuleLoader__` 产物。与「Host 半」相对 |
| **浏览器面板**、**调试浏览器**（`src/client/browser/`、`src/host/browser-*.ts`） | 本文件记录的这个功能：在本机起一个开了调试端口的 Chrome/Edge/Chromium/Firefox |

内部 id 一律是 `browser`（席位 id、目录名、服务名 `yonBrowsers`），**没有**造 `debug-browser` 前缀
——那会让 id 与目录名不一致，而「按 id 找目录」是这套面板的通行做法。

## 二、要解决的问题

用友前台自动化那条线（Playwright `connectOverCDP` 接管一个已登录的浏览器）每次都要人工做同一件事：
找 exe、敲一长串 `--remote-debugging-port=` / `--user-data-dir=`、起完再去 `/json/version` 抄 ws 地址。

这件事在本仓此前**只有开发脚本会做**：`preview/shots.mjs:33-48` 硬编码候选路径 + `spawnSync` 跑截图；
插件本体与 `src/host/**` 里**零个 `node:child_process`**。于是它每天都要重做一遍，且每次都在不同的
终端里、抄完就丢。

**为什么做成面板而不是又一个脚本**：它要碰的每一样东西（落盘、进程、端口、存活探测）都在宿主侧，
且必须在当场看见结果——脚本做不到「记住上次扫到的路径」，也做不到「列出现在起着的实例，并停掉
其中某一个」。

## 三、口径（使用者逐条选定，不再讨论）

| # | 决策 | 取值 |
|---|---|---|
| 1 | 面板 | 名字「浏览器」，注册 id `browser`，order **80**（第八格） |
| 2 | 扫描范围 | Chrome / Edge / Chromium + **Firefox** |
| 3 | Firefox | 一起做，用**它自己的**开关（`-start-debugger-server` / `-profile`）。它不是 CDP，**没有 `/json/version` 端点** |
| 4 | 运行态 | 「正在运行」列表 + 每行停止；**只停本面板起过的** |
| 5 | 用户数据目录 | 默认 `<插件根目录>/.browser-profile/<浏览器 id>/`（使用者指定），字段可改 |
| 6 | 起始网址 | 「启动时打开」，默认空 |
| 7 | 端口 | 默认 9222，可改，校验 1024–65535 |

## 四、宿主四个模块，一条测试缝

| 模块 | 内容 | 测试缝 |
|---|---|---|
| `browser-scan.ts` | 静态候选表 `BROWSER_RECIPES` + `scanBrowsers(env, deps)`，**不 import `node:fs` / `node:child_process`** | `{ exists, registryDefault, platform }` |
| `browser-store.ts` | 两份文档共用一个 JSON 机制：`browser_config.json`（人能手改）与 `browser_runs.json`（每次启停都写、会自己清账）。形状整套抄 `home-store.ts` | 构造器收显式路径 |
| `browser-system.ts` | 真实世界那一侧：`argvOf()`（纯函数）、`launch()`、`prepareFirefoxProfile()`、探测、`pidOnPort()`/`imageNameOf()`/`killTree()` | 整个模块被注入 |
| `browser-service.ts` | 编排：`list` / `scan` / `save` / `launch` / `stop`，读-改-写队列，`BrowserError`（`:111`） | `BrowserDeps` |

**`BrowserDeps` 没有默认值**，默认实现只在 `src/index.ts:373-377` 造一次。于是**任何测试都不可能意外
走到真 spawn** —— 与 `datasource-probe` 注入 runner、`home-service` 注入 `skillsRoot` 是同一手法。

默认路径：登记 `~/.dsh/yon-panel/browser_config.json`、台账 `browser_runs.json`、profile 根
`<插件根>/.browser-profile`（`browser-store.ts:122,127,140`）。

## 五、为什么不用 harness 的 `subprocess` 服务

`datasource-probe.ts:61-92` 声明的 `RunHandle` / `RunSpawnSpec` 有三处硬不兼容
（`browser-system.ts:10-33` 是同一段话的代码版）：

1. 它的 `stdio` 只声明 `stdout`/`stderr` 的 `maxBytes` 且**要求调用方持续排空**——开一下午的浏览器
   会把缓冲写满并阻塞；
2. **没有 `detached`、没有 `unref`**——子进程留在 DSH 的进程组里，退出 DSH 会把浏览器一起带走，
   正好与调试相反；
3. 它的模型是 `done` + `terminate()` 的**短命**命令。

所以直接 `node:child_process.spawn`——`src/` 里第一次这么做，注释写明，免得后人以为是漏用了框架服务。
配套两条约束：

- `spawn(exe, argv, { detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true, shell: false })`，
  **父进程 spawn 后立刻 `closeSync(logFd)`**：fd 已复制给子进程，不关会留着句柄、抵消 `unref`
  （`browser-system.ts:506-539`）。不用 `stdio: 'ignore'` 是因为启动失败时要能贴出**浏览器自己说的话**。
- **插件的 `dispose()` 只清内存、不杀浏览器**（`src/index.ts:362-372`）。detached 是有意为之：卸载
  插件不该顺手关掉使用者正在调试的浏览器。这个服务也因此**没有 `ctx.effect`**。

## 六、扫描：稳定 id、合并而非替换、只扫一次

| id | family | 候选路径（按优先级） | 注册表 key |
|---|---|---|---|
| `chrome` | chromium | `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe` 等三档 | `chrome.exe` |
| `edge` | chromium | `%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe` 等三档 | `msedge.exe` |
| `chromium` | chromium | `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 等 | `chromium.exe` |
| `firefox` | firefox | `%PROGRAMFILES%\Mozilla Firefox\firefox.exe` 等三档 | `firefox.exe` |

- 注册表兜底：每个 key 依次查 `HKLM\SOFTWARE\...\App Paths\`、`WOW6432Node`、`HKCU`。
  **按 `REG_SZ` 切分取后半段、看退出码判成败**——本机实测默认值名与错误文本都被本地化了，
  匹配 `(Default)` 或英文错误必然会错。
- **去重是必须的，不是防御性代码**：本机实测 `HKLM` 与 `WOW6432Node` 对 `chrome.exe` 返回同一路径。
- **稳定 id 来自候选表，不来自路径** ⇒ 升级/换目录后 id 不变 ⇒ profile 目录跟着 id 存活。
- **「自动扫描」的确切含义**：`list()` 读配置，**从未扫过（无 `scannedAt`）就在这次调用里扫一遍并落盘**
  （`browser-service.ts:457-475`）；此后 `list()` 只对已存路径做一次 `stat`（维护 `pathExists`/`stale`），
  **不再枚举目录、不再查注册表**。这就是「不用每次都查目录」。装了新浏览器点「重新扫描」。
- **扫描是合并，不是全量替换**：这次没命中的已存条目**保留并标 `stale`**，绝不自动删除——删掉就等于
  把它的 profile 变成孤儿。
- **非 Windows**：`scanSupported=false`，扫描返回空 + 一条平台说明；面板**不显示扫描按钮**
  （见 §九）。

## 七、启动：三种返回，不要 `--remote-allow-origins`

```
Chromium:  <exe> --remote-debugging-port=<port> --remote-debugging-address=127.0.0.1
                 --user-data-dir=<profileDir> --no-first-run --no-default-browser-check [url]
Firefox:   <exe> -profile <profileDir> -no-remote -start-debugger-server <port> [url]
```

- **Chromium 的 `--user-data-dir` 是硬性的**：没有它，已运行的实例会吞掉请求、端口根本不生效。
- **Firefox 启动前必须往新 profile 写 `user.js`**（`browser-system.ts:558-568`）：三条 prefs——
  `devtools.debugger.remote-enabled`、`prompt-connection=false`（弹窗会把人不在场的启动卡死）、
  `force-local=true`（Firefox 版的 `--remote-debugging-address`）。已存在的 `user.js` **只追加不重写**。
- **显式绑 `127.0.0.1`**：调试端口没有鉴权，绝不能落到 `0.0.0.0`。实测端口只监听回环。
- **`--remote-allow-origins=*` 默认不传**（`browser-system.ts:268`）：只有「浏览器页面里的客户端去连
  CDP」才需要它，而本面板自己的停止路径用 Node 的 WebSocket、**不发 `Origin`**。实测（Chrome 156 /
  Node v24.16.0）：不开这个开关，`Browser.close` 也在 **229 ms** 内让端口安静下来。开着等于让本机
  任意网页都能连上调试端口执行 JS。

**三种返回，不用「就绪」冒充「成功」**：

| 情况 | HTTP | run |
|---|---|---|
| 端口就绪 | 201 | `ready:true`，Chromium 带 `webSocketDebuggerUrl` 令牌 |
| 进程活着但端口 8 s 没起（`READY_TIMEOUT_MS`） | 201 | `ready:false` + note 指日志路径。**不抛错**——端口慢不等于失败 |
| 进程在窗口内退出 | 400 `launch-failed` | 消息带退出码 + 日志尾部若干行（`LOG_TAIL_LINES`） |

实测：调试端口在 spawn 后 **865 ms** 打开（所以 8 s 是宽裕而不是紧张）。

## 八、停止：认端点身份，不认 PID

```
1. 取台账记录；没有 → not-found。
2. 认身份：chromium 走 GET /json/version，webSocketDebuggerUrl 必须 === 记录里的令牌；
   不等 → stopped:false / method:'none'，绝不动手。firefox 只做 TCP connect（可信度低，如实标 note）。
3. 优雅优先（chromium）：发 {"id":1,"method":"Browser.close"}（globalThis.WebSocket 特性检测），
   等端口停答（GRACEFUL_CLOSE_MS 3 s）→ method:'cdp'。
4. 兜底：netstat 找**此刻监听该端口的 pid** → tasklist 核镜像名 → taskkill /PID <pid> /T /F。
5. 都确认不了 → stopped:false / method:'none'，消息说「无法确认端口上那个还是不是本面板启动的浏览器，
   没有执行结束操作」。**根因未明就说未明，不做猜测性 kill。**
```

实现见 `browser-service.ts:717-799`。要点：

- **PID 不是身份**。`spawn` 返回的 pid 可能只是 Chrome 的 stub（handoff 给已存在的实例后自己退出），
  PID 还会被系统回收。所以第 4 步的 pid 是**此刻**从端口解析出来的，记录里的 pid 只是线索。
- **`method` 随着回执返回**，因为两条路的代价不同：`Browser.close` 让浏览器正常落盘、不触发
  「上次未正常关闭／恢复标签页」；`taskkill /F` 会留下 profile 锁（Chromium 的 `SingletonLock`、
  Firefox 的 `lock`），下次启动可能弹「配置文件夹正在使用中」，Firefox 更差。
- **不做**：不自动收编「端口上有 CDP 但不在台账里」的浏览器——那是别人的实例。
- `list()` 对每条落盘 run 做一次**短超时**确认（`LIVENESS_TIMEOUT_MS` 400 ms），确认不了记
  `unknown`，**不阻塞面板打开**；已退出的**只清账、不杀进程**。

## 九、面板：布局、折线与三次「图上才发现」

形状（`src/client/browser/BrowserManager.tsx`）：`使用哪个浏览器` 下拉 → 扫描出处那一行 →
**有选中行时**该行的可执行文件／端口／启动时打开／用户数据目录（各带一行说明）→ 动作行
（启动／保存／重新扫描）→ 分隔线 → **正在运行**（每行：名字·端口 / 端点 + 复制 / 状态 + 停止，
停止点两次）→ 两个文件的脚注。

动作行与运行区**不在**「选中了某一行」那一支里（批 4 改的，见 §十四）：需要一行的只有该行自己的
字段，「启动/保存」跟着字段走；而「重新扫描」和整个「正在运行」是面板的——登记表读不出来（或这台
机器扫不了）时没有行可选，但实例可能正在跑，那正是最需要看见它们、停掉它们的一屏。

工作区高度由共享表定死（`.body` 的 `min(62vh, 520px)`，`panel.module.css:46`），**所以这一格一屏装不下**。
预览视口 900×820 下量到：正文列 `.detailPane` 可视 450px，而「正在运行」那一屏内容 826px ⇒
**376px 在折线以下**（`node preview/shots.mjs browser` 的 `scroll 377/826 client=450`）。这不是这一格独有
的问题（数据源表单 552/450、wiki 654/450 都是同一形状，见 `panel.module.css:570-579`），但它是**这一格
唯一要看的东西在折线以下**。

同一批量出来的第二件事：动作行**自己**也在折线边上。它上面那一摞（说明、选择器、标题、表单）在
450px 的窗格里占到 437px，于是 28px 高的按钮行有 **15px 落在窗格外**——实测（改动前的运行中那一页）
`actions@top 437..465 pane=450`，而窗格只有 450。这一屏是**每次打开面板都会看到的第一眼**，所以
给它上了这一格自己的粘底：`.actionsDock`（`src/client/browser/panel.module.css`），只声明这一格
独有的类名，五条声明与共享表那条「动作行粘底」（`panel.module.css:609`）逐字相同，差别只在选择器——
共享表那条要求 `:last-child`，而这一格的动作行下面还有分隔线、运行列表和两行脚注。
改后同一处探针读到 `actions@top 405..450`：整行贴着窗格下沿，代价是滚到顶时盖住表单最后 28px，
滚过那 15px 就归位。**空态不上这个 dock**：那里动作行只有一颗「重新扫描」、内容也短，粘底只会多出
一道白发线。

三处改动是**先出图、看图才发现的**，记在这里因为它们是「预览这一层」的价值证明：

| 现象（图上） | 根因 | 改动 |
|---|---|---|
| 「停止」被挤成两个字竖排的红块 | 行的第一行要装名字＋端口＋状态＋时间戳，而停止按钮可收缩（默认 `flex-shrink:1`） | `.runButton { flex: none; white-space: nowrap }`；端点另起一行（`flex: 1 0 100%`），不再在 `/json/version`、`tcp://…:9230` 中间断字 |
| 「没有可用的浏览器」的空态叫使用者去点「重新扫描」，而那颗按钮不在页面上 | 动作行嵌在「选中了某一行」那一支里，空列表走的是另一支 | 抽出 `rescanButton()`，两处共用（`BrowserManager.tsx:393-400`、`:483`、`:577`） |
| 非 Windows 上同样的话术 + 一颗按不动的按钮 | 同上，且扫描真的不支持 | `facts.scanSupported` 为假时**不渲染**扫描按钮，空态那句提示也一并撤掉 |

## 十、预览：八张图，与「滚到底」那段脚本

`preview/fixtures/browser.ts` 摆的是这一屏**每一种状态**，图上各出一页（默认那一页是表单态）：

| 页 | 说什么 |
|---|---|
| `panel-browser{,-dark}` | 表单态：两族同时在（`chromium` 小字才看得出不是装饰）、一条 `pathExists:false` 的登记（下拉里带「路径已失效」、启动禁用） |
| `panel-browser-unscanned-light` | 非 Windows 第一次打开：宿主那句平台说明在页面上，且**没有**扫描按钮、**没有**那句「还没扫过」 |
| `panel-browser-empty-light` | 扫过了、一台都没有：与上一屏版面一样、只差文字，所以两页成对看 |
| `panel-browser-unreadable-light` | 登记文件坏了：说的是文件坏了，不是这台机器没装 |
| `panel-browser-running-light` | 两个实例的两种行：一个答得上话（可复制的 http 端点），一个问不出来（Firefox 的 tcp 端点 + 探针超时 + note） |
| `panel-browser-running-norow-light` | **实例在跑、登记表却读不出来**（批 4 修掉的那个洞的现场证据）：下拉是空的、说明是文件坏了，而下面照样列出实例、照样能停 |
| `panel-browser-stopask` | 停止的第二次询问（页是点开后再落盘的，与迭代表板的删除确认同一做法） |

`alive:'gone'` **不摆**：宿主在 `list()` 里把已退出的记录清账，那个取值永远不会出现在面板拿到的
payload 里。画一个宿主不会给的状态，等于给「看着图做的判断」留一个假证据。

这两页要点的是「折线以下」那段（`page()` 的第 5 个参数，`render.spec.tsx` 的 `SCROLL_TO_BOTTOM`）：
预览页里跑一句 `scrollTop = 1e6`，**真滚**而不是把下面的节点抠出来贴到上面，并把
`scrollTop/scrollHeight/clientHeight` 打进 PROBE 行——**没滚上**（选择器写错、这一页没有滚动区）
在图上和「滚到底了」长得一样，只有这个数能分辨。实测输出：
`scroll 377/826 client=450`（运行中）、`scroll 403/852 client=450`（停止确认）。

批 4 又加了第二条探针 `actionsAt(tag)`：动作行在窗格里落在哪一段（相对滚动区顶，负数=滚出上沿），
可以配着 `SCROLL_TO_BOTTOM` 前后各跑一次。**粘底这类改动只能靠它判**——滚到顶时按钮被窗格下沿切掉
在图上只有 15px，而"看着像没切"。默认页的那条探针写在 `Panel.probe` 上（默认页由循环生成，没有
调用处可写），量到的就是每次打开面板第一眼的那个数。实测：改前运行中那一页 `actions@top 437..465`
（窗格 450），改后 `actions@top 405..450`、滚到底 `actions@bottom 60..105`。

## 十一、验证（2026-10-04）

- 门禁：`npm run typecheck` 干净；全量 `npx vitest run` **50 文件 / 699 用例全绿**（批 4 加了一条，
  改之前它是红的）；`npm run build` 出 `lib/client.js` 453.43 kB；`npm run verify` 通过；
  预览套件 **71 用例全绿**、`node preview/shots.mjs browser` 出 8 页。
- **活体（真机 win32）**：面板第八格出现 → 扫描列出 Chrome 与 Edge（注册表与候选路径同一路径，
  去重生效）→ 存下端口 9222 → 启动 Edge → `curl http://127.0.0.1:9222/json/version` 有应答
  （`Edg/154.0.4258.37`，带 `webSocketDebuggerUrl`）→ `netstat -ano` 看到 `127.0.0.1:9222 …
  LISTENING 57104` → **另一个进程**读台账后停掉它，回执 `{"removed":true,"stopped":true,"method":"cdp"}`
  → curl 退出码 7、端口消失、PID 消失。运行留下的 59 MB profile 与临时脚本已清理。
- 三条实测结论：`--remote-allow-origins` **不需要**（CDP 关掉成功）；端口只绑回环；
  `browser-launch.log` 里确实有浏览器自己那行 DevTools 输出。
- **发布物门禁**（`scripts/verify-artifact.mjs`）：`package.json` 的 `files` 白名单里**任何 pattern
  都不得覆盖 `.browser-profile/`**，断言按路径探、不按文件存不存在探。探针里**故意带一个去掉点的
  孪生路径**：glob 的 `**` 不下钻点开头的段（node v24.16.0 实测：`**/*` 匹配 `browser-profile/x`
  而不匹配 `.browser-profile/x`），只问带点的路径会漏掉「将来有人把白名单写成 `**/*`」这个**正是这条
  门禁要拦**的失败。这条断言当场验过红：临时往 `files` 加 `"**/*"`，它报
  `files pattern "**/*" covers browser-profile/chrome/Default/Cookies`，且**只**被孪生路径抓到。

## 十二、Firefox：按文档实现，**未实测**

本机**没装 Firefox**，所以下面这些一条都没在真机上跑过，交付时按「未验证」计：

1. `-start-debugger-server` 是否接受内联端口；
2. 新 profile 写完 `user.js`（§七三条 prefs）后调试器是否真的监听；
3. `-no-remote` 在这个版本是否仍可用（若已废弃应改 `-new-instance`）；
4. Firefox 的 tcp 端点**没有**身份令牌，所以 §八 第 2 步对它只能给出低可信度的判断——这一点在
   代码里是如实标注的（`alive:'unknown'` + note），不是忽略；
5. Firefox 的 profile 锁被 `taskkill /F` 留下后，下次启动的实际表现。

`scanBrowsers` 对 Firefox 的候选路径与注册表 key 与其他三款同构，未装时表现为「扫不到」，
这一条不需要 Firefox 在场也能验证（已由单元测试覆盖）。

## 十三、明确不做

- **模型侧工具**：启停本机进程属于高影响动作，交给模型会扩大审批面，而使用者的需求（下拉、扫描、
  按钮）是纯面板的。所以 `src/host/prompt.ts` 的「能力分十一组」不动。
- **手工指定 exe 路径的 UI**：配置文件本身是手可编辑的 JSON，面板显示它的路径；UI 只允许改
  **已扫到那一行**的 path。
- **版本探测**：每次扫描都 spawn 一次 `--version`，不值。
- **CDP 客户端本身**：面板只负责把浏览器起起来并报出连接地址，接管交给外部（Playwright / Agent）。
- **非 Windows 的扫描**：明确声明不支持，不假装（面板上那句平台说明就是这件事）。
- **`--remote-allow-origins=*`**：见 §七。

## 十四、缺陷与代价（批 3 记录，批 4 修掉前两条）

### 批 4 已修

1. **没有选中行时，「正在运行」整段不渲染。** 运行区原在「选中了某一行」那一支里
   （`BrowserManager.tsx:466-649`，运行区从 `:582` 起），而 `current === undefined` 的三种情形是：
   登记表为空、正在读、选中的 id 不在列表里。后两种短暂，**第一种是稳定状态**——非 Windows 上永远
   如此，登记文件坏掉时也如此。后果：那时**看不见也停不掉**正在跑的实例。
   改法：只把**该行自己的字段**留在分支里（`{current === undefined ? … : <>标题/表单</>}`，判定写在
   `current` 一个变量上，另一支才被窄化成一行），动作行、`<hr>`、运行区提到 `.detailPane` 的直接
   子节点；空态块的条件因此收成「没有行**且**没有实例」，否则有实例没行时大空态插图会和运行列表同屏。
   证据：`tests/browser-manager.client.spec.tsx` 新增用例「lists and can stop a running instance with no
   registration selected」**改之前是红的**（`Unable to find an element with the text:
   http://127.0.0.1:9222/json/version`，13 passed / 1 failed），改后 14/14；预览新增一页
   `panel-browser-running-norow`。若按最初设想的"两个条件一起写在三元里"会编译不过——
   `current === undefined && runs.length === 0` 为假推不出 `current` 有值（TS18048，四处）。
2. **动作行在折线上被切。** 见 §九末段：改前 `actions@top 437..465`（窗格 450，28px 的行有 15px 在界外），
   改后 `405..450`。做法是这一格自己的 `.actionsDock`，不是把共享表的 `:last-child` 放宽——那条规则的
   注释把 `:last-child` 当作**前提**在陈述（"a row that ends the pane's content"），而这一格的行不满足它。
   **残留**：粘底只钉下沿。实例多到内容超过 ~915px（约四个）时，滚到下面动作行会从上沿滚出视野，
   而 `top: 0` 那一侧的粘法要跟它抢同一块位置（两者不能同时生效），代价是滚起来时盖住选择器与表单。
   这一档没有实测数据支持（本机同时只跑得起一两个），所以不动，留在这里等有数据再说。
### 仍未修

3. **升级即丢登录态。** 默认 profile 在插件根目录下，`npm`/`dsh` 重装插件会替换整个包目录，
   profile（含 cookie）随之消失。这是使用者指定的位置所付的代价，面板的 hint 与 README 都写明了。
   两条出路（都没做）：换默认位置到 `~/.dsh/yon-panel/browser-profiles/<id>/`（一处默认值，但与
   使用者的口径相反），或加一颗「搬到 DSH 数据目录」按钮（要新增一条宿主路由 + 一组测试）。
4. **`resources/knowledge/` 随包发布**（`files` 白名单里的 `resources/**/*`，427 个文件）。那是本仓
   另一条线的东西，与本面板无关，但同属「发布物里有什么」，记在这里免得两处各查一遍。
