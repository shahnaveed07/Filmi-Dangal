import { Difficulty } from '../types/fighter';

export type RoundDurationOption = 30 | 60 | 90;
export type StartingHealthOption = 100 | 125 | 150;
export type ControlSensitivityOption = 'low' | 'normal' | 'high';
export type GraphicsQualityOption = 'low' | 'medium' | 'high';
export type VFXQualityOption = 'low' | 'medium' | 'high';
export type HUDScaleOption = 'compact' | 'normal' | 'large';
export type MobileControlSizeOption = 'compact' | 'standard' | 'large';

export interface KeyBindingsConfig {
  moveLeft: string;
  moveRight: string;
  jump: string;
  crouch: string;
  block: string;
  punch: string;
  kick: string;
  grab: string;
  superShot: string;
  superMove: string;
}

export interface GameSettings {
  // Audio
  masterVolume: number; // 0 - 100
  musicVolume: number; // 0 - 100
  sfxVolume: number; // 0 - 100
  muteAll: boolean;

  // Gameplay
  cpuDifficulty: Difficulty;
  roundDurationSeconds: RoundDurationOption;
  startingHealthPercent: StartingHealthOption;
  controlSensitivity: ControlSensitivityOption;

  // Display
  graphicsQuality: GraphicsQualityOption;
  resolutionScaling: boolean;
  fullscreen: boolean;
  screenShake: boolean;
  vfxQuality: VFXQualityOption;
  hudScale: HUDScaleOption;

  // Controls
  keyBindings: KeyBindingsConfig;
  mobileControlSize: MobileControlSizeOption;
  mobileControlOpacity: number; // 40 - 100

  // General
  language: 'English';
}

export const DEFAULT_KEY_BINDINGS: KeyBindingsConfig = {
  moveLeft: 'A',
  moveRight: 'D',
  jump: 'Space',
  crouch: 'S',
  block: 'Shift',
  punch: 'J',
  kick: 'K',
  grab: 'I',
  superShot: 'U',
  superMove: 'L',
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  masterVolume: 75,
  musicVolume: 70,
  sfxVolume: 85,
  muteAll: false,

  cpuDifficulty: 'normal',
  roundDurationSeconds: 60,
  startingHealthPercent: 100,
  controlSensitivity: 'normal',

  graphicsQuality: 'high',
  resolutionScaling: true,
  fullscreen: false,
  screenShake: true,
  vfxQuality: 'high',
  hudScale: 'normal',

  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  mobileControlSize: 'standard',
  mobileControlOpacity: 88,

  language: 'English',
};

export const SETTINGS_STORAGE_KEY = 'filmi_dangal_settings_v2';

type SettingsListener = (settings: GameSettings) => void;

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Validates and sanitizes raw or partial settings data, recovering gracefully
 * from corrupted or outdated `localStorage` values.
 */
export function sanitizeGameSettings(raw: unknown): GameSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_GAME_SETTINGS,
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawBindings =
    obj.keyBindings && typeof obj.keyBindings === 'object'
      ? (obj.keyBindings as Record<string, unknown>)
      : {};

  const sanitizeKey = (key: keyof KeyBindingsConfig): string => {
    const val = rawBindings[key];
    if (typeof val === 'string' && val.trim().length > 0 && val.trim().length <= 16) {
      return val.trim();
    }
    return DEFAULT_KEY_BINDINGS[key];
  };

  const cpuDifficulty: Difficulty =
    obj.cpuDifficulty === 'easy' || obj.cpuDifficulty === 'normal' || obj.cpuDifficulty === 'hard'
      ? obj.cpuDifficulty
      : DEFAULT_GAME_SETTINGS.cpuDifficulty;

  const roundDurationSeconds: RoundDurationOption =
    obj.roundDurationSeconds === 30 ||
    obj.roundDurationSeconds === 60 ||
    obj.roundDurationSeconds === 90
      ? obj.roundDurationSeconds
      : DEFAULT_GAME_SETTINGS.roundDurationSeconds;

  const startingHealthPercent: StartingHealthOption =
    obj.startingHealthPercent === 100 ||
    obj.startingHealthPercent === 125 ||
    obj.startingHealthPercent === 150
      ? obj.startingHealthPercent
      : DEFAULT_GAME_SETTINGS.startingHealthPercent;

  const controlSensitivity: ControlSensitivityOption =
    obj.controlSensitivity === 'low' ||
    obj.controlSensitivity === 'normal' ||
    obj.controlSensitivity === 'high'
      ? obj.controlSensitivity
      : DEFAULT_GAME_SETTINGS.controlSensitivity;

  const graphicsQuality: GraphicsQualityOption =
    obj.graphicsQuality === 'low' ||
    obj.graphicsQuality === 'medium' ||
    obj.graphicsQuality === 'high'
      ? obj.graphicsQuality
      : DEFAULT_GAME_SETTINGS.graphicsQuality;

  const vfxQuality: VFXQualityOption =
    obj.vfxQuality === 'low' || obj.vfxQuality === 'medium' || obj.vfxQuality === 'high'
      ? obj.vfxQuality
      : DEFAULT_GAME_SETTINGS.vfxQuality;

  const hudScale: HUDScaleOption =
    obj.hudScale === 'compact' || obj.hudScale === 'normal' || obj.hudScale === 'large'
      ? obj.hudScale
      : DEFAULT_GAME_SETTINGS.hudScale;

  const mobileControlSize: MobileControlSizeOption =
    obj.mobileControlSize === 'compact' ||
    obj.mobileControlSize === 'standard' ||
    obj.mobileControlSize === 'large'
      ? obj.mobileControlSize
      : DEFAULT_GAME_SETTINGS.mobileControlSize;

  return {
    masterVolume: clampNumber(obj.masterVolume, 0, 100, DEFAULT_GAME_SETTINGS.masterVolume),
    musicVolume: clampNumber(obj.musicVolume, 0, 100, DEFAULT_GAME_SETTINGS.musicVolume),
    sfxVolume: clampNumber(obj.sfxVolume, 0, 100, DEFAULT_GAME_SETTINGS.sfxVolume),
    muteAll: typeof obj.muteAll === 'boolean' ? obj.muteAll : DEFAULT_GAME_SETTINGS.muteAll,

    cpuDifficulty,
    roundDurationSeconds,
    startingHealthPercent,
    controlSensitivity,

    graphicsQuality,
    resolutionScaling:
      typeof obj.resolutionScaling === 'boolean'
        ? obj.resolutionScaling
        : DEFAULT_GAME_SETTINGS.resolutionScaling,
    fullscreen:
      typeof obj.fullscreen === 'boolean' ? obj.fullscreen : DEFAULT_GAME_SETTINGS.fullscreen,
    screenShake:
      typeof obj.screenShake === 'boolean' ? obj.screenShake : DEFAULT_GAME_SETTINGS.screenShake,
    vfxQuality,
    hudScale,

    keyBindings: {
      moveLeft: sanitizeKey('moveLeft'),
      moveRight: sanitizeKey('moveRight'),
      jump: sanitizeKey('jump'),
      crouch: sanitizeKey('crouch'),
      block: sanitizeKey('block'),
      punch: sanitizeKey('punch'),
      kick: sanitizeKey('kick'),
      grab: sanitizeKey('grab'),
      superShot: sanitizeKey('superShot'),
      superMove: sanitizeKey('superMove'),
    },
    mobileControlSize,
    mobileControlOpacity: clampNumber(
      obj.mobileControlOpacity,
      40,
      100,
      DEFAULT_GAME_SETTINGS.mobileControlOpacity
    ),

    language: 'English',
  };
}

/**
 * SettingsManager
 *
 * Persistent player preferences manager for Filmi Dangal (Section 7).
 * Stores settings in `localStorage` and notifies audio, gameplay, display, and UI
 * listeners immediately upon update.
 */
export class SettingsManager {
  private static instance: SettingsManager;
  private settings: GameSettings;
  private listeners: Set<SettingsListener> = new Set();

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private constructor() {
    this.settings = this.loadFromStorage();
  }

  public loadFromStorage(): GameSettings {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        ...DEFAULT_GAME_SETTINGS,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      };
    }

    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return {
          ...DEFAULT_GAME_SETTINGS,
          keyBindings: { ...DEFAULT_KEY_BINDINGS },
        };
      }
      const parsed = JSON.parse(raw);
      return sanitizeGameSettings(parsed);
    } catch (err) {
      console.warn(
        '[SettingsManager] Corrupted settings in localStorage; recovering defaults.',
        err
      );
      return {
        ...DEFAULT_GAME_SETTINGS,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      };
    }
  }

  public saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota errors
    }
  }

  public getSettings(): GameSettings {
    return {
      ...this.settings,
      keyBindings: { ...this.settings.keyBindings },
    };
  }

  public updateSettings(partial: Partial<GameSettings>): GameSettings {
    const merged = sanitizeGameSettings({
      ...this.settings,
      ...partial,
      keyBindings: {
        ...this.settings.keyBindings,
        ...(partial.keyBindings || {}),
      },
    });
    this.settings = merged;
    this.saveToStorage();
    this.notifyListeners();
    return this.getSettings();
  }

  public updateKeyBinding(action: keyof KeyBindingsConfig, keyLabel: string): GameSettings {
    return this.updateSettings({
      keyBindings: {
        ...this.settings.keyBindings,
        [action]: keyLabel,
      },
    });
  }

  public resetControlsToDefault(): GameSettings {
    return this.updateSettings({
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
      mobileControlSize: DEFAULT_GAME_SETTINGS.mobileControlSize,
      mobileControlOpacity: DEFAULT_GAME_SETTINGS.mobileControlOpacity,
    });
  }

  public resetAllToDefaults(): GameSettings {
    this.settings = {
      ...DEFAULT_GAME_SETTINGS,
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
    };
    this.saveToStorage();
    this.notifyListeners();
    return this.getSettings();
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getSettings();
    this.listeners.forEach((l) => l(snapshot));
  }
}
