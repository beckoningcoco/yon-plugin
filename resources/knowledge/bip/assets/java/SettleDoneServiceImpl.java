package com.yonyou.ucf.mdf.expsintegration.example.service.impl;

import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 结算完成事件处理服务实现
 * 根据交易类型处理结算完成后的三方系统状态回写
 *
 * 触发方式：调用skill技能 iuap-c-server-codegen 的事件监听方式生成
 * 结算状态编码参见 SKILL.md 1.4 状态对照表
 */
@Slf4j
@Service
public class SettleDoneServiceImpl implements ISettleDoneService {

    @Autowired
    private HandleServiceImpl handleService;

    @Autowired
    private ExternalPaymentBillHandleService externalPaymentBillHandleService;

    /** 支持的交易类型列表 */
    private static final List<String> TRADE_TYPE_CODES = new ArrayList<String>() {{
        add("MYJT001A");  // 对外通用付款单
        add("MYJT002A");  // 员工通用付款单
        add("MYJT003");   // 薪酬发放报账单
        add("MYJT005");   // 差旅费报账单
        add("MYJT006");   // 代扣代缴
        add("MYJT008");   // 车辆对外付款单
        add("RBSM007");   // 个人借款单
    }};

    @Override
    public EventCommonResponse settleDoneHandle(Map<String, Object> data) {
        log.info("===结算完成处理开始===参数:{}", data);

        if (data == null || data.isEmpty()) {
            return EventCommonResponse.success("数据为空，跳过!");
        }

        String tradeTypeCode = data.get("tradeTypeCode") != null ?
            data.get("tradeTypeCode").toString() : null;

        // 非处理范围内的单子跳过
        if (!TRADE_TYPE_CODES.contains(tradeTypeCode)) {
            return EventCommonResponse.success("非业务处理单子，跳过!");
        }

        try {
            String billId = data.get("businessBillId").toString();
            String settlementId = data.get("businessDetailsId").toString();

            // 获取结算状态
            List<Map<String, Object>> dataSettledDistribute =
                (List<Map<String, Object>>) data.get("dataSettledDistribute");
            Map<String, Object> des = dataSettledDistribute.get(0);
            String statementdetailstatus = des.get("statementdetailstatus").toString();

            // 结算状态转换: 6=止付(NOT/"3")，其他=成功(SUCCESS/"0")
            String wsettlementStatus = "6".equals(statementdetailstatus) ? "3" : "0";

            // 查询单据来源系统信息（使用 IBillQueryRepository）
            Map<String, Object> dataInDb = externalPaymentBillHandleService.queryBillInfoByDb(billId);
            String dict = (String) dataInDb.get("expensebillDcs_md_mis_dict");
            String billType = (String) dataInDb.get("expensebillDcs_MY_FK_0107");
            String sourceBillId = (String) dataInDb.get("expensebillDcs_MY_FK_0008");
            String userCode = (String) dataInDb.get("expensebillDcs_MY_FK_0270");

            // 获取第三方系统信息
            Map<String, String> distInfo = handleService.queryDictInfo(dict);
            String url = distInfo.get("back_status_url");

            if (url == null || url.isEmpty()) {
                throw new RuntimeException("调用系统信息Url为空，请及时配置！dict=" + dict);
            }

            // 组装推送参数
            JSONObject bodyMap = new JSONObject();
            Map<String, Object> ssoInfo = handleService.getEncryptCheck(dict, userCode);
            bodyMap.put("encryptCheck", ssoInfo.get("encryptCheck"));
            bodyMap.put("bipBillId", billId);
            bodyMap.put("appCode", ssoInfo.get("app_code"));
            bodyMap.put("billStatus", "APPROVED");  // 统一使用字符串编码
            bodyMap.put("wsettlementStatus", wsettlementStatus);
            bodyMap.put("billType", billType);
            bodyMap.put("sourceBillId", sourceBillId);
            bodyMap.put("settlementId", settlementId);

            // 获取结算时间
            if (des.get("settleSuccBizTime") != null) {
                String settleTime = des.get("settleSuccBizTime").toString();
                bodyMap.put("settleTime", settleTime);
            }

            log.info("调用第三方更改单据结算状态入参：{}", bodyMap);

            // 调用第三方API
            String apiUrl = url + "/costControl/updateBillsStatus";
            String result = HttpClientUtil.doPostApplicationJson(apiUrl, bodyMap.toJSONString());

            log.info("调用第三方更改单据结算状态返回：{}", result);

            // 解析响应
            JSONObject resultJSON = JSONObject.parseObject(result);
            if (!"200".equals(resultJSON.getString("code"))) {
                return EventCommonResponse.fail("同步三方接口失败：" + resultJSON.getString("message"));
            }

            return EventCommonResponse.success("结算状态回写成功!");

        } catch (Exception e) {
            log.error("settleDoneHandle方法调用报错", e);
            return EventCommonResponse.fail("单据交易类型：" + tradeTypeCode + "结算成功同步三方接口报错，" + e.getMessage());
        }
    }
}
