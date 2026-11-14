import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Generates valid binary glTF 2.0 (.glb) humanoid placeholder assets and manifest.json
 * for the active Filmi Dangal 3D 4-fighter roster:
 * - action_sultan (Bhai Jaan — Salman Khan-inspired)
 * - romance_raja  (Romance Raja — Shah Rukh Khan-inspired)
 * - duggu         (Duggu — Hrithik Roshan-inspired)
 * - bhidu         (Bhidu — Jackie Shroff-inspired)
 *
 * SAFETY & HONESTY RULES (Section 11):
 * - Explicitly marks generated geometry as `isPlaceholder: true` and `productionStatus: 'PLACEHOLDER'`
 *   unless real skinned mesh geometry (`skins`, `JOINTS_0`, `WEIGHTS_0`) is present.
 * - Refuses to overwrite any existing non-placeholder production GLB file on disk unless
 *   `--force-overwrite-production` is explicitly passed on the command line.
 * - Never recreates obsolete `dance-dynamo` or `villain-saab` directories.
 */

interface CharacterAssetSpec {
  folder: 'action-sultan' | 'romance-raja' | 'duggu' | 'bhidu';
  id: 'action_sultan' | 'romance_raja' | 'duggu' | 'bhidu';
  name: string;
  inspiration: string;
  primaryHex: [number, number, number];
  secondaryHex: [number, number, number];
  skinHex: [number, number, number];
  hairHex: [number, number, number];
  accentHex: [number, number, number];
  heightScale: number;
  shoulderWidth: number;
  torsoBulk: number;
  legLength: number;
  jawWidth: number;
  superShotAnimName: string;
  superMoveAnimName: string;
  superShotName: string;
  superMoveName: string;
}

export const ACTIVE_CHARACTER_SPECS: readonly CharacterAssetSpec[] = [
  {
    folder: 'action-sultan',
    id: 'action_sultan',
    name: 'BHAI JAAN',
    inspiration: 'Salman Khan-inspired (Configurable Parody Persona)',
    primaryHex: [0.29, 0.18, 0.12], // Brown Distressed Leather Jacket
    secondaryHex: [0.12, 0.16, 0.23], // Black Crew-Neck T-Shirt & Dark Wash Denim
    skinHex: [0.85, 0.61, 0.45],
    hairHex: [0.12, 0.11, 0.09],
    accentHex: [0.08, 0.72, 0.65], // Turquoise Silver Bracelet
    heightScale: 1.04,
    shoulderWidth: 0.56,
    torsoBulk: 0.39,
    legLength: 0.92,
    jawWidth: 0.22,
    superShotAnimName: 'Anim_AS_SuperShot_BlackbuckGunshot',
    superMoveAnimName: 'Anim_AS_SuperMove_SultanBreaker',
    superShotName: 'BLACKBUCK GUNSHOT',
    superMoveName: 'SULTAN BREAKER',
  },
  {
    folder: 'romance-raja',
    id: 'romance_raja',
    name: 'ROMANCE RAJA',
    inspiration: 'Shah Rukh Khan-inspired (Configurable Parody Persona)',
    primaryHex: [0.75, 0.07, 0.24], // Velvet Crimson Blazer
    secondaryHex: [0.98, 0.75, 0.14], // Gold-Embroidered Lapels & Scarf
    skinHex: [0.87, 0.67, 0.51],
    hairHex: [0.11, 0.1, 0.09],
    accentHex: [0.96, 0.25, 0.37],
    heightScale: 1.0,
    shoulderWidth: 0.47,
    torsoBulk: 0.31,
    legLength: 0.94,
    jawWidth: 0.19,
    superShotAnimName: 'Anim_RR_SuperShot_OpenArmsPose',
    superMoveAnimName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
    superShotName: 'ICONIC OPEN-ARMS POSE',
    superMoveName: "MONARCH'S GRAND GESTURE",
  },
  {
    folder: 'duggu',
    id: 'duggu',
    name: 'DUGGU',
    inspiration: 'Hrithik Roshan-inspired (Configurable Parody Persona)',
    primaryHex: [0.01, 0.52, 0.78], // Metallic Cyan Performance Jacket
    secondaryHex: [0.13, 0.77, 0.37], // Emerald Groove Trim
    skinHex: [0.88, 0.67, 0.52],
    hairHex: [0.25, 0.15, 0.12],
    accentHex: [0.22, 0.74, 0.97],
    heightScale: 1.02,
    shoulderWidth: 0.51,
    torsoBulk: 0.3,
    legLength: 0.96,
    jawWidth: 0.195,
    superShotAnimName: 'Anim_DG_SuperShot_KahoNaaDanceWave',
    superMoveAnimName: 'Anim_DG_SuperMove_RhythmOverdrive',
    superShotName: 'KAHO NAA DANCE WAVE',
    superMoveName: 'RHYTHM OVERDRIVE',
  },
  {
    folder: 'bhidu',
    id: 'bhidu',
    name: 'BHIDU',
    inspiration: 'Jackie Shroff-inspired (Configurable Parody Persona)',
    primaryHex: [0.35, 0.11, 0.53], // Street-Hero Jacket
    secondaryHex: [0.86, 0.15, 0.15], // Signature Red Bandana
    skinHex: [0.78, 0.54, 0.4],
    hairHex: [0.09, 0.09, 0.11],
    accentHex: [0.96, 0.62, 0.04], // Heavy Gold Chain
    heightScale: 1.07,
    shoulderWidth: 0.59,
    torsoBulk: 0.42,
    legLength: 0.95,
    jawWidth: 0.235,
    superShotAnimName: 'Anim_BH_SuperShot_BhiduSwaggerWalk',
    superMoveAnimName: 'Anim_BH_SuperMove_BlackoutVerdict',
    superShotName: 'BHIDU SWAGGER SHOCKWAVE',
    superMoveName: 'BLACKOUT VERDICT',
  },
] as const;

function createUnitBoxGeometry(): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
} {
  const positions = new Float32Array([
    // Front
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    // Top
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    // Bottom
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // Right
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    // Left
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  ]);

  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  return { positions, normals, indices };
}

export function buildPlaceholderGLBForCharacter(spec: CharacterAssetSpec): {
  glb: Buffer;
  documentedAnimations: string[];
  boneNames: string[];
  lodNames: string[];
} {
  const { positions, normals, indices } = createUnitBoxGeometry();

  const animTimes = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0]);
  const animRotations = new Float32Array([
    0, 0, 0, 1,
    0.08, 0.04, 0, 0.996,
    0, 0, 0, 1,
    -0.08, -0.04, 0, 0.996,
    0, 0, 0, 1,
  ]);

  const posBuf = Buffer.from(positions.buffer);
  const normBuf = Buffer.from(normals.buffer);
  const idxBuf = Buffer.from(indices.buffer);
  const timeBuf = Buffer.from(animTimes.buffer);
  const rotBuf = Buffer.from(animRotations.buffer);

  const totalUnpadded =
    posBuf.length + normBuf.length + idxBuf.length + timeBuf.length + rotBuf.length;
  const paddedBinLength = Math.ceil(totalUnpadded / 4) * 4;
  const binChunkData = Buffer.alloc(paddedBinLength);

  let offset = 0;
  posBuf.copy(binChunkData, offset);
  const posByteOffset = offset;
  offset += posBuf.length;

  normBuf.copy(binChunkData, offset);
  const normByteOffset = offset;
  offset += normBuf.length;

  idxBuf.copy(binChunkData, offset);
  const idxByteOffset = offset;
  offset += idxBuf.length;

  timeBuf.copy(binChunkData, offset);
  const timeByteOffset = offset;
  offset += timeBuf.length;

  rotBuf.copy(binChunkData, offset);
  const rotByteOffset = offset;
  offset += rotBuf.length;

  const p = spec;

  const documentedAnimations = [
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
    spec.superShotAnimName,
    spec.superMoveAnimName,
  ];

  const nodes = [
    {
      name: 'Root',
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, p.heightScale, 1],
      children: [1, 26, 27, 28],
    },
    {
      name: 'Hips',
      translation: [0, 0.95 * p.legLength, 0],
      children: [2, 20, 23],
      mesh: 0,
    },
    {
      name: 'Spine',
      translation: [0, 0.16, 0],
      children: [3],
      mesh: 1,
    },
    {
      name: 'Chest',
      translation: [0, 0.2, 0],
      children: [4, 12, 16],
      mesh: 1,
    },
    {
      name: 'Neck',
      translation: [0, 0.21, 0],
      children: [5],
      mesh: 2,
    },
    {
      name: 'Head',
      translation: [0, 0.08, 0],
      children: [6, 7, 8, 9, 10, 11],
      mesh: 2,
    },
    {
      name: 'Hair',
      translation: [0, 0.14, 0],
      mesh: 3,
    },
    {
      name: 'Jaw',
      translation: [0, 0.02, 0.04],
      mesh: 2,
    },
    {
      name: 'LeftBrow',
      translation: [-0.045, 0.14, 0.11],
      mesh: 3,
    },
    {
      name: 'RightBrow',
      translation: [0.045, 0.14, 0.11],
      mesh: 3,
    },
    {
      name: 'LeftEyelid',
      translation: [-0.045, 0.11, 0.11],
      mesh: 2,
    },
    {
      name: 'RightEyelid',
      translation: [0.045, 0.11, 0.11],
      mesh: 2,
    },
    {
      name: 'LeftShoulder',
      translation: [-p.shoulderWidth * 0.5, 0.15, 0],
      children: [13],
      mesh: 1,
    },
    {
      name: 'LeftUpperArm',
      translation: [-0.05, -0.12, 0],
      children: [14],
      mesh: 2,
    },
    {
      name: 'LeftForeArm',
      translation: [0, -0.25, 0],
      children: [15],
      mesh: 2,
    },
    {
      name: 'LeftHand',
      translation: [0, -0.22, 0],
      mesh: 4,
    },
    {
      name: 'RightShoulder',
      translation: [p.shoulderWidth * 0.5, 0.15, 0],
      children: [17],
      mesh: 1,
    },
    {
      name: 'RightUpperArm',
      translation: [0.05, -0.12, 0],
      children: [18],
      mesh: 2,
    },
    {
      name: 'RightForeArm',
      translation: [0, -0.25, 0],
      children: [19],
      mesh: 2,
    },
    {
      name: 'RightHand',
      translation: [0, -0.22, 0],
      mesh: 4,
    },
    {
      name: 'LeftUpLeg',
      translation: [-0.12, -0.08, 0],
      children: [21],
      mesh: 0,
    },
    {
      name: 'LeftLeg',
      translation: [0, -0.42 * p.legLength, 0],
      children: [22],
      mesh: 0,
    },
    {
      name: 'LeftFoot',
      translation: [0, -0.4 * p.legLength, 0.05],
      mesh: 3,
    },
    {
      name: 'RightUpLeg',
      translation: [0.12, -0.08, 0],
      children: [24],
      mesh: 0,
    },
    {
      name: 'RightLeg',
      translation: [0, -0.42 * p.legLength, 0],
      children: [25],
      mesh: 0,
    },
    {
      name: 'RightFoot',
      translation: [0, -0.4 * p.legLength, 0.05],
      mesh: 3,
    },
    {
      name: 'LOD0_High',
      translation: [0, 0, 0],
      mesh: 1,
    },
    {
      name: 'LOD1_Medium',
      translation: [0, 0, 0],
      mesh: 1,
    },
    {
      name: 'LOD2_Low',
      translation: [0, 0, 0],
      mesh: 1,
    },
  ];

  const gltfAnimations = documentedAnimations.map((clipName, idx) => ({
    name: clipName,
    channels: [
      {
        sampler: 0,
        target: {
          node: (idx % 5) + 1,
          path: 'rotation',
        },
      },
    ],
    samplers: [
      {
        input: 3,
        interpolation: 'LINEAR',
        output: 4,
      },
    ],
  }));

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'FilmiDangal-3D-PlaceholderAssetGenerator-v2.1',
      copyright: 'Filmi Dangal Parody Fighter Rig (Temporary Placeholder GLB)',
      extras: {
        characterId: spec.id,
        characterName: spec.name,
        isPlaceholder: true,
        productionStatus: 'PLACEHOLDER',
        placeholderNotice:
          'Temporary unskinned box-primitive placeholder GLB. Replace with a production skinned GLB containing glTF skins, JOINTS_0, and WEIGHTS_0.',
        groundOriginVerified: true,
        forwardAxis: '+Z',
        lodLevels: ['LOD0_High', 'LOD1_Medium', 'LOD2_Low'],
        facialExpressionRig: ['Jaw', 'LeftBrow', 'RightBrow', 'LeftEyelid', 'RightEyelid'],
        documentedAnimations,
      },
    },
    scene: 0,
    scenes: [
      {
        name: `${spec.id}_root_scene`,
        nodes: [0],
      },
    ],
    nodes,
    materials: [
      {
        name: `${spec.id}_Pants_PBR`,
        pbrMetallicRoughness: {
          baseColorFactor: [...spec.primaryHex.map((v) => v * 0.35), 1.0],
          metallicFactor: 0.15,
          roughnessFactor: 0.65,
        },
      },
      {
        name: `${spec.id}_Costume_Primary_PBR`,
        pbrMetallicRoughness: {
          baseColorFactor: [...spec.primaryHex, 1.0],
          metallicFactor: 0.25,
          roughnessFactor: 0.4,
        },
      },
      {
        name: `${spec.id}_Skin_Subsurface_PBR`,
        pbrMetallicRoughness: {
          baseColorFactor: [...spec.skinHex, 1.0],
          metallicFactor: 0.04,
          roughnessFactor: 0.45,
        },
      },
      {
        name: `${spec.id}_Hair_And_Boots_PBR`,
        pbrMetallicRoughness: {
          baseColorFactor: [...spec.hairHex, 1.0],
          metallicFactor: 0.1,
          roughnessFactor: 0.55,
        },
      },
      {
        name: `${spec.id}_Signature_Accessory_PBR`,
        pbrMetallicRoughness: {
          baseColorFactor: [...spec.accentHex, 1.0],
          metallicFactor: 0.8,
          roughnessFactor: 0.2,
        },
      },
    ],
    meshes: [0, 1, 2, 3, 4].map((matIdx) => ({
      name: `${spec.id}_mesh_${matIdx}`,
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
          },
          indices: 2,
          material: matIdx,
        },
      ],
    })),
    animations: gltfAnimations,
    buffers: [
      {
        byteLength: paddedBinLength,
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: posByteOffset,
        byteLength: posBuf.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: normByteOffset,
        byteLength: normBuf.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: idxByteOffset,
        byteLength: idxBuf.length,
        target: 34963,
      },
      {
        buffer: 0,
        byteOffset: timeByteOffset,
        byteLength: timeBuf.length,
      },
      {
        buffer: 0,
        byteOffset: rotByteOffset,
        byteLength: rotBuf.length,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123,
        count: 36,
        type: 'SCALAR',
      },
      {
        bufferView: 3,
        byteOffset: 0,
        componentType: 5126,
        count: 5,
        type: 'SCALAR',
        min: [0.0],
        max: [1.0],
      },
      {
        bufferView: 4,
        byteOffset: 0,
        componentType: 5126,
        count: 5,
        type: 'VEC4',
      },
    ],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBufUnpadded = Buffer.from(jsonStr, 'utf8');
  const paddedJsonLen = Math.ceil(jsonBufUnpadded.length / 4) * 4;
  const jsonChunkData = Buffer.alloc(paddedJsonLen, 0x20);
  jsonBufUnpadded.copy(jsonChunkData, 0);

  const totalLength = 12 + 8 + paddedJsonLen + 8 + paddedBinLength;
  const glb = Buffer.alloc(totalLength);

  // Header
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4); // version 2
  glb.writeUInt32LE(totalLength, 8);

  // JSON chunk
  glb.writeUInt32LE(paddedJsonLen, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonChunkData.copy(glb, 20);

  // BIN chunk
  const binChunkOffset = 20 + paddedJsonLen;
  glb.writeUInt32LE(paddedBinLength, binChunkOffset);
  glb.writeUInt32LE(0x004e4942, binChunkOffset + 4); // 'BIN\0'
  binChunkData.copy(glb, binChunkOffset + 8);

  return {
    glb,
    documentedAnimations,
    boneNames: nodes.slice(0, 26).map((n) => n.name),
    lodNames: ['LOD0_High', 'LOD1_Medium', 'LOD2_Low'],
  };
}

/**
 * Checks whether an existing GLB file on disk is a real skinned production model
 * so that running the placeholder generator never overwrites a real character asset.
 */
function isExistingProductionGLB(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.byteLength < 20) return false;
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    if (magic !== 0x46546c67 || version !== 2) return false;
    const jsonLen = buf.readUInt32LE(12);
    const jsonChunkType = buf.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) return false;
    const jsonText = buf.subarray(20, 20 + jsonLen).toString('utf8').trim();
    const gltf = JSON.parse(jsonText);
    if (gltf.asset?.extras?.isPlaceholder === true) {
      return false;
    }
    const hasSkins = Array.isArray(gltf.skins) && gltf.skins.length > 0;
    const hasSkinnedPrimitive =
      Array.isArray(gltf.meshes) &&
      gltf.meshes.some(
        (m: { primitives?: Array<{ attributes?: Record<string, number> }> }) =>
          Array.isArray(m.primitives) &&
          m.primitives.some(
            (prim) =>
              prim.attributes &&
              typeof prim.attributes.JOINTS_0 === 'number' &&
              typeof prim.attributes.WEIGHTS_0 === 'number'
          )
      );
    return hasSkins && hasSkinnedPrimitive;
  } catch {
    return false;
  }
}

export function generatePlaceholderAssetsOnDisk(forceOverwriteProduction = false): void {
  const outRoot = path.resolve(process.cwd(), 'public/assets/characters');
  for (const spec of ACTIVE_CHARACTER_SPECS) {
    const dir = path.join(outRoot, spec.folder);
    fs.mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, 'model.glb');

    if (!forceOverwriteProduction && isExistingProductionGLB(outFile)) {
      console.log(
        `[build-glb-assets] Skipping ${outFile}: detected existing skinned production GLB asset.`
      );
      continue;
    }

    const { glb, documentedAnimations, boneNames, lodNames } =
      buildPlaceholderGLBForCharacter(spec);
    fs.writeFileSync(outFile, glb);

    const manifest = {
      characterId: spec.id,
      characterName: spec.name,
      inspiration: spec.inspiration,
      isPlaceholder: true,
      productionStatus: 'PLACEHOLDER',
      format: 'glTF 2.0 Binary (.glb)',
      modelFile: `/assets/characters/${spec.folder}/model.glb`,
      groundOrigin: [0, 0, 0],
      forwardOrientation: '+Z',
      skeletonStandard: 'FilmiDangal_SharedHumanoid_26',
      bones: boneNames,
      facialRigNodes: ['Jaw', 'LeftBrow', 'RightBrow', 'LeftEyelid', 'RightEyelid'],
      lodLevels: lodNames,
      materials: [
        `${spec.id}_Pants_PBR`,
        `${spec.id}_Costume_Primary_PBR`,
        `${spec.id}_Skin_Subsurface_PBR`,
        `${spec.id}_Hair_And_Boots_PBR`,
        `${spec.id}_Signature_Accessory_PBR`,
      ],
      specialAttacks: {
        superShot: {
          name: spec.superShotName,
          animationClip: spec.superShotAnimName,
        },
        superMove: {
          name: spec.superMoveName,
          animationClip: spec.superMoveAnimName,
        },
      },
      documentedAnimations,
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(
      `Generated placeholder ${outFile} (${glb.length} bytes) [PLACEHOLDER] with ${documentedAnimations.length} clips & ${lodNames.length} LOD nodes`
    );
  }
}

const isMainExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].endsWith('build-glb-assets.ts');

if (isMainExecution) {
  const force = process.argv.includes('--force-overwrite-production');
  generatePlaceholderAssetsOnDisk(force);
}
