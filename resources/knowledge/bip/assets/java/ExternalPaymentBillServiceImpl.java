package com.yonyou.ucf.mdf.expsintegration.example.service.impl;

import cn.hutool.core.bean.BeanUtil;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.yonyou.ucf.mdd.ext.exceptions.BusinessException;
import com.yonyou.ucf.mdf.expsintegration.example.config.ExpIntegrationConfig;
import com.yonyou.ucf.mdf.expsintegration.example.openapi.AccessTokenUtils;
import com.yonyou.ucf.mdf.expsintegration.example.openapi.OpenApiUtils;
import com.yonyou.ucf.mdf.expsintegration.example.service.IExternalPaymentBill;
import com.yonyou.ucf.mdf.expsintegration.example.service.impl.externalpaymentconvert.HandleConvert;
import com.yonyou.ucf.mdf.expsintegration.example.tools.UserInfo;
import com.yonyou.ucf.mdf.expsintegration.example.vo.externalpaymentbillvos.ExternalPaymentBillVO;
import com.yonyou.ypd.bill.infrastructure.service.api.IBillQueryRepository;
import com.yonyou.ypd.bill.basic.bean.JsonResult;
import com.yonyou.ypd.mdf.adapter.utils.filter.StringUtil;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.ObjectUtils;
import org.apache.commons.lang3.StringUtils;
import org.imeta.orm.schema.QueryCondition;
import org.imeta.orm.schema.QuerySchema;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 对外通用付款单服务实现
 * 负责第三方系统数据录入BIP费控单据
 *
 * 保存方式：通过OpenAPI调用BIP保存接口（非iDoOpenApi）
 * 字段定义：从OpenAPI接口获取
 * 认证方式：AccessToken（appKey/appSecret获取）
 */
@Slf4j
@Service
public class ExternalPaymentBillServiceImpl implements IExternalPaymentBill {

    private static final String BILL_URI = "znbzbx.commonexpensebill.CommonExpenseBillVO";

    @Autowired
    private HandleConvert handleConvert;

    @Autowired
    private CommonHandleConvert commonHandleConvert;

    @Autowired
    private PeBillCommonDoActionAbstractService peBillCommonDoActionAbstractService;

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Autowired
    private AccessTokenUtils accessTokenUtils;

    @Autowired
    private OpenApiUtils openApiUtils;

    @Autowired
    private ExpIntegrationConfig config;

    /**
     * 保存/修改对外通用付款单
     * 通过OpenAPI调用BIP保存接口
     */
    @Override
    public JsonResult saveExternalPaymentBill(Map<String, Object> dataMap) throws Exception {
        JSONObject dataReq = new JSONObject(dataMap);
        JSONObject data = dataReq.getJSONObject("data");
        JSONObject req = new JSONObject();

        log.info("通用报销单保存，请求参数：{}", dataReq);

        String status = data.getString("_status");
        JSONObject ex = data.getJSONObject("expensebillDcs");

        // ============ 1. 唯一性校验（使用IBillQueryRepository） ============
        if (ex != null && !ex.isEmpty()) {
            String sourcebillno = ex.getString("MY_FK_0008");
            if (StringUtils.isEmpty(sourcebillno)) {
                throw new BusinessException("来源MY_FK_0008单号为空！");
            }

            if ("Insert".equals(status)) {
                String existingId = findExistingBillId(sourcebillno);
                if (existingId != null) {
                    throw new BusinessException(
                        "数据重复，请先在BIP删除数据后重新推送，sourcebillno单号为：" + sourcebillno);
                }
            }
        }

        // ============ 2. 数据转换 ============
        if ("Insert".equals(status)) {
            String billNo = ObjectUtils.isNotEmpty(data.get("code")) ? data.get("code").toString() : null;
            String existingId = findExistingBillId(billNo);
            if (existingId != null) {
                throw new BusinessException("数据已存在，不允许新增！");
            }

            if (ObjectUtils.isNotEmpty(data.getString("bustype"))) {
                String bustype = data.getString("bustype");
                handleConvert.dataConvert(bustype, data, req);
            } else {
                throw new BusinessException("交易类型不明确！");
            }
        } else {
            String billId = ObjectUtils.isNotEmpty(data.get("id")) ? data.get("id").toString() : null;

            if (ObjectUtils.isNotEmpty(data.getString("bustype"))) {
                BeanUtil.copyProperties(data, req);
                String bustype = data.getString("bustype");
                handleConvert.dataConvert(bustype, data, req);
            } else {
                throw new BusinessException("交易类型不明确！");
            }
        }

        // ============ 3. 通过OpenAPI保存 ============
        try {
            String billId = saveByOpenApi(req);
            log.info("通用报销单保存成功，billId={}", billId);

            // ============ 4. 可选：自动提交 ============
            Boolean autoSubmit = ex != null && ex.getBoolean("MY_FK_0030") != null ? ex.getBoolean("MY_FK_0030") : false;
            String returnMsg = null;
            int resCode = 200;
            String message = "保存成功";

            if (autoSubmit) {
                UserInfo userInfo = new UserInfo();
                String userCode = req.getString("creator_code");
                String userId = userInfo.queryUserByCreatorCode(userCode);
                try {
                    peBillCommonDoActionAbstractService.epSubmitBillAction(
                        userId, billId, "znbzbx_expensebill", "znbzbx");
                } catch (Exception e) {
                    returnMsg = e.getMessage();
                }
            }

            // ============ 5. 返回结果 ============
            ExternalPaymentBillVO externalPaymentBillVO = new ExternalPaymentBillVO();
            if (ex != null) {
                externalPaymentBillVO.setSourceBillNo(ex.getString("MY_FK_0008"));
            }

            JsonResult jsonResult = new JsonResult();
            if (StringUtil.isNotEmpty(returnMsg)) {
                message = message + "," + returnMsg;
                resCode = 201;
            }
            jsonResult.setCode(resCode);
            jsonResult.setData(externalPaymentBillVO);
            jsonResult.setMessage(message);

            return jsonResult;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("ExternalPaymentBillService#save error", e);
            throw new BusinessException("ExternalPaymentBillService#save error: " + e.getMessage());
        }
    }

    /**
     * 批量保存外部付款单
     */
    @Override
    public JsonResult batchSaveExternalPaymentBill(Map<String, Object> dataMap) throws Exception {
        JSONObject dataReq = new JSONObject(dataMap);
        JSONArray dataList = dataReq.getJSONArray("data");

        if (dataList == null || dataList.isEmpty()) {
            throw new BusinessException("批量数据不能为空！");
        }

        int successCount = 0;
        int failCount = 0;
        StringBuilder errorMsg = new StringBuilder();

        for (int i = 0; i < dataList.size(); i++) {
            try {
                JSONObject itemData = dataList.getJSONObject(i);
                Map<String, Object> itemMap = itemData.toJavaObject(Map.class);
                saveExternalPaymentBill(itemMap);
                successCount++;
            } catch (Exception e) {
                failCount++;
                errorMsg.append("第").append(i + 1).append("条数据保存失败：")
                     .append(e.getMessage()).append(";");
            }
        }

        JsonResult result = new JsonResult();
        result.setCode(failCount == 0 ? 200 : 206);
        result.setMessage("成功" + successCount + "条，失败" + failCount + "条");

        return result;
    }

    /**
     * 通过OpenAPI保存单据
     * 使用AccessToken认证，标准OpenAPI调用格式
     */
    private String saveByOpenApi(JSONObject billData) {
        try {
            // 1. 获取AccessToken（带缓存，支持多租户）
            String accessToken;
            String tenantId = config.getOpenApiTenantId();
            String baseUrl = config.getOpenApiBaseUrl();
            String appKey = config.getOpenApiAppKey();
            String appSecret = config.getOpenApiAppSecret();

            if (StringUtils.hasText(tenantId)) {
                accessToken = accessTokenUtils.getAccessTokenV2(tenantId, baseUrl, appKey, appSecret);
            } else {
                accessToken = accessTokenUtils.getAccessToken(baseUrl, appKey, appSecret);
            }

            // 2. 构建OpenAPI请求参数 - 标准格式: { "data": { ... } }
            billData.put("resubmitCheckKey", UUID.randomUUID().toString().replace("-", ""));
            Map<String, Object> params = new java.util.HashMap<>();
            params.put("data", billData);

            // 3. 调用OpenAPI保存
            String requestUrl = config.getOpenApiSaveFullUrl();
            String result = openApiUtils.postMethod(params, requestUrl, accessToken);

            // 4. 解析响应 - OpenAPI成功码: "00000"
            JSONObject resultJson = JSONObject.parseObject(result);
            if ("00000".equals(resultJson.getString("code"))) {
                String resultBillId = null;
                if (resultJson.containsKey("data") && resultJson.get("data") != null) {
                    JSONObject data = resultJson.getJSONObject("data");
                    if (data.containsKey("id")) {
                        resultBillId = data.getString("id");
                    } else if (data.containsKey("billId")) {
                        resultBillId = data.getString("billId");
                    }
                }
                return resultBillId;
            } else {
                String message = resultJson.getString("message");
                throw new BusinessException("OpenAPI保存失败：" + message);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("OpenAPI保存异常", e);
            throw new BusinessException("OpenAPI保存异常：" + e.getMessage());
        }
    }

    /**
     * 查询已存在单据（使用IBillQueryRepository）
     * 用于幂等性判断
     */
    private String findExistingBillId(String code) {
        if (StringUtils.isEmpty(code)) {
            return null;
        }
        QuerySchema querySchema = QuerySchema.create();
        querySchema.addSelect("id");
        querySchema.appendQueryCondition(QueryCondition.name("code").eq(code));

        List<Map<String, Object>> result = billQueryRepository.queryMapBySchema(BILL_URI, querySchema, "znbzbx");
        if (result != null && !result.isEmpty()) {
            Object id = result.get(0).get("id");
            return id != null ? id.toString() : null;
        }
        return null;
    }
}
