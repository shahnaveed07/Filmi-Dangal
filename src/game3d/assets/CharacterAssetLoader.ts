import {
  AnimationGroup,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  ALL_STANDARD_ANIMATION_CLIP_IDS,
  CHARACTER_ASSET_MANIFEST,
  CharacterAssetConfig,
  getCharacterAssetConfig,
  resolveAliasedBoneNode,
  resolveCharacterAnimationClip,
  StandardAnimationClipId,
  validateCharacterAssetManifestConfig,
} from '../../config/characterAssets';
import { BoneAttachmentName, CharacterDef, FighterId } from '../../types/fighter';
import { REQUIRED_HUMANOID_BONES } from './AssetLoader3D';

export interface LoadedGLBAnimationController {
  availableClipNames: string[];
  activeClipId: StandardAnimationClipId | null;
  playClip: (clipId: StandardAnimationClipId, speedMultiplier?: number) => boolean;
  stopAll: () => void;
}

export interface CharacterAssetLoadDiagnostics {
  characterId: FighterId;
  attemptedPaths: string[];
  loadedFromPath: string | null;
  usedTemporaryPlaceholder: boolean;
  hasEmbeddedAnimations: boolean;
  availableAnimationClips: string[];
  missingStandardClips: StandardAnimationClipId[];
  resolvedBones: string[];
  missingBones: string[];
  warnings: string[];
}

const loggedAssetWarnings = new Set<string>();

function emitOnceWarning(warning: string, collector?: string[]): void {
  if (collector) {
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
 * Isolated Temporary Placeholder Rig Builder (Section 3.2).
 * Separated from production GLB loading so temporary geometry is only constructed when
 * a character is explicitly marked `isTemporaryPlaceholder: true` or when a production GLB
 * is not yet present on disk.
 */
export function buildTemporaryPlaceholderHumanoidRig(
  scene: Scene,
  charDef: CharacterDef,
  manifest: CharacterAssetConfig,
  instancePrefix: string,
  facingNode: TransformNode,
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
  const heightScale = p.heightScale * (manifest.scale / 1.02);
  const shoulderScale = p.shoulderWidth / 0.48;
  const torsoScale = p.torsoBulk / 0.32;
  const limbScale = p.limbThickness / 0.12;
  const jawScale = p.jawWidth / 0.2;

  const ensureBone = (name: string, parent: TransformNode, pos: Vector3): TransformNode => {
    const node = new TransformNode(`${instancePrefix}_${name}`, scene);
    node.parent = parent;
    node.position.copyFrom(pos);
    bones[name] = node;
    return node;
  };

  const bRoot = ensureBone('Root', facingNode, new Vector3(0, manifest.groundOffset, 0));
  const bHips = ensureBone('Hips', bRoot, new Vector3(0, 0.95 * heightScale, 0));
  const bSpine = ensureBone('Spine', bHips, new Vector3(0, 0.16 * heightScale, 0));
  const bChest = ensureBone('Chest', bSpine, new Vector3(0, 0.2 * heightScale, 0));
  const bNeck = ensureBone('Neck', bChest, new Vector3(0, 0.21 * heightScale, 0));
  const bHead = ensureBone('Head', bNeck, new Vector3(0, 0.08 * heightScale, 0));

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

  const bRightUpperLeg = ensureBone('RightUpperLeg', bHips, new Vector3(hipOffsetX, -0.08, 0));
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

  const skinMat = createPlaceholderPBR(scene, `${instancePrefix}_skin`, v.skinTone, 0.42, 0.04);
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
  const hairMat = createPlaceholderPBR(scene, `${instancePrefix}_hair`, v.hairColor, 0.55, 0.08);
  const darkMat = createPlaceholderPBR(scene, `${instancePrefix}_dark`, '#141418', 0.25, 0.5);
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
      : charDef.id === 'dance_dynamo'
      ? '#0F172A'
      : '#2E1065',
    0.45,
    0.15
  );
  const eyeWhiteMat = createPlaceholderPBR(scene, `${instancePrefix}_eyeW`, '#F8FAFC', 0.2, 0.0);
  const pupilMat = createPlaceholderPBR(scene, `${instancePrefix}_pupil`, '#1E1B18', 0.15, 0.1);

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
      createPlaceholderPBR(scene, `${instancePrefix}_crimson`, '#DC2626', 0.3, 0.2, '#EF4444')
    );
  }

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

  const buildArm = (
    side: 'L' | 'R',
    shoulder: TransformNode,
    upperArm: TransformNode,
    lowerArm: TransformNode,
    hand: TransformNode
  ) => {
    const sleeveSleeveless = charDef.id === 'action_sultan' || charDef.id === 'dance_dynamo';

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
    registerMesh(forearm, lowerArm, charDef.id === 'villain_saab' ? primaryMat : skinMat);

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
 * - Reads character configuration from `CHARACTER_ASSET_MANIFEST`
 * - Supports loading real production GLB models (`public/assets/characters/<slug>/model.glb`)
 *   with preserved skinned meshes, materials, skeletons, bone aliases, and embedded AnimationGroups
 * - Isolates the temporary placeholder rig builder so replacing a character with a real GLB
 *   requires zero changes to combat, HUD, or camera logic.
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
   */
  public static createAnimationGroupController(
    characterId: FighterId,
    animationGroups: AnimationGroup[],
    warnings?: string[]
  ): LoadedGLBAnimationController {
    const groupMap = new Map<string, AnimationGroup>();
    for (const ag of animationGroups) {
      if (ag.name) {
        groupMap.set(ag.name, ag);
      }
    }

    const availableClipNames = Array.from(groupMap.keys());
    let activeClipId: StandardAnimationClipId | null = null;
    let currentGroup: AnimationGroup | null = null;

    const playClip = (clipId: StandardAnimationClipId, speedMultiplier = 1.0): boolean => {
      if (availableClipNames.length === 0) return false;
      const resolved = resolveCharacterAnimationClip(
        characterId,
        clipId,
        availableClipNames,
        (msg) => emitOnceWarning(msg, warnings)
      );
      const targetGroup = groupMap.get(resolved.resolvedClipName);
      if (!targetGroup) {
        return false;
      }

      if (currentGroup && currentGroup !== targetGroup) {
        currentGroup.stop();
      }
      currentGroup = targetGroup;
      activeClipId = clipId;

      const effectiveSpeed = resolved.mapping.speedRatio * speedMultiplier;
      if (!targetGroup.isPlaying) {
        targetGroup.start(resolved.mapping.loop, effectiveSpeed);
      } else {
        targetGroup.speedRatio = effectiveSpeed;
      }
      return true;
    };

    const stopAll = () => {
      for (const ag of animationGroups) {
        ag.stop();
      }
      currentGroup = null;
      activeClipId = null;
    };

    return {
      availableClipNames,
      get activeClipId() {
        return activeClipId;
      },
      playClip,
      stopAll,
    };
  }

  /**
   * Loads a character rig from the manifest path (`modelPath`, falling back to `legacyModelPath`).
   * - If the loaded GLB is a real production character (i.e. `!manifest.isTemporaryPlaceholder`
   *   and contains skinned or multi-vertex meshes), preserves and renders the actual imported GLB
   *   meshes, materials, bones, and AnimationGroups.
   * - If the character is marked `isTemporaryPlaceholder: true` or the GLB file cannot be loaded,
   *   logs a clear development warning and constructs the isolated temporary placeholder rig.
   */
  public static async loadCharacterFromManifest(
    scene: Scene,
    charDef: CharacterDef,
    instancePrefix: string,
    shadowGenerator?: ShadowGenerator | null
  ): Promise<{
    rootNode: TransformNode;
    facingNode: TransformNode;
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

    const rootNode = new TransformNode(`${instancePrefix}_${charDef.id}_root`, scene);
    rootNode.metadata = {
      characterId: charDef.id,
      heightScale: charDef.visuals.proportions.heightScale * (manifest.scale / 1.02),
    };

    const facingNode = new TransformNode(`${instancePrefix}_${charDef.id}_facing`, scene);
    facingNode.parent = rootNode;

    const importedBones: Record<string, TransformNode> = {};
    let importedMeshes: Mesh[] = [];
    let importedAnimGroups: AnimationGroup[] = [];
    let glbLoaded = false;
    let loadedFromPath: string | null = null;

    for (const candidatePath of attemptedPaths) {
      try {
        const lastSlash = candidatePath.lastIndexOf('/');
        const rootUrl = candidatePath.substring(0, lastSlash + 1);
        const sceneFilename = candidatePath.substring(lastSlash + 1);

        const result = await SceneLoader.ImportMeshAsync('', rootUrl, sceneFilename, scene);
        if (result.meshes && result.meshes.length > 0) {
          glbLoaded = true;
          loadedFromPath = candidatePath;
          importedMeshes = result.meshes.filter((m): m is Mesh => m instanceof Mesh);
          importedAnimGroups = result.animationGroups || [];

          for (const tn of result.transformNodes) {
            if (tn.name) {
              importedBones[tn.name] = tn;
            }
          }
          break;
        }
      } catch {
        // Try next candidate path
      }
    }

    if (!glbLoaded) {
      emitOnceWarning(
        `[CharacterAssetLoader] Could not load GLB for "${charDef.id}" from [${attemptedPaths.join(
          ', '
        )}]. Using temporary placeholder rig.`,
        warnings
      );
    }

    // Resolve canonical humanoid bones via alias mapping
    const resolvedBoneMap: Record<string, TransformNode> = {};
    const resolvedBones: string[] = [];
    const missingBones: string[] = [];

    for (const reqBone of REQUIRED_HUMANOID_BONES) {
      const found = resolveAliasedBoneNode(charDef.id, reqBone, importedBones);
      if (found) {
        resolvedBoneMap[reqBone] = found;
        resolvedBones.push(reqBone);
      } else {
        missingBones.push(reqBone);
      }
    }

    // Determine whether this is a real production GLB or a temporary placeholder rig
    const hasSkinnedProductionMesh = importedMeshes.some(
      (m) => m.skeleton !== null && m.getTotalVertices() > 100
    );
    const useProductionGLBMeshes =
      glbLoaded && (!manifest.isTemporaryPlaceholder || hasSkinnedProductionMesh);

    if (!useProductionGLBMeshes) {
      emitOnceWarning(
        `[CharacterAssetLoader] Character "${charDef.id}" (${manifest.displayName}) is running with temporary placeholder 3D geometry (isTemporaryPlaceholder=${manifest.isTemporaryPlaceholder}). Drop a production rigged GLB at "${manifest.modelPath}" and set isTemporaryPlaceholder=false to switch to final character meshes.`,
        warnings
      );

      // Hide proxy stub meshes from the temporary GLB so only the articulated placeholder rig is visible
      for (const m of importedMeshes) {
        if (m.parent === null) {
          m.parent = facingNode;
        }
        m.isVisible = false;
      }

      const placeholder = buildTemporaryPlaceholderHumanoidRig(
        scene,
        charDef,
        manifest,
        instancePrefix,
        facingNode,
        resolvedBoneMap,
        shadowGenerator
      );

      const glbAnimationController =
        importedAnimGroups.length > 0
          ? CharacterAssetLoader.createAnimationGroupController(
              charDef.id,
              importedAnimGroups,
              warnings
            )
          : null;

      const availableAnimationClips = importedAnimGroups.map((a) => a.name);
      const missingStandardClips = ALL_STANDARD_ANIMATION_CLIP_IDS.filter((clipId) => {
        const res = resolveCharacterAnimationClip(
          charDef.id,
          clipId,
          availableAnimationClips
        );
        return res.usedFallback && availableAnimationClips.length > 0;
      });

      const diagnostics: CharacterAssetLoadDiagnostics = {
        characterId: charDef.id,
        attemptedPaths,
        loadedFromPath,
        usedTemporaryPlaceholder: true,
        hasEmbeddedAnimations: importedAnimGroups.length > 0,
        availableAnimationClips,
        missingStandardClips,
        resolvedBones: Object.keys(placeholder.bones),
        missingBones: [],
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
            mesh.material = isJoint ? placeholder.grayboxJointMat : placeholder.grayboxBodyMat;
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
        bones: placeholder.bones,
        sockets: placeholder.sockets,
        meshes: placeholder.meshes,
        glbLoaded,
        isPlaceholderAsset: true,
        glbAnimationController,
        diagnostics,
        setRenderMode,
        setLODLevel,
        dispose: () => {
          glbAnimationController?.stopAll();
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

    // PRODUCTION GLB PATH: Preserve and render actual imported GLB meshes, materials, and skeleton!
    for (const m of importedMeshes) {
      if (m.parent === null) {
        m.parent = facingNode;
      }
      m.isVisible = m.getTotalVertices() > 0;
      m.receiveShadows = true;
      if (shadowGenerator && m.getTotalVertices() > 0) {
        shadowGenerator.addShadowCaster(m);
      }
    }

    facingNode.scaling.setAll(manifest.scale);
    facingNode.position.y = manifest.groundOffset;

    if (missingBones.length > 0) {
      emitOnceWarning(
        `[CharacterAssetLoader] Production GLB for "${charDef.id}" is missing humanoid bones: ${missingBones.join(
          ', '
        )}`,
        warnings
      );
    }

    const fallbackNode = resolvedBoneMap.Root || facingNode;
    const sockets: Record<BoneAttachmentName, TransformNode> = {
      Head: resolvedBoneMap.Head || fallbackNode,
      Chest: resolvedBoneMap.Chest || fallbackNode,
      RightHand: resolvedBoneMap.RightHand || fallbackNode,
      LeftHand: resolvedBoneMap.LeftHand || fallbackNode,
      RightFoot: resolvedBoneMap.RightFoot || fallbackNode,
      LeftFoot: resolvedBoneMap.LeftFoot || fallbackNode,
      Hips: resolvedBoneMap.Hips || fallbackNode,
      Projectile: resolvedBoneMap.Chest || fallbackNode,
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
        (msg) => emitOnceWarning(msg, warnings)
      );
      return res.usedFallback;
    });

    const diagnostics: CharacterAssetLoadDiagnostics = {
      characterId: charDef.id,
      attemptedPaths,
      loadedFromPath,
      usedTemporaryPlaceholder: false,
      hasEmbeddedAnimations: importedAnimGroups.length > 0,
      availableAnimationClips,
      missingStandardClips,
      resolvedBones,
      missingBones,
      warnings,
    };

    return {
      rootNode,
      facingNode,
      bones: { ...importedBones, ...resolvedBoneMap },
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
        rootNode.dispose();
      },
    };
  }
}
