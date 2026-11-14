import { clamp, clamp01, lerp, smoothstep } from './bhaiJaanTextures';

export const GAME_SCALE = 1.94;
export const INV_SCALE = 1.0 / GAME_SCALE;

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function vScale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function vNorm(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len > 1e-8 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 1, 0];
}
export function vCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qRotVec(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function qAxisAngle(axis: Vec3, rad: number): Quat {
  const n = vNorm(axis);
  const h = rad * 0.5;
  const s = Math.sin(h);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(h)];
}

export interface BoneDef {
  name: string;
  parent: number;
  worldPos: Vec3;
  worldQuat: Quat;
}

const Q_LEFT_ARM: Quat = [0.5, 0.5, -0.5, 0.5];
const Q_RIGHT_ARM: Quat = [0.5, -0.5, 0.5, 0.5];
const Q_LEG: Quat = [0, 0, 1, 0];
const Q_FOOT: Quat = qMul(Q_LEG, qAxisAngle([1, 0, 0], 1.01));
const Q_TOE: Quat = qMul(Q_LEG, qAxisAngle([1, 0, 0], 1.54));

export function buildMixamoSkeleton65(): BoneDef[] {
  const bones: BoneDef[] = [];
  const idxMap = new Map<string, number>();

  const add = (
    name: string,
    parentName: string | null,
    wx: number,
    wy: number,
    wz: number,
    worldQuat: Quat
  ): number => {
    const parent = parentName === null ? -1 : idxMap.get(parentName)!;
    const idx = bones.length;
    bones.push({ name, parent, worldPos: [wx, wy, wz], worldQuat });
    idxMap.set(name, idx);
    return idx;
  };

  const Q_ID: Quat = [0, 0, 0, 1];
  add('mixamorig:Hips', null, 0.0, 0.99, 0.0, Q_ID);
  add('mixamorig:Spine', 'mixamorig:Hips', 0.0, 1.1, 0.0, Q_ID);
  add('mixamorig:Spine1', 'mixamorig:Spine', 0.0, 1.24, 0.0, Q_ID);
  add('mixamorig:Spine2', 'mixamorig:Spine1', 0.0, 1.39, 0.0, Q_ID);
  add('mixamorig:Neck', 'mixamorig:Spine2', 0.0, 1.525, 0.005, Q_ID);
  add('mixamorig:Head', 'mixamorig:Neck', 0.0, 1.615, 0.012, Q_ID);
  add('mixamorig:HeadTop_End', 'mixamorig:Head', 0.0, 1.86, 0.01, Q_ID);

  for (const side of ['Left', 'Right'] as const) {
    const s = side === 'Left' ? 1 : -1;
    const qArm = side === 'Left' ? Q_LEFT_ARM : Q_RIGHT_ARM;
    const pCol = `mixamorig:${side}Shoulder`;
    const pArm = `mixamorig:${side}Arm`;
    const pFore = `mixamorig:${side}ForeArm`;
    const pHand = `mixamorig:${side}Hand`;

    add(pCol, 'mixamorig:Spine2', s * 0.065, 1.465, -0.012, qArm);
    add(pArm, pCol, s * 0.215, 1.47, -0.01, qArm);
    add(pFore, pArm, s * 0.495, 1.47, -0.018, qArm);
    add(pHand, pFore, s * 0.745, 1.47, 0.0, qArm);

    const qThumb = qMul(qArm, qAxisAngle([0, 0, 1], -s * 0.65));
    add(`mixamorig:${side}HandThumb1`, pHand, s * 0.772, 1.462, 0.032, qThumb);
    add(`mixamorig:${side}HandThumb2`, `mixamorig:${side}HandThumb1`, s * 0.795, 1.456, 0.052, qThumb);
    add(`mixamorig:${side}HandThumb3`, `mixamorig:${side}HandThumb2`, s * 0.818, 1.451, 0.068, qThumb);
    add(`mixamorig:${side}HandThumb4`, `mixamorig:${side}HandThumb3`, s * 0.838, 1.447, 0.082, qThumb);

    const fingerSpecs: Array<[string, number, number]> = [
      ['Index', 0.032, 0.088],
      ['Middle', 0.011, 0.095],
      ['Ring', -0.01, 0.089],
      ['Pinky', -0.03, 0.074],
    ];
    for (const [fname, zOff, len] of fingerSpecs) {
      const kx = s * 0.835;
      const f1 = len * 0.42;
      const f2 = len * 0.31;
      const f3 = len * 0.27;
      add(`mixamorig:${side}Hand${fname}1`, pHand, kx, 1.468, zOff, qArm);
      add(`mixamorig:${side}Hand${fname}2`, `mixamorig:${side}Hand${fname}1`, kx + s * f1, 1.467, zOff, qArm);
      add(`mixamorig:${side}Hand${fname}3`, `mixamorig:${side}Hand${fname}2`, kx + s * (f1 + f2), 1.466, zOff, qArm);
      add(`mixamorig:${side}Hand${fname}4`, `mixamorig:${side}Hand${fname}3`, kx + s * (f1 + f2 + f3), 1.465, zOff, qArm);
    }
  }

  for (const side of ['Left', 'Right'] as const) {
    const s = side === 'Left' ? 1 : -1;
    add(`mixamorig:${side}UpLeg`, 'mixamorig:Hips', s * 0.098, 0.945, 0.0, Q_LEG);
    add(`mixamorig:${side}Leg`, `mixamorig:${side}UpLeg`, s * 0.102, 0.505, 0.01, Q_LEG);
    add(`mixamorig:${side}Foot`, `mixamorig:${side}Leg`, s * 0.105, 0.095, -0.012, Q_FOOT);
    add(`mixamorig:${side}ToeBase`, `mixamorig:${side}Foot`, s * 0.105, 0.025, 0.102, Q_TOE);
    add(`mixamorig:${side}Toe_End`, `mixamorig:${side}ToeBase`, s * 0.105, 0.022, 0.175, Q_TOE);
  }

  return bones;
}

export interface SkinnedSubMesh {
  name: string;
  materialIndex: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  joints: number[];
  weights: number[];
  indices: number[];
  weldNormals: boolean;
}

function createSubMesh(name: string, materialIndex: number, weldNormals = true): SkinnedSubMesh {
  return {
    name,
    materialIndex,
    positions: [],
    normals: [],
    uvs: [],
    joints: [],
    weights: [],
    indices: [],
    weldNormals,
  };
}

function pushVertex(
  mesh: SkinnedSubMesh,
  wx: number,
  wy: number,
  wz: number,
  u: number,
  v: number,
  bonePairs: Array<[number, number]>
): number {
  const idx = mesh.positions.length / 3;
  mesh.positions.push(wx * INV_SCALE, wy * INV_SCALE, wz * INV_SCALE);
  mesh.normals.push(0, 1, 0);
  mesh.uvs.push(u, v);

  const sorted = [...bonePairs]
    .filter(([, w]) => w > 1e-5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (sorted.length === 0) sorted.push([0, 1]);
  let sum = 0;
  for (const [, w] of sorted) sum += w;
  for (let k = 0; k < 4; k++) {
    if (k < sorted.length) {
      mesh.joints.push(sorted[k][0]);
      mesh.weights.push(sorted[k][1] / sum);
    } else {
      mesh.joints.push(0);
      mesh.weights.push(0);
    }
  }
  return idx;
}

function addTri(mesh: SkinnedSubMesh, a: number, b: number, c: number): void {
  mesh.indices.push(a, b, c);
}

function addQuad(
  mesh: SkinnedSubMesh,
  a: number,
  b: number,
  c: number,
  d: number,
  flip = false
): void {
  if (!flip) mesh.indices.push(a, b, c, a, c, d);
  else mesh.indices.push(a, c, b, a, d, c);
}

function computeSmoothNormals(mesh: SkinnedSubMesh): void {
  const nVerts = mesh.positions.length / 3;
  const accum = new Float32Array(nVerts * 3);
  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i] * 3;
    const ib = idx[i + 1] * 3;
    const ic = idx[i + 2] * 3;
    const ax = pos[ia],
      ay = pos[ia + 1],
      az = pos[ia + 2];
    const e1x = pos[ib] - ax,
      e1y = pos[ib + 1] - ay,
      e1z = pos[ib + 2] - az;
    const e2x = pos[ic] - ax,
      e2y = pos[ic + 1] - ay,
      e2z = pos[ic + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    accum[ia] += nx;
    accum[ia + 1] += ny;
    accum[ia + 2] += nz;
    accum[ib] += nx;
    accum[ib + 1] += ny;
    accum[ib + 2] += nz;
    accum[ic] += nx;
    accum[ic + 1] += ny;
    accum[ic + 2] += nz;
  }

  if (mesh.weldNormals) {
    const map = new Map<string, number[]>();
    for (let v = 0; v < nVerts; v++) {
      const key = `${Math.round(pos[v * 3] * 1e4)}_${Math.round(
        pos[v * 3 + 1] * 1e4
      )}_${Math.round(pos[v * 3 + 2] * 1e4)}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(v);
    }
    for (const group of map.values()) {
      if (group.length > 1) {
        let sx = 0,
          sy = 0,
          sz = 0;
        for (const v of group) {
          sx += accum[v * 3];
          sy += accum[v * 3 + 1];
          sz += accum[v * 3 + 2];
        }
        for (const v of group) {
          accum[v * 3] = sx;
          accum[v * 3 + 1] = sy;
          accum[v * 3 + 2] = sz;
        }
      }
    }
  }

  for (let v = 0; v < nVerts; v++) {
    const nx = accum[v * 3];
    const ny = accum[v * 3 + 1];
    const nz = accum[v * 3 + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-10) {
      mesh.normals[v * 3] = nx / len;
      mesh.normals[v * 3 + 1] = ny / len;
      mesh.normals[v * 3 + 2] = nz / len;
    } else {
      mesh.normals[v * 3] = 0;
      mesh.normals[v * 3 + 1] = 1;
      mesh.normals[v * 3 + 2] = 0;
    }
  }
}

export function buildBhaiJaanGeometry(bones: BoneDef[]): SkinnedSubMesh[] {
  const bIdx = new Map<string, number>();
  bones.forEach((b, i) => bIdx.set(b.name, i));
  const B = (name: string): number => bIdx.get(name)!;

  const subHeadSkin = createSubMesh('BhaiJaan_HeadHands', 0, true);
  const subHair = createSubMesh('BhaiJaan_Hair', 1, true);
  const subJacket = createSubMesh('BhaiJaan_LeatherJacket', 2, false);
  const subTShirt = createSubMesh('BhaiJaan_BlackTShirt', 3, true);
  const subJeans = createSubMesh('BhaiJaan_DenimJeans', 4, true);
  const subBoots = createSubMesh('BhaiJaan_CombatBoots', 5, true);
  const subMetalTrim = createSubMesh('BhaiJaan_MetalTrim', 6, true);

  const spineWeights = (y: number): Array<[number, number]> => {
    const bHips = B('mixamorig:Hips');
    const bSp0 = B('mixamorig:Spine');
    const bSp1 = B('mixamorig:Spine1');
    const bSp2 = B('mixamorig:Spine2');
    const bNeck = B('mixamorig:Neck');
    if (y <= 1.04) return [[bHips, 1]];
    if (y <= 1.18) {
      const t = smoothstep(1.04, 1.18, y);
      return [[bHips, 1 - t], [bSp0, t]];
    }
    if (y <= 1.32) {
      const t = smoothstep(1.18, 1.32, y);
      return [[bSp0, 1 - t], [bSp1, t]];
    }
    if (y <= 1.48) {
      const t = smoothstep(1.32, 1.48, y);
      return [[bSp1, 1 - t], [bSp2, t]];
    }
    if (y <= 1.56) {
      const t = smoothstep(1.48, 1.56, y);
      return [[bSp2, 1 - t], [bNeck, t]];
    }
    return [[bNeck, 1]];
  };

  const legWeights = (side: 'Left' | 'Right', y: number, xAbs: number): Array<[number, number]> => {
    const bHips = B('mixamorig:Hips');
    const bUp = B(`mixamorig:${side}UpLeg`);
    const bLow = B(`mixamorig:${side}Leg`);
    const bFoot = B(`mixamorig:${side}Foot`);
    const bToe = B(`mixamorig:${side}ToeBase`);

    if (y >= 0.99) return [[bHips, 1]];
    if (y >= 0.87) {
      const tY = smoothstep(0.99, 0.87, y);
      const tX = smoothstep(0.012, 0.055, xAbs);
      const wUp = clamp01(tY * (0.45 + 0.55 * tX));
      return [[bHips, 1 - wUp], [bUp, wUp]];
    }
    if (y >= 0.57) return [[bUp, 1]];
    if (y >= 0.44) {
      const t = smoothstep(0.57, 0.44, y);
      return [[bUp, 1 - t], [bLow, t]];
    }
    if (y >= 0.14) return [[bLow, 1]];
    if (y >= 0.06) {
      const t = smoothstep(0.14, 0.06, y);
      return [[bLow, 1 - t], [bFoot, t]];
    }
    return [[bFoot, 0.85], [bToe, 0.15]];
  };

  const armWeights = (side: 'Left' | 'Right', x: number, y: number): Array<[number, number]> => {
    const bSp2 = B('mixamorig:Spine2');
    const bCol = B(`mixamorig:${side}Shoulder`);
    const bArm = B(`mixamorig:${side}Arm`);
    const bFore = B(`mixamorig:${side}ForeArm`);
    const bHand = B(`mixamorig:${side}Hand`);
    const ax = Math.abs(x);

    if (ax <= 0.14) {
      const t = smoothstep(0.1, 0.14, ax);
      return [[bSp2, 1 - t], [bCol, t]];
    }
    if (ax <= 0.255) {
      const tArm = smoothstep(0.155, 0.255, ax);
      const underArmWeight = clamp01(smoothstep(1.42, 1.33, y)) * (1 - tArm * 0.65);
      const wSp2 = underArmWeight * 0.45;
      const wCol = (1 - tArm) * (1 - wSp2);
      const wArm = tArm * (1 - wSp2);
      return [[bSp2, wSp2], [bCol, wCol], [bArm, wArm]];
    }
    if (ax <= 0.435) return [[bArm, 1]];
    if (ax <= 0.555) {
      const t = smoothstep(0.435, 0.555, ax);
      return [[bArm, 1 - t], [bFore, t]];
    }
    if (ax <= 0.705) return [[bFore, 1]];
    if (ax <= 0.765) {
      const t = smoothstep(0.705, 0.765, ax);
      return [[bFore, 1 - t], [bHand, t]];
    }
    return [[bHand, 1]];
  };

  // 1. SCULPTED HEAD, NECK, FACE, EYES & EARS
  {
    const rows = 58;
    const cols = 72;
    const yStart = 1.485;
    const yEnd = 1.852;
    const grid: number[][] = [];

    for (let r = 0; r <= rows; r++) {
      const ty = r / rows;
      const y = lerp(yStart, yEnd, ty);
      const rowIdx: number[] = [];
      const tHead = smoothstep(1.56, 1.655, y);
      const bNeck = B('mixamorig:Neck');
      const bHead = B('mixamorig:Head');
      const bSp2 = B('mixamorig:Spine2');

      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const theta = (u - 0.5) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const frontMask = clamp01(cosT);
        const backMask = clamp01(-cosT);
        const absSin = Math.abs(sinT);

        let rx = 0.064;
        let rz = 0.068;
        let zCenter = 0.008;

        if (y < 1.615) {
          const tNeck = clamp01((y - 1.485) / (1.615 - 1.485));
          // Athletic neck tapering smoothly inward under the square jawline (rx=0.056 at mid-neck)
          const neckPinch = smoothstep(0.0, 0.55, tNeck);
          rx = lerp(0.082, 0.056, neckPinch);
          rz = lerp(0.078, 0.058, neckPinch);
          zCenter = lerp(0.004, -0.002, tNeck);
          const scm = Math.exp(-Math.pow((absSin - 0.48) / 0.22, 2)) * frontMask * (1 - tNeck * 0.35);
          rx += scm * 0.004;
          rz += scm * 0.0025;
        }

        const tSkull = clamp01((y - 1.592) / (1.852 - 1.592));
        if (tSkull > 0) {
          // Broad masculine square-top cranium (power 0.42 avoids pinched cone head)
          const skullAngle = clamp01((y - 1.745) / (1.852 - 1.745)) * Math.PI * 0.5;
          const domeCos = Math.cos(skullAngle);
          const domeRx = 0.086 * Math.pow(Math.max(0.01, domeCos), 0.42);
          const domeRz = 0.104 * Math.pow(Math.max(0.01, domeCos), 0.42);

          const jawEnv = smoothstep(1.594, 1.624, y) * (1 - smoothstep(1.69, 1.74, y));
          const cheekEnv = smoothstep(1.665, 1.708, y) * (1 - smoothstep(1.728, 1.76, y));

          let hRx = y < 1.745 ? lerp(0.064, 0.086, smoothstep(1.592, 1.685, y)) : domeRx;
          let hRz = y < 1.745 ? lerp(0.068, 0.104, smoothstep(1.592, 1.685, y)) : domeRz;

          // Defined square gonial jaw corner flaring cleanly outside neck width
          const gonialCorner = Math.exp(-Math.pow((absSin - 0.72) / 0.19, 2)) * jawEnv;
          hRx += gonialCorner * 0.015;
          hRz += jawEnv * frontMask * 0.015;

          const malar = Math.exp(-Math.pow((absSin - 0.58) / 0.21, 2)) * cheekEnv * frontMask;
          hRx += malar * 0.0075;
          hRz += malar * 0.0055;

          const blendSkull = smoothstep(1.592, 1.618, y);
          rx = lerp(rx, hRx, blendSkull);
          rz = lerp(rz, hRz, blendSkull);
          zCenter = lerp(zCenter, lerp(0.014, 0.002, tSkull), blendSkull);
        }

        const wx = sinT * rx;
        let wz = zCenter + cosT * rz;

        if (cosT > 0.15) {
          const chinMask =
            smoothstep(1.596, 1.615, y) *
            (1 - smoothstep(1.635, 1.656, y)) *
            Math.pow(clamp01(cosT), 2.6) *
            (1 - smoothstep(0.24, 0.42, absSin));
          const cleft = Math.exp(-Math.pow(absSin / 0.045, 2));
          wz += chinMask * (0.017 - cleft * 0.0022);

          // Sharp submental step-back under jawline into neck
          const underJaw = (1 - smoothstep(1.592, 1.608, y)) * smoothstep(1.545, 1.592, y) * frontMask;
          wz -= underJaw * 0.016;

          const socketDist = Math.hypot((absSin - 0.36) / 0.16, (y - 1.724) / 0.018);
          if (socketDist < 1) {
            const d = 1 - socketDist;
            wz -= d * d * 0.015;
          }

          // Confident strong masculine brow ridge slightly closer to upper eyelid
          const browMask =
            Math.exp(-Math.pow((y - 1.741) / 0.0095, 2)) *
            (1 - smoothstep(0.32, 0.56, absSin)) *
            clamp01(cosT);
          wz += browMask * 0.013;

          const noseBridgeMask =
            smoothstep(1.676, 1.694, y) *
            (1 - smoothstep(1.726, 1.742, y)) *
            Math.exp(-Math.pow(absSin / 0.105, 2));
          const noseTipBoost =
            Math.exp(-Math.pow((y - 1.688) / 0.0105, 2)) *
            Math.exp(-Math.pow(absSin / 0.13, 2));
          const nostrilWing =
            Math.exp(-Math.pow((y - 1.682) / 0.0085, 2)) *
            Math.exp(-Math.pow((absSin - 0.155) / 0.06, 2));
          wz += noseBridgeMask * 0.016 + noseTipBoost * 0.01 + nostrilWing * 0.007;

          const upperLip =
            Math.exp(-Math.pow((y - 1.663) / 0.0052, 2)) * (1 + 0.16 * Math.exp(-Math.pow((absSin - 0.07) / 0.05, 2)));
          const lowerLip = Math.exp(-Math.pow((y - 1.6515) / 0.0055, 2));
          const lipIndent = Math.exp(-Math.pow((y - 1.6575) / 0.0026, 2));
          const mouthWidthMask = 1 - smoothstep(0.21, 0.35, absSin);
          wz += ((upperLip + 0.95 * lowerLip) * 0.0082 - lipIndent * 0.0048) * mouthWidthMask;
        }

        wz -= backMask * smoothstep(1.64, 1.74, y) * (1 - smoothstep(1.77, 1.84, y)) * 0.005;

        const vHead = lerp(0.23, 0.98, ty);
        const wts: Array<[number, number]> =
          y < 1.54
            ? [[bSp2, 1 - smoothstep(1.485, 1.54, y)], [bNeck, smoothstep(1.485, 1.54, y)]]
            : [[bNeck, 1 - tHead], [bHead, tHead]];
        rowIdx.push(pushVertex(subHeadSkin, wx, y, wz, u, vHead, wts));
      }
      grid.push(rowIdx);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        addQuad(subHeadSkin, grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]);
      }
    }

    const bHead = B('mixamorig:Head');
    for (const s of [-1, 1]) {
      const eyeCenterX = s * 0.032;
      const eyeCenterY = 1.723;
      const eyeCenterZ = 0.0975;
      const eyeR = 0.0124;
      const eRings = 10;
      const eSegs = 14;
      const eGrid: number[][] = [];
      for (let er = 0; er <= eRings; er++) {
        const phi = (er / eRings) * Math.PI;
        const row: number[] = [];
        for (let es = 0; es <= eSegs; es++) {
          const ang = (es / eSegs) * Math.PI * 2;
          const dx = Math.sin(phi) * Math.cos(ang);
          const dy = Math.sin(phi) * Math.sin(ang);
          const dz = Math.cos(phi);
          row.push(
            pushVertex(
              subHeadSkin,
              eyeCenterX + dx * eyeR * 1.18,
              eyeCenterY + dy * eyeR * 0.88,
              eyeCenterZ + dz * eyeR * 0.88,
              0.11 + dx * 0.095,
              0.11 - dy * 0.095,
              [[bHead, 1]]
            )
          );
        }
        eGrid.push(row);
      }
      for (let er = 0; er < eRings; er++) {
        for (let es = 0; es < eSegs; es++) {
          addQuad(subHeadSkin, eGrid[er][es], eGrid[er + 1][es], eGrid[er + 1][es + 1], eGrid[er][es + 1]);
        }
      }

      // Calm, confident almond eyelid rims framing the dark-brown iris
      for (const lidSign of [-1, 1]) {
        const lidSegs = 10;
        const lidGrid: number[][] = [];
        for (let r = 0; r <= 2; r++) {
          const row: number[] = [];
          for (let c = 0; c <= lidSegs; c++) {
            const tc = c / lidSegs;
            const ang = (tc - 0.5) * Math.PI;
            const lx = eyeCenterX + Math.sin(ang) * 0.0165;
            const openH = lidSign > 0 ? 0.0026 + Math.cos(ang) * 0.0038 : 0.0034 + Math.cos(ang) * 0.0042;
            const ly = eyeCenterY + lidSign * openH + (r - 1) * lidSign * 0.0024;
            const lz = eyeCenterZ + Math.cos(ang) * 0.0112 - (r === 2 ? 0.003 : 0.0);
            row.push(pushVertex(subHeadSkin, lx, ly, lz, 0.44, 0.275, [[bHead, 1]]));
          }
          lidGrid.push(row);
        }
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < lidSegs; c++) {
            addQuad(subHeadSkin, lidGrid[r][c], lidGrid[r + 1][c], lidGrid[r + 1][c + 1], lidGrid[r][c + 1], lidSign < 0);
          }
        }
      }

      // Closed solid sculpted ears (flattened ellipsoid with outward winding & outer cap)
      const earSegs = 14;
      const earRings = 7;
      const earGrid: number[][] = [];
      for (let r = 0; r <= earRings; r++) {
        const tr = r / earRings;
        const row: number[] = [];
        const phi = tr * Math.PI * 0.5;
        const ringProfile = Math.cos(phi); // 1 at skull root -> 0 at outer ear surface
        const depthOut = Math.sin(phi) * 0.016;
        for (let k = 0; k <= earSegs; k++) {
          const ang = (k / earSegs) * Math.PI * 2;
          const lobeTaper = 1.0 - 0.22 * smoothstep(-0.2, -1.0, Math.sin(ang));
          const ey = 1.714 + Math.sin(ang) * 0.025 * ringProfile;
          const ez = -0.006 + Math.cos(ang) * 0.0145 * lobeTaper * ringProfile - depthOut * 0.18;
          const ex = s * (0.078 + depthOut + (1 - ringProfile) * 0.002);
          row.push(pushVertex(subHeadSkin, ex, ey, ez, s > 0 ? 0.74 : 0.26, 0.34, [[bHead, 1]]));
        }
        earGrid.push(row);
      }
      for (let r = 0; r < earRings - 1; r++) {
        for (let k = 0; k < earSegs; k++) {
          addQuad(
            subHeadSkin,
            earGrid[r][k],
            earGrid[r + 1][k],
            earGrid[r + 1][k + 1],
            earGrid[r][k + 1],
            s < 0
          );
        }
      }
      const earTip = pushVertex(subHeadSkin, s * 0.096, 1.714, -0.009, s > 0 ? 0.74 : 0.26, 0.34, [[bHead, 1]]);
      for (let k = 0; k < earSegs; k++) {
        if (s > 0) addTri(subHeadSkin, earGrid[earRings - 1][k], earTip, earGrid[earRings - 1][k + 1]);
        else addTri(subHeadSkin, earGrid[earRings - 1][k], earGrid[earRings - 1][k + 1], earTip);
      }
    }
  }

  // 2. SHORT SLICKED-BACK DARK HAIR (High-density smooth hairline, zero jagged notches or temple clipping)
  {
    const bHead = B('mixamorig:Head');
    const hRows = 28;
    const hCols = 96;
    const hGrid: number[][] = [];

    for (let r = 0; r <= hRows; r++) {
      const tr = r / hRows;
      const row: number[] = [];
      for (let c = 0; c <= hCols; c++) {
        const u = c / hCols;
        const theta = (u - 0.5) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const absSin = Math.abs(sinT);
        const front = clamp01(cosT);
        const back = clamp01(-cosT);

        const templeRecess = Math.exp(-Math.pow((absSin - 0.52) / 0.24, 2)) * front * 0.007;
        const widowPeak = Math.exp(-Math.pow(absSin / 0.18, 2)) * front * 0.007;
        const sideburn =
          smoothstep(0.68, 0.96, absSin) *
          smoothstep(0.06, 0.34, cosT) *
          (1 - smoothstep(0.46, 0.72, cosT)) *
          0.036;
        const earArchLift =
          Math.exp(-Math.pow((cosT + 0.05) / 0.24, 2)) *
          smoothstep(0.68, 0.94, absSin) *
          0.018;
        const napeBlend = smoothstep(-0.15, -0.85, cosT);
        const frontHairline = 1.768 + templeRecess - widowPeak - sideburn + earArchLift;
        const backHairline = lerp(1.752, 1.662, back);
        const yBottom = lerp(frontHairline, backHairline, napeBlend);

        const yTop = 1.862;
        const y = lerp(yBottom, yTop, Math.pow(tr, 0.78));
        const skullAngle = clamp01((y - 1.745) / (1.862 - 1.745)) * Math.PI * 0.5;
        const domeCos = Math.max(0.02, Math.cos(skullAngle));
        const apexFade = 1 - smoothstep(0.86, 1.0, tr);

        const topVol =
          smoothstep(0.14, 0.55, tr) *
          (0.005 + front * 0.008) *
          (1 - smoothstep(0.75, 0.98, absSin)) *
          apexFade;
        const sideVol = lerp(0.006, 0.011, smoothstep(0.15, 0.85, tr)) * apexFade;
        const waveRidge = Math.sin(sinT * 22) * 0.001 * smoothstep(0.2, 0.85, tr) * apexFade;

        const rx = 0.089 * Math.pow(domeCos, 0.42) + sideVol + waveRidge * 0.25;
        const rz = 0.107 * Math.pow(domeCos, 0.42) + sideVol + topVol * 0.55;
        const zC = lerp(0.008, -0.002, tr);

        const wx = sinT * rx;
        const wy = y + topVol * 0.32 + waveRidge;
        const wz = zC + cosT * rz - back * 0.002;
        row.push(pushVertex(subHair, wx, wy, wz, u, tr, [[bHead, 1]]));
      }
      hGrid.push(row);
    }

    for (let r = 0; r < hRows; r++) {
      for (let c = 0; c < hCols; c++) {
        addQuad(subHair, hGrid[r][c], hGrid[r][c + 1], hGrid[r + 1][c + 1], hGrid[r + 1][c]);
      }
    }
    const topCrown = pushVertex(subHair, 0, 1.864, -0.002, 0.5, 1.0, [[bHead, 1]]);
    for (let c = 0; c < hCols; c++) {
      addTri(subHair, hGrid[hRows][c], hGrid[hRows][c + 1], topCrown);
    }
  }

  // Torso contour helper
  const getTorsoRadii = (
    y: number,
    theta: number
  ): { rx: number; rz: number; zOffset: number } => {
    const tY = clamp01((y - 0.98) / (1.51 - 0.98));
    const absSin = Math.abs(Math.sin(theta));
    const cosT = Math.cos(theta);
    const front = clamp01(cosT);
    const back = clamp01(-cosT);

    let rx = lerp(0.162, 0.218, Math.pow(tY, 0.72));
    if (y > 1.455) rx = lerp(rx, 0.088, smoothstep(1.455, 1.518, y));

    let rz = lerp(0.114, 0.136, smoothstep(0.05, 0.72, tY));
    if (y > 1.455) rz = lerp(rz, 0.074, smoothstep(1.455, 1.518, y));

    const pec =
      smoothstep(1.25, 1.35, y) *
      (1 - smoothstep(1.41, 1.47, y)) *
      front *
      smoothstep(0.06, 0.35, absSin);
    const sternumDip =
      smoothstep(1.26, 1.38, y) *
      (1 - smoothstep(1.41, 1.46, y)) *
      front *
      Math.exp(-Math.pow(absSin / 0.14, 2));
    rz += pec * 0.018 - sternumDip * 0.008;

    const lats = smoothstep(1.18, 1.38, y) * (1 - smoothstep(1.43, 1.49, y)) * back;
    rz += lats * 0.012;
    rx += lats * 0.008;

    return { rx, rz, zOffset: lerp(0.0, 0.01, tY) };
  };

  // 3. FITTED BLACK CREW-NECK T-SHIRT
  {
    const tRows = 28;
    const tCols = 48;
    const tGrid: number[][] = [];
    for (let r = 0; r <= tRows; r++) {
      const ty = r / tRows;
      const y = lerp(0.985, 1.512, ty);
      const row: number[] = [];
      const wts = spineWeights(y);
      for (let c = 0; c <= tCols; c++) {
        const u = c / tCols;
        const theta = (u - 0.5) * Math.PI * 2;
        const { rx, rz, zOffset } = getTorsoRadii(y, theta);
        const frontDip =
          y > 1.485 ? clamp01(Math.cos(theta)) * 0.024 * smoothstep(1.485, 1.512, y) : 0;
        row.push(pushVertex(subTShirt, Math.sin(theta) * rx, y - frontDip, zOffset + Math.cos(theta) * rz, u, ty, wts));
      }
      tGrid.push(row);
    }
    for (let r = 0; r < tRows; r++) {
      for (let c = 0; c < tCols; c++) {
        addQuad(subTShirt, tGrid[r][c], tGrid[r][c + 1], tGrid[r + 1][c + 1], tGrid[r + 1][c]);
      }
    }

    const bNeck = B('mixamorig:Neck');
    const cRows = 4;
    const cGrid: number[][] = [];
    for (let r = 0; r <= cRows; r++) {
      const tr = r / cRows;
      const thick = Math.sin(tr * Math.PI) * 0.0055;
      const cy = 1.495 + tr * 0.018;
      const row: number[] = [];
      for (let c = 0; c <= tCols; c++) {
        const u = c / tCols;
        const theta = (u - 0.5) * Math.PI * 2;
        const frontDip = clamp01(Math.cos(theta)) * 0.025;
        row.push(
          pushVertex(
            subTShirt,
            Math.sin(theta) * (0.072 + thick),
            cy - frontDip,
            0.012 + Math.cos(theta) * (0.076 + thick),
            u,
            0.95,
            [[bNeck, 0.7], [B('mixamorig:Spine2'), 0.3]]
          )
        );
      }
      cGrid.push(row);
    }
    for (let r = 0; r < cRows; r++) {
      for (let c = 0; c < tCols; c++) {
        addQuad(subTShirt, cGrid[r][c], cGrid[r][c + 1], cGrid[r + 1][c + 1], cGrid[r + 1][c]);
      }
    }
  }

  // 4. OPEN BROWN DISTRESSED LEATHER JACKET
  {
    const jRows = 26;
    const jCols = 44;
    const jOuter: number[][] = [];
    const jInner: number[][] = [];
    const jTopY = 1.505;
    const jBotY = 1.035;

    for (let r = 0; r <= jRows; r++) {
      const ty = r / jRows;
      const y = lerp(jBotY, jTopY, ty);
      const wts = spineWeights(y);
      const oRow: number[] = [];
      const iRow: number[] = [];
      const openHalfAngle = lerp(0.56, 0.42, smoothstep(0.65, 1.0, ty));

      for (let c = 0; c <= jCols; c++) {
        const sU = c / jCols;
        const theta = lerp(openHalfAngle, Math.PI * 2 - openHalfAngle, sU);
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const { rx, rz, zOffset } = getTorsoRadii(y, theta);

        const shFlare = smoothstep(1.36, 1.485, y) * 0.022 * Math.abs(sinT);
        const hemThick = (1 - smoothstep(1.035, 1.085, y)) * 0.005;
        const pad = 0.015 + shFlare + hemThick;

        const uvV = lerp(0.45, 0.98, ty);
        oRow.push(pushVertex(subJacket, sinT * (rx + pad), y, zOffset + cosT * (rz + 0.014), sU, uvV, wts));
        iRow.push(pushVertex(subJacket, sinT * (rx + 0.005), y, zOffset + cosT * (rz + 0.005), sU, uvV, wts));
      }
      jOuter.push(oRow);
      jInner.push(iRow);
    }

    for (let r = 0; r < jRows; r++) {
      for (let c = 0; c < jCols; c++) {
        addQuad(subJacket, jOuter[r][c], jOuter[r][c + 1], jOuter[r + 1][c + 1], jOuter[r + 1][c]);
        addQuad(subJacket, jInner[r][c], jInner[r][c + 1], jInner[r + 1][c + 1], jInner[r + 1][c], true);
      }
      addQuad(subJacket, jInner[r][0], jOuter[r][0], jOuter[r + 1][0], jInner[r + 1][0]);
      addQuad(subJacket, jOuter[r][jCols], jInner[r][jCols], jInner[r + 1][jCols], jOuter[r + 1][jCols]);
    }
    for (let c = 0; c < jCols; c++) {
      addQuad(subJacket, jInner[0][c], jInner[0][c + 1], jOuter[0][c + 1], jOuter[0][c]);
      addQuad(subJacket, jOuter[jRows][c], jOuter[jRows][c + 1], jInner[jRows][c + 1], jInner[jRows][c]);
    }

    // Collar & Notched Front Lapels
    const cRows = 8;
    const cCols = 36;
    const collarGrid: number[][] = [];
    for (let r = 0; r <= cRows; r++) {
      const tr = r / cRows;
      const row: number[] = [];
      for (let c = 0; c <= cCols; c++) {
        const tc = c / cCols;
        const theta = lerp(0.42, Math.PI * 2 - 0.42, tc);
        const frontFold = smoothstep(0.15, 0.85, Math.cos(theta) * 0.5 + 0.5);
        const cy = lerp(1.5, 1.565 - frontFold * 0.085, tr);
        const wx = Math.sin(theta) * lerp(0.092, 0.105 + frontFold * 0.048, tr);
        const wz = 0.01 + Math.cos(theta) * lerp(0.086, 0.095 + frontFold * 0.036, tr);
        row.push(
          pushVertex(subJacket, wx, cy, wz, tc, lerp(0.82, 0.99, tr), [
            [B('mixamorig:Spine2'), 0.65],
            [B('mixamorig:Neck'), 0.35],
          ])
        );
      }
      collarGrid.push(row);
    }
    for (let r = 0; r < cRows; r++) {
      for (let c = 0; c < cCols; c++) {
        addQuad(subJacket, collarGrid[r][c], collarGrid[r][c + 1], collarGrid[r + 1][c + 1], collarGrid[r + 1][c]);
      }
    }

    // Sleeves
    for (const side of ['Left', 'Right'] as const) {
      const s = side === 'Left' ? 1 : -1;
      const segsX = 28;
      const segsRad = 24;
      const sGrid: number[][] = [];

      for (let i = 0; i <= segsX; i++) {
        const tx = i / segsX;
        // Start inside shoulder armhole (ax=0.132), end at wrist (ax=0.692) so Kada is cleanly visible
        const ax = lerp(0.132, 0.692, tx);
        const wx = s * ax;
        const wts = armWeights(side, wx, 1.47);
        const row: number[] = [];

        let rad = 0.062;
        if (tx < 0.24) rad = lerp(0.095, 0.069, smoothstep(0, 0.24, tx));
        else if (tx < 0.54) rad = lerp(0.069, 0.056, smoothstep(0.24, 0.54, tx));
        else if (tx < 0.85) rad = lerp(0.056, 0.05, smoothstep(0.54, 0.85, tx));
        else rad = lerp(0.05, 0.044, smoothstep(0.85, 1.0, tx));

        const crease =
          Math.sin(tx * Math.PI * 16) *
          0.002 *
          smoothstep(0.32, 0.52, tx) *
          (1 - smoothstep(0.75, 0.95, tx));
        rad += crease;

        const armCenterY = 1.452 + smoothstep(0.0, 0.24, tx) * 0.015;
        const armCenterZ = lerp(-0.008, 0.0, tx);

        for (let k = 0; k <= segsRad; k++) {
          const vAng = (k / segsRad) * Math.PI * 2;
          row.push(
            pushVertex(
              subJacket,
              wx,
              armCenterY + Math.sin(vAng) * rad * 0.96,
              armCenterZ + Math.cos(vAng) * rad * 1.04,
              k / segsRad,
              // Keep sleeve UV strictly inside [0.24, 0.72] away from belt band [0.04, 0.16]
              lerp(0.24, 0.72, tx),
              wts
            )
          );
        }
        sGrid.push(row);
      }

      for (let i = 0; i < segsX; i++) {
        for (let k = 0; k < segsRad; k++) {
          addQuad(subJacket, sGrid[i][k], sGrid[i + 1][k], sGrid[i + 1][k + 1], sGrid[i][k + 1], s > 0);
        }
      }
      const cuffCenter = pushVertex(
        subJacket,
        s * 0.688,
        1.464,
        0.0,
        0.5,
        0.5,
        armWeights(side, s * 0.688, 1.464)
      );
      for (let k = 0; k < segsRad; k++) {
        if (s > 0) addTri(subJacket, sGrid[segsX][k], cuffCenter, sGrid[segsX][k + 1]);
        else addTri(subJacket, sGrid[segsX][k], sGrid[segsX][k + 1], cuffCenter);
      }
    }
  }

  // 5. EXPOSED WRISTS, HANDS & 5 SEPARATED FINGERS PER HAND
  {
    for (const side of ['Left', 'Right'] as const) {
      const s = side === 'Left' ? 1 : -1;
      const bFore = B(`mixamorig:${side}ForeArm`);
      const bHand = B(`mixamorig:${side}Hand`);

      const pSegsX = 10;
      const pSegsRad = 18;
      const pGrid: number[][] = [];
      for (let i = 0; i <= pSegsX; i++) {
        const tx = i / pSegsX;
        const ax = lerp(0.695, 0.836, tx);
        const wHand = smoothstep(0.71, 0.765, ax);
        const wts: Array<[number, number]> = [[bFore, 1 - wHand], [bHand, wHand]];
        const row: number[] = [];
        const rY = lerp(0.027, 0.0145, smoothstep(0.25, 0.85, tx));
        const rZ = lerp(0.032, 0.0445, smoothstep(0.25, 0.85, tx));
        const yC = lerp(1.466, 1.468, tx);
        const zC = lerp(0.0, -0.002, tx);

        for (let k = 0; k <= pSegsRad; k++) {
          const ang = (k / pSegsRad) * Math.PI * 2;
          row.push(
            pushVertex(
              subHeadSkin,
              s * ax,
              yC + Math.sin(ang) * rY,
              zC + Math.cos(ang) * rZ,
              lerp(0.26, 0.72, k / pSegsRad),
              lerp(0.02, 0.19, tx),
              wts
            )
          );
        }
        pGrid.push(row);
      }
      for (let i = 0; i < pSegsX; i++) {
        for (let k = 0; k < pSegsRad; k++) {
          addQuad(subHeadSkin, pGrid[i][k], pGrid[i + 1][k], pGrid[i + 1][k + 1], pGrid[i][k + 1], s > 0);
        }
      }
      const palmCap = pushVertex(subHeadSkin, s * 0.838, 1.468, -0.002, 0.5, 0.18, [[bHand, 1]]);
      for (let k = 0; k < pSegsRad; k++) {
        if (s > 0) addTri(subHeadSkin, pGrid[pSegsX][k], palmCap, pGrid[pSegsX][k + 1]);
        else addTri(subHeadSkin, pGrid[pSegsX][k], pGrid[pSegsX][k + 1], palmCap);
      }

      const fingers: Array<[string, number, number, number]> = [
        ['Index', 0.032, 0.088, 0.0095],
        ['Middle', 0.011, 0.095, 0.0098],
        ['Ring', -0.01, 0.089, 0.0092],
        ['Pinky', -0.03, 0.074, 0.008],
      ];

      for (const [fname, zOff, len, baseRad] of fingers) {
        const b1 = B(`mixamorig:${side}Hand${fname}1`);
        const b2 = B(`mixamorig:${side}Hand${fname}2`);
        const b3 = B(`mixamorig:${side}Hand${fname}3`);
        const fSegsX = 9;
        const fRadSegs = 10;
        const fGrid: number[][] = [];
        const startX = 0.828;

        for (let i = 0; i <= fSegsX; i++) {
          const tf = i / fSegsX;
          const wx = s * (startX + tf * len);
          const rad = lerp(baseRad, baseRad * 0.72, Math.pow(tf, 1.3));
          const row: number[] = [];

          let wts: Array<[number, number]>;
          if (tf < 0.15) wts = [[bHand, 1 - tf / 0.15], [b1, tf / 0.15]];
          else if (tf < 0.48) {
            const t = smoothstep(0.32, 0.48, tf);
            wts = [[b1, 1 - t], [b2, t]];
          } else if (tf < 0.78) {
            const t = smoothstep(0.64, 0.78, tf);
            wts = [[b2, 1 - t], [b3, t]];
          } else wts = [[b3, 1]];

          for (let k = 0; k <= fRadSegs; k++) {
            const ang = (k / fRadSegs) * Math.PI * 2;
            const uFinger = tf > 0.78 && Math.sin(ang) > 0.2 ? 0.86 : 0.45;
            row.push(
              pushVertex(
                subHeadSkin,
                wx,
                1.467 + Math.sin(ang) * rad * 0.88,
                zOff + Math.cos(ang) * rad,
                uFinger,
                0.12,
                wts
              )
            );
          }
          fGrid.push(row);
        }
        for (let i = 0; i < fSegsX; i++) {
          for (let k = 0; k < fRadSegs; k++) {
            addQuad(subHeadSkin, fGrid[i][k], fGrid[i + 1][k], fGrid[i + 1][k + 1], fGrid[i][k + 1], s > 0);
          }
        }
        const fTip = pushVertex(subHeadSkin, s * (startX + len + 0.004), 1.466, zOff, 0.86, 0.12, [[b3, 1]]);
        for (let k = 0; k < fRadSegs; k++) {
          if (s > 0) addTri(subHeadSkin, fGrid[fSegsX][k], fTip, fGrid[fSegsX][k + 1]);
          else addTri(subHeadSkin, fGrid[fSegsX][k], fGrid[fSegsX][k + 1], fTip);
        }
      }

      // Thumb
      const bt1 = B(`mixamorig:${side}HandThumb1`);
      const bt2 = B(`mixamorig:${side}HandThumb2`);
      const bt3 = B(`mixamorig:${side}HandThumb3`);
      const tGrid: number[][] = [];
      const tSegs = 7;
      const tRadSegs = 10;
      const thumbStart: Vec3 = [s * 0.768, 1.463, 0.028];
      const thumbEnd: Vec3 = [s * 0.838, 1.447, 0.082];
      const dirT = vNorm(vSub(thumbEnd, thumbStart));
      const binT = vNorm(vCross(dirT, [0, 1, 0]));
      const normT = vCross(binT, dirT);

      for (let i = 0; i <= tSegs; i++) {
        const tf = i / tSegs;
        const cPos = vAdd(thumbStart, vScale(vSub(thumbEnd, thumbStart), tf));
        const rad = lerp(0.0135, 0.009, Math.pow(tf, 1.2));
        const wts: Array<[number, number]> =
          tf < 0.35
            ? [[bHand, 1 - tf / 0.35], [bt1, tf / 0.35]]
            : tf < 0.7
            ? [[bt1, 1 - smoothstep(0.35, 0.7, tf)], [bt2, smoothstep(0.35, 0.7, tf)]]
            : [[bt3, 1]];
        const row: number[] = [];
        for (let k = 0; k <= tRadSegs; k++) {
          const ang = (k / tRadSegs) * Math.PI * 2;
          const p = vAdd(
            cPos,
            vAdd(vScale(binT, Math.cos(ang) * rad), vScale(normT, Math.sin(ang) * rad))
          );
          row.push(pushVertex(subHeadSkin, p[0], p[1], p[2], tf > 0.75 ? 0.86 : 0.45, 0.12, wts));
        }
        tGrid.push(row);
      }
      for (let i = 0; i < tSegs; i++) {
        for (let k = 0; k < tRadSegs; k++) {
          addQuad(subHeadSkin, tGrid[i][k], tGrid[i + 1][k], tGrid[i + 1][k + 1], tGrid[i][k + 1], true);
        }
      }
      const thumbTip = pushVertex(
        subHeadSkin,
        thumbEnd[0] + s * 0.003,
        thumbEnd[1],
        thumbEnd[2] + 0.002,
        0.86,
        0.12,
        [[bt3, 1]]
      );
      for (let k = 0; k < tRadSegs; k++) {
        addTri(subHeadSkin, tGrid[tSegs][k], thumbTip, tGrid[tSegs][k + 1]);
      }
    }
  }

  // 6. DARK BLUE WASHED DENIM JEANS
  {
    const bHips = B('mixamorig:Hips');
    const wRows = 12;
    const wCols = 40;
    const wGrid: number[][] = [];
    for (let r = 0; r <= wRows; r++) {
      const tr = r / wRows;
      const y = lerp(0.875, 1.052, tr);
      const row: number[] = [];
      for (let c = 0; c <= wCols; c++) {
        const u = c / wCols;
        const theta = (u - 0.5) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const absSin = Math.abs(sinT);
        const back = clamp01(-cosT);

        let rx = lerp(0.182, 0.168, smoothstep(0.0, 1.0, tr));
        let rz = lerp(0.128, 0.118, smoothstep(0.3, 1.0, tr)) + back * 0.016 * (1 - smoothstep(0.55, 1.0, tr));
        const pinch = (1 - smoothstep(0.875, 0.945, y)) * Math.exp(-Math.pow(absSin / 0.28, 2));
        rz *= 1 - pinch * 0.42;
        const wb = smoothstep(1.01, 1.03, y) * 0.004;
        rx += wb;
        rz += wb;

        const wx = sinT * rx;
        const wz = cosT * rz;
        const legSide = wx >= 0 ? 'Left' : 'Right';
        const wts = y >= 0.96 ? ([[bHips, 1]] as Array<[number, number]>) : legWeights(legSide, y, Math.abs(wx));
        row.push(pushVertex(subJeans, wx, y, wz, u, lerp(0.75, 0.98, tr), wts));
      }
      wGrid.push(row);
    }
    for (let r = 0; r < wRows; r++) {
      for (let c = 0; c < wCols; c++) {
        addQuad(subJeans, wGrid[r][c], wGrid[r][c + 1], wGrid[r + 1][c + 1], wGrid[r + 1][c]);
      }
    }

    for (const side of ['Left', 'Right'] as const) {
      const s = side === 'Left' ? 1 : -1;
      const lRows = 28;
      const lCols = 24;
      const lGrid: number[][] = [];

      for (let r = 0; r <= lRows; r++) {
        const ty = r / lRows;
        const y = lerp(0.165, 0.925, ty);
        const row: number[] = [];
        const cx = s * lerp(0.105, 0.096, smoothstep(0.0, 1.0, ty));
        const cz = lerp(-0.005, 0.003, smoothstep(0.0, 0.65, ty));

        let rad = 0.072;
        if (y > 0.56) rad = lerp(0.072, 0.094, smoothstep(0.56, 0.925, y));
        else if (y > 0.36) rad = lerp(0.068, 0.072, smoothstep(0.36, 0.56, y));
        else rad = lerp(0.063, 0.068, smoothstep(0.165, 0.36, y));
        rad += Math.sin(ty * Math.PI * 12) * 0.002 * (1 - smoothstep(0.25, 0.55, ty));

        for (let c = 0; c <= lCols; c++) {
          const u = c / lCols;
          const theta = (u - 0.5) * Math.PI * 2;
          const wx = cx + Math.sin(theta) * rad * 0.96;
          const wz =
            cz +
            Math.cos(theta) *
              (rad * 1.05 + smoothstep(0.55, 0.85, ty) * clamp01(Math.cos(theta)) * 0.008);
          row.push(pushVertex(subJeans, wx, y, wz, u, lerp(0.04, 0.76, ty), legWeights(side, y, Math.abs(wx))));
        }
        lGrid.push(row);
      }

      for (let r = 0; r < lRows; r++) {
        for (let c = 0; c < lCols; c++) {
          addQuad(subJeans, lGrid[r][c], lGrid[r][c + 1], lGrid[r + 1][c + 1], lGrid[r + 1][c]);
        }
      }
      const bLow = B(`mixamorig:${side}Leg`);
      const cuffIn = pushVertex(subJeans, s * 0.105, 0.175, -0.005, 0.5, 0.05, [[bLow, 1]]);
      for (let c = 0; c < lCols; c++) {
        addTri(subJeans, lGrid[0][c + 1], lGrid[0][c], cuffIn);
      }
    }

    // Cleanly separated back patch pockets sitting strictly outside the rear denim contour
    for (const s of [-1, 1]) {
      const pMidX = s * 0.088;
      const pw = 0.036;
      const pGrid: number[][] = [];
      for (let r = 0; r <= 3; r++) {
        const tr = r / 3;
        const y = lerp(0.895, 0.992, tr);
        const trW = (y - 0.875) / (1.052 - 0.875);
        const rxSeat = lerp(0.182, 0.168, smoothstep(0.0, 1.0, trW));
        const rzSeat = lerp(0.128, 0.118, smoothstep(0.3, 1.0, trW)) + 0.016 * (1 - smoothstep(0.55, 1.0, trW));
        const wCurr = tr === 0 ? pw * 0.65 : pw;
        const row: number[] = [];
        for (let c = 0; c <= 2; c++) {
          const tc = c / 2;
          const wx = pMidX + lerp(-wCurr, wCurr, tc);
          const normX = clamp(wx / rxSeat, -0.92, 0.92);
          const backFactor = Math.sqrt(Math.max(0.01, 1 - normX * normX));
          const wz = -rzSeat * backFactor - 0.007;
          row.push(pushVertex(subJeans, wx, y, wz, lerp(0.35, 0.65, tc), lerp(0.76, 0.92, tr), [[bHips, 1]]));
        }
        pGrid.push(row);
      }
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          addQuad(subJeans, pGrid[r][c + 1], pGrid[r][c], pGrid[r + 1][c], pGrid[r + 1][c + 1]);
        }
      }
    }

    // 5 Belt loops
    for (const angDeg of [-145, -70, 70, 145]) {
      const radAng = (angDeg * Math.PI) / 180;
      const lx = Math.sin(radAng) * 0.174;
      const lz = Math.cos(radAng) * 0.126;
      const tX = Math.cos(radAng);
      const tZ = -Math.sin(radAng);
      const wHalf = 0.008;
      const p00 = pushVertex(subJeans, lx - tX * wHalf, 1.012, lz - tZ * wHalf, 0.5, 0.9, [[bHips, 1]]);
      const p01 = pushVertex(subJeans, lx + tX * wHalf, 1.012, lz + tZ * wHalf, 0.5, 0.9, [[bHips, 1]]);
      const p11 = pushVertex(subJeans, lx + tX * wHalf, 1.056, lz + tZ * wHalf, 0.5, 0.95, [[bHips, 1]]);
      const p10 = pushVertex(subJeans, lx - tX * wHalf, 1.056, lz - tZ * wHalf, 0.5, 0.95, [[bHips, 1]]);
      addQuad(subJeans, p00, p01, p11, p10);
    }
    const b00 = pushVertex(subJeans, -0.008, 1.012, -0.126, 0.5, 0.9, [[bHips, 1]]);
    const b01 = pushVertex(subJeans, 0.008, 1.012, -0.126, 0.5, 0.9, [[bHips, 1]]);
    const b11 = pushVertex(subJeans, 0.008, 1.056, -0.126, 0.5, 0.95, [[bHips, 1]]);
    const b10 = pushVertex(subJeans, -0.008, 1.056, -0.126, 0.5, 0.95, [[bHips, 1]]);
    addQuad(subJeans, b01, b00, b10, b11);
  }

  // 7. BLACK LACE-UP TACTICAL BOOTS (Flat soles at Y = 0.002m = 0.001 local)
  {
    for (const side of ['Left', 'Right'] as const) {
      const s = side === 'Left' ? 1 : -1;
      const bLow = B(`mixamorig:${side}Leg`);
      const bFoot = B(`mixamorig:${side}Foot`);
      const bToe = B(`mixamorig:${side}ToeBase`);
      const cx = s * 0.105;

      const footWeights = (y: number, z: number): Array<[number, number]> => {
        if (y > 0.15) return [[bLow, 0.75], [bFoot, 0.25]];
        if (z > 0.085) {
          const tToe = smoothstep(0.085, 0.145, z);
          return [[bFoot, 1 - tToe], [bToe, tToe]];
        }
        return [[bFoot, 1]];
      };

      const sRows = 8;
      const sCols = 20;
      const shaftGrid: number[][] = [];
      for (let r = 0; r <= sRows; r++) {
        const tr = r / sRows;
        const y = lerp(0.068, 0.215, tr);
        const row: number[] = [];
        const rx = lerp(0.052, 0.052, tr);
        const rz = lerp(0.065, 0.058, tr);
        const cz = lerp(-0.006, -0.012, tr);
        for (let c = 0; c <= sCols; c++) {
          const u = c / sCols;
          const ang = (u - 0.5) * Math.PI * 2;
          const wx = cx + Math.sin(ang) * rx;
          const wz = cz + Math.cos(ang) * rz;
          row.push(pushVertex(subBoots, wx, y, wz, u, lerp(0.32, 0.96, tr), footWeights(y, wz)));
        }
        shaftGrid.push(row);
      }
      for (let r = 0; r < sRows; r++) {
        for (let c = 0; c < sCols; c++) {
          addQuad(subBoots, shaftGrid[r][c], shaftGrid[r][c + 1], shaftGrid[r + 1][c + 1], shaftGrid[r + 1][c]);
        }
      }

      const zSlices = 20;
      const profSegs = 18;
      const bootBody: number[][] = [];
      for (let i = 0; i <= zSlices; i++) {
        const tz = i / zSlices;
        const z = lerp(-0.066, 0.186, tz);

        let halfW = 0.046;
        if (tz < 0.25) halfW = lerp(0.036, 0.046, smoothstep(0, 0.25, tz));
        else if (tz < 0.45) halfW = lerp(0.046, 0.042, smoothstep(0.25, 0.45, tz));
        else if (tz < 0.72) halfW = lerp(0.042, 0.053, smoothstep(0.45, 0.72, tz));
        else halfW = lerp(0.053, 0.018, Math.pow(smoothstep(0.72, 1.0, tz), 0.75));

        const topY =
          tz < 0.22
            ? lerp(0.095, 0.112, smoothstep(0, 0.22, tz))
            : tz < 0.65
            ? lerp(0.112, 0.072, smoothstep(0.22, 0.65, tz))
            : lerp(0.072, 0.032, Math.pow(smoothstep(0.65, 1.0, tz), 0.9));

        const archLift = tz > 0.28 && tz < 0.46 ? Math.sin(((tz - 0.28) / 0.18) * Math.PI) * 0.004 : 0;
        const toeSpring = tz > 0.88 ? Math.pow((tz - 0.88) / 0.12, 1.8) * 0.007 : 0;
        const botY = 0.002 + archLift + toeSpring;

        const row: number[] = [];
        for (let k = 0; k <= profSegs; k++) {
          const tk = k / profSegs;
          const ang = tk * Math.PI * 2;
          const wx = cx + Math.cos(ang) * halfW;
          const sn = Math.sin(ang);
          const wy =
            sn < 0
              ? lerp(botY + 0.012, botY, Math.pow(-sn, 0.45))
              : lerp(botY + 0.012, topY, Math.pow(sn, 0.75));
          const uvV = wy < 0.025 ? 0.1 : lerp(0.26, 0.65, clamp01(sn));
          row.push(pushVertex(subBoots, wx, wy, z, tk, uvV, footWeights(wy, z)));
        }
        bootBody.push(row);
      }

      // Outward-facing winding for boot body (flip = true) and heel/toe caps
      for (let i = 0; i < zSlices; i++) {
        for (let k = 0; k < profSegs; k++) {
          addQuad(subBoots, bootBody[i][k], bootBody[i + 1][k], bootBody[i + 1][k + 1], bootBody[i][k + 1], true);
        }
      }
      const heelCenter = pushVertex(subBoots, cx, 0.038, -0.068, 0.5, 0.3, [[bFoot, 1]]);
      const toeCenter = pushVertex(subBoots, cx, 0.018, 0.189, 0.5, 0.3, [[bToe, 1]]);
      for (let k = 0; k < profSegs; k++) {
        addTri(subBoots, bootBody[0][k], heelCenter, bootBody[0][k + 1]);
        addTri(subBoots, bootBody[zSlices][k], bootBody[zSlices][k + 1], toeCenter);
      }

      // Laces & Eyelets
      for (let li = 0; li < 6; li++) {
        const tzL = lerp(0.26, 0.64, li / 5);
        const zA = lerp(-0.066, 0.186, tzL);
        const yA = lerp(0.114, 0.072, (tzL - 0.22) / 0.43) + 0.002;
        const spread = lerp(0.021, 0.017, li / 5);

        const pL0 = pushVertex(subBoots, cx - spread, yA, zA - 0.003, 0.5, 0.5, footWeights(yA, zA));
        const pR0 = pushVertex(subBoots, cx + spread, yA, zA + 0.004, 0.5, 0.5, footWeights(yA, zA));
        const pR1 = pushVertex(subBoots, cx + spread, yA + 0.004, zA + 0.001, 0.5, 0.5, footWeights(yA, zA));
        const pL1 = pushVertex(subBoots, cx - spread, yA + 0.004, zA - 0.006, 0.5, 0.5, footWeights(yA, zA));
        addQuad(subBoots, pL0, pR0, pR1, pL1);

        for (const es of [-1, 1]) {
          const ex = cx + es * (spread + 0.002);
          const eSize = 0.0035;
          const e0 = pushVertex(subMetalTrim, ex - eSize, yA + 0.002, zA - eSize, 0.25, 0.5, footWeights(yA, zA));
          const e1 = pushVertex(subMetalTrim, ex + eSize, yA + 0.002, zA - eSize, 0.25, 0.5, footWeights(yA, zA));
          const e2 = pushVertex(subMetalTrim, ex + eSize, yA + 0.002, zA + eSize, 0.25, 0.5, footWeights(yA, zA));
          const e3 = pushVertex(subMetalTrim, ex - eSize, yA + 0.002, zA + eSize, 0.25, 0.5, footWeights(yA, zA));
          addQuad(subMetalTrim, e0, e1, e2, e3);
        }
      }
    }
  }

  // 8. BELT STRAP, METALLIC BUCKLE, ZIPPERS & RIGHT WRIST SILVER-TURQUOISE KADA
  {
    const bHips = B('mixamorig:Hips');
    const bRows = 4;
    const bCols = 36;
    const beltGrid: number[][] = [];
    for (let r = 0; r <= bRows; r++) {
      const tr = r / bRows;
      const y = lerp(1.015, 1.053, tr);
      const row: number[] = [];
      for (let c = 0; c <= bCols; c++) {
        const u = c / bCols;
        const theta = (u - 0.5) * Math.PI * 2;
        row.push(pushVertex(subJacket, Math.sin(theta) * 0.174, y, Math.cos(theta) * 0.125, u, 0.15, [[bHips, 1]]));
      }
      beltGrid.push(row);
    }
    for (let r = 0; r < bRows; r++) {
      for (let c = 0; c < bCols; c++) {
        addQuad(subJacket, beltGrid[r][c], beltGrid[r][c + 1], beltGrid[r + 1][c + 1], beltGrid[r + 1][c]);
      }
    }

    const addMetalBox = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      uCenter: number,
      wts: Array<[number, number]>
    ) => {
      const v000 = pushVertex(subMetalTrim, x0, y0, z0, uCenter, 0.5, wts);
      const v100 = pushVertex(subMetalTrim, x1, y0, z0, uCenter, 0.5, wts);
      const v110 = pushVertex(subMetalTrim, x1, y1, z0, uCenter, 0.5, wts);
      const v010 = pushVertex(subMetalTrim, x0, y1, z0, uCenter, 0.5, wts);
      const v001 = pushVertex(subMetalTrim, x0, y0, z1, uCenter, 0.5, wts);
      const v101 = pushVertex(subMetalTrim, x1, y0, z1, uCenter, 0.5, wts);
      const v111 = pushVertex(subMetalTrim, x1, y1, z1, uCenter, 0.5, wts);
      const v011 = pushVertex(subMetalTrim, x0, y1, z1, uCenter, 0.5, wts);
      addQuad(subMetalTrim, v001, v101, v111, v011);
      addQuad(subMetalTrim, v100, v000, v010, v110);
      addQuad(subMetalTrim, v000, v001, v011, v010);
      addQuad(subMetalTrim, v101, v100, v110, v111);
      addQuad(subMetalTrim, v011, v111, v110, v010);
      addQuad(subMetalTrim, v000, v100, v101, v001);
    };

    // Brushed Steel Rectangular Frame Belt Buckle
    addMetalBox(-0.032, 0.032, 1.05, 1.058, 0.124, 0.135, 0.25, [[bHips, 1]]);
    addMetalBox(-0.032, 0.032, 1.01, 1.018, 0.124, 0.135, 0.25, [[bHips, 1]]);
    addMetalBox(-0.032, -0.024, 1.018, 1.05, 0.124, 0.135, 0.25, [[bHips, 1]]);
    addMetalBox(0.024, 0.032, 1.018, 1.05, 0.124, 0.135, 0.25, [[bHips, 1]]);
    addMetalBox(-0.004, 0.004, 1.031, 1.037, 0.126, 0.137, 0.25, [[bHips, 1]]);

    // Sleek continuous Front Jacket Zippers & Chest Zippers & Cuff Zippers
    for (const s of [-1, 1]) {
      for (let zi = 0; zi < 18; zi++) {
        const ty = zi / 18;
        const y = lerp(1.04, 1.445, ty);
        const openAng = lerp(0.56, 0.42, smoothstep(0.65, 1.0, ty));
        const { rx, rz, zOffset } = getTorsoRadii(y, openAng);
        const zx = s * Math.sin(openAng) * (rx + 0.016);
        const zz = zOffset + Math.cos(openAng) * (rz + 0.015);
        addMetalBox(zx - 0.0022, zx + 0.0022, y, y + 0.022, zz - 0.002, zz + 0.0025, 0.25, spineWeights(y));
      }
      for (let k = 0; k < 6; k++) {
        const tk = k / 6;
        const px = lerp(s * 0.105, s * 0.168, tk);
        const py = lerp(1.338, 1.362, tk);
        const pz = 0.145 - Math.abs(px) * 0.18;
        addMetalBox(px - 0.003, px + 0.003, py - 0.0022, py + 0.0022, pz, pz + 0.004, 0.25, [
          [B('mixamorig:Spine2'), 1],
        ]);
      }
      const sideName = s > 0 ? 'Left' : 'Right';
      addMetalBox(s * 0.64, s * 0.69, 1.466, 1.472, -0.048, -0.042, 0.25, [
        [B(`mixamorig:${sideName}ForeArm`), 1],
      ]);
    }

    // Iconic Right Wrist Silver-Turquoise Kada (-X), clearly exposed past jacket cuff (ax=0.692)
    const kadaWts: Array<[number, number]> = [
      [B('mixamorig:RightForeArm'), 0.65],
      [B('mixamorig:RightHand'), 0.35],
    ];
    const kadaX = -0.716;
    const majorR = 0.036;
    const minorR = 0.0068;
    const kSegs = 28;
    const kTube = 10;
    const kGrid: number[][] = [];
    for (let i = 0; i <= kSegs; i++) {
      const angU = (i / kSegs) * Math.PI * 2;
      const row: number[] = [];
      for (let j = 0; j <= kTube; j++) {
        const angV = (j / kTube) * Math.PI * 2;
        const wx = kadaX + Math.sin(angV) * minorR;
        const rad = majorR + Math.cos(angV) * minorR;
        row.push(pushVertex(subMetalTrim, wx, 1.466 + Math.sin(angU) * rad * 0.92, Math.cos(angU) * rad * 1.04, 0.22, 0.5, kadaWts));
      }
      kGrid.push(row);
    }
    for (let i = 0; i < kSegs; i++) {
      for (let j = 0; j < kTube; j++) {
        addQuad(subMetalTrim, kGrid[i][j], kGrid[i + 1][j], kGrid[i + 1][j + 1], kGrid[i][j + 1]);
      }
    }

    // Centered inlaid turquoise cabochon + silver bezel sitting flush on top of the Kada band
    const gCenterY = 1.466 + (majorR + minorR * 0.55) * 0.92;
    const gCenterZ = 0.0;
    const gGrid: number[][] = [];
    for (let r = 0; r <= 6; r++) {
      const phi = (r / 6) * Math.PI * 0.5;
      const row: number[] = [];
      for (let c = 0; c <= 14; c++) {
        const ang = (c / 14) * Math.PI * 2;
        const rr = Math.cos(phi);
        row.push(
          pushVertex(
            subMetalTrim,
            kadaX + Math.cos(ang) * 0.0115 * rr,
            gCenterY + Math.sin(phi) * 0.006,
            gCenterZ + Math.sin(ang) * 0.0088 * rr,
            0.75,
            0.5,
            kadaWts
          )
        );
      }
      gGrid.push(row);
    }
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 14; c++) {
        addQuad(subMetalTrim, gGrid[r][c], gGrid[r][c + 1], gGrid[r + 1][c + 1], gGrid[r + 1][c]);
      }
    }
  }

  const meshes = [subHeadSkin, subHair, subJacket, subTShirt, subJeans, subBoots, subMetalTrim];
  for (const m of meshes) computeSmoothNormals(m);
  return meshes;
}
