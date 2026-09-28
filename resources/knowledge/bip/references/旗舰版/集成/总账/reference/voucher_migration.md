# 历史凭证迁移完整实现详解

## 概述

历史凭证在线迁移，从中间表读取 Oracle 凭证数据，按凭证编号分组构建凭证报文，调用 BIP 凭证保存 OpenAPI 完成导入。

**核心 Service**: `VorcherInitService`

## Controller 入口

```java
@RestController
@RequestMapping({"/vorcher"})
public class VorcherInitController {

    // 单账簿执行
    @RequestMapping({"/vorcherInit"})
    public JsonResult vorcherInit(
        @Param("com") String com,
        @Param("tableName") String tableName,
        @Param("status") String status
    );

    // 多账簿执行
    @RequestMapping({"/vorcherInitMore"})
    public JsonResult vorcherInitMore(
        @Param("coms") String coms,      // 分号分隔的账簿编码
        @Param("tableName") String tableName,
        @Param("status") String status,
        @Param("isPost") String isPost    // Y=调API方式, 其他=直接执行
    );

    // 批量分发（遍历所有配置表中的账簿）
    @RequestMapping({"/dispatchVorcherInit"})
    public JsonResult dispatchVorcherInit(
        @Param("status") String status,
        @Param("remark") String remark
    );

    // 指定账簿执行
    @RequestMapping({"/dispatchVorcherInitSingle"})
    public JsonResult dispatchVorcherInitSingle(
        @Param("status") String status,
        @Param("com") String com
    );

    // 指定备注执行
    @RequestMapping({"/dispatchVorcherInitSingleAndRemark"})
    public JsonResult dispatchVorcherInitSingleAndRemark(
        @Param("status") String status,
        @Param("remark") String remark
    );

    // 通过API方式分发（调自身接口）
    @RequestMapping({"/dispatchVorcherInitByAPI"})
    public JsonResult dispatchVorcherInitByAPI(@Param("status") String status);
}
```

## 执行流程

### Step 1: 查询配置表

```java
List<MapperTablePeriodVO> configList = commonDaoMapper.queryMapperTablePeriodByType("历史凭证");
```

### Step 2: 按账簿分片

```java
List<SimpleResultVO> accountBookList = voucherDaoMapper.queryAccountBookByCode(tenantId, tableName);
List<List<SimpleResultVO>> partition = Lists.partition(accountBookList, accountBookList.size() / 20);

for (List<SimpleResultVO> batch : partition) {
    executor.execute(() -> {
        for (SimpleResultVO accbook : batch) {
            batchVorcherInit(accbook.getCode(), tableName, status, remark);
        }
    });
}
```

### Step 3: 查询中间表

```sql
SELECT * FROM ${tableName}
WHERE COM = #{com}
  AND (#{status} IS NULL OR STATUS = #{status})
  AND (#{remark} IS NULL OR REMARK = #{remark})
```

### Step 4: 按凭证编号分组

```java
Map<String, List<VorchorMid>> vorcherMap = list.stream()
    .collect(Collectors.groupingBy(VorchorMid::getJURAL_NUMBER));
```

### Step 5: 构建凭证报文

```java
vorcherMap.forEach((juralNumber, vorchorMidList) -> {
    WanDaPinzhengQYBIP bipVoucher = new WanDaPinzhengQYBIP();

    // 1. 设置凭证头信息
    bipVoucher.setDefInfo1(juralNumber);      // Oracle凭证编号 → 扩展字段1
    bipVoucher.setSrcSystemCode("figl");      // 凭证来源必须是figl
    bipVoucher.setAccbookCode(vorchorMid.getCOM()); // 账簿编码
    bipVoucher.setVoucherTypeCode("1");       // 凭证类别
    bipVoucher.setMakerEmail(userName.toLowerCase() + "@wanda.com"); // 制单人
    bipVoucher.setMakeTime(markedDate);       // 制单日期
    bipVoucher.setDescription(vorchorMid.getJOURNAL_NAME()); // 凭证名
    bipVoucher.setDefInfo2(vorchorMid.getJURNAL_SERIAL());   // 单据编号
    bipVoucher.setDefInfo3(vorchorMid.getBATCH_NAME());      // 凭证批号

    // 2. 构建凭证分录
    List<Body> listBody = new ArrayList<>();
    vorchorMidList.forEach(vorchor -> {
        Body body = new Body();
        body.setDescription(vorchor.getLINE_DESCRIPTION());
        body.setAccsubjectCode(vorchor.getACC());
        body.setCurrencyCode(vorchor.getCURRENCY());
        body.setRateOrg(new BigDecimal(1.0));
        body.setBusidate(markedDate);
        body.setDebitOriginal(vorchor.getDEBIT_AMOUNT());
        body.setCreditOriginal(vorchor.getCREDIT_AMOUNT());
        body.setDebitOrg(vorchor.getDEBIT_AMOUNT());
        body.setCreditOrg(vorchor.getCREDIT_AMOUNT());
        body.setBillTime(markedDate);

        // 3. 构建辅助核算 ClientAuxiliaryList
        List<ClientAuxiliaryList> clientAuxiliaryList = new ArrayList<>();
        // ... 子目段、部门、产品服务、项目、品牌、广场、铺位、关联方

        body.setClientAuxiliaryList(clientAuxiliaryList);
        listBody.add(body);
    });

    bipVoucher.setBodies(listBody);
    // 4. 调用API保存
    postAddVoucher(tableName, bipVoucher, juralNumber, vorchorMid, status);
});
```

### Step 6: 调用凭证保存API

```java
String url = baseUrl + "/iuap-api-gateway/yonbip/fi/ficloud/openapi/voucher/addVoucher?access_token=" + token;
String result = HttpUtil.post(url, JSON.toJSONString(bipVoucher), 600000); // 10分钟超时
```

### Step 7: 处理响应

```java
JSONObject json = JSONObject.parseObject(result);
String statusCode = json.getString("code");

switch (statusCode) {
    case "200":
        // 成功
        voucherDaoMapper.updateVorchorByJuralNumber(tableName, "Y", "成功", juralNumber);
        break;
    case "310504":
    case "310074":
        // 凭证已存在（重复导入）
        voucherDaoMapper.updateVorchorByJuralNumber(tableName, "T", json.getString("message"), juralNumber);
        break;
    default:
        // 其他失败
        voucherDaoMapper.updateVorchorByJuralNumber(tableName, "N", json.getString("message"), juralNumber);
        break;
}
```

## 凭证日期处理

```java
String period = vorchorMid.getPERIOD_NAME();    // 如 "2024-01"
String postedDate = vorchorMid.getPOSTED_DATE(); // 如 "2024-01-15 00:00:00"

if (postedDate.length() > 7) {
    postedDate = postedDate.substring(0, 7); // 截取年月
}

String markedDate = postedDate;
if (!postedDate.equals(period)) {
    // 入账日期不在期间内时，使用期间的1号
    markedDate = period + "-01 00:00:00";
}
```

## 借贷金额为0跳过

```java
BigDecimal credit = Optional.ofNullable(TypeUtils.castToBigDecimal(vorchor.getCREDIT_AMOUNT())).orElse(BigDecimal.ZERO);
BigDecimal debit = Optional.ofNullable(TypeUtils.castToBigDecimal(vorchor.getDEBIT_AMOUNT())).orElse(BigDecimal.ZERO);

if (credit.compareTo(debit) == 0) {
    // 借贷金额相等，跳过该行
    voucherDaoMapper.updateVorchorById(tableName, "P", "借贷金额相减为0跳过", vorchor.getID());
    return;
}
```

## 凭证去重

```sql
-- MyBatis XML 中的去重查询
SELECT t.* FROM ${tableName} t
WHERE t.COM = #{com}
  AND NOT EXISTS (
      SELECT 1 FROM figl.fi_voucher b WHERE b.def11 = t.JURAL_NUMBER
  )
```

## 辅助核算映射（凭证模式）

凭证使用 `ClientAuxiliaryList` 结构，比期初的 `itemMap` 更简洁：

```java
// 子目段映射
if (科目有子目辅助 && 子目编码 != "0") {
    SimpleResultVO subAccInfo = mapperSubaccMap.get(subaccCode);
    ClientAuxiliaryList aux = new ClientAuxiliaryList();
    aux.setFiledCode(AuxiliaryDisplayEnum.getCodeByFullname(subAccInfo.getName()));
    aux.setValueCode(subaccCode);

    // 银行子目需要额外映射
    if ("银行子目".equals(subAccInfo.getName())) {
        SimpleResultVO bank = mapperBankMap.get(subaccCode);
        if (bank != null) aux.setValueCode(bank.getName());
    }
    clientAuxiliaryList.add(aux);
}

// 部门
if (科目有部门辅助 && 部门编码 != "0") {
    ClientAuxiliaryList aux = new ClientAuxiliaryList();
    aux.setFiledCode(AuxiliaryDisplayEnum.DEPT.getValue()); // "0001"
    aux.setValueCode(com前缀 + "_" + deptCode);
    clientAuxiliaryList.add(aux);
}

// 产品服务
if (科目有产品服务辅助 && 产品服务编码 != "0") {
    ClientAuxiliaryList aux = new ClientAuxiliaryList();
    aux.setFiledCode(AuxiliaryDisplayEnum.PRODUCT_SERVICE.getValue()); // "0036"
    aux.setValueCode(prodCode);
    clientAuxiliaryList.add(aux);
}

// 品牌、广场、铺位、项目类似...

// 关联方（最复杂的映射逻辑）
buildRelationServiceData(vorchor, clientAuxiliaryList, supplyOrCustomerMap);
```

## 多线程子分片

```java
// 将凭证编号Map拆分为10个子Map并行处理
Map<String, Map<String, List<VorchorMid>>> splitMaps = splitMap(vorcherMap);
splitMaps.forEach((key, subMap) -> {
    executor.execute(() -> {
        extracted(com, tableName, status, subMap);
    });
});
```

## 关键注意事项

1. **srcSystemCode 必须为 "figl"**，否则BIP会拒绝
2. **凭证来源**：外系统来源不被允许，需要用 "figl" 来绕过
3. **制单人邮箱**：规则为 `username.toLowerCase() + "@wanda.com"`
4. **凭证类型**：目前预置为 "1"，需要根据实际情况调整
5. **defInfo1** 存放 Oracle 原始凭证编号，用于去重和数据核对
6. **批量导入时**先按账簿分片（/20），再按凭证编号子分片（/10），两级并行
7. **isPost参数**：为Y时走API分发（调自身接口），否则直接执行
