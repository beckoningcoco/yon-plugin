---
name: yon-ncc-dev
description: NCC（用友 NC Cloud）客开技能。当用户提到 NCC、NC Cloud、NCC2111、NCC2312、NCC2207、 或 NCC 特有的开发模式（资产包接口开发、业务插件/事件监听器 IBusinessListener、 单据转换 IPfExchangeService、集成规则 pub_interule、对照表 pub_intecontrast、 REST API Resource 继承 AbstractRestResource、华科客开模式、OpenAPI 路由注册等）时， 必须使用此技能。也包括 NCC 数据库问题、NCC 服务器问题等。
---

# NCC（NC Cloud）客开技能

> **本技能引用的文档**都在插件的参考库里，路径形如 `ncc/references/xxx.md`。
> 用 `knowledge_read` 传该路径读全文，或先用 `knowledge_search` 按关键词搜索；
> **不要**按相对路径去猜文件位置——内联的正文里没有路径可解析。


## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**（非旗舰版 BIP）。

> **🔴 强制规则：版本区分**
>
> 用友有两个主要产品线，**表结构、实体名、数据字典完全不同**，绝不能混用：
> - **NCC（NC Cloud）** ← 本技能 `yon-ncc-dev`
> - **旗舰版（BIP / YonBIP）** → 对应技能 `yonyou-bip-dev`（与本技能同级目录）
>
> **收到问题时，第一步必须是判断版本**：
> 1. 用户问题中包含 "NCC" → 用本技能
> 2. 用户问题中包含 "旗舰版" / "BIP" → 查 `../yonyou-bip-dev/`
> 3. 用户问题中版本不明确 → 主动询问是 NCC 还是旗舰版
>
> 违反此规则的后果：给用户提供错误的表名/字段名/VO类名，导致代码编译失败或数据错误。

---

## 子技能

| 子技能 | 目录 | 用途 |
|--------|------|------|
| `ncc-dev` | `ncc-dev/` | NCC 通用开发（VO参考、事件码、单据类型、编码规范、通用API） |
| `ncc-plugin-dev` | `ncc-plugin-dev/` | NCC 业务插件/事件监听器开发（IBusinessListener、doAction） |
| `ncc-background-task` | `ncc-background-task/` | NCC 后台任务/调度任务开发 |

---

## 参考文档

### 资产包接口开发（最重要）

| 文档 | 路径 | 内容 |
|------|------|------|
| 资产包接口开发指南 | `ncc/references/NCC资产包接口开发指南.md` | 框架类、集成规则、代码模板、报销单流程、常见问题 |
| 资产包接口实战流程 | `ncc/references/NCC资产包接口实战开发流程.md` | 完整 9 步开发流程（需求→代码→SQL脚本→API注册→测试） |
| **🆕 集成规则字段速查卡** | `ncc/references/集成规则字段速查卡.md` | **一页纸速查**：14 字段含义、VFIELDTYPE SQL模板、配置策略表（含按名称翻译）、**易漏两条**、常见 docId |
| 集成规则配置参考示例 | `ncc/references/集成规则配置参考示例.json` | 差旅费报销单完整 JSON 配置模板（AI 用，结构化） |
| **🆕 集成规则配置模板（可读版）** | `ncc/references/集成规则配置模板-可读版.md` | **人类审核用**：Markdown表格格式，规则主表+表头+表体+陷阱一览 |
| OpenAPI 开发指南 | `ncc-dev/references/common/openapi-dev.md` | 标准 OpenAPI 注册流程（.rest 文件 + opm_apimanager） |
| FIP 外部接口单模式 | `ncc-dev/references/common/openapi-fip-txbill-pattern.md` | 资产包专用模式（`AbstractRestResource` + `IFipMessageService.sendMessage()`） |
| 集成规则配置方法 | `ncc/references/问题处理/NCC资产包集成规则配置方法.md` | bmf 前缀查询流程、常见配置问题 |
| 集成规则字段截断bug | `ncc/references/问题处理/集成规则参照类型保存报错-字符串截断.md` | 历史问题记录（已合并到开发指南 §11.5） |
| **🆕 补丁后前台看不到菜单** | `ncc/references/问题处理/打上资产包补丁后前台看不到应用菜单.md` | 资产包补丁打上后看不到集成规则/集成日志等节点：权限逐级授权 + 内置菜单 vs 自定义菜单主键 |
| 缓存查询方法模板 | `ncc/references/NCC缓存查询方法模板.md` | 4 种编码→ID 查询方法 + IBDMetaDataIDConst 速查表 |
| **🆕 审核代理 Prompt 模板** | `ncc/references/审核代理-prompt-模板.md` | 步骤4/5 质量审核代理的验证清单和输出格式 |
| **🆕 常见参照 VFIELDTYPE 速查** | `ncc/references/常见参照VFIELDTYPE速查.md` | **VFIELDTYPE 权威源**：40+ 条目按分类组织，优先查此文档再查库 |
| **🆕 OpenAPI 签名机制详解** | `ncc/references/NCC-OpenAPI-签名机制详解.md` | Token 获取、OAEP 加密、加盐签名、API 调用、常见错误速查、完整 Python 代码 |
| **🆕 三方应用配置读取** | `ncc/references/NCC三方应用配置读取.md` | **读外系统配置的权威源**：`pub_thirdsys`/`pub_thirdparam` 表结构、`IThirdSysVOService` 用法、可粘贴工具类、8 条陷阱、实测样本 |
| **🆕 GBK 文件编辑** | `ncc/references/GBK文件编辑.md` | **改 NCC 源码前必读**：源码树是 GBK 而工具链是 UTF-8，直接编辑会静默损坏；三种正确姿势 + `ncc/tools/gbk_edit.py` 用法与 5 条陷阱 |

#### 🧭 读者导航：我想做 X → 看 Y 文档

| 我想... | 看这份文档 |
|---------|-----------|
| 快速理解资产包接口是什么 | [开发指南](./references/NCC资产包接口开发指南.md) §1-§3 |
| 从头做一个新接口（按步骤走） | [实战流程](./references/NCC资产包接口实战开发流程.md)（跟随 9 步） |
| 写集成规则 SQL（pub_interuleitem） | [实战流程](./references/NCC资产包接口实战开发流程.md) §4（先写 JSON）→ §5（生成 SQL）|
| 查某个字段的 VFIELDTYPE 怎么取 | [实战流程](./references/NCC资产包接口实战开发流程.md) §5.3（标准实体/自定义档案/业务VO 三种 SQL 模板） |
| 查集成规则子表字段含义 | [开发指南](./references/NCC资产包接口开发指南.md) §4.3（14 个字段逐个说明） |
| 查 bmf 文件中的表体字段前缀 | [集成规则配置方法](./references/问题处理/NCC资产包集成规则配置方法.md)（4 步查询流程 + grep 命令） |
| 补丁打上了但前台看不到菜单节点 | [补丁后前台看不到应用菜单](./references/问题处理/打上资产包补丁后前台看不到应用菜单.md)（集团管理员 → 超级管理员逐级查） |
| 写 REST Resource 代码 | [开发指南](./references/NCC资产包接口开发指南.md) §6.1（代码骨架） |
| 注册 OpenAPI 路由/授权 | [实战流程](./references/NCC资产包接口实战开发流程.md) §7（opm_apimanager + opm_relateapi） |
| 在代码中做编码→ID 翻译 | [缓存查询方法模板](./references/NCC缓存查询方法模板.md)（4 种方法按场景选用） |
| 读三方应用（外系统）配置 / 取外系统地址 | [三方应用配置读取](./references/NCC三方应用配置读取.md)（表结构 + 工具类 + 陷阱） |
| 排查 transferBill 失败 | [开发指南](./references/NCC资产包接口开发指南.md) §11 + [实战流程](./references/NCC资产包接口实战开发流程.md) §9.3 |
| 配置集成规则报错（vfieldtype 截断） | [开发指南](./references/NCC资产包接口开发指南.md) §11.5（Oracle / 达梦 / PostgreSQL 三版 SQL） |
| 外系统传了字段但 NCC 单据上是空的 | [开发指南](./references/NCC资产包接口开发指南.md) §11.6（transfer 只映射已配置项；验重键必须单独配） |
| 报文里表体数组 key 该叫什么 | [开发指南](./references/NCC资产包接口开发指南.md) §11.6 末段（前缀≠数组 key） |
| **要读/改 NCC 源码文件（中文乱码、搜索搜不到）** | [GBK 文件编辑](./references/GBK文件编辑.md)（`tools/gbk_edit.py --read / --grep / --edits`） |

### 通用参考资料

| 文档 | 路径 | 内容 |
|------|------|------|
| 通用 API 手册 | `ncc-dev/references/common/common-api.md` | 自定义档案、持久化查询、批量操作、服务定位 |
| 编码规范 | `ncc-dev/references/common/coding-standard.md` | 命名、注释、异常处理规范 |
| 事件码表 | `ncc-dev/references/common/event-codes.md` | NCC 业务事件码速查 |
| 单据类型代码 | `ncc-dev/references/common/bill-types.md` | NCC 单据类型代码速查 |
| 模块VO参考 | `ncc-dev/references/common/` | 各模块 VO 与表名对照（so/pu/ic/arap/gl/bd等） |

---

## 开发流程速查

### 资产包接口开发（9步 + 2个审核门）

采用**三步角色工作流**：

```
开发者（我）      →    审核代理（QA）    →    用户（你）
完成任务            独立验证 + 报告        最终拍板
```

```
1. 确认需求（单据类型、接口文档、端点列表）
2. 准备资产包模块
3. 注册三方应用（如需要）
   ───────────────────────────────────────────
4. 生成集成规则配置文件（JSON）
   🚪 审核门 ①：审核代理独立验证 VFIELDTYPE/scope/prefix/字段覆盖
   → 审核报告 + JSON → 用户终审
   ───────────────────────────────────────────
5. 根据 JSON 生成 SQL 脚本（集成规则 + 路由注册 + 授权 + 回滚）
   🚪 审核门 ②：审核代理验证表列存在/主键唯一/SQL方言/回滚完整性
   → 审核报告 + SQL → 用户终审
   ───────────────────────────────────────────
6. 编写 REST Resource 类（继承 BaseResource → AbstractRestResource）
7. 补充路由注册 SQL（如步骤5未包含）
8. 配置对照表（如需要值映射）
9. 测试与调试
```

> **审核代理说明**：
> - 审核代理只在**高风险步骤 4 和 5** 启用（这两个步骤依赖数据库查询，错误率高）
> - 审核代理 Prompt 模板见 `ncc/references/审核代理-prompt-模板.md`
> - 审核代理具有独立数据库访问权限，会重新执行开发者的 SQL 进行交叉验证
> - 审核报告直接提交给用户，⚠️ 警告和 ❌ 错误由用户最终判断

> **强制规则**：任何时候不得直接在数据库执行 INSERT/UPDATE/DELETE/CREATE/ALTER 等变更语句。
> 必须在项目根目录或桌面生成统一 SQL 脚本文件，由用户执行。
> **脚本内必须包含对应的还原/回滚脚本**，每条变更语句都要有对应的逆向操作：
> - INSERT → DELETE（按主键精确删除）
> - UPDATE → 逆向 UPDATE（恢复原值）
> - DELETE → INSERT（恢复被删数据）
> - CREATE TABLE/VIEW → DROP TABLE/VIEW
> - ALTER TABLE ADD → ALTER TABLE DROP
> 还原脚本集中放在文件末尾，按依赖顺序排列（先删子表/外键关联，再删主表）。

## 编码/翻译查询方法

**当需要编写档案翻译、编码→ID 查询等代码时，必须使用 [NCC 缓存查询方法模板](references/NCC缓存查询方法模板.md)**，4 种方法按场景选用。
**旗舰版（BIP/YonBIP）禁止使用此模板。**

| 方法 | 场景 | 代码量 |
|------|------|--------|
| GeneralAccessorFactory | 单条编码→ID | 1 行 |
| CacheVOQuery | 单条编码+组织→ID | ~20 行 |
| Caffeine + 批量 | 高频批量查询 | ~40 行 |
| Guava LoadingCache | 高频单条查询 | ~15 行 |

IBDMetaDataIDConst 元数据 ID 速查表见模板文档。
