---
name: BIP对代码块加锁防止并发重复保存
description: >
  用友 BIP 客开技能。当用户需要防止并发推送时重复保存单据，使用 YmsLockFactory（iuap平台锁）或 Redis 分布式锁（StringRedisTemplate + Lua 脚本）对代码块加锁，解决高并发场景下验重逻辑的时间窗口问题时，参考该文档内容。
---

# BIP对代码块加锁，防止同时推送时重复保存单据

## 场景

客开销售订单接口依赖报文中的 `MGP301`（外系统验重单号）执行单据验重。但第三方系统批量并发推送多条报文，验重检查与落库保存之间存在时间窗口，导致多个相同 `MGP301` 的请求同时通过验重，产生重复单据。

## 方案一：YmsLockFactory（iuap 平台锁，推荐）

```java
@Autowired
private YmsLockFactory ymsLockFactory;

try {
    lockKey = validationResult.mgp302Id + "_" + validationResult.mgp301;
    boolean lock = ymsLockFactory.getLock(lockKey).tryLock(30, 5, TimeUnit.SECONDS);
    if (!lock) {
        throw new BusinessException("999",
            "单据【" + validationResult.mgp301 + "】正在同步，请稍后再试");
    }
    // 执行业务逻辑...
} finally {
    ymsLockFactory.getLock(lockKey).unLock();
}
```

## 方案二：Redis 分布式锁（StringRedisTemplate + Lua）

```java
@Autowired
private StringRedisTemplate redisTemplate;

private static final String UNLOCK_LUA_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then " +
    "   return redis.call('del', KEYS[1]) " +
    "else return 0 end";

String lockKey = LOCK_PREFIX + validationResult.mgp301;
String lockValue = UUID.randomUUID().toString();
Boolean acquired = false;

try {
    acquired = redisTemplate.opsForValue()
            .setIfAbsent(lockKey, lockValue, Duration.ofSeconds(LOCK_TIMEOUT));
    if (!Boolean.TRUE.equals(acquired)) {
        throw new BusinessException("999",
            "MGP301=" + validationResult.mgp301 + " 的订单正在处理中，请勿重复提交。");
    }
    // 执行业务逻辑...
} finally {
    if (Boolean.TRUE.equals(acquired)) {
        redisTemplate.execute(
            new DefaultRedisScript<>(UNLOCK_LUA_SCRIPT, Long.class),
            Collections.singletonList(lockKey), lockValue);
    }
}
```

## 注意

- 加锁是为了防止同一时间高并发导致数据库验重逻辑失效
- 数据库的验重逻辑该加还是要加（锁不是万能的）
