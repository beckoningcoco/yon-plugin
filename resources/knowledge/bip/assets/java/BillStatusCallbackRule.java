package com.yonyou.ucf.mdf.expsintegration.example.rule;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.ucf.mdf.expsintegration.example.service.impl.HandleServiceImpl;
import com.yonyou.ucf.mdf.expsintegration.example.service.impl.ExternalPaymentBillHandleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 单据状态回调规则示例
 *
 * 用于：单据保存/提交/审核通过时的三方状态回调
 * 触发方式：调用skill技能 iuap-c-server-codegen 的rule规则方式生成
 *
 * 回调接口对照：
 *   单据保存   → /costControl/billCreated   (billStatus=CREATED)
 *   单据提交   → /costControl/billSubmit     (billStatus=SUBMIT)
 *   审批通过   → /costControl/billAudit      (billStatus=APPROVED)
 *   审批拒绝   → /costControl/billReject     (billStatus=REJECTED)
 */
@Slf4j
@Component
public class BillStatusCallbackRule {

    @Autowired
    private HandleServiceImpl handleService;

    @Autowired
    private ExternalPaymentBillHandleService externalPaymentBillHandleService;

    /**
     * 执行状态回调
     *
     * @param billId      BIP单据ID
     * @param billStatus  单据状态（CREATED/SUBMIT/APPROVED/REJECTED）
     * @param callbackUrl 回调接口路径（如 /costControl/billSubmit）
     */
    public void execute(String billId, String billStatus, String callbackUrl) {
        log.info("单据状态回调开始, billId={}, billStatus={}, callbackUrl={}", billId, billStatus, callbackUrl);

        try {
            // 1. 查询单据来源系统信息
            Map<String, Object> dataInDb = externalPaymentBillHandleService.queryBillInfoByDb(billId);
            String dict = (String) dataInDb.get("expensebillDcs_md_mis_dict");
            String billType = (String) dataInDb.get("expensebillDcs_MY_FK_0107");
            String sourceBillId = (String) dataInDb.get("expensebillDcs_MY_FK_0008");
            String userCode = (String) dataInDb.get("expensebillDcs_MY_FK_0270");

            // 2. 获取第三方系统信息
            Map<String, String> distInfo = handleService.queryDictInfo(dict);
            String url = distInfo.get("back_status_url");

            if (url == null || url.isEmpty()) {
                log.warn("回调URL为空，跳过状态回调, dict={}", dict);
                return;
            }

            // 3. 获取加密串
            Map<String, Object> ssoInfo = handleService.getEncryptCheck(dict, userCode);

            // 4. 组装回调参数
            JSONObject bodyMap = new JSONObject();
            bodyMap.put("encryptCheck", ssoInfo.get("encryptCheck"));
            bodyMap.put("bipBillId", billId);
            bodyMap.put("appCode", ssoInfo.get("app_code"));
            bodyMap.put("billStatus", billStatus);
            bodyMap.put("billType", billType);
            bodyMap.put("sourceBillId", sourceBillId);

            // 审批拒绝时附加拒绝原因
            if ("REJECTED".equals(billStatus)) {
                // rejectReason 需要从审批流中获取
                bodyMap.put("rejectReason", dataInDb.get("rejectReason"));
            }

            // 5. 调用第三方API
            String apiUrl = url + callbackUrl;
            String result = HttpClientUtil.doPostApplicationJson(apiUrl, bodyMap.toJSONString());
            log.info("状态回调结果, billId={}, result={}", billId, result);

        } catch (Exception e) {
            log.error("单据状态回调异常, billId={}, billStatus={}", billId, billStatus, e);
            // 规则中不抛出异常，避免影响主流程
        }
    }
}
