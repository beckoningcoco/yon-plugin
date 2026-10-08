#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
统一文档解析入口（本机离线，不依赖任何云服务）。

用法:
  python parse_doc.py <文件> [选项]

选项:
  --probe            只报告文件信息与可解析性，不抽正文（先跑这个最省事）
  --format text|json 输出形态，默认 text（人类可读）；json 为结构化
  --pages A-B        仅 PDF：只取第 A 到 B 页（1 基，含两端）
  --sheet NAME       仅 xlsx：只取指定工作表
  --max-chars N      正文超长时截断，默认 0（不截断）
  --out FILE         写入文件而不是打印到 stdout

支持: .pdf .docx .xlsx .xlsm .csv .tsv .txt .md
明确不支持（会给出去路）: .doc .xls .ppt .pptx、扫描件 OCR
"""
import argparse
import csv
import io
import json
import sys
import zipfile
from pathlib import Path

# 控制台默认是 GBK，中文会乱码或抛异常，这里强制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TEXT_EXT = {".txt", ".md", ".markdown", ".log", ".sql", ".java", ".xml", ".json", ".yml", ".yaml"}
SCAN_HINT_CHARS_PER_PAGE = 20  # 每页平均字符低于此值 → 疑似扫描件


# ---------------------------------------------------------------- 类型探测

def _looks_text(path, limit=4096):
    """无 NUL 字节且能用 utf-8 或 gb18030 解码 → 当作文本"""
    try:
        raw = open(path, "rb").read(limit)
    except OSError:
        return False
    if b"\x00" in raw:
        return False
    for enc in ("utf-8", "gb18030"):
        try:
            raw.decode(enc)
            return True
        except UnicodeDecodeError:
            continue
    return False


def sniff(path):
    """按魔数判断真实类型——扩展名经常骗人（.xls 其实是 xlsx 之类）"""
    try:
        head = open(path, "rb").read(8)
    except OSError as e:
        return "unreadable", str(e)
    if head[:4] == b"%PDF":
        return "pdf", None
    if head[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(path) as z:
                names = z.namelist()
        except Exception as e:
            return "zip", f"zip 结构读取失败: {e}"
        for prefix, kind in (("word/", "docx"), ("xl/", "xlsx"), ("ppt/", "pptx")):
            if any(n.startswith(prefix) for n in names):
                return kind, None
        return "zip", None
    if head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "ole", None  # .doc / .xls / .ppt 的老二进制格式
    if _looks_text(path):
        return "text", None
    return "binary", None


# ---------------------------------------------------------------- 各格式解析

def parse_pdf(path, pages=None):
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    out = {
        "kind": "pdf",
        "pages": doc.page_count,
        "needs_password": bool(doc.needs_pass),
        "per_page": [],
    }
    if doc.needs_pass:
        out["warning"] = "PDF 已加密。本机无解密工具，需要密码或先用其他工具解密。"
        return out

    idx = list(range(doc.page_count))
    if pages:
        a, b = pages
        idx = [i for i in idx if a - 1 <= i <= b - 1]

    for i in idx:
        page = doc[i]
        text = page.get_text()
        item = {"page": i + 1, "text": text, "chars": len(text.strip())}
        try:
            item["images"] = len(page.get_images(full=True))
        except Exception:
            item["images"] = None
        out["per_page"].append(item)

    doc.close()

    total = sum(p["chars"] for p in out["per_page"])
    n = len(out["per_page"]) or 1
    out["total_chars"] = total
    if out["per_page"] and total / n < SCAN_HINT_CHARS_PER_PAGE:
        out["warning"] = (
            f"每页平均仅 {total // n} 字符，几乎肯定是**扫描件/图片型 PDF**，"
            "没有文本层。本机 OCR 引擎（tesseract）未安装，无法直接抽文字。"
            "可行做法：渲染成图片后用 modlens_read_image 看图，或安装 tesseract / xparse-cli。"
        )
    return out


def _zip_source(path, exts):
    """python-docx / openpyxl 都按**扩展名**判断格式，而名实不符是常态
    （用友导出的 .xls 其实是 xlsx）。后缀不在白名单时改用内存流，
    库就只能按内容判断，魔数识别的结果才真正起作用。"""
    if Path(path).suffix.lower() in exts:
        return path
    return io.BytesIO(open(path, "rb").read())


def parse_docx(path):
    from docx import Document

    d = Document(_zip_source(path, {".docx", ".docm"}))
    paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]
    tables = []
    for t in d.tables:
        tables.append([[(c.text or "").strip() for c in r.cells] for r in t.rows])
    return {
        "kind": "docx",
        "paragraphs": paras,
        "tables": tables,
        "table_count": len(tables),
        "paragraph_count": len(paras),
    }


def parse_xlsx(path, sheet=None):
    from openpyxl import load_workbook

    src = _zip_source(path, {".xlsx", ".xlsm", ".xltx", ".xltm"})
    wb = load_workbook(src, data_only=True, read_only=True)  # data_only: 取公式计算值
    sheets = []
    for ws in wb.worksheets:
        if sheet and ws.title != sheet:
            continue
        rows = []
        for r in ws.iter_rows(values_only=True):
            if r is None or all(c is None for c in r):
                continue
            rows.append([("" if c is None else c) for c in r])
        sheets.append({"name": ws.title, "rows": rows, "row_count": len(rows)})
    wb.close()
    if sheet and not sheets:
        names = [ws.title for ws in load_workbook(src, read_only=True).worksheets]
        return {"kind": "xlsx", "sheets": [], "warning": f"没有名为 {sheet!r} 的工作表，实际有: {names}"}
    return {"kind": "xlsx", "sheets": sheets, "sheet_count": len(sheets)}


def parse_delimited(path):
    """csv / tsv，自动在 utf-8-sig 与 gb18030 之间回退——中文 CSV 常见 GBK"""
    raw = open(path, "rb").read()
    used = None
    for enc in ("utf-8-sig", "gb18030", "utf-8"):
        try:
            text = raw.decode(enc)
            used = enc
            break
        except UnicodeDecodeError:
            continue
    if used is None:
        return {"kind": "csv", "warning": "无法用 utf-8 / gb18030 解码，可能不是文本表。"}
    delim = "\t" if path.lower().endswith(".tsv") else ","
    rows = [r for r in csv.reader(io.StringIO(text), delimiter=delim) if any(c.strip() for c in r)]
    return {"kind": "csv", "encoding": used, "rows": rows, "row_count": len(rows)}


def parse_text(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "gb18030", "utf-8"):
        try:
            return {"kind": "text", "encoding": enc, "text": raw.decode(enc), "chars": len(raw)}
        except UnicodeDecodeError:
            continue
    return {"kind": "text", "warning": "解码失败（既不是 utf-8 也不是 gb18030）"}


# ---------------------------------------------------------------- 分派

def parse(path, real, pages=None, sheet=None):
    if real == "pdf":
        return parse_pdf(path, pages)
    if real == "docx":
        return parse_docx(path)
    if real == "xlsx":
        return parse_xlsx(path, sheet)
    if real == "text":
        ext = Path(path).suffix.lower()
        if ext in {".csv", ".tsv"}:
            return parse_delimited(path)
        return parse_text(path)
    if real == "ole":
        return {
            "kind": "ole",
            "warning": (
                ".doc / .xls / .ppt 的老二进制格式（OLE 复合文档），本机没有可用的解析器："
                "pandoc、LibreOffice、MS Office 均未安装。"
                "出路：① 用 Office/WPS 另存为 .docx/.xlsx；② 或用 Python 装上 olefile/xlrd 再试。"
            ),
        }
    if real == "pptx":
        return {
            "kind": "pptx",
            "warning": "PPT 本机无解析库。可装 python-pptx，或让使用者另存为 PDF 后按 PDF 处理。",
        }
    return {"kind": real, "warning": f"无法处理的类型: {real}"}


def probe(path, real, note):
    p = Path(path)
    ext = p.suffix.lower()
    ext_map = {".pdf": "pdf", ".docx": "docx", ".docm": "docx", ".xlsx": "xlsx",
               ".xlsm": "xlsx", ".csv": "text", ".tsv": "text", ".txt": "text",
               ".doc": "ole", ".xls": "ole", ".ppt": "ole", ".pptx": "pptx"}
    info = {
        "path": str(p.resolve()),
        "extension": ext,
        "size_bytes": p.stat().st_size if p.exists() else None,
        "real_type": real,
        "sniff_note": note,
    }
    expected = ext_map.get(ext)
    if expected and expected != real:
        info["extension_mismatch"] = (
            f"扩展名 {ext} 暗示 {expected}，但内容是 {real}。"
            "已按真实内容处理（扩展名不可信）。"
        )
    if real == "ole":
        info["routable"] = False
        info["advice"] = "老格式 .doc/.xls/.ppt：本机无解析器，需另存为新格式"
    elif real == "pptx":
        info["routable"] = False
        info["advice"] = "PPT：本机无解析库"
    elif real == "binary":
        info["routable"] = False
        info["advice"] = "未知二进制，无法解析"
    else:
        info["routable"] = True
        try:
            if real == "pdf":
                import fitz
                d = fitz.open(path)
                info["pages"] = d.page_count
                info["encrypted"] = bool(d.needs_pass)
                if not d.needs_pass:
                    sample = min(3, d.page_count)
                    chars = sum(len(d[i].get_text().strip()) for i in range(sample))
                    info["text_layer_chars_first_pages"] = chars
                    info["scanned_likely"] = sample > 0 and chars / sample < SCAN_HINT_CHARS_PER_PAGE
                d.close()
            elif real == "xlsx":
                from openpyxl import load_workbook
                wb = load_workbook(_zip_source(path, {".xlsx", ".xlsm", ".xltx", ".xltm"}),
                                   read_only=True)
                info["sheets"] = [ws.title for ws in wb.worksheets]
                wb.close()
            elif real == "docx":
                from docx import Document
                d = Document(_zip_source(path, {".docx", ".docm"}))
                info["paragraphs"] = len([p for p in d.paragraphs if p.text.strip()])
                info["tables"] = len(d.tables)
            elif real == "text":
                for enc in ("utf-8-sig", "gb18030"):
                    try:
                        open(path, encoding=enc).read()
                        info["encoding_guess"] = enc
                        break
                    except UnicodeDecodeError:
                        continue
        except Exception as e:
            info["probe_error"] = f"{type(e).__name__}: {e}"
            info["routable"] = False
            info["advice"] = "探测即失败，见 probe_error；可能需要先转换格式"
    return info


# ---------------------------------------------------------------- 渲染

def md_table(rows, limit=40):
    if not rows:
        return "（空表）"
    body = rows[:limit]
    head = body[0]
    out = ["| " + " | ".join(str(c) for c in head) + " |",
           "|" + "|".join("---" for _ in head) + "|"]
    for r in body[1:]:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    if len(rows) > limit:
        out.append(f"… 另有 {len(rows) - limit} 行未显示")
    return "\n".join(out)


def render(res, max_chars=0):
    kind = res.get("kind")
    L = []
    if res.get("warning"):
        L.append(f"⚠️  {res['warning']}\n")

    if kind == "pdf":
        L.append(f"PDF · {res.get('pages')} 页 · 正文 {res.get('total_chars', 0)} 字符")
        if res.get("needs_password"):
            return "\n".join(L)
        for p in res.get("per_page", []):
            L.append(f"\n----- 第 {p['page']} 页（{p['chars']} 字符"
                     + (f"，{p['images']} 图" if p.get("images") else "") + "）-----")
            L.append(p["text"].rstrip())
    elif kind == "docx":
        L.append(f"DOCX · {res.get('paragraph_count', 0)} 段 · {res.get('table_count', 0)} 表")
        L.append("\n## 正文\n")
        L.extend(res.get("paragraphs", []))
        for i, t in enumerate(res.get("tables", []), 1):
            L.append(f"\n## 表格 {i}\n")
            L.append(md_table(t))
    elif kind == "xlsx":
        L.append(f"XLSX · 本次取到 {res.get('sheet_count', 0)} 个工作表")
        for s in res.get("sheets", []):
            L.append(f"\n## 工作表 {s['name']}（{s['row_count']} 行）\n")
            L.append(md_table(s["rows"]))
    elif kind == "csv":
        L.append(f"CSV/TSV · 编码 {res.get('encoding')} · {res.get('row_count', 0)} 行")
        L.append(md_table(res.get("rows", [])))
    elif kind == "text":
        L.append(f"文本 · 编码 {res.get('encoding')} · {res.get('chars', 0)} 字符")
        L.append(res.get("text", ""))
    else:
        L.append(json.dumps(res, ensure_ascii=False, indent=2))

    s = "\n".join(L)
    if max_chars and len(s) > max_chars:
        s = s[:max_chars] + f"\n\n…（已截断，共 {len(s)} 字符，用 --max-chars 0 看全量）"
    return s


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="统一文档解析入口（离线）")
    ap.add_argument("file")
    ap.add_argument("--probe", action="store_true", help="只报告可解析性")
    ap.add_argument("--format", choices=["text", "json"], default="text")
    ap.add_argument("--pages", help="PDF 页范围，如 1-5")
    ap.add_argument("--sheet", help="xlsx 工作表名")
    ap.add_argument("--max-chars", type=int, default=0)
    ap.add_argument("--out")
    args = ap.parse_args()

    path = args.file
    if not Path(path).exists():
        print(f"文件不存在: {path}", file=sys.stderr)
        return 2

    real, note = sniff(path)

    if args.probe:
        info = probe(path, real, note)
        payload = json.dumps(info, ensure_ascii=False, indent=2)
        print(payload)
        return 0 if info.get("routable") else 1

    pages = None
    if args.pages:
        try:
            if "-" in args.pages:
                a, b = args.pages.split("-", 1)
                pages = (int(a), int(b))
            else:
                pages = (int(args.pages), int(args.pages))
        except ValueError:
            print(f"--pages 格式错误: {args.pages}（应为 1-5）", file=sys.stderr)
            return 2

    if real in ("ole", "pptx", "binary", "zip", "unreadable"):
        res = parse(path, real)
        print(res.get("warning", "无法处理"))
        return 1

    try:
        res = parse(path, real, pages, args.sheet)
    except ImportError as e:
        print(f"缺少解析库: {e}", file=sys.stderr)
        return 3
    except Exception as e:
        print(f"解析失败 {type(e).__name__}: {e}", file=sys.stderr)
        return 4

    text = json.dumps(res, ensure_ascii=False, indent=2) if args.format == "json" \
        else render(res, args.max_chars)

    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"已写入 {Path(args.out).resolve()}（{len(text)} 字符）")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
