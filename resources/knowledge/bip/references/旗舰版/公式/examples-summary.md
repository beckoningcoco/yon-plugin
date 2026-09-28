# Yonyou BIP Formula Examples Summary

## 案例0 - UI模板使用物料业务函数获取物料档案属性

### 获取物料基础属性（库存单位）
公式：`getProductValue("stockUnit",orderDetails.productId,salesOrgId)`

### 获取物料组织级属性（物料简称）
公式：`getProductValue("org!shortName",orderDetails.productId,salesOrgId)`

### 获取物料自定义属性（是否主材）
公式：`getProductValue("define!是否主材",orderDetails.productId,salesOrgId)`

### 获取物料特征属性（特征编码L001）
公式：`getProductValue("character!L001",orderDetails.productId.id,salesOrgId.id)`

---

## 案例1 - 获取客户档案基础信息的自定义项的值

公式：`getValue(#{"aa.merchant.MerchantDefine"}$,"define2","id",agentId)`
- aa.merchant.MerchantDefine：客户档案基础信息自由自定义项实体
- define2：自定义项编码
- id：客户主键
- agentId：单据上的客户ID

---

## 案例2 - 公式获取供应商档案默认银行信息

### 获取供应商默认银行信息
公式：`getValueMore(#{"aa.vendor.VendorBank"}$,"id","vendor",pk_cusdoc,"defaultbank","1")`

### 获取供应商默认银行自定义项信息
公式：`getValue("aa.vendor.VendorBankDefine","define1","id",getValueMore(#{"aa.vendor.VendorBank"}$,"id","vendor",pk_cusdoc,"defaultbank","1"))`

---

## 案例3 - 获取员工任职信息（最新任职）

### 获取平台员工最新任职
公式：`getValueMore(#{"bd.staff.StaffMainJob"}$,"id","staff_id",expensebillbs.pk_handlepsn,"lastestjob",1)`

### 获取人力云员工最新任职
公式：`getValueMore(#{"hred.staff.StaffJob"}$,"id","staffId",expensebillbs.pk_handlepsn,"lastestjob",true)`

### 获取人力云员工最新任职自定义项
公式：`getValue("hred.staff.StaffJobVODefine","define12","id",getValueMore(#{"hred.staff.StaffJob"}$,"id","staffId",expensebillbs.pk_handlepsn,"lastestjob",true))`

### 根据档案值ID换Name（以职等为例）
公式：`getValue("bd.customerdoc_FK06.FK06","name","id",getValue("hred.staff.StaffJobVODefine","define12","id",getValueMore(#{"hred.staff.StaffJob"}$,"id","staffId",expensebillbs.pk_handlepsn,"lastestjob",true)))`

---

## 案例4 - 费控报销单：根据报销人最后任职部门获取部门档案的自定义项

### 获取ID
公式：`getValue("hred.staff.StaffJobVODefine","define12","id",getValueMore(#{"hred.staff.StaffJob"}$,"id","staffId",expensebillbs.pk_handlepsn,"lastestjob",true))`

### 获取Name
公式：`getValue("bd.customerdoc_FK06.FK06","name","id",getValue("hred.staff.StaffJobVODefine","define12","id",getValueMore(#{"hred.staff.StaffJob"}$,"id","staffId",expensebillbs.pk_handlepsn,"lastestjob",true)))`

---

## 案例5 - 员工信息：表头获取表体中第一学历的专业

公式：`replace(groupConcat(staffEdu,'iif(staffEdu.isPrefs==true,staffEdu.major,"|")',"|",0),"|","")`

---

## 案例6 - 获取物料所属分类信息

### 根据物料ID获取物料分类ID
公式：`getValue(#{"pc.product.Product"}$,"manageClass.id","id",xsddmxList.Product)`

### 根据物料ID获取物料分类Name
公式：`getValue(#{"pc.product.Product"}$,"manageClass.name","id",xsddmxList.Product)`

---

## 案例8 - 通过公式进行判断取值的场景

### 基础iif公式（判断数量）
公式：`iif(表体.数量>0,"数量大于0","数量等于0")`

### 嵌套iif公式（判断报销费用）
```
iif(expensebilluserdefs!define1=="乘坐公共交通工具省内",
50*expensebillbs.nwelfaredays*expensebilluserdefs!define6,
iif(expensebilluserdefs!define1=="乘坐公共交通工具省外",
80*expensebillbs.nwelfaredays*expensebilluserdefs!define6,
iif(expensebilluserdefs!define1=="会议或培训对方不接送站省内"&&expensebillbs.nwelfaredays>0,
50*expensebilluserdefs!define6,
iif(expensebilluserdefs!define1=="会议或培训对方不接送站省外"&&expensebillbs.nwelfaredays>0,
80*expensebilluserdefs!define6,
0))))
```

---

## 案例9 - 通过公式实现司龄计算场景

公式：`round(dateDiff(sysdate(),strToDate(入职日期,"yyyy-MM-dd"),3)/365)`
- 规则：不足1年时，大于半年取1年，小于半年不计

---

## 案例10 - 通过公式实现获取库存组织自定义项的值

公式：`getValue("org.func.BaseOrgDefine","define1","id",org)`

---

## 案例11 - 通过公式实现获取员工自定义项的值

公式：`getValue("bd.staff.StaffDefine","define2","id",页面上的员工ID变量)`

---

## 案例12 - 通过公式实现获取部门负责人、分管领导的姓名

### 获取部门负责人姓名
公式：`getValue("bd.adminOrg.AdminOrgVO","principal.name","id",expapportions.vfinacedeptid)`

### 获取部门分管领导姓名
公式：`getValue("bd.adminOrg.AdminOrgVO","branchleader.name","id",expapportions.vfinacedeptid)`

---

## 案例13 - 通过公式实现获取供应商资质证件号

### 获取供应商资质表头证照号码
公式：`getValue("aa.vendor.Vendor","creditcode","id",vendor)`

### 获取供应商资质表体证件号（备注=1）
公式：`getValueMore("aa.vendor.VendorQualify","qualifyCode","vendor",vendor,"remark","1")`

---

## 案例14 - 通过公式实现获取物料属性的值到列表显示

公式：`getProductValue("define!颜色",product,org)`、`getProductValue("define!规格",product,org)`

---

## 案例15 - 穿透自定义档案的uri拼接方式

示例：`#{"bd.customerdoc_xsfs.xsfs"}$`
- 拼接规则：前缀`bd.customerdoc_` + 自定义档案的code + `.` + 自定义档案的code

---

## 案例16 - 穿透组织部门档案

### 部门档案穿透获取自定义项
公式：`getValue(#{"bd.adminOrg.DeptOrgDefine"}$,"define4","id",purchaseOrders.bodyParallel!reqDept)`

### 组织档案相关实体
| 组织类型 | 实体名称 | 表名 |
|---------|----------|------|
| 安环组织 | SafetyOrgDefine | org_safety_define |
| 销售组织 | SalesOrgDefine | org_sales_define |
| 采购组织 | PurchaseOrgDefine | org_purchase_define |
| 库存组织 | InventoryOrgDefine | org_inventory_define |

---

## 案例17 - 穿透客户档案获取客户专管业务员、专管部门

### 获取客户专管业务员
ID：`getValue("aa.merchant.Principal","professSalesman","merchantId",defines!define1)`
Name：`getValue("aa.merchant.Principal","professSalesman.name","merchantId",defines!define1)`

### 获取客户专管部门
ID：`getValue("aa.merchant.Principal","specialManagementDep","merchantId",defines!define1)`
Name：`getValue("aa.merchant.Principal","specialManagementDep.name","merchantId",defines!define1)`

---

## 案例18 - 通过判断公式为布尔类型的枚举自定义项赋值

公式：`iif(strToNum(othOutRecords.defines!define17) > 0 || strToNum(othOutRecords.defines!define14) >0, false, true)`
- 说明：布尔类型枚举需用`true`/`false`赋值

---

## 案例19 - 通过公式穿透员工银行信息获取默认银行账号

公式：`getValueMore("hred.staff.StaffBankAcct","account","staffId",xiaoshouren,"isDefaultCard",true)`

---

## 案例20 - 通过公式穿透员工任职信息获取岗位的岗位密级

### 根据员工ID获取岗位密级ID
公式：`getValueMore("hred.staff.StaffJob","postId.secretId","staffId",yuangongid)`

### 根据岗位密级ID获取岗位密级Name
公式：`getValue("sys.secret.UserSecretObj","name","id",getValueMore("hred.staff.StaffJob","postId.secretId","staffId",yuangongid))`

---

## 案例21 - 通过公式穿透员工学历信息获取最高学历的学校

公式：`getValueMore("hred.staff.StaffEdu","school","staffId",xiaoshouren,"isPrefs",true)`

---

## 案例22 - 通过公式获取表体某一列的最大/最小日期的值

### 获取表体日期列最大值
公式：`aggrDateMax(xsddmxList, 'strToDate(xsddmxList.item275xh, "yyyy-MM-dd")')`

### 获取表体日期列最小值
公式：`aggrDateMin(xsddmxList, 'strToDate(xsddmxList.item275xh, "yyyy-MM-dd")')`

---

## 案例23 - 通过公式获取物料是否批次管理

公式：`getProductValue("isBatchManage",entitySaleOrderChildList.wuliao.id,xiaoshouzuzhi.orgid.id)`
- 说明：批次管理是物料子集，需同时用物料ID和组织ID获取

---

## 案例24 - 根据付款合同ID获取费控-付款合同的原币价税合计

公式：`getValue("apct.contract.Apct","originalTotalAmt","id",pk_apct)`

---

## 案例25 - 根据分配到部门上的特征反向获取部门Name、ID

### 反向获取部门Name
公式：`getValue("bd.adminOrg.DeptOrgVO","name","deptdefinefeature",getValue("bd.adminOrg.DeptVOFeature","id","DDL",remarks))`

### 反向获取部门ID
公式：`getValue("bd.adminOrg.DeptOrgVO","id","deptdefinefeature",getValue("bd.adminOrg.DeptVOFeature","id","DDL",remarks))`

---

## 案例26 - 穿透项目档案取值

公式：`getValue("bd.project.ProjectVO","name","id",单据上的项目id字段)`

---

## 案例27 - 获取表体符合条件的行数量

公式：`uniqueCount(userzyjlList,"userzyjlList.gongsi=='总经理'")`

---

## 案例28 - 获取分配到员工基本信息的特征

公式：`getValue("hred.staff.staffDefines","attrext23","id",单据上的员工id)`

---

## 案例29 - 获取行政区划的省市县拼接

公式：`getValue("bd.region.BaseRegionVO","parent.name","id",getValue("bd.region.BaseRegionVO","parent.id","id",province))+"/"+getValue("bd.region.BaseRegionVO","parent.name","id",province) + "/" + province_name`
- 效果示例：山东省/青岛市/市北区

---

## 案例30 - 日期类型自定义项计算日期差

公式：`dateDiff(strToDate(headFreeItem!define3,"yyyy-MM-dd"),strToDate(headFreeItem!define4,"yyyy-MM-dd"),3)`
- type说明：1=年，2=月，3=日，4=时，5=分，6=秒，7=毫秒，8=星期，9=季度

---

## 案例31 - 表头字段值等于表体不同列求和后值相除

### 基础sum函数用法
公式：`sum(payApplicationBill_b,"payApplicationBill_b.bodyItem!define2")`

### 复杂场景（求和后相除）
公式：`sum(payApplicationBill_b,"payApplicationBill_b.bodyItem!define2")/sum(payApplicationBill_b,"payApplicationBill_b.bodyItem!define9")`

---

## 案例32 - 编码规则中使用公式

### 获取销售组织第一个字符
公式：`left(xiaoshouzuzhi_name,1)`

### 获取备注第一个字符
公式：`left(beizhu,1)`

---

## 案例33 - 穿透获取费用项目档案自定义项

### 获取费用项目档案自定义项ID
公式：`getValue("bd.expenseitem.ExpenseItemExt","define1","id",expensebillbs.pk_busimemo)`

### 获取费用项目档案自定义项Name
公式：`getValue("bd.expenseitem.ExpenseItemExt","define1.name","id",expensebillbs.pk_busimemo)`

---

## 案例34 - 分组汇总子表行数

场景：报销单明细中，统计火车票张数
公式：`sum(expinvoicedetails,"iif(expinvoicedetails.pk_invoicetype_name=='火车票',1,0)")`

---

## 案例35 - 取自定义档案中的名称

### 获取利润中心ID（从项目备注中取编码）
公式：`getValue("bd.project.ProjectVO","description","id",pk_project)`

### 获取利润中心Name（从自定义档案中取）
公式：`getValue("bd.customerdoc_FK0003_yql.FK0003_yql","name","code",getValue("bd.project.ProjectVO","description","id",pk_project))`

---

## 案例36 - 取物料档案的装载方式

### 获取装载方式ID
公式：`getValueMore("pc.product.ProductLoadWay","loadWay","productId",purchaseOrders.product,"productDetailId",getValueMore("pc.product.ProductApplyRange","productDetailId","productId",purchaseOrders.product,"orgId",org))`

### 获取装载方式Name
公式：`getValueMore("pc.product.ProductLoadWay","loadWay.name","productId",purchaseOrders.product,"productDetailId",getValueMore("pc.product.ProductApplyRange","productDetailId","productId",purchaseOrders.product,"orgId",org))`

---

## 新架构特殊说明

### 1. 新架构业务对象特性
- 对象类型属性可展开查找内部属性，可直接选择字段，无需配置getValue
- 示例：到货订单子表按货位值带出货位上级货位，配置arrivalOrders.goodsposition.parent.name
- 特征字段需带特征组，如销售订单特征orderDefineCharacter.xu9201

### 2. 参照引用档案配置公式
- 新架构：单据参照控件仅需配置取id，页面显示时按特征配置的code/name自动显示
- 老架构：单据参照控件需同时配置id（存储）和name（显示）

### 3. 新架构特征作为参照引用档案
- 引用基本档案：vendor.vendorCharacterDefine.zhao04.id
- 引用自定义档案：vfinacedeptid.deptdefinefeature.BMKM0001.id

### 4. 新架构下取自定义档案特征
- 一对一关系：直接穿透取值，公式agentId.merchantCharacter.cusdoc001.id
- 一对多关系：用getValueMore