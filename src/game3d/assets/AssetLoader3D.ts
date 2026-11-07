import {
  Scene,
  TransformNode,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Vector3,
  Mesh,
  SceneLoader,
  ShadowGenerator,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { BoneAttachmentName, CharacterDef } from '../../types/fighter';

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
  LeftForeArm: ['LeftForeArm', 'LeftLowerArm'],
  RightForeArm: ['RightForeArm', 'RightLowerArm'],
  LeftUpLeg: ['LeftUpLeg', 'LeftUpperLeg'],
  LeftLeg: ['LeftLeg', 'LeftLowerLeg'],
  RightUpLeg: ['RightUpLeg', 'RightUpperLeg'],
  RightLeg: ['RightLeg', 'RightLowerLeg'],
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

function createPBR(
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
 * Loads the character's GLB model via Babylon SceneLoader and constructs a rich,
 * high-readability semi-realistic 3D humanoid fighter rig with distinct facial structure,
 * hair, facial hair, costume layers, and bone attachment sockets.
 */
export async function loadCharacterRig3D(
  scene: Scene,
  charDef: CharacterDef,
  instancePrefix: string,
  shadowGenerator?: ShadowGenerator | null
): Promise<CharacterRig3D> {
  const rootNode = new TransformNode(`${instancePrefix}_${charDef.id}_root`, scene);
  const facingNode = new TransformNode(`${instancePrefix}_${charDef.id}_facing`, scene);
  facingNode.parent = rootNode;

  const meshes: Mesh[] = [];
  const bones: Record<string, TransformNode> = {};
  let glbLoaded = false;

  const modelPath = charDef.visuals.glbModelPath;

  // 1. Load GLB asset via @babylonjs/loaders/glTF
  try {
    const lastSlash = modelPath.lastIndexOf('/');
    const rootUrl = modelPath.substring(0, lastSlash + 1);
    const sceneFilename = modelPath.substring(lastSlash + 1);

    const result = await SceneLoader.ImportMeshAsync('', rootUrl, sceneFilename, scene);
    if (result.meshes && result.meshes.length > 0) {
      glbLoaded = true;
      for (const m of result.meshes) {
        if (m.parent === null) {
          m.parent = facingNode;
        }
        // Keep the imported GLB hierarchy mounted and hide the low-poly proxy cubes so
        // the high-detail sculpted PBR humanoid meshes driven by the same bone names render cleanly
        m.isVisible = false;
      }
      for (const tn of result.transformNodes) {
        if (tn.name) {
          bones[tn.name] = tn;
        }
      }
    }
  } catch {
    glbLoaded = false;
  }

  // 2. Build/normalize full articulated bone hierarchy under facingNode
  const v = charDef.visuals;
  const p = v.proportions;
  // Normalize proportions from CharacterDef
  const heightScale = p.heightScale; // ~1.0 - 1.07
  const shoulderScale = p.shoulderWidth / 0.48; // ~0.92 - 1.15
  const torsoScale = p.torsoBulk / 0.32; // ~0.9 - 1.25
  const limbScale = p.limbThickness / 0.12; // ~0.88 - 1.17
  const jawScale = p.jawWidth / 0.2; // ~0.9 - 1.15

  const ensureBone = (name: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const node = new TransformNode(`${instancePrefix}_${name}`, scene);
    node.parent = parent;
    node.position.copyFrom(pos);
    bones[name] = node;
    return node;
  };

  const bRoot = ensureBone('Root', facingNode, new Vector3(0, 0, 0));
  const bHips = ensureBone('Hips', bRoot, new Vector3(0, 0.95 * heightScale, 0));
  const bSpine = ensureBone('Spine', bHips, new Vector3(0, 0.16 * heightScale, 0));
  const bChest = ensureBone('Chest', bSpine, new Vector3(0, 0.2 * heightScale, 0));
  const bNeck = ensureBone('Neck', bChest, new Vector3(0, 0.21 * heightScale, 0));
  const bHead = ensureBone('Head', bNeck, new Vector3(0, 0.08 * heightScale, 0));

  // Facial Expression Rig Nodes
  const bJaw = ensureBone('Jaw', bHead, new Vector3(0, 0.04, 0.03));
  const bLeftBrow = ensureBone('LeftBrow', bHead, new Vector3(-0.048, 0.16, 0.125));
  const bRightBrow = ensureBone('RightBrow', bHead, new Vector3(0.048, 0.16, 0.125));
  const bLeftEyelid = ensureBone('LeftEyelid', bHead, new Vector3(-0.046, 0.142, 0.118));
  const bRightEyelid = ensureBone('RightEyelid', bHead, new Vector3(0.046, 0.142, 0.118));

  const shoulderOffsetX = 0.23 * shoulderScale;
  const bLeftShoulder = ensureBone('LeftShoulder', bChest, new Vector3(-shoulderOffsetX, 0.15, 0));
  const bLeftUpperArm = ensureBone('LeftUpperArm', bLeftShoulder, new Vector3(-0.05, -0.12, 0));
  const bLeftLowerArm = ensureBone('LeftLowerArm', bLeftUpperArm, new Vector3(0, -0.25, 0));
  const bLeftHand = ensureBone('LeftHand', bLeftLowerArm, new Vector3(0, -0.22, 0));
  bones.LeftForeArm = bLeftLowerArm;

  const bRightShoulder = ensureBone('RightShoulder', bChest, new Vector3(shoulderOffsetX, 0.15, 0));
  const bRightUpperArm = ensureBone('RightUpperArm', bRightShoulder, new Vector3(0.05, -0.12, 0));
  const bRightLowerArm = ensureBone('RightLowerArm', bRightUpperArm, new Vector3(0, -0.25, 0));
  const bRightHand = ensureBone('RightHand', bRightLowerArm, new Vector3(0, -0.22, 0));
  bones.RightForeArm = bRightLowerArm;

  const hipOffsetX = 0.12 * torsoScale;
  const bLeftUpperLeg = ensureBone('LeftUpperLeg', bHips, new Vector3(-hipOffsetX, -0.08, 0));
  const bLeftLowerLeg = ensureBone('LeftLowerLeg', bLeftUpperLeg, new Vector3(0, -0.42 * heightScale, 0));
  const bLeftFoot = ensureBone('LeftFoot', bLeftLowerLeg, new Vector3(0, -0.4 * heightScale, 0.05));
  bones.LeftUpLeg = bLeftUpperLeg;
  bones.LeftLeg = bLeftLowerLeg;

  const bRightUpperLeg = ensureBone('RightUpperLeg', bHips, new Vector3(hipOffsetX, -0.08, 0));
  const bRightLowerLeg = ensureBone('RightLowerLeg', bRightUpperLeg, new Vector3(0, -0.42 * heightScale, 0));
  const bRightFoot = ensureBone('RightFoot', bRightLowerLeg, new Vector3(0, -0.4 * heightScale, 0.05));
  bones.RightUpLeg = bRightUpperLeg;
  bones.RightLeg = bRightLowerLeg;

  // Materials
  const skinMat = createPBR(scene, `${instancePrefix}_skin`, v.skinTone, 0.42, 0.04);
  const primaryMat = createPBR(scene, `${instancePrefix}_primary`, v.primaryColor, 0.38, 0.22);
  const secondaryMat = createPBR(scene, `${instancePrefix}_secondary`, v.secondaryColor, 0.3, 0.65);
  const accentMat = createPBR(scene, `${instancePrefix}_accent`, v.accentColor, 0.3, 0.5, v.accentColor);
  const hairMat = createPBR(scene, `${instancePrefix}_hair`, v.hairColor, 0.55, 0.08);
  const darkMat = createPBR(scene, `${instancePrefix}_dark`, '#141418', 0.25, 0.5);
  const grayboxBodyMat = createPBR(scene, `${instancePrefix}_graybox_body`, '#64748B', 0.6, 0.1);
  const grayboxJointMat = createPBR(scene, `${instancePrefix}_graybox_joint`, '#F97316', 0.4, 0.2);

  const pantsMat = createPBR(
    scene,
    `${instancePrefix}_pants`,
    charDef.id === 'action_sultan'
      ? '#1E293B'
      : charDef.id === 'romance_raja'
      ? '#27272A'
      : charDef.id === 'dance_dynamo'
      ? '#0F172A'
      : '#2E1065',
    0.45,
    0.15
  );
  const eyeWhiteMat = createPBR(scene, `${instancePrefix}_eyeW`, '#F8FAFC', 0.2, 0.0);
  const pupilMat = createPBR(scene, `${instancePrefix}_pupil`, '#1E1B18', 0.15, 0.1);

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

  // --- TORSO, PELVIS & COSTUME SILHOUETTE ---
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
    charDef.id === 'action_sultan' || charDef.id === 'dance_dynamo' ? skinMat : primaryMat,
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

  // Character-specific Jacket / Vest / Coat Layers
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
  } else if (p.accessoryType === 'gold_chain_and_bandhgala') {
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
    registerMesh(goldChain, bChest, secondaryMat, 0);
  }

  // --- NECK & SCULPTED 3D HEAD + FACIAL EXPRESSION RIG ---
  const neckCyl = MeshBuilder.CreateCylinder(
    `${instancePrefix}_neck`,
    { height: 0.18, diameter: 0.135 * jawScale, tessellation: 10 },
    scene
  );
  neckCyl.position.y = 0.03;
  registerMesh(neckCyl, bNeck, skinMat, 2);

  const cranium = MeshBuilder.CreateSphere(
    `${instancePrefix}_cranium`,
    { diameterX: 0.23 * jawScale, diameterY: 0.25, diameterZ: 0.25, segments: 12 },
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

  // --- DISTINCT HAIRSTYLES ---
  if (p.hairStyle === 'cropped_machismo') {
    const hairCap = MeshBuilder.CreateSphere(
      `${instancePrefix}_hairCap`,
      { diameterX: 0.245 * jawScale, diameterY: 0.18, diameterZ: 0.26, segments: 10 },
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
  } else if (p.hairStyle === 'slicked_villain_mane') {
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
  }

  // --- DISTINCT FACIAL HAIR ---
  if (p.facialHair === 'royal_mustache') {
    const mustache = MeshBuilder.CreateBox(
      `${instancePrefix}_mustache`,
      { width: 0.105, height: 0.024, depth: 0.03 },
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

    const tilak = MeshBuilder.CreateBox(
      `${instancePrefix}_tilak`,
      { width: 0.022, height: 0.042, depth: 0.015 },
      scene
    );
    tilak.position.set(0, 0.185, 0.124);
    registerMesh(
      tilak,
      bHead,
      createPBR(scene, `${instancePrefix}_crimson`, '#DC2626', 0.3, 0.2, '#EF4444')
    );
  }

  // Aviator Shades for Action Sultan & Villain Saab
  if (charDef.id === 'action_sultan' || charDef.id === 'villain_saab') {
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

  // --- ARMS & HANDS ---
  const buildArm = (
    side: 'L' | 'R',
    shoulder: TransformNode,
    upperArm: TransformNode,
    lowerArm: TransformNode,
    hand: TransformNode
  ) => {
    const sleeveSleeveless =
      charDef.id === 'action_sultan' || charDef.id === 'dance_dynamo';

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
    registerMesh(
      forearm,
      lowerArm,
      charDef.id === 'villain_saab' ? primaryMat : skinMat
    );

    if (
      (charDef.id === 'action_sultan' && side === 'R') ||
      charDef.id === 'dance_dynamo' ||
      charDef.id === 'villain_saab'
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
  };

  buildArm('L', bLeftShoulder, bLeftUpperArm, bLeftLowerArm, bLeftHand);
  buildArm('R', bRightShoulder, bRightUpperArm, bRightLowerArm, bRightHand);

  // --- LEGS & BOOTS ---
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

  let currentRenderMode: 'stylized' | 'graybox' = 'stylized';
  let currentLodLevel: 0 | 1 | 2 = 0;

  const setRenderMode = (mode: 'stylized' | 'graybox') => {
    currentRenderMode = mode;
    for (const mesh of meshes) {
      if (mode === 'graybox') {
        const isJointOrExtremity =
          mesh.name.includes('deltoid') ||
          mesh.name.includes('fist') ||
          mesh.name.includes('boot') ||
          mesh.name.includes('jaw');
        mesh.material = isJointOrExtremity ? grayboxJointMat : grayboxBodyMat;
      } else {
        const orig = originalMaterials.get(mesh);
        if (orig) mesh.material = orig;
      }
    }
  };

  const setLODLevel = (level: 0 | 1 | 2) => {
    currentLodLevel = level;
    for (const mesh of meshes) {
      const maxAllowedLod = meshMinLod.get(mesh) ?? 2;
      mesh.isVisible = level <= maxAllowedLod;
    }
  };

  const rig: CharacterRig3D = {
    characterId: charDef.id,
    rootNode,
    facingNode,
    bones,
    sockets,
    meshes,
    glbLoaded,
    get renderMode() {
      return currentRenderMode;
    },
    get lodLevel() {
      return currentLodLevel;
    },
    setRenderMode,
    setLODLevel,
    dispose: () => {
      rootNode.dispose();
    },
  };

  return rig;
}
