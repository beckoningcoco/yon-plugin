# Yonyou BIP Formula Function Reference

## 1. 数学函数

| 函数 | 语法 | 名称 | 功能 | 参数 | 返回值 | 示例 |
|-----|------|-----|------|------|--------|------|
| abs | abs(num) | 绝对值函数 | 计算数值的绝对值 | num：需计算绝对值的数值 | 数值 | abs(orderDefineCharacter.num11) |
| acos | acos(num) | 反余弦函数 | 计算数值（弧度）的反余弦值 | num：需计算反余弦的数值 | 数值 | - |
| ceil | ceil(num) | 向上取整函数 | 对数值向上取整 | num：需向上取整的数值 | 数值 | ceil(orderDetails.subQty) |
| convertMnyToBlock | convertMnyToBlock(num, lang) | 按语言将金额转大写 | 按固定语言将金额转大写 | num：数值；lang：语言('zh'/'en') | 数值 | convertMnyToBlock(totalMoney,'zh') |
| decimalsToFractional | decimalsToFractional(num) | 小数转分数 | 将小数转为分数 | num：需转换的小数 | String | decimalsToFractional(0.333333) |
| numberFormat | numberFormat(num, pattern) | 将数值格式化 | 按模式格式化数值 | num：数值；pattern：模式 | String | numberFormat(12345,"#,###")→12,345 |
| numToFixed | numToFixed(num, length) | 保留指定小数 | 保留指定数量小数 | num：数值；length：小数位数 | 数值 | numToFixed({字段},2) |
| scale | scale(num, scale) | 四舍五入保留小数 | 四舍五入保留指定位数小数 | num：数值；scale：小数位数 | 数值 | scale({字段},2) |
| sin | sin(num) | 正弦函数 | 计算数值（弧度）的正弦值 | num：需计算正弦的数值 | 数值 | - |

## 2. 字符串函数

| 函数 | 语法 | 名称 | 功能 | 参数 | 返回值 | 示例 |
|-----|------|-----|------|------|--------|------|
| contains | contains(String1, String2) | 是否包含某字符串 | 判断String1是否包含String2 | String1：被判断字符串；String2：判断值 | 布尔值 | contains(salesOrgId_name,"XX公司") |
| indexOf | indexOf(String1, String2) | 首次出现位置 | 判断String2在String1中首次出现的位置 | String1：字符串；String2：目标字符串 | 整型 | indexOf({Order.code},"-") |
| left | left(String, num) | 左取N个字符 | 获取字符串从左边起的N个字符 | String：字符串；num：字符个数 | 字符串 | left({Order.code},4) |
| right | right(String, num) | 右取N个字符 | 获取字符串从右边起的N个字符 | String：字符串；num：字符个数 | 字符串 | right({Order.code},5) |
| substring | substring(String, start, end) | 截取字符串 | 按开始、结束位置截取字符串 | String：字符串；start：开始位置；end：结束位置 | 字符串 | substring({Order.code},15,22) |
| translate | translate(String, lang) | 翻译多语内容 | 翻译业务数据的多语内容 | String：多语字段；lang：多语标识 | 字符串 | translate('{"zh_CN":"11"}',"zh_CN") |

## 3. 时间函数

| 函数 | 语法 | 名称 | 功能 | 参数 | 返回值 | 示例 |
|-----|------|-----|------|------|--------|------|
| dateAdd | dateAdd(date, type, amount) | 日期增加 | 按类型给日期增加指定数量 | date：日期；type：类型(1-年/2-月/8-星期)；amount：数量 | 日期 | dateAdd(sysdate(),1,1) |
| dateDiff | dateDiff(date1, date2, type) | 日期相差计算 | 计算date1-date2的时间间隔 | date1/date2：日期；type：类型(1-年/3-日/9-季度) | 数值 | dateDiff(purchaseOrderDefineCharacter.ZYX7,vouchdate,1) |
| dateFormat | dateFormat(date, format) | 格式化日期 | 将日期按指定格式转换 | date：日期/字符串；format：格式 | 字符串 | dateFormat(strToDate("2023-07-25","yyyy-MM-dd"),"yyyy年MM月dd日") |
| dateFormatByLang | dateFormatByLang(date, lang, pattern) | 按语言格式化日期 | 按语言和格式格式化日期 | date：日期；lang：语言；pattern：格式 | 字符串 | dateFormatByLang(sysdate(),'en','MM dd,YYYY') |
| strToDate | strToDate(dateStr, formatStr) | 字符串转日期 | 将字符串日期转为Date类型 | dateStr：字符串日期；formatStr：源格式 | 日期 | strToDate("2023-07-25 11:00:00","yyyy-MM-dd HH:mm:ss") |

## 4. 聚合函数

| 函数 | 语法 | 名称 | 功能 | 参数 | 返回值 | 示例 |
|-----|------|-----|------|------|--------|------|
| aggrDateMax | aggrDateMax(list, "express") | 获取集合时间最大值 | 按条件获取集合中时间类型字段最大值 | list：集合；express：条件表达式 | 日期 | aggrDateMax(orderDetails,"orderDetails.consignTime") |
| aggrDateMin | aggrDateMin(list, "express") | 获取集合时间最小值 | 按条件获取集合中时间类型字段最小值 | list：集合；express：条件表达式 | 日期 | aggrDateMin(orderDetails,"orderDetails.consignTime") |
| aggrMax | aggrMax(list, "express") | 集合结果最大值 | 按表达式计算后取结果集最大值 | list：集合；express：表达式 | 数值 | aggrMax(orderDetails,"orderDetails.subQty") |
| aggrMin | aggrMin(list, "express") | 集合结果最小值 | 按表达式计算后取结果集最小值 | list：集合；express：表达式 | 数值 | aggrMin(orderDetails,"orderDetails.subQty") |
| and | and(list, "express") | 布尔结果集与运算 | 按表达式计算布尔结果集后做与运算 | list：集合；express：表达式 | 布尔值 | and(orderDetails,"orderDetails.subQty>10") |
| avg | avg(list, "express") | 集合数值平均值 | 按条件获取集合中数值类型字段平均值 | list：集合；express：表达式 | 数值 | avg(orderDetails,"orderDetails.subQty") |
| count | count(list) | 计算集合数量 | 统计集合的行数 | list：集合 | 数值 | count(orderDetails) |
| countifs | countifs(list, "条件表达式") | 计算满足条件集合数量 | 统计满足条件的集合行数 | list：集合；条件表达式：字符串形式 | 数值 | countifs(orderDetails,"orderDetails.subQty>10") |
| groupConcat | groupConcat(list, "expression", "splitchar", isDistinct) | 集合数据连接 | 按表达式计算后，用分隔符连接 | list：列表；expression：表达式；splitchar：分隔符；isDistinct：是否去重(0/1) | String | groupConcat(details,"details.memo",";",0) |
| or | or(list, "express") | 布尔结果集或运算 | 按表达式计算布尔结果集后做或运算 | list：集合；express：表达式 | 布尔值 | or(orderDetails,"orderDetails.subQty<10") |
| sum | sum(list, "express") | 汇总求和 | 按条件对列表字段汇总求和 | list：集合；express：条件表达式 | 数值 | sum(orderDetails,"orderDetails.subQty") |
| uniqueCount | uniqueCount(list, "expression") | 集合去重计数 | 获取列表数据去重后的数量 | list：集合；express：表达式 | 数值 | uniqueCount(orderDetails,"orderDetails.productId.id") |

## 5. 业务函数

| 函数 | 语法 | 名称 | 功能 | 参数 | 返回值 | 示例 |
|-----|------|-----|------|------|--------|------|
| iif | iif(条件, 分支1, 分支2) | 条件判断函数 | 按条件返回对应分支结果 | 条件：判断条件；分支1/2：结果 | 根据分支值类型 | iif({voucher_order.nextStatus}=="开立","",{voucher_order.receiveAddress}) |
| getValue | getValue(fullName, selectFiled, conditionField, conditionValue) | 根据条件查档案值 | 按条件查询档案中的指定字段值 | fullName：档案uri；selectFiled：查询字段；conditionField：条件字段；conditionValue：条件值 | 档案值 | getValue("pc.product.Product","brand","id",details.product) |
| getValueMore | getValueMore(fullName, selectFiled, conditionField1, conditionValue1,...) | 多条件查档案值 | 多条件查询档案指定字段值 | fullName：档案uri；selectFiled：查询字段；多组条件 | 档案值 | getValueMore("aa.goodsposition.GoodsProductsComparison","positionId.name",...) |
| nocStatistics | nocStatistics(metric, uri, fieldName, condition) | 统计函数 | 按条件统计实体字段值 | metric：统计指标；uri：实体uri；fieldName：字段；condition：条件 | 字符串 | nocStatistics("sum","uri","field","1=1") |
| getEnumDisplayName | getEnumDisplayName(enumtype, "enumkeys") | 获取枚举值 | 按枚举类型编码和key获取枚举value | enumtype：枚举定义编码；enumkeys：枚举key | 枚举value数组 | getEnumDisplayName("Gender","1,2") |
| getProductValue | getProductValue(attr, productId, orgId) | 获取物料属性值 | 获取物料基础/组织级/自定义/特征属性 | attr：属性名；productId：物料ID；orgId：组织ID | 档案值 | getProductValue("stockUnit",productId,orgId) |

## 6. 常用运算符

| 运算符 | 含义 | 说明 |
|-------|------|------|
| + | 加 | 数学运算、字符串拼接 |
| - | 减 | 数学计算 |
| * | 乘 | 数学计算 |
| / | 除 | 数学计算 |
| == | 等于 | 条件判断 |
| != | 不等于 | 条件判断 |
| < | 小于 | 条件判断 |
| > | 大于 | 条件判断 |
| <= | 小于等于 | 条件判断 |
| >= | 大于等于 | 条件判断 |
| && | 并且 | 条件判断 |
| \|\| | 或者 | 条件判断 |
| ? : | 三目运算符 | 条件判断（公有云20240915后支持） |

## 7. 常用系统变量

| 变量 | 说明 |
|------|------|
| sysdate() | 当前系统日期 |
| userId() | 当前登录用户ID |