---
name: transport library not found dt_socket
description: >
  用友 BIP 客开技能。当用户遇到启动报错 "ERROR: transport library not found: dt_socket"，JDWP 初始化失败时，参考该文档内容。
---

# 报错ERROR: transport library not found: dt_socket

报错信息:

```java
ERROR: transport library not found: dt_socket
ERROR: transport library not found: dt_socket
ERROR: JDWP Transport dt_socket failed to initialize, TRANSPORT_LOAD(509)
JDWP exit error AGENT_ERROR_TRANSPORT_LOAD(196): No transports initialized [debugInit.c:750]
FATAL ERROR in native method: JDWP No transports initialized, jvmtiError=AGENT_ERROR_TRANSPORT_LOAD(196)
FATAL ERROR in native method: JDWP No transports initialized, jvmtiError=AGENT_ERROR_TRANSPORT_LOAD(196)
```

解决方案: 涉及 JRE 与 JDK 环境设置的一致性调整。

下面两处配置的 jdk 需要是一样的。

![image-20250729181951923](transport-library-not-found-dt-socket/image-20250729181951923.png)

![image-20250729182046649](transport-library-not-found-dt-socket/image-20250729182046649.png)

参考文献: [ERROR: transport library not found: dt_socket](https://blog.csdn.net/yiye2017zhangmu/article/details/106546506)
