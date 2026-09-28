# 查询出库申请场景规范

## 业务语义

查询出库申请是指从BIP系统中获取出库申请单（PickingRequisition）的完整业务数据，包括主表信息、明细信息以及特征组字段，为后续的数据转换和WMS推送提供数据源。

### 业务目标

获取出库申请单的完整数据，确保数据完整性和准确性，为WMS集成提供可靠的数据基础。

### 前置条件

1. 出库申请单已保存或审核通过
2. 具备查询权限
3. 单据ID有效

## 核心流程

```
出库申请ID ──▶ 查询主表信息 ──▶ 查询明细列表 ──▶ 查询特征组 ──▶ 组装完整数据
```

## 查询方式

### 方式一：OpenAPI查询（推荐）

适用于跨系统调用，通过BIP OpenAPI接口查询单据详情。

```java
/**
 * OpenAPI查询服务实现
 */
@Service
@Slf4j
public class PickingRequisitionOpenApiQueryService implements PickingRequisitionQueryService {
    
    @Value("${domain.url}")
    private String domainUrl;
    
    @Autowired
    private AccessTokenUtils accessTokenUtils;
    
    private static final String DETAIL_URI = "/yonbip/scm/pickingrequisition/detail";
    
    @Override
    public PickingRequisitionVO queryById(String id) {
        try {
            String accessToken = accessTokenUtils.getAccessToken();
            String url = domainUrl + "/open-api" + DETAIL_URI 
                + "?access_token=" + accessToken + "&id=" + id;
            
            Map<String, Object> result = OpenApiUtils.getMethod(null, url);
            
            if ("200".equals(result.get("code"))) {
                Object data = result.get("data");
                return JSON.parseObject(JSON.toJSONString(data), PickingRequisitionVO.class);
            }
            return null;
        } catch (Exception e) {
            log.error("查询出库申请失败, id: {}", id, e);
            throw new BusinessException("查询出库申请失败: " + e.getMessage());
        }
    }
    
    @Override
    public List<PickingRequisitionVO> queryByIds(List<String> ids) {
        return ids.stream()
            .map(this::queryById)
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }
}
```

### 方式二：MetaQuery查询

适用于系统内部查询，通过MetaQuery直接查询数据库。

```java
/**
 * MetaQuery查询服务实现
 */
@Service
@Slf4j
public class PickingRequisitionMetaQueryService implements PickingRequisitionQueryService {
    
    /**
     * 查询出库申请详情（含明细）
     */
    @Override
    public PickingRequisitionVO queryById(String id) {
        // 1. 查询主表信息
        Map<String, Object> mainData = queryMainData(id);
        if (mainData == null) {
            return null;
        }
        
        // 2. 转换主表VO
        PickingRequisitionVO vo = convertToMainVO(mainData);
        
        // 3. 查询明细列表
        List<Map<String, Object>> detailDataList = queryDetailData(id);
        
        // 4. 转换明细VO
        List<PickingRequisitionDetailVO> details = detailDataList.stream()
            .map(this::convertToDetailVO)
            .collect(Collectors.toList());
        vo.setDetails(details);
        
        return vo;
    }
    
    /**
     * 查询主表数据
     */
    private Map<String, Object> queryMainData(String id) {
        QuerySchema schema = QuerySchema.create()
            .addSelect(
                "id",
                "code",
                "orgId",
                "orgId.code as orgCode",
                "vouchdate",
                "transTypeId",
                "transTypeId.code as transTypeCode",
                "productionDepartmentId",
                "productionDepartmentId.code as productionDepartmentCode",
                "vendor",
                "vendor.code as vendorCode",
                "vendor.name as vendorName",
                "memo",
                "wmsStatus",
                "pickingRequisitionDefineCharacter"
            )
            .addCondition(QueryConditionGroup.and(
                QueryCondition.name("id").eq(id)
            ));
        
        List<Map<String, Object>> list = MetaDaoHelper.query(
            "st.pickingrequisition.PickingRequisition", 
            schema, 
            "ustock"
        );
        
        return CollectionUtils.isNotEmpty(list) ? list.get(0) : null;
    }
    
    /**
     * 查询明细数据
     */
    private List<Map<String, Object>> queryDetailData(String mainId) {
        QuerySchema schema = QuerySchema.create()
            .addSelect(
                "id",
                "lineno",
                "requisitionId",
                "productn",
                "productn.code as productCode",
                "productn.name as productName",
                "quantity",
                "stockUnitId",
                "stockUnitId.code as stockUnitCode",
                "warehouseId",
                "warehouseId.code as warehouseCode",
                "warehouseId.bWMS as bWMS",
                "batchno",
                "producedate",
                "invaliddate",
                "projectId",
                "projectId.code as projectCode",
                "reserveid",
                "reserveid.code as reserveCode",
                "upcode",
                "requisitionDetailCharacteristics",
                "requisitionDetailDefineCharacter",
                "pickingRequisitionDetailExtend",
                "pickingRequisitionDetailExtend.costCenter.code as costCenterCode"
            )
            .addCondition(QueryConditionGroup.and(
                QueryCondition.name("requisitionId").eq(mainId)
            ));
        
        return MetaDaoHelper.query(
            "st.pickingrequisition.PickingRequisitionDetail", 
            schema, 
            "ustock"
        );
    }
}
```

## 查询字段详解

### 主表查询字段

| 字段路径 | 说明 | 示例值 |
|---------|------|--------|
| id | 主键 | 1234567890 |
| code | 单据编号 | LL202403090001 |
| orgId | 组织ID | 1001 |
| orgId.code | 组织编码 | 1001 |
| vouchdate | 单据日期 | 2024-03-09 |
| transTypeId | 交易类型ID | FA001 |
| transTypeId.code | 交易类型编码 | FA001 |
| productionDepartmentId | 生产部门ID | 部门ID |
| productionDepartmentId.code | 生产部门编码 | D001 |
| vendor | 供应商ID | 供应商ID |
| vendor.code | 供应商编码 | V001 |
| vendor.name | 供应商名称 | XX供应商 |
| memo | 备注 | 备注信息 |
| wmsStatus | WMS推送状态 | 0/1/2/4 |
| pickingRequisitionDefineCharacter | 主表特征组 | {...} |

### 明细查询字段

| 字段路径 | 说明 | 示例值 |
|---------|------|--------|
| id | 明细ID | 明细ID |
| lineno | 行号 | 1 |
| requisitionId | 主表ID | 主表ID |
| productn | 物料ID | 物料ID |
| productn.code | 物料编码 | MAT001 |
| productn.name | 物料名称 | 物料名称 |
| quantity | 数量 | 100.00 |
| stockUnitId | 库存单位ID | 单位ID |
| stockUnitId.code | 库存单位编码 | PCS |
| warehouseId | 仓库ID | 仓库ID |
| warehouseId.code | 仓库编码 | WH001 |
| warehouseId.bWMS | WMS仓标识 | true/false |
| batchno | 批次号 | BATCH001 |
| producedate | 生产日期 | 2024-03-01 |
| invaliddate | 失效日期 | 2025-03-01 |
| projectId | 项目ID | 项目ID |
| projectId.code | 项目编码 | PJ001 |
| reserveid | 跟踪线索ID | 线索ID |
| reserveid.code | 跟踪线索编码 | RSV001 |
| upcode | 上游单据号 | PO202403090001 |
| requisitionDetailCharacteristics | 物料自由项特征组 | {...} |
| requisitionDetailDefineCharacter | 明细自定义项特征组 | {...} |
| pickingRequisitionDetailExtend.costCenter.code | 成本中心编码 | CC001 |

## 特征组字段处理

### 动态识别说明

特征组字段必须从用户提供的字段映射文档中动态识别，以下是常见的特征字段处理模式：

```java
/**
 * 处理特征组字段
 * 
 * 重要：此方法中的字段映射必须从用户提供的字段映射文档中动态识别生成
 * 
 * 生成规则：
 * 1. 扫描用户提供的字段映射文档（Excel/Word等）
 * 2. 识别描述为"主表特征属性"或"明细特征属性"的BIP字段
 * 3. 根据目标系统字段匹配业务含义
 * 4. 动态生成字段获取和转换代码
 */
private void processDefineCharacter(PickingRequisitionDetailVO vo, 
                                     Map<String, Object> detailData) {
    // ============================================
    // 动态生成区域 - 根据字段映射文档自动识别特征字段
    // ============================================
    
    // 示例1：从明细自定义项特征组获取工位编码
    // 从文档识别：requisitionDetailDefineCharacter.GWBM → workStation
    Map<String, Object> defineCharacter = 
        (Map<String, Object>) detailData.get("requisitionDetailDefineCharacter");
    if (defineCharacter != null && defineCharacter.get("GWBM") != null) {
        vo.setWorkStationCode((String) defineCharacter.get("GWBM"));
    }
    
    // 示例2：从物料自由项特征组获取特定字段
    // 从文档识别：requisitionDetailCharacteristics.{字段} → 目标字段
    Map<String, Object> characteristics = 
        (Map<String, Object>) detailData.get("requisitionDetailCharacteristics");
    if (characteristics != null) {
        // 动态识别字段...
    }
    
    // 示例3：从明细扩展信息获取成本中心
    // 从文档识别：pickingRequisitionDetailExtend.costCenter.code → costCenter
    Map<String, Object> extend = 
        (Map<String, Object>) detailData.get("pickingRequisitionDetailExtend");
    if (extend != null) {
        Map<String, Object> costCenter = (Map<String, Object>) extend.get("costCenter");
        if (costCenter != null) {
            vo.setCostCenterCode((String) costCenter.get("code"));
        }
    }
}
```

## 查询服务接口定义

```java
/**
 * 出库申请查询服务接口
 */
public interface PickingRequisitionQueryService {
    
    /**
     * 根据ID查询出库申请详情
     * @param id 出库申请ID
     * @return 出库申请详情
     */
    PickingRequisitionVO queryById(String id);
    
    /**
     * 批量查询出库申请
     * @param ids 出库申请ID列表
     * @return 出库申请列表
     */
    List<PickingRequisitionVO> queryByIds(List<String> ids);
    
    /**
     * 根据条件查询出库申请列表
     * @param condition 查询条件
     * @return 出库申请列表
     */
    List<PickingRequisitionVO> queryByCondition(PickingRequisitionQueryCondition condition);
}

/**
 * 查询条件
 */
@Data
public class PickingRequisitionQueryCondition {
    
    /** 组织ID */
    private String orgId;
    
    /** 单据编号 */
    private String code;
    
    /** 交易类型编码 */
    private String transTypeCode;
    
    /** 开始日期 */
    private String startDate;
    
    /** 结束日期 */
    private String endDate;
    
    /** WMS推送状态 */
    private String wmsStatus;
    
    /** 上游单据号 */
    private String upcode;
}
```

## 异常处理

### 常见异常场景

1. **数据不存在**：出库申请ID无效或单据已被删除
2. **无权限**：当前用户无查询权限
3. **查询超时**：数据量大或网络延迟
4. **字段映射错误**：字段路径不正确

### 异常处理代码

```java
try {
    // 查询逻辑
} catch (DataNotFoundException e) {
    log.error("出库申请不存在, id: {}", id, e);
    throw new BusinessException("出库申请不存在：" + e.getMessage());
} catch (PermissionDeniedException e) {
    log.error("无查询权限, id: {}", id, e);
    throw new BusinessException("无查询权限：" + e.getMessage());
} catch (QueryTimeoutException e) {
    log.error("查询超时, id: {}", id, e);
    throw new BusinessException("查询超时，请稍后重试");
}
```

## 注意事项

1. **数据完整性**：确保主表和明细数据都完整返回
2. **特征字段**：特征组字段可能为空，需做空值判断
3. **性能优化**：大数据量查询时考虑分页或异步处理
4. **缓存策略**：适当使用缓存提高查询性能
5. **日志记录**：关键查询操作需记录日志便于追溯
