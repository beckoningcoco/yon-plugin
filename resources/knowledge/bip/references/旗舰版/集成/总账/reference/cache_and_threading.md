# 基础档案缓存与多线程分发机制

## 基础档案缓存 (@PostConstruct)

### 设计原理

导入过程中需要大量查询基础档案数据（科目、账簿、部门、客户、供应商等）。为避免每条记录都查询数据库，在服务启动时通过 `@PostConstruct` 将所有参考数据加载到内存 Map 中。

### 缓存加载代码模板

```java
@Service
public class MigrationService {

    // 缓存 Map 声明
    Map<String, SimpleResultVO> accountBookMap;
    Map<String, List<SimpleResultVO>> allSubjectAndExtMap;
    Map<String, SimpleResultVO> allDeptMap;
    // ... 其他缓存

    @PostConstruct
    public void initCache() {
        // 1. 科目 + 辅助核算维度配置
        List<SimpleResultVO> subjectExtList = commonDaoMapper.queryAllSubjectAndExt(tenantId);
        allSubjectAndExtMap = subjectExtList.stream()
            .collect(Collectors.groupingBy(SimpleResultVO::getId));

        // 2. 账簿 (key: 编码)
        List<SimpleResultVO> accountBookList = commonDaoMapper.queryAllAccountBookByTenant(tenantId);
        accountBookMap = accountBookList.stream()
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity()));

        // 3. 科目 (key: 编码+科目表ID)
        List<SimpleResultVO> accsubjectList = commonDaoMapper.queryAccsubjectByTenant(tenantId);
        accsubjectCodeAndAccsubjectMap = accsubjectList.stream()
            .collect(Collectors.toMap(
                e -> e.getCode() + e.getAccsubjectchart(),
                Function.identity()
            ));

        // 4. 部门 (key: 公司前缀+"_"+部门编码)
        List<SimpleResultVO> allDeptList = subjectAccountDaoMapper.queryAllDeptByTenant(tenantId);
        allDeptMap = allDeptList.stream()
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity()));

        // 5. 供应商 (key: 供应商编码)
        List<SimpleResultVO> vendorList = subjectAccountDaoMapper.queryAllVendorByTenant(tenantId);
        vendorMap = vendorList.stream()
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity()));

        // 6. 客户 (key: 客户编码)
        List<SimpleResultVO> merchantList = subjectAccountDaoMapper.queryAllMerchantByTenant(tenantId);
        merchantMap = merchantList.stream()
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity()));

        // 7. 辅助核算编码+refCode (key: 辅助核算编码如"0001")
        List<SimpleResultVO> vrsList = commonDaoMapper.queryAllVrsAndRefCodeByTenant(tenantId);
        allVrsAndRefCodeMap = vrsList.stream()
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity()));

        // 8. 子目映射表 (key: 子目编码, value含name即子目类型)
        List<SimpleResultVO> subaccList = commonDaoMapper.queryMapperSubAcc();
        mapperSubaccMap = subaccList.stream()
            .filter(Objects::nonNull)
            .collect(Collectors.toMap(SimpleResultVO::getCode, Function.identity(), (k1, k2) -> k2));

        // ... 其他基础档案类似
    }
}
```

### 完整缓存 Map 清单

| Map名称 | 数据来源表 | Key格式 | 用途 |
|---------|-----------|---------|------|
| allSubjectAndExtMap | epub_accsubject_dimensionext | 科目ID | 判断科目需要哪些辅助核算 |
| accountBookMap | epub_accountbook | 账簿编码 | 获取账簿ID和科目表ID |
| accsubjectCodeAndAccsubjectMap | epub_accsubject | 科目编码+科目表ID | 获取科目ID和方向 |
| orgFinBankacctMap | org_fin_bankacct | 银行账户编码 | 银行子目映射 |
| alternatingSubHeadMap | wd_fz_alternating_subhead | 往来子目编码 | 往来子目映射 |
| assetsSubheadMap | wd_fz_assets_subhead | 资产子目编码 | 资产子目映射 |
| payrollSubheadMap | wd_fz_payroll_subhead | 薪资子目编码 | 薪资子目映射 |
| brandInformationMap | wd_fz_brand_information | 品牌编码 | 品牌映射 |
| allDeptMap | org_orgs | 公司前缀+"_"+部门编码 | 部门映射 |
| productServiceMap | wd_fz_product_service | 产品服务编码 | 产品服务映射 |
| vendorMap | aa_vendor | 供应商编码 | 供应商/关联方映射 |
| merchantMap | MERCHANT | 客户编码 | 客户/关联方映射 |
| allVrsAndRefCodeMap | epub_multidimension_ext | 辅助核算编码 | 获取def序号和refCode |
| plazaInformationMap | wd_fz_plaza_information | 广场编码 | 广场映射 |
| currencyMap | bd_currency_tenant | 币种编码 | 币种映射 |
| mapperCustomerOrMerchantIntMap | MAPPER_CUSTOMER_OR_MERCHANT_INT | 编码+"客户"/"供应商" | 关联方映射 |
| mapperSubaccMap | mapper_subacc | 子目编码 | 子目类型判断 |
| mapperBankMap | BANK_MAPPING_T | 银行编码 | 银行编码转换 |
| projectMap | bd_project | 项目编码 | 项目映射 |

### SimpleResultVO 结构

```java
public class SimpleResultVO {
    private String id;           // 主键ID
    private String name;         // 名称（子目类型/辅助核算名称等）
    private String code;         // 编码
    private String accsubjectchart; // 科目表ID
    private String direction;    // 科目方向（Debit/Credit）
    private String vrs;          // 辅助核算维度序号（如vr1→def1）
    private String refCode;      // 参照编码
    private String INT;          // 关联方编码
    private String type;         // 类型（客户/供应商）
}
```

## 多线程分发机制

### 线程池

使用 YonBIP 平台提供的线程池：

```java
private ExecutorService executor = YmsExecutors.getYmsExecutor();
```

### 期初保存分发策略

```
dispatchSubjectAccountsInit(status)
  │
  ├─ 查询配置表获取所有中间表
  │
  ├─ 对每个中间表：
  │   ├─ 查询所有不同的账簿编码
  │   ├─ Lists.partition(账簿列表, 5) → 每5个账簿一组
  │   └─ 每组提交一个线程
  │       └─ 对每个账簿：
  │           ├─ 查询中间表数据
  │           ├─ 按(公司+科目+币种+期间)分组
  │           ├─ splitMap(分组, 10) → 拆分为10个子Map
  │           └─ 每个子Map提交一个线程
  │               ├─ buildDataAndSaveSubjectAccount()
  │               └─ checkSubjectAccount()
  └─ 完成
```

### 凭证迁移分发策略

```
dispatchVorcherInit(status, remark)
  │
  ├─ 查询配置表获取所有中间表
  │
  ├─ 对每个中间表：
  │   ├─ 查询所有不同的账簿编码
  │   ├─ Lists.partition(账簿列表, 总数/20) → 分20组
  │   └─ 每组提交一个线程
  │       └─ 对每个账簿：
  │           ├─ 查询中间表数据
  │           ├─ 按JURAL_NUMBER(凭证编号)分组
  │           ├─ splitMap(分组, 10) → 拆分为10个子Map
  │           └─ 每个子Map提交一个线程
  │               └─ extracted() → 构建报文 + postAddVoucher()
  └─ 完成
```

### Map拆分工具方法

```java
<T> Map<String, Map<String, List<T>>> splitMap(Map<String, List<T>> originalMap) {
    int splitSize = (int) Math.ceil((double) originalMap.size() / 10);
    Map<String, Map<String, List<T>>> splitMaps = new HashMap<>();
    int index = 0;

    while (!originalMap.isEmpty()) {
        Map<String, List<T>> subMap = originalMap.entrySet().stream()
            .limit(splitSize)
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        splitMaps.put("map" + index, subMap);
        originalMap.entrySet().removeIf(entry -> subMap.containsKey(entry.getKey()));
        index++;
    }
    return splitMaps;
}
```

### 同步日志表

凭证迁移使用 `DATA_SYNC_PROGRESS` 表跟踪同步进度：

```sql
-- 导入前先删除旧记录，再插入新记录
DELETE FROM DATA_SYNC_PROGRESS WHERE table_name = #{tableName} AND com = #{com};
INSERT INTO DATA_SYNC_PROGRESS (table_name, com) VALUES (#{tableName}, #{com});
```

## 并发安全注意事项

1. **缓存Map是只读的**：@PostConstruct初始化后不再修改，线程安全
2. **中间表状态回写**：每条记录按ID或凭证编号更新，无竞争
3. **reqIdList**：每个线程独立创建和使用，无共享
4. **StringBuilder errorLogBuilder**：每个分组独立创建，线程安全
5. **splitMap 修改原Map**：调用后原Map被清空，需注意不要重复使用
