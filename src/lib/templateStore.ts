// 模板登记表（Template Registry）：让"私发模板 / 表扬模板 / 四个一模板"不再受部署与同步覆盖影响。
//
// 背景与设计取舍：
//  · 模板原本只作为 appConfig / lessonConfig 的普通字段随快照整体同步。
//    整体快照是"整包覆盖"语义——只要云端那份比本地旧（常见于：本地刚改完还没推上去就换设备/重新部署），
//    拉取就会把新改的模板一起盖掉，表现为"每次部署后模板丢失"。
//  · 这里改为"按槽位登记 + 时间戳最后写入者胜出(LWW)"：
//      槽位 = global.feedback | global.praise | lesson.<classId>.<课次>.feedback | .praise | .fourInOne
//    每个槽位独立记 { text, updatedAt }；合并时**只有更新的那份才能覆盖较旧的那份**，
//    因此旧云端数据永远无法回退你新改的模板；反之在另一台设备上的新改动也能正确同步过来。
//  · 登记表自身也随云快照同步（SyncSnapshot.templates），并且在本地单独持久化一份，
//    即使某次拉取的车载数据缺字段，也能从本地登记表恢复。

export interface TemplateStamp {
  text: string;
  /** 毫秒时间戳；越大越新 */
  updatedAt: number;
}

export type TemplateStore = { [slot: string]: TemplateStamp };

export const TEMPLATE_STORE_KEY = 'templateStore.v1';

/** 槽位常量：集中定义，避免各处拼字符串出错 */
export const SLOT = {
  globalFeedback: 'global.feedback',
  globalPraise: 'global.praise',
  globalFourInOne: 'global.fourInOne',
  lessonFeedback: (classId: string, lesson: number) => `lesson.${classId}.${lesson}.feedback`,
  lessonPraise: (classId: string, lesson: number) => `lesson.${classId}.${lesson}.praise`,
  lessonFourInOne: (classId: string, lesson: number) => `lesson.${classId}.${lesson}.fourInOne`,
};

export function readTemplateStore(): TemplateStore {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TemplateStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeTemplateStore(store: TemplateStore): void {
  try {
    localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(store));
  } catch {
    /* 存储不可用时静默：下一次变更会再尝试 */
  }
}

/**
 * 登记一个槽位的最新文本；文本未变化时不动时间戳（避免无意义地"变新"而压掉其他设备）。
 * 返回是否有变化（用于判断是否需要触发一次同步）。
 */
export function stampTemplate(slot: string, text: string | undefined, at = Date.now()): boolean {
  if (text == null) return false;
  const store = readTemplateStore();
  const prev = store[slot];
  if (prev && prev.text === text) return false;
  store[slot] = { text, updatedAt: at };
  writeTemplateStore(store);
  return true;
}

/** 按槽位直接取文本与时间戳 */
export function getStamp(slot: string, store?: TemplateStore): TemplateStamp | undefined {
  const s = store || readTemplateStore();
  return s[slot];
}

/**
 * 合并两份登记表：逐槽位"更新者胜出"。
 * 完全不看数据来自哪里，只看时间戳——这样旧快照永远无法覆盖新模板。
 */
export function mergeTemplateStores(local: TemplateStore, incoming: TemplateStore | undefined): { merged: TemplateStore; changed: number } {
  const merged: TemplateStore = { ...local };
  let changed = 0;
  Object.entries(incoming || {}).forEach(([slot, st]) => {
    if (!st || typeof st.text !== 'string') return;
    const cur = merged[slot];
    if (!cur || (st.updatedAt || 0) > (cur.updatedAt || 0)) {
      merged[slot] = { text: st.text, updatedAt: st.updatedAt || 0 };
      changed++;
    }
  });
  return { merged, changed };
}

/** 是否包含至少一个非空模板（避免把空登记表塞进快照） */
export function isEmptyStore(store: TemplateStore | undefined): boolean {
  return !store || Object.keys(store).length === 0;
}

/**
 * 读取当前 storage 中的真实模板文本：
 * 优先返回登记表中"更新"的那份，避免 UI 显示旧文本（用于加载期自愈）。
 */
export function newestText(slot: string, fallbackText: string | undefined, store?: TemplateStore): string | undefined {
  const st = getStamp(slot, store);
  if (!st) return fallbackText;
  if (!fallbackText) return st.text;
  return st.text; // 登记表在写入时已保证是"最新那次编辑"，因此优先采用
}
