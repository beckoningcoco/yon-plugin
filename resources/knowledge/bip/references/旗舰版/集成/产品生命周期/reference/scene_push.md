# 场景1：销售订单推送PLM

## 概述

> **⚠️ 触发条件**：用户发起销售订单推送请求
> **⚠️ 前置条件**：已配置PLM（CAPP）系统

---

## 1. 业务流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         销售订单推送PLM流程                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  1.参数校验   │ -> │  2.查询订单   │ -> │  3.BOM过滤    │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  验证订单ID         从BIP查询销售         过滤已有BOM                            │
│  非空               订单数据和明细        的订单（光电缆组织）                  │
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  4.字段转换   │ -> │  5.调用PLM    │ -> │  6.解析响应    │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  按映射关系转          推送数据到          解析返回结果                           │
│  换目标字段            CAPP                并返回                               │
│                                                                                  │
│  ┌────────────────┐                                                              │
│  │  7.回写状态    │                                                              │
│  └────────────────┘                                                              │
│         │                                                                        │
│         v                                                                        │
│  更新订单                                                                   │
│  push_plm_status                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 代码实现

### 2.1 Controller

```java
@RestController
@RequestMapping("/saleorder/plm")
public class SaleOrderPlmPushController {

    @Autowired
    private SaleOrderPlmPushService pushService;

    /**
     * 销售订单推送PLM
     * POST /saleorder/plm/push
     */
    @PostMapping("/push")
    public RestResult<SaleOrderPlmResult> push(@RequestBody SaleOrderPlmPushRequest request) {
        if (request == null || CollectionUtils.isEmpty(request.getBillIds())) {
            return RestResult.fail("单据ID不能为空");
        }

        try {
            SaleOrderPlmResult result = pushService.push(request.getBillIds());
            return RestResult.success(result);
        } catch (Exception e) {
            log.error("销售订单推送PLM失败", e);
            return RestResult.fail(e.getMessage());
        }
    }
}
```

### 2.2 Request DTO

```java
@Data
public class SaleOrderPlmPushRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 销售订单ID列表
     */
    private List<String> billIds;

    /**
     * 是否强制推送（忽略已推送状态）
     */
    private Boolean forcePush = false;
}
```

### 2.3 Service接口

```java
public interface SaleOrderPlmPushService {
    /**
     * 推送销售订单到PLM
     * @param billIds 销售订单ID列表
     * @return 推送结果
     */
    SaleOrderPlmResult push(List<String> billIds) throws Exception;
}
```

### 2.4 Service实现

```java
@Service
public class SaleOrderPlmPushServiceImpl implements SaleOrderPlmPushService {

    @Autowired
    private SaleOrderPlmQueryService queryService;

    @Autowired
    private SaleOrderPlmFieldMapper fieldMapper;

    @Autowired
    private ThirdPartyPlmService plmService;

    @Autowired
    private SaleOrderPlmResponseParser responseParser;

    @Autowired
    private SaleOrderPlmResultWriteService resultWriteService;

    @Override
    public SaleOrderPlmResult push(List<String> billIds) throws Exception {
        SaleOrderPlmResult result = new SaleOrderPlmResult();
        List<String> successIds = new ArrayList<>();
        List<String> failIds = new ArrayList<>();
        StringBuilder errorMsg = new StringBuilder();

        for (String billId : billIds) {
            try {
                // 1. 查询销售订单
                Map<String, Object> saleOrder = queryService.querySaleOrder(billId);
                if (saleOrder == null) {
                    failIds.add(billId);
                    errorMsg.append("单据[").append(billId).append("]不存在;");
                    continue;
                }

                // 2. BOM过滤（仅光电缆组织）
                if (!filterNoHasBom(saleOrder)) {
                    // 已有BOM，跳过推送
                    resultWriteService.writeBackWithStatus(billId, "已有BOM");
                    continue;
                }

                // 3. 字段转换
                Map<String, Object> targetData = fieldMapper.convert(saleOrder);

                // 4. 调用PLM
                PlmApiResponse response = plmService.pushSaleOrder(targetData);

                // 5. 解析响应
                SaleOrderPlmResult parseResult = responseParser.parse(response);

                // 6. 回写状态
                resultWriteService.writeBack(billId, response);

                if (response.isSuccess()) {
                    successIds.add(billId);
                } else {
                    failIds.add(billId);
                    errorMsg.append("单据[").append(billId).append("]推送失败:")
                           .append(response.getMessage()).append(";");
                }
            } catch (Exception e) {
                failIds.add(billId);
                errorMsg.append("单据[").append(billId).append("]异常:").append(e.getMessage()).append(";");
                log.error("销售订单推送PLM异常:{}", billId, e);
            }
        }

        result.setSuccessIds(successIds);
        result.setFailIds(failIds);
        result.setMsg(errorMsg.toString());

        return result;
    }

    /**
     * 过滤已有BOM的订单（仅光电缆组织）
     * @param saleOrder 销售订单
     * @return true-需要推送，false-已有BOM无需推送
     */
    private boolean filterNoHasBom(Map<String, Object> saleOrder) {
        // 仅光电缆组织需要过滤BOM
        String orgId = (String) saleOrder.get("salesOrgId");
        if (!"2038558518812868611".equals(orgId)) {
            return true;
        }

        // TODO: 查询BOM是否存在
        // 查询逻辑参考原代码 filterNoHasBom 方法
        return true;
    }
}
```

### 2.5 Result DTO

```java
@Data
public class SaleOrderPlmResult implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 成功数量
     */
    private Integer successCount;

    /**
     * 失败数量
     */
    private Integer failCount;

    /**
     * 成功ID列表
     */
    private List<String> successIds;

    /**
     * 失败ID列表
     */
    private List<String> failIds;

    /**
     * 错误信息
     */
    private String msg;

    /**
     * 是否全部成功
     */
    public boolean isAllSuccess() {
        return failIds == null || failIds.isEmpty();
    }
}
```

---

## 3. 配置项

### 3.1 application.properties

```properties
# PLM(CAPP)接口地址
plm.host=http://xxx.capp.com
plm.push.url=/api/order/save

# 鉴权配置
plm.auth.url=/api/auth/token
plm.auth.appKey=your_app_key
plm.auth.appSecret=your_app_secret
```

### 3.2 平行表字段

```sql
-- 表名：uorders.orders_parallel_cost
ALTER TABLE uorders.orders_parallel_cost ADD COLUMN push_plm_status VARCHAR(50);
ALTER TABLE uorders.orders_parallel_cost ADD COLUMN push_plm_time DATETIME;
```

---

## 4. 状态流转

| push_plm_status | 说明 |
|-----------------|------|
| null | 未推送 |
| "推送中" | 刚提交推送 |
| "成功" / "1" | 推送成功 |
| "已有BOM" | 物料已有BOM，无需推送 |
| "-1" | 推送失败 |

---

## 5. 检查清单

- [ ] 确认销售订单ID列表非空
- [ ] 检查销售订单状态是否为已审核状态
- [ ] 光电缆组织需过滤已有BOM的订单
- [ ] 验证必填字段是否完整
- [ ] 记录推送日志
- [ ] 处理推送异常
- [ ] 回写推送结果