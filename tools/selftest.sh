#!/bin/bash
# 用无头 Chrome 跑 dev/selftest.html 并打印报告。
# 用法：bash tools/selftest.sh [虚拟时间毫秒，默认 1500000] [只测这些组件 id，逗号分隔]
# 例：  bash tools/selftest.sh 300000 make24,bulls,nim
cd "$(dirname "$0")/.." || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BUDGET="${1:-1500000}"
IDS="${2:-}"
QUERY=""
[ -n "$IDS" ] && QUERY="?ids=$IDS"
PROFILE="$(mktemp -d)"
OUT="$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --virtual-time-budget="$BUDGET" --window-size=500,1000 \
  --dump-dom "file://$(pwd)/dev/selftest.html$QUERY" 2>/dev/null)"
rm -rf "$PROFILE"
python3 - "$OUT" <<'PY'
import sys, re, json, html
m = re.search(r"SELFTEST_JSON_BEGIN(.*?)SELFTEST_JSON_END", sys.argv[1], re.S)
if not m:
    print("没有拿到报告（可能时间预算不够，或页面脚本出错）"); sys.exit(2)
rep = json.loads(html.unescape(m.group(1)))
print(f"组件 {rep['widgets']} 个，任务 {rep['jobs']} 个，运行 {rep['runs']} 次，失败 {rep['failedRuns']} 次，错误 {len(rep['errors'])} 条")
for e in rep["errors"][:80]:
    print("  " + e)
sys.exit(1 if rep["errors"] else 0)
PY
