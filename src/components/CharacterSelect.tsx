import React, { useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import { Difficulty, FighterId } from '../types/fighter';
import { GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { ArrowLeft, Swords, Sparkles } from 'lucide-react';

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
      // Enforce P1 and CPU cannot share the same character
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
      // Enforce P1 and CPU cannot share the same character
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
    <div className="relative w-full h-full min-h-screen bg-[#10111B] flex flex-col justify-between p-4 sm:p-6 select-none overflow-y-auto">
      {/* TOP HEADER */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between border-b border-[#D6A447]/30 pb-3">
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

        <h1 className="font-['Bungee'] text-xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] to-[#D6A447] tracking-wider text-center">
          CHOOSE YOUR FIGHTER
        </h1>

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
      <div className="w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-5 py-4">
        {/* LEFT / CENTER: ROSTER GRID & TOGGLES */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* PLAYER 1 vs OPPONENT SELECTOR TOGGLE */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectingFor('p1')}
              className={`flex-1 py-2 px-3 rounded font-['Rajdhani'] font-black text-sm tracking-wider uppercase border-2 transition-all cursor-pointer ${
                selectingFor === 'p1'
                  ? 'bg-[#BE123C] border-[#FEF08A] text-white shadow-[0_0_12px_rgba(190,18,60,0.6)]'
                  : 'bg-[#1A1829] border-[#D6A447]/40 text-[#D6A447] opacity-75'
              }`}
            >
              PLAYER 1: {CHARACTERS[p1Id].name}
            </button>

            <button
              onClick={() => setSelectingFor('p2')}
              className={`flex-1 py-2 px-3 rounded font-['Rajdhani'] font-black text-sm tracking-wider uppercase border-2 transition-all cursor-pointer ${
                selectingFor === 'p2'
                  ? 'bg-[#BE123C] border-[#FEF08A] text-white shadow-[0_0_12px_rgba(190,18,60,0.6)]'
                  : 'bg-[#1A1829] border-[#D6A447]/40 text-[#D6A447] opacity-75'
              }`}
            >
              CPU OPPONENT: {CHARACTERS[p2Id].name}
            </button>
          </div>

          {/* 4 FIGHTER ROSTER CARDS */}
          <div className="grid grid-cols-2 gap-3.5">
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
                      ? 'border-[#FEF08A] bg-gradient-to-br from-[#2D1B36] to-[#161424] shadow-[0_0_16px_rgba(214,164,71,0.5)] scale-[1.02]'
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

                  <div className="flex items-center gap-3">
                    <span className="text-3xl p-1 bg-black/40 rounded border border-[#D6A447]/30">
                      {char.visuals.avatarIcon}
                    </span>
                    <div>
                      <h3 className="font-['Bungee'] text-sm sm:text-base text-[#F1E7D0] group-hover:text-[#FEF08A] transition-colors leading-tight">
                        {char.name}
                      </h3>
                      <p className="text-[11px] text-[#D6A447] font-['Rajdhani'] font-bold uppercase tracking-wider">
                        {char.style}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] text-white/60 line-clamp-1 italic font-serif">
                    &quot;{char.dialogues.intro}&quot;
                  </p>
                </button>
              );
            })}
          </div>

          {/* COMBAT SYSTEM SPECS PREVIEW */}
          <div className="p-3 bg-black/40 rounded border border-[#D6A447]/30 text-xs text-[#F1E7D0]/80">
            <div className="flex items-center gap-1.5 text-[#D6A447] font-bold font-['Rajdhani'] mb-1">
              <Sparkles size={14} />
              <span className="uppercase">Match Regulations:</span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed">
              Max HP: {selectedChar.stats.maxHealth} · Best of 3 Rounds · 60s Round Timer · Authentic Combos &amp; Frame Traps · Procedural Audio
            </p>
          </div>
        </div>

        {/* RIGHT: SELECTED FIGHTER DETAILS DOSSIER */}
        <div className="lg:col-span-5 bg-[#161424] border-2 border-[#D6A447] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          {/* Top Info */}
          <div>
            <div className="flex items-center justify-between border-b border-[#D6A447]/40 pb-2">
              <div>
                <span className="text-[10px] font-['Cinzel'] font-bold text-[#D6A447] uppercase tracking-widest">
                  FIGHTER DOSSIER ({selectedChar.stats.maxHealth} HP)
                </span>
                <h2 className="font-['Bungee'] text-2xl text-[#FEF08A]">{selectedChar.name}</h2>
              </div>
              <span className="text-4xl">{selectedChar.visuals.avatarIcon}</span>
            </div>

            <p className="text-xs text-[#F1E7D0] font-['Rajdhani'] font-bold tracking-wide mt-1 text-amber-200">
              {selectedChar.title}
            </p>

            <div className="mt-1 text-[11px] text-white/70 italic bg-black/30 p-2 rounded border border-[#D6A447]/20">
              &quot;{selectedChar.dialogues.introHindi}&quot;
            </div>

            {/* STATS BARS */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold text-[#D6A447]">
                <span>POWER / DAMAGE:</span>
                <span className="font-mono text-white">{(selectedChar.stats.powerMultiplier * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-[#D6A447]/40">
                <div
                  className="h-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
                  style={{ width: `${selectedChar.stats.powerMultiplier * 75}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold text-[#D6A447]">
                <span>SPEED &amp; MOBILITY:</span>
                <span className="font-mono text-white">{(selectedChar.stats.walkSpeed * 20).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-[#D6A447]/40">
                <div
                  className="h-full bg-gradient-to-r from-[#38BDF8] to-[#0284C7]"
                  style={{ width: `${selectedChar.stats.walkSpeed * 18}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold text-[#D6A447]">
                <span>DEFENSE &amp; ARMOR:</span>
                <span className="font-mono text-white">{(selectedChar.stats.defenseMultiplier * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-[#D6A447]/40">
                <div
                  className="h-full bg-gradient-to-r from-[#10B981] to-[#059669]"
                  style={{ width: `${selectedChar.stats.defenseMultiplier * 80}%` }}
                />
              </div>
            </div>

            {/* SIGNATURE SUPER ATTACK */}
            <div className="mt-4 p-3 bg-gradient-to-r from-[#BE123C]/30 to-[#9E1B32]/10 border border-[#BE123C] rounded">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-['Cinzel'] font-black text-[#FEF08A] uppercase tracking-wider">
                  SUPER MOVE: {selectedChar.specialMoveName}
                </span>
                <span className="text-xs text-[#D6A447] font-bold">{selectedChar.specialMoveHindi}</span>
              </div>
              <p className="mt-1 text-[11px] text-white/80 leading-snug">
                {selectedChar.specialDescription}
              </p>
            </div>
          </div>

          {/* PROCEED BUTTON */}
          <button
            onClick={() => {
              audio.playSound('click');
              onProceed();
            }}
            className="mt-5 w-full py-3.5 bg-gradient-to-r from-[#D97706] to-[#BE123C] hover:brightness-110 text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] shadow-[0_0_16px_rgba(214,164,71,0.5)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Swords size={18} />
            <span>SELECT ARENA &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
