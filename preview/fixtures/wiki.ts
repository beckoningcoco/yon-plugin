/**
 * 预览样本：知识库面板（`WikiManager`）。
 *
 * 这是五个面里最大的一个 —— 一个 vault 列表守着 概览 / 缺口 / 活动 三个页签 +
 * 一个搜索框 + 一张实体卡，所以样本必须让三处同时成立，而不是「有数据就行」。
 *
 * 数字取自本机真实 vault（`D:/yon-bip-obsidian/yon-bip-obsidian`，就是 `wiki_config.json`
 * 里登记的那个）：5374 个实体页、52580 条引用边（29528 条落到页面 + 23052 条悬空）、
 * 2840 个被引用却没有页面的实体 —— 与 `docs/yon-knowledge-design.md` 第十节记的是同一组数。
 * 卡片、搜索命中、引用者三处的页面名与字段数是从 `wiki/.yon-index.json` 里逐个读出来的，
 * 所以点开任何一条命中都能得到一张完整的卡，而不是先写个名字再去凑字段。
 *
 * 三处例外，都写在下面各自的位置上：
 * - `WIKI_RECENT`：这个 vault 的 `log.md` 用 `## 日期 事件` 做标题，而宿主只认
 *   `- 日期 一句话`（`src/host/wiki-write.ts` 的 `recordWrite`），所以真实回答是空的。
 *   这里按宿主的写入格式补了 8 条，好让「活动」页签的 `.logList` 能被看到。
 * - `WIKI_USAGE` 的次数：本机 `wiki-usage.jsonl` 写这份样本时只有 12 行，那个密度看不出
 *   布局问题。词是真的（前两条就是日志里查得最多的），次数按用过一段时间的安装写。
 * - 私有的 `CITERS`：宿主是按整本索引扫引用，这里只能预存一段（最长的那个 46 条）。
 */
import type { WikiApi } from '../../src/client/wiki/api.ts'
import type {
  WikiCardPayload, WikiCardView, WikiCitersPayload, WikiGapView, WikiHealthPayload,
  WikiHealthReport, WikiLevelStat, WikiListPayload, WikiLogEntry, WikiSearchHit,
  WikiSearchPayload,
} from '../../src/shared/types.ts'

/** 就绪的那个 vault。面板一进场就落在它身上，所以它必须是列表的第一个。 */
const READY_ID = 'bip'

/** 未就绪的那个。列表里要看得到 `.rowNotReady`，随便点它则什么都不该显示。 */
const NOT_READY_ID = 'ncc'

/**
 * 两个 vault。
 *
 * 路径与 id 取自真实的 `wiki_config.json`；页数与索引时间取自已建好的索引
 * （`.yon-index.json` 的 `builtAt` 就是 01:44:30，索引文件 4.8 MB）。
 * 第二个 vault 的目录在，但 `wiki/entities` 是空的，所以它没有索引用 ——
 * 面板靠 `ready` 区分，而 `.rowNotReady` 那行就是给它准备的。
 */
export const WIKI_VAULTS: WikiListPayload = {
  vaults: [
    {
      id: READY_ID,
      label: 'yon-bip-obsidian',
      path: 'D:/yon-bip-obsidian/yon-bip-obsidian',
      pages: 5374,
      indexedAt: '2026-09-29T01:44:30.089Z',
      ready: true,
    },
    {
      id: NOT_READY_ID,
      label: 'yon-ncc-obsidian',
      path: 'D:/yon-bip-obsidian/yon-ncc-obsidian',
      pages: 0,
      ready: false,
    },
  ],
}

/** 页数，后面很多地方要对齐它。 */
const PAGES = 5374

/**
 * 三级分布。
 *
 * 「可定位」只有 3 页是真实的：这一版的 vault 里带物理表却没有字段清单的页面就那么几个，
 * 绝大多数页面要么两样都有（可写查询），要么连表名都没有（仅概念）。三级都在，
 * 正好能让概览页那条 `.levelList` 同时画出满格、细条和空条三种样子。
 */
const LEVELS: readonly WikiLevelStat[] = [
  { level: 'query-ready', pages: 5115 },
  { level: 'locatable', pages: 3 },
  { level: 'concept', pages: 256 },
]

/**
 * 被引用最多、却没有页面的实体，前十名。
 *
 * 全是平台基础接口（IYTenant / LogicDelete / ITenant 一类），不是业务实体 ——
 * 这正是面板里那句 `wiki.gapNote` 想让人读出来的东西。`citedBy` 是索引自己留的
 * 5 条样本，顺序即索引里的出现顺序。
 */
export const WIKI_GAPS: readonly WikiGapView[] = [
  {
    uri: 'ucfbase.ucfbaseItf.IYTenant',
    cited: 1566,
    citedBy: [
      '保证金缴纳方式-lawbid_calldocument_CallDepositPaymentMethod',
      '保证金缴纳方式-lawbid_tenderAnnouncement_CallDepositPaymentMethodTender',
      '报价历史表头自定义项-lawbid_quotationrecord_QuotationRecordVODefine',
      '报价历史物料表体-lawbid_quotationrecord_QuotationRecordMaterielVO',
      '报价历史物料价格梯度明细-lawbid_quotationrecord_QuotationRecordMaterielStepVO',
    ],
  },
  {
    uri: 'base.itf.ITenant',
    cited: 929,
    citedBy: [
      '销售订单-ClueParticipant',
      '元数据-aa_agentlevel_AgentLevel',
      '元数据-aa_channeltype_ChannelType',
      '元数据-aa_custcategory_CustCategory',
      '元数据-aa_custcategory_CustCategoryApplyRange',
    ],
  },
  {
    uri: 'bip-usercenter.bip_user_ref',
    cited: 818,
    citedBy: [
      '核对线索来源-verifyClueSourceDO',
      '期间结存明细-PeriodBalanceStockVO',
      '元数据-AAI_outSystemRegist_outSystemRegist',
      '元数据-archive_taxArchives_progressiveTaxRate',
      '元数据-archive_taxArchives_TaxBureauArchive',
    ],
  },
  {
    uri: 'iuap.busiObj.LogicDelete',
    cited: 769,
    citedBy: [
      '核对线索来源-verifyClueSourceDO',
      '流水台账-LedgerVO',
      '元数据-AAI_outSystemRegist_outSystemRegist',
      '元数据-archive_taxArchives_progressiveTaxRate',
      '元数据-archive_taxArchives_TaxBureauArchive',
    ],
  },
  {
    uri: 'ucfbase.ucfbaseItf.IYTenantExt',
    cited: 746,
    citedBy: [
      '采购分类维度-supplycategory.SupplycategoryPurchaseClass',
      '供货目录-supplycategory.Supplycategory',
      '供应商变更受理-supplychange.SupplyChange',
      '供应商维度-supplycategory.SupplycategoryVendor',
      '供应商准入受理-supplymgr.SupplyApply',
    ],
  },
  {
    uri: 'iuap.busiObj.IYTenant',
    cited: 587,
    citedBy: [
      '核对线索来源-verifyClueSourceDO',
      '流水台账-LedgerVO',
      '售后申请及通知表-returnProduct.returnProduct',
      '元数据-AAI_outSystemRegist_outSystemRegist',
      '元数据-archive_taxArchives_progressiveTaxRate',
    ],
  },
  {
    uri: 'iuap.busiObj.IAuditInfo',
    cited: 561,
    citedBy: [
      '核对线索来源-verifyClueSourceDO',
      '流水台账-LedgerVO',
      '元数据-AAI_outSystemRegist_outSystemRegist',
      '元数据-archive_taxArchives_progressiveTaxRate',
      '元数据-archive_taxArchives_TaxBureauArchive',
    ],
  },
  {
    uri: 'ucfbase.ucfbaseItf.LogicDelete',
    cited: 553,
    citedBy: [
      '保证金缴纳方式-lawbid_calldocument_CallDepositPaymentMethod',
      '保证金缴纳方式-lawbid_tenderAnnouncement_CallDepositPaymentMethodTender',
      '报价历史表头自定义项-lawbid_quotationrecord_QuotationRecordVODefine',
      '报价历史物料表体-lawbid_quotationrecord_QuotationRecordMaterielVO',
      '报价历史物料价格梯度明细-lawbid_quotationrecord_QuotationRecordMaterielStepVO',
    ],
  },
  {
    uri: 'base.itf.IAuditInfo',
    cited: 509,
    citedBy: [
      '变更公告-lawbid_noticechange_NoticeChangeClearVO',
      '变更协同明细-workhandover.ApplyBuyercnDetail',
      '标段信息-section.LawbidSection',
      '表单模板实例-templateinst.TplBillTemplateInst',
      '补录单主表-lawbid_decisionsupplement_CpuSupplement',
    ],
  },
  {
    uri: 'ucfbasedoc.bd_currencytenantref',
    cited: 442,
    citedBy: [
      '期间结存明细-PeriodBalanceStockVO',
      '元数据-aa_merchant_AgentFinancial',
      '元数据-aa_merchant_MerchantApplyRangeDetail',
      '元数据-aa_merchant_MerchantDetail',
      '元数据-aa_store_ElectronicCommerce',
    ],
  },
]

/**
 * 这个库被问了什么。
 *
 * `popular` 的键在宿主里是**小写过的**（`wiki-usage.ts` 的 `summary()` 用
 * `term.trim().toLowerCase()` 当 `counts` 的键），`misses` 保留原样 ——
 * 所以下面这些带英文的查询词看起来是全小写的，那是真实的渲染结果，不是抄错了。
 *
 * 「查了却没有结果」用的是这个库里确实没有页面的实体 URI（就是上面那些缺口），
 * 拿它们去搜本来就是 0 命中，所以这两块是自洽的。
 */
export const WIKI_USAGE = {
  total: 319,
  since: '2026-09-01T02:14:07.000Z',
  popular: [
    { term: '销售订单', count: 96 },
    { term: '销售订单-paymentverification', count: 41 },
    { term: '物料', count: 37 },
    { term: '供应商', count: 29 },
    { term: '采购订单', count: 24 },
    { term: '交易类型', count: 21 },
    { term: '生产订单', count: 18 },
    { term: '仓库', count: 15 },
    { term: '客户档案', count: 12 },
    { term: '销售订单变更付款协议-cpu-order_saleorderchange_saleorderpaytermchangevo', count: 9 },
  ],
  misses: [
    { term: 'ucfbase.ucfbaseItf.IYTenant', count: 7, last: '2026-09-28T09:12:44.000Z' },
    { term: 'base.itf.ITenant', count: 4, last: '2026-09-28T03:41:19.000Z' },
    { term: 'bip-usercenter.bip_user_ref', count: 3, last: '2026-09-26T07:55:02.000Z' },
    { term: 'iuap.busiObj.LogicDelete', count: 2, last: '2026-09-24T10:08:37.000Z' },
    { term: 'ucfbasedoc.bd_currencytenantref', count: 1, last: '2026-09-22T06:20:55.000Z' },
  ],
} as const

/**
 * 一本 vault 的健康报告：概览与缺口两个页签的全部数据。
 *
 * 连通度是这一节的要点：「没有链接」曾经是测量的错，不是 vault 的性质 ——
 * 93.5% 的页面有出链、79% 有入链、真正孤立的只有 193 页。
 */
export const WIKI_REPORT: WikiHealthReport = {
  vault: READY_ID,
  vaultLabel: 'yon-bip-obsidian',
  pages: PAGES,
  indexedAt: '2026-09-29T01:44:30.089Z',
  indexBytes: 4989141,
  graph: {
    pages: PAGES,
    withOutgoing: 5025,
    withIncoming: 4246,
    isolated: 193,
    resolvedEdges: 29528,
    danglingEdges: 23052,
    missingEntities: 2840,
  },
  levels: LEVELS,
  gaps: WIKI_GAPS,
  usage: WIKI_USAGE,
}

/** `health()` 的返回值。面板只取 `reports[0]`。 */
export const WIKI_HEALTH: WikiHealthPayload = { reports: [WIKI_REPORT] }

/**
 * 最近写入，「活动」页签的下半段。
 *
 * 文本格式照抄 `src/host/wiki-write.ts` 真正写进 `log.md` 的三句话：
 * `新建 [[页面]]（来源类型，平台版本）` / `追加 [[页面]] §章节（来源类型）` /
 * `更正 [[页面]] frontmatter（改了哪些字段）`。页面名都是这个库里真实存在的页面。
 * 见文件头的说明：这个 vault 的真实 log.md 用的是标题格式，所以宿主读出来是空的。
 */
export const WIKI_RECENT: readonly WikiLogEntry[] = [
  {
    date: '2026-09-28',
    text: '新建 [[订单关闭-voucher_order_OrderDetailClosed]]（api_response，BIP V5）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-28',
    text: '追加 [[元数据-pc_product_Product]] §实测字段（datasource_query）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-27',
    text: '更正 [[元数据-aa_vendor_Vendor]] frontmatter（last_verified：2026-06-03 → 2026-09-27；status：unverified → verified）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-26',
    text: '新建 [[订单追踪-mr_ordertrack_orderTrack]]（api_response，BIP V5）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-26',
    text: '追加 [[会计事件-EventVoucherDO]] §列名（api_response）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-25',
    text: '新建 [[采购商城订单-mallofficeorder.MallOrder]]（api_response，BIP V5）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-24',
    text: '更正 [[元数据-org_func_BaseOrg]] frontmatter（project："" → "旗舰版-组织")',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
  {
    date: '2026-09-24',
    text: '新建 [[会计事件-EventVoucherDO]]（api_response，BIP V5）',
    vault: READY_ID,
    vaultLabel: 'yon-bip-obsidian',
  },
]

/**
 * 一张实体卡。
 *
 * `vault` / `vaultLabel` 每张都一样，由这里补上，省得十张卡各写两遍。
 * @param over - 除 vault 归属以外的全部卡片字段。
 * @returns 一张挂在就绪 vault 下的卡。
 */
function card(over: Omit<WikiCardView, 'vault' | 'vaultLabel'>): WikiCardView {
  return { vault: READY_ID, vaultLabel: 'yon-bip-obsidian', ...over }
}

/**
 * 面板能看到的那几张卡，全部是这个库里真实存在的页面。
 *
 * 挑的时候刻意让四个位置各有样本：有入链也有出链的枢纽（业务单元）、
 * 两边都空的小页（订单关闭）、有物理表却没有字段清单的（事项分录，能让人看到
 * `.lacks` 里那句「列名要查库确认」）、连表名都没有的概念页（采购订单主表）。
 * 搜索的命中也是从这张表里筛的，所以点开任何一条命中都能拿到一张完整的卡。
 */
export const WIKI_CARDS: readonly WikiCardView[] = [
  card({
    page: '元数据-org_func_BaseOrg',
    uri: 'org.func.BaseOrg',
    name: '业务单元',
    table: 'org_orgs',
    app: 'GZTORG',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 125,
    lacks: [],
    refs: 52,
    incoming: 383,
    outgoing: [
      {
        kind: 'composition',
        total: 31,
        sample: [
          'org.func.AdminOrg', 'org.func.AssetsOrg', 'org.func.BaseOrgDefine', 'org.func.BaseOrgExt',
          'org.func.EnergyOrg', 'org.func.Ext0Org', 'org.func.Ext1Org', 'org.func.Ext2Org',
        ],
      },
      {
        kind: 'refType',
        total: 11,
        sample: [
          'hrcloud-contract.hrcm_contractentity_ref', 'hrcloud-contract.hrcm_location_ref',
          'ucf-org-center.bd_staff_ref', 'ucf-org-center.org_companyTyperef',
          'ucf-org-center.org_deptTyperef', 'ucf-org-center.org_pure_tree_ref_na',
          'ucf-org-center.org_unit_tree_ref', 'ucf-staff-center.bd_staff_ref',
        ],
      },
      {
        kind: 'implements',
        total: 10,
        sample: [
          'basedoc.basedocItf.AuditInfo', 'basedoc.basedocItf.BasedocIState',
          'basedoc.basedocItf.BasedocITenant', 'basedoc.basedocItf.ITree',
          'basedoc.basedocItf.LogicDelete', 'bd.itf.ISystemInfo', 'hred.itf.ITimeLineDoc',
          'org.base.IOrg',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 383,
        sample: [
          'HRXZHS_MDD_rsRaiseSalaryRules_RsSalaryRule', 'HRXZHS_MDD_rsRaiseSalaryTask_RsRaiseSalaryTask',
          'HRXZHS_MDD_rsSalaryScheme_RsSalaryScheme',
          'VMI补货申请-ycSaleCoor_salevmireplenish_SalevmiReplenishVO',
          'VMI补货申请表体-ycSaleCoor_salevmireplenish_SalevmiReplenishDetailVO',
          'hred_staff_StaffJob', 'hrxc_grade_WaGrade', 'hrxc_salaryApply_WaSalaryApplyBill',
        ],
      },
    ],
    unresolved: {
      total: 21,
      sample: [
        'ucf-org-center.org_unit_tree_ref', 'hrcloud-contract.hrcm_contractentity_ref',
        'ucfbasedoc.bd_languageref', 'ucf-org-center.bd_staff_ref',
        'ucfbasedoc.bd_enclouddef_exchangerateref', 'ucfbasedoc.bd_countryref',
        'ucf-staff-center.bd_staff_ref', 'ucf-org-center.org_companyTyperef',
        'hrcloud-contract.hrcm_location_ref', 'ucf-org-center.org_pure_tree_ref_na',
        'ucf-org-center.org_deptTyperef', 'voucher.base.IAutoCode',
      ],
    },
  }),

  card({
    page: '元数据-aa_vendor_Vendor',
    uri: 'aa.vendor.Vendor',
    name: '供应商',
    table: 'aa_vendor',
    app: 'DPMSPL',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 116,
    lacks: [],
    refs: 24,
    incoming: 360,
    outgoing: [
      {
        kind: 'refType',
        total: 12,
        sample: [
          'cpu-pubapp.cpu_enterprise_ref_list', 'productcenter.aa_merchantinorganizationref',
          'productcenter.base_businesspartnerref', 'transtype.bd_billtyperef',
          'ucf-org-center.org_fun_filter_list_ref', 'ucfbasedoc.bd_countryref',
          'ucfbasedoc.bd_currencytenantref', 'ucfbasedoc.bd_languageref',
        ],
      },
      {
        kind: 'composition',
        total: 8,
        sample: [
          'aa.vendor.VendorAddress', 'aa.vendor.VendorBank', 'aa.vendor.VendorContacts',
          'aa.vendor.VendorCustomItem', 'aa.vendor.VendorDefine', 'aa.vendor.VendorExtend',
          'aa.vendor.VendorOrg', 'aa.vendor.VendorQualify',
        ],
      },
      {
        kind: 'implements',
        total: 4,
        sample: [
          'base.itf.IErpCode', 'bd.social.ISocialMcType', 'ucfbase.ucfbaseItf.IYTenantExt',
          'voucher.base.IAutoCode',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 360,
        sample: [
          'VMI补货申请-ycSaleCoor_salevmireplenish_SalevmiReplenishVO', 'st_materialout_MaterialOut',
          'st_osminrecord_OsmInRecord', 'st_othoutrecord_OthOutRecord',
          'st_pickingrequisition_PickingRequisition', 'st_storenotice_StoreNotice',
          'st_transferapply_TransferApply', 'uscmf_lendrecord_LendRecord',
        ],
      },
    ],
    unresolved: {
      total: 16,
      sample: [
        'aa.vendor.VendorExtend', 'ucfbasedoc.bd_countryref',
        'productcenter.base_businesspartnerref', 'ucfbasedoc.bd_languageref',
        'cpu-pubapp.cpu_enterprise_ref_list', 'yssupplier.aa_adminorgref',
        'ucfbasedoc.bd_currencytenantref', 'productcenter.aa_merchantinorganizationref',
        'yssupplier.aa_vendorclassificationref', 'transtype.bd_billtyperef',
        'ucf-org-center.org_fun_filter_list_ref', 'yssupplier.aa_vendorCreatorref',
      ],
    },
  }),

  card({
    page: '元数据-pc_product_Product',
    uri: 'pc.product.Product',
    name: '物料',
    table: 'product',
    app: 'GZTBDM',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 116,
    lacks: [],
    refs: 48,
    incoming: 342,
    outgoing: [
      {
        kind: 'composition',
        total: 22,
        sample: [
          'pc.product.ProductApplyRange', 'pc.product.ProductApplyRangeGroup',
          'pc.product.ProductAssistClass', 'pc.product.ProductAssistUnitExchange',
          'pc.product.ProductBarCode', 'pc.product.ProductCheckFreeExtend',
          'pc.product.ProductDefine', 'pc.product.ProductDepositTimeDetail',
        ],
      },
      {
        kind: 'refType',
        total: 18,
        sample: [
          'productcenter.aa_adminorgref', 'productcenter.pc_brandref',
          'productcenter.pc_costclassref', 'productcenter.pc_lifecycletemplateref',
          'productcenter.pc_managementclassref', 'productcenter.pc_materialstatusref',
          'productcenter.pc_planclassref', 'productcenter.pc_presentationclassref',
        ],
      },
      {
        kind: 'implements',
        total: 8,
        sample: [
          'base.itf.Deletable', 'base.itf.IAuditInfo', 'base.itf.IErpCode',
          'base.itf.ISociCoreArchive', 'bd.social.ISocialMcType', 'coredoc.pub.TenantObselete',
          'ucfbase.ucfbaseItf.IYTenant', 'voucher.base.IAutoCode',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 342,
        sample: [
          'LRP运算订单-计划参数对照表-mr_lrp_LRPAssociation',
          'MRP供需追溯明细表主表-mr_matchprocess_MatchProcess',
          'MRP替代料-mr_rpadata_RPABomAlternate', 'MRP联副产品结构-mr_rpadata_RPABomByProduct',
          'MRP预测消抵表-mr_consumption_MRPConsumption',
          'VMI补货申请表体-ycSaleCoor_salevmireplenish_SalevmiReplenishDetailVO',
          'sn_serialnumber_SNstateReport', 'st_demandapply_DemandApplyDetail',
        ],
      },
    ],
    unresolved: {
      total: 32,
      sample: [
        'pc.product.ProductCheckFreeExtend', 'pc.product.ProductParameterExtend',
        'pc.product.ProductDefine', 'pc.product.ProductSkuDetailNew',
        'pc.product.SKUOrderPropertyExtend', 'pc.product.ProductLoadWay',
        'pc.product.ProductDepositTimeExtend', 'pc.product.ProductTagExtend',
        'uhy.pt_couponref', 'productcenter.pc_planclassref',
        'productcenter.pc_productlineref', 'upromotion.pmc_giftcardref',
      ],
    },
  }),

  card({
    page: 'voucher_order_OrderDetailClosed',
    uri: 'voucher.order.OrderDetailClosed',
    name: '订单关闭',
    table: 'orderdetailclosed',
    app: 'SCMSA',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 19,
    lacks: [],
    refs: 5,
    incoming: 0,
    outgoing: [
      {
        kind: 'refType',
        total: 3,
        sample: ['base.itf.Deletable', 'base.itf.IUordercorp', 'ucfbase.ucfbaseItf.IYTenantExt'],
      },
      { kind: 'reference', total: 1, sample: ['yht.tenant.YhtTenant'] },
      { kind: 'extends', total: 1, sample: ['uorder.voucher.UorderBizObject'] },
    ],
    // 一页没人引用它：卡片上「指向这一页」那一节整块不出现，也是要能看到的一种样子。
    incomingGroups: [],
    unresolved: {
      total: 4,
      sample: [
        'base.itf.IUordercorp', 'base.itf.Deletable', 'ucfbase.ucfbaseItf.IYTenantExt',
        'uorder.voucher.UorderBizObject',
      ],
    },
  }),

  card({
    page: '采购商城订单-mallofficeorder.MallOrder',
    uri: 'mall.mallofficeorder.MallOrder',
    name: '采购商城订单',
    table: 'mall_order',
    app: 'ycYuncaiMall',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 143,
    lacks: [],
    refs: 19,
    incoming: 5,
    outgoing: [
      {
        kind: 'reference',
        total: 14,
        sample: [
          'aa.vendor.Vendor', 'aa.warehouse.Warehouse', 'base.user.BipUser',
          'bd.adminOrg.AdminOrgVO', 'bd.bill.TransType', 'bd.currencytenant.CurrencyTenantVO',
          'bd.project.ProjectVO', 'bd.staff.Staff',
        ],
      },
      {
        kind: 'depends',
        total: 5,
        sample: [
          'ucfbase.ucfbaseItf.IApprovalFlow', 'ucfbase.ucfbaseItf.IApprovalInfo',
          'ucfbase.ucfbaseItf.IYTenant', 'ucfbase.ucfbaseItf.LogicDelete', 'voucher.base.IAutoCode',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 5,
        sample: [
          '商城订单明细-mallofficeorder.OrderDetail', '销售订单-cpu-order_saleorder_SaleOrderVO',
          '销售订单变更-cpu-order_saleorderchange_SaleOrderChangeVO',
          '销售订单变更表体-cpu-order_saleorderchange_SaleOrderDetailChangeVO',
          '销售订单表体-cpu-order_saleorder_SaleOrderDetailVO',
        ],
      },
    ],
    unresolved: {
      total: 5,
      sample: [
        'ucfbase.ucfbaseItf.LogicDelete', 'ucfbase.ucfbaseItf.IApprovalInfo',
        'ucfbase.ucfbaseItf.IYTenant', 'voucher.base.IAutoCode', 'ucfbase.ucfbaseItf.IApprovalFlow',
      ],
    },
  }),

  card({
    page: '订单产品变更表-po_orderchange_OrderProductChange',
    uri: 'po.orderchange.OrderProductChange',
    name: '订单产品变更表',
    table: 'po_order_product_change',
    app: 'PO',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 193,
    lacks: [],
    refs: 36,
    incoming: 10,
    outgoing: [
      {
        kind: 'reference',
        total: 36,
        sample: [
          'BGDM.wbs.wbs_doc', 'aa.merchant.Merchant', 'aa.reason.Reason', 'aa.warehouse.Warehouse',
          'base.tenant.Tenant', 'bd.costcenter.CostCenter', 'bd.project.ProjectVO',
          'bd.virtualaccbody.VirtualAccbody',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 10,
        sample: [
          '产品表固定自定义项-po_orderchange_OrderProductChangeDefine',
          '产品表自由自定义项-po_orderchange_OrderProductChangeAttrextItem',
          '工序序列变更表-po_orderchange_OrderOpSequenceChange',
          '生产订单变更-po_orderchange_OrderChange',
          '生产订单变更产品扩展信息-po_orderchange_OrderProductChangeExpinfo',
          '生产订单变更序列号-po_orderchange_OrderSnChange',
          '订单工序变更表-po_orderchange_OrderProcessChange',
          '订单材料变更表-po_orderchange_OrderMaterialChange',
        ],
      },
    ],
    unresolved: { total: 1, sample: ['po.orderchange.ProductFreeCharacteristics'] },
  }),

  card({
    page: '订单追踪-mr_ordertrack_orderTrack',
    uri: 'mr.ordertrack.orderTrack',
    name: '订单追踪',
    table: 'mr_order_tracking',
    app: 'MR',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 29,
    lacks: [],
    refs: 14,
    incoming: 0,
    outgoing: [
      {
        kind: 'reference',
        total: 14,
        sample: [
          'aa.baseorg.DeptMV', 'aa.baseorg.OrgMV', 'aa.merchant.Merchant', 'aa.warehouse.Warehouse',
          'base.tenant.Tenant', 'bd.bill.TransType', 'mr.ordertrack.orderTrackFCT',
          'org.func.BaseOrg',
        ],
      },
    ],
    incomingGroups: [],
    unresolved: { total: 0, sample: [] },
  }),

  card({
    page: '元数据-bd_bill_TransType',
    uri: 'bd.bill.TransType',
    name: '交易类型',
    table: 'bd_transtype',
    app: 'BMMMM',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 38,
    lacks: [],
    refs: 6,
    incoming: 240,
    outgoing: [
      {
        kind: 'implements',
        total: 5,
        sample: [
          'basedoc.basedocItf.AuditInfo', 'basedoc.basedocItf.BasedocIState',
          'basedoc.basedocItf.LogicDelete', 'bd.social.ISocialMcType',
          'ucfbase.ucfbaseItf.IYTenant',
        ],
      },
      { kind: 'refType', total: 1, sample: ['transtype.bd_labelapp_billtype_ref'] },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 240,
        sample: [
          'VMI补货申请-ycSaleCoor_salevmireplenish_SalevmiReplenishVO',
          'contract-clmContractConfiguration', 'contract-clmContractConfiguration_transTypeId',
          'contract-clmContractIntegrateConfig', 'hred_staff_StaffJob',
          'hred_staffmodify_StaffBaseinfoModify', 'hrxc_payfile_WaPayfile',
          'hrxc_publicItem_WaItemApplyBill',
        ],
      },
    ],
    unresolved: {
      total: 5,
      sample: [
        'transtype.bd_labelapp_billtype_ref', 'basedoc.basedocItf.BasedocIState',
        'basedoc.basedocItf.LogicDelete', 'basedoc.basedocItf.AuditInfo',
        'ucfbase.ucfbaseItf.IYTenant',
      ],
    },
  }),

  card({
    page: '会计事件-EventVoucherDO',
    uri: 'eaai.eventvoucher.EventVoucherDO',
    name: '事项分录',
    table: 'aai_voucher',
    app: 'AAI',
    version: 'BIP V5',
    status: 'verified',
    // 有表名、没有字段清单 —— 三级里最少见的一级（整本只有 3 页），
    // 也正是 `.lacks` 那段「列名要查库确认」唯一会出现的场合。
    level: 'locatable',
    lacks: ['有物理表 `aai_voucher` 但页面没有字段清单，列名要用 datasource_query 查库确认'],
    refs: 1,
    incoming: 0,
    outgoing: [{ kind: 'composition', total: 1, sample: ['eaai.eventvoucher.EventVoucherDetailsDO'] }],
    incomingGroups: [],
    unresolved: { total: 0, sample: [] },
  }),

  card({
    page: '元数据-pu_purchaseorder_PurchaseOrder',
    uri: 'pu.purchaseorder.PurchaseOrder',
    name: '采购订单主表',
    version: 'BIP V5',
    status: 'verified',
    // 连表名都没有：抽它的那一批页面用的是中文表头，索引没读出 `tableName`，
    // 于是它落在「仅概念」这一级，卡片上除了 `.lacks` 什么都没有。
    level: 'concept',
    lacks: ['没有物理表名，无法据此写 SQL；这是概念页，先找它落地的实体'],
    refs: 0,
    incoming: 1,
    outgoing: [],
    incomingGroups: [
      { kind: 'reference', total: 1, sample: ['付款计划子表-pu_purchaseorder_PaymentSchedules'] },
    ],
    unresolved: { total: 0, sample: [] },
  }),

  // 下面三张是「缺口」页签里第一名那个缺口（IYTenant）的前三个引用者。它们在这里，
  // 是为了让 缺口 → 看谁引用它 → 点一条 → 卡片 这条路径走得通；没有预存卡片的页面
  // 点下去会得到宿主的原话「没有名为「X」的页面」，那也是要能看到的一种样子。
  card({
    page: '保证金缴纳方式-lawbid_calldocument_CallDepositPaymentMethod',
    uri: 'lawbid.calldocument.CallDepositPaymentMethod',
    name: '保证金缴纳方式',
    table: 'cpu_deposit_payment_method',
    app: 'ycSouringBid',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 10,
    lacks: [],
    refs: 9,
    incoming: 1,
    outgoing: [
      {
        kind: 'reference',
        total: 5,
        sample: [
          'cpu-privilege.enterprise.EnterprisePOJO', 'ewallet.config.PayType',
          'lawbid.calldocument.CallBidDocumentSection', 'lawbid.section.LawbidSection',
          'yht.tenant.YhtTenant',
        ],
      },
      {
        kind: 'depends',
        total: 4,
        sample: [
          'cpu.itf.IBuyerTenant', 'cpu.itf.IEnterprise', 'ucfbase.ucfbaseItf.IYTenant',
          'ucfbase.ucfbaseItf.LogicDelete',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 1,
        sample: ['采购文件标包信息-lawbid_calldocument_CallBidDocumentSection'],
      },
    ],
    unresolved: {
      total: 4,
      sample: [
        'ucfbase.ucfbaseItf.IYTenant', 'ucfbase.ucfbaseItf.LogicDelete', 'cpu.itf.IEnterprise',
        'cpu.itf.IBuyerTenant',
      ],
    },
  }),

  card({
    page: '保证金缴纳方式-lawbid_tenderAnnouncement_CallDepositPaymentMethodTender',
    uri: 'lawbid.tenderAnnouncement.CallDepositPaymentMethodTender',
    name: '保证金缴纳方式',
    table: 'cpu_deposit_payment_method_tender',
    app: 'ycSouringBid',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 10,
    lacks: [],
    refs: 9,
    incoming: 1,
    outgoing: [
      {
        kind: 'reference',
        total: 5,
        sample: [
          'cpu-privilege.enterprise.EnterprisePOJO', 'ewallet.config.PayType',
          'lawbid.section.LawbidSection', 'lawbid.tenderAnnouncement.LawbidAnnouncementSectionTender',
          'yht.tenant.YhtTenant',
        ],
      },
      {
        kind: 'depends',
        total: 4,
        sample: [
          'cpu.itf.IBuyerTenant', 'cpu.itf.IEnterprise', 'ucfbase.ucfbaseItf.IYTenant',
          'ucfbase.ucfbaseItf.LogicDelete',
        ],
      },
    ],
    incomingGroups: [
      {
        kind: 'reference',
        total: 1,
        sample: ['采购标书标包信息-lawbid_tenderAnnouncement_LawbidAnnouncementSectionTender'],
      },
    ],
    unresolved: {
      total: 4,
      sample: [
        'ucfbase.ucfbaseItf.IYTenant', 'ucfbase.ucfbaseItf.LogicDelete', 'cpu.itf.IEnterprise',
        'cpu.itf.IBuyerTenant',
      ],
    },
  }),

  card({
    page: '报价历史表头自定义项-lawbid_quotationrecord_QuotationRecordVODefine',
    uri: 'lawbid.quotationrecord.QuotationRecordVODefine',
    name: '报价历史表头自定义项',
    table: 'cpu_quotation_record_freedefine',
    app: 'ycSouringBid',
    version: 'BIP V5',
    status: 'verified',
    level: 'query-ready',
    fieldCount: 65,
    lacks: [],
    refs: 6,
    incoming: 1,
    outgoing: [
      {
        kind: 'depends',
        total: 4,
        sample: [
          'base.itf.AttrextItem', 'cpu.itf.IBuyerTenant', 'ucfbase.ucfbaseItf.IYTenant',
          'ucfbase.ucfbaseItf.LogicDelete',
        ],
      },
      {
        kind: 'reference',
        total: 2,
        sample: ['lawbid.quotationrecord.QuotationRecordVO', 'yht.tenant.YhtTenant'],
      },
    ],
    incomingGroups: [
      { kind: 'reference', total: 1, sample: ['供应商子表-lawbid_quotationrecord_QuotationRecordVO'] },
    ],
    unresolved: {
      total: 4,
      sample: [
        'base.itf.AttrextItem', 'ucfbase.ucfbaseItf.IYTenant', 'ucfbase.ucfbaseItf.LogicDelete',
        'cpu.itf.IBuyerTenant',
      ],
    },
  }),
]

/**
 * 引用一个实体的页面，给「缺口」页签里那个「看谁引用它」用。
 *
 * 宿主是真去扫整本索引，所以引用 `ucfbase.ucfbaseItf.IYTenant` 的那 1566 页这里只存了头 46 条
 * （够触发面板那条「还有 N 个页面」的上限提示）。没有预存到的 URI 退回缺口自己带的
 * 5 条 `citedBy`：那是索引留下的样本，不是全部，但一句话都不假。
 */
const CITERS: Readonly<Record<string, readonly string[]>> = {
  'ucfbase.ucfbaseItf.IYTenant': [
    '保证金缴纳方式-lawbid_calldocument_CallDepositPaymentMethod',
    '保证金缴纳方式-lawbid_tenderAnnouncement_CallDepositPaymentMethodTender',
    '报价历史表头自定义项-lawbid_quotationrecord_QuotationRecordVODefine',
    '报价历史物料表体-lawbid_quotationrecord_QuotationRecordMaterielVO',
    '报价历史物料价格梯度明细-lawbid_quotationrecord_QuotationRecordMaterielStepVO',
    '报价历史子表自由项特征组-lawbid_quotationrecord_QuotationRecordVOMaterielFreeCharacters',
    '报价清单-costquote.CpuCostPricing',
    '报价清单明细-costquote.CpuCostpricingDetail',
    '报价主表-pricecenter.BiDimensionPricing',
    '比价物料子表-lawbid_decisionprice_CpuPriceMaterialDetail',
    '比价主表-lawbid_decisionprice_CpuPrice',
    '变更公告-lawbid_noticechange_NoticeChangeClearVO',
    '变更公告关系-lawbid_noticechange_NoticeChangeClearSectionVO',
    '变更协同明细-workhandover.ApplyBuyercnDetail',
    '标段回执信息记录-lawbid_bidreceipt_CpuBidReceiptVO',
    '标段物料-lawbid_section_LawbidSectionMaterial',
    '标段信息-section.LawbidSection',
    '标段邀请供应商-lawbid_section_LawbidSectionSupplier',
    '标书缴纳方式-lawbid_calldocument_CallBidPaymentMethod',
    '标书缴纳方式-lawbid_tenderAnnouncement_CallBidPaymentMethodTender',
    '表单模板实例-templateinst.TplBillTemplateInst',
    '表单模板字段实例-templateinst.TplBillItemInst',
    '补录单中标明细子表自由项特征组-lawbid_decisionsupplement_CpuSupplementMaterialFreeCharacters',
    '补录单主表-lawbid_decisionsupplement_CpuSupplement',
    '补录供应商表-lawbid_decisionsupplement_CpuSupplementSupplier',
    '补录物料明细表-lawbid_decisionsupplement_CpuSupplementMaterial',
    '采购标书标包信息-lawbid_tenderAnnouncement_LawbidAnnouncementSectionTender',
    '采购标书外部发布渠道-lawbid_tenderAnnouncement_LawbidAnnouncementChannelTender',
    '采购定价要素-priceformula.PriceFactorAdjust',
    '采购定价要素详情-priceformula.PriceFactorAdjustDetail',
    '采购对账单明细-workhandover.ApplyPucheckbillDetail',
    '采购对账单孙表-pucheckbill.PuCheckMaterialVO',
    '采购对账单物料明细-workhandover.ApplyPucheckMaterialDetail',
    '采购对账单主表-pucheckbill.PuCheckBillVO',
    '采购方产品变更信息-buyerCn.CpuBuyerCnVO',
    '采购方式配置-purchasedoc.PurchaseDoc',
    '采购方式所设置的采购流程-lawbid_purchasedoc_PurchaseDocFlow',
    '采购方式子表-lawbid_noticetemplate_NoticeTemplatePurchaseMode',
    '采购公告-lawbid_announcement_LawbidAnnouncement',
    '采购公告标包信息-lawbid_announcement_LawbidAnnouncementSection',
    '采购公告合并-lawbid_tenderAnnouncement_LawbidAnnouncementTender',
    '采购公告外部发布渠道-lawbid_announcement_LawbidAnnouncementChannel',
    '采购公告邀请供应商-lawbid_announcement_LawbidInvitationSupplier',
    '采购公告邀请供应商-lawbid_tenderAnnouncement_LawbidInvitationSupplierTender',
    '采购合同表体费用-contract.ContractExpVO',
    '采购合同表体付款协议-contract.ContractPayTermVO',
  ],
  'base.itf.ITenant': [
    '销售订单-ClueParticipant',
    '元数据-aa_agentlevel_AgentLevel',
    '元数据-aa_channeltype_ChannelType',
    '元数据-aa_custcategory_CustCategory',
    '元数据-aa_custcategory_CustCategoryApplyRange',
    '元数据-aa_custcategory_CustCategoryDefine',
    '元数据-aa_customertype_CustomerType',
    '元数据-aa_deliverycorp_Deliverycorp',
    '元数据-aa_goodsposition_GoodsPosition',
    '元数据-aa_merchant_AddressInfo',
    '元数据-aa_merchant_AddressInfoDefine',
    '元数据-aa_merchant_AgentFinancial',
  ],
  'bip-usercenter.bip_user_ref': [
    '核对线索来源-verifyClueSourceDO',
    '期间结存明细-PeriodBalanceStockVO',
    '元数据-AAI_outSystemRegist_outSystemRegist',
    '元数据-archive_taxArchives_progressiveTaxRate',
    '元数据-archive_taxArchives_TaxBureauArchive',
    '元数据-archive_taxArchives_TaxCategoryArchive',
    '元数据-archive_taxArchives_TaxRateArchive',
    '元数据-archive_taxArchives_TaxRateArchiveDetail',
    '元数据-base_character_CharacterDomain',
    '元数据-base_character_CharacterDomainRelation',
    '元数据-bd_bank_BankVO',
    '元数据-bd_businessstep_BusinessPhase',
  ],
}

/** 命中强度，数字小的排前面 —— 与宿主的 `MATCH_RANK` 一致。 */
const MATCH_RANK: Readonly<Record<string, number>> = {
  uri: 0, table: 1, page: 2, name: 3, contains: 4,
}

/**
 * 一条查询词与一页的匹配强度，照抄 `src/host/wiki-service.ts` 的 `matchOf`：
 * 先比四个精确身份，再退到子串。`needle` 必须已经小写去空白。
 * @param entry - 一张卡（它带着命中判定要用的全部身份）。
 * @param needle - 查询词。
 * @returns 匹配方式，没匹配上就是 undefined。
 */
function matchOf(entry: WikiCardView, needle: string): string | undefined {
  const uri = entry.uri?.toLowerCase()
  const table = entry.table?.toLowerCase()
  const name = entry.name.toLowerCase()
  const id = entry.page.toLowerCase()
  if (uri === needle) return 'uri'
  if (table === needle) return 'table'
  if (id === needle) return 'page'
  if (name === needle) return 'name'
  if (uri?.includes(needle) === true || table?.includes(needle) === true) return 'contains'
  if (name.includes(needle) || id.includes(needle)) return 'contains'
  return undefined
}

/**
 * 一张卡变成一条命中：面板要的字段是卡片的一个子集。
 * @param entry - 命中的那一页。
 * @param matchedBy - 怎么匹配上的。
 * @returns 可以直接放进 `WikiSearchPayload.hits` 的命中。
 */
function hitOf(entry: WikiCardView, matchedBy: string): WikiSearchHit {
  return {
    page: entry.page,
    uri: entry.uri,
    name: entry.name,
    level: entry.level,
    matchedBy,
    ...(entry.table === undefined ? {} : { table: entry.table }),
    ...(entry.app === undefined ? {} : { app: entry.app }),
    ...(entry.fieldCount === undefined ? {} : { fieldCount: entry.fieldCount }),
  }
}

/**
 * 面板要的七个方法，全部已经 resolve。
 *
 * 只有一处会拒绝：`pageCard` 遇到不认识的页面名时，按宿主的原话抛
 * `没有名为「X」的页面。…` —— 面板会把它渲染成那条 `.error` 横幅和「重试」，
 * 所以点「引用者」里没预存卡片的页面时看到的失败态是真的，不是漏写。
 */
export const wikiApi: WikiApi = {
  listVaults(): Promise<WikiListPayload> {
    return Promise.resolve(WIKI_VAULTS)
  },

  rebuildVault(): Promise<WikiListPayload> {
    // 重建后索引内容不变（这一版的时间戳由 `indexFor` 的缓存给），所以返回同一份列表；
    // 面板那边「上次重建耗时」那一行是它自己掐的表，会照常多出来。
    return Promise.resolve(WIKI_VAULTS)
  },

  recentWrites(vault?: string, limit?: number): Promise<readonly WikiLogEntry[]> {
    if (vault === NOT_READY_ID) return Promise.resolve([])
    return Promise.resolve(limit === undefined ? WIKI_RECENT : WIKI_RECENT.slice(0, limit))
  },

  health(vault?: string): Promise<WikiHealthPayload> {
    if (vault !== undefined && vault !== READY_ID) return Promise.resolve({ reports: [] })
    return Promise.resolve(WIKI_HEALTH)
  },

  search(term: string, vault?: string, limit?: number): Promise<WikiSearchPayload> {
    const asked = term.trim()
    const needle = asked.toLowerCase()
    if (vault === NOT_READY_ID) return Promise.resolve({ term: asked, scanned: PAGES, hits: [] })
    const hits = WIKI_CARDS
      .map(entry => ({ entry, matchedBy: matchOf(entry, needle) }))
      .filter((found): found is { entry: WikiCardView, matchedBy: string } => found.matchedBy !== undefined)
      .map(({ entry, matchedBy }) => hitOf(entry, matchedBy))
      .sort((a, b) => (MATCH_RANK[a.matchedBy] ?? 4) - (MATCH_RANK[b.matchedBy] ?? 4)
        || a.page.localeCompare(b.page, 'zh'))
    return Promise.resolve({
      term: asked,
      scanned: PAGES,
      hits: limit === undefined ? hits : hits.slice(0, limit),
    })
  },

  pageCard(page: string, vault?: string): Promise<WikiCardPayload> {
    const wanted = page.replace(/\.md$/, '')
    const found = WIKI_CARDS.find(entry => entry.page === wanted)
    if (found === undefined || (vault !== undefined && vault !== READY_ID)) {
      return Promise.reject(new Error(
        `没有名为「${wanted}」的页面。先用搜索按表名或中文名找到确切的页面名。`,
      ))
    }
    return Promise.resolve({ card: found })
  },

  citers(uri: string, vault?: string): Promise<WikiCitersPayload> {
    if (vault === NOT_READY_ID) return Promise.resolve({ uri, pages: [] })
    const listed = CITERS[uri]
    if (listed !== undefined) return Promise.resolve({ uri, pages: listed })
    return Promise.resolve({ uri, pages: WIKI_GAPS.find(gap => gap.uri === uri)?.citedBy ?? [] })
  },
}
