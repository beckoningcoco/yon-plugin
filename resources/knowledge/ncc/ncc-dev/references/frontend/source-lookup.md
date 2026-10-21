# NCC 前端 · 源码在哪查（ncc_fe_*）

> **什么时候读我**：要在 NCC 前端源码里找一个页面、一个接口 URL、一个字段、一个按钮 code、一句提示语，或者排查前端问题要定位到具体文件时。
>
> 这一组工具查的是 **hotwebs 多页脚手架工程**（开发态源码），不是安装目录里的编译产物。后端源码、jar、`.bmf` 走 `ncc_home_*`，别混。

## 一、先登记，再查

一个版本一份源码，登记在 Y 面板「前端源码」里：

- 路径指到 **hotwebs 工程本身**——有 `src/` 与 `config.json` 的那一层，例如 `E:/NCProject/源码整理/NCC1909/NCC_1909_2005_hotwebs/hotwebs`；
- 指到上一级（`.../touziwuye`）会被探测拒绝并提示"源码在子目录 hotwebs/"；
- 指到安装目录的 `hotwebs/` 会被判为**部署产物**（只有 `nccloud/`，没有 `src/`），不是源码。

id 由版本派生：`fe-ncc-1909`、`fe-ncc-2005`。`ncc_fe_list` 是唯一拿 id 的地方。

## 二、按问题选工具

| 我要做什么 | 用它 | 说明 |
| --- | --- | --- |
| 这个版本有哪些页面 / 功能 | `ncc_fe_pages` | 节点 = `src/{领域}/{模块}/{节点}`；`term` 匹配这三段，也可以用 `domain`/`module`/`node` 精确收窄 |
| 某个页面目录在哪 | `ncc_fe_pages` 传节点名，或 `ncc_fe_find` | 节点行会直接给出每个入口（`list`/`card`/`main`）的相对路径 |
| 某个接口 URL / 字段 / 按钮 code / 提示语在哪写的 | `ncc_fe_grep` | 字面量默认**不区分大小写**；`regex: true` 走正则；`under`/`ext` 收窄 |
| 找组件、参照、less、json | `ncc_fe_find` | 按文件名片段 / 扩展名；`under` 指定子树 |
| 读文件 | `ncc_fe_read` | 自动探测 GBK/UTF-8；`lines` 取行窗口；config 里的密钥值会打码 |

典型链路：

```
ncc_fe_list                                  → 拿 id
ncc_fe_pages  term=stockinvest                → 拿到节点目录与入口路径
ncc_fe_grep   pattern=/nccloud/epmp regex     → 找接口写在哪
ncc_fe_read   path=src/.../list/index.js      → 读上下文
```

## 三、三条口径（数字对不上时先看这里）

1. **页面节点不含组件与参照。** 四层 `index.js` 并不都是页面——`uap/common/components/AdaptHeightDiv/index.js`、`riacc/refer/.../contrastGridRef/index.js` 也符合通配。只有第四层是 `list`/`card`/`main`/`linkcard`/`approve_card`/`transfer` 等页面类型时才计为页面。实测 NCC2005：四层入口共 1349 个，其中页面 491 个、节点 252 个。
2. **搜索默认跳过 `src/platform/`。** 那是运行时库本体（react/axios/echarts），1909 上 207 MB、占整个工程约 37%。`node_modules/`、`dist/`、`.git` 同样跳过，答案里会写明跳过了哪些。
3. **页面索引是快照。** `ncc_fe_list` 的"页面索引"一行给出节点数、入口数与建立时间；登记的路径改过之后索引会标为过期，面板里点「重建页面索引」即可。索引没建过时，第一次 `ncc_fe_pages` 会自动建一次（一个版本约 1.5 秒）。

## 四、实测样例（NCC1909，2026-10）

| 查询 | 结果 |
| --- | --- |
| `ncc_fe_pages` 全量 | 84 个页面节点 / 87 个入口；领域分布 `epmp` 75、`uapbd` 9、`uap` 2、`domain` 1 |
| `ncc_fe_pages term=stockinvest` | `epmp/bcs_r/stockinvestrela`（card/list/main 三个入口）、`epmp/bcs_r/stockInvestScheme`（list） |
| `ncc_fe_grep pattern="/nccloud/epmp" regex` | 扫 6398 个文本文件，0 命中——这个前缀确实不存在 |
| `ncc_fe_grep pattern="nccloud"` | 命中 `personalizedCenter/list/events/index.js` 的 `/nccloud/tbb/individual/...`、`reportManage/list/constant/index.js` 的 `QUERY_TREE_URL` |
| `ncc_fe_read` 读 `stockinvestrela/list/index.js` | UTF-8，203 行，中文注释「股权投资数据维护 节点」正常 |

**教训**：搜接口时先用短片段（`nccloud`）再收紧，别一上来就猜完整前缀——猜错时"0 命中"会被误读成"没有这个接口"。

## 五、边界

- **只读**：`ncc_fe_read` 不改文件。要改源码走 `ncc_gbk_edit`（它专门处理 NCC 工程的 GBK/UTF-8 混杂）。
- **不管安装目录**：`ncc_fe_*` 只认登记的源码工程；后端、jar、`.bmf`、部署产物用 `ncc_home_*`。
- **不按菜单名检索**：节点的名字来自目录，不是菜单名。菜单名 → 目录的映射需要另查（菜单注册表 / `sm_apppage.pageurl`），本组工具不做。
- **一个版本一份**：同一版本登记第二份会被拒绝；要换一份先删旧登记。
