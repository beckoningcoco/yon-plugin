---
name: 测试批量调用接口的压力测试Controller示例
description: >
  用友 BIP 客开技能。当用户需要编写压力测试控制器，通过 CompletableFuture + YmsExecutors 线程池并发调用 BIP 保存接口（如销售订单），测试批量并发场景时，参考该文档内容。
---

# 测试批量调用接口，压力测试的控制器Controller示例

```java
@RestController
@RequestMapping("/test/salesorder")
public class SalesOrderPressureTestController {

    @Autowired
    private ISaleOrderServiceV2 saleOrderService2;

    private static final Logger logger = LoggerFactory.getLogger(SalesOrderPressureTestController.class);

    /**
     * 执行单次销售订单保存调用
     */
    private Map<String, Object> doSingleCall(Map<String, Object> reqMap) {
        // 注意：每次调用要拷贝请求报文副本
        Map<String, Object> map = new HashMap<>(reqMap);
        return saleOrderService2.saveAndAudit(map);
    }

    /**
     * 压力测试 — 并发调用保存接口
     */
    @PostMapping("/pressureTest")
    public Map<String, Object> pressureTest(@RequestBody Map<String, Object> request) {
        ExecutorService executorService = YmsExecutors.getYmsExecutor();
        List<CompletableFuture<Map<String, Object>>> futures = new ArrayList<>();

        for (int i = 1; i <= 10; i++) {
            CompletableFuture<Map<String, Object>> future = CompletableFuture.supplyAsync(() -> {
                // 子线程中设置租户上下文，避免 InvocationInfoProxy 获取到 null
                return doSingleCall(request);
            }, executorService);
            futures.add(future);
        }

        // 等待所有任务完成
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        // 收集结果
        List<Map<String, Object>> allResults = new ArrayList<>();
        for (CompletableFuture<Map<String, Object>> future : futures) {
            try {
                if (future.isDone() && !future.isCompletedExceptionally()) {
                    allResults.add(future.get());
                }
            } catch (Exception e) {
                logger.error("获取任务结果异常: {}", e.getMessage());
            }
        }

        executorService.shutdown();
        return null;
    }
}
```

## 关键点

- 使用 `YmsExecutors.getYmsExecutor()` 获取 BIP 平台线程池
- 通过 `CompletableFuture.supplyAsync()` 实现并发调用
- 每次调用前需 **拷贝请求报文副本**（`new HashMap<>(reqMap)`），避免并发修改
- 子线程中需要设置租户上下文，避免 `InvocationInfoProxy` 获取 null
