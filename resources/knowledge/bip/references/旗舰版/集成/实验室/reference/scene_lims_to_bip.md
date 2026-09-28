# 场景1：LIMS推送入库

## 概述

> **⚠️ 触发条件**：LIMS系统推送物料入库通知
> **⚠️ 前置条件**：已配置LIMS系统
> **⚠️ 代码规范**：遵循BIP MVC分层架构

---

## 1. 业务流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LIMS推送入库流程                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  1.接收数据   │ -> │  2.数据校验   │ -> │  3.映射转换   │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  接收LIMS         校验物料编码、        将LIMS数据                              │
│  入库通知         仓库、组织存在         转换为BIP格式                          │
│                                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                  │
│  │  4.创建入库单  │ -> │  5.响应返回   │ -> │  6.状态回写   │                  │
│  └────────────────┘    └────────────────┘    └────────────────┘                  │
│         │                      │                      │                         │
│         v                      v                      v                         │
│  调用BIP创建          返回创建结果         更新LIMS                              │
│  其他入库单            给LIMS             入库状态                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 代码实现

### 2.1 Service接口

```java
package com.yonyou.xxx.lims.service;

import java.util.Map;

/**
 * LIMS入库接收服务接口
 */
public interface LimsInReceiveService {

    /**
     * 接收LIMS入库通知，创建BIP其他入库单
     * @param request 入库请求数据
     * @return 创建结果
     */
    Map<String, Object> receive(Map<String, Object> request) throws Exception;
}
```

### 2.2 Service实现

> **⚠️ BIP规范**：Service层使用 `@Transactional` 管理事务

```java
package com.yonyou.xxx.lims.service.impl;

import com.yonyou.xxx.lims.mapper.LimsInFieldMapper;
import com.yonyou.xxx.lims.service.LimsInReceiveService;
import org.apache.commons.collections4.MapUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * LIMS入库接收服务实现
 */
@Service
public class LimsInReceiveServiceImpl implements LimsInReceiveService {

    private static final Logger logger = LoggerFactory.getLogger(LimsInReceiveServiceImpl.class);

    @Autowired
    private LimsInFieldMapper fieldMapper;

    @Override
    @Transactional(rollbackOn = Exception.class)
    public Map<String, Object> receive(Map<String, Object> request) throws Exception {
        Map<String, Object> result = new HashMap<>();

        // 1. 数据校验
        if (MapUtils.isEmpty(request)) {
            throw new Exception("参数不能为空");
        }

        String orgCode = (String) request.get("orgCode");
        if (StringUtils.isEmpty(orgCode)) {
            throw new Exception("组织编码不能为空");
        }

        String warehouseCode = (String) request.get("warehouseCode");
        if (StringUtils.isEmpty(warehouseCode)) {
            throw new Exception("仓库编码不能为空");
        }

        Object detailsObj = request.get("details");
        if (detailsObj == null) {
            throw new Exception("入库明细不能为空");
        }

        logger.info("LIMS入库通知接收，orgCode:{}, warehouseCode:{}", orgCode, warehouseCode);

        // 2. 转换为BIP格式
        Map<String, Object> bipData = fieldMapper.convert(request);

        // 3. 调用BIP创建其他入库单
        // TODO: 使用 IBillRepository 或 IYmsJdbcApi 创建其他入库单
        // String billId = createOthInRecord(bipData);

        result.put("success", true);
        result.put("billId", "");  // TODO: 替换为实际单据ID
        result.put("msg", "入库单创建成功");

        return result;
    }
}
```

### 2.3 字段映射器

```java
package com.yonyou.xxx.lims.mapper;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * LIMS入库字段映射器
 * 将LIMS数据转换为BIP其他入库单格式
 */
@Component
public class LimsInFieldMapper {

    /**
     * 将LIMS数据转换为BIP其他入库单格式
     * @param sourceData LIMS入库数据
     * @return BIP目标格式数据
     */
    public Map<String, Object> convert(Map<String, Object> sourceData) throws Exception {
        Map<String, Object> target = new HashMap<>();

        if (sourceData == null) {
            return target;
        }

        // ==================== 单据信息 ====================
        target.put("code", sourceData.get("limsBillCode"));  // LIMS单据编号
        target.put("vouchdate", new java.util.Date());       // 入库日期

        // ==================== 组织映射 ====================
        if (sourceData.get("orgCode") != null) {
            String orgId = queryOrgId(sourceData.get("orgCode").toString());
            target.put("orgId", orgId);
        }

        // ==================== 仓库映射 ====================
        if (sourceData.get("warehouseCode") != null) {
            String warehouseId = queryWarehouseId(sourceData.get("warehouseCode").toString());
            target.put("warehouseId", warehouseId);
        }

        // ==================== 物料映射 ====================
        List<Map<String, Object>> inLines = convertInLines(sourceData);
        target.put("othInRecordDetails", inLines);

        return target;
    }

    /**
     * 转换入库明细行
     */
    private List<Map<String, Object>> convertInLines(Map<String, Object> sourceData) throws Exception {
        List<Map<String, Object>> inLines = new ArrayList<>();

        Object detailsObj = sourceData.get("details");
        if (detailsObj == null) {
            return inLines;
        }

        List<Map<String, Object>> limsDetails;
        if (detailsObj instanceof List) {
            limsDetails = (List<Map<String, Object>>) detailsObj;
        } else {
            return inLines;
        }

        for (Map<String, Object> limsDetail : limsDetails) {
            Map<String, Object> line = new HashMap<>();

            // 物料编码映射
            if (limsDetail.get("productCode") != null) {
                String productId = queryProductId(limsDetail.get("productCode").toString());
                line.put("productId", productId);
                line.put("productCode", limsDetail.get("productCode"));
            }

            // 数量
            line.put("qty", limsDetail.get("qty"));

            inLines.add(line);
        }

        return inLines;
    }

    /**
     * 查询组织ID
     * TODO: 实现组织编码到ID的查询
     */
    private String queryOrgId(String orgCode) {
        return "";
    }

    /**
     * 查询仓库ID
     * TODO: 实现仓库编码到ID的查询
     */
    private String queryWarehouseId(String warehouseCode) {
        return "";
    }

    /**
     * 查询物料ID
     * TODO: 实现物料编码到ID的查询
     */
    private String queryProductId(String productCode) {
        return "";
    }
}
```

---

## 3. 配置项

### 3.1 application.properties

```properties
# LIMS接收接口
lims.receive.url=/api/in/receive

# BIP其他入库单创建接口
bip.othinrecord.create.url=/iuap-api-gateway/yonbip/st/othinrecord
```

---

## 4. 检查清单

- [ ] 验证LIMS单据编号唯一性
- [ ] 校验物料编码在BIP中存在
- [ ] 校验仓库编码在BIP中存在
- [ ] 校验组织编码在BIP中存在
- [ ] 记录接收日志
- [ ] 处理创建异常
- [ ] 返回创建结果给LIMS