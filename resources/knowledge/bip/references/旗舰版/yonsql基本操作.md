---
name: yonsql基本操作
description: >
  用友 BIP 客开技能。当用户需要 YonQL 基本操作示例，包括批量查询、组合查询(主子表)、关联查询、子查询、新增(单条/批量)、更新(主表/子表/主子同时)、删除等 ObjectStore API 用法时，参考该文档内容。
---

# yonsql基本操作

```js
let AbstractAPIHandler = require('AbstractAPIHandler');
class MyAPIHandler extends AbstractAPIHandler {
  execute(request) {
    //===================================================
    //使用实体操作 批量查询单表数据
    //===================================================
    //var object = {ids:["2550335386751232","2550334829924608"]};
    //var res = ObjectStore.selectBatchIds("GT64965AT75.GT64965AT75.parentTable",object);

    //===================================================
    //使用yonql组合查询 主子关系
    //===================================================
    //var combine = "select id,age,name,money,(select good,num,total from childTableList) sonlist from GT64965AT75.GT64965AT75.parentTable";
    //var combineRes = ObjectStore.queryByYonQL(combine);

    //===================================================
    //没有主子关系 有关联关系
    //===================================================
    // var relSearch = "select id,age,name,money,orgVO,orgVO.name from GT64965AT75.GT64965AT75.parentTable";
    // var res = ObjectStore.queryByYonQL(relSearch);

    //===================================================
    //使用yonql子查询 不需要有关系
    //===================================================
    //var sub = "select * from GT64965AT75.GT64965AT75.parentTable where name in (select name from GT64965AT75.GT64965AT75.downParentTable where age=12)"
    //var subRes = ObjectStore.queryByYonQL(sub);

    //===================================================
    //使用yonql关联查询
    //===================================================
    //var union = "select funcStore_id,nianling,address,funcStore_id.name as name,funcStore_id.money as money from GT79146AT92.GT79146AT92.showChild t left join funcStore_id t1 on t.funcStore_id=t1.id where dr=0 and funcStore_id.dr=0"
    //var unionRes = ObjectStore.queryByYonQL(union);

    //===================================================
    //获取用户信息
    //===================================================
    // var appContext = AppContext();
    // var currentUser = JSON.parse(AppContext()).currentUser;
    // var sysId="diwork";
    // var tenantId = currentUser.tenantId;
    // var userId = currentUser.id;
    // var userids = [userId];
    // var userRes = listOrgAndDeptByUserIds(sysId,tenantId,userids);

    //===================================================
    //新增单条主子数据
    //===================================================
    // var object = {orgVO: "2362172988248320",orgVO_name: "开心",bustype_name: "测试",name:"张三",age:10,money:10,childTableList:[{good:"10",num:1,"total":1}]};
    // var res = ObjectStore.insert("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //批量新增
    //===================================================
    //var object = [{orgVO: "2362172988248320",orgVO_name: "开心",bustype_name: "测试",name:"李四",age:14,money:14,childTableList:[{good:"14",num:14,"total":14}]},{orgVO: "2362172988248320",orgVO_name: "开心",bustype_name: "测试",name:"王五",age:25,money:25,childTableList:[{good:"25",num:1,"total":25}]}];
    //var res = ObjectStore.insertBatch("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //更新实体 只更新主表
    //===================================================
    //var object = {id:"2568495932756224",money:8};
    //var res = ObjectStore.updateById("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //更新实体 只更新子表
    //===================================================
    // var object = {id:"2568495932756225",num:8};
    // var res = ObjectStore.updateById("GT64965AT75.GT64965AT75.childTable",object,"0a2c44bf");

    //===================================================
    //更新实体 主子同时更新
    //===================================================
    //var object = {id:"2568495932756224",money:9,childTableList:[{hasDefaultInit:true,num:9,id:"2568812584554752",_status:"Update"},{...}]};
    //var res = ObjectStore.updateById("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //更新实体 主表+子表删除后新增
    //===================================================
    //var object = {id:"2568495932756224",money:9,childTableList:[{hasDefaultInit:true,good:"5",num:5,total:5,_status:"Insert"},{hasDefaultInit:true,good:"55",num:55,total:55,_status:"Insert"},{id:"2568856000450816",_status:"Delete"},{id:"2568855783919872",_status:"Delete"}]};
    //var res = ObjectStore.updateById("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //更新实体 主表+子表有更新有删除后新增
    //===================================================
    //var object = {id:"2568495932756224",money:99,childTableList:[{hasDefaultInit:true,good:"9",num:9,id:"2568865476366592",_status:"Update"},{hasDefaultInit:true,good:"7",num:7,total:7,_status:"Insert"},{id:"2568865476366593",_status:"Delete"}]};
    //var res = ObjectStore.updateById("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //批量更新实体
    //===================================================
    //var object = [{id:"2568495932756224",money:88,childTableList:[{hasDefaultInit:true,good:"9",num:9,id:"2568865476366592",_status:"Update"},{hasDefaultInit:true,good:"3",num:3,total:3,_status:"Insert"},{id:"2568920963649792",_status:"Delete"}]}];
    //var res = ObjectStore.updateBatch("GT64965AT75.GT64965AT75.parentTable",object,"0a2c44bf");

    //===================================================
    //根据wrapper条件更新实体
    //===================================================
    // var updateWrapper = new Wrapper();
    // updateWrapper.le("money",1000);
    // var toUpdate = {name:"ttt",age:50,childTableList:[{hasDefaultInit:true,good:"ttt",num:50,total:50,_status:"Insert"},{id:"79072a33162b4f7ab177000977fcc8ac",_status:"Delete"}]};
    // var res = ObjectStore.update("GT64965AT75.GT64965AT75.parentTable",toUpdate,updateWrapper,"0a2c44bf");

    //===================================================
    //删除
    //===================================================
    // var object = {id:"2673537454592256"};
    // var delRes = ObjectStore.deleteById("GT79146AT92.GT79146AT92.funcStore",object);

    return {res};
  }
}
exports({"entryPoint":MyAPIHandler});
```
