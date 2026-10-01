/** 这台浏览器里的 Studio 偏好（不写进站点项目） */
const KEY = 'mori-studio:autosave-seconds';
export const DEFAULT_AUTOSAVE_SECONDS = 60;

export function autosaveSeconds(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_AUTOSAVE_SECONDS;
  } catch { return DEFAULT_AUTOSAVE_SECONDS; }
}

export function setAutosaveSeconds(n: number) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* 存不了就算了，下次还是默认值 */ }
}
