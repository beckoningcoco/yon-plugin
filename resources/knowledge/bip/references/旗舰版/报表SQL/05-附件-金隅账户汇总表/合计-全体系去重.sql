select
    '全部单位合计' as "name",
    sum(case when u.kind='A' then 1 else 0 end) as "accountCount",
    sum(case when u.kind='A' and u.flag='D01' then 1 else 0 end) as "基本存款账户",
    sum(case when u.kind='A' and u.flag='D02' then 1 else 0 end) as "一般存款账户",
    sum(case when u.kind='A' and u.flag='D03' then 1 else 0 end) as "专用存款账户",
    sum(case when u.kind='A' and u.flag='D04' then 1 else 0 end) as "临时存款账户",
    sum(case when u.kind='A' and u.flag='D05' then 1 else 0 end) as "其他存款账户",
    sum(case when u.kind='A' and u.flag='D06' then 1 else 0 end) as "保证金账户",
    sum(case when u.kind='O' and u.flag='1' then 1 else 0 end) as "法人公司数量",
    sum(case when u.kind='O' and u.flag='0' then 1 else 0 end) as "非法人公司数量"
from (
    select 'A' as kind, t.purpose_code as flag
      from ( select acc.acct_code, max(acc.purpose_code) as purpose_code
               from ( select o2.id as org_pk, o2.org_source_id as src_id
                        from iuap_apdoc_basedoc.org_epm_orginization_ext e
                        join iuap_apdoc_basedoc.org_epm_organizations o2 on o2.id = e.org_id
                       where e.dr=0 and o2.dr=0 and e.ytenant_id='jd4ofb7k'
                         and e.org_epm_systems_id='2570581176914280457' ) m
               join ( select a.orgid, a.code as acct_code,
                             case when zd.code='JYSK0002' then z.code end as purpose_code
                        from iuap_apdoc_basedoc.org_fin_bankacct a
                        left join iuap_apdoc_basedoc.org_fin_bankacct_character_define_1 d on d.id=a.defineCharacter
                        left join iuap_apdoc_basedoc.bd_cust_doc z on z.id=d.vcol8 and z.dr=0 and z.ytenant_id=a.ytenant_id
                        left join iuap_apdoc_basedoc.bd_cust_doc_def zd on zd.id=z.custdocdefid and zd.dr=0
                       where a.dr=0 and a.ytenant_id='jd4ofb7k'
                         and nvl(a.acctstatus,0) <> 1
                         and nvl(a.acctopentype,-1) <> 2
                         and a.accountOpenDate >= '2026-01-01'
                         and a.accountOpenDate <= '2026-09-22'
                       ) acc on acc.orgid = m.src_id
              group by acc.acct_code ) t
    union all
    select 'O' as kind, t.flag
      from ( select m.org_pk, max(case when org.is_legal=1 then '1' else '0' end) as flag
               from ( select o2.id as org_pk, o2.org_source_id as src_id
                        from iuap_apdoc_basedoc.org_epm_orginization_ext e
                        join iuap_apdoc_basedoc.org_epm_organizations o2 on o2.id = e.org_id
                       where e.dr=0 and o2.dr=0 and e.ytenant_id='jd4ofb7k'
                         and e.org_epm_systems_id='2570581176914280457' ) m
               join ( select z.id as org_pk, case when f.vcol46='01' then 1 else 0 end as is_legal
                        from iuap_apdoc_basedoc.org_orgs z
                        left join iuap_apdoc_basedoc.org_orgs_feature_1 f on f.id=z.characterid
                       where z.dr=0 and z.ytenant_id='jd4ofb7k' ) org on org.org_pk = m.src_id
              group by m.org_pk ) t
) u
