import { BoneAttachmentName, FighterId, FighterStateName } from '../types/fighter';

/**
 * Standardized Animation Clip Identifiers (Section 3.3).
 * External GLB models map their embedded AnimationGroup names to these 15 canonical clip IDs.
 */
export type StandardAnimationClipId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'landing'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'hit_react'
  | 'block'
  | 'knockout'
  | 'victory'
  | 'defeat'
  | 'super_shot'
  | 'super_move';

export const ALL_STANDARD_ANIMATION_CLIP_IDS: readonly StandardAnimationClipId[] = [
  'idle',
  'walk',
  'run',
  'jump',
  'landing',
  'crouch',
  'punch',
  'kick',
  'hit_react',
  'block',
  'knockout',
  'victory',
  'defeat',
  'super_shot',
  'super_move',
] as const;

export interface AnimationClipMappingConfig {
  clipName: string;
  aliases: string[];
  loop: boolean;
  speedRatio: number;
  blendSeconds: number;
  fallbackClip: StandardAnimationClipId;
}

export interface CharacterSpecialEventConfig {
  superShot: {
    chargeStartFrame: number;
    projectileReleaseFrame: number;
    specialImpactFrame: number;
    animationCompleteFrame: number;
    projectileSpawnBone: BoneAttachmentName;
  };
  superMove: {
    chargeStartFrame: number;
    rushFrame: number;
    climaxImpactFrame: number;
    animationCompleteFrame: number;
    impactBone: BoneAttachmentName;
  };
}

export interface CharacterVFXAssetConfig {
  superShotChargeVfx: string;
  superShotProjectileVfx: string;
  superShotImpactVfx: string;
  superMoveChargeVfx: string;
  superMoveImpactVfx: string;
  primaryHex: string;
  secondaryHex: string;
  auraHex: string;
}

export interface CharacterAudioAssetPaths {
  superShotChargeSfx: string;
  superShotReleaseSfx: string;
  superShotImpactSfx: string;
  superMoveChargeSfx: string;
  superMoveImpactSfx: string;
  normalAttackSfx: string;
  hitReactSfx: string;
  victorySfx: string;
  defeatSfx: string;
}

export interface CharacterAssetConfig {
  id: FighterId;
  slug: string;
  displayName: string;
  /**
   * Explicitly marks whether the current character uses the temporary placeholder rig
   * until a production skinned GLB model is dropped into `modelPath`.
   */
  isTemporaryPlaceholder: boolean;
  modelPath: string;
  legacyModelPath: string;
  portraitPath: string;
  thumbnailPath: string;
  scale: number;
  facingRotationY: {
    right: number;
    left: number;
  };
  groundOffset: number;
  defaultSpawnX: {
    p1: number;
    p2: number;
  };
  animationSpeed: number;
  blendDurationSeconds: number;
  boneAliases: Record<string, string[]>;
  animations: Record<StandardAnimationClipId, AnimationClipMappingConfig>;
  specialAttackEvents: CharacterSpecialEventConfig;
  vfx: CharacterVFXAssetConfig;
  audio: CharacterAudioAssetPaths;
}

/**
 * Shared humanoid bone alias dictionary supporting standard glTF Humanoid,
 * Mixamo (`mixamorig:*`), Blender Rigify (`DEF-*`), and 3ds Max Biped (`Bip01_*`) rigs.
 */
export const DEFAULT_HUMANOID_BONE_ALIASES: Record<string, string[]> = {
  Root: ['Root', 'Armature', 'mixamorig:HipsRoot', 'root', 'CharacterRoot'],
  Hips: ['Hips', 'mixamorig:Hips', 'DEF-spine', 'pelvis', 'Bip01_Pelvis'],
  Spine: ['Spine', 'mixamorig:Spine', 'DEF-spine.001', 'spine_01', 'Bip01_Spine'],
  Chest: [
    'Chest',
    'UpperChest',
    'mixamorig:Spine1',
    'mixamorig:Spine2',
    'DEF-spine.002',
    'spine_02',
    'Bip01_Spine1',
  ],
  Neck: ['Neck', 'mixamorig:Neck', 'DEF-spine.004', 'neck_01', 'Bip01_Neck'],
  Head: ['Head', 'mixamorig:Head', 'DEF-spine.006', 'head', 'Bip01_Head'],
  Jaw: ['Jaw', 'mixamorig:Jaw', 'DEF-jaw', 'jaw'],
  LeftBrow: ['LeftBrow', 'Brow.L', 'DEF-brow.T.L'],
  RightBrow: ['RightBrow', 'Brow.R', 'DEF-brow.T.R'],
  LeftEyelid: ['LeftEyelid', 'Eyelid.L', 'DEF-lid.T.L'],
  RightEyelid: ['RightEyelid', 'Eyelid.R', 'DEF-lid.T.R'],
  LeftShoulder: ['LeftShoulder', 'mixamorig:LeftShoulder', 'DEF-shoulder.L', 'clavicle_l'],
  LeftUpperArm: ['LeftUpperArm', 'mixamorig:LeftArm', 'DEF-upper_arm.L', 'upperarm_l'],
  LeftForeArm: [
    'LeftForeArm',
    'LeftLowerArm',
    'mixamorig:LeftForeArm',
    'DEF-forearm.L',
    'lowerarm_l',
  ],
  LeftHand: ['LeftHand', 'mixamorig:LeftHand', 'DEF-hand.L', 'hand_l'],
  RightShoulder: ['RightShoulder', 'mixamorig:RightShoulder', 'DEF-shoulder.R', 'clavicle_r'],
  RightUpperArm: ['RightUpperArm', 'mixamorig:RightArm', 'DEF-upper_arm.R', 'upperarm_r'],
  RightForeArm: [
    'RightForeArm',
    'RightLowerArm',
    'mixamorig:RightForeArm',
    'DEF-forearm.R',
    'lowerarm_r',
  ],
  RightHand: ['RightHand', 'mixamorig:RightHand', 'DEF-hand.R', 'hand_r'],
  LeftUpLeg: [
    'LeftUpLeg',
    'LeftUpperLeg',
    'mixamorig:LeftUpLeg',
    'DEF-thigh.L',
    'thigh_l',
  ],
  LeftLeg: ['LeftLeg', 'LeftLowerLeg', 'mixamorig:LeftLeg', 'DEF-shin.L', 'calf_l'],
  LeftFoot: ['LeftFoot', 'mixamorig:LeftFoot', 'DEF-foot.L', 'foot_l'],
  RightUpLeg: [
    'RightUpLeg',
    'RightUpperLeg',
    'mixamorig:RightUpLeg',
    'DEF-thigh.R',
    'thigh_r',
  ],
  RightLeg: ['RightLeg', 'RightLowerLeg', 'mixamorig:RightLeg', 'DEF-shin.R', 'calf_r'],
  RightFoot: ['RightFoot', 'mixamorig:RightFoot', 'DEF-foot.R', 'foot_r'],
};

function createCoreClipMappings(
  superShotClip: string,
  superMoveClip: string,
  speedRatio = 1.0
): Record<StandardAnimationClipId, AnimationClipMappingConfig> {
  return {
    idle: {
      clipName: 'Idle',
      aliases: ['Idle', 'idle', 'Fight_Idle', 'Combat_Idle'],
      loop: true,
      speedRatio,
      blendSeconds: 0.12,
      fallbackClip: 'idle',
    },
    walk: {
      clipName: 'Walk',
      aliases: ['Walk', 'walk', 'Walk_Forward', 'Locomotion_Walk'],
      loop: true,
      speedRatio,
      blendSeconds: 0.1,
      fallbackClip: 'idle',
    },
    run: {
      clipName: 'Run',
      aliases: ['Run', 'run', 'Sprint', 'Forward_Run'],
      loop: true,
      speedRatio: speedRatio * 1.1,
      blendSeconds: 0.1,
      fallbackClip: 'walk',
    },
    jump: {
      clipName: 'Jump',
      aliases: ['Jump', 'jump', 'Jump_Start', 'Airborne'],
      loop: false,
      speedRatio,
      blendSeconds: 0.08,
      fallbackClip: 'idle',
    },
    landing: {
      clipName: 'Recovery',
      aliases: ['Landing', 'landing', 'Jump_Land', 'Recovery'],
      loop: false,
      speedRatio,
      blendSeconds: 0.08,
      fallbackClip: 'idle',
    },
    crouch: {
      clipName: 'Crouch',
      aliases: ['Crouch', 'crouch', 'Crouch_Idle'],
      loop: true,
      speedRatio,
      blendSeconds: 0.08,
      fallbackClip: 'idle',
    },
    punch: {
      clipName: 'Punch',
      aliases: ['Punch', 'punch', 'Attack_Punch', 'Jab_Cross'],
      loop: false,
      speedRatio,
      blendSeconds: 0.05,
      fallbackClip: 'idle',
    },
    kick: {
      clipName: 'Kick',
      aliases: ['Kick', 'kick', 'Attack_Kick', 'Roundhouse_Kick'],
      loop: false,
      speedRatio,
      blendSeconds: 0.05,
      fallbackClip: 'idle',
    },
    hit_react: {
      clipName: 'HitReaction',
      aliases: ['HitReaction', 'hit_react', 'Hit_React', 'Hurt', 'Knockback'],
      loop: false,
      speedRatio,
      blendSeconds: 0.04,
      fallbackClip: 'idle',
    },
    block: {
      clipName: 'Block',
      aliases: ['Block', 'block', 'Guard', 'Standing_Block'],
      loop: true,
      speedRatio,
      blendSeconds: 0.06,
      fallbackClip: 'idle',
    },
    knockout: {
      clipName: 'Knockdown',
      aliases: ['Knockdown', 'knockout', 'KO', 'Knockout_Fall'],
      loop: false,
      speedRatio,
      blendSeconds: 0.06,
      fallbackClip: 'defeat',
    },
    victory: {
      clipName: 'Victory',
      aliases: ['Victory', 'victory', 'Win_Pose', 'Victory_Celebration'],
      loop: true,
      speedRatio,
      blendSeconds: 0.15,
      fallbackClip: 'idle',
    },
    defeat: {
      clipName: 'Defeat',
      aliases: ['Defeat', 'defeat', 'Lose_Pose', 'Downed_Loop'],
      loop: true,
      speedRatio,
      blendSeconds: 0.15,
      fallbackClip: 'knockout',
    },
    super_shot: {
      clipName: superShotClip,
      aliases: [superShotClip, 'SuperShot', 'super_shot', 'Special_Projectile'],
      loop: false,
      speedRatio,
      blendSeconds: 0.05,
      fallbackClip: 'punch',
    },
    super_move: {
      clipName: superMoveClip,
      aliases: [superMoveClip, 'SuperMove', 'super_move', 'Ultimate_Finisher'],
      loop: false,
      speedRatio,
      blendSeconds: 0.05,
      fallbackClip: 'kick',
    },
  };
}

/**
 * Centralized Character Asset Manifest for all four Filmi Dangal fighters.
 * Replacing a character model in the future only requires placing the production GLB,
 * portrait, thumbnail, and audio files at the configured paths (or updating this manifest).
 */
export const CHARACTER_ASSET_MANIFEST: Record<FighterId, CharacterAssetConfig> = {
  action_sultan: {
    id: 'action_sultan',
    slug: 'action-sultan',
    displayName: 'Action Sultan',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/action-sultan/model.glb',
    legacyModelPath: '/assets/models/action_sultan.glb',
    portraitPath: '/assets/characters/action-sultan/portrait.png',
    thumbnailPath: '/assets/characters/action-sultan/thumbnail.png',
    scale: 1.04,
    facingRotationY: {
      right: Math.PI * 0.5,
      left: -Math.PI * 0.5,
    },
    groundOffset: 0,
    defaultSpawnX: {
      p1: -2.4,
      p2: 2.4,
    },
    animationSpeed: 1.0,
    blendDurationSeconds: 0.1,
    boneAliases: { ...DEFAULT_HUMANOID_BONE_ALIASES },
    animations: createCoreClipMappings(
      'Anim_AS_SuperShot_PowerlineBlast',
      'Anim_AS_SuperMove_SultanBreaker',
      1.0
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 10,
        specialImpactFrame: 10,
        animationCompleteFrame: 36,
        projectileSpawnBone: 'RightHand',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 12,
        climaxImpactFrame: 20,
        animationCompleteFrame: 48,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/action-sultan/bracelet-flare-charge.json',
      superShotProjectileVfx: '/assets/vfx/action-sultan/turquoise-shock-disc.json',
      superShotImpactVfx: '/assets/vfx/action-sultan/shockwave-impact.json',
      superMoveChargeVfx: '/assets/vfx/action-sultan/sultan-aura-burst.json',
      superMoveImpactVfx: '/assets/vfx/action-sultan/seismic-slam-pillars.json',
      primaryHex: '#1D4ED8',
      secondaryHex: '#F59E0B',
      auraHex: '#F59E0B',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/action-sultan/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/action-sultan/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/action-sultan/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/action-sultan/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/action-sultan/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/action-sultan/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/action-sultan/hit-react.ogg',
      victorySfx: '/assets/audio/characters/action-sultan/victory.ogg',
      defeatSfx: '/assets/audio/characters/action-sultan/defeat.ogg',
    },
  },

  romance_raja: {
    id: 'romance_raja',
    slug: 'romance-raja',
    displayName: 'Romance Raja',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/romance-raja/model.glb',
    legacyModelPath: '/assets/models/romance_raja.glb',
    portraitPath: '/assets/characters/romance-raja/portrait.png',
    thumbnailPath: '/assets/characters/romance-raja/thumbnail.png',
    scale: 1.0,
    facingRotationY: {
      right: Math.PI * 0.5,
      left: -Math.PI * 0.5,
    },
    groundOffset: 0,
    defaultSpawnX: {
      p1: -2.4,
      p2: 2.4,
    },
    animationSpeed: 1.04,
    blendDurationSeconds: 0.1,
    boneAliases: { ...DEFAULT_HUMANOID_BONE_ALIASES },
    animations: createCoreClipMappings(
      'Anim_RR_SuperShot_DilSePulse',
      'Anim_RR_SuperMove_BaadshahGrandGesture',
      1.04
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 9,
        specialImpactFrame: 9,
        animationCompleteFrame: 33,
        projectileSpawnBone: 'Chest',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 11,
        climaxImpactFrame: 18,
        animationCompleteFrame: 44,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/romance-raja/rose-gold-embrace.json',
      superShotProjectileVfx: '/assets/vfx/romance-raja/mohabbat-heart-wave.json',
      superShotImpactVfx: '/assets/vfx/romance-raja/crimson-petal-burst.json',
      superMoveChargeVfx: '/assets/vfx/romance-raja/spotlight-vortex.json',
      superMoveImpactVfx: '/assets/vfx/romance-raja/king-of-hearts-nova.json',
      primaryHex: '#BE123C',
      secondaryHex: '#FBBF24',
      auraHex: '#F43F5E',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/romance-raja/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/romance-raja/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/romance-raja/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/romance-raja/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/romance-raja/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/romance-raja/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/romance-raja/hit-react.ogg',
      victorySfx: '/assets/audio/characters/romance-raja/victory.ogg',
      defeatSfx: '/assets/audio/characters/romance-raja/defeat.ogg',
    },
  },

  dance_dynamo: {
    id: 'dance_dynamo',
    slug: 'dance-dynamo',
    displayName: 'Dance Dynamo',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/dance-dynamo/model.glb',
    legacyModelPath: '/assets/models/dance_dynamo.glb',
    portraitPath: '/assets/characters/dance-dynamo/portrait.png',
    thumbnailPath: '/assets/characters/dance-dynamo/thumbnail.png',
    scale: 1.02,
    facingRotationY: {
      right: Math.PI * 0.5,
      left: -Math.PI * 0.5,
    },
    groundOffset: 0,
    defaultSpawnX: {
      p1: -2.4,
      p2: 2.4,
    },
    animationSpeed: 1.08,
    blendDurationSeconds: 0.08,
    boneAliases: { ...DEFAULT_HUMANOID_BONE_ALIASES },
    animations: createCoreClipMappings(
      'Anim_DD_SuperShot_BeatDrop',
      'Anim_DD_SuperMove_RhythmOverdrive',
      1.08
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 8,
        specialImpactFrame: 8,
        animationCompleteFrame: 30,
        projectileSpawnBone: 'RightFoot',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 10,
        climaxImpactFrame: 19,
        animationCompleteFrame: 42,
        impactBone: 'RightFoot',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/dance-dynamo/neon-equalizer-charge.json',
      superShotProjectileVfx: '/assets/vfx/dance-dynamo/laser-disc-crescent.json',
      superShotImpactVfx: '/assets/vfx/dance-dynamo/cyber-strobe-impact.json',
      superMoveChargeVfx: '/assets/vfx/dance-dynamo/cyclone-floor-grid.json',
      superMoveImpactVfx: '/assets/vfx/dance-dynamo/supersonic-vortex-drop.json',
      primaryHex: '#0284C7',
      secondaryHex: '#22C55E',
      auraHex: '#06B6D4',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/dance-dynamo/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/dance-dynamo/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/dance-dynamo/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/dance-dynamo/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/dance-dynamo/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/dance-dynamo/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/dance-dynamo/hit-react.ogg',
      victorySfx: '/assets/audio/characters/dance-dynamo/victory.ogg',
      defeatSfx: '/assets/audio/characters/dance-dynamo/defeat.ogg',
    },
  },

  villain_saab: {
    id: 'villain_saab',
    slug: 'villain-saab',
    displayName: 'Villain Saab',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/villain-saab/model.glb',
    legacyModelPath: '/assets/models/villain_saab.glb',
    portraitPath: '/assets/characters/villain-saab/portrait.png',
    thumbnailPath: '/assets/characters/villain-saab/thumbnail.png',
    scale: 1.07,
    facingRotationY: {
      right: Math.PI * 0.5,
      left: -Math.PI * 0.5,
    },
    groundOffset: 0,
    defaultSpawnX: {
      p1: -2.4,
      p2: 2.4,
    },
    animationSpeed: 0.96,
    blendDurationSeconds: 0.12,
    boneAliases: { ...DEFAULT_HUMANOID_BONE_ALIASES },
    animations: createCoreClipMappings(
      'Anim_VS_SuperShot_UnderworldBarrage',
      'Anim_VS_SuperMove_BlackoutVerdict',
      0.96
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 12,
        specialImpactFrame: 12,
        animationCompleteFrame: 39,
        projectileSpawnBone: 'RightFoot',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 14,
        climaxImpactFrame: 21,
        animationCompleteFrame: 52,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/villain-saab/magma-fissure-charge.json',
      superShotProjectileVfx: '/assets/vfx/villain-saab/obsidian-shock-spike.json',
      superShotImpactVfx: '/assets/vfx/villain-saab/hellfire-shatter.json',
      superMoveChargeVfx: '/assets/vfx/villain-saab/blackout-thunder-roar.json',
      superMoveImpactVfx: '/assets/vfx/villain-saab/underworld-judgment-crater.json',
      primaryHex: '#581C87',
      secondaryHex: '#DC2626',
      auraHex: '#EF4444',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/villain-saab/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/villain-saab/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/villain-saab/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/villain-saab/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/villain-saab/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/villain-saab/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/villain-saab/hit-react.ogg',
      victorySfx: '/assets/audio/characters/villain-saab/victory.ogg',
      defeatSfx: '/assets/audio/characters/villain-saab/defeat.ogg',
    },
  },
};

export function getCharacterAssetConfig(characterId: FighterId): CharacterAssetConfig {
  return CHARACTER_ASSET_MANIFEST[characterId] || CHARACTER_ASSET_MANIFEST.action_sultan;
}

/**
 * Maps a gameplay `FighterStateName` to one of the 15 standardized animation clip IDs.
 */
export function mapStateToStandardClipId(state: FighterStateName): StandardAnimationClipId {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'walk':
    case 'walk_forward':
    case 'walk_backward':
      return 'walk';
    case 'run':
      return 'run';
    case 'jump':
      return 'jump';
    case 'recovery':
      return 'landing';
    case 'crouch':
      return 'crouch';
    case 'block':
    case 'crouch_block':
      return 'block';
    case 'punch':
    case 'forward_punch':
    case 'grab':
      return 'punch';
    case 'kick':
    case 'forward_kick':
    case 'sweep':
      return 'kick';
    case 'hurt':
    case 'knockback':
      return 'hit_react';
    case 'knockdown':
      return 'knockout';
    case 'victory':
      return 'victory';
    case 'defeat':
      return 'defeat';
    case 'super_shot':
      return 'super_shot';
    case 'super_move':
    case 'super':
    case 'special':
      return 'super_move';
  }
}

/**
 * Resolves the concrete animation clip name for a character and standardized clip ID.
 * If `availableClips` from an imported GLB is provided and the primary clip/aliases are missing,
 * logs a clear warning and returns the configured fallback clip.
 */
export function resolveCharacterAnimationClip(
  characterId: FighterId,
  clipId: StandardAnimationClipId,
  availableClips?: string[],
  onMissingWarning?: (msg: string) => void
): { resolvedClipName: string; mapping: AnimationClipMappingConfig; usedFallback: boolean } {
  const config = getCharacterAssetConfig(characterId);
  const mapping = config.animations[clipId] || config.animations.idle;

  if (!availableClips || availableClips.length === 0) {
    return {
      resolvedClipName: mapping.clipName,
      mapping,
      usedFallback: false,
    };
  }

  const availableSet = new Set(availableClips);
  for (const candidate of [mapping.clipName, ...mapping.aliases]) {
    if (availableSet.has(candidate)) {
      return {
        resolvedClipName: candidate,
        mapping,
        usedFallback: false,
      };
    }
  }

  // Fallback to configured fallbackClip or 'Idle'
  const fallbackConfig = config.animations[mapping.fallbackClip] || config.animations.idle;
  const warnMsg = `[CharacterAssetLoader] Character "${characterId}" is missing animation clip "${mapping.clipName}" (for state "${clipId}"). Falling back to "${fallbackConfig.clipName}".`;
  if (onMissingWarning) {
    onMissingWarning(warnMsg);
  }
  for (const fbCandidate of [fallbackConfig.clipName, ...fallbackConfig.aliases]) {
    if (availableSet.has(fbCandidate)) {
      return {
        resolvedClipName: fbCandidate,
        mapping: fallbackConfig,
        usedFallback: true,
      };
    }
  }

  return {
    resolvedClipName: availableClips[0] || fallbackConfig.clipName,
    mapping: fallbackConfig,
    usedFallback: true,
  };
}

/**
 * Resolves a bone node from an imported GLB node dictionary using the character's bone alias map.
 */
export function resolveAliasedBoneNode<T>(
  characterId: FighterId,
  canonicalBoneName: string,
  nodeMap: Record<string, T>
): T | undefined {
  if (nodeMap[canonicalBoneName]) {
    return nodeMap[canonicalBoneName];
  }
  const config = getCharacterAssetConfig(characterId);
  const aliases =
    config.boneAliases[canonicalBoneName] ||
    DEFAULT_HUMANOID_BONE_ALIASES[canonicalBoneName] ||
    [canonicalBoneName];
  for (const alias of aliases) {
    if (nodeMap[alias]) {
      return nodeMap[alias];
    }
  }
  return undefined;
}

export interface CharacterManifestValidationResult {
  valid: boolean;
  characterId: FighterId;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a `CharacterAssetConfig` entry defines all required paths,
 * standardized animation mappings, special attack event timings, VFX, and audio paths.
 */
export function validateCharacterAssetManifestConfig(
  config: CharacterAssetConfig
): CharacterManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.id) errors.push('Missing character id');
  if (!config.slug) errors.push('Missing character slug');
  if (!config.modelPath || !config.modelPath.endsWith('.glb')) {
    errors.push(`Invalid modelPath "${config.modelPath}" (must end with .glb)`);
  }
  if (!config.portraitPath) errors.push('Missing portraitPath');
  if (!config.thumbnailPath) errors.push('Missing thumbnailPath');
  if (typeof config.scale !== 'number' || config.scale <= 0) {
    errors.push(`Invalid scale: ${config.scale}`);
  }

  for (const clipId of ALL_STANDARD_ANIMATION_CLIP_IDS) {
    const clip = config.animations?.[clipId];
    if (!clip || !clip.clipName) {
      errors.push(`Missing animation mapping for standard clip "${clipId}"`);
    }
  }

  const ss = config.specialAttackEvents?.superShot;
  if (!ss) {
    errors.push('Missing superShot specialAttackEvents config');
  } else {
    if (ss.chargeStartFrame < 1) errors.push('superShot.chargeStartFrame must be >= 1');
    if (ss.projectileReleaseFrame <= ss.chargeStartFrame) {
      errors.push('superShot.projectileReleaseFrame must be > chargeStartFrame');
    }
    if (ss.animationCompleteFrame <= ss.projectileReleaseFrame) {
      errors.push('superShot.animationCompleteFrame must be > projectileReleaseFrame');
    }
  }

  const sm = config.specialAttackEvents?.superMove;
  if (!sm) {
    errors.push('Missing superMove specialAttackEvents config');
  } else {
    if (sm.chargeStartFrame < 1) errors.push('superMove.chargeStartFrame must be >= 1');
    if (sm.climaxImpactFrame <= sm.chargeStartFrame) {
      errors.push('superMove.climaxImpactFrame must be > chargeStartFrame');
    }
    if (sm.animationCompleteFrame <= sm.climaxImpactFrame) {
      errors.push('superMove.animationCompleteFrame must be > climaxImpactFrame');
    }
  }

  const requiredAudioKeys: Array<keyof CharacterAudioAssetPaths> = [
    'superShotChargeSfx',
    'superShotReleaseSfx',
    'superShotImpactSfx',
    'superMoveChargeSfx',
    'superMoveImpactSfx',
    'normalAttackSfx',
    'hitReactSfx',
    'victorySfx',
    'defeatSfx',
  ];
  for (const key of requiredAudioKeys) {
    if (!config.audio?.[key]) {
      errors.push(`Missing audio path for "${key}"`);
    }
  }

  if (config.isTemporaryPlaceholder) {
    warnings.push(
      `Character "${config.id}" is currently flagged as a temporary placeholder asset (isTemporaryPlaceholder: true) awaiting final production GLB drop-in at ${config.modelPath}.`
    );
  }

  return {
    valid: errors.length === 0,
    characterId: config.id,
    errors,
    warnings,
  };
}
