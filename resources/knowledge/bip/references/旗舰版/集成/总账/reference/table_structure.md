# 中间表和映射表结构设计

## 概述

Oracle 数据通过 dmp 文件导入 BIP 数据库后，存储在中间表中。中间表按月分表，通过配置表控制迁移范围。

## 配置表

### MAPPER_TABLE_ACCBOOK_PERIOD（迁移范围配置表）

控制哪些中间表需要迁移以及迁移类型。

| 字段 | 类型 | 说明 |
|------|------|------|
| TABLE_NAME | VARCHAR2(255) | 中间表名，如 CUX_GL_B_SG_BALANCE_2024_01 |
| PERIOD_NAME | VARCHAR2(255) | 期间，如 2024-01 |
| TYPE_NAME | VARCHAR2(255) | 类型："总账期初" 或 "历史凭证" |
| DR | NUMBER(2,0) | 删除标记 |

**使用方式**：
```sql
-- 查询所有需要迁移的期初表
SELECT * FROM MAPPER_TABLE_ACCBOOK_PERIOD WHERE TYPE_NAME = '总账期初' AND DR = 0;

-- 查询所有需要迁移的凭证表
SELECT * FROM MAPPER_TABLE_ACCBOOK_PERIOD WHERE TYPE_NAME = '历史凭证' AND DR = 0;
```

## 期初中间表

### CUX_GL_B_SG_BALANCE_{YYYY}_{MM}（期初余额表）

按月分表，如 `CUX_GL_B_SG_BALANCE_2024_01`。

| 字段 | 类型 | 说明 | Oracle来源 |
|------|------|------|-----------|
| COM | VARCHAR2(50) | 公司段编码 | 弹性域-公司段 |
| DEPT | VARCHAR2(50) | 部门段编码 | 弹性域-部门段 |
| ACC | VARCHAR2(50) | 会计科目段编码 | 弹性域-科目段 |
| SUBACC | VARCHAR2(50) | 子目段编码 | 弹性域-子目段 |
| INT | VARCHAR2(50) | 关联方段编码 | 弹性域-关联方段 |
| PROD | VARCHAR2(50) | 产品/服务段编码 | 弹性域-产品服务段 |
| PROJ | VARCHAR2(50) | 项目段编码 | 弹性域-项目段 |
| SUPPLIER_NUMBER | VARCHAR2(480) | 供应商编码 | 弹性域-供应商 |
| CUSTOMER_NUMBER | VARCHAR2(480) | 客户编码 | 弹性域-客户 |
| BRAND_CODE | VARCHAR2(480) | 品牌编码 | 弹性域-品牌 |
| GUANGCHANG | VARCHAR2(480) | 广场编码 | 弹性域-广场 |
| PUWEI_DESCRIPTION | VARCHAR2(480) | 铺位号 | 弹性域-铺位 |
| CURRENCY_CODE | VARCHAR2(30) | 币种 | 币种编码 |
| PERIOD_NAME | VARCHAR2(30) | 期间 | 如 2024-01 |
| PERIOD_YEAR | NUMBER | 年 | 如 2024 |
| PERIOD_NUM | NUMBER | 月 | 如 1 |
| BEGIN_BALANCE_DR | NUMBER | 期初借方金额 | Oracle余额表 |
| BEGIN_BALANCE_CR | NUMBER | 期初贷方金额 | Oracle余额表 |
| ID | NUMBER | 主键 | 自增 |
| STATUS | VARCHAR2(10) | 导入状态 | null/Y/N/P/T/E |
| REQID | VARCHAR2(100) | 异步请求ID | API返回 |
| REMARK | VARCHAR2(1000) | 备注 | 错误信息 |
| PARAMJSON | VARCHAR2(20000) | 参数JSON | 详细错误信息 |
| OLDID | VARCHAR2(20) | 旧系统ID | Oracle原始ID |

**索引**：
- `index_com` on COM
- `index_id` on ID
- `index_remark` on REMARK
- `index_reqid` on REQID
- `index_status` on STATUS

## 凭证中间表

### CUX_GL_B_SG_JOURNAL_{YYYY}_{MM}（历史凭证表）

按月分表，如 `CUX_GL_B_SG_JOURNAL_2024_01`。

| 字段 | 类型 | 说明 | Oracle来源 |
|------|------|------|-----------|
| BATCH_NAME | VARCHAR2(600) | 凭证批名 | 日账批 |
| JOURNAL_NAME | VARCHAR2(600) | 凭证名 | 日账名 |
| JOURNAL_SOURCE | VARCHAR2(150) | 凭证来源 | 日账来源 |
| OURNAL_CAT | VARCHAR2(150) | 凭证类别 | 日账类别 |
| USER_NAME | VARCHAR2(600) | 制单人 | 用户名 |
| JURAL_NUMBER | VARCHAR2(480) | 凭证编号 | 凭证唯一标识 |
| JURNAL_SERIAL | NUMBER | 单据编号 | 序列号 |
| POST_STATUS | VARCHAR2(18) | 过账状态 | 已过账/未过账 |
| LINE_NUMBER | NUMBER(15,0) | 行号 | 分录行号 |
| LINE_DESCRIPTION | VARCHAR2(1440) | 摘要 | 行描述 |
| CURRENCY | VARCHAR2(90) | 币种 | 币种编码 |
| POSTED_DATE | DATE | 入账日期 | 过账日期 |
| DEBIT_AMOUNT | NUMBER | 借方金额 | 本币借方 |
| CREDIT_AMOUNT | NUMBER | 贷方金额 | 本币贷方 |
| CCID | NUMBER(15,0) | 账户组合ID | Oracle弹性域组合 |
| COM | VARCHAR2(150) | 公司段编码 | 弹性域-公司段 |
| DEPT | VARCHAR2(150) | 部门段编码 | 弹性域-部门段 |
| ACC | VARCHAR2(150) | 会计科目段编码 | 弹性域-科目段 |
| SUBACC | VARCHAR2(150) | 子目段编码 | 弹性域-子目段 |
| INT | VARCHAR2(150) | 关联方段编码 | 弹性域-关联方段 |
| PROD | VARCHAR2(150) | 产品/服务段编码 | 弹性域-产品服务段 |
| PROJ | VARCHAR2(150) | 项目段编码 | 弹性域-项目段 |
| BUDG | VARCHAR2(150) | 预算段编码 | 弹性域-预算段 |
| STORE | VARCHAR2(150) | 分店段编码 | 弹性域-分店段 |
| SP2 | VARCHAR2(150) | 备用段编码 | 弹性域-备用段 |
| CUSTOMER_NUMNER | VARCHAR2(900) | 客户编码 | 弹性域-客户 |
| SUPPLIER_NUMBER | VARCHAR2(900) | 供应商编码 | 弹性域-供应商 |
| BRAND_CODE | VARCHAR2(900) | 品牌编码 | 弹性域-品牌 |
| GUANGCHANG | VARCHAR2(900) | 广场编码 | 弹性域-广场 |
| PUWEI_DESCRIPTION | VARCHAR2(900) | 铺位号 | 弹性域-铺位 |
| LTD | DATE | 最后更新日期 | 更新时间 |
| PERIOD_NAME | VARCHAR2(90) | 期间 | 如 2024-01 |
| ID | NUMBER | 主键 | 自增 |
| STATUS | VARCHAR2(10) | 导入状态 | null/Y/N/P/T/E |
| REMARK | VARCHAR2(3000) | 备注 | 错误信息 |
| PARAMJSON | VARCHAR2(2000) | 参数JSON | 详细错误信息 |

**索引**：
- `INDEX_JURAL_NUMBER_B_{YYYY}_{MM}` on JURAL_NUMBER
- `INDEX_STATUS_B_{YYYY}_{MM}` on STATUS
- `index_b_j_1_com` on COM

## 映射表

### MAPPER_CUSTOMER_OR_MERCHANT_INT（客户和关联方映射表）

| 字段 | 类型 | 说明 |
|------|------|------|
| CODE | VARCHAR2(255) | Oracle客户编码 |
| NAME | VARCHAR2(255) | Oracle客户名称 |
| INT | VARCHAR2(255) | BIP关联方编码 |
| REMARK | VARCHAR2(255) | 备注 |
| TYPE | VARCHAR2(255) | 类型（"客户"/"供应商"） |

### MAPPER_SUBACC（子目映射表）

| 字段 | 类型 | 说明 |
|------|------|------|
| NAME | VARCHAR2(255) | 子目类型（往来子目/薪资子目/银行子目/资产子目） |
| CODE | VARCHAR2(255) | 子目编码 |

### BANK_MAPPING_T（银行映射表）

| 字段 | 类型 | 说明 |
|------|------|------|
| CODE | VARCHAR2(255) | Oracle银行编码 |
| NAME | VARCHAR2(255) | BIP银行账户编码 |

## 迁移步骤

1. Oracle 系统通过 SQL 将数据提取出，以 dmp 文件提供
2. Oracle 在备库中通过数据分析检查数据范围
3. BIP 系统将 dmp 文件导入到 BIP 数据库
4. 配置 MAPPER_TABLE_ACCBOOK_PERIOD 指定迁移范围
5. BIP 系统通过客户化程序将数据导入到 BIP 系统

## 中间表数据特征

### 期初数据特征

- 按 (公司+科目+币种+期间) 维度存储
- 同一组合可能有多行（不同辅助核算组合）
- BEGIN_BALANCE_DR 和 BEGIN_BALANCE_CR 为期初借贷金额
- 需要根据科目方向计算净值
- 相同辅助核算的行需合并（金额求和）

### 凭证数据特征

- 按 JURAL_NUMBER（凭证编号）分组，每组为一个完整凭证
- 每组包含多个分录行（LINE_NUMBER）
- DEBIT_AMOUNT 和 CREDIT_AMOUNT 为本币借贷金额
- POSTED_DATE 和 PERIOD_NAME 可能不一致（需特殊处理日期）
