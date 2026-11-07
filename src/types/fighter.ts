export type FighterId =
  | 'action_sultan'
  | 'romance_raja'
  | 'duggu'
  | 'bhidu';

export type CharacterId = FighterId;

export type ArenaId = 'award_night' | 'film_city';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type DifficultyLevel = Difficulty;

export type GameMode = 'arcade' | 'vs_cpu' | 'training';

export type TrainingDummyBehavior =
  | 'stand'
  | 'crouch'
  | 'block'
  | 'jump'
  | 'cpu_spar';

export type ScreenName =
  | 'title'
  | 'disclaimer'
  | 'select'
  | 'character_select'
  | 'arena_select'
  | 'controls'
  | 'fighting'
  | 'fight'
  | 'results';

export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'walk_forward'
  | 'walk_backward'
  | 'run'
  | 'jump'
  | 'crouch'
  | 'block'
  | 'crouch_block'
  | 'punch'
  | 'kick'
  | 'sweep'
  | 'forward_punch'
  | 'forward_kick'
  | 'grab'
  | 'super_shot'
  | 'super_move'
  | 'super'
  | 'special'
  | 'hurt'
  | 'knockback'
  | 'knockdown'
  | 'recovery'
  | 'victory'
  | 'defeat';

export type AttackType =
  | 'punch'
  | 'kick'
  | 'sweep'
  | 'forward_punch'
  | 'forward_kick'
  | 'grab'
  | 'super_shot'
  | 'super_move'
  | 'super'
  | 'special';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Box = Rect;

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Sphere3D {
  x: number;
  y: number;
  z: number;
  center?: Vector3D;
  radius: number;
}

export interface CapsuleHurtbox3D {
  lowerSphere: Sphere3D;
  upperSphere: Sphere3D;
  cylinderRadius: number;
  bottom: Vector3D;
  top: Vector3D;
  radius: number;
  headSphere: Sphere3D;
  torsoSphere: Sphere3D;
  legsSphere: Sphere3D;
}

export type BoneAttachmentName =
  | 'RightHand'
  | 'LeftHand'
  | 'RightFoot'
  | 'LeftFoot'
  | 'Chest'
  | 'Head'
  | 'Hips'
  | 'Projectile';

export interface AttackFrameData {
  type?: AttackType;
  name?: string;
  damage: number;
  chipDamage?: number;
  meterGain?: number;
  meterGainOnHit: number;
  meterGainOnBlock: number;
  meterCost?: number;
  cooldownFrames?: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  hitStunFrames: number;
  blockStunFrames: number;
  knockbackX: number;
  knockbackY: number;
  knockbackZ?: number;
  hitboxOffset: { x: number; y: number; w: number; h: number };
  attachedBone?: BoneAttachmentName;
  hitRadius3D?: number;
  maxHits?: number;
  isHigh?: boolean;
  isLow?: boolean;
  isOverhead?: boolean;
  isUnblockable?: boolean;
  isGrab?: boolean;
  isProjectile?: boolean;
  causesKnockdown?: boolean;
  isSuper?: boolean;
  isSuperMove?: boolean;
  isSuperShot?: boolean;
}

export interface CharacterModelProportions {
  heightScale: number;
  shoulderWidth: number;
  torsoBulk: number;
  limbThickness: number;
  jawWidth: number;
  hairStyle:
    | 'cropped_machismo'
    | 'swept_romantic_waves'
    | 'sculpted_bronze_waves'
    | 'slicked_villain_mane'
    | 'bhidu_swagger_mane';
  facialHair:
    | 'clean_shaven'
    | 'royal_mustache'
    | 'designer_stubble'
    | 'heavy_boss_goatee'
    | 'bhidu_mustache';
  accessoryType:
    | 'aviator_and_kada'
    | 'silk_scarf_and_collar'
    | 'neon_visor_and_gauntlets'
    | 'gold_chain_and_bandhgala'
    | 'bandana_and_shades';
}

export interface CharacterDef {
  id: FighterId;
  slug: 'action-sultan' | 'romance-raja' | 'duggu' | 'bhidu';
  name: string;
  title: string;
  subtitle: string;
  style: string;
  archetype: string;
  inspiration: string;
  bio: string;
  stats: {
    maxHealth: number;
    walkSpeed: number;
    jumpVelocity: number;
    weight: number;
    powerRating: number;
    speedRating: number;
    techniqueRating: number;
    powerMultiplier: number;
    defenseMultiplier: number;
  };
  visuals: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    skinTone: string;
    hairColor: string;
    costumeDescription: string;
    attireDescription: string;
    glbModelPath: string;
    proportions: CharacterModelProportions;
  };
  dialogues: {
    intro: string;
    win: string;
    lose?: string;
    superQuote: string;
    superShotQuote: string;
    taunt: string;
  };
  superMoveInfo: {
    name: string;
    command: string;
    description: string;
  };
  superShotInfo: {
    name: string;
    command: string;
    description: string;
  };
  moves: Record<AttackType, AttackFrameData>;
}

export interface ArenaBounds3D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  subtitle: string;
  description: string;
  ambientColor?: string;
  groundY?: number;
  stageWidth?: number;
  skyTopColor?: string;
  skyBottomColor?: string;
  floorColor?: string;
  accentColor?: string;
  bounds3D: ArenaBounds3D;
  themeFeatures: string[];
}

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  crouch: boolean;
  block: boolean;
  punch: boolean;
  kick: boolean;
  grab: boolean;
  superShot: boolean;
  superMove: boolean;
  special: boolean;
  pause?: boolean;
  jumpJustPressed: boolean;
  upJustPressed: boolean;
  downJustPressed?: boolean;
  punchJustPressed: boolean;
  kickJustPressed: boolean;
  grabJustPressed: boolean;
  superShotJustPressed: boolean;
  superMoveJustPressed: boolean;
  specialJustPressed: boolean;
  pauseJustPressed: boolean;
  muteJustPressed?: boolean;
}

export interface FighterSnapshot {
  id: FighterId;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: 1 | -1;
  health: number;
  maxHealth: number;
  specialMeter: number;
  maxSpecialMeter: number;
  superShotCooldown: number;
  state: FighterStateName;
  stateFrame: number;
  comboCount: number;
  comboDamage: number;
  isGrounded: boolean;
  isBlocking: boolean;
  isCrouching: boolean;
  invulnerable: boolean;
  activeMove: AttackType | null;
}

export interface CombatHitEvent {
  attackerId: FighterId;
  defenderId: FighterId;
  attackType: AttackType;
  damage: number;
  isBlocked: boolean;
  isCounter: boolean;
  isCritical: boolean;
  isSuperMove?: boolean;
  isSuperShot?: boolean;
  isGrab?: boolean;
  isProjectile?: boolean;
  hitX: number;
  hitY: number;
  hitZ?: number;
  comboCount: number;
  comboName?: string | null;
  moveName?: string;
}
