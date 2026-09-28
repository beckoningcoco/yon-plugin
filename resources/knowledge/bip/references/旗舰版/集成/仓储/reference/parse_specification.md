# 解析WMS接口返回数据场景规范

## 业务语义

解析WMS接口返回数据是指处理WMS系统响应的报文，根据响应结果更新BIP系统中的单据状态，并记录操作日志。

### 业务目标

确保WMS的响应结果能够正确解析，并根据结果更新BIP单据状态，保证数据一致性。

### 前置条件

1. 已成功调用WMS接口
2. 已接收到WMS响应数据
3. 具备更新BIP单据状态的权限

## 核心流程

```
WMS响应数据 ──▶ 解析响应 ──▶ 判断成功/失败 ──▶ 回写状态 ──▶ 记录日志
```

## 响应解析规范

### 响应结构

```java
/**
 * WMS响应结构
 */
@Data
public class WmsResponseDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /** 响应码（S-成功，E-失败） */
    private String code;
    
    /** 成功标识 */
    private String success;
    
    /** 响应消息 */
    private String msg;
    
    /** 响应消息（备选字段） */
    private String message;
    
    /** 业务数据 */
    private JSONObject data;
    
    /**
     * 判断是否成功
     */
    public boolean isSuccess() {
        return "S".equals(code) || "200".equals(code) || "true".equalsIgnoreCase(success);
    }
    
    /**
     * 判断是否重复推送
     */
    public boolean isDuplicate() {
        return StringUtils.isNotBlank(getMsg()) && 
               (getMsg().contains("不允许重复推送") || getMsg().contains("已存在"));
    }
    
    /**
     * 获取消息（兼容msg和message字段）
     */
    public String getMsg() {
        return StringUtils.isNotBlank(msg) ? msg : message;
    }
}
```

### 响应码定义

| 响应码 | 含义 | 处理方式 |
|--------|------|---------|
| S | 成功 | 更新状态为推送成功 |
| 200 | 成功 | 更新状态为推送成功 |
| E | 失败 | 更新状态为推送失败，记录错误信息 |
| 其他 | 失败 | 更新状态为推送失败，记录错误信息 |

## 核心代码模板

### 1. 响应解析服务接口

```java
/**
 * WMS响应解析服务
 */
public interface WmsResponseParser {
    
    /**
     * 解析WMS响应
     * @param responseBody 响应体
     * @return 解析后的响应DTO
     */
    WmsResponseDTO parse(String responseBody);
    
    /**
     * 处理WMS响应
     * @param billId 单据ID
     * @param responseDTO 响应DTO
     * @param billType 单据类型
     * @return 处理结果
     */
    boolean processResponse(String billId, WmsResponseDTO responseDTO, String billType);
}
```

### 2. 响应解析服务实现

```java
/**
 * WMS响应解析服务实现
 */
@Service
@Slf4j
public class WmsResponseParserImpl implements WmsResponseParser {
    
    @Autowired
    private PickingRequisitionStatusService statusService;
    
    @Autowired
    private IntegrationLogService logService;
    
    @Override
    public WmsResponseDTO parse(String responseBody) {
        if (StringUtils.isBlank(responseBody)) {
            throw new BusinessException("WMS响应数据为空");
        }
        
        try {
            JSONObject jsonObject = JSON.parseObject(responseBody);
            WmsResponseDTO dto = new WmsResponseDTO();
            
            dto.setCode(jsonObject.getString("code"));
            dto.setSuccess(jsonObject.getString("success"));
            dto.setMsg(jsonObject.getString("msg"));
            dto.setMessage(jsonObject.getString("message"));
            dto.setData(jsonObject.getJSONObject("data"));
            
            return dto;
            
        } catch (Exception e) {
            log.error("解析WMS响应失败", e);
            throw new BusinessException("解析WMS响应失败：" + e.getMessage());
        }
    }
    
    @Override
    public boolean processResponse(String billId, WmsResponseDTO responseDTO, String billType) {
        if (responseDTO == null) {
            log.error("响应DTO为空，单据ID：{}", billId);
            return false;
        }
        
        boolean isSuccess = responseDTO.isSuccess();
        boolean isDuplicate = responseDTO.isDuplicate();
        
        // 重复推送视为成功
        if (isDuplicate) {
            log.info("单据已存在WMS，视为推送成功，单据ID：{}", billId);
            isSuccess = true;
        }
        
        // 更新单据状态
        if (isSuccess) {
            statusService.updateSuccessStatus(billId, billType);
        } else {
            statusService.updateFailStatus(billId, billType, responseDTO.getMsg());
        }
        
        // 记录操作日志
        logService.saveLog(billId, billType, isSuccess, responseDTO);
        
        return isSuccess;
    }
}
```

### 3. 状态回写服务

```java
/**
 * 出库申请状态服务
 */
@Service
@Slf4j
public class PickingRequisitionStatusService {
    
    @Autowired
    private IYmsJdbcApi jdbcApi;
    
    /**
     * 更新推送成功状态
     */
    public void updateSuccessStatus(String billId, String billType) {
        try {
            String table = getParallelTable(billType);
            String sql = "UPDATE " + table + " SET wms_status = ? WHERE id = ?";
            
            SQLParameter parameter = new SQLParameter();
            parameter.addParam(WmsPushStatusEnum.PUSH_SUCCESS.getCode());
            parameter.addParam(billId);
            
            jdbcApi.update(sql, parameter);
            log.info("更新WMS推送成功状态，单据ID：{}", billId);
            
        } catch (Exception e) {
            log.error("更新WMS推送成功状态失败，单据ID：{}", billId, e);
            throw new BusinessException("更新状态失败：" + e.getMessage());
        }
    }
    
    /**
     * 更新推送失败状态
     */
    public void updateFailStatus(String billId, String billType, String errorMsg) {
        try {
            String table = getParallelTable(billType);
            String sql = "UPDATE " + table + " SET wms_status = ?, error_msg = ? WHERE id = ?";
            
            SQLParameter parameter = new SQLParameter();
            parameter.addParam(WmsPushStatusEnum.PUSH_FAIL.getCode());
            parameter.addParam(errorMsg);
            parameter.addParam(billId);
            
            jdbcApi.update(sql, parameter);
            log.info("更新WMS推送失败状态，单据ID：{}，错误信息：{}", billId, errorMsg);
            
        } catch (Exception e) {
            log.error("更新WMS推送失败状态失败，单据ID：{}", billId, e);
            throw new BusinessException("更新状态失败：" + e.getMessage());
        }
    }
    
    /**
     * 更新推送中状态
     */
    public void updatePushingStatus(String billId, String billType) {
        try {
            String table = getParallelTable(billType);
            String sql = "UPDATE " + table + " SET wms_status = ? WHERE id = ?";
            
            SQLParameter parameter = new SQLParameter();
            parameter.addParam(WmsPushStatusEnum.PUSHING.getCode());
            parameter.addParam(billId);
            
            jdbcApi.update(sql, parameter);
            log.info("更新WMS推送中状态，单据ID：{}", billId);
            
        } catch (Exception e) {
            log.error("更新WMS推送中状态失败，单据ID：{}", billId, e);
            throw new BusinessException("更新状态失败：" + e.getMessage());
        }
    }
    
    /**
     * 重置推送状态（用于重新推送）
     */
    public void resetStatus(String billId, String billType) {
        try {
            String table = getParallelTable(billType);
            String sql = "UPDATE " + table + " SET wms_status = ?, error_msg = null WHERE id = ?";
            
            SQLParameter parameter = new SQLParameter();
            parameter.addParam(WmsPushStatusEnum.NOT_PUSHED.getCode());
            parameter.addParam(billId);
            
            jdbcApi.update(sql, parameter);
            log.info("重置WMS推送状态，单据ID：{}", billId);
            
        } catch (Exception e) {
            log.error("重置WMS推送状态失败，单据ID：{}", billId, e);
            throw new BusinessException("重置状态失败：" + e.getMessage());
        }
    }
    
    /**
     * 获取平行表名称
     */
    private String getParallelTable(String billType) {
        PushWMSAuditTypeEnum typeEnum = PushWMSAuditTypeEnum.findByCode(billType);
        return typeEnum != null ? typeEnum.getParallelTable() : "";
    }
}
```

### 4. 集成日志服务

```java
/**
 * 集成日志服务
 */
@Service
@Slf4j
public class IntegrationLogService {
    
    @Autowired
    private IYmsJdbcApi jdbcApi;
    
    /**
     * 保存集成日志
     */
    public void saveLog(String billId, String billType, boolean success, WmsResponseDTO responseDTO) {
        try {
            String sql = "INSERT INTO ustock.wms_integration_log " +
                        "(id, bill_id, bill_type, push_status, response_code, response_msg, create_time) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?)";
            
            SQLParameter parameter = new SQLParameter();
            parameter.addParam(UUID.randomUUID().toString());
            parameter.addParam(billId);
            parameter.addParam(billType);
            parameter.addParam(success ? "1" : "2");
            parameter.addParam(responseDTO.getCode());
            parameter.addParam(responseDTO.getMsg());
            parameter.addParam(new Date());
            
            jdbcApi.update(sql, parameter);
            
        } catch (Exception e) {
            log.error("保存集成日志失败", e);
            // 日志保存失败不影响主流程
        }
    }
    
    /**
     * 保存完整请求响应日志
     */
    public void saveFullLog(String billCode, String requestData, String responseData, 
                           String status, String msg, String url, String billId, 
                           String tenantId, String billType) {
        try {
            // 使用CustomLogger记录日志
            boolean fail = !"Y".equals(status);
            CustomLogger.addLog(fail, billCode, requestData, responseData, status, 
                               msg, "", "~", url, billId, tenantId, billType);
            
        } catch (Exception e) {
            log.error("保存完整日志失败", e);
        }
    }
}
```

### 5. 完整的推送流程（含响应解析）

```java
/**
 * 出库申请WMS推送服务
 */
@Service
@Slf4j
public class PickingRequisitionPushService {
    
    @Autowired
    private PickingRequisitionQueryService queryService;
    
    @Autowired
    private PickingRequisitionConverter converter;
    
    @Autowired
    private WmsApiService wmsApiService;
    
    @Autowired
    private WmsResponseParser responseParser;
    
    @Autowired
    private PickingRequisitionStatusService statusService;
    
    @Autowired
    private IntegrationLogService logService;
    
    /**
     * 推送出库申请到WMS（完整流程）
     */
    public PushResult pushToWms(String billId) {
        log.info("开始推送出库申请到WMS，单据ID：{}", billId);
        
        try {
            // 1. 更新推送中状态
            statusService.updatePushingStatus(billId, "outRequisitionAudit");
            
            // 2. 查询出库申请数据
            PickingRequisitionVO vo = queryService.queryById(billId);
            if (vo == null) {
                throw new BusinessException("出库申请不存在，ID：" + billId);
            }
            
            // 3. 转换为WMS格式
            WmsPickingRequisitionRequestDTO requestDTO = converter.convertToWmsRequest(vo);
            
            // 4. 调用WMS接口
            String requestJson = JSON.toJSONString(requestDTO);
            WmsResponseDTO responseDTO = wmsApiService.pushPickingRequisition(requestDTO);
            
            // 5. 处理响应
            boolean success = responseParser.processResponse(billId, responseDTO, "outRequisitionAudit");
            
            // 6. 返回结果
            PushResult result = new PushResult();
            result.setSuccess(success);
            result.setCode(responseDTO.getCode());
            result.setMessage(responseDTO.getMsg());
            
            log.info("推送出库申请到WMS完成，单据ID：{}，结果：{}", billId, success);
            
            return result;
            
        } catch (Exception e) {
            log.error("推送出库申请到WMS失败，单据ID：{}", billId, e);
            
            // 更新失败状态
            statusService.updateFailStatus(billId, "outRequisitionAudit", e.getMessage());
            
            PushResult result = new PushResult();
            result.setSuccess(false);
            result.setCode("ERROR");
            result.setMessage(e.getMessage());
            
            return result;
        }
    }
    
    /**
     * 批量推送
     */
    public List<PushResult> pushBatchToWms(List<String> billIds) {
        List<PushResult> results = new ArrayList<>();
        
        for (String billId : billIds) {
            PushResult result = pushToWms(billId);
            result.setBillId(billId);
            results.add(result);
        }
        
        return results;
    }
}

/**
 * 推送结果
 */
@Data
public class PushResult {
    
    /** 单据ID */
    private String billId;
    
    /** 是否成功 */
    private boolean success;
    
    /** 响应码 */
    private String code;
    
    /** 响应消息 */
    private String message;
}
```

## 特殊场景处理

### 1. 重复推送处理

```java
/**
 * 重复推送处理
 */
public boolean handleDuplicatePush(String billId, WmsResponseDTO responseDTO) {
    if (responseDTO.isDuplicate()) {
        log.info("单据已存在WMS，视为推送成功，单据ID：{}", billId);
        
        // 更新为成功状态
        statusService.updateSuccessStatus(billId, "outRequisitionAudit");
        
        // 记录日志
        logService.saveLog(billId, "outRequisitionAudit", true, responseDTO);
        
        return true;
    }
    return false;
}
```

### 2. 部分成功处理（批量推送）

```java
/**
 * 批量推送结果处理
 */
public BatchPushResult handleBatchResult(List<PushResult> results) {
    int successCount = 0;
    int failCount = 0;
    List<String> failIds = new ArrayList<>();
    
    for (PushResult result : results) {
        if (result.isSuccess()) {
            successCount++;
        } else {
            failCount++;
            failIds.add(result.getBillId());
        }
    }
    
    BatchPushResult batchResult = new BatchPushResult();
    batchResult.setTotalCount(results.size());
    batchResult.setSuccessCount(successCount);
    batchResult.setFailCount(failCount);
    batchResult.setFailIds(failIds);
    
    return batchResult;
}
```

### 3. 异步推送结果查询

```java
/**
 * 异步推送结果查询
 */
@Service
public class AsyncPushResultQueryService {
    
    /**
     * 查询异步推送结果
     */
    public WmsResponseDTO queryAsyncResult(String taskId) {
        // 调用WMS查询接口
        String url = wmsApiConfig.getEsbDomain() + "/xdesb/wms/queryTaskResult?taskId=" + taskId;
        
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
        
        return responseParser.parse(response.getBody());
    }
}
```

## 异常处理

### 常见异常场景

1. **响应解析异常**：JSON格式不正确
2. **状态更新异常**：数据库更新失败
3. **日志记录异常**：日志表写入失败

### 异常处理代码

```java
try {
    // 解析响应
    WmsResponseDTO responseDTO = responseParser.parse(responseBody);
    
    // 处理响应
    responseParser.processResponse(billId, responseDTO, billType);
    
} catch (JSONException e) {
    log.error("响应JSON解析失败", e);
    // 记录原始响应，便于排查
    logService.saveLog(billId, billType, false, 
        buildErrorResponse("JSON_PARSE_ERROR", "响应解析失败：" + e.getMessage()));
    
} catch (DataAccessException e) {
    log.error("数据库操作失败", e);
    // 状态更新失败，但响应已收到
    throw new BusinessException("状态更新失败：" + e.getMessage());
    
} catch (Exception e) {
    log.error("处理WMS响应异常", e);
    throw new BusinessException("处理响应异常：" + e.getMessage());
}
```

## 注意事项

1. **幂等性**：重复推送应视为成功，不重复更新状态
2. **事务一致性**：状态更新和日志记录应在同一事务中
3. **异常隔离**：日志记录失败不应影响主流程
4. **响应校验**：严格校验响应字段，避免空指针
5. **错误信息**：保存完整的错误信息，便于问题排查
