# NCC 主从单据开发 — 技术要点总结

> 来源：5.1 主从单据开发.pdf（27 页）
> 整理时间：2026-04-27

---

## 一、主从单据介绍

### 1.1 应用页面

主从单据 = **一个主实体 + 多个子实体**的聚合结构，典型界面分两层：

| 界面 | 区域 | 说明 |
|------|------|------|
| **列表界面** | 标题区 + 按钮区 + 查询区 + 简单表格 | 浏览/筛选主单据 |
| **卡片界面** | 表头表单 + 表体表格（可多页签） | 编辑主单据及其子表行 |

### 1.2 数据流转流程

```
新增 → 编辑 → 保存 → 提交 → 审批 → … → 删除/弃审
```

核心操作对应的后端动作：SAVEBASE / SAVE / UNSAVE / APPROVE / DELETE / UNAPPROVE

### 1.3 开发流程（7 步）

```
1. 元数据设计 → 2. 注册应用 → 3. 注册按钮 → 4. 添加模板
→ 5. 注册菜单 → 6. 前端编码 → 7. 后端编码
```

---

## 二、元数据设计

### 2.1 核心规则

| 规则 | 说明 |
|------|------|
| 主实体访问器类型 | **必须选 AggVO**（审批流、拉单等场景只支持 AggVO） |
| 主从关联属性访问策略 | 必须选 `nc.md.model.access.BodyOfAggVOAccessor` |
| 包装类名 / 类名称 / 缺省表名 | 必须全局唯一 |
| 字段名称 | 除主从关联属性外，必须与数据表列名一致 |
| 参照名称 | 类型选择其他实体时，可选择该实体已发布的参照 |
| 业务接口属性映射 | 将接口属性映射到实体属性（如 IFlowBizItf 审批流接口） |

### 2.2 元数据组成

```
元数据 = 业务接口 + 实体 + 枚举
  ├─ 主实体（AggVO 访问器）
  │    └─ 组合关系线 → 子实体（多个）
  ├─ 实体 --实现关系线→ 业务接口（可多个）
  └─ 自定义枚举
```

### 2.3 发布操作

- **发布**：生成 VO 类和运行时元数据
- **导出脚本**：下载建库 SQL 脚本
- **导出实体 VO**：下载 Java VO 类代码

---

## 三、注册应用

### 3.1 四级结构（严格遵循）

```
第一级：领域
  第二级：模块
    第三级：应用分类
      第四级：应用（小应用）
        └─ 页面（注册前端资源路径、按钮、模板等）
```

### 3.2 路由方式 vs 单页方式

| 对比项 | 路由方式 | 单页方式 |
|--------|----------|----------|
| 页面注册 | 列表和卡片分别注册不同页面 | 只注册一个页面 |
| 前端编码 | 两个页面组件 + router.js | 一个组件，state 切换列表/卡片 |
| 路由配置 | `#list` / `#card` 分开路由 | 无需路由 |

### 3.3 按钮注册

| 属性 | 说明 |
|------|------|
| 按钮编码 | 应用内唯一标识，前端通过编码控制可见性/可用性 |
| 按钮类型 | 决定显示样式 |
| 按钮区域 | 同一位置按钮的集合标志 |
| 附件管理 / 报表 | 通过右侧肩部按钮添加 |

### 3.4 模板设置

- 设置类 = 实体的类名称
- 表单/列表/查询区关联元数据实体后，可快速添加元数据字段
- 聚合类 = 元数据设计时主实体的包装类名
- 设置表头 = 选择主实体注册的模板区域（用于 Action 读取前端格式数据）

### 3.5 菜单注册

- 菜单也是四级结构，与应用注册层级对应
- 前三级是菜单分类，第四级才是菜单项
- 设置关联应用编码，将菜单和小应用关联
- **自定义菜单升级**：系统升级后，将内置菜单新增项同步到自定义菜单

---

## 四、前端编码

### 4.1 代码结构

```
src/
  ├─ main/               # 页面主目录
  │    ├─ index.js        # 页面入口
  │    ├─ router.js       # 路由配置（路由方式时）
  │    └─ events/         # 事件、方法处理
  └─ ...
```

### 4.2 页面组件模板

```jsx
import React, { Component } from 'react';
import { base, high } from 'nc-lightapi-front';
import { initTemplate } from './events/initTemplate';
import { buttonClick } from './events/buttonClick';
import { pageClick } from './events/pageClick';

const { NCButton, NCDiv } = base;
const { createPage } = high;

class MainFrom extends Component {
    constructor(props) {
        super(props);
        this.state = {
            status: 'browse'  // browse / edit
        };
        // 注册组件区域编码
        this.props.use.form('head');
        this.props.use.table('bodyTable');
        this.props.use.search('searchArea');
        this.props.use.button('btnArea');
    }

    componentDidMount() {
        // 初始化页面模板
        initTemplate(this.props);
    }

    render() {
        const { button, form, table, search } = this.props;
        const { status } = this.state;
        return (
            <div>
                {/* 标题区 + 按钮区 */}
                {/* 查询区 / 表格区 / 卡片区 */}
            </div>
        );
    }
}

export default createPage({})(MainFrom);
```

### 4.3 页面初始化（createUIDom）

```js
export default function (props) {
    props.createUIDom(
        {
            pagecode: 'pageCode'  // 页面编码
        },
        function (data) {
            if (data) {
                if (data.button) {
                    props.button.setButtons(data.button);     // 设置按钮
                }
                if (data.template) {
                    props.form.setFormStatus('head', 'browse');
                    props.form.setAllFormValue(data.template); // 设置模板
                }
                if (data.context) {
                    // 处理上下文信息
                }
            }
        }
    );
}
```

### 4.4 编辑前后事件

```js
// 表单编辑前事件
props.form.setFormStatus('head', 'edit');
props.form.onFormEvent('head', {
    onAfterEvent: function (prop, val) {
        // 编辑后处理
    }
});

// 表格编辑前后事件
props.table.onTableEvent('bodyTable', {
    onAfterEvent: function (prop, index, val) {
        // 表格编辑后处理
    }
});
```

### 4.5 按钮事件

```js
export default function buttonClick(props, id) {
    switch (id) {
        case 'AddButton':
            // 新增逻辑
            break;
        case 'SaveButton':
            // 保存逻辑
            break;
        case 'EditButton':
            // 修改逻辑
            break;
        default:
            break;
    }
}
```

---

## 五、后端编码

### 5.1 代码结构

```
模块工程/
  ├─ META-INF/           # 服务接口配置文件
  └─ src/
       ├─ client/         # Action 处理类、映射文件、鉴权文件
       ├─ private/        # 服务接口实现类
       └─ public/         # 服务接口、实体 VO 类
```

### 5.2 Action 处理类

```java
// 继承 NCCAction，实现 execute 方法
public class SaveAction extends NCCAction {
    @Override
    public Object execute(ActionEvent event) throws BusinessException {
        // 1. 转换前端参数为所需格式
        // 2. 调用服务接口处理业务逻辑
        // 3. 包装结果并返回
    }
}
```

**命名规范**：`N_单据类型编码_动作代码`（如 `N_21_ADD`）

### 5.3 Action 映射文件

- 配置 Action 处理类到 URL 路径的映射
- 前端通过 URL 路径访问，根据映射找到具体 Action 实现
- 映射文件路径必须在 `yyconfig.modules.模块名` 下

### 5.4 Action 鉴权文件

- 描述小应用是否有访问 Action 的权限
- `appcode` 填有权限的小应用编码，对全部应用开放填 `*`
- 配置具体 Action 的 URL 路径

### 5.5 服务接口与调用

| 调用方 | 调用方式 | 说明 |
|--------|----------|------|
| client 端 | `ServiceLocator` | 调用 public 端的接口 |
| private 端 | `NCLocator` | 底层根据接口和 upm 文件找实现 |

### 5.6 UPM 文件

定义服务接口和接口实现的关系，底层通过此文件做服务定位。

### 5.7 开发注意事项

1. client 端**只能通过 ServiceLocator** 调用 public 端的接口
2. client 端**不要直接调用** public 里的公共方法
3. 一次业务操作**不要调用太多接口**，尽量在一个方法里处理完成
4. **不要在循环中调用 SQL 语句**
5. 注意代码结构和代码规范

---

## 六、功能增补

### 6.1 编码规则

#### 编码对象

| 属性 | 说明 |
|------|------|
| 编码对象编码 | 对象唯一标识，代码中作为参数识别编码对象 |
| 编码规则范围 | 集团 / 全局 / 皆可 |
| 编码方式 | 前编码 / 后编码 / 都支持 |
| 编码长度 | 最大编码长度 |
| 关联组织类型 | 可分配组织的组织类型 |
| 编码对象元数据 | 关联的元数据实体 |
| 候选属性 | 规则中可使用的属性（含实体和枚举） |

#### 四种编码元素

| 元素 | 说明 |
|------|------|
| 固定值 | 固定字符串和分隔符 |
| 编码实体 | 与单据相关的数据项（客商、人员等），通过编码映射转换为编码值 |
| 时间项 | 系统时间（服务器时间）或业务时间（单据上的时间项） |
| 流水号 | 顺序记录的定长号 |

#### 编码映射关键属性

| 属性 | 说明 |
|------|------|
| 映射值长度 | 最终体现在编码中的值的长度 |
| 补位方式 | 长度不够时补位（左边/右边） |
| 补位符号 | 占位符 |

#### 编码规则基本信息

| 属性 | 说明 |
|------|------|
| 规则编码/名称 | 标识和显示 |
| 编码方式 | 前编码（新增即生成）/ 后编码（保存时生成） |
| 编码是否可编辑 | 仅前编码可用 |
| 是否断码补码 | 删除/出错的编码号是否复用（与可编辑互斥） |
| 按组织归零 | 流水号是否随组织改变重新计数 |
| 是否集团默认规则 | 集团默认规则，未分配规则的组织使用 |

#### 前编码 vs 后编码

| 对比 | 前编码 | 后编码 |
|------|--------|--------|
| 生成时机 | 新增时即取号 | 保存时生成 |
| 限制 | 不能含业务实体和业务时间 | 无特殊限制 |
| 取号 API | 从上下文获取是否前编码 → 取号 | — |
| 提交 API | `commitPreBillCode(nbcrcode, pk_group, pk_org, billcode)` | 获取编码规则后设置到 VO |
| 退号 API | `rollbackPreBillCode(nbcrcode, pk_group, pk_org, billcode)` | 获取编码规则后回退 |
| 重号处理 | `AbandonBillCode_RequiresNew(nbcrcode, pk_group, orgPre, vo.getCode())` | — |

#### 核心接口

- 编码管理服务：`nc.pub.billcode.itf.IBillcodeManage`
- 编码规则工具类：`nc.impl.pubapp.bill.billcode.BillCodeUtils`

### 6.2 审批流

#### 单据类型 vs 交易类型

| 概念 | 说明 | 提供方 |
|------|------|--------|
| 单据类型 | 完整业务交易场景（入仓单、采购发票、应收单…） | 出厂预置或二开提供 |
| 交易类型 | 单据类型的再分类，扩展规则/模板/流程差异 | 用户定义 |

#### 单据动作

| 动作 | 编码 | 说明 |
|------|------|------|
| 保存 | SAVEBASE | 基础保存 |
| 提交 | SAVE | 保存+提交 |
| 收回 | UNSAVE | 撤回提交 |
| 审批 | APPROVE | 审批通过 |
| 删除 | DELETE | 删除单据 |
| 弃审 | UNAPPROVE | 撤销审批 |

#### 单据动作类

- **命名**：`N_单据类型编码_动作代码`（如 `N_21_SAVE`）
- **继承**：`nc.bs.pub.compiler.AbstractCompiler2`
- **位置**：private 或 public 端的 `nc.bs.pub.action` 包下

### 6.3 自定义项

#### 自定义项属性

- 依附于表单，可理解为用户对表单个性化加工的载体（字段）
- 高级版为各领域模块的大多数表单预置了多个自定义属性
- 可配置：数据类型、名称、精度等

#### 注册与配置流程

1. **用户定义属性组**节点：注册自定义项（数量、元数据实体等）
2. **用户定义属性设置**节点：启用自定义项 + 配置启用属性

#### XML 配置

- 自定义项需要 XML 配置关联到对应的元数据实体和表单模板

---

## 七、常用表关系

主从单据开发涉及的常用数据库表（配合元数据 11 表）：

| 表分类 | 典型表 | 用途 |
|--------|--------|------|
| 应用注册 | bd_billtype、bd_billtypeaction | 单据类型与动作 |
| 编码规则 | bd_billcode_rule、bd_billcode_obj | 编码规则定义 |
| 菜单注册 | sm_menu_item、sm_funcregister | 菜单与应用关联 |
| 模板 | pub_votemplate、pub_form_property | 页面模板配置 |
| 审批流 | wfl_task、wfl_workflow | 审批流程定义 |

> 详细关联关系参见：`app-menu-registration.md` 和 `metadata-tables.md`
