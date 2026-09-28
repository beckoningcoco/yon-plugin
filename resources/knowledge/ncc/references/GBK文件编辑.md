# GBK 源码文件的安全读写与编辑

> 适用：用友 NCC / BIP 客开包的源码树（GBK 编码），以及任何"文件是 GBK、工具链是 UTF-8"的场景。
> 工具：`ncc_gbk_edit`（由插件宿主提供，无需本地脚本）

---

## 一、为什么这是个问题

NCC 客开包的 `.java` 源码在磁盘上是 **GBK**（中文 Windows + Eclipse 的历史约定），
而通用编辑/搜索工具按 **UTF-8** 硬解码，且没有编码参数：

| 操作 | 后果 |
|------|------|
| 读取 | 中文变乱码：`OA 中间库` → `OA �м���` |
| 搜索 | 中文检索词永远搜不到（UTF-8 字节 vs GBK 字节） |
| 编辑 | 渲染成 `�` = **U+FFFD 替换字符**，即按 `errors='replace'` 解码，**信息已丢**。此时写回会按 UTF-8 编码，文件变成 GBK/UTF-8 混杂，中文被写成 `?`/`�`，**不可逆损坏** |

**关键认知：直接编辑 GBK 文件不是"会失败"，是"会静默损坏"。**

---

## 二、三种正确姿势

### 姿势 1：工具直接编辑（适合改动少、锚点明确）

```bash
# 先干净地看，别在乱码里猜内容
ncc_gbk_edit(path="文件.java", read=True, lines="180-240")
ncc_gbk_edit(path="文件.java", grep="上个月月末")

# 再改（old/new 写进 JSON，绕开 shell 转义）
ncc_gbk_edit(path="文件.java", edits="edits.json", dry_run=True)   # 先看 diff
ncc_gbk_edit(path="文件.java", edits="edits.json")
```

### 姿势 2：转码 → 常规编辑工具 → 转回（适合改动多）

```bash
ncc_gbk_edit(path="文件.java", convert="utf8")
# ...此处用常规编辑工具做任意多次修改...
ncc_gbk_edit(path="文件.java", convert="gbk", encoding="utf-8")
```

⚠️ **只在"一头一尾"各转一次**，中间的多次编辑都在 UTF-8 状态下做。
不要每改一处就转一次（2N 次转换，纯浪费）。

⚠️ **转码后有中间态**：文件此刻是 UTF-8。若中途中断，源码树里就留了个 UTF-8 文件，
编译出来中文全是乱码。所以姿势 2 要一口气走完。

### 姿势 3：整体重写（改造范围大时）

用常规方式写出完整 UTF-8 内容，再 `convert gbk` 落盘。

---

## 三、`ncc_gbk_edit` 参数

```
# 读（替代在乱码里猜）
ncc_gbk_edit(path="FILE", read=True, lines="A-B")
ncc_gbk_edit(path="FILE", grep="正则")            # 输出行号 + 内容

# 改
ncc_gbk_edit(path="FILE", edits="edits.json", dry_run=True, backup=True)
ncc_gbk_edit(path="FILE", old_file="o.txt", new_file="n.txt", count=N)

# 转码
ncc_gbk_edit(path="FILE", convert="utf8|gbk|gb18030", encoding="源编码")
```

`edits.json`（数组，按顺序执行；`count` 省略默认 1）：

```json
[
  {"old": "旧文本", "new": "新文本"},
  {"old": "另一处", "new": "改后", "count": 2}
]
```

### 通用编辑工具没有的保障

| 保障 | 作用 |
|------|------|
| **可逆性预检** | 落盘前先验证 `decode→encode` 与原文逐字节相同。不同就拒绝，避免把混编码文件改坏 |
| **匹配次数断言** | `count` 不符（0 次或多次）→ **整体拒绝、不落盘**，杜绝静默改错位置 |
| **原子落盘** | 写临时文件再 `os.replace`，不会留下写了一半的文件 |
| **CRLF 保持** | 自动识别行尾，插入内容用同款行尾，不产生混合行尾 |
| **行尾归一化** | `old`/`new` 里按 `\n` 写即可，CRLF 文件也能匹配上（见陷阱 4） |
| **diff 输出** | `dry_run` 先看改了什么，这是唯一能"看见"GBK 文件改动的方式 |

---

## 四、陷阱

### 1. 默认编码是 `gb18030`，不是 `gbk`

`gb18030` 是 GBK 的**严格超集**，对 GBK 已定义的字符**字节完全一致**
（实测：同一份 NCC 源码用两个编码 `decode→encode` 都得到逐字节相同的文件）。
但它还能处理 GBK 编不出的字符：

| 字符 | gbk | gb18030 |
|------|-----|---------|
| `龥` | fd9b | fd9b（一致） |
| `€` | 抛 UnicodeEncodeError | a2e3 |
| `😀` | 抛 UnicodeEncodeError | 9439fc36 |

所以解码用 gb18030 更宽容、编码用 gb18030 更安全，纯 GBK 文件结果与用 gbk 完全相同。
只有明确要做**严格 GBK 校验**时才显式 `encoding gbk`。

### 2. 别用"手打重建"来校验

想确认文件改动是否正确时，**不要凭记忆把改过的文本再打一遍去比对**——手打 CJK
很容易在标点/全角半角上差 1~2 字节，结果得出"文件少字节"的假警报。
正确做法是**从文件里切片**或直接 `read` 看，以文件为准。

### 3. `convert` 之后必须显式指定 `encoding`

脚本的 `encoding` 指的是**读文件时**的编码。`convert utf8` 之后文件已是 UTF-8，
后续操作必须加 `encoding utf-8`，否则报解码失败。
脚本已在报错里给了这个提示（识别 BOM 和"能按 UTF-8 整体解码"两种情况）。

### 4. CRLF 文件里 `old` 写 `\n` 匹配不上

CRLF 文件解码后行尾是 `\r\n`，而人写锚点时会自然地只写 `\n`，
于是 `第二行\n` 匹配不到 `第二行\r\n`，报"匹配 0 次"——很难想到是行尾问题。
脚本对 `old` 和 `new` **都**做行尾归一化，锚点一律按 `\n` 写即可。

### 5. `count` 用足

默认 `count=1` 意味着"必须恰好 1 处"。要批量改同一句话时，
先 `grep` 确认实际出现次数，再传对应 `count`，否则脚本会拒绝执行（这是设计意图）。

---

## 五、判定"这个文件是什么编码"

```bash
python -c "
raw=open(r'文件路径','rb').read()
for enc in ['utf-8','gb18030','gbk']:
    try:
        t=raw.decode(enc)
        print('%-8s OK  可逆=%s' % (enc, t.encode(enc)==raw))
    except UnicodeDecodeError as e:
        print('%-8s 失败 %s' % (enc, e))
"
```

- **UTF-8 能解 → 是 UTF-8**（UTF-8 校验最严，能解基本就是）
- UTF-8 失败、gb18030 能解 → GBK 系
- 两个都能解且都不可逆 → 文件混了编码，**不要编辑，先找来源**

---

## 六、相关

| 文档 | 用途 |
|------|------|
| `ncc_gbk_edit` | 由插件宿主提供（无需安装脚本） |
| [NCC资产包接口开发指南](./NCC资产包接口开发指南.md) | 资产包开发主文档 |
