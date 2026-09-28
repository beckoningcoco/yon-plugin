# 公共规范（动态适配）

## 概述

> **⚠️ 适用范围**：本文件适用于**有LIMS第三方配置**时的动态适配场景
> **⚠️ 代码生成规范**：遵循BIP MVC分层架构（参考 ../_公共规范/mvc_architecture.md）
> **⚠️ 场景限制**：本技能生成**LIMS入库**和**BIP出库**两个场景代码

---

## 1. Controller层（入参处理）

> **⚠️ BIP规范**：Controller 必须继承 `BaseController`，返回 `Map<String, Object>`

### 1.1 LIMS推送入库Controller

```java
package com.yonyou.xxx.lims.controller;

import com.yonyou.iuap.ucf.api.BaseController;
import com.yonyou.xxx.lims.service.LimsInReceiveService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * LIMS推送入库Controller
 * 负责接收LIMS系统推送的物料入库通知
 */
@RestController
@RequestMapping("/lims/in")
public class LimsInReceiveController extends BaseController {

    @Autowired
    private LimsInReceiveService limsInReceiveService;

    /**
     * LIMS推送入库通知
     * POST /lims/in/receive
     */
    @PostMapping("/receive")
    public Map<String, Object> receive(@RequestBody Map<String, Object> param) {
        if (param == null || param.isEmpty()) {
            return error("参数不能为空");
        }

        try {
            Map<String, Object> result = limsInReceiveService.receive(param);
            return success(result);
        } catch (Exception e) {
            return error(e.getMessage());
        }
    }
}
```

### 1.2 BIP推送出库Controller

```java
package com.yonyou.xxx.lims.controller;

import com.yonyou.iuap.ucf.api.BaseController;
import com.yonyou.xxx.lims.service.LimsOutPushService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * BIP推送出库Controller
 * 负责将BIP其他出库单推送到LIMS系统
 */
@RestController
@RequestMapping("/lims/out")
public class LimsOutPushController extends BaseController {

    @Autowired
    private LimsOutPushService limsOutPushService;

    /**
     * BIP推送出库到LIMS
     * POST /lims/out/push
     * 请求体格式：{"data": ["id1", "id2"]}
     */
    @PostMapping("/push")
    public Map<String, Object> push(@RequestBody Map<String, Object> param) {
        if (param == null || param.isEmpty()) {
            return error("参数不能为空");
        }

        Object data = param.get("data");
        if (data == null) {
            return error("单据ID不能为空");
        }

        List<String> ids = new ArrayList<>();
        if (data instanceof List) {
            ids = (List<String>) data;
        }

        if (ids.isEmpty()) {
            return error("单据ID列表不能为空");
        }

        try {
            Map<String, Object> result = limsOutPushService.push(ids);
            return success(result);
        } catch (Exception e) {
            return error(e.getMessage());
        }
    }
}
```

---

## 2. BIP查询服务

> **⚠️ BIP规范**：查询统一使用 `IBillQueryRepository`，必须包含租户条件

### 2.1 其他出库单查询服务

```java
package com.yonyou.xxx.lims.service;

import com.yonyou.iuap.ucf.api.IBillQueryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 其他出库单查询服务
 * 使用 IBillQueryRepository 查询BIP其他出库单数据
 */
@Service
public class OthOutRecordQueryService {

    @Autowired
    private IBillQueryRepository billQueryRepository;

    /**
     * 查询其他出库单详情
     * @param billId 出库单ID
     * @return 出库单数据
     */
    public Map<String, Object> queryOthOutRecord(String billId) {
        // 使用 IBillQueryRepository 查询
        return null;
    }

    /**
     * 查询其他出库单明细
     * @param billId 出库单ID
     * @return 明细数据列表
     */
    public List<Map<String, Object>> queryOthOutRecordLines(String billId) {
        // 使用 IBillQueryRepository 查询
        return null;
    }
}
```

---

## 3. 字段映射转换

> **⚠️ BIP规范**：特征字段翻译使用 `CharacterFieldExtractor`

### 3.1 出库单字段映射（BIP → LIMS）

```java
package com.yonyou.xxx.lims.mapper;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.xxx.bip.pub.base.CharacterFieldExtractor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * LIMS出库字段映射器
 * 将BIP其他出库单数据转换为LIMS目标格式
 */
@Component
public class LimsOutFieldMapper {

    @Autowired
    private CharacterFieldExtractor characterFieldExtractor;

    /**
     * 将BIP其他出库单数据转换为LIMS目标格式
     * @param sourceData BIP出库单数据
     * @return LIMS目标格式数据
     */
    public Map<String, Object> convert(Map<String, Object> sourceData) {
        Map<String, Object> target = new HashMap<>();

        if (sourceData == null) {
            return target;
        }

        // ==================== 操作类型 ====================
        target.put("OptionType", 0);

        // ==================== 单据基本信息 ====================
        target.put("billId", sourceData.get("id"));
        target.put("billCode", sourceData.get("code"));

        // ==================== 组织信息 ====================
        if (sourceData.get("orgId") != null) {
            String orgCode = queryOrgCode(sourceData.get("orgId").toString());
            target.put("OrgCode", orgCode);
        }

        // ==================== 仓库信息 ====================
        if (sourceData.get("warehouseId") != null) {
            String warehouseCode = queryWarehouseCode(sourceData.get("warehouseId").toString());
            target.put("WarehouseCode", warehouseCode);
        }

        // ==================== 时间信息 ====================
        if (sourceData.get("vouchdate") != null) {
            target.put("VouchDate", sourceData.get("vouchdate"));
        }

        // ==================== 特征字段翻译 ====================
        // 特征组：othOutRecordDefineCharacter
        Map<String, Object> defineCharacter =
            (Map<String, Object>) sourceData.get("othOutRecordDefineCharacter");
        if (defineCharacter != null) {
            // 从Excel动态加载特征字段映射关系
            Map<String, String> charFieldMapping = loadCharFieldMapping("main");
            characterFieldExtractor.extractCharacter(
                new JSONObject(defineCharacter),
                target,
                charFieldMapping
            );
        }

        // ==================== 明细行处理 ====================
        List<Map<String, Object>> lines = convertLines(sourceData);
        target.put("outLines", lines);

        return target;
    }

    /**
     * 转换明细行
     */
    private List<Map<String, Object>> convertLines(Map<String, Object> sourceData) {
        List<Map<String, Object>> outLines = new java.util.ArrayList<>();

        List<Map<String, Object>> details =
            (List<Map<String, Object>>) sourceData.get("othOutRecordDetails");
        if (details == null || details.isEmpty()) {
            return outLines;
        }

        for (Map<String, Object> detail : details) {
            Map<String, Object> line = new HashMap<>();

            // 明细ID
            line.put("LineId", detail.get("id"));

            // 物料编码
            line.put("ProductCode", detail.get("productCode"));

            // 数量
            line.put("Qty", detail.get("qty"));

            // 单位
            if (detail.get("unitName") != null) {
                line.put("Unit", detail.get("unitName"));
            }

            outLines.add(line);
        }

        return outLines;
    }

    /**
     * 从Excel/配置动态加载特征字段映射关系
     * TODO: 根据实际配置实现
     */
    private Map<String, String> loadCharFieldMapping(String type) {
        Map<String, String> mapping = new HashMap<>();
        // TODO: 从Excel动态读取
        // 示例：
        // mapping.put("char_001", "isPushLims");      // 是否已推送LIMS
        // mapping.put("char_002", "limsPushTime");    // LIMS推送时间
        return mapping;
    }

    /**
     * 查询组织编码
     * TODO: 实现组织编码查询逻辑
     */
    private String queryOrgCode(String orgId) {
        return "";
    }

    /**
     * 查询仓库编码
     * TODO: 实现仓库编码查询逻辑
     */
    private String queryWarehouseCode(String warehouseId) {
        return "";
    }
}
```

---

## 4. 三方接口调用

> **⚠️ BIP规范**：非本领域单据的增删改使用 `IYmsJdbcApi`

### 4.1 LIMS接口服务

```java
package com.yonyou.xxx.lims.service;

import com.yonyou.iuap.ucf.api.IYmsJdbcApi;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * LIMS第三方接口服务
 * 使用 IYmsJdbcApi 调用外部系统
 */
@Service
public class ThirdPartyLimsService {

    @Value("${third.lims.push.url:}")
    private String pushUrl;

    @Value("${third.lims.receive.url:}")
    private String receiveUrl;

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;

    /**
     * 推送出库单到LIMS
     * @param data 出库单数据
     * @return LIMS响应
     */
    public LimsApiResponse pushOutRecord(Map<String, Object> data) {
        LimsApiResponse response = new LimsApiResponse();

        try {
            // TODO: 使用 IYmsJdbcApi 调用LIMS接口
            // String url = pushUrl;
            // HttpResponse httpResponse = HttpUtil.createPost(url)
            //     .header("Authorization", "Bearer " + getAccessToken())
            //     .body(JSONObject.toJSONString(data))
            //     .execute();
            // response = JSON.parseObject(httpResponse.getBody(), LimsApiResponse.class);
        } catch (Exception e) {
            response.setCode("500");
            response.setMessage(e.getMessage());
        }

        return response;
    }

    /**
     * 获取LIMS访问令牌
     * TODO: 实现鉴权逻辑
     */
    private String getAccessToken() {
        return "";
    }
}

/**
 * LIMS API响应DTO
 */
class LimsApiResponse {
    private String code;
    private String message;
    private Object data;
    private String billId;
    private String thirdBillNo;

    public boolean isSuccess() {
        return "200".equals(code) || "1".equals(code) || "true".equalsIgnoreCase(code);
    }

    // Getters and Setters
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Object getData() { return data; }
    public void setData(Object data) { this.data = data; }
    public String getBillId() { return billId; }
    public void setBillId(String billId) { this.billId = billId; }
    public String getThirdBillNo() { return thirdBillNo; }
    public void setThirdBillNo(String thirdBillNo) { this.thirdBillNo = thirdBillNo; }
}
```

---

## 5. 特征状态回写

> **⚠️ BIP规范**：使用 `IYmsJdbcApi` 更新特征字段状态

```java
package com.yonyou.xxx.lims.service;

import com.yonyou.iuap.ucf.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.param.SQLParameter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * LIMS特征状态回写服务
 * 负责回写"是否已推送LIMS"特征状态
 */
@Service
public class LimsStatusWriteService {

    private static final Logger logger = LoggerFactory.getLogger(LimsStatusWriteService.class);

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;

    /**
     * 回写"是否已推送LIMS"特征状态
     * 使用 IYmsJdbcApi 更新其他出库单特征字段
     * @param billId BIP单据ID
     * @param status 推送状态
     * @param response LIMS响应
     */
    public void writeBackPushStatus(String billId, String status, LimsApiResponse response) {
        try {
            // 回写特征"是否已推送LIMS"状态
            // 特征字段编码根据实际配置确定，如：char_001

            Map<String, Object> updateData = new HashMap<>();
            if (response.isSuccess()) {
                updateData.put("char_001", "已推送");  // 特征字段：是否已推送LIMS
            } else {
                updateData.put("char_001", "推送失败");
            }
            updateData.put("id", billId);

            // 使用 IYmsJdbcApi 更新
            // TODO: 替换为实际表名和SQL
            // String sql = "UPDATE st_othoutrecord SET char_001 = ? WHERE id = ?";
            // SQLParameter params = new SQLParameter();
            // params.addParam(updateData.get("char_001"));
            // params.addParam(billId);
            // ymsJdbcApi.execute(sql, params);

            logger.info("回写LIMS推送状态成功，billId:{}, status:{}", billId, status);
        } catch (Exception e) {
            logger.error("回写LIMS推送状态失败，billId:{}", billId, e);
        }
    }

    /**
     * 回写推送时间
     * @param billId BIP单据ID
     * @param pushTime 推送时间
     */
    public void writeBackPushTime(String billId, Date pushTime) {
        try {
            // 回写特征"推送时间"
            // TODO: 替换为实际表名和SQL
            // String sql = "UPDATE st_othoutrecord SET char_002 = ? WHERE id = ?";
            logger.info("回写LIMS推送时间成功，billId:{}, time:{}", billId, pushTime);
        } catch (Exception e) {
            logger.error("回写LIMS推送时间失败，billId:{}", billId, e);
        }
    }
}
```

---

## 托底策略说明

> **⚠️ 详细托底逻辑请参考** [td_specification.md](./td_specification.md)