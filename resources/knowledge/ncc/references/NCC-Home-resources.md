# NCC Home — resources/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## 概述

`resources/` 是 NCC 的**系统级配置根目录**，混合存放系统配置、模块配置、主题、缓存规则、证书等。约 100+ 个子目录/文件。

---

## 分类速查

| 分类 | 关键文件/目录 | 说明 |
|------|--------------|------|
| 系统身份 | `NCC.properties` | appId、key、username、过期时间 |
| 运行配置 | `config*.properties`、`server.properties`、`sso.properties` | 服务参数、SSO |
| 敏感配置 | `conf/` | key、login、modelserver 配置 |
| 缓存规则 | `cacheconfig/` | 全量/普通缓存 XML 配置 |
| 许可证 | `licence/` | 中英文许可文本 |
| 国际化 | `lang/` | english / simpchn / tradchn 三层语言 |
| 同步配置 | `slysync*.properties` | 第三方系统同步参数 |
| 模块配置 | `ermconfig/`、`jkbxconfig/`、`gl/`、`fip/`、`hr/`... | 各模块私有配置目录 |
| 工作流 | `arapworkflowconfig/`、`flowDoc/` | 应收应付工作流 + 流程文档 |
| UI/皮肤 | `skin/`、`themeroot/`、`laf/`、`image*/`、`GIF/` | 主题、样式、图标 |
| 报表 | `bqrt/`、`report/`、`rep/`、`dashboard/`、`cubeschema/` | 报表模板、仪表板、多维立方体 |
| BI | `iufo/`、`ufob/`、`ufoc/`、`ufoe/` | UFO 报表配置 |
| Excel | `excel/`、`excel_import/` | Excel 导入导出模板 |
| 邮件 | `sendfile*/`、`sksendfile/` | 邮件发送配置 |
| 低代码 | `lcdp/`、`lwds_meta/` | 低代码平台 + 元数据 |
| nccloud | `nccloud/` | nccloud 前端配置 |
| 元数据 | `metadata/`、`tmpbmf/` | 预加载元数据 |
| 预置数据 | `predata/`、`preloadconf/` | 系统预置数据配置 |
| 搜索 | `intelliv/`、`intelliv.properties` | 智能搜索 |
| 安全 | `infosec*.properties`、`elesign.properties`、`netsignagent.properties` | 信息安全、电子签章 |
| 平台扩展 | `yyconfig/`、`uap/`、`ufds/`、`tmca/`、`zior-*.xml` | 用友/平台级配置 |
| 测试残留 | `Test.properties`、`test.txt`、`test.xml`、`test1.txt` | — |

---

## 关键文件内容

### NCC.properties — 系统身份

```properties
appId=3c289d02-4eb8-404f-a228-d3f3e3a8cfb1
username=NCC
key=476d5a6e6e6670724a4a6a4b57494c6b6267526b
expiredDate=2019-05-29 13:48:52
expiredTs=1559108932423
```

### cacheconfig/ — 缓存规则

| 文件 | 用途 |
|------|------|
| `cacheconfig.xml` | 全量表缓存规则 |
| `cacheconfig_commondoc.xml` | 常见档案缓存 |
| `solutions.xml` | 解决方案缓存 |
| `tabsqls.xml` | 缓存表关联 SQL |
| `cacheconfig_rule.txt` | 缓存规则说明（中文） |

### conf/ — 敏感配置

| 文件 | 用途 |
|------|------|
| `key.properties` | 加密密钥 |
| `login.properties` | 登录相关配置 |
| `modelserverconfig.properties` | 模型服务器连接 |

---

## 深度判断

| 维度 | 判断 |
|------|------|
| 目录分类 | ✅ 已完成，12 大类覆盖所有内容 |
| 关键配置文件内容 | ✅ NCC.properties、cacheconfig、conf 已取样 |
| 逐个模块配置 | ❌ 不需要，模式重复（每个模块一个配置目录） |
| .properties 文件逐行分析 | ❌ 属于具体配置值，非技术结构 |

**结论：resources 到此为止。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [framework/ sysconfig 工具](./NCC-Home-framework.md)（sysconfig 是 resources/ 配置的管理界面）
