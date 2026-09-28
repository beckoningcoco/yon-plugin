# Formula Troubleshooting Guide

## 1. Check Formula Configuration

### Common Quote Issues
- sum、groupConcat、getValue等函数的部分参数必须加引号
- UI模板公有云20240915版本之后可不加引号，其他服务未更新到最新版仍需加引号
- 示例：sum函数第二个参数需加引号
- getValue前三个参数有引号，最后一个参数是字段变量则无引号

### Syntax Validation
- 使用公式设计器的校验按钮检查配置是否正确
- 注意：部分模块（如合同、打印）的业务可能不按元数据定义类型返回业务数据

---

## 2. getValue/getValueMore Not Working Troubleshooting

1. **点击设计器校验** - 检查配置是否正确

2. **检查URI和查询字段** - 确认uri是实体URI而非表名
   - 条件字段和查询目标字段要用字段编码而非表字段
   
3. **检查目标单据字段是否有值** - 确保要查询的字段有值

4. **单独配置变量测试** - getValue的第四个参数单独配置预览是否有值
   - 变量无值则函数也取不到值
   
5. **使用公式设计器调试** - 录入值后点击执行查看结果

6. **UI模板场景F12调试** - NetWork->Fetch/XHR中检查executeFormulaCalculate请求

---

## 3. Other Functions and Scenario Troubleshooting

### Issue 1: sum Function Nested Result Type
- 内嵌套函数结果需为数值类型，否则无法sum运算
- 嵌套的iif函数返回结果需是数值，无值可用0代替，不可返回空字符串
- 示例：`sum({PurInRecord.purInRecords},"iif({PurInRecord.purInRecords.priceUOM.name}=='KG',{PurInRecord.purInRecords.qty},0)")`

### 问题2：嵌套函数不生效
- 可拆开一层一层测试，定位取不到值的步骤

### 问题3：嵌套函数涉及引号使用
- 需单双引号交替
- 外层双引号则内层单引号，外层单引号则内层双引号
- 示例：`aggrDateMax(purchaseOrders,"strToDate(purchaseOrders.bodyFreeItem!define7,'yyyy-MM-dd')")`

### 问题4：外层函数有引号时表示空白
- 里层表示空白需用连续四个单引号`''''`
- 示例：`sum({PersonalLoanBillVO.loanbillbvos},"replace({PersonalLoanBillVO.loanbillbvos.nloanmny},',','''')")`

### 问题5：等号使用
- `==`代表等于（用于条件判断）
- `=`代表赋值
- 正确格式：`iif(A==B,C,D)`

### 问题6：使用常量需加引号
- 示例：`iif({voucher_order.nextStatus}=="开立","未知",{voucher_order.receiveAddress})`

### 问题7：括号、引号、逗号需为英文符号
- 不可用中文符号

### 问题8：数学运算时空值处理
- 若字段值可能为空或null，需先转为0再运算
- 示例：`purchaseOrders.qty-iif(isEmpty(purchaseOrders.totalInQty),0,purchaseOrders.totalInQty)`
- 错误写法：`iif(isNull(purchaseOrders.totalInQty),purchaseOrders.qty,purchaseOrders.qty-purchaseOrders.totalInQty)`

### 问题9：日期函数类型转换
- 部分函数参数要求为日期类型，值为字符串类型需先用strToDate转换
- 示例：`dateFormat(strToDate({order.date},"yyyy-MM-dd HH:mm:ss"),"yyyy年MM月dd日")`

### 问题10：页面规则中公式正确性难判断
- 可在UI模板页面拖计算字段，复制公式进去查看计算结果
- 若公式检查正确但不生效，拖计算字段测试
- 若生效可能是原字段有其他赋值规则覆盖公式结果

### 问题11：iif函数不能实现短路逻辑
- 内部报错会导致整个公式计算失败
- 可改用三目运算符（公有云20240915版本后支持）
- 示例：将`iif(isNull(voucherCode)||equalsIgnoreCase(voucherCode,"~")...`改为`isNull(voucherCode)||equalsIgnoreCase(voucherCode,"~")?"~":voucherType_name+"-"+voucherCode`

### 问题12：打印模板/合同模板校验报错
- 个别特殊情况设计器内校验报错但运行时可能正常
- 可先尝试单据打印测试

### 问题13：UI模板循环依赖
- 不可有循环依赖配置或公式因子包含当前字段本身
- 示例：数量字段公式"数量*10"会触发无限循环

---

## 4. 快速排查检查清单

```
[ ] 公式语法校验是否通过
[ ] URI是否为实体URI而非表名
[ ] 字段编码是否正确（用字段编码非表字段）
[ ] 目标字段是否有值
[ ] 函数第二个参数是否加引号（sum/groupConcat等）
[ ] 嵌套函数引号是否交替
[ ] 空值是否用iif/isEmpty处理
[ ] 日期类型是否用strToDate转换
[ ] 是否有其他赋值规则覆盖
```

---

## 5. 调试技巧

### 技巧1：分层调试
- 将复杂公式拆解为多个简单公式分别测试
- 从最内层函数开始逐层向外测试

### 技巧2：计算字段辅助
- 在UI模板中添加计算字段用于调试公式
- 计算字段可实时查看计算结果

### 技巧3：F12网络调试
- 打开浏览器开发者工具
- 筛选XHR请求查看executeFormulaCalculate
- 检查请求参数和返回值

### 技巧4：日志输出
- 在打印模板中使用调试字体查看中间值
- 配置临时显示字段观察公式执行路径