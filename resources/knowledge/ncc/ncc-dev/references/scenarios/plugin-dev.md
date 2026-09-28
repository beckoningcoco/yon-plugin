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

## 示例3：事件监听器 — 项目档案推送到自定义档案（KYXMLB）同步

> 本示例综合运用了：BDCommonEvent 事件入口、系统参数组织级控制、自定义档案树形结构操作、
> 档案定义按组织查询、一级大类匹配、唯一性校验、BaseDAO 回写、删除前存在性校验等。

```java
package nc.hk.bs.pm.listener;

import nc.bs.businessevent.BusinessEvent;
import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.businessevent.bd.BDCommonEvent;
import nc.bs.dao.BaseDAO;
import nc.bs.dao.DAOException;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.framework.common.NCLocator;
import nc.bs.logging.Logger;
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.itf.bd.pub.IBDMetaDataIDConst;
import nc.pubitf.bd.accessor.GeneralAccessorFactory;
import nc.pubitf.bd.accessor.IGeneralAccessor;
import nc.pubitf.para.SysInitQuery;
import nc.vo.bd.accessor.IBDData;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.meta.BatchOperateVO;
import nc.vo.pim.project.ProjectHeadVO;
import nc.vo.pub.BusinessException;
import nc.vo.pub.lang.UFDate;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;

/**
 * 项目档案推送到自定义档案（KYXMLB）同步监听器
 *
 * 监听事件：
 * - 1002 新增后：项目档案新增 → 推送KYXMLB → 回写项目档案def20 → 回写立项单hdef3
 * - 1006 删除后：项目档案删除 → 删除KYXMLB档案 → 清空立项单hdef3
 *
 * 组织控制：通过系统参数 PRO_SYNC（组织级）控制是否启用同步，Y=启用
 *
 * 字段映射：
 * - project_code → code
 * - project_name → name
 * - hdef17 → def1
 * - plan_start_date → def5（UFDate → String）
 * - plan_finish_date → def6（UFDate → String）
 *
 * 一级大类匹配规则：KYXMLB根节点中，def17 = 项目档案的pk_eps
 */
public class ProjectDefdocSyncListener implements IBusinessListener {

    private static final String EVENT_ADD_AFTER = "1002";
    private static final String EVENT_DELETE_AFTER = "1006";

    /** KYXMLB 自定义档案编码 */
    private static final String DEFDOC_LIST_CODE = "KYXMLB";

    /** 系统参数编码：是否启用同步 */
    private static final String PARAM_SYNC_ENABLED = "PRO_SYNC";

    // ========== 服务缓存 ==========
    private IDefdocService defdocService;
    private IDefdocQryService defdocQryService;
    private BaseDAO baseDAO;

    private IDefdocService getDefdocService() {
        if (defdocService == null) {
            defdocService = NCLocator.getInstance().lookup(IDefdocService.class);
        }
        return defdocService;
    }

    private IDefdocQryService getDefdocQryService() {
        if (defdocQryService == null) {
            defdocQryService = NCLocator.getInstance().lookup(IDefdocQryService.class);
        }
        return defdocQryService;
    }

    private BaseDAO getBaseDAO() {
        if (baseDAO == null) {
            baseDAO = new BaseDAO();
        }
        return baseDAO;
    }

    // ========== 事件入口 ==========
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

            if (vo instanceof ProjectHeadVO) {
                ProjectHeadVO headVO = (ProjectHeadVO) vo;

                // 组织级参数控制：检查当前组织是否启用同步
                if (!isSyncEnabled(headVO.getPk_org())) {
                    Logger.info("项目档案[" + headVO.getProject_code()
                            + "]所属组织未启用" + PARAM_SYNC_ENABLED + "参数，跳过同步。");
                    return;
                }

                if (EVENT_ADD_AFTER.equals(eventType)) {
                    handleAddAfter(headVO);
                } else if (EVENT_DELETE_AFTER.equals(eventType)) {
                    handleDeleteAfter(headVO);
                }
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            ExceptionUtils.wrappException(e);
        }
    }

    /**
     * 判断指定组织是否启用同步功能
     */
    private boolean isSyncEnabled(String pkOrg) throws BusinessException {
        String value = SysInitQuery.getParaString(pkOrg, PARAM_SYNC_ENABLED);
        return "Y".equalsIgnoreCase(value);
    }

    /**
     * 新增后处理：推送自定义档案 + 回写
     */
    private void handleAddAfter(ProjectHeadVO headVO) throws BusinessException {
        String pkProject = headVO.getPrimaryKey();
        String pkOrg = headVO.getPk_org();
        String code = headVO.getProject_code();
        String name = headVO.getProject_name();
        String pkEps = headVO.getPk_eps() == null ? null : headVO.getPk_eps().toString();

        if (pkOrg == null || code == null || name == null) {
            Logger.warn("项目档案信息不完整，跳过推送。pk=" + pkProject);
            return;
        }

        // 1. 查询KYXMLB档案定义（组织级档案，按组织PK查询）
        String pkDefdoclist = queryDefdoclistPkByCode(DEFDOC_LIST_CODE, pkOrg);
        DefdocVO[] allDocs = queryDefdocByPklist(pkDefdoclist, pkOrg);
        if (allDocs == null || allDocs.length == 0) {
            throw new BusinessException("自定义档案[" + DEFDOC_LIST_CODE + "]未维护档案数据，请先维护一级大类。");
        }

        // 2. 匹配一级大类：def17 = pk_eps
        String parentPk = findParentCategory(allDocs, pkEps);
        if (parentPk == null) {
            throw new BusinessException("项目档案[" + code + "]的项目基本分类[pk_eps="
                    + pkEps + "]在自定义档案[" + DEFDOC_LIST_CODE
                    + "]中未匹配到对应的一级大类(def17)，请检查一级大类自定义项17的配置。");
        }

        // 3. 唯一性校验：同编码不允许重复
        for (DefdocVO doc : allDocs) {
            if (code.equals(doc.getCode()) && doc.getPid() != null
                    && doc.getPid().equals(parentPk)) {
                throw new BusinessException("自定义档案[" + DEFDOC_LIST_CODE + "]中已存在编码为["
                        + code + "]的档案，不允许重复推送。");
            }
        }

        // 4. 构建新增档案 VO
        String pkGroup = InvocationInfoProxy.getInstance().getGroupId();
        DefdocVO newDoc = new DefdocVO();
        newDoc.setCode(code);
        newDoc.setName(name);
        newDoc.setPk_org(pkOrg);
        newDoc.setPk_group(pkGroup);
        newDoc.setPid(parentPk);
        newDoc.setPk_defdoclist(pkDefdoclist);
        newDoc.setDr(0);
        newDoc.setEnablestate(2);

        // 自定义项映射
        Object def17Val = headVO.getHdef17();
        if (def17Val != null) {
            newDoc.setAttributeValue("def1", def17Val.toString());
        }

        UFDate planStart = headVO.getPlan_start_date();
        if (planStart != null) {
            newDoc.setAttributeValue("def5", planStart.toString());
        }

        UFDate planFinish = headVO.getPlan_finish_date();
        if (planFinish != null) {
            newDoc.setAttributeValue("def6", planFinish.toString());
        }

        // 5. 保存自定义档案
        BatchOperateVO batchVO = new BatchOperateVO();
        batchVO.setAddObjs(new DefdocVO[]{newDoc});
        getDefdocService().batchSaveDefdoc(pkOrg, batchVO);

        // 6. 获取保存后的档案主键
        String defdocPk = newDoc.getPrimaryKey();

        // 7. 回写项目档案 def20
        updateProjectDefdoc(pkProject, defdocPk);

        // 8. 回写立项单 hdef3（通过项目档案的 src_pk_bill）
        String srcPkBill = (String) headVO.getAttributeValue("src_pk_bill");
        if (srcPkBill != null && !srcPkBill.isEmpty()) {
            updateBillDefdoc(srcPkBill, defdocPk);
        }

        Logger.info("项目档案[" + code + "]已成功推送到自定义档案[" + DEFDOC_LIST_CODE
                + "]，档案PK=" + defdocPk);
    }

    /**
     * 删除后处理：删除自定义档案 + 清空立项单hdef3
     */
    private void handleDeleteAfter(ProjectHeadVO headVO) throws BusinessException {
        String code = headVO.getProject_code();
        String pkOrg = headVO.getPk_org();
        String defdocPk = headVO.getAttributeValue("hdef20") == null
                ? null : headVO.getAttributeValue("hdef20").toString();

        if (pkOrg == null || defdocPk == null || defdocPk.isEmpty()) {
            Logger.info("项目档案[" + code + "]未关联自定义档案，无需删除。");
            return;
        }

        // 先查询自定义档案是否存在，不存在则跳过
        DefdocVO[] defdocs = getDefdocQryService().queryDefdocByPk(new String[]{defdocPk});
        if (defdocs == null || defdocs.length == 0) {
            Logger.info("项目档案[" + code + "]关联的自定义档案PK[" + defdocPk
                    + "]未找到，可能已被删除，无需重复删除。");
        } else {
            BatchOperateVO batchVO = new BatchOperateVO();
            batchVO.setDelObjs(defdocs);
            getDefdocService().batchSaveDefdoc(pkOrg, batchVO);
        }

        // 清空立项单 hdef3
        String srcPkBill = (String) headVO.getAttributeValue("src_pk_bill");
        if (srcPkBill != null && !srcPkBill.isEmpty()) {
            clearBillDefdoc(srcPkBill);
        }

        Logger.info("项目档案[" + code + "]对应的自定义档案[" + defdocPk + "]已删除。");
    }

    // ========== 辅助方法 ==========

    /**
     * 匹配一级大类：在根节点（pid为空）中查找 def17 = pkEps 的唯一记录
     */
    private String findParentCategory(DefdocVO[] allDocs, String pkEps)
            throws BusinessException {
        String matchedPk = null;
        int matchCount = 0;

        for (DefdocVO doc : allDocs) {
            if (doc.getPid() == null || doc.getPid().isEmpty()) {
                Object def17 = doc.getAttributeValue("def17");
                if (def17 != null && def17.toString().equals(pkEps)) {
                    matchedPk = doc.getPrimaryKey();
                    matchCount++;
                }
            }
        }

        if (matchCount == 0) {
            return null;
        }
        if (matchCount > 1) {
            throw new BusinessException("项目基本分类[pk_eps=" + pkEps
                    + "]在自定义档案[" + DEFDOC_LIST_CODE
                    + "]中匹配到" + matchCount + "条一级大类记录(def17)，存在重复配置，请检查。");
        }
        return matchedPk;
    }

    /**
     * 根据档案定义PK查询全部档案值（组织级档案）
     */
    private DefdocVO[] queryDefdocByPklist(String pkDefdoclist, String pkOrg)
            throws BusinessException {
        String pkGroup = InvocationInfoProxy.getInstance().getGroupId();
        return getDefdocQryService().queryDefdocVOsByDoclistPk(pkDefdoclist, pkOrg, pkGroup);
    }

    /**
     * 根据档案编码查询档案定义PK（组织级档案，按组织PK查询）
     */
    private String queryDefdoclistPkByCode(String listcode, String pkOrg)
            throws BusinessException {
        IGeneralAccessor accessor = GeneralAccessorFactory
                .getAccessor(IBDMetaDataIDConst.DEFDOCLIST);
        IBDData defData = accessor.getDocByCode(pkOrg, listcode);
        if (defData == null) {
            throw new BusinessException("自定义档案列表[" + listcode + "]未找到，请检查配置。");
        }
        return defData.getPk();
    }

    /**
     * 回写项目档案 def20（推送的档案主键）
     */
    private void updateProjectDefdoc(String pkProject, String defdocPk) throws DAOException {
        String sql = "update bd_project set def20 = '" + defdocPk
                + "' where pk_project = '" + pkProject + "'";
        getBaseDAO().executeUpdate(sql);
    }

    /**
     * 回写立项单 hdef3（推送的档案主键）
     */
    private void updateBillDefdoc(String pkBill, String defdocPk) throws DAOException {
        String sql = "update pm_projectbuild set hdef3 = '" + defdocPk
                + "' where pk_projectbuild = '" + pkBill + "'";
        getBaseDAO().executeUpdate(sql);
    }

    /**
     * 清空立项单 hdef3
     */
    private void clearBillDefdoc(String pkBill) throws DAOException {
        String sql = "update pm_projectbuild set hdef3 = null where pk_projectbuild = '"
                + pkBill + "'";
        getBaseDAO().executeUpdate(sql);
    }

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
        }
        return obj;
    }
}
```

### 关键模式解读

1. **BDCommonEvent 基础档案事件**：`event instanceof BDCommonEvent` 判断 + `(BDCommonEvent) event` 强转，使用 `getObjs()` 获取事件对象（与 `BusinessEvent` 的 `getObject()` 不同）
2. **系统参数组织级控制**：`SysInitQuery.getParaString(pkOrg, paramCode)`，参数编码 + 组织PK，返回值 Y/N
3. **BaseDAO 实例缓存**：`BaseDAO` 作为成员变量懒加载，避免每次调用都 `new BaseDAO()`
4. **自定义档案定义按组织查询**：组织级档案的 `accessor.getDocByCode()` 第一个参数传 `pkOrg`（不是 `pkGroup`）
5. **DefdocVO 完整属性设置**：新增时需设置 `pk_defdoclist`、`dr(0)`、`enablestate(2)` 等必要字段
6. **删除前存在性校验**：通过 `queryDefdocByPk()` 先查再删，避免删除不存在的记录报错
7. **自定义项直接getter**：项目档案的 `hdef17` 可用 `headVO.getHdef17()` 直接获取（不需要 `getAttributeValue`）
8. **事件码 String 类型**：`event.getEventType()` 返回 String，用 `.equals()` 比较
9. **链式回写**：档案PK → 项目档案字段 → 立项单字段，通过自定义项关联
10. **异常分层处理**：`BusinessException` 直接抛出，其他异常包装为 `BusinessException`
