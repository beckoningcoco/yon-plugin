package com.yonyou.ucf.mdf.expsintegration.example.service.impl.externalpaymentconvert;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.yonyou.ucf.mdd.ext.exceptions.BusinessException;
import com.yonyou.ucf.mdf.expsintegration.example.service.impl.HandleServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * 数据转换处理器
 * 将第三方系统传入的数据转换为BIP费控单据格式
 *
 * 转换流程：
 * 1. publicDataConvert()   - 公共字段处理（状态、ID翻译、金额校验）
 * 2. dealHeadData()        - 主表数据处理（报账人/供应商翻译、特征字段）
 * 3. dealExpensebillbsData()  - 报销明细处理（费用小类翻译、明细特征字段）
 * 4. dealExpsettleinfosData() - 结算信息处理（银行账号查询、结算方式校验）
 * 5. dealExpapportionsData()  - 费用分摊处理（组织/部门翻译）
 */
@Slf4j
@Component
public class HandleConvert {

    @Autowired
    private HandleServiceImpl handleService;

    @Autowired
    private CommonHandleConvert commonHandleConvert;

    /**
     * 数据转换入口
     * 根据交易类型路由到对应转换逻辑
     *
     * @param bustype 交易类型编码
     * @param data    源数据（第三方传入）
     * @param req     目标数据（转换后传给BIP API）
     */
    public void dataConvert(String bustype, JSONObject data, JSONObject req) throws Exception {
        // 1. 公共字段处理
        publicDataConvert(data, req);

        // 2. 主表数据处理
        dealHeadData(data, req);

        // 3. 报销明细处理
        dealExpensebillbsData(data, req);

        // 4. 结算信息处理
        dealExpsettleinfosData(data, req);

        // 5. 费用分摊处理
        dealExpapportionsData(data, req);
    }

    /**
     * 公共字段处理
     */
    private void publicDataConvert(JSONObject data, JSONObject req) {
        // 状态处理
        req.put("_status", data.getString("_status"));

        // 金额精度校验(最多2位小数)
        validateAmountPrecision(data, "nexpensemny");
        validateAmountPrecision(data, "nsummny");
        validateAmountPrecision(data, "nshouldpaymny");
        validateAmountPrecision(data, "npaymentmny");
    }

    /**
     * 主表数据处理
     */
    private void dealHeadData(JSONObject data, JSONObject req) throws Exception {
        // 直接映射字段
        req.put("bustype", data.getString("bustype"));
        req.put("caccountorg", data.getString("caccountorg"));
        req.put("dcostdate", data.getString("dcostdate"));
        req.put("vreason", data.getString("vreason"));
        req.put("nexpensemny", data.getBigDecimal("nexpensemny"));
        req.put("nsummny", data.getBigDecimal("nsummny"));
        req.put("nshouldpaymny", data.getBigDecimal("nshouldpaymny"));
        req.put("npaymentmny", data.getBigDecimal("npaymentmny"));

        // 报账人翻译：员工编码 → 员工ID
        String pkHandlepsn = commonHandleConvert.translateArchive(
            "pk_handlepsn", data.getString("pk_handlepsn"), "bd_staff");
        req.put("pk_handlepsn", pkHandlepsn);

        // 供应商翻译
        if (StringUtils.isNotEmpty(data.getString("pk_cusdoc"))) {
            String pkCusdoc = commonHandleConvert.translateArchive(
                "pk_cusdoc", data.getString("pk_cusdoc"), "bd_supplier");
            req.put("pk_cusdoc", pkCusdoc);
        }

        // 创建人翻译
        req.put("creator_code", data.getString("creator_code"));

        // 特征字段
        if (data.getJSONObject("expensebillDcs") != null) {
            req.put("expensebillDcs", data.getJSONObject("expensebillDcs"));
        }
    }

    /**
     * 报销明细处理
     */
    private void dealExpensebillbsData(JSONObject data, JSONObject req) throws Exception {
        JSONArray expensebillbs = data.getJSONArray("expensebillbs");
        if (expensebillbs == null || expensebillbs.isEmpty()) {
            throw new BusinessException("报销单明细不可为空！");
        }

        JSONArray resultArray = new JSONArray();
        for (int i = 0; i < expensebillbs.size(); i++) {
            JSONObject item = expensebillbs.getJSONObject(i);
            JSONObject resultItem = new JSONObject();

            resultItem.put("_status", item.getString("_status"));

            // 费用小类翻译
            String pkBusimemo = commonHandleConvert.translateArchive(
                "pk_busimemo_code", item.getString("pk_busimemo_code"), "bd_busimemo");
            resultItem.put("pk_busimemo_code", pkBusimemo);

            // 金额字段
            resultItem.put("nexpensemny", item.getBigDecimal("nexpensemny"));
            resultItem.put("ntaxmny", item.getBigDecimal("ntaxmny"));
            resultItem.put("nsummny", item.getBigDecimal("nsummny"));
            resultItem.put("nnatsummny", item.getBigDecimal("nnatsummny"));
            resultItem.put("nshouldpaymny", item.getBigDecimal("nshouldpaymny"));

            // 部门/公司翻译
            String vfinacedeptid = commonHandleConvert.translateArchive(
                "vfinacedeptid", item.getString("vfinacedeptid"), "bd_dept");
            resultItem.put("vfinacedeptid", vfinacedeptid);
            resultItem.put("cfinaceorg", item.getString("cfinaceorg"));

            // 明细特征字段
            if (item.getJSONObject("expensebillBDcs") != null) {
                resultItem.put("expensebillBDcs", item.getJSONObject("expensebillBDcs"));
            }

            resultArray.add(resultItem);
        }
        req.put("expensebillbs", resultArray);
    }

    /**
     * 结算信息处理
     */
    private void dealExpsettleinfosData(JSONObject data, JSONObject req) throws Exception {
        JSONArray expsettleinfos = data.getJSONArray("expsettleinfos");
        if (expsettleinfos == null || expsettleinfos.isEmpty()) {
            throw new BusinessException("结算信息集合不可为空！");
        }

        JSONArray resultArray = new JSONArray();
        for (int i = 0; i < expsettleinfos.size(); i++) {
            JSONObject item = expsettleinfos.getJSONObject(i);
            JSONObject resultItem = new JSONObject();

            resultItem.put("_status", item.getString("_status"));
            resultItem.put("igathertype", item.getString("igathertype"));
            resultItem.put("nsummny", item.getBigDecimal("nsummny"));
            resultItem.put("pk_balatype", item.getString("pk_balatype"));
            resultItem.put("vbankaccount", item.getString("vbankaccount"));
            resultItem.put("vbankdocname", item.getString("vbankdocname"));

            // 根据收款类型处理
            if ("0".equals(item.getString("igathertype"))) {
                // 个人收款
                resultItem.put("pk_handlepsn", item.getString("pk_handlepsn"));
            } else {
                // 供应商收款
                resultItem.put("pk_cusdoc", item.getString("pk_cusdoc"));
            }

            resultArray.add(resultItem);
        }
        req.put("expsettleinfos", resultArray);
    }

    /**
     * 费用分摊处理
     */
    private void dealExpapportionsData(JSONObject data, JSONObject req) throws Exception {
        JSONArray expapportions = data.getJSONArray("expapportions");
        if (expapportions == null || expapportions.isEmpty()) {
            return; // 分摊非必填
        }

        JSONArray resultArray = new JSONArray();
        for (int i = 0; i < expapportions.size(); i++) {
            JSONObject item = expapportions.getJSONObject(i);
            JSONObject resultItem = new JSONObject();

            resultItem.put("_status", item.getString("_status"));
            resultItem.put("nexpensemny", item.getBigDecimal("nexpensemny"));
            resultItem.put("cfinaceorg", item.getString("cfinaceorg"));

            // 部门翻译
            String vfinacedeptid = commonHandleConvert.translateArchive(
                "vfinacedeptid", item.getString("vfinacedeptid"), "bd_dept");
            resultItem.put("vfinacedeptid", vfinacedeptid);

            resultArray.add(resultItem);
        }
        req.put("expapportions", resultArray);
    }

    /**
     * 金额精度校验
     */
    private void validateAmountPrecision(JSONObject data, String fieldName) {
        Object amountObj = data.get(fieldName);
        if (amountObj instanceof BigDecimal) {
            BigDecimal stripped = ((BigDecimal) amountObj).stripTrailingZeros();
            if (stripped.scale() > 2) {
                throw new BusinessException(fieldName + "金额异常，大于两位小数！");
            }
        }
    }
}
