---
name: 旗舰版新建业务对象手动执行SQL建表
description: >
  用友 BIP 客开技能。当用户在旗舰版新建业务对象（扩展实体）后，需要手动执行 SQL 建表，包括达梦数据库建表、索引、触发器、注释、ALTER 语句等，参考该文档内容。
---

# 达梦数据库建表示例

## 客开表（MDF 领域）

```sql
-- 创建小写驼峰表名（带双引号）
CREATE TABLE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" (
  "modifier" VARCHAR(180),
  "bizflowname" VARCHAR(600),
  "auditnote" VARCHAR(600),
  "source_id" VARCHAR(108),
  "original_supplier" VARCHAR(600),
  "sourcecode" VARCHAR(600),
  "verifystate" INT,
  "procinst_id" VARCHAR(108),
  "first_id" VARCHAR(108),
  "bizflow_id" VARCHAR(108),
  "modify_time" TIMESTAMP(0),
  "firstchild_id" VARCHAR(108),
  "audit_time" TIMESTAMP(0),
  "sourcechild_id" VARCHAR(108),
  "sourcebusiobj" VARCHAR(108),
  "id" VARCHAR(22) NOT NULL,
  "pubts" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "dr" INT DEFAULT 0,
  "auditor" VARCHAR(180),
  "firstbusiobj" VARCHAR(108),
  "code" VARCHAR(600),
  "sourcegrand_id" VARCHAR(108),
  "bizflowinstance_id" VARCHAR(108),
  "bustype" VARCHAR(108),
  "creator" VARCHAR(180),
  "bizflow_makebillcode" VARCHAR(600),
  "firstcode" VARCHAR(600),
  "create_time" TIMESTAMP(0),
  -- 业务字段...
  "ytenant_id" VARCHAR(36) NOT NULL,
  PRIMARY KEY ("id")
);

-- 创建索引
CREATE INDEX "c_kk_lzlj_cwgx_db"."idx_c_monthlyCorporateBill_ytenant_id"
ON "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" ("ytenant_id");

-- 创建触发器
CREATE OR REPLACE TRIGGER "c_kk_lzlj_cwgx_db"."trg_c_monthlyCorporateBill_pubts"
BEFORE INSERT OR UPDATE ON "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill"
FOR EACH ROW
BEGIN
  IF NOT UPDATING('pubts') OR :NEW."pubts" IS NULL THEN
    :NEW."pubts" := CAST(CURRENT_TIMESTAMP AS DATE);
  END IF;
END;
/

-- 表注释
COMMENT ON TABLE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" IS '商旅月结账单';
COMMENT ON COLUMN "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill"."id" IS 'id';
COMMENT ON COLUMN "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill"."dr" IS '逻辑删除';
COMMENT ON COLUMN "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill"."ytenant_id" IS '租户id';

-- ALTER 添加字段
ALTER TABLE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" ADD "org_id" VARCHAR(108);
ALTER TABLE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" ADD "attachment" VARCHAR(108);

-- 更新数据
UPDATE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" SET "org_id" = "org_name";

-- 删除字段
ALTER TABLE "c_kk_lzlj_cwgx_db"."c_monthlyCorporateBill" DROP COLUMN "org_name";
```

## 扩展子实体（标准领域，如 znzb）

```sql
-- 供应商退转款信息
CREATE TABLE znbz.znbz_expensebill_suppliertzk (
    business_type                   VARCHAR(200),
    version                         INT,
    id                              VARCHAR(36) NOT NULL,
    pubts                           DATETIME DEFAULT CURRENT_TIMESTAMP,
    modifier                        VARCHAR(60),
    dr                              SMALLINT DEFAULT 0,
    creator                         VARCHAR(60),
    modify_time                     DATETIME,
    create_time                     DATETIME,
    pk_temp                         VARCHAR(200),
    outgoing_supplier_code          VARCHAR(200),
    outgoing_supplier_name          VARCHAR(200),
    outgoing_payment_type           VARCHAR(200),
    outgoing_contract_no            VARCHAR(200),
    outgoing_amount_original_currency DECIMAL(32,8),
    incoming_payment_type           VARCHAR(200),
    recipient_type                  VARCHAR(200),
    recipient_code                  VARCHAR(200),
    recipient_name                  VARCHAR(200),
    incoming_contract_no            VARCHAR(200),
    incoming_project                VARCHAR(200),
    incoming_amount_original_currency DECIMAL(32,8),
    foreignerKey                    BIGINT NOT NULL,
    ytenant_id                      VARCHAR(36) NOT NULL,
    CONSTRAINT pk_znbz_expensebill_suppliertzk PRIMARY KEY (id)
);

COMMENT ON TABLE znbz.znbz_expensebill_suppliertzk IS '供应商退转款信息';
CREATE INDEX i_ytenant_id ON znbz.znbz_expensebill_suppliertzk (ytenant_id);
```

## 标准子表（结算表子表）

```sql
CREATE TABLE "znbz"."znbz_expsettlechilddetail" (
  "version" int COMMENT '版本',
  "id" varchar(36) NOT NULL COMMENT 'ID',
  "pubts" datetime DEFAULT CURRENT_TIMESTAMP COMMENT '时间戳',
  "modifier" varchar(60) COMMENT '修改人',
  "dr" smallint DEFAULT 0 COMMENT '删除标记',
  "billno" varchar(200) COMMENT '账单编号',
  "creator" varchar(60) COMMENT '创建人',
  "modify_time" datetime COMMENT '修改时间',
  "create_time" datetime COMMENT '创建时间',
  "pk_temp" varchar(200) COMMENT '模版',
  "settle_type" varchar(200) COMMENT '结算类型',
  "supplier" varchar(200) COMMENT '供应商',
  "totalmny" decimal(32,8) COMMENT '系统总金额',
  "replenishmentmny" decimal(32,8) COMMENT '补款总金额',
  "deductionmny" decimal(32,8) COMMENT '扣款总金额',
  "confirmedmny" decimal(32,8) COMMENT '确认总金额',
  "adjustmentDownRate" decimal(32,8) COMMENT '下调比例',
  "payablemny" decimal(32,8) COMMENT '应付总金额',
  "taxRate" decimal(32,8) COMMENT '税率',
  "foreignerKey" bigint NOT NULL COMMENT '报销单结算信息',
  "ytenant_id" varchar(36) NOT NULL COMMENT '租户id',
  CONSTRAINT "pk_znbz_expsettlechilddetail" PRIMARY KEY ("id")
);
```

**注意**：达梦数据库不支持 `CREATE TABLE IF NOT EXISTS`，需确保表不存在或在应用层判断。导出的是 MySQL 类型的建表语句，需要转成达梦类型。
