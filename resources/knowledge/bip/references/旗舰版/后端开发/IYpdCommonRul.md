# IYpdCommonRul MDD规则链接口

> **版本**: v2.0
> **架构视角**: MDD架构规则扩展规范

## 核心原则（必须优先阅读）

> ⚠️ **重要**：数据获取方式应根据用户需求决定
>
> 1. **用户明确说使用API** → 直接使用API，不查元数据
> 2. **用户提供了字段映射/接口规范** → 使用用户提供的信息，不查元数据
> 3. **用户明确说使用IBillQueryRepository** → 使用IBillQueryRepository
> 4. **没有上述任何条件** → 查询元数据了解结构
> 5. **禁止臆想字段名**：未获取字段信息前，禁止自行定义字段名（但应优先使用用户提供的字段信息）

---

## 一、规则类型与数据获取方式

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MDD规则链规则分类                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  类型A：保存/更新前后的校验规则                                           │
│  ├── 数据来源：直接通过 `CommonRuleUtils.getBills()` 获取                │
│  ├── 字段取值：`BizObject bill = bills.get(0)` 直接取字段                │
│  └── 无需额外查询                                                       │
│                                                                         │
│  类型B：关闭/停用/审批通过/驳回等状态变更规则                             │
│  ├── 数据来源：需要获取当前单据完整数据                                    │
│  ├── 方案1：有BIP API → 走 OpenAPI skill 获取详情                        │
│  └── 方案2：无BIP API → 用 IBillQueryRepository 查询详情                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、规则类型详解

### 2.1 类型A：保存/更新前后校验规则

> 📌 **适用场景**：保存前校验、更新前校验、提交前校验等
>
> ✅ **特点**：数据已通过 `CommonRuleUtils.getBills()` 传入，直接取用

**数据获取流程**：
```java
// 1. 构建单据上下文
BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
billContext.setAction(rulCtxVO.getAction());
billContext.setDomain(rulCtxVO.getDomain());

// 2. 获取单据数据（已包含完整业务数据）
List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);

// 3. 直接从BizObject获取字段值
BizObject bill = bills.get(0);
String fieldValue = bill.get("fieldName");           // 主表字段
List<BizObject> details = bill.get("子表属性名");     // 子表数据
```

**示例**：
```java
@Component("saveValidateRule")
public class SaveValidateRule implements IYpdCommonRul {

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
        billContext.setAction(rulCtxVO.getAction());
        billContext.setDomain(rulCtxVO.getDomain());

        List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);

        if (!CollectionUtils.isEmpty(bills)) {
            BizObject bill = bills.get(0);

            // ✅ 直接获取字段值（字段名从元数据获取）
            String merchantCode = bill.get("merchantCharacter__I_FM_XX_D_PF003");
            if (StringUtils.isEmpty(merchantCode)) {
                throw new BusinessException("XX-500001", "商户代码不能为空！");
            }

            // ✅ 获取子表数据
            List<BizObject> details = bill.get("purchaseOrders");
            for (BizObject detail : details) {
                String materialCode = detail.get("material_code");
                // 处理明细数据...
            }
        }

        return new RuleExecuteResult();
    }
}
```

---

### 2.2 类型B：状态变更规则（关闭/停用/审批/驳回）

> 📌 **适用场景**：关闭前校验、停用前校验、审批通过后处理、驳回后处理等
>
> ⚠️ **特点**：需要获取单据的完整数据（包含参照、特征等），有两种方案

**方案选择决策树**：
```
需要获取单据完整数据？
      │
      ├── 需求明确有BIP API接口？ ──► 方案1：使用OpenAPI获取详情
      │
      └── 需求无明确API ─────────────► 方案2：使用IBillQueryRepository查询
```

#### 方案1：使用BIP OpenAPI获取详情

> 📌 **适用条件**：需求中明确提到要查询某BIP API接口获取数据

```java
// 1. 调用 iuap-c-openapi-integration skill 查询API接口定义
// 2. 根据API返回结构解析字段
// 3. 使用 OpenAPI.md 中的鉴权方式调用API
```

**示例**：
```java
@Component("approveAfterRule")
public class ApproveAfterRule implements IYpdCommonRul {

    @Autowired
    private OpenAPIClient openAPIClient;  // 自定义OpenAPI调用客户端

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
        billContext.setAction(rulCtxVO.getAction());
        billContext.setDomain(rulCtxVO.getDomain());

        List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);

        if (!CollectionUtils.isEmpty(bills)) {
            BizObject bill = bills.get(0);

            // ✅ 获取单据主键
            String billId = bill.getPrimaryKey().toString();

            // ✅ 调用BIP API获取完整数据（走OpenAPI skill）
            Map<String, Object> billDetail = openAPIClient.getBillDetail(billId);

            // ✅ 从API返回数据中获取字段
            String customerCode = billDetail.get("customer_code");
            String customerName = billDetail.get("customer_name");

            // ✅ 处理业务逻辑...
        }

        return new RuleExecuteResult();
    }
}
```

#### 方案2：使用IBillQueryRepository查询详情

> 📌 **适用条件**：需求无明确BIP API，需用IBillQueryRepository查询

**必须遵循IBillQueryRepository规范**：
- 参照字段：`参照属性名.code` / `参照属性名.name`
- 特征字段：`特征组.特征编码`
- 参照特征：`特征组.特征.codeField` / `特征组.特征.nameField`

```java
@Component("closeValidateRule")
public class CloseValidateRule implements IYpdCommonRul {

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
        billContext.setAction(rulCtxVO.getAction());
        billContext.setDomain(rulCtxVO.getDomain());

        List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);

        if (!CollectionUtils.isEmpty(bills)) {
            BizObject bill = bills.get(0);

            // ✅ 获取单据主键
            String billId = bill.getPrimaryKey().toString();
            String billCode = bill.getCBillNo();

            // ✅ 构建查询Schema（参照字段、特征字段按IBillQueryRepository规范）
            QuerySchema schema = QuerySchema.create();
            schema.addSelect("id,code,billdate");

            // 参照字段查询（语法：参照属性名.code）
            schema.addSelect("customer.code as customer_code");
            schema.addSelect("customer.name as customer_name");

            // 特征字段查询（语法：特征组.特征编码）
            schema.addSelect("basicInfo.color as material_color");

            // 参照类型特征（语法：特征组.特征.codeField）
            schema.addSelect("basicInfo.supplier.suppliercode as supplier_code");

            // ✅ 查询完整数据
            List<Map<String, Object>> results = billQueryRepository.queryMapBySchema(
                rulCtxVO.getFullname(),  // 业务对象URI
                schema,
                rulCtxVO.getDomain()    // 域
            );

            if (!results.isEmpty()) {
                Map<String, Object> billDetail = results.get(0);
                String customerCode = billDetail.get("customer_code");
                String materialColor = billDetail.get("material_color");

                // ✅ 处理业务逻辑...
            }
        }

        return new RuleExecuteResult();
    }
}
```

---

## 三、基础导入与接口定义

### 导入类

```java
import com.yonyou.iuap.BusinessException;
import com.yonyou.ucf.mdd.common.model.rule.RuleExecuteResult;
import com.yonyou.ucf.mdd.ext.bill.rule.base.CommonRuleUtils;
import com.yonyou.ucf.mdd.ext.model.BillContext;
import com.yonyou.ypd.bill.basic.service.api.IYpdCommonRul;
import com.yonyou.ypd.bill.basic.vo.RulCtxVO;
import org.imeta.orm.base.BizObject;
import org.springframework.stereotype.Component;
```

### 接口定义

```java
public interface IYpdCommonRul {
    Object execute(RulCtxVO rulCtxVO, Map<String, Object> params);
}
```

### RulCtxVO 常用方法

| 方法 | 说明 |
|------|------|
| `getBillnum()` | 获取单据编号 |
| `getFullname()` | 获取业务对象URI（用于IBillQueryRepository查询） |
| `getAction()` | 获取执行动作（如save、submit、approve等） |
| `getDomain()` | 获取域名（用于IBillQueryRepository查询） |

### RuleExecuteResult

| 方法 | 说明 |
|------|------|
| `new RuleExecuteResult()` | 正常继续执行后续规则 |
| `result.setCancel(true)` | 中断后续规则执行 |

---

## 四、代码模板

### 模板1：保存/更新校验规则

```java
@Component("XxxValidateRule")
public class XxxValidateRule implements IYpdCommonRul {

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        try {
            // 1. 构建上下文
            BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
            billContext.setAction(rulCtxVO.getAction());
            billContext.setDomain(rulCtxVO.getDomain());

            // 2. 获取单据数据（字段名从元数据获取）
            List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);

            for (BizObject bill : bills) {
                // 3. 校验逻辑
                String fieldValue = bill.get("字段名");  // 从元数据获取
                if (/* 不满足条件 */) {
                    throw new BusinessException("领域-500001", "错误信息");
                }
            }

            return new RuleExecuteResult();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("领域-500002", e.getMessage());
        }
    }
}
```

### 模板2：状态变更规则（需查询详情）

```java
@Component("XxxAfterRule")
public class XxxAfterRule implements IYpdCommonRul {

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        try {
            // 1. 构建上下文
            BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
            billContext.setAction(rulCtxVO.getAction());
            billContext.setDomain(rulCtxVO.getDomain());

            // 2. 获取主键
            List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);
            String billId = bills.get(0).getPrimaryKey().toString();

            // 3. 查询完整数据（参照/特征按IBillQueryRepository规范）
            QuerySchema schema = QuerySchema.create()
                .addSelect("id,code")
                .addSelect("customer.code as customer_code")     // 参照
                .addSelect("basicInfo.color as material_color"); // 特征

            List<Map<String, Object>> results = billQueryRepository.queryMapBySchema(
                rulCtxVO.getFullname(),
                schema,
                rulCtxVO.getDomain()
            );

            // 4. 业务逻辑
            // ...

            return new RuleExecuteResult();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("领域-500001", e.getMessage());
        }
    }
}
```

---

## 五、常见错误与修复

| 错误 | 原因 | 修复 |
|------|------|------|
| 字段取不到值 | 字段名错误或用户已提供API但未使用 | 优先使用用户提供的字段信息；若无，按IBillQueryRepository规范确认字段名 |
| 参照字段为null | 字段名写错 | 使用 `参照属性名.code` 语法 |
| 特征字段查不到 | 未使用IBillQueryRepository | 按IBillQueryRepository规范查询 |
| 类型B规则数据不全 | 直接用bill.get取值 | 需用IBillQueryRepository查详情或使用用户提供的API |

---

## 六、相关文档

- [IBillQueryRepository](IBillQueryRepository.md) — 查询规范（类型B规则必须参考）
- [BusinessException](BusinessException.md) — 异常抛出规范
- [iuap-c-metadata-info](iuap-c-metadata-info) — 元数据查询技能（按需调用，不要机械执行）
- [iuap-c-openapi-integration](iuap-c-openapi-integration) — OpenAPI调用（用户明确使用API时优先使用）
