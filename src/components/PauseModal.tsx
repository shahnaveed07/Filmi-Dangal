import React, { useState } from 'react';
import { Play, RotateCcw, Home, BookOpen, Settings, Dumbbell } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';
import { GameBridge } from '../engine/GameBridge';
import { TrainingDummyBehavior } from '../types/fighter';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenControls: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenControls,
  onOpenSettings,
  onMainMenu,
}) => {
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();
  const isTraining = bridge.gameMode === 'training';
  const [dummyBehavior, setDummyBehavior] = useState<TrainingDummyBehavior>(
    bridge.trainingDummyBehavior
  );

  const handleDummyBehavior = (behavior: TrainingDummyBehavior) => {
    audio.playSound('click');
    setDummyBehavior(behavior);
    bridge.setTrainingDummyBehavior(behavior);
  };

  return (
    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-none overflow-y-auto">
      <div className="w-full max-w-md bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center">
        <h2 className="font-['Bungee'] text-2xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] to-[#D6A447] tracking-wider mb-1">
          {isTraining ? 'TRAINING PAUSED' : 'MATCH PAUSED'}
        </h2>
        <p className="text-xs text-[#F1E7D0]/70 font-['Rajdhani'] font-bold uppercase tracking-widest mb-4">
          Press ESC or Tap Resume to continue
        </p>

        {/* TRAINING DUMMY CONTROLS IN PAUSE MENU */}
        {isTraining && (
          <div className="w-full bg-black/40 border border-emerald-500/40 rounded-lg p-3 mb-4 text-left">
            <div className="flex items-center gap-1.5 text-xs font-['Cinzel'] font-bold text-emerald-400 uppercase mb-2">
              <Dumbbell size={14} />
              <span>Training Dummy Action</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {(
                [
                  { id: 'stand', label: 'Stand' },
                  { id: 'block', label: 'Block' },
                  { id: 'crouch', label: 'Crouch' },
                  { id: 'jump', label: 'Jump' },
                  { id: 'cpu_spar', label: 'CPU Spar' },
                ] as Array<{ id: TrainingDummyBehavior; label: string }>
              ).map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleDummyBehavior(b.id)}
                  className={`py-1.5 px-1 rounded text-[10px] font-['Rajdhani'] font-black uppercase border transition-colors cursor-pointer ${
                    dummyBehavior === b.id
                      ? 'bg-emerald-700 border-[#FEF08A] text-[#FEF08A]'
                      : 'bg-[#1A1829] border-emerald-500/30 text-emerald-200 hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-2.5">
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
              onOpenSettings();
            }}
            className="w-full py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <Settings size={16} className="text-[#D6A447]" />
            <span>GAME SETTINGS</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onOpenControls();
            }}
            className="w-full py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <BookOpen size={16} className="text-[#D6A447]" />
            <span>MOVES &amp; COMBOS GUIDE</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onRestart();
            }}
            className="w-full py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <RotateCcw size={16} className="text-[#D6A447]" />
            <span>{isTraining ? 'RESET PRACTICE POSITIONS' : 'RESTART ROUND'}</span>
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
