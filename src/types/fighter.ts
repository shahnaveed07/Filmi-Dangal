export type FighterId = 'action_sultan' | 'romance_raja' | 'dance_dynamo' | 'villain_saab';
export type CharacterId = FighterId;

export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'walk_forward'
  | 'walk_backward'
  | 'run'
  | 'sidestep'
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
  | 'knockback'
  | 'knockdown'
  | 'recovery'
  | 'super_shot'
  | 'super_move'
  | 'super'
  | 'special'
  | 'victory'
  | 'defeat';

export type FighterStateType = FighterStateName;

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

export type MoveType = AttackType;

export type BoneAttachmentName =
  | 'RightHand'
  | 'LeftHand'
  | 'RightFoot'
  | 'LeftFoot'
  | 'Chest'
  | 'Head'
  | 'Hips'
  | 'Projectile';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
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
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  hitStunFrames: number;
  blockStunFrames: number;
  knockbackX: number;
  knockbackY: number;
  knockbackZ?: number;
  causesKnockdown?: boolean;
  isLow?: boolean;
  isHigh?: boolean;
  isProjectile?: boolean;
  projectileSpeed?: number;
  projectileRadius?: number;
  cooldownFrames?: number;
  maxHits?: number;
  attachedBone?: BoneAttachmentName;
  hitRadius3D?: number;
  meterGainOnHit: number;
  meterGainOnBlock: number;
  meterCost?: number;
  hitboxOffset: { x: number; y: number; w: number; h: number };
}

export interface SignatureAbilityInfo {
  name: string;
  hindiName: string;
  description: string;
  vfxTheme: string;
  meterCost: number;
  cooldownSeconds: number;
}

export interface FighterStats {
  maxHealth: number;
  walkSpeed: number;
  runSpeed: number;
  sidestepSpeed: number;
  jumpVelocity: number;
  powerMultiplier: number;
  defenseMultiplier: number;
  weight: number;
}

export interface FighterDialogue {
  intro: string;
  introHindi: string;
  win: string;
  winHindi: string;
  superQuote: string;
  superQuoteHindi: string;
  superShotQuote: string;
  taunt: string;
}

export interface FighterProportions3D {
  heightScale: number;
  shoulderWidth: number;
  torsoBulk: number;
  limbThickness: number;
  jawWidth: number;
  cheekboneProminence: number;
  browDepth: number;
  hairStyle: 'cropped_machismo' | 'swept_romantic_waves' | 'sculpted_bronze_waves' | 'slicked_villain_mane';
  facialHair: 'royal_mustache' | 'clean_dimpled' | 'designer_stubble' | 'heavy_boss_goatee';
  accessoryType: 'aviator_and_kada' | 'silk_scarf_and_collar' | 'neon_visor_and_gauntlets' | 'gold_chain_and_bandhgala';
}

export interface FighterVisualTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  auraColor: string;
  skinTone: string;
  hairColor: string;
  attireDescription: string;
  actorInspiration: string;
  glbModelPath: string;
  proportions: FighterProportions3D;
}

export interface CharacterDef {
  id: FighterId;
  slug: string;
  name: string;
  title: string;
  archetype: string;
  style: string;
  bio: string;
  specialMoveName: string;
  specialMoveHindi: string;
  specialDescription: string;
  superMoveInfo: SignatureAbilityInfo;
  superShotInfo: SignatureAbilityInfo;
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
  bounds3D: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    floorY: number;
  };
  themeFeatures: string[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export type DifficultyLevel = Difficulty;

export type GameMode = 'arcade' | 'vs_cpu' | 'training';

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  sidestepUp: boolean;
  sidestepDown: boolean;
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
  damage: number;
  isBlocked: boolean;
  isCounter: boolean;
  isCritical: boolean;
  isGrab: boolean;
  isProjectile?: boolean;
  hitX: number;
  hitY: number;
  hitZ?: number;
  attackType: AttackType;
  comboCount: number;
  comboName?: string;
}

