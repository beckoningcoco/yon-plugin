"""
NCC / BIP Class Index Builder
用法: python build_index.py <HOME路径> <版本号> [--bip]
示例:
  python build_index.py E:/NCProject/NCC2111/home 2111           # NCC 版本
  python build_index.py E:/download2 BIP_V5 --bip                 # BIP 旗舰版
"""
import json, os, sys, zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def build_index(home_path, version, is_bip=False):
    index = {}
    jar_count = 0
    class_count = 0

    for root, dirs, files in os.walk(home_path):
        # 跳过 JDK
        if "ufjdk" in root.replace("\\", "/").split("/"):
            continue

        for f in files:
            if not f.endswith(".jar"):
                continue

            jar_path = os.path.join(root, f)
            jar_rel = os.path.relpath(jar_path, home_path).replace("\\", "/")
            jar_count += 1

            try:
                with zipfile.ZipFile(jar_path, 'r') as zf:
                    for name in zf.namelist():
                        if name.endswith(".class") and not name.endswith("module-info.class"):
                            fqcn = name[:-6].replace("/", ".")
                            index[fqcn] = jar_rel
                            class_count += 1
            except Exception:
                pass

            if jar_count % 200 == 0:
                print(f"  已扫描 {jar_count} 个 jar, {class_count} 个类...")

    # 确定输出目录
    if is_bip:
        # BIP: 输出到 skills/yonyou-bip-dev/
        output_dir = os.path.join(SCRIPT_DIR, "..", "..", "yonyou-bip-dev")
        config_name = "bip_home_path.json"
    else:
        # NCC: 输出到 skills/yon-ncc-dev/
        output_dir = os.path.join(SCRIPT_DIR, "..")
        config_name = "ncc_home_path.json"

    output_dir = os.path.abspath(output_dir)

    # 保存索引
    index_filename = f"class_index_{version}.json"
    output = os.path.join(output_dir, index_filename)
    result = {
        "version": version,
        "total_jars": jar_count,
        "total_classes": class_count,
        "index": index
    }
    with open(output, 'w', encoding='utf-8') as out:
        json.dump(result, out, ensure_ascii=False, separators=(',', ':'))

    print(f"\n完成！{jar_count} 个 jar, {class_count} 个类")
    print(f"索引文件: {output}")

    # 更新 home 路径配置
    config_path = os.path.join(output_dir, config_name)
    cfg = {"default_version": version, "versions": {}}
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)

    cfg["versions"][version] = {
        "path": home_path,
        "description": "BIP 旗舰版" if is_bip else f"NCC {version}",
        "index_file": index_filename,
        "jdk_version": "?",
        "indexed": True
    }
    if "default_version" not in cfg or not cfg["default_version"]:
        cfg["default_version"] = version

    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

    print(f"配置已更新: {config_path}")


if __name__ == "__main__":
    is_bip = "--bip" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--bip"]

    if len(args) < 2:
        print(__doc__)
        sys.exit(1)

    build_index(args[0], args[1], is_bip)
