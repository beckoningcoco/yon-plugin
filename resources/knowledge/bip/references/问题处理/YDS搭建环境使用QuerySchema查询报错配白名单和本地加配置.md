---
name: YDS搭建环境使用QuerySchema查询报错配白名单和本地加配置
description: >
  用友 BIP 客开技能。当用户在 YDS 环境使用 QuerySchema 查询报错 "No instances available"，需要配置 NGINX 白名单和本地 YDS 配置 registryUrl/devMode 时，参考该文档内容。
---

# YDS搭建环境使用QuerySchema查询报错，配白名单和本地加配置

## 报错

```json
{
  "code": 999,
  "message": "QuerySchema执行过程出错...No instances available:[c-scm-xfp-mgpkk.dev -> ustock.dev]"
}
```

## 解决方案

### 1. 找运维配置 NGINX 白名单

将 PC 的公网出口 IP 配置到 NGINX：
```
/data/iuap/middleware/nginx/sites-public/ip_expand.conf
```

### 2. 修改本地 YDS 配置文件

```json
"yds.registryUrl": "https://erp-dev-test.maogeping.com/registry-0/eureka/",
"yds.devMode": "cloudnative"
```

![image-20251225201535735](YDS搭建环境使用QuerySchema查询报错，配白名单和本地加配置/image-20251225201535735.png)
