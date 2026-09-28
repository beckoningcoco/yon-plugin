---
name: YDS配置远程调试
description: >
  用友 BIP 客开技能。当用户需要在 YDS 环境中使用 VS Code 进行远程 JVM Debug 调试，配置 Remote JVM Debug 的 launch.json 时，参考该文档内容。
---

# YDS配置远程调试

## 背景

YDS（yds）开发如何进行远程调试？vscode如何设置remote JVM Debug?

## 步骤

### 1. 微服务启用调试端口

![image-20251121142650617](YDS配置远程调试/image-20251121142650617.png)

### 2. 安装插件：Extension Pack for Java

![image-20251121142710648](YDS配置远程调试/image-20251121142710648.png)

### 3. 打开 launch.json

在 VS Code 中打开项目，按 `Ctrl+Shift+P` 执行命令 `Debug: Open launch.json`

![image-20251121142734771](YDS配置远程调试/image-20251121142734771.png)

### 4. 增加 remote JVM Debug 配置

configurations 数组下增加对象：

```json
{
    "name": "Remote JVM Debug",
    "type": "java",
    "request": "attach",
    "hostName": "调试ip",
    "port": 端口,
    "protocol": "dt_socket"
}
```

![image-20251121142759921](YDS配置远程调试/image-20251121142759921.png)

### 5. 运行和调试

选中增加的远程调试，点击三角形运行

![image-20251121142817662](YDS配置远程调试/image-20251121142817662.png)

### 6. 效果

![image-20251121142842807](YDS配置远程调试/image-20251121142842807.png)

![image-20251121142857258](YDS配置远程调试/image-20251121142857258.png)
