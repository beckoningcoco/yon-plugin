import requests


def main():
    try:
        resp = requests.get("https://www.baidu.com", timeout=10)
        resp.raise_for_status()
        print("success")
    except requests.RequestException as e:
        print(f"请求失败: {e}")


if __name__ == "__main__":
    main()
