#!/bin/bash
# 用无头 Chrome 给某个页面截一张手机尺寸的图，方便自查版面。
# 用法：bash tools/shot.sh <相对项目根的页面路径和参数> <输出 png> [宽 默认 390] [高 默认 844] [等待毫秒 默认 2500]
# 例：  bash tools/shot.sh "index.html#c=talk-901" dev/shots/a/card.png
#       bash tools/shot.sh "dev/harness.html?w=picker" dev/shots/g1/picker.png 900 900
# 注意：无头 Chrome 的窗口最窄 500px。宽度小于 500 时，这里会把页面放进一个指定宽高的 iframe 里再截图并裁剪，
#       所以截到的就是真实的手机宽度。
cd "$(dirname "$0")/.." || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PAGE="$1"; OUT="$2"; W="${3:-390}"; H="${4:-844}"; WAIT="${5:-2500}"
mkdir -p "$(dirname "$OUT")" dev/shots/_tmp
PROFILE="$(mktemp -d)"
if [ "$W" -lt 500 ]; then
  WRAP="dev/shots/_tmp/wrap-$$.html"
  printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}iframe{display:block;border:0;width:%spx;height:%spx}</style><iframe src="../../../%s"></iframe>' "$W" "$H" "$PAGE" > "$WRAP"
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars --user-data-dir="$PROFILE" \
    --allow-file-access-from-files --force-device-scale-factor=2 --window-size=500,"$H" \
    --virtual-time-budget="$WAIT" --screenshot="$(pwd)/$OUT" "file://$(pwd)/$WRAP" >/dev/null 2>&1
  rm -f "$WRAP"
  # 裁掉右侧多出来的部分（截图是 2 倍像素）
  python3 - "$OUT" "$W" "$H" <<'PY'
import sys
from PIL import Image
p, w, h = sys.argv[1], int(sys.argv[2]) * 2, int(sys.argv[3]) * 2
im = Image.open(p)
im.crop((0, 0, min(w, im.width), min(h, im.height))).save(p)
PY
else
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars --user-data-dir="$PROFILE" \
    --allow-file-access-from-files --force-device-scale-factor=2 --window-size="$W","$H" \
    --virtual-time-budget="$WAIT" --screenshot="$(pwd)/$OUT" "file://$(pwd)/$PAGE" >/dev/null 2>&1
fi
rm -rf "$PROFILE"
ls -la "$OUT" 2>/dev/null || echo "截图失败"
