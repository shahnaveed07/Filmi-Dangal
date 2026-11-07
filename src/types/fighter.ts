export type FighterId = 'action_sultan' | 'romance_raja' | 'dance_dynamo' | 'villain_saab';
export type CharacterId = FighterId;

export type ArenaId = 'award_night' | 'film_city';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type DifficultyLevel = Difficulty;

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
  | 'super';

export type BoneAttachmentName =
  | 'Head'
  | 'Chest'
  | 'RightHand'
  | 'LeftHand'
  | 'RightFoot'
  | 'LeftFoot'
  | 'Hips'
  | 'Projectile';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Box = Rect;

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Sphere3D {
  x: number;
  y: number;
  z: number;
  radius: number;
  center?: Vector3D;
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

export interface AttackFrameData {
  type: AttackType;
  damage: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  hitStunFrames: number;
  blockStunFrames: number;
  knockbackX: number;
  knockbackY: number;
  meterGainOnHit: number;
  meterGainOnBlock: number;
  meterCost?: number;
  cooldownFrames?: number;
  maxHits?: number;
  isHigh?: boolean;
  isLow?: boolean;
  isOverhead?: boolean;
  isUnblockable?: boolean;
  isProjectile?: boolean;
  causesKnockdown?: boolean;
  hitboxOffset: { x: number; y: number; w: number; h: number };
  attachedBone?: BoneAttachmentName;
  hitRadius3D: number;
  localOffset3D?: Vector3D;
}

export interface SignatureAbilityInfo {
  name: string;
  description: string;
  meterCost: number;
  cooldownSeconds?: number;
}

export interface FighterStats {
  maxHealth: number;
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  powerMultiplier: number;
  defenseMultiplier: number;
  weight: number;
}

export interface FighterDialogue {
  intro: string;
  win: string;
  superQuote: string;
  superShotQuote: string;
  taunt: string;
}

export interface CharacterProportions3D {
  heightScale: number;
  shoulderWidth: number;
  chestDepth: number;
  torsoBulk: number;
  waistWidth: number;
  limbLength: number;
  limbThickness: number;
  armThickness: number;
  legThickness: number;
  jawWidth: number;
  hairStyle:
    | 'cropped_machismo'
    | 'swept_romantic_waves'
    | 'sculpted_bronze_waves'
    | 'slicked_villain_mane';
  facialHair: 'royal_mustache' | 'clean_shaven' | 'designer_stubble' | 'heavy_boss_goatee';
  accessoryType:
    | 'aviator_and_kada'
    | 'silk_scarf_and_collar'
    | 'neon_visor_and_gauntlets'
    | 'gold_chain_and_bandhgala';
}

export interface CharacterVisualSpec {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  skinColor: string;
  skinTone: string;
  hairColor: string;
  outfitTrimColor: string;
  auraColor: string;
  glbModelPath: string;
  actorInspiration: string;
  attireDescription: string;
  hairStyle: 'sultan_swept' | 'raja_pompadour' | 'dynamo_wavy' | 'saab_slick_mane';
  accessoryType: 'aviators_bracelet' | 'open_jacket_collar' | 'neon_visor_vest' | 'villain_trench_rings';
  proportions: CharacterProportions3D;
}

export interface CharacterDef {
  id: FighterId;
  name: string;
  title: string;
  style: string;
  archetype: string;
  bio: string;
  specialMoveName: string;
  specialDescription: string;
  superMoveInfo: SignatureAbilityInfo;
  superShotInfo: SignatureAbilityInfo;
  stats: FighterStats;
  moves: Record<AttackType, AttackFrameData>;
  dialogues: FighterDialogue;
  visuals: CharacterVisualSpec;
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
  ambientColor: string;
  groundY: number;
  stageWidth: number;
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
  pause: boolean;
  upJustPressed: boolean;
  jumpJustPressed: boolean;
  punchJustPressed: boolean;
  kickJustPressed: boolean;
  grabJustPressed: boolean;
  superShotJustPressed: boolean;
  superMoveJustPressed: boolean;
  specialJustPressed: boolean;
  pauseJustPressed: boolean;
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
  isGrab?: boolean;
  isProjectile?: boolean;
  comboName?: string;
  hitX: number;
  hitY: number;
  hitZ?: number;
  comboCount: number;
}

export type ScreenName = 'title' | 'character_select' | 'arena_select' | 'fighting' | 'fight' | 'results';
export type GameMode = 'arcade' | 'vs_cpu';
