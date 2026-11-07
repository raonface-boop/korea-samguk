// 저장과 불러오기 (localStorage)
import { GameState, SAVE_VERSION, bindStatBonuses } from './state';

const KEY = 'korea-samguk-save-v1';

export function saveGame(s: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, popups: [], alerts: [] }));
    return true;
  } catch {
    return false;
  }
}

/** 저장 형식이 바뀌면 SAVE_VERSION 을 올림 (8차 → 3, 10차: 장수 871명·적성 → 4). 예전 버전 저장은 불러오지 않음 */
export const OLD_SAVE_MESSAGE = '예전 버전 저장이라 불러올 수 없습니다';

export type LoadResult = { kind: 'none' } | { kind: 'old' } | { kind: 'ok'; state: GameState };

export function loadGame(): LoadResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { kind: 'none' };
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== SAVE_VERSION || !s.cities || !s.grid || !s.research) return { kind: 'old' };
    bindStatBonuses(s);
    return { kind: 'ok', state: s };
  } catch {
    return { kind: 'old' };
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

// ---------- 설정 ----------
export interface Settings {
  bgm: boolean;
  bgmVolume: number;
  sfx: boolean;
  sfxVolume: number;
  autosave: boolean;
  fast: boolean;
}

const SETTINGS_KEY = 'korea-samguk-settings';
export const DEFAULT_SETTINGS: Settings = { bgm: true, bgmVolume: 0.5, sfx: true, sfxVolume: 0.7, autosave: true, fast: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(st: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(st));
  } catch {
    /* 무시 */
  }
}
