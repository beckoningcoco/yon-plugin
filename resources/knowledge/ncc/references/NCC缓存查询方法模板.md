---
name: NCC 缓存查询方法模板
description: >
  NCC 版本的档案/编码翻译查询方法模板。当需要写翻译代码、缓存查询代码时，
  以此文档的模板为准。旗舰版（BIP/YonBIP）禁止使用。
version: NCC 2111/2207/2312
scope: NCC only
created: 2024-11-09
digested: 2026-07-01
---

# NCC 缓存查询方法模板

> **⚠️ 仅限 NCC 版本使用，旗舰版（BIP/YonBIP）禁止套用！**

## 方法一：GeneralAccessorFactory（最简单）

适用于单个编码→ID 翻译，一条语句完成。

```java
IBDData resdata = GeneralAccessorFactory.getAccessor(IBDMetaDataIDConst.CASHFLOW)  // 元数据 id
                .getDocByCode("GLOBLE00000000000000", code);  // 全局/集团/组织, 编码
```

参数说明：
- 第一个参数：元数据 id（见下方 [IBDMetaDataIDConst 速查表](#ibdmetadataidconst-元数据id速查)）
- 第二个参数：作用域 — `"GLOBLE00000000000000"`（全局）、集团 PK、或组织 PK
- 第三个参数：编码值

## 方法二：CacheVOQuery（NCC 内置缓存）

按编码 + 组织翻译人员主键的标准模板。

```java
/**
 * 根据人员编码 和 组织主键翻译 人员主键
 * @param code     人员编码
 * @param pk_org   组织主键
 * @return         人员主键，未找到返回 null
 */
@SuppressWarnings("all")
private String getPsndocPkByCodeAndOrg(String code, String pk_org) {
    PsndocVO res = null;
    CacheVOQuery cacheVOQuery = new CacheVOQuery(PsndocVO.class,
            new String[] { "code", "name", "pk_org", "dr", "pk_psndoc" });
            // 后面多一个 true 参数，代表强制查询，不走缓存

    List<String> whereFieldList = new ArrayList<String>();
    List<String[]> valueList = new ArrayList<String[]>();
    List<String> paramsValue = new ArrayList<String>();

    if (StringUtils.isNotBlank(code)) {
        whereFieldList.add("code");
        whereFieldList.add("pk_org");
        whereFieldList.add("dr");
        paramsValue.add(code);
        paramsValue.add(pk_org);
        paramsValue.add("0");
    }

    valueList.add(paramsValue.toArray(new String[0]));

    PsndocVO[] qryVos = (PsndocVO[]) cacheVOQuery.query(
            whereFieldList.toArray(new String[0]),
            valueList.toArray(new String[0][]));

    if (qryVos != null && qryVos.length > 0) {
        return qryVos[0].getPk_psndoc();
    }
    return null;
}
```

**使用方式**：
- 替换 `PsndocVO` 为目标 VO 类
- 替换 `whereFieldList` 中的字段为实际查询条件
- `CacheVOQuery` 第三个参数传 `true` 可强制查库、跳过缓存

## 方法三：Caffeine 缓存 + 批量查询返回 Map

适用于高频查询，缓存命中率高。

### 3.1 缓存初始化

```java
public class CommonCacheInitConfig {

    // 初始缓存容量
    private final static int INITIALCAPACITY = 100;
    // 最大缓存容量
    private final static int MAXIMUMSIZE = 1000;
    // 超时时间（分钟）
    private final static int EXPIRETIME = 30;

    public static Cache<String, Object> initCache() {
        return Caffeine.newBuilder()
                .initialCapacity(INITIALCAPACITY)
                .maximumSize(MAXIMUMSIZE)
                // expireAfterWrite 和 expireAfterAccess 同时存在时，以 expireAfterWrite 为准
                .expireAfterWrite(EXPIRETIME, TimeUnit.MINUTES)
                .expireAfterAccess(EXPIRETIME, TimeUnit.MINUTES)
                .removalListener((key, val, removalCause) -> {})
                .recordStats()
                .build();
    }
}
```

### 3.2 批量查询返回 Map（OrgVO 示例）

```java
private static Cache<String, Object> orgCache;

/**
 * 根据字段批量查询 OrgVO
 * @param filedName 字段名（pk_org / code / name）
 * @param params    可传单个或数组
 * @return          Map<查询值, OrgVO>
 */
public static Map<String, OrgVO> queryOrgVOByParams(String filedName, String... params) {
    Map<String, Object> ret = new HashMap<String, Object>();
    Map<String, OrgVO> resMap = new HashMap<String, OrgVO>();

    if (orgCache == null) {
        initOrgCache();
    }
    if (params.length == 0) {
        return resMap;
    }

    ret = orgCache.getAll(Arrays.asList(params), p -> {
        List<OrgVO> resList = wf.getOrg(filedName,
                IteratorUtils.toList(p.iterator()).toArray(new String[0]));
        return resList.stream().collect(
                Collectors.toMap(m -> (String) m.getAttributeValue(filedName), m -> m));
    });

    for (Map.Entry<String, Object> obj : ret.entrySet()) {
        OrgVO mv = (OrgVO) obj.getValue();
        resMap.put(obj.getKey(), mv);
    }
    return resMap;
}

/** 数据库查询（缓存未命中时调用） */
public List<OrgVO> getOrg(String filedName, String... params) {
    StringBuffer buf = new StringBuffer();
    buf.append(" select code,name,pk_org,pk_vid,isbusinessunit,islastversion,dr,enablestate ");
    buf.append(" from org_orgs where dr = 0 and isbusinessunit = 'Y' and islastversion = 'Y' and ");

    String sqlwhere = SQLUtil.buildSqlForIn(filedName, params);
    buf.append(sqlwhere);

    List<OrgVO> query = null;
    try {
        query = (List<OrgVO>) getDAO().executeQuery(
                buf.toString(), new BeanListProcessor(OrgVO.class));
    } catch (DAOException e) {
        ExceptionUtils.wrappBusinessException(e.getMessage());
    }
    return query;
}
```

### 3.3 单个查询返回 VO（BilltypeVO 示例）

```java
private static Cache<String, Object> billtypeCache;

/**
 * 根据某一字段查询单据类型
 * @param filedName pk_billtypeid / pk_billtypecode / billtypename
 * @param param     查询值
 * @return          BilltypeVO，未找到返回 null
 */
public static BilltypeVO queryBilltypeVOByParam(String filedName, String param) {
    BilltypeVO ret = null;
    if (param == null) {
        return ret;
    }
    if (billtypeCache == null) {
        initBilltypeCache();
    }

    ret = (BilltypeVO) billtypeCache.get(param, p -> {
        BilltypeVO res = wf.getBillType(filedName, param);
        return res;
    });
    return ret;
}

public BilltypeVO getBillType(String filedName, String param) {
    StringBuffer buf = new StringBuffer();
    buf.append(" select pk_billtypeid, pk_billtypecode, billtypename, billstyle, dr ");
    buf.append(" from bd_billtype where dr = 0 and ");
    buf.append(filedName).append(" = '").append(param).append("'");

    List<BilltypeVO> query = null;
    try {
        query = (List<BilltypeVO>) getDAO().executeQuery(
                buf.toString(), new BeanListProcessor(BilltypeVO.class));
    } catch (DAOException e) {
        ExceptionUtils.wrappBusinessException(e.getMessage());
    }
    if (query != null && query.size() > 0) {
        return query.get(0);
    }
    return null;
}
```

## 方法四：Guava LoadingCache（自动加载）

```java
import java.util.concurrent.TimeUnit;
import com.google.common.cache.CacheBuilder;
import com.google.common.cache.CacheLoader;
import com.google.common.cache.LoadingCache;

/** 单据类型的缓存实例，最大 100 条，写入后 30 分钟过期 */
public static LoadingCache<String, String> billtypeCache = CacheBuilder.newBuilder()
        .maximumSize(100)
        .expireAfterWrite(30, TimeUnit.MINUTES)
        .build(new CacheLoader<String, String>() {
            @SuppressWarnings("all")
            @Override
            public String load(String key) throws Exception {
                String rnpk = null;
                // key = 交易类型 Code
                StringBuffer buf = new StringBuffer();
                buf.append("select pk_billtype from bd_billtype ");
                buf.append("where pk_billtypecode = '").append(key).append("'");

                List<String> ret = (List<String>) NCLocator.getInstance()
                        .lookup(IUAPQueryBS.class)
                        .executeQuery(buf.toString(), new ColumnListProcessor());

                if (ret != null && ret.size() > 0) {
                    rnpk = ret.get(0);
                }
                return rnpk;
            }
        });
```

---

## 方法对比速查

| 方法 | 适用场景 | 缓存机制 | 代码量 |
|------|----------|----------|--------|
| GeneralAccessorFactory | 单条编码→ID | NCC 内置 | 1 行 |
| CacheVOQuery | 单条编码+组织→ID | NCC 内置缓存 | ~20 行 |
| Caffeine + 批量 | 高频批量查询 | Caffeine | ~40 行 |
| Guava LoadingCache | 高频单条查询 | Guava | ~15 行 |

---

## IBDMetaDataIDConst 元数据 ID 速查

### 常用档案

| 常量 | 表名 | 元数据 ID |
|------|------|-----------|
| `CASHFLOW` | 现金流量项目 | `08d4138b-a7b5-42fd-94bc-bb6eb7ac0fdc` |
| `CURRTYPE` | 币种 | `b498bc9a-e5fd-4613-8da8-bdae2a05704a` |
| `DEFDOC` | 自定义档案 | `85efe9e1-3bc2-492e-a92a-f52d3acff25d` |
| `DEPT` | 组织_部门 | `b26fa3cb-4087-4027-a3b6-c83ab2a086a9` |
| `PSNDOC` | 人员基本信息 | `40d39c26-a2b6-4f16-a018-45664cac1a1f` |
| `PSNCL` | 人员类别 | `400f55be-f4cc-4b38-b1e2-aabdc75e2aad` |
| `INOUTBUSICLASS` | 收支项目 | `283d91a4-a8f4-4763-ac44-aae7401fa09a` |
| `CUSTOMER` | 客户基本信息 | `e4f48eaf-5567-4383-a370-a59cb3e8a451` |
| `SUPPLIER` | 供应商基本信息 | `720dcc7c-ff19-48f4-b9c5-b90906682f45` |
| `MATERIAL` | 物料基本信息(多版本) | `c7dc0ccd-8872-4eee-8882-160e8f49dfad` |
| `BANKDOC` | 银行档案 | `bf5aeed4-6b35-4a2e-b750-b9aabce59e21` |
| `BANKACCOUNT` | 银行账户 | `611652ad-177f-4d3e-9ae7-ef8f96930b78` |
| `USER` | 用户 | `f6f9a473-56c0-432f-8bc7-fbf8fde54fee` |

### 组织档案

| 常量 | 说明 | 元数据 ID |
|------|------|-----------|
| `ORG` | 组织 | `985be8a4-3a36-4778-8afe-2d8ed3902659` |
| `GROUP` | 组织_集团 | `3b6dd171-2900-47f3-bfbe-41e4483a2a65` |
| `CORP` | 组织_公司 | `4d514224-de70-44dd-bf70-f14a02f29d10` |
| `FINANCEORG` | 组织_财务组织 | `2cfe13c5-9757-4ae8-9327-f5c2d34bcb46` |
| `FUNDORG` | 组织_资金组织 | `33f0d692-6a40-44a9-a471-7e4105c201b7` |
| `PURCHASEORG` | 组织_采购组织 | `5d69ee35-57d0-4f7b-b454-deff4fc73689` |
| `SALESORG` | 组织_销售组织 | `945f38b6-48ec-43e6-bb09-77ec89a3728f` |
| `STOCKORG` | 组织_库存组织 | `46c4bfba-0b40-4855-87f8-c2ac8647f039` |
| `HRORG` | 组织_人力资源组织 | `f3fed5ea-72f2-4a0a-ad43-d30b1c22c86c` |
| `ADMINORG` | 组织_行政组织 | `a0ec952c-e4e5-416a-b3e0-d402725f76be` |
| `PROFITCENTER` | 利润中心 | `310e1300-0681-4062-9ca7-6276d9833901` |
| `COSTCENTER` | 成本中心 | `de9796b5-bccd-42a1-97dd-808847bfddbd` |

> 完整列表见原始文档。使用 `GeneralAccessorFactory` 时传 `IBDMetaDataIDConst.常量名` 即可。
