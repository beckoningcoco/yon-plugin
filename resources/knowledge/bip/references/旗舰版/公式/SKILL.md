---
name: iuap-c-formula-codegen
description: 用友BIP公式开发辅助工具。根据用户的业务需求描述，识别单据名称/字段/档案类型，结合函数规则与案例库生成正确的公式配置。适用于YonBuilder/UI模板/打印模板等场景的公式配置开发。
---

## 触发条件

用户描述需要配置公式的场景，包括但不限于：
- 单据字段取值逻辑（如根据客户带出组织信息）
- 表体数据汇总（如子表数量合计）
- 日期计算（如司龄计算、日期差）
- 档案属性获取（如物料属性、供应商信息）
- 条件判断与数据转换

## 规则

- 公式参数中字符串常量需用英文双引号包裹，字段变量无需引号
- 函数第二个参数（表达式）必须加引号：sum(list,"expression")
- 等于判断用 `==`，赋值用 `=`
- 日期类型字段参与运算需先用 strToDate 转换
- 嵌套函数引号交替：外层双引号则内层单引号
- 字段值为空时需用 iif/isEmpty 判空，避免运算异常
- 聚合函数参数中的表达式字符串必须加引号

## 工作流程

### Step 1：确认业务需求

从用户输入中提取：
- 目标单据/业务对象
- 需要取值的字段
- 数据来源（当前单据字段/档案/子表汇总）
- 特殊条件（如默认值、判空逻辑）

### Step 2：查询元数据

调用 `iuap-c-metadata` 技能获取：单据字段编码和字段名，参照关系和档案类型等信息

### Step 3：匹配函数与案例

根据业务场景匹配对应的函数和案例：

| 业务场景 | 推荐函数 | 参考文档 |
|---------|---------|----------|
| 跨档案取值 | getValue, getValueMore | 案例1-4, 13-21 |
| 物料属性 | getProductValue | 案例0, 14, 23 |
| 子表汇总 | sum, avg, count, aggrMax | 案例31, 34 |
| 日期计算 | dateDiff, dateAdd, dateFormat | 案例9, 30 |
| 条件判断 | iif, contains | 案例8, 18 |
| 字符串处理 | left, right, substring, indexOf | 案例32 |
| 聚合后连接 | groupConcat | 案例5, 27 |

### Step 4：生成公式

根据匹配的函数和案例生成公式，检查：
- 参数是否完整
- 引号是否正确
- 字段编码是否准确
- 判空逻辑是否完整

### Step 5：排查问题

如果公式不生效，按照以下顺序排查：
1. 校验公式语法（设计器校验按钮）
2. 检查 URI 和字段编码是否正确
3. 检查目标字段是否有值
4. 检查参数引号是否完整
5. 使用调试功能测试

## 输出格式

直接输出最终公式，示例：

```
getValue("aa.merchant.Merchant","internalOrgId.name","id",agentId.id)
```

如需说明，格式：
```
公式：getValue("aa.merchant.Merchant","internalOrgId.name","id",agentId.id)
说明：根据客户ID获取内部组织名称
```

## Reference Documents

Detailed function reference and examples:
- `<skill-base>/references/function-reference.md` - All function syntax and parameters
- `<skill-base>/references/examples-summary.md` - 36 business scenario examples
- `<skill-base>/references/troubleshooting.md` - Formula troubleshooting guide