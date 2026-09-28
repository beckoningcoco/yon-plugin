---
name: 后端函数调用后端Controller
description: >
  用友 BIP 客开技能。当用户需要在后端函数（JavaScript）中调用后端 Controller（Java），包括传参、Cookie 设置、调试方法、以及通过阿尔萨斯 watch 命令确认接口调用时，参考该文档内容。
---

# 后端函数调用后端Controller

## 后端函数如下:

```js
let AbstractTrigger = require('AbstractTrigger');
class MyTrigger extends AbstractTrigger {
  execute(context, param) {
    //调用后端controller
    debugger;
    let token = ObjectStore.env().token;
    let body = {
      id: param.billDOs[0].id,
    };
    let header = {
      'Content-Type': 'application/json;charset=UTF-8',
       Cookie: 'yht_access_token=' + token,
    };

    // let url = ObjectStore.env().url + '/c-fi-sasac-cnmc-be/wapay/addBill';
    let url = ObjectStore.env().url + '/c-fi-sasac-cnmc/szcontract/effect'; 
    let strInfo = postman('post', url, JSON.stringify(header), JSON.stringify(body));
    let info = JSON.parse(strInfo);
    if (info.status != '1') {
      throw Error('msg:' + info.msg + '返回结果:' + JSON.parse(strInfo) + '参数：' + JSON.stringify(body) + 'url:' + url);
    }
    return info;
  }
}
exports({ entryPoint: MyTrigger });
```

## 后端controller

```java
//注意，controller的返回值用 Map就可以，不然前端封装的postman函数，没办法解析奇奇怪怪的返回实体。
@PostMapping("/effect")
public Map<String,Object> handle(@RequestBody Map<String, Object> map, HttpServletResponse response) {
    Map<String, Object> resultMap = new HashMap<>(2);
    try {
        resultMap.put("status", "1");
        resultMap.put("content", "success");
        String res = pushJHXService.handlePushDataToJhx(map);
        return resultMap;
    } catch(Exception e) {
        resultMap.put("status", "0");
        resultMap.put("content", e.getMessage());
        return resultMap;
    }
}
```

## 后端函数调试方法

```
1. 后端函数点调试
2. 复制调试码
3. 进入到你需要调试的单据的页面 shift+alt+d
4. 输入调试码
5. 执行你的操作
6. 进入调试
```

![image-20250808152746477](后端函数调用后端Controller/image-20250808152746477.png)

![image-20250808152827262](后端函数调用后端Controller/image-20250808152827262.png)

![image-20250808152913464](后端函数调用后端Controller/image-20250808152913464.png)

![image-20250808153023936](后端函数调用后端Controller/image-20250808153023936.png)

## 查看有没有调用到你的接口

- 如果接口部署到了测试环境，如何确定有没有调到你的接口里

### 打开技术中台 --> 微服务管理

![image-20250808153655793](后端函数调用后端Controller/image-20250808153655793.png)

### 进入控制台输入命令

```
//只需要修改，全类名 以及方法名字就可以，其他不用管，输入后回车即可
watch com.yonyou.ucf.mdf.clm.contract.controller.SZControactEffectController handle '{params,returnObj,throwExp}'  -n 500  -x 3
```

### 执行操作，去调用测试环境接口，如果调用成功，会在控制台输出日志。
