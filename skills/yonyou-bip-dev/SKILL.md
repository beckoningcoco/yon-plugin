---
name: yonyou-bip-dev
description: 用友 BIP 旗舰版客开技能（YonBIP / 旗舰版 / BIP）。 触发场景：BIP 平台开发、SuperDO/BPO 实体扩展、YMS 异步任务、 单据模板/元数据/字段名查询、OpenAPI、MDF 前端扩展、 旗舰版数据库问题、旗舰版环境配置、Arthas 诊断。 注意：NCC / NC Cloud 产品线请使用 yon-ncc-dev 技能，勿混用。
---

# 用友 BIP 客开技能

> **本技能引用的文档**都在插件的参考库里，路径形如 `bip/references/xxx.md`。
> 用 `knowledge_read` 传该路径读全文，或先用 `knowledge_search` 按关键词搜索；
> **不要**按相对路径去猜文件位置——内联的正文里没有路径可解析。


## 版本定位

本技能服务于 **用友旗舰版（BIP / YonBIP）**。

> **🔴 强制规则：版本路由**
>
> 用友有两个主要产品线，**表结构、实体名、数据字典完全不同**，绝不能混用：
> - **旗舰版（BIP / YonBIP）** ← 本技能 `yonyou-bip-dev`
> - **NCC（NC Cloud）** → 对应技能 `yon-ncc-dev`（与本技能同级目录）
>
> **收到问题时，第一步必须是判断版本**：
> 1. 用户问题中包含 "NCC" → 查 `yon-ncc-dev` 技能，不要用本技能的参考资料
> 2. 用户问题中包含 "旗舰版" / "BIP" → 用本技能
> 3. 用户问题中版本不明确 → 主动询问是 NCC 还是旗舰版
>
> **查表名/字段名/数据字典时尤其容易犯错**，因为两个产品线可能有同名的业务概念（如"坏账损失"），但底层表完全不同。
>
> ⚠️ **NCC 的 `GeneralAccessorFactory`、`CacheVOQuery`、`Caffeine`/`Guava` 缓存查询模板（`../yon-ncc-dev/references/NCC缓存查询方法模板.md`）禁止在旗舰版使用。** 旗舰版有自己的查询 API，两者完全不兼容。
>
> 违反此规则的后果：给用户提供错误的表名/字段名，导致 SQL 执行失败或数据错误。**这是不可接受的**。

## 必看条目，每次请认真阅读并理解以下文档中的内容。

参考文档

`skill约束.md`
`数据库查询约束.md`
`project-config.md`（项目列表索引；环境详情请从 Yon 面板的「项目」与「数据源」读取）

> **环境信息查询**：涉及项目环境地址、数据库连接、VPN、服务器、账号密码等，**直接查 Yon 面板**——`datasource_list` 会列出已登记的数据源、类型、地址与登录名，不要再读本地文件。

### 模板配置缺失检查

> **强制规则**：以下文件由用户从 `.template` 复制后填写，仓库只提供模板。**AI 必须在每次对话开始时检查这些文件是否存在，如果缺失则主动提醒用户创建，不要静默跳过。**

| 模板文件 | 目标文件 | 说明 |
|----------|----------|------|
| `bip_home_path.json.template` | `bip_home_path.json` | 本机 BIP home 路径和版本 |
| `../path_config.json.template` | `../path_config.json` | 集中路径配置（用户目录、NCC/BIP Home、知识库、Chrome 调试等），仓库根目录 |
| `../yon-ncc-dev/ncc_home_path.json.template` | `../yon-ncc-dev/ncc_home_path.json` | 本机 NCC home 路径和版本 |

检查时机：收到用户第一条消息后，在查找资料之前执行。如果目标文件不存在：
1. 告知用户缺少哪个配置文件
2. 说明用途
3. 询问是否现在创建（从 template 复制后让用户填写）

在回答用户提出的问题时，需要标注问题的类型

- 问题处理类 
  - 对于问题处理类问题，如果检索参考文档后发现已存在相关或者相近的文档资料，请标注是哪个项目上，版本是多少，什么环境发生了类似的问题。
  - 在回答问题前，请先梳理排查思路
  - 最后回答用户的问题
- 便捷帮助类
- 其他



如果用户提出的问题，经过判断是 问题处理类，但是并没有在skill中找到相关的资料，那么需要询问用户是否将当前问题记录到本地作为参考资料

当用户同意或允许时，请参考

`问题记录规范.md`将问题记录到本地 references目录下！



如果用户主动提出，想记录一个问题，或者登记一个问题等等，也请参照 `问题记录规范.md`

## 参考资料查找方式（自动扫描，无需手写索引）

> **重要**：查找参考资料时，**直接扫描对应目录**，根据文件名匹配用户问题，不要依赖手写索引文件。
> 文件名均为中文、描述性强，AI 可直接匹配。

| 问题类型 | 扫描目录 | 说明 |
|----------|----------|------|
| 便捷帮助类（SQL/API/脚本/模板等） | `bip/references/旗舰版/` | `ls` 列出文件名 → 按关键词匹配 → 读取匹配的文档 |
| 后端开发（Service/规则/插件/调度/事件） | `bip/references/旗舰版/后端开发/` | 体系化后端规范（IBillQueryRepository、DispatchTask、BIPEventSubscribe 等） |
| 前端扩展（MDF/ViewModel/页面脚本） | `bip/references/旗舰版/前端扩展/` | MDF 开发框架（架构/模型/事件/模式）+ `bip/references/旗舰版/` 下代码片段 |
| 第三方系统集成（WMS/LIMS/MES/SRM…） | `bip/references/旗舰版/集成/` | 按业务域子目录匹配（应收应付、总账、仓储、税务等 13 个域） |
| 报表 SQL 生成（台账/日报/月报） | `bip/references/旗舰版/报表SQL/` | 四阶段报表 SQL 生成流程（需求分析→字段分析→SQL构建→校验交付）；`05-经验-组织树与子级数量统计.md` 是「组织树 + 统计子级组织数量」类报表的可复用手册（含报表平台参数/筛选器配置） |
| 公式配置（YonBuilder/UI模板） | `bip/references/旗舰版/公式/` | 公式函数参考 + 36 个业务场景示例 |
| SQL 模板 | `bip/references/SQL/` | 每条 SQL 独立一个文件，扫描匹配 |
| 问题处理类（报错/异常/故障） | `bip/references/问题处理/` | `ls` 列出文件名 → 按报错关键词匹配 → 读取匹配的文档 |
| 项目配置（环境/账号/数据库等） | Yon 面板的「项目」与「数据源」 | 每个项目独立一条记录 |
| 已归档旧文档（被新版替换） | `bip/references/旗舰版/_archive/` | 旧版参考，新版在对应子目录中 |


## 接收到用户的提问，处理流程

**第一步：判断是否属于本技能范围**

| 用户问题 | 处理 |
|----------|------|
| 涉及 BIP / 旗舰版 / YonBIP / 用友框架 | → 用本技能，继续第二步 |
| 涉及 NCC / NC Cloud | → 切换到 `yon-ncc-dev` 技能 |
| 代码/数据库/服务器等后端问题，但未指定产品 | → 视为旗舰版开发问题，用本技能 |
| 明显非用友产品问题 | → 自行作答，无需参考 skill 文档 |

**第二步：按问题类型分发**

| 问题类型 | 典型关键词 | 扫描目录 |
|----------|-----------|----------|
| 报错排查 | 报错、异常、报异常、不生效、崩溃 | `bip/references/问题处理/` |
| 便捷协助 | 生成SQL、写个脚本、模板代码、阿尔萨斯命令 | `bip/references/旗舰版/` |
| 环境/配置/账号 | 环境地址、数据库连接、账号密码、VPN | Yon 面板的「数据源」 |
| 后端开发规范 | Service、规则、插件、调度、事件、IBillQuery | `bip/references/旗舰版/后端开发/` |
| 前端扩展 | MDF、ViewModel、页面脚本、字段联动 | `bip/references/旗舰版/前端扩展/` |
| 第三方集成 | WMS、LIMS、MES、SRM、接口对接 | `bip/references/旗舰版/集成/` |
| 报表SQL | 台账、日报、月报、报表SQL | `bip/references/旗舰版/报表SQL/` |
| 组织树报表 | 组织树、子级组织、上卷、父组织汇总、语义模型、筛选器、参数绑定 | `bip/references/旗舰版/报表SQL/05-经验-组织树与子级数量统计.md` |
| 直联/银企报表 | 直联、直连、银企通道、不可直连、未直连成功、直连率、财务公司账户 | `bip/references/旗舰版/报表SQL/06-金隅-账户直联情况统计表-字段核查.md` |
| 公式配置 | 公式、YonBuilder、计算公式 | `bip/references/旗舰版/公式/` |

## 源码索引配置

旗舰版 home 目录的源码索引由以下文件管理：

| 文件 | 作用 |
|------|------|
| `bip_home_path.json` | 本机 BIP home 路径 + 默认版本 |
| `class_index_<version>.json` | 每个版本独立的类名→jar 索引 |

**`bip_home_path.json` 结构**：

```json
{
  "default_version": "V5",
  "versions": {
    "V5": {
      "path": "E:/download2",
      "description": "BIP 旗舰版 V5",
      "index_file": "class_index_BIP_V5.json",
      "indexed": true
    }
  }
}
```

> **关于 `bip_home_path.json` 的生成**：该文件记录的是本机 BIP home 路径，每台机器不同，因此被 `.gitignore` 排除，不会入库。仓库中提供了 `bip_home_path.json.template`（空模板）作为格式参考。**首次运行 `build_index.py` 时会自动创建该文件**，后续再跑其他版本会追加到已有配置中，无需手动编辑。

## 工具脚本

| 脚本 | 路径 | 用途 |
|------|------|------|
| 数据源健康检查 | `datasource_list` 工具 | 列出已登记的数据源（类型/地址/登录名）与项目绑定情况 |
| OpenAPI 开发 | `bip/references/旗舰版/旗舰版OpenAPI开发指南.md` | BIP 旗舰版 OpenAPI 服务端开发（Controller → YMS 注册 → 发布 → 授权） |
| OpenAPI 调用(客户端) | `bip/references/旗舰版/旗舰版调用OpenAPI.md` | Java 后端调用 BIP OpenAPI（Token、签名、GET/POST） |
| OpenAPI SDK 调用 | `bip/references/旗舰版/openapi-sdk调用api的使用示例.md` | 独立 Maven 工程通过 SDK jar 调用 BIP OpenAPI |
| Arthas 命令工具 | `bip/scripts/arthas_exec.py` | 通过 Tunnel Server HTTP API 执行 Arthas 命令，自动格式化输出，避免手拼 JSON |
| MDF 前端代码模板 | `bip/assets/mdf/` | 9 个 JS 模板（字段联动/参照过滤/校验/弹窗等） |
| Java 后端代码模板 | `bip/assets/java/` | 费用报销集成等场景的 Controller/Service/Factory 模板 |
| 后端开发总览 | `bip/references/旗舰版/后端开发/后端开发总览.md` | server-codegen 完整后端开发指南（含 GUIDE.md） |
| 前端开发总览 | `bip/references/旗舰版/前端扩展/`（api-index.md、mobile-api.md 等） | MDF 三层架构前端开发框架 |
| 集成开发公共规范 | `bip/references/旗舰版/集成/_公共规范/` | MVC 架构、数据持久化、特征字段翻译速查 |

## 健康检查触发

> 当用户说"检查下技能"、"健康检查"、"跑一下健康检查"、"帮我看看配置有没有问题"等类似表达时，直接调用 `datasource_list`，检查已登记的数据源与项目绑定情况，并提示缺失项。

## 字段术语与实体 URI

> **触发条件**：当用户提到"字段名"、"数据库列"、"XX有哪些字段"、"XX子表"等涉及 BIP 实体结构的问题时，参考以下术语对照与实体 URI。

### 字段术语对照

> **核心约定**：BIP 元数据中同一个字段有多个标识，用户使用的术语对应关系如下：

| 用户术语 | 元数据字段 | 含义 | 示例 |
|----------|-----------|------|------|
| **字段编码** | `name` | Java 类中的驼峰属性名，代码中 `do.getXxx()` / `do.setXxx()` 用的名 | `bankId` |
| 字段名 / 数据库列 | `fieldName` / `columnName` | 数据库表列名（snake_case） | `bank_id` |
| 显示名 | `displayName` | 界面上显示的中文名称 | 银行网点 |
| 字段URI | `uri` | 元数据中字段的完整标识 | `eaai.eventvoucher.EventVoucherDetailsDO.bankId` |
| 类型URI | `typeUri` | 引用类型字段指向的实体 URI | `bd.bank.BankDotVO` |

> ⚠️ **`fieldName` 和 `name` 在简单字段上经常相同（都是 snake_case），但在引用字段上不同：`fieldName`=数据库列名（如 `bank_id`），`name`=Java 驼峰名（如 `bankId`）。**

### 已知实体 URI 速查（销售订单体系）

| 实体 | URI |
|------|-----|
| 销售订单主表 | `voucher.order.Order` |
| 订单明细 | `voucher.order.OrderDetail` |
| 订单明细组 | `voucher.order.OrderDetailGroup` |
| 订单状态 | `voucher.order.OrderStatus` |
| 订单支付状态 | `voucher.order.OrderPaymentStatus` |
| 支付核验 | `voucher.order.PaymentVerification` |
| 收款计划 | `voucher.order.PaymentSchedules` |
| 收款执行明细 | `voucher.order.PaymentExeDetail` |
| 订单多价格 | `voucher.order.OrderPrice` |
| 返利汇总 | `voucher.order.RebateSum` |
| 返利明细 | `voucher.order.RebateDetail` |
| 返利记录 | `voucher.order.RebateRecord` |
| 产品返利记录 | `voucher.order.ProductRebateRecord` |
| 签署主体 | `voucher.order.SignSubject` |
| 附件 | `voucher.order.OrderAttachment` |
| 当前审批人 | `voucher.order.IBpmCurrentAuditorOrder` |
| 业务阶段 | `voucher.order.OrderIBpmStep` |
| 线索参与人 | `voucher.order.ClueParticipant` |
| 头自定义项 | `voucher.order.OrderDefine` |
| 头自由定义 | `voucher.order.OrderFreeDefine` |




## 接口测试

- 参考 `bip/references/旗舰版/Arthas-API测试实战流程.md`