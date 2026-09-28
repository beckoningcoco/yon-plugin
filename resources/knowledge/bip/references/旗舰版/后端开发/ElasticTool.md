# 特征操作工具类 (ElasticTool)

功能：
1. 查询业务对象分配的特征明细信息
2. 根据业务单据ID/编码更新特征属性
3. 根据业务对象参数查询特征值
4. 该类作为一个公共类，如果当前项目已有类型的功能，则沿用项目中的类

## 何时使用 ElasticTool（决策规则 ⚠️）

当需求涉及**特征字段更新**时，必须按以下决策树处理：

```
识别到特征字段
      │
      ▼
需求是否提到 API/接口？
      │
   ┌──┴──┐
   │     │
   │ YES │───────────────────→ 查询 API 是否支持 characteristic
   │     │                           │
   │     │                      ┌────┴────┐
   │     │                      │         │
   │     │                 支持 │         │ 不支持
   │     │                      │         │
   │     │                      ▼         ▼
   │     │              特征组Map赋值    先API保存
   │     │                            再ElasticTool更新
   │     │
   │ NO │
   │     │
   ▼     ▼
使用 ElasticTool 更新特征
```

### 决策表

| # | 需求描述关键词 | 处理方式 |
|---|--------------|---------|
| 1 | 提到 **API** 或 **接口** | ① 查API是否支持characteristic<br>② 支持 → 特征组Map赋值<br>③ 不支持 → 先API保存，再ElasticTool更新 |
| 2 | 提到 **数据库**、**JDBC**、**更新**<br>但**没有**提到API | 直接使用 **ElasticTool** |
| 3 | **只描述**特征更新<br>没有提任何实现方式 | 使用 **ElasticTool** |

### 识别 API 是否支持 characteristic

调用 `iuap-c-openapi-integration` 技能查询接口，检查入参中是否有 `characteristic` 类型字段：

```bash
bash run_query.sh --all-interface-desc "XX接口名称" 2>&1 | grep -E "characteristic|特征"
```

**判断标准**：
| API 查询结果 | 结论 |
|-------------|------|
| 入参中有 `characteristic` 类型字段 | ✅ API **支持**特征赋值 |
| 入参中**没有** `characteristic` 类型字段 | ❌ API **不支持** |

## 使用方式

### 1. 引入依赖

```java
import com.yonyou.iuap.context.InvocationInfoProxy;
import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import org.apache.commons.lang3.ObjectUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.io.Serializable;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 特征操作工具类
 * 功能：
 * 1、特征关联关系查询
 * 2、根据业务单据ID/编码更新特征属性
 * 3、根据业务对象参数查询特征值
 */
@Component
public class ElasticTool {

    private static final Logger logger = LoggerFactory.getLogger(ElasticTool.class);

    @Resource(name = "baseDAO")
    private IYmsJdbcApi ymsJdbcApi;

    // ... 方法实现
}
```

### 2. 查询特征明细（核心方法）

```java
/**
 * 根据业务对象的URI 和 schema 查询被分配的特征明细信息
 *
 * @param schema    数据库schema
 * @param objectUri 业务对象URI
 * @return 特征明细列表
 */
public List<ElasticDTO> queryElasticDetails(String schema, String objectUri) {
    if (StringUtils.isBlank(schema) || StringUtils.isBlank(objectUri)) {
        logger.error("queryElasticDetails参数异常：schema={}, objectUri={}", schema, objectUri);
        return Collections.emptyList();
    }
    if (ymsJdbcApi == null) {
        logger.error("queryElasticDetails失败：ymsJdbcApi为空");
        return Collections.emptyList();
    }

    String tenantid = InvocationInfoProxy.getTenantid();
    tenantid = StringUtils.defaultIfBlank(tenantid, "0");

    String sql = "SELECT DISTINCT " +
            "   md_attribute.id, " +
            "   md_attribute.object_uri, " +
            "   object_meta_class.table_name AS object_table_name, " +
            "   md_attribute.display_name as elastic_group_name, " +
            "   md_attribute.name as elastic_group_obj_name, " +
            "   md_attribute.field_name as elastic_group_clomn, " +
            "   md_attribute.ref_meta_class_uri AS elastic_group_uri, " +
            "   ref_meta_class.table_name AS elastic_ori_table_name, " +
            "   md_generalization.general_class as elastic_group_parent_uri, " +
            "   elastic_field.real_table as elastic_table_name, " +
            "   elastic_field.real_column as elastic_column, " +
            "   elastic_field.field_name as elastic_code " +
            "  FROM iuap_metadata_base.md_attribute md_attribute " +
            "  LEFT JOIN iuap_metadata_base.md_meta_class object_meta_class ON md_attribute.object_uri = object_meta_class.uri " +
            "       AND object_meta_class.ytenant_id = '0' " +
            "  LEFT JOIN iuap_metadata_base.md_meta_class ref_meta_class ON md_attribute.ref_meta_class_uri = ref_meta_class.uri " +
            "       AND ref_meta_class.ytenant_id = '0' " +
            "  LEFT JOIN iuap_metadata_base.md_generalization md_generalization ON md_attribute.ref_meta_class_uri = md_generalization.specific_class " +
            "  LEFT JOIN " + schema + ".elastic_object elastic_object ON ref_meta_class.table_name = elastic_object.table_name " +
            "       AND elastic_object.ytenant_id = '" + tenantid + "' " +
            "  LEFT JOIN " + schema + ".elastic_field elastic_field ON elastic_object.id = elastic_field.object_id and elastic_field.is_del = 0 " +
            "  WHERE md_attribute.object_uri = '" + objectUri + "' " +
            "   AND md_attribute.biz_type = 'UserDefine' " +
            "   AND md_attribute.ytenant_id = '0' ";

    try {
        return ymsJdbcApi.queryForDTOList(sql, ElasticDTO.class);
    } catch (Exception e) {
        logger.error("queryElasticDetails执行SQL失败", e);
        return Collections.emptyList();
    }
}
```

### 3. 更新特征（根据ID）

```java
/**
 * 根据业务单据id，更新特征属性
 *
 * @param schema       数据库schema
 * @param uri          业务对象URI
 * @param characterMap 需要更新的特征 {key:特征编码，value:特征值}
 * @param objId        业务单据对应主键的值
 * @param objCode      业务单据对应编码的值
 * @param objCodeFild  业务单据对应的编码的key
 */
public void updateFeatureWithQuery(String schema, String uri,
        Map<String, Object> characterMap,
        String objId, String objCode, String objCodeFild) {
    List<ElasticDTO> characterRelDTOS = queryElasticDetails(schema, uri);
    updateFeatureDirectly(schema, characterRelDTOS, characterMap, objId, objCode, objCodeFild);
}
```

### 4. 批量更新特征（减少重复查询）

```java
/**
 * 批量更新特征属性
 * 1、根据业务单据id， 更新特征属性
 * 2、根据业务单据的编码，更新特征属性
 *
 * @param schema           数据库schema
 * @param characterRelDTOS 特征对应关系
 * @param characterMap     需要更新的特征 {key:特征编码，value:特征值}
 * @param objId            业务单据对应主键的值
 * @param objCode          业务单据对应编码的值
 * @param objCodeFild      业务单据对应的编码的key，非标准规则需特殊传值
 */
public void updateFeatureDirectly(String schema,
        List<ElasticDTO> characterRelDTOS,
        Map<String, Object> characterMap,
        Object objId, String objCode, String objCodeFild) {
    if (StringUtils.isBlank(schema) || characterMap == null || characterMap.isEmpty()
            || ObjectUtils.isEmpty(objId)) {
        logger.warn("updateFeatureDirectly参数异常：schema={}, characterMap={}, objId={}", schema, characterMap, objId);
        return;
    }
    if (characterRelDTOS == null || characterRelDTOS.isEmpty()) {
        logger.info("updateFeatureDirectly无特征关系数据，无需更新");
        return;
    }

    String tenantid = InvocationInfoProxy.getTenantid();
    tenantid = StringUtils.defaultIfBlank(tenantid, "0");

    ElasticDTO firstDTO = characterRelDTOS.get(0);
    String objectCharacterFild = firstDTO.getElastic_group_clomn();
    String realTableName = firstDTO.getObject_table_name();
    if (StringUtils.isBlank(objectCharacterFild) || StringUtils.isBlank(realTableName)) {
        logger.error("updateFeatureDirectly特征关系数据异常");
        return;
    }

    // 按真实特征表分组
    Map<String, List<ElasticDTO>> collect = characterRelDTOS.stream()
            .filter(dto -> StringUtils.isNotBlank(dto.getElastic_table_name()))
            .collect(Collectors.groupingBy(ElasticDTO::getElastic_table_name));

    // 循环每个特征表生成更新语句
    for (Map.Entry<String, List<ElasticDTO>> characterRelEntry : collect.entrySet()) {
        String tableName = characterRelEntry.getKey();
        List<ElasticDTO> characterRelList = characterRelEntry.getValue();

        StringBuilder updateSB = new StringBuilder();
        updateSB.append(" update " + schema + "." + tableName);
        StringBuilder setSB = new StringBuilder();
        setSB.append(" set ");

        boolean hasSetField = false;
        for (ElasticDTO characterRelDTO : characterRelList) {
            String fieldName = characterRelDTO.getElastic_code();
            String realColumn = characterRelDTO.getElastic_column();
            if (characterMap.containsKey(fieldName) && StringUtils.isNotBlank(realColumn)) {
                Object fieldValue = characterMap.get(fieldName);
                String valueStr = fieldValue == null ? "null"
                        : "'" + fieldValue.toString().replace("'", "''") + "'";
                setSB.append(realColumn).append(" = ").append(valueStr).append(", ");
                hasSetField = true;
            }
        }

        if (!hasSetField) {
            continue;
        }

        StringBuilder whereSB = new StringBuilder();
        whereSB.append(" where 1=1 ");
        if (ObjectUtils.isNotEmpty(objId)) {
            whereSB.append(" and id in (select ").append(objectCharacterFild)
                    .append(" from ").append(schema).append(".").append(realTableName)
                    .append(" where id = '").append(objId).append("' and ytenant_id = '").append(tenantid)
                    .append("')");
        }
        if (StringUtils.isNotBlank(objCode)) {
            String codeFiled = StringUtils.defaultIfBlank(objCodeFild, "code");
            whereSB.append(" and id in (select ").append(objectCharacterFild)
                    .append(" from ").append(schema).append(".").append(realTableName)
                    .append(" where ").append(codeFiled).append(" = '").append(objCode.replace("'", "''"))
                    .append("' and ytenant_id = '").append(tenantid).append("')");
        }
        whereSB.append(" and ytenant_id = '").append(tenantid).append("'");

        // 移除set部分最后的逗号
        String setSql = setSB.toString().replace(", $", " ");
        String fullSql = updateSB.append(" ").append(setSql).append(whereSB).toString();

        try {
            ymsJdbcApi.update(fullSql);
            logger.info("updateFeatureDirectly执行更新成功：sql={}", fullSql);
        } catch (Exception e) {
            logger.error("updateFeatureDirectly执行更新失败", e);
        }
    }
}
```

## ElasticDTO 内部类

```java
/**
 * 特征数据传输对象
 */
public class ElasticDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String id;
    private String object_uri;
    private String object_table_name;
    private String elastic_group_obj_name;
    private String elastic_group_clomn;
    private String elastic_group_uri;
    private String elastic_group_name;
    private String elastic_ori_table_name;
    private String elastic_group_parent_uri;
    private String elastic_table_name;
    private String elastic_column;
    private String elastic_code;

    // getter/setter 省略
}
```

## 字段说明

| 字段 | 说明 |
|------|------|
| id | 特征属性ID |
| object_uri | 业务对象URI |
| object_table_name | 业务对象表名 |
| elastic_group_obj_name | 特征组在业务对象中的字段名 |
| elastic_group_clomn | 特征组在业务对象中表的字段 |
| elastic_group_uri | 特征组对应的URI |
| elastic_group_name | 特征组名称 |
| elastic_ori_table_name | 特征组对应的原表（基表） |
| elastic_group_parent_uri | 特征组对应对象的URI的父URI |
| elastic_table_name | 被分配特征的真实表 |
| elastic_column | 被分配特征对应表的列 |
| elastic_code | 特征编码 |

## 主表vs子表特征组使用示例

不同的业务对象有不同的特征组名称：

### 采购到货单

| 类型 | 特征组常量 | 说明 |
|------|------------|------|
| 主表 | `arrivalOrderDefineCharacter` | 表头特征组 |
| 子表 | `arrivalOrdersDefineCharacter` | 表体特征组 |

主表URI: `pu.arrivalorder.ArrivalOrder`
子表URI: `pu.arrivalorder.ArrivalOrders`

```java
// 查询主表特征关系
List<ElasticDTO> mainCharList = elasticTool.queryElasticDetails("upurchase",
    "pu.arrivalorder.ArrivalOrder");

// 查询子表特征关系
List<ElasticDTO> detailCharList = elasticTool.queryElasticDetails("upurchase",
    "pu.arrivalorder.ArrivalOrders");
```

### 销售订单

| 类型 | 特征组常量 | 说明 |
|------|------------|------|
| 主表 | `orderDefineCharacter` | 表头特征组 |
| 子表 | `orderDetailDefineCharacter` | 表体特征组 |

主表URI: `voucher.order.Order`
子表URI: `voucher.order.OrderDetail`

### 采购订单

| 类型 | 特征组常量 | 说明 |
|------|------------|------|
| 主表 | `purchaseOrderDefineCharacter` | 表头特征组 |
| 子表 | `purchaseOrderDetailDefineCharacter` | 表体特征组 |

主表URI: `pu.purchaseorder.PurchaseOrder`
子表URI: `pu.purchaseorder.PurchaseOrderDetail`

## 完整使用示例

```java
@Component
public class WeighbridgeUtils {

    @Resource(name = "baseDAO")
    private IYmsJdbcApi ymsJdbcApi;

    @Autowired
    private ElasticTool elasticTool;

    // Schema名称
    public static final String SCHEMA = "upurchase";
    // 业务对象URI
    public static final String ARRIVAL_ORDER_DETAIL_URI = "pu.arrivalorder.ArrivalOrders";

    /**
     * 更新地磅数据（毛重、皮重、净重、实收数量）
     */
    public void updateWeighbridgeData(String detailId, String maozhong, String pizhong,
            String jingzhong, String acceptqty) {
        Map<String, Object> characterMap = new HashMap<>();
        if (StringUtils.isNotBlank(maozhong)) {
            characterMap.put("MAOZHONG", maozhong);
        }
        if (StringUtils.isNotBlank(pizhong)) {
            characterMap.put("PIZHONG", pizhong);
        }
        if (StringUtils.isNotBlank(jingzhong)) {
            characterMap.put("JINGZHONG", jingzhong);
        }
        if (StringUtils.isNotBlank(acceptqty)) {
            characterMap.put("ACCEPTQTY", acceptqty);
        }
        if (!characterMap.isEmpty()) {
            // 使用ElasticTool更新特征
            ElasticTool.updateFeatureWithQuery(SCHEMA, ARRIVAL_ORDER_DETAIL_URI,
                    characterMap, detailId, null, "id");
        }
    }
}
```

## 注意事项

1. **更新特征前必须先获取业务对象主键ID**，否则无法更新特征字段
2. 使用 `@Resource(name = "baseDAO")` 注入 `IYmsJdbcApi`，不是静态方法
3. `ElasticDTO` 是内部类，不需要static修饰
4. 特征组名称需要根据具体业务对象确定（主表vs子表不同）
5. 特征编码（如MAOZHONG、PIZHONG等）需要与业务对象分配的特征编码一致
**6.确保sql语法正确** 