/**
 * 技能面板（`SkillManager`）的预览 fixture。
 *
 * 用途只有一个：把 `preview/render.spec.tsx` 需要的那份"已 resolve 的
 * `SkillApi`"递过去，让面板能在一张静态 HTML 上被看清。所以这里**不发任何请求**，
 * 三个方法全部返回已经 resolve 的 Promise。
 *
 * 数据是照着真实情况造的，不是随手编的：
 * - 「插件提供」的 9 个名字与 `skills/` 目录一一对应，顺序按 `YON_BUNDLED_SKILLS`
 *   的名字序（`ncc-background-task` 打头），`source` / `provider` 用宿主真实值
 *   （`yon-panel` / `runtime`，见 `src/host/skill-registry.ts`）；
 * - 「其他全局技能」的 `source` / `provider` 用 `user-agents` / `filesystem`
 *   （见 `tests/skill-registry.spec.ts` 里的 `OPERATOR_SKILL`）；
 * - `description` / `whenToUse` 抄自 `skills/<name>/SKILL.md` 的 frontmatter，
 *   正文抄自同名正文的片段——两栏都要按真实体量排版才看得出问题。
 *
 * 条目量刻意做到 8 个以上：`SkillManager` 只在 `skills.length >= 8` 时才渲染搜索框
 * （`SEARCH_THRESHOLD`），少一个就看不到那个分支。
 * 同时两组都非空、且有 `enabled: false` 的行，否则分组标题和置灰行都不会出现。
 */
import type { SkillApi } from '../../src/client/skill/api.ts'
import type { SkillDetail, SkillView } from '../../src/shared/types.ts'

/** 「插件提供」组的来源标记，宿主同样用它把自有技能与操作者的区分开。 */
const YON_SKILL_SOURCE = 'yon-panel'

/** 运行时注册的提供方标记。 */
const RUNTIME_PROVIDER = 'runtime'

/** 操作者自己技能目录里的那批，来源与提供方。 */
const OPERATOR_SOURCE = 'user-agents'
const OPERATOR_PROVIDER = 'filesystem'

/**
 * 一行技能视图：字段与 `SkillView` 一一对应，`whenToUse` 缺省时整键不写
 * （真实服务端就是这么构造的，`exactOptionalPropertyTypes` 下不能塞 undefined）。
 * @param detail - 带正文的一条技能。
 * @returns 列表行。
 */
function asView(detail: SkillDetail): SkillView {
  return {
    name: detail.name,
    description: detail.description,
    ...detail.whenToUse === undefined ? {} : { whenToUse: detail.whenToUse },
    source: detail.source,
    provider: detail.provider,
    managed: detail.managed,
    enabled: detail.enabled,
    modelInvocable: detail.modelInvocable,
    userInvocable: detail.userInvocable,
  }
}

/** 插件自带的一条技能：可停用、来源固定、两个调用面都开。 */
function bundled(
  base: Pick<SkillDetail, 'name' | 'description' | 'content'> & {
    readonly whenToUse?: string
    readonly enabled?: boolean
  },
): SkillDetail {
  return {
    name: base.name,
    description: base.description,
    ...base.whenToUse === undefined ? {} : { whenToUse: base.whenToUse },
    source: YON_SKILL_SOURCE,
    provider: RUNTIME_PROVIDER,
    managed: true,
    enabled: base.enabled ?? true,
    modelInvocable: true,
    userInvocable: true,
    content: base.content,
  }
}

/** 操作者自己技能目录里的一条：只读，面板不给开关。 */
function operator(
  base: Pick<SkillDetail, 'name' | 'description' | 'content'> & {
    readonly whenToUse?: string
    readonly userInvocable?: boolean
    readonly modelInvocable?: boolean
  },
): SkillDetail {
  return {
    name: base.name,
    description: base.description,
    ...base.whenToUse === undefined ? {} : { whenToUse: base.whenToUse },
    source: OPERATOR_SOURCE,
    provider: OPERATOR_PROVIDER,
    managed: false,
    // 不是本插件的东西，永远算「在提供中」——面板不该暗示它能改动。
    enabled: true,
    modelInvocable: base.modelInvocable ?? true,
    userInvocable: base.userInvocable ?? true,
    content: base.content,
  }
}

/**
 * 13 条技能，排序与真实合并列表一致：本插件自己的在前，操作者的在后。
 *
 * 第一条（`ncc-background-task`）的正文最长，因为面板一打开就默认选中第一行、
 * 右栏底部直接把这段正文摊出来——默认那一屏的排版问题基本都在这里暴露。
 */
export const SKILL_DETAILS: readonly SkillDetail[] = [
  bundled({
    name: 'ncc-background-task',
    description: 'NCC（用友NC Cloud）后台任务开发技能。当用户需要编写、生成、审查 NCC 后台任务插件代码时使用此技能。 触发场景包括但不限于：写一个后台任务、定时任务、计划任务、定时执行、后台任务插件、 IBackgroundWorkPlugin、executeTask、PreAlertContext、PreAlertObject、阈值配置、 后台任务注册、后台任务部署、NCC客开、NCC二开、用友NC Cloud后台任务开发、NCC定制开发。',
    content: `# NCC 后台任务开发指南

> **本技能引用的文档**都在插件的参考库里，路径形如 \`ncc/ncc-background-task/references/xxx.md\`。
> 用 \`knowledge_read\` 传该路径读全文，或先用 \`knowledge_search\` 按关键词搜索；
> **不要**按相对路径去猜文件位置——内联的正文里没有路径可解析。

## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**（非旗舰版 BIP）。

> **版本区分**：旗舰版（BIP）→ \`yon-bip-dev\` | NCC → \`ncc-asset-hawk\`
>
> 收到问题时务必先判断版本。记录问题时注意路由到对应的技能目录。

---

> **本 skill 是 \`ncc-dev\`（NCC 定制开发总技能）的子技能，专注于后台任务插件开发。**
> 通用素材（编码规范、通用 API）请查阅 \`ncc/ncc-dev/references/common/\` 目录。

## 接口源码（官方）

> 以下为 \`IBackgroundWorkPlugin\` 接口的官方源码，**务必严格遵守注释中的约束**。

\`\`\`java
package nc.bs.pub.taskcenter;

import nc.bs.pub.pa.PreAlertObject;
import nc.vo.pub.BusinessException;

/**
 * <b>后台任务 插件类 接口.</b>
 *
 * @author huangzg 2007-5-14
 * @since v5.02
 */
public interface IBackgroundWorkPlugin
{
    /**
     * 任务插件执行体
     *
     * @param bgwc 执行环境
     * @return <tt>PreAlertObject</tt>
     *            该返回值不允许为null！
     * @throws BusinessException
     */
    PreAlertObject executeTask(BgWorkingContext bgwc) throws BusinessException;
}
\`\`\`

### 接口注释要点（必须遵守）

1. **返回值不允许为 null！** — \`executeTask\` 必须返回一个非空的 \`PreAlertObject\`；
2. **成功但不需要发消息时**：把 \`returnType\` 设为 \`PreAlertReturnType.RETURNNOTHING\`；
3. **参数类型**：接口签名里是 \`BgWorkingContext bgwc\`（包 \`nc.bs.pub.taskcenter\`）。

### BgWorkingContext / PreAlertContext API

| 方法 | 返回类型 | 说明 |
|------|---------|------|
| \`getKeyMap()\` | \`KeyMap\` | 获取所有阈值参数，通过 \`.get("参数名")\` 取值 |
| \`getPk_orgs()\` | \`String[]\` | 获取当前任务部署时选择的组织主键数组 |
| \`getGroupId()\` | \`String\` | 获取当前集团主键 |

**典型用法**：

\`\`\`java
KeyMap keyMap = bgwc.getKeyMap();
String paramValue = (String) keyMap.get("参数名");

String[] pkOrgs = bgwc.getPk_orgs();
// pkOrgs 可能为 null 或空数组，需要判断
if (pkOrgs != null && pkOrgs.length > 0) {
    // 按组织过滤
} else {
    String pkGroup = bgwc.getGroupId();
}
\`\`\`

## 部署前自查

- 任务条目是否已经在 \`pub_taskcenter\` 里注册；
- 阈值参数名是否与代码里 \`keyMap.get(...)\` 的字符串逐字一致；
- 组织范围为空时走的是集团分支，别把"没选组织"当成"没有数据"。`,
  }),

  bundled({
    name: 'ncc-dev',
    description: 'NCC（用友NC Cloud）定制开发总技能，涵盖业务插件、后台任务、参照、业务扩展等多种开发场景。 触发场景包括但不限于：NCC客开、NCC二开、用友NC Cloud插件开发、NCC定制开发、 写一个业务插件、写一个事件监听、NCC事件监听、IBusinessListener、doAction、 后台任务、计划任务、定时任务、NCC后台任务开发、 参照、NCC参照开发、自定义参照、 业务扩展、扩展点、NCC扩展开发、 单据转换 runChangeDataAry、saveCommit 保存提交、 编码规则、单据编号、编码规则开发、 自定义档案、DefdocVO、档案同步、 采购发票/销售订单/库存单据的业务插件开发、 审批后/新增后/修改后的事件监听。',
    content: `# NCC 定制开发总指南

> **本技能引用的文档**都在插件的参考库里，路径形如 \`ncc/ncc-dev/references/xxx.md\`。
> 用 \`knowledge_read\` 传该路径读全文，或先用 \`knowledge_search\` 按关键词搜索。

## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**。旗舰版（BIP）请用 \`yonyou-bip-dev\`。

## 子技能分工

| 子技能 | 管什么 |
|--------|--------|
| \`ncc-plugin-dev\` | 业务插件 / 事件监听器（\`IBusinessListener\`、\`doAction\`） |
| \`ncc-background-task\` | 后台任务插件（\`IBackgroundWorkPlugin\`） |

## 通用约定

- 编码规范、通用 API 在 \`ncc/ncc-dev/references/common/\` 下；
- 客开代码不要改产品类，走扩展点或插件注册；
- 单据转换、编码规则、自定义档案各自的细节在各子技能里。`,
  }),

  bundled({
    name: 'ncc-plugin-dev',
    description: 'NCC（用友NC Cloud）业务插件（事件监听器）开发技能。当用户需要编写、生成、审查 NCC 业务插件代码时使用此技能。 触发场景包括但不限于：写一个审批后/新增后/修改后的事件监听、销售订单审批后自动生成采购入库单、 单据审批后自动回写字段、写一个业务插件、NCC事件监听、IBusinessListener、doAction、 单据转换 runChangeDataAry、saveCommit 保存提交、采购发票/销售订单/库存单据的业务插件开发、 NCC客开、NCC二开、用友NC Cloud插件开发、NCC定制开发。',
    // 装了 `ncc-dev`（总技能）之后这条子技能就是重复的，关掉它是最常见的真实状态，
    // 也顺手给了第二个置灰行样本。
    enabled: false,
    content: `# NCC 业务插件开发指南

## 接口

\`\`\`java
public interface IBusinessListener {
    void doAction(ActionType actionType, AggregatedValueObject billVO,
                  Object[] userObj, Object[] customObj) throws BusinessException;
}
\`\`\`

## 约定

- 只处理自己关心的 \`actionType\`，其余直接返回；
- 抛 \`BusinessException\` 而不是运行时异常，否则前端提示不可读；
- 同一个单据上多个监听器按注册顺序执行，别依赖它们的先后。`,
  }),

  bundled({
    name: 'yon-db-query',
    description: '查用友客开环境的数据。先用 datasource_list 看插件里登记了哪些库，再用 datasource_query 执行 SQL；连接信息、驱动与密码都由插件宿主处理，不需要你去拼连接串或找脚本。',
    whenToUse: '使用者要求查某个项目/环境的数据、验证一条 SQL、核对表结构或数据是否符合预期时。',
    content: `# 查用友环境的数据

> 这个技能由 \`dsh-plugin-yon-panel\` 插件预制：安装插件时它自动进入技能目录，卸载时自动消失。

## 两个工具，不要绕开

| 工具 | 用途 |
|---|---|
| \`datasource_list\` | 看有哪些数据源：项目、环境、类型、地址、可用登录名 |
| \`datasource_query\` | 对指定数据源执行一条 SQL |

**不要**自己去找 \`db_query.py\`、也不要拼 \`python ... -p xxx -e test\` 这类命令：插件的安装路径每台机器都不同，
而工具已经把连接解析、驱动选择、超时和结果格式化都做完了。

## 推荐顺序

1. \`datasource_list\` —— 看清有哪些环境、各自的 \`key\`、类型和登录名；
2. 用**完整 key**（形如 \`项目名::环境\`）执行 \`datasource_query\`；
3. 结果里出现"0 行"先确认 where 条件，别急着改 SQL。`,
  }),

  bundled({
    name: 'yon-devkit',
    description: '用友客开项目的配置入口。先用 Yon 面板登记的项目信息读取环境地址、账号、部署路径、版本号，再去查代码或连环境，避免重复询问使用者。',
    whenToUse: '使用者提到某个用友客开项目（NCC/BIP）的环境、地址、账号、部署路径、版本号，或说"接着上次那个项目继续"时。',
    // 正文里自己写着"占位内容"，这种技能被关掉是最合理的状态，顺手当置灰行的样本。
    enabled: false,
    content: `# Yon 用友客开工作台

> 这个技能由 \`dsh-plugin-yon-panel\` 插件预制：安装插件时它自动进入技能目录，卸载插件时自动消失。
>
> **当前是占位内容**，用来验证"插件预制技能"的完整链路。

## 先查配置，再问人

- 面板：侧边栏底部的 \`Y\` -> 文件夹图标 -> 项目管理
- 模型工具：\`project_list\`、\`project_read\`、\`project_create\`、\`project_update\`、\`project_delete\`

推荐顺序：

1. \`project_list\` 看已登记的项目；
2. \`project_read\` 读目标项目的全部字段（环境地址、账号、部署路径、版本号……）；
3. 只有字段里确实没有的信息，才去问使用者或连环境确认。`,
  }),

  bundled({
    name: 'yon-digest',
    description: '把源素材（PDF 抽取文本、文档、网页转成的文本）消化成知识库页面。四步流程：先跑重叠门禁判断值不值得做，再用 digest_plan 摸底拿分段范围，按页面规范写主题页，最后用 digest_audit 验收。当用户要求"消化这份文档/PDF/资料进知识库"、"把这份资料整理成知识页"、"把红皮书/手册入库"时使用。注意：只是"读一下这份 PDF 说说写了什么"不需要这个技能。',
    whenToUse: '当需要把一份源素材变成知识库页面时——用户说"消化"、"入库"、"整理进知识库"，或要求把一份长文档变成可查的页面。也适用于判断一份素材值不值得消化。',
    content: `# 消化一份素材

四步，一步都不能跳。**每一步的产出都从工具拿，不要凭印象做。**

\`\`\`
0  素材准备    PDF 先抽成带页标记的文本          没有文本后面全做不了
1  重叠门禁    digest_audit（不给 product）      值不值得做
2  摸底        digest_plan                       分几章、每章从哪行到哪行
3  写页面      按下面的规范写                    按体量分页
4  验收        digest_audit（给 product）        七项全过才算完
\`\`\`

## 七项判定

| 项 | 看什么 |
|---|---|
| terms | 术语是否被用上 |
| identifiers | 标识符（表名、类名、参数名）是否保住 |
| level1 / level2 | 一二三级标题是否成结构 |
| constraints | 约束（必须/禁止/上限）有没有丢 |
| fidelity | 有没有编造原文没有的话 |
| provenance | 每段能否指出出处 |
| addressable | 结论能不能被单独引用 |

> 门禁不过就不要往下做：写出来的页面会一直是"待修"，比没写更贵。`,
  }),

  bundled({
    name: 'ncc-asset-hawk',
    description: 'NCC（用友 NC Cloud）客开技能。当用户提到 NCC、NC Cloud、NCC2111、NCC2312、NCC2207、 或 NCC 特有的开发模式（资产包接口开发、业务插件/事件监听器 IBusinessListener、 单据转换 IPfExchangeService、集成规则 pub_interule、对照表 pub_intecontrast、 REST API Resource 继承 AbstractRestResource、华科客开模式、OpenAPI 路由注册等）时， 必须使用此技能。也包括 NCC 数据库问题、NCC 服务器问题等。',
    content: `# NCC（NC Cloud）客开技能

> **本技能引用的文档**都在插件的参考库里，路径形如 \`ncc/references/xxx.md\`。

## 强制规则：版本区分

用友有两个主要产品线，**表结构、实体名、数据字典完全不同**，绝不能混用：

- **NCC（NC Cloud）** <- 本技能 \`ncc-asset-hawk\`
- **旗舰版（BIP / YonBIP）** -> 对应技能 \`yonyou-bip-dev\`

收到问题时，第一步必须是判断版本；版本不明确就主动问，不要猜。`,
  }),

  bundled({
    name: 'yon-wiki',
    description: '查用友知识库里的实体、物理表与字段。写 SQL 或写代码要落到具体表名/列名之前，先用 wiki_lookup 找到实体页，再用 wiki_read 读它的字段清单；不要凭记忆编造表名或列名。',
    whenToUse: '需要确认某个用友单据/实体/业务对象对应的物理表名、数据库列名、domain/schema，或看到报错里的表名、代码里的实体 URI 想弄清它是什么时。',
    content: `# 查用友知识库

> 这个技能由 \`dsh-plugin-yon-panel\` 插件预制。
> 知识库位于使用者自己的 Obsidian vault 里，路径由插件管理，**不需要你去翻目录**。

## 什么时候必须用它

**写 SQL 之前、写涉及表名或字段名的代码之前。** 用友实体到数据库表的对应关系不适合靠记忆：

- 同一业务概念在不同产品线（BIP / NCC）底层表完全不同；
- 引用型字段的 \`name\`（Java 驼峰名）和 \`fieldName\`（数据库列名）经常不一致；
- 字段编码、枚举取值这类细节，猜错不会报错，只会静默查出错数据。

## 两个工具

| 工具 | 用途 |
|---|---|
| \`wiki_lookup\` | 用一个名字找页面：实体 URI、物理表名、中文名都可以 |
| \`wiki_read\` | 读某个页面的全文，含字段清单与 domain/schema |`,
  }),

  bundled({
    name: 'yonyou-bip-dev',
    description: '用友 BIP 旗舰版客开技能（YonBIP / 旗舰版 / BIP）。 触发场景：BIP 平台开发、SuperDO/BPO 实体扩展、YMS 异步任务、 单据模板/元数据/字段名查询、OpenAPI、MDF 前端扩展、 旗舰版数据库问题、旗舰版环境配置、Arthas 诊断。 注意：NCC / NC Cloud 产品线请使用 ncc-asset-hawk 技能，勿混用。',
    content: `# 用友 BIP 客开技能

> **本技能引用的文档**都在插件的参考库里，路径形如 \`bip/references/xxx.md\`。

## 强制规则：版本路由

- **旗舰版（BIP / YonBIP）** <- 本技能
- **NCC（NC Cloud）** -> 对应技能 \`ncc-asset-hawk\`

用户问题里出现 "NCC" 就不要用本技能的参考资料；版本不明确时先问。

## 常用入口

- 元数据管理页面 \`{域名}/iuap-metadata-base/index.html\`：查实体的 domain / schema；
- 字段三件套：字段编码 = name（Java 驼峰）、字段名 = fieldName / columnName、显示名 = displayName；
- 写 SQL 之前先按 \`yon-wiki\` 的路子确认物理表，别从 API 路径反推表名。`,
  }),

  operator({
    name: 'nc65-fixed-asset-sync',
    description: '现代保险 NC65 固定资产集成的现场笔记：H1-00 / HG-01 / HG-14 三个接口的报文字段、集成规则与踩过的坑。改这三个接口的代码或对数据之前先读它。',
    whenToUse: '用户提到现代保险、NC65 固定资产、H1-00 / HG-01 / HG-14，或要核这三个接口的数据时。',
    content: `# 现代保险 NC65 固定资产集成

## 三个接口

| 编号 | 方向 | 说明 |
|---|---|---|
| H1-00 | NC65 -> 华科 | 固定资产卡片推送 |
| HG-01 | 华科 -> NC65 | 折旧结果回写 |
| HG-14 | 华科 -> NC65 | 处置结果回写 |

## 集成规则（两条）

1. 组织范围按 \`pk_org\` 过滤，空值走集团，不要当成"全部组织"；
2. 回写只认外部主键，找不到就整体拒绝，不要新建。

## 坑

- 卡片上的 \`pk_group\` 与 \`pk_org\` 不是同一 ID 空间，混用会静默写错行；
- 华科侧的时间戳是本地时区，比对时先统一。`,
  }),

  operator({
    name: 'ones-timesheet-sync',
    description: '把 BIP 侧的工时同步到 ONES。规则里有一条：无项目工时不参与同步，过滤条件漏掉就会打出一批无效请求。改同步脚本或对数之前先看这页。',
    // 这条故意不给 whenToUse：细节页的「触发时机」整行消失，最容易被样式改坏。
    content: `# ONES 工时同步

## 为什么要过滤 projectCode

ONES 里 \`projectCode\` 为 \`/\` 的工时属于"无项目"，BIP 侧没有对应载体。
同步时不过滤会打出一批注定失败的请求，日志被噪声淹没，真实故障反而看不见。

\`\`\`ts
const rows = timesheets.filter((row) => row.projectCode !== '/')
\`\`\`

## 对数方法

按 (人, 日期) 聚合后比对总工时，差值为 0 才算过；只看条数会漏掉"换了项目"的错行。`,
  }),

  operator({
    name: 'bip-report-org-tree',
    description: 'BIP 组织树报表的手册：上卷口径、子级数量统计、两个 ID 空间怎么区分。做这类报表或改它的取数逻辑时照着走。',
    whenToUse: '要做或要改 BIP 组织树报表（上卷、子级数量、合计）时。',
    // 只能人手动触发的技能：模型不该自动挑它。
    modelInvocable: false,
    content: `# BIP 组织树报表

## 三个坑

1. **两个 ID 空间**：报表参数里的组织 ID 和实体表的 \`pk_org\` 不是一回事，先各自查一次确认；
2. **innercode 可能已经坏了**：不要用它推父子关系，按 \`parent\` 递归；
3. **合计不能对子级求和**：同一笔业务挂多组织时会重复计数，合计必须单独取数。

## 口径

- 上卷按 \`parent\` 逐层累加，层级深度以配置为准；
- 子级数量统计"直接下级"，不含孙级；
- 口径差异写在报表页脚，别只写代码注释里。`,
  }),

  operator({
    name: 'ncc-patch',
    description: '打 NCC 补丁包：客开代码改完之后怎么打包、放到服务器的哪个目录、怎么确认服务器认到的是新类而不是缓存里的旧类。现场更新按这页走。',
    whenToUse: '要把改完的 NCC 客开代码更新到现场服务器，或更新后行为没变化要排查是不是没生效时。',
    content: `# NCC 补丁包

## 顺序

\`\`\`text
1  本地编译通过（含客开工程依赖的产品包版本要对上）
2  只打包改动的类，不要整包覆盖
3  停服务 -> 放补丁目录 -> 清缓存目录 -> 起服务
4  确认生效：改一处能看见的日志或字段，别只看"启动成功"
\`\`\`

## 常见"没生效"

| 现象 | 多半是 |
|---|---|
| 行为完全没变 | 放错目录，或产品包里还有一个同名类抢先 |
| 时好时坏 | 集群只更新了一台 |
| 报类找不到 | 补丁依赖的类没一起打进去 |`,
  }),
]

/** 预览里可切的那份开关状态；面板自己不发请求，翻转就记在这里。 */
const switches = new Map<string, boolean>()

/**
 * 按名取一条技能，`enabled` 用预览内的开关状态覆盖。
 * @param name - 技能标识。
 * @returns 记录，找不到时返回 undefined。
 */
function find(name: string): SkillDetail | undefined {
  const found = SKILL_DETAILS.find((item) => item.name === name)
  if (found === undefined) return undefined
  const flipped = switches.get(name)
  return flipped === undefined ? found : { ...found, enabled: flipped }
}

/**
 * 交给 `SkillManager` 的完整 props（`t` / `onClose` 由 spec 自己给）。
 *
 * 三个方法都返回已 resolve 的 Promise，**没有任何网络调用**：
 * - `listSkills` 剥掉正文，与真实接口一致（列表不带正文）；
 * - `getSkill` 在未知名字上抛错，消息抄宿主原文，好让错误分支也能被预览到；
 * - `setSkillEnabled` 只改预览内的开关表，并且**拒绝非本插件技能**（宿主是 404，
 *   面板也从不请求它，这条只是把契约写实）。
 */
export const SKILL_API: SkillApi = {
  async listSkills() {
    return { skills: SKILL_DETAILS.map(asView), complete: true }
  },

  async getSkill(name: string) {
    const found = find(name)
    if (found === undefined) throw new Error(`no skill "${name}" is shipped by this plugin`)
    return found
  },

  async setSkillEnabled(name: string, enabled: boolean) {
    const found = find(name)
    if (found === undefined || !found.managed) {
      throw new Error(`no skill "${name}" is shipped by this plugin`)
    }
    switches.set(name, enabled)
    return { ...found, enabled }
  },
}
