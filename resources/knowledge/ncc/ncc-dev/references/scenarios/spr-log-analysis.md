# SPR 性能报告分析（NCC）

> **什么时候读我**：用户给来一份 SPR 报告——URL 形如
> `http://<host>:<port>/spr/temp/<用户pk>_<yyyyMMddHHmmss>.html`，
> 或"保存到本地"下来的 `SPR-<业务操作>.html`——然后问「这次操作为什么慢」「哪里慢」「有没有报错」。
> 也用于回答「这个页面慢是不是数据库问题」这类分层定责问题。

> **报告从哪来**：前台录制 SPR 的完整步骤（怎么开录、怎么结束、报告页签怎么认、下载地址怎么拼）
> 在 **`ncc-spr-recording` 技能**里。本文件从"报告已经拿到手"讲起，两篇一前一后，
> **交接物就是那个报告 URL**。

> **先分清边界（最容易走错的一步）**：SPR 是**性能报告**，不是错误日志。
> 它给的是"哪个接口慢、慢在哪一层、发了哪些 SQL、各项耗时多少"。
> **要查异常堆栈请去 NCC 的 `nchome/log` 目录**；SPR 的报错区通常没有 Java 堆栈，
> 拿一个堆栈问题来查 SPR 会扑空。本文件第 4 节讲了它实际有什么。

---

## 一、报告骨架：8 个区，结构固定

| 区 | 内容 | 稳定定位方式 |
| --- | --- | --- |
| Nlink信息 | 项目编码、是否启用用户体验 | `a[name=nlink]` 之后第一张表 |
| 服务器端环境信息 | 机器名 / OS / JDK / jvmmax-total-free-used | `a[name=osmsg]` 之后第一张表 |
| 概要 | **每个业务操作一行总账**（20 列） | `a[name=summary]` 之后第一张表 |
| 耗时分布图 | 后端web / NC / 网络 / 数据库 四块占比 | `#pieCanvas` 的文本 |
| 远程调用 | 逐次调用，第 2 列是 `S E W` 三个链接 | `#listtable1` |
| SQL耗时TOP10 / SQL结果集TOP10 | 全库聚合排名（两个榜**必须分开看**） | `a[name=sqlcosttime]` / `a[name=sqlrownum]` 之后的表 |
| SQL信息 | **全量** SQL 逐条（callid/ts/sql/耗时/结果集） | `#listtable` |
| 报错信息 | 见第 4 节（**不是单纯的错误**） | `a[name=error]` 之后的表 |
| Weblog | 服务端 trace，四类格式 | `a[name=weblog]` 之后的表 |

> **不要硬编码 `document.querySelectorAll('table')[7]` 这类下标**——实测某版本正好是
> `[0]Nlink [1]环境 [2]概要 [3]远程调用 [4]SQL耗时TOP10 [5]SQL结果集TOP10 [6]SQL信息 [7]报错 [8]Weblog`，
> 但下标随版本会变。**按表头文字兜底定位**最稳：
> ```js
> const byHead = (kw) => [...document.querySelectorAll('table')]
>   .find(t => kw.every(k => (t.rows[0]?.innerText||'').includes(k)));
> ```

概要表的 20 列（列名固定，可直接引用）：远程调用次数、服务端耗时、后端web耗时、NC耗时、
中间件耗时、sql耗时、sql数量、读结果集耗时、结果集、上行/下行网络耗时、上行/下行流量、
没有关闭的连接数、事务数、访问master次数、调用NCLocator次数、是否存在错误。

**耗时口径**（写在报告"说明"里）：数据库耗时 = sql耗时 + 读结果集耗时；网络耗时 = 上行 + 下行；
后端web耗时 = 服务端耗时 − nc耗时。

---

## 二、`callid` 是贯穿全报告的关联键 ⭐

这是整份报告唯一的关联手段，也是分析的主线：

- 锚点就是 `<callid>sql` / `<callid>error` / `<callid>web` 三段（`a[name="1791962021141-7085sql"]` …）。
- 远程调用表第 2 列那三个字母 `S E W`，就是穿透到这三段的链接（S=对应调用的 SQL 栈、
  C=客户端日志、E=服务端错误日志、W=weblog）。
- SQL 信息表、报错信息表、Weblog 表**都有 callid 列**，可反查。

**分析动作基本就一种：拿一个 callid，把它的三段全部取出来。**

---

## 三、诊断流程（六步，按序做）

1. **定性** —— 读概要表那一行：服务端耗时 / NC耗时 / sql耗时+读结果集 / 远程调用次数 / 是否错误。
   先判断"是应用算得慢，还是数据库慢"。
2. **分层** —— 读耗时分布图的四个占比：后端web / NC / 网络 / 数据库。
   **NC 高**→ 往应用代码、循环、缓存看；**数据库高**→ 往第 5、6 步走；**网络高**→ 看流量字节。
3. **排序** —— 远程调用表按耗时降序，**前 3 名就是瓶颈候选**。注意表本身支持列排序。
4. **穿透** —— 拿瓶颈 callid 取 `<callid>error`：业务埋点常在这里，能把一次调用切成内部阶段
   （实测 `new TaskDataModel() cost: 1684 ms` 里 `EXE SQL:94 Rows. cost: 1570 ms`，
   一句话就把 4549ms 的调用定位到"建模型时的一条宽表查询"）。
5. **指纹聚合** —— 回到全量 SQL 表，把 SQL **去掉字面值后的结构**当指纹聚合（`WHERE pk_workbook=…` 都算同一条），
   **出现次数 × 单次耗时**才是真问题。实测同一指纹 `SELECT * FROM tb_md_task WHERE pk_workbook=…`
   出现 4 次共约 6 秒，而单看 TOP10 只看到 2323ms，会低估。
6. **判异常** —— 报错信息表按第 4 节分流；没有 Exception 就别把"是否存在错误 YES"当故障报出去。
   超标的 SQL 会**同时**出现在报错区、SQL 信息表、TOP10 榜里，去重时按"表名+结构"归并。

**输出要落到这五件事**：入口业务操作 → 总耗时 → 瓶颈在哪一层（占比）→ 主要慢点（接口+ms）→
是否有真异常 → 建议下一步查什么（哪个类、哪张表、哪条 SQL）。只罗列字段等于没分析。

---

## 四、「报错信息」表 ≠ 错误（实测，必读）⚠

实测某份报告：概要写着「是否存在错误 = YES」，报错区 40 行，而全文正则
`Exception|Throwable|Caused by|^\s+at [a-z]` **0 命中**。那 40 行实际是三类混装：

| 形态 | 样例 | 怎么认 | 是不是问题 |
| --- | --- | --- | --- |
| 许可占用日志 | `canOpenNode:===>>>UserOccupayChecker: lic=100 used=10 platformLic=2147483647 platformUsed=12.0` | 含 `canOpenNode` / `UserOccupayChecker` | **不是**，每次打开节点都会记 |
| 业务埋点 | `15:13:43 [TBBEFF@cbf9df7b]EXE SQL:94 Rows. cost: 1570 ms` | `^\d{2}:\d{2}:\d{2} \[\w+@[0-9a-f]{8}\]` | **不是**，是分析材料 |
| 慢SQL/大结果集记录 | `SELECT … WHERE pk_taskdef=… \|costtime=3\|\|rownum=43420\|\|defcol1=报表数据查询-null\|` | 含 `costtime=` / `rownum=` / `defcol1=` | 是线索，不是异常 |

**分流配方**：

```js
const errT = /* a[name=error] 之后那张表 */;
const rows = [...errT.rows].slice(1).map(r => ({
  callid: r.cells[0].innerText.trim(),
  msg: r.cells[1].innerText.trim().replace(/\s+/g,' ')
}));
const real  = rows.filter(r => /Exception|Throwable|Caused by|^\s*at [a-z]/.test(r.msg)); // 真异常
const lic   = rows.filter(r => /canOpenNode|UserOccupayChecker/.test(r.msg));            // 许可噪音
const probe = rows.filter(r => /^\d{2}:\d{2}:\d{2} \[\w+@[0-9a-f]{8}\]/.test(r.msg));    // 业务埋点
const slow  = rows.filter(r => /costtime=|rownum=|defcol1=/.test(r.msg));                // 慢SQL记录
```

配套的 **Weblog 表也是四类混装**，按前缀分流即可：

| 前缀 | 含义 | 实测条数(样本) |
| --- | --- | --- |
| `remoteCallNCItf=` | 一次 NC 接口跳转，带 `begintime=` `costtime=` | 60 |
| `busiaction=` | 业务操作入口统计，带 `totalCosttime=` `ncCosttime=` `webCosttime=` `remoteAddr=` `remoteCallPath=` `remoteCallAction=` 和 `statistics=` 串 | 16 |
| `get client IP from system properties:` | 取到客户端真实 IP | 13 |
| `###SAL###service@…计数+1` | SAL 服务调用计数 | 若干 |

`statistics=` 串本身可解析，字段就是概要那套的口径：
`sqlnum=8;sqlcosttime=0;readresulttime=0;readrownum=8;readfromclienttime=0;writetoclienttime=0;writetoclientbytes=318;readfromclientbytes=201;notclosedconnectioncount=0;cc=3;cmc=0`。

---

## 五、另外两个会误导人的地方

1. **「业务操作」名是入口名，不是瓶颈所在。**
   实测一份叫「工作桌面-权限校验」的报告，16 次远程调用里 12 秒花在报表模块
   （`epm/datacenter/queryTaskTree` 4549ms、`bcs/gbdata/queryTaskStatus` 3267ms、
   `epm/datacenter/queryDataCenter` 2308ms）。只看操作名会跑去查权限。**永远以远程调用表为准。**
2. **结果集大 ≠ 慢，慢 ≠ 有病。**
   实测 `SELECT * FROM tb_md_task …` 返回 43420 行只花 3ms（结果集 TOP1）；
   而 `tb_cube_SCCWBB` 只回 94 行却花 1576ms（扫描慢）。两个 TOP10 榜**分开看**，合起来看必误判。
   另注：概要的「结果集」合计与明细相加**不一定吻合**，别拿它做二次计算，只看排序即可。

其他实测事实：页面 `<meta charset="utf-8">`（**不是 GBK**，本地保存的 html 可直接 read/grep）；
`业务操作` 列出现 `xxx-null` 后缀是"该远程调用没回填业务名"，属正常现象，不是错误。

---

## 六、取数配方

报告动辄 20 万字符（DOM 37 万），**永远不要整页读**，按锚点/表精准取。

### A. 页面还开着（URL 形态，推荐）

内网地址（`10.x` 等）`web_fetch` 会以 "resolves to a non-public IP address" 拒绝，
`pwsh`/`curl` 在受限沙箱里可能起不来——**就走已登录的浏览器**：

```js
// browser_targets 找到 SPR 页签 → browser_eval 执行
(() => {
  const byHead = (kw) => [...document.querySelectorAll('table')]
    .find(t => kw.every(k => (t.rows[0]?.innerText||'').includes(k)));
  const dump = (t, n=999) => [...t.rows].slice(0,n)
    .map(r => [...r.cells].map(c => (c.innerText||'').trim().replace(/\s+/g,' ')).join(' | '));
  return JSON.stringify({
    env:      dump(byHead(['机器名','JDK版本']), 3),
    summary:  dump(byHead(['业务操作','是否存在错误']), 5),
    calls:    dump(byHead(['callid','远程调用方法'])),      // 远程调用全量
    red:      [...document.querySelectorAll('td,th,span,font')]
                .filter(e => /red|#ff0000/i.test((e.getAttribute('style')||'')+(e.getAttribute('color')||'')))
                .map(e => e.innerText.trim().slice(0,60)).filter(Boolean)
  });
})()
```

单条 SQL / 埋点按 callid 取：

```js
// 把 <CALLID> 换成远程调用表里的 callid
[...document.querySelectorAll('a[name="<CALLID>sql"],a[name="<CALLID>error"],a[name="<CALLID>web"]')]
  .map(a => { const t = a.nextElementSibling?.tagName==='TABLE' ? a.nextElementSibling : a.parentElement.querySelector('table');
              return t ? [...t.rows].map(r=>r.innerText.replace(/\s+/g,' ').trim()) : null; })
```

> 这三种锚点每份报告都成组出现，`a[name$="sql"]` / `$="error"` / `$="web"` 可批量扫。

### B. 本地保存的 html

页面是 UTF-8，直接 `grep` 定位再 `read` 分段：

- 找远程调用行：`grep "远程调用方法"` 附近 / 或按 `callid` 搜
- 找真异常：`grep -E "Exception|Caused by"`
- 找慢 SQL 指纹：`grep -E "costtime=[0-9]{4,}"`

### C. 报告里没有的

SPR 只覆盖**录制窗口内**（说明写明默认 **20 分钟**，由系统参数 `maxsprtime` 控制）发生的调用。
窗口外的操作查不到——**先确认用户说的慢操作落在窗口内**，否则结论会跑偏。

---

## 七、实测样本（2026-10-14，首创 NCC 环境）

| 项 | 值 |
| --- | --- |
| 报告 | `工作桌面-权限校验`，生成于 2026-10-14 15:14:13 |
| 环境 | ncapptest / Linux 3.10.0-693 / JDK 1.8.0_201 / jvmmax 16777m，used 965m（内存无压力） |
| 用户/集团/组织/账套 | `1001E11000000097SVQ6` / `00010A1000000000033E` / `0001H310000000001G5E` / 2024 |
| 总账 | 16 次远程调用，服务端 15012ms，NC 14445ms，SQL 8076ms/205 条，读结果集 4385ms，结果集 54081 |
| 占比 | NC 52% / 数据库 45% / 后端web 2% / 网络 2% |
| 真异常 | **0 条**（而概要说「是否存在错误 YES」→ 假警报） |

瓶颈（全在报表模块，不在"权限校验"）：`epm/datacenter/queryTaskTree` 4549ms(结果集 52962)、
`bcs/gbdata/queryTaskStatus` 3267ms、`epm/datacenter/queryDataCenter` 2308/2074ms、
`epm/task/querytaskinfoforjumpaction` 2190ms。

慢 SQL 指纹：`SELECT * FROM tb_md_task WHERE pk_workbook=…`（2323/2113ms，重复出现）、
`tb_cube_SCCWBB` 宽表 select（1576/1567ms，仅 94 行）、
`tb_md_task … planstatus<>'000'`（3ms 但 43420 行）、`sm_subject_org × org_orgs`（35ms/8071 行）。

---

## 八、尚未覆盖的形态（下次遇到要补进来）

本文件的实测样本是一份**没有真异常的"健康"报告**，以下形态**还没见过**，
遇到时先确认再补写，不要把本文件的判断照搬：

- 真正的异常堆栈（报错区出现 `Exception`/`Caused by` 时，格式与含哪些列）
- 数据库超时 / 锁等待 / 连接池耗尽
- `未关闭的连接数` > 0、`访问master次数` 异常偏高
- 中间件耗时（消息/JMS）占大头的形态
- 多业务操作 / 多次录制的报告（目前只见过单操作）

> **生成入口**：前台录制（头像菜单开录 → 做操作 → 结束 → 自动弹出的报告页签）已于 2026-10-14
> 在首创 NCC 环境实测跑通，步骤见 **`ncc-spr-recording` 技能**；
> **NMC 侧如何导出历史 SPR 仍未实测**。本文件只覆盖**拿到报告之后**的分析。
