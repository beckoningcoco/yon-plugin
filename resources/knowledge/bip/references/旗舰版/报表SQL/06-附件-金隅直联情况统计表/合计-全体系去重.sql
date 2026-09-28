select
    '全部单位合计' as "name",
    sum(f_bank) as "直联行账户数量",
    sum(f_linked) as "已直联账户数量",
    sum(f_nobank) as "不可直连账户",
    case when sum(f_bank)=0 then null
         else round(sum(f_linked)*1.0/sum(f_bank),2) end as "直连率",
    sum(f_unlinked) as "非直联账户",
    sum(f_fail) as "未直连成功账户"
from (
    select t.acct_code, max(t.f_bank) as f_bank, max(t.f_nobank) as f_nobank,
           max(t.f_linked) as f_linked, max(t.f_unlinked) as f_unlinked,
           max(t.f_fail) as f_fail
      from ( select acc.acct_code, acc.f_bank, acc.f_nobank, acc.f_linked,
                    acc.f_unlinked, acc.f_fail
               from ( select o2.id as org_pk, o2.org_source_id as src_id
                        from iuap_apdoc_basedoc.org_epm_orginization_ext e
                        join iuap_apdoc_basedoc.org_epm_organizations o2 on o2.id = e.org_id
                       where e.dr=0 and e.ytenant_id='jd4ofb7k' and e.org_epm_systems_id='2570581176914280457' and o2.dr=0 ) m
               join (
select a.orgid, a.code as acct_code,
       case when bc.bcol49=1 then 1 else 0 end as f_bank,
       case when bc.bcol49=0 then 1 else 0 end as f_nobank,
       case when bc.bcol49=1 and nvl(a.ctm_direct_link_flag,0)=1 then 1 else 0 end as f_linked,
       case when bc.bcol49=1 and nvl(a.ctm_direct_link_flag,0)=0 then 1 else 0 end as f_unlinked,
       case when au.handleresult='0' then 1 else 0 end as f_fail
  from iuap_apdoc_basedoc.org_fin_bankacct a
  left join iuap_apdoc_basedoc.bd_bank bk on bk.id=a.bank and bk.dr=0
  left join iuap_apdoc_basedoc.bd_bank_character_define_1 bc on bc.id=bk.defineCharacter
  left join (select bankAccount, handleresult,
                    row_number() over (partition by bankAccount
                                       order by nvl(audit_time, create_time) desc) rn
               from yonbip_fi_ctmpub.bam_direct_authorizemanage
              where dr=0 and ytenant_id='jd4ofb7k' and bankAccount is not null) au
         on au.bankAccount=a.id and au.rn=1
 where a.dr=0 and a.ytenant_id='jd4ofb7k'
   and nvl(a.acctstatus,0) <> 1
   and nvl(a.acctopentype,-1) <> 2
   and a.accountOpenDate is not null
               ) acc on acc.orgid = m.src_id ) t
     group by t.acct_code ) u
