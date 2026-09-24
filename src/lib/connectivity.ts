// 后端可达性状态：把「网络抖动 / 服务商暂停 / 真·凭证失效」三种情况区分开。
//
// 背景：Supabase 免费版项目约 7 天低活跃会被暂停（暂停期间 API 与 Auth 全不可达）。
// 旧逻辑只要请求不成功就清本地会话 → 用户被"退出登录"，整站锁死，
// 而数据其实完好躺在本地。这里提供一个全局可订阅的"云端离线"标志：
//   · 认证/同步层遇到「网络异常 / 5xx / 429」→ 标记离线，但**保留会话**
//   · 只有服务端明确拒绝凭证（invalid_grant 等）才清会话
//   · 任意一次请求成功 → 标记恢复在线
// 界面据此显示"数据已存本地，联网后自动补传"，用户可继续录分。

export interface BackendState {
  /** 云端是否不可达 */
  offline: boolean;
  /** 可读的离线原因（给界面展示） */
  detail: string;
  /** 开始离线的时间戳（用于显示"已离线 N 分钟"） */
  since: number;
}

let state: BackendState = { offline: false, detail: '', since: 0 };
const listeners = new Set<(s: BackendState) => void>();

/** 便捷判断：当前是否处于云端不可达状态 */
export function isBackendOffline(): boolean {
  return state.offline;
}

export function getBackendState(): BackendState {
  return state;
}

function emit() {
  listeners.forEach(fn => fn(state));
}

/** 标记云端不可达（重复调用同一种原因不会反复触发通知） */
export function markBackendOffline(detail = '云端暂时不可达'): void {
  if (state.offline && state.detail === detail) return;
  state = { offline: true, detail, since: state.offline ? state.since : Date.now() };
  emit();
}

/** 标记云端已恢复（仅在由离线转在线时通知） */
export function markBackendOnline(): void {
  if (!state.offline) return;
  state = { offline: false, detail: '', since: 0 };
  emit();
}

export function subscribeBackendState(fn: (s: BackendState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 判断一次失败的响应是否属于「暂时不可达」而非「凭证无效」：
 * 网络层报错、5xx（含暂停时的 502/503）、429 限流 → 应当保留本地会话继续用。
 */
export function isTransientBackendFailure(status?: number): boolean {
  if (status == null) return true;            // fetch 直接抛错（DNS/断网/被拦）
  if (status === 429) return true;            // 限流
  return status >= 500;                       // 网关/服务不可用（暂停常表现为此）
}

/** 给界面统一口径的离线说明 */
export function offlineHint(): string {
  return '数据已保存在本设备，联网后会自动补传';
}
