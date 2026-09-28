# NCC 三方应用配置读取

> 一页纸速查：**三方应用（外部系统应用）的配置存在哪、代码怎么读**。
> 适用于所有 NCC 资产包项目，不必再翻 `opm` / `ic65` / `riacc` 源码。
> 结论已在天九 NCC2312 测试库实测验证（见 §7）。

---

## 一、三方应用是什么

一般与外系统对接时，会在 NCC「**OPENAPI 管理处**」新增一个专门给外系统用的应用；新增时勾选"**同步到三方应用**"，数据就会落到三方应用表里。

它承载三件事：

| 用途 | 对应字段 | 说明 |
|------|---------|------|
| 标识外系统 | `pk_thirdsys` | 赋给集成规则主表的 `SRCSYS` / `DESTSYS` / `PROVIDER` |
| NCC **主动调**外系统 | `address` | 外系统域名/IP。外系统调 NCC 时可留空 |
| 外系统调 NCC 时签名 | `client_id` + `client_secret` | 配对使用 |
| 自定义参数 | 子表 `paramname` / `paramvalue` | appKey、公钥、Authorization 之类放这里 |

> 维护入口：NCC「OPENAPI 管理处」→ 新增应用 → 勾选"同步到三方应用"。
> 也可以直接在「三方应用」节点上维护。

---

## 二、表结构

### 2.1 主表 `pub_thirdsys`

| 字段 | 含义 | 备注 |
|------|------|------|
| `PK_THIRDSYS` | 主键 | 唯一标识一个外部系统应用 |
| `CODE` | 编码 | 应用编码，代码里最常用它查（如 `tianjiu_mid`） |
| `NAME` | 名称 | 中文名 |
| `CLIENT_ID` | 客户端ID | OPENAPI 注册应用生成的 client_id |
| `CLIENT_SECRET` | 客户端密钥 | 与 client_id 配对，**明文存储，勿打日志** |
| `REDIRECT_URI` | 回调地址 | OAuth 用，一般不需要配置 |
| `ADDRESS` | 外系统地址 | 域名/IP，NCC 主动调外系统时必填 |
| `PK_ORG` | 所属组织 | 一般留空（表里常见占位符 `~`） |
| `PK_GROUP` | 所属集团 | 集团主键 |
| `CREATOR` / `CREATIONTIME` | 创建人/时间 | |
| `MODIFIER` / `MODIFIEDTIME` | 修改人/时间 | |
| `TS` | 时间戳 | 乐观锁 |
| `DR` | 删除标记 | 0=未删除 |

### 2.2 子表 `pub_thirdparam`（自定义参数）

| 字段 | 含义 |
|------|------|
| `PK_THIRDPARAM` | 主键 |
| `PK_THIRDAPP` | 外键 → `pub_thirdsys.PK_THIRDSYS` |
| `PARAMNAME` | 参数名（如 `appCode`、`AppKey`、`pubKey`） |
| `PARAMDESC` | 参数描述 |
| `PARAMTYPE` | 参数类型（实测见 `1` / `2`，含义未确认） |
| `PARAMVALUE` | 参数值 |
| `DR` / `TS` | 删除标记 / 时间戳 |

---

## 三、代码怎么写（标准做法）

**不要裸写 SQL**，用平台服务 `IThirdSysVOService`。

### 3.1 类路径（容易写错）

| 类型 | 全路径 |
|------|--------|
| 服务接口 | `nc.itf.riacc.thirdsys.thirdsys.IThirdSysVOService` ← **注意包名 `thirdsys` 重复两次** |
| 主表 VO | `nc.vo.riacc.entity.ThirdSysVO` |
| 聚合 VO | `nc.vo.riacc.entity.AggThirdSysVO` |
| 参数子表 VO | `nc.vo.riacc.entity.ThirdParamVO` |

服务定位：`NCLocator.getInstance().lookup(IThirdSysVOService.class)`

### 3.2 可直接粘贴的工具类

```java
package nc.bs.arap.util;

import java.util.LinkedHashMap;
import java.util.Map;

import nc.bs.framework.common.NCLocator;
import nc.itf.riacc.thirdsys.thirdsys.IThirdSysVOService;
import nc.vo.pub.BusinessException;
import nc.vo.pub.CircularlyAccessibleValueObject;
import nc.vo.riacc.entity.AggThirdSysVO;
import nc.vo.riacc.entity.ThirdParamVO;
import nc.vo.riacc.entity.ThirdSysVO;

/**
 * 读取 NCC 三方应用配置（pub_thirdsys / pub_thirdparam）
 */
public class ThirdSysUtil {

    private static IThirdSysVOService thirdSysService;

    private static IThirdSysVOService getService() {
        if (thirdSysService == null) {
            thirdSysService = NCLocator.getInstance().lookup(IThirdSysVOService.class);
        }
        return thirdSysService;
    }

    /** 按主键取。主键就是集成规则里的 SRCSYS / DESTSYS / PROVIDER */
    public static ThirdSysVO getByPk(String pkThirdSys) throws BusinessException {
        return one(getService().listThirdSysVOByPk(pkThirdSys));
    }

    /** 按编码取。code = 三方应用节点上的"应用编码"，如 tianjiu_mid */
    public static ThirdSysVO getByCode(String code) throws BusinessException {
        return one(getService().listThirdSysVOByCondition(" code = '" + code + "' and dr = 0 "));
    }

    /** 按编码取聚合 VO（带子表参数） */
    public static AggThirdSysVO getAggByCode(String code) throws BusinessException {
        AggThirdSysVO[] vos = getService().listAggThirdSysVOByCondition(" code = '" + code + "' and dr = 0 ");
        return (vos == null || vos.length == 0) ? null : vos[0];
    }

    /** 取子表自定义参数：paramname -> paramvalue */
    public static Map<String, String> getParams(AggThirdSysVO aggVo) {
        Map<String, String> params = new LinkedHashMap<>();
        if (aggVo == null) {
            return params;
        }
        CircularlyAccessibleValueObject[] children = aggVo.getChildrenVO();
        if (children == null) {
            return params;
        }
        for (CircularlyAccessibleValueObject child : children) {
            ThirdParamVO param = (ThirdParamVO) child;
            if (param.getParamname() != null) {
                params.put(param.getParamname(), param.getParamvalue());
            }
        }
        return params;
    }

    private static ThirdSysVO one(ThirdSysVO[] vos) {
        return (vos == null || vos.length == 0) ? null : vos[0];
    }
}
```

### 3.3 调用示例

```java
// 取地址 + client_id
ThirdSysVO sys = ThirdSysUtil.getByCode("tianjiu_mid");
String url    = sys.getAddress();      // 外系统域名
String appId  = sys.getClient_id();    // OPENAPI client_id

// 取子表参数（appKey / AppSecret 等）
Map<String, String> params = ThirdSysUtil.getParams(ThirdSysUtil.getAggByCode("tianjiu"));
String appCode = params.get("appCode");
```

### 3.4 `IThirdSysVOService` 常用方法

| 方法 | 说明 |
|------|------|
| `ThirdSysVO[] listThirdSysVOByPk(String... pks)` | 按主键批量查（**可变参数**，传一个也行） |
| `ThirdSysVO findThirdSysVOByPk(String pk)` | 按主键查单个 |
| `ThirdSysVO[] listThirdSysVOByCondition(String condition)` | 按条件查主表 VO |
| `AggThirdSysVO[] listAggThirdSysVOByPk(String... pks)` | 按主键查聚合（带子表） |
| `AggThirdSysVO[] listAggThirdSysVOByPk(boolean blazyLoad, String... pks)` | 同上，可显式控制懒加载 |
| `AggThirdSysVO[] listAggThirdSysVOByCondition(String condition)` | 按条件查聚合 |
| `String[] listThirdSysVOPkByCond(String condition)` | 只查主键 |
| `saveAggThirdSysVO(...)` / `deleteAggThirdSysVOs(...)` | 增/删（客开一般用不到） |

---

## 四、与集成规则的关系

写集成规则 SQL 时，`SRCSYS` / `DESTSYS` / `PROVIDER` 三个字段填的都是 `pk_thirdsys`：

| 字段 | 含义 | 取值 |
|------|------|------|
| `PROVIDER` | 服务提供方 | 固定 `0001HAWK000000000001`（华科） |
| `DESTSYS` | 目标系统 | NCC 本系统或外系统的主键 |
| `SRCSYS` | 来源系统 | `SELECT pk_thirdsys FROM pub_thirdsys WHERE dr = 0` |

```sql
-- 查某编码对应的主键，用来填集成规则
SELECT pk_thirdsys, code, name, address, client_id
  FROM pub_thirdsys
 WHERE dr = 0 AND code = 'tianjiu_mid';
```

---

## 五、子表常见参数命名（实测样本，非固定规范）

命名由实施人员自由填写，**不同项目不一样**，代码里取值前先确认：

| 应用编码 | 参数名 | 说明 |
|---------|--------|------|
| `tianjiu` | `appCode` / `appSercet` | 注意是 `Sercet`，不是 `Secret`（实施拼错但已生效） |
| `tianjiuzaitu` | `AppKey` / `AppSecret` | |
| `OA` | `Authorization` / `localAddress` | |
| 其他项目 | `pubKey` | 见 `ic65/.../HandNumResource.md5Sign()` |

> 结论：**先查库看实际参数名，再写 `params.get("xxx")`**，不要照抄别的项目。

---

## 六、陷阱

1. **包名重复**：`nc.itf.riacc.thirdsys.thirdsys.IThirdSysVOService` —— 两个 `thirdsys`，import 时最常写错。
2. `listThirdSysVOByPk(String... pks)` 是**可变参数**，传单个 String 合法；另有 `blazyLoad` 重载。
3. `getChildrenVO()` 返回 `CircularlyAccessibleValueObject[]`（继承自 `AbstractBill`），要转成 `ThirdParamVO[]` 才能取 `getParamname()`。
4. **`condition` 是直接拼进 SQL 的**，若拼接外部输入（如 HTTP 参数）有注入风险，必须先校验/白名单。
5. `client_secret` / `AppSecret` 是**明文**存的，写集成日志时务必脱敏。
6. `dr = 0` 是我按文档 `WHERE dr = 0` 显式加上的；服务内部是否已隐式过滤未验证，显式加是幂等的。
7. `pk_org` 在表里常见占位符 `~` 表示空，不要当真实组织主键用。
8. 三方应用配置**随环境不同**（测试/生产各一套），代码里别硬编码 `address` / `client_id` / `appKey`，从三方应用读。

---

## 七、实测样本（天九 NCC2312 测试库 `tj-ncc-test`）

`SELECT pk_thirdsys, code, name, client_id, address FROM pub_thirdsys WHERE dr = 0`

| code | name | client_id | address |
|------|------|-----------|---------|
| `OA` | OA | （空） | https://testoa.tjos.com |
| `tianjiu` | 天九 | `86bd85a6...` | https://c3.yonyoucloud.com |
| `tianjiu_mid` | 天九_中间库 | `biptest` | https://test-zjk-api-gateway.tojoycloud.com |
| `tianjiumiddleserver` | 天九中转服务 | （空） | http://123.57.249.193:9234 |
| `tianjiuzaitu` | 天九在途单据 | `33bc7004...` | https://c3.yonyoucloud.com |

**典型用法**：`SynOAGatherWorkPlugin`（OA 收款单同步后台任务）里原先硬编码的
`gatewayUrl` / `appId` 就来自 `tianjiu_mid`，`srcSystem='tianjiumiddleserver'`
对应主键 `1001D110000000AFOJ2L`。这类硬编码应改为运行时从三方应用读取。

---

## 八、参考实现位置（本机 SDK）

| 场景 | 文件 |
|------|------|
| 按条件查聚合 | `opm/src/public/nc/ws/opm/controller/YonBIPController.java:76` |
| 按主键查 + 取子表参数 | `ic65/src/public/nccloud/api/ic/HandNumResource.java:191` |
| 第三方工具基类（含 `getThirdSysService()`） | `opm/src/public/nccloud/api/third/util/AbstractThirdUtil.java:555` |

> 路径前缀：`E:\NCProject\NCC2312\tianjiu\hawk-sdk-ncc-tianjiu\`
