import React, { useMemo, useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../data/characters';
import {
  CharacterDef,
  Difficulty,
  FighterId,
  TrainingDummyBehavior,
} from '../types/fighter';
import { CharacterSelectMode, GameBridge } from '../engine/GameBridge';
import { AudioManager } from '../engine/AudioManager';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { applyFighterSelection } from '../game3d/characters/CharacterRoster3D';
import {
  CharacterPortrait,
  CharacterRoster,
  CharacterStats,
  ScreenHeader,
  WindowUtilityControls,
} from './ui/FightFunUI';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Flame,
  Info,
  Search,
} from 'lucide-react';

export type CharacterDetailTab = 'overview' | 'skills' | 'bio';
export type CharacterRoleFilter = 'ALL' | 'POWER' | 'BALANCED' | 'SPEED';

/**
 * Pure helper for filtering the dynamic character roster by search query and role filter.
 */
export function filterCharactersByQuery(
  characters: CharacterDef[],
  searchQuery: string,
  roleFilter: CharacterRoleFilter = 'ALL'
): CharacterDef[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return characters.filter((char) => {
    if (roleFilter !== 'ALL') {
      const hay = `${char.archetype} ${char.style}`.toUpperCase();
      if (roleFilter === 'POWER' && !hay.includes('POWER') && !hay.includes('HEAVY')) {
        return false;
      }
      if (roleFilter === 'BALANCED' && !hay.includes('BALANCED')) {
        return false;
      }
      if (roleFilter === 'SPEED' && !hay.includes('SPEED')) {
        return false;
      }
    }

    if (!normalizedQuery) return true;
    return (
      char.name.toLowerCase().includes(normalizedQuery) ||
      char.archetype.toLowerCase().includes(normalizedQuery) ||
      char.style.toLowerCase().includes(normalizedQuery) ||
      char.id.toLowerCase().includes(normalizedQuery)
    );
  });
}

interface CharacterSelectProps {
  mode?: CharacterSelectMode;
  onBack: () => void;
  onProceed: () => void;
  onOpenOverview: (id: FighterId) => void;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  mode,
  onBack,
  onProceed,
  onOpenOverview,
}) => {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const resolvedMode: CharacterSelectMode =
    mode ?? (bridge.characterSelectBrowseOnly ? 'browse' : 'match');
  const isBrowseOnly = resolvedMode === 'browse';

  const [browsedId, setBrowsedId] = useState<FighterId>(
    bridge.inspectedCharacterId || bridge.p1CharacterId
  );

  const [p1Id, setP1Id] = useState<FighterId>(bridge.p1CharacterId);
  const [p2Id, setP2Id] = useState<FighterId>(() => {
    if (bridge.p2CharacterId === bridge.p1CharacterId) {
      const alt = CHARACTER_LIST.find((c) => c.id !== bridge.p1CharacterId)!;
      if (!isBrowseOnly) {
        bridge.p2CharacterId = alt.id;
      }
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

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<CharacterRoleFilter>('ALL');
  const [activeTab, setActiveTab] = useState<CharacterDetailTab>('overview');

  const activeFighterId: FighterId = isBrowseOnly
    ? browsedId
    : selectingFor === 'p1'
    ? p1Id
    : p2Id;
  const selectedChar = CHARACTERS[activeFighterId] || CHARACTERS.action_sultan;
  const isTraining = bridge.gameMode === 'training';
  const p2Label = isTraining ? 'DUMMY' : 'CPU';

  const filteredCharacters = useMemo(
    () => filterCharactersByQuery(CHARACTER_LIST, searchQuery, roleFilter),
    [searchQuery, roleFilter]
  );

  const handleSelectFighter = (id: FighterId) => {
    audio.playSound('click');
    if (isBrowseOnly) {
      setBrowsedId(id);
      bridge.inspectedCharacterId = id;
      return;
    }
    const next = applyFighterSelection({ p1Id, p2Id, selectingFor }, id);
    setP1Id(next.p1Id);
    setP2Id(next.p2Id);
    bridge.p1CharacterId = next.p1Id;
    bridge.p2CharacterId = next.p2Id;
    bridge.inspectedCharacterId = id;
  };

  const handleCycleFighter = (delta: number) => {
    const idx = CHARACTER_LIST.findIndex((c) => c.id === selectedChar.id);
    const nextIdx = (idx + delta + CHARACTER_LIST.length) % CHARACTER_LIST.length;
    handleSelectFighter(CHARACTER_LIST[nextIdx].id);
  };

  const handleSlotChange = (slot: 'p1' | 'p2') => {
    if (isBrowseOnly) return;
    audio.playSound('click');
    setSelectingFor(slot);
    bridge.selectingPlayerSlot = slot;
    bridge.inspectedCharacterId = slot === 'p1' ? p1Id : p2Id;
  };

  const handleDifficultyChange = (diff: Difficulty) => {
    if (isBrowseOnly) return;
    audio.playSound('click');
    setDifficulty(diff);
    bridge.difficulty = diff;
  };

  const handleDummyBehaviorChange = (behavior: TrainingDummyBehavior) => {
    if (isBrowseOnly) return;
    audio.playSound('click');
    setDummyBehavior(behavior);
    bridge.setTrainingDummyBehavior(behavior);
  };

  const CycleRoleFilter = () => {
    const order: CharacterRoleFilter[] = ['ALL', 'POWER', 'BALANCED', 'SPEED'];
    const next = order[(order.indexOf(roleFilter) + 1) % order.length];
    audio.playSound('click');
    setRoleFilter(next);
  };

  // Split display name into lead word + golden accent word for header styling
  const nameParts = selectedChar.name.trim().split(/\s+/);
  const firstWord = nameParts[0] || selectedChar.name;
  const restWords = nameParts.slice(1).join(' ');

  return (
    <div
      data-testid="character-select-screen"
      data-select-mode={resolvedMode}
      data-p1-id={p1Id}
      data-p2-id={p2Id}
      data-selecting-for={isBrowseOnly ? 'browse' : selectingFor}
      className="relative w-full h-full bg-[#070406] flex flex-col justify-between px-4 py-3 sm:px-7 sm:py-4 md:px-10 md:py-5 select-none overflow-y-auto lg:overflow-hidden overflow-x-hidden"
    >
      {/* ATMOSPHERIC CRIMSON & GOLD STAGE LIGHTING */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 44% 52% at 50% 56%, rgba(220, 38, 38, 0.16) 0%, rgba(245, 158, 11, 0.06) 45%, rgba(7, 4, 6, 0.98) 82%), repeating-linear-gradient(135deg, rgba(220,38,38,0.06) 0px, rgba(220,38,38,0.06) 3px, transparent 3px, transparent 28px)',
        }}
      />

      {/* TOP BAR: BACK + FIGHT FUN | CHARACTERS + MATCH SETTINGS + UTILITY CONTROLS */}
      <div className="relative z-20 w-full">
        <ScreenHeader
          title="CHARACTERS"
          onBack={() => {
            audio.playSound('click');
            onBack();
          }}
          rightSlot={
            <div className="flex items-center gap-2.5">
              {!isBrowseOnly &&
                (isTraining ? (
                  <div className="hidden sm:flex items-center gap-1 bg-[#140B0E] p-1 rounded-md border border-[#38BDF8]/45">
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
                        className={`px-2 py-0.5 text-[10px] font-display font-black uppercase rounded transition-colors cursor-pointer ${
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
                  <div className="hidden sm:flex items-center gap-1 bg-[#140B0E] p-1 rounded-md border border-amber-500/45">
                    {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleDifficultyChange(d)}
                        className={`px-2.5 py-0.5 text-[10px] sm:text-xs font-display font-black uppercase rounded transition-colors cursor-pointer ${
                          difficulty === d
                            ? 'bg-[#BE123C] text-[#FEF08A]'
                            : 'text-amber-300/80 hover:text-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                ))}

              <WindowUtilityControls />
            </div>
          }
        />
      </div>

      {/* MAIN 3-COLUMN CHARACTERS LAYOUT */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-center py-2">
        {/* LEFT COLUMN: SCROLLABLE 3-COLUMN ROSTER PANEL */}
        <div className="lg:col-span-4 flex flex-col gap-2.5">
          {/* P1 / P2 SLOT SWITCHER (MATCH MODE ONLY) */}
          {!isBrowseOnly && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="select-slot-p1"
                onClick={() => handleSlotChange('p1')}
                className={`py-2 px-3 rounded-lg font-display font-black italic text-xs tracking-wider uppercase border transition-all cursor-pointer truncate ${
                  selectingFor === 'p1'
                    ? 'bg-gradient-to-r from-[#991B1B] to-[#DC2626] border-[#FEF08A] text-white shadow-[0_0_14px_rgba(220,38,38,0.5)]'
                    : 'bg-[#120A0D] border-amber-500/35 text-amber-300/85 hover:border-amber-400'
                }`}
              >
                P1: {CHARACTERS[p1Id].name}
              </button>

              <button
                type="button"
                data-testid="select-slot-p2"
                onClick={() => handleSlotChange('p2')}
                className={`py-2 px-3 rounded-lg font-display font-black italic text-xs tracking-wider uppercase border transition-all cursor-pointer truncate ${
                  selectingFor === 'p2'
                    ? 'bg-gradient-to-r from-[#0369A1] to-[#0284C7] border-[#FEF08A] text-white shadow-[0_0_14px_rgba(2,132,199,0.5)]'
                    : 'bg-[#120A0D] border-amber-500/35 text-amber-300/85 hover:border-amber-400'
                }`}
              >
                {p2Label}: {CHARACTERS[p2Id].name}
              </button>
            </div>
          )}

          {/* ROSTER CONTAINER */}
          <div className="bg-[#0B0709]/95 border border-red-600/70 rounded-xl p-3 sm:p-3.5 shadow-[0_0_30px_rgba(0,0,0,0.9)] flex flex-col gap-3">
            {/* FILTER & SEARCH BAR */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="character-role-filter"
                onClick={CycleRoleFilter}
                className="px-3 py-2 rounded-md bg-gradient-to-b from-[#6B1018] to-[#2D070B] border border-red-500/75 text-white font-display font-black italic text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 transform -skew-x-6 cursor-pointer hover:brightness-110"
                title="Filter by Fighter Role"
              >
                <span className="transform skew-x-6 flex items-center gap-1.5">
                  <span>{roleFilter}</span>
                  <ChevronDown size={13} className="text-amber-300" />
                </span>
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  data-testid="character-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Character..."
                  aria-label="Search Character"
                  className="w-full py-2 pl-3 pr-8 rounded-md bg-[#120D10] border border-white/20 focus:border-amber-400 text-xs text-white placeholder:text-zinc-400 placeholder:italic focus:outline-none transition-colors"
                />
                <Search
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-300 pointer-events-none"
                />
              </div>
            </div>

            {/* SCROLLABLE 3-COLUMN ROSTER GRID */}
            <div
              data-testid="character-roster-scroll"
              className="max-h-[380px] sm:max-h-[430px] overflow-y-auto pr-1"
            >
              {filteredCharacters.length > 0 ? (
                <CharacterRoster
                  characters={filteredCharacters}
                  p1Id={p1Id}
                  p2Id={p2Id}
                  focusedId={selectedChar.id}
                  showP1Indicator={!isBrowseOnly}
                  showP2Indicator={!isBrowseOnly}
                  p2Label={p2Label}
                  columns={3}
                  onSelectCharacter={handleSelectFighter}
                />
              ) : (
                <div className="py-10 text-center text-xs text-zinc-400 italic">
                  No fighters match &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTRE COLUMN: LARGE FULL-BODY 3D FIGHTER PREVIEW WITH LEFT/RIGHT CYCLE ARROWS */}
        <div className="lg:col-span-4 relative flex items-center justify-center">
          {/* Left Cycle Button */}
          <button
            type="button"
            data-testid="character-cycle-prev"
            onClick={() => handleCycleFighter(-1)}
            className="absolute left-1 sm:left-2 z-20 w-10 h-10 rounded-md bg-[#140D10]/90 hover:bg-[#26161B] border border-amber-400/75 hover:border-[#FEF08A] text-[#FACC15] flex items-center justify-center transform -skew-x-6 cursor-pointer shadow-[0_0_16px_rgba(0,0,0,0.85)] transition-all"
            title="Previous Character"
            aria-label="Previous Character"
          >
            <span className="transform skew-x-6">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </span>
          </button>

          <CharacterPreview3D
            characterId={selectedChar.id}
            variant="overview"
            frameless={true}
            showAnimationBar={false}
            className="w-full h-72 sm:h-80 md:h-[420px] lg:h-[460px]"
          />

          {/* Right Cycle Button */}
          <button
            type="button"
            data-testid="character-cycle-next"
            onClick={() => handleCycleFighter(1)}
            className="absolute right-1 sm:right-2 z-20 w-10 h-10 rounded-md bg-[#140D10]/90 hover:bg-[#26161B] border border-amber-400/75 hover:border-[#FEF08A] text-[#FACC15] flex items-center justify-center transform -skew-x-6 cursor-pointer shadow-[0_0_16px_rgba(0,0,0,0.85)] transition-all"
            title="Next Character"
            aria-label="Next Character"
          >
            <span className="transform skew-x-6">
              <ChevronRight size={20} strokeWidth={2.5} />
            </span>
          </button>
        </div>

        {/* RIGHT COLUMN: CHARACTER IDENTITY BANNER, TABS (OVERVIEW/SKILLS/BIO), STATS & SELECT CTA */}
        <div className="lg:col-span-4 flex flex-col gap-3.5">
          {/* ANGULAR CRIMSON/GOLD CHARACTER HEADER BANNER */}
          <div className="relative overflow-hidden rounded-xl border border-red-500/65 bg-gradient-to-r from-[#580B12] via-[#2B070B] to-[#0E080A] px-5 py-3.5 shadow-[0_0_24px_rgba(220,38,38,0.22)] flex items-center justify-between">
            <div className="relative z-10">
              <h2
                data-testid="selected-character-name"
                className="font-display font-black italic uppercase text-2xl sm:text-3xl md:text-4xl tracking-wide leading-none drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]"
              >
                <span className="text-white">{firstWord}</span>
                {restWords ? (
                  <span className="text-[#FACC15] ml-2">{restWords}</span>
                ) : null}
              </h2>
              <p
                data-testid="selected-character-archetype"
                className="font-display font-bold italic text-xs sm:text-sm text-zinc-200 tracking-wide mt-1"
              >
                {selectedChar.archetype}
              </p>
            </div>

            {/* Subtle Monochrome Portrait Crest on Right */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 -my-2 -mr-2 pointer-events-none shrink-0">
              <CharacterPortrait
                character={selectedChar}
                size="sm"
                monochrome={true}
              />
            </div>
          </div>

          {/* TABS ROW: OVERVIEW | SKILLS | BIO + DEDICATED OVERVIEW BUTTON */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="tab-overview"
              onClick={() => {
                audio.playSound('click');
                setActiveTab('overview');
              }}
              className={`flex-1 py-2 px-3 rounded-md font-display font-black italic uppercase text-xs sm:text-sm tracking-wider transform -skew-x-12 border transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] text-black border-[#FEF08A] shadow-[0_0_16px_rgba(250,204,21,0.45)]'
                  : 'bg-[#120C0E]/95 text-zinc-200 border-white/20 hover:border-amber-400/60'
              }`}
            >
              <span className="transform skew-x-12 inline-block">OVERVIEW</span>
            </button>

            <button
              type="button"
              data-testid="tab-skills"
              onClick={() => {
                audio.playSound('click');
                setActiveTab('skills');
              }}
              className={`flex-1 py-2 px-3 rounded-md font-display font-black italic uppercase text-xs sm:text-sm tracking-wider transform -skew-x-12 border transition-all cursor-pointer ${
                activeTab === 'skills'
                  ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] text-black border-[#FEF08A] shadow-[0_0_16px_rgba(250,204,21,0.45)]'
                  : 'bg-[#120C0E]/95 text-zinc-200 border-white/20 hover:border-amber-400/60'
              }`}
            >
              <span className="transform skew-x-12 inline-flex items-center gap-1.5">
                <Flame size={13} />
                <span>SKILLS</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="tab-bio"
              onClick={() => {
                audio.playSound('click');
                setActiveTab('bio');
              }}
              className={`flex-1 py-2 px-3 rounded-md font-display font-black italic uppercase text-xs sm:text-sm tracking-wider transform -skew-x-12 border transition-all cursor-pointer ${
                activeTab === 'bio'
                  ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] text-black border-[#FEF08A] shadow-[0_0_16px_rgba(250,204,21,0.45)]'
                  : 'bg-[#120C0E]/95 text-zinc-200 border-white/20 hover:border-amber-400/60'
              }`}
            >
              <span className="transform skew-x-12 inline-flex items-center gap-1.5">
                <FileText size={13} />
                <span>BIO</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="view-character-overview"
              onClick={() => {
                audio.playSound('click');
                bridge.inspectedCharacterId = selectedChar.id;
                onOpenOverview(selectedChar.id);
              }}
              className="p-2 rounded-md bg-[#120C0E]/95 hover:bg-[#1E1418] text-[#FACC15] border border-amber-500/45 hover:border-[#FEF08A] transition-colors cursor-pointer shrink-0"
              title="Full-Screen Fighter Overview"
              aria-label="Full-Screen Fighter Overview"
            >
              <Eye size={16} />
            </button>
          </div>

          {/* TAB CONTENT */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-3">
              {/* 6-SEGMENT SKEWED GOLD STAT BARS */}
              <CharacterStats character={selectedChar} borderVariant="crimson" />

              {/* CHARACTER INFO PANEL */}
              <div
                data-testid="character-info-box"
                className="bg-[#0E090B]/95 border border-red-600/75 rounded-xl p-4 shadow-[0_0_20px_rgba(220,38,38,0.14)]"
              >
                <div className="flex items-center gap-2 text-[#FACC15] font-display font-extrabold italic text-sm mb-1.5">
                  <Info size={16} className="text-zinc-200 shrink-0" />
                  <span>Character Info</span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-200 italic leading-relaxed">
                  {selectedChar.bio}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'skills' && (
            <div
              data-testid="character-skills-box"
              className="flex flex-col gap-3"
            >
              <div className="bg-[#0E090B]/95 border border-red-600/75 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-display font-black uppercase tracking-wider text-[#38BDF8]">
                    SUPER SHOT (25% METER)
                  </span>
                  <span className="text-[10px] font-mono text-amber-300">
                    {selectedChar.superShotInfo.command}
                  </span>
                </div>
                <h3 className="font-display font-black italic uppercase text-base text-[#FEF08A]">
                  {selectedChar.superShotInfo.name}
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  {selectedChar.superShotInfo.description}
                </p>
              </div>

              <div className="bg-[#0E090B]/95 border border-amber-500/65 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-display font-black uppercase tracking-wider text-[#FACC15]">
                    SUPER MOVE (100% METER)
                  </span>
                  <span className="text-[10px] font-mono text-amber-300">
                    {selectedChar.superMoveInfo.command}
                  </span>
                </div>
                <h3 className="font-display font-black italic uppercase text-base text-[#FEF08A]">
                  {selectedChar.superMoveInfo.name}
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  {selectedChar.superMoveInfo.description}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'bio' && (
            <div
              data-testid="character-bio-box"
              className="bg-[#0E090B]/95 border border-red-600/75 rounded-xl p-4 flex flex-col gap-2.5"
            >
              <div>
                <div className="text-[11px] font-display font-black uppercase tracking-wider text-[#FACC15]">
                  SIGNATURE ATTIRE
                </div>
                <p className="text-xs text-zinc-200 mt-0.5 leading-relaxed">
                  {selectedChar.visuals.costumeDescription}
                </p>
              </div>
              <div className="border-t border-white/10 pt-2">
                <div className="text-[11px] font-display font-black uppercase tracking-wider text-[#FACC15]">
                  INTRO QUOTE
                </div>
                <p className="text-xs text-amber-200 italic mt-0.5">
                  &ldquo;{selectedChar.dialogues.intro}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* BOTTOM ACTION CTA (ANGLED GOLDEN SELECT BUTTON) */}
          <div className="pt-1 px-2 py-1 overflow-hidden flex items-center gap-3">
            {isBrowseOnly ? (
              <>
                <button
                  type="button"
                  data-testid="browse-done-btn"
                  onClick={() => {
                    audio.playSound('click');
                    onBack();
                  }}
                  className="py-3.5 px-5 rounded-lg bg-[#140D10] hover:bg-[#22161B] border border-amber-500/50 text-zinc-200 hover:text-[#FEF08A] font-display font-black italic uppercase text-xs sm:text-sm tracking-wider transform -skew-x-6 cursor-pointer transition-all"
                >
                  <span className="transform skew-x-6 inline-block">BACK</span>
                </button>

                <button
                  type="button"
                  data-testid="browse-overview-cta"
                  onClick={() => {
                    audio.playSound('click');
                    bridge.inspectedCharacterId = selectedChar.id;
                    onOpenOverview(selectedChar.id);
                  }}
                  className="flex-1 py-3.5 px-6 rounded-lg bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] hover:brightness-110 border-2 border-[#FEF08A] text-black font-display font-black italic uppercase text-lg sm:text-xl tracking-wider transform -skew-x-6 cursor-pointer transition-all flex items-center justify-center gap-2.5"
                >
                  <span className="transform skew-x-6 flex items-center gap-2.5">
                    <CheckCircle2 size={22} strokeWidth={2.5} />
                    <span>SELECT</span>
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="confirm-character-select"
                onClick={() => {
                  audio.playSound('click');
                  onProceed();
                }}
                className="w-full py-3.5 px-6 rounded-lg bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] hover:brightness-110 border-2 border-[#FEF08A] text-black font-display font-black italic uppercase text-lg sm:text-xl tracking-wider transform -skew-x-6 cursor-pointer transition-all flex items-center justify-center gap-2.5"
              >
                <span className="transform skew-x-6 flex items-center gap-2.5">
                  <CheckCircle2 size={22} strokeWidth={2.5} />
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
