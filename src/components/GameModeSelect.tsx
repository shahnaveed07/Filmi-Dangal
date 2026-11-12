import React from 'react';
import { GameMode } from '../types/fighter';
import { AudioManager } from '../engine/AudioManager';
import { ScreenHeader } from './ui/FightFunUI';
import { Swords, Award, Target } from 'lucide-react';

interface GameModeSelectProps {
  onSelectMode: (mode: GameMode) => void;
  onBack: () => void;
}

const MODES: Array<{
  mode: GameMode;
  title: string;
  subtitle: string;
  accent: string;
  borderAccent: string;
  icon: React.ReactNode;
}> = [
  {
    mode: 'arcade',
    title: 'ARCADE',
    subtitle: '3-Stage Ladder',
    accent: 'from-[#BE123C]/40 to-[#141222]',
    borderAccent: 'border-[#BE123C] hover:border-[#FEF08A]',
    icon: <Swords size={36} className="text-[#FEF08A]" />,
  },
  {
    mode: 'vs_cpu',
    title: 'VERSUS CPU',
    subtitle: 'Single Match',
    accent: 'from-[#D97706]/35 to-[#141222]',
    borderAccent: 'border-[#D6A447] hover:border-[#FEF08A]',
    icon: <Award size={36} className="text-[#D6A447]" />,
  },
  {
    mode: 'training',
    title: 'TRAINING',
    subtitle: 'Free Practice',
    accent: 'from-[#0284C7]/35 to-[#141222]',
    borderAccent: 'border-[#38BDF8] hover:border-[#FEF08A]',
    icon: <Target size={36} className="text-[#38BDF8]" />,
  },
];

export const GameModeSelect: React.FC<GameModeSelectProps> = ({
  onSelectMode,
  onBack,
}) => {
  const audio = AudioManager.getInstance();

  return (
    <div
      data-testid="game-mode-screen"
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none overflow-y-auto"
    >
      <ScreenHeader
        title="GAME MODE"
        onBack={() => {
          audio.playSound('click');
          onBack();
        }}
      />

      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 md:grid-cols-3 gap-5 py-6">
        {MODES.map((item) => (
          <button
            key={item.mode}
            type="button"
            data-testid={`mode-card-${item.mode}`}
            onClick={() => {
              audio.playSound('click');
              onSelectMode(item.mode);
            }}
            className={`group p-7 sm:p-8 rounded-2xl border-2 bg-gradient-to-b ${item.accent} ${item.borderAccent} transition-all hover:scale-[1.02] active:scale-98 shadow-2xl flex flex-col items-center justify-center text-center gap-5 cursor-pointer min-h-[220px] sm:min-h-[260px]`}
          >
            <div className="w-20 h-20 rounded-2xl bg-black/45 border border-white/15 flex items-center justify-center group-hover:scale-110 transition-transform">
              {item.icon}
            </div>

            <div>
              <h2 className="font-['Bungee'] text-2xl sm:text-3xl text-[#F1E7D0] group-hover:text-[#FEF08A] tracking-wider">
                {item.title}
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-widest text-[#D6A447]">
                {item.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
