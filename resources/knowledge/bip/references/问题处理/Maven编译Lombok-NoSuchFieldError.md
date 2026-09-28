# Maven 编译报错 NoSuchFieldError: JCTree$JCImport.qualid

## 报错信息

```
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.2:compile (default-compile) on project xxx: Fatal error compiling: java.lang.NoSuchFieldError: Class com.sun.tools.javac.tree.JCTree$JCImport does not have member field 'com.sun.tools.javac.tree.JCTree qualid' -> [Help 1]
```

## 原因

Lombok 通过**反射直接操作 `com.sun.tools.javac.tree.*` 内部类**来实现注解处理。这些类是 JDK 编译器内部实现，不受 Java 语言规范保护，JDK 8 的每个小版本都可能改动它们。

当 JDK 小版本太新（如 Zulu 8.86 / JDK 8u452，2026年4月发布）而 Lombok 版本较老（如 1.18.24，2022年发布）时，Lombok 无法找到它期望的内部字段，编译直接报错退出。

## 解决办法

换用一个较老的 JDK 8 版本，例如 **Oracle JDK 8u291** 或 **Oracle JDK 8u202**，确保与当前 Lombok 版本兼容。

Lombok 的版本通常由 BIP 父 POM（`iuap-3rd-party`）统一管理，不建议自行升级 Lombok，换 JDK 是更安全的方式。

## 排查命令

```bash
# 确认 JDK 版本
java -version

# 确认 qualid 字段是否存在于当前 JDK
javap -p -cp "%JAVA_HOME%/lib/tools.jar" com.sun.tools.javac.tree.JCTree\$JCImport
```

如果 `javap` 输出中**没有** `public com.sun.tools.javac.tree.JCTree qualid;` 这一行，说明 JDK 内部实现已变更，需要更换 JDK。

## 适用场景

- BIP 客开项目，使用 JDK 8 + Lombok + maven-compiler-plugin 3.x
- 更换 JDK 后需同时更新 `JAVA_HOME` 环境变量
