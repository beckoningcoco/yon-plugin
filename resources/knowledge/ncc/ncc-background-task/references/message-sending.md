# NCC 消息发送：PreAlertObject 与消息中心 API

> 适用：NCC 6.5 / 1909 / 2111 / 2312。本文的类与 jar 在 **NCC 1909** 上反编译实测，
> 2505 的类索引里同名类仍在同样的 jar 里，版本差异不大。
>
> 两类场景：① 后台任务执行完给用户发消息；② 业务动作（按钮、审批后、事件监听）里给某个人发一条站内消息。
> 这两条路**不是同一套东西**，选错会做很多无用功。

## 一、先选路

| 需求形态 | 走哪条路 |
|---|---|
| 定时任务跑完，把结果推给**一批固定的人** | 后台任务 `PreAlertObject`（接收人在「后台任务部署」里配） |
| 点按钮后立刻给**操作人**发一条 | 直接调 `nccloud.message.util.MessageCenter.sendMessage(NCCMessage[])` |
| 给动态算出来的一批人发 | 直接调消息中心，`receiver` 用逗号拼用户主键 |
| 要发邮件 / 短信 | 后台任务的发送方式配置；或 `nc.message.util.MessageSender.sendSMS / sendPlainTextEmail` |

**关键区别**：后台任务那套的接收人来自部署时的静态配置（`AlertsendconfigVO`），
代码只能通过「自定义接收人 `[86]`」有限地补人；所以「发给刚点按钮的那个人」应该直接走消息中心 API，
不要为了发一条消息去配一个后台任务。

## 二、后台任务发消息的完整链路

```
触发（后台任务部署 / 调度）
└─ uap.bs.prealert.engine.PreAlertEngineImpl.execute(EngineContext)
   └─ uap.bs.prealert.engine.EngineImplDelegator.execute()
      ├─ ExecutorFactoryImpl.getExecutor(context)
      │    └─ PaUtils.isPreset(type) ? (tasktype==0 ? PreAlertPluginExecutor : BackgroungTaskPluginExecutor)
      ├─ executor.execute(context)
      │    └─ BackgroungTaskPluginExecutor：
      │         PluginExecutorUtil.instantiatePlugin(AlerttypeVO) → 你的 IBackgroundWorkPlugin 实现
      │         plugin.executeTask(BgWorkingContext)         ← 返回 PreAlertObject
      ├─ 判定：result != null && returnType != RETURNNOTHING && returnObj != null
      │            └─ 不满足则只写 prealert 日志，**静默不发消息**
      ├─ MessageConstructor.construct(context, result)
      │    ├─ PlainMsgConstructor：标题 = result.getMsgTitle()，正文 = (String) result.getReturnObj()
      │    └─ FormattedMsgConstructor：正文 = HtmlCreater.getFormattedAlertMessageHTML((IAlertMessage) result.getReturnObj(), ...)
      ├─ MessagePersister.persist(...)                        → 落 pub_alertmessage
      └─ MessageSender.sendMessages(...)
           ├─ NCMessageSender   → AbstractNCMessageSender.transfer()：receiver = 用户主键逗号串，sender = "NC_USER0000000000000"
           │        → nc.message.util.MessageCenter.sendMessage(NCMessage[])
           │             → nc.message.ServerSender → NCMessageDAO → sm_msg_content（发送人 outbox + 每个接收人一条 inbox）
           ├─ EmailSender
           ├─ SMSSender
           └─ FuncnodePopupSender
```

类与 jar（相对 Home）：

| 类 | 包 | jar |
|---|---|---|
| `PreAlertObject` / `IBackgroundWorkPlugin` / `BgWorkingContext` | `nc.bs.pub.pa` / `nc.bs.pub.taskcenter` | `modules/baseapp/lib/pubbaseapp_prealertbaseLevel-1.jar` |
| `PreAlertEngineImpl` / `EngineImplDelegator` / `PreAlertSelfRcvUtil` | `uap.bs.prealert.engine` / `uap.vo.prealert.util` | 同上 |
| `BackgroungTaskPluginExecutor` / `ExecutorFactoryImpl` | `uap.bs.prealert.engine.executor` | `modules/baseapp/META-INF/lib/baseapp_prealertbaseLevel-1.jar` |
| `PlainMsgConstructor` / `FormattedMsgConstructor` | `uap.bs.prealert.engine.message.constructor` | 同上 |
| `AbstractNCMessageSender` / `NCMessageSender` | `uap.bs.prealert.engine.message.sender` | 同上 |
| `MessageCenter` / `NCMessage` / `MessageVO` | `nc.message.util` / `nc.message.vo` | `modules/baseapp/lib/pubbaseapp_appmessageLevel-1.jar` |
| `ServerSender` / `NCMessageDAO` | `nc.message` | `modules/baseapp/META-INF/lib/baseapp_appmessageLevel-1.jar` |

> 拼写注意：执行器类名是 `BackgroungTaskPluginExecutor`（少一个 d），不是 Background。

## 三、PreAlertObject 的正确用法（以及一个常被写错的坑）

`PreAlertObject` 的成员**只有**这些：

```java
private String msgTitle;                                  // @Deprecated，标题仍从这里取
private PreAlertReturnType returnType;
private Object returnObj;                                 // ← 消息正文/对象都放这里
private Object busiObj;
private IBusiCalculater busiCalculater;
private Map<String, Set<String>> codeUserPkSetMap;        // 动态接收人
```

**它没有 `setMsgContent` 方法。** 早先文档里写的 `pao.setMsgContent("文本")` 会直接编译失败；
正文一律走 `setReturnObj(...)`。

返回类型与发出去的样子：

| returnType | returnObj 必须是 | 结果 |
|---|---|---|
| `RETURNNOTHING` | — | 不发消息（成功但不想发就用它） |
| `RETURNMESSAGE` | `String`（正文） | 纯文本消息，标题取 `getMsgTitle()` |
| `RETURNFORMATMSG` | `IAlertMessage` 实现 | 表格化 HTML，作为附件发出 |
| `RETURNOBJECT` / `RETURNDATASOURCE` / `RETURNMULTILANGTEXT` / `RETURN_MULTIPLE_RECEIVER_OBJECT` | 各自约定 | 见产品源码 |

```java
// ✅ 纯文本消息
PreAlertObject retObj = new PreAlertObject();
retObj.setReturnType(PreAlertReturnType.RETURNMESSAGE);
retObj.setMsgTitle("数据同步完成");
retObj.setReturnObj("组织[" + pkOrg + "]同步完成，共处理 " + count + " 条数据");
return retObj;
```

两个必守的硬条件（不满足就静默不发，只在 `prealert` 日志里留一行）：

1. `returnType` 不能是 `RETURNNOTHING`；
2. `returnObj` 不能为 `null` —— `RETURNMESSAGE` 忘了 `setReturnObj` 就是这个结果，很容易误判成"消息中心坏了"。

## 四、接收人：静态配置 + 动态补人

- 接收人存在 `AlertsendconfigVO.receiverid`，格式是 **`[类型码]主键`**：
  - `[1]用户主键` —— 指定用户
  - `[86]自定义编码` —— 自定义接收人，交由代码填空
- 代码里动态指定（只有这一条路）：

```java
Set<String> users = new HashSet<>();
users.add("1001A11000000001ABCD");
pao.addUserPks("当前操作人", users);   // 键 = 部署配置里 [86] 后面的编码
```

引擎在构造消息前会调用 `PreAlertSelfRcvUtil.convertSelfDefRcvToUser()`，
把 `[86]当前操作人` 展开成若干条 `[1]userpk`，再据此算出发送对象。
也就是说：**部署配置里必须先有一条 `[86]当前操作人`，代码里 `addUserPks` 才生效。**

## 五、直接发消息（按钮 / 业务动作场景，推荐）

NCC 里有两套并行的消息中心 API，不要混用：

| API | VO | 落表 |
|---|---|---|
| `nccloud.message.util.MessageCenter` | `nccloud.message.vo.NCCMessage` + `NCCNoticeMessageVO` / `NCCPrealertMessageVO` / `NCCTodoMessageVO` | `sm_msg_notice` / `sm_msg_prealert` / `sm_msg_todo`，接收人关系在 `sm_msg_user` |
| `nc.message.util.MessageCenter` | `nc.message.vo.NCMessage` + `MessageVO` | `sm_msg_content`，接收人在 `sm_msg_receiver` |

新客开用 `nccloud.message.*`。完整模板：

```java
import nc.bs.framework.common.InvocationInfoProxy;
import nc.bs.logging.Logger;
import nc.vo.pub.lang.UFDateTime;
import nccloud.message.util.MessageCenter;
import nccloud.message.vo.NCCMessage;
import nccloud.message.vo.NCCNoticeMessageVO;

/**
 * 给当前操作人发一条站内消息（按钮 Action / 业务 Service 里直接调用）
 */
private void sendNoticeToCurrentUser(String subject, String content) {
    try {
        String pk_user  = InvocationInfoProxy.getInstance().getUserId();   // = sm_user.cuserid
        String pk_group = InvocationInfoProxy.getInstance().getGroupId();

        NCCNoticeMessageVO vo = new NCCNoticeMessageVO();   // 表 sm_msg_notice
        vo.setSubject(subject);                 // 标题，列表里显示这一行
        vo.setContent(content);                 // 正文，点开消息后显示
        vo.setSender(pk_user);
        vo.setReceiver(pk_user);                // 只发给这个人；多个用逗号拼
        vo.setMsgtype("nc");
        vo.setMsgsourcetype("notice");
        vo.setContenttype("BIZ");
        vo.setSendtime(new UFDateTime());
        vo.setPk_group(pk_group);
        vo.setPriority(0);

        // 需要「点开消息跳到单据」时再设（实测可为 null）
        // vo.setBilltype(billType);  vo.setBillid(pk_bill);  vo.setBillno(billCode);  vo.setFunccode("...");

        NCCMessage msg = new NCCMessage();
        msg.setMessage(vo);
        msg.setMessageType("notice");           // 与 VO 类型对应
        MessageCenter.sendMessage(new NCCMessage[]{msg});
    } catch (Exception e) {
        // 发消息失败不应把按钮的业务动作带崩
        Logger.error("发送站内消息失败：" + e.getMessage(), e);
    }
}
```

要点：

- `receiver` 是 **`sm_user.cuserid`**（用户主键），不是用户编码；逗号分隔，DAO 会拆成每人一条 inbox。
- 发送人 `sender` 也填用户主键；系统自动消息用 `NC_USER0000000000000`（消息中心默认发送人）。
- 走 `InvocationInfoProxy.getUserDataSource()` 取数据源，**与业务在同一个事务里**：业务回滚，消息也回滚。
- 消息模板 `pk_messagetemplate` 可不填，直接给文本。
- `subject` 列 `VARCHAR2(300 字节)`、`content` 列 `VARCHAR2(4000 字节)`；ZHS16GBK 下约 150 / 2000 个汉字，超了报 `ORA-12899`。
- 产品里 `contenttype` 的实际取值是场景标记而非严格 MIME：`~` / `BIZ` / `MSG_NEEDCHECK` / `MSG_NOCHECK` / `MAKEBILL` / `DOCCHECK` / `text/plain`。普通通知写 `BIZ`。

## 六、追溯"发没发、发给谁"

| 表 | 内容 |
|---|---|
| `sm_msg_notice` | 通知消息正文（`NCCNoticeMessageVO`） |
| `sm_msg_prealert` | 预警消息（`NCCPrealertMessageVO`） |
| `sm_msg_todo` | 待办消息（`NCCTodoMessageVO`） |
| `sm_msg_user` | 消息-用户关系，`destination` = `inbox` / `outbox` |
| `sm_msg_content` / `sm_msg_receiver` | 老消息中心（`nc.message.*`） |
| `pub_alertmessage` | 预警引擎落的消息记录 |

```sql
-- 某个人最近收到的通知
SELECT subject, receiver, sender, billtype, billid, funccode, msgsourcetype, sendtime
FROM   sm_msg_notice
WHERE  receiver = '<cuserid>'
ORDER  BY sendtime DESC;

-- 某张单据触发的消息有没有发出去
SELECT subject, receiver, sendtime
FROM   sm_msg_notice
WHERE  billid = '<单据主键>';
```

后台任务侧的日志：引擎整个执行过程 `Logger.init("prealert")`，详细日志在 `home/nclogs/server/pa-log.log`；
`EngineImplDelegator` 对"没发消息"的判定会写 `----testprealert ... Not Send message,getReturnObj null`。

## 七、来源

- 反编译：`pubbaseapp_prealertbaseLevel-1.jar`、`baseapp_prealertbaseLevel-1.jar`、`pubbaseapp_appmessageLevel-1.jar`、`baseapp_appmessageLevel-1.jar`
- 工程内现成先例（NCC1909 首创）：`cmp/.../settlement/action/SettlementSettleAction.java`（按钮 Action 里发）、
  `uapbd/.../bd/listener/SendNoticeMsgListener.java`（付款单生效后给制单人推）
- 实测环境：首创 NCC1909（Oracle，ZHS16GBK），`sm_msg_notice` 约 99 万行在跑
