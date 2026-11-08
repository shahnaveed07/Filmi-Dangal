import {
  AnimationGroup,
  Scene,
  TransformNode,
  Mesh,
  ShadowGenerator,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { BoneAttachmentName, CharacterDef, FighterId } from '../../types/fighter';
import { StandardAnimationClipId } from '../../config/characterAssets';
import {
  CharacterAssetLoadDiagnostics,
  CharacterAssetLoader,
  LoadedGLBAnimationController,
} from './CharacterAssetLoader';
import {
  CharacterAssetValidator,
  FACIAL_EXPRESSION_RIG_BONES,
} from './CharacterAssetValidator';

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

export const REQUIRED_FACIAL_BONES: readonly string[] = FACIAL_EXPRESSION_RIG_BONES;

export class GLBAnimationGroupController implements LoadedGLBAnimationController {
  private inner: LoadedGLBAnimationController;

  constructor(
    characterId: FighterId,
    animationGroups: AnimationGroup[],
    warningsCollector?: string[]
  ) {
    this.inner = CharacterAssetLoader.createAnimationGroupController(
      characterId,
      animationGroups,
      warningsCollector
    );
  }

  public get availableClipNames(): string[] {
    return this.inner.availableClipNames;
  }

  public get activeClipId(): StandardAnimationClipId | null {
    return this.inner.activeClipId;
  }

  public get activeClipName(): string | null {
    return this.inner.activeClipName;
  }

  public hasClip(clipId: StandardAnimationClipId): boolean {
    return this.inner.hasClip(clipId);
  }

  public playClip(
    clipId: StandardAnimationClipId,
    speedMultiplier = 1.0,
    forceRestart = false
  ): boolean {
    return this.inner.playClip(clipId, speedMultiplier, forceRestart);
  }

  public stopAll(): void {
    this.inner.stopAll();
  }
}

export interface GLBAssetValidationResult {
  valid: boolean;
  glbFileValid: boolean;
  productionRigValid: boolean;
  animationValid: boolean;
  productionReady: boolean;
  isPlaceholder: boolean;
  characterId: string;
  glbMagicValid: boolean;
  version: number;
  missingBones: string[];
  boneCount: number;
  meshCount: number;
  skinCount: number;
  skinningValid: boolean;
  errors: string[];
}

export interface CharacterRig3D {
  characterId: string;
  rootNode: TransformNode;
  facingNode: TransformNode;
  modelTransformNode: TransformNode;
  importedRootNodes: TransformNode[];
  bones: Record<string, TransformNode>;
  sockets: Record<BoneAttachmentName, TransformNode>;
  meshes: Mesh[];
  glbLoaded: boolean;
  glbFileValid: boolean;
  productionRigValid: boolean;
  animationValid: boolean;
  productionReady: boolean;
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
 * Validates binary GLB buffer or parsed glTF JSON structure for humanoid rig completeness
 * and separates structural GLB validity (`glbFileValid`) from production skinning validity
 * (`productionRigValid`), animation validity (`animationValid`), and overall `productionReady`.
 */
export function validateGLBBuffer(
  characterId: string,
  buffer: Uint8Array
): GLBAssetValidationResult {
  const report = CharacterAssetValidator.validateGLBBuffer(buffer, characterId);
  return {
    valid: report.glbFileValid && report.missingHumanoidBones.length === 0,
    glbFileValid: report.glbFileValid,
    productionRigValid: report.productionRigValid,
    animationValid: report.animationValid,
    productionReady: report.productionReady,
    isPlaceholder: report.isPlaceholder,
    characterId: report.characterId,
    glbMagicValid: report.glbVersion === 2,
    version: report.glbVersion,
    missingBones: report.missingHumanoidBones,
    boneCount: report.nodeCount,
    meshCount: report.meshCount,
    skinCount: report.skinCount,
    skinningValid: report.skinningValid,
    errors: report.errors,
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

  const animationValid =
    loaded.diagnostics.hasEmbeddedAnimations &&
    loaded.diagnostics.missingStandardClips.length === 0;
  const productionReady =
    loaded.glbLoaded &&
    loaded.diagnostics.productionRigEligible &&
    animationValid &&
    !loaded.isPlaceholderAsset;

  return {
    characterId: charDef.id,
    rootNode: loaded.rootNode,
    facingNode: loaded.facingNode,
    modelTransformNode: loaded.modelTransformNode,
    importedRootNodes: loaded.importedRootNodes,
    bones: loaded.bones,
    sockets: loaded.sockets,
    meshes: loaded.meshes,
    glbLoaded: loaded.glbLoaded,
    glbFileValid: loaded.glbLoaded,
    productionRigValid: loaded.diagnostics.productionRigEligible,
    animationValid,
    productionReady,
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
