# 托底策略规范

> **⚠️ 重要提示**
>
> **此为兜底逻辑，优先使用动态适配方案。实际部署应由厂商配置覆盖。**
>
> 本文件仅在无第三方配置时启用，提供通用默认实现参考。

## 触发条件

以下情况将启用托底逻辑：

1. 未配置任何第三方系统接口
2. 动态配置加载失败
3. 第三方接口调用超时或不可用（可配置降级策略）

## 域参数替换

> 根据 <skill-base>/SKILL.md 中的**域参数表**替换以下占位符：
> - `{Prefix}` / `{prefix}` → 场景命名前缀（如 FinishReport / finishreport）
> - `{route}` → Controller 路由路径（如 /finishreport）

## 托底实现架构

```
┌─────────────────────────────────────────────────────────────┐
│                    托底策略选择器                            │
│  检查第三方配置 ──▶ 无配置 ──▶ 启用托底实现                 │
│                      │                                      │
│                      ▼                                      │
│                有配置 ──▶ 使用动态适配方案                   │
└─────────────────────────────────────────────────────────────┘
```

## 托底逻辑

### 核心流程

```
单据ID ──▶ 查询BIP数据 ──▶ 默认字段映射 ──▶ 调用默认接口 ──▶ 回写状态
```

### 实现代码

```java
/**
 * 托底{Prefix}推送实现
 * 仅在无第三方配置时启用
 */
@Service("fallback{Prefix}PushService")
public class Fallback{Prefix}PushService implements {Prefix}PushService {

    @Value("${fallback.{prefix}.url:}")
    private String fallbackUrl;

    @Autowired
    private {Prefix}QueryService queryService;

    @Autowired
    private {Prefix}FieldMapper fieldMapper;

    @Override
    public {Prefix}Result push(List<String> billIds) throws Exception {
        {Prefix}Result result = new {Prefix}Result();

        for (String billId : billIds) {
            try {
                // 1. 查询BIP数据
                Map<String, Object> bipData = queryService.query{Prefix}(billId);

                // 2. 转换为默认格式
                Map<String, Object> targetData = fieldMapper.convert(bipData);

                // 3. 调用默认接口
                ThirdApiResponse response = callThirdApi(targetData);

                // 4. 处理结果
                if (response.isSuccess()) {
                    // 回写成功状态
                } else {
                    // 记录失败
                }
            } catch (Exception e) {
                // 记录异常
            }
        }

        return result;
    }

    private ThirdApiResponse callThirdApi(Map<String, Object> data) {
        // TODO: 实现默认接口调用逻辑
        ThirdApiResponse response = new ThirdApiResponse();
        return response;
    }
}
```

### 托底配置

```yaml
# 托底配置
fallback:
  enabled: true
  {prefix}:
    url: "http://default-third-party/api/{prefix}"
    timeout: 30000
```

## 降级策略

### 自动降级

当第三方接口调用失败时，系统自动切换到托底实现：

1. **超时降级**：接口调用超过配置时间自动降级
2. **异常降级**：接口返回错误码自动降级
3. **手动降级**：通过配置开关强制使用托底

### 降级日志

```java
log.warn("第三方接口调用失败，触发托底策略，billId: {}, error: {}", billId, errorMessage);
```

## 配置开关

```yaml
integration:
  fallback:
    enabled: true
    force: false
```

> **⚠️ 注意**：托底策略为最小可用实现，生产环境建议配置具体的第三方接口
