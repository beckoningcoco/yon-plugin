# BIP 旗舰版 · 业务约定：常用实体 URI

> ⚠️ **这不是从命名推导出来的，是约定。** 写 SQL、调接口、建参照、查元数据时，提到下面这些业务概念，
> **直接用表里的 URI** —— 不要自己按命名规则拼，也不要每次去 `search` 撞运气。
>
> 使用者约定，2026-10-12 起累积。

| 业务概念 | 实体 URI | 物理表 | schema | 备注 |
|---|---|---|---|---|
| **业务单元** | **`org.func.BaseOrg`** | `org_orgs` | `iuap_apdoc_basedoc` | 使用者约定（2026-10-12）。⚠️ 实体中文显示名是**「组织单元」**，不是"业务单元" |

---

## 为什么需要这张表

`search?key=<中文名>` 是**模糊匹配且不排序**的（见 [[01-通用流程-查任意业务对象]]）：

```
搜 "业务单元" 返回 7 条：
  1 ucf-org-center.org_center_card_datapermission | 组织数据权限      | org.datapermission.OrgData
  2 tmsp_org                                      | 计划组织          | TMSP.org.tmsp_org
  3 ucf-org-center.org_center_card_admin_time     | 业务单元时间轴    | org.func.BaseOrgTimeline
  4 ucf-org-center.org_center_card                | 业务单元  ← 真正要的在这里          | org.func.BaseOrg
  5 znbzbx.znbzbx_busimemoorg                     | 业务单元-费用项目 | znbzbx.busimemoorg.BusiMemoOrgVO
  6 unitFundAttributes                            | 业务单元资金属性  | TMSP.unitFundAttributes.…
  7 ucf-org-center.org_center_iae_card            | 视图业务单元      | aa.baseorg.OrgMV
```

真正的 `org.func.BaseOrg` **排在第 4**。同类现象在"销售订单"（2 条完全同名）、"采购订单"（正确项排第 4）上都出现过
—— **这是 `search` 的固有行为，不是偶发**。

**约定表的价值就是绕开这个不确定性**：常用概念一旦定死 URI，就不必每次搜索、猜名、人工比对。

## 维护方式

- **使用者给一条，就追加一条**；模型**不自行推导补齐** —— 没约定的概念一律走 [[01-通用流程-查任意业务对象]] 现查。
- 已在本表登记的概念，**优先用表里的 URI**；用之前可顺手用 `getEntityInfoByBOIdAndEntityId?uri=` 核一下是否仍存在。
- 与使用者知识库的关系：`wiki` 里同名实体页（如 `元数据-org_func_BaseOrg`）给的是**字段清单与关系网**，
  本表给的是**"哪个概念对应哪个 URI"这个映射本身**，两者互补。

## 相关

- [[01-通用流程-查任意业务对象]] —— 没约定时的查法（五步）
- [[00-业务模型查询手册-字段核对]] —— 入口、接口、坑
- `BIP组织模型与会计主体` —— 业务单元与会计主体的关系：会计主体**不是独立实体**，是业务单元勾了"会计主体"
  职能后的角色，`acc_id == org_id`；各职能在物理上另有职能表（如会计主体 `org.func.FinanceOrg` → `org_fin`）
