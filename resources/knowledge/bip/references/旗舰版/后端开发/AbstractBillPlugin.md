# AbstractBillPlugin 业务插件开发

**类路径**: `com.yonyou.ypd.bill.plugin.AbstractBillPlugin`

## 开发步骤

1. 创建自定义插件类并继承 `AbstractBillPlugin`
2. 使用 `@BillPlugin` 注解注入Spring容器
3. 根据业务需求重写对应动作的 `beforeXxx` 或 `afterXxx` 方法

## 创建插件

```java
package com.yonyou.ucf.mdf.sample.bill.plugin;

import com.yonyou.ypd.bill.annotation.BillPlugin;
import com.yonyou.ypd.bill.basic.entity.IBillDO;
import com.yonyou.ypd.bill.context.YpdBillContext;
import com.yonyou.ypd.bill.plugin.AbstractBillPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Slf4j
@BillPlugin(busiObj = "业务对象编码")
public class DemoPlugin extends AbstractBillPlugin {

    private static final Logger log = LoggerFactory.getLogger(DemoPlugin.class);

    @Override
    public void beforeSave(YpdBillContext billContext) throws Exception {
        super.beforeSave(billContext);
        // 保存前逻辑
        for (IBillDO billDO : billContext.getBillDOs()) {
            // 处理每张单据
        }
    }

    @Override
    public void afterSave(YpdBillContext billContext) throws Exception {
        super.afterSave(billContext);
        // 保存后逻辑
    }
}
```

## 插件扩展点

### 保存相关 (IBillSaveActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeSave` | 保存前执行 |
| `afterSave` | 保存后执行 |
| `initBillConfig` | 初始化单据配置 |
| `beforeOneEntitySave` | 单实体保存前 |
| `afterOneEntitySave` | 单实体保存后 |

### 新增/复制相关 (IBillAddActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeInitBillDefaultValue` | 初始化默认值之前 |
| `initBillDefaultValueWhenNew` | 新建时初始化默认值 |
| `initBillDefaultValueWhenCopy` | 复制时初始化默认值 |

### 审核相关 (IBillAuditActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeAudit` | 审核前 |
| `afterAudit` | 审核后 |

### 反审相关 (IBillUnAuditActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeUnAudit` | 反审前 |
| `afterUnAudit` | 反审后 |

### 提交相关 (IBillSubmitActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeSubmit` | 提交前 |
| `afterSubmit` | 提交后 |
| `iswfControl` | 是否工作流控制 |
| `isSubmitNoBpm` | 是否提交不走BPM |
| `beforeAssigncheck` | 分配校验前 |

### 删除相关 (IBillDeleteActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeDelete` | 删除前 |
| `afterDelete` | 删除后 |
| `beforeExclusiveDelete` | 独占删除前 |
| `afterExclusiveDelete` | 独占删除后 |

### 查询相关 (IBillQueryActionPlugin)

| 方法 | 描述 |
|------|------|
| `beforeBillDetailQuery` | 单据详情查询前 |
| `afterBillDetailQuery` | 单据详情查询后 |
| `beforeBillListQuery` | 单据列表查询前 |
| `afterBillListQuery` | 单据列表查询后 |
| `beforeRefDataQuery` | 参照数据查询前 |
| `afterRefDataQuery` | 参照数据查询后 |

### BPM相关

| 方法 | 描述 |
|------|------|
| `beforeBpmStart` | 流程启动前 |
| `afterBpmStart` | 流程启动后 |
| `beforeBpmcomplete` | 流程完成前 |
| `afterBpmcomplete` | 流程完成后 |

### 编码校验 (IBillCodeCheckPlugin)

```java
@Component("业务对象编码")
public class CodeCheckPlugin extends AbstractBillPlugin {

    @Override
    public List<String> codeCheckBeforeSave(String busiObj, String fullName,
            String codeField, List<String> codeList) {
        List<String> errors = new ArrayList<>();
        // 校验逻辑
        for (String code : codeList) {
            if (code.startsWith("XXX")) {
                errors.add("编码不能以XXX开头");
            }
        }
        return errors;
    }
}
```

## 上下文类型

- 写操作多为 `YpdBillContext`
- 查询相关为 `BillQueryContext`
- 部分为 `BaseBillContext`

## 使用说明

- 除 `IBillBasePlugin.commonDoPlugin` 及 `IBillCodeCheckPlugin.codeCheckBeforeSave` 外，其余方法均为 default 空实现
- 实现时注意异常处理，避免影响主流程
- 涉及事务时需与框架约定一致