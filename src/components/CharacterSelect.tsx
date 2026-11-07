import React, { useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import { Difficulty, FighterId } from '../types/fighter';
import { GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { getCharacterMonogram } from '../game3d/characters/CharacterRoster3D';
import { ArrowLeft, Swords, Sparkles, Crosshair, Flame } from 'lucide-react';

interface CharacterSelectProps {
  onBack: () => void;
  onProceed: () => void;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({ onBack, onProceed }) => {
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
  const [selectingFor, setSelectingFor] = useState<'p1' | 'p2'>('p1');

  const selectedChar = CHARACTERS[selectingFor === 'p1' ? p1Id : p2Id];

  const handleSelectFighter = (id: FighterId) => {
    audio.playSound('click');
    if (selectingFor === 'p1') {
      const prevP1 = p1Id;
      setP1Id(id);
      bridge.p1CharacterId = id;
      if (p2Id === id) {
        const replacement =
          prevP1 !== id
            ? prevP1
            : CHARACTER_LIST.find((c) => c.id !== id)!.id;
        setP2Id(replacement);
        bridge.p2CharacterId = replacement;
      }
    } else {
      const prevP2 = p2Id;
      setP2Id(id);
      bridge.p2CharacterId = id;
      if (p1Id === id) {
        const replacement =
          prevP2 !== id
            ? prevP2
            : CHARACTER_LIST.find((c) => c.id !== id)!.id;
        setP1Id(replacement);
        bridge.p1CharacterId = replacement;
      }
    }
  };

  const handleDifficultyChange = (diff: Difficulty) => {
    audio.playSound('click');
    setDifficulty(diff);
    bridge.difficulty = diff;
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex flex-col justify-between p-3 sm:p-5 select-none overflow-y-auto">
      {/* TOP HEADER */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between border-b border-[#D6A447]/30 pb-2.5">
        <button
          onClick={() => {
            audio.playSound('click');
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-['Cinzel'] font-bold text-[#D6A447] hover:text-[#FEF08A] transition-colors py-1 px-3 bg-black/40 rounded border border-[#D6A447]/40 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>RETURN TO TITLE</span>
        </button>

        <div className="text-center">
          <h1 className="font-['Bungee'] text-lg sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] to-[#D6A447] tracking-wider">
            CHOOSE YOUR 3D FIGHTER
          </h1>
          <span className="text-[10px] font-['Cinzel'] font-bold text-[#FEF08A] uppercase tracking-widest">
            {bridge.gameMode === 'arcade'
              ? 'MODE: 3-STAGE ARCADE LADDER'
              : 'MODE: VERSUS CPU SINGLE MATCH'}
          </span>
        </div>

        {/* DIFFICULTY SELECTOR */}
        <div className="flex items-center gap-1 bg-black/50 p-1 rounded border border-[#D6A447]/40">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => handleDifficultyChange(d)}
              className={`px-2 py-0.5 text-[10px] sm:text-xs font-['Rajdhani'] font-black uppercase rounded transition-colors cursor-pointer ${
                difficulty === d ? 'bg-[#BE123C] text-[#FEF08A]' : 'text-[#D6A447] hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN SELECTION ARENA CONTAINER */}
      <div className="w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-4 py-3">
        {/* LEFT / CENTER: ROSTER GRID & TOGGLES */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          {/* PLAYER 1 vs OPPONENT SELECTOR TOGGLE */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectingFor('p1')}
              className={`flex-1 py-2 px-3 rounded font-['Rajdhani'] font-black text-xs sm:text-sm tracking-wider uppercase border-2 transition-all cursor-pointer ${
                selectingFor === 'p1'
                  ? 'bg-[#BE123C] border-[#FEF08A] text-white shadow-[0_0_12px_rgba(190,18,60,0.6)]'
                  : 'bg-[#1A1829] border-[#D6A447]/40 text-[#D6A447] opacity-75'
              }`}
            >
              PLAYER 1: {CHARACTERS[p1Id].name}
            </button>

            <button
              onClick={() => setSelectingFor('p2')}
              className={`flex-1 py-2 px-3 rounded font-['Rajdhani'] font-black text-xs sm:text-sm tracking-wider uppercase border-2 transition-all cursor-pointer ${
                selectingFor === 'p2'
                  ? 'bg-[#BE123C] border-[#FEF08A] text-white shadow-[0_0_12px_rgba(190,18,60,0.6)]'
                  : 'bg-[#1A1829] border-[#D6A447]/40 text-[#D6A447] opacity-75'
              }`}
            >
              CPU OPPONENT: {CHARACTERS[p2Id].name}
            </button>
          </div>

          {/* 4 FIGHTER ROSTER CARDS */}
          <div className="grid grid-cols-2 gap-3">
            {CHARACTER_LIST.map((char) => {
              const isP1 = char.id === p1Id;
              const isP2 = char.id === p2Id;
              const isCurrent = (selectingFor === 'p1' && isP1) || (selectingFor === 'p2' && isP2);

              return (
                <button
                  key={char.id}
                  onClick={() => handleSelectFighter(char.id)}
                  className={`relative p-3 rounded-lg border-2 text-left transition-all cursor-pointer overflow-hidden group ${
                    isCurrent
                      ? 'border-[#FEF08A] bg-gradient-to-br from-[#2D1B36] to-[#161424] shadow-[0_0_16px_rgba(214,164,71,0.5)] scale-[1.01]'
                      : 'border-[#D6A447]/40 bg-[#161424]/90 hover:border-[#D6A447] hover:bg-[#1E1B32]'
                  }`}
                >
                  {/* BADGES: P1 / CPU */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {isP1 && (
                      <span className="px-1.5 py-0.5 bg-[#BE123C] text-white text-[9px] font-black rounded border border-[#FEF08A]">
                        P1
                      </span>
                    )}
                    {isP2 && (
                      <span className="px-1.5 py-0.5 bg-[#0284C7] text-white text-[9px] font-black rounded border border-[#38BDF8]">
                        CPU
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-11 h-11 rounded-md flex items-center justify-center font-['Bungee'] text-sm text-[#FEF08A] border border-[#D6A447]/60 shrink-0 shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${char.visuals.primaryColor}, ${char.visuals.secondaryColor})`,
                      }}
                    >
                      {getCharacterMonogram(char.id)}
                    </div>
                    <div>
                      <h3 className="font-['Bungee'] text-sm sm:text-base text-[#F1E7D0] group-hover:text-[#FEF08A] transition-colors leading-tight">
                        {char.name}
                      </h3>
                      <p className="text-[11px] text-[#D6A447] font-['Rajdhani'] font-bold uppercase tracking-wider">
                        {char.style}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] text-white/75 line-clamp-2 leading-snug">
                    {char.bio}
                  </p>
                </button>
              );
            })}
          </div>

          {/* 3D COMBAT SYSTEM SPECS PREVIEW */}
          <div className="p-2.5 bg-black/40 rounded border border-[#D6A447]/30 text-xs text-[#F1E7D0]/80">
            <div className="flex items-center justify-between text-[#D6A447] font-bold font-['Rajdhani'] mb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} />
                <span className="uppercase">3D Costume &amp; Likeness Profile:</span>
              </div>
              <span className="text-[10px] font-mono text-amber-300">
                {selectedChar.visuals.actorInspiration}
              </span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-white/80">
              {selectedChar.visuals.attireDescription}
            </p>
          </div>
        </div>

        {/* RIGHT: REAL-TIME 3D PREVIEW + SIGNATURE ABILITIES DOSSIER */}
        <div className="lg:col-span-6 bg-[#161424] border-2 border-[#D6A447] rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between border-b border-[#D6A447]/40 pb-2 mb-2.5">
              <div>
                <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase tracking-widest">
                  3D FIGHTER DOSSIER ({selectedChar.stats.maxHealth} HP)
                </span>
                <h2 className="font-['Bungee'] text-xl sm:text-2xl text-[#FEF08A] leading-tight">
                  {selectedChar.name}
                </h2>
                <p className="text-xs font-['Rajdhani'] font-bold tracking-wide text-amber-200">
                  {selectedChar.title}
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center font-['Bungee'] text-lg text-[#FEF08A] border-2 border-[#FEF08A]/70 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${selectedChar.visuals.primaryColor}, ${selectedChar.visuals.secondaryColor})`,
                }}
              >
                {getCharacterMonogram(selectedChar.id)}
              </div>
            </div>

            {/* LIVE BABYLON.JS 3D CHARACTER PREVIEW */}
            <CharacterPreview3D characterId={selectedChar.id} />

            {/* STATS BARS */}
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <div className="bg-black/40 p-2 rounded border border-[#D6A447]/30">
                <div className="flex justify-between text-[10px] font-['Rajdhani'] font-bold text-[#D6A447]">
                  <span>POWER</span>
                  <span className="font-mono text-white">
                    {(selectedChar.stats.powerMultiplier * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 mt-1 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
                    style={{ width: `${selectedChar.stats.powerMultiplier * 75}%` }}
                  />
                </div>
              </div>

              <div className="bg-black/40 p-2 rounded border border-[#D6A447]/30">
                <div className="flex justify-between text-[10px] font-['Rajdhani'] font-bold text-[#D6A447]">
                  <span>SPEED</span>
                  <span className="font-mono text-white">
                    {(selectedChar.stats.walkSpeed * 20).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 mt-1 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#38BDF8] to-[#0284C7]"
                    style={{ width: `${selectedChar.stats.walkSpeed * 18}%` }}
                  />
                </div>
              </div>

              <div className="bg-black/40 p-2 rounded border border-[#D6A447]/30">
                <div className="flex justify-between text-[10px] font-['Rajdhani'] font-bold text-[#D6A447]">
                  <span>DEFENSE</span>
                  <span className="font-mono text-white">
                    {(selectedChar.stats.defenseMultiplier * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 mt-1 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#10B981] to-[#059669]"
                    style={{ width: `${selectedChar.stats.defenseMultiplier * 80}%` }}
                  />
                </div>
              </div>
            </div>

            {/* DUAL SIGNATURE ABILITIES: SUPERSHOT [U] & SUPERMOVE [L] */}
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2.5 bg-[#0284C7]/20 border border-[#38BDF8]/60 rounded">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-['Cinzel'] font-black text-[#38BDF8] uppercase">
                    <Crosshair size={12} />
                    <span>SUPERSHOT [U]: {selectedChar.superShotInfo.name}</span>
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-white/80 leading-snug">
                  {selectedChar.superShotInfo.description}
                </p>
              </div>

              <div className="p-2.5 bg-[#BE123C]/25 border border-[#BE123C] rounded">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-['Cinzel'] font-black text-[#FEF08A] uppercase">
                    <Flame size={12} />
                    <span>SUPERMOVE [L]: {selectedChar.superMoveInfo.name}</span>
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-white/80 leading-snug">
                  {selectedChar.superMoveInfo.description}
                </p>
              </div>
            </div>
          </div>

          {/* PROCEED BUTTON */}
          <button
            onClick={() => {
              audio.playSound('click');
              onProceed();
            }}
            className="mt-3 w-full py-3 bg-gradient-to-r from-[#D97706] to-[#BE123C] hover:brightness-110 text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] shadow-[0_0_16px_rgba(214,164,71,0.5)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Swords size={18} />
            <span>SELECT 3D ARENA &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
