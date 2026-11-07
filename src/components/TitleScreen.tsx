import React, { useEffect } from 'react';
import { GameBridge } from '../engine/GameBridge';
import { GameMode } from '../types/fighter';
import { AudioManager } from '../engine/AudioManager';
import { Volume2, VolumeX, Swords, BookOpen, ShieldAlert, Settings, Award } from 'lucide-react';

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
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex flex-col justify-between items-center p-4 sm:p-8 overflow-hidden select-none">
      {/* BACKGROUND ATMOSPHERE: CINEMATIC SPOTLIGHTS & RETRO GRID */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#BE123C] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#D6A447] rounded-full blur-[150px]" />
      </div>

      {/* TOP HEADER UTILITIES */}
      <div className="relative z-10 w-full max-w-5xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-[#BE123C] text-[#FEF08A] font-black text-xs uppercase tracking-widest rounded border border-[#D6A447]">
            V2.0 3D EDITION
          </span>
          <span className="text-xs text-[#D6A447] tracking-wider font-['Rajdhani'] font-bold hidden sm:inline">
            BABYLON.JS 3D BOLLYWOOD ARCADE FIGHTER
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              audio.toggleMute();
            }}
            className="p-2 bg-[#1A1829] hover:bg-[#25203B] text-[#D6A447] border border-[#D6A447]/60 rounded hover:border-[#D6A447] transition-colors"
            title="Toggle Audio [M]"
            aria-label="Toggle Audio"
          >
            {audio.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 bg-[#1A1829] hover:bg-[#25203B] text-[#D6A447] border border-[#D6A447]/60 rounded hover:border-[#D6A447] transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* CENTER FOCAL HERO PIECE: BESPOKE RETRO TITLE LOCKUP */}
      <div className="relative z-10 flex flex-col items-center text-center my-auto max-w-3xl">
        {/* HINDI SCRIPT BANNER */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[#D6A447] text-base sm:text-xl">★ ★ ★</span>
          <span className="font-bold text-[#F1E7D0] tracking-widest text-sm sm:text-base font-['Cinzel']">
            फ़िल्मी दंगल 3D
          </span>
          <span className="text-[#D6A447] text-base sm:text-xl">★ ★ ★</span>
        </div>

        {/* BESPOKE RETRO SVG POSTER TITLE */}
        <div className="relative py-2">
          <h1 className="font-['Bungee'] text-5xl sm:text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFBEB] via-[#F59E0B] to-[#BE123C] drop-shadow-[0_8px_16px_rgba(0,0,0,0.95)] tracking-wider">
            FILMI DANGAL
          </h1>
          <div className="absolute -inset-1 border-y-2 border-[#D6A447]/40 pointer-events-none transform -skew-y-1" />
        </div>

        {/* TAGLINE */}
        <h2 className="mt-3 font-['Cinzel'] font-black text-lg sm:text-2xl text-[#FDE047] tracking-[0.25em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] uppercase">
          LIGHTS. CAMERA. KNOCKOUT!
        </h2>

        <p className="mt-2 text-xs sm:text-sm text-[#F1E7D0]/70 max-w-lg font-['Rajdhani'] font-semibold">
          Full 3D cinematic fighting engine with articulated 3D superstars, 3D arenas, ranged SuperShots, and blockbuster SuperMoves.
        </p>

        {/* PRIMARY ACTIONS CTAS */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full max-w-md">
          {/* PRIMARY ARCADE CTA */}
          <button
            data-start="true"
            onClick={() => {
              audio.playSound('click');
              onStartGame('arcade');
            }}
            className="w-full py-4 px-6 bg-gradient-to-r from-[#BE123C] via-[#DC2626] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-base sm:text-lg tracking-wider rounded border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(220,38,38,0.6)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Swords size={22} className="text-[#FEF08A]" />
            <span>START 3D ARCADE</span>
          </button>

          {/* VERSUS CPU CTA */}
          <button
            onClick={() => {
              audio.playSound('click');
              onStartGame('vs_cpu');
            }}
            className="w-full py-3.5 px-6 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-sm tracking-wider rounded border-2 border-[#D6A447]/80 hover:border-[#D6A447] shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Award size={18} className="text-[#D6A447]" />
            <span>VERSUS CPU</span>
          </button>
        </div>

        {/* SECONDARY NAVIGATION BUTTONS */}
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs font-['Rajdhani'] font-bold text-[#D6A447]">
          <button
            onClick={() => {
              audio.playSound('click');
              onOpenControls();
            }}
            className="flex items-center gap-1.5 hover:text-[#FEF08A] transition-colors py-1 px-2.5 rounded bg-black/40 border border-transparent hover:border-[#D6A447]/40 cursor-pointer"
          >
            <BookOpen size={14} />
            <span>MOVE LIST &amp; COMBOS</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onOpenDisclaimer();
            }}
            className="flex items-center gap-1.5 hover:text-[#FEF08A] transition-colors py-1 px-2.5 rounded bg-black/40 border border-transparent hover:border-[#D6A447]/40 cursor-pointer"
          >
            <ShieldAlert size={14} />
            <span>LEGAL DISCLAIMER</span>
          </button>
        </div>
      </div>

      {/* BOTTOM SAFE MARGIN: CLEAN FLAT CONTROL HINT LINE */}
      <div className="relative z-10 w-full text-center py-2 border-t border-[#D6A447]/20">
        <p className="font-mono text-xs sm:text-sm text-[#F1E7D0]/60 tracking-wider">
          <span className="text-[#FDE047] font-bold">WASD</span> 3D Move · <span className="text-[#FDE047] font-bold">Space</span> Jump · <span className="text-[#FDE047] font-bold">Ctrl</span> Crouch · <span className="text-[#FDE047] font-bold">Shift</span> Block · <span className="text-[#FDE047] font-bold">J/K/I</span> Attack · <span className="text-[#38BDF8] font-bold">U</span> SuperShot · <span className="text-[#FDE047] font-bold">L</span> SuperMove
        </p>
      </div>
    </div>
  );
};
