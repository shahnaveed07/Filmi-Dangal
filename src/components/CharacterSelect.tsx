import React, { useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import { Difficulty, FighterId, TrainingDummyBehavior } from '../types/fighter';
import { GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { applyFighterSelection } from '../game3d/characters/CharacterRoster3D';
import {
  CharacterRoster,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
} from './ui/FightFunUI';
import { Swords, Eye } from 'lucide-react';

interface CharacterSelectProps {
  onBack: () => void;
  onProceed: () => void;
  onOpenOverview: (id: FighterId) => void;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  onBack,
  onProceed,
  onOpenOverview,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const [p1Id, setP1Id] = useState<FighterId>(bridge.p1CharacterId);
  const [p2Id, setP2Id] = useState<FighterId>(() => {
    if (bridge.p2CharacterId === bridge.p1CharacterId) {
      const alt = CHARACTER_LIST.find((c) => c.id !== bridge.p1CharacterId)!;
      bridge.p2CharacterId = alt.id;
      return alt.id;
    }
    return bridge.p2CharacterId;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>(bridge.difficulty);
  const [dummyBehavior, setDummyBehavior] = useState<TrainingDummyBehavior>(
    bridge.trainingDummyBehavior
  );
  const [selectingFor, setSelectingFor] = useState<'p1' | 'p2'>(
    bridge.selectingPlayerSlot || 'p1'
  );

  const selectedChar = CHARACTERS[selectingFor === 'p1' ? p1Id : p2Id];
  const isTraining = bridge.gameMode === 'training';
  const p2Label = isTraining ? 'DUMMY' : 'CPU';

  const handleSelectFighter = (id: FighterId) => {
    audio.playSound('click');
    const next = applyFighterSelection({ p1Id, p2Id, selectingFor }, id);
    setP1Id(next.p1Id);
    setP2Id(next.p2Id);
    bridge.p1CharacterId = next.p1Id;
    bridge.p2CharacterId = next.p2Id;
    bridge.inspectedCharacterId = id;
  };

  const handleSlotChange = (slot: 'p1' | 'p2') => {
    audio.playSound('click');
    setSelectingFor(slot);
    bridge.selectingPlayerSlot = slot;
    bridge.inspectedCharacterId = slot === 'p1' ? p1Id : p2Id;
  };

  const handleDifficultyChange = (diff: Difficulty) => {
    audio.playSound('click');
    setDifficulty(diff);
    bridge.difficulty = diff;
  };

  const handleDummyBehaviorChange = (behavior: TrainingDummyBehavior) => {
    audio.playSound('click');
    setDummyBehavior(behavior);
    bridge.setTrainingDummyBehavior(behavior);
  };

  return (
    <div
      data-testid="character-select-screen"
      data-p1-id={p1Id}
      data-p2-id={p2Id}
      data-selecting-for={selectingFor}
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none overflow-y-auto"
    >
      <ScreenHeader
        title="FIGHTERS"
        onBack={() => {
          audio.playSound('click');
          onBack();
        }}
        rightSlot={
          isTraining ? (
            <div className="flex items-center gap-1 bg-[#141222] p-1 rounded-lg border border-[#38BDF8]/40">
              {(
                [
                  { id: 'stand', label: 'Stand' },
                  { id: 'block', label: 'Block' },
                  { id: 'crouch', label: 'Crouch' },
                  { id: 'jump', label: 'Jump' },
                  { id: 'cpu_spar', label: 'Spar' },
                ] as Array<{ id: TrainingDummyBehavior; label: string }>
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleDummyBehaviorChange(b.id)}
                  className={`px-2 py-0.5 text-[10px] font-['Rajdhani'] font-black uppercase rounded transition-colors cursor-pointer ${
                    dummyBehavior === b.id
                      ? 'bg-[#0284C7] text-white'
                      : 'text-[#38BDF8] hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#141222] p-1 rounded-lg border border-[#D6A447]/40">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDifficultyChange(d)}
                  className={`px-2.5 py-0.5 text-[10px] sm:text-xs font-['Rajdhani'] font-black uppercase rounded transition-colors cursor-pointer ${
                    difficulty === d
                      ? 'bg-[#BE123C] text-[#FEF08A]'
                      : 'text-[#D6A447] hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )
        }
      />

      {/* MAIN SELECTION SPLIT: ROSTER LEFT, LARGE 3D PREVIEW RIGHT */}
      <div className="w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-center py-3">
        {/* LEFT COLUMN: P1/P2 SLOT SELECTORS + 4 FIGHTER CARDS */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          {/* P1 / P2 SLOT TOGGLE */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="select-slot-p1"
              onClick={() => handleSlotChange('p1')}
              className={`py-2.5 px-3 rounded-xl font-['Rajdhani'] font-black text-xs sm:text-sm tracking-wider uppercase border-2 transition-all cursor-pointer truncate ${
                selectingFor === 'p1'
                  ? 'bg-[#BE123C] border-[#FEF08A] text-white shadow-[0_0_14px_rgba(190,18,60,0.55)]'
                  : 'bg-[#141222] border-[#D6A447]/35 text-[#D6A447] opacity-80 hover:opacity-100'
              }`}
            >
              P1: {CHARACTERS[p1Id].name}
            </button>

            <button
              type="button"
              data-testid="select-slot-p2"
              onClick={() => handleSlotChange('p2')}
              className={`py-2.5 px-3 rounded-xl font-['Rajdhani'] font-black text-xs sm:text-sm tracking-wider uppercase border-2 transition-all cursor-pointer truncate ${
                selectingFor === 'p2'
                  ? 'bg-[#0284C7] border-[#FEF08A] text-white shadow-[0_0_14px_rgba(2,132,199,0.55)]'
                  : 'bg-[#141222] border-[#D6A447]/35 text-[#D6A447] opacity-80 hover:opacity-100'
              }`}
            >
              {p2Label}: {CHARACTERS[p2Id].name}
            </button>
          </div>

          {/* ROSTER GRID */}
          <CharacterRoster
            characters={CHARACTER_LIST}
            p1Id={p1Id}
            p2Id={p2Id}
            focusedId={selectedChar.id}
            p2Label={p2Label}
            onSelectCharacter={handleSelectFighter}
          />
        </div>

        {/* RIGHT COLUMN: LARGE 3D CHARACTER PREVIEW + SELECTED IDENTITY + ACTIONS */}
        <div className="lg:col-span-7 bg-[#141222]/90 border-2 border-[#D6A447]/65 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[#D6A447]">
                {selectedChar.archetype}
              </span>
              <h2 className="font-['Bungee'] text-2xl sm:text-3xl text-[#FEF08A] tracking-wide leading-tight">
                {selectedChar.name}
              </h2>
            </div>

            <SecondaryButton
              data-testid="view-character-overview"
              icon={<Eye size={16} />}
              onClick={() => {
                audio.playSound('click');
                bridge.inspectedCharacterId = selectedChar.id;
                onOpenOverview(selectedChar.id);
              }}
              className="py-2 px-3.5 text-xs"
            >
              OVERVIEW
            </SecondaryButton>
          </div>

          {/* PRIMARY 3D FIGHTER PREVIEW */}
          <CharacterPreview3D
            characterId={selectedChar.id}
            variant="select"
            showAnimationBar={true}
            className="w-full h-64 sm:h-72 md:h-80"
          />

          <PrimaryButton
            data-testid="confirm-character-select"
            fullWidth
            icon={<Swords size={20} />}
            onClick={() => {
              audio.playSound('click');
              onProceed();
            }}
          >
            CONFIRM FIGHTERS
          </PrimaryButton>
        </div>
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
