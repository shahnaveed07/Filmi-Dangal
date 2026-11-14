import React, { useEffect, useState } from 'react';
import {
  Check,
  Gamepad2,
  Maximize2,
  Monitor,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';
import { GameBridge } from '../engine/GameBridge';
import {
  ControlSensitivityOption,
  GameSettings,
  GraphicsQualityOption,
  HUDScaleOption,
  KeyBindingsConfig,
  MobileControlSizeOption,
  MobileControlVisibilityOption,
  RoundDurationOption,
  SettingsManager,
  StartingHealthOption,
  VFXQualityOption,
} from '../engine/SettingsManager';
import { Difficulty, FighterId } from '../types/fighter';
import { ScreenHeader, WindowUtilityControls } from './ui/FightFunUI';

interface SettingsModalProps {
  onClose: () => void;
}

export type SettingsTab = 'audio' | 'gameplay' | 'display' | 'controls';

const KEY_BINDING_LABELS: Array<{ key: keyof KeyBindingsConfig; label: string }> = [
  { key: 'moveLeft', label: 'Move Left (X-Axis)' },
  { key: 'moveRight', label: 'Move Right (X-Axis)' },
  { key: 'jump', label: 'Jump (Y-Axis)' },
  { key: 'crouch', label: 'Crouch' },
  { key: 'block', label: 'Block / Guard' },
  { key: 'punch', label: 'Punch Attack' },
  { key: 'kick', label: 'Kick Attack' },
  { key: 'grab', label: 'Grab (Guard Break)' },
  { key: 'superShot', label: 'SuperShot (25% Meter)' },
  { key: 'superMove', label: 'SuperMove (100% Meter)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const settingsMgr = SettingsManager.getInstance();
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();

  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [settings, setSettings] = useState<GameSettings>(() => settingsMgr.getSettings());
  const [listeningKey, setListeningKey] = useState<keyof KeyBindingsConfig | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    return settingsMgr.subscribe((updated) => {
      setSettings(updated);
    });
  }, [settingsMgr]);

  // Listen for key press when rebinding a keyboard control
  useEffect(() => {
    if (!listeningKey) return;

    const handleRebindKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setListeningKey(null);
        return;
      }

      let prettyKey = e.key;
      if (e.code === 'Space' || e.key === ' ') {
        prettyKey = 'Space';
      } else if (e.key.length === 1) {
        prettyKey = e.key.toUpperCase();
      }

      settingsMgr.updateKeyBinding(listeningKey, prettyKey);
      audio.playSound('click');
      setListeningKey(null);
    };

    window.addEventListener('keydown', handleRebindKey, { capture: true });
    return () => window.removeEventListener('keydown', handleRebindKey, { capture: true });
  }, [listeningKey, settingsMgr, audio]);

  // Allow Escape to close SettingsModal when not capturing a key binding
  useEffect(() => {
    if (listeningKey) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        audio.playSound('click');
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [listeningKey, onClose, audio]);

  const updatePartial = (partial: Partial<GameSettings>) => {
    const next = settingsMgr.updateSettings(partial);
    if (partial.cpuDifficulty) {
      bridge.difficulty = partial.cpuDifficulty;
    }
    setSettings(next);
  };

  const handleToggleFullscreen = () => {
    audio.playSound('click');
    if (typeof document !== 'undefined') {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement
          .requestFullscreen()
          .then(() => updatePartial({ fullscreen: true }))
          .catch(() => updatePartial({ fullscreen: !settings.fullscreen }));
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document
          .exitFullscreen()
          .then(() => updatePartial({ fullscreen: false }))
          .catch(() => updatePartial({ fullscreen: false }));
      } else {
        updatePartial({ fullscreen: !settings.fullscreen });
      }
    }
  };

  const handleResetAll = () => {
    audio.playSound('click');
    const reset = settingsMgr.resetAllToDefaults();
    bridge.difficulty = reset.cpuDifficulty;
    setSettings(reset);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 1800);
  };

  const handleSaveAndClose = () => {
    audio.playSound('click');
    settingsMgr.saveToStorage();
    setSavedBanner(true);
    onClose();
  };

  const testCharacterVoiceSfx = (charId: FighterId) => {
    audio.playCharacterEvent(charId, 'supershot-release');
  };

  const categories = [
    { id: 'audio' as const, label: 'Audio', icon: Volume2 },
    { id: 'gameplay' as const, label: 'Gameplay', icon: Sliders },
    { id: 'display' as const, label: 'Display', icon: Monitor },
    { id: 'controls' as const, label: 'Controls', icon: Gamepad2 },
  ];

  const activeCategoryMeta =
    categories.find((c) => c.id === activeTab) || categories[0];
  const ActiveCategoryIcon = activeCategoryMeta.icon;

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 bg-[#070406]/96 z-50 flex flex-col justify-between px-4 py-3 sm:px-7 sm:py-5 md:px-10 md:py-6 select-none overflow-y-auto overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Game Settings"
    >
      {/* AMBIENT CRIMSON & GOLD GAMING BACKDROP */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 55% 50% at 72% 18%, rgba(220, 38, 38, 0.2) 0%, rgba(245, 158, 11, 0.05) 48%, rgba(7, 4, 6, 0.98) 85%)',
          }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-96 h-96 opacity-25 transform -rotate-45 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(90deg, rgba(220,38,38,0.55) 0px, rgba(220,38,38,0.55) 6px, transparent 6px, transparent 26px)',
          }}
        />
      </div>

      {/* TOP BAR: BACK + FIGHT FUN | SETTINGS + REAL BROWSER & CLOSE CONTROLS */}
      <div className="relative z-20 w-full">
        <ScreenHeader
          title="SETTINGS"
          onBack={() => {
            audio.playSound('click');
            onClose();
          }}
          rightSlot={
            <WindowUtilityControls
              onClose={onClose}
              closeTestId="settings-close-btn"
            />
          }
        />
      </div>

      {/* MAIN 2-COLUMN SETTINGS ARCHITECTURE (SIDEBAR LEFT + ACTIVE PANEL RIGHT) */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto my-auto grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-7 items-stretch py-3 flex-1 max-h-[640px]">
        {/* LEFT SIDEBAR: 4 REAL CATEGORY TABS */}
        <div className="md:col-span-4 lg:col-span-3 bg-[#0B0709]/95 border border-red-600/75 rounded-xl p-3 sm:p-4 shadow-[0_0_30px_rgba(0,0,0,0.9)] flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible">
          {categories.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`settings-tab-${tab.id}`}
                onClick={() => {
                  audio.playSound('click');
                  setActiveTab(tab.id);
                }}
                className={`flex-1 md:flex-none py-3.5 px-4 rounded-xl font-display font-extrabold italic text-sm sm:text-base tracking-wide transition-all flex items-center gap-3.5 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-[#92400E]/95 via-[#B45309]/90 to-[#D97706]/95 text-white border-2 border-[#FEF08A] shadow-[0_0_22px_rgba(245,158,11,0.5)]'
                    : 'bg-transparent hover:bg-white/5 text-zinc-200 border border-transparent hover:border-white/15'
                }`}
              >
                <Icon
                  size={20}
                  className={isActive ? 'text-[#FEF08A]' : 'text-zinc-300'}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* RIGHT PANEL: CATEGORY HEADER + COMPACT HORIZONTAL ROWS + FOOTER */}
        <div className="md:col-span-8 lg:col-span-9 bg-[#0B0709]/95 border border-red-600/75 rounded-xl shadow-[0_0_35px_rgba(0,0,0,0.95)] flex flex-col justify-between overflow-hidden">
          {/* TOP CRIMSON HEADER BAR WITH DIAGONAL ACCENT STRIPES */}
          <div className="bg-gradient-to-r from-[#6B0F18] via-[#38080D] to-[#12080A] border-b border-red-500/60 px-5 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <ActiveCategoryIcon size={22} className="text-white" />
              <h2
                data-testid="settings-active-category-title"
                className="font-display font-black italic text-lg sm:text-xl text-white tracking-wide"
              >
                {activeCategoryMeta.label}
              </h2>
            </div>

            {/* Diagonal Crimson Stripes Matching SettingsScreen.png */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-6 bg-red-600/85 transform -skew-x-25 rounded-[1px]" />
              <span className="w-2.5 h-6 bg-red-600/85 transform -skew-x-25 rounded-[1px]" />
              <span className="w-2.5 h-6 bg-red-600/85 transform -skew-x-25 rounded-[1px]" />
            </div>
          </div>

          {/* SCROLLABLE CATEGORY BODY */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4 divide-y divide-white/10 text-xs sm:text-sm">
            {/* 1. AUDIO TAB */}
            {activeTab === 'audio' && (
              <>
                {/* MUTE ALL AUDIO */}
                <div className="py-3.5 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {settings.muteAll ? (
                      <VolumeX size={20} className="text-red-400 shrink-0" />
                    ) : (
                      <Volume2 size={20} className="text-zinc-300 shrink-0" />
                    )}
                    <div>
                      <div className="font-display font-bold italic text-white text-sm sm:text-base">
                        Mute All Audio
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Silence all music and character sound effects
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="settings-mute-toggle"
                      onClick={() => updatePartial({ muteAll: !settings.muteAll })}
                      className={`px-4 py-1.5 rounded-md font-display font-black italic text-xs uppercase border cursor-pointer transition-all ${
                        settings.muteAll
                          ? 'bg-[#BE123C] text-white border-[#FEF08A]'
                          : 'bg-[#1B1618] text-[#FACC15] border-amber-400/50 hover:border-[#FEF08A]'
                      }`}
                    >
                      {settings.muteAll ? 'MUTED' : 'AUDIO ACTIVE'}
                    </button>
                  </div>
                </div>

                {/* MASTER VOLUME */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label
                    htmlFor="master-volume-slider"
                    className="font-display font-bold italic text-white text-sm sm:text-base min-w-[180px]"
                  >
                    Master Volume
                  </label>
                  <div className="flex items-center gap-3 flex-1 max-w-md">
                    <input
                      id="master-volume-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={settings.masterVolume}
                      onChange={(e) =>
                        updatePartial({
                          masterVolume: Number(e.target.value),
                          muteAll: false,
                        })
                      }
                      className="w-full accent-[#FACC15] cursor-pointer"
                    />
                    <span className="font-mono font-bold text-[#FEF08A] w-12 text-right">
                      {settings.masterVolume}%
                    </span>
                  </div>
                </div>

                {/* MUSIC VOLUME */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label
                    htmlFor="music-volume-slider"
                    className="font-display font-bold italic text-white text-sm sm:text-base min-w-[180px]"
                  >
                    Music Volume (BGM)
                  </label>
                  <div className="flex items-center gap-3 flex-1 max-w-md">
                    <input
                      id="music-volume-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={settings.musicVolume}
                      onChange={(e) =>
                        updatePartial({
                          musicVolume: Number(e.target.value),
                          muteAll: false,
                        })
                      }
                      className="w-full accent-[#FACC15] cursor-pointer"
                    />
                    <span className="font-mono font-bold text-[#FEF08A] w-12 text-right">
                      {settings.musicVolume}%
                    </span>
                  </div>
                </div>

                {/* SFX VOLUME */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label
                    htmlFor="sfx-volume-slider"
                    className="font-display font-bold italic text-white text-sm sm:text-base min-w-[180px]"
                  >
                    SFX &amp; Specials Volume
                  </label>
                  <div className="flex items-center gap-3 flex-1 max-w-md">
                    <input
                      id="sfx-volume-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={settings.sfxVolume}
                      onChange={(e) =>
                        updatePartial({
                          sfxVolume: Number(e.target.value),
                          muteAll: false,
                        })
                      }
                      className="w-full accent-[#FACC15] cursor-pointer"
                    />
                    <span className="font-mono font-bold text-[#FEF08A] w-12 text-right">
                      {settings.sfxVolume}%
                    </span>
                  </div>
                </div>

                {/* PREVIEW CHARACTER SPECIAL AUDIO */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm sm:text-base">
                    Preview Character Audio
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto sm:min-w-[380px]">
                    {(
                      [
                        { id: 'action_sultan', label: 'Bhai Jaan' },
                        { id: 'romance_raja', label: 'Raja' },
                        { id: 'duggu', label: 'Duggu' },
                        { id: 'bhidu', label: 'Bhidu' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => testCharacterVoiceSfx(c.id)}
                        className="py-2 px-3 rounded-md bg-[#1B1618] hover:bg-[#271F22] border border-amber-400/45 hover:border-[#FEF08A] text-[#FEF08A] font-display font-bold italic text-xs uppercase cursor-pointer transition-colors"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 2. GAMEPLAY TAB */}
            {activeTab === 'gameplay' && (
              <>
                {/* CPU DIFFICULTY */}
                <div className="py-4 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm sm:text-base">
                    Default CPU Difficulty
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => {
                      const active = settings.cpuDifficulty === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ cpuDifficulty: d });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ROUND DURATION */}
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm sm:text-base">
                    Round Duration
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {([30, 60, 90] as RoundDurationOption[]).map((sec) => {
                      const active = settings.roundDurationSeconds === sec;
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ roundDurationSeconds: sec });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {sec}s
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STARTING HEALTH */}
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm sm:text-base">
                    Fighter Starting Health
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {([100, 125, 150] as StartingHealthOption[]).map((hp) => {
                      const active = settings.startingHealthPercent === hp;
                      return (
                        <button
                          key={hp}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ startingHealthPercent: hp });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {hp}% HP
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* MOVEMENT SENSITIVITY */}
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm sm:text-base">
                    Movement Sensitivity
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(['low', 'normal', 'high'] as ControlSensitivityOption[]).map(
                      (sens) => {
                        const active = settings.controlSensitivity === sens;
                        return (
                          <button
                            key={sens}
                            type="button"
                            onClick={() => {
                              audio.playSound('click');
                              updatePartial({ controlSensitivity: sens });
                            }}
                            className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                              active
                                ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                                : 'text-zinc-200 hover:text-white'
                            }`}
                          >
                            {sens}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 3. DISPLAY TAB (STYLED AFTER SETTINGSSCREEN.PNG) */}
            {activeTab === 'display' && (
              <>
                {/* GRAPHICS QUALITY */}
                <div className="py-3.5 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Sliders size={18} className="text-zinc-300 shrink-0" />
                    <span className="font-display font-bold italic text-white text-sm sm:text-base">
                      Graphics Quality
                    </span>
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(['low', 'medium', 'high'] as GraphicsQualityOption[]).map((q) => {
                      const active = settings.graphicsQuality === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ graphicsQuality: q });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* VFX PARTICLE DENSITY */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Sparkles size={18} className="text-zinc-300 shrink-0" />
                    <span className="font-display font-bold italic text-white text-sm sm:text-base">
                      VFX Particle Density
                    </span>
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(['low', 'medium', 'high'] as VFXQualityOption[]).map((v) => {
                      const active = settings.vfxQuality === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ vfxQuality: v });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* HUD INTERFACE SCALE */}
                <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Monitor size={18} className="text-zinc-300 shrink-0" />
                    <span className="font-display font-bold italic text-white text-sm sm:text-base">
                      HUD Interface Scale
                    </span>
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(['compact', 'normal', 'large'] as HUDScaleOption[]).map((sc) => {
                      const active = settings.hudScale === sc;
                      return (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ hudScale: sc });
                          }}
                          className={`py-2 rounded-md font-display font-black italic text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_14px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {sc}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* CAMERA SCREEN SHAKE */}
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-bold italic text-white text-sm sm:text-base">
                      Camera Screen Shake
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Cinematic camera impact shake during heavy hits and SuperMoves
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.screenShake}
                    onClick={() => {
                      audio.playSound('click');
                      updatePartial({ screenShake: !settings.screenShake });
                    }}
                    className={`w-14 h-7 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                      settings.screenShake
                        ? 'bg-gradient-to-r from-[#FACC15] to-[#F59E0B] justify-end shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                        : 'bg-zinc-700 justify-start'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white shadow" />
                  </button>
                </div>

                {/* RESOLUTION-AWARE DPI SCALING */}
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-bold italic text-white text-sm sm:text-base">
                      Resolution-Aware DPI Scaling
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Automatically match native device pixel ratio on high-DPI displays
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.resolutionScaling}
                    onClick={() => {
                      audio.playSound('click');
                      updatePartial({
                        resolutionScaling: !settings.resolutionScaling,
                      });
                    }}
                    className={`w-14 h-7 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                      settings.resolutionScaling
                        ? 'bg-gradient-to-r from-[#FACC15] to-[#F59E0B] justify-end shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                        : 'bg-zinc-700 justify-start'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white shadow" />
                  </button>
                </div>

                {/* FULLSCREEN DISPLAY */}
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Maximize2 size={18} className="text-zinc-300 shrink-0" />
                    <span className="font-display font-bold italic text-white text-sm sm:text-base">
                      Fullscreen
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="settings-fullscreen-toggle"
                    role="switch"
                    aria-checked={settings.fullscreen}
                    onClick={handleToggleFullscreen}
                    className={`w-14 h-7 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                      settings.fullscreen
                        ? 'bg-gradient-to-r from-[#FACC15] to-[#F59E0B] justify-end shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                        : 'bg-zinc-700 justify-start'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white shadow" />
                  </button>
                </div>
              </>
            )}

            {/* 4. CONTROLS TAB */}
            {activeTab === 'controls' && (
              <>
                {/* TOUCH CONTROLS VISIBILITY */}
                <div className="py-3 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm">
                    Touch Controls Visibility
                  </div>
                  <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full sm:w-[390px]">
                    {(
                      [
                        { id: 'auto', label: 'Auto' },
                        { id: 'always', label: 'Always On' },
                        { id: 'off', label: 'Hidden' },
                      ] as Array<{ id: MobileControlVisibilityOption; label: string }>
                    ).map((opt) => {
                      const active = settings.mobileControlVisibility === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`touch-visibility-${opt.id}`}
                          onClick={() => {
                            audio.playSound('click');
                            updatePartial({ mobileControlVisibility: opt.id });
                          }}
                          className={`py-1.5 rounded-md font-display font-black italic text-xs transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                              : 'text-zinc-200 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* MOBILE TOUCH OVERLAY SIZE & OPACITY */}
                <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-display font-bold italic text-white text-sm">
                    Touch Button Size &amp; Opacity ({settings.mobileControlOpacity}%)
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-[390px]">
                    <div className="grid grid-cols-3 bg-[#1B1618] rounded-lg p-1 border border-white/10 w-full">
                      {(['compact', 'standard', 'large'] as MobileControlSizeOption[]).map(
                        (sz) => {
                          const active = settings.mobileControlSize === sz;
                          return (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => {
                                audio.playSound('click');
                                updatePartial({ mobileControlSize: sz });
                              }}
                              className={`py-1.5 rounded-md font-display font-black italic text-xs capitalize transition-all cursor-pointer ${
                                active
                                  ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] text-black'
                                  : 'text-zinc-200 hover:text-white'
                              }`}
                            >
                              {sz}
                            </button>
                          );
                        }
                      )}
                    </div>
                    <input
                      id="mobile-opacity-slider"
                      type="range"
                      min={40}
                      max={100}
                      value={settings.mobileControlOpacity}
                      onChange={(e) =>
                        updatePartial({
                          mobileControlOpacity: Number(e.target.value),
                        })
                      }
                      aria-label="Mobile Button Opacity"
                      className="w-full sm:w-28 accent-[#FACC15] cursor-pointer"
                    />
                  </div>
                </div>

                {/* KEYBOARD REBINDING */}
                <div className="py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="font-display font-bold italic text-white text-sm">
                      Keyboard Bindings (Click to Rebind)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        settingsMgr.resetControlsToDefault();
                      }}
                      className="px-3 py-1 rounded bg-[#1B1618] hover:bg-[#271F22] text-[#FEF08A] border border-amber-400/50 text-xs font-display font-bold italic uppercase cursor-pointer"
                    >
                      Reset Keys
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {KEY_BINDING_LABELS.map((item) => {
                      const isListening = listeningKey === item.key;
                      const currentVal = settings.keyBindings[item.key];
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between bg-[#140E11] px-3 py-1.5 rounded-md border border-white/10"
                        >
                          <span className="text-xs text-zinc-200 font-medium">
                            {item.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              audio.playSound('click');
                              setListeningKey(isListening ? null : item.key);
                            }}
                            className={`px-3 py-0.5 rounded font-mono font-bold text-xs border cursor-pointer min-w-[72px] text-center ${
                              isListening
                                ? 'bg-[#FACC15] text-black border-white animate-pulse'
                                : 'bg-[#1F171B] text-[#FEF08A] border-amber-400/45 hover:border-[#FEF08A]'
                            }`}
                          >
                            {isListening ? 'PRESS KEY...' : currentVal}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* BOTTOM FOOTER: RESET ON LEFT, APPLY / SAVE & CLOSE ON RIGHT */}
          <div className="px-5 sm:px-7 py-4 border-t border-white/10 bg-[#090507]/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              data-testid="settings-reset-btn"
              onClick={handleResetAll}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#1A1518] hover:bg-[#261E22] text-white border border-white/25 hover:border-amber-400 font-display font-bold italic text-xs sm:text-sm transform -skew-x-12 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span className="transform skew-x-12 flex items-center gap-2">
                <RotateCcw size={16} />
                <span>RESET ALL TO DEFAULTS</span>
              </span>
            </button>

            {savedBanner && (
              <span className="text-xs font-mono text-[#4ADE80] flex items-center gap-1">
                <Check size={14} /> Preferences Saved
              </span>
            )}

            <button
              type="button"
              data-testid="settings-save-btn"
              onClick={handleSaveAndClose}
              className="w-full sm:w-auto px-8 py-2.5 rounded-lg bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] hover:brightness-110 text-black font-display font-black italic text-sm sm:text-base border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(250,204,21,0.5)] transform -skew-x-12 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span className="transform skew-x-12 flex items-center gap-2">
                <Check size={18} strokeWidth={3} />
                <span>SAVE &amp; CLOSE</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="h-1 shrink-0" />
    </div>
  );
};
