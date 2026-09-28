select e.id as "id", e.org_id as "org_id", o.name as "name",
       e.parent_org_id as "parent_id", o.code as "code", o.org_source_id as "source_org_id",
       nvl(x.cnt_bank,0) as "直联行账户数量",
       nvl(x.cnt_linked,0) as "已直联账户数量",
       nvl(x.cnt_nobank,0) as "不可直连账户",
       case when nvl(x.cnt_bank,0)=0 then null
            else round(nvl(x.cnt_linked,0)*1.0/nvl(x.cnt_bank,0),2) end as "直连率",
       nvl(x.cnt_unlinked,0) as "非直联账户",
       nvl(x.cnt_fail,0) as "未直连成功账户"
from iuap_apdoc_basedoc.org_epm_orginization_ext e
join iuap_apdoc_basedoc.org_epm_organizations o on o.id = e.org_id
left join (
    select node_id, sum(f_bank) as cnt_bank, sum(f_linked) as cnt_linked,
           sum(f_nobank) as cnt_nobank, sum(f_unlinked) as cnt_unlinked,
           sum(f_fail) as cnt_fail
      from ( select cl.anc_member_id as node_id, acc.acct_code,
                    max(acc.f_bank) as f_bank, max(acc.f_nobank) as f_nobank,
                    max(acc.f_linked) as f_linked, max(acc.f_unlinked) as f_unlinked,
                    max(acc.f_fail) as f_fail
               from (
select e0.org_id as desc_org_id, e0.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0  where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e1.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e2.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e3.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e3 on e3.id=e2.parent_org_id and e3.dr=0 and e3.ytenant_id='jd4ofb7k' and e3.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e4.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e3 on e3.id=e2.parent_org_id and e3.dr=0 and e3.ytenant_id='jd4ofb7k' and e3.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e4 on e4.id=e3.parent_org_id and e4.dr=0 and e4.ytenant_id='jd4ofb7k' and e4.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e5.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e3 on e3.id=e2.parent_org_id and e3.dr=0 and e3.ytenant_id='jd4ofb7k' and e3.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e4 on e4.id=e3.parent_org_id and e4.dr=0 and e4.ytenant_id='jd4ofb7k' and e4.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e5 on e5.id=e4.parent_org_id and e5.dr=0 and e5.ytenant_id='jd4ofb7k' and e5.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e6.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e3 on e3.id=e2.parent_org_id and e3.dr=0 and e3.ytenant_id='jd4ofb7k' and e3.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e4 on e4.id=e3.parent_org_id and e4.dr=0 and e4.ytenant_id='jd4ofb7k' and e4.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e5 on e5.id=e4.parent_org_id and e5.dr=0 and e5.ytenant_id='jd4ofb7k' and e5.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e6 on e6.id=e5.parent_org_id and e6.dr=0 and e6.ytenant_id='jd4ofb7k' and e6.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
                union all
                select e0.org_id as desc_org_id, e7.id as anc_member_id
                from iuap_apdoc_basedoc.org_epm_orginization_ext e0 join iuap_apdoc_basedoc.org_epm_orginization_ext e1 on e1.id=e0.parent_org_id and e1.dr=0 and e1.ytenant_id='jd4ofb7k' and e1.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e2 on e2.id=e1.parent_org_id and e2.dr=0 and e2.ytenant_id='jd4ofb7k' and e2.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e3 on e3.id=e2.parent_org_id and e3.dr=0 and e3.ytenant_id='jd4ofb7k' and e3.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e4 on e4.id=e3.parent_org_id and e4.dr=0 and e4.ytenant_id='jd4ofb7k' and e4.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e5 on e5.id=e4.parent_org_id and e5.dr=0 and e5.ytenant_id='jd4ofb7k' and e5.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e6 on e6.id=e5.parent_org_id and e6.dr=0 and e6.ytenant_id='jd4ofb7k' and e6.org_epm_systems_id='2570581176914280457' join iuap_apdoc_basedoc.org_epm_orginization_ext e7 on e7.id=e6.parent_org_id and e7.dr=0 and e7.ytenant_id='jd4ofb7k' and e7.org_epm_systems_id='2570581176914280457'
                 where e0.dr=0 and e0.ytenant_id='jd4ofb7k' and e0.org_epm_systems_id='2570581176914280457'
               ) cl
               join iuap_apdoc_basedoc.org_epm_organizations o2 on o2.id = cl.desc_org_id
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
               ) acc on acc.orgid = o2.org_source_id
              group by cl.anc_member_id, acc.acct_code ) t
     group by node_id ) x on x.node_id = e.id
where e.dr=0 and e.ytenant_id='jd4ofb7k' and e.org_epm_systems_id='2570581176914280457' and o.dr=0
order by e.parent_org_id, e.id
