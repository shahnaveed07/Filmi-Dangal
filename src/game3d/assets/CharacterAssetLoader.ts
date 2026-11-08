import {
  AbstractMesh,
  AnimationGroup,
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  Node,
  PBRMaterial,
  Scene,
  SceneLoader,
  ShadowGenerator,
  Skeleton,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  ALL_STANDARD_ANIMATION_CLIP_IDS,
  CHARACTER_ASSET_MANIFEST,
  CharacterAssetConfig,
  DEFAULT_HUMANOID_BONE_ALIASES,
  getCharacterAssetConfig,
  resolveCharacterAnimationClip,
  StandardAnimationClipId,
  validateCharacterAssetManifestConfig,
} from '../../config/characterAssets';
import { BoneAttachmentName, CharacterDef, FighterId } from '../../types/fighter';
import { REQUIRED_HUMANOID_BONES } from './AssetLoader3D';
import {
  FACIAL_EXPRESSION_RIG_BONES,
  stripBoneNamespacePrefix,
} from './CharacterAssetValidator';

export interface LoadedGLBAnimationController {
  availableClipNames: string[];
  activeClipId: StandardAnimationClipId | null;
  activeClipName: string | null;
  hasClip: (clipId: StandardAnimationClipId) => boolean;
  playClip: (
    clipId: StandardAnimationClipId,
    speedMultiplier?: number,
    forceRestart?: boolean
  ) => boolean;
  stopAll: () => void;
}

export interface CharacterModelDimensions {
  width: number;
  height: number;
  depth: number;
  minY: number;
  maxY: number;
  plausibleBounds: boolean;
}

export interface CharacterAssetLoadDiagnostics {
  characterId: FighterId;
  requestedModelPath: string;
  attemptedPaths: string[];
  loadedFromPath: string | null;
  glbLoaded: boolean;
  usedTemporaryPlaceholder: boolean;
  importedMeshCount: number;
  importedTransformNodeCount: number;
  skeletonCount: number;
  resolvedBoneCount: number;
  resolvedBones: string[];
  missingBones: string[];
  missingFacialBones: string[];
  hasEmbeddedAnimations: boolean;
  availableAnimationClips: string[];
  missingStandardClips: StandardAnimationClipId[];
  skinningValid: boolean;
  productionRigEligible: boolean;
  productionEligibilityReasons: string[];
  modelDimensions: CharacterModelDimensions;
  scale: number;
  groundOffset: number;
  materialCount: number;
  textureLoadingStatus: 'READY' | 'NO_TEXTURES' | 'PENDING_OR_FAILED';
  errors: string[];
  warnings: string[];
}

const loggedAssetWarnings = new Set<string>();

export function emitOnceAssetWarning(warning: string, collector?: string[]): void {
  if (collector && !collector.includes(warning)) {
    collector.push(warning);
  }
  if (!loggedAssetWarnings.has(warning)) {
    loggedAssetWarnings.add(warning);
    console.warn(warning);
  }
}

function createPlaceholderPBR(
  scene: Scene,
  name: string,
  hexColor: string,
  roughness = 0.45,
  metallic = 0.1,
  emissiveHex?: string
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(hexColor);
  mat.roughness = roughness;
  mat.metallic = metallic;
  if (emissiveHex) {
    mat.emissiveColor = Color3.FromHexString(emissiveHex).scale(0.35);
  }
  return mat;
}

/**
 * Checks whether `node` has `ancestor` anywhere in its parent chain.
 */
export function isNodeDescendantOf(node: Node, ancestor: Node): boolean {
  let curr: Node | null = node.parent;
  const visited = new Set<Node>();
  while (curr) {
    if (curr === ancestor) return true;
    if (visited.has(curr)) break;
    visited.add(curr);
    curr = curr.parent;
  }
  return false;
}

/**
 * Section 3: Explicit Imported-Root Discovery & Attachment Procedure.
 *
 * Inspects all imported `meshes` and `transformNodes` from `SceneLoader.ImportMeshAsync`,
 * identifies every top-level imported root (whose `parent` is `null` or outside the imported set),
 * and attaches each top-level root **once** beneath `targetParentNode` (e.g., `modelTransformNode` under `facingNode`).
 *
 * Preserves all internal parent-child relationships, local transforms, skeleton bindings,
 * materials, and animation targets without blindly reparenting child meshes.
 */
export function attachImportedGLBHierarchyToFacingNode(
  targetParentNode: TransformNode,
  importedMeshes: AbstractMesh[],
  importedTransformNodes: TransformNode[]
): {
  importedRoots: TransformNode[];
  hierarchyValid: boolean;
  totalAttachedNodes: number;
} {
  const allImportedNodes: TransformNode[] = [];
  const importedNodeSet = new Set<Node>();

  for (const tn of importedTransformNodes) {
    if (tn && tn !== targetParentNode && !importedNodeSet.has(tn)) {
      importedNodeSet.add(tn);
      allImportedNodes.push(tn);
    }
  }
  for (const m of importedMeshes) {
    if (m && m !== targetParentNode && !importedNodeSet.has(m)) {
      importedNodeSet.add(m);
      allImportedNodes.push(m);
    }
  }

  // Also include any ancestor TransformNodes that were created by the glTF loader above imported meshes/nodes
  for (const node of [...allImportedNodes]) {
    let curr = node.parent;
    while (curr && curr instanceof TransformNode && curr !== targetParentNode) {
      if (!importedNodeSet.has(curr)) {
        importedNodeSet.add(curr);
        allImportedNodes.push(curr);
      }
      curr = curr.parent;
    }
  }

  const importedRoots: TransformNode[] = [];
  const seenRoots = new Set<TransformNode>();

  for (const node of allImportedNodes) {
    const parent = node.parent;
    const isTopLevelImportedRoot =
      parent === null ||
      parent === targetParentNode ||
      !importedNodeSet.has(parent);

    if (isTopLevelImportedRoot && !seenRoots.has(node)) {
      seenRoots.add(node);
      if (node.parent !== targetParentNode) {
        node.parent = targetParentNode;
      }
      importedRoots.push(node);
    }
  }

  // Validate that every imported node is now a descendant of targetParentNode
  let hierarchyValid = importedRoots.length > 0 || allImportedNodes.length === 0;
  for (const node of allImportedNodes) {
    if (!isNodeDescendantOf(node, targetParentNode)) {
      hierarchyValid = false;
      break;
    }
  }

  return {
    importedRoots,
    hierarchyValid,
    totalAttachedNodes: allImportedNodes.length,
  };
}

/**
 * Section 4: Robust Skeleton & Bone Resolution.
 *
 * Inspects imported TransformNodes, Mesh skeleton references, and Skeleton bones.
 * Builds a non-destructive mapping layer for all 20 required humanoid bones and
 * 5 facial expression nodes using manifest aliases, glTF humanoid, Mixamo, and Rigify conventions.
 * Never renames or destroys the imported skeleton, and never maps a missing bone to an unrelated node.
 */
export function resolveHumanoidSkeletonAndBones(
  characterId: FighterId,
  importedTransformNodes: TransformNode[],
  importedMeshes: AbstractMesh[],
  importedSkeletons: Skeleton[],
  scene: Scene,
  fallbackParent: TransformNode,
  instancePrefix: string
): {
  rawNodeLookup: Record<string, TransformNode>;
  resolvedBoneMap: Record<string, TransformNode>;
  resolvedBones: string[];
  missingBones: string[];
  missingFacialBones: string[];
  createdProxyNodes: TransformNode[];
  allSkeletons: Skeleton[];
} {
  const rawNodeLookup: Record<string, TransformNode> = {};
  const strippedNameLookup: Record<string, TransformNode> = {};
  const lowerCaseLookup: Record<string, TransformNode> = {};
  const createdProxyNodes: TransformNode[] = [];

  const registerCandidateNode = (name: string, node: TransformNode) => {
    if (!name) return;
    if (!rawNodeLookup[name]) {
      rawNodeLookup[name] = node;
    }
    const stripped = stripBoneNamespacePrefix(name);
    if (stripped && !strippedNameLookup[stripped]) {
      strippedNameLookup[stripped] = node;
    }
    const lower = stripped.toLowerCase();
    if (lower && !lowerCaseLookup[lower]) {
      lowerCaseLookup[lower] = node;
    }
  };

  for (const tn of importedTransformNodes) {
    if (tn && tn.name) {
      registerCandidateNode(tn.name, tn);
    }
  }

  // Collect all unique Skeletons from both result.skeletons and mesh.skeleton
  const skeletonSet = new Set<Skeleton>(importedSkeletons);
  for (const m of importedMeshes) {
    if (m.skeleton) {
      skeletonSet.add(m.skeleton);
    }
  }
  const allSkeletons = Array.from(skeletonSet);

  // Inspect Skeleton bones and their linked TransformNodes
  const boneProxyMap = new Map<string, TransformNode>();
  for (const skeleton of allSkeletons) {
    for (const bone of skeleton.bones) {
      if (!bone || !bone.name) continue;
      const linkedTn = bone.getTransformNode();
      if (linkedTn) {
        registerCandidateNode(bone.name, linkedTn);
      } else if (!rawNodeLookup[bone.name] && !strippedNameLookup[stripBoneNamespacePrefix(bone.name)]) {
        // Create a non-destructive mapping TransformNode linked to the Bone without altering bone.name
        const parentBone = bone.getParent();
        const parentTn =
          (parentBone &&
            (parentBone.getTransformNode() || boneProxyMap.get(parentBone.name))) ||
          fallbackParent;
        const proxyTn = new TransformNode(
          `${instancePrefix}_boneProxy_${bone.name}`,
          scene
        );
        proxyTn.parent = parentTn;
        const localPos = bone.getPosition();
        if (localPos) {
          proxyTn.position.copyFrom(localPos);
        }
        bone.linkTransformNode(proxyTn);
        boneProxyMap.set(bone.name, proxyTn);
        createdProxyNodes.push(proxyTn);
        registerCandidateNode(bone.name, proxyTn);
      }
    }
  }

  const manifest = getCharacterAssetConfig(characterId);
  const findBoneNode = (canonicalBone: string): TransformNode | undefined => {
    const aliases =
      manifest.boneAliases[canonicalBone] ||
      DEFAULT_HUMANOID_BONE_ALIASES[canonicalBone] ||
      [canonicalBone];

    for (const candidate of [canonicalBone, ...aliases]) {
      if (rawNodeLookup[candidate]) {
        return rawNodeLookup[candidate];
      }
      const stripped = stripBoneNamespacePrefix(candidate);
      if (strippedNameLookup[stripped]) {
        return strippedNameLookup[stripped];
      }
      const lower = stripped.toLowerCase();
      if (lowerCaseLookup[lower]) {
        return lowerCaseLookup[lower];
      }
    }
    return undefined;
  };

  const resolvedBoneMap: Record<string, TransformNode> = {};
  const resolvedBones: string[] = [];
  const missingBones: string[] = [];
  const missingFacialBones: string[] = [];

  for (const reqBone of REQUIRED_HUMANOID_BONES) {
    const found = findBoneNode(reqBone);
    if (found) {
      resolvedBoneMap[reqBone] = found;
      resolvedBones.push(reqBone);
    } else {
      missingBones.push(reqBone);
    }
  }

  for (const facialBone of FACIAL_EXPRESSION_RIG_BONES) {
    const found = findBoneNode(facialBone);
    if (found) {
      resolvedBoneMap[facialBone] = found;
      resolvedBones.push(facialBone);
    } else {
      missingFacialBones.push(facialBone);
    }
  }

  // Populate secondary procedural limb aliases when canonical bones are resolved
  if (resolvedBoneMap.LeftForeArm && !resolvedBoneMap.LeftLowerArm) {
    resolvedBoneMap.LeftLowerArm = resolvedBoneMap.LeftForeArm;
  }
  if (resolvedBoneMap.RightForeArm && !resolvedBoneMap.RightLowerArm) {
    resolvedBoneMap.RightLowerArm = resolvedBoneMap.RightForeArm;
  }
  if (resolvedBoneMap.LeftUpLeg && !resolvedBoneMap.LeftUpperLeg) {
    resolvedBoneMap.LeftUpperLeg = resolvedBoneMap.LeftUpLeg;
  }
  if (resolvedBoneMap.LeftLeg && !resolvedBoneMap.LeftLowerLeg) {
    resolvedBoneMap.LeftLowerLeg = resolvedBoneMap.LeftLeg;
  }
  if (resolvedBoneMap.RightUpLeg && !resolvedBoneMap.RightUpperLeg) {
    resolvedBoneMap.RightUpperLeg = resolvedBoneMap.RightUpLeg;
  }
  if (resolvedBoneMap.RightLeg && !resolvedBoneMap.RightLowerLeg) {
    resolvedBoneMap.RightLowerLeg = resolvedBoneMap.RightLeg;
  }

  return {
    rawNodeLookup,
    resolvedBoneMap,
    resolvedBones,
    missingBones,
    missingFacialBones,
    createdProxyNodes,
    allSkeletons,
  };
}

/**
 * Section 8: Computes world-space bounding box dimensions for a character rig.
 */
export function computeRigWorldBounds(
  rootNode: TransformNode,
  meshes: AbstractMesh[]
): CharacterModelDimensions {
  rootNode.computeWorldMatrix(true);

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let validMeshFound = false;

  for (const m of meshes) {
    if (!m || m.isDisposed() || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo({ applySkeleton: true });
    const bbox = m.getBoundingInfo()?.boundingBox;
    if (!bbox) continue;
    const bMin = bbox.minimumWorld;
    const bMax = bbox.maximumWorld;
    if (
      Number.isFinite(bMin.x) &&
      Number.isFinite(bMin.y) &&
      Number.isFinite(bMin.z) &&
      Number.isFinite(bMax.x) &&
      Number.isFinite(bMax.y) &&
      Number.isFinite(bMax.z)
    ) {
      validMeshFound = true;
      minX = Math.min(minX, bMin.x);
      minY = Math.min(minY, bMin.y);
      minZ = Math.min(minZ, bMin.z);
      maxX = Math.max(maxX, bMax.x);
      maxY = Math.max(maxY, bMax.y);
      maxZ = Math.max(maxZ, bMax.z);
    }
  }

  if (!validMeshFound) {
    return {
      width: 0,
      height: 0,
      depth: 0,
      minY: 0,
      maxY: 0,
      plausibleBounds: false,
    };
  }

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const depth = Math.max(0, maxZ - minZ);
  const rootY = rootNode.getAbsolutePosition().y;
  const groundDelta = Math.abs(minY - rootY);

  const plausibleBounds =
    width >= 0.15 &&
    width <= 4.0 &&
    height >= 0.5 &&
    height <= 4.5 &&
    depth >= 0.08 &&
    groundDelta <= 0.65;

  return {
    width: Number(width.toFixed(3)),
    height: Number(height.toFixed(3)),
    depth: Number(depth.toFixed(3)),
    minY: Number(minY.toFixed(3)),
    maxY: Number(maxY.toFixed(3)),
    plausibleBounds,
  };
}

/**
 * Section 5: Runtime Production Character Eligibility Check.
 * Separates structural GLB loading from genuine skinned production character readiness.
 */
export function evaluateRuntimeProductionRigEligibility(params: {
  manifest: CharacterAssetConfig;
  glbLoaded: boolean;
  importedMeshes: Mesh[];
  allSkeletons: Skeleton[];
  missingHumanoidBones: string[];
  dimensions: CharacterModelDimensions;
}): {
  skinningValid: boolean;
  isProductionReady: boolean;
  reasons: string[];
} {
  const {
    manifest,
    glbLoaded,
    importedMeshes,
    allSkeletons,
    missingHumanoidBones,
    dimensions,
  } = params;
  const reasons: string[] = [];

  if (!glbLoaded) {
    reasons.push('GLB asset failed to load');
  }

  if (manifest.isTemporaryPlaceholder) {
    reasons.push(
      `Manifest marks character "${manifest.id}" as temporary placeholder (isTemporaryPlaceholder: true)`
    );
  }

  const meshesWithGeometry = importedMeshes.filter((m) => m.getTotalVertices() > 0);
  if (meshesWithGeometry.length === 0) {
    reasons.push('Imported GLB contains zero meshes with vertex geometry');
  }

  const hasValidMaterials = meshesWithGeometry.some((m) => m.material !== null);
  if (!hasValidMaterials && meshesWithGeometry.length > 0) {
    reasons.push('Imported meshes have no assigned materials');
  }

  // Check for genuine vertex skinning (JOINTS_0 / MatricesIndicesKind and WEIGHTS_0 / MatricesWeightsKind)
  const hasSkinnedMeshVertices = meshesWithGeometry.some((m) => {
    const hasJoints = m.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind);
    const hasWeights = m.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind);
    if (!hasJoints || !hasWeights) return false;
    const weightsData = m.getVerticesData(VertexBuffer.MatricesWeightsKind);
    if (!weightsData || weightsData.length < 4) return false;
    for (let i = 0; i < Math.min(weightsData.length, 64); i += 4) {
      const sum =
        (weightsData[i] || 0) +
        (weightsData[i + 1] || 0) +
        (weightsData[i + 2] || 0) +
        (weightsData[i + 3] || 0);
      if (sum > 0.01 && Number.isFinite(sum)) {
        return true;
      }
    }
    return false;
  });

  const hasValidSkeleton =
    allSkeletons.length > 0 &&
    allSkeletons.some((s) => Array.isArray(s.bones) && s.bones.length >= 15);

  const skinningValid = hasSkinnedMeshVertices && hasValidSkeleton;
  if (!hasValidSkeleton) {
    reasons.push('Imported GLB lacks a valid humanoid Skeleton (>= 15 bones)');
  }
  if (!hasSkinnedMeshVertices) {
    reasons.push(
      'Imported meshes lack usable skinning vertex attributes (JOINTS_0 / WEIGHTS_0)'
    );
  }

  if (missingHumanoidBones.length > 0) {
    reasons.push(
      `Missing required humanoid bones: ${missingHumanoidBones.join(', ')}`
    );
  }

  if (meshesWithGeometry.length > 0 && !dimensions.plausibleBounds) {
    reasons.push(
      `Imported model bounds (${dimensions.width}x${dimensions.height}x${dimensions.depth}) are outside plausible humanoid range`
    );
  }

  return {
    skinningValid,
    isProductionReady: reasons.length === 0,
    reasons,
  };
}

/**
 * Isolated Temporary Placeholder Rig Builder (Section 6 — Path A).
 * Builds the articulated temporary character rig under `modelTransformNode`
 * where `manifest.scale` and `manifest.groundOffset` are already applied once on `modelTransformNode`.
 */
export function buildTemporaryPlaceholderHumanoidRig(
  scene: Scene,
  charDef: CharacterDef,
  _manifest: CharacterAssetConfig,
  instancePrefix: string,
  modelTransformNode: TransformNode,
  existingBones: Record<string, TransformNode>,
  shadowGenerator?: ShadowGenerator | null
): {
  bones: Record<string, TransformNode>;
  sockets: Record<BoneAttachmentName, TransformNode>;
  meshes: Mesh[];
  originalMaterials: Map<Mesh, PBRMaterial>;
  meshMinLod: Map<Mesh, 0 | 1 | 2>;
  grayboxBodyMat: PBRMaterial;
  grayboxJointMat: PBRMaterial;
} {
  const meshes: Mesh[] = [];
  const bones: Record<string, TransformNode> = { ...existingBones };

  const v = charDef.visuals;
  const p = v.proportions;
  // Note: manifest.scale and manifest.groundOffset are applied once on modelTransformNode!
  const heightScale = p.heightScale;
  const shoulderScale = p.shoulderWidth / 0.48;
  const torsoScale = p.torsoBulk / 0.32;
  const limbScale = p.limbThickness / 0.12;
  const jawScale = p.jawWidth / 0.2;

  const ensureBone = (
    name: string,
    parent: TransformNode,
    pos: Vector3
  ): TransformNode => {
    const node = new TransformNode(`${instancePrefix}_${name}`, scene);
    node.parent = parent;
    node.position.copyFrom(pos);
    bones[name] = node;
    return node;
  };

  const bRoot = ensureBone('Root', modelTransformNode, new Vector3(0, 0, 0));
  const bHips = ensureBone('Hips', bRoot, new Vector3(0, 0.95 * heightScale, 0));
  const bSpine = ensureBone('Spine', bHips, new Vector3(0, 0.16 * heightScale, 0));
  const bChest = ensureBone('Chest', bSpine, new Vector3(0, 0.2 * heightScale, 0));
  const bNeck = ensureBone('Neck', bChest, new Vector3(0, 0.21 * heightScale, 0));
  const bHead = ensureBone('Head', bNeck, new Vector3(0, 0.08 * heightScale, 0));

  const bJaw = ensureBone('Jaw', bHead, new Vector3(0, 0.04, 0.03));
  const bLeftBrow = ensureBone('LeftBrow', bHead, new Vector3(-0.048, 0.16, 0.125));
  const bRightBrow = ensureBone('RightBrow', bHead, new Vector3(0.048, 0.16, 0.125));
  const bLeftEyelid = ensureBone(
    'LeftEyelid',
    bHead,
    new Vector3(-0.046, 0.142, 0.118)
  );
  const bRightEyelid = ensureBone(
    'RightEyelid',
    bHead,
    new Vector3(0.046, 0.142, 0.118)
  );

  const shoulderOffsetX = 0.23 * shoulderScale;
  const bLeftShoulder = ensureBone(
    'LeftShoulder',
    bChest,
    new Vector3(-shoulderOffsetX, 0.15, 0)
  );
  const bLeftUpperArm = ensureBone(
    'LeftUpperArm',
    bLeftShoulder,
    new Vector3(-0.05, -0.12, 0)
  );
  const bLeftLowerArm = ensureBone(
    'LeftLowerArm',
    bLeftUpperArm,
    new Vector3(0, -0.25, 0)
  );
  const bLeftHand = ensureBone('LeftHand', bLeftLowerArm, new Vector3(0, -0.22, 0));
  bones.LeftForeArm = bLeftLowerArm;

  const bRightShoulder = ensureBone(
    'RightShoulder',
    bChest,
    new Vector3(shoulderOffsetX, 0.15, 0)
  );
  const bRightUpperArm = ensureBone(
    'RightUpperArm',
    bRightShoulder,
    new Vector3(0.05, -0.12, 0)
  );
  const bRightLowerArm = ensureBone(
    'RightLowerArm',
    bRightUpperArm,
    new Vector3(0, -0.25, 0)
  );
  const bRightHand = ensureBone(
    'RightHand',
    bRightLowerArm,
    new Vector3(0, -0.22, 0)
  );
  bones.RightForeArm = bRightLowerArm;

  const hipOffsetX = 0.12 * torsoScale;
  const bLeftUpperLeg = ensureBone(
    'LeftUpperLeg',
    bHips,
    new Vector3(-hipOffsetX, -0.08, 0)
  );
  const bLeftLowerLeg = ensureBone(
    'LeftLowerLeg',
    bLeftUpperLeg,
    new Vector3(0, -0.42 * heightScale, 0)
  );
  const bLeftFoot = ensureBone(
    'LeftFoot',
    bLeftLowerLeg,
    new Vector3(0, -0.4 * heightScale, 0.05)
  );
  bones.LeftUpLeg = bLeftUpperLeg;
  bones.LeftLeg = bLeftLowerLeg;

  const bRightUpperLeg = ensureBone(
    'RightUpperLeg',
    bHips,
    new Vector3(hipOffsetX, -0.08, 0)
  );
  const bRightLowerLeg = ensureBone(
    'RightLowerLeg',
    bRightUpperLeg,
    new Vector3(0, -0.42 * heightScale, 0)
  );
  const bRightFoot = ensureBone(
    'RightFoot',
    bRightLowerLeg,
    new Vector3(0, -0.4 * heightScale, 0.05)
  );
  bones.RightUpLeg = bRightUpperLeg;
  bones.RightLeg = bRightLowerLeg;

  const skinMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_skin`,
    v.skinTone,
    0.42,
    0.04
  );
  const primaryMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_primary`,
    v.primaryColor,
    0.38,
    0.22
  );
  const secondaryMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_secondary`,
    v.secondaryColor,
    0.3,
    0.65
  );
  const accentMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_accent`,
    v.accentColor,
    0.3,
    0.5,
    v.accentColor
  );
  const hairMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_hair`,
    v.hairColor,
    0.55,
    0.08
  );
  const darkMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_dark`,
    '#141418',
    0.25,
    0.5
  );
  const grayboxBodyMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_graybox_body`,
    '#64748B',
    0.6,
    0.1
  );
  const grayboxJointMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_graybox_joint`,
    '#F97316',
    0.4,
    0.2
  );

  const pantsMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_pants`,
    charDef.id === 'action_sultan'
      ? '#1E293B'
      : charDef.id === 'romance_raja'
      ? '#27272A'
      : charDef.id === 'duggu'
      ? '#0F172A'
      : '#2E1065',
    0.45,
    0.15
  );
  const eyeWhiteMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_eyeW`,
    '#F8FAFC',
    0.2,
    0.0
  );
  const pupilMat = createPlaceholderPBR(
    scene,
    `${instancePrefix}_pupil`,
    '#1E1B18',
    0.15,
    0.1
  );

  const originalMaterials = new Map<Mesh, PBRMaterial>();
  const meshMinLod = new Map<Mesh, 0 | 1 | 2>();

  const registerMesh = (
    mesh: Mesh,
    parent: TransformNode,
    mat: PBRMaterial,
    maxLod: 0 | 1 | 2 = 2
  ): Mesh => {
    mesh.parent = parent;
    mesh.material = mat;
    originalMaterials.set(mesh, mat);
    meshMinLod.set(mesh, maxLod);
    mesh.receiveShadows = true;
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh);
    }
    meshes.push(mesh);
    return mesh;
  };

  const pelvis = MeshBuilder.CreateBox(
    `${instancePrefix}_pelvis`,
    { width: 0.32 * torsoScale, height: 0.22, depth: 0.23 * torsoScale },
    scene
  );
  pelvis.position.y = 0.02;
  registerMesh(pelvis, bHips, pantsMat, 2);

  const belt = MeshBuilder.CreateBox(
    `${instancePrefix}_belt`,
    { width: 0.34 * torsoScale, height: 0.06, depth: 0.24 * torsoScale },
    scene
  );
  belt.position.y = 0.09;
  registerMesh(belt, bHips, darkMat, 1);

  const buckle = MeshBuilder.CreateBox(
    `${instancePrefix}_buckle`,
    { width: 0.08, height: 0.065, depth: 0.03 },
    scene
  );
  buckle.position.set(0, 0.09, 0.12 * torsoScale);
  registerMesh(buckle, bHips, secondaryMat, 0);

  const abdomen = MeshBuilder.CreateCylinder(
    `${instancePrefix}_abdomen`,
    {
      height: 0.34,
      diameterTop: 0.35 * shoulderScale,
      diameterBottom: 0.31 * torsoScale,
      tessellation: 12,
    },
    scene
  );
  abdomen.scaling.z = 0.74 * torsoScale;
  abdomen.position.y = 0.04;
  registerMesh(
    abdomen,
    bSpine,
    charDef.id === 'action_sultan' || charDef.id === 'duggu' ? skinMat : primaryMat,
    2
  );

  const chestMesh = MeshBuilder.CreateBox(
    `${instancePrefix}_chest`,
    {
      width: 0.44 * shoulderScale,
      height: 0.31,
      depth: 0.26 * torsoScale,
    },
    scene
  );
  chestMesh.position.y = 0.09;
  registerMesh(chestMesh, bChest, primaryMat, 2);

  if (p.accessoryType === 'aviator_and_kada') {
    const centerChest = MeshBuilder.CreateBox(
      `${instancePrefix}_bareChest`,
      { width: 0.16, height: 0.27, depth: 0.275 * torsoScale },
      scene
    );
    centerChest.position.y = 0.11;
    registerMesh(centerChest, bChest, skinMat, 1);

    const collar = MeshBuilder.CreateBox(
      `${instancePrefix}_collar`,
      { width: 0.28, height: 0.07, depth: 0.27 },
      scene
    );
    collar.position.y = 0.24;
    registerMesh(collar, bChest, primaryMat, 0);
  } else if (p.accessoryType === 'silk_scarf_and_collar') {
    const lapelL = MeshBuilder.CreateBox(
      `${instancePrefix}_lapelL`,
      { width: 0.07, height: 0.28, depth: 0.28 },
      scene
    );
    lapelL.position.set(-0.08, 0.11, 0.01);
    registerMesh(lapelL, bChest, secondaryMat, 1);

    const lapelR = MeshBuilder.CreateBox(
      `${instancePrefix}_lapelR`,
      { width: 0.07, height: 0.28, depth: 0.28 },
      scene
    );
    lapelR.position.set(0.08, 0.11, 0.01);
    registerMesh(lapelR, bChest, secondaryMat, 1);

    const scarfRing = MeshBuilder.CreateTorus(
      `${instancePrefix}_scarfRing`,
      { diameter: 0.22, thickness: 0.055, tessellation: 16 },
      scene
    );
    scarfRing.position.y = 0.02;
    registerMesh(scarfRing, bNeck, secondaryMat, 0);

    const scarfTail = MeshBuilder.CreateBox(
      `${instancePrefix}_scarfTail`,
      { width: 0.11, height: 0.38, depth: 0.03 },
      scene
    );
    scarfTail.position.set(0.08, 0.04, -0.16);
    scarfTail.rotation.x = 0.22;
    registerMesh(scarfTail, bChest, secondaryMat, 0);
  } else if (p.accessoryType === 'neon_visor_and_gauntlets') {
    const neonTrimL = MeshBuilder.CreateBox(
      `${instancePrefix}_neonTrimL`,
      { width: 0.04, height: 0.29, depth: 0.28 },
      scene
    );
    neonTrimL.position.set(-0.14, 0.11, 0);
    registerMesh(neonTrimL, bChest, accentMat, 1);

    const neonTrimR = MeshBuilder.CreateBox(
      `${instancePrefix}_neonTrimR`,
      { width: 0.04, height: 0.29, depth: 0.28 },
      scene
    );
    neonTrimR.position.set(0.14, 0.11, 0);
    registerMesh(neonTrimR, bChest, accentMat, 1);
  } else if (
    p.accessoryType === 'gold_chain_and_bandhgala' ||
    p.accessoryType === 'bandana_and_shades'
  ) {
    const coatSkirt = MeshBuilder.CreateBox(
      `${instancePrefix}_coatSkirt`,
      { width: 0.38 * torsoScale, height: 0.26, depth: 0.26 * torsoScale },
      scene
    );
    coatSkirt.position.y = -0.08;
    registerMesh(coatSkirt, bHips, primaryMat, 1);

    const goldChain = MeshBuilder.CreateTorus(
      `${instancePrefix}_goldChain`,
      { diameter: 0.26, thickness: 0.032, tessellation: 16 },
      scene
    );
    goldChain.position.set(0, 0.22, 0.03);
    goldChain.rotation.x = 0.35;
    registerMesh(goldChain, bChest, accentMat, 0);

    const neckBandana = MeshBuilder.CreateTorus(
      `${instancePrefix}_neckBandana`,
      { diameter: 0.21, thickness: 0.045, tessellation: 16 },
      scene
    );
    neckBandana.position.set(0, 0.02, 0.01);
    registerMesh(neckBandana, bNeck, secondaryMat, 0);
  }

  const neckCyl = MeshBuilder.CreateCylinder(
    `${instancePrefix}_neck`,
    { height: 0.18, diameter: 0.135 * jawScale, tessellation: 10 },
    scene
  );
  neckCyl.position.y = 0.03;
  registerMesh(neckCyl, bNeck, skinMat, 2);

  const cranium = MeshBuilder.CreateSphere(
    `${instancePrefix}_cranium`,
    {
      diameterX: 0.23 * jawScale,
      diameterY: 0.25,
      diameterZ: 0.25,
      segments: 12,
    },
    scene
  );
  cranium.position.set(0, 0.12, -0.01);
  registerMesh(cranium, bHead, skinMat, 2);

  const jaw = MeshBuilder.CreateBox(
    `${instancePrefix}_jaw`,
    { width: 0.17 * jawScale, height: 0.11, depth: 0.16 },
    scene
  );
  jaw.position.set(0, 0, 0);
  registerMesh(jaw, bJaw, skinMat, 2);

  const browRidge = MeshBuilder.CreateBox(
    `${instancePrefix}_brow`,
    { width: 0.18 * jawScale, height: 0.035, depth: 0.06 },
    scene
  );
  browRidge.position.set(0, 0.15, 0.1);
  registerMesh(browRidge, bHead, skinMat, 1);

  for (const side of [-1, 1]) {
    const browNode = side === -1 ? bLeftBrow : bRightBrow;
    const eyelidNode = side === -1 ? bLeftEyelid : bRightEyelid;

    const brow = MeshBuilder.CreateBox(
      `${instancePrefix}_brow_${side}`,
      { width: 0.06, height: 0.016, depth: 0.02 },
      scene
    );
    brow.position.set(0, 0, 0);
    brow.rotation.z = side * 0.08;
    registerMesh(brow, browNode, hairMat, 0);

    const eyelid = MeshBuilder.CreateBox(
      `${instancePrefix}_eyelid_${side}`,
      { width: 0.038, height: 0.012, depth: 0.022 },
      scene
    );
    eyelid.position.set(0, 0, 0);
    registerMesh(eyelid, eyelidNode, skinMat, 0);

    const eye = MeshBuilder.CreateSphere(
      `${instancePrefix}_eye_${side}`,
      { diameter: 0.036, segments: 8 },
      scene
    );
    eye.position.set(side * 0.046, 0.13, 0.112);
    registerMesh(eye, bHead, eyeWhiteMat, 1);

    const pupil = MeshBuilder.CreateSphere(
      `${instancePrefix}_pupil_${side}`,
      { diameter: 0.018, segments: 6 },
      scene
    );
    pupil.position.set(side * 0.046, 0.13, 0.126);
    registerMesh(pupil, bHead, pupilMat, 1);

    const ear = MeshBuilder.CreateBox(
      `${instancePrefix}_ear_${side}`,
      { width: 0.025, height: 0.06, depth: 0.04 },
      scene
    );
    ear.position.set(side * 0.115 * jawScale, 0.11, 0.0);
    registerMesh(ear, bHead, skinMat, 0);
  }

  const nose = MeshBuilder.CreateBox(
    `${instancePrefix}_nose`,
    { width: 0.032, height: 0.065, depth: 0.05 },
    scene
  );
  nose.position.set(0, 0.105, 0.122);
  nose.rotation.x = -0.18;
  registerMesh(nose, bHead, skinMat);

  if (p.hairStyle === 'cropped_machismo') {
    const hairCap = MeshBuilder.CreateSphere(
      `${instancePrefix}_hairCap`,
      {
        diameterX: 0.245 * jawScale,
        diameterY: 0.18,
        diameterZ: 0.26,
        segments: 10,
      },
      scene
    );
    hairCap.position.set(0, 0.19, -0.015);
    registerMesh(hairCap, bHead, hairMat);
  } else if (p.hairStyle === 'swept_romantic_waves') {
    const hairBase = MeshBuilder.CreateSphere(
      `${instancePrefix}_hairBase`,
      { diameterX: 0.255, diameterY: 0.2, diameterZ: 0.27, segments: 10 },
      scene
    );
    hairBase.position.set(0, 0.19, -0.01);
    registerMesh(hairBase, bHead, hairMat);

    const quiff = MeshBuilder.CreateBox(
      `${instancePrefix}_quiff`,
      { width: 0.21, height: 0.085, depth: 0.18 },
      scene
    );
    quiff.position.set(0.015, 0.245, 0.04);
    quiff.rotation.z = -0.15;
    quiff.rotation.x = -0.12;
    registerMesh(quiff, bHead, hairMat);
  } else if (p.hairStyle === 'sculpted_bronze_waves') {
    const hairTop = MeshBuilder.CreateSphere(
      `${instancePrefix}_hairTop`,
      { diameterX: 0.25, diameterY: 0.21, diameterZ: 0.26, segments: 10 },
      scene
    );
    hairTop.position.set(0, 0.195, -0.01);
    registerMesh(hairTop, bHead, hairMat);

    for (let i = -1; i <= 1; i++) {
      const wave = MeshBuilder.CreateBox(
        `${instancePrefix}_wave_${i}`,
        { width: 0.06, height: 0.075, depth: 0.18 },
        scene
      );
      wave.position.set(i * 0.06, 0.24, 0.02);
      wave.rotation.z = i * 0.18;
      registerMesh(wave, bHead, hairMat);
    }
  } else if (
    p.hairStyle === 'slicked_villain_mane' ||
    p.hairStyle === 'bhidu_swagger_mane'
  ) {
    const slickTop = MeshBuilder.CreateBox(
      `${instancePrefix}_slickTop`,
      { width: 0.23 * jawScale, height: 0.09, depth: 0.26 },
      scene
    );
    slickTop.position.set(0, 0.21, -0.02);
    registerMesh(slickTop, bHead, hairMat);

    const napeMane = MeshBuilder.CreateBox(
      `${instancePrefix}_napeMane`,
      { width: 0.21 * jawScale, height: 0.14, depth: 0.08 },
      scene
    );
    napeMane.position.set(0, 0.11, -0.12);
    registerMesh(napeMane, bHead, hairMat);

    const headBandana = MeshBuilder.CreateCylinder(
      `${instancePrefix}_headBandana`,
      { height: 0.042, diameter: 0.255 * jawScale, tessellation: 16 },
      scene
    );
    headBandana.position.set(0, 0.185, 0);
    registerMesh(headBandana, bHead, secondaryMat);
  }

  if (p.facialHair === 'royal_mustache' || p.facialHair === 'bhidu_mustache') {
    const mustache = MeshBuilder.CreateBox(
      `${instancePrefix}_mustache`,
      {
        width: p.facialHair === 'bhidu_mustache' ? 0.125 : 0.105,
        height: 0.026,
        depth: 0.032,
      },
      scene
    );
    mustache.position.set(0, 0.068, 0.122);
    registerMesh(mustache, bHead, hairMat);
  } else if (p.facialHair === 'designer_stubble') {
    const beard = MeshBuilder.CreateBox(
      `${instancePrefix}_beard`,
      { width: 0.175 * jawScale, height: 0.075, depth: 0.168 },
      scene
    );
    beard.position.set(0, 0.028, 0.032);
    registerMesh(beard, bHead, hairMat);
  } else if (p.facialHair === 'heavy_boss_goatee') {
    const heavyBeard = MeshBuilder.CreateBox(
      `${instancePrefix}_heavyBeard`,
      { width: 0.185 * jawScale, height: 0.095, depth: 0.175 },
      scene
    );
    heavyBeard.position.set(0, 0.022, 0.035);
    registerMesh(heavyBeard, bHead, hairMat);
  }

  if (charDef.id === 'action_sultan' || charDef.id === 'bhidu') {
    const lensL = MeshBuilder.CreateBox(
      `${instancePrefix}_lensL`,
      { width: 0.072, height: 0.042, depth: 0.02 },
      scene
    );
    lensL.position.set(-0.048, 0.132, 0.132);
    registerMesh(lensL, bHead, darkMat);

    const lensR = MeshBuilder.CreateBox(
      `${instancePrefix}_lensR`,
      { width: 0.072, height: 0.042, depth: 0.02 },
      scene
    );
    lensR.position.set(0.048, 0.132, 0.132);
    registerMesh(lensR, bHead, darkMat);

    const bridge = MeshBuilder.CreateBox(
      `${instancePrefix}_bridge`,
      { width: 0.04, height: 0.01, depth: 0.02 },
      scene
    );
    bridge.position.set(0, 0.142, 0.134);
    registerMesh(bridge, bHead, secondaryMat);
  }

  const buildArm = (
    side: 'L' | 'R',
    shoulder: TransformNode,
    upperArm: TransformNode,
    lowerArm: TransformNode,
    hand: TransformNode
  ) => {
    const sleeveSleeveless = charDef.id === 'action_sultan' || charDef.id === 'duggu';

    const deltoid = MeshBuilder.CreateSphere(
      `${instancePrefix}_deltoid_${side}`,
      { diameter: 0.15 * limbScale, segments: 8 },
      scene
    );
    registerMesh(deltoid, shoulder, sleeveSleeveless ? skinMat : primaryMat);

    const bicep = MeshBuilder.CreateCylinder(
      `${instancePrefix}_bicep_${side}`,
      {
        height: 0.24,
        diameterTop: 0.125 * limbScale,
        diameterBottom: 0.105 * limbScale,
        tessellation: 10,
      },
      scene
    );
    bicep.position.y = -0.12;
    registerMesh(bicep, upperArm, sleeveSleeveless ? skinMat : primaryMat);

    const forearm = MeshBuilder.CreateCylinder(
      `${instancePrefix}_forearm_${side}`,
      {
        height: 0.22,
        diameterTop: 0.102 * limbScale,
        diameterBottom: 0.082 * limbScale,
        tessellation: 10,
      },
      scene
    );
    forearm.position.y = -0.11;
    registerMesh(forearm, lowerArm, charDef.id === 'bhidu' ? primaryMat : skinMat);

    if (
      (charDef.id === 'action_sultan' && side === 'R') ||
      charDef.id === 'duggu' ||
      charDef.id === 'bhidu'
    ) {
      const cuff = MeshBuilder.CreateTorus(
        `${instancePrefix}_cuff_${side}`,
        { diameter: 0.095 * limbScale, thickness: 0.024, tessellation: 12 },
        scene
      );
      cuff.position.y = -0.2;
      registerMesh(cuff, lowerArm, accentMat);
    }

    const fist = MeshBuilder.CreateBox(
      `${instancePrefix}_fist_${side}`,
      {
        width: 0.095 * limbScale,
        height: 0.1,
        depth: 0.1 * limbScale,
      },
      scene
    );
    fist.position.y = -0.04;
    registerMesh(fist, hand, skinMat);

    if (charDef.id === 'action_sultan' && side === 'R') {
      const gunBarrel = MeshBuilder.CreateBox(
        `${instancePrefix}_sultanSidearmBarrel`,
        { width: 0.042, height: 0.24, depth: 0.065 },
        scene
      );
      gunBarrel.position.set(0, -0.16, 0.06);
      registerMesh(gunBarrel, hand, secondaryMat, 0);

      const gunGrip = MeshBuilder.CreateBox(
        `${instancePrefix}_sultanSidearmGrip`,
        { width: 0.04, height: 0.1, depth: 0.08 },
        scene
      );
      gunGrip.position.set(0, -0.06, 0.02);
      registerMesh(gunGrip, hand, darkMat, 0);
    }
  };

  buildArm('L', bLeftShoulder, bLeftUpperArm, bLeftLowerArm, bLeftHand);
  buildArm('R', bRightShoulder, bRightUpperArm, bRightLowerArm, bRightHand);

  const buildLeg = (
    side: 'L' | 'R',
    upperLeg: TransformNode,
    lowerLeg: TransformNode,
    foot: TransformNode
  ) => {
    const thigh = MeshBuilder.CreateCylinder(
      `${instancePrefix}_thigh_${side}`,
      {
        height: 0.42 * heightScale,
        diameterTop: 0.17 * torsoScale,
        diameterBottom: 0.135,
        tessellation: 10,
      },
      scene
    );
    thigh.position.y = -0.21 * heightScale;
    registerMesh(thigh, upperLeg, pantsMat);

    const shin = MeshBuilder.CreateCylinder(
      `${instancePrefix}_shin_${side}`,
      {
        height: 0.4 * heightScale,
        diameterTop: 0.13,
        diameterBottom: 0.105,
        tessellation: 10,
      },
      scene
    );
    shin.position.y = -0.2 * heightScale;
    registerMesh(shin, lowerLeg, pantsMat);

    const boot = MeshBuilder.CreateBox(
      `${instancePrefix}_boot_${side}`,
      { width: 0.12, height: 0.09, depth: 0.25 },
      scene
    );
    boot.position.set(0, -0.03, 0.04);
    registerMesh(boot, foot, darkMat);

    const bootTrim = MeshBuilder.CreateBox(
      `${instancePrefix}_bootTrim_${side}`,
      { width: 0.125, height: 0.025, depth: 0.255 },
      scene
    );
    bootTrim.position.set(0, -0.065, 0.04);
    registerMesh(bootTrim, foot, secondaryMat);
  };

  buildLeg('L', bLeftUpperLeg, bLeftLowerLeg, bLeftFoot);
  buildLeg('R', bRightUpperLeg, bRightLowerLeg, bRightFoot);

  const sockets: Record<BoneAttachmentName, TransformNode> = {
    Head: bHead,
    Chest: bChest,
    RightHand: bRightHand,
    LeftHand: bLeftHand,
    RightFoot: bRightFoot,
    LeftFoot: bLeftFoot,
    Hips: bHips,
    Projectile: bChest,
  };

  return {
    bones,
    sockets,
    meshes,
    originalMaterials,
    meshMinLod,
    grayboxBodyMat,
    grayboxJointMat,
  };
}

/**
 * CharacterAssetLoader
 *
 * Production-ready GLB loader & validator for Filmi Dangal fighters.
 */
export class CharacterAssetLoader {
  public static getManifest(characterId: FighterId): CharacterAssetConfig {
    return getCharacterAssetConfig(characterId);
  }

  public static validateAllCharacterManifests(): {
    allValid: boolean;
    results: ReturnType<typeof validateCharacterAssetManifestConfig>[];
  } {
    const results = (Object.keys(CHARACTER_ASSET_MANIFEST) as FighterId[]).map((id) =>
      validateCharacterAssetManifestConfig(CHARACTER_ASSET_MANIFEST[id])
    );
    return {
      allValid: results.every((r) => r.valid),
      results,
    };
  }

  /**
   * Builds an AnimationGroup controller for an imported production GLB with embedded animations.
   * Respects state transitions so an already-active clip is never restarted every render frame.
   */
  public static createAnimationGroupController(
    characterId: FighterId,
    animationGroups: AnimationGroup[],
    warnings?: string[]
  ): LoadedGLBAnimationController {
    const groupMap = new Map<string, AnimationGroup>();
    for (const ag of animationGroups) {
      if (ag && ag.name) {
        groupMap.set(ag.name, ag);
        // Also index stripped Anim_Common_ prefix for seamless compatibility
        if (ag.name.startsWith('Anim_Common_')) {
          const stripped = ag.name.replace(/^Anim_Common_/, '');
          if (!groupMap.has(stripped)) {
            groupMap.set(stripped, ag);
          }
        }
      }
    }

    const availableClipNames = Array.from(groupMap.keys());
    let activeClipId: StandardAnimationClipId | null = null;
    let activeClipName: string | null = null;
    let currentGroup: AnimationGroup | null = null;

    const hasClip = (clipId: StandardAnimationClipId): boolean => {
      if (availableClipNames.length === 0) return false;
      const resolved = resolveCharacterAnimationClip(
        characterId,
        clipId,
        availableClipNames
      );
      if (resolved.usedFallback && clipId !== 'idle') {
        return false;
      }
      return groupMap.has(resolved.resolvedClipName);
    };

    const playClip = (
      clipId: StandardAnimationClipId,
      speedMultiplier = 1.0,
      forceRestart = false
    ): boolean => {
      if (availableClipNames.length === 0) return false;
      const resolved = resolveCharacterAnimationClip(
        characterId,
        clipId,
        availableClipNames,
        (msg) => emitOnceAssetWarning(msg, warnings)
      );
      // If a non-idle state fell all the way back to generic Idle because its clip is missing,
      // return false so AnimationController3D Case 2 can fall back to procedural bone poses.
      if (resolved.usedFallback && clipId !== 'idle') {
        return false;
      }
      const targetGroup = groupMap.get(resolved.resolvedClipName);
      if (!targetGroup) {
        return false;
      }

      const effectiveSpeed = resolved.mapping.speedRatio * speedMultiplier;
      const isSameActiveClip =
        activeClipId === clipId && currentGroup === targetGroup && !forceRestart;

      if (isSameActiveClip) {
        // Never restart an active clip every frame!
        targetGroup.speedRatio = effectiveSpeed;
        if (resolved.mapping.loop && !targetGroup.isPlaying) {
          targetGroup.start(true, effectiveSpeed);
        }
        return true;
      }

      if (currentGroup && currentGroup !== targetGroup) {
        currentGroup.stop();
      }
      currentGroup = targetGroup;
      activeClipId = clipId;
      activeClipName = resolved.resolvedClipName;

      targetGroup.stop();
      targetGroup.start(resolved.mapping.loop, effectiveSpeed);
      return true;
    };

    const stopAll = () => {
      for (const ag of animationGroups) {
        ag.stop();
      }
      currentGroup = null;
      activeClipId = null;
      activeClipName = null;
    };

    return {
      availableClipNames,
      get activeClipId() {
        return activeClipId;
      },
      get activeClipName() {
        return activeClipName;
      },
      hasClip,
      playClip,
      stopAll,
    };
  }

  /**
   * Loads a character rig from the manifest path (`modelPath`, falling back to `legacyModelPath`).
   * Implements two explicit, non-overlapping rendering paths (Section 6):
   * - Path A: Temporary Placeholder (`isTemporaryPlaceholder: true` or non-production GLB)
   * - Path B: Production Character (`isTemporaryPlaceholder: false` and valid skinned GLB)
   */
  public static async loadCharacterFromManifest(
    scene: Scene,
    charDef: CharacterDef,
    instancePrefix: string,
    shadowGenerator?: ShadowGenerator | null
  ): Promise<{
    rootNode: TransformNode;
    facingNode: TransformNode;
    modelTransformNode: TransformNode;
    importedRootNodes: TransformNode[];
    bones: Record<string, TransformNode>;
    sockets: Record<BoneAttachmentName, TransformNode>;
    meshes: Mesh[];
    glbLoaded: boolean;
    isPlaceholderAsset: boolean;
    glbAnimationController: LoadedGLBAnimationController | null;
    diagnostics: CharacterAssetLoadDiagnostics;
    setRenderMode: (mode: 'stylized' | 'graybox') => void;
    setLODLevel: (level: 0 | 1 | 2) => void;
    dispose: () => void;
  }> {
    const manifest = getCharacterAssetConfig(charDef.id);
    const warnings: string[] = [];
    const errors: string[] = [];
    const attemptedPaths = [manifest.modelPath];
    if (
      manifest.legacyModelPath &&
      manifest.legacyModelPath !== manifest.modelPath
    ) {
      attemptedPaths.push(manifest.legacyModelPath);
    }
    if (
      charDef.visuals.glbModelPath &&
      !attemptedPaths.includes(charDef.visuals.glbModelPath)
    ) {
      attemptedPaths.push(charDef.visuals.glbModelPath);
    }

    // 1. FighterRoot: controlled strictly by gameplay X/Y position (Z = 0)
    const rootNode = new TransformNode(`${instancePrefix}_${charDef.id}_root`, scene);
    rootNode.position.set(0, 0, 0);
    rootNode.scaling.setAll(1);

    // 2. FacingNode: controlled strictly by facing yaw rotation
    const facingNode = new TransformNode(`${instancePrefix}_${charDef.id}_facing`, scene);
    facingNode.parent = rootNode;
    facingNode.position.set(0, 0, 0);
    facingNode.scaling.setAll(1);

    // 3. ModelTransformNode: applies manifest.scale and manifest.groundOffset EXACTLY ONCE
    const modelTransformNode = new TransformNode(
      `${instancePrefix}_${charDef.id}_modelTransform`,
      scene
    );
    modelTransformNode.parent = facingNode;
    modelTransformNode.position.set(0, manifest.groundOffset, 0);
    modelTransformNode.scaling.setAll(manifest.scale);

    rootNode.metadata = {
      characterId: charDef.id,
      heightScale: charDef.visuals.proportions.heightScale,
      manifestScale: manifest.scale,
      groundOffset: manifest.groundOffset,
    };

    let importedMeshes: Mesh[] = [];
    let importedTransformNodes: TransformNode[] = [];
    let importedSkeletons: Skeleton[] = [];
    let importedAnimGroups: AnimationGroup[] = [];
    let glbLoaded = false;
    let loadedFromPath: string | null = null;

    for (const candidatePath of attemptedPaths) {
      try {
        const lastSlash = candidatePath.lastIndexOf('/');
        const rootUrl = candidatePath.substring(0, lastSlash + 1);
        const sceneFilename = candidatePath.substring(lastSlash + 1);

        const result = await SceneLoader.ImportMeshAsync('', rootUrl, sceneFilename, scene);
        if (result && ((result.meshes && result.meshes.length > 0) || (result.transformNodes && result.transformNodes.length > 0))) {
          glbLoaded = true;
          loadedFromPath = candidatePath;
          importedMeshes = (result.meshes || []).filter(
            (m): m is Mesh => m instanceof Mesh
          );
          importedTransformNodes = result.transformNodes || [];
          importedSkeletons = result.skeletons || [];
          importedAnimGroups = result.animationGroups || [];
          break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed loading "${candidatePath}": ${msg}`);
      }
    }

    if (!glbLoaded) {
      emitOnceAssetWarning(
        `[CharacterAssetLoader] Could not load GLB for "${charDef.id}" from [${attemptedPaths.join(
          ', '
        )}]. Using temporary placeholder rig.`,
        warnings
      );
    }

    // Section 3: Attach top-level imported GLB hierarchy once under modelTransformNode
    const hierarchyAttachment = attachImportedGLBHierarchyToFacingNode(
      modelTransformNode,
      importedMeshes,
      importedTransformNodes
    );

    // Section 4: Resolve canonical humanoid & facial bones across TransformNodes and Skeletons
    const boneResolution = resolveHumanoidSkeletonAndBones(
      charDef.id,
      importedTransformNodes,
      importedMeshes,
      importedSkeletons,
      scene,
      modelTransformNode,
      instancePrefix
    );

    // Measure imported model bounds before deciding Path A vs Path B
    const importedDimensions = computeRigWorldBounds(rootNode, importedMeshes);

    // Section 5: Evaluate production character eligibility
    const eligibility = evaluateRuntimeProductionRigEligibility({
      manifest,
      glbLoaded,
      importedMeshes,
      allSkeletons: boneResolution.allSkeletons,
      missingHumanoidBones: boneResolution.missingBones,
      dimensions: importedDimensions,
    });

    const useProductionPathB =
      glbLoaded && !manifest.isTemporaryPlaceholder && eligibility.isProductionReady;

    // Collect imported materials for diagnostics and disposal
    const importedMaterialSet = new Set<Material>();
    for (const m of importedMeshes) {
      if (m.material) {
        importedMaterialSet.add(m.material);
      }
    }

    // =========================================================================
    // PATH A: TEMPORARY PLACEHOLDER RIG (Section 6)
    // =========================================================================
    if (!useProductionPathB) {
      emitOnceAssetWarning(
        `[CharacterAssetLoader] Character "${charDef.id}" (${manifest.displayName}) is using Path A (Temporary Placeholder Rig). Reasons: ${eligibility.reasons.join(
          '; '
        )}.`,
        warnings
      );

      // Dispose imported placeholder proxy meshes, skeletons, animation groups, and materials
      // so ONLY the intended temporary procedural geometry exists in the scene (never both!).
      for (const ag of importedAnimGroups) {
        ag.stop();
        ag.dispose();
      }
      for (const skel of boneResolution.allSkeletons) {
        skel.dispose();
      }
      for (const proxyTn of boneResolution.createdProxyNodes) {
        proxyTn.dispose();
      }
      for (const m of importedMeshes) {
        m.dispose(false, false);
      }
      for (const tn of importedTransformNodes) {
        if (!tn.isDisposed()) {
          tn.dispose();
        }
      }
      for (const mat of importedMaterialSet) {
        mat.dispose();
      }

      const placeholder = buildTemporaryPlaceholderHumanoidRig(
        scene,
        charDef,
        manifest,
        instancePrefix,
        modelTransformNode,
        {},
        shadowGenerator
      );

      const placeholderDimensions = computeRigWorldBounds(rootNode, placeholder.meshes);
      const placeholderMatSet = new Set(placeholder.originalMaterials.values());

      const diagnostics: CharacterAssetLoadDiagnostics = {
        characterId: charDef.id,
        requestedModelPath: manifest.modelPath,
        attemptedPaths,
        loadedFromPath,
        glbLoaded,
        usedTemporaryPlaceholder: true,
        importedMeshCount: importedMeshes.length,
        importedTransformNodeCount: importedTransformNodes.length,
        skeletonCount: boneResolution.allSkeletons.length,
        resolvedBoneCount: Object.keys(placeholder.bones).length,
        resolvedBones: Object.keys(placeholder.bones),
        missingBones: [],
        missingFacialBones: [],
        hasEmbeddedAnimations: false,
        availableAnimationClips: [],
        missingStandardClips: [],
        skinningValid: eligibility.skinningValid,
        productionRigEligible: false,
        productionEligibilityReasons: eligibility.reasons,
        modelDimensions: placeholderDimensions,
        scale: manifest.scale,
        groundOffset: manifest.groundOffset,
        materialCount: placeholderMatSet.size,
        textureLoadingStatus: 'NO_TEXTURES',
        errors,
        warnings,
      };

      const setRenderMode = (mode: 'stylized' | 'graybox') => {
        for (const mesh of placeholder.meshes) {
          if (mode === 'graybox') {
            const isJoint =
              mesh.name.includes('deltoid') ||
              mesh.name.includes('fist') ||
              mesh.name.includes('boot') ||
              mesh.name.includes('jaw');
            mesh.material = isJoint
              ? placeholder.grayboxJointMat
              : placeholder.grayboxBodyMat;
          } else {
            const orig = placeholder.originalMaterials.get(mesh);
            if (orig) mesh.material = orig;
          }
        }
      };

      const setLODLevel = (level: 0 | 1 | 2) => {
        for (const mesh of placeholder.meshes) {
          const maxAllowedLod = placeholder.meshMinLod.get(mesh) ?? 2;
          mesh.isVisible = level <= maxAllowedLod;
        }
      };

      return {
        rootNode,
        facingNode,
        modelTransformNode,
        importedRootNodes: [placeholder.bones.Root],
        bones: placeholder.bones,
        sockets: placeholder.sockets,
        meshes: placeholder.meshes,
        glbLoaded,
        isPlaceholderAsset: true,
        glbAnimationController: null,
        diagnostics,
        setRenderMode,
        setLODLevel,
        dispose: () => {
          const uniqueMats = new Set(placeholder.originalMaterials.values());
          uniqueMats.add(placeholder.grayboxBodyMat);
          uniqueMats.add(placeholder.grayboxJointMat);
          rootNode.dispose();
          for (const mat of uniqueMats) {
            mat.dispose();
          }
        },
      };
    }

    // =========================================================================
    // PATH B: PRODUCTION CHARACTER GLB (Section 6)
    // =========================================================================
    for (const m of importedMeshes) {
      const hasVerts = m.getTotalVertices() > 0;
      m.isVisible = hasVerts;
      m.receiveShadows = hasVerts;
      if (shadowGenerator && hasVerts) {
        shadowGenerator.addShadowCaster(m);
      }
    }

    if (boneResolution.missingBones.length > 0) {
      emitOnceAssetWarning(
        `[CharacterAssetLoader] Production GLB for "${charDef.id}" is missing humanoid bones: ${boneResolution.missingBones.join(
          ', '
        )}`,
        warnings
      );
    }

    const fallbackNode = boneResolution.resolvedBoneMap.Root || modelTransformNode;
    const sockets: Record<BoneAttachmentName, TransformNode> = {
      Head: boneResolution.resolvedBoneMap.Head || fallbackNode,
      Chest: boneResolution.resolvedBoneMap.Chest || fallbackNode,
      RightHand: boneResolution.resolvedBoneMap.RightHand || fallbackNode,
      LeftHand: boneResolution.resolvedBoneMap.LeftHand || fallbackNode,
      RightFoot: boneResolution.resolvedBoneMap.RightFoot || fallbackNode,
      LeftFoot: boneResolution.resolvedBoneMap.LeftFoot || fallbackNode,
      Hips: boneResolution.resolvedBoneMap.Hips || fallbackNode,
      Projectile: boneResolution.resolvedBoneMap.Chest || fallbackNode,
    };

    const glbAnimationController = CharacterAssetLoader.createAnimationGroupController(
      charDef.id,
      importedAnimGroups,
      warnings
    );

    const availableAnimationClips = glbAnimationController.availableClipNames;
    const missingStandardClips = ALL_STANDARD_ANIMATION_CLIP_IDS.filter((clipId) => {
      const res = resolveCharacterAnimationClip(
        charDef.id,
        clipId,
        availableAnimationClips,
        (msg) => emitOnceAssetWarning(msg, warnings)
      );
      return res.usedFallback;
    });

    // Inspect texture readiness across imported materials
    let totalTextures = 0;
    let allTexturesReady = true;
    for (const mat of importedMaterialSet) {
      const activeTex = mat.getActiveTextures();
      for (const tex of activeTex) {
        totalTextures++;
        if (!tex.isReady()) {
          allTexturesReady = false;
        }
      }
    }
    const textureLoadingStatus: CharacterAssetLoadDiagnostics['textureLoadingStatus'] =
      totalTextures === 0
        ? 'NO_TEXTURES'
        : allTexturesReady
        ? 'READY'
        : 'PENDING_OR_FAILED';

    const productionDimensions = computeRigWorldBounds(rootNode, importedMeshes);

    const diagnostics: CharacterAssetLoadDiagnostics = {
      characterId: charDef.id,
      requestedModelPath: manifest.modelPath,
      attemptedPaths,
      loadedFromPath,
      glbLoaded: true,
      usedTemporaryPlaceholder: false,
      importedMeshCount: importedMeshes.length,
      importedTransformNodeCount: importedTransformNodes.length,
      skeletonCount: boneResolution.allSkeletons.length,
      resolvedBoneCount: boneResolution.resolvedBones.length,
      resolvedBones: boneResolution.resolvedBones,
      missingBones: boneResolution.missingBones,
      missingFacialBones: boneResolution.missingFacialBones,
      hasEmbeddedAnimations: importedAnimGroups.length > 0,
      availableAnimationClips,
      missingStandardClips,
      skinningValid: eligibility.skinningValid,
      productionRigEligible: true,
      productionEligibilityReasons: [],
      modelDimensions: productionDimensions,
      scale: manifest.scale,
      groundOffset: manifest.groundOffset,
      materialCount: importedMaterialSet.size,
      textureLoadingStatus,
      errors,
      warnings,
    };

    return {
      rootNode,
      facingNode,
      modelTransformNode,
      importedRootNodes: hierarchyAttachment.importedRoots,
      bones: {
        ...boneResolution.rawNodeLookup,
        ...boneResolution.resolvedBoneMap,
      },
      sockets,
      meshes: importedMeshes,
      glbLoaded: true,
      isPlaceholderAsset: false,
      glbAnimationController,
      diagnostics,
      setRenderMode: () => {},
      setLODLevel: () => {},
      dispose: () => {
        glbAnimationController.stopAll();
        for (const ag of importedAnimGroups) {
          ag.dispose();
        }
        for (const skel of boneResolution.allSkeletons) {
          skel.dispose();
        }
        for (const proxyTn of boneResolution.createdProxyNodes) {
          proxyTn.dispose();
        }
        for (const mat of importedMaterialSet) {
          mat.dispose();
        }
        rootNode.dispose();
      },
    };
  }
}
