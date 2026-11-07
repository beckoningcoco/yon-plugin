# nccloud 前端调用后端自定义 Action 的注册

> 场景：前端页面（list/card/工作台卡片）要调一个**平台没有的**后端接口，比如
> `ajax({ url: '/nccloud/workflow/approvalcenter/queryPaySuggestion.do' })`。
> 光写 Java 类不够，还要在 `WEB-INF/extend/yyconfig` 下配 **两个** xml，否则 URL 根本路由不到。

---

## 1. 两个 xml，缺一不可

| 文件 | 作用 | 漏了会怎样 |
| --- | --- | --- |
| `config/action/<名字>.xml` | **路由**：action 名 → 实现类的全路径 | 请求 404 / 找不到 action |
| `config/authorize/<名字>.xml` | **授权**：哪个 appcode 可以调哪些 action | 报「未授权」类错误 |

实测统计（某 NCC2111 环境的 `extend/yyconfig/modules`）：`config/action` 目录 **1989** 个、`config/authorize` **1724** 个，基本成对出现——**看到 action 就要顺手找 authorize**。

目录形如：

```
{配置根}/modules/{模块}/{子模块}/config/action/xxx.xml
{配置根}/modules/{模块}/{子模块}/config/authorize/xxx.xml
```

**`{配置根}` 有两处，别放混：**

| 配置根 | 用途 |
| --- | --- |
| `hotwebs/nccloud/WEB-INF/extend/yyconfig/` | **运行时生效**的位置，与部署目录结构逐层一致 |
| `nccloud/yyconfig/` | **工程源码里**放客开配置的位置（例：`nccloud/yyconfig/modules/cmp/recbill/config/authorize/authorize_recbill.xml`），打包时并到上面的 extend 下 |

> 规矩：**工程里写 `nccloud/yyconfig/`，部署时落到 `hotwebs/nccloud/WEB-INF/extend/yyconfig/`**。
> 工程里的 `hotwebs/.../extend/` 也可能残留历史配置（如某项目 `gl/` 的 action 与 authorize），那是旧做法，不要跟着学。

同目录下还可能并列 `ui/`、`userdef/`、`freedef/`、`interfacedefine/` 等，本流程用不到。

---

## 2. action xml 的格式

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<actions>
    <action>
        <name>workflow.approvalcenter.queryPaySuggestion</name>
        <label>审批中心-查询司库支付建议</label>
        <clazz>nccloud.web.arap.paysuggestion.action.QueryPaySuggestionAction</clazz>
    </action>
</actions>
```

**`<name>` 决定前端 URL**，三段式：

```
name  = {模块}.{子模块}.{actionName}
URL   = /nccloud/{模块}/{子模块}/{actionName}.do
```

所以 `workflow.approvalcenter.queryPaySuggestion` → `/nccloud/workflow/approvalcenter/queryPaySuggestion.do`。

> **`<clazz>` 不受所在模块限制。** 实测：把 `nccloud.web.arap.paysuggestion.action.QueryPaySuggestionAction`（类在 **arap** 模块）挂在 `workflow/approvalcenter` 的配置下，前端照常用 `/nccloud/workflow/approvalcenter/xxx.do` 调通。
> 换句话说：**路由前缀由 name 决定，与类所在的物理模块无关**，按业务归属放类、按调用方页面放配置即可。

---

## 3. authorize xml 的格式

```xml
<authorizes>
    <authorize>
        <appcode>*</appcode>
        <actions>
            <action>workflow.approvalcenter.approvePassAction</action>
            <action>workflow.approvalcenter.queryPaySuggestion</action>
        </actions>
    </authorize>
    <authorize>
        <appcode>10160501</appcode>
        <actions>
            <action>workflow.approvalcenter.batchApproveAction</action>
        </actions>
    </authorize>
</authorizes>
```

- `<appcode>*</appcode>` —— 所有应用都能调，**自建通用接口一般挂这里**；
- `<appcode>10160501</appcode>` —— 只放行某个应用（`10160501` 是审批中心页面的 appcode）。

> 新 action 加进已有的 `<appcode>*</appcode>` 段即可，不用新建 `<authorize>` 节点。

---

## 4. 实现类的要求

```java
package nccloud.web.arap.paysuggestion.action;

import nccloud.framework.web.action.itf.ICommonAction;
import nccloud.framework.web.container.IRequest;
import nccloud.framework.web.container.SessionContext;

public class QueryPaySuggestionAction implements ICommonAction {
    @Override
    public Object doAction(IRequest request) {
        String jsonStr = request.read();                                 // 前端 data 序列化后的 JSON
        String userId = SessionContext.getInstance().getClientInfo().getUserid();
        JSONObject result = new JSONObject();
        ...
        return result;   // 返回 JSONObject / JSON 字符串；前端在 res.data 里拿到该对象
    }
}
```

- 接口只有 `Object doAction(IRequest request)` 一个方法；
- 移动端再实现 `IMobileAction`（`Object doAction(IMobRequest req)`），见 `ApprovePassAction`；
- 返回值如果是 `JSONObject`，前端 `success: (res) => res.data.xxx` 直接取字段（平台会解析成对象，不用自己 `JSON.parse`）。

---

## 5. 落地步骤（按顺序做，别跳）

1. 写实现类（`public/` 下，包名任意，能被模块加载即可）；
2. 在目标模块的 `config/action/*.xml` 加 `<action>`；
3. **在同一个模块的 `config/authorize/*.xml` 的 `<appcode>*</appcode>` 段加同名 `<action>`**；
4. 前端 `ajax` 用 `/nccloud/{模块}/{子模块}/{actionName}.do`；
5. 部署：**工程里写在 `nccloud/yyconfig/modules/{模块}/{子模块}/config/`**，发布时并到 `hotwebs/nccloud/WEB-INF/extend/yyconfig/` 对应路径下；类则编进对应模块；
   > 工程里的配置文件**不要**直接写到 `hotwebs/.../extend/` 下——那是部署目录的位置，工程侧要跟 `nccloud/yyconfig/` 的既有样例（如 `cmp/recbill`）保持一致。
6. 重启生效（`yyconfig` 在启动时加载；热加载未验证）。

---

## 6. 排查清单

| 现象 | 先查 |
| --- | --- |
| 请求 404 / 找到不 action | `config/action` 里有没有该 `<name>`；`name` 三段是否和 URL 对得上；拼写大小写（`name` 区分大小写） |
| 报未授权 / 权限类错误 | `config/authorize` 里有没有同名 `<action>`；看它挂在哪个 `<appcode>` 下，页面实际 appcode 是否覆盖 |
| `ClassNotFoundException` | `<clazz>` 写错；或类所在模块没打进环境 |
| 改了没生效 | 是否只改了工程没同步部署目录；是否重启过 |
| 前端拿到 `res.data` 是字符串 | 后端返回时做了 `toJSONString()`，前端需自行 `JSON.parse` |

---

## 7. 实例：审批中心「支付建议」拦截

- 前端：`src/uap/msgcenter/message/main/index.js` 的 `approvePassOrAssgin()` 先 POST `/nccloud/workflow/approvalcenter/queryPaySuggestion.do`；
- 配置：`workflow/approvalcenter/config/action/approvalcenter.xml` + `config/authorize/authorize.xml`（`<appcode>*</appcode>` 段）；
- 实现类：`arap` 模块 `nccloud.web.arap.paysuggestion.action.QueryPaySuggestionAction`；
- 关键设计：**接口任何异常都返回 `needShow=false`**，前端据此走原审批流程，保证这个客开永远不会把审批卡死。
