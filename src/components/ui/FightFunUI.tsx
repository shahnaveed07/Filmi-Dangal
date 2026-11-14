import React from 'react';
import { ArenaDef, CharacterDef, FighterId } from '../../types/fighter';
import { ArrowLeft, Award, Film, X } from 'lucide-react';

// ============================================================================
// BUTTONS
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  icon,
  fullWidth = false,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={`${
      fullWidth ? 'w-full' : ''
    } py-3.5 px-6 bg-gradient-to-r from-[#BE123C] via-[#DC2626] to-[#D97706] hover:brightness-110 text-white font-['Bungee'] text-sm sm:text-base tracking-wider rounded-lg border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(220,38,38,0.5)] active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${className}`}
    {...rest}
  >
    {icon && <span className="text-[#FEF08A] shrink-0">{icon}</span>}
    <span>{children}</span>
  </button>
);

export const SecondaryButton: React.FC<ButtonProps> = ({
  children,
  icon,
  fullWidth = false,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={`${
      fullWidth ? 'w-full' : ''
    } py-3 px-5 bg-[#171526] hover:bg-[#231F38] text-[#F1E7D0] hover:text-[#FEF08A] font-['Cinzel'] font-black text-xs sm:text-sm tracking-wider uppercase rounded-lg border border-[#D6A447]/65 hover:border-[#FEF08A] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${className}`}
    {...rest}
  >
    {icon && <span className="text-[#D6A447] shrink-0">{icon}</span>}
    <span>{children}</span>
  </button>
);

// ============================================================================
// SCREEN HEADER
// ============================================================================

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  rightSlot?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  backLabel = 'BACK',
  rightSlot,
}) => (
  <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 border-b border-[#D6A447]/25 pb-3 shrink-0">
    <div className="min-w-[96px] flex items-center">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-['Cinzel'] font-bold text-[#D6A447] hover:text-[#FEF08A] transition-colors py-1.5 px-3 bg-[#171526] hover:bg-[#231F38] rounded-lg border border-[#D6A447]/45 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
      )}
    </div>

    <h1 className="font-['Bungee'] text-xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FEF08A] via-[#F59E0B] to-[#D6A447] tracking-wider text-center">
      {title}
    </h1>

    <div className="min-w-[96px] flex items-center justify-end">{rightSlot}</div>
  </header>
);

// ============================================================================
// SELECTION INDICATOR
// ============================================================================

interface SelectionIndicatorProps {
  isP1?: boolean;
  isP2?: boolean;
  p2Label?: string;
}

export const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({
  isP1,
  isP2,
  p2Label = 'P2',
}) => {
  if (!isP1 && !isP2) return null;
  return (
    <div className="flex items-center gap-1">
      {isP1 && (
        <span
          data-testid="badge-p1"
          className="px-2 py-0.5 bg-[#BE123C] text-[#FEF08A] font-['Bungee'] text-[10px] rounded border border-[#FEF08A] shadow"
        >
          P1
        </span>
      )}
      {isP2 && (
        <span
          data-testid="badge-p2"
          className="px-2 py-0.5 bg-[#0284C7] text-white font-['Bungee'] text-[10px] rounded border border-[#38BDF8] shadow"
        >
          {p2Label}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// CHARACTER PORTRAIT (VISUAL-FIRST FIGHTER SILHOUETTE CREST)
// ============================================================================

export const CharacterPortrait: React.FC<{
  character: CharacterDef;
  size?: 'sm' | 'md' | 'lg';
}> = ({ character, size = 'md' }) => {
  const { primaryColor, secondaryColor, accentColor, skinTone, hairColor } =
    character.visuals;
  const hasSunglasses = character.id === 'duggu';
  const hasBandana = character.id === 'bhidu';

  const dimensions =
    size === 'lg' ? 'w-24 h-24' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16 sm:w-20 sm:h-20';

  return (
    <div
      className={`relative ${dimensions} rounded-lg overflow-hidden border border-[#D6A447]/40 shrink-0 flex items-center justify-center`}
      style={{
        background: `radial-gradient(circle at 50% 32%, ${primaryColor}55 0%, ${secondaryColor}25 55%, #0B0A14 100%)`,
      }}
    >
      <svg
        viewBox="0 0 80 80"
        className="w-full h-full block"
        aria-hidden="true"
      >
        {/* Halo Ring */}
        <circle
          cx="40"
          cy="40"
          r="31"
          fill="none"
          stroke={primaryColor}
          strokeWidth="2"
          strokeOpacity="0.55"
        />
        {/* Shoulders / Jacket Silhouette */}
        <path
          d="M14 78 C15 56, 26 49, 40 49 C54 49, 65 56, 66 78 Z"
          fill={primaryColor}
        />
        {/* Inner Collar / V-Chest */}
        <path d="M31 49 L40 65 L49 49 Z" fill={secondaryColor} />
        {/* Neck */}
        <rect x="35" y="40" width="10" height="11" rx="3" fill={skinTone} />
        {/* Head */}
        <ellipse cx="40" cy="30" rx="12" ry="14" fill={skinTone} />
        {/* Hair */}
        <path
          d="M27 28 C27 16, 33 13, 40 13 C48 13, 53 17, 53 28 C50 22, 45 20, 40 20 C34 20, 30 22, 27 28 Z"
          fill={hairColor}
        />
        {/* Headband / Scarf Accent */}
        {hasBandana && (
          <rect x="28" y="21" width="24" height="4" rx="1.5" fill={accentColor} />
        )}
        {/* Sunglasses or Eyes */}
        {hasSunglasses ? (
          <g fill="#090A0F" stroke={accentColor} strokeWidth="1.2">
            <rect x="30" y="26" width="9" height="5.5" rx="1.5" />
            <rect x="41" y="26" width="9" height="5.5" rx="1.5" />
            <line x1="39" y1="28" x2="41" y2="28" />
          </g>
        ) : (
          <g fill="#111827">
            <circle cx="35" cy="29" r="1.8" />
            <circle cx="45" cy="29" r="1.8" />
          </g>
        )}
      </svg>
    </div>
  );
};

// ============================================================================
// CHARACTER CARD & ROSTER
// ============================================================================

interface CharacterCardProps {
  character: CharacterDef;
  isSelectedP1: boolean;
  isSelectedP2: boolean;
  isFocused: boolean;
  p2Label?: string;
  onSelect: (id: FighterId) => void;
}

export const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isSelectedP1,
  isSelectedP2,
  isFocused,
  p2Label = 'P2',
  onSelect,
}) => {
  const borderClass = isFocused
    ? 'border-[#FEF08A] bg-gradient-to-b from-[#251C36] to-[#131020] shadow-[0_0_20px_rgba(214,164,71,0.45)] scale-[1.01]'
    : isSelectedP1
    ? 'border-[#BE123C] bg-[#1A1426]'
    : isSelectedP2
    ? 'border-[#38BDF8] bg-[#141D2E]'
    : 'border-[#D6A447]/30 bg-[#141222]/90 hover:border-[#D6A447]/80 hover:bg-[#1B182E]';

  return (
    <button
      type="button"
      data-testid={`fighter-card-${character.id}`}
      data-fighter-id={character.id}
      data-selected-p1={isSelectedP1 ? 'true' : 'false'}
      data-selected-p2={isSelectedP2 ? 'true' : 'false'}
      onClick={() => onSelect(character.id)}
      className={`group relative p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center text-center gap-2.5 ${borderClass}`}
    >
      <div className="w-full flex items-center justify-between min-h-[20px]">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: character.visuals.primaryColor }}
        />
        <SelectionIndicator
          isP1={isSelectedP1}
          isP2={isSelectedP2}
          p2Label={p2Label}
        />
      </div>

      <CharacterPortrait character={character} size="md" />

      <div className="w-full">
        <div className="font-['Bungee'] text-xs sm:text-sm text-[#F1E7D0] group-hover:text-[#FEF08A] tracking-wide truncate">
          {character.name}
        </div>
      </div>
    </button>
  );
};

interface CharacterRosterProps {
  characters: CharacterDef[];
  p1Id: FighterId;
  p2Id: FighterId;
  focusedId: FighterId;
  showP1Indicator?: boolean;
  showP2Indicator?: boolean;
  p2Label?: string;
  onSelectCharacter: (id: FighterId) => void;
}

export const CharacterRoster: React.FC<CharacterRosterProps> = ({
  characters,
  p1Id,
  p2Id,
  focusedId,
  showP1Indicator = true,
  showP2Indicator = true,
  p2Label = 'P2',
  onSelectCharacter,
}) => (
  <div className="grid grid-cols-2 gap-3 w-full">
    {characters.map((char) => (
      <CharacterCard
        key={char.id}
        character={char}
        isSelectedP1={showP1Indicator && char.id === p1Id}
        isSelectedP2={showP2Indicator && char.id === p2Id}
        isFocused={char.id === focusedId}
        p2Label={p2Label}
        onSelect={onSelectCharacter}
      />
    ))}
  </div>
);

// ============================================================================
// CHARACTER STATS (ATTACK, DEFENCE, SPEED)
// ============================================================================

export function computeNormalizedFighterStats(character: CharacterDef): {
  attack: number;
  defence: number;
  speed: number;
} {
  const { stats } = character;
  const attack = Math.min(100, Math.max(45, Math.round(stats.powerMultiplier * 80)));
  const defence = Math.min(100, Math.max(45, Math.round(stats.defenseMultiplier * 82)));
  const speed = Math.min(100, Math.max(45, Math.round(stats.walkSpeed * 18)));

  return { attack, defence, speed };
}

export const CharacterStats: React.FC<{ character: CharacterDef }> = ({
  character,
}) => {
  const { attack, defence, speed } = computeNormalizedFighterStats(character);

  const bars = [
    { label: 'ATTACK', value: attack, color: 'from-[#BE123C] to-[#F59E0B]' },
    { label: 'DEFENCE', value: defence, color: 'from-[#D97706] to-[#FEF08A]' },
    { label: 'SPEED', value: speed, color: 'from-[#0284C7] to-[#38BDF8]' },
  ];

  return (
    <div
      data-testid="character-stats-bars"
      className="space-y-3 w-full bg-[#141222]/90 p-4 rounded-xl border border-[#D6A447]/30"
    >
      {bars.map((bar) => (
        <div key={bar.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-black tracking-widest">
            <span className="text-[#D6A447]">{bar.label}</span>
            <span className="text-[#F1E7D0] font-mono">{bar.value}</span>
          </div>
          <div className="w-full h-2.5 bg-black/70 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full bg-gradient-to-r ${bar.color} rounded-full transition-all duration-300`}
              style={{ width: `${bar.value}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// ARENA CARD
// ============================================================================

interface ArenaCardProps {
  arena: ArenaDef;
  isSelected: boolean;
  onSelect: (id: ArenaDef['id']) => void;
}

export const ArenaCard: React.FC<ArenaCardProps> = ({
  arena,
  isSelected,
  onSelect,
}) => {
  const isAward = arena.id === 'award_night';

  return (
    <button
      type="button"
      data-testid={`arena-card-${arena.id}`}
      onClick={() => onSelect(arena.id)}
      className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-4 ${
        isSelected
          ? 'border-[#FEF08A] bg-gradient-to-r from-[#271B38] to-[#151122] shadow-[0_0_24px_rgba(214,164,71,0.45)]'
          : 'border-[#D6A447]/35 bg-[#151324]/90 hover:border-[#D6A447]'
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center border ${
            isAward
              ? 'bg-[#2A1424] border-[#F59E0B]/60 text-[#FEF08A]'
              : 'bg-[#102336] border-[#38BDF8]/60 text-[#38BDF8]'
          }`}
        >
          {isAward ? <Award size={24} /> : <Film size={24} />}
        </div>
        <div>
          <h2 className="font-['Bungee'] text-base sm:text-lg text-[#F1E7D0] tracking-wide">
            {arena.name}
          </h2>
          <p className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[#D6A447]">
            {arena.subtitle}
          </p>
        </div>
      </div>

      <span
        className={`px-2.5 py-1 rounded text-[10px] font-['Bungee'] tracking-wider border ${
          isSelected
            ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
            : 'bg-black/40 text-white/45 border-white/10'
        }`}
      >
        {isSelected ? 'SELECTED' : 'SELECT'}
      </span>
    </button>
  );
};

// ============================================================================
// MODAL & LOADING INDICATOR
// ============================================================================

interface ModalProps {
  title: string;
  onClose?: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  maxWidthClass = 'max-w-md',
  children,
}) => (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
    <div
      className={`bg-[#141222] border-2 border-[#D6A447] rounded-xl ${maxWidthClass} w-full p-6 shadow-[0_0_40px_rgba(0,0,0,0.9)]`}
    >
      <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-5">
        <h2 className="font-['Bungee'] text-xl sm:text-2xl text-[#FEF08A] tracking-wider">
          {title}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/50 text-[#D6A447] hover:text-[#FEF08A] border border-[#D6A447]/40 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {children}
    </div>
  </div>
);

export const LoadingIndicator: React.FC<{ label?: string }> = ({
  label = 'LOADING...',
}) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/75 border border-[#D6A447]/50 text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[#FEF08A]">
    <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping" />
    <span>{label}</span>
  </div>
);
