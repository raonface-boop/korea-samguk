// 저장과 불러오기 (localStorage)
import { GameState, SAVE_VERSION } from './state';

const KEY = 'korea-samguk-save-v1';

export function saveGame(s: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, popups: [], alerts: [] }));
    return true;
  } catch {
    return false;
  }
}

export type LoadResult = { kind: 'none' } | { kind: 'old' } | { kind: 'ok'; state: GameState };

export function loadGame(): LoadResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { kind: 'none' };
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== SAVE_VERSION || !s.cities || !s.grid) return { kind: 'old' };
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
