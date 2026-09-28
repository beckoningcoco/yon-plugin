#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gbk_edit.py —— GBK/GB18030 源码文件的安全读写与编辑工具

解决的痛点
----------
中文企业项目（用友 NCC/BIP 客开包等）的源码树是 GBK 编码，而通用编辑工具
按 UTF-8 硬解码，导致：

  * 读出来是乱码（`OA 中间库` -> `OA �м���`），带 U+FFFD 替换字符，中文已丢信息；
  * 中文 old_string 永远匹配不上，因为文件解码后是乱码；
  * 万一匹配上，写回会按 UTF-8 编码，文件变成 GBK/UTF-8 混杂，不可逆损坏。

本脚本把编码当显式参数，全程在字节层可控，并提供通用编辑工具没有的保障：
解码可逆性预检、匹配次数断言、原子落盘、CRLF 保持。

用法
----
  # 1) 干净地读（替代在乱码里猜内容）
  gbk_edit.py FILE --read
  gbk_edit.py FILE --read --lines 180-240

  # 2) 找锚点行号（中文 grep，普通 grep 搜 GBK 文件搜不到）
  gbk_edit.py FILE --grep "上个月月末"

  # 3) 批量替换（推荐；old/new 写进 JSON，彻底绕开 shell 转义）
  gbk_edit.py FILE --edits edits.json
  gbk_edit.py FILE --edits edits.json --dry-run

  # 4) 单处替换
  gbk_edit.py FILE --old-file o.txt --new-file n.txt
  gbk_edit.py FILE --old-file o.txt --new-file n.txt --count 3

  # 5) 整体转码（原有做法；多改动时用它 + 常规编辑工具，比逐处替换快）
  gbk_edit.py FILE --convert utf8
  gbk_edit.py FILE --convert gbk

edits.json 格式（数组，按顺序执行；count 可省略，默认 1）：
  [
    {"old": "旧文本", "new": "新文本"},
    {"old": "另一处", "new": "改后", "count": 2}
  ]

选项
----
  --encoding ENC   文件编码，默认 gb18030（GBK 的严格超集，见下）
  --count N        期望匹配次数，默认 1；实际不等于 N 则整体拒绝、不落盘
  --dry-run        只打印 diff，不写文件
  --backup         写盘前生成 FILE.bak
  --no-diff        不打印 diff

退出码：0 成功 / 1 校验失败（未落盘） / 2 读写或解码失败

为什么默认 gb18030 而不是 gbk
------------------------------
gb18030 是 GBK 的**严格超集**，且对 GBK 已定义的字符**字节完全一致**（已实测：
同一份 NCC 源码用两个编码 decode->encode 都得到逐字节相同的文件）。
但它还能处理 GBK 编不出的字符：`€`(a2e3)、emoji(9439fc36)，而 `gbk` 会直接
抛 UnicodeEncodeError。所以：解码用 gb18030 更宽容，编码用 gb18030 更安全，
纯 GBK 文件的结果与用 gbk 完全一致。
"""

import argparse
import difflib
import json
import os
import re
import sys
import tempfile

DEFAULT_ENCODING = "gb18030"

# ---------------- 输出编码：强制 UTF-8，避免 Windows 控制台 cp936 二次转坏中文


def _force_utf8_stdout():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def die(msg, code=1):
    sys.stdout.flush()  # 先冲掉已打印的头部信息，否则报错会跑到前面
    print("错误: " + msg, file=sys.stderr)
    sys.exit(code)


# ---------------- 读取与可逆性预检


def _looks_like_utf8(raw):
    """粗判是否 UTF-8：能整体解码，且含多字节序列（纯 ASCII 两个编码都一样，不算）。"""
    if all(b < 0x80 for b in raw):
        return False
    try:
        raw.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def load(path, encoding):
    """读文件并做可逆性预检。

    预检的意义：只有当 decode->encode 能还原出**逐字节相同**的内容时，才说明
    文件是干净的该编码文本。否则说明混进了别的编码的字节，直接落盘会把原有
    内容改坏，所以宁可拒绝执行。
    """
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as e:
        die("读文件失败 %s: %s" % (path, e), 2)

    try:
        text = raw.decode(encoding)
    except UnicodeDecodeError as e:
        hint = ""
        # 刚被 --convert 成 UTF-8 的文件最容易踩这个：默认编码没跟着改
        if raw[:3] == b"\xef\xbb\xbf":
            hint = "\n      文件带 UTF-8 BOM，请加 --encoding utf-8（或 utf-8-sig）。"
        elif _looks_like_utf8(raw):
            hint = ("\n      文件看起来是 UTF-8，请加 --encoding utf-8。"
                    "\n      （常见原因：刚用 --convert utf8 转过码，后续操作要显式指定 --encoding utf-8）")
        die(
            "按 %s 解码失败，文件可能不是该编码（或已损坏）: %s\n"
            "      位置 %d 附近字节: %r%s\n"
            "      本脚本拒绝继续，以免把原有内容写坏。"
            % (encoding, e, e.start, raw[max(0, e.start - 8):e.start + 8], hint),
            2,
        )

    back = text.encode(encoding)
    if back != raw:
        die(
            "可逆性预检失败：按 %s 解码后重新编码，结果与原文不逐字节相同。\n"
            "      说明文件里混有该编码覆盖不到的字节，继续编辑会损坏文件，已拒绝。"
            % encoding,
            2,
        )
    return raw, text


def split_lines(text):
    """按行切开但保留行尾，保证未改动行的字节完全不变。"""
    return text.splitlines(keepends=True)


def to_unified(old, new, n=2):
    return list(
        difflib.unified_diff(
            split_lines(old), split_lines(new), lineterm="", n=n
        )
    )


def print_diff(old, new, label=""):
    lines = to_unified(old, new)
    if not lines:
        print("  (无差异%s)" % ((" " + label) if label else ""))
        return False
    out = []
    for ln in lines:
        out.append(ln.rstrip("\n").rstrip("\r"))
    print("\n".join(out))
    return True


# ---------------- 替换核心


def normalize_newlines(s, crlf):
    """把文本的行尾统一成目标文件的风格。

    为什么 old 也要归一化：CRLF 文件解码后行尾是 \\r\\n，而人（和 AI）在
    JSON/文本里写锚点时会自然地只写 \\n，结果 `第二行\\n` 匹配不到
    `第二行\\r\\n`，报"匹配 0 次"，很难想到是行尾问题。
    两边都归一化后，old/new 都可以只按 \\n 书写，与文件实际行尾解耦。
    """
    s = s.replace("\r\n", "\n")
    return s.replace("\n", "\r\n") if crlf else s


def apply_edits(text, edits, crlf, dry_run, show_diff):
    """执行全部替换。任何一处不满足次数要求 -> 抛异常，调用方不落盘。

    顺序替换，每处基于前一处的结果，所以 edits 里的 old 应写成"当前文件里
    实际存在的样子"（行尾按 \\n 写即可，会自动归一化）。
    """
    current = text
    for idx, edit in enumerate(edits, 1):
        # old/new 都归一化到文件的行尾风格：new 是为了不产生混合行尾，
        # old 是为了让锚点书写与行尾解耦
        old = normalize_newlines(edit["old"], crlf)
        new = normalize_newlines(edit["new"], crlf)
        expect = edit.get("count", 1)

        found = current.count(old)
        head = "[%d/%d]" % (idx, len(edits))

        if found != expect:
            raise AssertionError(
                "%s 匹配次数不符：期望 %d 次，实际 %d 次\n"
                "      未落盘。\n"
                "      待查文本(前 120 字): %s\n"
                "      提示：用 --grep 确认文件里的真实内容，或用 --read 通读后再写 old。"
                % (head, expect, found, old[:120].replace("\n", "\\n")
                   .replace("\r", "\\r"))
            )

        before = current
        current = current.replace(old, new)
        # 措辞用"命中"而非"替换"：此处尚未落盘，若后续某项校验失败则整体作废
        print("%s 命中 %d 处，长度 %d -> %d" % (head, found, len(before), len(current)))
        if show_diff:
            print_diff(before, current, head)

    return current


# ---------------- 落盘（原子）


def write_atomic(path, text, encoding, backup):
    if backup:
        try:
            with open(path, "rb") as src, open(path + ".bak", "wb") as dst:
                dst.write(src.read())
            print("  已备份 -> %s.bak" % path)
        except OSError as e:
            die("备份失败: %s" % e, 2)

    try:
        data = text.encode(encoding)
    except UnicodeEncodeError as e:
        die(
            "按 %s 编码失败，有字符该编码表示不了: %s\n"
            "      未落盘。若确需写入，改用 --encoding gb18030（超集，支持 € / emoji）。"
            % (encoding, e),
            2,
        )

    d = os.path.dirname(os.path.abspath(path))
    try:
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".gbkedit_", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    except OSError as e:
        die("写文件失败 %s: %s" % (path, e), 2)

    print("  已写入 %s（%d 字节，%s）" % (path, len(data), encoding))


# ---------------- 命令实现


def cmd_read(text, args):
    if not args.lines:
        sys.stdout.write(text)
        return
    m = re.fullmatch(r"(\d+)(?:-(\d+))?", args.lines.strip())
    if not m:
        die("--lines 格式应为 A 或 A-B，收到: %s" % args.lines)
    a = int(m.group(1))
    b = int(m.group(2)) if m.group(2) else a
    if a < 1 or b < a:
        die("--lines 范围非法: %s" % args.lines)
    for i, ln in enumerate(split_lines(text), 1):
        if a <= i <= b:
            sys.stdout.write("%6d\t%s" % (i, ln))


def cmd_grep(text, args):
    try:
        rx = re.compile(args.grep)
    except re.error as e:
        die("--grep 正则非法: %s" % e)
    hits = 0
    for i, ln in enumerate(split_lines(text), 1):
        if rx.search(ln):
            hits += 1
            sys.stdout.write("%6d\t%s" % (i, ln))
    print("  —— 共 %d 行命中" % hits)


def build_edits(args, text):
    """构造编辑列表。old/new 优先从文件读，避免 shell 转义与引号问题。"""
    if args.edits:
        try:
            with open(args.edits, "r", encoding="utf-8") as f:
                data = json.load(f)
        except OSError as e:
            die("读 edits 文件失败: %s" % e, 2)
        except json.JSONDecodeError as e:
            die("edits.json 不是合法 JSON: %s" % e, 2)
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list) or not data:
            die("edits.json 应为非空数组，元素形如 {\"old\": \"...\", \"new\": \"...\"}")
        edits = []
        for i, item in enumerate(data, 1):
            if not isinstance(item, dict) or "old" not in item or "new" not in item:
                die("edits.json 第 %d 项缺少 old/new 字段" % i)
            edits.append(item)
        return edits

    def slurp(p, what):
        try:
            # old/new 片段按 UTF-8 存，与文件本身编码解耦
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
        except OSError as e:
            die("读 %s 文件失败: %s" % (what, e), 2)

    if not args.old_file or args.new_file is None:
        die("需要 --edits，或同时提供 --old-file 与 --new-file")
    old = slurp(args.old_file, "--old-file")
    new = slurp(args.new_file, "--new-file")
    return [{"old": old, "new": new, "count": args.count}]


def main():
    _force_utf8_stdout()

    ap = argparse.ArgumentParser(
        description="GBK/GB18030 源码文件的安全读写与编辑",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("file", help="目标文件")
    ap.add_argument("--encoding", default=DEFAULT_ENCODING,
                    help="文件编码，默认 %s（GBK 的超集，字节兼容）" % DEFAULT_ENCODING)
    ap.add_argument("--read", action="store_true", help="按该编码解码后打印全文")
    ap.add_argument("--lines", help="配合 --read：只打印 A 或 A-B 行（1 起）")
    ap.add_argument("--grep", help="按该编码解码后按正则找行，输出行号")
    ap.add_argument("--edits", help="edits.json 路径（数组，元素 {old,new,count?}）")
    ap.add_argument("--old-file", help="旧文本文件（UTF-8）")
    ap.add_argument("--new-file", help="新文本文件（UTF-8）")
    ap.add_argument("--count", type=int, default=1, help="期望匹配次数，默认 1")
    ap.add_argument("--dry-run", action="store_true", help="只显示 diff，不写文件")
    ap.add_argument("--backup", action="store_true", help="写盘前备份为 .bak")
    ap.add_argument("--no-diff", action="store_true", help="不打印 diff")
    ap.add_argument("--convert", choices=["utf8", "gbk", "gb18030"],
                    help="整体转码：把文件转成指定编码")
    args = ap.parse_args()

    if not os.path.isfile(args.file):
        die("文件不存在: %s" % args.file, 2)

    raw, text = load(args.file, args.encoding)
    crlf = b"\r\n" in raw
    print("文件 %s | %d 字节 | %s | %s" %
          (args.file, len(raw), args.encoding, "CRLF" if crlf else "LF"))

    # --- 只读两种模式
    if args.read:
        cmd_read(text, args)
        return
    if args.grep:
        cmd_grep(text, args)
        return

    # --- 整体转码
    if args.convert:
        target = {"utf8": "utf-8", "gbk": "gbk", "gb18030": "gb18030"}[args.convert]
        if target == args.encoding:
            die("源编码与目标编码相同(%s)，无需转换" % target)
        back = text.encode(target)
        print("  转码 %s -> %s" % (args.encoding, target))
        if args.dry_run:
            print("  [dry-run] 不落盘，预计 %d 字节" % len(back))
            return
        write_atomic(args.file, text, target, args.backup)
        return

    # --- 替换模式
    if not (args.edits or args.old_file):
        die("未指定操作。用 --read / --grep / --edits / --old-file+--new-file / --convert")

    edits = build_edits(args, text)
    try:
        updated = apply_edits(text, edits, crlf, args.dry_run, not args.no_diff)
    except AssertionError as e:
        die(str(e))

    if updated == text:
        print("  内容无变化，未落盘")
        return

    # 二次可逆性预检：确认改后的文本仍能被目标编码无损表示
    try:
        updated.encode(args.encoding)
    except UnicodeEncodeError as e:
        die("改后内容含 %s 表示不了的字符: %s\n      未落盘。" % (args.encoding, e), 2)

    if args.dry_run:
        print("  [dry-run] 未落盘。%d -> %d 字节" %
              (len(raw), len(updated.encode(args.encoding))))
        return

    write_atomic(args.file, updated, args.encoding, args.backup)


if __name__ == "__main__":
    main()
