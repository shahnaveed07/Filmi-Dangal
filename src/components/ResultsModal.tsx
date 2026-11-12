import React from 'react';
import { GameBridge } from '../engine/GameBridge';
import { CHARACTERS } from '../data/characters';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { PrimaryButton, SecondaryButton } from './ui/FightFunUI';
import { Trophy, RotateCcw, Users, Home, ChevronRight } from 'lucide-react';

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

  const handleCharacterSelect =
    onChangeCharacter ??
    onCharacterSelect ??
    (() => bridge.setScreen('character_select'));
  const handleTitleScreen =
    onTitleScreen ?? onMainMenu ?? (() => bridge.returnToMenu());

  const isP1Winner = bridge.matchWinner === 'p1';
  const winnerId = isP1Winner ? bridge.p1CharacterId : bridge.p2CharacterId;
  const winnerChar = CHARACTERS[winnerId];

  const isArcade = bridge.gameMode === 'arcade';
  const stageNum = bridge.arcadeStageIndex + 1;
  const totalStages = bridge.arcadeLadder.length;
  const hasNextStage = isArcade && isP1Winner && bridge.hasNextArcadeStage();
  const isArcadeChampion = isArcade && isP1Winner && !hasNextStage;

  return (
    <div
      data-testid="results-screen"
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex items-center justify-center p-4 sm:p-6 select-none overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#141222] border-2 border-[#D6A447] rounded-2xl p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.95)] flex flex-col items-center text-center gap-5">
        <div className="flex items-center gap-2 px-3.5 py-1 bg-[#BE123C] text-[#FEF08A] font-['Rajdhani'] font-black text-xs uppercase tracking-widest rounded-full border border-[#FEF08A]">
          <Trophy size={14} />
          <span>
            {isArcadeChampion
              ? 'ARCADE CHAMPION'
              : isP1Winner
              ? 'PLAYER 1 WINNER'
              : 'CPU WINNER'}
          </span>
        </div>

        <h1 className="font-['Bungee'] text-3xl sm:text-5xl text-[#FEF08A] tracking-wider leading-none">
          {winnerChar.name}
        </h1>

        {/* WINNING CHARACTER 3D SHOWCASE */}
        <div className="w-full max-w-md">
          <CharacterPreview3D
            characterId={winnerId}
            variant="hero"
            showAnimationBar={false}
            className="w-full h-56 sm:h-64"
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="w-full flex flex-col sm:flex-row gap-3 pt-2">
          {hasNextStage ? (
            <PrimaryButton
              fullWidth
              icon={<ChevronRight size={18} />}
              onClick={() => {
                audio.playSound('click');
                bridge.advanceArcadeStage();
              }}
            >
              NEXT STAGE ({stageNum + 1}/{totalStages})
            </PrimaryButton>
          ) : (
            <PrimaryButton
              fullWidth
              icon={<RotateCcw size={18} />}
              onClick={() => {
                audio.playSound('click');
                if (isArcadeChampion) {
                  bridge.startNewMatch();
                } else {
                  onRematch();
                }
              }}
            >
              REMATCH
            </PrimaryButton>
          )}

          <SecondaryButton
            fullWidth
            icon={<Users size={16} />}
            onClick={() => {
              audio.playSound('click');
              handleCharacterSelect();
            }}
          >
            FIGHTERS
          </SecondaryButton>

          <SecondaryButton
            fullWidth
            icon={<Home size={16} />}
            onClick={() => {
              audio.playSound('click');
              handleTitleScreen();
            }}
          >
            MAIN MENU
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
};
