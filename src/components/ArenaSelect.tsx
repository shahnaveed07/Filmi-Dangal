import React, { useState } from 'react';
import { ARENA_LIST, ARENAS } from '../data/arenas';
import { ArenaId } from '../types/fighter';
import { GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { ArrowLeft, Swords, Sparkles, Film, Award } from 'lucide-react';

interface ArenaSelectProps {
  onBack: () => void;
  onStartFight: () => void;
}

export const ArenaSelect: React.FC<ArenaSelectProps> = ({ onBack, onStartFight }) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();
  const [selectedArena, setSelectedArena] = useState<ArenaId>(bridge.arenaId);

  const arena = ARENAS[selectedArena];

  const handleSelect = (id: ArenaId) => {
    audio.playSound('click');
    setSelectedArena(id);
    bridge.arenaId = id;
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex flex-col justify-between p-4 sm:p-6 select-none overflow-y-auto">
      {/* TOP HEADER */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between border-b border-[#D6A447]/30 pb-3">
        <button
          onClick={() => {
            audio.playSound('click');
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-['Cinzel'] font-bold text-[#D6A447] hover:text-[#FEF08A] transition-colors py-1 px-3 bg-black/40 rounded border border-[#D6A447]/40 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>BACK TO FIGHTERS</span>
        </button>

        <h1 className="font-['Bungee'] text-xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] to-[#D6A447] tracking-wider text-center">
          SELECT ARENA
        </h1>

        <div className="text-xs text-[#D6A447] font-['Rajdhani'] font-bold uppercase tracking-wider">
          STAGE 1 / 2
        </div>
      </div>

      {/* ARENA CARDS CONTAINER */}
      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
        {ARENA_LIST.map((ar) => {
          const isSelected = ar.id === selectedArena;
          const isAward = ar.id === 'award_night';

          return (
            <button
              key={ar.id}
              onClick={() => handleSelect(ar.id)}
              className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                isSelected
                  ? 'border-[#FEF08A] bg-gradient-to-b from-[#251A33] to-[#120F1D] shadow-[0_0_24px_rgba(214,164,71,0.6)] scale-[1.02]'
                  : 'border-[#D6A447]/40 bg-[#161424]/90 hover:border-[#D6A447] hover:bg-[#1E1B32]'
              }`}
            >
              {/* STAGE ICON & TITLE */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 bg-black/40 rounded-lg border border-[#D6A447]/40 text-[#D6A447]">
                      {isAward ? <Award size={24} /> : <Film size={24} />}
                    </span>
                    <div>
                      <h2 className="font-['Bungee'] text-lg sm:text-xl text-[#F1E7D0] group-hover:text-[#FEF08A] transition-colors">
                        {ar.name}
                      </h2>
                      <p className="text-xs text-[#D6A447] font-['Rajdhani'] font-bold uppercase tracking-wider">
                        {ar.subtitle}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="px-2 py-0.5 bg-[#BE123C] text-[#FEF08A] text-[10px] font-black rounded border border-[#FEF08A] uppercase tracking-wider">
                      ACTIVE STAGE
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/70 leading-relaxed mb-4">
                  {ar.description}
                </p>

                {/* THEME FEATURES LIST */}
                <div className="space-y-1.5 bg-black/30 p-3 rounded border border-[#D6A447]/20">
                  <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase tracking-widest block mb-1">
                    STAGE ELEMENTS:
                  </span>
                  {ar.themeFeatures.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px] text-[#F1E7D0]/80">
                      <Sparkles size={12} className="text-[#F59E0B] shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SELECTION INDICATOR */}
              <div className="mt-5 pt-3 border-t border-[#D6A447]/30 flex items-center justify-between">
                <span className="font-mono text-xs text-[#D6A447]">
                  LOGICAL RES: 1280 x 720
                </span>
                <span className={`text-xs font-['Bungee'] ${isSelected ? 'text-[#FEF08A]' : 'text-white/40'}`}>
                  {isSelected ? '✓ SELECTED' : 'CLICK TO SELECT'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* BOTTOM CTA: LAUNCH FIGHT */}
      <div className="w-full max-w-md mx-auto pb-4">
        <button
          data-start="true"
          onClick={() => {
            audio.playSound('click');
            onStartFight();
          }}
          className="w-full py-4 bg-gradient-to-r from-[#BE123C] via-[#DC2626] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-lg tracking-wider rounded border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(220,38,38,0.7)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Swords size={22} className="text-[#FEF08A]" />
          <span>ENTER THE ARENA - FIGHT!</span>
        </button>
      </div>
    </div>
  );
};
