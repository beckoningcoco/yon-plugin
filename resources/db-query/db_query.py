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


def get_dm_connection(info: dict):
    import dmPython
    return dmPython.connect(
        user=info["username"], password=info["password"],
        server=info["host"], port=info["port"],
    )


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
    parser.add_argument("--sql", "-s", required=True, help="要执行的 SQL 语句")
    parser.add_argument("--user", "-u", default=None, help="数据库用户名")
    parser.add_argument("--config", "-c", default=None,
                        help="配置文件路径（默认 ~/.dsh/yon-panel/db_config.json，可用 YON_DB_CONFIG 覆盖）")
    parser.add_argument("--json", "-j", action="store_true", help="JSON 格式输出")
    parser.add_argument("--yes", "-y", action="store_true", help="跳过安全检查确认")
    parser.add_argument("--debug", action="store_true", help="打印连接过程诊断信息")
    args = parser.parse_args()

    if args.config:
        CONFIG_PATH = os.path.abspath(os.path.expanduser(args.config))
    else:
        CONFIG_PATH = default_config_path()

    if args.debug:
        set_debug(True)

    # ========== 安全确认 ==========
    dangerous = is_dangerous(args.sql)
    is_prod = args.env in ("prod", "production")

    if dangerous and not args.yes:
        print()
        print("⚠️ 危险操作确认")
        print(f"   项目: {args.project}")
        print(f"   环境: {args.env}" + (" (生产环境!!!)" if is_prod else ""))
        print(f"   SQL:  {args.sql[:200]}{'...' if len(args.sql) > 200 else ''}")
        print()
        confirm = input("   该操作将修改数据，不可撤销。输入 yes 确认执行: ").strip()
        if confirm.lower() not in ("yes", "y", "是", "确认"):
            print("   已取消。")
            sys.exit(0)

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

    print(f"项目: {info['project_name']}")
    print(f"数据库: {info['db_type'].upper()} | {info['host']}:{info['port']} | 用户: {info['username']}")
    print(f"SQL: {args.sql[:100]}{'...' if len(args.sql) > 100 else ''}")
    print("---")

    try:
        conn = connector(info)
    except ImportError as e:
        hint = DRIVER_HINTS.get(info["db_type"], "pip install <driver>")
        print(f"\n[ERROR] 缺少 Python 驱动!", file=sys.stderr)
        print(f"  数据库类型: {info['db_type']}", file=sys.stderr)
        print(f"  原始错误: {e}", file=sys.stderr)
        print(f"  安装命令: {hint}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] 连接失败!", file=sys.stderr)
        print(f"  地址: {info['host']}:{info['port']}", file=sys.stderr)
        print(f"  用户: {info['username']}", file=sys.stderr)
        print(f"  错误: {e}", file=sys.stderr)
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
