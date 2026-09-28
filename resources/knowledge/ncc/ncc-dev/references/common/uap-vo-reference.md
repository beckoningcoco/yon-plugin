# NCC 统一应用平台模块（uap）VO 与表名对照表

---

## 一、业务流程

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务流程 | `bd_busitype` | `nc.vo.pf.pub.BusitypeVO` |

## 二、自定义档案

### 自定义档案列表

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 自定义档案列表 | `bd_defdoclist` | `nc.vo.bd.defdoc.DefdoclistVO` |

### 用户定义属性

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 用户定义属性组 | `bd_userdefrule` | `nc.vo.bd.userdefrule.UserdefruleVO` |
| 表头 | 用户定义属性 | `bd_userdefitem` | `nc.vo.bd.userdefrule.UserdefitemVO` |
| 表头 | 用户定义属性组引用 | `bd_userdefruleref` | `nc.vo.bd.userdefrule.UserdefrulerefVO` |

## 三、组织版本信息

### 公司版本信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 公司版本信息 | `org_corp_v` | `nc.vo.vorg.CorpVersionVO` |

### 部门结构版本信息

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 部门结构版本信息 | `org_deptstru_v` | `nc.vo.vorg.DeptStruVersionVO` |
| 表头 | 部门结构成员版本信息 | `org_deptstrumem_v` | `nc.vo.vorg.DeptStruMemberVersionVO` |

## 四、组织_业务单元

### 库存组织

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 库存组织 | `org_stockorg` | `nc.vo.org.StockOrgVO` |
| 表头 | 库存组织版本信息 | `org_stockorg_v` | `nc.vo.vorg.StockOrgVersionVO` |

### 物流组织

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 物流组织 | `org_trafficorg` | `nc.vo.org.TrafficOrgVO` |
| 表头 | 物流组织版本信息 | `org_trafficorg_v` | `nc.vo.vorg.TrafficOrgVersionVO` |

## 五、应用导航

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应用导航表 | `pub_app_navigation` | `nc.itf.rbac.datapermoputil.PubAppNavigationVO` |

## 六、数据模板

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 数据模板 | `pub_datatemplet` | `nc.vo.pub.datatemplet.DataTempletVO` |

## 七、消息模板

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 消息模板 | `pub_messagetemplate` | `nc.bs.pub.messageTemplate.vo.MessageTemplateVO` |
| 表体 | 消息模板子项 | `pub_messagetemplate_b` | `nc.bs.pub.messageTemplate.vo.MessageTemplateBVO` |

## 八、语种信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 语种信息 | `pub_multilang` | `nc.vo.ml.LanguageVO` |

## 九、输出模板

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 输出模板 | `pub_print_template` | `nc.vo.pub.print.PrintTemplateVO` |

## 十、资源个性化

### 资源类型

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 资源类型 | `pub_psn_resource` | `nc.vo.pub.personalization.ResourceVO` |
| 表头 | 资源类型和层次类型的对照关系 | `pub_psn_matrix` | `nc.vo.pub.personalization.PersonalizationMatrixVO` |

### 个性化配置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 个性化配置 | `pub_psn_reg` | `nc.vo.pub.personalization.PersonalizationSetDataVO` |

## 十一、业务导航与流程

### 业务导航树

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务导航树表 | `sm_busi_navigation` | `nc.vo.sm.flowdesktop.BusiNavigationVO` |

### 流程导航

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 流程导航 | `sm_busiworkflow` | `nc.vo.sm.flowdesktop.BusiFlowVO` |
| 表体 | 业务流程图元 | `sm_busiworkflow_cell` | `nc.vo.sm.flowdesktop.BusiFlowCellVO` |

## 十二、数据权限

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 数据权限查询 | `sm_datapermquery` | `nc.vo.uap.rbac.query.DataPermissionQueryVO` |

## 十三、文档管理

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 文档分类表 | `sm_document_category` | `nc.document.pub.vo.FileCategoryVO` |
| 表头 | 文档信息表 | `sm_document_file` | `nc.document.pub.vo.NCFileVO` |
| 表体 | 文档版本 | `sm_document_version` | `nc.document.pub.vo.FileVersionVO` |

## 十四、个性化

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 个性化属性 | `sm_individual_property` | `nc.individuation.vo.IndividualPropertyVO` |
| 个性化注册 | `sm_individual_register` | `nc.individuation.register.vo.IndividualRegisterVO` |

## 十五、规则引用

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 规则引用档案 | `sm_rule_ref` | `nc.vo.uap.rbac.rule.RuleRefDocVO` |

## 十六、税种

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 税种 | `txm_taxkind` | `nc.vo.txm.taxpub.TaxKindVO` |

---

## 统计

| 分类 | 数量 |
|------|------|
| 业务流程 | 1 |
| 自定义档案 | 4 |
| 组织版本信息 | 3 |
| 组织_业务单元 | 4 |
| 应用导航 | 1 |
| 数据模板 | 1 |
| 消息模板 | 2 |
| 语种信息 | 1 |
| 输出模板 | 1 |
| 资源个性化 | 3 |
| 业务导航与流程 | 3 |
| 数据权限 | 1 |
| 文档管理 | 3 |
| 个性化 | 2 |
| 规则引用 | 1 |
| 税种 | 1 |
| **合计** | **32** |
