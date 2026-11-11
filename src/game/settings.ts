import { sfx } from './audio/sfx';

export interface Settings { sfxVolume: number; musicVolume: number; muted: boolean; reduceMotion: boolean }
const KEY = 'pixel-party:settings';
export const DEFAULT_SETTINGS: Settings = { sfxVolume: 0.6, musicVolume: 0.5, muted: false, reduceMotion: false };

let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function apply(s: Settings) {
  sfx.sfxVolume = s.sfxVolume;
  sfx.musicVolume = s.musicVolume;
  sfx.muted = s.muted;
  sfx.applyVolumes();
  if (typeof document !== 'undefined') document.documentElement.dataset.reduceMotion = String(s.reduceMotion);
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    const reducedByOS = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    current = { ...DEFAULT_SETTINGS, reduceMotion: reducedByOS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { current = { ...DEFAULT_SETTINGS }; }
  apply(current);
  listeners.forEach((l) => l());
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sem armazenamento: segue em memória */ }
  apply(current);
  listeners.forEach((l) => l());
}

export const settingsStore = {
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  get: () => current,
  getServer: () => DEFAULT_SETTINGS,
};
