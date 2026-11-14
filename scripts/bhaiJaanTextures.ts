import * as zlib from 'node:zlib';

/**
 * Procedural PBR Texture Generator for Bhai Jaan (albedo, normal, metallicRoughness, AO)
 * serialized directly to lossless PNG buffers using Node stdlib zlib.
 */

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = data.length;
  const out = Buffer.allocUnsafe(len + 12);
  out.writeUInt32BE(len, 0);
  out.write(type, 4, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, len).copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + len));
  out.writeUInt32BE(crc, 8 + len);
  return out;
}

export function encodePngRGBA(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.allocUnsafe(stride * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * stride;
    raw[rowOut] = 1; // PNG Sub filter
    const rowIn = y * width * 4;
    for (let i = 0; i < width * 4; i++) {
      const left = i >= 4 ? rgba[rowIn + i - 4] : 0;
      raw[rowOut + 1 + i] = (rgba[rowIn + i] - left) & 0xff;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbm2(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export interface PBRTextureBundle {
  albedoPng: Buffer;
  normalPng: Buffer;
  mrPng: Buffer; // glTF: G = roughness, B = metallic
  aoPng: Buffer;
}

function buildPBRBundleFromHeight(
  size: number,
  normalStrength: number,
  pixelFn: (
    u: number,
    v: number
  ) => {
    r: number;
    g: number;
    b: number;
    rough: number;
    metal: number;
    ao: number;
    height: number;
  }
): PBRTextureBundle {
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const mr = new Uint8Array(size * size * 4);
  const aoBuf = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const v = (py + 0.5) / size; // glTF 2.0 UV V=0 at top of PNG matching Babylon Texture(invertY=false)
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const res = pixelFn(u, v);
      const idx = py * size + px;
      const o = idx * 4;
      albedo[o] = clamp(Math.round(res.r * 255), 0, 255);
      albedo[o + 1] = clamp(Math.round(res.g * 255), 0, 255);
      albedo[o + 2] = clamp(Math.round(res.b * 255), 0, 255);
      albedo[o + 3] = 255;

      mr[o] = 255;
      mr[o + 1] = clamp(Math.round(res.rough * 255), 0, 255);
      mr[o + 2] = clamp(Math.round(res.metal * 255), 0, 255);
      mr[o + 3] = 255;

      const aoV = clamp(Math.round(res.ao * 255), 0, 255);
      aoBuf[o] = aoV;
      aoBuf[o + 1] = aoV;
      aoBuf[o + 2] = aoV;
      aoBuf[o + 3] = 255;

      heights[idx] = res.height;
    }
  }

  for (let py = 0; py < size; py++) {
    const ym = py > 0 ? py - 1 : 0;
    const yp = py < size - 1 ? py + 1 : size - 1;
    for (let px = 0; px < size; px++) {
      const xm = px > 0 ? px - 1 : 0;
      const xp = px < size - 1 ? px + 1 : size - 1;
      const dx = (heights[py * size + xp] - heights[py * size + xm]) * normalStrength;
      const dy = (heights[yp * size + px] - heights[ym * size + px]) * normalStrength;
      const nx = -dx;
      const ny = dy;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const o = (py * size + px) * 4;
      normal[o] = clamp(Math.round(((nx / len) * 0.5 + 0.5) * 255), 0, 255);
      normal[o + 1] = clamp(Math.round(((ny / len) * 0.5 + 0.5) * 255), 0, 255);
      normal[o + 2] = clamp(Math.round(((nz / len) * 0.5 + 0.5) * 255), 0, 255);
      normal[o + 3] = 255;
    }
  }

  return {
    albedoPng: encodePngRGBA(size, size, albedo),
    normalPng: encodePngRGBA(size, size, normal),
    mrPng: encodePngRGBA(size, size, mr),
    aoPng: encodePngRGBA(size, size, aoBuf),
  };
}

export function generateAllBhaiJaanTextures(): PBRTextureBundle[] {
  // 0: Face_Skin_PBR (512x512 — face landmarks aligned at u=0.5 front, eyeballs corner, hands bottom band)
  const faceSkin = buildPBRBundleFromHeight(512, 0.95, (u, v) => {
    const pore = fbm2(u * 140, v * 140, 3);
    const toneVar = fbm2(u * 18, v * 18, 3);
    let r = 0.845 + (toneVar - 0.5) * 0.04;
    let g = 0.605 + (toneVar - 0.5) * 0.035;
    let b = 0.455 + (toneVar - 0.5) * 0.03;
    let rough = 0.48 + (pore - 0.5) * 0.08;
    let ao = 0.96;
    let height = pore * 0.35;

    // Eyeball Atlas corner (u, v in [0, 0.22]) — fuller dark-brown iris + subtle upper lid ambient occlusion
    if (u < 0.22 && v < 0.22) {
      const dx = (u - 0.11) / 0.088;
      const dy = (v - 0.11) / 0.088;
      const dist = Math.hypot(dx, dy);
      const upperShade = smoothstep(0.05, 0.62, -dy) * 0.28;
      if (dist < 0.28) {
        return { r: 0.022, g: 0.02, b: 0.02, rough: 0.05, metal: 0, ao: 1, height: 0.5 };
      } else if (dist < 0.62) {
        const ang = Math.atan2(dy, dx);
        const fiber = fbm2(Math.cos(ang) * 14, Math.sin(ang) * 14 + dist * 10, 2);
        const rim = smoothstep(0.52, 0.62, dist);
        return {
          r: lerp(0.18 + fiber * 0.08, 0.045, rim) * (1 - upperShade),
          g: lerp(0.105 + fiber * 0.05, 0.028, rim) * (1 - upperShade),
          b: lerp(0.06 + fiber * 0.03, 0.018, rim) * (1 - upperShade),
          rough: 0.08,
          metal: 0,
          ao: 1,
          height: 0.52,
        };
      }
      const edgeTint = smoothstep(0.62, 0.98, dist);
      return {
        r: lerp(0.89, 0.76, edgeTint) * (1 - upperShade),
        g: lerp(0.85, 0.69, edgeTint) * (1 - upperShade),
        b: lerp(0.83, 0.67, edgeTint) * (1 - upperShade),
        rough: 0.12,
        metal: 0,
        ao: lerp(0.98, 0.76, edgeTint),
        height: 0.48,
      };
    }

    // Hands & Nails band (v < 0.22)
    if (v < 0.22) {
      if (u > 0.78) {
        return { r: 0.89, g: 0.72, b: 0.62, rough: 0.28, metal: 0, ao: 0.95, height: 0.55 };
      }
      const knuckleBand = smoothstep(0.06, 0.14, v) * (1 - smoothstep(0.14, 0.2, v));
      return {
        r: r + knuckleBand * 0.035,
        g: g + knuckleBand * 0.01,
        b,
        rough: rough + 0.04,
        metal: 0,
        ao: 0.92 - knuckleBand * 0.06,
        height,
      };
    }

    const ax = Math.abs(u - 0.5);

    // Subtle clean-shaven jawline undertone + faint masculine 5-o'clock shadow
    const jawShade =
      smoothstep(0.47, 0.525, v) *
      (1 - smoothstep(0.58, 0.635, v)) *
      (1 - smoothstep(0.09, 0.19, ax));
    r -= jawShade * 0.048;
    g -= jawShade * 0.05;
    b -= jawShade * 0.034;

    // Defined masculine lips around v ~ 0.572..0.606 (mouth geometry at y ~ 1.651..1.663)
    const lipMask =
      smoothstep(0.568, 0.578, v) *
      (1 - smoothstep(0.594, 0.608, v)) *
      (1 - smoothstep(0.036, 0.052, ax));
    const lipSeam =
      Math.exp(-Math.pow((v - 0.586) / 0.0038, 2)) * (1 - smoothstep(0.034, 0.05, ax));
    r = lerp(r, 0.67, lipMask * 0.84);
    g = lerp(g, 0.40, lipMask * 0.84);
    b = lerp(b, 0.35, lipMask * 0.84);
    r *= 1 - lipSeam * 0.36;
    g *= 1 - lipSeam * 0.38;
    b *= 1 - lipSeam * 0.36;
    rough = lerp(rough, 0.35, lipMask);
    height += lipMask * 0.09 - lipSeam * 0.2;

    // Warm cheek tint
    const cheekDist = Math.hypot((ax - 0.085) / 0.045, (v - 0.66) / 0.045);
    const cheek = Math.max(0, 1 - cheekDist);
    r += cheek * 0.03;
    rough -= cheek * 0.05;

    // Deep-set eye socket shadow (eyes at theta ~ +-0.35 rad => ax ~ 0.056, v ~ 0.722)
    const eyeSocket = Math.exp(
      -Math.pow((ax - 0.056) / 0.028, 2) - Math.pow((v - 0.722) / 0.018, 2)
    );
    ao -= eyeSocket * 0.32;
    r -= eyeSocket * 0.068;
    g -= eyeSocket * 0.072;
    b -= eyeSocket * 0.06;

    // Thick dark masculine eyebrows slightly lower & closer to brow ridge
    const browY =
      0.744 + smoothstep(0.02, 0.064, ax) * 0.007 - smoothstep(0.064, 0.095, ax) * 0.006;
    const browMask =
      (1 - smoothstep(0.0068, 0.0128, Math.abs(v - browY))) *
      smoothstep(0.014, 0.024, ax) *
      (1 - smoothstep(0.082, 0.1, ax));
    const hairGrain = fbm2(u * 260, v * 120, 2);
    const browFactor = clamp01(browMask * (0.88 + hairGrain * 0.28));
    r = lerp(r, 0.065, browFactor);
    g = lerp(g, 0.05, browFactor);
    b = lerp(b, 0.042, browFactor);
    height += browFactor * 0.25;

    // Nostril dark cavity hint (v ~ 0.635, ax ~ 0.018)
    const nostril = Math.exp(
      -Math.pow((ax - 0.018) / 0.008, 2) - Math.pow((v - 0.634) / 0.008, 2)
    );
    ao -= nostril * 0.34;
    r -= nostril * 0.13;
    g -= nostril * 0.13;
    b -= nostril * 0.11;

    // Crisp submental under-chin shadow defining neck boundary
    const underChin = smoothstep(0.475, 0.39, v) * (1 - smoothstep(0.06, 0.17, ax));
    ao -= underChin * 0.24;
    r -= underChin * 0.045;
    g -= underChin * 0.045;
    b -= underChin * 0.038;

    return {
      r,
      g,
      b,
      rough: clamp(rough, 0.2, 0.85),
      metal: 0,
      ao: clamp01(ao),
      height,
    };
  });

  // 1: Hair_PBR
  const hair = buildPBRBundleFromHeight(512, 1.8, (u, v) => {
    const strand = fbm2(u * 95, v * 16, 4);
    const fine = fbm2(u * 210, v * 28, 3);
    const sheen = Math.pow(Math.max(0, 1 - Math.abs(v - 0.58) * 2.1), 2) * strand;
    return {
      r: 0.065 + strand * 0.03 + sheen * 0.025,
      g: 0.052 + strand * 0.024 + sheen * 0.02,
      b: 0.045 + strand * 0.02 + sheen * 0.016,
      rough: 0.44 - sheen * 0.1 + fine * 0.05,
      metal: 0.02,
      ao: 0.78 + strand * 0.22,
      height: strand * 0.65 + fine * 0.35,
    };
  });

  // 2: LeatherJacket_PBR
  const jacket = buildPBRBundleFromHeight(512, 1.25, (u, v) => {
    const pebble = fbm2(u * 150, v * 150, 3);
    const crease = fbm2(u * 12, v * 36, 3);
    const wear = smoothstep(0.46, 0.8, fbm2(u * 7 + 4, v * 7 + 9, 3));

    let r = lerp(0.23, 0.34, wear * 0.7 + crease * 0.3) + (pebble - 0.5) * 0.025;
    let g = lerp(0.14, 0.21, wear * 0.7 + crease * 0.3) + (pebble - 0.5) * 0.018;
    let b = lerp(0.095, 0.145, wear * 0.7 + crease * 0.3) + (pebble - 0.5) * 0.014;
    const rough = lerp(0.46, 0.34, wear * 0.6) + (pebble - 0.5) * 0.05;
    let ao = 0.88 + crease * 0.12;
    let height = pebble * 0.28 + crease * 0.35;

    // Dark leather waist belt band (v in [0.04, 0.16])
    if (v > 0.04 && v < 0.16) {
      r = 0.085 + (pebble - 0.5) * 0.015;
      g = 0.058 + (pebble - 0.5) * 0.012;
      b = 0.045 + (pebble - 0.5) * 0.01;
      ao = 0.94;
    }

    // Subtle tailored leather panel seams
    for (const sb of [0.44, 0.72, 0.92]) {
      if (Math.abs(v - sb) < 0.0024) {
        const dash = Math.sin(u * Math.PI * 190) > 0.0 ? 1 : 0;
        r = lerp(r, 0.44, dash * 0.45);
        g = lerp(g, 0.3, dash * 0.45);
        b = lerp(b, 0.2, dash * 0.45);
        height += dash * 0.16 - 0.08;
        ao *= 0.9;
      }
    }

    return {
      r,
      g,
      b,
      rough: clamp(rough, 0.28, 0.68),
      metal: 0.02,
      ao: clamp01(ao),
      height,
    };
  });

  // 3: BlackTShirt_PBR
  const tshirt = buildPBRBundleFromHeight(512, 1.1, (u, v) => {
    const knit =
      0.5 +
      0.25 * Math.sin(u * Math.PI * 240) * Math.sin(v * Math.PI * 240) +
      0.25 * fbm2(u * 40, v * 40, 2);
    const fold = fbm2(u * 10, v * 22, 3);
    return {
      r: 0.075 + fold * 0.02,
      g: 0.075 + fold * 0.02,
      b: 0.085 + fold * 0.022,
      rough: 0.84 - fold * 0.06,
      metal: 0,
      ao: 0.88 + fold * 0.12,
      height: knit * 0.4 + fold * 0.3,
    };
  });

  // 4: DenimJeans_PBR
  const jeans = buildPBRBundleFromHeight(512, 1.35, (u, v) => {
    const twill = Math.sin((u * 190 + v * 190) * Math.PI) * 0.5 + 0.5;
    const slub = fbm2(u * 55, v * 220, 3);
    const frontWash =
      Math.exp(-Math.pow((u - 0.5) / 0.22, 2) - Math.pow((v - 0.48) / 0.26, 2)) *
      (0.75 + 0.25 * fbm2(u * 14, v * 18, 2));

    let r = lerp(0.095, 0.185, frontWash) + (slub - 0.5) * 0.025;
    let g = lerp(0.145, 0.275, frontWash) + (slub - 0.5) * 0.028;
    let b = lerp(0.24, 0.425, frontWash) + (slub - 0.5) * 0.034;
    const rough = lerp(0.84, 0.72, frontWash);
    const ao = 0.86 + twill * 0.06 + frontWash * 0.08;
    let height = twill * 0.3 + slub * 0.28;

    // Subtle indigo topstitching at outseams/inseams only
    for (const su of [0.248, 0.752]) {
      if (Math.abs(u - su) < 0.0022) {
        const dash = Math.sin(v * Math.PI * 200) > 0.0 ? 1 : 0;
        r = lerp(r, 0.48, dash * 0.55);
        g = lerp(g, 0.35, dash * 0.55);
        b = lerp(b, 0.18, dash * 0.55);
        height += dash * 0.12;
      }
    }

    return { r, g, b, rough, metal: 0.01, ao: clamp01(ao), height };
  });

  // 5: CombatBoots_PBR
  const boots = buildPBRBundleFromHeight(512, 1.4, (u, v) => {
    const grain = fbm2(u * 110, v * 110, 3);
    if (v < 0.22) {
      const lug = Math.sin(u * Math.PI * 36) > 0.15 ? 1 : 0;
      return {
        r: 0.05 + lug * 0.012,
        g: 0.05 + lug * 0.012,
        b: 0.055 + lug * 0.012,
        rough: 0.8,
        metal: 0.01,
        ao: lug ? 0.94 : 0.74,
        height: lug * 0.45,
      };
    }
    return {
      r: 0.072 + (grain - 0.5) * 0.016,
      g: 0.072 + (grain - 0.5) * 0.016,
      b: 0.08 + (grain - 0.5) * 0.018,
      rough: 0.36 + (grain - 0.5) * 0.07,
      metal: 0.03,
      ao: 0.88 + grain * 0.12,
      height: grain * 0.35,
    };
  });

  // 6: Metal_Trim_PBR
  const metalTrim = buildPBRBundleFromHeight(256, 2.0, (u, v) => {
    if (u >= 0.5) {
      const vein = smoothstep(0.62, 0.74, fbm2(u * 24, v * 24, 4));
      return {
        r: lerp(0.06, 0.04, vein),
        g: lerp(0.76, 0.46, vein),
        b: lerp(0.72, 0.44, vein),
        rough: 0.16,
        metal: 0.08,
        ao: 0.96,
        height: 0.5 - vein * 0.15,
      };
    }
    const brush = fbm2(u * 12, v * 220, 2);
    return {
      r: 0.74 + brush * 0.14,
      g: 0.76 + brush * 0.14,
      b: 0.8 + brush * 0.14,
      rough: 0.24 + brush * 0.08,
      metal: 0.92,
      ao: 0.95,
      height: brush * 0.3,
    };
  });

  return [faceSkin, hair, jacket, tshirt, jeans, boots, metalTrim];
}
