# Rule规则扩展开发

## 何时使用Rule

| 场景 | 是否适用Rule |
|------|-------------|
| 单发票按钮触发 | ✅ 适用 |
| 批量处理 | ❌ 使用MVC |
| 异步任务 | ❌ 使用MVC |
| 简单逻辑 | ✅ 适用 |
| 复杂路由逻辑 | ❌ 使用MVC |

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                      Rule 扩展架构                          │
├─────────────────────────────────────────────────────────────┤
│  Rule层(本文件)           Service层(业务实现)               │
│  ┌─────────────┐         ┌─────────────┐                   │
│  │ 获取发票ID  │  ──────→│ OpenAPI查询 │ ← iuap-c-openapi  │
│  │ 参数解析    │         │ 字段转换    │                   │
│  │ 调用Service │         │ 特征翻译    │ ← iuap-c-metadata │
│  │ 返回结果    │  ←──────│ 三方接口    │                   │
│  │             │         │ 回写结果    │ ← 动态元数据      │
│  └─────────────┘         └─────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Rule插件开发

```java
@Component("invoiceIntegrationRule")
public class InvoiceIntegrationRule implements IYpdCommonRul {

    @Autowired
    private InvoiceIntegrationService invoiceIntegrationService;

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        // 构建单据上下文
        BillContext billContext = new BillContext(
            rulCtxVO.getBillnum(),
            rulCtxVO.getFullname()
        );
        billContext.setAction(rulCtxVO.getAction());
        billContext.setDomain(rulCtxVO.getDomain());

        // 获取单据数据
        List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);
        if (CollectionUtils.isEmpty(bills)) {
            return new RuleExecuteResult();
        }

        BizObject bill = bills.get(0);

        // 解析发票ID
        String invoiceId = bill.getString("id");
        if (StringUtils.isEmpty(invoiceId)) {
            throw new BusinessException("ysd-500001", "发票ID不能为空");
        }

        // 根据发票方向调用对应Service
        String invDirection = bill.getString("invDirection");

        try {
            if ("2".equals(invDirection)) {
                // 蓝票 → handleBlueInvoice
                return invoiceIntegrationService.handleBlueInvoice(invoiceId);
            } else if ("1".equals(invDirection)) {
                // 红冲 → handleRedInvoice
                return invoiceIntegrationService.handleRedInvoice(invoiceId);
            }
            return new RuleExecuteResult();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("ysd-500002", "发票集成执行失败：" + e.getMessage());
        }
    }
}
```

## Service层开发

Service层代码结构参考 `reference/04_mvc_generation.md` 中的Service层实现，主要包含：

| 方法 | 说明 |
|------|------|
| `handleBlueInvoice(invoiceId)` | 蓝票开票处理 |
| `handleRedInvoice(invoiceId)` | 红冲处理 |
| `convertToThirdInvoice()` | 字段转换，参考 `02_field_mapping.md` |
| `translateCharacterFields()` | 特征翻译，参考 `03_character_translation.md` |
| `writeBackResult()` | 结果回写 |

### Service接口定义

```java
public interface InvoiceIntegrationService {
    /**
     * 处理蓝票开票
     * @param invoiceId 发票ID
     * @return 执行结果
     */
    Object handleBlueInvoice(String invoiceId);

    /**
     * 处理红冲
     * @param invoiceId 发票ID
     * @return 执行结果
     */
    Object handleRedInvoice(String invoiceId);
}
```

### Service实现要点

1. **OpenAPI查询**：使用 `iuap-c-openapi-integration` 生成的 `InvoiceApiClient` 查询发票详情
2. **字段转换**：参考 `reference/02_field_mapping.md`
3. **特征翻译**：参考 `reference/03_character_translation.md`
4. **三方接口调用**：根据厂商配置调用对应税务接口
5. **结果回写**：使用 `IYmsJdbcApi` 更新发票状态

## 开发清单

- [ ] 使用 `iuap-c-openapi-integration` 生成 InvoiceApiClient（查询BIP数据）
- [ ] 使用 `iuap-c-metadata-info` 查询销售发票元数据（获取可写字段）
- [ ] 使用 `iuap-c-server-codegen` 生成 Service 层代码（实现蓝票/红冲逻辑）
- [ ] 使用 `iuap-c-server-codegen` 生成 Rule 插件代码
- [ ] 字段转换参考 `reference/02_field_mapping.md`
- [ ] 特征翻译参考 `reference/03_character_translation.md`
- [ ] 回写字段通过元数据动态获取，禁止硬编码
- [ ] 编译验证：`mvn clean package -DskipTests`