---
name: YonBipUtil
description: >
  用友 BIP 客开技能。当用户需要封装调用 BIP 开放平台 API 的工具类（如应收发票保存、员工查询、文件上传、成本中心查询等）时，参考该文档内容。
---

# YonBipUtil

```java
package com.yonyou.lzlj.cwgx.common.utils;

import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.http.YmsHttpClient;
import com.yonyou.iuap.yms.param.SQLParameter;
import org.imeta.biz.base.BizContext;
import org.imeta.core.model.Entity;
import org.imeta.core.model.Property;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class YonBipUtil {

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;
    @Autowired
    @Qualifier("yonbip")
    private YmsHttpClient client;
    @Autowired
    private YonBipClientUtil yonBipClientUtil;
    @Autowired
    private YonBipHttpUtil yonbipHttpUtil;


    /**
     * 应收发票保存
     */
    public Map saveReceivable(Map<String, Object> reqBody) {
        String requestUrl = "/yonbip/EFI/receivable/save?access_token=" + yonbipHttpUtil.getToken(client);
        return (Map) yonbipHttpUtil.doPost(client, requestUrl, reqBody);
    }

    // 员工信息查询
    public Map querystaffDetail(Map<String, Object> reqMap) {
        String requestUrl = "/yonbip/hrcloud/staff/listmdd?access_token=" + yonbipHttpUtil.getToken(client);
        return (Map) yonbipHttpUtil.doPost(client, requestUrl, reqMap);
    }

    /**
     * 文件上传
     */
    public String uploadFile(String businessType, String businessId, String fileName, String base64File) {
        String requestUrl = "/yonbip/uspace/iuap-apcom-file/rest/v1/file?access_token=" + yonbipHttpUtil.getToken(client) + "&businessType=" + businessType + "&businessId=" + businessId;
        return yonbipHttpUtil.doPostFile(client, requestUrl, fileName, base64File);
    }

    /* 通过编码查询用户 */
    public Map queryBipUser(String code) {
        String requestUrl = "/yonbip/digitalModel/userCode/getByCode?access_token=" + yonbipHttpUtil.getToken(client) + "&code=" + code;
        return (Map) yonbipHttpUtil.doGet(client, requestUrl);
    }

    /**
     * 成本中心查询
     */
    public List queryCostCenter(String code) {
        String requestUrl = "/yonbip/AMP/bd/v1/costcenter/queryCostCenterBatch?access_token=" + yonbipHttpUtil.getToken(client);
        List<Object> reqList = new ArrayList<>();
        Map<String, Object> param = new HashMap<>();
        param.put("code", code);
```
