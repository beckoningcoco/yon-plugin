# NCC 后台任务产品源码参考

> 以下为 NCC 产品中的真实后台任务实现代码，用于学习编码模式和 API 用法。

## 源码1：设备卡片同步固定资产卡片财务数据

> 来源：`nc.impl.aim.equip.SynchFinanceDataWorkPlugin`
> 功能：定时将固定资产模块的财务数据同步到设备卡片
> 作者：wukq，2012-09-13，since 6.3

### 完整源码

```java
package nc.impl.aim.equip;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;
import nc.bs.pub.taskcenter.BgWorkingContext;
import nc.bs.pub.taskcenter.IBackgroundWorkPlugin;
import nc.impl.am.common.InSqlManager;
import nc.impl.am.db.VOPersistUtil;
import nc.itf.aim.pub.IEquipService;
import nc.itf.am.prv.IDataService;
import nc.itf.am.pub.IStatusService;
import nc.pubitf.initgroup.InitGroupQuery;
import nc.vo.aim.equip.EquipHeadVO;
import nc.vo.am.common.util.ArrayUtils;
import nc.vo.am.common.util.StringUtils;
import nc.vo.am.constant.ModuleConst;
import nc.vo.am.proxy.AMProxy;
import nc.vo.am.status.EquipStatusConst;
import nc.vo.fa.asset.AssetVO;
import nc.vo.pub.BusinessException;
import nc.vo.pub.lang.UFDouble;

/**
 * 设备卡片同步固定资产卡片财务数据后台任务
 * @author wukq
 * @date 2012-09-13
 * @since 6.3
 */
public class SynchFinanceDataWorkPlugin implements IBackgroundWorkPlugin {

    IDataService dateService = AMProxy.lookup(IDataService.class);  // 公共查询服务
    public final static String ASSET_ORG = "assetorg";              // 维修组织阈值参数名

    @Override
    public PreAlertObject executeTask(BgWorkingContext bgwc) throws BusinessException {
        // 判断固定资产模块是否启用
        boolean faStarted = InitGroupQuery.isEnabled(bgwc.getGroupId(),
                ModuleConst.FA_FUNCCODE);
        if (!faStarted) {
            throw new BusinessException("没有启用固定资产模块");
        }

        // 根据组织/集团条件查询设备卡片主键
        String[] pk_equips = dateService.queryPksByWhereSql(EquipHeadVO.class,
                getEquipPksSql(bgwc.getPk_orgs(), bgwc.getGroupId()));

        // 调用后台取财务数据
        Map<String, AssetVO> financeDatas = null;
        try {
            financeDatas = AMProxy.lookup(IEquipService.class).getFinanceDatas(
                    ArrayUtils.changeToList(pk_equips));
        } catch (BusinessException ex) {
            throw new BusinessException("取财务数据出现异常");
        }

        if (financeDatas == null || financeDatas.isEmpty()) {
            return null; // ⚠️ 产品代码中存在 return null，但建议客开代码使用 RETURNNOTHING
        }

        // 查询设备卡片 VO
        Map<String, EquipHeadVO> equipVOMap = AMProxy.lookup(
                IEquipService.class).queryEquipHeadVOs(pk_equips);

        // 设备卡片财务数据设值并更新
        setFinancedatas(financeDatas, equipVOMap);

        // 不需要发送消息
        PreAlertObject alert = new PreAlertObject();
        alert.setReturnType(PreAlertReturnType.RETURNNOTHING);
        return alert;
    }

    /**
     * 将财务信息设置到设备卡片并更新到数据库
     */
    private void setFinancedatas(Map<String, AssetVO> financeDatas,
            Map<String, EquipHeadVO> equipVOMap) {
        List<EquipHeadVO> equipList = new ArrayList<EquipHeadVO>();
        for (String pk_equip : equipVOMap.keySet()) {
            AssetVO assetVo = financeDatas.get(pk_equip);
            EquipHeadVO equipHeadVO = equipVOMap.get(pk_equip);

            if (assetVo != null) {
                // UFDouble 空值保护模式：null 转 ZERO_DBL
                UFDouble originValue = assetVo.getOriginvalue() == null ? UFDouble.ZERO_DBL
                        : assetVo.getLocaloriginvalue();
                UFDouble accudep = assetVo.getAccudep() == null ? UFDouble.ZERO_DBL
                        : assetVo.getAccudep();
                UFDouble predevaluate = assetVo.getPredevaluate() == null ? UFDouble.ZERO_DBL
                        : assetVo.getPredevaluate();
                UFDouble depamount = assetVo.getDepamount() == null ? UFDouble.ZERO_DBL
                        : assetVo.getDepamount();

                // 设置财务字段
                equipHeadVO.setOrigin_value(originValue);          // 原值
                equipHeadVO.setAccu_dep(accudep);                   // 累计折旧
                equipHeadVO.setNew_value(originValue.sub(accudep)); // 净值
                equipHeadVO.setSalvage(assetVo.getSalvage());       // 净残值
                equipHeadVO.setSalvage_rate(assetVo.getSalvagerate()); // 净残值率
                equipHeadVO.setPre_devaluate(predevaluate);         // 减值准备
                equipHeadVO.setNet_money(originValue.sub(accudep).sub(predevaluate)); // 净额
                equipHeadVO.setService_month(assetVo.getNaturemonth()); // 使用月限
                equipHeadVO.setUsed_month(assetVo.getUsedmonth());  // 已计提期数
                equipHeadVO.setBegin_date(assetVo.getBegin_date()); // 开始使用日期
                equipHeadVO.setDep_amount(depamount);               // 月折旧额
                equipList.add(equipHeadVO);
            }
        }
        // 批量更新 VO 到数据库
        VOPersistUtil.update(equipList.toArray(new EquipHeadVO[0]));
    }

    /**
     * 后台任务获取设备卡片默认条件
     * ⭐ 典型模式：有组织按组织过滤，无组织按集团过滤
     */
    private String getEquipPksSql(String[] assetorgs, String pk_group) throws BusinessException {
        StringBuffer sb = new StringBuffer();
        sb.append(" dr = 0 ");
        sb.append(" and associate_flag = 'Y' ");    // 需要固定资产核算的设备
        sb.append(" and pk_card <> '~'");            // 资产卡片不为空
        sb.append(" and pk_used_status in ");
        sb.append(getStatusSQLCondition());

        // ⭐ 组织 vs 集团判断模式
        if (assetorgs != null && assetorgs.length > 0) {
            sb.append(" and pk_org in ");
            sb.append(getOrgSQLCondition(assetorgs));
        } else if (StringUtils.isNotEmpty(pk_group)) {
            sb.append(" and pk_group = '");
            sb.append(pk_group);
            sb.append("'");
        }

        return sb.toString();
    }

    private String getOrgSQLCondition(String[] pk_orgs) {
        // InSqlManager 将数组转为 SQL IN 子句
        return InSqlManager.getInSQLValue(pk_orgs);
    }

    private String getStatusSQLCondition() throws BusinessException {
        // 通过服务查询状态主键
        List<String> pk_status = AMProxy.lookup(IStatusService.class)
                .getStatusPKs(new Integer[]{
                    EquipStatusConst.freeze_type,   // 封存
                    EquipStatusConst.unused_type,    // 闲置
                    EquipStatusConst.used_type       // 在用
                });
        return InSqlManager.getInSQLValue(pk_status);
    }
}
```

### 编码模式总结

| 模式 | 说明 |
|------|------|
| **模块启用检查** | `InitGroupQuery.isEnabled(pkGroup, funcCode)` — 先检查依赖模块是否启用 |
| **组织/集团判断** | `getPk_orgs()` 非空则按组织过滤，否则按 `getGroupId()` 过滤 |
| **服务查找** | `AMProxy.lookup(IXxxService.class)` — 资产管理模块专用代理 |
| **批量 VO 更新** | `VOPersistUtil.update(vos)` — 比 BaseDAO.executeUpdate 更简便 |
| **SQL IN 构建** | `InSqlManager.getInSQLValue(array/list)` — 安全地构建 IN 子句 |
| **UFDouble 空值保护** | `value == null ? UFDouble.ZERO_DBL : value` — 避免空指针 |
| **UFDouble 计算** | `originValue.sub(accudep).sub(predevaluate)` — 链式计算 |
| **RETURNNOTHING** | 不需要消息通知时使用 |
| **⚠️ return null** | 产品代码中存在，但客开代码建议用 `RETURNNOTHING` 代替 |

---

## 源码2：银行账户余额自动下载（集团）

> 来源：`nc.bs.obm.backgroudworkplugin.BalanceAutoDownloadGroupBGWorkPlugin`
> 功能：定时从银行端自动下载账户余额，返回格式化预警消息
> 作者：guqiangb，2011-4-6，since NC6.0

### 关键编码模式

#### 1. RETURNFORMATMSG + IAlertMessage 完整模式 ⭐

这是**最复杂的返回类型**——不仅返回消息，还返回格式化的表格数据（可在预警平台以表格形式展示）。

```java
// 步骤1：创建 IAlertMessage 实现类的实例
IAlertMessage remsg = new BalanceAlertMsg();  // BalanceAlertMsg implements IAlertMessage

// 步骤2：设置消息类型（INFO / WARN / ERROR）
remsg.setMsgType(PayStateAlertMsg.INFO);

// 步骤3：设置表格体数据（Object[][] 格式，每行一个 Object[]）
Object[][] bodyValue = new Object[condvos.length][];
for (int i = 0; i < condvos.length; i++) {
    bodyValue[i] = new Object[]{
        "条件描述",    // 第1列
        "单位名称",    // 第2列
        begDate,      // 第3列
        endDate,      // 第4列
        "结果消息"     // 第5列
    };
}
remsg.setBodyValue(bodyValue);

// 步骤4：组装 PreAlertObject
PreAlertObject pao = new PreAlertObject();
pao.setReturnType(PreAlertReturnType.RETURNFORMATMSG);  // 格式化消息
pao.setReturnObj(remsg);                                  // ⭐ 设置 IAlertMessage 对象
pao.setMsgTitle("银行账户余额下载(集团)");                  // 消息标题
return pao;
```

> ⚡ **关键区别**：
> - `RETURNMESSAGE`：只返回字符串 `pao.setMsgContent("文本")`
> - `RETURNFORMATMSG`：返回格式化表格 `pao.setReturnObj(IAlertMessage实例)`，表格数据通过 `setBodyValue(Object[][])` 设置

#### 2. IAlertMessage 接口实现参考

```java
// 产品中的实现类：BalanceAlertMsg
public class BalanceAlertMsg implements IAlertMessage {
    private int msgType;        // 消息类型：INFO / WARN / ERROR
    private Object[][] bodyValue; // 表格数据

    // getter/setter...
    public void setMsgType(int type) { this.msgType = type; }
    public void setBodyValue(Object[][] body) { this.bodyValue = body; }
}
```

#### 3. KeyMap 实际类型为 LinkedHashMap

```java
// KeyMap 的实际类型是 LinkedHashMap<String, Object>
LinkedHashMap<String, Object> keyMap = new LinkedHashMap<String, Object>();
keyMap = context.getKeyMap();

// 取阈值参数
String pk_org = (String) keyMap.get("pk_group");   // ⭐ 注意：阈值参数名可以自定义
String pk_funtype = (String) keyMap.get("funtype");  // 功能类型
String pk_banktype = (String) keyMap.get("pk_banktype"); // 银行类型（多选，逗号分隔）
```

#### 4. 多选阈值参数的处理模式

```java
// 多选阈值：值为逗号分隔字符串
String pk_banktype = (String) keyMap.get("pk_banktype");
if (StringUtil.isNotNull(pk_banktype)) {
    String[] pk_banktypes = pk_banktype.split(",");
    // 逐个匹配...
}
```

#### 5. 多组织分批处理模式 ⭐

```java
// 按组织分组处理：每个组织单独调用银行接口
Map<String, ArrayList<ObmAccountIDVO>> ordermap = new HashMap<>();

// 遍历每个组织
Iterator<String> it = ordermap.keySet().iterator();
while (it.hasNext()) {
    String pk_org = it.next();
    ObmAccountIDVO[] arr_subacc = ordermap.get(pk_org).toArray(new ObmAccountIDVO[0]);

    // 构建查询条件
    BalanceQueryVO qvo = new BalanceQueryVO(BalanceQueryVO.ACCTYPEOF_IDVO);
    qvo.setPk_corp(pk_org);
    qvo.setBankaccssubID(arr_subacc);
    // ...

    // 调用远程服务
    IEbankBalanceManageService querysev = NCLocator.getInstance()
            .lookup(IEbankBalanceManageService.class.getName());  // ⭐ 用 .getName() 查找
    ObmRetVO[] yevo = querysev.downloadBalanceOnline(qvo, "OBM");

    // 收集结果
    bodyvalueArr.add(remsg.getBodyValue());
}

// 合并多个组织的结果
if (bodyvalueArr != null && bodyvalueArr.size() > 0) {
    remsg = new BalanceAlertMsg();
    remsg.setBodyValue(getMergeBodyValue(bodyvalueArr));  // 合并表格数据
}
```

#### 6. MDPersistenceService 两种查询方式

```java
// 方式1：查询返回 NCObject[]（需要 getContainmentObject 转换）
NCObject[] nvo = MDPersistenceService.lookupPersistenceQueryService()
        .queryBillOfNCObjectByCond(EbankDownLoadAggVO.class, whereSql, false);
if (nvo != null) {
    EbankDownLoadAggVO aggvo = (EbankDownLoadAggVO) nvo[0].getContainmentObject();
    EbankDownLoadVO[] children = (EbankDownLoadVO[]) aggvo.getChildrenVO();
}

// 方式2：保存数据
MDPersistenceService.lookupPersistenceService()
        .saveBill(logvos.toArray(new EbankAutoDownLogVO[0]));
```

#### 7. GeneralAccessorFactory 按编码查基础数据

```java
// 通过编码获取基础数据主键
IBDData data = GeneralAccessorFactory
        .getAccessor(IBDMetaDataIDConst.BANKTYPE)  // 银行类型档案
        .getDocByCode(IOrgConst.GLOBEORG, banktypecode);  // 全局组织 + 编码
if (data != null) {
    String pk = data.getPk();
}
```

#### 8. VO 状态设置与保存

```java
EbankAutoDownLogVO downloadlogVO = new EbankAutoDownLogVO();
downloadlogVO.setAttributeValue("down_date", new UFDate());
downloadlogVO.setAttributeValue("down_time", new UFTime(System.currentTimeMillis()));
downloadlogVO.setStatus(VOStatus.NEW);  // ⭐ 新增时必须设为 NEW

// 批量保存
MDPersistenceService.lookupPersistenceService()
        .saveBill(logvos.toArray(new EbankAutoDownLogVO[0]));
```

### 编码模式总结

| 模式 | 说明 |
|------|------|
| **RETURNFORMATMSG + IAlertMessage** | 格式化表格消息：`pao.setReturnObj(IAlertMessage实例)`，表格数据通过 `setBodyValue(Object[][])` 设置 |
| **KeyMap = LinkedHashMap** | `context.getKeyMap()` 返回 `LinkedHashMap<String, Object>` |
| **多选阈值处理** | 值为逗号分隔字符串，`split(",")` 拆分后逐个匹配 |
| **多组织分批处理** | 按 org 分组 Map，每个 org 单独调用接口，最后合并结果 |
| **NCObject 查询** | `queryBillOfNCObjectByCond` 返回 `NCObject[]`，需 `.getContainmentObject()` 转换 |
| **MD 保存** | `MDPersistenceService.lookupPersistenceService().saveBill(vos)` — 批量保存 VO |
| **VOStatus.NEW** | 新增 VO 保存前必须 `setStatus(VOStatus.NEW)` |
| **GeneralAccessorFactory** | 按编码查基础数据主键：`getAccessor(档案ID).getDocByCode(org, code)` |
| **NCLocator 两种查找** | `.lookup(Class)` 或 `.lookup(className.getName())` 两种写法均可 |
| **模块专用日志** | `ObmLog.error(msg, e, getClass(), "methodName")` — 比 Logger 更带业务上下文 |
