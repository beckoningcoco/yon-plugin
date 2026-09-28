# 单据转换规则调用

## 调用流程

1. 配置单据转换规则（平台配置）
2. 代码中调用转换接口

## 代码调用示例

```java
@Component("业务对象编码")
public class DemoImpl {

    @Autowired
    private BusinessConvertService businessConvertService;

    @Autowired
    private YmsLockFactory ymsLockFactory;

    private static final Logger log = LoggerFactory.getLogger(DemoImpl.class);

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        log.info("DemoImpl方法被调用，参数为：{}", params);

        BillDataDto dataDto = (BillDataDto) params.get("param");
        List<Map<String, Object>> dataList = (List<Map<String, Object>>) dataDto.getData();

        ConvertParam convertParam = new ConvertParam();
        convertParam.setMakeBillRuleCode("单据转换规则编码");
        convertParam.setTenantId(AppContext.getTenantId().toString());
        convertParam.setDomain("业务对象领域编码");
        convertParam.setSubId("SCMSA");  // 与单据转换规则上的subId保持一致
        convertParam.setBillNum("上游业务对象编码");
        convertParam.setNeedQueryBill(true);

        // 设置上游单据ID
        List<String> sourceIds = new ArrayList<>();
        sourceIds.add(order.getId());
        convertParam.setSourceIds(sourceIds);

        // 查询转换规则
        DomainMakeBillRuleModel flowRules = businessConvertService.queryMakeBillRule(convertParam);

        // 执行转换
        ConvertResult convertResult = null;
        try {
            convertResult = businessConvertService.convert(convertParam, flowRules);
        } finally {
            // 解锁（推单会根据上游单据id加锁）
            HashSet<String> lockKeys = convertResult.getLockKeys();
            for (String ownLockKey : lockKeys) {
                ymsLockFactory.getLock(ownLockKey).unLock();
            }
        }

        // 解析转换结果
        List<ConvertedBill> convertedBillList = (List<ConvertedBill>) convertResult.getConvertedBillList();
        List<Map<String, Object>> allTargetList = convertedBillList.stream()
            .map(ConvertedBill::getTargetData)
            .collect(Collectors.toList());

        // 业务操作
        return allTargetList;
    }
}
```

## 关键配置

| 参数 | 说明 |
|------|------|
| `makeBillRuleCode` | 单据转换规则编码 |
| `tenantId` | 租户ID |
| `domain` | 业务对象领域编码 |
| `subId` | 与单据转换规则上的subId保持一致 |
| `billNum` | 上游业务对象编码 |
| `needQueryBill` | 是否需要查单 |
| `sourceIds` | 上游单据ID列表 |

## 注意事项

1. 转换完成后必须解锁
2. 使用 `ConvertedBill::getTargetData` 获取目标单数据
3. sourceIds 不要重复