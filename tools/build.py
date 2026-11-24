#!/usr/bin/env python3
"""把源文件拼成可以直接部署的静态站点。可以反复运行，只会改写「生成的文件」：
    data/cards.js            window.JN_CARDS（由 content/*.json 合并）
    js/sprites.js            把 assets/icons.svg 与 assets/art.svg 注入页面
    precache-manifest.js     Service Worker 要预缓存的文件清单和版本号
用法：
    python3 tools/build.py            # 开发：内容有错也照样生成，错误打印出来
    python3 tools/build.py --strict   # 发布：有错误或数量不是 365 就失败
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from validate_cards import validate_files  # noqa: E402

STRICT = "--strict" in sys.argv
TARGET = 365
# 发布到站点的文件（相对路径的通配）；dev/ tools/ docs/ content/ 不进离线缓存
DEPLOY_GLOBS = [
    "index.html", "manifest.webmanifest",
    "css/*.css", "js/*.js", "js/widgets/*.js", "data/*.js",
    "assets/*.png", "assets/*.svg", "assets/*.ico", "assets/*.webp",
]


def widget_ids():
    ids = {}
    for p in sorted((ROOT / "js" / "widgets").glob("*.js")):
        src = p.read_text(encoding="utf-8")
        for m in re.finditer(r"registerWidget\(\s*\{\s*id\s*:\s*['\"]([a-z0-9]+)['\"]", src):
            ids[m.group(1)] = p.name
    return ids


def build_cards():
    files = sorted(p for p in (ROOT / "content").glob("*.json") if not p.name.startswith("_"))
    errs, warns, cards = validate_files(files)
    if len(cards) < 30:
        # 开发早期正式内容还没到：把示例卡片也带上，方便外壳调试
        files += sorted((ROOT / "content").glob("_*.json"))
        errs, warns, cards = validate_files(files)
        print("（正式内容不足 30 张，已带上示例卡片 content/_sample.json）")
    wids = widget_ids()
    for c in cards:
        if c.get("format") == "widget" and c.get("widget") not in wids:
            errs.append(f"{c['id']}: 引用了不存在的组件 {c.get('widget')}")
    used = {c.get("widget") for c in cards if c.get("format") == "widget"}
    for w in sorted(set(wids) - used):
        warns.append(f"组件 {w}（{wids[w]}）没有任何卡片使用")
    by_type = {}
    for c in cards:
        by_type[c["type"]] = by_type.get(c["type"], 0) + 1
    print(f"卡片 {len(cards)} 张：" + "，".join(f"{k} {v}" for k, v in sorted(by_type.items())))
    print(f"组件 {len(wids)} 个；错误 {len(errs)}，警告 {len(warns)}")
    for e in errs[:60]:
        print("  错误  " + e)
    if "-v" in sys.argv:
        for w in warns:
            print("  警告  " + w)
    if STRICT and (errs or len(cards) != TARGET):
        print(f"严格模式：需要 0 个错误且正好 {TARGET} 张卡片。")
        sys.exit(1)
    # 稳定排序：按 id；外壳自己决定展示顺序
    cards.sort(key=lambda c: c["id"])
    out = "/* 由 tools/build.py 生成，请勿手改。源文件在 content/*.json */\nwindow.JN_CARDS = " + json.dumps(cards, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "cards.js").write_text(out, encoding="utf-8")
    return len(cards)


def build_sprites():
    parts = []
    for name in ("icons.svg", "art.svg"):
        p = ROOT / "assets" / name
        if not p.exists():
            continue
        s = p.read_text(encoding="utf-8")
        s = re.sub(r"<\?xml[^>]*\?>", "", s)
        s = re.sub(r"<!DOCTYPE[^>]*>", "", s)
        s = re.sub(r"<!--.*?-->", "", s, flags=re.S).strip()
        parts.append(s)
    js = (
        "/* 由 tools/build.py 生成，请勿手改。源文件：assets/icons.svg、assets/art.svg */\n"
        "(function(){var h=" + json.dumps("".join(parts), ensure_ascii=False) + ";"
        "function put(){if(document.getElementById('jn-sprites'))return;var d=document.createElement('div');d.id='jn-sprites';"
        "d.setAttribute('aria-hidden','true');d.style.cssText='position:absolute;width:0;height:0;overflow:hidden';d.innerHTML=h;"
        "document.body.insertBefore(d,document.body.firstChild);}"
        "if(document.body)put();else document.addEventListener('DOMContentLoaded',put);})();\n"
    )
    (ROOT / "js" / "sprites.js").write_text(js, encoding="utf-8")
    n_icons = len(re.findall(r'<symbol[^>]*id="i-', "".join(parts)))
    n_art = len(re.findall(r'<symbol[^>]*id="art-', "".join(parts)))
    print(f"图标 {n_icons} 个，插画 {n_art} 个")


def build_precache():
    files = []
    for g in DEPLOY_GLOBS:
        files += sorted(ROOT.glob(g))
    files = [f for f in dict.fromkeys(files) if f.is_file() and f.name != "precache-manifest.js"]
    h = hashlib.sha1()
    rels = []
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        rels.append("./" + rel)
        h.update(rel.encode())
        h.update(f.read_bytes())
    sw = ROOT / "sw.js"
    if sw.exists():
        h.update(sw.read_bytes())
    version = h.hexdigest()[:10]
    total = sum(f.stat().st_size for f in files)
    out = (
        "/* 由 tools/build.py 生成，请勿手改 */\n"
        f"self.__JN_VERSION = {json.dumps(version)};\n"
        "self.__JN_PRECACHE = " + json.dumps(["./"] + rels, ensure_ascii=False, indent=0) + ";\n"
    )
    (ROOT / "precache-manifest.js").write_text(out, encoding="utf-8")
    print(f"离线缓存清单 {len(rels)} 个文件，约 {total / 1024:.0f} KB，版本 {version}")


if __name__ == "__main__":
    build_cards()
    build_sprites()
    build_precache()
