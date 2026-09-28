---
name: 云机一体调试RDBGA
description: >
  用友 BIP 旗舰版通用知识。云机一体调试（RDBGA）的完整配置指南，包括 YDS 一键启动、手动注入 Cookie、
  launch.json 参数说明、以及脱离 YDS 脚手架使用普通浏览器联调的步骤。
  来源：爱步项目实操 + YDS launch.json 分析。
---

# 云机一体调试（RDBGA）

## 前提条件

客开后端服务的**本地**环境变量必须开通 `enable_rdbga=true`（或 `enable_cloud_debug=true`）。

> ⚠️ 这个参数是本地 YDS `launch.json` 的 `env` 段配置，**不需要去技术中台改任何东西**。

## 方式一：YDS 一键启动（最简单）

YDS 点击"启动前端脚手架"，自动完成：
- 启动前端
- 打开内嵌浏览器
- 植入加密 RDBGA Cookie

前提是 YDS `launch.json` 中已包含以下配置（YDS 模板默认带）：

### vmArgs 中

```
"-Drdbga=${command:yds.getEncryptedRDBGA}"
```

### env 中

```json
"enable_cloud_debug": "true"
```

如果是云原生模式（cloudnative），env 中还需要：

```json
"disconf.conf_server_host": "${command:yds.consoleUrl}",
"iris.serviceUrl.defaultZone": "${config:yds.registryUrl}",
"registry": "${command:yms.cloudNativeDevModeRegistryUrl}",
"app.version": "your-app-version"
```

其中 `app.version` 是云端流量路由标识，YDS 模板默认为占位符 `"your-app-version"`，实际应改为手机号等唯一标识。如果只用 YDS 内嵌浏览器，走的是加密 `rdbga` 参数，app.version 是占位符也不影响。

## 方式二：脱离 YDS，手动注入 Cookie（任意浏览器）

如果不通过 YDS 启动前端，可以在**保证后端 be 服务正常启动**的情况下，手动注入 RDBGA Cookie 到任意浏览器。

### 步骤

**① 连接 VPN，获取本机 IP 地址**

```bash
ipconfig
```

找到 VPN 虚拟网卡或本地网卡的 IP（如 `10.8.0.149`）。

**② 构造 RDBGA 字符串**

格式：`微服务编码,/@本地IP:62871`

例如（爱步项目）：
```
c-scm-xfp-abkk,/@10.8.0.149:62871
```

> IP 替换为第一步获取的本地 IP，微服务编码替换为你的实际编码。

**③ 转为 Base64**

将上一步的字符串进行 Base64 编码。

**④ 浏览器注入 Cookie**

打开浏览器开发者工具 → 应用程序（Application）→ Cookie → 添加：

| Cookie 名 | Cookie 值 |
|-----------|----------|
| `rdbga` | 第③步的 Base64 编码值 |

**⑤ 访问云端工作台**

直接在普通浏览器中打开云端工作台地址，请求会自动路由到本地后端 `62871` 端口。

## 核心原理总结

```
┌──────────┐    Cookie: rdbga=base64(微服务编码,/@IP:62871)    ┌──────────┐
│  浏览器   │ ──────────────────────────────────────────────→ │  云端网关  │
└──────────┘                                                  └────┬─────┘
                                                                    │
                                              读到 rdbga → 路由到本地 IP:62871
                                                                    │
                                                              ┌─────▼────┐
                                                              │ 本地后端  │
                                                              │ :62871   │
                                                              └──────────┘
```

- `-Drdbga`（VM 参数）：YDS 自动加密生成，内嵌浏览器使用
- `enable_cloud_debug=true`（env）：让本地服务以调试身份注册到云端
- `app.version`（env）：云端流量路由标识（cloudnative 模式），配合 `version.html` 页面手动注入使用

## 参考来源

- `爱步项目云机一体调试.docx`（爱步项目实操文档）
- YDS `launch.json` 分析（standalone vs cloudnative 对比）
- `raw/articles/2026-05-28-bip-kfxgqyyds1.md`
