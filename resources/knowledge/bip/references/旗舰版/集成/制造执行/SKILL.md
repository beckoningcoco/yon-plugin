---
name: yonbip-c-mes-integration
description: 用于生成 BIP 与第三方 MES 系统集成代码，覆盖 8 个业务场景：完工报告、生产订单、生产订单工序、工作中心、工艺路线、工序、BOM、材料出库。用户提到上述任意场景的推送、同步、集成、对接时触发。
skills: yonbip-c-business-interface-query
triggers:
  - 完工报告
  - 完工报告推送
  - 完工报告同步
  - 生产订单
  - 生产订单推送
  - 生产订单同步
  - 生产订单工序
  - 生产订单工序推送
  - 生产订单工序同步
  - 工作中心
  - 工作中心推送
  - 工作中心同步
  - 工艺路线
  - 工艺路线推送
  - 工艺路线同步
  - 工序
  - 工序推送
  - 工序同步
  - BOM
  - BOM推送
  - BOM同步
  - 材料出库
  - 出库推送
  - 出库同步
  - MES集成
  - MES对接
---

# 规则

- 本 skill 所在目录为 `<skill-base>`，所有 reference 文件从此处解析。
- 严格遵循 BIP MVC 分层架构：Controller → Service → Repository/API，禁止跨层调用。
- 只支持逻辑删除（`dr=1`），禁止物理删除。
- 三方接口地址、字段映射从外部 Excel/需求动态读取，禁止硬编码厂商特定逻辑。
- 必须使用参数化查询，防止 SQL 注入。
- BOM 场景使用 MCP`getEventCenterListener`，其余 7 个场景使用skill `yonbip-c-openapi-integration`查询openapi具体信息。
- 材料出库场景需额外读取 `<skill-base>/reference/outbound_specification.md`。
- 特征字段翻译统一参考 `../_公共规范/char_translation.md`。

# 工作流程

## Step 1：识别业务场景

根据用户请求，匹配下表确定当前场景，获取对应域参数：

| 场景 | 路由标识 | `{Prefix}` | `{prefix}` | `{route}` | 主表特征组 `{featureGroup}` | 子表特征组 | BIP API 路径 `{apiPath}` | 特有规范 |
|------|---------|-----------|-----------|----------|--------------------------|-----------|------------------------|---------|
| 完工报告 | `finish_report` | `FinishReport` | `finishReport` | `/finishreport` | `finishReportDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mom/finishreport/detail` | 无 |
| 生产订单 | `po_order` | `PoOrder` | `poOrder` | `/poorder` | `poOrderDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mom/workorder/detail` | 无 |
| 生产订单工序 | `po_operation` | `PoOperation` | `poOperation` | `/pooperation` | `poOperationDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mom/workorderoperation/detail` | 无 |
| 工作中心 | `work_center` | `WorkCenter` | `workCenter` | `/workcenter` | `workCenterDefineCharacter` | `workCenterDetailsDefineCharacter` | `/iuap-api-gateway/yonbip/mdm/workcenter/detail` | 有子表 |
| 工艺路线 | `routing` | `Routing` | `routing` | `/routing` | `routingDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mdm/routing/detail` | 无 |
| 工序 | `operation` | `Operation` | `operation` | `/operation` | `operationDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mdm/operation/detail` | 无 |
| BOM | `bom` | `Bom` | `bom` | `/bom` | `bomDefineCharacter` | 无 | `/iuap-api-gateway/yonbip/mdm/bom/detail` | 事件监听 |
| 材料出库 | `material_out` | `MaterialOut` | `materialOut` | `/material/out` | `materialOutDefineCharacter` | `materialOutsDefineCharacter` | `/iuap-api-gateway/yonbip/scm/materialout/detail` | outbound_spec |

> 所有场景均为 GET 请求。

## Step 2：读取公共规范，生成代码

读取 `<skill-base>/reference/pub_specification.md`，将 Step 1 确定的域参数替换文件中的占位符，按以下 4 步流程生成代码：

1. **查询 BIP 数据** — 使用 skill `yonbip-c-openapi-integration`（BOM 场景用 MCP `getEventCenterListener`）
2. **字段转换** — BIP 字段映射到第三方格式，从外部 Excel 动态读取
3. **调用三方接口** — 推送数据至外部系统
4. **解析响应并回写状态** — 更新 BIP 中的状态

**材料出库场景**：额外读取 `<skill-base>/reference/outbound_specification.md`，补充退料负数转正数、WMS 字段映射等特有逻辑。

## Step 3：托底策略判断

若无第三方配置或 `fallbackEnabled=true`，读取 `<skill-base>/reference/td_specification.md`，生成托底实现。

## Step 4：检查清单

- [ ] 已确认业务场景并获取正确域参数
- [ ] BOM 场景使用 `getEventCenterListener`，其余使用 `yonbip-c-openapi-integration`技能
- [ ] 材料出库已读取 outbound_specification.md
- [ ] 业务流程仅为"查询 → 字段转换 → 调用三方 → 解析响应"
- [ ] 三方接口地址、字段映射从外部 Excel/需求动态读取
- [ ] 特征字段翻译引用公共基础文档
- [ ] 禁止硬编码任何厂商特定逻辑
- [ ] 托底策略可配置启用/禁用
