import React, { useEffect, useState } from 'react';
import { GameBridge } from '../engine/GameBridge';
import { GameMode } from '../types/fighter';
import { AudioManager } from '../engine/AudioManager';
import { SettingsManager } from '../engine/SettingsManager';
import {
  Volume2,
  VolumeX,
  Swords,
  BookOpen,
  ShieldAlert,
  Settings,
  Award,
  Target,
} from 'lucide-react';

interface TitleScreenProps {
  onStartGame: (mode: GameMode) => void;
  onOpenControls: () => void;
  onOpenDisclaimer: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenControls,
  onOpenDisclaimer,
  onOpenSettings,
}) => {
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();
  const [isMuted, setIsMuted] = useState(audio.isMuted);
  const [bindings, setBindings] = useState(() => SettingsManager.getInstance().getSettings().keyBindings);

  useEffect(() => {
    const unsubMute = audio.subscribeMute((m) => setIsMuted(m));
    const unsubSettings = SettingsManager.getInstance().subscribe((s) => setBindings(s.keyBindings));
    return () => {
      unsubMute();
      unsubSettings();
    };
  }, [audio]);

  // Listen for Enter or Space to quickly start the game
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (bridge.screen !== 'title') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        audio.playSound('click');
        onStartGame('arcade');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge.screen, onStartGame, audio]);

  // Support ?autostart=1 query parameter
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        onStartGame('arcade');
      }
    }
  }, [onStartGame]);

  return (
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex flex-col justify-between items-center px-3 py-3 sm:p-6 md:p-8 overflow-y-auto overflow-x-hidden select-none">
      {/* BACKGROUND ATMOSPHERE: CINEMATIC SPOTLIGHTS & RETRO GRID */}
      <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-[#BE123C] rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-[#D6A447] rounded-full blur-[140px]" />
      </div>

      {/* TOP HEADER UTILITIES */}
      <div className="relative z-10 w-full max-w-5xl flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-[#BE123C] text-[#FEF08A] font-black text-[10px] sm:text-xs uppercase tracking-widest rounded border border-[#D6A447]">
            V2.0 3D EDITION
          </span>
          <span className="text-xs text-[#D6A447] tracking-wider font-['Rajdhani'] font-bold hidden sm:inline">
            BABYLON.JS 3D BOLLYWOOD ARCADE FIGHTER
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              audio.toggleMute();
            }}
            className="p-2 bg-[#1A1829] hover:bg-[#25203B] text-[#D6A447] border border-[#D6A447]/60 rounded hover:border-[#D6A447] transition-colors cursor-pointer"
            title="Toggle Audio [M]"
            aria-label="Toggle Audio"
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      {/* CENTER FOCAL HERO PIECE: BESPOKE RETRO TITLE LOCKUP */}
      <div className="relative z-10 flex flex-col items-center text-center my-auto py-3 max-w-3xl w-full">
        {/* CINEMA ARCADE BANNER */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5">
          <span className="text-[#D6A447] text-xs sm:text-lg">★ ★ ★</span>
          <span className="font-bold text-[#F1E7D0] tracking-widest text-xs sm:text-base font-['Cinzel']">
            BOLLYWOOD 3D ARCADE SHOWDOWN
          </span>
          <span className="text-[#D6A447] text-xs sm:text-lg">★ ★ ★</span>
        </div>

        {/* BESPOKE RETRO SVG POSTER TITLE */}
        <div className="relative py-1 sm:py-2 px-2">
          <h1 className="font-['Bungee'] text-4xl sm:text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFBEB] via-[#F59E0B] to-[#BE123C] drop-shadow-[0_8px_16px_rgba(0,0,0,0.95)] tracking-wider leading-none">
            FILMI DANGAL
          </h1>
          <div className="absolute -inset-1 border-y-2 border-[#D6A447]/40 pointer-events-none transform -skew-y-1" />
        </div>

        {/* TAGLINE */}
        <h2 className="mt-2 font-['Cinzel'] font-black text-sm sm:text-xl md:text-2xl text-[#FDE047] tracking-[0.2em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] uppercase">
          LIGHTS. CAMERA. KNOCKOUT!
        </h2>

        <p className="mt-1.5 text-xs sm:text-sm text-[#F1E7D0]/75 max-w-lg font-['Rajdhani'] font-semibold px-2">
          3D cinematic Bollywood fighting game on a classic 2D fighting plane with signature SuperShots and blockbuster SuperMoves.
        </p>

        {/* PRIMARY GAMEPLAY MODES (ARCADE, VERSUS CPU, TRAINING) */}
        <div className="mt-5 sm:mt-7 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 w-full max-w-2xl px-1">
          {/* 1. ARCADE MODE CTA */}
          <button
            type="button"
            data-start="true"
            onClick={() => {
              audio.playSound('click');
              onStartGame('arcade');
            }}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#BE123C] via-[#DC2626] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-sm sm:text-base tracking-wider rounded-lg border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(220,38,38,0.55)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Swords size={20} className="text-[#FEF08A] shrink-0" />
            <span>ARCADE MODE</span>
          </button>

          {/* 2. VERSUS CPU CTA */}
          <button
            type="button"
            onClick={() => {
              audio.playSound('click');
              onStartGame('vs_cpu');
            }}
            className="w-full py-3.5 px-4 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs sm:text-sm tracking-wider rounded-lg border-2 border-[#D6A447]/80 hover:border-[#FEF08A] shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Award size={18} className="text-[#D6A447] shrink-0" />
            <span>VERSUS CPU</span>
          </button>

          {/* 3. TRAINING MODE CTA */}
          <button
            type="button"
            onClick={() => {
              audio.playSound('click');
              onStartGame('training');
            }}
            className="w-full py-3.5 px-4 bg-[#162032] hover:bg-[#1E2D47] text-[#F1E7D0] font-['Cinzel'] font-black text-xs sm:text-sm tracking-wider rounded-lg border-2 border-[#38BDF8]/80 hover:border-[#38BDF8] shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Target size={18} className="text-[#38BDF8] shrink-0" />
            <span>TRAINING MODE</span>
          </button>
        </div>

        {/* SECONDARY NAVIGATION BUTTONS: SETTINGS, CONTROLS, DISCLAIMER */}
        <div className="mt-4 flex flex-wrap justify-center gap-2.5 sm:gap-4 text-xs font-['Rajdhani'] font-bold text-[#D6A447]">
          <button
            type="button"
            onClick={() => {
              audio.playSound('click');
              onOpenSettings();
            }}
            className="flex items-center gap-1.5 hover:text-[#FEF08A] transition-colors py-1.5 px-3 rounded bg-black/50 border border-[#D6A447]/30 hover:border-[#D6A447] cursor-pointer"
          >
            <Settings size={14} />
            <span>SETTINGS</span>
          </button>

          <button
            type="button"
            onClick={() => {
              audio.playSound('click');
              onOpenControls();
            }}
            className="flex items-center gap-1.5 hover:text-[#FEF08A] transition-colors py-1.5 px-3 rounded bg-black/50 border border-[#D6A447]/30 hover:border-[#D6A447] cursor-pointer"
          >
            <BookOpen size={14} />
            <span>CONTROLS &amp; MOVES</span>
          </button>

          <button
            type="button"
            onClick={() => {
              audio.playSound('click');
              onOpenDisclaimer();
            }}
            className="flex items-center gap-1.5 hover:text-[#FEF08A] transition-colors py-1.5 px-3 rounded bg-black/50 border border-[#D6A447]/30 hover:border-[#D6A447] cursor-pointer"
          >
            <ShieldAlert size={14} />
            <span>LEGAL DISCLAIMER</span>
          </button>
        </div>
      </div>

      {/* BOTTOM SAFE MARGIN: DYNAMIC CONTROL HINT LINE */}
      <div className="relative z-10 w-full text-center py-2 border-t border-[#D6A447]/20 shrink-0">
        <p className="font-mono text-[10px] sm:text-xs text-[#F1E7D0]/65 tracking-wider">
          <span className="text-[#FDE047] font-bold">
            {bindings.moveLeft}/{bindings.moveRight}
          </span>{' '}
          Move ·{' '}
          <span className="text-[#FDE047] font-bold">{bindings.jump}</span> Jump ·{' '}
          <span className="text-[#FDE047] font-bold">{bindings.crouch}</span> Crouch ·{' '}
          <span className="text-[#FDE047] font-bold">{bindings.block}</span> Block ·{' '}
          <span className="text-[#FDE047] font-bold">
            {bindings.punch}/{bindings.kick}/{bindings.grab}
          </span>{' '}
          Attack ·{' '}
          <span className="text-[#38BDF8] font-bold">{bindings.superShot}</span> SuperShot ·{' '}
          <span className="text-[#FDE047] font-bold">{bindings.superMove}</span> SuperMove
        </p>
      </div>
    </div>
  );
};
