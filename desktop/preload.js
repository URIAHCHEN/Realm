// preload：只暴露「选图 + 本地 OCR + 版本信息」三件事，其余 Node 能力一律不给页面。
// 网页侧通过 window.realmDesktop 判断自己是否运行在桌面客户端里。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('realmDesktop', {
  /** 打开文件选择器，返回图片绝对路径（取消返回 null） */
  pickImage: () => ipcRenderer.invoke('realm:pickImage'),
  /** 对图片做本地 OCR，返回识别出的文本 */
  ocr: (imagePath) => ipcRenderer.invoke('realm:ocr', imagePath),
  /** 客户端信息（版本、是否离线副本、OCR 是否可用） */
  info: () => ipcRenderer.invoke('realm:info'),
  isDesktop: true,
});
