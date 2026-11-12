import React, { useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import { FighterId } from '../types/fighter';
import { CharacterSelectMode, GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import {
  CharacterStats,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
} from './ui/FightFunUI';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface CharacterOverviewProps {
  mode?: CharacterSelectMode;
  onBackToRoster: () => void;
  onSelectCharacter: (id: FighterId) => void;
}

export const CharacterOverview: React.FC<CharacterOverviewProps> = ({
  mode,
  onBackToRoster,
  onSelectCharacter,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const resolvedMode: CharacterSelectMode =
    mode ?? (bridge.characterSelectBrowseOnly ? 'browse' : 'match');
  const isBrowseOnly = resolvedMode === 'browse';

  const [currentId, setCurrentId] = useState<FighterId>(
    bridge.inspectedCharacterId || bridge.p1CharacterId
  );

  const character = CHARACTERS[currentId] || CHARACTERS.action_sultan;
  const currentIndex = CHARACTER_LIST.findIndex((c) => c.id === currentId);

  const handleStepCharacter = (delta: number) => {
    audio.playSound('click');
    const nextIdx =
      (currentIndex + delta + CHARACTER_LIST.length) % CHARACTER_LIST.length;
    const nextId = CHARACTER_LIST[nextIdx].id;
    setCurrentId(nextId);
    bridge.inspectedCharacterId = nextId;
  };

  return (
    <div
      data-testid="character-overview-screen"
      data-select-mode={resolvedMode}
      data-overview-character-id={currentId}
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none overflow-y-auto"
    >
      <ScreenHeader
        title="FIGHTER OVERVIEW"
        backLabel="FIGHTERS"
        onBack={() => {
          audio.playSound('click');
          onBackToRoster();
        }}
        rightSlot={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="overview-prev-character"
              onClick={() => handleStepCharacter(-1)}
              className="p-2 rounded-lg bg-[#171526] hover:bg-[#231F38] text-[#D6A447] hover:text-[#FEF08A] border border-[#D6A447]/45 cursor-pointer"
              title="Previous Fighter"
              aria-label="Previous Fighter"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              data-testid="overview-next-character"
              onClick={() => handleStepCharacter(1)}
              className="p-2 rounded-lg bg-[#171526] hover:bg-[#231F38] text-[#D6A447] hover:text-[#FEF08A] border border-[#D6A447]/45 cursor-pointer"
              title="Next Fighter"
              aria-label="Next Fighter"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />

      {/* PRIMARY AREA: FULL-BODY 3D MODEL + COMPACT STATS */}
      <div className="w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center py-4">
        {/* LARGE INTERACTIVE 3D TURNTABLE */}
        <div className="lg:col-span-7">
          <CharacterPreview3D
            characterId={currentId}
            variant="overview"
            showAnimationBar={true}
            className="w-full h-72 sm:h-96 md:h-[430px]"
          />
        </div>

        {/* MINIMAL FIGHTER IDENTITY & VISUAL STAT BARS */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="bg-[#141222]/90 p-5 rounded-xl border border-[#D6A447]/35">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: character.visuals.primaryColor }}
              />
              <span className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[#D6A447]">
                {character.archetype}
              </span>
            </div>
            <h2 className="font-['Bungee'] text-2xl sm:text-4xl text-[#FEF08A] tracking-wide">
              {character.name}
            </h2>
          </div>

          <CharacterStats character={character} />

          {/* SIGNATURE SPECIAL NAMES ONLY (NO LONG PARAGRAPHS) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#141222]/90 p-3.5 rounded-xl border border-[#38BDF8]/35">
              <div className="text-[10px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[#38BDF8]">
                SUPER SHOT
              </div>
              <div className="font-['Bungee'] text-xs sm:text-sm text-[#F1E7D0] mt-0.5 truncate">
                {character.superShotInfo.name}
              </div>
            </div>
            <div className="bg-[#141222]/90 p-3.5 rounded-xl border border-[#BE123C]/50">
              <div className="text-[10px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[#F59E0B]">
                SUPER MOVE
              </div>
              <div className="font-['Bungee'] text-xs sm:text-sm text-[#FEF08A] mt-0.5 truncate">
                {character.superMoveInfo.name}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <SecondaryButton
              data-testid="overview-back-to-roster-btn"
              fullWidth
              onClick={() => {
                audio.playSound('click');
                onBackToRoster();
              }}
            >
              BACK TO FIGHTERS
            </SecondaryButton>

            {!isBrowseOnly && (
              <PrimaryButton
                data-testid="overview-select-character-btn"
                fullWidth
                icon={<Check size={18} />}
                onClick={() => {
                  audio.playSound('click');
                  onSelectCharacter(currentId);
                }}
              >
                SELECT FIGHTER
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
