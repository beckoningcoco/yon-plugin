---
name: 实体转JSON时更改字段名称
description: >
  用友 BIP 客开技能。当用户在 Java 实体转 JSON 时，字段名首字母大写导致 Jackson/Fastjson 序列化后的字段名不符合预期时，参考该文档内容。
---

# 实体转JSON时更改字段名称

## 问题描述

在JAVA实体中，字段名称是大写字母开头的，但是在进行JSON转换时，会默认按照驼峰命名法设置json报文的字段名。

```java
/* 工程发包产值计量单 */
private List<OutputMeasurementDetails> OutputMeasurementDetailsList;
```

导致最后生成的json中，这个字段名称不对了。

```json
{
    "outputMeasurementDetailsList": [] //这是错误的应该是，字段名 OutputMeasurementDetailsList，首字母大写。
}
```

## 解决方式

```java
@JSONField(name = "OutputMeasurementDetailsList")
private List<OutputMeasurementDetails> OutputMeasurementDetailsList;
```
