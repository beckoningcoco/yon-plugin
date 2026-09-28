package com.yonyou.ucf.mdf.expsintegration.example.service;

import com.yonyou.ypd.bill.basic.bean.JsonResult;

import java.util.Map;

/**
 * 对外通用付款单接口
 * 第三方系统调用此接口将付款单数据录入BIP
 */
public interface IExternalPaymentBill {

    /**
     * 保存/修改对外通用付款单
     * 支持新增(Insert)和修改(Update)两种操作
     */
    JsonResult saveExternalPaymentBill(Map<String, Object> data) throws Exception;

    /**
     * 批量保存对外通用付款单
     */
    JsonResult batchSaveExternalPaymentBill(Map<String, Object> data) throws Exception;
}
