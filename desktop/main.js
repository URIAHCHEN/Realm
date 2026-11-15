// Lynn's Realm · macOS 桌面客户端
//
// 形态：Electron 壳
//   · 优先加载线上站点（https://d0a08260a99-cb-env-pl.ixdf.com）
//     —— 同源，前端原有的 /api 相对路径照常工作，且改动随线上即时生效
//   · 网络不可用时回退到随包内置的离线副本（dist-desktop，构建时写死绝对 API）
//     —— 本地照常录入，联网后自动同步
//
// 附加能力：把 macOS 自带的 Vision OCR 包成 realmDesktop.ocr()，供「智能录入」直接读表格照片。
// 安全：contextIsolation 开启、nodeIntegration 关闭，preload 只暴露最小接口。

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const REMOTE_URL = 'https://d0a08260a99-cb-env-pl.ixdf.com/';
const LOCAL_ENTRY = path.join(__dirname, 'dist-desktop', 'index.html');

let mainWindow = null;
let usingLocalCopy = false;

/** OCR 可执行文件位置：打包后在 resources/ocr，开发时用仓库里的 tools/ocr/ocr */
function resolveOcrBinary() {
  const packaged = path.join(process.resourcesPath, 'ocr');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'tools', 'ocr', 'ocr');
}

function runOcr(imagePath) {
  const bin = resolveOcrBinary();
  if (!fs.existsSync(bin)) throw new Error('OCR 组件缺失，请重新安装客户端');
  return new Promise((resolve, reject) => {
    execFile(bin, [imagePath, '--plain'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      resolve(String(stdout || '').trim());
    });
  });
}

function loadLocal(win) {
  if (!fs.existsSync(LOCAL_ENTRY)) return false;
  usingLocalCopy = true;
  win.loadFile(LOCAL_ENTRY);
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'Lynn\'s Realm 学情管理',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f6fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 线上优先，失败回退内置副本
  mainWindow.loadURL(REMOTE_URL).catch(() => {
    if (!loadLocal(mainWindow)) mainWindow.loadURL('about:blank');
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (usingLocalCopy) return;
    console.warn('[realm] 线上加载失败', code, desc, url);
    if (!loadLocal(mainWindow)) {
      mainWindow.loadURL('about:blank');
    }
  });

  // 外链走系统浏览器，不在壳内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(REMOTE_URL) || url.startsWith('file://')) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // 离线回退后自动重试线上（每 60s 一次，成功即切回）
  if (usingLocalCopy) {
    const timer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(timer); return; }
      mainWindow.loadURL(REMOTE_URL).then(() => clearInterval(timer)).catch(() => {});
    }, 60_000);
    mainWindow.on('closed', () => clearInterval(timer));
  }
}

// ---------- IPC ----------

ipcMain.handle('realm:pickImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择要识别的表格照片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'heic', 'webp', 'tiff'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('realm:ocr', async (_event, imagePath) => {
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error('文件不存在');
  return runOcr(imagePath);
});

ipcMain.handle('realm:info', () => ({
  version: app.getVersion(),
  remote: REMOTE_URL,
  localMode: usingLocalCopy,
  ocr: fs.existsSync(resolveOcrBinary()),
}));

// ---------- 应用生命周期 ----------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const template = [
      {
        label: 'Lynn\'s Realm',
        submenu: [
          { role: 'about', label: '关于 Lynn\'s Realm' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏' },
          { role: 'hideOthers', label: '隐藏其他' },
          { type: 'separator' },
          { role: 'quit', label: '退出' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'toggleDevTools', label: '开发者工具' },
          { type: 'separator' },
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' },
        ],
      },
      {
        label: '窗口',
        submenu: [
          { role: 'minimize', label: '最小化' },
          { role: 'zoom', label: '缩放' },
          { role: 'close', label: '关闭' },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
