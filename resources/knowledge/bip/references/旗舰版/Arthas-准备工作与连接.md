# Arthas 准备工作与连接

> 本文档是 [[Arthas-API测试实战流程]] 的子文档，详细说明测试前的准备工作和 Arthas 的连接方式。

---

## 准备工作（7 步骤）

1. **确定接口调用地址和请求头**：需要完整的 URL（如 `127.0.0.1:62871/test`）和请求头参数。如果是 BIP 旗舰版客开接口，请求头必传 `key: yht_access_token`，value 需要用户提供。

2. **如果没有 IP/Host，有 curl 命令也可以**：从 curl 中提取 URL 和参数。

3. **确认测试项目和数据库信息**：查看 `project-config.md` 中是否已有目标项目的开发环境数据库信息，向用户确认是否正确。如果没有，询问用户是否需要维护到配置文件中，也可以跳过。

4. **确认测试的功能接口**：了解详细的功能需求逻辑后，才开始测试。判断用户是否指明了接口入口类/实现类，没有则询问用户。

5. **分析接口业务逻辑**：拿到接口类后，分析功能是同步执行还是异步执行（后台任务接口通常是异步的）。对长且复杂的业务代码进行片段划分（1、2、3、4...），分段测试，判断每段逻辑是否符合整体业务预期。

6. **构造请求参数**：如果用户没有指定参数，根据代码自行拼出符合业务需求的参数。注意参数语义（如 `org` 在旗舰版是组织的意思，不能传日期进去）。

7. **确认接口联通性和 Arthas 服务**：确认本地 Arthas 是否已开启并成功监控到 YDS 服务。没有则给出启动命令。

### 如何给出正确的 Arthas 启动命令

**第一步**：查询本地正在启动的 Java 进程
```bash
jps -l 2>&1 || java -version 2>&1
```
发现类似 `22132 iuap.yms.YMSLauncher` 的进程 → 大概率是旗舰版 YDS 启动的本地服务。

**第二步**：判断 Java 进程使用的 JDK
```powershell
powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=22132' | Select-Object -ExpandProperty CommandLine" 2>&1
```
发现 JDK 路径，如 `D:\YDS_JDK21_20260513\devkit\jdk21.0.7-win_x64\bin\java.exe`。

**第三步**：确认 Arthas 本地服务的位置，参考 Skill 目录中的 `path_config.json` 配置项。

**第四步**：给出完整命令，示例：
```bash
D:/YDS_JDK21_20260513/devkit/jdk21.0.7-win_x64/bin/java -jar E:/Arthas/arthas-bin/arthas-boot.jar --http-port 8563 --select YMSLauncher 2>&1
```

---

## 连接 Arthas

### 方式一：直连 telnet（推荐脚本化测试）

```
telnet 127.0.0.1 3658
```

- 默认 telnet 端口：`3658`
- 适合 curl/脚本自动化交互
- 一个连接 = 一个 Arthas 会话
- **无超时限制**，适合长时间监控异步方法

### 方式二：Tunnel Server Web 控制台

浏览器打开 `http://127.0.0.1:8563/`，图形化操作。

> Tunnel Server 端口默认 `8563`。

### 方式三：arthas_exec.py 工具脚本（⭐ 推荐）

> **工具脚本**: `scripts/arthas_exec.py`
>
> 基于 Tunnel Server HTTP API 的命令行工具，自动格式化输出，避免手拼 JSON / 转义引号。

```bash
# 单次命令
python scripts/arthas_exec.py sc *stockSync*
python scripts/arthas_exec.py sm com.yonyou.ucf.mdf.jiankang.controller.StockSyncController
python scripts/arthas_exec.py tt -t com.yonyou.ucf.mdf.jiankang.controller.StockSyncController balancePush2 -n 3
python scripts/arthas_exec.py tt -l
python scripts/arthas_exec.py tt -i 1000 -w "{params, returnObj, throwExp}" -x 3
python scripts/arthas_exec.py ognl "@java.lang.System@getProperty(\"domain.iuap-apcom-coderule\")"

# 交互模式
python scripts/arthas_exec.py -i

# 指定端口
python scripts/arthas_exec.py --port 8564 sc *Controller*
```

> **注意**：监听类命令（`watch`/`stack`/`trace`）会阻塞等待，建议另开终端先跑监听，再用 curl 触发请求。

### 方式四：Python Socket 直连 telnet（原始方式）

```python
import socket, time

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(10)
s.connect(('127.0.0.1', 3658))
# 吃 banner
time.sleep(0.5)
s.recv(4096)

def arthas_cmd(cmd):
    s.send((cmd + '\n').encode())
    time.sleep(1.5)
    resp = b''
    while True:
        try:
            chunk = s.recv(8192)
            if not chunk: break
            resp += chunk
            if b'$' in resp: break
        except: break
    return resp.decode('utf-8', errors='replace')
```

---

## 参考资料

- [[Arthas-API测试实战流程]] — 返回主文档
- [Arthas 官方文档](https://arthas.aliyun.com/doc/)
