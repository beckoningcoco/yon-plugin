# BIP MVC 分层架构规范

> 本文档为 BIP 旗舰版后端开发的标准架构规范，所有业务域集成技能均需遵循。

---

## 分层架构

```
┌─────────────────────────────────────┐
│      Controller 层                   │  ← 接收 HTTP 请求
├─────────────────────────────────────┤
│      Service 层                     │  ← 业务逻辑处理 + 事务管理
├─────────────────────────────────────┤
│   Repository / API 层               │  ← 数据访问/外部调用
├─────────────────────────────────────┤
│      Model 层                       │  ← VO/DTO/Entity
└─────────────────────────────────────┘
```

**调用链**：`Controller → Service → Repository/API → Database/External System`

---

## 各层职责

| 层 | 职责 | 示例 |
|----|------|------|
| Controller | 接收 HTTP 请求，参数校验，调用 Service | `XxxController.java` |
| Service | 业务逻辑处理，事务管理，编排多个 Repository/API 调用 | `XxxServiceImpl.java` |
| Repository/API | 数据持久化（IBillQueryRepository/IBillRepository）或跨系统调用（OpenAPI） | 注入接口调用 |
| Model | 数据载体 | VO/DTO/Entity |

---

## 禁止行为

- ❌ Controller 直接调用 Repository
- ❌ 跨层调用
- ❌ 在 Controller 中编写业务逻辑
- ❌ 在 Repository 层管理事务

---

## 相关文档

- 数据持久化规范：[data_persistence.md](data_persistence.md)
- 后端开发参考：`../后端开发/`（IBillQueryRepository、IBillRepository、IYmsJdbcApi 等详细文档）
- 特征字段翻译：[char_translation.md](char_translation.md)
