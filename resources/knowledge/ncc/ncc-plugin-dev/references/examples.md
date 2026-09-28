# NCC 业务插件示例代码

## 示例1：事件监听器 — 销售订单审批后自动生成请购单

```java
package nc.hk.bs.so.listener;

import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.framework.common.NCLocator;
import nc.bs.pu.event.PUBusinessEvent;
import nc.itf.uap.pf.IPfExchangeService;
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;
import nc.vo.pf.pub.util.SQLUtil;
import nc.vo.pu.m20.entity.PraybillItemVO;
import nc.vo.pu.m20.entity.PraybillVO;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;
import nc.vo.pubapp.pflow.PfUserObject;
import nc.vo.scmpub.res.billtype.POBillType;
import nc.vo.so.m30.entity.SaleOrderBVO;
import nc.vo.so.m30.entity.SaleOrderHVO;
import nc.vo.so.m30.entity.SaleOrderVO;
import nccloud.commons.lang.ArrayUtils;
import nccloud.dto.scmpub.script.entity.SCMScriptResultDTO;
import nccloud.pubitf.scmpub.pub.service.ISCMPubSaveCommitService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 销售订单审批后自动生成请购单业务插件(自动提交)
 */
public class SaleOrderCreatePrayBillListener implements IBusinessListener {
    public void doAction(IBusinessEvent event) throws BusinessException {
        if (event instanceof PUBusinessEvent) {
            PUBusinessEvent busiEvent = (PUBusinessEvent) event;
            Object obj = busiEvent.getObjs();
            if (obj == null) {
                return;
            }
            SaleOrderVO[] vos = null;
            if (obj instanceof SaleOrderVO[]) {
                vos = (SaleOrderVO[]) obj;
                if (vos.length == 0) {
                    return;
                }
            }
            try {
                List<String> billpkList = new ArrayList<>();
                Map<String, String> trantypeList = CreatePrayBillUtil.getDefdocTrantypecode();
                if (trantypeList == null) {
                    return;
                }
                List<SaleOrderVO> voList = new ArrayList<>();
                for (SaleOrderVO vo : vos) {
                    SaleOrderHVO hvo = vo.getParentVO();
                    if (trantypeList.containsKey(hvo.getVtrantypecode())) {
                        SaleOrderVO filteredVO = filterSaleOrderByFretexchange(vo);
                        if (filteredVO != null) {
                            voList.add(filteredVO);
                            billpkList.add(hvo.getPrimaryKey());
                        }
                    }
                }
                vos = voList.toArray(new SaleOrderVO[0]);
                if (ArrayUtils.isEmpty(vos)) {
                    return;
                }
                // 查询是否已生成过请购单（防重复）
                String[] billpks = billpkList.toArray(new String[0]);
                IMDPersistenceQueryService service = MDPersistenceService.lookupPersistenceQueryService();
                String whereSql = SQLUtil.buildSqlForIn("csourceid", billpks) + " and dr = 0";
                List<PraybillItemVO> items = (List<PraybillItemVO>) service.queryBillOfVOByCond(
                    PraybillItemVO.class, whereSql, false);
                if (items != null && !items.isEmpty()) {
                    List<String> uniqueBillnos = new ArrayList<>();
                    for (PraybillItemVO item : items) {
                        String billno = item.getVsourcecode();
                        if (!uniqueBillnos.contains(billno)) {
                            uniqueBillnos.add(billno);
                        }
                    }
                    String billnoStr = String.join(",", uniqueBillnos);
                    ExceptionUtils.wrappBusinessException(
                        "销售订单[" + billnoStr + "]已经生成请购单，请删除后重试!");
                }
                // 调用单据转换模板（30=销售订单 → 20=请购单）
                IPfExchangeService transferService = NCLocator.getInstance()
                    .lookup(IPfExchangeService.class);
                PraybillVO[] result = (PraybillVO[]) transferService.runChangeDataAry(
                    "30", "20", vos, null);
                if (result == null || result.length == 0) {
                    ExceptionUtils.wrappBusinessException("请购单转换异常:转换后VO为空");
                }
                for (PraybillVO vo : result) {
                    PraybillItemVO[] children = vo.getBVO();
                    int count = 0;
                    for (PraybillItemVO item : children) {
                        item.setAttributeValue("pseudocolumn", count++);
                        item.setCrowno(count + "0");
                    }
                }
                PfUserObject pfUserObject = new PfUserObject();
                try {
                    ISCMPubSaveCommitService saveCommitService =
                        (ISCMPubSaveCommitService) NCLocator.getInstance()
                            .lookup(ISCMPubSaveCommitService.class);
                    SCMScriptResultDTO scriptResult = saveCommitService.saveCommit(
                        result, pfUserObject, PraybillVO.class,
                        "SAVEBASE", "SAVE", POBillType.PrayBill.getCode());
                } catch (Exception e) {
                    ExceptionUtils.wrappBusinessException(
                        "生成的请购单保存提交时异常:" + e.getMessage());
                }
            } catch (Exception e) {
                ExceptionUtils.wrappException(e);
            }
        }
    }

    /**
     * 过滤销售订单表体，只保留fretexchange为0（非退换货）的行
     */
    private SaleOrderVO filterSaleOrderByFretexchange(SaleOrderVO saleOrderVO) {
        if (saleOrderVO == null || saleOrderVO.getChildrenVO() == null) {
            return saleOrderVO;
        }
        if (saleOrderVO.getChildrenVO().length == 0) {
            return saleOrderVO;
        }
        SaleOrderBVO[] originalItems = saleOrderVO.getChildrenVO();
        List<SaleOrderBVO> filteredItems = new ArrayList<>();
        for (SaleOrderBVO item : originalItems) {
            Object fretexchangeValue = item.getAttributeValue("fretexchange");
            if (fretexchangeValue instanceof Integer && (Integer) fretexchangeValue == 0) {
                filteredItems.add(item);
            }
        }
        if (filteredItems.isEmpty()) {
            return null;
        }
        SaleOrderVO filteredVO = new SaleOrderVO();
        filteredVO.setParentVO(saleOrderVO.getParentVO());
        filteredVO.setChildrenVO(filteredItems.toArray(new SaleOrderBVO[0]));
        return filteredVO;
    }
}
```

### 关键模式解读

1. **事件类型判断**：`event instanceof PUBusinessEvent` 确保是采购/销售类事件
2. **空值防护**：每一步都检查 null 和空数组
3. **交易类型过滤**：通过自定义工具类获取需要处理的交易类型
4. **防重复机制**：查询目标单据表体是否已存在来源单据的 PK
5. **单据转换**：`IPfExchangeService.runChangeDataAry(源单据类型, 目标单据类型, 源VO, null)`
6. **行号设置**：转换后必须设置 `pseudocolumn` 和 `crowno`
7. **保存提交**：通过 `ISCMPubSaveCommitService.saveCommit()` 一步完成保存和提交

---

## 示例2：业务逻辑类 — 采购发票与发票登记档案关联

```java
package nc.hk.bs.pu.poinvoice.listener;

import nc.bs.framework.common.NCLocator;
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.vo.bd.meta.BatchOperateVO;
import nc.vo.pub.BusinessException;
import nc.bs.logging.Logger;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.pu.m25.entity.InvoiceHeaderVO;
import nc.vo.pu.m25.entity.InvoiceVO;
import nc.vo.pp.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 采购发票与发票登记档案关联逻辑处理类
 */
public class PurchaseInvoiceRegLogic implements IBusinessListener {
    // 系统发票号对应DefdocVO的def5字段
    private static final String SYS_INVOICE_NO_FIELD = "def5";
    // 采购发票头关联的登记档案ID字段（vdef2）
    private static final String INVOICE_HEADER_REG_ID_FIELD = "vdef2";

    private IDefdocQryService defdocQryService;
    private IDefdocService defdocService;

    private IDefdocQryService getDefdocQryService() {
        if (defdocQryService == null) {
            defdocQryService = NCLocator.getInstance().lookup(IDefdocQryService.class);
        }
        return defdocQryService;
    }

    private IDefdocService getDefdocService() {
        if (defdocService == null) {
            defdocService = NCLocator.getInstance().lookup(IDefdocService.class);
        }
        return defdocService;
    }

    public void doAction(IBusinessEvent event) throws BusinessException {
        // 事件分发：根据事件类型调用不同的处理方法
        String eventType = event.getEventType();
        Object obj = event.getObjs();
        // 具体的事件分发逻辑...
    }

    /**
     * 插入前校验发票登记档案是否已关联其他发票
     */
    public void checkRegBeforeInsert(InvoiceVO invoiceVO) throws BusinessException {
        InvoiceHeaderVO headerVO = invoiceVO.getParentVO();
        String regId = (String) headerVO.getAttributeValue(INVOICE_HEADER_REG_ID_FIELD);
        if (StringUtils.isEmpty(regId)) {
            return;
        }
        DefdocVO regDoc = queryDefdocById(regId);
        if (regDoc != null) {
            String sysInvoiceNo = (String) regDoc.getAttributeValue(SYS_INVOICE_NO_FIELD);
            if (!StringUtils.isEmpty(sysInvoiceNo)) {
                throw new BusinessException("所选发票登记档案已关联其他采购发票，请重新选择！");
            }
        }
    }

    /**
     * 插入后：回写采购发票号到档案的def5字段
     */
    public void writeInvoiceNoAfterInsert(InvoiceVO invoiceVO) throws BusinessException {
        InvoiceHeaderVO headerVO = invoiceVO.getParentVO();
        String regId = (String) headerVO.getAttributeValue(INVOICE_HEADER_REG_ID_FIELD);
        String invoiceNo = headerVO.getVbillcode();
        if (StringUtils.isEmpty(regId) || StringUtils.isEmpty(invoiceNo)) {
            return;
        }
        updateRegSysInvoiceNo(regId, invoiceNo);
    }

    /**
     * 修改后：仅档案ID变化时，清空原档案def5并回写新档案def5
     */
    public void handleRegAfterUpdate(InvoiceVO oldInvoiceVO, InvoiceVO newInvoiceVO)
            throws BusinessException {
        InvoiceHeaderVO oldHeader = oldInvoiceVO.getParentVO();
        InvoiceHeaderVO newHeader = newInvoiceVO.getParentVO();
        String oldRegId = (String) oldHeader.getAttributeValue(INVOICE_HEADER_REG_ID_FIELD);
        String newRegId = (String) newHeader.getAttributeValue(INVOICE_HEADER_REG_ID_FIELD);
        if (StringUtils.equals(oldRegId, newRegId)) {
            return;
        }
        List<DefdocVO> updateDocs = new ArrayList<>();
        if (!StringUtils.isEmpty(oldRegId)) {
            DefdocVO oldRegDoc = queryDefdocById(oldRegId);
            if (oldRegDoc != null) {
                oldRegDoc.setAttributeValue(SYS_INVOICE_NO_FIELD, null);
                updateDocs.add(oldRegDoc);
            }
        }
        if (!StringUtils.isEmpty(newRegId) && !StringUtils.isEmpty(newHeader.getVbillcode())) {
            DefdocVO newRegDoc = queryDefdocById(newRegId);
            if (newRegDoc != null) {
                newRegDoc.setAttributeValue(SYS_INVOICE_NO_FIELD, newHeader.getVbillcode());
                updateDocs.add(newRegDoc);
            }
        }
        if (!updateDocs.isEmpty()) {
            batchUpdateRegDef5(updateDocs);
        }
    }

    private void updateRegSysInvoiceNo(String regId, String invoiceNo)
            throws BusinessException {
        try {
            DefdocVO[] defdocVOs = getDefdocQryService().queryDefdocByPk(new String[]{regId});
            if (defdocVOs == null || defdocVOs.length == 0) {
                Logger.warn("未查询到发票登记档案，ID：" + regId);
                return;
            }
            DefdocVO regDoc = defdocVOs[0];
            regDoc.setAttributeValue(SYS_INVOICE_NO_FIELD, invoiceNo);
            BatchOperateVO batchVO = new BatchOperateVO();
            batchVO.setUpdObjs(new DefdocVO[]{regDoc});
            getDefdocService().batchSaveDefdoc(regDoc.getPk_org(), batchVO);
        } catch (Exception e) {
            Logger.error("更新发票登记档案def5异常，ID：" + regId, e);
            throw new BusinessException("更新发票登记档案异常：" + e.getMessage());
        }
    }

    private void batchUpdateRegDef5(List<DefdocVO> updateDocs) throws BusinessException {
        try {
            Map<String, List<DefdocVO>> orgGroupMap = new HashMap<>();
            for (DefdocVO doc : updateDocs) {
                String pkOrg = doc.getPk_org();
                orgGroupMap.computeIfAbsent(pkOrg, k -> new ArrayList<>()).add(doc);
            }
            for (Map.Entry<String, List<DefdocVO>> entry : orgGroupMap.entrySet()) {
                BatchOperateVO batchVO = new BatchOperateVO();
                batchVO.setUpdObjs(entry.getValue().toArray(new DefdocVO[0]));
                getDefdocService().batchSaveDefdoc(entry.getKey(), batchVO);
            }
        } catch (Exception e) {
            Logger.error("批量更新发票登记档案def5异常", e);
            throw new BusinessException("批量更新发票登记档案异常：" + e.getMessage());
        }
    }

    private DefdocVO queryDefdocById(String regId) throws BusinessException {
        try {
            DefdocVO[] defdocVOs = getDefdocQryService().queryDefdocByPk(new String[]{regId});
            return (defdocVOs != null && defdocVOs.length > 0) ? defdocVOs[0] : null;
        } catch (Exception e) {
            Logger.error("查询发票登记档案异常，ID：" + regId, e);
            throw new BusinessException("查询发票登记档案异常：" + e.getMessage());
        }
    }
}
```

### 关键模式解读

1. **服务接口延迟加载**：通过私有方法 + null 检查实现懒加载
2. **按生命周期拆分方法**：`checkBeforeInsert`、`writeAfterInsert`、`handleAfterUpdate` 等
3. **自由字段访问**：使用 `getAttributeValue()` / `setAttributeValue()` 访问自定义字段
4. **批量更新按组织分组**：`batchSaveDefdoc` 需要按 `pk_org` 分组调用
5. **日志记录**：使用 `Logger.error()` / `Logger.warn()` 记录异常
6. **异常处理**：捕获异常后包装为 `BusinessException` 抛出

---

## 示例3：事件监听器 — 项目审批单审批后同步数据到自定义档案

```java
package nc.hk.bs.pm.listener;

import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.framework.common.NCLocator;
import nc.bs.logging.Logger;
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.md.IBDData;
import nc.md.IGeneralAccessor;
import nc.md.commons.MetaDataConstant;
import nc.md.util.GeneralAccessorFactory;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.meta.BatchOperateVO;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * 项目审批单审批后同步数据到自定义档案
 *
 * <p>触发时机：项目审批单审批后（事件码 1020）
 * <p>业务逻辑：将项目审批单的关键信息同步写入自定义档案的对应字段
 */
public class ProjectApproveSyncDefdocListener implements IBusinessListener {

    // ==================== NCC 业务事件码 ====================

    /** 审批后 */
    private static final int EVENT_APPROVE_AFTER = 1020;

    // ==================== 以下常量需根据实际情况调整 ====================

    /** 自定义档案定义编码（对应 bd_defdoclist 的 code） */
    private static final String DEFDOC_LIST_CODE = "YOUR_LIST_CODE";

    /** 项目审批单上的项目编号字段（示例：自定义字段 vdef1） */
    private static final String PROJECT_CODE_FIELD = "vdef1";

    /** 项目审批单上的项目名称字段（示例：自定义字段 vdef2） */
    private static final String PROJECT_NAME_FIELD = "vdef2";

    /** 自定义档案上存储项目名称的字段（示例：def1） */
    private static final String DEFDOC_PROJECT_NAME_FIELD = "def1";

    // ==================== 服务接口（延迟加载） ====================

    private IDefdocQryService defdocQryService;
    private IDefdocService defdocService;

    private IDefdocQryService getDefdocQryService() {
        if (defdocQryService == null) {
            defdocQryService = NCLocator.getInstance().lookup(IDefdocQryService.class);
        }
        return defdocQryService;
    }

    private IDefdocService getDefdocService() {
        if (defdocService == null) {
            defdocService = NCLocator.getInstance().lookup(IDefdocService.class);
        }
        return defdocService;
    }

    // ==================== 事件入口 ====================

    @Override
    public void doAction(IBusinessEvent event) throws BusinessException {
        try {
            // 1. 只处理审批后事件（1020）
            if (event.getEventType() != EVENT_APPROVE_AFTER) {
                return;
            }

            // 2. 获取事件数据
            Object obj = event.getObjs();
            if (obj == null) {
                return;
            }
            // TODO: 替换为你实际的项目审批单 VO 类型
            if (!(obj instanceof nc.vo.pm.xxx.ProjectApproveVO[])) {
                return;
            }
            nc.vo.pm.xxx.ProjectApproveVO[] vos =
                    (nc.vo.pm.xxx.ProjectApproveVO[]) obj;
            if (vos.length == 0) {
                return;
            }

            // 3. 逐单处理
            for (nc.vo.pm.xxx.ProjectApproveVO vo : vos) {
                syncProjectToDefdoc(vo);
            }

        } catch (Exception e) {
            ExceptionUtils.wrappException(e);
        }
    }

    // ==================== 核心同步逻辑 ====================

    /**
     * 将单个项目审批单数据同步到自定义档案
     *
     * <p>同步策略：
     * <ul>
     *   <li>根据自定义档案定义编码加载全部档案记录</li>
     *   <li>按项目编号匹配，已存在 → 更新字段，不存在 → 新增档案记录</li>
     * </ul>
     */
    private void syncProjectToDefdoc(nc.vo.pm.xxx.ProjectApproveVO vo)
            throws BusinessException {
        try {
            // TODO: 替换为你实际的表头 VO 类
            nc.vo.pm.xxx.ProjectApproveHVO headerVO = vo.getParentVO();
            if (headerVO == null) {
                return;
            }

            // 4. 提取项目审批单上的关键字段
            String projectCode = (String) headerVO.getAttributeValue(PROJECT_CODE_FIELD);
            String projectName = (String) headerVO.getAttributeValue(PROJECT_NAME_FIELD);

            if (projectCode == null || projectCode.trim().isEmpty()) {
                Logger.warn("项目审批单[" + headerVO.getPrimaryKey() + "]的项目编号为空，跳过同步");
                return;
            }

            // 5. 查询自定义档案中是否已存在该项目编号的记录
            DefdocVO existingDoc = queryDefdocByProjectCode(projectCode);

            if (existingDoc != null) {
                // 6a. 已存在 → 更新
                existingDoc.setAttributeValue(DEFDOC_PROJECT_NAME_FIELD, projectName);
                // TODO: 在这里添加更多需要同步的字段...
                updateDefdoc(existingDoc);
                Logger.info("更新自定义档案成功，项目编号：" + projectCode);
            } else {
                // 6b. 不存在 → 新增
                DefdocVO newDoc = createNewDefdoc(headerVO, projectCode, projectName);
                insertDefdoc(newDoc);
                Logger.info("新增自定义档案成功，项目编号：" + projectCode);
            }

        } catch (Exception e) {
            Logger.error("同步项目[" + vo.getParentVO().getPrimaryKey() + "]到自定义档案异常", e);
            throw new BusinessException("同步项目到自定义档案失败：" + e.getMessage());
        }
    }

    // ==================== 档案查询方法 ====================

    /**
     * 根据自定义档案定义编码查询自定义档案维护内容，再按项目编号过滤
     *
     * @param projectCode 项目编号
     * @return 匹配的 DefdocVO，未找到返回 null
     */
    private DefdocVO queryDefdocByProjectCode(String projectCode) throws BusinessException {
        try {
            String pkGroup = InvocationInfoProxy.getInstance().getGroupId();
            IGeneralAccessor accessor = GeneralAccessorFactory.getAccessor(
                    MetaDataConstant.DEFDOCLIST);
            IBDData defData = accessor.getDocByCode(pkGroup, DEFDOC_LIST_CODE);

            if (defData == null) {
                Logger.warn("未找到自定义档案定义，编码：" + DEFDOC_LIST_CODE);
                return null;
            }

            String pkDefdoclist = defData.getPk();
            DefdocVO[] vos = getDefdocQryService().queryDefdocVOsByDoclistPk(
                    pkDefdoclist, pkGroup, pkGroup);

            if (vos == null || vos.length == 0) {
                return null;
            }

            // 在返回的档案列表中按编码匹配
            for (DefdocVO doc : vos) {
                if (projectCode.equals(doc.getCode())) {
                    return doc;
                }
            }
            return null;

        } catch (Exception e) {
            Logger.error("查询自定义档案异常，项目编号：" + projectCode, e);
            throw new BusinessException("查询自定义档案异常：" + e.getMessage());
        }
    }

    // ==================== 档案构造与保存方法 ====================

    /**
     * 构造新的自定义档案 VO
     */
    private DefdocVO createNewDefdoc(nc.vo.pm.xxx.ProjectApproveHVO headerVO,
            String projectCode, String projectName) throws BusinessException {
        DefdocVO defdocVO = new DefdocVO();

        // 设置档案基本信息
        defdocVO.setCode(projectCode);            // 档案编码 = 项目编号
        defdocVO.setName(projectName);             // 档案名称 = 项目名称
        defdocVO.setPk_group(InvocationInfoProxy.getInstance().getGroupId());
        defdocVO.setPk_org(headerVO.getPk_org());  // 组织

        // 设置自定义字段
        defdocVO.setAttributeValue(DEFDOC_PROJECT_NAME_FIELD, projectName);

        // TODO: 在这里添加更多字段映射...
        // defdocVO.setAttributeValue("def2", headerVO.getAttributeValue("vdef3"));

        return defdocVO;
    }

    /**
     * 新增自定义档案
     */
    private void insertDefdoc(DefdocVO defdocVO) throws BusinessException {
        try {
            BatchOperateVO batchVO = new BatchOperateVO();
            batchVO.setAddObjs(new DefdocVO[]{defdocVO});
            getDefdocService().batchSaveDefdoc(defdocVO.getPk_org(), batchVO);
        } catch (Exception e) {
            Logger.error("新增自定义档案异常", e);
            throw new BusinessException("新增自定义档案失败：" + e.getMessage());
        }
    }

    /**
     * 更新自定义档案
     */
    private void updateDefdoc(DefdocVO defdocVO) throws BusinessException {
        try {
            BatchOperateVO batchVO = new BatchOperateVO();
            batchVO.setUpdObjs(new DefdocVO[]{defdocVO});
            getDefdocService().batchSaveDefdoc(defdocVO.getPk_org(), batchVO);
        } catch (Exception e) {
            Logger.error("更新自定义档案异常", e);
            throw new BusinessException("更新自定义档案失败：" + e.getMessage());
        }
    }
}
```

### 关键模式解读

1. **事件码自定义常量**：`IBusinessEvent` 没有事件码常量，在当前类中定义 `EVENT_APPROVE_AFTER = 1020`
2. **自定义档案查询**：通过 `GeneralAccessorFactory` → `accessor.getDocByCode()` → `IDefdocQryService.queryDefdocVOsByDoclistPk()` 三步获取档案数据
3. **先查后写策略**：加载全部档案记录后按 `code` 匹配，存在则更新、不存在则新增
4. **档案保存**：通过 `IDefdocService.batchSaveDefdoc(pkOrg, batchVO)` 统一处理，`BatchOperateVO.setAddObjs` / `setUpdObjs` 区分新增和更新
5. **`InvocationInfoProxy`**：获取当前登录用户的集团 PK（`getGroupId()`），用于查询和组织隔离
