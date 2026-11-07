import React from 'react';
import { Play, RotateCcw, Home, BookOpen } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenControls: () => void;
  onMainMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenControls,
  onMainMenu,
}) => {
  const audio = AudioManager.getInstance();

  return (
    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#161424] border-2 border-[#D6A447] rounded-xl p-6 shadow-2xl flex flex-col items-center text-center">
        <h2 className="font-['Bungee'] text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] to-[#D6A447] tracking-wider mb-1">
          MATCH PAUSED
        </h2>
        <p className="text-xs text-[#F1E7D0]/70 font-['Rajdhani'] font-bold uppercase tracking-widest mb-6">
          Press ESC or Click Resume to continue
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => {
              audio.playSound('click');
              onResume();
            }}
            className="w-full py-3.5 bg-gradient-to-r from-[#BE123C] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <Play size={16} />
            <span>RESUME FIGHT</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onOpenControls();
            }}
            className="w-full py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <BookOpen size={16} className="text-[#D6A447]" />
            <span>MOVES & COMBOS GUIDE</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onRestart();
            }}
            className="w-full py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <RotateCcw size={16} className="text-[#D6A447]" />
            <span>RESTART ROUND</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onMainMenu();
            }}
            className="w-full py-3 bg-black/50 hover:bg-black/70 text-[#D6A447] font-['Cinzel'] font-bold text-xs rounded border border-[#D6A447]/40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home size={16} />
            <span>EXIT TO MAIN MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
