export type FighterId = 'action_sultan' | 'romance_raja' | 'dance_dynamo' | 'villain_saab';

export type FighterStateName =
  | 'idle'
  | 'walk_forward'
  | 'walk_backward'
  | 'jump'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'sweep'
  | 'forward_punch'
  | 'forward_kick'
  | 'grab'
  | 'block'
  | 'crouch_block'
  | 'hurt'
  | 'knockdown'
  | 'recovery'
  | 'super'
  | 'victory'
  | 'defeat';

export type AttackType = 'punch' | 'kick' | 'sweep' | 'forward_punch' | 'forward_kick' | 'grab' | 'super';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AttackFrameData {
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  hitStunFrames: number;
  blockStunFrames: number;
  knockbackX: number;
  knockbackY: number;
  causesKnockdown?: boolean;
  isLow?: boolean;
  isHigh?: boolean;
  meterGainOnHit: number;
  meterGainOnBlock: number;
  meterCost?: number;
  hitboxOffset: { x: number; y: number; w: number; h: number };
}

export interface FighterStats {
  maxHealth: number;
  walkSpeed: number;
  jumpVelocity: number;
  powerMultiplier: number;
  defenseMultiplier: number;
  weight: number; // affects gravity and knockdown fall speed
}

export interface FighterDialogue {
  intro: string;
  introHindi: string;
  win: string;
  winHindi: string;
  superQuote: string;
  superQuoteHindi: string;
  taunt: string;
}

export interface FighterVisualTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  auraColor: string;
  skinTone: string;
  hairColor: string;
  attireDescription: string;
  avatarIcon: string;
}

export interface CharacterDef {
  id: FighterId;
  name: string;
  title: string;
  archetype: string;
  style: string;
  specialMoveName: string;
  specialMoveHindi: string;
  specialDescription: string;
  stats: FighterStats;
  moves: Record<AttackType, AttackFrameData>;
  dialogues: FighterDialogue;
  visuals: FighterVisualTheme;
}

export type ArenaId = 'award_night' | 'film_city';

export interface ArenaDef {
  id: ArenaId;
  name: string;
  subtitle: string;
  description: string;
  ambientColor: string;
  groundY: number;
  stageWidth: number;
  themeFeatures: string[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export type GameMode = 'arcade' | 'vs_cpu' | 'training';

export interface CombatHitEvent {
  attackerId: FighterId;
  defenderId: FighterId;
  damage: number;
  isBlocked: boolean;
  isCounter: boolean;
  isCritical: boolean;
  isGrab: boolean;
  hitX: number;
  hitY: number;
  attackType: AttackType;
  comboCount: number;
}
