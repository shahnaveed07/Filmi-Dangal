import React, { useEffect, useState } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Sliders,
  Monitor,
  Gamepad2,
  RotateCcw,
  Check,
  Maximize2,
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
  RoundDurationOption,
  SettingsManager,
  StartingHealthOption,
  VFXQualityOption,
} from '../engine/SettingsManager';
import { Difficulty, FighterId } from '../types/fighter';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'audio' | 'gameplay' | 'display' | 'controls';

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

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Game Settings"
    >
      <div className="w-full max-w-2xl bg-[#161424] border-2 border-[#D6A447] rounded-xl p-3.5 sm:p-6 shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-2.5 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={20} className="text-[#F59E0B]" />
            <h2 className="font-['Bungee'] text-lg sm:text-2xl text-[#FEF08A] tracking-wider">
              GAME SETTINGS
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/50 border border-[#D6A447]/40 text-[#D6A447]">
              LANG: {settings.language}
            </span>
            <button
              onClick={() => {
                audio.playSound('click');
                onClose();
              }}
              className="p-1.5 text-[#D6A447] hover:text-white rounded bg-black/40 border border-[#D6A447]/40 cursor-pointer"
              aria-label="Close Settings"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* CATEGORY TABS */}
        <div className="grid grid-cols-4 gap-1.5 mb-3 shrink-0">
          {(
            [
              { id: 'audio', label: 'Audio', icon: Volume2 },
              { id: 'gameplay', label: 'Gameplay', icon: Sliders },
              { id: 'display', label: 'Display', icon: Monitor },
              { id: 'controls', label: 'Controls', icon: Gamepad2 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  audio.playSound('click');
                  setActiveTab(tab.id);
                }}
                className={`py-2 px-2 rounded font-['Cinzel'] font-black text-[11px] sm:text-xs uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A] shadow-[0_0_12px_rgba(190,18,60,0.5)]'
                    : 'bg-black/40 text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* SCROLLABLE TAB BODY */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 text-xs">
          {/* 1. AUDIO TAB */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              {/* MASTER MUTE */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-['Cinzel'] font-bold text-xs sm:text-sm text-[#FEF08A]">
                    MUTE ALL AUDIO
                  </div>
                  <div className="text-[11px] text-white/60">
                    Silence all music and character sound effects
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updatePartial({ muteAll: !settings.muteAll });
                  }}
                  className={`px-3.5 py-1.5 rounded font-['Rajdhani'] font-black text-xs uppercase border flex items-center gap-1.5 cursor-pointer ${
                    settings.muteAll
                      ? 'bg-[#BE123C] text-white border-[#FEF08A]'
                      : 'bg-[#14532D] text-[#FEF08A] border-[#22C55E]'
                  }`}
                >
                  {settings.muteAll ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  <span>{settings.muteAll ? 'MUTED' : 'AUDIO ACTIVE'}</span>
                </button>
              </div>

              {/* VOLUME SLIDERS */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3.5 space-y-3">
                <div>
                  <div className="flex justify-between font-['Cinzel'] font-bold text-[#D6A447] mb-1">
                    <label htmlFor="master-volume-slider">MASTER VOLUME</label>
                    <span className="font-mono text-[#FEF08A]">{settings.masterVolume}%</span>
                  </div>
                  <input
                    id="master-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={settings.masterVolume}
                    onChange={(e) =>
                      updatePartial({ masterVolume: Number(e.target.value), muteAll: false })
                    }
                    className="w-full accent-[#F59E0B] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-['Cinzel'] font-bold text-[#D6A447] mb-1">
                    <label htmlFor="music-volume-slider">MUSIC VOLUME (BGM)</label>
                    <span className="font-mono text-[#FEF08A]">{settings.musicVolume}%</span>
                  </div>
                  <input
                    id="music-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={settings.musicVolume}
                    onChange={(e) =>
                      updatePartial({ musicVolume: Number(e.target.value), muteAll: false })
                    }
                    className="w-full accent-[#F59E0B] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-['Cinzel'] font-bold text-[#D6A447] mb-1">
                    <label htmlFor="sfx-volume-slider">SFX &amp; SPECIALS VOLUME</label>
                    <span className="font-mono text-[#FEF08A]">{settings.sfxVolume}%</span>
                  </div>
                  <input
                    id="sfx-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={settings.sfxVolume}
                    onChange={(e) =>
                      updatePartial({ sfxVolume: Number(e.target.value), muteAll: false })
                    }
                    className="w-full accent-[#F59E0B] cursor-pointer"
                  />
                </div>
              </div>

              {/* CHARACTER SFX PREVIEW */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  PREVIEW CHARACTER SPECIAL AUDIO
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'action_sultan', label: 'Sultan' },
                      { id: 'romance_raja', label: 'Raja' },
                      { id: 'duggu', label: 'Duggu' },
                      { id: 'bhidu', label: 'Bhidu' },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => testCharacterVoiceSfx(c.id)}
                      className="py-1.5 px-2 rounded bg-[#1A1829] hover:bg-[#25203B] border border-[#D6A447]/50 text-[#FEF08A] font-['Rajdhani'] font-bold uppercase cursor-pointer"
                    >
                      Test {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. GAMEPLAY TAB */}
          {activeTab === 'gameplay' && (
            <div className="space-y-3">
              {/* CPU DIFFICULTY */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  DEFAULT CPU DIFFICULTY
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ cpuDifficulty: d });
                      }}
                      className={`py-2 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                        settings.cpuDifficulty === d
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* ROUND DURATION */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  ROUND DURATION (SECONDS)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([30, 60, 90] as RoundDurationOption[]).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ roundDurationSeconds: sec });
                      }}
                      className={`py-2 rounded font-mono font-bold text-xs border cursor-pointer ${
                        settings.roundDurationSeconds === sec
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                      }`}
                    >
                      {sec} SECONDS
                    </button>
                  ))}
                </div>
              </div>

              {/* STARTING HEALTH */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  FIGHTER STARTING HEALTH
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([100, 125, 150] as StartingHealthOption[]).map((hp) => (
                    <button
                      key={hp}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ startingHealthPercent: hp });
                      }}
                      className={`py-2 rounded font-mono font-bold text-xs border cursor-pointer ${
                        settings.startingHealthPercent === hp
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                      }`}
                    >
                      {hp}% HP
                    </button>
                  ))}
                </div>
              </div>

              {/* CONTROL SENSITIVITY */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  MOVEMENT RESPONSIVENESS / SENSITIVITY
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'normal', 'high'] as ControlSensitivityOption[]).map((sens) => (
                    <button
                      key={sens}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ controlSensitivity: sens });
                      }}
                      className={`py-2 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                        settings.controlSensitivity === sens
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                      }`}
                    >
                      {sens}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. DISPLAY TAB */}
          {activeTab === 'display' && (
            <div className="space-y-3">
              {/* GRAPHICS QUALITY PRESET */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                  3D GRAPHICS QUALITY PRESET
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as GraphicsQualityOption[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ graphicsQuality: q });
                      }}
                      className={`py-2 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                        settings.graphicsQuality === q
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30 hover:border-[#D6A447]'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* VFX QUALITY & HUD SCALE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                  <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                    VFX PARTICLE DENSITY
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['low', 'medium', 'high'] as VFXQualityOption[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          audio.playSound('click');
                          updatePartial({ vfxQuality: v });
                        }}
                        className={`py-1.5 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                          settings.vfxQuality === v
                            ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                            : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                  <div className="font-['Cinzel'] font-bold text-[#D6A447] mb-2 uppercase">
                    HUD INTERFACE SCALE
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['compact', 'normal', 'large'] as HUDScaleOption[]).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => {
                          audio.playSound('click');
                          updatePartial({ hudScale: sc });
                        }}
                        className={`py-1.5 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                          settings.hudScale === sc
                            ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                            : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30'
                        }`}
                      >
                        {sc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* TOGGLES: RESOLUTION SCALING, SCREEN SHAKE, FULLSCREEN */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-['Cinzel'] font-bold text-[#FEF08A]">
                      CAMERA SCREEN SHAKE
                    </div>
                    <div className="text-[11px] text-white/60">
                      Cinematic camera impact shake during heavy hits and SuperMoves
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      audio.playSound('click');
                      updatePartial({ screenShake: !settings.screenShake });
                    }}
                    className={`px-3 py-1 rounded font-mono font-bold text-xs border cursor-pointer ${
                      settings.screenShake
                        ? 'bg-[#14532D] text-[#FEF08A] border-[#22C55E]'
                        : 'bg-[#10111B] text-white/60 border-white/20'
                    }`}
                  >
                    {settings.screenShake ? 'ENABLED' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                  <div>
                    <div className="font-['Cinzel'] font-bold text-[#FEF08A]">
                      RESOLUTION-AWARE DPI SCALING
                    </div>
                    <div className="text-[11px] text-white/60">
                      Automatically match native device pixel ratio on high-DPI displays
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      audio.playSound('click');
                      updatePartial({ resolutionScaling: !settings.resolutionScaling });
                    }}
                    className={`px-3 py-1 rounded font-mono font-bold text-xs border cursor-pointer ${
                      settings.resolutionScaling
                        ? 'bg-[#14532D] text-[#FEF08A] border-[#22C55E]'
                        : 'bg-[#10111B] text-white/60 border-white/20'
                    }`}
                  >
                    {settings.resolutionScaling ? 'ENABLED' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                  <div>
                    <div className="font-['Cinzel'] font-bold text-[#FEF08A]">
                      FULLSCREEN DISPLAY
                    </div>
                    <div className="text-[11px] text-white/60">
                      Expand arcade viewport to fill the entire screen
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="px-3 py-1 rounded bg-[#1A1829] hover:bg-[#25203B] text-[#FEF08A] border border-[#D6A447] font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Maximize2 size={12} />
                    <span>{settings.fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. CONTROLS TAB */}
          {activeTab === 'controls' && (
            <div className="space-y-3">
              {/* MOBILE TOUCH CONTROLS SIZE & OPACITY */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3 space-y-2.5">
                <div className="font-['Cinzel'] font-bold text-[#D6A447] uppercase">
                  MOBILE TOUCH OVERLAY LAYOUT
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['compact', 'standard', 'large'] as MobileControlSizeOption[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        audio.playSound('click');
                        updatePartial({ mobileControlSize: sz });
                      }}
                      className={`py-1.5 rounded font-['Rajdhani'] font-black text-xs uppercase border cursor-pointer ${
                        settings.mobileControlSize === sz
                          ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                          : 'bg-[#10111B] text-[#D6A447] border-[#D6A447]/30'
                      }`}
                    >
                      {sz} SIZE
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex justify-between font-['Cinzel'] font-bold text-[#D6A447] mb-1">
                    <label htmlFor="mobile-opacity-slider">MOBILE BUTTON OPACITY</label>
                    <span className="font-mono text-[#FEF08A]">
                      {settings.mobileControlOpacity}%
                    </span>
                  </div>
                  <input
                    id="mobile-opacity-slider"
                    type="range"
                    min={40}
                    max={100}
                    value={settings.mobileControlOpacity}
                    onChange={(e) =>
                      updatePartial({ mobileControlOpacity: Number(e.target.value) })
                    }
                    className="w-full accent-[#F59E0B] cursor-pointer"
                  />
                </div>
              </div>

              {/* KEYBOARD REBINDING */}
              <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-['Cinzel'] font-bold text-[#D6A447] uppercase">
                    KEYBOARD BINDINGS (CLICK TO REBIND)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      audio.playSound('click');
                      settingsMgr.resetControlsToDefault();
                    }}
                    className="px-2 py-0.5 rounded bg-[#1A1829] hover:bg-[#25203B] text-[#FEF08A] border border-[#D6A447]/50 text-[10px] font-mono uppercase cursor-pointer"
                  >
                    Reset Keys
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {KEY_BINDING_LABELS.map((item) => {
                    const isListening = listeningKey === item.key;
                    const currentVal = settings.keyBindings[item.key];
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between bg-[#10111B] px-2.5 py-1.5 rounded border border-white/10"
                      >
                        <span className="text-[11px] text-[#F1E7D0]/90 font-semibold">
                          {item.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            audio.playSound('click');
                            setListeningKey(isListening ? null : item.key);
                          }}
                          className={`px-2.5 py-0.5 rounded font-mono font-bold text-[11px] border cursor-pointer min-w-[68px] text-center ${
                            isListening
                              ? 'bg-[#F59E0B] text-black border-white animate-pulse'
                              : 'bg-[#1A1829] text-[#FDE047] border-[#D6A447]/50 hover:border-[#FEF08A]'
                          }`}
                        >
                          {isListening ? 'PRESS KEY...' : currentVal}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="mt-3 pt-3 border-t border-[#D6A447]/30 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetAll}
            className="w-full sm:w-auto px-3.5 py-2.5 rounded bg-black/50 hover:bg-black/80 text-[#D6A447] border border-[#D6A447]/50 font-['Cinzel'] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>RESET ALL TO DEFAULTS</span>
          </button>

          {savedBanner && (
            <span className="text-xs font-mono text-[#4ADE80] flex items-center gap-1">
              <Check size={14} /> Preferences Saved
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveAndClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded bg-gradient-to-r from-[#BE123C] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-xs sm:text-sm tracking-wider border border-[#FEF08A] cursor-pointer"
          >
            SAVE &amp; CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
