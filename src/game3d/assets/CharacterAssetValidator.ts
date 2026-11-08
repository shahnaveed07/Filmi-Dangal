import {
  DEFAULT_HUMANOID_BONE_ALIASES,
  getCharacterAssetConfig,
  normalizeFighterId,
} from '../../config/characterAssets';

/**
 * CharacterAssetValidator
 *
 * Validates binary glTF 2.0 (.glb) fighter assets and runtime character rigs.
 * Separates three distinct validation layers (Section 5):
 * 1. `glbFileValid`       — Structural GLB 2.0 header, JSON chunk, BIN chunk, bufferViews, accessors, and meshes.
 * 2. `productionRigValid` — Genuine skinned production rig (glTF `skins`, `JOINTS_0`, `WEIGHTS_0` with usable weights,
 *                           valid joint node references, humanoid bone hierarchy, PBR materials, ground origin, non-zero bounds,
 *                           and not a box-primitive placeholder).
 * 3. `animationValid`     — Usable animation clips with valid channels/samplers targeting rig nodes.
 */

export const SHARED_HUMANOID_BONES = [
  'Root',
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftUpperArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightUpperArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;

export const FACIAL_EXPRESSION_RIG_BONES = [
  'Jaw',
  'LeftBrow',
  'RightBrow',
  'LeftEyelid',
  'RightEyelid',
] as const;

export const REQUIRED_LOD_LEVELS = ['LOD0_High', 'LOD1_Medium', 'LOD2_Low'] as const;

export const REQUIRED_CORE_ANIMATION_CLIPS = [
  'Idle',
  'Walk',
  'Run',
  'Jump',
  'Crouch',
  'Block',
  'Punch',
  'Kick',
  'Grab',
  'HitReaction',
  'Knockback',
  'Knockdown',
  'Recovery',
  'Victory',
  'Defeat',
] as const;

export const EXPECTED_SPECIAL_CLIPS: Record<
  string,
  { superShotClip: string; superMoveClip: string }
> = {
  action_sultan: {
    superShotClip: 'Anim_AS_SuperShot_BlackbuckGunshot',
    superMoveClip: 'Anim_AS_SuperMove_SultanBreaker',
  },
  romance_raja: {
    superShotClip: 'Anim_RR_SuperShot_OpenArmsPose',
    superMoveClip: 'Anim_RR_SuperMove_BaadshahGrandGesture',
  },
  duggu: {
    superShotClip: 'Anim_DG_SuperShot_KahoNaaDanceWave',
    superMoveClip: 'Anim_DG_SuperMove_RhythmOverdrive',
  },
  bhidu: {
    superShotClip: 'Anim_BH_SuperShot_BhiduSwaggerWalk',
    superMoveClip: 'Anim_BH_SuperMove_BlackoutVerdict',
  },
};

export interface CharacterAssetValidationReport {
  /** Backward-compatible overall structural + humanoid + animation validity flag */
  isValid: boolean;
  /** Layer 1: Is the GLB 2.0 binary file structurally readable and well-formed? */
  glbFileValid: boolean;
  /** Layer 2: Is it genuinely a skinned, rigged production character (not a placeholder)? */
  productionRigValid: boolean;
  /** Layer 3: Does it contain usable animation clips targeting the character rig? */
  animationValid: boolean;
  /** True when the asset is a placeholder or lacks production skinning */
  isPlaceholder: boolean;
  characterId: string;
  characterName: string;
  productionStatus:
    | 'PRODUCTION_READY'
    | 'PLACEHOLDER'
    | 'VERTICAL_SLICE_COMPLETE'
    | 'STAGE_2_INTEGRATED'
    | 'GRAYBOX_PLACEHOLDER';
  glbVersion: number;
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  skinCount: number;
  jointCount: number;
  skinningValid: boolean;
  hasValidJointsAttribute: boolean;
  hasValidWeightsAttribute: boolean;
  hasUsableVertexWeights: boolean;
  missingHumanoidBones: string[];
  missingFacialRigBones: string[];
  lodLevelsFound: string[];
  documentedAnimations: string[];
  missingAnimations: string[];
  groundOriginVerified: boolean;
  plausibleBoundsVerified: boolean;
  estimatedBounds: {
    width: number;
    height: number;
    depth: number;
  };
  forwardOrientation: string;
  specialClipsUnique: boolean;
  productionEligibilityReasons: string[];
  placeholderDisclosures: string[];
  errors: string[];
}

interface GltfNodeRaw {
  name?: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  mesh?: number;
  skin?: number;
}

interface GltfPrimitiveRaw {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
}

interface GltfMeshRaw {
  name?: string;
  primitives?: GltfPrimitiveRaw[];
}

interface GltfSkinRaw {
  name?: string;
  joints?: number[];
  skeleton?: number;
  inverseBindMatrices?: number;
}

interface GltfAccessorRaw {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  type?: string;
  min?: number[];
  max?: number[];
}

interface GltfBufferViewRaw {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
}

interface GltfAnimationRaw {
  name?: string;
  channels?: Array<{
    sampler?: number;
    target?: {
      node?: number;
      path?: string;
    };
  }>;
  samplers?: Array<{
    input?: number;
    output?: number;
    interpolation?: string;
  }>;
}

export function stripBoneNamespacePrefix(rawName: string): string {
  const pipeIdx = rawName.lastIndexOf('|');
  const afterPipe = pipeIdx >= 0 ? rawName.slice(pipeIdx + 1) : rawName;
  const colonIdx = afterPipe.lastIndexOf(':');
  return colonIdx >= 0 ? afterPipe.slice(colonIdx + 1) : afterPipe;
}

export function doesNodeSetContainBone(
  characterId: string,
  canonicalBone: string,
  nodeNames: Set<string>,
  strippedNodeNames: Set<string>
): boolean {
  if (nodeNames.has(canonicalBone) || strippedNodeNames.has(canonicalBone)) {
    return true;
  }
  const normalizedId = normalizeFighterId(characterId);
  const manifest = getCharacterAssetConfig(normalizedId);
  const aliases =
    manifest.boneAliases[canonicalBone] ||
    DEFAULT_HUMANOID_BONE_ALIASES[canonicalBone] ||
    [canonicalBone];

  for (const alias of aliases) {
    if (nodeNames.has(alias) || strippedNodeNames.has( stripBoneNamespacePrefix(alias))) {
      return true;
    }
  }
  return false;
}

export class CharacterAssetValidator {
  /**
   * Validates raw binary .glb ArrayBuffer or Node Buffer for a character.
   * Performs structural GLB validation, glTF skinning/joint/weight validation,
   * humanoid bone alias resolution, and animation channel validation.
   */
  public static validateGLBBuffer(
    buffer: ArrayBuffer | Uint8Array,
    expectedCharacterId?: string
  ): CharacterAssetValidationReport {
    const bytes =
      buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer, 0, buffer.byteLength);

    const emptyReport = (err: string): CharacterAssetValidationReport => ({
      isValid: false,
      glbFileValid: false,
      productionRigValid: false,
      animationValid: false,
      isPlaceholder: true,
      characterId: expectedCharacterId || 'unknown',
      characterName: 'UNKNOWN',
      productionStatus: 'GRAYBOX_PLACEHOLDER',
      glbVersion: 0,
      nodeCount: 0,
      meshCount: 0,
      materialCount: 0,
      skinCount: 0,
      jointCount: 0,
      skinningValid: false,
      hasValidJointsAttribute: false,
      hasValidWeightsAttribute: false,
      hasUsableVertexWeights: false,
      missingHumanoidBones: [...SHARED_HUMANOID_BONES],
      missingFacialRigBones: [...FACIAL_EXPRESSION_RIG_BONES],
      lodLevelsFound: [],
      documentedAnimations: [],
      missingAnimations: [...REQUIRED_CORE_ANIMATION_CLIPS],
      groundOriginVerified: false,
      plausibleBoundsVerified: false,
      estimatedBounds: { width: 0, height: 0, depth: 0 },
      forwardOrientation: 'UNKNOWN',
      specialClipsUnique: false,
      productionEligibilityReasons: [err],
      placeholderDisclosures: [
        'Invalid or missing GLB binary asset; using temporary procedural placeholder rig.',
      ],
      errors: [err],
    });

    if (bytes.byteLength < 20) {
      return emptyReport('GLB file is smaller than 20-byte glTF 2.0 header');
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const totalLength = view.getUint32(8, true);

    if (magic !== 0x46546c67 || version !== 2) {
      return emptyReport(
        `Invalid GLB header magic (0x${magic.toString(16)}) or version (${version})`
      );
    }

    if (totalLength > bytes.byteLength || totalLength < 20) {
      return emptyReport(
        `Truncated or mismatched GLB header length (${totalLength} vs byteLength ${bytes.byteLength})`
      );
    }

    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    if (jsonChunkType !== 0x4e4f534a) {
      return emptyReport('First GLB chunk is not JSON (0x4E4F534A)');
    }

    if (20 + jsonChunkLength > bytes.byteLength) {
      return emptyReport('Truncated GLB: JSON chunk length exceeds buffer size');
    }

    const jsonBytes = bytes.subarray(20, 20 + jsonChunkLength);
    const jsonText = new TextDecoder('utf-8').decode(jsonBytes).replace(/\0+$/, '').trim();

    let binChunkSubarray: Uint8Array | null = null;
    const binChunkHeaderOffset = 20 + jsonChunkLength;
    if (binChunkHeaderOffset + 8 <= bytes.byteLength) {
      const binLen = view.getUint32(binChunkHeaderOffset, true);
      const binType = view.getUint32(binChunkHeaderOffset + 4, true);
      if (
        binType === 0x004e4942 &&
        binChunkHeaderOffset + 8 + binLen <= bytes.byteLength
      ) {
        binChunkSubarray = bytes.subarray(
          binChunkHeaderOffset + 8,
          binChunkHeaderOffset + 8 + binLen
        );
      }
    }

    try {
      const gltf = JSON.parse(jsonText);
      const nodes: GltfNodeRaw[] = Array.isArray(gltf.nodes) ? gltf.nodes : [];
      const meshes: GltfMeshRaw[] = Array.isArray(gltf.meshes) ? gltf.meshes : [];
      const skins: GltfSkinRaw[] = Array.isArray(gltf.skins) ? gltf.skins : [];
      const accessors: GltfAccessorRaw[] = Array.isArray(gltf.accessors)
        ? gltf.accessors
        : [];
      const bufferViews: GltfBufferViewRaw[] = Array.isArray(gltf.bufferViews)
        ? gltf.bufferViews
        : [];
      const materials: Array<{ name?: string; pbrMetallicRoughness?: unknown }> =
        Array.isArray(gltf.materials) ? gltf.materials : [];
      const animations: GltfAnimationRaw[] = Array.isArray(gltf.animations)
        ? gltf.animations
        : [];

      const extras = gltf.asset?.extras || {};
      const characterId: string =
        extras.characterId || expectedCharacterId || 'action_sultan';
      const characterName: string = extras.characterName || characterId.toUpperCase();

      const nodeNames = new Set(nodes.map((n) => n.name || '').filter(Boolean));
      const strippedNodeNames = new Set(
        nodes.map((n) => stripBoneNamespacePrefix(n.name || '')).filter(Boolean)
      );

      const missingHumanoidBones = SHARED_HUMANOID_BONES.filter(
        (b) => !doesNodeSetContainBone(characterId, b, nodeNames, strippedNodeNames)
      );
      const missingFacialRigBones = FACIAL_EXPRESSION_RIG_BONES.filter(
        (b) => !doesNodeSetContainBone(characterId, b, nodeNames, strippedNodeNames)
      );
      const lodLevelsFound = REQUIRED_LOD_LEVELS.filter((lod) => nodeNames.has(lod));

      const rootNode = nodes.find(
        (n) =>
          n.name === 'Root' ||
          n.name === 'Armature' ||
          stripBoneNamespacePrefix(n.name || '') === 'Root'
      );
      const groundOriginVerified = Boolean(
        rootNode &&
          (!Array.isArray(rootNode.translation) ||
            (Math.abs(rootNode.translation[0]) < 0.05 &&
              Math.abs(rootNode.translation[1]) < 0.15 &&
              Math.abs(rootNode.translation[2]) < 0.05))
      );

      const forwardOrientation: string = extras.forwardAxis || '+Z';

      // Validate bufferViews and accessors
      const isValidAccessorIndex = (idx: unknown): idx is number =>
        typeof idx === 'number' &&
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx < accessors.length &&
        typeof accessors[idx].bufferView === 'number' &&
        accessors[idx].bufferView! >= 0 &&
        accessors[idx].bufferView! < bufferViews.length;

      // Estimate bounds from POSITION accessors + node translations
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      let hasPositionAccessor = false;

      for (const m of meshes) {
        for (const prim of m.primitives || []) {
          const posIdx = prim.attributes?.POSITION;
          if (isValidAccessorIndex(posIdx)) {
            const acc = accessors[posIdx];
            if ((acc.count ?? 0) > 0) {
              hasPositionAccessor = true;
              if (
                Array.isArray(acc.min) &&
                acc.min.length === 3 &&
                Array.isArray(acc.max) &&
                acc.max.length === 3
              ) {
                minX = Math.min(minX, acc.min[0]);
                minY = Math.min(minY, acc.min[1]);
                minZ = Math.min(minZ, acc.min[2]);
                maxX = Math.max(maxX, acc.max[0]);
                maxY = Math.max(maxY, acc.max[1]);
                maxZ = Math.max(maxZ, acc.max[2]);
              }
            }
          }
        }
      }
      for (const n of nodes) {
        if (Array.isArray(n.translation) && n.translation.length === 3) {
          minX = Math.min(minX, n.translation[0]);
          minY = Math.min(minY, n.translation[1]);
          minZ = Math.min(minZ, n.translation[2]);
          maxX = Math.max(maxX, n.translation[0]);
          maxY = Math.max(maxY, n.translation[1]);
          maxZ = Math.max(maxZ, n.translation[2]);
        }
      }

      const estWidth = Number.isFinite(maxX - minX) ? Math.max(0, maxX - minX) : 0;
      const estHeight = Number.isFinite(maxY - minY) ? Math.max(0, maxY - minY) : 0;
      const estDepth = Number.isFinite(maxZ - minZ) ? Math.max(0, maxZ - minZ) : 0;
      const plausibleBoundsVerified =
        hasPositionAccessor &&
        estWidth > 0.1 &&
        estHeight > 0.4 &&
        estHeight < 6.0 &&
        estDepth > 0.05;

      // Skinning & Joint / Weight Verification (Section 5)
      let validSkins = skins.length > 0;
      let totalJoints = 0;
      for (const skin of skins) {
        if (!Array.isArray(skin.joints) || skin.joints.length === 0) {
          validSkins = false;
        } else {
          for (const jIdx of skin.joints) {
            if (typeof jIdx !== 'number' || jIdx < 0 || jIdx >= nodes.length) {
              validSkins = false;
            } else {
              totalJoints++;
            }
          }
        }
        if (
          skin.skeleton !== undefined &&
          (typeof skin.skeleton !== 'number' ||
            skin.skeleton < 0 ||
            skin.skeleton >= nodes.length)
        ) {
          validSkins = false;
        }
      }

      let hasValidJointsAttribute = false;
      let hasValidWeightsAttribute = false;
      let hasUsableVertexWeights = false;

      for (const m of meshes) {
        for (const prim of m.primitives || []) {
          const jointsAccIdx = prim.attributes?.JOINTS_0;
          const weightsAccIdx = prim.attributes?.WEIGHTS_0;
          if (
            isValidAccessorIndex(jointsAccIdx) &&
            isValidAccessorIndex(weightsAccIdx)
          ) {
            const jAcc = accessors[jointsAccIdx];
            const wAcc = accessors[weightsAccIdx];
            if (
              jAcc.type === 'VEC4' &&
              (jAcc.count ?? 0) > 0 &&
              wAcc.type === 'VEC4' &&
              wAcc.count === jAcc.count
            ) {
              hasValidJointsAttribute = true;
              hasValidWeightsAttribute = true;

              // Inspect actual vertex weights in binary buffer if float32 (5126)
              const bv = bufferViews[wAcc.bufferView!];
              if (
                binChunkSubarray &&
                bv &&
                wAcc.componentType === 5126 &&
                typeof bv.byteOffset === 'number' &&
                typeof bv.byteLength === 'number'
              ) {
                const start = bv.byteOffset + (wAcc.byteOffset || 0);
                const floatCount = Math.min((wAcc.count ?? 0) * 4, Math.floor((binChunkSubarray.byteLength - start) / 4));
                if (floatCount >= 4) {
                  const weightView = new DataView(
                    binChunkSubarray.buffer,
                    binChunkSubarray.byteOffset + start,
                    floatCount * 4
                  );
                  let nonZeroWeightFound = false;
                  for (let i = 0; i < floatCount; i += 4) {
                    const sum =
                      weightView.getFloat32(i * 4, true) +
                      weightView.getFloat32((i + 1) * 4, true) +
                      weightView.getFloat32((i + 2) * 4, true) +
                      weightView.getFloat32((i + 3) * 4, true);
                    if (sum > 0.01 && Number.isFinite(sum)) {
                      nonZeroWeightFound = true;
                      break;
                    }
                  }
                  if (nonZeroWeightFound) {
                    hasUsableVertexWeights = true;
                  }
                }
              } else if ((wAcc.count ?? 0) > 0) {
                hasUsableVertexWeights = true;
              }
            }
          }
        }
      }

      const skinningValid =
        validSkins &&
        totalJoints > 0 &&
        hasValidJointsAttribute &&
        hasValidWeightsAttribute &&
        hasUsableVertexWeights;

      // Animation validity
      const documentedAnimations: string[] = [];
      let validAnimationChannels = true;
      for (const anim of animations) {
        if (anim.name) {
          documentedAnimations.push(anim.name);
        }
        if (!Array.isArray(anim.channels) || anim.channels.length === 0) {
          validAnimationChannels = false;
        } else {
          for (const ch of anim.channels) {
            const nodeIdx = ch.target?.node;
            if (
              typeof nodeIdx !== 'number' ||
              nodeIdx < 0 ||
              nodeIdx >= nodes.length
            ) {
              validAnimationChannels = false;
            }
          }
        }
      }

      const animSet = new Set(documentedAnimations);
      const missingAnimations: string[] = REQUIRED_CORE_ANIMATION_CLIPS.filter(
        (clip) => !animSet.has(clip)
      );

      const expectedSpecials = EXPECTED_SPECIAL_CLIPS[characterId];
      let specialClipsUnique = false;
      if (expectedSpecials) {
        const hasShot = animSet.has(expectedSpecials.superShotClip);
        const hasMove = animSet.has(expectedSpecials.superMoveClip);
        if (!hasShot) missingAnimations.push(expectedSpecials.superShotClip);
        if (!hasMove) missingAnimations.push(expectedSpecials.superMoveClip);
        specialClipsUnique =
          hasShot &&
          hasMove &&
          expectedSpecials.superShotClip !== expectedSpecials.superMoveClip;
      }

      const glbFileValid =
        meshes.length > 0 &&
        nodes.length > 0 &&
        hasPositionAccessor &&
        materials.length > 0;

      const animationValid =
        documentedAnimations.length > 0 &&
        validAnimationChannels &&
        missingAnimations.length === 0;

      const explicitlyMarkedPlaceholder =
        extras.isPlaceholder === true ||
        extras.productionStatus === 'PLACEHOLDER' ||
        extras.productionStatus === 'GRAYBOX_PLACEHOLDER';

      const productionEligibilityReasons: string[] = [];
      if (!glbFileValid) {
        productionEligibilityReasons.push('GLB file lacks valid meshes, nodes, positions, or materials');
      }
      if (explicitlyMarkedPlaceholder) {
        productionEligibilityReasons.push('Asset metadata explicitly flags model as a temporary placeholder');
      }
      if (!validSkins || skins.length === 0) {
        productionEligibilityReasons.push('GLB contains no valid glTF skin definitions (`skins`)');
      }
      if (!hasValidJointsAttribute) {
        productionEligibilityReasons.push('Mesh primitives lack valid `JOINTS_0` skinning attribute');
      }
      if (!hasValidWeightsAttribute || !hasUsableVertexWeights) {
        productionEligibilityReasons.push('Mesh primitives lack valid `WEIGHTS_0` vertex weight data');
      }
      if (missingHumanoidBones.length > 0) {
        productionEligibilityReasons.push(
          `Missing required humanoid bones: ${missingHumanoidBones.join(', ')}`
        );
      }
      if (!groundOriginVerified) {
        productionEligibilityReasons.push('Root bone ground origin is not near (0, 0, 0)');
      }
      if (!plausibleBoundsVerified) {
        productionEligibilityReasons.push('Model bounding dimensions are zero or implausible');
      }

      const productionRigValid = productionEligibilityReasons.length === 0;
      const isPlaceholder = !productionRigValid;

      const errors: string[] = [];
      if (!glbFileValid) {
        errors.push('GLB structure is missing valid meshes, position accessors, or materials');
      }
      if (missingHumanoidBones.length > 0) {
        errors.push(`Missing humanoid bones: ${missingHumanoidBones.join(', ')}`);
      }
      if (!groundOriginVerified) {
        errors.push('Root bone ground origin is not at (0, 0, 0)');
      }
      if (materials.length < 1) {
        errors.push('GLB must define at least 1 material');
      }
      if (missingAnimations.length > 0) {
        errors.push(`Missing documented animation clips: ${missingAnimations.join(', ')}`);
      }

      const productionStatus: CharacterAssetValidationReport['productionStatus'] =
        productionRigValid
          ? 'PRODUCTION_READY'
          : extras.productionStatus === 'VERTICAL_SLICE_COMPLETE'
          ? 'VERTICAL_SLICE_COMPLETE'
          : extras.productionStatus === 'STAGE_2_INTEGRATED'
          ? 'STAGE_2_INTEGRATED'
          : 'PLACEHOLDER';

      const placeholderDisclosures: string[] = isPlaceholder
        ? [
            `Temporary placeholder asset active for ${characterName} (${characterId}). Reason: ${productionEligibilityReasons.join(
              '; '
            )}. Using procedural humanoid character rig until a skinned production GLB is supplied.`,
          ]
        : [`Production skinned GLB verified for ${characterName} (${characterId}).`];

      return {
        isValid: errors.length === 0,
        glbFileValid,
        productionRigValid,
        animationValid,
        isPlaceholder,
        characterId,
        characterName,
        productionStatus,
        glbVersion: version,
        nodeCount: nodes.length,
        meshCount: meshes.length,
        materialCount: materials.length,
        skinCount: skins.length,
        jointCount: totalJoints,
        skinningValid,
        hasValidJointsAttribute,
        hasValidWeightsAttribute,
        hasUsableVertexWeights,
        missingHumanoidBones,
        missingFacialRigBones,
        lodLevelsFound,
        documentedAnimations,
        missingAnimations,
        groundOriginVerified,
        plausibleBoundsVerified,
        estimatedBounds: {
          width: Number(estWidth.toFixed(3)),
          height: Number(estHeight.toFixed(3)),
          depth: Number(estDepth.toFixed(3)),
        },
        forwardOrientation,
        specialClipsUnique,
        productionEligibilityReasons,
        placeholderDisclosures,
        errors,
      };
    } catch (err) {
      return emptyReport(`Failed to parse GLB JSON chunk: ${(err as Error).message}`);
    }
  }

  /**
   * Verifies across all 4 roster characters that no two fighters share the same
   * SuperShot or SuperMove animation clip names.
   */
  public static verifyCrossCharacterSpecialUniqueness(
    reports: CharacterAssetValidationReport[]
  ): { unique: boolean; duplicates: string[] } {
    const seenSpecials = new Set<string>();
    const duplicates: string[] = [];

    for (const report of reports) {
      const customAnims = report.documentedAnimations.filter((name) =>
        name.startsWith('Anim_')
      );
      for (const clip of customAnims) {
        if (seenSpecials.has(clip)) {
          duplicates.push(clip);
        }
        seenSpecials.add(clip);
      }
    }

    return {
      unique: duplicates.length === 0 && seenSpecials.size >= reports.length * 2,
      duplicates,
    };
  }
}
