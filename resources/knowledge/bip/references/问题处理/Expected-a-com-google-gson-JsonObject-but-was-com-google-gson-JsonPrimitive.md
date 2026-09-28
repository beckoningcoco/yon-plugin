---
name: Expected a com.google.gson.JsonObject but was com.google.gson.JsonPrimitive
description: >
  用友 BIP 客开技能。当用户遇到报错 "Expected a com.google.gson.JsonObject but was com.google.gson.JsonPrimitive"，启动时生成有问题的 yms_config.json 时，参考该文档内容。
---

# 报错: Expected a com.google.gson.JsonObject but was com.google.gson.JsonPrimitive; at path $

## 介绍:

（原文档含截图）

经发现，每次启动都会生成一个 yms_config.json，然后这个文件是有问题的。

（原文档含截图）

这个文件导致了报错！！！！！

（原文档含截图）

## 解决方式：

配置文件中的，地址配置错了！！！

应该配置成 技术中台的地址，不是业务中台的！！！

（原文档含截图）
