import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateAllBhaiJaanTextures } from './bhaiJaanTextures';
import {
  buildBhaiJaanGeometry,
  buildMixamoSkeleton65,
  INV_SCALE,
  qMul,
  qRotVec,
  Quat,
  SkinnedSubMesh,
  Vec3,
  vScale,
  vSub,
} from './bhaiJaanGeometry';

/**
 * Packs Bhai Jaan's 65-bone Mixamo T-pose skeleton, 7 sculpted anatomical/garment
 * submeshes, 28 lossless PBR textures (Albedo, Normal, MetallicRoughness, AO),
 * and static bind-pose 'mixamo_com' clip into a compliant glTF 2.0 binary (.glb).
 */

function qNorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function qConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatToMat3(q: Quat): number[] {
  const [x, y, z, w] = qNorm(q);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  // Column-major 3x3
  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    xz + wy,
    yz - wx,
    1 - (xx + yy),
  ];
}

function inverseBindMatrix4ColMajor(pos: Vec3, quat: Quat): number[] {
  const m = quatToMat3(quat);
  // Transpose of orthogonal R:
  const r00 = m[0],
    r01 = m[1],
    r02 = m[2];
  const r10 = m[3],
    r11 = m[4],
    r12 = m[5];
  const r20 = m[6],
    r21 = m[7],
    r22 = m[8];

  const px = pos[0],
    py = pos[1],
    pz = pos[2];
  const tx = -(r00 * px + r01 * py + r02 * pz);
  const ty = -(r10 * px + r11 * py + r12 * pz);
  const tz = -(r20 * px + r21 * py + r22 * pz);

  return [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, tx, ty, tz, 1];
}

class BinaryBuilder {
  private chunks: Buffer[] = [];
  private offset = 0;

  append(buf: Buffer, align = 4): { byteOffset: number; byteLength: number } {
    const pad = (align - (this.offset % align)) % align;
    if (pad > 0) {
      this.chunks.push(Buffer.alloc(pad));
      this.offset += pad;
    }
    const byteOffset = this.offset;
    this.chunks.push(buf);
    this.offset += buf.length;
    return { byteOffset, byteLength: buf.length };
  }

  toBuffer(): Buffer {
    const pad = (4 - (this.offset % 4)) % 4;
    if (pad > 0) {
      this.chunks.push(Buffer.alloc(pad));
      this.offset += pad;
    }
    return Buffer.concat(this.chunks, this.offset);
  }
}

function floatsToBuffer(arr: number[]): Buffer {
  return Buffer.from(new Float32Array(arr).buffer);
}

function u16ToBuffer(arr: number[]): Buffer {
  return Buffer.from(new Uint16Array(arr).buffer);
}

function u8ToBuffer(arr: number[]): Buffer {
  return Buffer.from(new Uint8Array(arr).buffer);
}

function main() {
  const bones = buildMixamoSkeleton65();
  const subMeshes: SkinnedSubMesh[] = buildBhaiJaanGeometry(bones);
  const textureBundles = generateAllBhaiJaanTextures();

  const bin = new BinaryBuilder();
  const bufferViews: Array<{
    buffer: number;
    byteOffset: number;
    byteLength: number;
    target?: number;
  }> = [];
  const accessors: Array<Record<string, unknown>> = [];

  const addView = (buf: Buffer, target?: number): number => {
    const { byteOffset, byteLength } = bin.append(buf, 4);
    const idx = bufferViews.length;
    const view: { buffer: number; byteOffset: number; byteLength: number; target?: number } = {
      buffer: 0,
      byteOffset,
      byteLength,
    };
    if (target !== undefined) view.target = target;
    bufferViews.push(view);
    return idx;
  };

  const addAccessor = (
    bufferView: number,
    componentType: number,
    count: number,
    type: string,
    extra: Record<string, unknown> = {}
  ): number => {
    const idx = accessors.length;
    accessors.push({
      bufferView,
      byteOffset: 0,
      componentType,
      count,
      type,
      ...extra,
    });
    return idx;
  };

  // 1. Pack 7 x 4 = 28 PNG Images + Textures
  const images: Array<{ bufferView: number; mimeType: string; name: string }> = [];
  const textures: Array<{ sampler: number; source: number; name: string }> = [];
  const matNames = [
    'BhaiJaan_Skin_PBR',
    'BhaiJaan_Hair_PBR',
    'BhaiJaan_LeatherJacket_PBR',
    'BhaiJaan_BlackTShirt_PBR',
    'BhaiJaan_DenimJeans_PBR',
    'BhaiJaan_CombatBoots_PBR',
    'BhaiJaan_MetalTrim_PBR',
  ];

  const mapIndices: Array<{ albedo: number; normal: number; mr: number; ao: number }> = [];
  for (let i = 0; i < textureBundles.length; i++) {
    const bundle = textureBundles[i];
    const baseName = matNames[i];

    const pushTex = (png: Buffer, suffix: string): number => {
      const bv = addView(png);
      const imgIdx = images.length;
      images.push({ bufferView: bv, mimeType: 'image/png', name: `${baseName}_${suffix}` });
      const texIdx = textures.length;
      textures.push({ sampler: 0, source: imgIdx, name: `${baseName}_${suffix}` });
      return texIdx;
    };

    mapIndices.push({
      albedo: pushTex(bundle.albedoPng, 'Albedo'),
      normal: pushTex(bundle.normalPng, 'Normal'),
      mr: pushTex(bundle.mrPng, 'MetallicRoughness'),
      ao: pushTex(bundle.aoPng, 'AO'),
    });
  }

  // 2. Materials
  const materials = matNames.map((name, i) => ({
    name,
    doubleSided: i === 2, // Leather jacket inner lining / lapels stay cleanly visible
    pbrMetallicRoughness: {
      baseColorTexture: { index: mapIndices[i].albedo },
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 1.0,
      roughnessFactor: 1.0,
      metallicRoughnessTexture: { index: mapIndices[i].mr },
    },
    normalTexture: {
      index: mapIndices[i].normal,
      scale: i === 0 ? 0.65 : 0.9,
    },
    occlusionTexture: {
      index: mapIndices[i].ao,
      strength: 0.75,
    },
  }));

  // 3. Meshes & Primitive Attributes
  const gltfMeshes: Array<{ name: string; primitives: Array<Record<string, unknown>> }> = [];
  let totalVerts = 0;
  let totalTris = 0;

  for (const sm of subMeshes) {
    const vCount = sm.positions.length / 3;
    const tCount = sm.indices.length / 3;
    totalVerts += vCount;
    totalTris += tCount;

    if (vCount > 65535) {
      throw new Error(`Submesh ${sm.name} exceeds 65535 vertex limit for UNSIGNED_SHORT (${vCount})`);
    }

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < sm.positions.length; i += 3) {
      const x = sm.positions[i];
      const y = sm.positions[i + 1];
      const z = sm.positions[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const posAcc = addAccessor(addView(floatsToBuffer(sm.positions), 34962), 5126, vCount, 'VEC3', {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
    const normAcc = addAccessor(addView(floatsToBuffer(sm.normals), 34962), 5126, vCount, 'VEC3');
    const uvAcc = addAccessor(addView(floatsToBuffer(sm.uvs), 34962), 5126, vCount, 'VEC2');
    const jntAcc = addAccessor(addView(u8ToBuffer(sm.joints), 34962), 5121, vCount, 'VEC4');
    const wgtAcc = addAccessor(addView(floatsToBuffer(sm.weights), 34962), 5126, vCount, 'VEC4');
    const idxAcc = addAccessor(addView(u16ToBuffer(sm.indices), 34963), 5123, sm.indices.length, 'SCALAR');

    gltfMeshes.push({
      name: sm.name,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            TEXCOORD_0: uvAcc,
            JOINTS_0: jntAcc,
            WEIGHTS_0: wgtAcc,
          },
          indices: idxAcc,
          material: sm.materialIndex,
          mode: 4,
        },
      ],
    });
  }

  // 4. Skeleton Hierarchy & Inverse Bind Matrices (scaled by INV_SCALE to match local mesh space)
  const scaledWorldPos: Vec3[] = bones.map((b) => vScale(b.worldPos, INV_SCALE));
  const worldQuats: Quat[] = bones.map((b) => qNorm(b.worldQuat));
  const ibmFloats: number[] = [];
  for (let i = 0; i < bones.length; i++) {
    ibmFloats.push(...inverseBindMatrix4ColMajor(scaledWorldPos[i], worldQuats[i]));
  }
  const ibmAcc = addAccessor(addView(floatsToBuffer(ibmFloats)), 5126, bones.length, 'MAT4');

  // Node layout:
  // 0: Armature (children: [1 (mixamorig:Hips), 66..72 (7 skinned meshes)])
  // 1..65: Bone nodes
  // 66..72: Mesh nodes
  const boneNodeStart = 1;
  const meshNodeStart = boneNodeStart + bones.length;
  const boneChildren: number[][] = bones.map(() => []);
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i].parent;
    if (p >= 0) boneChildren[p].push(boneNodeStart + i);
  }

  const nodes: Array<Record<string, unknown>> = [];
  const meshNodeIndices = subMeshes.map((_, idx) => meshNodeStart + idx);
  nodes.push({
    name: 'Armature',
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    children: [boneNodeStart, ...meshNodeIndices],
  });

  const localBoneQuats: Quat[] = [];
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i].parent;
    let lPos: Vec3;
    let lRot: Quat;
    if (p < 0) {
      lPos = scaledWorldPos[i];
      lRot = worldQuats[i];
    } else {
      const pInv = qConj(worldQuats[p]);
      const delta = vSub(scaledWorldPos[i], scaledWorldPos[p]);
      lPos = qRotVec(pInv, delta);
      lRot = qNorm(qMul(pInv, worldQuats[i]));
    }
    localBoneQuats.push(lRot);
    const nodeObj: Record<string, unknown> = {
      name: bones[i].name,
      translation: [lPos[0], lPos[1], lPos[2]],
      rotation: [lRot[0], lRot[1], lRot[2], lRot[3]],
      scale: [1, 1, 1],
    };
    if (boneChildren[i].length > 0) nodeObj.children = boneChildren[i];
    nodes.push(nodeObj);
  }

  for (let m = 0; m < subMeshes.length; m++) {
    nodes.push({
      name: subMeshes[m].name,
      mesh: m,
      skin: 0,
    });
  }

  const jointNodeIndices = bones.map((_, i) => boneNodeStart + i);
  const skins = [
    {
      name: 'Armature',
      skeleton: boneNodeStart,
      inverseBindMatrices: ibmAcc,
      joints: jointNodeIndices,
    },
  ];

  // 5. Static Bind-Pose Animation Clip ('mixamo_com') with 2 identical keyframes
  const animTimeAcc = addAccessor(addView(floatsToBuffer([0.0, 1.0 / 30.0])), 5126, 2, 'SCALAR', {
    min: [0.0],
    max: [1.0 / 30.0],
  });
  const animChannels: Array<{ sampler: number; target: { node: number; path: string } }> = [];
  const animSamplers: Array<{ input: number; interpolation: string; output: number }> = [];

  for (let i = 0; i < bones.length; i++) {
    const q = localBoneQuats[i];
    const outAcc = addAccessor(addView(floatsToBuffer([...q, ...q])), 5126, 2, 'VEC4');
    const samplerIdx = animSamplers.length;
    animSamplers.push({
      input: animTimeAcc,
      interpolation: 'LINEAR',
      output: outAcc,
    });
    animChannels.push({
      sampler: samplerIdx,
      target: {
        node: boneNodeStart + i,
        path: 'rotation',
      },
    });
  }

  const animations = [
    {
      name: 'mixamo_com',
      channels: animChannels,
      samplers: animSamplers,
    },
  ];

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'FightFun Bhai Jaan Character Pipeline v4.0 (T-Pose Mixamo-65 PBR)',
      extras: {
        characterId: 'action_sultan',
        displayName: 'Bhai Jaan',
        isPlaceholder: false,
        productionStatus: 'PRODUCTION_SKINNED',
      },
    },
    scene: 0,
    scenes: [
      {
        name: 'BhaiJaan_T_Pose',
        nodes: [0],
      },
    ],
    nodes,
    meshes: gltfMeshes,
    skins,
    materials,
    textures,
    images,
    samplers: [
      {
        magFilter: 9729,
        minFilter: 9987,
        wrapS: 10497,
        wrapT: 10497,
      },
    ],
    animations,
    buffers: [
      {
        byteLength: 0, // updated below
      },
    ],
    bufferViews,
    accessors,
  };

  const binBuf = bin.toBuffer();
  gltfJson.buffers[0].byteLength = binBuf.length;

  let jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  }

  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const glb = Buffer.allocUnsafe(totalLen);
  let ptr = 0;

  // GLB Header
  glb.writeUInt32LE(0x46546c67, ptr); // 'glTF'
  ptr += 4;
  glb.writeUInt32LE(2, ptr);
  ptr += 4;
  glb.writeUInt32LE(totalLen, ptr);
  ptr += 4;

  // JSON Chunk
  glb.writeUInt32LE(jsonBuf.length, ptr);
  ptr += 4;
  glb.writeUInt32LE(0x4e4f534a, ptr); // 'JSON'
  ptr += 4;
  jsonBuf.copy(glb, ptr);
  ptr += jsonBuf.length;

  // BIN Chunk
  glb.writeUInt32LE(binBuf.length, ptr);
  ptr += 4;
  glb.writeUInt32LE(0x004e4942, ptr); // 'BIN\0'
  ptr += 4;
  binBuf.copy(glb, ptr);

  const outPath = path.resolve(process.cwd(), 'public/assets/characters/action-sultan/model.glb');
  fs.writeFileSync(outPath, glb);

  console.log(
    JSON.stringify(
      {
        outPath,
        glbBytes: glb.length,
        subMeshes: subMeshes.length,
        totalVertices: totalVerts,
        totalTriangles: totalTris,
        joints: bones.length,
        materials: materials.length,
        textures: textures.length,
        animations: animations.map((a) => a.name),
      },
      null,
      2
    )
  );
}

main();
