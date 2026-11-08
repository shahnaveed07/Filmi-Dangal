import { BoneAttachmentName, FighterId, FighterStateName } from '../types/fighter';

/**
 * Standardized Animation Clip Identifiers.
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
  slug: 'action-sultan' | 'romance-raja' | 'duggu' | 'bhidu';
  displayName: string;
  realLifeInspiration: string;
  superShotTitle: string;
  superShotConcept: string;
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
 * Normalizes any character identifier or slug (including hyphenated slugs) to the canonical FighterId.
 */
export function normalizeFighterId(rawId: string): FighterId {
  switch (rawId) {
    case 'action_sultan':
    case 'action-sultan':
      return 'action_sultan';
    case 'romance_raja':
    case 'romance-raja':
      return 'romance_raja';
    case 'duggu':
      return 'duggu';
    case 'bhidu':
      return 'bhidu';
    default:
      return 'action_sultan';
  }
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
  speedRatio = 1.0,
  extraSuperShotAliases: string[] = []
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
      aliases: [
        superShotClip,
        ...extraSuperShotAliases,
        'SuperShot',
        'super_shot',
        'Special_Projectile',
      ],
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
 * Section 9: Production GLB Asset Contract for Final 3D Character Replacement.
 *
 * All four characters currently ship with `isTemporaryPlaceholder: true` and `PLACEHOLDER` status.
 * To replace a temporary character with a final production 3D model, drop a compliant `.glb` file
 * into `modelPath` and set `isTemporaryPlaceholder: false` in `CHARACTER_ASSET_MANIFEST`:
 *
 * 1. Exact File Path:
 *    - Action Sultan : `public/assets/characters/action-sultan/model.glb`
 *    - Romance Raja  : `public/assets/characters/romance-raja/model.glb`
 *    - Duggu         : `public/assets/characters/duggu/model.glb`
 *    - Bhidu         : `public/assets/characters/bhidu/model.glb`
 * 2. Format: glTF 2.0 binary container (`.glb`, magic `0x46546C67`, version `2`) with valid JSON and BIN chunks.
 * 3. Hierarchy: Single clean character root or valid multi-root hierarchy where every imported node attaches cleanly under `modelTransformNode`.
 * 4. Skinning: At least one glTF `skin` with valid `joints`, mesh-node skin binding, and primitives containing valid `POSITION`, `JOINTS_0`, and normalized non-zero `WEIGHTS_0`.
 * 5. Humanoid Bones: All 20 canonical humanoid bones (`Root`, `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `LeftShoulder`, `LeftUpperArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightUpperArm`, `RightForeArm`, `RightHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`) or supported Mixamo/Rigify/Biped aliases in `DEFAULT_HUMANOID_BONE_ALIASES`.
 * 6. Ground Origin: Root/feet positioned at local ground origin `(0, 0, 0)`.
 * 7. Scale & Bounds: Consistent meter-scale humanoid proportions (width `0.15m–4.0m`, height `0.5m–4.5m`, depth `0.08m–4.0m`).
 * 8. Forward Axis: Consistent `+Z` local forward axis (rotated onto the 2D `XY` fighting plane via `facingRotationY`).
 * 9. Materials: Valid glTF PBR materials (`pbrMetallicRoughness`) and embedded textures.
 * 10. Animations & Fallback: Embedded `AnimationGroup` clips matching `ALL_STANDARD_ANIMATION_CLIP_IDS` plus character-specific SuperShot/SuperMove clips; any omitted clips automatically fall back to procedural bone poses without crashing or freezing.
 */
export const PRODUCTION_GLB_ASSET_CONTRACT = {
  format: 'glTF 2.0 Binary (.glb)',
  requiredAttributes: ['POSITION', 'JOINTS_0', 'WEIGHTS_0'] as const,
  groundOrigin: [0, 0, 0] as const,
  forwardAxis: '+Z',
  heightRangeMeters: [0.5, 4.5] as const,
} as const;

/**
 * Centralized Character Asset Manifest for all four Filmi Dangal fighters:
 * - action_sultan (Action Sultan — Salman Khan-inspired)
 * - romance_raja  (Romance Raja — Shah Rukh Khan-inspired)
 * - duggu         (Duggu — Hrithik Roshan-inspired)
 * - bhidu         (Bhidu — Jackie Shroff-inspired)
 */
export const CHARACTER_ASSET_MANIFEST: Record<FighterId, CharacterAssetConfig> = {
  action_sultan: {
    id: 'action_sultan',
    slug: 'action-sultan',
    displayName: 'Action Sultan',
    realLifeInspiration: 'Salman Khan',
    superShotTitle: 'BLACKBUCK GUNSHOT',
    superShotConcept:
      'Draws a stylized parody firearm, sights a brief non-graphic golden blackbuck silhouette hologram, and fires with muzzle flash, recoil, shell ejection, smoke, bullet trail, and explosive impact.',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/action-sultan/model.glb',
    legacyModelPath: '/assets/characters/action-sultan/model.glb',
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
      'Anim_AS_SuperShot_BlackbuckGunshot',
      'Anim_AS_SuperMove_SultanBreaker',
      1.0,
      ['action-sultan-supershot']
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 10,
        specialImpactFrame: 14,
        animationCompleteFrame: 36,
        projectileSpawnBone: 'RightHand',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 12,
        climaxImpactFrame: 20,
        animationCompleteFrame: 42,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/action-sultan/blackbuck-hologram-sight.json',
      superShotProjectileVfx: '/assets/vfx/action-sultan/muzzle-flash-bullet-tracer.json',
      superShotImpactVfx: '/assets/vfx/action-sultan/explosive-ricochet-burst.json',
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
    realLifeInspiration: 'Shah Rukh Khan',
    superShotTitle: 'ICONIC OPEN-ARMS POSE',
    superShotConcept:
      'Steps into a dramatic standing pose, slowly opens both arms wide with chest lifted and head tilted upward amidst golden wind/cloth motion and warm aura, then releases an expanding crimson-gold energy wave.',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/romance-raja/model.glb',
    legacyModelPath: '/assets/characters/romance-raja/model.glb',
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
      'Anim_RR_SuperShot_OpenArmsPose',
      'Anim_RR_SuperMove_BaadshahGrandGesture',
      1.04,
      ['romance-raja-supershot']
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 11,
        specialImpactFrame: 16,
        animationCompleteFrame: 36,
        projectileSpawnBone: 'Chest',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 11,
        climaxImpactFrame: 18,
        animationCompleteFrame: 39,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/romance-raja/open-arms-golden-wind-aura.json',
      superShotProjectileVfx: '/assets/vfx/romance-raja/expanding-cinematic-wave.json',
      superShotImpactVfx: '/assets/vfx/romance-raja/dramatic-spotlight-flash.json',
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

  duggu: {
    id: 'duggu',
    slug: 'duggu',
    displayName: 'Duggu',
    realLifeInspiration: 'Hrithik Roshan',
    superShotTitle: 'KAHO NAA DANCE WAVE',
    superShotConcept:
      'Enters a confident dancer stance, performs energetic Kaho Naa... Pyaar Hai-inspired footwork, expressive arm waves, and an original 360-degree acrobatic spin that releases a rhythmic sonic energy wave.',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/duggu/model.glb',
    legacyModelPath: '/assets/characters/duggu/model.glb',
    portraitPath: '/assets/characters/duggu/portrait.png',
    thumbnailPath: '/assets/characters/duggu/thumbnail.png',
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
      'Anim_DG_SuperShot_KahoNaaDanceWave',
      'Anim_DG_SuperMove_RhythmOverdrive',
      1.08,
      ['duggu-supershot']
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 12,
        specialImpactFrame: 17,
        animationCompleteFrame: 38,
        projectileSpawnBone: 'RightFoot',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 10,
        climaxImpactFrame: 19,
        animationCompleteFrame: 39,
        impactBone: 'RightFoot',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/duggu/rhythmic-ground-beat-rings.json',
      superShotProjectileVfx: '/assets/vfx/duggu/rotating-sonic-dance-arcs.json',
      superShotImpactVfx: '/assets/vfx/duggu/sonic-beat-impact-wave.json',
      superMoveChargeVfx: '/assets/vfx/duggu/cyclone-floor-grid.json',
      superMoveImpactVfx: '/assets/vfx/duggu/supersonic-vortex-drop.json',
      primaryHex: '#0284C7',
      secondaryHex: '#22C55E',
      auraHex: '#06B6D4',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/duggu/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/duggu/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/duggu/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/duggu/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/duggu/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/duggu/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/duggu/hit-react.ogg',
      victorySfx: '/assets/audio/characters/duggu/victory.ogg',
      defeatSfx: '/assets/audio/characters/duggu/defeat.ogg',
    },
  },

  bhidu: {
    id: 'bhidu',
    slug: 'bhidu',
    displayName: 'Bhidu',
    realLifeInspiration: 'Jackie Shroff',
    superShotTitle: 'BHIDU SWAGGER SHOCKWAVE',
    superShotConcept:
      'Starts from a relaxed confident stance, performs Jackie Shroff’s iconic slow deliberate swagger walk with shoulder roll and hand gesture, stops in an intimidating hero stance, and unleashes a heavy ground shockwave.',
    isTemporaryPlaceholder: true,
    modelPath: '/assets/characters/bhidu/model.glb',
    legacyModelPath: '/assets/characters/bhidu/model.glb',
    portraitPath: '/assets/characters/bhidu/portrait.png',
    thumbnailPath: '/assets/characters/bhidu/thumbnail.png',
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
      'Anim_BH_SuperShot_BhiduSwaggerWalk',
      'Anim_BH_SuperMove_BlackoutVerdict',
      0.96,
      ['bhidu-supershot']
    ),
    specialAttackEvents: {
      superShot: {
        chargeStartFrame: 1,
        projectileReleaseFrame: 13,
        specialImpactFrame: 18,
        animationCompleteFrame: 40,
        projectileSpawnBone: 'RightFoot',
      },
      superMove: {
        chargeStartFrame: 1,
        rushFrame: 14,
        climaxImpactFrame: 21,
        animationCompleteFrame: 45,
        impactBone: 'Chest',
      },
    },
    vfx: {
      superShotChargeVfx: '/assets/vfx/bhidu/swagger-step-ground-dust.json',
      superShotProjectileVfx: '/assets/vfx/bhidu/low-freq-ground-shockwave.json',
      superShotImpactVfx: '/assets/vfx/bhidu/heavy-swagger-impact-burst.json',
      superMoveChargeVfx: '/assets/vfx/bhidu/blackout-thunder-roar.json',
      superMoveImpactVfx: '/assets/vfx/bhidu/underworld-judgment-crater.json',
      primaryHex: '#581C87',
      secondaryHex: '#DC2626',
      auraHex: '#F59E0B',
    },
    audio: {
      superShotChargeSfx: '/assets/audio/characters/bhidu/supershot-charge.ogg',
      superShotReleaseSfx: '/assets/audio/characters/bhidu/supershot-release.ogg',
      superShotImpactSfx: '/assets/audio/characters/bhidu/supershot-impact.ogg',
      superMoveChargeSfx: '/assets/audio/characters/bhidu/supermove-charge.ogg',
      superMoveImpactSfx: '/assets/audio/characters/bhidu/supermove-impact.ogg',
      normalAttackSfx: '/assets/audio/characters/bhidu/normal-attack.ogg',
      hitReactSfx: '/assets/audio/characters/bhidu/hit-react.ogg',
      victorySfx: '/assets/audio/characters/bhidu/victory.ogg',
      defeatSfx: '/assets/audio/characters/bhidu/defeat.ogg',
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
    if (ss.specialImpactFrame < ss.projectileReleaseFrame) {
      errors.push('superShot.specialImpactFrame must be >= projectileReleaseFrame');
    }
    if (ss.animationCompleteFrame <= ss.specialImpactFrame) {
      errors.push('superShot.animationCompleteFrame must be > specialImpactFrame');
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
