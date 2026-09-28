# NCC 后台任务示例代码

> ⚠️ **核心规则**：`executeTask` 返回值不允许为 null！成功但不发消息时设 `RETURNNOTHING`。
> 接口参数类型：官方源码为 `BgWorkingContext`（`nc.bs.pub.taskcenter`），实际开发中等价于 `PreAlertContext`（`nc.bs.pub.pa`）。

## 示例1：简单后台任务 — 数据同步通知

> 最基础的后台任务模板：获取阈值参数 → 执行逻辑 → 返回消息

```java
package nc.hk.bs.pm.task;

import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.framework.common.NCLocator;
import nc.bs.logging.Logger;
import nc.bs.pub.pa.IBackgroundWorkPlugin;
import nc.bs.pub.pa.PreAlertContext;
import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;
import nc.vo.pub.BusinessException;

/**
 * 简单数据同步后台任务
 *
 * 阈值参数：
 * - org：组织编码（参照基础档案型，非空）
 * - sync_type：同步类型（字符型，默认值 "ALL"）
 * - notify：是否发送通知（逻辑型，默认值 "Y"）
 */
public class SimpleSyncTask implements IBackgroundWorkPlugin {

    @Override
    public PreAlertObject executeTask(PreAlertContext context) throws BusinessException {
        try {
            // 1. 获取阈值参数
            String pkOrg = (String) context.getKeyMap().get("org");
            String syncType = (String) context.getKeyMap().get("sync_type");
            String notify = (String) context.getKeyMap().get("notify");

            if (pkOrg == null || pkOrg.isEmpty()) {
                throw new BusinessException("组织参数不能为空");
            }

            Logger.info("开始执行数据同步任务，组织=" + pkOrg + "，类型=" + syncType);

            // 2. 执行业务逻辑
            int count = doSync(pkOrg, syncType);

            // 3. 构建返回对象
            PreAlertObject retObj = new PreAlertObject();
            retObj.setReturnType(PreAlertReturnType.RETURNFORMATMSG);
            retObj.setMsgTitle("数据同步完成");
            retObj.setMsgContent("组织[" + pkOrg + "]同步完成，共处理 " + count + " 条数据");

            Logger.info("数据同步任务执行完成，处理 " + count + " 条");
            return retObj;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            Logger.error("数据同步任务执行异常", e);
            throw new BusinessException("任务执行异常：" + e.getMessage());
        }
    }

    private int doSync(String pkOrg, String syncType) throws BusinessException {
        // 实际业务逻辑...
        return 0;
    }
}
```

### 关键模式解读

1. **实现 `IBackgroundWorkPlugin` 接口**：只需实现 `executeTask` 方法
2. **阈值获取**：`context.getKeyMap().get("参数名")`，返回值需要强转
3. **返回 `PreAlertObject`**：必须设置 `returnType` 和消息内容
4. **多选参数**：值为逗号分隔的字符串，需 `split(",")` 拆分
5. **日志记录**：使用 `Logger.info/error` 记录任务执行情况

---

## 示例2：带数据库操作的后台任务 — 过期项目状态更新

> 批量查询 + 批量更新模式，使用 BaseDAO 和 MDPersistenceQueryService

```java
package nc.hk.bs.pm.task;

import nc.bs.dao.BaseDAO;
import nc.bs.dao.DAOException;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.framework.common.NCLocator;
import nc.bs.logging.Logger;
import nc.bs.pub.pa.IBackgroundWorkPlugin;
import nc.bs.pub.pa.PreAlertContext;
import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;
import nc.vo.pim.project.ProjectHeadVO;
import nc.vo.pub.BusinessException;

/**
 * 过期项目状态自动更新后台任务
 *
 * 阈值参数：
 * - org：组织（参照基础档案型，非空）
 * - days：过期天数阈值（整型，默认值 "30"）
 */
public class ExpiredProjectUpdateTask implements IBackgroundWorkPlugin {

    private BaseDAO baseDAO;

    private BaseDAO getBaseDAO() {
        if (baseDAO == null) {
            baseDAO = new BaseDAO();
        }
        return baseDAO;
    }

    @Override
    public PreAlertObject executeTask(PreAlertContext context) throws BusinessException {
        try {
            // 1. 获取阈值
            String pkOrg = (String) context.getKeyMap().get("org");
            String daysStr = (String) context.getKeyMap().get("days");
            int days = 30;
            if (daysStr != null && !daysStr.isEmpty()) {
                days = Integer.parseInt(daysStr);
            }

            if (pkOrg == null || pkOrg.isEmpty()) {
                throw new BusinessException("组织参数不能为空");
            }

            Logger.info("开始执行过期项目更新任务，组织=" + pkOrg + "，天数=" + days);

            // 2. 查询过期项目（计划完成日期 < 当前日期 - days，且状态不是已完成）
            IMDPersistenceQueryService queryService =
                    MDPersistenceService.lookupPersistenceQueryService();
            String whereSql = "pk_org = '" + pkOrg + "' and dr = 0"
                    + " and plan_finish_date < (CURRENT_DATE - " + days + ")"
                    + " and billstatus != 3";  // 3=已完成
            ProjectHeadVO[] projects = (ProjectHeadVO[]) queryService
                    .queryBillOfVOByCond(ProjectHeadVO.class, whereSql, false);

            if (projects == null || projects.length == 0) {
                PreAlertObject retObj = new PreAlertObject();
                retObj.setReturnType(PreAlertReturnType.RETURNMESSAGE);
                retObj.setMsgContent("未找到需要更新的过期项目");
                return retObj;
            }

            // 3. 批量更新状态
            int updateCount = 0;
            for (ProjectHeadVO project : projects) {
                try {
                    String pk = project.getPrimaryKey();
                    String sql = "update bd_project set def19 = 'EXPIRED'"
                            + " where pk_project = '" + pk + "'";
                    getBaseDAO().executeUpdate(sql);
                    updateCount++;
                } catch (DAOException e) {
                    Logger.error("更新项目[" + project.getProject_code() + "]失败", e);
                }
            }

            // 4. 构建返回
            PreAlertObject retObj = new PreAlertObject();
            retObj.setReturnType(PreAlertReturnType.RETURNFORMATMSG);
            retObj.setMsgTitle("过期项目更新完成");
            retObj.setMsgContent("共查询到 " + projects.length + " 个过期项目，成功更新 "
                    + updateCount + " 个");

            Logger.info("过期项目更新任务完成，成功 " + updateCount + "/" + projects.length);
            return retObj;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            Logger.error("过期项目更新任务异常", e);
            throw new BusinessException("任务执行异常：" + e.getMessage());
        }
    }
}
```

### 关键模式解读

1. **MDPersistenceQueryService 批量查询**：`queryBillOfVOByCond(Class, whereSql, false)` 按条件查询 VO
2. **BaseDAO 批量更新**：循环中使用 `executeUpdate(sql)` 逐条更新，单条失败不影响其他
3. **BaseDAO 懒加载**：成员变量 + `getBaseDAO()` 方法
4. **整数阈值解析**：字符串获取后 `Integer.parseInt()` 转换
5. **返回统计信息**：成功/总数，便于运维人员确认

---

## 示例3：带自定义档案操作的后台任务 — 档案数据同步

> 结合自定义档案的查询、新增、更新操作，适用于定期同步场景

```java
package nc.hk.bs.pm.task;

import nc.bs.dao.BaseDAO;
import nc.bs.dao.DAOException;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.framework.common.NCLocator;
import nc.bs.logging.Logger;
import nc.bs.pub.pa.IBackgroundWorkPlugin;
import nc.bs.pub.pa.PreAlertContext;
import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.itf.bd.pub.IBDMetaDataIDConst;
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;
import nc.pubitf.bd.accessor.GeneralAccessorFactory;
import nc.pubitf.bd.accessor.IGeneralAccessor;
import nc.vo.bd.accessor.IBDData;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.meta.BatchOperateVO;
import nc.vo.pim.project.ProjectHeadVO;
import nc.vo.pub.BusinessException;

import java.util.ArrayList;
import java.util.List;

/**
 * 项目档案定期同步到自定义档案后台任务
 *
 * 阈值参数：
 * - org：组织（参照基础档案型，非空）
 * - defdoc_code：档案定义编码（字符型，默认值 "KYXMLB"）
 * - force：是否强制全量同步（逻辑型，默认值 "N"）
 */
public class ProjectDefdocSyncTask implements IBackgroundWorkPlugin {

    private static final String DEFDOC_LIST_CODE = "KYXMLB";

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

    @Override
    public PreAlertObject executeTask(PreAlertContext context) throws BusinessException {
        try {
            String pkOrg = (String) context.getKeyMap().get("org");
            String defdocCode = (String) context.getKeyMap().get("defdoc_code");
            String force = (String) context.getKeyMap().get("force");

            if (defdocCode == null || defdocCode.isEmpty()) {
                defdocCode = DEFDOC_LIST_CODE;
            }

            if (pkOrg == null || pkOrg.isEmpty()) {
                throw new BusinessException("组织参数不能为空");
            }

            Logger.info("开始执行档案同步任务，组织=" + pkOrg + "，档案=" + defdocCode);

            // 1. 查询项目档案
            IMDPersistenceQueryService queryService =
                    MDPersistenceService.lookupPersistenceQueryService();
            String whereSql = "pk_org = '" + pkOrg + "' and dr = 0"
                    + " and def20 is null";  // 未同步的项目
            ProjectHeadVO[] projects = (ProjectHeadVO[]) queryService
                    .queryBillOfVOByCond(ProjectHeadVO.class, whereSql, false);

            if (projects == null || projects.length == 0) {
                PreAlertObject retObj = new PreAlertObject();
                retObj.setReturnType(PreAlertReturnType.RETURNMESSAGE);
                retObj.setMsgContent("无需同步的项目档案");
                return retObj;
            }

            // 2. 查询自定义档案定义
            IGeneralAccessor accessor = GeneralAccessorFactory
                    .getAccessor(IBDMetaDataIDConst.DEFDOCLIST);
            IBDData defData = accessor.getDocByCode(pkOrg, defdocCode);
            if (defData == null) {
                throw new BusinessException("自定义档案列表[" + defdocCode + "]未找到");
            }
            String pkDefdoclist = defData.getPk();
            String pkGroup = InvocationInfoProxy.getInstance().getGroupId();
            DefdocVO[] existDocs = getDefdocQryService()
                    .queryDefdocVOsByDoclistPk(pkDefdoclist, pkOrg, pkGroup);

            // 3. 逐个同步
            int addCount = 0;
            List<String> errors = new ArrayList<>();
            for (ProjectHeadVO project : projects) {
                try {
                    syncProjectToDefdoc(project, pkOrg, pkGroup, pkDefdoclist, existDocs);
                    addCount++;
                } catch (Exception e) {
                    errors.add(project.getProject_code() + ": " + e.getMessage());
                    Logger.error("同步项目[" + project.getProject_code() + "]失败", e);
                }
            }

            // 4. 构建返回
            StringBuilder msg = new StringBuilder();
            msg.append("共 ").append(projects.length).append(" 个项目待同步，");
            msg.append("成功 ").append(addCount).append(" 个");
            if (!errors.isEmpty()) {
                msg.append("，失败 ").append(errors.size()).append(" 个：\n");
                for (String err : errors) {
                    msg.append("- ").append(err).append("\n");
                }
            }

            PreAlertObject retObj = new PreAlertObject();
            retObj.setReturnType(PreAlertReturnType.RETURNFORMATMSG);
            retObj.setMsgTitle("档案同步完成");
            retObj.setMsgContent(msg.toString());

            Logger.info("档案同步任务完成，成功 " + addCount + "/" + projects.length);
            return retObj;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            Logger.error("档案同步任务异常", e);
            throw new BusinessException("任务执行异常：" + e.getMessage());
        }
    }

    private void syncProjectToDefdoc(ProjectHeadVO project, String pkOrg,
            String pkGroup, String pkDefdoclist, DefdocVO[] existDocs)
            throws BusinessException, DAOException {
        String code = project.getProject_code();
        String name = project.getProject_name();

        // 构建新增档案 VO
        DefdocVO newDoc = new DefdocVO();
        newDoc.setCode(code);
        newDoc.setName(name);
        newDoc.setPk_org(pkOrg);
        newDoc.setPk_group(pkGroup);
        newDoc.setPk_defdoclist(pkDefdoclist);
        newDoc.setDr(0);
        newDoc.setEnablestate(2);

        // 保存
        BatchOperateVO batchVO = new BatchOperateVO();
        batchVO.setAddObjs(new DefdocVO[]{newDoc});
        getDefdocService().batchSaveDefdoc(pkOrg, batchVO);

        // 回写项目档案
        String defdocPk = newDoc.getPrimaryKey();
        String sql = "update bd_project set def20 = '" + defdocPk
                + "' where pk_project = '" + project.getPrimaryKey() + "'";
        getBaseDAO().executeUpdate(sql);
    }
}
```

### 关键模式解读

1. **阈值灵活性**：通过 `defdoc_code` 参数可配置档案编码，`force` 控制是否全量同步
2. **批量查询 + 逐个处理**：先查询所有待处理数据，逐个 try-catch 保证单条失败不影响整体
3. **自定义档案完整操作**：档案定义查询 → 新增 → 回写，与业务插件模式一致
4. **错误收集**：失败的记录收集到 errors 列表，最终汇总在返回消息中
5. **返回详细信息**：成功/失败数量 + 失败原因列表，便于运维排查

---

## 后台任务 vs 业务插件对比

| 对比项 | 业务插件 | 后台任务 |
|--------|---------|---------|
| **接口** | `IBusinessListener` | `IBackgroundWorkPlugin` |
| **核心方法** | `doAction(IBusinessEvent)` | `executeTask(BgWorkingContext)`※ |
| **触发方式** | 事件驱动（审批后、新增后等） | 定时调度 / 手动触发 |
| **参数获取** | 从事件对象 `getObjs()`/`getObject()` | 从 `BgWorkingContext.getKeyMap()` |
| **返回值** | 无（void） | `PreAlertObject`（**不允许为null！**） |
| **适用场景** | 实时响应、单条处理 | 批量处理、定时执行、数据清理 |
| **注册位置** | 事件注册 | 后台任务类型注册 + 部署 |
| **监控** | 无 | 后台任务监控 + 日志 |
| **消息通知** | 无内置 | 消息中心 / 邮件 / 短信 |

> ※ `BgWorkingContext` 为接口源码中的参数类型（包 `nc.bs.pub.taskcenter`），实际开发中与 `PreAlertContext`（包 `nc.bs.pub.pa`）等价，可互换使用。
