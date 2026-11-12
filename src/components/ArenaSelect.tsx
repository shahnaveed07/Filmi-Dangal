import React, { useState } from 'react';
import { ARENA_LIST, ARENAS } from '../data/arenas';
import { ArenaId } from '../types/fighter';
import { GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { ArenaPreview3D } from '../game3d/scenes/ArenaPreview3D';
import { ArenaCard, PrimaryButton, ScreenHeader } from './ui/FightFunUI';
import { Swords } from 'lucide-react';

interface ArenaSelectProps {
  onBack: () => void;
  onStartFight: () => void;
}

export const ArenaSelect: React.FC<ArenaSelectProps> = ({
  onBack,
  onStartFight,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();
  const [selectedArena, setSelectedArena] = useState<ArenaId>(bridge.arenaId);

  const activeArena = ARENAS[selectedArena];

  const handleSelect = (id: ArenaId) => {
    audio.playSound('click');
    setSelectedArena(id);
    bridge.arenaId = id;
  };

  return (
    <div
      data-testid="arena-select-screen"
      data-selected-arena={selectedArena}
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none overflow-y-auto"
    >
      <ScreenHeader
        title="SELECT ARENA"
        backLabel="FIGHTERS"
        onBack={() => {
          audio.playSound('click');
          onBack();
        }}
      />

      <div className="w-full max-w-5xl mx-auto my-auto flex flex-col gap-5 py-4">
        {/* LIVE 3D ARENA VIEWPORT PREVIEW */}
        <div className="relative">
          <ArenaPreview3D
            arenaId={selectedArena}
            className="w-full h-60 sm:h-72 md:h-80"
          />
          <div className="absolute bottom-3 left-4 pointer-events-none bg-black/75 backdrop-blur-sm px-3.5 py-1.5 rounded-lg border border-[#D6A447]/50">
            <div className="font-['Bungee'] text-base sm:text-xl text-[#FEF08A] tracking-wider">
              {activeArena.name}
            </div>
            <div className="text-[11px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[#D6A447]">
              {activeArena.subtitle}
            </div>
          </div>
        </div>

        {/* VISUAL ARENA SELECTOR CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ARENA_LIST.map((ar) => (
            <ArenaCard
              key={ar.id}
              arena={ar}
              isSelected={ar.id === selectedArena}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* CONFIRM ARENA & LAUNCH FIGHT */}
        <div className="w-full max-w-md mx-auto pt-1">
          <PrimaryButton
            data-start="true"
            data-testid="confirm-arena-fight-btn"
            fullWidth
            icon={<Swords size={22} />}
            onClick={() => {
              audio.playSound('click');
              onStartFight();
            }}
          >
            FIGHT!
          </PrimaryButton>
        </div>
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
