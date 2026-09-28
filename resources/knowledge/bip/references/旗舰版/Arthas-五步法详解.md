# Arthas 五步法详解

> 本文档是 [[Arthas-API测试实战流程]] 的子文档，详细说明五步测试法的每步操作和命令用法。

---

## 五步法测试流程

### 第一步：搜索类 `sc`

根据接口 URL 倒推控制器类。BIP 中 URL 前缀是模块名（如 `/drzb/ones/test`），**不一定是 Java 包名**。

```
sc *.ones.controller.*
sc *Test1Controller
sc *Controller* -n 200   # 列出所有 Controller
```

> **常见情况**：用户知道类名时直接跳过此步。

### 第二步：查看方法 `sm`

确认要监控的方法签名：

```
sm com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller
```

输出示例：
```
com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller  sync(Ljavax/servlet/http/HttpServletRequest;Ljava/util/Map;)Ljava/util/Map;
com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller$$EnhancerBySpringCGLIB$$xxx  sync(...)
```

> Spring 代理的类会同时出现原始类和 CGLIB 增强类，两者都会被监控到。

### 第三步：挂载监控

三种武器，按场景选用：

| 命令 | 用途 | 适用场景 |
|------|------|----------|
| `tt` | 录制每次调用的入参/返回值/耗时/异常 | **首选**，事后可反复查看 |
| `watch` | 实时观察入参/返回值/异常 | 需要边调边看 |
| `trace` | 跟踪方法内部调用链和每层耗时 | 定位慢在哪个环节 |

#### 3a. TimeTunnel `tt`（推荐首选）

```
tt -t com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller sync -n 5
```

- `-t`：录制模式
- `-n 5`：最多录 5 次
- 输出 `listenerId: 4` 表示录制已激活
- 按 `Ctrl+C` 停止录制

**tt 的优势**：方法调用结束后可以反复查看，不需要掐时间。

#### 3b. 实时观察 `watch`

```
# 正常返回
watch com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller sync '{params, returnObj}' -x 3

# 捕获异常（-e 参数）
watch com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller sync '{params, returnObj, throwExp}' -x 5 -e

# 同时监控正常+异常（开两个 Arthas 会话分别跑）
```

- `-x 3`：对象展开深度（太大输出会很冗长）
- `-e`：仅在异常抛出时触发
- 不带 `-e`：仅在正常返回时触发

#### 3c. 调用链耗时 `trace`

```
trace com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller sync
```

输出方法内部每一层调用的耗时树，用于定位 52 秒到底卡在哪一步。

### 第四步：触发请求

用 curl / Postman / Apipost 发送请求：

```bash
curl -X POST 'http://127.0.0.1:62871/drzb/ones/test?yht_access_token=xxx' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 第五步：查看结果

#### tt 录制结果

```bash
# 列出所有录制记录
tt -l

# 输出示例：
#  IND  TIMESTAMP          COST(ms)   IS-RET  IS-EXP  CLASS              METHOD
# 1000 2026-06-17 23:23:16 52406.3893 true    false   Test1Controller    sync
# 1001 2026-06-17 23:23:16 52409.7975 true    false   Test1Controller$... sync

# 查看某次调用的详细入参和返回值
tt -i 1000 -w '{params, returnObj}' -x 3

# 查看是否有异常（即使 IS-EXP=false，也看看 throwExp）
tt -i 1000 -w '{params, returnObj, throwExp}' -x 3

# 重新播放某次调用（危险！会真实执行）
tt -i 1000 -p
```

#### 字段含义

| 字段 | 含义 |
|------|------|
| `IND` | 录制索引（`tt -i` 用这个值查看详情） |
| `COST(ms)` | 方法执行耗时（毫秒） |
| `IS-RET` | 是否有返回值（true=正常返回） |
| `IS-EXP` | 是否抛出了异常（true=有异常传播出来） |

---

## 实战案例：验证接口是否报错被吞

### 背景

接口 `POST /drzb/ones/test` 返回 `{"asynchronized":"true"}` HTTP 200，耗时 52 秒。怀疑业务逻辑内部报错被 catch 吞掉。

### 执行步骤

```bash
# 1. 确认类已加载
python scripts/arthas_exec.py sc *Test1Controller

# 2. 查看方法签名
python scripts/arthas_exec.py sm com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller

# 3. 启动 tt 录制（监听类命令，会阻塞）
python scripts/arthas_exec.py --timeout 120 tt -t com.yonyou.ucf.mdf.prjc.ones.controller.Test1Controller sync -n 3

# 4. 另一个终端发请求
curl -X POST 'http://127.0.0.1:62871/drzb/ones/test?...' -H 'Content-Type: application/json' -d '{}'

# 5. 查录制结果
python scripts/arthas_exec.py tt -l

# 6. 查看具体入参返回值
python scripts/arthas_exec.py tt -i 1000 -w "{params, returnObj, throwExp}" -x 3
```

### 结果分析

```
入参：
  - HttpServletRequest: WebSphere SRTServletRequest40
  - Map: 空 LinkedHashMap（body {} 解析结果）

返回值：
  - {"asynchronized": "true"}

异常：IS-EXP = false（无异常传播出 sync 方法）
耗时：52406ms（≈52秒）
```

### 结论判断

- `IS-EXP = false` 只说明异常**没有从 sync 方法传播出来**
- 如果异常在 sync 方法**内部**被 try-catch 吞掉：不会出现在 tt 中
- 此时需要进一步用 `trace` 看调用链，或在可疑的内部方法上再挂 `tt`

---

## 参考资料

- [[Arthas-API测试实战流程]] — 返回主文档
- [[Arthas调试工作台使用]] — dashboard、sc、jad、watch、trace 等基础命令
- [Arthas 官方文档](https://arthas.aliyun.com/doc/)
