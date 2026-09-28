# NCC Java 编码规范

## 1. 命名约定

### 包名

| 组件 | 包名模式 | 说明 |
|------|----------|------|
| 实体组件 | `nc.vo.模块.业务组件` | VO 和元数据定义类、枚举类型 |
| 操作组件 | `nc.itf.模块.业务组件` | 给前台维护界面提供的操作接口 |
| 操作实现 | `nc.impl.模块.业务组件` | 操作接口的实现类 |
| 服务组件 | `nc.pubitf.模块.业务组件` | 服务类接口定义 |
| 服务实现 | `nc.pubimpl.模块.业务组件` | 服务接口的实现 |
| BP 组件 | `nc.bs.模块.业务组件` | BP 的实现类，组合业务规则 |
| 前端响应 | `nccloud.web.模块.xxClient` | 前端响应组件 |
| 动作映射 | `yyconfig.modules.模块.xx.config.action` | 动作映射文件 |
| 动作鉴权 | `yyconfig.modules.模块.xx.config.authorize` | 动作鉴权文件 |

### 类和接口

- 采用大驼峰命名，避免缩写（除非广泛采用如 `URL` → `Url`）
- 接口首字母 `I`，默认实现类去 `I` 加 `Impl`
- 业务内部逻辑实现类以 `BO` 结尾
- 数据访问类以 `DAO` 或 `DMO` 结尾
- 测试类以 `Test` 结尾
- 继承 `ValueObject` 的类以 `VO` 结尾，聚合 VO 以 `AggVO` 结尾

### 方法

- 小驼峰，动宾结构，不用下划线分隔
- 遵循 JavaBean 标准：getter（`get + 属性名`）、setter（`set + 属性名`）

### 变量

- 小驼峰，名词意义，不超过 16 字符
- 避免单字符（临时变量除外：整型 i/j/k/m/n，字符型 c/d/e，坐标 x/y/z）

### 常量

- 全大写 + 下划线分隔，不超过 16 字符
- 示例：`public static String BTN_AREA_COMMON = "common";`

### 泛型变量

- `T`：单一泛型类型
- `K`/`V`：Key/Value 对应的泛型类型
- `E`：与声明类聚合关系的泛型类型

## 2. 注释规范

### 原则

- 注释简单明了，不写显而易见的内容
- 一般 getter/setter 不加注释
- 用中文编写开发文档
- 符合 Javadoc 语法
- 不使用格式修饰符（大串 `*` 或 `-`）

### 文档注释

用于类、接口、公开方法、成员变量。常用标签：

| 标签 | 用途 | 作用目标 |
|------|------|----------|
| `@author` | 代码作者 | 类/接口 |
| `@version` | 版本号 | 类/接口 |
| `@param` | 参数说明 | 方法 |
| `@return` | 返回值说明 | 方法 |
| `@throws` | 抛出异常说明 | 方法 |
| `@deprecated` | API 已废除 | 类/方法 |
| `@since` | API 开始版本 | 类/方法 |
| `@see` | 引用说明 | 类/方法/变量 |

### 类注释内容顺序

1. 类主要说明
2. 类设计目标、功能
3. 使用方式、环境要求（线程安全、并发、约束）
4. 已知 bug
5. 修改历史（修改人 + 日期 + 简要说明）
6. `@author`、`@version`、`@see`、`@since`

### 文档注释位置

- 文档注释与其注释部分之间**不能有空行**
- 类注释放在类定义的紧前面

## 3. 代码书写规范

### 类编写规范

- 单文件不超过 2000 行
- 方法不超过 100 行有效代码（不含注释），保证逻辑完整
- 参数列表不超过 5 个，超过时用对象封装
- 操作符两侧留空格（`++`/`--`/`^` 除外）；括号内侧不留空格
- 数组声明：`char[] buffer;`（推荐），而非 `char buffer[];`

### 类结构顺序

1. 常量声明
2. 静态变量声明
3. 成员变量声明
4. 构造函数
5. finalize
6. 成员方法
7. 静态方法

段与段之间以空行分隔，方法与方法之间以空行隔离。

## 4. 编程要求

- 方法功能单一
- 局部变量使用时刻声明，尽可能缩小作用域
- 局部/静态变量声明时同时初始化
- 避免与上层作用域变量同名
- 不允许调用 `System.gc()`
- 使用 `finally` 子句进行必须的清理
- 成员变量通过 getter/setter 访问
- 容器使用接口声明（`List`/`Set`/`Map`），**必须**使用泛型
- 尽量使用 `private`/`protected`
- 用类引用静态变量和静态方法，不用对象引用
- `UFDouble` 常量用 `UFDouble.ZERO`、`UFDouble.ONE`
- `UFBoolean` 用 `UFBoolean.valueOf(true|false|y|n|Y|N)` 构造，常量用 `UFBoolean.TRUE`、`UFBoolean.FALSE`

## 5. 异常处理规范

- 禁止对大段代码整块 `try-catch`，要明确异常抛出位置
- `finally` 块中不能有 `return`
- 不直接抛 `RuntimeException` 或 `Exception`
- 防止 NPE（NullPointerException）
- 捕获异常是为了处理它，不要捕获后空处理；不处理则抛给调用者
- 不用异常做流程控制
- 捕获与抛出必须完全匹配，或捕获是抛出的父类
- `RuntimeException` 应通过预先检查规避，而非 `catch`

### 异常封装方式

**EJB 边界（接口实现方法）：**
```java
try {
    // 业务逻辑
} catch (Exception e) {
    ExceptionUtils.marsh(e);
}
```

**其他地方（特别是跨领域服务适配器）：**
```java
try {
    // 业务逻辑
} catch (Exception e) {
    ExceptionUtils.wrappException(e);
}
```

## 6. 文件和目录规范

### 目录结构

| 目录 | 说明 |
|------|------|
| `ierp`/`ierp/bin` | 共用的全局配置文件 |
| `webapps` | 核心 web 应用部署目录 |
| `hotwebs` | 扩展 web 应用目录 |
| `ejb` | NC 中间件 ejb 包目录 |
| `ejbXMLs` | NC 中间件 ejb 描述文件目录 |
| `ncscript` | 数据库脚本存放目录 |
| `nclogs` | 系统日志存放目录 |
| `modules` | 各产品模块部署目录（`classes` 加载优先级高于 `lib`） |

### 模块目录结构

- `<M>/META-INF/module.xml` — 模块属性配置（必须存在）
- `<M>/lib` — 模块公开 API 的 jar 包
- `<M>/classes` — 模块公开 API 的 class 文件（补丁）
- `<M>/META-INF/lib` — 模块私有代码的 jar 包（DMO、业务实现等）
- `<M>/META-INF/classes` — 模块私有代码的 class 文件（补丁）
- `<M>/extension/lib`、`classes` — 二次扩展的公开 API
- `<M>/extension/META-INF/lib`、`classes` — 二次扩展的私有 API
- `<M>/client/lib`、`classes` — 客户端用到的代码
- `<M>/config` — 产品模块自己的配置文件

### 文件命名

- 不用中文，只用数字和英文字母，不以数字开头
- 名称有意义，尽量简短，不用空格，不以 `.` 开头
- 分隔使用下划线或小驼峰
- 模块名必须小写

### 配置文件

- 服务组件配置必须以 `.upm` 结尾
- AOP 配置必须以 `.aop` 结尾
- 属性文件采用 UTF-8 编码，后缀 `.properties`，放在模块的 `resources` 目录下

## 7. 文件编码规范

**⚠️ NCC 项目必须使用 GBK 编码**

- 所有 Java 源文件（`.java`）采用 **GBK** 编码保存
- 注释、文档中使用中文时，确保文件以 GBK 编码存储
- IDE 设置：IDEA/Eclipse 中将项目文件编码设置为 GBK
- 避免出现中文乱码问题
