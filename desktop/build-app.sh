#!/bin/bash
# 把学情系统打成 macOS 可双击运行的 .app（Electron 壳）
#
# 做法：复制 Electron 运行时 → 改名与图标 → 塞入 app 代码与内置 OCR → ad-hoc 签名。
# 不做公证（未上架 App Store），首次打开若被拦截，右键「打开」即可。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/desktop"
OUT="$DESKTOP/out"
APP_NAME="Lynn Realm"
APP="$OUT/$APP_NAME.app"
REMOTE="https://d0a08260a99-cb-env-pl.ixdf.com"

NODE_BIN="$HOME/.workbuddy/binaries/node/versions/22.22.2-6/bin"
NPX="$NODE_BIN/npx"
PY="$HOME/.workbuddy/binaries/python/versions/3.13.12/bin/python3"
PY="$HOME/.workbuddy/binaries/python/versions/3.13.12/bin/python3"

echo "== 1/6 构建前端（写死绝对 API，供离线副本用）"
cd "$ROOT"
VITE_API_BASE="$REMOTE/api" "$NPX" vite build --mode cloudbase --outDir dist-desktop --emptyOutDir >/tmp/desktop-build.log 2>&1
tail -1 /tmp/desktop-build.log

echo "== 2/6 准备 Electron 运行时"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$DESKTOP/node_modules/electron/dist/Electron.app" "$APP"

echo "== 3/6 改名与图标"
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/LynnRealm"
PLIST="$APP/Contents/Info.plist"
# 用 plistlib 改字段：PlistBuddy 对带空格/引号的值（Lynn's Realm）会解析失败
"$PY" - "$PLIST" "$DESKTOP/icon.icns" <<'PYEOF'
import plistlib, sys, shutil, os
plist_path, icns = sys.argv[1], sys.argv[2]
with open(plist_path, 'rb') as f:
    data = plistlib.load(f)
data['CFBundleExecutable'] = 'LynnRealm'
data['CFBundleName'] = 'LynnRealm'
data['CFBundleDisplayName'] = "Lynn's Realm 学情管理"
data['CFBundleIdentifier'] = 'cn.xdf.lynn.realm'
data['CFBundleShortVersionString'] = '1.0.0'
data['CFBundleVersion'] = '1'
data['CFBundleIconFile'] = 'icon.icns'
data['NSHumanReadableCopyright'] = "Lynn's Realm · 学情管理"
with open(plist_path, 'wb') as f:
    plistlib.dump(data, f)
shutil.copy(icns, os.path.join(os.path.dirname(plist_path), 'Resources', 'icon.icns'))
print('plist updated')
PYEOF

echo "== 4/6 放入应用代码与离线副本"
mkdir -p "$APP/Contents/Resources/app"
cp "$DESKTOP/main.js" "$DESKTOP/preload.js" "$APP/Contents/Resources/app/"
cp -R "$ROOT/dist-desktop" "$APP/Contents/Resources/app/dist-desktop"
cat > "$APP/Contents/Resources/app/package.json" <<'EOF'
{
  "name": "realm-desktop",
  "version": "1.0.0",
  "private": true,
  "main": "main.js"
}
EOF

echo "== 5/6 放入本地 OCR"
if [ -x "$ROOT/tools/ocr/ocr" ]; then
  cp "$ROOT/tools/ocr/ocr" "$APP/Contents/Resources/ocr"
  chmod +x "$APP/Contents/Resources/ocr"
else
  echo "   ! 未找到 tools/ocr/ocr，客户端将没有选图识别功能"
fi

echo "== 6/6 ad-hoc 签名"
codesign --force --deep --sign - "$APP" 2>&1 | tail -2
codesign --verify --deep --strict "$APP" && echo "签名校验通过"

echo
echo "完成：$APP"
du -sh "$APP"
