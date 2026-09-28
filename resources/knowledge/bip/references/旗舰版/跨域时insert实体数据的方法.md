---
name: 跨域时insert实体数据的方法
description: >
  用友 BIP 客开技能。当用户需要跨服务域插入实体数据，使用 RemoteInvockTools.getIrisQueryService + IComOperateApi 进行跨域操作时，参考该文档内容。
---

# 跨域时，insert实体数据的方法

```java
import com.yonyou.ucf.mdd.api.interfaces.rpc.IComOperateApi;
import com.yonyou.ucf.mdd.ext.support.utils.RemoteInvockTools;

IComOperateApi comOperateApi = RemoteInvockTools.getIrisQueryService(IComOperateApi.class, "znbzbx");
// 第一个参数是 uri，第二个参数是需要插入的实体
comOperateApi.insert(MetaDataEnum.TallydataVO.getUri(), hotelOrder);
```
