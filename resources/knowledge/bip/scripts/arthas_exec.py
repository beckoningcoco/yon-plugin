#!/usr/bin/env python3
"""Arthas HTTP API 命令行工具。

通过 Arthas Tunnel Server 的 HTTP API 执行 Arthas 命令，自动格式化输出。
避免手动拼接 JSON / 转义引号的麻烦。

用法:
    python arthas_exec.py <arthas命令>                   # 单次命令
    python arthas_exec.py --port 8563 <arthas命令>      # 指定端口
    python arthas_exec.py -i                              # 交互模式（默认端口 8563）
    python arthas_exec.py -i --port 8564                 # 交互模式指定端口

示例:
    python arthas_exec.py sc *stockSync*
    python arthas_exec.py sm com.yonyou.ucf.mdf.jiankang.controller.StockSyncController
    python arthas_exec.py tt -t com.yonyou.ucf.mdf.jiankang.controller.StockSyncController balancePush2 -n 3
    python arthas_exec.py tt -l
    python arthas_exec.py tt -i 1000 -w "{params, returnObj, throwExp}" -x 3
    python arthas_exec.py watch com.yonyou.ucf.mdf.jiankang.controller.StockSyncController inboundPush "{params, returnObj}" -x 3
    python arthas_exec.py ognl "@java.lang.System@getProperty(\"domain.iuap-apcom-coderule\")"

监听类命令（watch/stack/trace）：
    这些命令执行后会阻塞等待方法调用。建议在另一个终端先用本脚本执行监听命令，
    然后用 curl 触发请求，再回来看输出。
    或者同时启两个终端：一个跑监听，一个发请求。
"""

import json
import sys
import argparse
import requests

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8563
API_PATH = "/api"


def format_result(result: dict) -> str:
    """格式化单个 Arthas 结果项。"""
    rtype = result.get("type", "")

    if rtype == "sc":
        class_names = result.get("classNames", [])
        return "\n".join(f"  {c}" for c in class_names)

    if rtype == "sm":
        info = result.get("methodInfo", {})
        ctor = "(构造)" if info.get("constructor") else ""
        return f"  {info.get('declaringClass', '')}  {info.get('methodName', '')}{info.get('descriptor', '')}  {ctor}"

    if rtype == "tt":
        fragments = result.get("timeFragmentList", [])
        lines = []
        for f in fragments:
            lines.append(f"  INDEX={f.get('index')}  {f.get('className', '')}.{f.get('methodName', '')}")
            lines.append(f"    耗时={f.get('cost', 0):.2f}ms  IS-RET={f.get('return', 'N/A')}  IS-EXP={f.get('throw', 'N/A')}")
            if f.get("returnObj") is not None:
                lines.append(f"    返回值={json.dumps(f['returnObj'], ensure_ascii=False)}")
            if f.get("throwExp") and f["throwExp"] != "null":
                lines.append(f"    异常={f['throwExp']}")
        return "\n".join(lines)

    if rtype == "watch":
        value = result.get("watchValue", "")
        return f"  {value}"

    if rtype == "ognl":
        return f"  {result.get('value', '')}"

    if rtype == "stack":
        return result.get("stack", "")

    if rtype == "jad":
        return result.get("source", "")

    if rtype in ("trace",):
        return json.dumps(result, indent=2, ensure_ascii=False)

    if rtype in ("row_affect", "status"):
        return ""

    # 未识别类型，原样 JSON
    return json.dumps(result, indent=2, ensure_ascii=False)


def call_arthas(host: str, port: int, command: str, timeout: int = 30) -> dict:
    """通过 HTTP API 执行 Arthas 命令并返回解析结果。"""
    url = f"http://{host}:{port}{API_PATH}"
    try:
        resp = requests.post(url, json={"action": "exec", "command": command},
                             timeout=timeout)
        resp.raise_for_status()
    except requests.exceptions.ReadTimeout:
        return {"error": f"命令超时（{timeout}s）。监听类命令需要触发后才有返回。"}
    except requests.exceptions.ConnectionError:
        return {"error": f"无法连接 Arthas {host}:{port}，请确认 Tunnel Server 已启动。"}
    except Exception as e:
        return {"error": str(e)}

    data = resp.json()
    if data.get("state") != "SUCCEEDED":
        return {"error": f"执行失败: {data.get('message', 'unknown')}"}

    return {"results": data["body"]["results"]}


def main():
    parser = argparse.ArgumentParser(
        description="Arthas HTTP API 命令行工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Arthas IP (默认 {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Tunnel Server 端口 (默认 {DEFAULT_PORT})")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP 请求超时秒数 (默认 30)")
    parser.add_argument("-i", "--interactive", action="store_true", help="交互模式，逐条输入命令执行")
    parser.add_argument("command", nargs="*", help="要执行的 Arthas 命令（多个词自动拼接）")

    # 用 parse_known_args 避免 Arthas 命令中的参数（如 -l/-n/-i/-x 等）被 argparse 误抓
    args, unknown = parser.parse_known_args()
    if args.command is None:
        args.command = []
    args.command.extend(unknown)

    if args.interactive:
        print(f"Arthas 交互模式（{args.host}:{args.port}）")
        print("输入命令执行，输入 exit/quit/q 退出\n")
        while True:
            try:
                cmd = input("arthas> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not cmd:
                continue
            if cmd.lower() in ("exit", "quit", "q"):
                break
            run_and_print(args.host, args.port, cmd, args.timeout)
        return

    if not args.command:
        parser.print_help()
        return

    cmd = " ".join(args.command)
    run_and_print(args.host, args.port, cmd, args.timeout)


def run_and_print(host: str, port: int, command: str, timeout: int):
    """执行单条命令并输出结果。"""
    print(f"\n>>> {command}\n")
    result = call_arthas(host, port, command, timeout=timeout)

    if "error" in result:
        print(f"  [ERROR] {result['error']}")
        return

    for r in result.get("results", []):
        formatted = format_result(r)
        if formatted.strip():
            print(formatted)
    print()


if __name__ == "__main__":
    main()
