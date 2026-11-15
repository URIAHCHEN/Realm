# Lynn's Realm · macOS 客户端

把学情系统包成可双击运行的 App，并附带一个**本地 OCR**（macOS 自带 Vision），
用于把纸质表格照片直接读进「校内成绩 → 智能录入」。

## 形态

Electron 壳，优先加载线上站点：

| 场景 | 行为 |
|---|---|
| 有网 | 直接加载 `https://d0a08260a99-cb-env-pl.ixdf.com/`，与网页完全一致，改动即时生效 |
| 断网 | 回退到随包内置的离线副本（`dist-desktop`，构建时写死绝对 API），本地照常录入，联网后自动同步 |
| 恢复联网 | 每 60 秒重试线上，成功即切回 |

## 额外能力

`preload.js` 只向页面暴露三件事，Node 其余能力一律不给：

```js
window.realmDesktop.isDesktop        // 是否运行在客户端里
window.realmDesktop.pickImage()      // 选图，返回绝对路径
window.realmDesktop.ocr(path)        // 本地 OCR，返回纯文本
window.realmDesktop.info()           // { version, remote, localMode, ocr }
```

网页的「智能录入」检测到 `window.realmDesktop` 后，会自动出现「选图识别」按钮。

## 构建

```bash
# 1) 编译本地 OCR（只需要一次）
cd tools/ocr && /usr/bin/swiftc -O ocr.swift -o ocr

# 2) 装 Electron 运行时（首次）
cd desktop && ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron@33

# 3) 打包
cd .. && ./desktop/build-app.sh
# 产物：desktop/out/Lynn Realm.app
```

## 安装与首次打开

```bash
cp -R "desktop/out/Lynn Realm.app" ~/Applications/
```

应用用 ad-hoc 签名（未做 Apple 公证）。若首次打开提示「无法验证开发者」：
右键点图标 → 打开 → 再点「打开」。或者：

```bash
xattr -dr com.apple.quarantine ~/Applications/"Lynn Realm.app"
```

## 已知限制

- **未公证**：只在自己机器上用没问题，发给别人需要先过 Gatekeeper 那一步。
- **手写识别不可靠**：Vision 对印刷体准确率很高，手写中文会出错（实测「练弈雅」→「练將産」），
  所以识别结果一律进「草稿 → 人工校正」流程，不会直接入库。
- 离线副本是打包时的快照，线上更新后需重新 `build-app.sh` 才会同步（联网时无影响）。
