---
name: Unable to start ServletWebServerApplicationContext
description: >
  用友 BIP 客开技能。当用户遇到启动报错 "Unable to start ServletWebServerApplicationContext due to missing ServletWebServerFactory bean" 时，参考该文档内容。
---

# 报错

```
Unable to start web server; nested exception is org.springframework.context.ApplicationContextException: Unable to start ServletWebServerApplicationContext due to missing ServletWebServerFactory bean.
```

解决方案： 在 bootstrap 模块的 pom.xml 中引入 springBoot-web 的依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```
