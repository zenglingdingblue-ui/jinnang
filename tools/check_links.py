#!/usr/bin/env python3
"""检查所有卡片 refs 里的网址还能不能打开。用法：python3 tools/check_links.py
只报告结果，不改任何文件。403/405/429 多半是站点拦截脚本访问，不等于链接坏了；404、域名解析失败才需要处理。"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
urls = {}
for p in sorted((ROOT / "content").glob("*.json")):
    if p.name.startswith("_"):
        continue
    for c in json.loads(p.read_text(encoding="utf-8")):
        for r in c.get("refs") or []:
            if r.get("u"):
                urls.setdefault(r["u"], []).append(c["id"])

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def check(u):
    for method in (["-I"], ["-r", "0-2047"]):
        try:
            out = subprocess.run(
                ["curl", "-s", "-L", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "15", "-A", UA] + method + [u],
                capture_output=True, text=True, timeout=25,
            ).stdout.strip()
        except Exception:  # noqa: BLE001
            out = "000"
        if out.startswith("2") or out.startswith("3"):
            return u, out
    return u, out


with ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(check, urls))
ok = [r for r in results if r[1][:1] in "23"]
blocked = [r for r in results if r[1] in ("401", "403", "405", "406", "429", "999")]
bad = [r for r in results if r not in ok and r not in blocked]
print(f"网址 {len(urls)} 个：能打开 {len(ok)}，被站点拦截（多半正常）{len(blocked)}，需要处理 {len(bad)}")
for u, code in sorted(blocked):
    print(f"  拦截 {code}  {u}  ← {','.join(urls[u][:4])}")
for u, code in sorted(bad):
    print(f"  失败 {code}  {u}  ← {','.join(urls[u][:6])}")
sys.exit(1 if bad else 0)
