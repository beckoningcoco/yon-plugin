# NCC OpenAPI 签名与加密机制详解

> **适用版本**：NCC >= 2005（OAEP 加密）；NCC < 2005（PKCS1v15，参见旧版）
> **配套工具**：`tools/ncc-api-tester.py` — 基于本文档实现的桌面测试工具

---

## 一、Token 获取（第一步）

### 1.1 请求格式

```
POST http://{NCC_HOST}/nccloud/opm/accesstoken?{QUERY_STRING}
Content-Type: application/x-www-form-urlencoded
Body: (空)
```

**参数全部放在 URL 查询串上，不在 POST body 里。**

### 1.2 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `grant_type` | 是 | `client_credentials`（客户端模式）或 `password`（密码模式） |
| `client_id` | 是 | OpenAPI 应用 ID |
| `client_secret` | 是 | **RSA OAEP 加密后的 Base64**，`+`→`%2B`，`/`→`%2F`。不编码 `=` |
| `biz_center` | 是 | 账套编码 |
| `signature` | 是 | 加盐 SHA256，算法见 §1.3 |
| `dsname` | 是 | 数据源名称 |

### 1.3 签名算法（核心）

**NCC >= 2005 版本使用加盐 SHA256：**

```
data = client_id + client_secret(原始) + pubKey
salt = SHA1PRNG(pubKey) → Base64(含CRLF换行) → 去除\r和\n
signature = SHA256(data + salt)
```

**步骤详解：**

```
1. 用 Java SecureRandom("SHA1PRNG") 以 pubKey 为种子生成 16 字节随机数
   模拟方法: state = SHA1(seed), output = SHA1(state), next_state = SHA1(state + seed)

2. 对 16 字节做 Base64 编码（匹配 sun.misc.BASE64Encoder.encodeBuffer 格式）:
   - 每 76 字符插入 \r\n
   - 末尾追加 \r\n

3. 去除所有 \r 和 \n，得到 salt 字符串

4. 签名 = SHA256(client_id + client_secret + pubKey + salt)

输出: 64 位小写十六进制字符串
```

**Python 实现：**

```python
import hashlib, base64

def java_sha1prng_bytes(seed_bytes, length=16):
    """模拟 Java SecureRandom SHA1PRNG"""
    state = hashlib.sha1(seed_bytes).digest()
    result = b""
    while len(result) < length:
        result += hashlib.sha1(state).digest()
        state = hashlib.sha1(state + seed_bytes).digest()
    return result[:length]

def java_base64_encode(data):
    """匹配 sun.misc.BASE64Encoder.encodeBuffer"""
    b64 = base64.b64encode(data).decode()
    lines = [b64[i:i + 76] for i in range(0, len(b64), 76)]
    return "\r\n".join(lines) + "\r\n"

def salted_sha256(data, pubkey_str):
    salt_bytes = java_sha1prng_bytes(pubkey_str.encode("utf-8"))
    salt_b64 = java_base64_encode(salt_bytes).replace("\r", "").replace("\n", "")
    return hashlib.sha256((data + salt_b64).encode()).hexdigest()

# 使用
signature = salted_sha256(client_id + client_secret + pubkey, pubkey)
```

### 1.4 client_secret 加密

**RSA/ECB/OAEPWithSHA-256AndMGF1Padding**，密钥长度自适应。

```python
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding

pem = "-----BEGIN PUBLIC KEY-----\n" + pubkey_b64 + "\n-----END PUBLIC KEY-----"
pub_key = serialization.load_pem_public_key(pem.encode())

key_bytes = pub_key.key_size // 8
max_block = key_bytes - 2 * 32 - 2  # OAEP SHA-256 开销

oaep = asym_padding.OAEP(
    mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
    algorithm=hashes.SHA256(),
    label=None,
)

data = client_secret.encode("utf-8")
encrypted = b""
for i in range(0, len(data), max_block):
    encrypted += pub_key.encrypt(data[i:i + max_block], oaep)

enc_secret = base64.b64encode(encrypted).decode()
# URL 安全: 只替换 + 和 /，不处理 =
enc_secret_safe = enc_secret.replace("+", "%2B").replace("/", "%2F")
```

### 1.5 完整 URL 示例

```
/nccloud/opm/accesstoken?grant_type=client_credentials&biz_center=01&client_id=bzs&signature=d61fb72f...&client_secret=OwC1N1ti8Q%2BDMesSxUlIW%2FXWpJ%2F...&dsname=NCC
```

**注意事项**：
- 参数直接拼接到 URL，不经过 `urlencode`（避免双编码问题）
- `client_secret` 中只有 `+`/`/` 做转义，`=` 不做
- `dsname` 必填，不能省略

---

## 二、API 调用（第二步）

### 2.1 请求格式

```
POST http://{NCC_HOST}{API_PATH}
Content-Type: application/json;charset=utf-8
```

### 2.2 请求头

| Header | 值 | 说明 |
|--------|-----|------|
| `content-type` | `application/json;charset=utf-8` | **全小写** |
| `access_token` | 第一步获取的 token | |
| `client_id` | 应用 ID | |
| `ucg_flag` | `y` | **小写**，大写 Y 会 400 |
| `signature` | SHA256 签名 | 普通 SHA256，不加盐 |
| `Content-Length` | body 字节数 | **必须显式设置**，否则 "content is null" |

### 2.3 API 签名（不加盐）

```
signature = SHA256(client_id + requestBody + pubKey)
```

**普通 SHA256**，不需要加盐。`requestBody` 是原始 JSON 字符串。

### 2.4 请求体

- 编码为 UTF-8 bytes 后发送
- 使用 `http.client.HTTPConnection` 而非 `urllib.request`（后者无 Content-Length 时有兼容问题）

---

## 三、响应处理

### 3.1 Token 响应

```json
{
  "success": true,
  "data": {
    "access_token": "3866c59d9750403fae705fa72a9633a5",
    "expires_in": 1000000,
    "security_key": "..."
  }
}
```

**注意**：`access_token` 在 `data` 字段内，不是顶层。

### 3.2 编码问题

NCC 响应统一使用 **UTF-8** 编码。如果中文乱码，检查：
- 服务端 Java 源文件是否用 GBK 编译（中文字符串在 .class 中已是乱码）
- 编译时需加 `-encoding UTF-8`

---

## 四、常见错误速查

| 错误 | 原因 | 解决 |
|------|------|------|
| `Decryption error` | RSA 填充算法错误 | 版本 >=2005 用 OAEP，<2005 用 PKCS1v15 |
| `Failed to verify signature for get token` | 签名算法错误 | 版本 >=2005 用加盐 SHA256，pubKey 做盐 |
| `can not find datasource: XX` | dsname 参数错或漏 | 加上正确的 `dsname` |
| `invalid_request, Missing parameters: client_secret client_id` | 参数名不对 | 必须用 `client_id` / `client_secret` |
| `HTTP 400` | 多个原因：body 编码、header 大小写、缺 Content-Length | 检查 §2.2 |
| `argument "content" is null` | 缺 `Content-Length` 请求头 | 显式设置 `Content-Length` |
| 中文乱码（`鍗曟嵁...`） | 服务端 Java 编译编码不匹配 | 用 `-encoding UTF-8` 重新编译 |

---

## 五、完整 Python 实现

参见 `tools/ncc-api-tester.py`。核心依赖：`cryptography`（`pip install cryptography`）。

### 最小可用代码（无 GUI）

```python
import json, hashlib, base64, http.client, ssl
from urllib.parse import quote
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding

def ncc_call(host, client_id, client_secret, pubkey_b64, biz_center, dsname, api_path, request_body):
    """NCC OpenAPI 完整调用，返回 (token, http_status, response_body)"""
    
    def sha256(s): return hashlib.sha256(s.encode()).hexdigest()
    
    # --- OAEP 加密 client_secret ---
    pem = f"-----BEGIN PUBLIC KEY-----\n{pubkey_b64}\n-----END PUBLIC KEY-----"
    pk = serialization.load_pem_public_key(pem.encode())
    mb = pk.key_size // 8 - 66
    oaep = asym_padding.OAEP(mgf=asym_padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    enc = b""
    for i in range(0, len(client_secret.encode()), mb):
        enc += pk.encrypt(client_secret.encode()[i:i+mb], oaep)
    enc_secret = base64.b64encode(enc).decode().replace("+", "%2B").replace("/", "%2F")
    
    # --- 加盐签名 ---
    def sha1prng(seed, n=16):
        s = hashlib.sha1(seed).digest(); r = b""
        while len(r) < n: r += hashlib.sha1(s).digest(); s = hashlib.sha1(s + seed).digest()
        return r[:n]
    def jb64(d):
        b = base64.b64encode(d).decode()
        lines = [b[i:i+76] for i in range(0, len(b), 76)]
        return ("\r\n".join(lines) + "\r\n").replace("\r", "").replace("\n", "")
    salt = jb64(sha1prng(pubkey_b64.encode()))
    sig = sha256(client_id + client_secret + pubkey_b64 + salt)
    
    # --- 获取 Token ---
    url = f"/nccloud/opm/accesstoken?grant_type=client_credentials&biz_center={biz_center}&client_id={client_id}&signature={sig}&client_secret={enc_secret}&dsname={dsname}"
    # (省略 host/port 解析，见工具完整代码)
    conn = http.client.HTTPConnection(host, port=port, timeout=30)
    conn.request("POST", url, body="", headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp = json.loads(conn.read().decode())
    token = resp["data"]["access_token"]
    conn.close()
    
    # --- 调用 API ---
    body_bytes = request_body.encode("utf-8")
    api_sig = sha256(client_id + request_body + pubkey_b64)
    headers = {
        "content-type": "application/json;charset=utf-8",
        "access_token": token, "client_id": client_id,
        "ucg_flag": "y", "signature": api_sig,
        "Content-Length": str(len(body_bytes)),
    }
    conn = http.client.HTTPConnection(host, port=port, timeout=30)
    conn.request("POST", api_path, body=body_bytes, headers=headers)
    resp = conn.getresponse()
    return token, resp.status, resp.read().decode("utf-8")
```

---

## 六、版本差异

| 特性 | NCC < 2005 | NCC >= 2005 |
|------|-----------|------------|
| RSA 填充 | PKCS1v15 (`Cipher.getInstance("RSA")`) | OAEPWithSHA-256 (`RSA/ECB/OAEPWithSHA-256AndMGF1Padding`) |
| Token 签名 | `SHA256(CID+CSEC+PUB)` | `SHA256(CID+CSEC+PUB+salt)`，salt=sha1prng(pubkey) |
| API 签名 | `SHA256(CID+body+PUB)` | `SHA256(CID+body+PUB)`（不变） |

判断版本：`OpenApiVO.version` 字段——`"1"` 表示 <2005，`"2"` 表示 >=2005。参看 `OpenApiCreateSignTools.jar` 源码。
