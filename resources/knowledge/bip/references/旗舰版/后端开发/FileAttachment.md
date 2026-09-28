# FileAttachment 附件上传与管理规范

> **核心原则**：BIP 附件统一通过 `Cooperation*Service` 系列服务管理，业务表只持有一个 `businessId`（UUID 字符串，longtext），具体文件信息通过 `businessType + businessId` 反查；禁止自行设计文件表或直接落盘。
>
> **包路径以本文档第三章为准**：附件 SDK 的真实根包是 `com.yonyou.iuap.fileservice.sdk`。
> 任何形如 `com.yonyou.iuap.cooperation.file.*`、`com.yonyou.iuap.fileservice.api.*` 的 import 都是**错误**的，编译会失败。
> 真实工程参考 `com.yonyou.ucf.mdf.hrbd.service.StaffContractAttachmentCallbackService`（见 5.3.1 节）。
>
> **技能路由**：当用户需求涉及"附件上传/下载/删除/预览"、"图片字段"、"资料上传"、"抓取上游附件"、"文件列表查询"、"文件名自定义"、"附件鉴权（canUpload/canDelete/canDownload）" 等关键词时，应路由到本文档。

---

## 一、技能路由决策树

### 1.1 路由触发关键词

当用户话术中出现以下关键词时，应路由到 FileAttachment：

| 关键词类型 | 示例话术 | 应路由到 |
|-----------|---------|---------|
| **附件管理** | "附件上传"、"附件下载"、"附件删除"、"附件预览" | FileAttachment |
| **文件操作** | "上传文件"、"下载文件"、"批量下载"、"获取下载链接" | FileAttachment |
| **图片/资料** | "图片字段"、"资料上传"、"图片上传"、"照片上传" | FileAttachment |
| **附件回写** | "把文件id回写到单据"、"附件 businessId"、"绑定附件到单据" | FileAttachment |
| **抓取附件** | "抓取上游附件"、"从XX单据复制附件"、"附件拉取"、"附件转存" | FileAttachment |
| **附件事件** | "上传前/后事件"、"删除前/后事件"、"beforeFileListUpload"、"afterFileUploadSuccess" | FileAttachment |
| **附件鉴权** | "控制是否可上传/下载/删除"、"updateAuth"、"canUpload/canDelete/canDownload" | FileAttachment |
| **文件名定制** | "自定义文件名"、"上传时重命名"、"拼接单据号到文件名" | FileAttachment |

### 1.2 字段类型识别

| 建模字段类型 | 数据库存储 | 说明 |
|-------------|-----------|------|
| **附件** | `longtext`，存 UUID 字符串（businessId） | 一个单据一个 businessId，可挂多个文件 |
| **图片** | `longtext`，存 JSON 字符串 | 形如 `{"fileID":"xxx","fileList":[{"name":"a.png"}]}`，业务id在 `fileID` 字段 |

> ⚠️ 图片字段后端取 businessId 时必须先 `JSONObject.parseObject(fileJson).getString("fileID")`，不能直接当 UUID 用。

---

## 二、核心概念

| 名词 | 含义 | 获取方式 |
|------|------|---------|
| `businessType` | 业务类型，即引擎编码 | 例：`c-fcc-zybkk-kkpx`；通常等同于工程的引擎编码常量 |
| `businessId` | 业务id，挂载附件的 UUID 字符串 | DO 中文件字段的值；前端 `yya.get('files').getValue()` |
| `fileId` | 单个文件的物理 id | 通过 `queryBusinessFiles` 列表返回 |
| `tenantId` | 租户id | `InvocationInfoProxy.getTenantid()` 或 `cb.rest.AppContext.tenant.tenantId` |

---

## 三、import 包路径速查表（⚠️ 真实可用，禁止臆造）

下表是 BIP 旗舰版 (YonBIP Eco v5.0) 附件 SDK 的**唯一正确**包路径，已在
`com.yonyou.ucf.mdf.hrbd.service.StaffContractAttachmentCallbackService` 等工程代码中验证。
历史文档/网络资料里出现的 `com.yonyou.iuap.cooperation.file.api.*`、`com.yonyou.iuap.cooperation.file.entity.*`、
`com.yonyou.iuap.fileservice.api.*` 等路径在本工程中**都不存在**，编译必失败。

| 类型 | 完整包路径 | 用途 |
|------|-----------|------|
| `CooperationFileUploadService`   | `com.yonyou.iuap.fileservice.sdk.service.CooperationFileUploadService`   | 文件上传 |
| `CooperationFileQueryService`    | `com.yonyou.iuap.fileservice.sdk.service.CooperationFileQueryService`    | 列表/数量查询 |
| `CooperationFileDownloadService` | `com.yonyou.iuap.fileservice.sdk.service.CooperationFileDownloadService` | 下载链接 |
| `CooperationFileManageService`   | `com.yonyou.iuap.fileservice.sdk.service.CooperationFileManageService`   | 删除 |
| `CooperationFileInfo` (POJO)     | `com.yonyou.iuap.fileservice.sdk.module.pojo.CooperationFileInfo`        | 文件信息载体 |
| `FileProperty` (POJO，builder)   | `com.yonyou.iuap.fileservice.sdk.module.pojo.FileProperty`               | 上传属性参数 |
| `IYmsJdbcApi`                    | `com.yonyou.iuap.yms.api.IYmsJdbcApi`                                    | 业务表回写 businessId |
| `BaseDAO`（注入用 qualifier）    | `com.yonyou.iuap.yms.dao.BaseDAO`                                        | `@Resource(name="baseDAO", type=BaseDAO.class)` 注入 IYmsJdbcApi |
| `SQLParameter`                   | `com.yonyou.iuap.yms.param.SQLParameter`                                 | SQL 参数化 |
| `MapListProcessor`               | `com.yonyou.iuap.yms.processor.MapListProcessor`                         | `queryForList` 结果集处理器 |
| `InvocationInfoProxy`            | `com.yonyou.iuap.context.InvocationInfoProxy`                            | `getTenantid()` 取租户 |
| `BizException`                   | `org.imeta.biz.base.BizException`                                        | 业务异常（**不是** `com.yonyou.*`） |

> 关键记忆点：
> - SDK 总根包是 `com.yonyou.iuap.fileservice.sdk`；
> - 4 个 Service 都在 `.service` 子包；
> - 2 个 POJO（`CooperationFileInfo` / `FileProperty`）都在 `.module.pojo` 子包；
> - `BizException` 来自 `org.imeta`，不要写成 `com.yonyou.iuap.*.BizException`。

### 3.1 标准注入与 import 模板

```java
// === 附件 SDK ===
import com.yonyou.iuap.fileservice.sdk.module.pojo.CooperationFileInfo;
import com.yonyou.iuap.fileservice.sdk.module.pojo.FileProperty;
import com.yonyou.iuap.fileservice.sdk.service.CooperationFileUploadService;
// 按需再引入以下三个（不用就别加，保持 import 清爽）：
// import com.yonyou.iuap.fileservice.sdk.service.CooperationFileQueryService;
// import com.yonyou.iuap.fileservice.sdk.service.CooperationFileDownloadService;
// import com.yonyou.iuap.fileservice.sdk.service.CooperationFileManageService;

// === 业务表回写（IYmsJdbcApi 规范）===
import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.dao.BaseDAO;
import com.yonyou.iuap.yms.param.SQLParameter;
import com.yonyou.iuap.yms.processor.MapListProcessor;   // queryForList 时才需要

// === 上下文 / 异常 ===
import com.yonyou.iuap.context.InvocationInfoProxy;
import org.imeta.biz.base.BizException;

// === Spring / JSR-250 ===
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import javax.annotation.Resource;

// === JDK ===
import java.io.InputStream;
import java.util.*;
```

```java
@Autowired
private CooperationFileUploadService cooperationFileUploadService;
// 下面三个按需注入，没用到的删掉
// @Autowired private CooperationFileQueryService    cooperationFileQueryService;
// @Autowired private CooperationFileDownloadService cooperationFileDownloadService;
// @Autowired private CooperationFileManageService   cooperationFileManageService;

/**
 * 业务表回写 businessId 必须走 IYmsJdbcApi。
 * 注入必须使用 @Resource + name="baseDAO" + type=BaseDAO.class 的组合，
 * 这是 yms 容器里 IYmsJdbcApi 的实际 bean 名，@Autowired by-type 在多实现下会失败。
 */
@Resource(name = "baseDAO", type = BaseDAO.class)
private IYmsJdbcApi ymsJdbcApi;
```

> 上述 4 个 `Cooperation*Service` 是 BIP 提供的标准能力，**禁止**自行实现文件存储或直写 minio/OSS。
> `IBillQueryRepository` 仅用于按业务对象 schema 做强类型查询；附件场景下若需要走原生 SQL，依然用 `IYmsJdbcApi`。

---

## 四、方法精确匹配表

| 业务场景 | 接口 | 关键方法 | 入参 | 返回 |
|---------|------|---------|------|------|
| 统计附件数量 | `CooperationFileQueryService` | `countFiles(businessType, businessId)` | 业务类型、业务id | `long` |
| 查询附件列表 | `CooperationFileQueryService` | `queryBusinessFiles(businessType, businessId, tenantId)` | 业务类型、业务id、租户id | `List<CooperationFileInfo>` |
| 取下载链接 | `CooperationFileDownloadService` | `queryDownloadUrl(fileId)` | 文件id | `String`（带签名的临时URL） |
| 上传文件 | `CooperationFileUploadService` | `uploadFile(businessType, businessId, inputStream, fileName, fileProperty)` | 业务类型、业务id、输入流、文件名、属性 | `CooperationFileInfo` |
| 删除文件 | `CooperationFileManageService` | `deleteFile(businessType, businessId, fileId)` | 业务类型、业务id、文件id | void |

### `CooperationFileInfo` 关键字段

| 字段 | 含义 |
|------|------|
| `fileId` | 文件唯一id |
| `name` / `baseName` / `extension` | 完整名/基础名/扩展名 |
| `size` | 字节数 |
| `downloadUrl` | 临时下载链接（含签名，有时效） |
| `filePath` | 存储相对路径 |
| `md5Hex` | 文件 md5 |
| `imageThumbPath` | 图片缩略图路径（仅图片） |
| `businessData` | 形如 `businessType&businessId` |

---

## 五、典型场景代码

### 5.1 查询单据所有附件（含下载链接）

```java
@PostMapping("/getFileList")
public void getFileList(HttpServletResponse response,
                        @RequestBody JSONObject jsonObject) {
    String businessType = jsonObject.getString("businessType");
    String businessId   = jsonObject.getString("businessId");
    String tenantId     = jsonObject.getString("tenantId");

    long count = cooperationFileQueryService.countFiles(businessType, businessId);
    if (count > 0) {
        List<CooperationFileInfo> fileInfoList =
                cooperationFileQueryService.queryBusinessFiles(businessType, businessId, tenantId);
        if (CollectionUtils.isNotEmpty(fileInfoList)) {
            renderJson(response, ResultMessage.data(fileInfoList));
            return;
        }
    }
    renderJson(response, ResultMessage.data(null));
}
```

### 5.2 仅获取下载链接

```java
List<CooperationFileInfo> fileInfoList =
        cooperationFileQueryService.queryBusinessFiles(businessType, businessId, tenantId);
if (CollectionUtils.isNotEmpty(fileInfoList)) {
    String fileId = fileInfoList.get(0).getFileId();
    String downloadUrl = cooperationFileDownloadService.queryDownloadUrl(fileId);
    renderJson(response, ResultMessage.data(downloadUrl));
}
```

### 5.3 上传文件并回写到单据

> **核心要点**：单据若无 businessId（首次上传），需要先 `UUID.randomUUID()` 生成一个，上传后再把这个 UUID **回写到业务表的附件字段**；否则单据看不到这个附件。

```java
@PostMapping(value = "/uploadFile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public void uploadFile(HttpServletResponse response,
                       @RequestParam MultipartFile file,
                       @RequestParam String businessType,
                       @RequestParam(required = false) String businessId) {
    try {
        boolean isAddFileBusinessId = StringUtils.isBlank(businessId);
        if (isAddFileBusinessId) {
            businessId = UUID.randomUUID().toString();
        }

        InputStream inputStream = file.getInputStream();
        FileProperty fileProperty = FileProperty.builder().build();

        CooperationFileInfo cooperationFileInfo = cooperationFileUploadService.uploadFile(
                businessType, businessId, inputStream,
                file.getOriginalFilename(), fileProperty);

        if (isAddFileBusinessId) {
            // 回写 businessId 到业务表（示例：xyq_supplierbankacc）
            String sql = "select * from xyq_supplierbankacc where id = ? ";
            SQLParameter param = new SQLParameter();
            param.addParam("2378352803424763907");
            Object o = ymsJdbcApi.queryForDTO(sql, param, XyqSupplierbankacc.class);
            if (Objects.nonNull(o)) {
                XyqSupplierbankacc updateDO = (XyqSupplierbankacc) o;
                updateDO.setFiles(businessId);
                ymsJdbcApi.update(updateDO);
            }
        }
        renderJson(response, ResultMessage.data(cooperationFileInfo));
    } catch (IOException e) {
        throw new BizException("附件上传失败", e);
    }
}
```

### 5.3.1 真实工程案例：第三方回调上传 + 关联查询 + 回写（Service 层）

> 取自 `com.yonyou.ucf.mdf.hrbd.service.StaffContractAttachmentCallbackService`。
> 场景：泛微完成电子合同签署后回调，把签好的合同 PDF 上传到 BIP 并写到员工合同单的附件字段。
> 关键示范：① **真实 import 路径** ② Service 层（非 Controller）也能直接收 `MultipartFile`
> ③ 复用已有 businessId 而非每次新建（同一份合同的多次上传应落到同一个 businessId 下）
> ④ `@Resource(name="baseDAO", type=BaseDAO.class)` 注入 IYmsJdbcApi ⑤ try-with-resources 关流
> ⑥ `MapListProcessor` 与 `SQLParameter` 的 `queryForList` 用法。

```java
package com.yonyou.ucf.mdf.hrbd.service;

import com.yonyou.iuap.context.InvocationInfoProxy;
import com.yonyou.iuap.fileservice.sdk.module.pojo.CooperationFileInfo;
import com.yonyou.iuap.fileservice.sdk.module.pojo.FileProperty;
import com.yonyou.iuap.fileservice.sdk.service.CooperationFileUploadService;
import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.dao.BaseDAO;
import com.yonyou.iuap.yms.param.SQLParameter;
import com.yonyou.iuap.yms.processor.MapListProcessor;
import com.yonyou.ucf.mdf.hrbd.constant.StaffContractConstants;
import com.yonyou.ucf.mdf.hrbd.dto.ContractAttachmentUpdateResponse;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.imeta.biz.base.BizException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import java.io.InputStream;
import java.util.*;

@Slf4j
@Service
public class StaffContractAttachmentCallbackService
        implements IStaffContractAttachmentCallbackService {

    @Autowired
    private CooperationFileUploadService cooperationFileUploadService;

    @Resource(name = "baseDAO", type = BaseDAO.class)
    private IYmsJdbcApi ymsJdbcApi;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ContractAttachmentUpdateResponse updateContractAttachment(
            String staffCode, String contractNum, MultipartFile file) {

        // 1. 参数校验 —— 业务异常一律抛 org.imeta.biz.base.BizException
        if (StringUtils.isBlank(staffCode)) throw new BizException("员工编码不能为空");
        if (StringUtils.isBlank(contractNum)) throw new BizException("合同编码不能为空");
        if (file == null || file.isEmpty()) throw new BizException("附件文件不能为空");

        // 2. 关联员工表查合同（原生 SQL + MapListProcessor）
        Map<String, Object> contract = queryContract(staffCode, contractNum);
        if (contract == null) {
            throw new BizException("未找到对应的合同信息");
        }
        String contractId     = (String) contract.get("id");
        String existAttachId  = (String) contract.get("newattachment");

        // 3. 复用已有 businessId；首次上传才生成 UUID
        String businessId = StringUtils.isNotBlank(existAttachId)
                ? existAttachId
                : UUID.randomUUID().toString();

        // 4. 上传 —— try-with-resources 关流；FileProperty 用 builder 兜底
        try (InputStream in = file.getInputStream()) {
            FileProperty prop = FileProperty.builder().build();
            CooperationFileInfo info = cooperationFileUploadService.uploadFile(
                    StaffContractConstants.STAFF_CONTRACT_BUSINESS_TYPE,
                    businessId,
                    in,
                    file.getOriginalFilename(),
                    prop);
            log.info("附件上传成功 businessId={}, fileId={}", businessId, info.getFileId());
        } catch (Exception e) {
            throw new BizException("附件上传失败：" + e.getMessage(), e);
        }

        // 5. 回写 businessId 到业务表（IYmsJdbcApi.update，SQL 参数化）
        String sql = "UPDATE " + StaffContractConstants.STAFF_CONTRACT_SCHEMA
                   + "." + StaffContractConstants.STAFF_CONTRACT_TABLE
                   + " SET new_attachment = ? WHERE id = ? AND dr = 0";
        SQLParameter param = new SQLParameter();
        param.addParam(businessId);
        param.addParam(contractId);

        if (ymsJdbcApi.update(sql, param) <= 0) {
            throw new BizException("更新合同附件失败，contractId=" + contractId);
        }

        return ContractAttachmentUpdateResponse.success(
                contractId, businessId, file.getOriginalFilename());
    }

    /**
     * 关联员工表按 (员工编码, 合同号) 查合同。
     * 注意：queryForList 必须传 MapListProcessor，否则拿不到列名 -> 值的映射。
     */
    private Map<String, Object> queryContract(String staffCode, String contractNum) {
        String sql = "SELECT c.id, c.contractnum, c.new_attachment "
                   + "FROM " + StaffContractConstants.STAFF_CONTRACT_SCHEMA
                   + "." + StaffContractConstants.STAFF_CONTRACT_TABLE + " c "
                   + "LEFT JOIN iuap_apdoc_basedoc.ss_staff s ON c.staff_id = s.id "
                   + "WHERE c.dr = 0 AND s.dr = 0 AND s.code = ? AND c.contractnum = ?";
        SQLParameter p = new SQLParameter();
        p.addParam(staffCode);
        p.addParam(contractNum);

        List<Map<String, Object>> rows =
                ymsJdbcApi.queryForList(sql, p, new MapListProcessor());
        if (rows == null || rows.isEmpty()) return null;

        Map<String, Object> r = rows.get(0);
        Map<String, Object> out = new HashMap<>();
        out.put("id",            r.get("id"));
        out.put("contractnum",   r.get("contractnum"));
        out.put("newattachment", r.get("new_attachment"));
        return out;
    }
}
```

#### 这个案例里值得注意的几处细节

| 细节 | 解释 |
|------|------|
| `businessType` 抽到 `StaffContractConstants` 常量类 | 避免散落字符串，符合 CLAUDE.md「业务接口 URI 抽到静态常量类」的精神 |
| schema/表名拼接也走常量 | 数据库表跨 schema 时尤其重要（例：`hrm_xxx.t_staff_contract`） |
| 复用 `existAttachId` 而不是每次新建 UUID | 同一张单据多次上传/覆盖应落到同一个 businessId 下，否则前端只看得见最后一次 |
| `@Transactional(rollbackFor = Exception.class)` | 上传 + 回写必须在一个事务里——上传成功但回写失败时整体回滚（注意：附件物理文件实际无法回滚，最多保证业务表数据一致） |
| 用 `MultipartFile` 而非 `byte[]` | SDK 期望 `InputStream`，`MultipartFile.getInputStream()` 是零拷贝；`try-with-resources` 自动关流 |
| 关联查询用原生 SQL + JOIN | 业务对象 schema 无法跨档案表（员工档案 `iuap_apdoc_basedoc.ss_staff`），原生 SQL 是合理选择 |

---

### 5.4 删除附件

```java
@PostMapping("/deleteFile")
public void deleteFile(HttpServletResponse response,
                       @RequestParam String businessType,
                       @RequestParam String businessId,
                       @RequestParam String tenantId) {
    List<CooperationFileInfo> fileInfoList =
            cooperationFileQueryService.queryBusinessFiles(businessType, businessId, tenantId);
    if (CollectionUtils.isNotEmpty(fileInfoList)) {
        String fileId = fileInfoList.get(0).getFileId();
        cooperationFileManageService.deleteFile(businessType, businessId, fileId);
    }
    renderJson(response, ResultMessage.data(null));
}
```

### 5.5 抓取上游单据附件到当前单据（跨单据转存）

> **场景**：当前单据需要复用另一张单据上的附件（例：把公司图章单据的图片转存为供应商银行账号单据的附件）。
> **思路**：① 查上游 businessId → ② 取下载链接 → ③ 用 `URL.openStream()` 拿到输入流 → ④ 用当前单据的 businessId 上传 → ⑤ 回写。

```java
@PostMapping("/fetchFile")
public void fetchFile(HttpServletResponse response,
                      @RequestParam String tenantId,
                      @RequestParam String id,
                      @RequestParam String businessType) {

    // 1. 查当前单据
    String sql = "select * from xyq_supplierbankacc where id = ? ";
    SQLParameter param = new SQLParameter();
    param.addParam(id);
    Object o = ymsJdbcApi.queryForDTO(sql, param, XyqSupplierbankacc.class);
    if (Objects.isNull(o)) {
        throw new BizException("未找到供应商银行账号！id = " + id);
    }
    XyqSupplierbankacc target = (XyqSupplierbankacc) o;

    // 2. 当前单据的目标 businessId（没有则新建）
    String toBusinessId = StringUtils.isBlank(target.getFiles())
            ? UUID.randomUUID().toString()
            : target.getFiles();

    // 3. 解析上游图片字段（图片类型存的是 JSON，businessId 在 fileID）
    String corporateSeal = target.getCorporateSeal();
    if (StringUtils.isBlank(corporateSeal)) {
        throw new BizException("供应商银行账号未配置公司图章！id = " + id);
    }
    String sealSql = "select id, file from corporate_seal_xyq where id = ? ";
    SQLParameter sealParam = new SQLParameter();
    sealParam.addParam(corporateSeal);
    Object corObj = ymsJdbcApi.queryForDTO(sealSql, sealParam, CorporateSealXYQ.class);
    if (Objects.isNull(corObj)) {
        throw new BizException("未找到公司图章！id = " + corporateSeal);
    }
    CorporateSealXYQ seal = (CorporateSealXYQ) corObj;

    // 图片类型字段 → 解析 fileID
    String fileJson = seal.getFile();
    String fromBusinessId = JSONObject.parseObject(fileJson).getString("fileID");

    // 4. 取上游下载链接
    List<CooperationFileInfo> fileInfoList =
            cooperationFileQueryService.queryBusinessFiles(businessType, fromBusinessId, tenantId);
    if (CollectionUtils.isEmpty(fileInfoList)) {
        throw new BizException("未找到上游附件！businessId = " + fromBusinessId);
    }
    String fileId      = fileInfoList.get(0).getFileId();
    String fileName    = "抓取附件-" + fileInfoList.get(0).getName();
    String downloadUrl = cooperationFileDownloadService.queryDownloadUrl(fileId);

    // 5. 流式转存
    try {
        URL url = new URL(downloadUrl);
        try (InputStream inputStream = url.openStream()) {
            FileProperty fileProperty = FileProperty.builder().build();
            CooperationFileInfo info = cooperationFileUploadService.uploadFile(
                    businessType, toBusinessId, inputStream, fileName, fileProperty);
            // 回写 businessId
            target.setFiles(toBusinessId);
            ymsJdbcApi.update(target);
            renderJson(response, ResultMessage.data(info));
        }
    } catch (IOException e) {
        throw new BizException("抓取附件失败", e);
    }
}
```

---

## 六、前端事件钩子参考（co-debug 用）

后端代码生成时，若用户提到"上传前校验"、"上传后回调"等，应同步告知前端在 ViewModel 中可用的事件：

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `beforeCreateAttachmentData` | 附件组件初始化 | 改 config |
| `beforeRenderFileComponent` | 渲染前 | 调整渲染参数 |
| ``<fieldId>DidMount`` | 组件挂载后 | `ecsuiteApi.updateAuth({ auth: { canDownload, canDelete, canUpload }})` |
| `beforeFileListUpload` | 上传前 | 文件名定制、白名单校验 |
| `ecsuiteFileChange` | 上传/删除统一回调 | 通过 `type === 'upload'/'delete'` 区分 |
| `afterFileUploadSuccess` | 上传成功后 | 联动其他字段、调用后端业务接口 |
| `beforeDeleteCallBack` / `afterFileDeleteSuccess` | 删除前/后 | 鉴权、级联 |
| `beforePreviewCallBack` | 预览前 | 鉴权 |
| `beforeDownloadCallBack` / `beforeBatchDownload` | 下载前/批量下载前 | 水印、日志 |
| `beforeTableAttachmentHandleOk` | 子表行附件弹窗保存 | 子表附件场景 |

### 文件名自定义（前端）

```javascript
viewModel.on('beforeFileListUpload', function (data) {
    const fileData = data.fileData;
    const code = viewModel.get('code').getValue();
    const newName = code + '_' + fileData.name;
    const newFile = new File([fileData], newName, { type: fileData.type });
    newFile.uid = fileData.uid; // 必须保留 uid，否则前后id不一致
    data.fileData = newFile;
});
```

---

## 七、常见坑 & 强制要求

| 项 | 要求 |
|----|------|
| **businessId 回写** | 首次上传必须把新生成的 UUID 通过 `IYmsJdbcApi.update` 写回业务表的附件字段，否则页面看不到附件 |
| **图片字段解析** | 图片类型字段值是 JSON，必须 `parseObject(...).getString("fileID")`，不能整段当 UUID |
| **下载链接时效** | `downloadUrl` 是带签名的临时URL（默认5分钟），不要长期存储或回显给前端长期使用 |
| **流式上传** | 跨单据转存使用 `URL.openStream()`，避免落盘临时文件；记得 `try-with-resources` 关闭流 |
| **SQL 参数化** | 业务表的 `select/update` 必须用 `SQLParameter`，遵循 [IYmsJdbcApi](IYmsJdbcApi.md) |
| **businessType 来源** | 使用引擎编码（例 `c-fcc-zybkk-kkpx`），抽到常量类，禁止散落字符串 |
| **异常处理** | 业务异常统一抛 [BusinessException](BusinessException.md)，禁止吞掉 `IOException` |
| **包路径** | 禁止使用 MyBatis/JdbcTemplate/`IBillRepository`；DB 操作走 `IYmsJdbcApi` |
| **附件 SDK import** | 仅使用 `com.yonyou.iuap.fileservice.sdk.service.*`（4 个 Service）和 `com.yonyou.iuap.fileservice.sdk.module.pojo.*`（`CooperationFileInfo` / `FileProperty`）；写成 `com.yonyou.iuap.cooperation.file.*` 一律编译不通过 |
| **BizException 路径** | `org.imeta.biz.base.BizException`（不是 `com.yonyou.*`） |
| **IYmsJdbcApi 注入** | `@Resource(name="baseDAO", type=BaseDAO.class)`；用 `@Autowired` by-type 在某些环境下会注入失败 |
| **queryForList** | 必须传 `new MapListProcessor()`（`com.yonyou.iuap.yms.processor.MapListProcessor`），否则拿不到列名→值的映射 |
| **复用 businessId** | 同一张单据再次上传同类附件应**复用已有 businessId**，新建 UUID 只用于「业务表附件字段为空」的首次上传 |

---

## 八、相关文档

- [IYmsJdbcApi.md](IYmsJdbcApi.md) — 业务表 `businessId` 回写、SQL 参数化
- [IBillQueryRepository.md](IBillQueryRepository.md) — 业务对象查询（替代手写 SQL 查附件归属时）
- [BusinessException.md](BusinessException.md) — 附件相关业务异常抛出
- [OpenAPI.md](OpenAPI.md) — 若附件需推送到第三方

### 工程内真实参考实现

- `com.yonyou.ucf.mdf.hrbd.service.StaffContractAttachmentCallbackService`
  —— 第三方回调上传 + 关联查询 + businessId 回写的完整 Service 层范例，
  本文档第 5.3.1 节即取自此文件，可作为生成同类代码时的「黄金样板」。
