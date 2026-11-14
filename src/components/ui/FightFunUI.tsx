import React, { useEffect, useState } from 'react';
import { ArenaDef, CharacterDef, FighterId } from '../../types/fighter';
import { AudioManager } from '../../engine/AudioManager';
import { SettingsManager } from '../../engine/SettingsManager';
import {
  ArrowLeft,
  Award,
  Check,
  Film,
  Flame,
  Maximize2,
  Minimize2,
  Shield,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

// ============================================================================
// FIGHT FUN EMBLEM LOGO (METALLIC SILVER "FIGHT" + GOLD "FUN" ON CRIMSON SLASH)
// ============================================================================

export const FightFunLogo: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ size = 'md', className = '' }) => {
  const fightTextSize =
    size === 'lg'
      ? 'text-4xl sm:text-5xl md:text-6xl'
      : size === 'sm'
      ? 'text-xl sm:text-2xl'
      : 'text-2xl sm:text-3xl md:text-4xl';

  const funTextSize =
    size === 'lg'
      ? 'text-4xl sm:text-5xl md:text-6xl -mt-2 sm:-mt-3'
      : size === 'sm'
      ? 'text-xl sm:text-2xl -mt-1.5'
      : 'text-2xl sm:text-3xl md:text-4xl -mt-2';

  return (
    <div
      data-testid="fight-fun-logo"
      className={`relative inline-flex flex-col items-center justify-center select-none px-3 py-1 ${className}`}
    >
      {/* Jagged Crimson Brush Slash SVG Behind Logo */}
      <svg
        viewBox="0 0 260 110"
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible opacity-95"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ffCrimsonSlash" x1="0%" y1="50%" x2="100%" y2="25%">
            <stop offset="0%" stopColor="#7F1D1D" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#DC2626" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#991B1B" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path
          d="M8 78 L218 22 L195 42 L252 34 L208 62 L244 60 L185 84 L212 86 L24 98 L48 78 Z"
          fill="url(#ffCrimsonSlash)"
        />
        <path
          d="M22 52 L175 14 L152 34 L196 28 L55 66 Z"
          fill="#EF4444"
          fillOpacity="0.45"
        />
      </svg>

      <span
        className={`relative z-10 font-display font-black italic uppercase tracking-wider leading-none text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-400 drop-shadow-[0_4px_10px_rgba(0,0,0,0.95)] transform -skew-x-6 ${fightTextSize}`}
      >
        FIGHT
      </span>
      <span
        className={`relative z-10 font-display font-black italic uppercase tracking-wider leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] drop-shadow-[0_4px_10px_rgba(0,0,0,0.95)] transform -skew-x-6 ${funTextSize}`}
      >
        FUN
      </span>
    </div>
  );
};

// ============================================================================
// REAL BROWSER UTILITY CONTROLS (MUTE + FULLSCREEN + OPTIONAL CLOSE)
// ============================================================================

export const WindowUtilityControls: React.FC<{
  onClose?: () => void;
  closeTestId?: string;
}> = ({ onClose, closeTestId = 'window-close-btn' }) => {
  const audio = AudioManager.getInstance();
  const settingsMgr = SettingsManager.getInstance();
  const [isMuted, setIsMuted] = useState(audio.isMuted);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });

  useEffect(() => {
    const unsubMute = audio.subscribeMute((m) => setIsMuted(m));
    const onFsChange = () => {
      if (typeof document !== 'undefined') {
        setIsFullscreen(Boolean(document.fullscreenElement));
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', onFsChange);
    }
    return () => {
      unsubMute();
      if (typeof document !== 'undefined') {
        document.removeEventListener('fullscreenchange', onFsChange);
      }
    };
  }, [audio]);

  const handleToggleFullscreen = () => {
    audio.playSound('click');
    const nextFs = !isFullscreen;
    settingsMgr.updateSettings({ fullscreen: nextFs });
    setIsFullscreen(nextFs);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-testid="utility-mute-btn"
        onClick={() => audio.toggleMute()}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#0E0A0C]/90 hover:bg-[#1C1215] border border-amber-400/60 hover:border-amber-300 text-amber-100 flex items-center justify-center transition-colors cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.8)]"
        title={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
        aria-label="Toggle Audio"
      >
        {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>

      <button
        type="button"
        data-testid="utility-fullscreen-btn"
        onClick={handleToggleFullscreen}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#0E0A0C]/90 hover:bg-[#1C1215] border border-amber-400/60 hover:border-amber-300 text-amber-100 flex items-center justify-center transition-colors cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.8)]"
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        aria-label="Toggle Fullscreen"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      {onClose && (
        <button
          type="button"
          data-testid={closeTestId}
          onClick={() => {
            audio.playSound('click');
            onClose();
          }}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#180A0D]/90 hover:bg-red-950/90 border border-amber-400/60 hover:border-red-400 text-white flex items-center justify-center transition-colors cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.8)]"
          title="Close [ESC]"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};

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
    } py-3.5 px-6 bg-gradient-to-r from-[#FACC15] via-[#F59E0B] to-[#D97706] hover:brightness-110 text-black font-display font-black italic uppercase text-sm sm:text-base tracking-wider rounded-lg border-2 border-[#FEF08A] shadow-[0_0_24px_rgba(245,158,11,0.5)] active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${className}`}
    {...rest}
  >
    {icon && <span className="text-black shrink-0">{icon}</span>}
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
    } py-3 px-5 bg-[#120D10]/95 hover:bg-[#1E1418] text-[#F1E7D0] hover:text-[#FEF08A] font-display font-extrabold italic text-xs sm:text-sm tracking-wider uppercase rounded-lg border border-[#D6A447]/65 hover:border-[#FEF08A] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${className}`}
    {...rest}
  >
    {icon && <span className="text-[#FACC15] shrink-0">{icon}</span>}
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
  rightSlot,
}) => (
  <header className="w-full max-w-[1440px] mx-auto flex items-center justify-between gap-3 border-b border-red-600/35 pb-2.5 shrink-0">
    <div className="flex items-center gap-3 sm:gap-4">
      {onBack && (
        <button
          type="button"
          data-testid="screen-back-btn"
          onClick={onBack}
          className="w-11 h-9 sm:w-12 sm:h-10 flex items-center justify-center bg-gradient-to-b from-[#3B0A11] to-[#1A0508] hover:from-[#5C0F1B] hover:to-[#2B080D] text-white rounded-md border border-red-500/75 shadow-[0_0_15px_rgba(220,38,38,0.35)] transition-all transform -skew-x-12 cursor-pointer"
          aria-label="Back"
        >
          <span className="transform skew-x-12">
            <ArrowLeft size={18} />
          </span>
        </button>
      )}

      <FightFunLogo size="sm" />

      <div className="h-6 sm:h-7 w-[2px] bg-white/35 transform rotate-12 mx-0.5 sm:mx-1" />

      <h1 className="font-display font-black italic uppercase text-xl sm:text-2xl md:text-3xl text-white tracking-wider drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
        {title}
      </h1>
    </div>

    <div className="flex items-center justify-end gap-2">{rightSlot}</div>
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
          className="px-1.5 py-0.5 bg-[#BE123C] text-[#FEF08A] font-display font-black text-[9px] rounded border border-[#FEF08A] shadow"
        >
          P1
        </span>
      )}
      {isP2 && (
        <span
          data-testid="badge-p2"
          className="px-1.5 py-0.5 bg-[#0284C7] text-white font-display font-black text-[9px] rounded border border-[#38BDF8] shadow"
        >
          {p2Label}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// CHARACTER PORTRAIT (HIGH-CONTRAST ILLUSTRATED FIGHTER AVATAR)
// ============================================================================

export const CharacterPortrait: React.FC<{
  character: CharacterDef;
  size?: 'sm' | 'md' | 'lg';
  monochrome?: boolean;
}> = ({ character, size = 'md', monochrome = false }) => {
  const primaryColor = monochrome ? '#3F3F46' : character.visuals.primaryColor;
  const secondaryColor = monochrome ? '#27272A' : character.visuals.secondaryColor;
  const accentColor = monochrome ? '#71717A' : character.visuals.accentColor;
  const skinTone = monochrome ? '#71717A' : character.visuals.skinTone;
  const hairColor = monochrome ? '#18181B' : character.visuals.hairColor;
  const isBhaiJaan = character.id === 'action_sultan';
  const hasSunglasses = character.id === 'duggu' || character.id === 'bhidu';
  const hasBandana = character.id === 'bhidu';

  const dimensions =
    size === 'lg'
      ? 'w-24 h-24'
      : size === 'sm'
      ? 'w-12 h-12'
      : 'w-full h-24 sm:h-28';

  return (
    <div
      className={`relative ${dimensions} overflow-hidden shrink-0 flex items-center justify-center ${
        monochrome ? 'opacity-65' : ''
      }`}
      style={{
        background: monochrome
          ? 'transparent'
          : `radial-gradient(circle at 50% 28%, ${primaryColor}88 0%, ${secondaryColor}35 55%, #0D090B 100%)`,
      }}
    >
      <svg
        viewBox="0 0 96 96"
        className="w-full h-full block"
        aria-hidden="true"
      >
        {/* Subtle Rim Aura */}
        {!monochrome && (
          <circle
            cx="48"
            cy="44"
            r="36"
            fill="none"
            stroke={accentColor}
            strokeWidth="1.8"
            strokeOpacity="0.45"
          />
        )}

        {/* Muscular Shoulders & Jacket Silhouette */}
        <path
          d="M12 96 C14 66, 28 56, 48 56 C68 56, 82 66, 84 96 Z"
          fill={primaryColor}
        />
        {/* Jacket Lapels */}
        <path
          d="M28 58 L42 88 L36 96 L22 68 Z"
          fill="#1F1614"
          fillOpacity="0.55"
        />
        <path
          d="M68 58 L54 88 L60 96 L74 68 Z"
          fill="#1F1614"
          fillOpacity="0.55"
        />
        {/* Inner T-Shirt / V-Chest */}
        <path
          d="M36 56 L48 80 L60 56 Z"
          fill={isBhaiJaan ? '#111827' : secondaryColor}
        />

        {/* Neck & Traps */}
        <path d="M38 44 L58 44 L62 58 L34 58 Z" fill={skinTone} />
        {/* Jaw Shadow */}
        <ellipse cx="48" cy="46" rx="11" ry="5" fill="#000000" fillOpacity="0.22" />

        {/* Sculpted Head */}
        <path
          d="M33 28 C33 16, 40 13, 48 13 C56 13, 63 16, 63 28 C63 40, 57 47, 48 47 C39 47, 33 40, 33 28 Z"
          fill={skinTone}
        />
        {/* Ears */}
        <ellipse cx="32.5" cy="31" rx="2.5" ry="4.5" fill={skinTone} />
        <ellipse cx="63.5" cy="31" rx="2.5" ry="4.5" fill={skinTone} />

        {/* Hair */}
        <path
          d="M32 27 C31 13, 38 9, 48 9 C58 9, 65 13, 64 27 C61 19, 55 17, 48 17 C41 17, 35 19, 32 27 Z"
          fill={hairColor}
        />

        {/* Bandana */}
        {hasBandana && (
          <rect x="33" y="19" width="30" height="4.5" rx="1.5" fill={accentColor} />
        )}

        {/* Brows & Eyes / Sunglasses */}
        <path
          d="M37 26.5 Q41 25 45 26.8"
          stroke={hairColor}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M51 26.8 Q55 25 59 26.5"
          stroke={hairColor}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />

        {hasSunglasses ? (
          <g fill="#090A0F" stroke={accentColor} strokeWidth="1.3">
            <rect x="35.5" y="27.5" width="11" height="6.5" rx="1.8" />
            <rect x="49.5" y="27.5" width="11" height="6.5" rx="1.8" />
            <line x1="46.5" y1="30" x2="49.5" y2="30" />
          </g>
        ) : (
          <g fill="#111827">
            <ellipse cx="41.5" cy="30" rx="2.2" ry="1.6" />
            <ellipse cx="54.5" cy="30" rx="2.2" ry="1.6" />
            <circle cx="42" cy="29.5" r="0.6" fill="#FFFFFF" />
            <circle cx="55" cy="29.5" r="0.6" fill="#FFFFFF" />
          </g>
        )}

        {/* Nose & Confident Mouth */}
        <path
          d="M48 29 L46.8 35.5 L49.5 36"
          stroke="#7C4A32"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M43.5 40.5 Q48 41.8 52.5 40.5"
          stroke="#6E3B28"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

// ============================================================================
// CHARACTER CARD & SCALABLE 3-COLUMN ROSTER
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
  const isHighlighted = isFocused || isSelectedP1;
  const borderClass = isFocused
    ? 'border-[#FACC15] bg-[#1C120C] shadow-[0_0_20px_rgba(250,204,21,0.55),inset_0_0_12px_rgba(245,158,11,0.3)] scale-[1.02]'
    : isSelectedP1
    ? 'border-[#F59E0B] bg-[#18100D]'
    : isSelectedP2
    ? 'border-[#38BDF8] bg-[#0F1926]'
    : 'border-white/25 bg-[#120E10]/90 hover:border-amber-400/75 hover:bg-[#1B1316]';

  return (
    <button
      type="button"
      data-testid={`fighter-card-${character.id}`}
      data-fighter-id={character.id}
      data-selected-p1={isSelectedP1 ? 'true' : 'false'}
      data-selected-p2={isSelectedP2 ? 'true' : 'false'}
      onClick={() => onSelect(character.id)}
      className={`group relative rounded-lg border-2 transition-all cursor-pointer flex flex-col overflow-hidden text-center ${borderClass}`}
    >
      {/* Top-Right Selected Gold Checkmark Badge (Matching CharacterScreen.png) */}
      {isHighlighted && (
        <span
          data-testid={`fighter-card-check-${character.id}`}
          className="absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-[4px] bg-gradient-to-b from-[#FEF08A] to-[#F59E0B] text-black flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
        >
          <Check size={13} strokeWidth={3.5} />
        </span>
      )}

      {/* Match P1 / P2 Slot Badge Overlay */}
      <div className="absolute top-1.5 left-1.5 z-20">
        <SelectionIndicator
          isP1={isSelectedP1}
          isP2={isSelectedP2}
          p2Label={p2Label}
        />
      </div>

      {/* Portrait Area */}
      <CharacterPortrait character={character} size="md" />

      {/* Bottom Name Plate */}
      <div
        className={`w-full py-1.5 px-1.5 border-t transition-colors ${
          isFocused
            ? 'bg-gradient-to-r from-[#2A1808] via-[#3D220A] to-[#2A1808] border-amber-400/50 text-[#FEF08A]'
            : 'bg-[#0B080A]/95 border-white/10 text-white group-hover:text-[#FEF08A]'
        }`}
      >
        <div className="font-sans font-bold italic text-[11px] sm:text-xs tracking-wide truncate">
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
  columns?: 2 | 3;
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
  columns = 3,
  onSelectCharacter,
}) => (
  <div
    data-testid="character-roster-grid"
    className={`grid ${
      columns === 3 ? 'grid-cols-3' : 'grid-cols-2'
    } gap-2.5 sm:gap-3 w-full`}
  >
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
// CHARACTER STATS (6-SEGMENT SKEWED GOLD BARS MATCHING REFERENCE SCREENSHOTS)
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

export const CharacterStats: React.FC<{
  character: CharacterDef;
  borderVariant?: 'gold' | 'crimson';
}> = ({ character, borderVariant = 'crimson' }) => {
  const { attack, defence, speed } = computeNormalizedFighterStats(character);

  const rows = [
    {
      label: 'Attack',
      value: attack,
      segments: Math.max(1, Math.min(6, Math.round((attack / 100) * 6))),
      icon: <Flame size={18} className="text-[#FACC15]" />,
    },
    {
      label: 'Defence',
      value: defence,
      segments: Math.max(1, Math.min(6, Math.round((defence / 100) * 6))),
      icon: <Shield size={18} className="text-[#FACC15]" />,
    },
    {
      label: 'Speed',
      value: speed,
      segments: Math.max(1, Math.min(6, Math.round((speed / 100) * 6))),
      icon: <Zap size={18} className="text-[#FACC15]" />,
    },
  ];

  const containerBorder =
    borderVariant === 'gold'
      ? 'border-amber-500/60 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
      : 'border-red-600/75 shadow-[0_0_24px_rgba(220,38,38,0.16)]';

  return (
    <div
      data-testid="character-stats-bars"
      className={`w-full bg-[#0E090B]/95 p-4 sm:p-5 rounded-xl border ${containerBorder} divide-y divide-white/10`}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-[105px]">
            <span className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              {row.icon}
            </span>
            <span className="font-display font-bold italic text-sm sm:text-base text-white tracking-wide">
              {row.label}
            </span>
          </div>

          {/* 6 Skewed Gold Segments */}
          <div
            className="flex items-center gap-1.5 flex-1 max-w-[190px] justify-end"
            aria-label={`${row.label}: ${row.value}`}
          >
            {[1, 2, 3, 4, 5, 6].map((segIdx) => {
              const active = segIdx <= row.segments;
              return (
                <span
                  key={segIdx}
                  className={`h-3 sm:h-3.5 flex-1 rounded-[2px] transform -skew-x-12 transition-all ${
                    active
                      ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#D97706] shadow-[0_0_8px_rgba(250,204,21,0.65)]'
                      : 'bg-zinc-700/60 border border-white/5'
                  }`}
                />
              );
            })}
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
          ? 'border-[#FEF08A] bg-gradient-to-r from-[#2B1218] to-[#120A0D] shadow-[0_0_24px_rgba(214,164,71,0.45)]'
          : 'border-[#D6A447]/35 bg-[#140E11]/90 hover:border-[#D6A447]'
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
          <h2 className="font-display font-black italic uppercase text-base sm:text-lg text-[#F1E7D0] tracking-wide">
            {arena.name}
          </h2>
          <p className="text-xs font-sans font-bold uppercase tracking-wider text-[#FACC15]">
            {arena.subtitle}
          </p>
        </div>
      </div>

      <span
        className={`px-2.5 py-1 rounded text-[10px] font-display font-black tracking-wider border ${
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
      className={`bg-[#120B0E] border-2 border-[#D6A447] rounded-xl ${maxWidthClass} w-full p-6 shadow-[0_0_40px_rgba(0,0,0,0.9)]`}
    >
      <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-5">
        <h2 className="font-display font-black italic uppercase text-xl sm:text-2xl text-[#FEF08A] tracking-wider">
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
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/75 border border-[#D6A447]/50 text-xs font-display font-bold uppercase tracking-widest text-[#FEF08A]">
    <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping" />
    <span>{label}</span>
  </div>
);
