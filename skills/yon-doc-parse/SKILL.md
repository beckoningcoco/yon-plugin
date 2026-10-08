---
name: yon-doc-parse
description: 读本机的 Excel / PDF / Word / CSV 等二进制文档，取出正文、表格与结构化数据。当使用者递来 .xlsx / .docx / .pdf 文件要求读取、查找、汇总其中内容，或问「这个文件能不能解析」「为什么读出来是乱码」「这份 PDF 里写了什么」时使用。纯文本文件不需要本技能。
whenToUse: 使用者给了 Office / PDF / CSV 文件要读内容；或要把 PDF / Word 喂给 yon-digest 之前需要先抽出文本。
---

# 读 Excel / PDF / Word 等二进制文档

这类文件用 `doc_parse` 一个工具读，不要拿 `read` 去试。

## 先 probe，再读

```text
doc_parse(path: "D:\\资料\\采购订单.xlsx", probe: true)
```

`probe` 一次回答五件事，而每一件都可能改变你接下来该做什么：

- **真实类型**——按魔数判断，**不看扩展名**。用友环境导出的 `.xls` 经常真的是 xlsx，直接按扩展名交给解析器会失败。
- 页数或工作表名
- 是否加密
- **是否是扫描件**——没有文本层的 PDF，任何文字提取器都返回空字符串。probe 会说「疑似扫描件」，而不是汇报「0 字符」让你以为文件是空的。
- 当前机器能不能读它；不能的话，缺哪个库会被点名。

跳过 probe 就是在同时猜这五件事。

然后在 probe 的结论上读：

| 目的 | 参数 |
|---|---|
| 正文 + Markdown 表格（默认） | 不传 |
| 结构化数据，便于后续计算 | `format: "json"` |
| 只读 PDF 的某几页（长文档分次读） | `pages: "1-5"` 或 `"3"` |
| 只读某个工作表 | `sheet: "明细"` |
| 放开长度限制 | `maxChars: 0`（默认 5 万字符，防一份文档挤掉上下文） |

## 为什么需要一个专门的工具

一般 read 工具按 UTF-8 解码，而 Office 与 PDF 是 zip 容器或字节流，直接读只会得到乱码或被拒绝。真正能读它们的是本机的 Python 栈，而**格式与库的对应关系是本地事实**，只能探测，不能假设。

## 三条硬约束

1. **`read` 读不了二进制。** 对 `.xlsx` / `.docx` / `.pdf` 的第一反应就该是 `doc_parse`，不要先试 `read` 再放弃。

2. **看图要靠 `modlens_read_image`。** 当前模型不接受图片输入，`read_image` 会直接报 `does not declare image input`——别在它上面浪费一次调用。

3. **`digest_plan` 不吃原始 PDF。** 把 `.pdf` 路径直接喂给 `digest_plan`，它不会报错，而是按文本去读这个二进制，报出「0 页 · 1206 字符」这种看着像结论的噪声，只在注意事项里含糊提一句「来源可能不是 PDF」——很容易被误读成「这份 PDF 没内容」。正确顺序是：

   ```text
   doc_parse 读出文本  →  write 落成 .md  →  digest_plan 拿这个 .md 摸底
   ```

   `doc_parse` 自己不写盘，落盘交给 `write`。

## 扫描件 PDF

`probe` 报扫描件时，说明这一页没有文本层，`doc_parse` 抽不出东西——这不是工具坏了，是文件里确实没有文字。

- **单页或少量**：先把页面渲染成图片，再用 `modlens_read_image` 读。渲染是少数需要手写几行代码的场景：

  ```python
  import fitz
  d = fitz.open(r"D:\\资料\\扫描件.pdf")
  for i in range(min(3, d.page_count)):
      d[i].get_pixmap(dpi=160).save(rf"D:\\临时\\page{i + 1}.png")
  ```

- **批量**：需要本机装有 OCR 引擎（tesseract）。没装就问使用者要不要装——这是环境改动，不要默认替人决定。

## 老格式 `.doc` / `.xls` / `.ppt`

OLE 复合文档，本机没有解析器。按代价从小到大：

1. 请使用者用 Office / WPS 另存为 `.docx` / `.xlsx`（最省事，也是首选）
2. 仅 `.xls`：装上 `xlrd` 后可读
3. 必须自动化：装 LibreOffice 后 `soffice --headless --convert-to xlsx`

**但先看 probe 的结论**：如果它报的是 `real_type: xlsx` 加一条扩展名不符的提示，那这个「.xls」本来就是 xlsx，`doc_parse` 能直接读，上面三条都不必走。

## 依赖与边界

`doc_parse` 调用本机 Python 脚本，依赖情况：

- **必需**：`python` 在 PATH 上
- **按格式需要**：PyMuPDF（PDF）、python-docx（`.docx`）、openpyxl（`.xlsx`）
- **不需要**：csv / txt 走标准库；整条链路不联网、不需要账号或配额

缺库时工具会点出缺的是哪一个并给出安装命令，不会静默失败。工具本身不写磁盘——要留下结果就用 `write`。

## 相关

- 把一份 PDF 或 Word 消化进知识库：见 `yon-digest`。前提是先按上面第 3 条抽出文本。
- 纯文本（`.md` / `.txt` / `.java` / `.xml` / `.sql`）直接用 `read` 工具，不需要本技能。
- NCC 老源码里的 GBK 文件不是二进制，用 `ncc_gbk_edit`，不要用本技能。
