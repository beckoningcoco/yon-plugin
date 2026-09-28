# 总账期初保存完整实现详解

## 概述

总账期初保存在线迁移，从中间表读取 Oracle 期初余额数据，构建带辅助核算的报文，调用 BIP 总账期初保存 API，并轮询进度接口确认最终结果。

**核心 Service**: `SubjectAccountsInitService`

## Controller 入口

```java
@RestController
@RequestMapping({"/subject"})
public class SubjectAccountInitController {

    // 单账簿执行
    @RequestMapping({"/subjectAccountsInit"})
    public JsonResult subjectAccountsInit(
        @Param("com") String com,          // 账簿编码
        @Param("tableName") String tableName, // 中间表名
        @Param("status") String status       // 过滤状态（null=全部, N=失败的）
    );

    // 批量分发（遍历所有账簿）
    @RequestMapping({"/dispatchSubjectAccountsInit"})
    public JsonResult dispatchSubjectAccountsInit(@Param("status") String status);

    // 进度查询
    @RequestMapping({"/subjectCheckProgress"})
    public JsonResult subjectCheckProgress(
        @Param("coms") String coms,        // 账簿编码，分号分隔
        @Param("tableName") String tableName
    );

    // 单线程循环遍历（指定账簿）
    @RequestMapping({"/dispatchSubjectAccountsInitSingle"})
    public JsonResult dispatchSubjectAccountsInitSingle(
        @Param("status") String status,
        @Param("remark") String remark,
        @Param("coms") String coms         // 指定账簿，分号分隔
    );
}
```

## 执行流程

### Step 1: 查询配置表确定迁移范围

```java
List<MapperTablePeriodVO> configList = commonDaoMapper.queryMapperTablePeriodByType("总账期初");
// 每条配置包含 tableName(中间表名) 和 periodName(期间)
```

### Step 2: 按账簿分片多线程执行

```java
// 查询中间表中有哪些不同的账簿编码
List<SubjectAccountMid> accountBookList = subjectAccountDaoMapper.queryDsitinctSubjectAccountCode(tableName, status);

// 每5个账簿为一组
List<List<SubjectAccountMid>> partition = Lists.partition(accountBookList, 5);

// 每组提交到线程池
for (List<SubjectAccountMid> accountBooks : partition) {
    executor.execute(() -> {
        for (SubjectAccountMid accountBook : accountBooks) {
            batchSubjectAccountsInit(accountBook.getCOM(), tableName, status);
        }
    });
}
```

### Step 3: 查询中间表数据

```sql
-- MyBatis XML 中使用动态表名
SELECT t.*, t.id as ID
FROM ${tableName} t
WHERE t.COM = #{com}
  AND (#{status} IS NULL OR t.STATUS = #{status})
  AND (#{remark} IS NULL OR t.REMARK = #{remark})
```

### Step 4: 按 (公司+科目+币种+期间) 分组

```java
Map<String, List<SubjectAccountMid>> collect = subjectAccountList.stream()
    .collect(Collectors.groupingBy(
        e -> e.getCOM() + "," + e.getACC() + "," + e.getCURRENCY_CODE() + "," + e.getPERIOD_NAME()
    ));
```

### Step 5: 子分片并行处理

```java
// 将大Map拆分为10个子Map，并行处理
Map<String, Map<String, List<SubjectAccountMid>>> splitMaps = splitMap(collect);
splitMaps.forEach((key, subMap) -> {
    executor.execute(() -> {
        List<String> reqIdList = new ArrayList<>();
        buildDataAndSaveSubjectAccount(tableName, subMap, reqIdList);
        checkSubjectAccount(tableName, reqIdList); // 轮询进度
    });
});
```

### Step 6: 构建保存报文

```java
// 对每个分组构建一个 SubjectAccountsInitVO
SubjectAccountsInitVO vo = new SubjectAccountsInitVO();
vo.setAccbook(accbookInfo.getId());        // 账簿ID（从缓存取）
vo.setAccsubject(accSubject.getId());      // 科目ID（从缓存取）
vo.setCurrency(currencyInfo.getId());      // 币种ID（从缓存取）
vo.setDirection(accSubject.getDirection()); // 方向：Debit/Credit
vo.setPk_org(orgInfo.getId());            // 组织ID
vo.setPeriod(period);                     // 期间

// 遍历分组内的每行数据构建 Bodies
for (SubjectAccountMid mid : midList) {
    Bodies bodies = new Bodies();
    // 金额计算（根据科目方向）
    if ("Debit".equalsIgnoreCase(direction)) {
        resultAmount = drAmount.subtract(crAmount);
    } else {
        resultAmount = crAmount.subtract(drAmount);
    }
    bodies.setAmount(resultAmount.toString());
    bodies.setLocalamount(resultAmount.toString());
    bodies.setEarly_amount(resultAmount.toString());
    bodies.setEarly_localamount(resultAmount.toString());

    // 构建辅助核算 itemMap
    AuxiliaryDisplayVO auxVO = new AuxiliaryDisplayVO();
    Map<String, Map<String, String>> itemMap = new LinkedHashMap<>();
    // ... 填充各辅助核算维度
    auxVO.setItemMap(itemMap);
    bodies.setAuxiliaryDisplayVO(auxVO);
    bodiesList.add(bodies);
}
```

### Step 7: 合并相同辅助核算行

```java
List<Bodies> mergedList = mergeList(bodiesList);
vo.setBodies(mergedList);
```

### Step 8: 调用保存API

```java
String url = baseUrl + "/iuap-api-gateway/" + tenantId + "/wanda_be/sync2/datamigrate/balance/auxiliarySave?access_token=" + token;
String result = HttpUtil.post(url, JSON.toJSONString(vo), 600000); // 10分钟超时
```

### Step 9: 处理保存响应

```java
JSONObject json = JSONUtil.parseObj(result);
String reqId = json.getStr("reqid");

if (!json.getBool("success")) {
    // 保存失败，回写N
    updateStatus(tableName, "N", "保存接口返回失败:" + json.getStr("message"), reqId, ids);
} else {
    // 保存成功（但需等异步处理完成），先记录reqId
    updateReqId(tableName, reqId, ids);
}
```

### Step 10: 轮询进度

```java
String progressUrl = baseUrl + "/iuap-api-gateway/" + tenantId + "/wanda_be/sync2/datamigrate/balance/progress?access_token=" + token;
Map<String, String> body = new HashMap<>();
body.put("reqid", reqId);
String result = HttpUtil.post(progressUrl, JSON.toJSONString(body), 600000);

JSONObject json = JSON.parseObject(result);
if ("true".equals(json.getString("success")) && "1".equals(json.getString("progress"))) {
    // 真正成功
    updateStatus(reqId, "Y", "成功");
} else if (!"true".equals(json.getString("success")) && "1".equals(json.getString("progress"))) {
    // 真正失败
    updateStatus(reqId, "N", json.getString("message"));
}
// progress != 1 时表示还在处理中，需继续轮询
```

## 错误处理

### 前置校验错误

- 账簿信息查询为空 → STATUS="N"，PARAMJSON记录错误
- 科目信息查询为空 → STATUS="N"，PARAMJSON记录错误
- 辅助核算档案查询为空 → 记录错误到 StringBuilder，最终写入 PARAMJSON

### API调用错误

- HTTP异常 → STATUS="N"，PARAMJSON记录 "auxiliarySave接口HttpPost报错"
- API返回 success=false → STATUS="N"，记录 message
- 超时 → 捕获异常，STATUS="N"

## 关键注意事项

1. **总账期初保存API不是标品API**，需要基于前端按钮自行发布
2. **保存是异步的**，auxiliarySave 返回的 success=true 只表示请求受理，需通过 progress 接口确认最终结果
3. **reqId 是关键**，保存后需记录 reqId 到中间表的 REQID 字段
4. **金额方向**必须与科目方向匹配，否则数据会不正确
5. **辅助核算合并**避免了重复行，但要求辅助核算组合的 JSON 序列化结果一致
