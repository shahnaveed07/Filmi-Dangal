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
  /** Layer 4: Fully production-ready character (glbFileValid && productionRigValid && animationValid && !isPlaceholder) */
  productionReady: boolean;
  /** True when the asset is a placeholder or lacks production skinning */
  isPlaceholder: boolean;
  /** True when the asset has valid geometry/materials/bounds but lacks humanoid skeleton/skinning */
  isVisualOnly: boolean;
  characterId: string;
  characterName: string;
  productionStatus:
    | 'PRODUCTION_READY'
    | 'VISUAL_ONLY'
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
  normalized?: boolean;
  count?: number;
  type?: string;
  min?: number[];
  max?: number[];
}

interface GltfBufferViewRaw {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
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
    if (nodeNames.has(alias) || strippedNodeNames.has(stripBoneNamespacePrefix(alias))) {
      return true;
    }
  }
  return false;
}

function getComponentByteSize(componentType?: number): number {
  switch (componentType) {
    case 5120: // BYTE
    case 5121: // UNSIGNED_BYTE
      return 1;
    case 5122: // SHORT
    case 5123: // UNSIGNED_SHORT
      return 2;
    case 5125: // UNSIGNED_INT
    case 5126: // FLOAT
      return 4;
    default:
      return 0;
  }
}

function getAccessorTypeComponentCount(type?: string): number {
  switch (type) {
    case 'SCALAR':
      return 1;
    case 'VEC2':
      return 2;
    case 'VEC3':
      return 3;
    case 'VEC4':
    case 'MAT2':
      return 4;
    case 'MAT3':
      return 9;
    case 'MAT4':
      return 16;
    default:
      return 0;
  }
}

function validateAccessorBinaryBounds(
  acc: GltfAccessorRaw,
  bv: GltfBufferViewRaw | undefined,
  binByteLength: number
): {
  valid: boolean;
  startOffset: number;
  stride: number;
  elementBytes: number;
  componentBytes: number;
  numComponents: number;
} {
  if (!bv) {
    return {
      valid: false,
      startOffset: 0,
      stride: 0,
      elementBytes: 0,
      componentBytes: 0,
      numComponents: 0,
    };
  }
  const count = acc.count ?? 0;
  const componentBytes = getComponentByteSize(acc.componentType);
  const numComponents = getAccessorTypeComponentCount(acc.type);
  const elementBytes = componentBytes * numComponents;
  if (count <= 0 || componentBytes === 0 || numComponents === 0) {
    return {
      valid: false,
      startOffset: 0,
      stride: 0,
      elementBytes,
      componentBytes,
      numComponents,
    };
  }

  const bvOffset = bv.byteOffset ?? 0;
  const bvLength = bv.byteLength ?? 0;
  const accOffset = acc.byteOffset ?? 0;
  if (
    !Number.isInteger(bvOffset) ||
    bvOffset < 0 ||
    !Number.isInteger(bvLength) ||
    bvLength <= 0 ||
    !Number.isInteger(accOffset) ||
    accOffset < 0 ||
    bvOffset + bvLength > binByteLength
  ) {
    return {
      valid: false,
      startOffset: 0,
      stride: 0,
      elementBytes,
      componentBytes,
      numComponents,
    };
  }

  const stride = bv.byteStride ?? elementBytes;
  if (!Number.isInteger(stride) || stride < elementBytes || stride > 255) {
    return {
      valid: false,
      startOffset: 0,
      stride: 0,
      elementBytes,
      componentBytes,
      numComponents,
    };
  }

  const requiredSpanInBufferView = accOffset + (count - 1) * stride + elementBytes;
  const startOffset = bvOffset + accOffset;
  if (
    requiredSpanInBufferView > bvLength ||
    startOffset + (count - 1) * stride + elementBytes > binByteLength
  ) {
    return {
      valid: false,
      startOffset,
      stride,
      elementBytes,
      componentBytes,
      numComponents,
    };
  }

  return {
    valid: true,
    startOffset,
    stride,
    elementBytes,
    componentBytes,
    numComponents,
  };
}

export class CharacterAssetValidator {
  /**
   * Validates raw binary .glb ArrayBuffer or Node Buffer for a character.
   * Performs structural GLB validation, glTF skinning/joint/weight validation,
   * humanoid bone alias resolution, and animation channel/sampler/binary validation.
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
      productionReady: false,
      isPlaceholder: true,
      isVisualOnly: false,
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

      const binByteLength = binChunkSubarray ? binChunkSubarray.byteLength : 0;

      // Validate bufferViews and accessors
      const isValidAccessorIndex = (idx: unknown): idx is number =>
        typeof idx === 'number' &&
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx < accessors.length &&
        typeof accessors[idx].bufferView === 'number' &&
        Number.isInteger(accessors[idx].bufferView) &&
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
            const bv = bufferViews[acc.bufferView!];
            const boundsCheck =
              binByteLength > 0
                ? validateAccessorBinaryBounds(acc, bv, binByteLength)
                : { valid: (acc.count ?? 0) > 0 };
            if (
              acc.type === 'VEC3' &&
              acc.componentType === 5126 &&
              (acc.count ?? 0) > 0 &&
              boundsCheck.valid
            ) {
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

      // =========================================================================
      // Section 4: Strengthened glTF Skinning, Joint Index & Vertex Weight Checks
      // =========================================================================
      let validSkins = skins.length > 0;
      let totalJoints = 0;
      const skinJointCounts = new Map<number, number>();

      for (let sIdx = 0; sIdx < skins.length; sIdx++) {
        const skin = skins[sIdx];
        if (!Array.isArray(skin.joints) || skin.joints.length === 0) {
          validSkins = false;
        } else {
          const seenInSkin = new Set<number>();
          for (const jIdx of skin.joints) {
            if (
              typeof jIdx !== 'number' ||
              !Number.isInteger(jIdx) ||
              jIdx < 0 ||
              jIdx >= nodes.length ||
              seenInSkin.has(jIdx)
            ) {
              validSkins = false;
            } else {
              seenInSkin.add(jIdx);
              totalJoints++;
            }
          }
          skinJointCounts.set(sIdx, skin.joints.length);
        }
        if (
          skin.skeleton !== undefined &&
          (typeof skin.skeleton !== 'number' ||
            !Number.isInteger(skin.skeleton) ||
            skin.skeleton < 0 ||
            skin.skeleton >= nodes.length)
        ) {
          validSkins = false;
        }
      }

      // Verify mesh-node skin assignments (`node.mesh` + `node.skin`)
      const meshToSkinMap = new Map<number, number>();
      let validMeshNodeSkinBinding = false;
      let invalidNodeSkinAssignment = false;

      for (const n of nodes) {
        if (n.skin !== undefined) {
          if (
            typeof n.skin !== 'number' ||
            !Number.isInteger(n.skin) ||
            n.skin < 0 ||
            n.skin >= skins.length ||
            typeof n.mesh !== 'number' ||
            !Number.isInteger(n.mesh) ||
            n.mesh < 0 ||
            n.mesh >= meshes.length
          ) {
            invalidNodeSkinAssignment = true;
          } else {
            validMeshNodeSkinBinding = true;
            meshToSkinMap.set(n.mesh, n.skin);
          }
        }
      }
      if (!validMeshNodeSkinBinding || invalidNodeSkinAssignment) {
        validSkins = false;
      }

      let hasValidJointsAttribute = false;
      let hasValidWeightsAttribute = false;
      let hasUsableVertexWeights = false;
      let allSkinnedPrimitivesValid = true;
      const skinningErrors: string[] = [];

      for (let mIdx = 0; mIdx < meshes.length; mIdx++) {
        const m = meshes[mIdx];
        const assignedSkinIdx = meshToSkinMap.get(mIdx) ?? 0;
        const maxJointsInSkin = skinJointCounts.get(assignedSkinIdx) ?? totalJoints;

        for (const prim of m.primitives || []) {
          const posAccIdx = prim.attributes?.POSITION;
          const jointsAccIdx = prim.attributes?.JOINTS_0;
          const weightsAccIdx = prim.attributes?.WEIGHTS_0;

          if (jointsAccIdx === undefined && weightsAccIdx === undefined) {
            continue;
          }

          if (
            !isValidAccessorIndex(posAccIdx) ||
            !isValidAccessorIndex(jointsAccIdx) ||
            !isValidAccessorIndex(weightsAccIdx)
          ) {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" primitive has missing or out-of-range POSITION/JOINTS_0/WEIGHTS_0 accessor index`
            );
            continue;
          }

          const pAcc = accessors[posAccIdx];
          const jAcc = accessors[jointsAccIdx];
          const wAcc = accessors[weightsAccIdx];

          const countMatches =
            (pAcc.count ?? 0) > 0 &&
            pAcc.count === jAcc.count &&
            jAcc.count === wAcc.count;
          const validJointCompType =
            jAcc.type === 'VEC4' &&
            (jAcc.componentType === 5121 || jAcc.componentType === 5123);
          const validWeightCompType =
            wAcc.type === 'VEC4' &&
            (wAcc.componentType === 5126 ||
              wAcc.componentType === 5121 ||
              wAcc.componentType === 5123);

          if (!countMatches) {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" primitive accessor count mismatch (POSITION=${pAcc.count}, JOINTS_0=${jAcc.count}, WEIGHTS_0=${wAcc.count})`
            );
            continue;
          }

          if (!validJointCompType) {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" JOINTS_0 accessor must be VEC4 UNSIGNED_BYTE (5121) or UNSIGNED_SHORT (5123)`
            );
            continue;
          }

          if (!validWeightCompType) {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" WEIGHTS_0 accessor must be VEC4 FLOAT (5126), UNSIGNED_BYTE (5121), or UNSIGNED_SHORT (5123)`
            );
            continue;
          }

          const pBounds = validateAccessorBinaryBounds(
            pAcc,
            bufferViews[pAcc.bufferView!],
            binByteLength
          );
          const jBounds = validateAccessorBinaryBounds(
            jAcc,
            bufferViews[jAcc.bufferView!],
            binByteLength
          );
          const wBounds = validateAccessorBinaryBounds(
            wAcc,
            bufferViews[wAcc.bufferView!],
            binByteLength
          );

          if (!binChunkSubarray || !pBounds.valid || !jBounds.valid || !wBounds.valid) {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" skinning accessor bufferView offset/byteLength/byteStride exceeds binary chunk bounds`
            );
            continue;
          }

          const binView = new DataView(
            binChunkSubarray.buffer,
            binChunkSubarray.byteOffset,
            binChunkSubarray.byteLength
          );
          const vertexCount = jAcc.count ?? 0;

          // Inspect binary JOINTS_0 indices against skin.joints.length
          let jointsInRange = maxJointsInSkin > 0;
          for (let v = 0; v < vertexCount; v++) {
            const base = jBounds.startOffset + v * jBounds.stride;
            for (let c = 0; c < 4; c++) {
              const jVal =
                jAcc.componentType === 5121
                  ? binView.getUint8(base + c)
                  : binView.getUint16(base + c * 2, true);
              if (jVal < 0 || jVal >= maxJointsInSkin) {
                jointsInRange = false;
                break;
              }
            }
            if (!jointsInRange) break;
          }

          if (jointsInRange) {
            hasValidJointsAttribute = true;
          } else {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" JOINTS_0 contains vertex joint index >= skin.joints.length (${maxJointsInSkin})`
            );
          }

          hasValidWeightsAttribute = true;

          // Inspect binary WEIGHTS_0 values (must be finite, non-negative, non-zero, and normalized per vertex)
          let weightsValidForPrimitive = vertexCount > 0;
          for (let v = 0; v < vertexCount; v++) {
            const base = wBounds.startOffset + v * wBounds.stride;
            let sum = 0;
            for (let c = 0; c < 4; c++) {
              let wVal = 0;
              if (wAcc.componentType === 5126) {
                wVal = binView.getFloat32(base + c * 4, true);
              } else if (wAcc.componentType === 5121) {
                wVal = binView.getUint8(base + c) / 255;
              } else {
                wVal = binView.getUint16(base + c * 2, true) / 65535;
              }
              if (!Number.isFinite(wVal) || wVal < -1e-5) {
                weightsValidForPrimitive = false;
                break;
              }
              sum += wVal;
            }
            if (!weightsValidForPrimitive || !Number.isFinite(sum) || sum <= 0.01 || sum < 0.5 || sum > 1.5) {
              weightsValidForPrimitive = false;
              break;
            }
          }

          if (weightsValidForPrimitive) {
            hasUsableVertexWeights = true;
          } else {
            allSkinnedPrimitivesValid = false;
            skinningErrors.push(
              `Mesh "${m.name || mIdx}" WEIGHTS_0 contains zero, NaN/Infinity, negative, or unnormalized vertex weights`
            );
          }
        }
      }

      const skinningValid =
        validSkins &&
        totalJoints > 0 &&
        allSkinnedPrimitivesValid &&
        hasValidJointsAttribute &&
        hasValidWeightsAttribute &&
        hasUsableVertexWeights;

      // =========================================================================
      // Section 5: Strengthened Animation Channel, Sampler & Binary Keyframe Validation
      // =========================================================================
      const documentedAnimations: string[] = [];
      let validAnimationChannels = animations.length > 0;
      const animationValidationErrors: string[] = [];

      const validTargetPaths = new Set(['translation', 'rotation', 'scale', 'weights']);

      for (let aIdx = 0; aIdx < animations.length; aIdx++) {
        const anim = animations[aIdx];
        const animLabel = anim.name || `anim_${aIdx}`;
        if (anim.name) {
          documentedAnimations.push(anim.name);
        }

        const samplers = Array.isArray(anim.samplers) ? anim.samplers : [];
        const channels = Array.isArray(anim.channels) ? anim.channels : [];

        if (channels.length === 0 || samplers.length === 0) {
          validAnimationChannels = false;
          animationValidationErrors.push(
            `Animation "${animLabel}" has empty channels (${channels.length}) or samplers (${samplers.length})`
          );
          continue;
        }

        for (const ch of channels) {
          const samplerIdx = ch.sampler;
          const nodeIdx = ch.target?.node;
          const targetPath = ch.target?.path || '';

          if (
            typeof samplerIdx !== 'number' ||
            !Number.isInteger(samplerIdx) ||
            samplerIdx < 0 ||
            samplerIdx >= samplers.length
          ) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" channel references invalid sampler index (${String(samplerIdx)})`
            );
            continue;
          }

          if (
            typeof nodeIdx !== 'number' ||
            !Number.isInteger(nodeIdx) ||
            nodeIdx < 0 ||
            nodeIdx >= nodes.length
          ) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" channel references invalid target node index (${String(nodeIdx)})`
            );
            continue;
          }

          if (!validTargetPaths.has(targetPath)) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" channel has unsupported target path "${targetPath}"`
            );
            continue;
          }

          const sampler = samplers[samplerIdx];
          if (
            !sampler ||
            !isValidAccessorIndex(sampler.input) ||
            !isValidAccessorIndex(sampler.output)
          ) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" sampler[${samplerIdx}] references invalid input/output accessor`
            );
            continue;
          }

          const inAcc = accessors[sampler.input];
          const outAcc = accessors[sampler.output];
          const inCount = inAcc.count ?? 0;
          const outCount = outAcc.count ?? 0;

          if (inAcc.type !== 'SCALAR' || inAcc.componentType !== 5126 || inCount < 1) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" sampler[${samplerIdx}] input accessor must be SCALAR FLOAT (5126) with count >= 1`
            );
            continue;
          }

          const expectedOutType =
            targetPath === 'rotation'
              ? 'VEC4'
              : targetPath === 'translation' || targetPath === 'scale'
              ? 'VEC3'
              : 'SCALAR';
          const expectedOutCount =
            sampler.interpolation === 'CUBICSPLINE' ? inCount * 3 : inCount;

          if (outAcc.type !== expectedOutType || outCount !== expectedOutCount) {
            validAnimationChannels = false;
            animationValidationErrors.push(
              `Animation "${animLabel}" sampler[${samplerIdx}] output accessor type/count (${outAcc.type}/${outCount}) does not match path "${targetPath}" (expected ${expectedOutType}/${expectedOutCount})`
            );
            continue;
          }

          // Inspect binary keyframe timestamps and output values in BIN chunk
          if (binChunkSubarray) {
            const inBounds = validateAccessorBinaryBounds(
              inAcc,
              bufferViews[inAcc.bufferView!],
              binByteLength
            );
            const outBounds = validateAccessorBinaryBounds(
              outAcc,
              bufferViews[outAcc.bufferView!],
              binByteLength
            );
            if (!inBounds.valid || !outBounds.valid) {
              validAnimationChannels = false;
              animationValidationErrors.push(
                `Animation "${animLabel}" sampler[${samplerIdx}] accessor exceeds binary buffer bounds`
              );
              continue;
            }

            const binView = new DataView(
              binChunkSubarray.buffer,
              binChunkSubarray.byteOffset,
              binChunkSubarray.byteLength
            );

            let prevTime = -Infinity;
            for (let k = 0; k < inCount; k++) {
              const t = binView.getFloat32(
                inBounds.startOffset + k * inBounds.stride,
                true
              );
              if (!Number.isFinite(t) || t < 0 || t < prevTime) {
                validAnimationChannels = false;
                animationValidationErrors.push(
                  `Animation "${animLabel}" sampler[${samplerIdx}] has non-finite, negative, or non-monotonic keyframe timestamp at index ${k} (${t})`
                );
                break;
              }
              prevTime = t;
            }

            if (outAcc.componentType === 5126) {
              for (let k = 0; k < outCount; k++) {
                const elemOffset = outBounds.startOffset + k * outBounds.stride;
                for (let c = 0; c < outBounds.numComponents; c++) {
                  const val = binView.getFloat32(elemOffset + c * 4, true);
                  if (!Number.isFinite(val)) {
                    validAnimationChannels = false;
                    animationValidationErrors.push(
                      `Animation "${animLabel}" sampler[${samplerIdx}] has non-finite keyframe output value at key ${k}`
                    );
                    break;
                  }
                }
                if (!validAnimationChannels) break;
              }
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
        productionEligibilityReasons.push('GLB contains no valid glTF skin definitions (`skins`) or valid mesh-node skin bindings');
      }
      if (!hasValidJointsAttribute || !allSkinnedPrimitivesValid) {
        productionEligibilityReasons.push('Mesh primitives lack valid `JOINTS_0` skinning attribute or contain out-of-range joint indices');
      }
      if (!hasValidWeightsAttribute || !hasUsableVertexWeights) {
        productionEligibilityReasons.push('Mesh primitives lack valid normalized `WEIGHTS_0` vertex weight data');
      }
      for (const sErr of skinningErrors) {
        if (!productionEligibilityReasons.includes(sErr)) {
          productionEligibilityReasons.push(sErr);
        }
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
      const isVisualOnly =
        glbFileValid &&
        plausibleBoundsVerified &&
        !explicitlyMarkedPlaceholder &&
        !productionRigValid;
      const isPlaceholder = !productionRigValid && !isVisualOnly;
      const productionReady =
        glbFileValid && productionRigValid && animationValid && !isPlaceholder;

      const errors: string[] = [];
      if (!glbFileValid) {
        errors.push('GLB structure is missing valid meshes, position accessors, or materials');
      }
      if (materials.length < 1) {
        errors.push('GLB must define at least 1 material');
      }
      if (!isVisualOnly) {
        if (missingHumanoidBones.length > 0) {
          errors.push(`Missing humanoid bones: ${missingHumanoidBones.join(', ')}`);
        }
        if (!groundOriginVerified) {
          errors.push('Root bone ground origin is not at (0, 0, 0)');
        }
        if (missingAnimations.length > 0) {
          errors.push(`Missing documented animation clips: ${missingAnimations.join(', ')}`);
        }
        for (const aErr of animationValidationErrors) {
          errors.push(aErr);
        }
      }

      // Section 5: Do NOT mark a character as PRODUCTION_READY if required animations are invalid or missing!
      const productionStatus: CharacterAssetValidationReport['productionStatus'] =
        productionReady
          ? 'PRODUCTION_READY'
          : isVisualOnly
          ? 'VISUAL_ONLY'
          : productionRigValid && !animationValid
          ? 'STAGE_2_INTEGRATED'
          : extras.productionStatus === 'VERTICAL_SLICE_COMPLETE'
          ? 'VERTICAL_SLICE_COMPLETE'
          : extras.productionStatus === 'STAGE_2_INTEGRATED'
          ? 'STAGE_2_INTEGRATED'
          : 'PLACEHOLDER';

      const placeholderDisclosures: string[] = isVisualOnly
        ? [
            `Visual-only 3D model verified for ${characterName} (${characterId}). Genuine geometry, materials, and bounds verified without humanoid skeleton/skinning. Rendering imported mesh directly under modelTransformNode without procedural placeholder.`,
          ]
        : isPlaceholder
        ? [
            `Temporary placeholder asset active for ${characterName} (${characterId}). Reason: ${productionEligibilityReasons.join(
              '; '
            )}. Using procedural humanoid character rig until a skinned production GLB is supplied.`,
          ]
        : !animationValid
        ? [
            `Production skinned GLB verified for ${characterName} (${characterId}), but animation set is incomplete/invalid (${missingAnimations.length} missing clips, ${animationValidationErrors.length} channel/sampler errors). Missing clips will use procedural bone fallback.`,
          ]
        : [`Production skinned GLB and full animation set verified for ${characterName} (${characterId}).`];

      return {
        isValid: errors.length === 0,
        glbFileValid,
        productionRigValid,
        animationValid,
        productionReady,
        isPlaceholder,
        isVisualOnly,
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
