# IBillRepository 操作数据库工具

**类路径**: `com.yonyou.ypd.bill.infrastructure.service.api.IBillRepository`

## 导入类

```java
import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.ypd.bill.basic.entity.BillEntityInfo;
import com.yonyou.ypd.bill.infrastructure.service.api.IBillQueryRepository;
import com.yonyou.ypd.bill.infrastructure.service.api.IBillRepository;
import org.imeta.orm.schema.QueryCondition;
import org.imeta.orm.schema.QueryConditionGroup;
import org.imeta.orm.schema.QuerySchema;
```

## 职责说明

`IBillRepository` 专门用于业务对象的写操作（增删改），与 `IBillQueryRepository` 形成互补。

## 方法列表

### 1. 单据对象操作

#### insertBillDO
```java
<T> T insertBillDO(IBillDO billDO)
```
保存单条实体数据对象，会刷新 pubts 为最新。

#### batchInsertBillDOs
```java
MergeResultType batchInsertBillDOs(IBillDO[] billDO)
```
批量保存实体数据对象。

#### updateBillDO
```java
boolean updateBillDO(IBillDO billDO, String... updateFields)
```
更新实体数据对象(根据数据状态处理, 包含 insert|delete|update)。

#### batchUpdateBillDos
```java
boolean batchUpdateBillDos(IBillDO[] billDO, Map<String, Set<String>> updateFieldMap)
```
批量更新实体数据对象。

#### batchRemove
```java
int batchRemove(String fullname, List<SimpleCondition> scList)
```
物理删除指定条件的单据。

#### batchLogicDelete
```java
int batchLogicDelete(String fullname, List<SimpleCondition> scList)
```
逻辑删除指定条件的单据。

### 2. BaseEntity 对象操作

#### save
```java
MergeResultType save(List<? extends BaseEntity> entityList)
```
保存实体列表。

#### insert
```java
<T extends BaseEntity> Object insert(List<T> vo)
```
插入实体列表。

#### remove
```java
<T extends BaseEntity> int remove(T vo)
```
删除指定实体。

#### removeByCondition
```java
int removeByCondition(BaseEntity baseEntity, Condition condition, boolean isLogic)
```
根据条件删除实体（可选择物理/逻辑删除）。

#### update
```java
<T extends BaseEntity> int update(List<T> vos, String... fieldNames)
```
更新实体列表（可指定更新字段）。

#### queryByPK
```java
<T extends BaseEntity> T queryByPK(T t, Object pk)
```
根据主键查询实体。

### 3. 原生 JDBC 操作

#### update
```java
int update(String sql, SQLParameter sqlParameter)
```
执行更新SQL语句。

#### queryForList
```java
<T> List<T> queryForList(String sql, SQLParameter sqlParameter, ResultSetProcessor processor)
```
执行查询SQL并返回结果列表。

#### queryForObject
```java
<T> T queryForObject(String sql, SQLParameter sqlParameter, ResultSetProcessor processor)
```
执行查询SQL并返回单个对象。

#### queryForDTOList
```java
<T> List<T> queryForDTOList(String sql, SQLParameter parameter, Class<T> clz)
```
执行查询SQL并返回DTO对象列表。

#### queryForDTO
```java
<T> T queryForDTO(String sql, SQLParameter parameter, Class<T> clz)
```
执行查询SQL并返回单个DTO对象。

## 使用示例

```java
@Slf4j
@Component("业务模型编码")
public class DemoImpl{

    @Autowired
    private IBillRepository billRepository;

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        BillDataDto billDataDto = (BillDataDto) params.get("param");
        List<Map<String, Object>> data = (List<Map<String, Object>>) billDataDto.getData();
        Map<String, Object> bill = data.get(0);

        // 更新单据
        billRepository.updateBillDO(单据实体的实例, null);

        // 批量更新
        billRepository.batchUpdateBillDos(单据实体数组, null);

        // 逻辑删除
        List<SimpleCondition> conditions = new ArrayList<>();
        conditions.add(new SimpleCondition("id", ConditionOperator.eq, billId));
        billRepository.batchLogicDelete("业务对象uri", conditions);

        return new RuleExecuteResult();
    }
}
```

## 注意事项

1. 实现类需要使用 `@Component` 注解，并指定bean名称
2. 优先使用 IBillQueryRepository 和 IBillRepository 进行业务操作
3. 只有在需要特殊查询或直接数据库操作时才会使用 IYmsJdbcApi
4. 批量操作时注意性能优化