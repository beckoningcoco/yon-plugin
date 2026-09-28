package com.yonyou.ucf.mdf.expsintegration.example.controller;

import com.yonyou.ucf.mdf.expsintegration.example.service.IExternalPaymentBill;
import com.yonyou.ypd.bill.basic.bean.JsonResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.Map;

/**
 * @Description: 外部付款单接口 Controller
 * 提供第三方系统录入付款单的REST接口
 */
@RequestMapping("/externalpaymentbill")
@RestController
public class ExternalPaymentBillController {

    @Autowired
    private IExternalPaymentBill iExternalPaymentBill;

    /**
     * 保存外部付款单
     * 第三方系统调用此接口将付款单数据录入BIP
     */
    @PostMapping("save")
    public JsonResult saveExternalPaymentBill(
            @RequestBody Map<String, Object> params,
            HttpServletRequest request,
            HttpServletResponse response) throws Exception {
        return iExternalPaymentBill.saveExternalPaymentBill(params);
    }

    /**
     * 批量保存外部付款单
     * 第三方系统调用此接口批量录入付款单数据
     */
    @PostMapping("batchsave")
    public JsonResult batchSaveExternalPaymentBill(
            @RequestBody Map<String, Object> params,
            HttpServletRequest request,
            HttpServletResponse response) throws Exception {
        return iExternalPaymentBill.batchSaveExternalPaymentBill(params);
    }
}