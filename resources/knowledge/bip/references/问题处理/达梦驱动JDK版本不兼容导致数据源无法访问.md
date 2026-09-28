---
name: 达梦驱动JDK版本不兼容导致数据源无法访问
description: >
  BIP 旗舰版本地脚手架启动，使用 JDK 8 启动时达梦（DM）JDBC 驱动因编译版本过高无法加载，
  报错 160220 数据源无法访问数据库。切换到 JDK 21 解决。
---

# 达梦驱动 JDK 版本不兼容导致数据源无法访问

## 基本信息

| 项目 | 版本/环境 |
|------|-----------|
| **项目名称** | 机械总院（BIP 旗舰版） |
| **版本** | 旗舰版 |
| **环境** | 本地开发（脚手架启动） |
| **日期** | 2026-06-10 |

## 现象

本地启动 YMS 脚手架时报错：

```
Caused by: com.yonyou.iuap.MiddlewareException:
errorCode='160220', fullErrorCode='unknown-160220',
message='数据源类型：iuap.yms.ds.internal.YMSRoutingDataSource。
数据源无法访问数据库，请检查数据源配置是否正确！'
```

完整链路：

```
dbWorkerIdInitilizer → OidWorkerIdInitilizer
  → YMSRoutingDataSource
    → 数据源无法访问数据库 (160220)
```

## 排查过程

1. 检查 `yms_middleware.json` 中数据库 IP、端口、用户配置，均无问题
2. 检查 VPN 连通性，数据库端口可达
3. 在本地 `yms-home/logs/` 目录下查找日志，发现关键线索：**达梦 JDBC 驱动（`dm.jdbc.driver.DmDriver`）编译时使用了更高版本的 JDK，JDK 8 无法加载该驱动类**
4. 切换到 JDK 21 后重新启动，驱动正常加载，问题解决

## 根因

YMS 内置的达梦（DM）JDBC 驱动 jar 使用了 **更高版本的 JDK 编译**（class 文件主版本号 > 52），导致 JDK 8 无法加载驱动类。

- 错误信息被 YMS 框架包装为"数据源无法访问数据库"（160220），**实际是驱动类加载失败**，严重误导排查方向
- 与数据库网络连通性、配置正确性无关

## 解决方案

切换到 JDK 21 启动项目。

## 关键教训

> "数据源无法访问数据库"（160220）的错误信息**并非都是网络或配置问题**。
> 也可能是驱动 jar 本身加载失败。排查时务必先检查 `yms-home/logs/` 下
> 是否有驱动类加载相关的异常日志，避免被错误信息误导。
