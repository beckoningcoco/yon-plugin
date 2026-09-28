# NCC 通用 API 参考手册

本文档收录跨场景复用的通用 API，所有 NCC 开发场景共享。

---

## 1. 自定义档案（DefdocVO）操作

### 1.1 根据档案定义编码查询档案

```java
/**
 * 根据自定义档案定义编码查询自定义档案维护内容
 * @param listcode 自定义档案定义编码（bd_defdoclist.code）
 * @return 该档案定义下的全部 DefdocVO 数组
 */
public static DefdocVO[] getDefDocArrayByListCode(String listcode) {
    String pk_group = InvocationInfoProxy.getInstance().getGroupId();
    IGeneralAccessor accessor = GeneralAccessorFactory.getAccessor(IBDMetaDataIDConst.DEFDOCLIST);
    IBDData defData = accessor.getDocByCode(pk_group, listcode);
    DefdocVO[] vos = null;
    if (defData != null) {
        String pk_defdoclist = defData.getPk();
        IDefdocQryService service = NCLocator.getInstance().lookup(IDefdocQryService.class);
        try {
            vos = service.queryDefdocVOsByDoclistPk(pk_defdoclist, pk_group, pk_group);
        } catch (BusinessException e) {
            ExceptionUtils.wrappException(e);
        }
    }
    return vos;
}
```

### 1.2 自定义档案新增/更新/删除

```java
// 新增
BatchOperateVO batchVO = new BatchOperateVO();
batchVO.setAddObjs(new DefdocVO[]{defdocVO});
defdocService.batchSaveDefdoc(defdocVO.getPk_org(), batchVO);

// 更新
BatchOperateVO batchVO = new BatchOperateVO();
batchVO.setUpdObjs(new DefdocVO[]{defdocVO});
defdocService.batchSaveDefdoc(defdocVO.getPk_org(), batchVO);

// 删除
BatchOperateVO batchVO = new BatchOperateVO();
batchVO.setDelObjs(new DefdocVO[]{defdocVO});
defdocService.batchSaveDefdoc(defdocVO.getPk_org(), batchVO);
```

### 1.3 DefdocVO 常用属性

| 属性/方法 | 说明 |
|-----------|------|
| `defdocVO.getCode()` / `setCode()` | 档案编码 |
| `defdocVO.getName()` / `setName()` | 档案名称 |
| `defdocVO.getPk_org()` / `setPk_org()` | 组织 PK |
| `defdocVO.getPk_group()` / `setPk_group()` | 集团 PK |
| `defdocVO.getDoctype()` / `setDoctype()` | 档案类型 |
| `defdocVO.getPid()` / `setPid()` | 父节点主键（树形档案时使用，为空表示根节点） |
| `defdocVO.getAttributeValue("def1")` | 自定义字段值 |
| `defdocVO.setAttributeValue("def1", value)` | 设置自定义字段值 |

### 1.4 自定义档案的列表形式与树形形式

自定义档案支持两种形式：

- **列表形式**：所有档案平级，`pid` 为空
- **树形形式**：通过 `pid` 字段关联父节点，`pid` 为空的是根节点（一级大类），子节点 `pid` 指向父节点的 `pk_defdoc`

```java
// 判断是否为根节点
if (StringUtils.isEmpty(defdocVO.getPid())) {
    // 一级大类（根节点）
}

// 新增子节点时设置 pid
DefdocVO childVO = new DefdocVO();
childVO.setPid(parentDefdocPk);  // 挂到父节点下
```

### 1.5 相关 import

```java
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.accessor.IBDData;
import nc.pubitf.bd.accessor.IGeneralAccessor;
import nc.pubitf.bd.accessor.GeneralAccessorFactory;
import nc.itf.bd.pub.IBDMetaDataIDConst;
import nc.vo.bd.meta.BatchOperateVO;
```

---

## 2. 持久化查询（MDPersistenceService）

### 2.1 按条件查询 VO

```java
IMDPersistenceQueryService queryService = MDPersistenceService.lookupPersistenceQueryService();

// 基础查询
String whereSql = "pk_source = '" + sourcePk + "' and dr = 0";
TargetVO[] vos = (TargetVO[]) queryService.queryBillOfVOByCond(
    TargetVO.class, whereSql, false);

// 带 IN 条件的查询
String[] pks = {"pk1", "pk2", "pk3"};
String whereSql = SQLUtil.buildSqlForIn("csourceid", pks) + " and dr = 0";
List<TargetVO> items = (List<TargetVO>) queryService.queryBillOfVOByCond(
    TargetVO.class, whereSql, false);
```

### 2.2 相关 import

```java
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;
import nc.vo.pf.pub.util.SQLUtil;
```

---

## 3. 批量操作（BatchOperateVO）

### 3.1 用法

```java
BatchOperateVO batchVO = new BatchOperateVO();
batchVO.setAddObjs(new IBDVO[]{vo1, vo2});     // 新增
batchVO.setUpdObjs(new IBDVO[]{vo3, vo4});     // 更新
batchVO.setDelObjs(new IBDVO[]{vo5});          // 删除
someService.batchSave(pk_org, batchVO);
```

### 3.2 注意事项

- 按单据类型的接口不同，方法名可能不同（如 `batchSaveDefdoc`、`batchSave` 等）
- 批量更新时需按 `pk_org` 分组调用
- `BatchOperateVO` 的 `setAddObjs` / `setUpdObjs` / `setDelObjs` 接受 `IBDVO[]` 数组

### 3.3 相关 import

```java
import nc.vo.bd.meta.BatchOperateVO;
```

---

## 4. InvocationInfoProxy（获取上下文信息）

### 4.1 常用方法

| 方法 | 说明 |
|------|------|
| `InvocationInfoProxy.getInstance().getGroupId()` | 当前登录用户的集团 PK |
| `InvocationInfoProxy.getInstance().getUserId()` | 当前登录用户 PK |
| `InvocationInfoProxy.getInstance().getPkOrg()` | 当前操作的组织 PK |

### 4.2 相关 import

```java
import nc.bs.framework.common.InvocationInfoProxy;
```

---

## 5. 服务定位（接口调用）

NCC 不同端调用接口的方式**不同，不能混用**：

| 端 | 调用方式 | import |
|------|------|--------|
| **client 端** | `ServiceLocator.find()` | `nccloud.framework.service.ServiceLocator` |
| **public 端** | `NCLocator.getInstance().lookup()` | `nc.bs.framework.common.NCLocator` |
| **private 端** | `NCLocator.getInstance().lookup()` | `nc.bs.framework.common.NCLocator` |

### 5.1 client 端（只能用 ServiceLocator）

```java
import nccloud.framework.service.ServiceLocator;

IBalaTypeUpdateService service = (IBalaTypeUpdateService) ServiceLocator.find(IBalaTypeUpdateService.class);
service.updateBalatype(pk_balatype, billIds);
```

### 5.2 public/private 端（必须用 NCLocator）

```java
import nc.bs.framework.common.NCLocator;

IPfExchangeService service = (IPfExchangeService) NCLocator.getInstance().lookup(IPfExchangeService.class);
service.xxxMethod();
```

### 5.3 延迟加载模式（推荐，多方法复用时）

```java
// client 端
import nccloud.framework.service.ServiceLocator;

private ISomeService someService;
private ISomeService getSomeService() {
    if (someService == null) {
        someService = (ISomeService) ServiceLocator.find(ISomeService.class);
    }
    return someService;
}

// public/private 端
import nc.bs.framework.common.NCLocator;

private ISomeService someService;
private ISomeService getSomeService() {
    if (someService == null) {
        someService = (ISomeService) NCLocator.getInstance().lookup(ISomeService.class);
    }
    return someService;
}
```

> ⚠️ **严禁混用**：client 端不能用 NCLocator，public/private 端不能用 ServiceLocator。

### 5.4 client 端异常处理

client 端异常处理需使用 `nccloud` 包的异常工具类 `ExceptionUtils.wrapException()`，**直接调用即可，不需要 throw**：

```java
import nc.vo.pub.BusinessException;
import nccloud.framework.core.exception.ExceptionUtils;

List<String> result = null;
try {
    result = getPaybillLinkService().LinkExtPayment(list);
} catch (BusinessException e) {
    ExceptionUtils.wrapException(e);  // 直接调用，不需要 throw
}
return result;
```

### 5.5 相关 import

```java
// client 端
import nccloud.framework.service.ServiceLocator;
import nccloud.framework.core.exception.ExceptionUtils;

// public/private 端
import nc.bs.framework.common.NCLocator;
```

---

## 6. SQL 工具

### 6.1 构建安全 SQL

```java
import nc.vo.pf.pub.util.SQLUtil;

// IN 条件（自动处理空值和 SQL 注入）
String whereSql = SQLUtil.buildSqlForIn("pk_field", new String[]{"pk1", "pk2"});
```

---

## 7. 日志工具

```java
import nc.bs.logging.Logger;

Logger.info("信息日志：" + message);
Logger.warn("警告日志：" + message);
Logger.error("错误日志：" + message, exception);
```

---

## 8. 系统参数查询（SysInitQuery）

### 8.1 用途

业务插件中常需要根据系统参数控制逻辑是否执行，例如只对配置了参数的组织启用同步功能。

### 8.2 方法签名

```java
SysInitQuery.getParaString(String pkOrg, String paramCode)
```

| 参数 | 说明 |
|------|------|
| `pkOrg` | 组织 PK（组织级参数时传入） |
| `paramCode` | 参数编码 |

**返回值**：参数值（String），未配置时返回 null 或空字符串。

### 8.3 使用示例

```java
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.pub.pf.SysInitQuery;
import nc.vo.org.IOrgConst;

/**
 * 判断当前组织是否启用了某功能
 * @param paramCode 参数编码
 * @param pkOrg 组织PK（组织级参数时传入）
 */
private boolean isParamEnabled(String paramCode, String pkOrg) {
    String value = SysInitQuery.getParaString(pkOrg, paramCode);
    return "Y".equalsIgnoreCase(value);
}

// 在业务逻辑中使用
String pkOrg = headVO.getPk_org();
if (!isParamEnabled("KYXMLB_SYNC", pkOrg)) {
    Logger.info("当前组织[" + pkOrg + "]未启用同步，跳过。");
    return;
}
```

### 8.4 相关 import

```java
import nc.bs.pubitf.para.SysInitQuery;
```

---

## 9. 业务插件事件入口标准写法

### 9.1 事件类型与强转

NCC 中事件对象 `IBusinessEvent` 有多种实现，常用两种：

| 事件类 | 包路径 | 适用场景 | 获取对象方法 |
|--------|--------|----------|-------------|
| `BusinessEvent` | `nc.bs.businessevent.BusinessEvent` | 单据类事件 | `getObject()` |
| `BDCommonEvent` | `nc.bs.businessevent.bd.BDCommonEvent` | 基础档案类事件 | `getObjs()` |

> **注意**：`BusinessEvent` 用 `getObject()`，`BDCommonEvent` 用 `getObjs()`，两者方法名不同。

### 9.2 getObjectVO 工具方法

`getObjs()` 返回值可能是数组也可能是单个对象，需要统一处理：

```java
/**
 * 从事件对象中提取单个 VO
 * 兼容数组和单对象两种返回形式
 */
private Object getObjectVO(Object obj) {
    if (obj == null) {
        return null;
    }
    if (obj.getClass().isArray()) {
        if (java.lang.reflect.Array.getLength(obj) == 0) {
            return null;
        }
        return java.lang.reflect.Array.get(obj, 0);
    } else {
        return obj;
    }
}
```

### 9.3 doAction 标准模板

**基础档案类事件（BDCommonEvent）：**

```java
import nc.bs.businessevent.bd.BDCommonEvent;

@Override
public void doAction(IBusinessEvent event) throws BusinessException {
    try {
        if (!(event instanceof BDCommonEvent)) {
            return;
        }
        BDCommonEvent busEvent = (BDCommonEvent) event;
        String eventType = busEvent.getEventType();

        Object vo = getObjectVO(busEvent.getObjs());
        if (vo == null) {
            return;
        }

        // 根据头部 VO 类型分发处理
        if (vo instanceof SomeHeadVO) {
            SomeHeadVO headVO = (SomeHeadVO) vo;
            handleSomeEvent(headVO, eventType);
        }

    } catch (Exception e) {
        ExceptionUtils.wrappException(e);
    }
}
```

**单据类事件（BusinessEvent）：**

```java
import nc.bs.businessevent.BusinessEvent;

@Override
public void doAction(IBusinessEvent event) throws BusinessException {
    try {
        BusinessEvent busEvent = (BusinessEvent) event;
        String eventType = busEvent.getEventType();

        Object vo = getObjectVO(busEvent.getObject());
        if (vo == null) {
            return;
        }

        // 根据聚合 VO 类型分发处理
        if (vo instanceof SomeAggVO) {
            SomeAggVO aggvo = (SomeAggVO) vo;
            handleSomeEvent(aggvo, eventType);
        }

    } catch (Exception e) {
        ExceptionUtils.wrappException(e);
    }
}
```

### 9.4 相关 import

```java
import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.businessevent.bd.BDCommonEvent;
import nc.bs.businessevent.BusinessEvent;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;
```

---

## 11. 基础数据常用接口速查

> 来源：NCC高级版官方文档 1.19 基础数据常用接口

### 11.1 组织管理接口

| 服务 | 路径 | 说明 |
|------|------|------|
| 默认组织查询 | `nc.pubitf.setting.defaultdata.OrgSettingAccessor` | 获取默认组织设置 |
| 业务单元查询 | `nc.pubitf.org.IOrgUnitPubService` | 通用组织单元查询 |
| 库存组织查询 | `nc.pubitf.org.IStockOrgPubService` | 库存组织 |
| 财务组织查询 | `nc.pubitf.org.IFinanceOrgPubService` | 财务组织 |
| 利润中心查询 | `nc.pubitf.org.ILiabilityCenterPubService` | 利润中心 |
| 责任组织查询 | `nc.pubitf.org.ILiableOrgStruPubService` | 责任组织结构 |
| 采购组织查询 | `nc.pubitf.org.IPurchaseOrgPubService` | 采购组织 |
| 资金组织查询 | `nc.pubitf.org.IFundOrgPubService` | 资金组织 |
| 销售组织查询 | `nc.pubitf.org.ISaleOrgPubService` | 销售组织 |
| HR组织查询 | `nc.pubitf.org.IHrOrgPubService` | HR组织 |
| 资产组织查询 | `nc.pubitf.org.IAssetOrgPubService` | 资产组织 |
| 物流组织查询 | `nc.pubitf.org.ITrafficOrgPubService` | 物流组织 |
| 维修组织查询 | `nc.pubitf.org.IMaintainOrgPubService` | 维修组织 |
| 部门查询 | `nc.pubitf.org.IDeptPubService` | 部门信息 |
| 财务核算账簿查询 | `nc.pubitf.org.IAccountingBookPubService` | 核算账簿 |
| 账簿查询 | `nc.pubitf.org.ISetOfBookPubService` | 账簿 |
| 责任核算账簿查询 | `nc.pubitf.org.ILiabilityBookQryService` | 责任核算账簿 |
| 成本域查询 | `nc.pubitf.org.ICostRegionPubService` | 成本域 |
| 信用控制域查询 | `nc.pubitf.org.ICreditCtlRegionPubService` | 信用控制域 |
| 股权投资关系查询 | `nc.pubitf.org.IStockInvestRelaPubService` | 股权投资关系 |
| 资金管理体系查询 | `nc.pubitf.org.IFundManaSystemPubService` | 资金管理体系 |
| 分销补货体系查询 | `nc.pubitf.org.ISaleAppendStruPubService` | 分销补货体系 |
| 业务委托关系查询 | `nc.pubitf.org.IOrgRelationDataPubService` | 业务委托关系 |
| 产领料委托关系查询 | `nc.pubimpl.org.IOutStockConsignPubService` | 产领料委托 |
| 开关账查询 | `nc.pubitf.org.ICloseAccQryPubServicer` | 开关账状态 |
| 参数查询工具 | `nc.pubitf.para.SysInitQuery` | 系统参数查询 |

### 11.2 基础数据接口

| 服务 | 路径 | 说明 |
|------|------|------|
| 会计期间查询 | `nc.pubitf.accperiod.AccountCalendar` | 会计期间/账期 |
| 币种查询 | `nc.pubitf.bbd.CurrtypeQuery` | 币种信息 |
| 本位币查询 | `nc.pubitf.uapbd.DefaultCurrtypeQryUtil` | 组织本位币 |
| 多币种折算 | `nc.pubitf.uapbd.OrgRateCalculateUtil` | 多币种折算 |
| 外向汇率查询 | `nc.pubitf.uapbd.CurrencyRateUtil` | 汇率查询 |
| 默认模式查询 | `nc.pubitf.setting.defaultdata.LangSettingAccessor` | 语言/默认模式 |
| 工作日历查询 | `nc.pubitf.uapbd.IWorkCalendarPubService` | 工作日历 |
| 地点档案查询 | `nc.pubitf.uapbd.IAddrDocPubService` | 地点档案 |
| 人员信息查询 | `nc.pubitf.uapbd.IPsndocPubService` | 人员信息 |
| HR人员信息回写 | `nc.pubitf.uapbd.IPsndocHRPubService` | HR人员回写 |
| 客户基本信息查询 | `nc.pubitf.uapbd.ICustomerPubService` | 客户信息 |
| 客商基本信息查询 | `nc.pubitf.uapbd.ICustsupPubService` | 客商信息 |
| 供应商基本信息查询 | `nc.pubitf.uapbd.ISupplierPubService` | 供应商信息 |
| 供应商基本信息回写 | `nc.pubitf.uapbd.ISupplierPersisPubService` | 供应商回写 |
| 计量档案查询 | `nc.pubitf.uapbd.MeasdocUtil` | 计量单位（工具类） |
| 物料基本分类查询 | `nc.pubitf.uapbd.IMaterialBaseClassPubService` | 物料基本分类 |
| 物料基本分类回写 | `nc.pubitf.uapbd.IMaterialBasClPersisPubService` | 物料基本分类回写 |
| 物料采购分类查询 | `nc.pubitf.uapbd.IMaterialPuClassPubService` | 物料采购分类 |
| 物料成本分类查询 | `nc.pubitf.uapbd.IMaterialCostClassPubService` | 物料成本分类 |
| 物料公共查询 | `nc.pubitf.uapbd.IMaterialPubService` | 物料信息 |
| 物料成本信息回写 | `nc.pubitf.uapbd.IMaterialCostPubService` | 物料成本回写 |
| 物料计划信息回写 | `nc.pubitf.uapbd.IMaterialPlanPubService` | 物料计划回写 |
| 物料财务信息回写 | `nc.pubitf.uapbd.IMaterialFiPubService` | 物料财务回写 |
| 物料库存信息回写 | `nc.pubitf.uapbd.IMaterialStockPubService` | 物料库存回写 |
| 物料辅助属性查询 | `nc.pubitf.uapbd.assistant.IMarAssistantPubService` | 物料辅助属性 |
| 收支项目查询 | `nc.pubitf.uapbd.IInoutBusiClassPubService` | 收支项目 |

### 11.3 使用方式

所有接口均通过 `NCLocator` 获取：

```java
// 示例：查询物料信息
IMaterialPubService materialService = NCLocator.getInstance().lookup(IMaterialPubService.class);

// 示例：查询客户信息
ICustomerPubService customerService = NCLocator.getInstance().lookup(ICustomerPubService.class);

// 示例：查询会计期间
AccountCalendar calendar = AccountCalendar.getInstance();

// 示例：查询计量单位（工具类，直接调用静态方法）
MeasdocUtil.getMeasdocByCode(code);

// 示例：系统参数查询（工具类，直接调用静态方法）
SysInitQuery.getParaString(pkOrg, paramCode);
```

> **注意**：工具类（如 `AccountCalendar`、`MeasdocUtil`、`SysInitQuery`、`OrgSettingAccessor`、`LangSettingAccessor`）
> 不需要通过 NCLocator，直接调用静态方法；Service 接口需要通过 NCLocator 获取。

---

## 12. 常用日期类型

| 类 | 包路径 | 说明 |
|----|--------|------|
| `UFDate` | `nc.vo.pub.lang.UFDate` | NCC 日期类型，支持 `toString()` 转为 String |
| `UFDateTime` | `nc.vo.pub.lang.UFDateTime` | NCC 日期时间类型 |
| `UFDouble` | `nc.vo.pub.lang.UFDouble` | NCC 金额类型 |

```java
import nc.vo.pub.lang.UFDate;

// UFDate → String
UFDate startDate = hvo.getPlan_start_date();
if (startDate != null) {
    String dateStr = startDate.toString();
}
```
