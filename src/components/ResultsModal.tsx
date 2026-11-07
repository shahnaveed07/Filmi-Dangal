import React from 'react';
import { GameBridge } from '../engine/GameBridge';
import { CHARACTERS } from '../data/characters';
import { AudioManager } from '../engine/AudioManager';
import { Trophy, RotateCcw, Users, Home, Flame, Zap, Clock, ChevronRight } from 'lucide-react';

export interface ResultsModalProps {
  onRematch: () => void;
  onChangeCharacter?: () => void;
  onCharacterSelect?: () => void;
  onTitleScreen?: () => void;
  onMainMenu?: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  onRematch,
  onChangeCharacter,
  onCharacterSelect,
  onTitleScreen,
  onMainMenu,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const handleCharacterSelect = onChangeCharacter ?? onCharacterSelect ?? (() => bridge.setScreen('character_select'));
  const handleTitleScreen = onTitleScreen ?? onMainMenu ?? (() => bridge.returnToMenu());

  const isP1Winner = bridge.matchWinner === 'p1';
  const winnerChar = CHARACTERS[isP1Winner ? bridge.p1CharacterId : bridge.p2CharacterId];
  const loserChar = CHARACTERS[isP1Winner ? bridge.p2CharacterId : bridge.p1CharacterId];
  const stats = bridge.lastMatchStats;

  const isArcade = bridge.gameMode === 'arcade';
  const stageNum = bridge.arcadeStageIndex + 1;
  const totalStages = bridge.arcadeLadder.length;
  const hasNextStage = isArcade && isP1Winner && bridge.hasNextArcadeStage();
  const isArcadeChampion = isArcade && isP1Winner && !hasNextStage;
  const nextOpponentChar = hasNextStage
    ? CHARACTERS[bridge.arcadeLadder[bridge.arcadeStageIndex + 1]]
    : null;

  return (
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex items-center justify-center p-4 select-none overflow-y-auto">
      <div className="w-full max-w-xl bg-[#161424] border-2 border-[#D6A447] rounded-xl p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.95)] flex flex-col items-center text-center">
        {/* TROPHY ICON */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-[#FEF08A] shadow-xl mb-3"
          style={{
            background: `linear-gradient(135deg, ${winnerChar.visuals.primaryColor}, ${winnerChar.visuals.secondaryColor})`,
          }}
        >
          <Trophy size={32} className="text-[#FEF08A]" />
        </div>

        <span className="px-3 py-0.5 bg-[#BE123C] text-[#FEF08A] font-['Cinzel'] font-black text-xs uppercase tracking-widest rounded border border-[#D6A447]">
          {isArcadeChampion
            ? 'ARCADE GRAND CHAMPION! (ALL 3 STAGES CLEARED)'
            : isArcade
            ? isP1Winner
              ? `ARCADE STAGE ${stageNum} / ${totalStages} CLEARED!`
              : `ARCADE STAGE ${stageNum} / ${totalStages} DEFEAT`
            : isP1Winner
            ? 'PLAYER 1 VICTORY!'
            : 'CPU VICTORY!'}
        </span>

        <h1 className="mt-2 font-['Bungee'] text-3xl sm:text-4xl text-[#FEF08A] tracking-wider">
          {winnerChar.name} WINS!
        </h1>
        <p className="text-xs font-['Rajdhani'] font-bold text-[#D6A447] uppercase tracking-wider">
          Defeated {loserChar.name} ({stats.roundResults.filter((r) => r === 'p1').length} -{' '}
          {stats.roundResults.filter((r) => r === 'p2').length})
        </p>

        {/* WINNER DIALOGUE */}
        <div className="mt-4 w-full p-3.5 bg-black/50 border border-[#D6A447]/40 rounded-lg">
          <p className="text-sm sm:text-base font-bold text-[#FDE047] italic">
            &quot;{winnerChar.dialogues.win}&quot;
          </p>
        </div>

        {/* NEXT ARCADE CHALLENGER PREVIEW */}
        {hasNextStage && nextOpponentChar && (
          <div className="mt-4 w-full p-3 bg-[#BE123C]/20 border border-[#FEF08A]/50 rounded-lg flex items-center justify-between text-left">
            <div>
              <span className="text-[10px] font-['Cinzel'] font-black text-[#FEF08A] uppercase tracking-wider block">
                NEXT ARCADE CHALLENGER (STAGE {stageNum + 1} / {totalStages})
              </span>
              <span className="font-['Bungee'] text-sm sm:text-base text-white">
                {nextOpponentChar.name} — {nextOpponentChar.title}
              </span>
            </div>
            <ChevronRight size={22} className="text-[#FEF08A] shrink-0" />
          </div>
        )}

        {/* MATCH STATS SUMMARY */}
        <div className="mt-5 w-full grid grid-cols-3 gap-2.5 text-left">
          <div className="bg-black/40 p-3 rounded border border-[#D6A447]/30">
            <div className="flex items-center gap-1 text-[10px] font-['Cinzel'] font-bold text-[#D6A447]">
              <Flame size={12} />
              <span>DAMAGE DEALT</span>
            </div>
            <div className="mt-1 font-mono text-sm sm:text-base font-bold text-white">
              P1: {stats.p1DamageDealt} <span className="text-white/40">|</span> CPU: {stats.p2DamageDealt}
            </div>
          </div>

          <div className="bg-black/40 p-3 rounded border border-[#D6A447]/30">
            <div className="flex items-center gap-1 text-[10px] font-['Cinzel'] font-bold text-[#D6A447]">
              <Zap size={12} />
              <span>MAX COMBO</span>
            </div>
            <div className="mt-1 font-mono text-sm sm:text-base font-bold text-white">
              P1: {stats.p1MaxCombo} <span className="text-white/40">|</span> CPU: {stats.p2MaxCombo}
            </div>
          </div>

          <div className="bg-black/40 p-3 rounded border border-[#D6A447]/30">
            <div className="flex items-center gap-1 text-[10px] font-['Cinzel'] font-bold text-[#D6A447]">
              <Clock size={12} />
              <span>FIGHT TIME</span>
            </div>
            <div className="mt-1 font-mono text-sm sm:text-base font-bold text-white">
              {Math.round(stats.totalFightTimeSeconds)}s
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-6 w-full flex flex-col sm:flex-row gap-3">
          {hasNextStage ? (
            <button
              onClick={() => {
                audio.playSound('click');
                bridge.advanceArcadeStage();
              }}
              className="flex-1 py-3.5 px-4 bg-gradient-to-r from-[#BE123C] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-xs sm:text-sm tracking-wider rounded border border-[#FEF08A] flex items-center justify-center gap-2 cursor-pointer"
            >
              <ChevronRight size={18} />
              <span>NEXT ARCADE STAGE ({stageNum + 1}/{totalStages})</span>
            </button>
          ) : (
            <button
              onClick={() => {
                audio.playSound('click');
                if (isArcadeChampion) {
                  bridge.startNewMatch();
                } else {
                  onRematch();
                }
              }}
              className="flex-1 py-3.5 px-4 bg-gradient-to-r from-[#BE123C] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-xs sm:text-sm tracking-wider rounded border border-[#FEF08A] flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>
                {isArcadeChampion
                  ? 'NEW ARCADE RUN'
                  : isArcade
                  ? 'RETRY ARCADE STAGE'
                  : 'REMATCH'}
              </span>
            </button>
          )}

          <button
            onClick={() => {
              audio.playSound('click');
              handleCharacterSelect();
            }}
            className="flex-1 py-3.5 px-4 bg-[#1A1829] hover:bg-[#25203B] text-[#F1E7D0] font-['Cinzel'] font-bold text-xs sm:text-sm tracking-wider rounded border border-[#D6A447] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Users size={16} className="text-[#D6A447]" />
            <span>CHANGE FIGHTER</span>
          </button>

          <button
            onClick={() => {
              audio.playSound('click');
              handleTitleScreen();
            }}
            className="py-3.5 px-4 bg-black/50 hover:bg-black/80 text-[#D6A447] font-['Cinzel'] font-bold text-xs sm:text-sm tracking-wider rounded border border-[#D6A447]/40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home size={16} />
            <span>TITLE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
