---
name: ncc-background-task
description: NCC（用友NC Cloud）后台任务开发技能。当用户需要编写、生成、审查 NCC 后台任务插件代码时使用此技能。 触发场景包括但不限于：写一个后台任务、定时任务、计划任务、定时执行、后台任务插件、 IBackgroundWorkPlugin、executeTask、PreAlertContext、PreAlertObject、阈值配置、 后台任务注册、后台任务部署、NCC客开、NCC二开、用友NC Cloud后台任务开发、NCC定制开发。
---

# NCC 后台任务开发指南

> **本技能引用的文档**都在插件的参考库里，路径形如 `ncc/ncc-background-task/references/xxx.md`。
> 用 `knowledge_read` 传该路径读全文，或先用 `knowledge_search` 按关键词搜索；
> **不要**按相对路径去猜文件位置——内联的正文里没有路径可解析。


## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**（非旗舰版 BIP）。

> **版本区分**：旗舰版（BIP）→ `yon-bip-dev` | NCC → `yon-ncc-dev`
>
> 收到问题时务必先判断版本。记录问题时注意路由到对应的技能目录。

---

> **本 skill 是 `ncc-dev`（NCC 定制开发总技能）的子技能，专注于后台任务插件开发。**
> 通用素材（编码规范、通用 API）请查阅 `ncc/ncc-dev/references/common/` 目录。

## 接口源码（官方）

> ⚠️ 以下为 `IBackgroundWorkPlugin` 接口的官方源码，**务必严格遵守注释中的约束**。

```java
package nc.bs.pub.taskcenter;

import nc.bs.pub.pa.PreAlertObject;
import nc.vo.pub.BusinessException;

/**
 * <b>后台任务 插件类 接口.</b>
 *
 * @author huangzg 2007-5-14
 * @since v5.02
 */
public interface IBackgroundWorkPlugin
{
    /**
     * 任务插件执行体
     *
     * @param bgwc 执行环境
     * @return <tt>PreAlertObject</tt>
     *            该返回值不允许为null！<p>
     *            若后台任务插件成功执行但不打算发送消息，<p>
     *           那么请将PreAlertObject的returnType设为PreAlertReturnType.RETURNNOTHING
     * @throws BusinessException
     */
    PreAlertObject executeTask(BgWorkingContext bgwc) throws BusinessException;
}
```

### 🔴 接口注释要点（必须遵守）

1. **返回值不允许为 null！** — `executeTask` 方法必须返回一个非空的 `PreAlertObject`
2. **成功但不需要发消息时**：将 `PreAlertObject.setReturnType(PreAlertReturnType.RETURNNOTHING)`
3. **参数类型**：接口签名中参数为 `BgWorkingContext bgwc`（包 `nc.bs.pub.taskcenter`）
   - ⚠️ 实际开发中，`BgWorkingContext` 是 `PreAlertContext` 的子类/别名，两者可互换使用

> ⚡ **实际产品代码中的做法**：部分 NCC 产品代码中存在 `return null` 的情况（如"未查到数据就直接返回"）。虽然违反接口注释约束，但框架层面不会报错。**客开代码建议严格遵守接口规范**，使用 `RETURNNOTHING` 而非 `return null`。

### BgWorkingContext / PreAlertContext API

| 方法 | 返回类型 | 说明 |
|------|---------|------|
| `getKeyMap()` | `KeyMap` | 获取所有阈值参数，通过 `.get("参数名")` 取值 |
| `getPk_orgs()` | `String[]` | 获取当前任务部署时选择的组织主键数组 |
| `getGroupId()` | `String` | 获取当前集团主键 |

**典型用法**：

```java
// 获取阈值参数
KeyMap keyMap = bgwc.getKeyMap();
String paramValue = (String) keyMap.get("参数名");

// 获取组织范围
String[] pkOrgs = bgwc.getPk_orgs();
// ⚠️ pkOrgs 可能为 null 或空数组，需要判断
if (pkOrgs != null && pkOrgs.length > 0) {
    // 按组织过滤
} else {
    // 按集团过滤
    String pkGroup = bgwc.getGroupId();
}

// 检查模块是否启用
boolean faStarted = InitGroupQuery.isEnabled(bgwc.getGroupId(), ModuleConst.FA_FUNCCODE);
```

### 包路径说明

| 类 | 官方接口包路径 | 实际开发常用包路径 | 说明 |
|----|--------------|------------------|------|
| `IBackgroundWorkPlugin` | `nc.bs.pub.taskcenter` | `nc.bs.pub.pa` | 两个包下都存在，功能相同 |
| `BgWorkingContext` | `nc.bs.pub.taskcenter` | — | 接口源码中的参数类型 |
| `PreAlertContext` | — | `nc.bs.pub.pa` | 实际开发中常用，与 BgWorkingContext 等价 |
| `PreAlertObject` | `nc.bs.pub.pa` | `nc.bs.pub.pa` | 返回值类型 |
| `PreAlertReturnType` | `nc.bs.pub.pa` | `nc.bs.pub.pa` | 返回类型枚举 |

> **开发建议**：代码中 import 使用 `nc.bs.pub.pa` 包下的类即可，`BgWorkingContext` 可用 `PreAlertContext` 替代，功能完全一致。

## 核心概念

**后台任务 = 实现 `IBackgroundWorkPlugin` 接口的 Java 类**，通过 `executeTask` 方法编写业务逻辑。

后台任务与业务插件的关键区别：
- **业务插件**：由事件触发（如审批后、新增后），被动执行
- **后台任务**：由定时调度或手动触发，主动执行，适用于批量处理、定时同步、数据清理等场景

## 参考资料

### 场景专用资料

- **后台任务示例代码**：读取 `ncc/ncc-background-task/references/examples.md` — 典型后台任务的完整代码和解读
- **产品源码参考**：读取 `ncc/ncc-background-task/references/product-source-code.md` — NCC 产品中的真实后台任务实现，包含编码模式和 API 用法

### 通用资料（来自 ncc-dev，按需读取）

- **编码规范**：`ncc/ncc-dev/references/common/coding-standard.md` — 命名、注释、异常处理等规范
- **通用 API**：`ncc/ncc-dev/references/common/common-api.md` — 自定义档案操作、持久化查询、批量操作、基础数据接口等
- **VO 对照表**：`ncc/ncc-dev/references/common/` 下的各模块 VO 对照表

## 开发流程

### 第一步：理解需求

从用户描述中提取以下关键信息：

| 需要确认的信息 | 说明 |
|--------------|------|
| **任务功能** | 要执行什么业务逻辑？（如批量同步、数据清理、定时推送等） |
| **触发方式** | 定时执行（Cron 表达式）还是手动触发？ |
| **阈值参数** | 需要哪些可配置参数？（如组织、日期范围、业务类型等） |
| **返回结果** | 执行后需要返回什么？（消息通知、数据列表、无返回等） |
| **消息通知** | 是否需要消息中心/邮件/短信通知？通知谁？ |

如果用户没有明确说明，主动询问。

### 第二步：后台任务类型注册

在 NCC 系统的「后台任务类型注册」节点新增一条记录：

| 注册项 | 说明 |
|--------|------|
| **编码** | 任务类型编码，必填 |
| **名称** | 任务类型名称，必填 |
| **所属模块** | 开发模块名（对应 /modules 目录下的子目录，小写），必填 |
| **消息模板类型** | 使用消息模板时需填 |
| **所属行业** | 参照行业目录 |
| **业务插件** | 实现 `IBackgroundWorkPlugin` 的完整类路径 |

### 第三步：阈值设置

为后台任务配置可灵活调整的阈值参数：

| 阈值项 | 说明 |
|--------|------|
| **阈值名称** | 参数名 |
| **阈值描述** | 参数说明 |
| **编辑类型** | 字符型 / 逻辑型 / 整型 / Double型 / 参照基础档案型 |
| **是否非空** | 是否必填 |
| **参照名称** | 编辑类型为参照时选择参照档案（人员、部门、客户等） |
| **是否单选** | 参照是否支持多选 |
| **默认值** | 参数默认值 |

> **注意**：逻辑型在部署时显示为"是/否"下拉框；参照型会弹出对应的基础档案参照选择界面。

### 第四步：后台任务部署

在「后台任务部署」节点配置任务条目：

| 配置项 | 说明 |
|--------|------|
| **条目名称** | 显示标记 |
| **条目状态** | 激活 / 休眠（默认激活） |
| **条目信息** | 消息模板 |
| **类型** | 选择已注册的后台任务类型（决定调用哪个业务插件） |
| **组织单元** | 限定阈值参照范围 |
| **阈值列表** | 设置各阈值的操作符和值 |

### 第五步：触发配置

| 触发方式 | 说明 |
|----------|------|
| **立即执行** | 部署后立即执行一次 |
| **定时执行** | 类似预警的 Cron 表达式定时调度 |

### 第六步：消息接收配置（可选）

3 种消息接收方式：

| 方式 | 说明 |
|------|------|
| **消息中心** | 发送到 UAP 系统的消息中心 |
| **电子邮件** | 发送到用户邮箱（需人员档案中配置邮箱地址） |
| **手机短信** | 短信提示用户（需企业开通短信服务，人员档案中存储手机号） |

### 第七步：编写代码

#### 代码骨架

```java
package nc.hk.bs.{模块}.{业务组件}.task;

import nc.bs.pub.taskcenter.BgWorkingContext;
import nc.bs.pub.taskcenter.IBackgroundWorkPlugin;
import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;
import nc.vo.pub.BusinessException;
import nc.bs.logging.Logger;

/**
 * {简短描述后台任务功能}
 *
 * 阈值参数：
 * - org：组织（参照基础档案型，非空）
 * - xxx：{其他参数说明}
 */
public class {类名} implements IBackgroundWorkPlugin {

    @Override
    public PreAlertObject executeTask(BgWorkingContext bgwc) throws BusinessException {
        try {
            // 1. 获取阈值参数
            // String paramValue = (String) bgwc.getKeyMap().get("参数名");

            // 2. 获取组织范围（常见模式：有组织按组织，无组织按集团）
            String[] pkOrgs = bgwc.getPk_orgs();
            String pkGroup = bgwc.getGroupId();
            // if (pkOrgs != null && pkOrgs.length > 0) { 按组织 } else { 按集团 }

            // 3. 执行业务逻辑

            // 4. 构建返回对象（⚠️ 不允许返回 null！）
            PreAlertObject retObj = new PreAlertObject();
            retObj.setReturnType(PreAlertReturnType.RETURNNOTHING);
            return retObj;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            Logger.error("任务执行异常", e);
            throw new BusinessException("任务执行异常：" + e.getMessage());
        }
    }
}
```

#### 获取阈值参数

```java
// KeyMap 实际类型为 LinkedHashMap<String, Object>
LinkedHashMap<String, Object> keyMap = context.getKeyMap();

// 获取单个阈值（字符串）
String paramValue = (String) keyMap.get("参数名");

// 多选字段的值是逗号分隔的字符串
String multiValue = (String) keyMap.get("多选参数名");
String[] values = multiValue.split(",");

// ⭐ 常见阈值参数名约定：
// pk_group  — 集团主键
// org       — 组织（参照基础档案型）
// funtype   — 功能类型
// pk_banktype — 银行类型（多选）
```

#### 构建返回对象

> 🔴 **返回值不允许为 null！** 这是接口注释的硬性要求。

```java
// ===== 情况1：不需要发送消息（最简单） =====
PreAlertObject retObj = new PreAlertObject();
retObj.setReturnType(PreAlertReturnType.RETURNNOTHING);
return retObj;

// ===== 情况2：返回纯文本消息 =====
PreAlertObject retObj = new PreAlertObject();
retObj.setReturnType(PreAlertReturnType.RETURNMESSAGE);
retObj.setMsgTitle("任务执行结果");
retObj.setMsgContent("处理完成，共处理 XX 条数据");
return retObj;

// ===== 情况3：返回格式化表格消息（RETURNFORMATMSG + IAlertMessage）⭐ =====
// 步骤1：创建 IAlertMessage 实现类
IAlertMessage remsg = new MyAlertMsg();  // 需实现 IAlertMessage 接口
remsg.setMsgType(AlertMsgType.INFO);     // INFO / WARN / ERROR

// 步骤2：设置表格体数据（Object[][]，每行一个 Object[]）
Object[][] bodyValue = new Object[dataList.size()][];
for (int i = 0; i < dataList.size(); i++) {
    bodyValue[i] = new Object[]{
        dataList.get(i).getName(),   // 第1列
        dataList.get(i).getValue(),  // 第2列
        "结果消息"                     // 第3列
    };
}
remsg.setBodyValue(bodyValue);

// 步骤3：组装 PreAlertObject
PreAlertObject pao = new PreAlertObject();
pao.setReturnType(PreAlertReturnType.RETURNFORMATMSG);
pao.setReturnObj(remsg);       // ⭐ 用 setReturnObj 而非 setMsgContent
pao.setMsgTitle("任务执行结果(集团)");
return pao;

// ⚠️ 绝对不要 return null！
```

### 第八步：测试

1. 在后台任务部署界面激活任务
2. 手动触发执行或等待定时触发
3. 在「后台任务监控」查看执行状态（等待运行/正在运行/暂停）
4. 在「后台任务日志」查看执行结果（成功/失败+失败原因）
5. 失败时详细日志查看：`home/nclogs/server/pa-log.log`

## 返回类型详解

| 枚举值 | 说明 | 使用方式 |
|--------|------|---------|
| `RETURNNOTHING` | 无消息返回 | 仅设 returnType，无需其他设置 |
| `RETURNOBJECT` | 对象类型 | `pao.setReturnObj(obj)` |
| `RETURNFORMATMSG` | ⭐ 格式化表格消息 | `pao.setReturnObj(IAlertMessage实例)` + `setMsgTitle()` |
| `RETURNMESSAGE` | 纯文本消息 | `pao.setMsgContent("文本")` + `setMsgTitle()` |
| `RETURNDATASOURCE` | 打印模板数据源 | 实现 `IDataSource` 接口 |
| `RETURNDATASOURCE`（含元数据） | 元数据+自定义变量 | 实现 `IMetaDataDataSource` 接口 |
| `RETURNMULTILANGTEXT` | 多语文本 | 返回多语言文本 |
| `RETURN_MULTIPLE_RECEIVER_OBJECT` | 多接收者不同消息 | 返回 `MultiReceiverPreAlertObject` |

### RETURNFORMATMSG 详解（最常用的复杂返回类型）

**适用场景**：需要以表格形式展示任务执行结果（如：多行数据、每行多列信息）

**核心步骤**：
1. 创建 `IAlertMessage` 实现类（需自定义，参考产品代码 `BalanceAlertMsg`）
2. 设置消息类型：INFO / WARN / ERROR
3. 设置表格数据：`setBodyValue(Object[][])` — 二维数组，每行一个 Object[]
4. 组装 `PreAlertObject`：`setReturnType(RETURNFORMATMSG)` + `setReturnObj(IAlertMessage)`

> 详细用法和产品代码示例见 `ncc/ncc-background-task/references/product-source-code.md` 的"源码2"部分。

## 后台任务监控

| 操作 | 说明 |
|------|------|
| **执行** | 手动触发等待中的任务 |
| **删除** | 删除等待/可执行状态的任务实体（部署界面仍可见但不再执行，除非重启中间件或修改条目） |
| **日志** | 查看任务执行成功/失败状态，失败时显示原因 |

## 包路径规范

客户化前缀为 `hk`，后台任务包路径：

```
nc.hk.bs.{模块}.{业务组件}.task
```

- `bs` = 业务组件层
- `模块`：so（销售）、pu（采购）、ic（库存）、ar（应收）、ap（应付）、pm（项目管理）等
- `业务组件`：具体业务对象名称

类名建议：`{业务描述}Task`，如 `ProjectSyncTask`、`DataCleanupTask`

## 相关 import 速查

```java
// 后台任务核心接口（两套包路径均可，推荐 taskcenter）
import nc.bs.pub.taskcenter.IBackgroundWorkPlugin;
import nc.bs.pub.taskcenter.BgWorkingContext;
// 或使用 pa 包（等价）
import nc.bs.pub.pa.IBackgroundWorkPlugin;
import nc.bs.pub.pa.PreAlertContext;
import nc.bs.pub.pa.PreAlertObject;
import nc.bs.pub.pa.PreAlertReturnType;

// 基础框架
import nc.bs.framework.common.NCLocator;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;
import nc.bs.logging.Logger;

// 服务查找（两种方式）
// 方式1：NCLocator（通用）
NCLocator.getInstance().lookup(IXxxService.class);
// 方式2：AMProxy（资产管理模块专用）
AMProxy.lookup(IXxxService.class);

// 持久化查询
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;

// 数据库操作
import nc.bs.dao.BaseDAO;
import nc.bs.dao.DAOException;

// 批量 VO 更新工具（比 BaseDAO 更简便）
import nc.impl.am.db.VOPersistUtil;
// VOPersistUtil.update(vos)  — 批量更新 VO 到数据库

// SQL IN 条件构建工具
import nc.impl.am.common.InSqlManager;
// InSqlManager.getInSQLValue(String[] / List<String>)  — 将数组转为 ('a','b','c') 格式

// 模块启用检查
import nc.pubitf.initgroup.InitGroupQuery;
// InitGroupQuery.isEnabled(pkGroup, funcCode)  — 检查模块是否启用

// 自定义档案（按需）
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.meta.BatchOperateVO;
```

## 输出要求

1. **生成完整的 Java 文件**，包含包声明、导入、类注释
2. **类注释用中文**，说明功能用途和阈值参数
3. **方法注释说明功能**，复杂的算法/逻辑添加行内注释
4. **遵循编码规范**：命名、格式、异常处理
5. 如果需求不明确，先列出需要确认的问题，等用户回答后再生成代码
6. 需要操作自定义档案/基础数据时，查阅 `ncc-dev` 的通用 API 手册
