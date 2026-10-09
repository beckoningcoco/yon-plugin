# NCC 前端脚手架 · 工程配置（本机事实）

> 本文件记录**具体环境的事实**（路径、端口、代理、版本），随环境变化需要更新。
> 通用知识在 `references/` 下，本文件只放"这台机器/这个工程"的硬事实。

最后验证：2026-10（本次会话实测）

---

## 一、被分析的工程

| 项 | 值 |
| --- | --- |
| 工程根目录 | `E:\NCProject\NCC2005\touziwuye\hotwebs` |
| 产品线 / 版本 | **NCC（NC Cloud）** / NCC2005（出自 `src/jytzwy/taxclass/taxclass/main/index.js` 的 `@version NCC2005`） |
| 客户代号 | `tzwy`（疑为"投资物业"） |
| 文件数 | 53005（含全部 `src/` 源码） |
| 页面入口数 | 315 个四级入口 |
| 依赖状态 | **无 `node_modules`、无 `dist/`**（未安装、未构建） |
| 版本控制 | **无 git 元数据**（只有 `.gitignore`），改动不可回溯 |

## 二、当前 `config.json` 的状态

```json
{
    "buildEntryPath": ["./src/cmp/bank/bankcontrast_tzwy/*/index.js"],
    "extendBuildEntryPath": [],
    "proxy": "http://127.0.0.1:8083",
    "noProxyContext": ["/nccloud/resources/ampub"],
    "buildWithoutHTML": ["uapbd/refer", "uap/refer"],
    "isMA": false,
    "maInfo": { "businessCode": "epa" },
    "directConnectInfo": { "userCode": "yongyou", "appCode": "123456", "code": "develop" },
    "devPort": 3006
}
```

**要点**：

- `buildEntryPath` **只指向一个页面** → 当前 `npm run dev/build` 只编译这一个，其余 314 个不参与；
- `proxy` 指向 `127.0.0.1:8083`（本地后端）；`devPort` = **3006**；
- `directConnectInfo` 是**开发免登录账号**（`yongyou` / `123456` / `develop`）——不是生产凭据。

## 三、`ip.txt`（手写备忘，非配置）

```
http://10.11.115.39:6500
http://127.0.0.1:7777
http://10.11.115.83:8887
"proxy": "http://10.11.115.100:8802",
```

> 这些地址**没有被任何脚本读取**，纯粹是开发者手记。换环境时不要误以为是配置。

## 四、启动方式

`run.bat`：

```
set path=%path%;D:/NC/IDE/NCCloudNew/nodejs/&&npm run dev
```

即**用 NCC 开发工具自带的 Node**（`D:\NC\IDE\NCCloudNew\nodejs\`），不是系统 Node。

## 五、Y 面板已登记的 Home（与本工程的关系）

| Home id | 版本 | 路径 | 与本文档的关系 |
| --- | --- | --- | --- |
| `ncc-2312` | NCC2312 | `E:/NCProject/NCC2312/tianjiu/biphome_20260902` | **另一个项目（天九）**，版本也不同 |

> ⚠️ **本工程（NCC2005）的 NCC Home 尚未登记**。
> 因此 `ncc_home_list` / `ncc_home_find` / `ncc_meta_*` 目前**查不到 NCC2005 的安装目录内容**
> （后端源码、`.bmf` 元数据、jar）。
> 需要查后端 SqlBuilder 或元数据时，先请操作者在 Y 面板登记 NCC2005 的 Home。

已建的索引（针对 `ncc-2312`）：元数据索引有（6407 实体 / 253352 字段 / 3499 枚举），**类索引没有**。

## 六、本机工具可用性（实测）

| 工具 | 状态 | 备注 |
| --- | --- | --- |
| `pwsh` | ❌ 不可用 | 返回 `[exit code: 3221225794]`（`0xC0000142`），无输出。改用 `glob`/`grep`/`read` |
| `ncc_gbk_edit` | ✅ 可用 | 读写 GBK 源码文件的唯一正确方式 |
| `glob` | ⚠️ 只匹配**文件名** | 搜目录名无效 |
| `grep` | ⚠️ 反斜杠转义不生效 | 用 `.` 通配反斜杠 |

## 七、相关资料位置

| 资料 | 位置 |
| --- | --- |
| 平台 API 权威文档（六大高阶组件） | `../ncc-dev/references/common/frontend-dev.md` |
| 应付单前端实战分析（NCC2111 项目） | `../ncc-dev/references/common/arap-payablebill-frontend.md` |
| 主子表开发 | `../ncc-dev/references/common/master-detail-dev.md` |
| 本工程的原始学习笔记（5 份，含推导过程） | `C:\Users\99558\Documents\新建文件夹\NCC前端脚手架剖析\` |

> 前两篇是**跨项目通用**的平台文档，与本 skill 互补：
> 它们讲"平台给了什么 API"，本 skill 讲"在这个脚手架工程里怎么落地"。
