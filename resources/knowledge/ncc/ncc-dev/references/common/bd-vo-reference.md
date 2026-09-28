# NCC 基础应用模块（bd/bassapp）VO 与表名对照表

---

## 一、基础档案

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 地址簿 | `bd_address` | `nc.vo.bd.address.AddressVO` |
| 单据类型 | `bd_billtype` | `nc.vo.pub.billtype.BilltypeVO` |
| 国家地区 | `bd_countryzone` | `nc.vo.bd.countryzone.CountryZoneVO` |
| 自定义档案 | `bd_defdoc` | `nc.vo.bd.defdoc.DefdocVO` |
| 数据格式 | `bd_formatdoc` | `nc.vo.bd.format.FormatDocVO` |
| 行业目录 | `bd_industry` | `nc.vo.bd.industry.IndustryVO` |
| 联系人 | `bd_linkman` | `nc.vo.bd.linkman.LinkmanVO` |
| 人员类别 | `bd_psncl` | `nc.vo.bd.psn.PsnClVO` |
| 证件类别 | `bd_psnidtype` | `nc.vo.bd.psnid.PsnIdtypeVO` |
| 行政区划 | `bd_region` | `nc.vo.bd.region.RegionVO` |
| 时区 | `bd_timezone` | `nc.vo.bd.timezone.TimezoneVO` |

### 人员基本信息

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 人员基本信息 | `bd_psndoc` | `nc.vo.bd.psn.PsndocVO` |
| 工作 | 人员工作信息 | `bd_psnjob` | `nc.vo.bd.psn.PsnjobVO` |

### 异常日志

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 异常日志 | `bd_errorlog` | `nc.vo.bd.errorlog.ErrorLogVO` |
| 信息 | 异常信息 | `bd_errormsg` | `nc.vo.bd.errorlog.ErrorMsgVO` |

### 档案唯一性规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 档案配置_档案唯一性规则 | `bd_uniquerule` | `nc.vo.bd.config.BDUniqueruleVO` |
| 属性 | 档案配置_档案唯一性规则属性项 | `bd_uniquerule_item` | `nc.vo.bd.config.BDUniqueruleItemVO` |
| 校验器 | 档案配置_档案唯一性规则校验器工厂 | `bd_urc_validator` | `nc.vo.bd.config.BDUniqueruleValidatorVO` |

### 管控模式

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 全部管控模式 | `bd_mode_all` | `nc.vo.bd.config.BDModeVO` |
| 当前管控模式 | `bd_mode_selected` | `nc.vo.bd.config.BDModeSelectedVO` |

---

## 二、组织管理

### 组织

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 组织 | `org_orgs` | `nc.vo.org.OrgVO` |
| 组织_版本信息 | `org_orgs_v` | `nc.vo.vorg.OrgVersionVO` |
| 组织其它_组织类型 | `org_orgtype` | `nc.vo.org.orgmodel.OrgTypeVO` |
| 组织其它_组织主管 | `org_orgmanager` | `nc.vo.org.OrgManagerVO` |
| 组织_组织数据校验服务 | `org_datavalidator` | `nc.vo.org.orgmodel.OrgDataValidatorVO` |
| 组织其它_用户可管理的集团 | `org_uagroup` | `nc.vo.org.UserAdminGroupVO` |
| 成员组织 | `org_memberorg` | `nc.vo.corg.MemberOrgVO` |

### 组织关系

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 组织关系_组织关系类型 | `org_relationtype` | `nc.vo.org.orgmodel.OrgRelationTypeVO` |
| 组织关系_组织关系类型_业务属性 | `org_associateattr` | `nc.vo.org.orgmodel.AssociateAttrVO` |
| 组织关系_组织关系类型_默认值属性 | `org_associatedef` | `nc.vo.org.orgmodel.AssociateDefVO` |
| 组织关系_组织关系类型_关联实体 | `org_associateent` | `nc.vo.org.orgmodel.AssociateEntityVO` |
| 组织关系_组织关系类型_关系规则 | `org_associaterule` | `nc.vo.org.orgmodel.AssociateRuleVO` |
| 组织关系_组织类型规则 | `org_ot_rule` | `nc.vo.org.orgmodel.OrgTypeRuleVO` |
| 组织关系_组织类型间规则类型 | `org_ot_ruletype` | `nc.vo.org.orgmodel.OrgTypeRuleTypeVO` |
| 组织关系 | `org_relation` | `nc.vo.org.orgmodel.OrgRelationVO` |
| 组织关系_关系业务属性 | `org_relation_attr` | `nc.vo.org.orgmodel.OrgRelationAttrVO` |
| 组织关系_组织关系类型_数据校验 | `org_relvalidator` | `nc.vo.org.orgmodel.OrgRelationValidatorVO` |
| 组织关系_组织关系类型_归属类型 | `org_rtypelefttype` | `nc.vo.org.orgmodel.OrgRelationTypeLeftTypeVO` |
| 组织关系_组织类型业务范围 | `orgtype_busiregion` | `nc.vo.org.orgmodel.OrgTypeBusiRegionVO` |
| 组织关系_操作 | `org_operate` | `nc.vo.org.orgmodel.OperateVO` |

### 业务汇报关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 组织结构_业务汇报关系 | `org_busireportstru` | `nc.vo.corg.BusiReportStruVO` |
| 成员 | 组织结构_业务汇报关系成员 | `org_brsmember` | `nc.vo.corg.BusiReportStruMemberVO` |
| 成员(含编码名称) | 组织结构_业务汇报关系成员含编码名称 | `org_brsmember` | `nc.vo.corg.BusiReportStruMemberWithCodeNameVO` |

---

## 三、人力资源

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 职务 | `om_job` | `nc.vo.org.JobVO` |
| 职务类别 | `om_jobtype` | `nc.vo.org.JobTypeVO` |
| 岗位 | `om_post` | `nc.vo.org.PostVO` |
| 岗位序列 | `om_postseries` | `nc.vo.org.PostSeriesVO` |

---

## 四、用户与权限

### 用户管理

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 用户 | `sm_user` | `nc.vo.sm.UserVO` |
| 用户默认密码 | `sm_user_defaultpwd` | `nc.vo.sm.UserDefaultPasswordVO` |
| 用户用户组 | `sm_user_group` | `nc.vo.uap.rbac.UserAndGroupVO` |
| 用户角色 | `sm_user_role` | `nc.vo.uap.rbac.UserRoleVO` |
| 待处理用户 | `sm_user_toprocessed` | `nc.vo.uap.rbac.UserToBeProcessedVO` |
| 用户组 | `sm_usergroup` | `nc.vo.uap.rbac.UserGroupVO` |
| 用户角色权限显示 | `sm_ur_display` | `nc.vo.uap.rbac.UserRolePermDisplayVO` |
| 用户功能权限查询 | `sm_userpermquery` | `nc.vo.uap.rbac.query.UserPermissionQueryVO` |
| 用户密码重置记录 | `sm_userpwdlog` | `nc.vo.uap.rbac.UserPasswordLogVO` |
| 密码策略 | `sm_pwdsecuritylevel` | `nc.vo.uap.rbac.userpassword.PasswordSecurityLevel` |
| 组织其它_用户主组织 | `sm_user_mainorg` | `nc.vo.org.orgmodel.UserMainOrgVO` |

### 角色管理

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 角色 | `sm_role` | `nc.vo.uap.rbac.role.RoleVO` |
| 角色互斥对象 | `sm_role_exclude` | `nc.vo.uap.rbac.role.RoleExcludeVO` |
| 角色组 | `sm_role_group` | `nc.vo.uap.rbac.role.RoleGroupVO` |
| 可授权角色组 | `uap_AdminRoleGroupDisp` | `nc.vo.uap.rbac.authres.AdminRoleGroupDisplayValueObject` |
| 可授权用户组 | `uap_AdminUserGroupDisp` | `nc.vo.uap.rbac.authres.AdminUserGroupDisplayValueObject` |

### 职责管理

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 职责 | `sm_responsibility` | `nc.vo.uap.rbac.ResponsibilityVO` |
| 职责应用 | `sm_resp_app` | `nc.vo.uap.rbac.RespAppVO` |
| 职责功能 | `sm_resp_func` | `nc.vo.uap.rbac.RespFuncVO` |

### 功能权限

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 功能权限分配实体 | `sm_perm_func` | `nc.vo.uap.rbac.FuncPermConfigVO` |
| 功能权限查询 | `sm_funcperm_query` | `nc.vo.uap.rbac.funcpermquery.FuncPermQueryVO` |
| 功能权限查询结果对象 | `uap_FuncPermQueryResult` | `nc.vo.uap.rbac.query.FuncPermQueryResultVO` |
| 功能权限分配对象 | `sm_power_function` | `nc.vo.uap.rbac.power.FunctionPowerVO` |
| 功能类型 | `sm_func_type` | `nc.vo.uap.rbac.FuncTypeVO` |
| 功能实体 | `sm_funcregister` | `nc.vo.sm.funcreg.FuncRegisterVO` |
| 权限使用场景 | `sm_perm_scenario` | `nc.vo.uap.rbac.PermScenarioVO` |
| 创建者权限明细 | `sm_ctpermdetail` | `nc.vo.uap.rbac.CtPermDetailVO` |
| 引入职责 | `uap_ImportablePostVO` | `nc.vo.corg.ImportablePostVO` |

### 数据权限

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 主表 | 权限资源 | `sm_permission_res` | `nc.vo.uap.rbac.permissionresource.PermissionResourceVO` |
| — | 资源操作 | `sm_res_operation` | `nc.vo.uap.rbac.OperationVO` |
| — | 规则类型 | `sm_rule_type` | `nc.vo.uap.rbac.rule.PermissionRuleTypeVO` |
| — | 数据权限授权对象 | `uap_DataPermission` | `nc.vo.uap.rbac.DataPermissionDisplayObject` |
| — | 权限规则 | `sm_permission_rule` | `nc.vo.uap.rbac.rule.PermissionRuleVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 数据权限分配实体 | `sm_perm_data` | `nc.vo.uap.rbac.DataPermConfigVO` |
| 数据权限分表记录 | `sm_dpprofile_reg` | `nc.vo.uap.rbac.DataPermProfileRegVO` |
| 授权实体主组织 | `sm_subject_org` | `nc.vo.uap.rbac.SubjectOrgVO` |
| 权限规则 | `sm_rule` | `nc.vo.uap.rbac.rule.RbacRuleVO` |
| 元数据规则 | `sm_metadata_rule` | `nc.vo.uap.rbac.rule.MetaDataRuleVO` |
| 特殊权限配置 | `sm_specialpermission` | `nc.vo.uap.rbac.specialpermission.SpecialPermissionVO` |
| 系统函数数据权限重算 | `sm_sysfunc_rbac` | `nc.vo.uap.rbac.rule.SysFuncRBACVO` |
| 系统函数规则 | `sm_sysfunc_rule` | `nc.vo.uap.rbac.rule.SysFuncRuleVO` |

### 业务活动权限

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务活动权限 | `sm_busiactive_perm` | `nc.vo.uap.rbac.busiactive.BusiActivePermVO` |
| NCC业务活动权限 | `sm_busiactive_permncc` | `nc.vo.uap.rbac.busiactive.NCCBusiActivePermVO` |

### 关键功能

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 关键数据 | `sm_keydata` | `nc.vo.uap.rbac.keyfuncdata.KeyDataVO` |
| 关键功能 | `sm_keyfunc` | `nc.vo.uap.rbac.keyfuncdata.KeyFuncVO` |
| 关键功能NCC | `sm_ncckeyfunc` | `nc.vo.uap.rbac.keyfuncdata.NCCKeyFuncVO` |

### 业务功能项

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务功能项 | `uap_busifuncitem` | `nc.vo.uap.rbac.BusiFuncItemVO` |
| 引入数据实体 | `uap_importentity` | `nc.vo.corg.ImportableVO` |

### 角色权限变更申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 角色权限变更申请单 | — | `nc.vo.uap.rbac.pf.AggRolePermissionPFVO` |
| 表头 | 角色权限变更申请单 | `sm_roleperm_pf` | `nc.vo.uap.rbac.pf.RolePermissionPFVO` |
| 组织 | 角色权限变更申请单组织子表 | `sm_rporgsub_pf` | `nc.vo.uap.rbac.pf.RolePermOrgSubPFVO` |
| 职责 | 角色权限变更申请单职责子表 | `sm_rpsub_resppf` | `nc.vo.uap.rbac.pf.RolePermRespSubPFVO` |

### 用户权限申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 用户权限申请单 | — | `nc.vo.uap.rbac.pf.AggUserPermissionPFVO` |
| 表头 | 用户权限申请单 | `sm_userperm_pf` | `nc.vo.uap.rbac.pf.UserPermissionPFVO` |
| 组织 | 用户权限申请-组织申请 | `sm_uppf_orgsub` | `nc.vo.uap.rbac.pf.UserOrgPermissionSubPFVO` |
| 职责 | 用户权限申请-职责申请 | `sm_uppf_respsub` | `nc.vo.uap.rbac.pf.UserRespPermissionSubPFVO` |
| 角色 | 用户权限申-角色申请 | `sm_uppf_rolesub` | `nc.vo.uap.rbac.pf.UserRolePermissionSubPFVO` |

---

## 五、参数设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 参数修改申请单主表 | `uap_VBillParam` | `nc.vo.uap.paramsys.VBillParamVO` |
| 子表 | 参数修改申请单子表 | `uap_vParaminfo` | `nc.vo.uap.paramsys.VParaminfoVO` |
| 聚合 | 参数修改申请单 | — | `nc.vo.uap.paramsys.AggVBillParamVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 参数设置 | `pub_sysinit` | `nc.vo.pub.para.SysInitVO` |
| 参数模板设置 | `pub_sysinittemp` | `nc.vo.pub.paratemp.SysinittempVO` |

---

## 六、编码规则

### 49. 编码规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 编码规则 | — | `nc.pub.billcode.vo.BillCodeRuleVO` |
| 表头 | 编码规则基本信息 | `pub_bcr_rulebase` | `nc.pub.billcode.vo.BillCodeBaseVO` |
| 元素 | 编码规则元素 | `pub_bcr_elem` | `nc.pub.billcode.vo.BillCodeElemVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 编码映射 | `pub_bcr_entity` | `nc.pub.billcode.vo.CodeEntityVO` |
| 编码对象 | `pub_bcr_nbcr` | `nc.pub.billcode.vo.NeedBCRVO` |

---

## 七、消息管理

### 通讯薄组

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 通讯薄组 | — | `nc.message.addressbook.vo.AggVOAddrGroup` |
| 表头 | 通讯薄组信息表 | `pub_addr_group` | `nc.message.addressbook.vo.VOAddrGroup` |
| 明细 | 通讯薄组明细表 | `pub_addr_gpdetail` | `nc.message.addressbook.vo.VOAddrGpDetail` |

### 通讯薄规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 通讯薄规则 | — | `nc.message.addressbook.vo.AggVOAddrRule` |
| 表头 | 通讯薄规则表 | `pub_addr_rule` | `nc.message.addressbook.vo.VOAddrRule` |
| 参数 | 规则参数表 | `pub_addr_rulepar` | `nc.message.addressbook.vo.VOAddrRulePar` |

### 消息相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 预警消息 | `pub_alertmessage` | `nc.vo.pub.pa.AlertmessageVO` |
| 消息标签定义 | `pub_msglabeldef` | `nc.message.vo.MessageLabelDefVO` |
| 消息源接收人配置 | `pub_msgres_rcvconf` | `nc.buzimsg.vo.MsgresRcvConfVO` |
| 接收人存储表 | `pub_msgres_rcv` | `nc.buzimsg.vo.MsgresRcvVO` |
| 消息源类型注册 | `pub_msgres_reg` | `nc.buzimsg.vo.MsgresRegVO` |
| 自定义接收人 | `pub_msgres_sfdfrcv` | `nc.buzimsg.vo.SelfDefReceiverVO` |
| 消息源消息模板配置 | `pub_msgres_tmpconf` | `nc.buzimsg.vo.MsgresTempConfVO` |
| 消息模板 | `pub_msgtemp` | `nc.message.templet.vo.MsgtempletVO` |
| 消息模板分类 | `pub_msgtemp_type` | `nc.message.templet.vo.MsgtmptypeVO` |
| 消息模板自定义函数 | `pub_msgtemp_var` | `nc.message.templet.vo.MsgtempvarVO` |
| 消息附件 | `sm_msg_attachment` | `nc.message.vo.AttachmentVO` |
| 消息发送实体 | `sm_msg_content` | `nc.message.vo.MessageVO` |
| 消息实体属性 | `sm_msg_property` | `nc.message.vo.MessagePropertyVO` |
| 消息附件设置 | `msg_attachmentsetting` | `nc.buzimsg.vo.MsgAttachmentSettingVO` |

---

## 八、预警

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 预警条目与后台任务 | `pub_alertregistry` | `nc.vo.pub.pa.AlertregistryVO` |
| 预警监控与后台任务监控 | `pub_alertruntime` | `nc.bs.pub.taskcenter.AlertRuntimeInfo` |
| 预警类型 | `pub_alerttype` | `nc.vo.pub.pa.AlerttypeVO` |
| 预警日志与后台任务日志 | `pub_workingtasklog` | `nc.bs.pub.taskcenter.WorkingLogVO` |

---

## 九、业务事件

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务插件实体 | `pub_eventlistener` | `nc.vo.uap.businessevent.EventListenerVO` |
| 事件类型 | `pub_eventtype` | `nc.vo.uap.businessevent.EventTypeVO` |

---

## 十、功能注册

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 模块信息 | `dap_dapsystem` | `nc.vo.sm.funcreg.ModuleVO` |
| 业务活动按钮关联实体 | `sm_busiactive_btn` | `nc.vo.sm.funcreg.BusiActiveRelationVO` |
| 业务活动实体 | `sm_busiactivereg` | `nc.vo.sm.funcreg.BusiActiveVO` |
| 按钮注册实体 | `sm_butnregister` | `nc.vo.sm.funcreg.ButtonRegVO` |
| 菜单项实体 | `sm_menuitemreg` | `nc.vo.sm.funcreg.MenuItemVO` |
| 菜单注册实体 | `sm_menuregister` | `nc.vo.sm.funcreg.MenuRegisterVO` |
| 页签实体 | `sm_pageregister` | `nc.vo.sm.funcreg.PageVO` |
| 参数实体 | `sm_paramregister` | `nc.vo.sm.funcreg.ParamRegVO` |
| 可管理资源 | `sm_admin_resource` | `nc.vo.uap.rbac.authres.AdminResourceVO` |
| 查询模板系统函数 | `pub_query_sysfunc` | `nc.vo.querytemplate.sysfunc.SysFuncVO` |
| 快捷键注册实体 | `pub_hotkeyregister` | `nc.vo.pub.hotkey.HotkeyRegisterVO` |

---

## 十一、元数据

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 实体 | `md_class` | `nc.md.model.impl.BusinessEntity` |
| 实体属性 | `md_property` | `nc.md.persist.designer.vo.PropertyVO` |

---

## 十二、日志

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务日志 | `sm_busilog_default` | `nc.bs.busilog.vo.BusinessLogVO` |
| 业务日志配置规则 | `sm_log_busilogrule` | `nc.bs.sm.busilog.BusiLogRuleVO` |
| 日志配置 | `sm_log_mode` | `nc.bs.sm.logconfig.LogModeVO` |
| 上机日志 | `sm_log_operatelog` | `nc.bs.sm.operatelog.vo.OperateLogVO` |
| 上机日志配置规则 | `sm_log_operatelogrule` | `nc.bs.sm.logconfig.vo.OperatelogRuleVO` |
| 日志操作 | `sm_log_operation` | `nc.bs.sm.logoperation.vo.LogOperationVO` |
| 卸出记录 | `sm_log_unloading` | `nc.bs.sm.unloadinglog.vo.UnloadingLogVO` |

---

## 十三、基本档案变动

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应用权限变更记录 | `sm_apppermchange_rec` | `nccloud.vo.baseapp.apprbac.apppermchange.AppPermChangeRecordVO` |
| 基本档案变动注册表 | `sm_bdchange_reg` | `nc.vo.uap.rbac.bdchange.BDChangeRegVO` |
| 基本档案变动系统函数注册表 | `sm_bdchangesysfunc_reg` | `nc.vo.uap.rbac.bdchange.BDChangeSysFuncRegVO` |
