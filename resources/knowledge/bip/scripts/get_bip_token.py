"""
获取 BIP Access Token，支持多环境、多应用凭据。

用法:
    # 命令行参数 (基本)
    python get_bip_token.py --url https://erp-dev.xxx.com/ --key xxx --secret yyy

    # 指定项目和环境 (成功后输出配置更新指令)
    python get_bip_token.py --url ... --key ... --secret ... --project "项目名称" --env uat --app "主应用"

    # 交互模式
    python get_bip_token.py

输出:
    - access_token 原始值
    - Postman Authorization 配置 (Bearer Token)
    - curl 命令示例
    - 若指定 --project，额外输出 config_action 供写入 project-config.md
"""

import time
import hmac
import hashlib
import base64
import urllib.parse
import argparse
import sys
import json

try:
    import requests
except ImportError:
    print("缺少 requests 库，请先安装: pip install requests")
    sys.exit(1)


def sign(params, app_secret):
    """HmacSHA256 加签: 排序拼接 -> SHA256 -> Base64 -> URL Encode"""
    sorted_params = sorted(params.items())
    string_to_sign = "".join(f"{k}{v}" for k, v in sorted_params)
    secret_bytes = app_secret.encode("utf-8")
    message_bytes = string_to_sign.encode("utf-8")
    hmac_obj = hmac.new(secret_bytes, message_bytes, hashlib.sha256)
    base64_string = base64.b64encode(hmac_obj.digest()).decode("utf-8")
    return urllib.parse.quote(base64_string, safe="")


def get_bip_token(bip_url, app_key, app_secret, timeout=30):
    """
    获取 BIP Access Token

    返回:
        dict: {"access_token": "...", "code": "...", "message": "..."}
    """
    endpoint = f"{bip_url.rstrip('/')}/iuap-api-auth/open-auth/selfAppAuth/getAccessToken"
    timestamp = str(int(time.time() * 1000))

    params = {"appKey": app_key, "timestamp": timestamp}
    signature = sign(params, app_secret)
    full_url = f"{endpoint}?appKey={app_key}&timestamp={timestamp}&signature={signature}"

    try:
        resp = requests.get(full_url, timeout=timeout)
        resp.raise_for_status()
        result = resp.json()
    except requests.exceptions.RequestException as e:
        return {"access_token": None, "code": "HTTP_ERROR", "message": str(e)}

    code = result.get("code", "")
    if code != "00000":
        return {
            "access_token": None,
            "code": code,
            "message": result.get("message", "未知错误"),
        }

    data = result.get("data", {})
    return {
        "access_token": data.get("access_token"),
        "code": code,
        "message": "success",
    }


def print_token_info(bip_url, app_key, app_secret, result, elapsed_ms,
                     project_name=None, env_name=None, app_name=None):
    """格式化输出 Token 信息，方便 Postman 使用"""
    token = result["access_token"]

    print("\n" + "=" * 72)
    print("  BIP Access Token")
    print("=" * 72)

    print(f"\n  [状态码]     {result['code']} ({result['message']})")
    print(f"  [耗时]       {elapsed_ms} ms")
    print(f"  [环境地址]   {bip_url}")
    if project_name:
        print(f"  [项目名称]   {project_name}")
    if env_name:
        print(f"  [环境]       {env_name}")
    if app_name:
        print(f"  [应用]       {app_name}")

    if not token:
        print(f"\n  [错误] 获取 Token 失败: {result['message']}")
        return

    print(f"\n  [Access Token]\n")
    print(f"  {token}")

    print(f"\n  {'─' * 72}")
    print(f"\n  [Postman 配置]")
    print(f"\n  Type:   Bearer Token")
    print(f"  Token:  {token}")
    print(f"\n  或手动设置 Header:")
    print(f"  Authorization: Bearer {token}")

    print(f"\n  {'─' * 72}")
    print(f"\n  [curl 示例]\n")
    print(f'  curl -X GET \\')
    print(f'    -H "Authorization: Bearer {token}" \\')
    print(f'    "{bip_url.rstrip("/")}/iuap-api-auth/open-auth/selfAppAuth/checkToken"\n')

    print("=" * 72)

    # JSON 输出
    json_output = {
        "access_token": token,
        "token_type": "Bearer",
        "bip_url": bip_url,
        "app_key": app_key,
        "header": {"Authorization": f"Bearer {token}"},
    }

    # 若指定了项目名，附加配置更新指令
    if project_name:
        json_output["config_action"] = {
            "action": "upsert",
            "project_name": project_name,
            "env": env_name or "dev",
            "app": app_name or "默认",
            "file": "project-config.md",
            "fields": {
                "域名": bip_url,
                "AppKey": app_key,
                "AppSecret": app_secret,
            },
        }

    print("\n[JSON 输出]")
    print(json.dumps(json_output, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="获取 BIP Access Token，用于 Postman / curl 调用"
    )
    parser.add_argument("--url", help="BIP 环境地址")
    parser.add_argument("--key", help="应用 AppKey")
    parser.add_argument("--secret", help="应用 AppSecret")
    parser.add_argument("--project", help="项目名称 (成功后输出配置更新指令)")
    parser.add_argument("--env", default=None, help="环境名称: dev / uat / prod (默认 dev)")
    parser.add_argument("--app", default=None, help="应用名称，区分同环境多组凭据 (默认: 默认)")
    parser.add_argument("--json", action="store_true", help="仅输出 JSON (静默模式)")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP 超时秒数 (默认 30)")

    args = parser.parse_args()

    # 命令行参数或交互输入
    bip_url = args.url or input("BIP 环境地址: ").strip()
    app_key = args.key or input("AppKey: ").strip()
    app_secret = args.secret or input("AppSecret: ").strip()
    project_name = args.project or None
    env_name = args.env or ("dev" if project_name else None)
    app_name = args.app or ("默认" if project_name else None)

    if not bip_url or not app_key or not app_secret:
        print("错误: url / key / secret 不能为空")
        sys.exit(1)

    start = time.time()
    result = get_bip_token(bip_url, app_key, app_secret, timeout=args.timeout)
    elapsed_ms = int((time.time() - start) * 1000)

    if args.json:
        output = {
            "access_token": result["access_token"],
            "code": result["code"],
            "message": result["message"],
            "bip_url": bip_url,
            "app_key": app_key,
            "elapsed_ms": elapsed_ms,
        }
        if project_name and result["access_token"]:
            output["config_action"] = {
                "action": "upsert",
                "project_name": project_name,
                "env": env_name,
                "app": app_name,
                "file": "project-config.md",
                "fields": {
                    "域名": bip_url,
                    "AppKey": app_key,
                    "AppSecret": app_secret,
                },
            }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print_token_info(bip_url, app_key, app_secret, result, elapsed_ms,
                         project_name, env_name, app_name)

    sys.exit(0 if result["access_token"] else 1)


if __name__ == "__main__":
    main()
