#!/bin/bash
# 用无头 Chrome 跑 dev/shelltest.html（外壳的交互自测）并打印结果。
# 用法：bash tools/shelltest.sh [尺寸，默认 390x844] [虚拟时间毫秒，默认 400000]
cd "$(dirname "$0")/.." || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SIZE="${1:-390x844}"; BUDGET="${2:-400000}"
PROFILE="$(mktemp -d)"
OUT="$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --virtual-time-budget="$BUDGET" --window-size=900,1000 \
  --dump-dom "file://$(pwd)/dev/shelltest.html?size=$SIZE" 2>/dev/null)"
rm -rf "$PROFILE"
python3 - "$OUT" "$SIZE" <<'PY'
import sys, re, json, html
m = re.search(r"SHELLTEST_JSON_BEGIN(\{.*?\})SHELLTEST_JSON_END", sys.argv[1], re.S)
if not m:
    print("没有拿到报告（可能时间预算不够，或页面脚本出错）"); sys.exit(2)
rep = json.loads(html.unescape(m.group(1)))
print(f"外壳自测 @{sys.argv[2]}：卡片 {rep.get('cards')} 张，测试 {rep.get('tests')} 项，通过 {rep.get('passed')}，失败 {rep.get('failed')}，脚本报错 {len(rep.get('errors', []))} 条")
for r in rep.get("results", []):
    if not r.get("ok"):
        print("  失败  " + str(r.get("name")) + " :: " + str(r.get("err") or r.get("info"))[:300])
for e in rep.get("errors", [])[:20]:
    print("  报错  " + str(e)[:300])
sys.exit(1 if rep.get("failed") or rep.get("errors") else 0)
PY
