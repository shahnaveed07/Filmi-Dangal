import React, { useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import { FighterId } from '../types/fighter';
import { CharacterSelectMode, GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import {
  CharacterPortrait,
  CharacterStats,
  ScreenHeader,
  WindowUtilityControls,
} from './ui/FightFunUI';
import { CheckCircle2, ChevronLeft, ChevronRight, Info } from 'lucide-react';

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

  const nameParts = character.name.trim().split(/\s+/);
  const firstWord = nameParts[0] || character.name;
  const restWords = nameParts.slice(1).join(' ');

  return (
    <div
      data-testid="character-overview-screen"
      data-select-mode={resolvedMode}
      data-overview-character-id={currentId}
      className="relative w-full h-full min-h-screen bg-[#070406] flex flex-col justify-between px-4 py-3 sm:px-7 sm:py-5 md:px-10 md:py-6 select-none overflow-y-auto overflow-x-hidden"
    >
      {/* ATMOSPHERIC STAGE LIGHTING */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 46% 52% at 45% 56%, rgba(220, 38, 38, 0.16) 0%, rgba(245, 158, 11, 0.06) 45%, rgba(7, 4, 6, 0.98) 82%)',
          }}
        />
      </div>

      {/* HEADER */}
      <div className="relative z-20 w-full">
        <ScreenHeader
          title="FIGHTER OVERVIEW"
          onBack={() => {
            audio.playSound('click');
            onBackToRoster();
          }}
          rightSlot={
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="overview-prev-character"
                onClick={() => handleStepCharacter(-1)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#140D10]/90 hover:bg-[#26161B] text-[#FACC15] border border-amber-400/65 flex items-center justify-center cursor-pointer"
                title="Previous Fighter"
                aria-label="Previous Fighter"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                data-testid="overview-next-character"
                onClick={() => handleStepCharacter(1)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#140D10]/90 hover:bg-[#26161B] text-[#FACC15] border border-amber-400/65 flex items-center justify-center cursor-pointer"
                title="Next Fighter"
                aria-label="Next Fighter"
              >
                <ChevronRight size={18} />
              </button>
              <WindowUtilityControls />
            </div>
          }
        />
      </div>

      {/* PRIMARY AREA: FULL-BODY 3D MODEL + RIGHT DETAILS */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center py-3">
        {/* LARGE INTERACTIVE 3D TURNTABLE */}
        <div className="lg:col-span-7 relative flex items-center justify-center">
          <CharacterPreview3D
            characterId={currentId}
            variant="overview"
            frameless={true}
            showAnimationBar={true}
            className="w-full h-80 sm:h-96 md:h-[470px] lg:h-[520px]"
          />
        </div>

        {/* FIGHTER IDENTITY, SEGMENTED STATS, SPECIALS & CTA */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-red-500/65 bg-gradient-to-r from-[#580B12] via-[#2B070B] to-[#0E080A] px-5 py-4 shadow-[0_0_24px_rgba(220,38,38,0.22)] flex items-center justify-between">
            <div>
              <h2 className="font-display font-black italic uppercase text-2xl sm:text-4xl tracking-wide leading-none">
                <span className="text-white">{firstWord}</span>
                {restWords ? (
                  <span className="text-[#FACC15] ml-2">{restWords}</span>
                ) : null}
              </h2>
              <p className="font-display font-bold italic text-xs sm:text-sm text-zinc-200 tracking-wide mt-1">
                {character.archetype}
              </p>
            </div>
            <div className="w-16 h-16 sm:w-20 sm:h-20 -my-2 -mr-2 pointer-events-none shrink-0">
              <CharacterPortrait character={character} size="sm" monochrome={true} />
            </div>
          </div>

          <CharacterStats character={character} borderVariant="crimson" />

          {/* CHARACTER INFO */}
          <div className="bg-[#0E090B]/95 border border-red-600/75 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#FACC15] font-display font-extrabold italic text-sm mb-1">
              <Info size={16} className="text-zinc-200 shrink-0" />
              <span>Character Info</span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-200 italic leading-relaxed">
              {character.bio}
            </p>
          </div>

          {/* SIGNATURE SPECIAL NAMES */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0E090B]/95 p-3.5 rounded-xl border border-red-600/60">
              <div className="text-[10px] font-display font-black uppercase tracking-widest text-[#38BDF8]">
                SUPER SHOT
              </div>
              <div className="font-display font-black italic text-xs sm:text-sm text-white mt-0.5 truncate">
                {character.superShotInfo.name}
              </div>
            </div>
            <div className="bg-[#0E090B]/95 p-3.5 rounded-xl border border-amber-500/60">
              <div className="text-[10px] font-display font-black uppercase tracking-widest text-[#FACC15]">
                SUPER MOVE
              </div>
              <div className="font-display font-black italic text-xs sm:text-sm text-[#FEF08A] mt-0.5 truncate">
                {character.superMoveInfo.name}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              data-testid="overview-back-to-roster-btn"
              onClick={() => {
                audio.playSound('click');
                onBackToRoster();
              }}
              className="flex-1 py-3.5 px-5 rounded-lg bg-[#140D10] hover:bg-[#22161B] border border-amber-500/50 text-zinc-200 hover:text-[#FEF08A] font-display font-black italic uppercase text-xs sm:text-sm tracking-wider transform -skew-x-12 cursor-pointer transition-all"
            >
              <span className="transform skew-x-12 inline-block">
                BACK TO FIGHTERS
              </span>
            </button>

            {!isBrowseOnly && (
              <button
                type="button"
                data-testid="overview-select-character-btn"
                onClick={() => {
                  audio.playSound('click');
                  onSelectCharacter(currentId);
                }}
                className="flex-1 py-3.5 px-6 rounded-lg bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] hover:brightness-110 border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(245,158,11,0.5)] text-black font-display font-black italic uppercase text-base sm:text-lg tracking-wider transform -skew-x-12 cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <span className="transform skew-x-12 flex items-center gap-2">
                  <CheckCircle2 size={20} strokeWidth={2.5} />
                  <span>SELECT</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="h-1 shrink-0" />
    </div>
  );
};
