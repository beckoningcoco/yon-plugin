---
name: Arthas调试工作台使用
description: >
  用友 BIP 客开技能。当用户需要使用 Arthas 在线调试 BIP 环境，包括查看 JVM 信息、搜索类、反编译字节码、监控方法入参返回值、跟踪方法调用耗时等场景时，参考该文档内容。
---

# Arthas调试工作台使用

## 1. 查看 JVM 信息

```
dashboard
```

实时显示 CPU、内存、线程、GC 等概览。

## 2. 查看某个类是否加载

```
sc *OrderService
```

`sc` = Search Class，支持通配符。

## 3. 反编译类（查看实际运行的字节码）

```
jad com.example.service.OrderService
```

## 4. 监控方法入参和返回值（核心功能）

```
watch com.example.service.OrderService createOrder '{params, returnObj}' -x 3
```

- `params`：方法参数
- `returnObj`：返回值
- `-x 3`：展开对象层级深度为 3
- 按 `Ctrl+C` 退出监控

## 5. 跟踪方法调用耗时（定位慢接口）

```
trace com.example.service.OrderService createOrder
```

## 典型调试场景

### 场景 1：线上订单创建失败，但日志没报错

```
# 监控 createOrder 方法的参数和返回值（含异常）
watch com.yourcompany.service.OrderService createOrder '{params, returnObj, throwExp}' -e -x 3
```

- `-e`：捕获异常（`throwExp`）
- 可看到是否抛了异常但被吞掉

### 场景 2：某个接口突然变慢

```
# 跟踪整个调用链
trace com.yourcompany.controller.OrderController createOrder

# 如果是异步，可加 --skipJDKMethod false 查看 JDK 内部调用
```

### 场景 3：确认热部署是否生效

```
# 反编译查看当前运行的类
jad com.yourcompany.service.PricingService

# 对比你本地的源码，确认是否已更新
```
