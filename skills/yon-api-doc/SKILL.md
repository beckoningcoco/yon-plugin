---
name: yon-api-doc
description: 设计并生成用友接口文档（Excel）。当需要为 NCC / 旗舰版（BIP）的接口编写「接口字段说明文档」、给外系统（九恒星、OA、司库、商旅等）的对接文档，或把已有接口整理成可交付的 Excel 时使用：一个页签一个接口，固定「接口信息 / 输入参数 / 输出参数 / 报文样例 / 错误码」结构。也用于审查、补全现成的接口文档。
whenToUse: 写接口文档、接口字段说明、对接文档、给外系统的接口说明、Excel 接口文档、补接口文档、接口文档模板、字段说明表
---

# 用友接口文档设计（Excel）

> 产出物：一个 `.xlsx`，**一个页签 = 一个独立接口**。
> 适用：NCC（NC Cloud）与旗舰版（BIP / YonBIP）。两条产品线的字段名不同，但文档结构相同。

---

## 一、总原则

1. **一个页签一个接口**，页签名：`{接口名}_接口文档V{版本}`（如 `数智合同保存生效_接口文档V1`）。
2. 每个页签固定四块，顺序不变：
   `一、接口信息` → `二、输入参数列表`（含请求样例）→ `三、输出参数列表`（含响应样例）→ `四、错误码`。
3. **NCC 接口文档不写鉴权与公共调用参数**：`client_id`、`client_secret`、`access_token`、请求头、签名算法、环境地址、敏感信息这类内容另有独立的《接入说明》文档，**不要写进接口文档**。接口文档只描述业务字段与报文；外系统看本文档时，手上应已有一份接入说明。
4. **错误码放页签末尾**，同一个页签的错误码只列本接口会返回的。
5. 文档里的字段必须能在代码 / 元数据 / 集成规则里找到出处，**禁止编造**。写之前先确认：
   - 代码：`Resource.java` 里 `transferDoc` / `transferBill` 的 `billType` 与字段映射
   - 集成规则：`pub_interuleitem` 里配了哪些 `VFIELD` / `VEXTFIELD`（**没配的字段会被框架静默丢弃**）
   - 实体字段：NCC 用 `ncc_meta_detail`，BIP 用 `bip_meta_detail`
6. **字段拿不准就先问使用者，不要猜**：必填性、长度、取值范围、枚举字典、参照的是哪个档案、报文 key 叫什么、是否参与查询——只要有一项不确定，就停下来问。宁可少写一列，也不要填一个看起来合理的值；更不要把"待确认"留在交付的文档里。
7. 生成前先列一份"待确认清单"给使用者：`字段 / 我掌握的信息 / 需要你确认的点`，确认完再落 Excel。

---

## 二、页签结构

### 1. 一、接口信息

键值对排布，两列一组（A 标签、B 值；D 标签、E 值），接口地址整行合并。

| 项 | 示例 |
|---|---|
| 接口名称 | 项目档案新增 |
| 接口方式 | HTTP（POST） |
| 接口地址 | `http://{host}/nccloud/api/uapbd/newproject/add` |
| 请求格式 | json |
| 文档版本 / 更新日期 | V1 / 2026-10-21 |

> 接口信息只列以上 5 项。**鉴权、token 获取、请求头、签名、环境地址、client_secret 一律不写**——这些属于独立的《接入说明》文档。

### 2. 二、输入参数列表

表头 8 列：

| 序号 | 参数名称 | 类型 | 必填 | 中文名 | 接口标准说明 | 业务系统传递说明 | 约束 |
|---|---|---|---|---|---|---|---|

- **接口标准说明**：这个字段在 NCC/BIP 里是什么档案或枚举（`参照 BIP 组织单元档案`、`参照 NCC 项目档案`）。
- **业务系统传递说明**：外系统该怎么传（`请传编码` / `传文本` / `例如 12.5` / `2025-10-01 00:00:00` / 枚举值逐行列出）。
- **约束**：长度、取值范围、默认值、是否唯一。没有就留空。
- 数组/嵌套字段：父行类型写 `array`，子字段在下一行**缩进写在参数名称列**，序号留空。
- 必填只写 `是` / `否`。

表后紧跟「输入报文样例」：完整、合法的 JSON（含数组示例），用等宽字体、自动换行。

### 3. 三、输出参数列表

表头 6 列：

| 序号 | 名称 | 类型 | 必填 | 中文名 | 备注 |
|---|---|---|---|---|---|

- 嵌套字段写成 `data.code`、`data.id`，**不要平铺**。
- 表后跟「输出报文样例」，同样给完整 JSON。

### 4. 四、错误码

| 场景 | success | code | message | 处理建议 |
|---|---|---|---|---|

至少覆盖：成功、参数缺失/格式错、业务校验失败（如编码重复）、数据不存在。
鉴权失败（token 失效）、签名错误属于接入问题，放到《接入说明》，**不写进接口文档的错误码表**。

---

## 三、写作规则

| 规则 | 要求 |
|---|---|
| 参照字段 | 双列写：标准说明写「参照 XX 档案」，传递说明写「请传编码」 |
| 枚举/字典 | 传递说明里逐行列出 `编码：含义`，不要只写中文 |
| 数值 | 给样例（`例如 12.5`），标明精度 |
| 日期时间 | 统一格式 `yyyy-MM-dd HH:mm:ss`，给样例 |
| 布尔/标志 | 写清取值（`Y/N`、`1/0`），不要交给对方猜 |
| 数组 | 父行 `array` + 子行缩进；样例里给至少一条完整元素 |
| 主键 | 写清「新增不传、由 NCC 生成；修改/启停必传」 |
| 唯一性 | 写明唯一范围（如「同集团内编码唯一」） |
| 不要写的 | 内部表名、SQL、类名、集成规则细节——这些留在内部文档，不给外系统 |

---

## 四、生成方式（openpyxl）

用 `load_workspace_dependencies` 拿本机 Python（自带 openpyxl），脚本放项目 `doc/` 下，输出同名 xlsx。骨架：

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

HEAD_FILL = PatternFill("solid", fgColor="305496")
HEAD_FONT = Font(name="微软雅黑", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="微软雅黑", size=10)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

def block(ws, row, title, span):
    """整行合并的区块标题"""
    ws.cell(row=row, column=1, value=title).font = Font(name="微软雅黑", size=12, bold=True, color="1F3864")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)

def table(ws, row, headers, rows):
    """表头 + 数据，返回下一行号"""
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=c, value=h)
        cell.fill, cell.font, cell.border = HEAD_FILL, HEAD_FONT, BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i, r in enumerate(rows, start=1):
        for c, v in enumerate(r, start=1):
            cell = ws.cell(row=row + i, column=c, value=v)
            cell.font, cell.border, cell.alignment = BODY_FONT, BORDER, WRAP
    return row + len(rows) + 1
```

页面级要求：
- 每个接口一个 `wb.create_sheet(name)`；
- **列宽按内容自适应**：估算文字宽度（中文算 2 个字符），列宽取该列最长内容 + 3，避免折行；合并单元格不参与列宽计算；
- **行高按内容行数算**：普通行 = 行数 × 18 + 6，报文行 = 行数 × 16 + 10，不要写死固定高度；
- **对齐**：除报文字段外全部居中（水平 + 垂直）；报文左对齐、顶端对齐；
- **报文 JSON 一律用 `json.dumps(obj, ensure_ascii=False, indent=2)` 生成**，写进一个横向合并的单元格（开自动换行），等宽字体 Consolas；不要手工拼字符串、不要平铺成一行；
- 冻结首行、隐藏网格线；
- 生成后**重新打开**校验：页签数、每个页签的行数、样例 JSON 可解析。

---

## 五、交付前自检

- [ ] 一个页签一个接口，页签名带版本号
- [ ] 四块齐全，顺序正确
- [ ] 接口信息 5 项齐全（名称/方式/地址/格式/版本），**没有**写 client_id、secret、token、请求头等公共参数
- [ ] 每个输入字段有类型、必填、中文名、标准说明、传递说明
- [ ] 参照字段双列写了；枚举值给了编码；日期/数值给了样例
- [ ] 数组字段有子行，样例里数组有完整元素
- [ ] 输出参数体现层级（`data.xxx`）
- [ ] 请求/响应样例是合法 JSON，字段与参数表一一对应，没有表里没有的字段
- [ ] 报文 JSON 是 2 空格缩进的多行格式（单元格内换行），不是平铺字符串
- [ ] 列宽按内容自适应、没有明显折行；除报文外单元格居中
- [ ] 错误码覆盖：成功、参数错、业务校验、数据不存在、鉴权/签名
- [ ] 没有出现内部表名、SQL、类名
- [ ] 所有拿不准的字段都已向使用者确认，文档里没有编造或"待确认"
- [ ] 字段能在代码或元数据里找到出处

---

## 六、常见错误（写文档时最容易犯）

1. **字段重复**：同一个参数在表里出现两次（拼写不同）。生成前按参数名去重。
2. **输出平铺**：`data` 下的字段直接写成 `code`、`id`，外系统按表拼报文会拼错。
3. **枚举只给中文**：写「飞机/火车」而不给 `SLYJZD_01`，对方无法传值。
4. **日期格式不统一**：一处 `2025-10-01`、一处 `2025/10/01`。
5. **数组字段漏子行**：父行写了 `array`，子字段没展开，样例里却有——对不上。
6. **把鉴权参数写进接口文档**：client_id、secret、token、请求头都不该出现——NCC 的接口文档与接入说明是两份文件。
7. **把内部实现写进对外文档**：集成规则、表名、类名不该出现。

---

## 七、与实现对齐的检查点

| 检查 | 方法 |
|---|---|
| 字段是否真的会被保存 | 查集成规则 `pub_interuleitem` 有没有这条 `VFIELD`（没配的字段被静默丢弃） |
| 报文 key 是否正确 | `VEXTFIELD` 才是报文里的 key，`VFIELD` 是 NCC 字段 |
| 类型与长度 | NCC：`ncc_meta_detail`；BIP：`bip_meta_detail` |
| 查询条件 | 集成规则里 `VQUERYPARAM` 非 0 的字段才能作为查询条件 |
| 定位方式 | `pub_interuleparam.queryparam` 决定 update/启停按哪个字段定位（主键还是编码） |
