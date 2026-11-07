import {
  Scene,
  TransformNode,
  Mesh,
  ShadowGenerator,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { BoneAttachmentName, CharacterDef } from '../../types/fighter';
import {
  CharacterAssetLoadDiagnostics,
  CharacterAssetLoader,
  LoadedGLBAnimationController,
} from './CharacterAssetLoader';

export const REQUIRED_HUMANOID_BONES: readonly string[] = [
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

const BONE_SYNONYMS: Record<string, string[]> = {
  LeftForeArm: ['LeftForeArm', 'LeftLowerArm', 'mixamorig:LeftForeArm', 'DEF-forearm.L'],
  RightForeArm: ['RightForeArm', 'RightLowerArm', 'mixamorig:RightForeArm', 'DEF-forearm.R'],
  LeftUpLeg: ['LeftUpLeg', 'LeftUpperLeg', 'mixamorig:LeftUpLeg', 'DEF-thigh.L'],
  LeftLeg: ['LeftLeg', 'LeftLowerLeg', 'mixamorig:LeftLeg', 'DEF-shin.L'],
  RightUpLeg: ['RightUpLeg', 'RightUpperLeg', 'mixamorig:RightUpLeg', 'DEF-thigh.R'],
  RightLeg: ['RightLeg', 'RightLowerLeg', 'mixamorig:RightLeg', 'DEF-shin.R'],
};

export interface GLBAssetValidationResult {
  valid: boolean;
  characterId: string;
  glbMagicValid: boolean;
  version: number;
  missingBones: string[];
  boneCount: number;
  meshCount: number;
  errors: string[];
}

export interface CharacterRig3D {
  characterId: string;
  rootNode: TransformNode;
  facingNode: TransformNode;
  bones: Record<string, TransformNode>;
  sockets: Record<BoneAttachmentName, TransformNode>;
  meshes: Mesh[];
  glbLoaded: boolean;
  isPlaceholderAsset: boolean;
  glbAnimationController?: LoadedGLBAnimationController | null;
  diagnostics?: CharacterAssetLoadDiagnostics;
  renderMode: 'stylized' | 'graybox';
  lodLevel: 0 | 1 | 2;
  setRenderMode: (mode: 'stylized' | 'graybox') => void;
  setLODLevel: (level: 0 | 1 | 2) => void;
  dispose: () => void;
}

export type LoadedCharacterRig = CharacterRig3D;

/**
 * Validates binary GLB buffer or parsed glTF JSON structure for humanoid rig completeness.
 * Used both at runtime and in automated Node.js unit tests.
 */
export function validateGLBBuffer(
  characterId: string,
  buffer: Uint8Array
): GLBAssetValidationResult {
  const errors: string[] = [];
  if (buffer.byteLength < 20) {
    return {
      valid: false,
      characterId,
      glbMagicValid: false,
      version: 0,
      missingBones: [...REQUIRED_HUMANOID_BONES],
      boneCount: 0,
      meshCount: 0,
      errors: ['Buffer too small to be a valid GLB file'],
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  const glbMagicValid = magic === 0x46546c67; // 'glTF'

  if (!glbMagicValid) {
    errors.push(`Invalid GLB magic header: 0x${magic.toString(16)}`);
  }
  if (version !== 2) {
    errors.push(`Expected glTF version 2, got ${version}`);
  }
  if (totalLength !== buffer.byteLength) {
    errors.push(`Header length ${totalLength} does not match byteLength ${buffer.byteLength}`);
  }

  const chunk0Length = view.getUint32(12, true);
  const chunk0Type = view.getUint32(16, true);
  if (chunk0Type !== 0x4e4f534a) {
    errors.push('Chunk 0 is not JSON');
    return {
      valid: false,
      characterId,
      glbMagicValid,
      version,
      missingBones: [...REQUIRED_HUMANOID_BONES],
      boneCount: 0,
      meshCount: 0,
      errors,
    };
  }

  const jsonBytes = buffer.subarray(20, 20 + chunk0Length);
  const jsonText = new TextDecoder().decode(jsonBytes).replace(/\0+$/, '');
  let gltfJson: {
    nodes?: Array<{ name?: string }>;
    meshes?: Array<unknown>;
  } = {};
  try {
    gltfJson = JSON.parse(jsonText);
  } catch (err) {
    errors.push(`Invalid glTF JSON chunk: ${(err as Error).message}`);
  }

  const nodeNames = new Set((gltfJson.nodes ?? []).map((n) => n.name ?? ''));
  const missingBones = REQUIRED_HUMANOID_BONES.filter((b) => {
    const candidates = BONE_SYNONYMS[b] || [b];
    return !candidates.some((c) => nodeNames.has(c));
  });
  if (missingBones.length > 0) {
    errors.push(`Missing required humanoid bones: ${missingBones.join(', ')}`);
  }

  const meshCount = (gltfJson.meshes ?? []).length;
  if (meshCount === 0) {
    errors.push('GLB contains zero meshes');
  }

  return {
    valid: errors.length === 0,
    characterId,
    glbMagicValid,
    version,
    missingBones,
    boneCount: nodeNames.size,
    meshCount,
    errors,
  };
}

/**
 * Loads a character rig via `CharacterAssetLoader` using the centralized manifest
 * (`src/config/characterAssets.ts`).
 */
export async function loadCharacterRig3D(
  scene: Scene,
  charDef: CharacterDef,
  instancePrefix: string,
  shadowGenerator?: ShadowGenerator | null
): Promise<CharacterRig3D> {
  const loaded = await CharacterAssetLoader.loadCharacterFromManifest(
    scene,
    charDef,
    instancePrefix,
    shadowGenerator
  );

  let currentRenderMode: 'stylized' | 'graybox' = 'stylized';
  let currentLodLevel: 0 | 1 | 2 = 0;

  return {
    characterId: charDef.id,
    rootNode: loaded.rootNode,
    facingNode: loaded.facingNode,
    bones: loaded.bones,
    sockets: loaded.sockets,
    meshes: loaded.meshes,
    glbLoaded: loaded.glbLoaded,
    isPlaceholderAsset: loaded.isPlaceholderAsset,
    glbAnimationController: loaded.glbAnimationController,
    diagnostics: loaded.diagnostics,
    get renderMode() {
      return currentRenderMode;
    },
    get lodLevel() {
      return currentLodLevel;
    },
    setRenderMode: (mode: 'stylized' | 'graybox') => {
      currentRenderMode = mode;
      loaded.setRenderMode(mode);
    },
    setLODLevel: (level: 0 | 1 | 2) => {
      currentLodLevel = level;
      loaded.setLODLevel(level);
    },
    dispose: loaded.dispose,
  };
}
