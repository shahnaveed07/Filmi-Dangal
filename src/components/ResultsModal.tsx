import React from 'react';
import { GameBridge } from '../engine/GameBridge';
import { CHARACTERS } from '../data/characters';
import { AudioManager } from '../engine/AudioManager';
import { Trophy, RefreshCw, Users, Home } from 'lucide-react';

interface ResultsModalProps {
  onRematch: () => void;
  onCharacterSelect: () => void;
  onMainMenu: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  onRematch,
  onCharacterSelect,
  onMainMenu,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const isP1Winner = bridge.matchWinner === 'p1';
  const winnerId = isP1Winner ? bridge.p1CharacterId : bridge.p2CharacterId;
  const winnerChar = CHARACTERS[winnerId];
  const stats = bridge.lastMatchStats;

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-none z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-xl bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-7 shadow-[0_0_36px_rgba(214,164,71,0.5)] flex flex-col items-center text-center">
        {/* TROPHY & OUTCOME HEADER */}
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="text-[#F59E0B]" size={28} />
          <span className="font-['Cinzel'] font-black text-sm tracking-widest text-[#D6A447] uppercase">
            MATCH CONCLUSION
          </span>
          <Trophy className="text-[#F59E0B]" size={28} />
        </div>

        <h1 className="font-['Bungee'] text-3xl sm:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] via-[#F59E0B] to-[#BE123C] tracking-wide mb-1">
          {isP1Winner ? 'VICTORY!' : 'DEFEAT!'}
        </h1>

        <p className="font-['Rajdhani'] font-bold text-base text-[#F1E7D0] uppercase tracking-wider">
          {winnerChar.name} WINS THE DANGAL!
        </p>

        {/* WINNER QUOTE DOSSIER */}
        <div className="my-4 w-full bg-black/40 border border-[#D6A447]/40 rounded-lg p-3 text-left">
          <div className="flex items-center gap-2 text-xs font-['Cinzel'] font-black text-[#D6A447]">
            <span>{winnerChar.visuals.avatarIcon}</span>
            <span>WINNER DIALOGUE:</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-[#FEF08A] italic">
            &quot;{winnerChar.dialogues.winHindi}&quot;
          </p>
          <p className="text-xs text-white/70 italic mt-0.5">
            &quot;{winnerChar.dialogues.win}&quot;
          </p>
        </div>

        {/* MATCH PERFORMANCE STATISTICS */}
        {stats && (
          <div className="w-full grid grid-cols-3 gap-2 text-center mb-5 bg-[#10111B] p-3 rounded border border-[#D6A447]/30">
            <div>
              <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase block">
                FIGHT TIME
              </span>
              <span className="font-mono font-bold text-sm sm:text-base text-white">
                {stats.totalFightTimeSeconds.toFixed(1)}s
              </span>
            </div>
            <div>
              <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase block">
                P1 DAMAGE
              </span>
              <span className="font-mono font-bold text-sm sm:text-base text-[#22C55E]">
                {stats.p1DamageDealt} HP
              </span>
            </div>
            <div>
              <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase block">
                MAX COMBO
              </span>
              <span className="font-mono font-bold text-sm sm:text-base text-[#F59E0B]">
                {stats.p1MaxCombo > 0 ? `${stats.p1MaxCombo} HITS` : '1 HIT'}
              </span>
            </div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="w-full flex flex-col sm:flex-row gap-3">
          <button
            data-start="true"
            onClick={() => {
              audio.playSound('click');
              onRematch();
            }}
            className="flex-1 py-3 bg-gradient-to-r from-[#BE123C] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <RefreshCw size={16} />
            <span>REMATCH</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onCharacterSelect();
            }}
            className="flex-1 py-3 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-black text-xs tracking-wider rounded border border-[#D6A447]/60 hover:border-[#D6A447] shadow flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <Users size={16} className="text-[#D6A447]" />
            <span>FIGHTER SELECT</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              onMainMenu();
            }}
            className="py-3 px-4 bg-black/50 hover:bg-black/70 text-[#D6A447] font-['Cinzel'] font-bold text-xs rounded border border-[#D6A447]/40 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home size={16} />
            <span>TITLE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
