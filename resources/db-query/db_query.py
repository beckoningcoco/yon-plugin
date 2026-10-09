#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
通用数据库查询工具 — 带安全确认
支持 Oracle / 达梦(Dameng) / MySQL / PostgreSQL

由 dsh-plugin-yon-panel 插件自带：脚本、驱动适配与默认配置路径都在插件包内，
不依赖 ~/.claude、~/.agents 或任何外部技能目录。

配置文件路径的解析顺序（先命中先用）：
  1. 命令行 --config <path>
  2. 环境变量 YON_DB_CONFIG
  3. ~/.dsh/yon-panel/db_config.json      ← 插件面板读写的那一份

用法：
  python db_query.py -p "天九(NCC2312)" -e test -s "SELECT 1" -j
  python db_query.py --config ./my.json -p "项目名" -e prod -s "SELECT ..."
"""

import json
import os
import re
import sys
import argparse
from typing import Optional

# 修复 Windows 终端中文乱码
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# ============ 配置路径 ============
def default_config_path() -> str:
    """插件面板读写的那一份配置；环境变量可以覆盖。"""
    override = os.environ.get("YON_DB_CONFIG")
    if override:
        return os.path.expanduser(override)
    return os.path.expanduser(os.path.join("~", ".dsh", "yon-panel", "db_config.json"))


# 运行期解析出的实际路径（由 main 在解析参数后填入）
CONFIG_PATH = default_config_path()


# ============ 危险操作检测 ============
DANGEROUS_KEYWORDS = [
    r"\bINSERT\b", r"\bUPDATE\b", r"\bDELETE\b",
    r"\bDROP\b", r"\bTRUNCATE\b", r"\bALTER\b", r"\bCREATE\b",
]


def is_dangerous(sql: str) -> bool:
    return any(re.search(kw, sql, re.IGNORECASE) for kw in DANGEROUS_KEYWORDS)


# ============ 配置读取 ============
def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(
            f"配置文件不存在: {CONFIG_PATH}\n"
            f"请在 Yon 面板里添加数据源（侧边栏底部的 Y → 数据库图标），或用 --config 指定别的文件。"
        )
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def find_project(config: dict, keyword: str) -> dict:
    keyword_lower = keyword.lower()
    projects = config.get("projects", {})
    # 精确命中优先：面板与工具传的是完整键，简称只作为人工调试时的便利。
    for name, cfg in projects.items():
        if keyword_lower == name.lower():
            return {"name": name, "config": cfg}
    for name, cfg in projects.items():
        if keyword_lower in name.lower():
            return {"name": name, "config": cfg}
    available = ", ".join(projects.keys())
    raise ValueError(f"未找到匹配项目: '{keyword}'\n可用项目: {available}")


def validate_config(proj: dict) -> list:
    """检查配置完整性，返回缺失字段列表"""
    missing = []
    cfg = proj["config"]
    if not cfg.get("type"):
        missing.append("数据库类型 (type)")
    for env_name in ["test", "prod"]:
        env = cfg.get(env_name)
        if env:
            if not env.get("host"):
                missing.append(f"{env_name}.host")
            if not env.get("port"):
                missing.append(f"{env_name}.port")
            if not env.get("users") or len(env["users"]) == 0:
                missing.append(f"{env_name}.users")
    return missing


def get_connection_info(config: dict, project_keyword: str, env: str, user: Optional[str] = None) -> dict:
    proj = find_project(config, project_keyword)

    # 检查配置完整性
    missing = validate_config(proj)
    if missing:
        raise ValueError(
            f"项目 '{proj['name']}' 配置不完整，缺少: {', '.join(missing)}\n"
            f"请补充 {CONFIG_PATH} 后再试。"
        )

    db_type = proj["config"].get("type", "")

    env_config = proj["config"].get(env)
    if not env_config:
        raise ValueError(f"项目 '{proj['name']}' 没有 '{env}' 环境配置")

    users = env_config.get("users", {})
    if user and user not in users:
        raise ValueError(f"用户 '{user}' 不存在，可用: {list(users.keys())}")
    chosen_user = user if user else list(users.keys())[0]
    password = users[chosen_user]

    return {
        "project_name": proj["name"],
        "db_type": db_type,
        "host": env_config["host"],
        "port": env_config["port"],
        "service_name": env_config.get("service_name", ""),
        "username": chosen_user,
        "password": password,
        "oracle_mode": proj["config"].get("oracle_mode", "thin"),
    }


# ============ Oracle 客户端自动检测 ============
_debug_mode = False


def set_debug(enabled: bool):
    global _debug_mode
    _debug_mode = enabled


def _find_oracle_client() -> str | None:
    """在常见位置搜索 Oracle Instant Client 目录（含一层子目录）"""
    import glob
    patterns = [
        r"E:\instantclient*",
        r"D:\instantclient*",
        r"C:\instantclient*",
        r"C:\oracle\instantclient*",
    ]
    for pattern in patterns:
        for base in sorted(glob.glob(pattern), reverse=True):
            if os.path.isfile(os.path.join(base, "oci.dll")):
                return base
            try:
                for item in sorted(os.listdir(base), reverse=True):
                    sub = os.path.join(base, item)
                    if os.path.isdir(sub) and os.path.isfile(os.path.join(sub, "oci.dll")):
                        return sub
            except OSError:
                pass
    return None


def _try_thick_init():
    """尝试初始化 Oracle thick 模式，返回是否成功"""
    import oracledb
    try:
        oracledb.init_oracle_client()
        if _debug_mode:
            print("[DEBUG] Oracle thick mode initialized (auto-detected)")
        return True
    except Exception:
        lib_dir = _find_oracle_client()
        if lib_dir:
            try:
                oracledb.init_oracle_client(lib_dir=lib_dir)
                if _debug_mode:
                    print(f"[DEBUG] Oracle thick mode initialized: {lib_dir}")
                return True
            except Exception:
                pass
    return False


# ============ 连接器 ============
def get_oracle_connection(info: dict):
    import oracledb
    dsn = oracledb.makedsn(info["host"], info["port"], service_name=info["service_name"])

    # 1. 先尝试 thin 模式（默认）
    oracle_mode = info.get("oracle_mode", "thin")
    if oracle_mode == "thick":
        _try_thick_init()

    if _debug_mode:
        print(f"[DEBUG] Oracle mode: {oracle_mode}")

    try:
        conn = oracledb.connect(user=info["username"], password=info["password"], dsn=dsn)
        if _debug_mode:
            print(f"[DEBUG] Connected (thin mode), version: {conn.version}")
        return conn
    except (oracledb.OperationalError, oracledb.DatabaseError) as e:
        if "DPY-4011" in str(e) or "DPY-6005" in str(e):
            # thin 模式失败，尝试 thick
            if _debug_mode:
                print(f"[DEBUG] Thin failed, trying thick mode...")
            if _try_thick_init():
                conn = oracledb.connect(user=info["username"], password=info["password"], dsn=dsn)
                if _debug_mode:
                    print(f"[DEBUG] Connected (thick mode), version: {conn.version}")
                return conn
        raise


# 本进程刚启动时从父进程继承来的库搜索路径。必须在模块导入时就抓住 —— 之后再改
# os.environ 对达梦加密库的查找已经不起作用（见下面函数的实测说明）。
INITIAL_PATH = os.environ.get("PATH", "")

# 动态库搜索路径的环境变量是分平台的：Windows 看 PATH，Linux 看 LD_LIBRARY_PATH，
# macOS 看 DYLD_LIBRARY_PATH —— dlopen 并不读 PATH。达梦社区给的解法
# （把 site-packages/dmssl 加进 LD_LIBRARY_PATH）说的就是这件事。
_LIB_PATH_VARS = ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH") if os.name != "nt" else ()
INITIAL_LIB_PATHS = {name: os.environ.get(name, "") for name in _LIB_PATH_VARS}

# 防止引导重启无限循环
_DM_BOOTSTRAP_FLAG = "YON_DB_DM_SSL_READY"


def _path_entries(raw: str) -> list:
    """把 PATH 串拆成可直接比较的条目（小写，去掉空项）。"""
    return [p.lower() for p in raw.split(os.pathsep) if p]


def _dm_ssl_dir() -> Optional[str]:
    """达梦加密库目录 dmssl，找不到返回 None。

    先看 dmPython 旁边：pip 装出来的 dmPython 把 dmssl 放在同一目录（本机实测
    `D:\\python\\Lib\\site-packages\\dmssl`）；再看达梦客户端安装目录 DM_HOME ——
    用安装介质装的驱动，加密库跟 bin 放在一起。换机器时这两种形态都可能出现，所以
    两个位置都认，而不是写死某一条路径。
    """
    try:
        import dmPython
    except ImportError:
        return None

    candidates = []
    pkg_file = getattr(dmPython, "__file__", "") or ""
    if pkg_file:
        candidates.append(os.path.join(os.path.dirname(pkg_file), "dmssl"))
    dm_home = os.environ.get("DM_HOME", "")
    if dm_home:
        candidates.append(os.path.join(dm_home, "dmssl"))
        candidates.append(os.path.join(dm_home, "bin", "dmssl"))
    for cand in candidates:
        if os.path.isdir(cand):
            return cand
    return None


def ensure_dm_ssl_on_startup_path() -> None:
    """保证 dmssl 在本进程【启动时】的动态库搜索路径里，必要时重启自己一次。

    实测（dmPython 2.5.32 / Python 3.13 x64 / Windows 11）：
      · 达梦驱动的加密库搜索路径在进程启动那一刻就定下来了；
      · 启动之后再改 PATH、再调 os.add_dll_directory 都没用（干净 PATH 下
        none / add_dll / setpath / both 四种组合全部报 [CODE:-70089]）；
      · 把 dmssl 放进【子进程启动前】的 PATH，同一个驱动立刻 CONNECT OK。
    不这么做时，连接失败会被 CPython 包成
        SystemError: <class 'dmPython.Connection'> returned a result with an exception set
    看上去像网络不通或账号错。金隅、机械总院、泸州老窖、节保报文四条达梦数据源
    同时“连不上”，根因就是这一条。

    换机器时不依赖任何写死的路径：dmssl 由 dmPython 自己的位置推导（或 DM_HOME），
    是否需要重启由进程启动时的 PATH 决定；已经配好 PATH 的机器（或服务端不要求
    加密的库）根本不会走到重启这一步。
    """
    if os.environ.get(_DM_BOOTSTRAP_FLAG) == "1":
        return
    ssl_dir = _dm_ssl_dir()
    if not ssl_dir:
        return

    wanted = ssl_dir.lower()
    if os.name == "nt":
        if wanted in _path_entries(INITIAL_PATH):
            return
    else:
        if _LIB_PATH_VARS and all(
            wanted in _path_entries(INITIAL_LIB_PATHS[name]) for name in _LIB_PATH_VARS
        ):
            return

    env = dict(os.environ)
    env["PATH"] = ssl_dir + os.pathsep + INITIAL_PATH
    for name, raw in INITIAL_LIB_PATHS.items():
        env[name] = ssl_dir + os.pathsep + raw
    env[_DM_BOOTSTRAP_FLAG] = "1"

    argv = [sys.executable, os.path.abspath(__file__)] + sys.argv[1:]
    if _debug_mode:
        print(f"[DEBUG] 以带 dmssl 的库路径重新启动查询进程: {ssl_dir}")

    import subprocess
    try:
        completed = subprocess.run(argv, env=env)
    except OSError as e:
        print(f"[ERROR] 重启查询进程失败: {e}", file=sys.stderr)
        sys.exit(1)
    sys.exit(completed.returncode)


def _driver_module_name(db_type: str) -> str:
    """数据库类型 → 它需要的 Python 驱动模块名（环境自检用）。"""
    return {
        "oracle": "oracledb",
        "dm": "dmPython",
        "mysql": "pymysql",
        "postgresql": "psycopg2",
    }.get(db_type, "")


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> str:
    """到库地址的 TCP 通不通 —— 用来把「网络不通」和「驱动/加密库问题」分开。

    超时故意给得短：连接失败时这段自检是**附在错误后面**的，不能把宿主的 30 秒预算吃光。
    """
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((host, int(port)))
        return f"TCP {host}:{port} 可达"
    except OSError as e:
        return f"TCP {host}:{port} 不可达（{e}）"
    finally:
        sock.close()


def diagnose_environment(info: dict) -> list:
    """环境自检：把「连不上」拆成解释器 / 驱动 / 达梦加密库 / 网络四条。

    连接失败时这几行会附在错误后面 —— 插件换到别的电脑出问题时，靠这几行就能判断该装
    什么、该找谁，而不是把驱动问题当成表名写错。四条正好对应三类真实故障：
    驱动没装（ImportError）、达梦加密库没加载（-70089）、网络不通（TCP 不可达）。
    """
    import platform

    lines = [
        f"  解释器 : Python {sys.version.split()[0]} {platform.architecture()[0]} — {sys.executable}",
    ]

    module = _driver_module_name(info["db_type"])
    if module:
        try:
            mod = __import__(module)
            version = getattr(mod, "version", "") or getattr(mod, "__version__", "") or "?"
            lines.append(f"  驱动   : {module} {version} 已安装 — {getattr(mod, '__file__', '?')}")
        except ImportError as e:
            hint = DRIVER_HINTS.get(info["db_type"], "")
            lines.append(f"  驱动   : {module} 未安装（{e}）；装它：{hint}")
    else:
        lines.append(f"  驱动   : 未知数据库类型 '{info['db_type']}'")

    if info["db_type"] == "dm":
        ssl_dir = _dm_ssl_dir()
        if ssl_dir:
            on_path = ssl_dir.lower() in _path_entries(os.environ.get("PATH", ""))
            lines.append(
                f"  加密库 : 找到 {ssl_dir}；本进程库搜索路径{'已含' if on_path else '不含'}它"
            )
        else:
            lines.append("  加密库 : 没找到 dmssl（应在 dmPython 旁边或 DM_HOME 下）")

    lines.append(f"  网络   : {_tcp_reachable(info['host'], info['port'])}")
    return lines


def _print_environment_lines(info: dict) -> None:
    """把环境自检打到 stderr，紧跟连接错误之后 —— 自检本身出错也不能顶掉原错误。"""
    print("\n--- 环境自检 ---", file=sys.stderr)
    try:
        for line in diagnose_environment(info):
            print(line, file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"  自检执行失败: {e}", file=sys.stderr)


def _prepare_dm_dll_path(dmPython) -> Optional[str]:
    """把达梦自带的加密库目录 dmssl 挂到 DLL 搜索路径上，返回该目录（没有则 None）。

    实测（2026-06，DM 驱动 dmPython 2.5.32 + Python 3.13）：dmPython 连接时会加载
    旁边的 dmssl 加密库（ssleay32/libeay32 等，x64）；该目录不在搜索路径里就报
    `[CODE:-70089] 加密模块加载失败`，而 CPython 又把它包成一句
    `SystemError: <class 'dmPython.Connection'> returned a result with an exception set`，
    真实原因被完全盖住 —— 金隅、机械总院、泸州老窖、节保报文四条达梦源当时全是这个现象，
    看上去像网络不通，实际 TCP 可达。

    dmssl 就在 dmPython 扩展模块旁边：LoadLibrary 会读进程的 PATH，所以加 PATH 是
    管用的那条路；add_dll_directory 对驱动内部的 LoadLibrary 不一定生效，两条都做。
    """
    base = os.path.dirname(getattr(dmPython, "__file__", "") or "")
    ssl_dir = os.path.join(base, "dmssl")
    if not base or not os.path.isdir(ssl_dir):
        return None

    current = os.environ.get("PATH", "")
    already = [p for p in current.split(os.pathsep) if p.lower() == ssl_dir.lower()]
    if not already:
        os.environ["PATH"] = ssl_dir + os.pathsep + current
    try:
        os.add_dll_directory(ssl_dir)  # Python 3.8+ / Windows only
    except (AttributeError, OSError):
        pass
    return ssl_dir


def get_dm_connection(info: dict):
    import dmPython

    ssl_dir = _prepare_dm_dll_path(dmPython)
    if _debug_mode:
        print(f"[DEBUG] dmssl dir: {ssl_dir or '（未找到，达梦加密模块可能加载失败）'}")

    try:
        return dmPython.connect(
            user=info["username"], password=info["password"],
            server=info["host"], port=info["port"],
        )
    except SystemError as e:
        # dmPython 把真实异常挂在 __cause__/__context__ 上，外面只剩那句 SystemError。
        # 不还原的话，面板只能显示一句无法定位的报错。
        cause = e.__cause__ or e.__context__
        if cause is None:
            raise
        detail = str(cause)
        if "加密模块" in detail:
            hint = f"（达梦加密库目录：{ssl_dir}）" if ssl_dir else \
                   "（未找到 dmPython 旁的 dmssl 目录，重装 dmPython 可恢复）"
            detail = f"{detail} {hint}"
            exc_cls = type(cause)
            try:
                raise exc_cls(detail) from None
            except TypeError:
                raise RuntimeError(detail) from None
        raise cause from None


def get_mysql_connection(info: dict):
    import pymysql
    return pymysql.connect(
        host=info["host"], port=info["port"],
        user=info["username"], password=info["password"],
        database=info.get("service_name", ""), charset="utf8mb4",
    )


def get_pg_connection(info: dict):
    import psycopg2
    return psycopg2.connect(
        host=info["host"],
        port=info["port"],
        user=info["username"],
        password=info["password"],
        dbname=info.get("service_name", ""),
    )


CONNECTORS = {
    "oracle": get_oracle_connection,
    "dm": get_dm_connection,
    "mysql": get_mysql_connection,
    "postgresql": get_pg_connection,
}

# 驱动缺失时给出的安装提示：面板会把这段原文展示给使用者
DRIVER_HINTS = {
    "oracle": "pip install oracledb",
    "dm": "pip install dmPython",
    "mysql": "pip install pymysql",
    "postgresql": "pip install psycopg2-binary",
}


# ============ 输出格式化 ============
def format_as_table(columns: list, rows: list) -> str:
    if not rows:
        return "(空结果)"
    col_widths = [len(str(c)) for c in columns]
    str_rows = []
    for row in rows:
        str_row = [str(v) if v is not None else "NULL" for v in row]
        str_rows.append(str_row)
        for i, val in enumerate(str_row):
            col_widths[i] = max(col_widths[i], len(val))

    lines = []
    header = "| " + " | ".join(str(c).ljust(col_widths[i]) for i, c in enumerate(columns)) + " |"
    lines.append(header)
    sep = "|" + "|".join("-" * (w + 2) for w in col_widths) + "|"
    lines.append(sep)
    for row in str_rows:
        lines.append("| " + " | ".join(v.ljust(col_widths[i]) for i, v in enumerate(row)) + " |")
    return "\n".join(lines)


# ============ 主逻辑 ============
def main():
    global CONFIG_PATH

    parser = argparse.ArgumentParser(description="通用数据库查询工具")
    parser.add_argument("--project", "-p", required=True, help="项目名（精确优先，其次模糊匹配）")
    parser.add_argument("--env", "-e", default="test", help="环境: test / prod / dev / analysis (默认 test)")
    parser.add_argument("--sql", "-s", default=None, help="要执行的 SQL 语句（用 --check 时可省略）")
    parser.add_argument("--check", action="store_true",
                        help="只做环境自检（解释器 / 驱动 / 达梦加密库 / 网络）并试连一次，不执行 SQL")
    parser.add_argument("--user", "-u", default=None, help="数据库用户名")
    parser.add_argument("--config", "-c", default=None,
                        help="配置文件路径（默认 ~/.dsh/yon-panel/db_config.json，可用 YON_DB_CONFIG 覆盖）")
    parser.add_argument("--json", "-j", action="store_true", help="JSON 格式输出")
    parser.add_argument("--yes", "-y", action="store_true", help="跳过安全检查确认")
    parser.add_argument("--debug", action="store_true", help="打印连接过程诊断信息")
    args = parser.parse_args()

    if not args.check and not args.sql:
        parser.error("需要 --sql/-s（除非用 --check 只做环境自检）")

    if args.config:
        CONFIG_PATH = os.path.abspath(os.path.expanduser(args.config))
    else:
        CONFIG_PATH = default_config_path()

    if args.debug:
        set_debug(True)

    # ========== 执行查询 ==========
    try:
        config = load_config()
    except FileNotFoundError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[ERROR] 配置文件不是合法 JSON: {CONFIG_PATH}\n  {e}", file=sys.stderr)
        sys.exit(1)

    try:
        info = get_connection_info(config, args.project, args.env, args.user)
    except ValueError as e:
        print(f"[ERROR] 配置不完整: {e}", file=sys.stderr)
        sys.exit(1)

    connector = CONNECTORS.get(info["db_type"])
    if not connector:
        supported = ", ".join(sorted(CONNECTORS.keys()))
        print(
            f"[ERROR] 不支持的数据库类型: {info['db_type']}（本工具支持: {supported}）\n"
            f"  数据源: {info['project_name']} / {args.env}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 达梦的加密库必须已经在【进程启动时】的 DLL 搜索路径里；没有就用带 dmssl 的
    # PATH 重启自己一次，否则连接时报 [CODE:-70089] 加密模块加载失败。
    if info["db_type"] == "dm":
        ensure_dm_ssl_on_startup_path()

    # ========== 主动体检（--check）==========
    if args.check:
        print(f"项目: {info['project_name']}")
        print(f"数据库: {info['db_type'].upper()} | {info['host']}:{info['port']} | 用户: {info['username']}")
        print("--- 环境自检 ---")
        for line in diagnose_environment(info):
            print(line)
        try:
            probe = connector(info)
            probe.close()
        except Exception as e:
            print(f"\n结论: 连接失败 —— {e}", file=sys.stderr)
            sys.exit(1)
        print("\n结论: 连接成功")
        sys.exit(0)

    # ========== 安全确认 ==========
    # 放在达梦引导重启之后：真正执行 SQL 的是重启出来的那个进程，确认只该问一遍。
    dangerous = is_dangerous(args.sql or "")
    is_prod = args.env in ("prod", "production")

    if dangerous and not args.yes:
        print()
        print("⚠️ 危险操作确认")
        print(f"   项目: {args.project}")
        print(f"   环境: {args.env}" + (" (生产环境!!!)" if is_prod else ""))
        print(f"   SQL:  {(args.sql or '')[:200]}{'...' if len(args.sql or '') > 200 else ''}")
        print()
        confirm = input("   该操作将修改数据，不可撤销。输入 yes 确认执行: ").strip()
        if confirm.lower() not in ("yes", "y", "是", "确认"):
            print("   已取消。")
            sys.exit(0)

    print(f"项目: {info['project_name']}")
    print(f"数据库: {info['db_type'].upper()} | {info['host']}:{info['port']} | 用户: {info['username']}")
    print(f"SQL: {(args.sql or '')[:100]}{'...' if len(args.sql or '') > 100 else ''}")
    print("---")

    try:
        conn = connector(info)
    except ImportError as e:
        hint = DRIVER_HINTS.get(info["db_type"], "pip install <driver>")
        print(f"\n[ERROR] 缺少 Python 驱动!", file=sys.stderr)
        print(f"  数据库类型: {info['db_type']}", file=sys.stderr)
        print(f"  原始错误: {e}", file=sys.stderr)
        print(f"  安装命令: {hint}", file=sys.stderr)
        _print_environment_lines(info)
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] 连接失败!", file=sys.stderr)
        print(f"  地址: {info['host']}:{info['port']}", file=sys.stderr)
        print(f"  用户: {info['username']}", file=sys.stderr)
        print(f"  错误: {e}", file=sys.stderr)
        _print_environment_lines(info)
        print(f"\n请确认以上连接信息是否正确。如需修改，请在 Yon 面板里改这条数据源，或直接编辑:", file=sys.stderr)
        print(f"  {CONFIG_PATH}", file=sys.stderr)
        sys.exit(1)

    cursor = conn.cursor()
    try:
        cursor.execute(args.sql)
    except Exception as e:
        conn.close()
        print(f"[ERROR] SQL 执行失败: {e}", file=sys.stderr)
        sys.exit(1)

    rows = cursor.fetchall()
    columns = [d[0] for d in cursor.description] if cursor.description else []

    cursor.close()
    conn.close()

    if args.json:
        result = [dict(zip(columns, row)) for row in rows]
        print(json.dumps(result, ensure_ascii=False, default=str, indent=2))
    else:
        print(format_as_table(columns, rows))

    print(f"\n({len(rows)} 行)")

    if dangerous and not args.yes:
        print(f"[已执行] 该写操作已完成，请核实数据。")


if __name__ == "__main__":
    main()
