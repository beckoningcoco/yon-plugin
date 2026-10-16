# 运行时调试面板（arthas）：设计记录

> 这份文档记录**为什么这样设计**、**支撑它的实测数字**，以及**它现在还不成立的地方**，不是接口手册。
> 代码在 `src/host/arthas-{store,fetch,targets,http,errors,service,tools}.ts` 与
> `src/host/replay-{service,tools}.ts`，用法在各自的 JSDoc 里；面板在 `src/client/arthas/`
> （`ArthasManager` 是页签 A「观测」，`ReplayView` 是页签 B「现场重放」）。
> **P0 / P1 / P2 都已在本机 NCC 1909 上实测跑通**。落盘不用任何助手类、离线端只用一个
> 预编译的 `Replay.class` —— 两条都是被实测推翻原设计之后的写法，理由见第六节。
>
> 记录日期 2026-10-15。**本文件里的每一个技术结论都来自当天对一台真实 NCC 1909 开发机的实测**
> （Arthas 4.3.5 / JDK 1.8.0_202 / Tomcat / Windows），凡是没有实测的都标了「未验证」。

## 一、要解决的问题

使用者的原话是「让 AI 能够自行 DEBUG 代码，观察变量、结果」。

真正的瓶颈不是「能不能拿到变量」，而是**一次「猜想 → 验证」要多久**。人类调试靠 IDE 打断点，
一次暂停几秒钟；AI 如果用同样的路子（改一行代码 → 重启 NCC → 点页面 → 看日志），
一轮要好几分钟。**所以这套东西的全部设计都围绕一个指标：反馈回路长度。**

按这个指标，能力分四层，成本与收益差别很大：

| 层 | 能力 | 回路 | 解决什么 |
|---|---|---|---|
| **L1** | 黑盒：抓 HTTP / 查库 / 读日志 | 秒~分 | 「点了没反应」 |
| **L2** | 运行态观测：watch / trace / jad | 秒 | 「变量是什么、走到哪了」 |
| **L3** | **现场重放**：dump 运行中的对象 → 离线跑真实代码 | **秒，且可无限重试** | 「改完逻辑怎么快速验」 |
| **L4** | 在线改写：redefine 热替换 | 秒 | 不想重启（风险高） |

**本面板做 L2 + L3。** 只做 L2 的话，拿到了现场却仍然「每改一次要重启」，痛点还在；
只做 L3 的话，没有现场数据可用。两者是**供货**与**消费**的关系。

### 一个决定形态的洞察

**「观测」和「触发」必须是两件事。**

实测中最顺的一次工作流是：`挂 watch` → `点按钮`（用 browser 面板的工具）→ `读结果`。
触发用的是浏览器工具，观测用的是 Arthas，两者独立。所以本面板**只出原语，不做「一键调试」的黑盒**——
一个封装好的流程会把「AI 自己组合工具设计实验」的能力封掉，而那恰恰是它比脚本强的地方。

## 二、口径（使用者逐条选定，不再讨论）

| # | 决策 | 取值 |
|---|---|---|
| 1 | 现场重放（L3） | **做**。它不是 Arthas 的附属，是独立模块 |
| 2 | Arthas 来源 | **默认自动下载**到插件数据目录；同时允许像 `ncc_home` 那样登记外部路径 |
| 3 | `redefine` | **默认禁用**；面板上可解锁；解锁后每次调用在事件流里**高亮留痕** |
| 4 | 面板定位 | 审计与操作**都要，审计优先** |
| 5 | 优先级 | **先工具 + Skill**（AI 能用是最大增量），面板跟上 |

第 4 条是安全要求而不是偏好：`ognl` 等于**任意代码执行**，AI 在服务上执行了什么，人必须一眼看得见。

## 三、实测：接入通道一共四条，三条不可用

Arthas 4.3.5 的 boot jar 从 `arthas.aliyun.com` 可直连下载（148,033 字节），解压到 `~/.arthas/lib/4.3.5/`。
用**目标 Home 自带的 JDK 8** 启动它 attach（JDK 8 attach 依赖 `ufjdk/lib/tools.jar`，这里存在）。
attach 后 agent 常驻，监听 `3658`（telnet）与 `8563`（http）。

| 通道 | 实测结果 | 定性 |
|---|---|---|
| `POST /api` `{"action":"exec"}` **短命令** | ✅ 立即返回结构化 JSON | **短命令首选** |
| `POST /api` **长命令（watch）** | ✅ **请求挂住 → 命中时返回结构化结果** | **长观测就用它** |
| `GET /api` | ❌ `{"message":"Unsupported http method: GET","state":"REFUSED"}` | 无此路 |
| `{"action":"pull"}` | ❌ `{"message":"unknown action: pull","state":"FAILED"}` | 无此路 |
| 裸 socket 连 3658 | ❌ 收到的是 telnet 协商字节，不是纯文本 | 不值得实现协议 |
| websocket（`NettyWebsocketTtyBootstrap`） | 未验证 | 既然 HTTP 够用，不走这条 |
| 后台托管 `arthas-boot.jar -f` 子进程 | ✅ 可行（8 月那轮就是这么做的） | **降级为备选** |

`{"action":"init_session"}` 确实可用（返回 `consumerId` + `sessionId`），但**没有实际用途**——
每次 `exec` 都会返回它自己的 `sessionId`。第一次探到它时曾以为异步协议是
`init_session → exec → 拉取`，实测否定了这个猜测。

### 结论：整个面板只需要一个 HTTP 客户端

原本担心 HTTP API 不支持异步，准备了「插件托管一个后台 JVM 进程、输出重定向到文件」的退路。

**实测发现：`exec` 确实是同步的 —— 但「同步」恰好就是我们需要的异步，只要不设超时。**

插件挂一个不设超时的 `fetch`，请求就一直挂着，直到 watch 命中，一次性返回完整结果。
于是 **websocket、telnet 协议实现、后台 JVM 进程、session 管理，全都不需要了**，
实现复杂度和故障面同时下降。这是本次验证最大的收获。

## 四、实测：HTTP API 的响应结构与四个实现要点

一次 watch 命中后的完整响应（真实抓取，省略时间戳细节）：

```json
{"body":{
   "command":"watch nc.impl.epmp.bgr.BgrReportSyncServiceImpl buildReportJson '{...}' -n 1",
   "jobId":17,"jobStatus":"TERMINATED","timeExpired":false,
   "results":[
     {"type":"enhancer","success":true,"effect":{"classCount":1,"methodCount":1,"listenerId":5}},
     {"type":"watch","className":"nc.impl.epmp.bgr.BgrReportSyncServiceImpl",
      "methodName":"buildReportJson","accessPoint":"AtExit","cost":0.5684,
      "ts":"2026-10-15 18:37:28.421","value":"@ArrayList[\n @String[DUMP_OK ...385480],\n]"},
     {"type":"status","statusCode":0}
   ]},
 "sessionId":"052f44d6-...","state":"SUCCEEDED"}
```

**结果天生是结构化的**（`type` ∈ `enhancer`/`watch`/`status`/`reset`），
面板可以直接表格化，**不需要解析文本**。这是选 HTTP API 而不是子进程的第二个理由。

**必须写进实现、否则会踩的点。第一条最容易被忽略，而且 P0 的第一版实现真的踩了：**

1. **`state: "SUCCEEDED"` 不代表命令成功。** 实测三种失败**全部**返回 `SUCCEEDED`：
   watch 一个不存在的方法、`ognl` 加载不到类、`sc -d` 查一个不存在的类。
   `state` 说的是**这个请求被处理了**，不是命令把活干成了。
   命令成没成要看 **`status.statusCode`**（0 成功 / -1 失败；原因在 `status.message` 里，
   而且**带 ANSI 颜色转义**，渲染前必须剥掉），以及 **`enhancer.success`**。
   只看 `state` 的后果非常具体：**「观测挂上了、只是还没命中」和「观测压根没挂上」会长得一模一样。**

2. **`results[].type=="enhancer"` 是「注册成功」的凭据**（含 `classCount`/`methodCount`/`success`），
   但它和 watch 事件在**同一个响应**里返回——也就是说，**插件无法在「挂起阶段」确认注册成功**。
   这决定了 AI 的正确姿势是「挂上 → 触发 → 读结果」，**不能**「挂上 → 检查是否成功」。
   注意 `success: false` 时 `classCount` 仍可能是 1（那是"考察了几个类"，不是"增强成功几个"），
   **绝不能单看 `classCount` 判断注册成功**。

3. **`exec` 是原子的，没有增量。** 一个 `watch -n 5` 不会一条条吐：HTTP 请求一直挂到
   5 次命中全部发生，然后一次性返回全部结果。所以 **`arthas_events` 不是「轮询事件流」，
   而是「等命令结束、取回全部结果」**。这与"面板秒级刷新事件流"的设想有冲突，见第十一节。

4. **`reset` 才是清理手段，不是 `stop`**。`stop` 会卸载整个 agent（`8563` 也随之消失）。
   实测连续三次 `reset <类>` 得到 `classCount` = **1 → 1 → 0**，说明**增强会残留，
   要 reset 到 `classCount == 0` 才算干净**。所以 `arthas_watch_stop` 内部应当循环 reset 到归零，
   而不是发一次就完。

   **HTTP 上的形状是 `{"type":"reset","affect":{"classCount":N,…}}`** ——
   注意是 `reset.affect.classCount`，**不是** `enhancer.effect.classCount`。
   本节原先按后者写，P0 实测纠正。这条错得有害：「循环 reset 到归零」的终止条件是读这个数，
   读错字段会读回 undefined，而 undefined 很容易被当成"已经干净了"，于是增强留着、还报告清完了。

5. **`java.*` 默认不可增强**：watch `java.lang.String` 报
   `No class or method is affected`，提示里给了解法 `options unsafe true`。这是给 AI 的排错提示。

6. **`exec` 的 `action` 是必填**，缺了报 `'action' is required`；写错报 `unknown action: <x>`
   （但不会列出合法值）。首次接入的探测顺序就靠这两条反馈。
   非法命令行返回 `state: "FAILED"` 且**整个响应没有 `body`**，原因在顶层 `message` 里
   （如 `Exec command failed:java.lang.IllegalArgumentException: nosuchcommand: command not found`）。

7. **`sc -d` 查不到类不报错。** 返回 `SUCCEEDED`，`results` 里只有
   `{"type":"row_affect","rowCount":0}` + `{"type":"status","statusCode":0}`。
   「这个类不存在」要从**没有 `sc` 结果**判断，不能等一个错误——它不会来。

8. **一个 agent 端口只属于一个 JVM。** agent 是 attach 到目标进程**内部**的，
   所以 `8563` 是全局端口：同一台机器同一时刻只有一个进程持有它。
   **不要靠「端口通不通」判断某个 PID 挂没挂 agent。** P0 的第一版就是这么写的，于是实测
   **机器上每个 JVM 都被标成「已挂载」** —— Eclipse、两个语言服务器、NCC，四个全绿。

   显示错只是表面。`arthas_exec(pid=<Eclipse 的 PID>)` 会**真的**把命令打到持有端口的那个
   agent（NCC）上，并把它返回的结果当成 Eclipse 的 —— 输出里没有任何痕迹。
   一个模型会因此读到 A 进程的变量、归因给 B 进程。这是这套工具里**最危险**的一类错误：
   它不是失败，是一个看着笃定的错答案。

   **修法不是猜得更准，而是问 agent 自己：**

   ```
   ognl '@java.lang.management.ManagementFactory@getRuntimeMXBean().getName()'
   → @String[45076@Zhang]
   ```

   这是唯一知道答案的地方（HTTP 响应里没有 PID 字段），而且它只用 JDK 类，
   默认 SystemClassLoader 就能解析，不需要 `-c`。
   拿到 PID 之后，**每个命令执行前校验**，不匹配就拒绝，而不是重定向。

9. **attach 要用目标进程自己的 JDK，不是「手边第一个」。** 实测这台机器上
   「已登记 Home 列表的第一个」是**另一个项目**的 ufjdk（`NCC2312\tianjiu\biphome_...`），
   拿它去 attach NCC 1909 的进程，主版本和 `lib/tools.jar` 都可能不对。
   正确来源是目标的 `-Dnc.server.location=` → `<HOME>/ufjdk/bin`，
   也就是 `arthas_targets` 已经在用的那个标记。

## 五、classloader hash：NCC 场景最硬的坑

同一个类名，在 NCC 进程里可能由不同加载器持有。实测：

```
sc -d nc.impl.epmp.bgr.BgrReportSyncServiceImpl
  code-source       /E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin/
  class-loader      +-java.net.URLClassLoader@7c29daf3
  classLoaderHash   7c29daf3
```

上面是**控制台**的样子；**HTTP 上它是结构化的，不必解析文本**（P0 实测）：

```json
{"type":"sc","detailed":true,"jobId":21,"segment":0,
 "classInfo":{"classInfo":"nc.impl.epmp.bgr.BgrReportSyncServiceImpl",
   "classLoaderHash":"7c29daf3",
   "classloader":["java.net.URLClassLoader@7c29daf3","sun.misc.Launcher$AppClassLoader@18b4aac2", "…"],
   "codeSource":"/E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin/", "…":"…"}}
```

一个实现细节：`codeSource` **带前导斜杠**（它是 file URL 的 path 部分，`/E:/…`），
而且**以分隔符结尾** —— 当 Windows 路径用之前两样都要去掉。`arthas-targets.ts`
的 `normaliseCodeSource()` 干的就是这件事。

**`ognl` 默认用 SystemClassLoader，加载不到业务类**，报
`ClassNotFoundException: Unable to resolve class`。必须显式指定：

```
ognl -c 7c29daf3 '@aidebug.DebugDump@saveText("hi","smoke")'
```

`watch` 用的是**被增强类的**加载器，所以 watch 通常不需要 `-c`，**ognl 需要**。

设计后果：

- `arthas-targets` 缓存 `pid → {应用名, 端口, JDK, 已探到的 hash}`
- **按类名查 hash，不按进程查一个**——一个 JVM 里可能同时有业务加载器与 webapp 加载器
- `arthas_sc` / `arthas_watch_start` 内部先查缓存、没有就先跑一次 `sc -d` 再执行
- **AI 永远只传类名**

这是**纯收益的封装**：把踩过的坑变成以后不用踩。

### 顺带发现的两个部署事实

**认 NCC 进程只能靠 `-Dnc.server.location=`，不能认主类。** 实测这台机器上它是
`com.yonyou.studio.udt.launching.Launcher`（UAP Studio 的启动器），**不是** Tomcat、
也不是 NC 的某个 Bootstrap 类 —— 按主类匹配会一个进程都找不到。`jps -lv` 输出里带
`-Dnc.server.location=<HOME>` 的那一行就是目标；`arthas_targets` 据此标注 `kind: ncc`。

`code-source` 指向 `/E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin/`——
**服务真正加载的是 UAP Studio 工程的编译输出目录，不是 `HOME/modules/<mod>/META-INF/classes/`。**
此前那套「手工 javac 再拷进 HOME」的做法在类这条线上是多余的（HOME 里那份同名类排在 `bin/` 之后，是死的）。

**别把这条读成「投放到 `bin/` 就能在 watch 表达式里用」**：`bin/` 属于业务加载器，
而 watch 表达式的 OGNL 走**系统**加载器，看不到它 —— 这是第六节那场失败的直接原因。

| 改动类型 | 真正生效的落点 |
|---|---|
| Java 类（Service / Action） | **工程的 `bin/`** ← Eclipse 编译即可 |
| upm / action xml / authorize xml | `HOME` 下对应目录（容器启动时扫描） |

## 六、现场重放（L3）：manifest classpath 与反射调用

现场重放要解决的是「把运行中的对象搬到离线来，用**真实的**那段代码再跑一遍」。

工作流三步：**捕获 → 离线反序列化 → 反射调用真实方法**。

### 捕获：**不能用**落盘助手类，只能用 JDK 类

原设计是「`watch` 表达式里调一个落盘助手，把对象序列化到磁盘」：

```
watch ... buildReportJson '{@aidebug.DebugDump@save(params[0], "cellsmodel")}' -n 1
```

**P0 实测证明这条路走不通**，原因是一个很容易漏掉的 classloader 事实：

> **`watch` 表达式的 OGNL 求值走的是系统类加载器**，而承载工程 `bin/` 的那个业务加载器
> 是它的**子**加载器 —— 父看不到子的类。

三组实验把它钉死了：`{@java.lang.String@valueOf(returnObj)}` **成功**（JDK 类）；
`returnObj` 本身**可读**；而任何引用 `aidebug.DebugDump*` 的表达式都以
`watch failed … java.lang.NullPointerException` 收场 —— 静态引用解析成 null，
再在 null 上调用方法就是 NPE。

`-c <hash>` **帮不上忙**：那个选项决定*增强哪个加载器里的类*，不决定*用哪个加载器求值表达式*
（`-c` 放在表达式前、后都试过，同样 NPE）。

「投放到系统加载器看得见的地方」是另一条候选，而且**技术上可行**：
`classloader -c <app> -u` 显示 NCC 启动后用反射往 AppClassLoader 里加了一大批
`modules/<mod>/META-INF/classes/` 目录 —— 所以 `java.class.path` 只有
`…/eclipse/uaplauncher.jar` 一项是个**假象**，我一度被它误导。但仍然否决了这条：
它要求往使用者的**安装目录**里写文件，而 JVM 从不重载已加载的类，投进去的名字用一次就废。

> 顺带纠正一条更早的结论。第一版实现用**固定类名**投放，踩到了「覆盖 `.class` 文件 ≠ 替换类」：
> 那个 JVM 上一轮已加载过旧签名的 `DebugDump`，覆盖磁盘文件毫无作用，调用报
> `NoSuchMethodException: saveText(String, String, String)`。
> 当时的修法是**预编译 8 个同类不同名的助手**、投放前挑一个没被加载过的
> （实测选中 `DebugDump2`，调用成功）。**这个修法现在是废案** —— 不是因为它错，
> 而是因为整条助手路线在这台机器上不成立。8 个 class 已从包中删除。

**真正可用的写法：整个落盘就是一条 OGNL 表达式，只用 `java.io`。**

```text
{(#d=new java.io.File("<dir>"),#d.mkdirs(),
  #f=new java.io.FileOutputStream("<file>"),
  #o=new java.io.ObjectOutputStream(#f),
  #o.writeObject(returnObj),
  #o.flush(),#o.close(),
  "DUMP_OK <file>")}
```

外层 `{…}` 是 Arthas 的表达式列表，括号里的逗号序列被当作**一个**元素求值。
实测返回 `@ArrayList[ @String[DUMP_OK-PURE-JDK] ]`，磁盘上出现一个**真实的 26 字节 `.ser`**；
随后 `arthas_capture` 工具层用同一形状的表达式跑通（见 `tests/arthas-live.spec.ts`）。

比投放类**严格更好**：不往使用者的安装目录写任何东西、没有类名会被消耗、
表达式自己说清了它干了什么。代价有两条，都是真的：表达式又长又难读；
不可序列化的值会在 `writeObject` 里失败（Arthas 把异常名写进会话的失败信息），
并留下一个半截文件。

实测 `com.ufsoft.table.CellsModel` 完全可序列化（`ICellsModel extends java.io.Serializable`），
一份 58×14 的资产负债表落盘 **385,480 字节**。
（这个数字来自更早一轮的手工实验，那一轮走的是 watch 还是带 `-c` 的 `ognl` 已不可考；
`CellsModel` 可序列化这一点与本次改动无关，仍然成立。）

### classpath：唯一真正麻烦的地方

离线端要能加载 NCC 的类，就得复刻它的 classpath。**P2 实施时重新测了一遍**，数字与更早那轮不同
——口径不同，两次都是对的：

| 项 | 早期实测 | P2 实测（2026-10-15） |
|---|---|---|
| 条目 | 3,436（2,854 jar + 580 目录） | **5,481**（`classloader -c` 报的 URL 条数） |
| 拼成命令行 | 71,430 字符 | **519,842 字节** |
| 结果 | `The filename or extension is too long`（Windows 上限 ~32K） | 同上 |
| JDK 8 的 `@argfile` | 不支持（JDK 9+ 才有） | 同 |
| 解法 | manifest-only jar | manifest-only jar，**59,596 字节** |

**classpath 必须从运行中的 JVM 拿，不能猜目录** —— 而且 `java.class.path` 这个系统属性**会骗人**：
实测它只有 `…/eclipse/uaplauncher.jar` 一项，而 `classloader -c <appHash>` 显示 NCC 启动后用
**反射**往 AppClassLoader 里加了一大批 `modules/<mod>/META-INF/classes/` 目录。
工具走的是后者，这也是为什么 `replay_prepare` 要的是**一个类名**而不是一个 Home：
它得先 `sc -d` 拿到加载器，再问那个加载器要 URL。

### manifest 折行：两个静默的坑

这两条都是 P2 实施时踩出来的，**症状一模一样** —— 一个指着明明在盘上的类说
`ClassNotFoundException`：

1. **一行不得超过 72 字节，续行标记也算在内。** 这里的 URL 本身就有 150 字节，
   所以「一行一个条目」不成立，得按**字节预算**切。
2. **折行落在条目的分隔空格上，那个空格会被续行标记吃掉。** manifest 的续行是
   `CRLF` + 一个空格，解析器删掉那个空格 —— 于是 `…/a.jar␍␊␠…/b.jar` 读回来是
   `…/a.jar…/b.jar`，一个哪儿都不存在的路径。

第 2 条决定了一个反直觉的写法：**折行时要把分隔空格收进前一行**，所以字节预算是
**71（首行）/ 70（续行）**，而不是 72/71。

`replay-service.ts` 的 `manifestLines()` 干这件事，`tests/replay-service.spec.ts` 逐个钉住它 ——
其中最有价值的一条是**把行按解析器的规则拼回去、与原值逐字节比对**（5481 条那种规模）。
一个违反规则的 manifest 照样写得出来、照样产出 jar，只在很久以后、别的地方炸，
所以这是整个模块里最值得单独测的一段。

### 反射调用真实方法

```java
Class<?> cls = Class.forName("nc.impl.epmp.bgr.BgrReportSyncServiceImpl");
Object impl = cls.newInstance();
Method m = cls.getDeclaredMethod("buildReportJson", Class.forName("com.ufsoft.table.CellsModel"));
m.setAccessible(true);
Object json = m.invoke(impl, model);
```

**关键点是它调的是真实代码，不是副本**——所以离线结果与线上一致，不存在「两份解析逻辑漂移」。

P2 的实现（`resources/replay/Replay.java`）按**名字 + 参数个数**找方法，而不是按参数类型：
dump 里装的是**值**，不是签名，而签名正是它想避免知道的东西。同名的重载取第一个声明的，
所以结果的头部写明了用的是哪一个 —— 猜错要看得见。

实测一次完整回放：

```
[1] deserialize: cellsmodel_...ser   → colNum=14 rowNum=58
[2] reflect-invoke buildReportJson   → cost = 30 ms
[3] result written: ...result.json (5787 bytes)
== 端到端 wall clock: 4447 ms ==
```

P2 工具链上的一次（`pickParadim`，两个 String 参数）：

```
REPLAY_OK cost=4ms out=...\out\run1.txt
# nc.impl.epmp.bgr.BgrReportSyncServiceImpl#pickParadim/2
# cost=4ms
```

| | 容器内验证一次 | 离线回放 |
|---|---|---|
| 要重启 NCC | 是（扫描 upm） | **否** |
| 要重新取数 | 是（本次实测 1~2 分钟） | **否** |
| 端到端 | 几分钟到十几分钟 | **1 秒上下**（含 JVM 启动；被调方法本身 4 ms） |

### `replay_diff` 才是这个模块的价值所在，而它必须忽略一行

改了算法 → 跑同一个 dump → 对比两次输出。**这就是 AI 的回归测试。**

但**同一个 dump 跑两次，唯一的差异就是 `# cost=Nms` 那一行**（实测）。不排除它，
每一次对比都会报「有差异」—— 而一个总报差异的工具就是没人读的工具，正好把这个模块的
意义反过来。所以 `replay_diff` 明确忽略 cost 头，**并在结果里列出忽略了什么**，
好让「没有差异」是一个可信的答案，而不是一个默认值。

## 七、工具设计

分组命名沿用 `ncc_home_*` 的既有约定（登记 → 返回 id → 其他工具用 id 引用）。

### arthas 组（L2）

```
arthas_env_list       列出已下载 / 已登记的环境（版本、JDK、禁用命令）
arthas_env_add        登记外部 Arthas 目录（形态照 ncc_home）
arthas_env_download   自动下载到插件数据目录
arthas_targets        可 attach 的进程：PID / 应用 / JDK / agent状态 / 端口 / hash
arthas_sc | arthas_sm 定位类 / 方法（自动补 classloader hash）
arthas_jad            反编译「运行中真正加载的那份类」
arthas_exec           通用逃生口：执行任意 Arthas 命令
arthas_watch_start    启动观测会话 → 句柄（HTTP 不设超时）
arthas_events         读事件（结构化，可 wait 最多 N 秒）
arthas_watch_stop     停止会话 + 循环 reset 到 classCount==0
arthas_capture        把观测对象落盘（正常返回时抓一个值，喂离线回放）
arthas_catch          抓**抛异常**的调用：异常 + 入参一起落盘（P3，见第十二节）
arthas_trace          测一个方法的耗时，并把**与上次的对比**留下来（P3，见第十三节）
```

**已实现的是上面这些**；原清单里的 `arthas_sc` 保留了，`arthas_sm` 没做
（`arthas_exec` 跑 `sm` 就够），`arthas_jad` 与 `arthas_detach` 至今没做 ——
反编译当前加载的类还没有真实需求，卸载 agent 则因为 agent 是常驻的、卸了下次还要 attach。

两条设计原则：

1. **不给每个 Arthas 命令包一个工具**（几十个，维护会爆）。`arthas_exec` 兜底，
   专用工具只做**需要额外处理**的事：补 hash、结构化、落盘、会话与 reset 管理。
2. **~~`arthas_capture` 要替 AI 干脏活（自动编译投放 dump 助手类）~~ —— 实测推翻。**
   本轮原本是手工写 `DebugDump.java`、手工 javac、手工丢进 `bin/`，原设想让插件自动完成
   （从 `classloader -c` 拿 classpath → 挑一个可写且会被加载的目录 → 编译投放）。
   **这条路整个不成立**：watch 表达式由 OGNL 通过**系统类加载器**求值，看不见业务加载器里的类，
   任何引用助手的表达式都死在 `NullPointerException`，`-c` 也改不了（第六节实测）。
   现在的落盘是一条纯 `java.io` 的 OGNL —— 脏活是靠**什么都不投**解决的，`resources/arthas/`
   已整个删除。

### replay 组（L3）

```
replay_prepare   为一个工程准备离线环境（classpath manifest jar + Replay 类）
replay_run       对某个 dump 跑回放，输出结果
replay_diff      对比两次回放结果          ← 杀手锏
replay_list      列出 dump 与回放记录
```

## 八、面板：两个页签，审计优先

### 页签 A：Arthas

```
┌ 环境 ─────────────────────────────────────────┐
│ Arthas: [自动下载 ▾] 4.3.5    JDK: [Home ufjdk ▾] │
│ 禁用命令: redefine, stop, shutdown   [解锁]    │
└───────────────────────────────────────────────┘
┌ 目标进程 ─────────────────────────────────────┐
│ PID    应用              端口  agent          │
│ 45076  NCC(ncc1909new)  3658  已挂载  [卸载]   │
└───────────────────────────────────────────────┘
┌ 观测会话 ─────────────────────────────────────┐
│ #1  watch ...buildReportJson   命中 1/1  [停止]│
└───────────────────────────────────────────────┘
┌ 事件流 ────────────────────── [筛选] [导出] ───┐
│ 18:37:28  buildReportJson  0.57ms             │
│   params: CellsModel@...                       │
│   return: {...}                                │
│ ⚠ 18:39:02  ognl  @aidebug.DebugDump@save(...) │ ← 高亮
└───────────────────────────────────────────────┘
```

**审计优先的落点就是最后那个高亮区**：`ognl` / `redefine` 这类调用必须一眼可见。
事件流的数据源是结构化 `results`，直接映射成表格，无需文本解析。

### 页签 B：现场重放

```
dump 列表 │ 一键重放 │ 结果 │ 与上次 diff
```

diff 视图并排显示两次输出差异——**给人看的、可视的回归验证**。

## 九、安全

| 项 | 做法 |
|---|---|
| 危险命令 | 默认 `--disabled-commands` 禁掉 `redefine`/`stop`/`shutdown`，面板可解锁 |
| 解锁后 | 每次调用在事件流里高亮留痕 |
| `ognl` | 全部进审计日志（执行者、时间、目标进程、表达式） |
| 观测会话 | 超时 + 命中次数上限，防止 AI 挂一堆 watch 拖慢服务 |
| agent 可见性 | 面板顶部常驻显示「当前挂了几个 agent」，可一键全卸 |
| 清理 | 会话结束**必须 reset**（见第四节第 2 点），不能指望自动移除 |

## 十、实施分期与验收

| 期 | 内容 | 验收标准 |
|---|---|---|
| **P0** ✅ | `arthas-store` / `env_list` / `env_add` / `env_download` / `targets` / **`attach`** / `exec` / `sc` / `watch_start` / `events` / `watch_stop` / `capture` | **AI 能独立跑完「列进程 → 定位类 → 挂观测 → 读结构化事件 → 落盘」** —— 2026-10-15 在本机 NCC 1909 实测通过 |
| **P1** ✅ | Skill + 面板页签 A（侧栏「运行时调试」：环境 / 目标进程 / 观测会话 / **操作审计**） | 不给提示，AI 也知道该用哪层；人能看到 AI 干了什么 |
| **P2** ✅ | `replay_prepare` / `replay_run` / `replay_diff` / `replay_list` + 面板页签 B | 一次改动 **4 秒**验证完，diff 可视化 |
| **P3** ⏳ | 异常自动捕获 ✅ · 性能基线 ✅ · 配方 ✅ · memory 回流 ✅ | 依次见第十二～十四节 |

**`attach` 是 P0 实施时补进去的。** 原清单只列了 `arthas_detach`，没有对应的挂载工具 ——
而其余每个工具都要求目标 JVM 里**已经有** agent，所以少了它，"AI 独立跑完五步"根本走不到第一步。
它做的事是`java -jar arthas-boot.jar -c "version" <pid>`：attach、执行一条无害命令、退出，
agent 留在目标 JVM 里（插件**不**持有任何常驻子进程）。

**P1 与 P2 各自补了一处原设计没说的事：**

- **P1：会话表从工具里搬进了服务。** 原设计把观测会话当成工具的内部状态，而面板是**第二个读者**——
  它在插件的另一半、走 HTTP。于是 `arthas-service.ts` 成了会话与**审计**的家：一次工具调用记一条，
  命令原文 + 目标 PID + 危险标记。审计同屏而不是收进页签，是设计文档第九节的要求。
- **P2：capture 现在写一个来源侧车**（`xxx.ser.json`：类名 / 方法名 / 表达式 / PID）。
  没有它，回放得由"记得的那个人"重新打一遍类与方法 —— 而那正是离线循环想省掉的东西；
  有了它，面板才能**一键重放**。`xxx` 与 `.ser` 一一对应，缺失是正常情况（旧 capture、
  或手工放进去的文件），此时只是不能一键而已。

## 十一、还不成立的地方

1. **websocket 通道未验证，而「事件流」这件事现在更棘手了。** 原先设想面板轮询
   `arthas_events` 就能秒级刷新事件流 —— **P0 实测否定了它**：`exec` 是原子的（第四节第 3 点），
   请求不结束就没有任何结果可读。所以当前只能做到「挂一次 → 等结果」；
   真正的流式（挂着的同时看到每一次命中）**需要 websocket，而那条通道本次仍未验证**。
   面板页签 A 的事件流因此只能显示"已结束会话的结果"，这是与原始设想的一处已知落差。
2. **不可序列化对象的回放未验证**。`CellsModel` 恰好可序列化；任意的业务 VO 未必。
   备选方案是「转文本/JSON 快照 + 离线重建」，但**重建出来的对象能否喂进真实方法**没试过。
   现在的 capture 是一条纯 `java.io` 的表达式，不可序列化的值会在 `writeObject` 里**直接失败**
   （并留下半截文件），连"降级写文本"都没有 —— 要补就是在表达式里换成
   `java.nio.file.Files.write` 加 `toString()`。
3. **一个进程里的 classloader 拓扑只探到一个**。目前只知道业务类是 `7c29daf3`，
   webapp 侧（`hotwebs/nccloud`）的加载器没探。跨加载器的 watch 会不会有意外，未知。
4. **agent 的 session 超时对长期观测的影响未测**。默认约 30 分钟自毁，
   长观测（比如等用户半小时后操作一次）会不会中途掉，没验过。
   P0 的 `arthas_watch_start` 因此**故意不给 HTTP 请求设超时**，把这个未知留给对端。
5. **只在 Windows + JDK 8 上验证过**。Linux / JDK 11+ 的 NCC 环境未测。
6. **`arthas_capture` 的命令行会随路径与 tag 变长**。落盘逻辑内联在 watch 表达式里，
   一个很长的路径加很长的 tag 会让命令难读；Windows 约 32K 的命令行上限远未触及。
7. **不可序列化值留下的半截文件不会被清理**。`writeObject` 抛异常时文件已经创建，
   目前留在 `work/dump/` 里等人自己发现。
8. **`arthas_attach` 用 `-c "version"` 让启动器执行完即退**，这条路径已在实测中走通
   （agent 起来、8563 可连）；**attach 到非 NCC 的 JVM 已于 P3 实测通过**（一个自建的 `p3.Probe`
   进程，agent 起在 8565）。**重复 attach** 仍未专门验过。顺带验到一条硬的：**agent 的端口是机器级的，
   第二个 JVM 用不了默认端口** —— 启动器自己会拒绝
   （`The telnet port 3658 is used by process 45076 instead of target process …`），而且必须
   http 与 telnet **一起**换：`--telnet-port -1` 不表示关闭，反而让启动器去探测那个端口然后失败。
   `attach` 现在非默认端口会传 `--http-port <n> --telnet-port <n+1>`。
9. **离线回放执行的是真实方法，而这一层没有任何副作用防护。** 这是 P2 最该被知道的一条：
   反射调用的那个方法会干什么，它就干什么 —— 写库、发消息、写文件都拦不住。
   选方法时要挑**纯计算**的那些（`buildJson`、`pickParadim` 这类），
   不要把 `saveRow`、`syncReports` 这种名字里带动作的当作回放目标。
   当前实现里没有白名单、没有沙箱、也没有警告，只有这条注释。
10. **回放普通方法时要求目标有公开无参构造**（`Replay` 用 `newInstance()` 造实例）。多数 Service 有，
    但不是全部；构造需要参数的 Service 目前回放不了。实测的那个类恰好有，所以这条路没被逼出来。
    **构造器捕获不受这条限制** —— P3 实测：在 `nc.vo.pub.lang.UFDouble <init>` 上抓到异常之后，
    回放报 `NoSuchMethodException: <init> with 1 parameter(s)`，因为 `getDeclaredMethods()`
    **根本不返回构造器**。已给 `Replay` 加 `<init>` 分支（`getDeclaredConstructors()` +
    `newInstance(params)`）：走这条不需要实例，也不再要求无参构造。
11. **离线环境是那一刻的 classpath 快照，目标一重启就可能过期。** NCC 重启后模块与
    `bin/` 的内容都可能变，而 jar 里记的还是旧的 URL。`replay_prepare` 会覆盖同名环境，
    所以重跑一次即可 —— 但**没有任何东西会提醒你该重跑了**，这要靠人记得。
    未验证的是：重启后不重新 prepare 会失败成什么样（大概率是 `ClassNotFound` 或加载到旧类）。

## 十二、P3：异常自动捕获（实测）

**做成了什么。** 一次**失败**的调用，事后再也拼不回来：请求没了，日志只留了堆栈。
`arthas_catch` 把现场留下 —— 异常**和**导致它的入参，都在目标 JVM 里直接写盘。
入参是以 `params` 原样写出去的，而 `params` 正是 `Replay` 当作参数列表的那个形状
（`captured instanceof Object[]` → 参数列表，否则单个参数），所以一次线上失败可以离线重跑。
这就是它与 `arthas_capture` 的分界：capture 抓「进入方法的一个值」，catch 抓「一个方法为什么失败」。

**端到端实测**（本机 JDK 1.8.0_202，一个**自带异常**的实验 JVM；顺带补上了 P0 欠的
「attach 到非 NCC 的 JVM」那笔账，见第十一节第 8 条）：

```
watch p3.Probe boom '{…纯 java.io：写 thrown.ser + args.ser…}' -e -n 1
  → AtExceptionExit  @ArrayList[ @IllegalStateException[probe-boom-226] ]
  → fixedname.thrown.ser 781 字节 / fixedname.args.ser 121 字节
Replay fixedname.args.ser p3.Probe boom out
  → REPLAY_FAIL java.lang.reflect.InvocationTargetException
      caused by java.lang.IllegalStateException: probe-boom-226        （exit 1）
```

线上那次失败，离线复现出**同一个异常**；抓到的字节反序列化回来带完整堆栈（`STACK_DEPTH 2`）。

### 三条被实测改掉的设计

1. **异常变量叫 `throwExp`，不叫 `throw`。** 工具描述原本写 `"{throw}" for an exception`，
   照着写必然失败：`ognl.NoSuchPropertyException: com.taobao.arthas.core.advisor.Advice.throw`
   —— `throw` 是 Java 关键字，Arthas 自己的 `Advice` 上那个字段叫 `throwExp`。
   `{params, throwExp}` 一次命中同时拿到「入参 37」和「它导致的 probe-boom-37」，因果在一个事件里。

2. **OGNL 的 `{(a, b)}` 是「含一个元素的数组」，那个元素是序列的最后一项。**
   于是 `{(写文件…, "DUMP_OK "+#b)}` 里那行 `DUMP_OK` **被求值然后丢掉**，永远到不了事件流 ——
   文件写成功了，路径却看不见（`-x 2`、`-x 3` 都救不回来，也不是长度或深度问题）。
   第一版 `arthas_catch` 正是这么写的，实测才发现。现在**不依赖返回值**：
   `count: 1` 时整个文件名由插件定，路径在挂上之前就报得出来（并顺手写好侧车，面板可一键重放）；
   抓多次时插件定**前缀**、尾巴交给目标 JVM 的时钟（多次命中不互相覆盖），路径靠列 `前缀_*` 取。
   表达式返回的是 `throwExp` 本身 —— 事件流里直接看到是什么错，不用打开 `.ser`。

3. **一个 JVM 里只能有一套 agent 端口。** 实测两次：
   - `--telnet-port -1` **不能**关掉 telnet —— arthas-boot 反而拿它去探测进程，
     死于 `The telnet port -1 is used, but process detection error`；
   - 换端口必须 **http 与 telnet 一起换**，否则启动器自己拒绝：
     `The telnet port 3658 is used by process 45076 instead of target process 39492`。
   现在传 `--http-port <n> --telnet-port <n+1>`，**默认端口那条路一个字节没动**（P0 验过的不动）。

### 在真 NCC 上又验了一遍（NCC 1909 / PID 45076）

自建 JVM 只能证明机制，证明不了它在一个真实业务加载器里也成立。所以又在 NCC 上跑了一次，
靶子选的是**构造器** —— 值对象的解析失败是最常见的失败形态之一：

```
arthas_catch pid=45076 className=nc.vo.pub.lang.UFDouble methodName=<init> tag=ncc-ufdouble
  → 观测已注册：classCount=1 methodCount=13
arthas_exec "ognl -c 7c29daf3 'new nc.vo.pub.lang.UFDouble(\"abc2\")'"
  → 命中 1 次 · nc.vo.pub.lang.UFDouble#<init> · AtExceptionExit · 0.3446 ms
     @NumberFormatException[For input string: "abc2"]
  → ncc-ufdouble_….thrown.ser 2758 字节 / .args.ser 51 字节 / 侧车 191 字节
arthas_watch_stop
  → reset 到 classCount=0（2 轮）—— 13 个构造器重载被增强过，必须清
Replay 该 args.ser（classpath 用 P2 那个 59 KB 的 manifest jar）
  → REPLAY_FAIL InvocationTargetException · caused by NumberFormatException: For input string: "abc2"
```

同一份入参、同一个异常，而**离线那一端加载的是 NCC 的真类**
（`nc.vo.pub.lang.UFDouble` 来自 `external/lib/basic.jar`），不是替身。

**两个只有真环境才会撞上的事实：**

- **`java.*` 包默认不能被增强。** 第一版实验想拿 `java.util.UUID.fromString("not-a-uuid")`
  当异常源，`arthas_catch` 挂上之后报的是
  `No class or method is affected … Execute 'options unsafe true', if you want to enhance the
  classes under the java.* package`。**工具如实报出了注册失败**，没有拿
  `state: "SUCCEEDED"` 当成功 —— 这正是 P0 那条修复的价值。要拿 JDK 类当靶子就得开
  `options unsafe`，本插件不开：那等于把整个 `java.*` 交给增强。
- **构造器按 `<init>` 写，而且 `-e` 会同时命中它的所有重载**（这次 `methodCount=13`）。
  增强的规模要心里有数：它动的不是 1 个方法，是 13 个。

### 还没做的

- 落盘值与 `capture` 受同一限制：**必须可序列化**，否则 `writeObject` 失败并留下半截文件。
- 表达式**先写异常、再写入参**：OGNL 没有 try/catch，入参写失败时至少异常还在盘上。
- 抓多次时没有侧车（路径要等命中才知道），所以面板里不能一键重放，要手填类名方法名。
- **没命中的观测会留下孤儿侧车**（只有 `.args.ser.json`，没有 `.ser`）。面板扫的是 `.ser`，
  所以它不会被误列成 dump，但也不会被清理 —— 已记迭代表板。

## 十三、P3：性能基线（实测）

**要回答的问题**：改完一处逻辑，**它变慢了吗**。`replay_run` 回答"还对不对"，这一节回答"快不快"，
而且要能跨会话比较 —— 否则每次都要重新记一个数在脑子里。

### 实测先推翻了两个设计假设

1. **`trace` 的输出本来就是结构化的，不需要解析文本树。** 设计时以为要正则解析
   Arthas 渲染出来的缩进树；实测它给的是结构：

   ```json
   {"type":"trace","root":{"timestamp":"…","threadName":"arthas-command-execute",
     "children":[{"className":"nc.impl.epmp.bgr.BgrReportSyncServiceImpl","methodName":"now",
                  "cost":222900,"times":1,"totalCost":222900,"maxCost":222900}]}}
   ```

   **`root` 是线程，被 trace 的方法在 `root.children` 里**，一次命中一个这样的 result。
   于是"解析"只是取字段。

2. **`cost` 的单位是微秒。** `222900` 对应的是一次约 **222.9 ms** 的调用。
   把它读成毫秒会把每个耗时都说大一千倍 —— 所以 `traceHits` 里的字段直接叫 `costUs`，
   换算是渲染时的事（`msOf`），并且测试里钉了「222900 → 222.900」。

**还有个必须知道的量级问题**：同一个方法**第一次调用明显更慢** —— 实测
`BgrReportSyncServiceImpl#now` 第一发 **222.9 ms**、第二发 **47.8 ms**（冷类、冷缓存）。
所以 `count` 默认给 5 而不是 1：一次采样得到的常常是那个最不该拿来当基准的数。

### 为什么是 `trace` 而不是 `monitor`

`monitor` 给的是同样的统计（调用数 / 平均 RT / 最大 RT），看起来更贴"基线"。但它**不结束** ——
它按 `-c` 周期一直输出，而 `exec` 是原子的（第四节第 3 点）：请求不结束就没有任何结果可读。
`trace -n` 会自己结束。**能用 HTTP 拿到的统计，才是能做成工具的统计。**

### 形状

- **一个方法一个 `.jsonl`**，一次运行追加一行。单文档覆盖式写会让「基线」退化成
  「上次测的数」，而**变化**才是要看的；追加还把历史留住了，坏行也只损失那一行。
- **微秒原样存**。先四舍五入到毫秒，就看不出「慢了 0.4 ms」这类小改动。
- **只与上一行比**，delta 是相对变化；**第一次测量不给 delta**（不是 0，是没有可比的东西）。
- **复用会话表**：`trace` 跑完**增强不会自己撤**（实测：随后 `reset` 报 `classCount=1`），
  而会撤增强的地方只有 `arthas_watch_stop`。所以 trace 也进会话表 —— 可清理、面板可见。
- **超时也把会话交回**：方法没人调用时不能把工具调用挂死；`timeoutMs` 到了就返回，
  trace 仍在跑，`arthas_events` 可以继续读。这就是"长观测"的做法，不需要一个活一小时的调用。

### 真跑两次之后：平均会被离群值带偏

第一次在 NCC 上连测两批（每批 5 次调用）就撞上了这件事：

| 批次 | 各次 (ms) | 平均 | 最小 | 最大 |
|---|---|---|---|---|
| 1 | 207.8, 47.8, 47.6, 49.0, 49.2 | 80.28 | 47.6 | 207.8 |
| 2 | 198.0, 48.6, **156.9**, 49.5, 46.6 | 99.92 | 46.6 | 198.0 |

**代码一行没改，工具报的却是「平均 +24.5%」** —— 第二批只是比第一批多了一个离群值。
而两批的**最小值几乎一样**（47.6 → 46.6 ms），那才是「什么都没发生」的真相：
`now()` 的真实分布是「平时 ~48 ms，偶尔 150~200 ms」。

原设计里只有平均值的对比。现在基线对比**报两个数**：平均，和最小（热态）；
并且当一批里最慢比最快大 2 倍以上时，render 直接说「这批样本波动大，结论优先看最小」。
**一个把噪声报成结论的工具比没有基线更糟** —— 它会让人去优化一段根本没变慢的代码。

这一条是**跑出来**的，不是想出来的；测试用上面这组真实数字把它钉住了
（`keeps a spiky method honest`）。

## 十四、P3：配方与回流

**配方**没有做成工具，做成了文档：`resources/knowledge/ncc/ncc-dev/references/scenarios/运行时调试配方.md`。
理由是配方是**知识**不是 API —— 「什么症状用什么命令、读到什么算哪个结论」这句话一旦变成参数校验，
就只能在写它的人想到的场景里用。工具该提供的是**动作**（watch / catch / trace / capture），
配方提供的是**判断**。两份文档互链：原理与实测在 `运行时调试与现场重放.md`，按症状查的在配方里。

配方里刻意只写**找法**、不写死类名 —— 写具体类名等于把一份会过期的知识伪装成确定的答案。
每条都带三条纪律（用完 reset、观察会拖慢服务、不要用 `ognl` 调有副作用的方法）。

**回流**落在两处：

- `memory_write`：在「首创(NCC1909)」下记了三条 —— 观测能力可用（含起手路径）、
  两个静默失败（`java.*` 挂不上、异常是 `throwExp`）、trace 的三个事实（微秒 / 首调用更慢 / 增强不撤）。
  第一条原本把三件事写在一起，被工具提示超过软上限后**用 `memory_update` 改正并拆开**，
  而不是再写一条与它打架的记忆。
- 迭代表板：这一轮记了三条（`arthas_targets` 的 jps 取自别的项目、孤儿侧车、
  `memory_recall` 带中文 query 返回"没有任何记忆"而库里其实有）。

`requirement_*` 这一轮**没有写**：它是给"用友产品开发需求"用的，而这一轮做的是插件自身的能力，
按约定不建条目。等这套能力用在真实单据问题上时，那些发现才该进条目。
