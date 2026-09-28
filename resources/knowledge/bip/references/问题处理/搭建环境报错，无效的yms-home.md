---
name: 搭建环境报错 yms-home无效
description: >
  YDS搭建环境时报错 yms-home无效: c:\Users\Administrator\dev\c-scm-gterp-service\yms-home\yms.jar不存在,请先部署yms-home<br> 
---

- 这个问题发生在 国投项目上，国投项目时内网，没有VPN，连不上用友的MAVEN库，所以只能用本地上已经提供的仓库，搭建环境的时候，服务一启动，编译构建没问题，就是启动服务报错这个。
- 原因是，在刚搭建项目时，MAVEN编译报错，没有  yms-kernel-launcher-8.2.106-RELEASE 这个jar包，只有 两个.lastUpdate后缀的文件。 用户把两个文件的后缀给删除掉，只剩下了 xxx.pom  xxx.zip  ，欺骗了编译器，导致编译器通过了。但是实际上是没有这两个jar包的。
- 经过排查，发现 本地构建缺少yms-kernel-launcher-8.2.106-RELEASE，集团老师给了jar包后，才不报错了。
- 如果遇到类似问题，请想一下，搭建环境时，编译期间是否发生过报错，是否通过类似的方式欺骗了编译器。找到缺失的jar，给补上就好了。

