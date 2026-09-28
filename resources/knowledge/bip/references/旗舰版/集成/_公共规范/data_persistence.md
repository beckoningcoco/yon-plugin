# BIP 数据持久化规范

> 本文档为 BIP 旗舰版数据持久化操作的速查规范。详细 API 文档见 `../后端开发/`。

---

## ✅ 使用的方式

| 操作类型 | 接口 | 说明 | 详细文档 |
|---------|------|------|---------|
| **查询操作** | `IBillQueryRepository` | 查询 BIP 单据/档案数据，支持 findById、queryBySchema 等 | [IBillQueryRepository.md](../后端开发/IBillQueryRepository.md) |
| **单据增删改** | `IBillRepository` | 本领域单据的增删改操作 | [IBillRepository.md](../后端开发/IBillRepository.md) |
| **原生 SQL 查询/更新** | `IYmsJdbcApi` | 执行 SQL 查询（queryForList）、更新（update）、批量更新（batchUpdate） | [IYmsJdbcApi.md](../后端开发/IYmsJdbcApi.md) |
| **跨系统调用** | BIP OpenAPI | 调用 BIP 开放平台接口进行数据操作 | [OpenAPI.md](../后端开发/OpenAPI.md) |

---

## ❌ 不使用的方式

- **MyBatis Mapper**：不创建 Mapper 接口和 XML 文件
- **JdbcTemplate**：不使用 Spring JdbcTemplate
- **直接 JDBC**：不使用 DriverManager.getConnection()

---

## 查询决策树

```
需要查询数据？
  ├── 查询 BIP 单据/档案（单条） → IBillQueryRepository.findById(fullName, id)
  ├── 查询 BIP 单据/档案（条件） → IBillQueryRepository.queryBySchema(schema)
  ├── 查询任意表（原生 SQL）     → IYmsJdbcApi.queryForList(sql, param, processor)
  └── 跨系统获取数据             → OpenAPI 调用
```

---

## 写操作决策树

```
需要写入/更新数据？
  ├── 本领域单据增删改 → IBillRepository (insert/update/delete)
  ├── 跨域表增删改     → IYmsJdbcApi.update(sql, param)
  └── 跨系统写入       → OpenAPI 调用
```

---

## 关键原则

1. **表名/字段名必须来自元数据查询**：从 BIP 元数据管理页面获取，禁止臆想
2. **所有 SQL 使用参数化查询**：使用 `SQLParameter`，禁止字符串拼接
3. **优先使用批量操作**：避免循环逐条处理
4. **租户隔离**：SQL 查询必须带 `ytenant_id` 条件，使用 `InvocationInfoProxy.getTenantid()`

---

## 相关文档

- MVC 分层架构：[mvc_architecture.md](mvc_architecture.md)
- 特征字段翻译：[char_translation.md](char_translation.md)
