import React, { useState } from 'react';
import { X, Volume2, VolumeX, Sliders, Smartphone, Check, Music, Crosshair } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';
import { GameBridge } from '../engine/GameBridge';
import { Difficulty } from '../types/fighter';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();

  const [isMuted, setIsMuted] = useState(audio.isMuted);
  const [isBgmEnabled, setIsBgmEnabled] = useState(audio.isBgmEnabled);
  const [volume, setVolume] = useState(Math.round(audio.masterVolume * 100));
  const [difficulty, setDifficulty] = useState<Difficulty>(bridge.difficulty);
  const [debugHitboxes, setDebugHitboxes] = useState<boolean>(bridge.debugHitboxes);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    audio.masterVolume = val / 100;
  };

  const handleToggleMute = () => {
    const muted = audio.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleBgm = () => {
    const bgm = audio.toggleBgm();
    setIsBgmEnabled(bgm);
  };

  const handleToggleDebug = () => {
    audio.playSound('click');
    const next = !debugHitboxes;
    setDebugHitboxes(next);
    bridge.debugHitboxes = next;
  };

  const handleDifficulty = (diff: Difficulty) => {
    audio.playSound('click');
    setDifficulty(diff);
    bridge.difficulty = diff;
  };

  return (
    <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-7 shadow-2xl flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Sliders size={20} className="text-[#F59E0B]" />
            <h2 className="font-['Bungee'] text-lg sm:text-xl text-[#FEF08A] tracking-wider">
              SETTINGS &amp; AUDIO
            </h2>
          </div>
          <button
            onClick={() => {
              audio.playSound('click');
              onClose();
            }}
            className="p-1 text-[#D6A447] hover:text-white rounded bg-black/40 border border-[#D6A447]/40 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* AUDIO SECTION */}
        <div className="space-y-4 mb-5">
          <div className="flex items-center justify-between">
            <span className="font-['Cinzel'] font-bold text-xs text-[#D6A447] uppercase">
              AUDIO CHANNELS
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleToggleMute}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold font-['Rajdhani'] cursor-pointer transition-colors ${
                  isMuted
                    ? 'bg-[#BE123C] border-[#FEF08A] text-white'
                    : 'bg-black/40 border-[#D6A447]/50 text-[#D6A447]'
                }`}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>{isMuted ? 'UNMUTE ALL' : 'MUTE ALL'}</span>
              </button>

              <button
                onClick={handleToggleBgm}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold font-['Rajdhani'] cursor-pointer transition-colors ${
                  isBgmEnabled && !isMuted
                    ? 'bg-[#0284C7] border-[#38BDF8] text-white'
                    : 'bg-black/40 border-[#D6A447]/50 text-[#D6A447]'
                }`}
              >
                <Music size={14} />
                <span>{isBgmEnabled ? 'BGM ON' : 'BGM OFF'}</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#F1E7D0]/80 font-mono mb-1.5">
              <span>MASTER SYNTH VOLUME</span>
              <span className="font-bold text-[#FEF08A]">{volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              disabled={isMuted}
              className="w-full accent-[#F59E0B] cursor-pointer"
              aria-label="Master Synth Volume"
            />
          </div>
        </div>

        {/* DIFFICULTY SETTING */}
        <div className="mb-5">
          <span className="font-['Cinzel'] font-bold text-xs text-[#D6A447] uppercase block mb-2">
            DEFAULT CPU DIFFICULTY
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => handleDifficulty(d)}
                className={`py-2 px-1 text-center rounded border font-['Rajdhani'] font-bold text-xs uppercase cursor-pointer transition-all flex items-center justify-center gap-1 ${
                  difficulty === d
                    ? 'bg-[#BE123C] border-[#FEF08A] text-[#FEF08A] shadow-md'
                    : 'bg-black/40 border-[#D6A447]/30 text-[#D6A447] hover:border-[#D6A447]'
                }`}
              >
                {difficulty === d && <Check size={12} />}
                <span>{d}</span>
              </button>
            ))}
          </div>
        </div>

        {/* HITBOX DEBUG VISUALIZER TOGGLE */}
        <div className="mb-5 flex items-center justify-between bg-black/40 border border-[#D6A447]/30 p-3 rounded">
          <div>
            <span className="font-['Cinzel'] font-bold text-xs text-[#D6A447] uppercase block">
              HITBOX / HURTBOX DEBUG OVERLAY
            </span>
            <span className="text-[11px] text-white/60 font-mono">
              Shortcut: Press [H] or [F2] during fight
            </span>
          </div>
          <button
            onClick={handleToggleDebug}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold font-['Rajdhani'] cursor-pointer transition-colors ${
              debugHitboxes
                ? 'bg-[#10B981] border-[#FEF08A] text-black'
                : 'bg-black/40 border-[#D6A447]/50 text-[#D6A447]'
            }`}
          >
            <Crosshair size={14} />
            <span>{debugHitboxes ? 'ACTIVE' : 'OFF'}</span>
          </button>
        </div>

        {/* DEVICE ORIENTATION NOTICE */}
        <div className="p-3 bg-black/40 border border-[#D6A447]/30 rounded text-xs text-[#F1E7D0]/70 flex items-start gap-2 mb-5">
          <Smartphone size={16} className="text-[#38BDF8] shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Target resolution is logical 1280x720 (16:9). On mobile devices, please rotate your screen to <strong>Landscape</strong> for optimal arcade combat controls.
          </p>
        </div>

        <button
          onClick={() => {
            audio.playSound('click');
            onClose();
          }}
          className="w-full py-3 bg-[#D97706] hover:bg-[#F59E0B] text-black font-['Bungee'] text-xs tracking-wider rounded border border-[#FEF08A] cursor-pointer"
        >
          SAVE &amp; CLOSE
        </button>
      </div>
    </div>
  );
};
