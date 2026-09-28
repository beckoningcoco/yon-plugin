# 场景2：BIP推送出库到LIMS

## 概述

> **⚠️ 触发条件**：BIP其他出库单审批通过
> **⚠️ 前置条件**：已配置LIMS系统
> **⚠️ 代码规范**：遵循BIP MVC分层架构

---

## 1. 业务流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BIP推送出库到LIMS流程                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  1.审批通过    │ -> │  2.查询出库单  │ -> │  3.字段映射   │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  出库单审批         从BIP查询其他          按映射关系转                          │
│  通过               出库单数据             换LIMS格式                           │
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  4.调用LIMS    │ -> │  5.解析响应   │ -> │  6.特征回写   │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  推送数据到          解析返回结果         更新特征"是否已                         │
│  LIMS系统            并返回               推送LIMS"状态为"已推送"               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 代码实现

### 2.1 Service接口

```java
package com.yonyou.xxx.lims.service;

import java.util.List;
import java.util.Map;

/**
 * LIMS出库推送服务接口
 */
public interface LimsOutPushService {

    /**
     * 推送其他出库单到LIMS
     * @param billIds 出库单ID列表
     * @return 推送结果
     */
    Map<String, Object> push(List<String> billIds) throws Exception;
}
```

### 2.2 Service实现

> **⚠️ BIP规范**：Service层使用 `@Transactional` 管理事务，查询使用 `IBillQueryRepository`

```java
package com.yonyou.xxx.lims.service.impl;

import com.yonyou.iuap.ucf.api.IBillQueryRepository;
import com.yonyou.xxx.lims.mapper.LimsOutFieldMapper;
import com.yonyou.xxx.lims.service.LimsOutPushService;
import com.yonyou.xxx.lims.service.ThirdPartyLimsService;
import com.yonyou.xxx.lims.service.LimsStatusWriteService;
import org.apache.commons.collections4.CollectionUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * LIMS出库推送服务实现
 */
@Service
public class LimsOutPushServiceImpl implements LimsOutPushService {

    private static final Logger logger = LoggerFactory.getLogger(LimsOutPushServiceImpl.class);

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Autowired
    private LimsOutFieldMapper fieldMapper;

    @Autowired
    private ThirdPartyLimsService limsService;

    @Autowired
    private LimsStatusWriteService statusWriteService;

    @Override
    @Transactional(rollbackOn = Exception.class)
    public Map<String, Object> push(List<String> billIds) throws Exception {
        Map<String, Object> result = new HashMap<>();
        List<String> successIds = new ArrayList<>();
        List<String> failIds = new ArrayList<>();
        StringBuilder errorMsg = new StringBuilder();

        for (String billId : billIds) {
            try {
                // 1. 查询出库单 - 使用 IBillQueryRepository
                Map<String, Object> outRecord = queryOthOutRecord(billId);
                if (outRecord == null) {
                    failIds.add(billId);
                    errorMsg.append("单据[").append(billId).append("]不存在;");
                    continue;
                }

                // 2. 检查是否已推送（非强制推送时）
                Boolean isPushed = checkAlreadyPushed(outRecord);
                if (Boolean.TRUE.equals(isPushed)) {
                    logger.info("单据[{}]已推送LIMS，跳过", billId);
                    continue;
                }

                // 3. 字段转换
                Map<String, Object> targetData = fieldMapper.convert(outRecord);

                // 4. 调用LIMS
                LimsApiResponse response = limsService.pushOutRecord(targetData);

                // 5. 回写特征状态 - 使用 IYmsJdbcApi
                statusWriteService.writeBackPushStatus(billId, "已推送", response);
                if (response.isSuccess()) {
                    statusWriteService.writeBackPushTime(billId, new Date());
                }

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
                logger.error("BIP推送出库到LIMS异常:{}", billId, e);
            }
        }

        result.put("successIds", successIds);
        result.put("failIds", failIds);
        result.put("msg", errorMsg.toString());
        result.put("successCount", successIds.size());
        result.put("failCount", failIds.size());

        return result;
    }

    /**
     * 查询其他出库单
     * 使用 IBillQueryRepository
     */
    private Map<String, Object> queryOthOutRecord(String billId) {
        // 使用 IBillQueryRepository 查询 st.othoutrecord.OthOutRecord
        return null;
    }

    /**
     * 检查是否已推送LIMS
     * 从特征组 othOutRecordDefineCharacter 获取状态
     */
    private Boolean checkAlreadyPushed(Map<String, Object> outRecord) {
        // 从特征组获取"是否已推送LIMS"状态
        Map<String, Object> defineCharacter =
            (Map<String, Object>) outRecord.get("othOutRecordDefineCharacter");
        if (defineCharacter != null) {
            // TODO: 根据实际特征字段编码获取
            // String isPushLims = (String) defineCharacter.get("char_001");
            // return "已推送".equals(isPushLims);
        }
        return false;
    }
}
```

---

## 3. 特征状态回写说明

### 3.1 特征字段说明

| 特征字段 | 说明 | 值示例 |
|----------|------|--------|
| char_001（是否已推送LIMS） | 推送状态 | "未推送"、"已推送"、"推送失败" |
| char_002（LIMS推送时间） | 推送时间 | 2024-01-01 10:00:00 |

### 3.2 特征组

- **特征组名称**：`othOutRecordDefineCharacter`
- **所属单据**：其他出库单（st.othoutrecord.OthOutRecord）

### 3.3 状态流转

| 状态 | 说明 |
|------|------|
| 空/未推送 | 未推送 |
| 已推送 | 推送成功 |
| 推送失败 | 推送失败 |

---

## 4. 配置项

### 4.1 application.properties

```properties
# LIMS推送接口
lims.push.url=/api/out/push

# 鉴权配置
lims.auth.url=/api/auth/token
lims.auth.appKey=your_app_key
lims.auth.appSecret=your_app_secret
```

---

## 5. 检查清单

- [ ] 确认出库单ID列表非空
- [ ] 检查出库单状态是否为已审核状态
- [ ] 检查是否已推送（跳过已推送）
- [ ] 验证必填字段是否完整
- [ ] 记录推送日志
- [ ] 处理推送异常
- [ ] 回写特征"是否已推送LIMS"状态（使用 IYmsJdbcApi）
- [ ] 回写LIMS推送时间