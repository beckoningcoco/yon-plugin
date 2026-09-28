# Arthas 镜像测试方案

> 本文档是 [[Arthas-API测试实战流程]] 的子文档。当 Arthas 监控受阻（异步执行、30s 超时、日志被过滤、方法耗时过长）时，使用镜像 Controller 进行深度测试。

---

## 适用场景

| 场景 | 说明 |
|------|------|
| 异步接口 | 业务逻辑在 YmsExecutor 线程中执行，Arthas 监听类命令（tt/watch/trace）30s 超时无法捕获 |
| 日志被过滤 | YMS 框架日志级别过滤了业务包的 `log.info`，无法从日志判断执行结果 |
| 耗时过长 | 方法执行超过 HTTP 连接超时，curl 拿不到响应 |
| 需要逐步骤输出 | 原始接口只返回 `{"asynchronized":"true"}`，无法了解内部各步骤执行情况 |

---

## 镜像 Controller 的构建要点

### 1. 文件位置

在原始 Controller 同路径下创建 `XxxTestController.java`，与原始 Controller 同包名，确保 Spring 自动扫描和依赖注入正常工作。

```
原始:  xxx/controller/OnesSyncController.java
镜像:  xxx/controller/OnesSyncTestController.java   ← 同路径
```

### 2. 必须改同步执行

**原始代码（异步）**：
```java
ymsExecutor.execute(() -> {
    try {
        int status = service.doSomething(params);
        callbackPlatform(logId, status, "success");
    } catch (Exception e) {
        log.error("异常", e);
        callbackPlatform(logId, 0, e.getMessage());
    }
});
return Map.of("asynchronized", "true");  // 立即返回
```

**镜像代码（同步）**：
```java
// 直接在 HTTP 线程中同步执行，不经过 YmsExecutor
long startTime = System.currentTimeMillis();
int status = service.doSomething(params);
long cost = System.currentTimeMillis() - startTime;
return Map.of("status", status, "costMs", cost);  // 返回实际结果
```

### 3. 用 `log.error` 代替 `log.info`

BIP 的 YMS 框架经常只输出 `ERROR` 级别的日志。镜像类中所有步骤日志统一用 `log.error()` 输出，绕过日志过滤：

```java
// ❌ 原始：log.info("ONES登录成功")  → 可能被过滤
// ✅ 镜像：log.error("[Step0] ONES登录成功, token前8位={}, 耗时={}ms", ...)  → 必然输出
```

### 4. 返回详细执行结果

镜像接口返回的 JSON 应包含：
- `stepLogs`: 每一步的耗时和状态
- `detailLogs`: 每条数据的处理明细（成功/跳过/失败 + 原因）
- `finalStatus`: 最终状态码
- `successCount / skipCount / failCount`: 分类计数
- `totalCostMs`: 总耗时

### 5. 拷贝业务代码但保持独立

镜像类复制原始 Service 的核心业务逻辑，但不共享代码。这样：
- 可以在镜像中临时加日志、改逻辑用于调试
- 不影响原始接口的正常运行
- 测试完成后可以直接删除镜像类

---

## 实战案例：东软载波 ONES 工时同步

**背景**：
- 接口 `POST /drzb/ones/sync` 是异步的，返回 `{"asynchronized":"true"}`
- Arthas tt/watch/trace 全部因 30s 超时被中断
- YMS 日志过滤了业务包的输出
- 无法判断 ONES → BIP 工时同步的实际执行结果

**镜像 Controller**：`OnesSyncTestController.java`（同路径）

| 对比项 | 原始 | 镜像 |
|--------|------|------|
| URL | `/drzb/ones/sync` | `/drzb/ones/testSync` |
| 执行方式 | 异步（YmsExecutor） | **同步** |
| 日志 | `log.info`（被过滤） | `log.error`（可见） |
| 返回 | `{"asynchronized":"true"}` | 每步耗时 + 80条明细 + 汇总 |
| 步骤日志 | 不可见 | `[Step0] ONES登录成功, 耗时=138ms` |
| 数据明细 | 不可见 | `{idx:1, email:..., result:"SKIP", reason:"工时已存在"}` |

**通过镜像类发现的问题**：
1. 🔴 日期转换 Bug：ONES 返回秒级时间戳，代码误当微秒除以 1000，全部变成 1970-01-01
2. 🔴 缺少 `jakarta.mail` 运行时依赖，导致模块启动失败
3. ⚠️ ONES 项目编码与 BIP 不一致，部分项目找不到
4. ⚠️ 日志被 YMS 框架过滤，无法排查线上问题（建议改用 `log.error`）

---

## 接口没有返回响应体，或者返回了一个成功的响应

1. 接口不一定没问题，有可能是异步接口，真正的业务逻辑是在另一个线程执行的。
2. 此时，需要使用 Arthas `jad` 命令反编译方法，判断是否要深入到业务层测试。

---

## 参考资料

- [[Arthas-API测试实战流程]] — 返回主文档
- [[Arthas-五步法详解]] — sc/sm/tt/watch/trace 命令详解
