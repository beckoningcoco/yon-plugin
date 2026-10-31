# NCC 元数据扩展字段（改 bmf）

给标准实体的物理表加字段、并让前端列表/卡片能渲染、能按它查询过滤时用。

## 零、接到这类任务时，产出固定是三个东西

元数据字段扩展的完整流程就是三步，**三个产出缺一不可**：

| 步骤 | 产出 | 交给谁 |
|---|---|---|
| 1. 改元数据 | **修改后的 bmf 文件**，按 Home 目录结构放在 `modules/<模块>/METADATA/` | 随补丁发布 |
| 2. 扩表 | **加字段的 DDL SQL，单独一个 .sql 文件** | **必须交给用户执行，自己不允许执行** |
| 3. 扩 VO | **VO 源码 + 编译后的 class**，源码按 Home 目录结构放 `modules/<模块>/classes/`，class 同路径 | 随补丁发布 |

**第 2 步的纪律**：DDL 只写不跑。不管表里现在有没有那一列、不管多大把握，都交给用户执行。理由很实在——加列是结构变更，跑错或跑重复都可能影响生产数据，这个决定权不在模型手上。

**DDL 不进补丁包**：它**不在 `replacement/` 结构下**，是一个**独立的 .sql 文件**，单独交付，不和 bmf / VO 混在同一个压缩包或目录里。

### 三个产出的改动顺序

**bmf 改哪一份**：

```
1. 先比 Home 和工程里那份，看哪份是"最新一版"
   · 一般两边一样
   · 不一样 → 不猜，问用户
2. 优先改工程里的（<工程>/METADATA/<实体>.bmf）
3. 工程里没有 → 把 Home 那份复制进工程，再改
4. 改完同步回 Home
```

**VO**：先在**工程里**写（`<工程>/epmp/src/public/...`），写完顺手编译一份 `.class` 放进 Home 对应目录。

---

## 一、先搞清三件事再动手

### 1. 实体和表是哪两个名字

bmf 里一眼能看到：

```
<entity name="tbb_task" tableName="tb_md_task" fullClassName="nc.vo.tb.task.MdTask" isCreateSQL="true" ...>
```

- `name` = 实体名（bmf 文件名一般就是它）
- `tableName` = 物理表
- `fullClassName` = 对应 VO

### 2. `isCreateSQL` 决定"要不要建列"

```xml
isCreateSQL="true"
```

**这是整个改动里最关键的一个属性**：

| 值 | 含义 | 加字段后 |
|---|---|---|
| `true` | 元数据驱动建表 | **表里必须有这一列**，没有会出问题 |
| `false` | 表由别处维护 | 可以只有虚拟字段 |

所以：**只要实体是 `isCreateSQL="true"`，加 attribute 就必须同步加列**，两者不能只做一个。

> 踩过的坑：先只改前端 `initTemplate.js` 加列、不改 bmf，前端渲染器直接跳过——因为元数据里没这个字段。反过来只改 bmf 加列、不加 attribute，前端也拿不到。

### 3. bmf 文件在哪

```
<HOME>/modules/<模块>/METADATA/<实体名>.bmf
```

例：

```
E:\NCProject\NCC1909\shouchuang\home\ncc1909new\modules\epmp\METADATA\tbb_task.bmf
```

同目录可能还有名字相近的**另一个实体**（`tbb_taskdef.bmf` = 任务定义，`tbb_task.bmf` = 任务实例），**别改错**。

## 二、attribute 的结构

字段定义是 `<attributelist>` 里的一个自闭合 `<attribute>`：

```xml
<attribute displayName="快报推送状态"
           fieldName="bgr_fast_status" name="bgr_fast_status"
           dbtype="varchar" fieldType="varchar" length="101"
           dataType="BS000010000100001001" dataTypeStyle="SINGLE"
           typeName="String" typeDisplayName="String"
           classID="19f8e021-4bed-4cc4-85cc-80106ddd3a0b"
           id="7b5a3ba3-f13e-4d79-91e9-82ccce1181c4"
           resid="" sequence="30"
           isActive="true" isNullable="true" isReadOnly="false"
           isSource="true" isKey="false" isShare="false"
           visibility="public" versionType="0" />
```

### 必须自己填的（复制现成字段再改）

| 属性 | 怎么填 |
|---|---|
| `fieldName` / `name` | **两处必须一样**，且等于物理列名（小写、下划线） |
| `displayName` | 界面显示的中文名 |
| `sequence` | 排在现有最大值之后（查同级 `<attribute>` 的 sequence） |
| `id` | **新的全局唯一 GUID**，不能和任何现有对象重复。用算法生成唯一值即可 |
| `length` | 按实际需要。**String 类型填 101 也没有问题**（元数据工具默认值），不用特意改成 2 |
| `resid` | 资源号，只和多语有关。**留空没有风险**，不会影响校验或导出 |

### 直接抄现成的

| 属性 | 取值 |
|---|---|
| `classID` | 抄**同一实体**其它 attribute 的（就是 entity 的 `id`） |
| `dataType` | 字符串字段抄 `BS000010000100001001` |
| `typeName` / `typeDisplayName` | `String` / `String` |
| `dataTypeStyle` | `SINGLE` |
| `visibility` | `public` |
| `versionType` | `0` |
| `isActive` | `true` |

## 三、改完 bmf 之后

按依赖顺序，**一处都不能漏**：

```
1. bmf 加 attribute（isCreateSQL=true 时表必须有列）
        ↓
2. 加物理列（DDL 或让平台按 bmf 建）
        ↓
3. VO 加字段 + getter/setter（SuperVO 靠反射 getter 取属性）
        ↓
4. 后端把值塞进响应的 values（列表页往往不是 VO 直出，
   而是工具类逐字段 values.put —— 不加这一句，前端永远拿不到）
        ↓
5. 前端加列 / 加查询条件（attrcode 必须和 fieldName 完全一致）
        ↓
6. **用管理员账号升级元数据**
        ↓
7. **重启服务**（不重启不生效）
```

**第 6 步不能省**：改完 bmf 只是改了文件，平台不认。必须用**管理员账号在系统里执行"升级元数据"**，把新的元数据装进去。**升级完还要重启服务**，两步都做完才生效。

### 第 4 步：先抓一次响应，别猜

**列表响应的 `values` 有两种来源，不同页面不一样**：

| 类型 | 表现 | 加字段后要做什么 |
|---|---|---|
| **VO 直出** | `values` 里的字段数 ≈ 表列数 | 只加 bmf + VO getter 就够 |
| **手工拼装** | `values` 只有十几二十个字段，远少于表列数 | **必须去拼装代码里补 `values.put`**，否则前端永远拿不到 |

**判断方法**：改之前先抓一次列表响应，数一下 `values` 的 key 数量，和表的实际列数比。差得远就是手工拼装。

手工拼装的典型形态（`nccloud` 层常见）：

```java
JSONObject values = new JSONObject();
values.put("pk_obj", temp);
values.put("objname", temp);
// ... 逐字段写，写了哪些就只回哪些
```

这种情况下**光在 bmf 加字段、光给 VO 加 getter 都没用**，必须在这个工具类里补一句。

**怎么找到它**：在全 Home 的 jar 里搜 `.class` 字节，看哪个类同时含几个该实体的列名字符串常量（反编译后就是那个 `values.put` 的地方）。

## 四、bmf 改动的"假差异"

用 NCC 元数据工具打开再保存，会顺带刷一堆和功能无关的东西。**review 时可以直接忽略**：

| 表现 | 说明 |
|---|---|
| `modifier=""` → `modifier="yonyouBQ"` | 保存人 |
| `version="47"` → `"50"` | 版本自增 |
| 大量 `modifyTime` 变成当前时间 | 保存时间戳 |
| `height="384"` → `"415"`、`x`/`y` 微调 | 画布尺寸和坐标 |
| `<dependfile>` 顺序变化 | 集合无序，无害 |

**真正的实质改动只有新加的 `<attribute>`**。对比两个 bmf 时，用 `diff` 然后只看含 `fieldName=` 的新增行即可。

## 五、字段命名一致性检查清单

同一个字段在五个地方出现，**大小写和下划线必须完全一致**：

```
bmf:        fieldName="bgr_monthly_status"
物理列:      BGR_MONTHLY_STATUS          （Oracle 自动大写）
VO getter:   getBgr_monthly_status()
values key:  values.put("bgr_monthly_status", ...)
前端 attrcode: 'bgr_monthly_status'
```

> 踩过的坑：bmf 里先写成 `bgr_month_status`，代码里是 `bgr_monthly_status`，两边对不上、前端一直空白。这类错**不会报异常**，只会静默不显示。

## 六、要不要扩业务表：先想清楚

扩 bmf + 加列意味着**改了标准产品的元数据**，升级时会被覆盖，且表结构多两列。

适用判断：

| 场景 | 建议 |
|---|---|
| 值要**参与查询过滤、分页、排序** | 扩表（普通列过滤，不用改拼 SQL 的公共逻辑） |
| 值只是**展示**、且能从别的表实时算 | 别扩表，在拼 values 的地方现查 |
| 值要**被别的模块引用** | 扩表 |

> 实测教训：为了"不扩表"改用子查询过滤，要改 `getStringByQueryArea` 这种公共拼 SQL 逻辑，分页总数全受影响，比扩表麻烦得多。

## 七、本次实例（2026-10-30 · 首创环保 NCC1909）

给 `tb_md_task` 加快报/月报推送状态：

| 项 | 值 |
|---|---|
| 实体 | `tbb_task` → 表 `tb_md_task` → VO `nc.vo.tb.task.MdTask` |
| bmf | `<HOME>/modules/epmp/METADATA/tbb_task.bmf` |
| 新字段 | `bgr_fast_status`（快报推送状态）、`bgr_monthly_status`（月报推送状态），`length=101`、`resid` 留空 |
| `isCreateSQL` | `true` → 必须加列 |
| 响应拼装 | `nccloud.web.bgr.urgereport.util.UrgeReportUtil#getJSONObjectByMdWork` —— **手工拼装类型**，必须补 `values.put` |
| 回写规则 | 该任务全部报文推送成功 → 置已报送；部分成功 / 未推送 → 未报送 |

**这个例子里踩的坑**：bmf 里字段先写成 `bgr_month_status`，代码里写的是 `bgr_monthly_status`，两边差两个字母，前端一直空白、也不报错。命名一致性必须逐个核对。
