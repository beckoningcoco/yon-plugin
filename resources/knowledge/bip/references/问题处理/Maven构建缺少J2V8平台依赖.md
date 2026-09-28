---
name: Maven构建缺少J2V8平台依赖
description: >
  旗舰版本地开发时 Maven 报 Missing artifact com.eclipsesource.j2v8:j2v8_win32_x86_64:jar，原因是 J2V8 的平台特定性，需引入对应操作系统的依赖并排除默认 Linux 依赖
project: 东软载波
version: BIP 旗舰版
env: 本地开发
tags: [Maven, J2V8, Windows, 依赖冲突]
---

# Maven 构建缺少 J2V8 平台依赖

## 现象

```
Missing artifact com.eclipsesource.j2v8:j2v8_win32_x86_64:jar:5.2.0-RELEASE
```

## 原理分析

J2V8 是 Google V8 JavaScript 引擎的 Java 绑定，用于在后端运行 JS（如后端函数）。底层是 C++ 原生库，需要匹配操作系统和 CPU 架构。

YonBIP 后端默认提供的 J2V8 是 Linux 版本（线上环境）。Windows/macOS 本地开发时，Maven 找不到对应平台的包，导致 Missing artifact。

版本 `5.2.0-RELEASE` 在仓库中可能不存在，需改用 `5.1.0-RELEASE` 或 `5.1.1-RELEASE`。

## 解决方案

### 1. 引入对应系统的依赖

**Windows (x86_64)**:
```xml
<dependency>
    <groupId>com.eclipsesource.j2v8</groupId>
    <artifactId>j2v8_win32_x86_64</artifactId>
    <version>5.1.1-RELEASE</version>
</dependency>
```

**macOS (Intel x86_64)**:
```xml
<dependency>
    <groupId>com.eclipsesource.j2v8</groupId>
    <artifactId>j2v8_macos_x86_64</artifactId>
    <version>5.1.1-RELEASE</version>
</dependency>
```

**Linux (x86_64)**:
```xml
<dependency>
    <groupId>com.eclipsesource.j2v8</groupId>
    <artifactId>j2v8_linux_x86_64</artifactId>
    <version>5.1.1-RELEASE</version>
</dependency>
```

### 2. 排除默认 Linux 依赖

```xml
<exclusions>
    <exclusion>
        <groupId>com.eclipsesource.j2v8</groupId>
        <artifactId>j2v8_linux_x86_64</artifactId>
    </exclusion>
    <exclusion>
        <groupId>com.eclipsesource.j2v8</groupId>
        <artifactId>j2v8_linux_aarch_64</artifactId>
    </exclusion>
</exclusions>
```

### 3. 推荐：Maven Profiles 自动激活

```xml
<profiles>
    <profile>
        <id>win</id>
        <dependencies>
            <dependency>
                <groupId>com.eclipsesource.j2v8</groupId>
                <artifactId>j2v8_win32_x86_64</artifactId>
                <version>5.1.0-RELEASE</version>
            </dependency>
        </dependencies>
        <activation>
            <os><family>Windows</family></os>
        </activation>
    </profile>
    <profile>
        <id>linux</id>
        <dependencies>
            <dependency>
                <groupId>com.eclipsesource.j2v8</groupId>
                <artifactId>j2v8_linux_x86_64</artifactId>
                <version>5.1.0-RELEASE</version>
            </dependency>
        </dependencies>
        <activation>
            <os><family>linux</family></os>
        </activation>
    </profile>
</profiles>
```

### 4. 执行

```bash
mvn clean compile
```

## 注意事项

- macOS M芯片 (ARM) 官方仓库暂未提供 `j2v8_macos_aarch_64`，需确认平台支持
- 此修改仅影响本地开发，线上部署保持 Linux 依赖
- 确保 Maven settings.xml 指向正确的仓库
