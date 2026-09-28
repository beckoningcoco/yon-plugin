package com.yonyou.ucf.mdf.expsintegration.example.service.impl.externalpaymentconvert;

import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 数据转换工厂
 * 根据交易类型(bustype)路由到对应的转换器
 *
 * 交易类型映射：
 *   MYJT001A → 对外通用付款单
 *   MYJT002A → 员工通用付款单
 *   MYJT003  → 薪酬发放报账单
 *   MYJT005  → 差旅费报账单
 *   MYJT006  → 代扣代缴
 *   MYJT008  → 车辆对外付款单
 *   RBSM007  → 个人借款单
 */
@Slf4j
@Component
public class ConvertFactory {

    @Autowired
    private Map<String, DataConverter> converterMap;

    /**
     * 数据转换
     * 根据不同交易类型进行数据转换处理
     *
     * @param bustype 交易类型编码
     * @param data    源数据
     * @param req     目标数据
     */
    public void dataConvert(String bustype, JSONObject data, JSONObject req) throws Exception {
        DataConverter converter = converterMap.get(bustype);
        if (converter == null) {
            log.warn("未找到交易类型[{}]对应的转换器，使用默认转换", bustype);
            // 默认：直接复制数据
            req.putAll(data);
            return;
        }
        converter.convert(data, req);
    }

    /**
     * 数据转换器接口
     * 不同交易类型的转换器实现此接口
     */
    public interface DataConverter {
        /**
         * 执行数据转换
         *
         * @param source 源数据（第三方传入）
         * @param target 目标数据（转换后传给BIP API）
         */
        void convert(JSONObject source, JSONObject target) throws Exception;
    }
}
