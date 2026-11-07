import {
  ALL_CHARACTER_AUDIO_EVENTS,
  CHARACTER_AUDIO_MANIFEST,
  CharacterAudioEventId,
  getCharacterAudioEventConfig,
  ProceduralAudioSynthProfile,
} from '../config/audioAssets';
import { CHARACTER_LIST } from '../data/characters';
import { FighterId } from '../types/fighter';
import { SettingsManager } from './SettingsManager';

/**
 * AudioManager
 *
 * Production-ready, manifest-driven audio system for Filmi Dangal.
 * Supports:
 * - Separate Master Volume, Music Volume, SFX Volume, and Master Mute
 * - Per-character SuperShot and SuperMove audio events (`supershot-charge`,
 *   `supershot-release`, `supershot-impact`, `supermove-charge`, `supermove-impact`,
 *   `normal-attack`, `hit-react`, `victory`, `defeat`)
 * - Audio buffer preloading/caching for external `.ogg` or `.mp3` files
 * - Missing-file detection with one-time clear development warning + multi-layer character-specific
 *   Web Audio procedural synthesis fallback (`isTemporaryPlaceholder: true`) when external audio files
 *   are not yet on disk
 */
export class AudioManager {
  private static instance: AudioManager;
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public isBgmEnabled: boolean = true;
  public masterVolume: number = 0.75;
  public musicVolume: number = 0.7;
  public sfxVolume: number = 0.85;

  private isBgmPlaying: boolean = false;
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;
  private muteListeners: Set<(isMuted: boolean) => void> = new Set();

  // Cached decoded AudioBuffers for external character/common audio files
  private decodedBufferCache: Map<string, AudioBuffer> = new Map();
  private missingAudioPaths: Set<string> = new Set();
  private warnedAudioPaths: Set<string> = new Set();

  // Diagnostics tracking for unit tests & runtime verification
  private lastPlayedEvents: Array<{
    characterId: FighterId;
    eventId: CharacterAudioEventId;
    signatureId: string;
    isTemporaryPlaceholder: boolean;
  }> = [];

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private constructor() {
    const settingsMgr = SettingsManager.getInstance();
    this.applySettings(settingsMgr.getSettings());
    settingsMgr.subscribe((s) => this.applySettings(s));
  }

  private applySettings(s: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    muteAll: boolean;
  }): void {
    const prevMuted = this.isMuted;
    this.masterVolume = Math.max(0, Math.min(1, s.masterVolume / 100));
    this.musicVolume = Math.max(0, Math.min(1, s.musicVolume / 100));
    this.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume / 100));
    this.isMuted = s.muteAll;
    this.isBgmEnabled = this.musicVolume > 0.001;

    if (this.isMuted || !this.isBgmEnabled) {
      this.stopBgm();
    }

    if (prevMuted !== this.isMuted) {
      this.muteListeners.forEach((l) => l(this.isMuted));
    }
  }

  private initContext(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getEffectiveSfxGain(baseGain = 1.0): number {
    if (this.isMuted) return 0;
    return Math.max(0, Math.min(1, baseGain * this.masterVolume * this.sfxVolume));
  }

  private getEffectiveMusicGain(baseGain = 1.0): number {
    if (this.isMuted || !this.isBgmEnabled) return 0;
    return Math.max(0, Math.min(1, baseGain * this.masterVolume * this.musicVolume));
  }

  private logMissingAudioOnce(filePath: string, characterId: FighterId, eventId: string): void {
    this.missingAudioPaths.add(filePath);
    if (!this.warnedAudioPaths.has(filePath)) {
      this.warnedAudioPaths.add(filePath);
      console.warn(
        `[AudioManager] External audio file not found at "${filePath}" for (${characterId}, ${eventId}). Using character-specific temporary synthesized SFX until production .ogg/.mp3 is added.`
      );
    }
  }

  public getLastPlayedCharacterEvents(): ReadonlyArray<{
    characterId: FighterId;
    eventId: CharacterAudioEventId;
    signatureId: string;
    isTemporaryPlaceholder: boolean;
  }> {
    return this.lastPlayedEvents;
  }

  public clearPlayedEventsHistory(): void {
    this.lastPlayedEvents = [];
  }

  /**
   * Preloads character audio files (`.ogg` or `.mp3`) from `CHARACTER_AUDIO_MANIFEST` if present in `public/assets/audio/`.
   * Gracefully records missing paths without crashing when external files are not yet added.
   */
  public async preloadCharacterAudio(characterId?: FighterId): Promise<{
    loaded: string[];
    missing: string[];
  }> {
    const loaded: string[] = [];
    const missing: string[] = [];
    const targetIds: FighterId[] = characterId
      ? [characterId]
      : CHARACTER_LIST.map((c) => c.id);

    for (const cId of targetIds) {
      const charEvents = CHARACTER_AUDIO_MANIFEST[cId];
      for (const evtId of ALL_CHARACTER_AUDIO_EVENTS) {
        const cfg = charEvents[evtId];
        if (!cfg) continue;

        if (this.decodedBufferCache.has(cfg.filePath)) {
          loaded.push(cfg.filePath);
          continue;
        }
        if (this.missingAudioPaths.has(cfg.filePath)) {
          missing.push(cfg.filePath);
          continue;
        }

        if (typeof window === 'undefined' || typeof fetch === 'undefined') {
          this.missingAudioPaths.add(cfg.filePath);
          missing.push(cfg.filePath);
          continue;
        }

        let loadedBuffer = false;
        for (const candidateUrl of [cfg.filePath, cfg.mp3FallbackPath]) {
          try {
            const resp = await fetch(candidateUrl, { method: 'GET' });
            const contentType = resp.headers.get('content-type') || '';
            if (!resp.ok || contentType.includes('text/html')) {
              continue;
            }
            const arrayBuffer = await resp.arrayBuffer();
            this.initContext();
            if (this.ctx) {
              const audioBuf = await this.ctx.decodeAudioData(arrayBuffer);
              this.decodedBufferCache.set(cfg.filePath, audioBuf);
              loaded.push(candidateUrl);
              loadedBuffer = true;
              break;
            }
          } catch {
            // Try next candidate
          }
        }

        if (!loadedBuffer) {
          this.logMissingAudioOnce(cfg.filePath, cId, evtId);
          missing.push(cfg.filePath);
        }
      }
    }

    return { loaded, missing };
  }

  /**
   * Plays a character-specific audio event (`supershot-charge`, `supershot-release`,
   * `supershot-impact`, `supermove-charge`, `supermove-impact`, `normal-attack`,
   * `hit-react`, `victory`, `defeat`).
   * If an external decoded AudioBuffer is cached, plays it; otherwise synthesizes
   * the character's distinct multi-layer fallback profile.
   */
  public playCharacterEvent(characterId: FighterId, eventId: CharacterAudioEventId): void {
    const cfg = getCharacterAudioEventConfig(characterId, eventId);
    if (!cfg) return;

    const cachedBuffer = this.decodedBufferCache.get(cfg.filePath);
    this.lastPlayedEvents.push({
      characterId,
      eventId,
      signatureId: cfg.fallbackSynth.signatureId,
      isTemporaryPlaceholder: !cachedBuffer && cfg.isTemporaryPlaceholder,
    });
    if (this.lastPlayedEvents.length > 64) {
      this.lastPlayedEvents.shift();
    }

    if (this.isMuted) return;

    this.initContext();
    if (!this.ctx) return;

    if (cachedBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        source.buffer = cachedBuffer;
        gain.gain.setValueAtTime(
          this.getEffectiveSfxGain(cfg.fallbackSynth.gainLevel),
          this.ctx.currentTime
        );
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        return;
      } catch {
        // Fallback to procedural synth below
      }
    } else if (!this.warnedAudioPaths.has(cfg.filePath)) {
      this.logMissingAudioOnce(cfg.filePath, characterId, eventId);
    }

    this.synthesizeCharacterProfile(cfg.fallbackSynth);
  }

  private synthesizeCharacterProfile(profile: ProceduralAudioSynthProfile): void {
    if (!this.ctx || this.isMuted) return;
    const effectiveGain = this.getEffectiveSfxGain(profile.gainLevel);
    if (effectiveGain <= 0.001) return;

    try {
      const baseTime = this.ctx.currentTime;

      if (profile.layers && profile.layers.length > 0) {
        for (const layer of profile.layers) {
          const t = baseTime + Math.max(0, layer.delaySec);
          const dur = Math.max(0.03, layer.durationSec);
          const layerGainVal = this.getEffectiveSfxGain(layer.gainLevel);
          if (layerGainVal <= 0.001) continue;

          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = layer.waveform;
          osc.frequency.setValueAtTime(Math.max(20, layer.startFreqHz), t);
          if (layer.midFreqHz !== undefined) {
            osc.frequency.linearRampToValueAtTime(
              Math.max(20, layer.midFreqHz),
              t + dur * 0.45
            );
          }
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(20, layer.endFreqHz),
            t + dur
          );
          gain.gain.setValueAtTime(layerGainVal, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + dur);
        }
        return;
      }

      const dur = Math.max(0.05, profile.durationSec);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = profile.waveform;
      osc.frequency.setValueAtTime(Math.max(20, profile.startFreqHz), baseTime);

      if (profile.midFreqHz !== undefined) {
        osc.frequency.linearRampToValueAtTime(
          Math.max(20, profile.midFreqHz),
          baseTime + dur * 0.42
        );
      }
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, profile.endFreqHz),
        baseTime + dur
      );

      gain.gain.setValueAtTime(effectiveGain, baseTime);
      gain.gain.exponentialRampToValueAtTime(0.001, baseTime + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(baseTime);
      osc.stop(baseTime + dur);

      if (profile.harmonicRatio && profile.harmonicRatio > 0) {
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(
          Math.max(20, profile.startFreqHz * profile.harmonicRatio),
          baseTime
        );
        subOsc.frequency.exponentialRampToValueAtTime(
          Math.max(20, profile.endFreqHz * profile.harmonicRatio),
          baseTime + dur
        );
        subGain.gain.setValueAtTime(effectiveGain * 0.35, baseTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, baseTime + dur);
        subOsc.connect(subGain);
        subGain.connect(this.ctx.destination);
        subOsc.start(baseTime);
        subOsc.stop(baseTime + dur);
      }
    } catch {
      // Ignore Web Audio autoplay or context disposal exceptions
    }
  }

  public subscribeMute(listener: (isMuted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  public toggleMute(): boolean {
    const nextMuted = !this.isMuted;
    SettingsManager.getInstance().updateSettings({ muteAll: nextMuted });
    return this.isMuted;
  }

  public toggleBgm(): boolean {
    this.isBgmEnabled = !this.isBgmEnabled;
    const nextMusicVol = this.isBgmEnabled ? 70 : 0;
    SettingsManager.getInstance().updateSettings({ musicVolume: nextMusicVol });
    if (!this.isBgmEnabled) {
      this.stopBgm();
    } else if (!this.isMuted) {
      this.startBgm();
    }
    return this.isBgmEnabled;
  }

  public setMasterVolume(percent: number): void {
    SettingsManager.getInstance().updateSettings({
      masterVolume: Math.max(0, Math.min(100, Math.round(percent))),
    });
  }

  public setMusicVolume(percent: number): void {
    SettingsManager.getInstance().updateSettings({
      musicVolume: Math.max(0, Math.min(100, Math.round(percent))),
    });
  }

  public setSfxVolume(percent: number): void {
    SettingsManager.getInstance().updateSettings({
      sfxVolume: Math.max(0, Math.min(100, Math.round(percent))),
    });
  }

  public playSound(
    type:
      | 'punch'
      | 'kick'
      | 'dishoom'
      | 'block'
      | 'whoosh'
      | 'super'
      | 'ko'
      | 'round'
      | 'fight'
      | 'click'
  ): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const sfxScale = this.masterVolume * this.sfxVolume;
    if (sfxScale <= 0.001) return;

    const t = this.ctx.currentTime;

    try {
      switch (type) {
        case 'click': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
          gain.gain.setValueAtTime(0.2 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.05);
          break;
        }

        case 'whoosh': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
          gain.gain.setValueAtTime(0.25 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }

        case 'punch': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
          gain.gain.setValueAtTime(0.5 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }

        case 'kick': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
          gain.gain.setValueAtTime(0.65 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.18);
          break;
        }

        case 'dishoom': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
          gain.gain.setValueAtTime(0.85 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.35);
          break;
        }

        case 'block': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.08);
          gain.gain.setValueAtTime(0.35 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.09);
          break;
        }

        case 'super': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.linearRampToValueAtTime(950, t + 0.3);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.6);
          gain.gain.setValueAtTime(0.7 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.6);
          break;
        }

        case 'fight': {
          const freqs = [330, 440, 554, 659];
          freqs.forEach((f, idx) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t + idx * 0.07);
            gain.gain.setValueAtTime(0.25 * sfxScale, t + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.07 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t + idx * 0.07);
            osc.stop(t + idx * 0.07 + 0.2);
          });
          break;
        }

        case 'ko': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
          gain.gain.setValueAtTime(0.9 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.8);
          break;
        }

        case 'round': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t);
          gain.gain.setValueAtTime(0.3 * sfxScale, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.25);
          break;
        }
      }
    } catch {
      // Ignore Web Audio autoplay or context disposal exceptions
    }
  }

  /**
   * Procedural Bollywood 90s arcade fighting battle theme respecting Master * Music Volume.
   */
  public startBgm(): void {
    if (this.isMuted || !this.isBgmEnabled || this.getEffectiveMusicGain(1) <= 0.001) return;
    this.stopBgm();
    this.initContext();
    if (!this.ctx) return;

    this.isBgmPlaying = true;
    let step = 0;
    const bassNotes = [110, 110, 146.83, 110, 130.81, 110, 164.81, 146.83];
    const melodyNotes = [440, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 440];

    this.bgmIntervalId = setInterval(() => {
      const musicScale = this.getEffectiveMusicGain(1);
      if (this.isMuted || !this.isBgmEnabled || !this.ctx || musicScale <= 0.001) return;
      try {
        const t = this.ctx.currentTime;

        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(step % 2 === 0 ? 120 : 90, t);
        kickOsc.frequency.exponentialRampToValueAtTime(35, t + 0.1);
        kickGain.gain.setValueAtTime(0.3 * musicScale, t);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        kickOsc.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kickOsc.start(t);
        kickOsc.stop(t + 0.1);

        const bassNote = bassNotes[step % bassNotes.length];
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(bassNote / 2, t);
        bassGain.gain.setValueAtTime(0.12 * musicScale, t);
        bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        bassOsc.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bassOsc.start(t);
        bassOsc.stop(t + 0.15);

        if (step % 2 === 0) {
          const melNote = melodyNotes[(step / 2) % melodyNotes.length];
          const melOsc = this.ctx.createOscillator();
          const melGain = this.ctx.createGain();
          melOsc.type = 'square';
          melOsc.frequency.setValueAtTime(melNote, t);
          melGain.gain.setValueAtTime(0.08 * musicScale, t);
          melGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          melOsc.connect(melGain);
          melGain.connect(this.ctx.destination);
          melOsc.start(t);
          melOsc.stop(t + 0.22);
        }

        step++;
      } catch {
        // Ignore audio errors
      }
    }, 180);
  }

  public stopBgm(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.isBgmPlaying = false;
  }
}
