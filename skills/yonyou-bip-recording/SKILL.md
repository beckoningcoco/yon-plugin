---
name: yonyou-bip-recording
description: 在旗舰版（BIP / YonBIP）环境里录一段操作、抓性能报告——从工作台头像的「开发调试 → 开始录制」开关录制，用 browser_* 驱动目标业务操作，结束后接住弹出的对话框拿到【哈勃报告】与【BPR 报告】。触发词：录一段看看、录制操作、开始录制、结束录制、旗舰版有没有 SPR、性能报告在哪、链路追踪、慢 SQL、接口慢、TraceId、Jaeger、BPR、哈勃报告。**只负责录制这一段**；报告拿到之后怎么读（分区含义、微服务与库 schema）看 `bip/references/旗舰版/操作录制与性能报告.md` 与 `BIP微服务与库schema地图.md`。NCC（NC Cloud）是另一条产品线，它的 SPR 见技能 `ncc-spr-recording`。
---

# 录制操作与性能报告（旗舰版）

> 本技能的事实来自 2026-10-14 在**金隅共享 `dev-fssc.bbmg.com.cn`**（旗舰版，登录人 yhtmanager）
> 的一次完整实测：录了 45 秒，两份报告都打开验证过。
> 旗舰版各版本的菜单路径与报告分区可能变，**用前先按本文给的 DOM 特征确认一遍**，别照抄当常量。

> 本技能管**前半段**：把录制打开、让目标操作落在录制窗口里、结束、把两份报告拿到手。
> **报告拿到之后怎么读**不在本技能——照
> `bip/references/旗舰版/操作录制与性能报告.md`（用 `knowledge_read` 传该路径读全文）走。
> 那个目录下的 `BIP微服务与库schema地图.md` 是"慢在哪个服务上"的索引。三篇是前后半段，
> **交接物就是那个报告 ID**。

## 一、录制是什么

旗舰版**没有 SPR**。SPR 是 NCC 的 `nc.bs.framework.mx.monitor` + `/spr/` servlet，两者毫无关系——
所以在旗舰版域下探 `/spr/`、`/spr/temp/`、`/nccloud/platform/spr/start.do` 只会拿到 404。
**别把 NCC 的那一套搬过来。**

旗舰版对应的是工作台头像菜单里的**「开始录制」**，它录的是**跨微服务的分布式链路**：

| | NCC 的 SPR | 旗舰版的录制 |
| --- | --- | --- |
| 结束行为 | 自动弹 `/spr/temp/*.html` 报告页签 | 弹一个对话框，由它给出两个按钮 |
| 产物 | 一份单机 HTML 文件 | 两份 Web 报告（哈勃 + BPR） |
| 粒度 | 单 JVM + 前后端耗时 | 跨微服务链路 + Redis + 事务 + 线程剖析 |

所以顺序永远是：**先开录制 → 再操作 → 再结束**，反了就只能重录。

## 二、三步

### 第 1 步：开始录制

入口在工作台首页**右上角的头像**上：

| 元素 | 定位 |
| --- | --- |
| 头像 | `div.workbenchSelfAvator`（**hover 不出菜单，必须点击**） |
| 面板 | `div[class*="info--"][class*="settingshow"]`（用户中心，右侧滑出） |
| 分组 | 「开发调试」 |
| 开始 | `div.record-btn`，外层 `li[title="开始录制"]`，带 `data-uba-title="开始录制"` |
| 录屏 | 同分组里的勾选项「开启录屏」（默认勾选，录出来是什么尚未验证） |

点下去之后：

- 菜单项文字变成 **「结束录制」**
- 页面右下角出现录制指示器 `div[class*="ymc-record-"]`，`title="双击结束录制"`，图标类 `uf-video`

```js
// browser_eval：确认已经在录
(() => {
  const ind = document.querySelector('[class*="ymc-record-"]');
  const btn = [...document.querySelectorAll('.record-btn, li[title]')]
    .map(e => e.getAttribute('title') || e.textContent.trim())
    .filter(t => t && t.includes('录制'));
  return JSON.stringify({ indicator: ind ? ind.textContent.trim() : null, btn });
})()
```

> ⚠️ **别去改 `localStorage` 或直接打接口来"假装开始录制"。** 旗舰版这套是动态注入的脚本
> （`iuap-ymc-agent`）在管，手改存储既不会开始录制、也不会让界面状态正确。**要么点界面，
> 要么按第四节直接打 `monitor/record` 接口**，两者选一，别混。

### 第 2 步：在窗口内做目标操作

录制期间照常用 `browser_*` 驱动页面，**你操作的耗时就是被记录的耗时**，所以要把"用户说慢的那一下"
完整做进去。例：在全局搜索框 `input[class*="searchInput"]` 里输入「供应商」，等下拉出来——

```
报告里的业务操作：GET /fullText/suggest  222.4ms  TraceId bc4b40b27ffe9c63
```

**一次录制只做一件有代表性的事**，报告才干净；要录多步就先规划顺序。

### 第 3 步：结束录制

再点头像（`div.workbenchSelfAvator`）→ 点那句「结束录制」。

结束后**不会自己开页签**，它弹一个对话框——**这一步必须读页面**，见下节。

## 三、★ 结束后的对话框：一定要读一次页面

```text
提示：
录制已结束。报告ID：sw7ts5zov3
[关闭] [哈勃报告] [BPR报告]
```

DOM 特征（可以直接用这段抓）：

```js
// browser_eval
[...document.querySelectorAll('.ok,.cont')].map(e => e.textContent.trim())
// ["录制已结束。报告ID：sw7ts5zov3", "哈勃报告", "BPR报告"]
```

`.ok` = 哈勃报告按钮，`.ok.expand` = BPR报告按钮，`.cont` = 提示文字。

> ⚠️ **点完「结束录制」必须 `browser_read` 或 `browser_eval` 读一次页面。**
> 本文作者第一次只查了录制指示器和网络请求（指示器消失、没有新页签），就得出过
> "旗舰版没有报告"的错误结论，被使用者用截图纠正。**没有新页签 ≠ 没有报告。**

## 四、两份报告怎么进

都在对话框上，点开各新开一个页签：

| | 哈勃报告 | BPR 报告 |
| --- | --- | --- |
| 按钮 | `.ok` | `.ok.expand` |
| URL | `https://{host}/ymc/#/link/tracing-report/detail/{报告ID}` | `https://{host}/iuap-ymc-server/proxy/server/bpr/open?pk={pk}` |
| 标题 | `YMC - 链路报告详情 - 链路分析 - YonBIP 监控中心` | `BPR - YonBIP Monitoring Center` |
| 内容 | 按 TraceId 串起跨微服务调用，span 给所属应用/耗时/SpanId/状态码；链路详情里能展开出完整 SQL 原文 | 15 个分区：服务端概要 / 建议关注 / 微服务链路 / SQL耗时TOP10 / SQL结果集TOP10 / 线程剖析 / 后端错误详情… |
| 顶部 | 链路报告数据(JSON)、录屏回放、链接分享、**Jaeger UI** | 回放、下载、分享 |

> ⚠️ **BPR 的 `pk` 和"报告ID"不是同一个值**（实测 pk 是 32 位随机字母串，报告ID 是 10 位左右）。
> **BPR 报告不能靠报告ID 拼 URL**，只能从对话框点进去。

**取回方式**：哈勃页有「链路报告数据(JSON)」和「链接分享」，BPR 页有「下载」。

## 五、底层接口（界面点不动时的兜底）

| 环节 | 请求 |
| --- | --- |
| 开始 / 结束 | `GET /iuap-ymc-agent/monitor/record?uid={uid}&isDiwork=true&host={host}&env={env}&userId={userId}&userName={userName}`（script，各出现一次） |
| 上传日志 | `POST /iuap-ymc-agent/upload/log/{uid}.json`（fetch，实测 4685 ms） |
| 收尾 | `GET /iuap-ymc-agent/bprcall?userId=…&bprId={uid}&userName=…&startTime=…&endTime=…&ubainfo=…&tgap=…`（fetch） |

- `uid` = 录制会话 id = 界面上的**报告ID**（实测 `sw7ts5zov3`，同时也是 `bprId`）
- 组件侧：`iuap-gp-recordui-fe`（录制 UI 组件）+ `iuap-ymc-agent`（代理上传）+ `uba-init.js`（UBA SDK）
- `localStorage.YMC_TGAP` 存的就是请求里 `tgap` 的值
- **`bprcall` 是一次性的**：事后重放返回 `500 服务端异常（code 999-999-999999）`，**不要拿它当读接口**
- 录制时长可以从 `bprcall` 的 `endTime - startTime` 反推（实测 45244 ms ≈ 45 秒）

**用户标识**：`userId=ec4326d0-d490-4d5a-9105-260b51fd16d0`（UUID），`userName` 是登录名。
这和 NCC 那个数字 pk（`1001A110000000002D4C`）完全不是一种东西。

## 六、操作纪律（踩过的坑）

1. **写操作前先把目标页签切到前台**（纯读不切，别抢用户焦点）。
2. **头像必须点，不能 hover** —— 悬停不出菜单。
3. **结束之后先读页面再下结论**（第三节）—— 这一条是本文的由来。
4. **别用"有没有新页签 / 有没有下载"判断录制成败。** 旗舰版是**直接上传服务端**的，
   浏览器侧不产生文件；报告要去 YMC / BPR 的页面里看。
5. **别用 `performance.getEntriesByType('resource')` 里有没有 `upload/log` 来判定录制成功** ——
   它只能证明"有请求发出去"，报告本身在服务端。判定成不成，看对话框。
6. **别在旗舰版找 SPR**。域下 `/spr/*` 全 404 是一个已经测过的结论，不用再试一遍。

## 七、实测样本（2026-10-14，金隅共享）

| 项 | 值 |
| --- | --- |
| 开始 → 结束 | 21:33:05 → 21:33:50（45 秒） |
| 报告 ID | `sw7ts5zov3` |
| 录制人 | `yhtmanager` / `ec4326d0-d490-4d5a-9105-260b51fd16d0` |
| 录进去的操作 | 在全局搜索框输入「供应商」（一次 `GET /fullText/suggest`） |
| 报告规模 | 业务操作 1、微服务 7、HTTP 30、RPC 18、SQL 35、Redis 47、MDD Rule 0 |
| 主操作耗时 | `GET /fullText/suggest` 222.4ms，TraceId `bc4b40b27ffe9c63` |
| 服务端拆分 | 服务端 222ms / 计算 96ms / Cache 23ms(156次) / SQL 36ms(46次) / 读结果集 67ms(48) / RPC 19 / 错误日志数 38 |
| 调用链 | `iuap-apcom-workbench 222ms` → `iuap-apcom-messagecenter 158ms` → `iuap-apcom-staffdoc 87ms`；旁支 `iuap-aip-search 64ms`、`iuap-apcom-org 13ms` |

## 八、还没验过的

- 「开启录屏」勾上之后录出来是什么（哈勃报告页有「录屏回放」按钮，推测与它对应）
- 报告在服务端保留多久、能否按条件查历史报告
- BPR 报告的「回放」具体回放什么（操作步骤？页面快照？）
- 除了对话框这一条路，有没有从菜单直接进 YMC 查历史报告的入口
- 直接打 `monitor/record` 接口时，界面与报告内容是否一致
- 非金隅环境（其他旗舰版租户 / 版本 / 主题）上头像菜单与 `.record-btn` 是否同构

遇到新形态先确认再补进本文件，别把金隅的实测结论当通用事实。
