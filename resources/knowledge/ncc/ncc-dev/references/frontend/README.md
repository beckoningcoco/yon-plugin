# NCC 前端脚手架 · 文档索引

> 这一组文档讲的是 **NCC 前端源码工程（`hotwebs` 多页脚手架）**：工程结构、页面模板、参照过滤、编码纪律。
> 与平台 API 文档的分工：**平台给了什么 API** 看 `ncc/ncc-dev/references/common/frontend-dev.md`；
> **在这个脚手架工程里怎么落地** 看这里。
>
> 分析样本：`E:\NCProject\NCC2005\touziwuye\hotwebs`（NCC2005，客户"投资物业"）

## 按问题找文档

| 我要做什么 | 读这篇 |
| --- | --- |
| 搞清这个工程怎么组织、怎么编译、产物部署到哪 | `scaffold-overview.md` |
| 确认该用哪种页面范式、`this.props` 里有什么、事件往哪挂 | `page-patterns.md` |
| 新建/改写一个**列表页**（8 个文件逐个可复制） | `list-page-template.md` |
| 新建/改写一个**卡片页**；理解保存、提交、公式校验流程 | `card-page-template.md` |
| 忘了某个平台 API 的名字、参数或返回结构 | `api-cheatsheet.md` |
| 做**参照过滤**（客开高频）；判断要不要动后端 | `../scenarios/ref-model.md`（已提升为「参照」场景文档） |
| 动手改文件前：GBK 编码陷阱、本机工具可用性、已知坑 | `encoding-and-tools.md` |
| 判断某处代码是不是客户改的、升级会不会被覆盖 | `project-status.md` |
| 本工程的路径、端口、代理、Home 登记等硬事实 | `project-config.md` |

## 三条铁律

1. **改文件前先探测编码**（`ncc_gbk_edit`）——工程内 UTF-8 与 GBK 混杂，且已有文件的中文被不可逆写坏过；
2. **参照过滤前端只传参数**，真正的过滤逻辑在后端 SqlBuilder 类里；新条件往往要前后端一起动；
3. **保存/提交必须经过 `props.validateToSave`**，编辑后的联动交给后端公式（`xxxAfterEdit.do`），不要在前端手写计算。

## 覆盖范围与边界

- 已覆盖：工程与构建、三种页面范式、list/card 模板、平台 API 速查、参照过滤、编码与工具、本工程二开现状；
- **尚未覆盖**（后续可补）：`transfer/` 转单页三件套、`widget/` 小部件、`verificationsheet/verifyap` 核销单、`card/events/initTemplate.js` 与列表版的差异。
