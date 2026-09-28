# NCC Home — nclogs/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## 概述

```
nclogs/
├── {组件名}-log.log        ← 顶层日志（3 个系统级）
├── server/                  ← ⭐ 服务端日志主目录（~40 组件）
│   ├── {组件}-log.log       ← 当前日志
│   └── {组件}-log.log.1~5   ← 滚动历史（保留 5 代）
└── {自定义模块}/             ← 客户化模块日志目录
```

**日志滚动规则**：统一命名 `{component}-log.log`，当前日志无编号，历史保留 `.1` ~ `.5`（6 个文件/组件）。

---

## 分类清单

### 顶层日志

| 文件 | 说明 |
|------|------|
| `nccforuap-log.log` | NCC → UAP 框架日志 |
| `nccforyht-log.log` | NCC → 云后台日志 |
| `nccloud_security-log.log` | nccloud 安全日志（认证/鉴权） |

### server/ — 框架 & 平台组件

| 日志文件 | 记录内容 |
|----------|----------|
| `nc-log.log` | ⭐ NCC 主日志 |
| `nccloud-log.log` | ⭐ nccloud 前端业务日志 |
| `fw-log.log` | 框架层日志 |
| `pa-log.log` | 流程活动（Process Activity）日志 |
| `wf-log.log` | 工作流日志 |
| `openapi-log.log` | ⭐ OpenAPI 调用日志 |
| `restinfo-log.log` | REST 接口访问详情 |
| `webservice-log.log` | Web Service 调用日志 |
| `schedule-log.log` | 后台调度任务日志 |
| `lightscheduler.log` | 轻量调度器日志 |
| `new_trans.log` | 事务日志 |
| `mwsummary-log.log` | 中间件概要日志 |
| `msagas.log` | MS Saga 事务日志 |
| `securitytoken.log` | 安全 Token 日志 |
| `searchlogger-log.log` | 搜索引擎日志 |
| `uapbdsearch-log.log` | 基础数据搜索日志 |
| `serverstart-log.log` | ⭐ 服务启动日志 |
| `iuap.log` | iUAP 平台日志 |
| `uap-adp.log` | UAP 适配器日志 |
| `pklock.log` | 主键锁日志 |
| `sessioninfo-log.log` | 会话信息日志 |
| `anony-log.log` | 匿名访问日志 |

### server/ — 业务模块

| 日志文件 | 记录内容 |
|----------|----------|
| `erm_bxsp-log.log` | 费用报销审批日志 |
| `ssc-log.log` | 共享服务中心日志 |
| `imag-log.log` | 影像管理日志 |
| `tmobm-log.log` | TMOBM 日志 |
| `ncchr.log` | HR 日志 |
| `nchc-log.log` | HC 日志 |
| `fipinitlog.log` | 财务接口平台初始化日志 |
| `arcprunable-log.log` | ARCP 清理日志 |
| `extableManager-log.log` | 外部表管理日志 |
| `esnPush-log.log` | ESN 推送日志 |

### server/ — 监控 & 告警

| 日志文件 | 记录内容 |
|----------|----------|
| `warningcall-log.log` | 调用告警日志 |
| `warningsql-log.log` | SQL 告警日志（慢查询等） |
| `msql-log.log` | SQL 执行日志 |
| `tc_src-log.log` | TC 源码日志 |

### 自定义目录

| 目录 | 说明 |
|------|------|
| `jxkxy/` | 机械院客户化模块日志（含 `.1~.5` 滚动） |

---

## 深度判断

| 维度 | 判断 |
|------|------|
| 日志目录结构 | ✅ 清晰：顶层 + server/ + 自定义模块 |
| 命名规范 | ✅ 统一 `{组件}-log.log` 模式 |
| 滚动机制 | ✅ `.1~.5`，6 代保留 |
| 关键日志定位 | ✅ openapi-log、nc-log、nccloud-log、serverstart-log |
| 单日志文件内容分析 | ❌ 属于故障排查范畴，非技术结构 |

**结论：nclogs 到此为止。Home 分析全线完成。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
