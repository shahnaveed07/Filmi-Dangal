import { Quaternion, Vector3 } from '@babylonjs/core';
import {
  BoneAttachmentName,
  FighterId,
  FighterStateName,
} from '../../types/fighter';
import {
  getCharacterAssetConfig,
  mapStateToStandardClipId,
} from '../../config/characterAssets';
import { CharacterRig3D } from '../assets/AssetLoader3D';
import {
  FighterAnimationEventPayload,
  FighterAnimationEvents,
} from './FighterAnimationEvents';

export interface BonePoseTransform {
  rx: number;
  ry: number;
  rz: number;
  px?: number;
  py?: number;
  pz?: number;
  fistCurl?: number;
}

export type RigPoseMap = Record<string, BonePoseTransform>;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep01(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

function interpolatePoseMaps(a: RigPoseMap, b: RigPoseMap, alpha: number): RigPoseMap {
  const t = clamp01(alpha);
  const result: RigPoseMap = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const ba = a[key] || { rx: 0, ry: 0, rz: 0 };
    const bb = b[key] || ba;
    const merged: BonePoseTransform = {
      rx: lerp(ba.rx, bb.rx, t),
      ry: lerp(ba.ry, bb.ry, t),
      rz: lerp(ba.rz, bb.rz, t),
    };
    if (ba.px !== undefined || bb.px !== undefined) {
      merged.px = lerp(ba.px ?? 0, bb.px ?? 0, t);
    }
    if (ba.py !== undefined || bb.py !== undefined) {
      merged.py = lerp(ba.py ?? 0, bb.py ?? 0, t);
    }
    if (ba.pz !== undefined || bb.pz !== undefined) {
      merged.pz = lerp(ba.pz ?? 0, bb.pz ?? 0, t);
    }
    if (ba.fistCurl !== undefined || bb.fistCurl !== undefined) {
      merged.fistCurl = lerp(ba.fistCurl ?? 0, bb.fistCurl ?? 0, t);
    }
    result[key] = merged;
  }
  return result;
}

const CORE_COMPATIBLE_BONES = [
  'Hips',
  'Chest',
  'Head',
  'LeftUpperArm',
  'RightUpperArm',
  'LeftUpperLeg',
  'RightUpperLeg',
] as const;

export function hasCompatibleProceduralBones(
  bones: Record<string, unknown>
): boolean {
  if (!bones) return false;
  let count = 0;
  for (const name of CORE_COMPATIBLE_BONES) {
    if (bones[name]) count++;
  }
  return count >= 5;
}

/**
 * 3D Skeletal Animation State Machine for Fight Fun 2.0.
 * Enforces explicit priority order:
 * Priority 1: Valid imported Blender/Mixamo AnimationGroups with dynamic motion
 * Priority 2: Procedural skeletal bone fallback on resolved humanoid bones (supporting both Quaternion glTF bones and Euler placeholder bones)
 * Priority 3: Safe root-level visual presentation when no skeleton/bones exist
 */
export class AnimationController3D {
  private warnedMissingClips = new Set<string>();

  public updateRigPose(
    rig: CharacterRig3D,
    characterId: FighterId,
    state: FighterStateName,
    stateTimeSec: number,
    dt: number,
    facing: 1 | -1,
    _zVelocity = 0
  ): void {
    if (!rig || !rig.rootNode || !rig.facingNode) return;

    const manifest = getCharacterAssetConfig(characterId);
    const heightScale = (rig.rootNode.metadata?.heightScale as number) || 1.0;

    // Facing rotation around Y axis driven by character manifest
    const rightYaw = manifest?.facingRotationY?.right ?? Math.PI * 0.5;
    const leftYaw = manifest?.facingRotationY?.left ?? -Math.PI * 0.5;
    const targetYaw = facing === 1 ? rightYaw : leftYaw;
    rig.facingNode.rotation.y = lerp(
      rig.facingNode.rotation.y,
      targetYaw,
      Math.min(1, dt * 16)
    );

    if (!rig.rootNode.metadata) {
      rig.rootNode.metadata = {};
    }
    const meta = rig.rootNode.metadata as Record<string, unknown>;
    const prevState = meta.lastAnimState as FighterStateName | undefined;
    const prevStateTime = (meta.lastAnimStateTimeSec as number) ?? 0;
    const isNewStateEntry =
      prevState !== state || stateTimeSec < prevStateTime - 0.02;
    meta.lastAnimState = state;
    meta.lastAnimStateTimeSec = stateTimeSec;

    // Priority 1: Imported Blender/GLB AnimationGroups (regardless of whether renderState is PRODUCTION_SKINNED or VISUAL_ONLY)
    if (!rig.isPlaceholderAsset && (rig.productionRigValid || rig.glbAnimationController)) {
      const standardClipId = mapStateToStandardClipId(state);
      const animSpeed = manifest?.animationSpeed || 1.0;
      const played =
        rig.glbAnimationController?.playClip(
          standardClipId,
          animSpeed,
          isNewStateEntry
        ) ?? false;

      if (played) {
        return;
      }

      // Priority 2 handoff: Imported GLB is missing a usable dynamic clip for this state
      rig.glbAnimationController?.stopAll();
      if (rig.productionRigValid) {
        const warnKey = `${characterId}:${standardClipId}`;
        if (!this.warnedMissingClips.has(warnKey)) {
          this.warnedMissingClips.add(warnKey);
          const msg = `Production GLB for '${characterId}' is missing usable AnimationGroup for state '${state}' (${standardClipId}); falling back to procedural bone pose.`;
          console.warn(`[AnimationController3D] ${msg}`);
          if (
            rig.diagnostics &&
            !rig.diagnostics.warnings.includes(msg)
          ) {
            rig.diagnostics.warnings.push(msg);
          }
        }
      }
    }

    // Priority 2: Procedural Skeletal Bone Fallback (when compatible humanoid bones exist)
    const canDriveBones =
      rig.isPlaceholderAsset ||
      rig.canUseProceduralBoneFallback === true ||
      hasCompatibleProceduralBones(rig.bones);

    if (canDriveBones && hasCompatibleProceduralBones(rig.bones)) {
      const pose = this.computeTargetPose(
        characterId,
        state,
        stateTimeSec,
        heightScale,
        0
      );
      const isCrispStrikeState =
        state === 'punch' ||
        state === 'forward_punch' ||
        state === 'kick' ||
        state === 'forward_kick' ||
        state === 'grab' ||
        state === 'grabbed';
      const blendSpeed =
        isNewStateEntry && isCrispStrikeState
          ? 0.92
          : Math.min(1, dt * (isCrispStrikeState ? 48 : 18));
      this.applyProceduralPoseToRigBones(rig, pose, heightScale, blendSpeed);
      return;
    }

    // Priority 3: Safe Visual-Only Presentation (only when neither imported clips nor resolved humanoid bones exist)
    if (rig.isVisualOnly || rig.renderState === 'VISUAL_ONLY') {
      this.updateVisualOnlyPresentation(rig, characterId, state, stateTimeSec, dt);
    }
  }

  /**
   * Drives resolved humanoid bones on either an imported glTF Quaternion rig (Mixamo/Blender)
   * or a procedural Euler placeholder rig without mutating calibrated model scale or groundOffset.
   */
  public applyProceduralPoseToRigBones(
    rig: CharacterRig3D,
    pose: RigPoseMap,
    heightScale: number,
    blendSpeed: number
  ): void {
    if (!rig.bones || Object.keys(rig.bones).length === 0) return;

    // Preserve calibrated scale and groundOffset on modelTransformNode
    if (rig.modelTransformNode && !rig.isPlaceholderAsset) {
      const calScale =
        (rig.modelTransformNode.metadata?.calibratedScale as number) ??
        (rig.rootNode.metadata?.manifestScale as number) ??
        rig.modelTransformNode.scaling.y;
      const calOffset =
        (rig.modelTransformNode.metadata?.calibratedGroundOffset as number) ??
        (rig.rootNode.metadata?.groundOffset as number) ??
        rig.modelTransformNode.position.y;
      rig.modelTransformNode.scaling.setAll(calScale);
      rig.modelTransformNode.position.set(0, calOffset, 0);
      rig.modelTransformNode.rotation.set(0, 0, 0);
    }

    for (const [boneName, target] of Object.entries(pose)) {
      const node = rig.bones[boneName];
      if (!node) continue;

      const isImportedBone = Boolean(node.metadata?.isImportedBone);
      if (isImportedBone) {
        const standLocalQuat =
          (node.metadata?.standLocalQuat as Quaternion | undefined) ||
          node.rotationQuaternion ||
          Quaternion.Identity();
        const standRootQuat =
          (node.metadata?.standRootQuat as Quaternion | undefined) ||
          Quaternion.Identity();
        const standLocalPos =
          (node.metadata?.standLocalPos as Vector3 | undefined) || node.position;

        // Convert character-space target rotation into bone local frame via root-space similarity transform
        const qDeltaRoot = Quaternion.RotationYawPitchRoll(
          -target.ry,
          target.rx,
          -target.rz
        );
        const qRootInv = Quaternion.Inverse(standRootQuat);
        const qLocalDelta = qRootInv.multiply(qDeltaRoot).multiply(standRootQuat);
        const qTargetLocal = standLocalQuat.multiply(qLocalDelta);

        if (!node.rotationQuaternion) {
          node.rotationQuaternion = qTargetLocal.clone();
        } else {
          Quaternion.SlerpToRef(
            node.rotationQuaternion,
            qTargetLocal,
            blendSpeed,
            node.rotationQuaternion
          );
        }

        // Also update Euler vector properties for telemetry and test compatibility
        node.rotation.x = lerp(node.rotation.x, target.rx, blendSpeed);
        node.rotation.y = lerp(node.rotation.y, target.ry, blendSpeed);
        node.rotation.z = lerp(node.rotation.z, target.rz, blendSpeed);

        if (boneName === 'Hips') {
          const baseHipsY = 0.95 * heightScale;
          const targetHipsY = target.py ?? baseHipsY;
          const desiredLocalY =
            standLocalPos.y + (targetHipsY - baseHipsY) * 0.34;
          node.position.x = lerp(
            node.position.x,
            standLocalPos.x + (target.px ?? 0) * 0.34,
            blendSpeed
          );
          node.position.y = lerp(node.position.y, desiredLocalY, blendSpeed);
          node.position.z = standLocalPos.z;
        }
        continue;
      }

      node.rotation.x = lerp(node.rotation.x, target.rx, blendSpeed);
      node.rotation.y = lerp(node.rotation.y, target.ry, blendSpeed);
      node.rotation.z = lerp(node.rotation.z, target.rz, blendSpeed);

      if (target.px !== undefined) {
        node.position.x = lerp(node.position.x, target.px, blendSpeed);
      }
      if (target.py !== undefined) {
        node.position.y = lerp(node.position.y, target.py, blendSpeed);
      }
      if (target.pz !== undefined) {
        node.position.z = lerp(node.position.z, target.pz, blendSpeed);
      }
    }

    this.applyHandFistCurl(
      rig,
      'Left',
      pose.LeftHand?.fistCurl ?? 0,
      blendSpeed
    );
    this.applyHandFistCurl(
      rig,
      'Right',
      pose.RightHand?.fistCurl ?? 0,
      blendSpeed
    );
  }

  /**
   * Curls or relaxes Mixamo finger phalanges (`Index1..3`, `Middle1..3`, `Ring1..3`, `Pinky1..3`, `Thumb1..3`)
   * so the character forms tight closed fists during combat attacks and relaxes fingers during idle poses.
   */
  private applyHandFistCurl(
    rig: CharacterRig3D,
    side: 'Left' | 'Right',
    fistCurl: number,
    blendSpeed: number
  ): void {
    if (!rig.rootNode) return;
    if (!rig.rootNode.metadata) {
      rig.rootNode.metadata = {};
    }
    const meta = rig.rootNode.metadata as Record<string, unknown>;
    let fingerCache = meta.fingerNodesCache as
      | Record<'Left' | 'Right', Array<{ node: CharacterRig3D['rootNode']; isThumb: boolean; phalanxIndex: number }>>
      | undefined;

    if (!fingerCache) {
      fingerCache = { Left: [], Right: [] };
      const allNodes = rig.rootNode.getChildTransformNodes(false);
      for (const n of allNodes) {
        for (const s of ['Left', 'Right'] as const) {
          const prefix = `mixamorig:${s}Hand`;
          if (n.name.startsWith(prefix) && n.name.length > prefix.length) {
            const suffix = n.name.slice(prefix.length);
            const isThumb = suffix.startsWith('Thumb');
            const digitChar = suffix.charAt(suffix.length - 1);
            const phalanxIndex = Number.parseInt(digitChar, 10) || 1;
            if (!n.metadata) n.metadata = {};
            if (!n.metadata.fingerBindQuat && n.rotationQuaternion) {
              n.metadata.fingerBindQuat = n.rotationQuaternion.clone();
            }
            fingerCache[s].push({ node: n, isThumb, phalanxIndex });
          }
        }
      }
      meta.fingerNodesCache = fingerCache;
    }

    const entries = fingerCache[side];
    if (!entries || entries.length === 0) return;

    const curlAmount = clamp01(fistCurl);
    for (const { node, isThumb, phalanxIndex } of entries) {
      const bindQuat =
        (node.metadata?.fingerBindQuat as Quaternion | undefined) ||
        node.rotationQuaternion;
      if (!bindQuat) continue;

      let targetQuat = bindQuat;
      if (curlAmount > 0.001) {
        let curlDelta: Quaternion;
        if (isThumb) {
          const thumbAxis = new Vector3(
            0.35,
            0,
            side === 'Right' ? 0.75 : -0.75
          ).normalize();
          const thumbAngle =
            (phalanxIndex === 1 ? 0.65 : 0.95) * curlAmount;
          curlDelta = Quaternion.RotationAxis(thumbAxis, thumbAngle);
        } else {
          const fingerAngle =
            (phalanxIndex === 1 ? 1.38 : phalanxIndex === 2 ? 1.52 : 1.35) *
            curlAmount;
          curlDelta = Quaternion.RotationAxis(Vector3.Right(), fingerAngle);
        }
        targetQuat = bindQuat.multiply(curlDelta);
      }

      if (!node.rotationQuaternion) {
        node.rotationQuaternion = targetQuat.clone();
      } else {
        Quaternion.SlerpToRef(
          node.rotationQuaternion,
          targetQuat,
          blendSpeed,
          node.rotationQuaternion
        );
      }
    }
  }

  /**
   * Safe root-level visual presentation for visual-only 3D models (lacking bone skeleton/skinning).
   * Applies subtle breathing, stepping, crouch, and attack impulse offsets to `modelTransformNode`
   * while leaving `rootNode.position` strictly under the control of 2D X/Y gameplay physics.
   */
  public updateVisualOnlyPresentation(
    rig: CharacterRig3D,
    characterId: FighterId,
    state: FighterStateName,
    stateTimeSec: number,
    dt: number
  ): void {
    if (!rig.modelTransformNode) return;
    const manifest = getCharacterAssetConfig(characterId);
    const baseGroundOffset =
      (rig.modelTransformNode.metadata?.calibratedGroundOffset as number) ??
      (rig.rootNode.metadata?.groundOffset as number) ??
      manifest?.groundOffset ??
      0.0;
    const baseScale =
      (rig.modelTransformNode.metadata?.calibratedScale as number) ??
      (rig.rootNode.metadata?.manifestScale as number) ??
      manifest?.scale ??
      1.94;

    // Maintain calibrated base scale
    rig.modelTransformNode.scaling.setAll(baseScale);

    // Compute state-based dynamic offsets relative to base ground offset
    let targetOffsetY = baseGroundOffset;
    let targetOffsetX = 0;
    let targetRotZ = 0;
    let targetRotX = 0;

    switch (state) {
      case 'idle': {
        const breathing = Math.sin(stateTimeSec * 3.2) * 0.015;
        targetOffsetY = baseGroundOffset + breathing;
        break;
      }
      case 'walk': {
        const stepBob = Math.abs(Math.sin(stateTimeSec * 8.5)) * 0.025;
        const sway = Math.sin(stateTimeSec * 4.25) * 0.015;
        targetOffsetY = baseGroundOffset + stepBob;
        targetRotZ = sway;
        break;
      }
      case 'run': {
        const stepBob = Math.abs(Math.sin(stateTimeSec * 13)) * 0.04;
        const sway = Math.sin(stateTimeSec * 6.5) * 0.025;
        targetOffsetY = baseGroundOffset + stepBob;
        targetOffsetX = 0.04;
        targetRotZ = sway;
        targetRotX = -0.06;
        break;
      }
      case 'crouch': {
        targetOffsetY = baseGroundOffset - 0.22;
        targetRotX = 0.08;
        break;
      }
      case 'jump': {
        // Vertical arc handled by rootNode.position.y in 2D physics or preview
        targetOffsetY = baseGroundOffset;
        targetRotX = -0.05;
        break;
      }
      case 'block': {
        targetOffsetY = baseGroundOffset - 0.05;
        targetOffsetX = -0.03;
        targetRotZ = 0.04;
        break;
      }
      case 'punch': {
        const punchPhase = Math.sin(Math.min(Math.PI, stateTimeSec * 12));
        targetOffsetX = 0.07 * punchPhase;
        targetOffsetY = baseGroundOffset - 0.02 * punchPhase;
        targetRotZ = -0.03 * punchPhase;
        break;
      }
      case 'kick': {
        const kickPhase = Math.sin(Math.min(Math.PI, stateTimeSec * 10));
        targetOffsetX = 0.09 * kickPhase;
        targetOffsetY = baseGroundOffset + 0.04 * kickPhase;
        targetRotZ = 0.05 * kickPhase;
        break;
      }
      case 'grab': {
        const grabPhase = Math.sin(Math.min(Math.PI, stateTimeSec * 8));
        targetOffsetX = 0.06 * grabPhase;
        break;
      }
      case 'hurt':
      case 'knockback': {
        targetOffsetX = -0.08;
        targetRotX = 0.12;
        targetOffsetY = baseGroundOffset - 0.04;
        break;
      }
      case 'knockdown': {
        targetOffsetY = baseGroundOffset - 0.45;
        targetRotX = 0.35;
        break;
      }
      case 'recovery': {
        targetOffsetY = baseGroundOffset - 0.15;
        break;
      }
      case 'super_shot': {
        const shotPhase = Math.sin(Math.min(Math.PI, stateTimeSec * 4));
        targetOffsetX = 0.05 * shotPhase;
        targetOffsetY = baseGroundOffset + 0.03 * shotPhase;
        break;
      }
      case 'super_move': {
        const movePhase = Math.sin(stateTimeSec * 6);
        targetOffsetX = 0.08 * Math.sin(stateTimeSec * 8);
        targetOffsetY = baseGroundOffset + 0.05 * Math.abs(movePhase);
        break;
      }
      case 'victory': {
        const vicBob = Math.sin(stateTimeSec * 4) * 0.02;
        targetOffsetY = baseGroundOffset + 0.03 + vicBob;
        break;
      }
      case 'defeat': {
        targetOffsetY = baseGroundOffset - 0.35;
        targetRotX = 0.25;
        break;
      }
      default:
        targetOffsetY = baseGroundOffset;
        break;
    }

    const blendSpeed = Math.min(1, dt * 18);
    rig.modelTransformNode.position.y = lerp(
      rig.modelTransformNode.position.y,
      targetOffsetY,
      blendSpeed
    );
    rig.modelTransformNode.position.x = lerp(
      rig.modelTransformNode.position.x,
      targetOffsetX,
      blendSpeed
    );
    rig.modelTransformNode.position.z = 0; // Strictly on Z = 0
    rig.modelTransformNode.rotation.z = lerp(
      rig.modelTransformNode.rotation.z,
      targetRotZ,
      blendSpeed
    );
    rig.modelTransformNode.rotation.x = lerp(
      rig.modelTransformNode.rotation.x,
      targetRotX,
      blendSpeed
    );
  }

  public getSocketWorldPosition(
    rig: CharacterRig3D,
    boneName: BoneAttachmentName
  ): Vector3 {
    const socket = rig.sockets[boneName] || rig.rootNode;
    socket.computeWorldMatrix(true);
    return socket.getAbsolutePosition().clone();
  }

  public computeTargetPose(
    characterId: FighterId,
    state: FighterStateName,
    t: number,
    heightScale = 1.0,
    _zVel = 0,
    eventPayload?: FighterAnimationEventPayload
  ): RigPoseMap {
    const baseHipsY = 0.95 * heightScale;
    const pose: RigPoseMap = {
      Hips: { rx: 0, ry: 0, rz: 0, px: 0, py: baseHipsY, pz: 0 },
      Spine: { rx: 0, ry: 0, rz: 0 },
      Chest: { rx: 0, ry: 0, rz: 0 },
      Neck: { rx: 0, ry: 0, rz: 0 },
      Head: { rx: 0, ry: 0, rz: 0 },
      LeftShoulder: { rx: 0, ry: 0, rz: 0 },
      LeftUpperArm: { rx: 0.25, ry: 0, rz: 0.28 },
      LeftLowerArm: { rx: -0.65, ry: 0, rz: 0 },
      LeftHand: { rx: 0, ry: 0, rz: 0 },
      RightShoulder: { rx: 0, ry: 0, rz: 0 },
      RightUpperArm: { rx: 0.25, ry: 0, rz: -0.28 },
      RightLowerArm: { rx: -0.65, ry: 0, rz: 0 },
      RightHand: { rx: 0, ry: 0, rz: 0 },
      LeftUpperLeg: { rx: -0.12, ry: 0, rz: 0.06 },
      LeftLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
      LeftFoot: { rx: -0.1, ry: 0, rz: 0 },
      RightUpperLeg: { rx: 0.14, ry: 0, rz: -0.06 },
      RightLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
      RightFoot: { rx: -0.1, ry: 0, rz: 0 },
    };

    switch (state) {
      case 'idle': {
        const breath = Math.sin(t * 4.2);
        const sway = Math.cos(t * 2.1);

        if (characterId === 'action_sultan') {
          // AS IDLE – Iconic "Hands-in-Pockets" 3.0-second seamless loop (Storyboard Frames 1–6)
          const loopDuration = 3.0;
          const cycleT = ((t % loopDuration) + loopDuration) % loopDuration;
          const loopPhase = (cycleT / loopDuration) * Math.PI * 2;

          // Smooth Hermite helper for controlled head-turn and settle transitions
          const smooth01 = (x: number): number => {
            const c = Math.max(0, Math.min(1, x));
            return c * c * (3 - 2 * c);
          };

          // Continuous subtle breathing across the 3.0s loop:
          // Rises naturally through Frame 2 (0.5s inhalation), stays composed during the 1.0–1.5s hold,
          // and settles seamlessly back to neutral at 3.0s (periodic C-infinity wave).
          const breathWave =
            0.65 * Math.sin(loopPhase) + 0.35 * Math.sin(loopPhase * 2);
          const breathInhale = Math.max(0, breathWave);

          // 6-Frame Head & Chin Choreography:
          // Frame 1 (0.0–0.5s): Initial stance / settle, head facing forward, calm confident gaze.
          // Frame 2 (0.5s): Subtle inhalation (chest rises slightly, shoulders respond subtly).
          // Frame 3 (0.5–1.0s): Smoothly turn head slightly to the side with subtle chin angle change.
          // Frame 4 (1.0–1.5s): Confident attitude hold on the side-facing look while breathing continues.
          // Frame 5 (1.5–2.2s): Smoothly return head and eyes back to front without sudden movement.
          // Frame 6 (2.2–3.0s): Settle in neutral forward idle pose and blend seamlessly into 0.0s.
          let headTurnFactor = 0;
          let attitudeTiltFactor = 0;
          if (cycleT >= 0.5 && cycleT < 1.0) {
            headTurnFactor = smooth01((cycleT - 0.5) / 0.5);
            attitudeTiltFactor = smooth01((cycleT - 0.5) / 0.5);
          } else if (cycleT >= 1.0 && cycleT < 1.5) {
            const holdMicro = Math.sin(((cycleT - 1.0) / 0.5) * Math.PI);
            headTurnFactor = 1.0 + holdMicro * 0.05;
            attitudeTiltFactor = 1.0 + holdMicro * 0.08;
          } else if (cycleT >= 1.5 && cycleT < 2.2) {
            const returnProgress = 1.0 - smooth01((cycleT - 1.5) / 0.7);
            headTurnFactor = returnProgress;
            attitudeTiltFactor = returnProgress;
          }

          const totalHeadYaw = 0.145 * headTurnFactor; // Subtle natural side scan (~8.3 deg)
          const totalHeadPitch =
            -0.042 - 0.016 * attitudeTiltFactor - breathWave * 0.005; // Chin slightly raised
          const totalHeadRoll = -0.024 * attitudeTiltFactor; // Subtle confident attitude tilt

          // Hips: almost stationary, tiny natural weight adjustment, no lateral sliding
          pose.Hips.px = Math.sin(loopPhase) * 0.002;
          pose.Hips.py = baseHipsY + breathWave * 0.004;
          pose.Hips.pz = 0;
          pose.Hips.rx = 0;
          pose.Hips.ry = -0.025 + Math.sin(loopPhase) * 0.006;
          pose.Hips.rz = 0;

          // Spine & Chest: upright dominant posture with chest slightly pushed forward + subtle breathing
          pose.Spine = {
            rx: -0.018 - breathWave * 0.01,
            ry: 0,
            rz: 0,
          };
          pose.Chest = {
            rx: -0.042 - breathWave * 0.02,
            ry: 0.015,
            rz: 0,
          };

          // Shoulders: relaxed but slightly pulled backward, subtle rise with inhalation
          pose.LeftShoulder = {
            rx: -0.015 - breathInhale * 0.008,
            ry: -0.065,
            rz: -0.015 - breathInhale * 0.008,
          };
          pose.RightShoulder = {
            rx: -0.015 - breathInhale * 0.008,
            ry: 0.065,
            rz: 0.015 + breathInhale * 0.008,
          };

          // Upper Arms, Forearms & Hands: calibrated so elbows angle naturally outward (|x| ~ 0.25m)
          // while forearms angle inward (ry = 0 to avoid twisting the elbow axis) and both hands
          // tuck directly into the front jeans pockets (wrist x ~ +-0.15m, fingers x ~ +-0.11m, y ~ 1.07m -> 0.94m).
          pose.LeftUpperArm = {
            rx: 0.08 - breathWave * 0.005,
            ry: 0,
            rz: -0.06 - breathInhale * 0.005,
          };
          pose.LeftLowerArm = {
            rx: -0.15 + breathWave * 0.005,
            ry: 0,
            rz: 0.7,
          };
          pose.LeftHand = { rx: 0.06, ry: 0, rz: -0.16 };

          pose.RightUpperArm = {
            rx: 0.08 - breathWave * 0.005,
            ry: 0,
            rz: 0.06 + breathInhale * 0.005,
          };
          pose.RightLowerArm = {
            rx: -0.15 + breathWave * 0.005,
            ry: 0,
            rz: -0.7,
          };
          pose.RightHand = { rx: 0.06, ry: 0, rz: 0.16 };

          // Neck & Head: smooth side turn, confident hold, and smooth return to front
          pose.Neck = {
            rx: totalHeadPitch * 0.35,
            ry: totalHeadYaw * 0.4,
            rz: totalHeadRoll * 0.35,
          };
          pose.Head = {
            rx: totalHeadPitch * 0.65,
            ry: totalHeadYaw * 0.6,
            rz: totalHeadRoll * 0.65,
          };

          // Legs & Feet: shoulder-width apart, planted firmly on the ground with zero sliding
          pose.LeftUpperLeg = { rx: 0, ry: 0, rz: 0 };
          pose.LeftLowerLeg = { rx: 0, ry: 0, rz: 0 };
          pose.LeftFoot = { rx: 0, ry: 0, rz: 0 };
          pose.RightUpperLeg = { rx: 0, ry: 0, rz: 0 };
          pose.RightLowerLeg = { rx: 0, ry: 0, rz: 0 };
          pose.RightFoot = { rx: 0, ry: 0, rz: 0 };
        } else if (characterId === 'romance_raja') {
          pose.Hips.py = baseHipsY + breath * 0.03;
          pose.Hips.ry = -0.3;
          pose.Chest.ry = 0.28 + sway * 0.05;
          pose.Head.ry = -0.15;
          pose.LeftUpperArm = { rx: -0.5, ry: 0.35, rz: 0.55 + breath * 0.06 };
          pose.LeftLowerArm = { rx: -0.95, ry: 0, rz: 0 };
          pose.RightUpperArm = { rx: -0.75, ry: -0.25, rz: -0.35 };
          pose.RightLowerArm = { rx: -1.45, ry: 0, rz: 0 };
        } else if (characterId === 'duggu') {
          const bounce = Math.abs(Math.sin(t * 6.5));
          pose.Hips.py = baseHipsY - 0.04 + bounce * 0.055;
          pose.Hips.ry = Math.sin(t * 3.25) * 0.22;
          pose.Chest.ry = -Math.sin(t * 3.25) * 0.18;
          pose.LeftUpperArm = { rx: -0.8, ry: 0.2, rz: 0.45 };
          pose.LeftLowerArm = { rx: -1.5, ry: 0, rz: 0 };
          pose.RightUpperArm = { rx: -0.6, ry: -0.2, rz: -0.48 };
          pose.RightLowerArm = { rx: -1.35, ry: 0, rz: 0 };
        } else {
          // Bhidu — Relaxed confident Jackie Shroff street-hero stance
          pose.Hips.py = baseHipsY - 0.02 + breath * 0.02;
          pose.Hips.ry = -0.18;
          pose.Chest.rx = -0.05;
          pose.Chest.rz = sway * 0.04;
          pose.Head.rx = -0.06;
          pose.LeftUpperArm = { rx: -0.32, ry: 0.15, rz: 0.44 };
          pose.LeftLowerArm = { rx: -0.85, ry: 0, rz: 0 };
          pose.RightUpperArm = { rx: -0.38, ry: -0.15, rz: -0.44 };
          pose.RightLowerArm = { rx: -0.95, ry: 0, rz: 0 };
        }
        break;
      }

      case 'walk':
      case 'walk_forward':
      case 'walk_backward': {
        const dir = state === 'walk_backward' ? -1 : 1;
        if (characterId === 'action_sultan') {
          // ACTION SULTAN WALK – 1.15s cycle (distinct from 0.60s Sprint: ~1.92x slower cadence,
          // relaxed upright posture, smaller strides, lower knee lift, and calm arm swing)
          const walkCycleSec = 1.15;
          const phase = ((t * dir) / walkCycleSec) * Math.PI * 2;
          const s = Math.sin(phase);
          const c = Math.cos(phase);

          pose.Hips.px = 0;
          pose.Hips.py = baseHipsY - 0.026 + Math.abs(c) * 0.028;
          pose.Hips.pz = 0;
          pose.Hips.rx = dir * 0.02;
          pose.Hips.ry = s * 0.12;
          pose.Hips.rz = c * 0.02;

          pose.Spine = { rx: dir * 0.035, ry: -s * 0.05, rz: 0 };
          pose.Chest = { rx: dir * 0.055, ry: -s * 0.14, rz: -c * 0.015 };
          pose.Neck = { rx: -dir * 0.02, ry: s * 0.05, rz: 0 };
          pose.Head = { rx: -dir * 0.035, ry: s * 0.07, rz: 0 };

          pose.LeftShoulder = { rx: -0.02, ry: s * 0.08, rz: -0.03 };
          pose.LeftUpperArm = { rx: -0.26 - s * 0.28, ry: 0.12, rz: 0.24 };
          pose.LeftLowerArm = { rx: -0.78, ry: 0, rz: 0.18 };
          pose.LeftHand = { rx: 0.04, ry: 0, rz: 0, fistCurl: 0.35 };

          pose.RightShoulder = { rx: -0.02, ry: s * 0.08, rz: 0.03 };
          pose.RightUpperArm = { rx: -0.26 + s * 0.28, ry: -0.12, rz: -0.24 };
          pose.RightLowerArm = { rx: -0.78, ry: 0, rz: -0.18 };
          pose.RightHand = { rx: 0.04, ry: 0, rz: 0, fistCurl: 0.35 };

          pose.LeftUpperLeg = { rx: s * 0.46, ry: 0, rz: 0.04 };
          pose.LeftLowerLeg = { rx: Math.max(0.08, -c * 0.42 + 0.26), ry: 0, rz: 0 };
          pose.LeftFoot = { rx: -s * 0.14, ry: 0, rz: 0 };

          pose.RightUpperLeg = { rx: -s * 0.46, ry: 0, rz: -0.04 };
          pose.RightLowerLeg = { rx: Math.max(0.08, c * 0.42 + 0.26), ry: 0, rz: 0 };
          pose.RightFoot = { rx: s * 0.14, ry: 0, rz: 0 };
          break;
        }

        const freq = characterId === 'bhidu' ? 6.8 : 9.5;
        const cycle = t * freq * dir;
        const s = Math.sin(cycle);
        const c = Math.cos(cycle);

        pose.Hips.py = baseHipsY - 0.03 + Math.abs(c) * 0.045;
        pose.Hips.ry = s * 0.16;
        pose.Chest.rx = dir * 0.12;
        pose.Chest.ry = -s * 0.18;
        if (characterId === 'bhidu') {
          pose.Chest.rz = s * 0.08;
        }

        pose.LeftUpperLeg = { rx: s * 0.58, ry: 0, rz: 0.05 };
        pose.LeftLowerLeg = { rx: Math.max(0.1, -c * 0.55 + 0.35), ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -s * 0.58, ry: 0, rz: -0.05 };
        pose.RightLowerLeg = { rx: Math.max(0.1, c * 0.55 + 0.35), ry: 0, rz: 0 };

        pose.LeftUpperArm = { rx: -0.55 - s * 0.35, ry: 0.2, rz: 0.32 };
        pose.LeftLowerArm = { rx: -1.25, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -0.55 + s * 0.35, ry: -0.2, rz: -0.32 };
        pose.RightLowerArm = { rx: -1.25, ry: 0, rz: 0 };
        break;
      }

      case 'run': {
        if (characterId === 'action_sultan') {
          // ACTION SULTAN SPRINT ANIMATION (FAST RUN) – 0.60s cycle (~1.92x walk cadence)
          // 8-Frame Storyboard Sequence:
          // Frame 1 (0.000s): Left Foot Contact (left foot plants, right leg moves forward, forward lean, right arm forward / left arm back)
          // Frame 2 (0.075s): Push-off (left foot pushes firmly against ground, right knee drives upward, arms accelerate in opposition)
          // Frame 3 (0.150s): Flight Phase (both feet briefly leave ground, right knee high forward drive, left leg extended back)
          // Frame 4 (0.225s): Right Foot Landing (right foot plants, weight transfers to right leg, left leg starts moving forward, arms reverse)
          // Frame 5 (0.300s): Right Leg Drive (right foot pushes off, left knee drives upward/forward, strong running posture)
          // Frame 6 (0.375s): Flight Phase (both feet briefly leave ground, left leg forward, right leg extended back, arms alternate)
          // Frame 7 (0.450s): Left Foot Landing (left foot contacts ground, weight transfers naturally, prepare for next stride)
          // Frame 8 (0.525–0.600s): Cycle Transition (mid-stance recovery returning seamlessly to Frame 1 at 0.600s without reset)
          const sprintCycleSec = 0.6;
          const cycleT = ((t % sprintCycleSec) + sprintCycleSec) % sprintCycleSec;

          const frame1LeftContact: RigPoseMap = {
            Hips: { rx: 0.08, ry: -0.18, rz: 0.03, px: 0.015, py: baseHipsY - 0.038, pz: 0 },
            Spine: { rx: 0.15, ry: 0.06, rz: 0 },
            Chest: { rx: 0.2, ry: 0.16, rz: -0.02 },
            Neck: { rx: -0.1, ry: -0.05, rz: 0 },
            Head: { rx: -0.16, ry: -0.06, rz: 0 },
            LeftShoulder: { rx: 0.04, ry: -0.16, rz: -0.05 },
            LeftUpperArm: { rx: 0.46, ry: 0.14, rz: 0.22 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.2 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.06, ry: -0.18, rz: 0.05 },
            RightUpperArm: { rx: -0.84, ry: -0.16, rz: -0.22 },
            RightLowerArm: { rx: -1.56, ry: 0, rz: -0.24 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: -0.56, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.34, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 1.18, ry: 0, rz: 0 },
            RightFoot: { rx: 0.22, ry: 0, rz: 0 },
          };

          const frame2LeftPushOff: RigPoseMap = {
            Hips: { rx: 0.1, ry: 0.14, rz: 0.02, px: 0.03, py: baseHipsY - 0.012, pz: 0 },
            Spine: { rx: 0.16, ry: -0.05, rz: 0 },
            Chest: { rx: 0.21, ry: -0.14, rz: 0.02 },
            Neck: { rx: -0.1, ry: 0.04, rz: 0 },
            Head: { rx: -0.16, ry: 0.05, rz: 0 },
            LeftShoulder: { rx: -0.08, ry: 0.18, rz: -0.05 },
            LeftUpperArm: { rx: -0.94, ry: 0.16, rz: 0.22 },
            LeftLowerArm: { rx: -1.58, ry: 0, rz: 0.24 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: 0.05, ry: 0.18, rz: 0.05 },
            RightUpperArm: { rx: 0.56, ry: -0.14, rz: -0.22 },
            RightLowerArm: { rx: -1.52, ry: 0, rz: -0.2 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: 0.22, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.14, ry: 0, rz: 0 },
            LeftFoot: { rx: 0.38, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.96, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 1.42, ry: 0, rz: 0 },
            RightFoot: { rx: -0.18, ry: 0, rz: 0 },
          };

          const frame3FlightRightLead: RigPoseMap = {
            Hips: { rx: 0.11, ry: 0.24, rz: 0, px: 0.035, py: baseHipsY + 0.045, pz: 0 },
            Spine: { rx: 0.16, ry: -0.08, rz: 0 },
            Chest: { rx: 0.22, ry: -0.22, rz: 0.03 },
            Neck: { rx: -0.11, ry: 0.07, rz: 0 },
            Head: { rx: -0.17, ry: 0.09, rz: 0 },
            LeftShoulder: { rx: -0.1, ry: 0.24, rz: -0.06 },
            LeftUpperArm: { rx: -1.12, ry: 0.18, rz: 0.24 },
            LeftLowerArm: { rx: -1.62, ry: 0, rz: 0.26 },
            LeftHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: 0.06, ry: 0.22, rz: 0.06 },
            RightUpperArm: { rx: 0.68, ry: -0.16, rz: -0.24 },
            RightLowerArm: { rx: -1.48, ry: 0, rz: -0.18 },
            RightHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: 0.76, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.42, ry: 0, rz: 0 },
            LeftFoot: { rx: 0.46, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -1.14, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 1.02, ry: 0, rz: 0 },
            RightFoot: { rx: -0.22, ry: 0, rz: 0 },
          };

          const frame4RightLanding: RigPoseMap = {
            Hips: { rx: 0.08, ry: 0.18, rz: -0.03, px: 0.015, py: baseHipsY - 0.038, pz: 0 },
            Spine: { rx: 0.15, ry: -0.06, rz: 0 },
            Chest: { rx: 0.2, ry: -0.16, rz: 0.02 },
            Neck: { rx: -0.1, ry: 0.05, rz: 0 },
            Head: { rx: -0.16, ry: 0.06, rz: 0 },
            LeftShoulder: { rx: 0.04, ry: 0.16, rz: -0.05 },
            LeftUpperArm: { rx: 0.46, ry: 0.14, rz: 0.22 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.2 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.06, ry: 0.18, rz: 0.05 },
            RightUpperArm: { rx: -0.84, ry: -0.16, rz: -0.22 },
            RightLowerArm: { rx: -1.56, ry: 0, rz: -0.24 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: 0.34, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 1.18, ry: 0, rz: 0 },
            LeftFoot: { rx: 0.22, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.56, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            RightFoot: { rx: -0.08, ry: 0, rz: 0 },
          };

          const frame5RightDrive: RigPoseMap = {
            Hips: { rx: 0.1, ry: -0.14, rz: -0.02, px: 0.03, py: baseHipsY - 0.012, pz: 0 },
            Spine: { rx: 0.16, ry: 0.05, rz: 0 },
            Chest: { rx: 0.21, ry: 0.14, rz: -0.02 },
            Neck: { rx: -0.1, ry: -0.04, rz: 0 },
            Head: { rx: -0.16, ry: -0.05, rz: 0 },
            LeftShoulder: { rx: 0.05, ry: -0.18, rz: -0.05 },
            LeftUpperArm: { rx: 0.56, ry: 0.14, rz: 0.22 },
            LeftLowerArm: { rx: -1.52, ry: 0, rz: 0.2 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.08, ry: -0.18, rz: 0.05 },
            RightUpperArm: { rx: -0.94, ry: -0.16, rz: -0.22 },
            RightLowerArm: { rx: -1.58, ry: 0, rz: -0.24 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: -0.96, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 1.42, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.18, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.22, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 0.14, ry: 0, rz: 0 },
            RightFoot: { rx: 0.38, ry: 0, rz: 0 },
          };

          const frame6FlightLeftLead: RigPoseMap = {
            Hips: { rx: 0.11, ry: -0.24, rz: 0, px: 0.035, py: baseHipsY + 0.045, pz: 0 },
            Spine: { rx: 0.16, ry: 0.08, rz: 0 },
            Chest: { rx: 0.22, ry: 0.22, rz: -0.03 },
            Neck: { rx: -0.11, ry: -0.07, rz: 0 },
            Head: { rx: -0.17, ry: -0.09, rz: 0 },
            LeftShoulder: { rx: 0.06, ry: -0.22, rz: -0.06 },
            LeftUpperArm: { rx: 0.68, ry: 0.16, rz: 0.24 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.18 },
            LeftHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.1, ry: -0.24, rz: 0.06 },
            RightUpperArm: { rx: -1.12, ry: -0.18, rz: -0.24 },
            RightLowerArm: { rx: -1.62, ry: 0, rz: -0.26 },
            RightHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: -1.14, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 1.02, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.22, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.76, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 0.42, ry: 0, rz: 0 },
            RightFoot: { rx: 0.46, ry: 0, rz: 0 },
          };

          const frame7LeftLanding: RigPoseMap = {
            Hips: { rx: 0.09, ry: -0.21, rz: 0.04, px: 0.02, py: baseHipsY - 0.044, pz: 0 },
            Spine: { rx: 0.15, ry: 0.07, rz: 0 },
            Chest: { rx: 0.2, ry: 0.18, rz: -0.02 },
            Neck: { rx: -0.1, ry: -0.06, rz: 0 },
            Head: { rx: -0.16, ry: -0.07, rz: 0 },
            LeftShoulder: { rx: 0.05, ry: -0.18, rz: -0.05 },
            LeftUpperArm: { rx: 0.56, ry: 0.15, rz: 0.22 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.2 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.08, ry: -0.2, rz: 0.05 },
            RightUpperArm: { rx: -0.96, ry: -0.17, rz: -0.22 },
            RightLowerArm: { rx: -1.58, ry: 0, rz: -0.24 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: -0.72, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.36, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.12, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.54, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 1.28, ry: 0, rz: 0 },
            RightFoot: { rx: 0.32, ry: 0, rz: 0 },
          };

          const frame8CycleTransition: RigPoseMap = {
            Hips: { rx: 0.085, ry: -0.195, rz: 0.035, px: 0.018, py: baseHipsY - 0.04, pz: 0 },
            Spine: { rx: 0.15, ry: 0.065, rz: 0 },
            Chest: { rx: 0.2, ry: 0.17, rz: -0.02 },
            Neck: { rx: -0.1, ry: -0.055, rz: 0 },
            Head: { rx: -0.16, ry: -0.065, rz: 0 },
            LeftShoulder: { rx: 0.045, ry: -0.17, rz: -0.05 },
            LeftUpperArm: { rx: 0.51, ry: 0.145, rz: 0.22 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.2 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            RightShoulder: { rx: -0.07, ry: -0.19, rz: 0.05 },
            RightUpperArm: { rx: -0.9, ry: -0.165, rz: -0.22 },
            RightLowerArm: { rx: -1.57, ry: 0, rz: -0.24 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.8 },
            LeftUpperLeg: { rx: -0.64, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.32, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.1, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.44, ry: 0, rz: -0.05 },
            RightLowerLeg: { rx: 1.23, ry: 0, rz: 0 },
            RightFoot: { rx: 0.27, ry: 0, rz: 0 },
          };

          let sprintPose: RigPoseMap;
          if (cycleT < 0.075) {
            sprintPose = interpolatePoseMaps(frame1LeftContact, frame2LeftPushOff, smoothstep01(cycleT / 0.075));
          } else if (cycleT < 0.15) {
            sprintPose = interpolatePoseMaps(frame2LeftPushOff, frame3FlightRightLead, smoothstep01((cycleT - 0.075) / 0.075));
          } else if (cycleT < 0.225) {
            sprintPose = interpolatePoseMaps(frame3FlightRightLead, frame4RightLanding, smoothstep01((cycleT - 0.15) / 0.075));
          } else if (cycleT < 0.3) {
            sprintPose = interpolatePoseMaps(frame4RightLanding, frame5RightDrive, smoothstep01((cycleT - 0.225) / 0.075));
          } else if (cycleT < 0.375) {
            sprintPose = interpolatePoseMaps(frame5RightDrive, frame6FlightLeftLead, smoothstep01((cycleT - 0.3) / 0.075));
          } else if (cycleT < 0.45) {
            sprintPose = interpolatePoseMaps(frame6FlightLeftLead, frame7LeftLanding, smoothstep01((cycleT - 0.375) / 0.075));
          } else if (cycleT < 0.525) {
            sprintPose = interpolatePoseMaps(frame7LeftLanding, frame8CycleTransition, smoothstep01((cycleT - 0.45) / 0.075));
          } else {
            sprintPose = interpolatePoseMaps(frame8CycleTransition, frame1LeftContact, smoothstep01((cycleT - 0.525) / 0.075));
          }

          Object.assign(pose, sprintPose);
          break;
        }

        const cycle = t * 14.0;
        const s = Math.sin(cycle);
        const c = Math.cos(cycle);

        pose.Hips.py = baseHipsY - 0.06 + Math.abs(c) * 0.06;
        pose.Chest.rx = 0.28;
        pose.Chest.ry = -s * 0.25;

        pose.LeftUpperLeg = { rx: s * 0.85, ry: 0, rz: 0.05 };
        pose.LeftLowerLeg = { rx: Math.max(0.15, -c * 0.75 + 0.45), ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -s * 0.85, ry: 0, rz: -0.05 };
        pose.RightLowerLeg = { rx: Math.max(0.15, c * 0.75 + 0.45), ry: 0, rz: 0 };

        pose.LeftUpperArm = { rx: -0.6 - s * 0.55, ry: 0.15, rz: 0.28 };
        pose.LeftLowerArm = { rx: -1.45, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -0.6 + s * 0.55, ry: -0.15, rz: -0.28 };
        pose.RightLowerArm = { rx: -1.45, ry: 0, rz: 0 };
        break;
      }

      case 'jump': {
        pose.Hips.py = baseHipsY + 0.08;
        pose.Chest.rx = 0.18;
        pose.LeftUpperLeg = { rx: -0.75, ry: 0, rz: 0.08 };
        pose.LeftLowerLeg = { rx: 1.15, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -0.45, ry: 0, rz: -0.08 };
        pose.RightLowerLeg = { rx: 0.85, ry: 0, rz: 0 };
        pose.LeftUpperArm = { rx: -1.1, ry: 0.2, rz: 0.45 };
        pose.LeftLowerArm = { rx: -1.1, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -0.95, ry: -0.2, rz: -0.45 };
        pose.RightLowerArm = { rx: -1.2, ry: 0, rz: 0 };
        break;
      }

      case 'crouch': {
        pose.Hips.py = baseHipsY * 0.58;
        pose.Chest.rx = 0.26;
        pose.LeftUpperLeg = { rx: -1.15, ry: 0, rz: 0.12 };
        pose.LeftLowerLeg = { rx: 1.85, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -1.05, ry: 0, rz: -0.12 };
        pose.RightLowerLeg = { rx: 1.75, ry: 0, rz: 0 };
        pose.LeftUpperArm = { rx: -0.75, ry: 0.25, rz: 0.35 };
        pose.LeftLowerArm = { rx: -1.4, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -0.75, ry: -0.25, rz: -0.35 };
        pose.RightLowerArm = { rx: -1.4, ry: 0, rz: 0 };
        break;
      }

      case 'block':
      case 'crouch_block': {
        const isCrouch = state === 'crouch_block';
        pose.Hips.py = isCrouch ? baseHipsY * 0.6 : baseHipsY * 0.92;
        pose.Chest.rx = 0.16;
        pose.LeftUpperArm = { rx: -1.35, ry: 0.55, rz: 0.25 };
        pose.LeftLowerArm = { rx: -1.65, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -1.35, ry: -0.55, rz: -0.25 };
        pose.RightLowerArm = { rx: -1.65, ry: 0, rz: 0 };
        if (isCrouch) {
          pose.LeftUpperLeg = { rx: -1.1, ry: 0, rz: 0.1 };
          pose.LeftLowerLeg = { rx: 1.8, ry: 0, rz: 0 };
          pose.RightUpperLeg = { rx: -1.0, ry: 0, rz: -0.1 };
          pose.RightLowerLeg = { rx: 1.7, ry: 0, rz: 0 };
        }
        break;
      }

      case 'punch':
      case 'forward_punch': {
        const isHeavy = state === 'forward_punch';

        if (characterId === 'action_sultan') {
          // AS RIGHT STRAIGHT PUNCH – ~0.40s fast one-shot (2.0x speed across Storyboard Frames 1–7):
          // Frame 1 (0.00s): Combat Guard (orthodox stance, left fist guarding chin, right fist ready beside jaw, knees slightly bent)
          // Frame 2 (0.05s / story 0.10s): Anticipation / Wind-up (right shoulder pulled back, torso coils away from target, weight shifts slightly to rear leg)
          // Frame 3 (0.10s / story 0.20s): Power Generation (hips & pelvis drive rotation toward target, weight transfers forward, right arm begins straight extension)
          // Frame 4 (0.175s / story 0.35s): Punch Extension (right fist accelerates straight toward opponent, right shoulder rotates forward, left hand guards chin)
          // Frame 5 (0.225s / story 0.45s): Impact / Hit (near-full straight extension at center-line, closed fist faces opponent, shoulder & hip rotation complete)
          // Frame 6 (0.30s / story 0.60s): Retraction (right fist retracts quickly, elbow bends naturally, torso reverses rotation)
          // Frame 7 (0.40s / story 0.80s): Return to Combat Guard (stance, shoulder & hip rotation restored, ready for next move)
          const PUNCH_SPEED = 2.0;
          const punchT = Math.max(0, Math.min(t * PUNCH_SPEED, 0.8));
          const heavyReachBoost = isHeavy ? -0.06 : 0;

          const frame1Guard: RigPoseMap = {
            Hips: { rx: 0, ry: 0.18, rz: 0, px: 0, py: baseHipsY - 0.03, pz: 0 },
            Spine: { rx: 0.03, ry: 0.08, rz: 0 },
            Chest: { rx: 0.05, ry: 0.14, rz: 0 },
            Neck: { rx: 0.03, ry: -0.15, rz: 0 },
            Head: { rx: 0.06, ry: -0.25, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.08, rz: -0.05 },
            LeftUpperArm: { rx: -0.36, ry: 0, rz: 0.14 },
            LeftLowerArm: { rx: -1.46, ry: 0, rz: 0.48 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: 0.08, rz: 0.05 },
            RightUpperArm: { rx: -0.28, ry: 0, rz: -0.1 },
            RightLowerArm: { rx: -1.56, ry: 0, rz: -0.56 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.18, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.16, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
            RightFoot: { rx: -0.18, ry: 0, rz: 0 },
          };

          const frame2Windup: RigPoseMap = {
            Hips: { rx: 0, ry: 0.26, rz: 0, px: -0.018, py: baseHipsY - 0.038, pz: 0 },
            Spine: { rx: 0.02, ry: 0.12, rz: 0 },
            Chest: { rx: 0.04, ry: 0.24, rz: 0 },
            Neck: { rx: 0.03, ry: -0.22, rz: 0 },
            Head: { rx: 0.06, ry: -0.38, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.1, rz: -0.05 },
            LeftUpperArm: { rx: -0.38, ry: 0, rz: 0.16 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.52 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.04, ry: 0.22, rz: 0.06 },
            RightUpperArm: { rx: -0.12, ry: 0, rz: -0.16 },
            RightLowerArm: { rx: -1.62, ry: 0, rz: -0.44 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.14, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.2, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.2, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            RightFoot: { rx: -0.2, ry: 0, rz: 0 },
          };

          const frame3Power: RigPoseMap = {
            Hips: { rx: 0, ry: -0.04, rz: 0, px: 0.008, py: baseHipsY - 0.032, pz: 0 },
            Spine: { rx: 0.04, ry: -0.02, rz: 0 },
            Chest: { rx: 0.07, ry: -0.04, rz: 0 },
            Neck: { rx: 0.03, ry: 0.04, rz: 0 },
            Head: { rx: 0.06, ry: 0.06, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: 0, rz: -0.05 },
            LeftUpperArm: { rx: -0.44, ry: 0, rz: 0.22 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.64 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: -0.06, rz: 0.05 },
            RightUpperArm: { rx: -0.62, ry: 0, rz: 0.08 },
            RightLowerArm: { rx: -1.12, ry: 0, rz: -0.28 },
            RightHand: { rx: 0.05, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.2, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.27, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.18, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.23, ry: 0, rz: 0 },
            RightFoot: { rx: -0.19, ry: 0, rz: 0 },
          };

          const frame4Extend: RigPoseMap = {
            Hips: { rx: 0, ry: -0.18, rz: 0, px: 0.028, py: baseHipsY - 0.036, pz: 0 },
            Spine: { rx: 0.05, ry: -0.11, rz: 0 },
            Chest: { rx: 0.09, ry: -0.2, rz: 0 },
            Neck: { rx: 0.02, ry: 0.18, rz: 0 },
            Head: { rx: 0.05, ry: 0.3, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: 0.06, rz: -0.04 },
            LeftUpperArm: { rx: -0.52, ry: 0, rz: 0.3 },
            LeftLowerArm: { rx: -1.52, ry: 0, rz: 0.78 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: -0.2, rz: 0.04 },
            RightUpperArm: { rx: -1.08 + heavyReachBoost * 0.5, ry: 0, rz: 0.26 },
            RightLowerArm: { rx: -0.42, ry: 0, rz: -0.1 },
            RightHand: { rx: 0.02, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.22, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.29, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.2, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.21, ry: 0, rz: 0 },
            RightFoot: { rx: -0.21, ry: 0, rz: 0 },
          };

          const frame5Impact: RigPoseMap = {
            Hips: { rx: 0, ry: -0.22, rz: 0, px: 0.038, py: baseHipsY - 0.04, pz: 0 },
            Spine: { rx: 0.06, ry: -0.14, rz: 0 },
            Chest: { rx: 0.11, ry: -0.26, rz: 0 },
            Neck: { rx: 0.02, ry: 0.22, rz: 0 },
            Head: { rx: 0.05, ry: 0.36, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: 0.08, rz: -0.04 },
            LeftUpperArm: { rx: -0.56, ry: 0, rz: 0.34 },
            LeftLowerArm: { rx: -1.52, ry: 0, rz: 0.84 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.04, ry: -0.26, rz: 0.04 },
            RightUpperArm: { rx: -1.24 + heavyReachBoost, ry: 0, rz: 0.36 },
            RightLowerArm: { rx: -0.15, ry: 0, rz: -0.05 },
            RightHand: { rx: 0, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.24, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.3, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.22, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.2, ry: 0, rz: 0 },
            RightFoot: { rx: -0.22, ry: 0, rz: 0 },
          };

          const frame6Retract: RigPoseMap = {
            Hips: { rx: 0, ry: 0.02, rz: 0, px: 0.012, py: baseHipsY - 0.034, pz: 0 },
            Spine: { rx: 0.04, ry: 0.01, rz: 0 },
            Chest: { rx: 0.07, ry: 0.02, rz: 0 },
            Neck: { rx: 0.03, ry: -0.02, rz: 0 },
            Head: { rx: 0.06, ry: -0.04, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.02, rz: -0.05 },
            LeftUpperArm: { rx: -0.44, ry: 0, rz: 0.2 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.6 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: -0.04, rz: 0.05 },
            RightUpperArm: { rx: -0.65, ry: 0, rz: 0.06 },
            RightLowerArm: { rx: -1.25, ry: 0, rz: -0.35 },
            RightHand: { rx: 0.06, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.2, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.26, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.18, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.22, ry: 0, rz: 0 },
            RightFoot: { rx: -0.19, ry: 0, rz: 0 },
          };

          let interpolated: RigPoseMap;
          if (punchT < 0.1) {
            // 0.00–0.10s: Establish Combat Guard (0.00–0.03s) then coil smoothly into Wind-up (0.03–0.10s)
            const coilAlpha = punchT <= 0.03 ? 0 : smoothstep01((punchT - 0.03) / 0.07);
            interpolated = interpolatePoseMaps(frame1Guard, frame2Windup, coilAlpha);
          } else if (punchT < 0.2) {
            // 0.10–0.20s: Wind-up -> Power Generation (accelerating hip & torso drive)
            const u = clamp01((punchT - 0.1) / 0.1);
            const accelAlpha = Math.pow(u, 1.35);
            interpolated = interpolatePoseMaps(frame2Windup, frame3Power, accelAlpha);
          } else if (punchT < 0.35) {
            // 0.20–0.35s: Power Generation -> Punch Extension (high-velocity straight punch acceleration)
            const u = clamp01((punchT - 0.2) / 0.15);
            const fastAlpha = Math.pow(u, 1.15);
            interpolated = interpolatePoseMaps(frame3Power, frame4Extend, fastAlpha);
          } else if (punchT < 0.45) {
            // 0.35–0.45s: Punch Extension -> Impact (crisp snap into full extension at 0.45s)
            const u = clamp01((punchT - 0.35) / 0.1);
            const snapAlpha = 1 - Math.pow(1 - u, 2.2);
            interpolated = interpolatePoseMaps(frame4Extend, frame5Impact, snapAlpha);
          } else if (punchT < 0.6) {
            // 0.45–0.60s: Impact compression/recoil (0.45–0.475s) -> Controlled Retraction (0.475–0.60s)
            if (punchT < 0.475) {
              const recoilPulse = Math.sin(((punchT - 0.45) / 0.025) * Math.PI);
              interpolated = interpolatePoseMaps(frame5Impact, frame5Impact, 0);
              interpolated.RightLowerArm.rx -= 0.035 * recoilPulse;
              interpolated.RightShoulder.ry += 0.018 * recoilPulse;
              interpolated.Chest.rx += 0.012 * recoilPulse;
            } else {
              const u = smoothstep01((punchT - 0.475) / 0.125);
              interpolated = interpolatePoseMaps(frame5Impact, frame6Retract, u);
            }
          } else {
            // 0.60–0.80s: Retraction -> Return to Combat Guard (smooth recovery ready for next attack)
            const u = smoothstep01((punchT - 0.6) / 0.2);
            interpolated = interpolatePoseMaps(frame6Retract, frame1Guard, u);
          }

          Object.assign(pose, interpolated);
          break;
        }

        pose.Hips.ry = 0.42;
        pose.Chest.ry = 0.52;
        pose.Chest.rx = isHeavy ? 0.25 : 0.15;
        pose.RightShoulder = { rx: 0, ry: 0.3, rz: 0 };
        pose.RightUpperArm = { rx: -1.55, ry: -0.15, rz: -0.1 };
        pose.RightLowerArm = { rx: -0.12, ry: 0, rz: 0 };
        pose.LeftUpperArm = { rx: -0.5, ry: 0.35, rz: 0.45 };
        pose.LeftLowerArm = { rx: -1.5, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -0.28, ry: 0, rz: -0.08 };
        pose.LeftUpperLeg = { rx: 0.25, ry: 0, rz: 0.08 };
        break;
      }

      case 'kick':
      case 'forward_kick': {
        const isHeavyKick = state === 'forward_kick';

        if (characterId === 'action_sultan') {
          // AS RIGHT FRONT KICK – ~0.60s fast one-shot (2.0x speed across Storyboard Frames 1–7):
          // Frame 1 (0.00s): Combat Guard (normal fighting stance, both fists raised near face, knees slightly bent, torso slightly turned)
          // Frame 2 (0.075s / story 0.15s): Weight Transfer (shift weight onto supporting left leg, bend left knee slightly, begin lifting right knee forward & upward)
          // Frame 3 (0.15s / story 0.30s): Knee Chamber (raise right knee high toward target, keep right knee tightly bent with lower leg pulled back, engage hips, maintain balance & high guard)
          // Frame 4 (0.25s / story 0.50s): Kick Extension (rapidly extend right lower leg toward opponent, drive hip forward, align right foot heel/sole to target, lean torso slightly back)
          // Frame 5 (0.325s / story 0.65s): Impact (near-full right leg extension without hyperextension, foot faces opponent, hip fully engaged, balanced torso & raised hands, subtle body recoil)
          // Frame 6 (0.45s / story 0.90s): Retraction (bend right knee, retract lower leg toward thigh, bring right knee back toward chamber position, return hips toward guard)
          // Frame 7 (0.60s / story 1.20s): Recovery (lower right leg, return right foot to original position, restore fighting stance & weight distribution, ready for next attack)
          const KICK_SPEED = 2.0;
          const kickT = Math.max(0, Math.min(t * KICK_SPEED, 1.2));
          const heavyReachBoost = isHeavyKick ? -0.05 : 0;

          const frame1Guard: RigPoseMap = {
            Hips: { rx: 0, ry: 0.18, rz: 0, px: 0, py: baseHipsY - 0.03, pz: 0 },
            Spine: { rx: 0.03, ry: 0.08, rz: 0 },
            Chest: { rx: 0.05, ry: 0.14, rz: 0 },
            Neck: { rx: 0.03, ry: -0.15, rz: 0 },
            Head: { rx: 0.06, ry: -0.25, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.08, rz: -0.05 },
            LeftUpperArm: { rx: -0.36, ry: 0, rz: 0.14 },
            LeftLowerArm: { rx: -1.46, ry: 0, rz: 0.48 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: 0.08, rz: 0.05 },
            RightUpperArm: { rx: -0.28, ry: 0, rz: -0.1 },
            RightLowerArm: { rx: -1.56, ry: 0, rz: -0.56 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.18, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.16, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
            RightFoot: { rx: -0.18, ry: 0, rz: 0 },
          };

          const frame2WeightTransfer: RigPoseMap = {
            Hips: { rx: -0.02, ry: 0.12, rz: -0.02, px: -0.015, py: baseHipsY - 0.036, pz: 0 },
            Spine: { rx: 0.01, ry: 0.06, rz: 0 },
            Chest: { rx: 0.03, ry: 0.1, rz: 0 },
            Neck: { rx: 0.03, ry: -0.1, rz: 0 },
            Head: { rx: 0.06, ry: -0.18, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.07, rz: -0.05 },
            LeftUpperArm: { rx: -0.38, ry: 0, rz: 0.15 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.5 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: 0.07, rz: 0.05 },
            RightUpperArm: { rx: -0.32, ry: 0, rz: -0.11 },
            RightLowerArm: { rx: -1.55, ry: 0, rz: -0.54 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.2, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.3, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.58, ry: 0.04, rz: -0.05 },
            RightLowerLeg: { rx: 1.05, ry: 0, rz: 0 },
            RightFoot: { rx: 0.16, ry: 0, rz: 0 },
          };

          const frame3Chamber: RigPoseMap = {
            Hips: { rx: -0.06, ry: 0.04, rz: -0.03, px: 0.004, py: baseHipsY - 0.032, pz: 0 },
            Spine: { rx: -0.03, ry: 0.02, rz: 0 },
            Chest: { rx: -0.02, ry: 0.04, rz: 0 },
            Neck: { rx: 0.05, ry: -0.04, rz: 0 },
            Head: { rx: 0.08, ry: -0.06, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.06, rz: -0.05 },
            LeftUpperArm: { rx: -0.42, ry: 0, rz: 0.16 },
            LeftLowerArm: { rx: -1.5, ry: 0, rz: 0.52 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: 0.06, rz: 0.05 },
            RightUpperArm: { rx: -0.36, ry: 0, rz: -0.12 },
            RightLowerArm: { rx: -1.54, ry: 0, rz: -0.52 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.15, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.07, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -1.38, ry: 0.06, rz: -0.05 },
            RightLowerLeg: { rx: 1.72, ry: 0, rz: 0 },
            RightFoot: { rx: 0.12, ry: 0, rz: 0 },
          };

          const frame4Extension: RigPoseMap = {
            Hips: { rx: -0.15, ry: -0.1, rz: -0.04, px: 0.024, py: baseHipsY - 0.026, pz: 0 },
            Spine: { rx: -0.11, ry: -0.04, rz: 0 },
            Chest: { rx: -0.13, ry: -0.08, rz: 0 },
            Neck: { rx: 0.11, ry: 0.08, rz: 0 },
            Head: { rx: 0.16, ry: 0.14, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: 0.02, rz: -0.04 },
            LeftUpperArm: { rx: -0.46, ry: 0, rz: 0.18 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.54 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.04, ry: -0.04, rz: 0.04 },
            RightUpperArm: { rx: -0.42, ry: 0, rz: -0.14 },
            RightLowerArm: { rx: -1.46, ry: 0, rz: -0.48 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.05, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.26, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -1.52 + heavyReachBoost * 0.5, ry: 0.02, rz: -0.04 },
            RightLowerLeg: { rx: 0.34, ry: 0, rz: 0 },
            RightFoot: { rx: -0.32, ry: 0, rz: 0 },
          };

          const frame5Impact: RigPoseMap = {
            Hips: { rx: -0.2, ry: -0.16, rz: -0.05, px: 0.036, py: baseHipsY - 0.024, pz: 0 },
            Spine: { rx: -0.15, ry: -0.06, rz: 0 },
            Chest: { rx: -0.17, ry: -0.12, rz: 0 },
            Neck: { rx: 0.14, ry: 0.12, rz: 0 },
            Head: { rx: 0.21, ry: 0.2, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: 0.04, rz: -0.04 },
            LeftUpperArm: { rx: -0.48, ry: 0, rz: 0.2 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.56 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.04, ry: -0.08, rz: 0.04 },
            RightUpperArm: { rx: -0.44, ry: 0, rz: -0.16 },
            RightLowerArm: { rx: -1.44, ry: 0, rz: -0.46 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: 0.0, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.25, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.05, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -1.6 + heavyReachBoost, ry: 0, rz: -0.03 },
            RightLowerLeg: { rx: 0.12, ry: 0, rz: 0 },
            RightFoot: { rx: -0.42, ry: 0, rz: 0 },
          };

          const frame6Retract: RigPoseMap = {
            Hips: { rx: -0.04, ry: 0.08, rz: -0.02, px: 0.008, py: baseHipsY - 0.032, pz: 0 },
            Spine: { rx: -0.01, ry: 0.04, rz: 0 },
            Chest: { rx: 0.01, ry: 0.08, rz: 0 },
            Neck: { rx: 0.04, ry: -0.08, rz: 0 },
            Head: { rx: 0.07, ry: -0.14, rz: 0 },
            LeftShoulder: { rx: -0.05, ry: -0.04, rz: -0.05 },
            LeftUpperArm: { rx: -0.4, ry: 0, rz: 0.15 },
            LeftLowerArm: { rx: -1.48, ry: 0, rz: 0.5 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.05, ry: 0.04, rz: 0.05 },
            RightUpperArm: { rx: -0.34, ry: 0, rz: -0.11 },
            RightLowerArm: { rx: -1.52, ry: 0, rz: -0.52 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.16, ry: 0, rz: 0.05 },
            LeftLowerLeg: { rx: 0.26, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -1.12, ry: 0.05, rz: -0.05 },
            RightLowerLeg: { rx: 1.58, ry: 0, rz: 0 },
            RightFoot: { rx: 0.1, ry: 0, rz: 0 },
          };

          let interpolated: RigPoseMap;
          if (kickT < 0.15) {
            // 0.00–0.15s: Establish Combat Guard (0.00–0.04s) then smoothly transfer weight onto supporting left leg (0.04–0.15s)
            const transferAlpha = kickT <= 0.04 ? 0 : smoothstep01((kickT - 0.04) / 0.11);
            interpolated = interpolatePoseMaps(frame1Guard, frame2WeightTransfer, transferAlpha);
          } else if (kickT < 0.3) {
            // 0.15–0.30s: Weight Transfer -> Knee Chamber (lift right knee high and fold lower leg toward thigh)
            const chamberAlpha = smoothstep01((kickT - 0.15) / 0.15);
            interpolated = interpolatePoseMaps(frame2WeightTransfer, frame3Chamber, chamberAlpha);
          } else if (kickT < 0.5) {
            // 0.30–0.50s: Knee Chamber -> Kick Extension (explosive hip drive and lower-leg extension toward opponent)
            const u = clamp01((kickT - 0.3) / 0.2);
            const fastExtendAlpha = Math.pow(u, 1.2);
            interpolated = interpolatePoseMaps(frame3Chamber, frame4Extension, fastExtendAlpha);
          } else if (kickT < 0.65) {
            // 0.50–0.65s: Kick Extension -> Impact (powerful snap into peak extension with heel/sole aligned to target)
            const u = clamp01((kickT - 0.5) / 0.15);
            const snapImpactAlpha = 1 - Math.pow(1 - u, 2.2);
            interpolated = interpolatePoseMaps(frame4Extension, frame5Impact, snapImpactAlpha);
          } else if (kickT < 0.9) {
            // 0.65–0.90s: Impact recoil (0.65–0.69s) -> Controlled Retraction back to chamber (0.69–0.90s)
            if (kickT < 0.69) {
              const recoilPulse = Math.sin(((kickT - 0.65) / 0.04) * Math.PI);
              interpolated = interpolatePoseMaps(frame5Impact, frame5Impact, 0);
              interpolated.RightLowerLeg.rx += 0.045 * recoilPulse;
              interpolated.RightFoot.rx += 0.03 * recoilPulse;
              interpolated.Hips.px = (interpolated.Hips.px ?? 0) - 0.006 * recoilPulse;
              interpolated.Chest.rx -= 0.015 * recoilPulse;
            } else {
              const retractAlpha = smoothstep01((kickT - 0.69) / 0.21);
              interpolated = interpolatePoseMaps(frame5Impact, frame6Retract, retractAlpha);
            }
          } else {
            // 0.90–1.20s: Retraction -> Recovery (lower right leg smoothly to floor and restore Combat Guard)
            const recoverAlpha = smoothstep01((kickT - 0.9) / 0.3);
            interpolated = interpolatePoseMaps(frame6Retract, frame1Guard, recoverAlpha);
          }

          Object.assign(pose, interpolated);
          break;
        }

        pose.Hips.py = baseHipsY * 0.96;
        pose.Hips.rx = -0.22;
        pose.Hips.ry = 0.35;
        pose.Chest.rx = -0.25;
        pose.Chest.ry = -0.3;
        pose.RightUpperLeg = { rx: -1.65, ry: 0.15, rz: -0.22 };
        pose.RightLowerLeg = { rx: 0.12, ry: 0, rz: 0 };
        pose.RightFoot = { rx: 0.25, ry: 0, rz: 0 };
        pose.LeftUpperLeg = { rx: 0.15, ry: 0, rz: 0.08 };
        pose.LeftLowerLeg = { rx: 0.28, ry: 0, rz: 0 };
        pose.LeftUpperArm = { rx: -0.85, ry: 0.2, rz: 0.55 };
        pose.RightUpperArm = { rx: -0.45, ry: -0.3, rz: -0.55 };
        break;
      }

      case 'sweep': {
        pose.Hips.py = baseHipsY * 0.5;
        pose.Hips.ry = 0.48;
        pose.Chest.rx = 0.32;
        pose.LeftUpperLeg = { rx: -1.25, ry: 0, rz: 0.18 };
        pose.LeftLowerLeg = { rx: 1.95, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -0.85, ry: -0.25, rz: -0.35 };
        pose.RightLowerLeg = { rx: 0.1, ry: 0, rz: 0 };
        break;
      }

      case 'grab': {
        if (characterId === 'action_sultan') {
          // AS DHOBI PACHAD (GRAB & THROW TAKEDOWN) – ~2.80s synchronized 8-frame sequence:
          // Frame 1 (0.00s): Approach (combat stance approaching opponent at close range)
          // Frame 2 (0.30s): Grab (strong upper-body grab securing opponent with both arms: right arm controls upper torso/shoulder, left arm locks waist/upper-body)
          // Frame 3 (0.60s): Pull and Break Balance (pulls opponent toward himself, shifts weight back slightly, adjusts feet while maintaining firm grip)
          // Frame 4 (0.90s): Turning and Positioning (pivots hips & upper torso deeply, bends knees low to position opponent across throwing side)
          // Frame 5 (1.20s): Lift (drives upward through legs, hips, and back to lift opponent off the ground across Sultan's hip/shoulder)
          // Frame 6 (1.60s): Throw (completes throwing rotation over the hip and releases opponent into a controlled downward arc)
          // Frame 7 (2.20s): Ground Impact (maintains balanced follow-through stance standing dominantly over the slammed opponent)
          // Frame 8 (2.80s): Recovery (releases remaining tension and returns cleanly to balanced fighting stance)
          const grabT = Math.max(0, Math.min(t, 2.8));

          const frame1Approach: RigPoseMap = {
            Hips: { rx: 0.04, ry: 0.16, rz: 0, px: 0, py: baseHipsY - 0.03, pz: 0 },
            Spine: { rx: 0.06, ry: 0.06, rz: 0 },
            Chest: { rx: 0.08, ry: 0.12, rz: 0 },
            Neck: { rx: -0.02, ry: -0.12, rz: 0 },
            Head: { rx: -0.03, ry: -0.2, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: -0.06, rz: -0.04 },
            LeftUpperArm: { rx: -0.52, ry: 0.08, rz: 0.18 },
            LeftLowerArm: { rx: -1.32, ry: 0, rz: 0.42 },
            LeftHand: { rx: 0.06, ry: 0, rz: 0, fistCurl: 0.5 },
            RightShoulder: { rx: -0.04, ry: 0.06, rz: 0.04 },
            RightUpperArm: { rx: -0.48, ry: -0.08, rz: -0.14 },
            RightLowerArm: { rx: -1.38, ry: 0, rz: -0.46 },
            RightHand: { rx: 0.06, ry: 0, rz: 0, fistCurl: 0.5 },
            LeftUpperLeg: { rx: -0.22, ry: 0, rz: 0.06 },
            LeftLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.18, ry: 0, rz: -0.06 },
            RightLowerLeg: { rx: 0.26, ry: 0, rz: 0 },
            RightFoot: { rx: -0.18, ry: 0, rz: 0 },
          };

          const frame2Grab: RigPoseMap = {
            Hips: { rx: 0.08, ry: 0.06, rz: 0, px: 0.02, py: baseHipsY - 0.05, pz: 0 },
            Spine: { rx: 0.12, ry: 0.04, rz: 0 },
            Chest: { rx: 0.16, ry: 0.06, rz: 0 },
            Neck: { rx: -0.05, ry: -0.06, rz: 0 },
            Head: { rx: -0.06, ry: -0.08, rz: 0 },
            LeftShoulder: { rx: -0.06, ry: -0.14, rz: -0.05 },
            LeftUpperArm: { rx: -0.84, ry: 0.24, rz: 0.22 },
            LeftLowerArm: { rx: -0.96, ry: 0, rz: 0.46 },
            LeftHand: { rx: 0.14, ry: 0, rz: 0, fistCurl: 0.95 },
            RightShoulder: { rx: -0.08, ry: -0.18, rz: 0.05 },
            RightUpperArm: { rx: -1.04, ry: -0.22, rz: -0.18 },
            RightLowerArm: { rx: -0.88, ry: 0, rz: -0.38 },
            RightHand: { rx: 0.16, ry: 0, rz: 0, fistCurl: 0.95 },
            LeftUpperLeg: { rx: -0.28, ry: 0, rz: 0.07 },
            LeftLowerLeg: { rx: 0.34, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.22, ry: 0, rz: -0.07 },
            RightLowerLeg: { rx: 0.3, ry: 0, rz: 0 },
            RightFoot: { rx: -0.2, ry: 0, rz: 0 },
          };

          const frame3PullBreakBalance: RigPoseMap = {
            Hips: { rx: -0.04, ry: 0.22, rz: 0.02, px: -0.035, py: baseHipsY - 0.07, pz: 0 },
            Spine: { rx: -0.06, ry: 0.12, rz: 0.02 },
            Chest: { rx: -0.05, ry: 0.18, rz: 0.03 },
            Neck: { rx: 0.06, ry: -0.12, rz: 0 },
            Head: { rx: 0.08, ry: -0.18, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: 0.12, rz: -0.06 },
            LeftUpperArm: { rx: -0.66, ry: 0.28, rz: 0.28 },
            LeftLowerArm: { rx: -1.28, ry: 0, rz: 0.52 },
            LeftHand: { rx: 0.18, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.04, ry: 0.16, rz: 0.06 },
            RightUpperArm: { rx: -0.74, ry: -0.16, rz: -0.24 },
            RightLowerArm: { rx: -1.34, ry: 0, rz: -0.44 },
            RightHand: { rx: 0.18, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.34, ry: 0, rz: 0.08 },
            LeftLowerLeg: { rx: 0.42, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.26, ry: 0, rz: -0.08 },
            RightLowerLeg: { rx: 0.36, ry: 0, rz: 0 },
            RightFoot: { rx: -0.22, ry: 0, rz: 0 },
          };

          const frame4TurnPosition: RigPoseMap = {
            Hips: { rx: 0.16, ry: -0.78, rz: -0.06, px: -0.015, py: baseHipsY - 0.14, pz: 0 },
            Spine: { rx: 0.24, ry: -0.28, rz: -0.06 },
            Chest: { rx: 0.3, ry: -0.42, rz: -0.08 },
            Neck: { rx: -0.1, ry: 0.32, rz: 0.04 },
            Head: { rx: -0.12, ry: 0.44, rz: 0.05 },
            LeftShoulder: { rx: -0.06, ry: -0.12, rz: -0.06 },
            LeftUpperArm: { rx: -0.96, ry: 0.32, rz: 0.34 },
            LeftLowerArm: { rx: -1.18, ry: 0, rz: 0.48 },
            LeftHand: { rx: 0.16, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.08, ry: -0.24, rz: 0.08 },
            RightUpperArm: { rx: -0.92, ry: -0.28, rz: -0.22 },
            RightLowerArm: { rx: -1.24, ry: 0, rz: -0.42 },
            RightHand: { rx: 0.16, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.54, ry: 0.08, rz: 0.12 },
            LeftLowerLeg: { rx: 0.68, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.14, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.38, ry: -0.08, rz: -0.12 },
            RightLowerLeg: { rx: 0.58, ry: 0, rz: 0 },
            RightFoot: { rx: -0.18, ry: 0, rz: 0 },
          };

          const frame5Lift: RigPoseMap = {
            Hips: { rx: 0.26, ry: -0.94, rz: -0.12, px: 0.01, py: baseHipsY - 0.05, pz: 0 },
            Spine: { rx: 0.34, ry: -0.34, rz: -0.1 },
            Chest: { rx: 0.42, ry: -0.48, rz: -0.14 },
            Neck: { rx: -0.14, ry: 0.36, rz: 0.06 },
            Head: { rx: -0.16, ry: 0.48, rz: 0.08 },
            LeftShoulder: { rx: -0.08, ry: -0.18, rz: -0.08 },
            LeftUpperArm: { rx: -1.14, ry: 0.36, rz: 0.38 },
            LeftLowerArm: { rx: -1.12, ry: 0, rz: 0.52 },
            LeftHand: { rx: 0.18, ry: 0, rz: 0, fistCurl: 1 },
            RightShoulder: { rx: -0.1, ry: -0.28, rz: 0.1 },
            RightUpperArm: { rx: -1.08, ry: -0.32, rz: -0.26 },
            RightLowerArm: { rx: -1.18, ry: 0, rz: -0.46 },
            RightHand: { rx: 0.18, ry: 0, rz: 0, fistCurl: 1 },
            LeftUpperLeg: { rx: -0.34, ry: 0.06, rz: 0.14 },
            LeftLowerLeg: { rx: 0.42, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.22, ry: -0.06, rz: -0.14 },
            RightLowerLeg: { rx: 0.34, ry: 0, rz: 0 },
            RightFoot: { rx: -0.12, ry: 0, rz: 0 },
          };

          const frame6Throw: RigPoseMap = {
            Hips: { rx: 0.34, ry: -1.16, rz: -0.16, px: 0.032, py: baseHipsY - 0.09, pz: 0 },
            Spine: { rx: 0.44, ry: -0.42, rz: -0.12 },
            Chest: { rx: 0.54, ry: -0.56, rz: -0.16 },
            Neck: { rx: -0.12, ry: 0.42, rz: 0.06 },
            Head: { rx: -0.08, ry: 0.54, rz: 0.08 },
            LeftShoulder: { rx: -0.04, ry: 0.08, rz: -0.04 },
            LeftUpperArm: { rx: -1.24, ry: 0.18, rz: 0.26 },
            LeftLowerArm: { rx: -0.46, ry: 0, rz: 0.18 },
            LeftHand: { rx: 0.04, ry: 0, rz: 0, fistCurl: 0.2 },
            RightShoulder: { rx: -0.06, ry: -0.24, rz: 0.06 },
            RightUpperArm: { rx: -1.36, ry: -0.22, rz: -0.2 },
            RightLowerArm: { rx: -0.36, ry: 0, rz: -0.14 },
            RightHand: { rx: 0.04, ry: 0, rz: 0, fistCurl: 0.2 },
            LeftUpperLeg: { rx: -0.44, ry: 0.06, rz: 0.12 },
            LeftLowerLeg: { rx: 0.54, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.1, ry: 0, rz: 0 },
            RightUpperLeg: { rx: -0.18, ry: -0.06, rz: -0.12 },
            RightLowerLeg: { rx: 0.32, ry: 0, rz: 0 },
            RightFoot: { rx: -0.14, ry: 0, rz: 0 },
          };

          const frame7ImpactFollowThrough: RigPoseMap = {
            Hips: { rx: 0.18, ry: -0.34, rz: -0.04, px: 0.038, py: baseHipsY - 0.07, pz: 0 },
            Spine: { rx: 0.22, ry: -0.14, rz: -0.02 },
            Chest: { rx: 0.28, ry: -0.2, rz: -0.04 },
            Neck: { rx: 0.14, ry: 0.16, rz: 0 },
            Head: { rx: 0.24, ry: 0.22, rz: 0 },
            LeftShoulder: { rx: -0.04, ry: -0.04, rz: -0.04 },
            LeftUpperArm: { rx: -0.48, ry: 0.12, rz: 0.22 },
            LeftLowerArm: { rx: -1.18, ry: 0, rz: 0.36 },
            LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.85 },
            RightShoulder: { rx: -0.04, ry: 0.04, rz: 0.04 },
            RightUpperArm: { rx: -0.54, ry: -0.12, rz: -0.18 },
            RightLowerArm: { rx: -1.22, ry: 0, rz: -0.38 },
            RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.85 },
            LeftUpperLeg: { rx: -0.36, ry: 0, rz: 0.1 },
            LeftLowerLeg: { rx: 0.46, ry: 0, rz: 0 },
            LeftFoot: { rx: -0.1, ry: 0, rz: 0 },
            RightUpperLeg: { rx: 0.14, ry: 0, rz: -0.1 },
            RightLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
            RightFoot: { rx: -0.16, ry: 0, rz: 0 },
          };

          let interpolated: RigPoseMap;
          if (grabT < 0.3) {
            // 0.00–0.30s: Approach -> Grab Lock
            const u = smoothstep01(grabT / 0.3);
            interpolated = interpolatePoseMaps(frame1Approach, frame2Grab, u);
          } else if (grabT < 0.6) {
            // 0.30–0.60s: Grab Lock -> Pull & Break Balance
            const u = smoothstep01((grabT - 0.3) / 0.3);
            interpolated = interpolatePoseMaps(frame2Grab, frame3PullBreakBalance, u);
          } else if (grabT < 0.9) {
            // 0.60–0.90s: Pull & Break Balance -> Turning & Positioning across hip
            const u = smoothstep01((grabT - 0.6) / 0.3);
            interpolated = interpolatePoseMaps(frame3PullBreakBalance, frame4TurnPosition, u);
          } else if (grabT < 1.2) {
            // 0.90–1.20s: Turning & Positioning -> Lift opponent off the ground
            const u = clamp01((grabT - 0.9) / 0.3);
            const liftAlpha = Math.pow(u, 1.15);
            interpolated = interpolatePoseMaps(frame4TurnPosition, frame5Lift, liftAlpha);
          } else if (grabT < 1.6) {
            // 1.20–1.60s: Lift -> Rotate & Throw over the hip (explosive release at 1.60s)
            const u = clamp01((grabT - 1.2) / 0.4);
            const throwAlpha = 1 - Math.pow(1 - u, 2.0);
            interpolated = interpolatePoseMaps(frame5Lift, frame6Throw, throwAlpha);
          } else if (grabT < 2.2) {
            // 1.60–2.20s: Throw release -> Ground Impact follow-through standing over opponent
            const u = smoothstep01((grabT - 1.6) / 0.6);
            interpolated = interpolatePoseMaps(frame6Throw, frame7ImpactFollowThrough, u);
          } else {
            // 2.20–2.80s: Ground Impact -> Recovery to balanced combat stance
            const u = smoothstep01((grabT - 2.2) / 0.6);
            interpolated = interpolatePoseMaps(frame7ImpactFollowThrough, frame1Approach, u);
          }

          Object.assign(pose, interpolated);
          break;
        }

        pose.Hips.py = baseHipsY * 0.9;
        pose.Chest.rx = 0.28;
        pose.LeftUpperArm = { rx: -1.45, ry: 0.35, rz: 0.2 };
        pose.LeftLowerArm = { rx: -0.45, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -1.45, ry: -0.35, rz: -0.2 };
        pose.RightLowerArm = { rx: -0.45, ry: 0, rz: 0 };
        break;
      }

      case 'grabbed': {
        // SYNCHRONIZED OPPONENT DHOBI PACHAD REACTION – ~2.80s 8-frame sequence:
        // Frame 1 (0.00s): Facing Sultan at close range in combat stance
        // Frame 2 (0.30s): Immediate reaction to Sultan's upper-body grab
        // Frame 3 (0.60s): Pulled forward off-balance (center of mass shifts forward, torso bends forward)
        // Frame 4 (0.90s): Upper body follows Sultan's pivot across throwing hip, heels rise
        // Frame 5 (1.20s): Lifted off the ground across Sultan's hip/shoulder (feet leave ground, legs kick up in air)
        // Frame 6 (1.60s): Thrown over Sultan's hip in a controlled airborne backward/sideward rotation
        // Frame 7 (2.20s): Ground Impact on back and upper shoulder area with brief impact bounce
        // Frame 8 (2.80s): Remains grounded on back before transitioning into knockdown recovery
        const oppT = Math.max(0, Math.min(t, 2.8));

        const oppFrame1Stance: RigPoseMap = {
          Hips: { rx: 0, ry: 0.14, rz: 0, px: 0, py: baseHipsY - 0.02, pz: 0 },
          Spine: { rx: 0.02, ry: 0.06, rz: 0 },
          Chest: { rx: 0.04, ry: 0.1, rz: 0 },
          Neck: { rx: 0.02, ry: -0.1, rz: 0 },
          Head: { rx: 0.04, ry: -0.16, rz: 0 },
          LeftShoulder: { rx: -0.04, ry: -0.06, rz: -0.04 },
          LeftUpperArm: { rx: -0.38, ry: 0, rz: 0.16 },
          LeftLowerArm: { rx: -1.35, ry: 0, rz: 0.42 },
          LeftHand: { rx: 0.06, ry: 0, rz: 0, fistCurl: 0.8 },
          RightShoulder: { rx: -0.04, ry: 0.06, rz: 0.04 },
          RightUpperArm: { rx: -0.34, ry: 0, rz: -0.14 },
          RightLowerArm: { rx: -1.4, ry: 0, rz: -0.44 },
          RightHand: { rx: 0.06, ry: 0, rz: 0, fistCurl: 0.8 },
          LeftUpperLeg: { rx: -0.16, ry: 0, rz: 0.06 },
          LeftLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
          LeftFoot: { rx: -0.06, ry: 0, rz: 0 },
          RightUpperLeg: { rx: 0.14, ry: 0, rz: -0.06 },
          RightLowerLeg: { rx: 0.24, ry: 0, rz: 0 },
          RightFoot: { rx: -0.14, ry: 0, rz: 0 },
        };

        const oppFrame2GrabReact: RigPoseMap = {
          Hips: { rx: 0.06, ry: 0.04, rz: 0, px: 0.02, py: baseHipsY - 0.04, pz: 0 },
          Spine: { rx: 0.12, ry: 0.02, rz: 0 },
          Chest: { rx: 0.16, ry: 0.04, rz: 0 },
          Neck: { rx: -0.12, ry: 0, rz: 0 },
          Head: { rx: -0.16, ry: 0, rz: 0 },
          LeftShoulder: { rx: -0.06, ry: -0.1, rz: -0.08 },
          LeftUpperArm: { rx: -0.78, ry: 0.2, rz: 0.34 },
          LeftLowerArm: { rx: -1.12, ry: 0, rz: 0.38 },
          LeftHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.5 },
          RightShoulder: { rx: -0.06, ry: 0.1, rz: 0.08 },
          RightUpperArm: { rx: -0.74, ry: -0.2, rz: -0.34 },
          RightLowerArm: { rx: -1.16, ry: 0, rz: -0.38 },
          RightHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.5 },
          LeftUpperLeg: { rx: -0.22, ry: 0, rz: 0.08 },
          LeftLowerLeg: { rx: 0.32, ry: 0, rz: 0 },
          LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
          RightUpperLeg: { rx: 0.18, ry: 0, rz: -0.08 },
          RightLowerLeg: { rx: 0.28, ry: 0, rz: 0 },
          RightFoot: { rx: -0.12, ry: 0, rz: 0 },
        };

        const oppFrame3BreakBalance: RigPoseMap = {
          Hips: { rx: 0.24, ry: -0.08, rz: 0.04, px: 0.06, py: baseHipsY - 0.07, pz: 0 },
          Spine: { rx: 0.34, ry: -0.06, rz: 0.04 },
          Chest: { rx: 0.42, ry: -0.08, rz: 0.06 },
          Neck: { rx: -0.18, ry: 0.06, rz: 0 },
          Head: { rx: -0.24, ry: 0.08, rz: 0 },
          LeftShoulder: { rx: -0.08, ry: -0.14, rz: -0.1 },
          LeftUpperArm: { rx: -0.94, ry: 0.24, rz: 0.42 },
          LeftLowerArm: { rx: -0.92, ry: 0, rz: 0.32 },
          LeftHand: { rx: 0.12, ry: 0, rz: 0, fistCurl: 0.4 },
          RightShoulder: { rx: -0.08, ry: 0.14, rz: 0.1 },
          RightUpperArm: { rx: -0.9, ry: -0.24, rz: -0.42 },
          RightLowerArm: { rx: -0.96, ry: 0, rz: -0.32 },
          RightHand: { rx: 0.12, ry: 0, rz: 0, fistCurl: 0.4 },
          LeftUpperLeg: { rx: -0.36, ry: 0, rz: 0.08 },
          LeftLowerLeg: { rx: 0.44, ry: 0, rz: 0 },
          LeftFoot: { rx: -0.08, ry: 0, rz: 0 },
          RightUpperLeg: { rx: 0.08, ry: 0, rz: -0.08 },
          RightLowerLeg: { rx: 0.36, ry: 0, rz: 0 },
          RightFoot: { rx: 0.24, ry: 0, rz: 0 },
        };

        const oppFrame4RotatedAcrossHip: RigPoseMap = {
          Hips: { rx: 0.56, ry: 0.46, rz: -0.18, px: 0.04, py: baseHipsY + 0.04, pz: 0 },
          Spine: { rx: 0.48, ry: 0.22, rz: -0.12 },
          Chest: { rx: 0.52, ry: 0.28, rz: -0.16 },
          Neck: { rx: -0.16, ry: -0.18, rz: 0.06 },
          Head: { rx: -0.2, ry: -0.24, rz: 0.08 },
          LeftShoulder: { rx: -0.08, ry: -0.12, rz: -0.12 },
          LeftUpperArm: { rx: -1.04, ry: 0.28, rz: 0.48 },
          LeftLowerArm: { rx: -0.86, ry: 0, rz: 0.28 },
          LeftHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.4 },
          RightShoulder: { rx: -0.08, ry: 0.12, rz: 0.12 },
          RightUpperArm: { rx: -0.98, ry: -0.28, rz: -0.48 },
          RightLowerArm: { rx: -0.88, ry: 0, rz: -0.28 },
          RightHand: { rx: 0.1, ry: 0, rz: 0, fistCurl: 0.4 },
          LeftUpperLeg: { rx: -0.28, ry: 0.06, rz: 0.12 },
          LeftLowerLeg: { rx: 0.48, ry: 0, rz: 0 },
          LeftFoot: { rx: 0.32, ry: 0, rz: 0 },
          RightUpperLeg: { rx: -0.18, ry: -0.06, rz: -0.12 },
          RightLowerLeg: { rx: 0.44, ry: 0, rz: 0 },
          RightFoot: { rx: 0.36, ry: 0, rz: 0 },
        };

        const oppFrame5LiftedAirborne: RigPoseMap = {
          Hips: { rx: 1.18, ry: 0.54, rz: -0.46, px: 0, py: baseHipsY + 0.18, pz: 0 },
          Spine: { rx: 0.32, ry: 0.18, rz: -0.14 },
          Chest: { rx: 0.28, ry: 0.22, rz: -0.18 },
          Neck: { rx: -0.18, ry: -0.14, rz: 0.08 },
          Head: { rx: -0.22, ry: -0.18, rz: 0.1 },
          LeftShoulder: { rx: -0.06, ry: -0.1, rz: -0.14 },
          LeftUpperArm: { rx: -0.88, ry: 0.22, rz: 0.56 },
          LeftLowerArm: { rx: -0.94, ry: 0, rz: 0.3 },
          LeftHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.35 },
          RightShoulder: { rx: -0.06, ry: 0.1, rz: 0.14 },
          RightUpperArm: { rx: -0.82, ry: -0.22, rz: -0.56 },
          RightLowerArm: { rx: -0.96, ry: 0, rz: -0.3 },
          RightHand: { rx: 0.08, ry: 0, rz: 0, fistCurl: 0.35 },
          LeftUpperLeg: { rx: -0.54, ry: 0.1, rz: 0.22 },
          LeftLowerLeg: { rx: 0.46, ry: 0, rz: 0 },
          LeftFoot: { rx: 0.24, ry: 0, rz: 0 },
          RightUpperLeg: { rx: 0.26, ry: -0.1, rz: -0.24 },
          RightLowerLeg: { rx: 0.38, ry: 0, rz: 0 },
          RightFoot: { rx: 0.28, ry: 0, rz: 0 },
        };

        const oppFrame6ThrownAirborne: RigPoseMap = {
          Hips: { rx: -1.16, ry: 0.2, rz: -0.24, px: 0, py: baseHipsY * 0.72, pz: 0 },
          Spine: { rx: -0.18, ry: 0.08, rz: -0.08 },
          Chest: { rx: -0.22, ry: 0.1, rz: -0.1 },
          Neck: { rx: 0.16, ry: 0, rz: 0 },
          Head: { rx: 0.22, ry: 0, rz: 0 },
          LeftShoulder: { rx: -0.04, ry: 0, rz: -0.12 },
          LeftUpperArm: { rx: -0.64, ry: 0.15, rz: 0.82 },
          LeftLowerArm: { rx: -0.52, ry: 0, rz: 0.18 },
          LeftHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.2 },
          RightShoulder: { rx: -0.04, ry: 0, rz: 0.12 },
          RightUpperArm: { rx: -0.64, ry: -0.15, rz: -0.82 },
          RightLowerArm: { rx: -0.52, ry: 0, rz: -0.18 },
          RightHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.2 },
          LeftUpperLeg: { rx: -0.76, ry: 0.08, rz: 0.18 },
          LeftLowerLeg: { rx: 0.58, ry: 0, rz: 0 },
          LeftFoot: { rx: 0.18, ry: 0, rz: 0 },
          RightUpperLeg: { rx: -0.44, ry: -0.08, rz: -0.18 },
          RightLowerLeg: { rx: 0.48, ry: 0, rz: 0 },
          RightFoot: { rx: 0.18, ry: 0, rz: 0 },
        };

        const oppFrame7GroundImpact: RigPoseMap = {
          Hips: { rx: -1.52, ry: 0, rz: 0, px: 0, py: 0.16, pz: 0 },
          Spine: { rx: -0.2, ry: 0, rz: 0 },
          Chest: { rx: -0.24, ry: 0, rz: 0 },
          Neck: { rx: 0.22, ry: 0, rz: 0 },
          Head: { rx: 0.28, ry: 0, rz: 0 },
          LeftShoulder: { rx: 0, ry: 0, rz: -0.1 },
          LeftUpperArm: { rx: -0.22, ry: 0, rz: 0.92 },
          LeftLowerArm: { rx: -0.35, ry: 0, rz: 0 },
          LeftHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.2 },
          RightShoulder: { rx: 0, ry: 0, rz: 0.1 },
          RightUpperArm: { rx: -0.22, ry: 0, rz: -0.92 },
          RightLowerArm: { rx: -0.35, ry: 0, rz: 0 },
          RightHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.2 },
          LeftUpperLeg: { rx: -0.38, ry: 0, rz: 0.16 },
          LeftLowerLeg: { rx: 0.62, ry: 0, rz: 0 },
          LeftFoot: { rx: 0.12, ry: 0, rz: 0 },
          RightUpperLeg: { rx: -0.24, ry: 0, rz: -0.16 },
          RightLowerLeg: { rx: 0.48, ry: 0, rz: 0 },
          RightFoot: { rx: 0.12, ry: 0, rz: 0 },
        };

        const oppFrame8Grounded: RigPoseMap = {
          Hips: { rx: -1.48, ry: 0, rz: 0, px: 0, py: 0.18, pz: 0 },
          Spine: { rx: -0.08, ry: 0, rz: 0 },
          Chest: { rx: -0.1, ry: 0, rz: 0 },
          Neck: { rx: 0.14, ry: 0, rz: 0 },
          Head: { rx: 0.22, ry: 0, rz: 0 },
          LeftShoulder: { rx: 0, ry: 0, rz: -0.06 },
          LeftUpperArm: { rx: -0.15, ry: 0, rz: 0.95 },
          LeftLowerArm: { rx: -0.2, ry: 0, rz: 0 },
          LeftHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.15 },
          RightShoulder: { rx: 0, ry: 0, rz: 0.06 },
          RightUpperArm: { rx: -0.15, ry: 0, rz: -0.95 },
          RightLowerArm: { rx: -0.2, ry: 0, rz: 0 },
          RightHand: { rx: 0, ry: 0, rz: 0, fistCurl: 0.15 },
          LeftUpperLeg: { rx: 0.05, ry: 0, rz: 0.15 },
          LeftLowerLeg: { rx: 0.15, ry: 0, rz: 0 },
          LeftFoot: { rx: 0, ry: 0, rz: 0 },
          RightUpperLeg: { rx: 0.05, ry: 0, rz: -0.15 },
          RightLowerLeg: { rx: 0.15, ry: 0, rz: 0 },
          RightFoot: { rx: 0, ry: 0, rz: 0 },
        };

        let oppInterpolated: RigPoseMap;
        if (oppT < 0.3) {
          const u = smoothstep01(oppT / 0.3);
          oppInterpolated = interpolatePoseMaps(oppFrame1Stance, oppFrame2GrabReact, u);
        } else if (oppT < 0.6) {
          const u = smoothstep01((oppT - 0.3) / 0.3);
          oppInterpolated = interpolatePoseMaps(oppFrame2GrabReact, oppFrame3BreakBalance, u);
        } else if (oppT < 0.9) {
          const u = smoothstep01((oppT - 0.6) / 0.3);
          oppInterpolated = interpolatePoseMaps(oppFrame3BreakBalance, oppFrame4RotatedAcrossHip, u);
        } else if (oppT < 1.2) {
          const u = smoothstep01((oppT - 0.9) / 0.3);
          oppInterpolated = interpolatePoseMaps(oppFrame4RotatedAcrossHip, oppFrame5LiftedAirborne, u);
        } else if (oppT < 1.6) {
          const u = smoothstep01((oppT - 1.2) / 0.4);
          oppInterpolated = interpolatePoseMaps(oppFrame5LiftedAirborne, oppFrame6ThrownAirborne, u);
        } else if (oppT < 2.2) {
          const u = clamp01((oppT - 1.6) / 0.6);
          const fallAlpha = Math.pow(u, 1.3);
          oppInterpolated = interpolatePoseMaps(oppFrame6ThrownAirborne, oppFrame7GroundImpact, fallAlpha);
        } else {
          if (oppT < 2.38) {
            const impactBounce = Math.sin(((oppT - 2.2) / 0.18) * Math.PI);
            oppInterpolated = interpolatePoseMaps(oppFrame7GroundImpact, oppFrame7GroundImpact, 0);
            oppInterpolated.Hips.py = (oppInterpolated.Hips.py ?? 0.16) + 0.06 * impactBounce;
            oppInterpolated.Spine.rx -= 0.12 * impactBounce;
            oppInterpolated.LeftUpperLeg.rx -= 0.18 * impactBounce;
            oppInterpolated.RightUpperLeg.rx -= 0.18 * impactBounce;
          } else {
            const u = smoothstep01((oppT - 2.38) / 0.42);
            oppInterpolated = interpolatePoseMaps(oppFrame7GroundImpact, oppFrame8Grounded, u);
          }
        }

        Object.assign(pose, oppInterpolated);
        break;
      }

      case 'super_shot': {
        const frame = t * 60;
        if (characterId === 'action_sultan') {
          // 1. ACTION SULTAN — BLACKBUCK GUNSHOT SUPERSHOT
          // Frames 0..5: Reaches for and draws firearm from right holster
          // Frames 5..9.9: Confident marksman aiming stance + blackbuck silhouette sight
          // Frames 10..16: Gunshot fire + recoil kickback + shell ejection
          // Frames 16..36: Lower weapon and recover
          if (frame < 5) {
            const p = Math.min(1, frame / 5);
            pose.Hips.ry = lerp(0, -0.32, p);
            pose.Chest.ry = lerp(0, -0.24, p);
            pose.RightUpperArm = { rx: lerp(0.25, 0.42, p), ry: -0.25, rz: -0.22 };
            pose.RightLowerArm = { rx: lerp(-0.65, -1.15, p), ry: 0, rz: 0 };
            pose.LeftUpperArm = { rx: -0.55, ry: 0.3, rz: 0.35 };
          } else if (frame < 10) {
            const p = Math.min(1, (frame - 5) / 4);
            pose.Hips.py = baseHipsY * 0.95;
            pose.Hips.ry = -0.35;
            pose.Chest.ry = 0.35;
            pose.Chest.rx = 0.06;
            pose.Head.ry = -0.18;
            pose.Head.rx = 0.04;
            // Right arm extended straight forward aiming firearm
            pose.RightUpperArm = {
              rx: lerp(0.42, -1.52, p),
              ry: lerp(-0.25, -0.05, p),
              rz: -0.08,
            };
            pose.RightLowerArm = { rx: lerp(-1.15, -0.08, p), ry: 0, rz: 0 };
            // Left arm braced in confident shooter support stance
            pose.LeftUpperArm = { rx: -1.15, ry: 0.55, rz: 0.25 };
            pose.LeftLowerArm = { rx: -1.25, ry: 0, rz: 0 };
          } else if (frame < 18) {
            const recoilDecay = Math.max(0, 1 - (frame - 10) / 8);
            pose.Hips.py = baseHipsY * 0.94;
            pose.Hips.ry = -0.35;
            pose.Chest.ry = 0.35;
            pose.Chest.rx = -0.16 * recoilDecay;
            pose.RightUpperArm = {
              rx: -1.52 - 0.38 * recoilDecay,
              ry: -0.05,
              rz: -0.08,
            };
            pose.RightLowerArm = { rx: -0.08 - 0.32 * recoilDecay, ry: 0, rz: 0 };
            pose.LeftUpperArm = { rx: -1.15, ry: 0.55, rz: 0.25 };
            pose.LeftLowerArm = { rx: -1.25, ry: 0, rz: 0 };
          } else {
            const rec = Math.min(1, (frame - 18) / 18);
            pose.RightUpperArm = { rx: lerp(-1.52, -0.45, rec), ry: -0.2, rz: -0.35 };
            pose.RightLowerArm = { rx: lerp(-0.08, -1.2, rec), ry: 0, rz: 0 };
          }
        } else if (characterId === 'romance_raja') {
          // 2. ROMANCE RAJA — ICONIC SRK OPEN-ARMS POSE SUPERSHOT
          // Frames 0..4: Dramatic standing pose entry
          // Frames 4..10.9: Slowly opens both arms wide, chest opens, head tilts slightly upward
          // Frames 11..22: Holds signature open-arms pose while releasing cinematic energy wave
          // Frames 22..36: Graceful recovery
          if (frame < 4) {
            const p = frame / 4;
            pose.Hips.py = baseHipsY;
            pose.Chest.rx = lerp(0, 0.12, p);
            pose.LeftUpperArm = { rx: -0.85, ry: 0.55, rz: 0.2 };
            pose.RightUpperArm = { rx: -0.85, ry: -0.55, rz: -0.2 };
            pose.LeftLowerArm = { rx: -1.35, ry: 0, rz: 0 };
            pose.RightLowerArm = { rx: -1.35, ry: 0, rz: 0 };
          } else if (frame < 11) {
            const p = Math.min(1, (frame - 4) / 7);
            pose.Hips.py = baseHipsY + 0.03 * p;
            pose.Spine.rx = lerp(0, -0.14, p);
            pose.Chest.rx = lerp(0.12, -0.24, p);
            pose.Head.rx = lerp(0, -0.28, p);
            pose.Head.ry = lerp(0, 0.15, p);
            pose.LeftUpperArm = {
              rx: lerp(-0.85, -0.32, p),
              ry: lerp(0.55, -0.35, p),
              rz: lerp(0.2, 1.48, p),
            };
            pose.RightUpperArm = {
              rx: lerp(-0.85, -0.32, p),
              ry: lerp(-0.55, 0.35, p),
              rz: lerp(-0.2, -1.48, p),
            };
            pose.LeftLowerArm = { rx: lerp(-1.35, -0.15, p), ry: 0, rz: 0 };
            pose.RightLowerArm = { rx: lerp(-1.35, -0.15, p), ry: 0, rz: 0 };
          } else if (frame < 24) {
            const wavePulse = Math.sin((frame - 11) * 0.5) * 0.05;
            pose.Hips.py = baseHipsY + 0.04;
            pose.Spine.rx = -0.16;
            pose.Chest.rx = -0.26 + wavePulse;
            pose.Head.rx = -0.28;
            pose.Head.ry = 0.16;
            pose.LeftUpperArm = { rx: -0.32, ry: -0.38, rz: 1.52 + wavePulse };
            pose.RightUpperArm = { rx: -0.32, ry: 0.38, rz: -1.52 - wavePulse };
            pose.LeftLowerArm = { rx: -0.12, ry: 0, rz: 0 };
            pose.RightLowerArm = { rx: -0.12, ry: 0, rz: 0 };
            pose.RightUpperLeg = { rx: 0.22, ry: 0, rz: -0.12 };
            pose.LeftUpperLeg = { rx: -0.18, ry: 0, rz: 0.12 };
          } else {
            const rec = Math.min(1, (frame - 24) / 12);
            pose.Chest.rx = lerp(-0.26, 0, rec);
            pose.Head.rx = lerp(-0.28, 0, rec);
            pose.LeftUpperArm = { rx: -0.5, ry: 0.2, rz: lerp(1.52, 0.45, rec) };
            pose.RightUpperArm = { rx: -0.5, ry: -0.2, rz: lerp(-1.52, -0.45, rec) };
          }
        } else if (characterId === 'duggu') {
          // 3. DUGGU — KAHO NAA... PYAAR HAI DANCE-INSPIRED SUPERSHOT
          // Frames 0..4: Confident dancer stance bounce
          // Frames 4..11.9: Energetic dance-inspired footwork + expressive arm wave + body turn
          // Frames 12..21: Original acrobatic 360-degree spin + sonic wave release
          // Frames 21..38: Confident finishing dancer pose
          if (frame < 4) {
            pose.Hips.py = baseHipsY - 0.04 + Math.sin(frame * 1.2) * 0.04;
            pose.Chest.ry = 0.25;
            pose.LeftUpperArm = { rx: -1.1, ry: 0.3, rz: 1.15 };
            pose.RightUpperArm = { rx: -0.5, ry: -0.3, rz: -0.85 };
          } else if (frame < 12) {
            const stepCycle = (frame - 4) * 1.15;
            const s = Math.sin(stepCycle);
            const c = Math.cos(stepCycle);
            pose.Hips.py = baseHipsY - 0.03 + Math.abs(c) * 0.06;
            pose.Hips.ry = s * 0.42;
            pose.Chest.ry = -s * 0.48;
            pose.Chest.rz = c * 0.16;
            // Expressive Kaho Naa-inspired wave across arms
            pose.LeftUpperArm = { rx: -0.65 + s * 0.45, ry: 0.2, rz: 1.25 + c * 0.35 };
            pose.LeftLowerArm = { rx: -0.75 + c * 0.4, ry: 0, rz: 0 };
            pose.RightUpperArm = { rx: -0.65 - s * 0.45, ry: -0.2, rz: -1.25 + c * 0.35 };
            pose.RightLowerArm = { rx: -0.75 - c * 0.4, ry: 0, rz: 0 };
            // Syncopated dance footwork
            pose.LeftUpperLeg = { rx: s * 0.65, ry: 0, rz: 0.14 };
            pose.LeftLowerLeg = { rx: Math.max(0.15, -s * 0.55 + 0.35), ry: 0, rz: 0 };
            pose.RightUpperLeg = { rx: -s * 0.65, ry: 0, rz: -0.14 };
            pose.RightLowerLeg = { rx: Math.max(0.15, s * 0.55 + 0.35), ry: 0, rz: 0 };
          } else if (frame < 22) {
            const spinProgress = Math.min(1, (frame - 12) / 10);
            pose.Hips.py = baseHipsY + Math.sin(spinProgress * Math.PI) * 0.22;
            pose.Hips.ry = spinProgress * Math.PI * 2;
            pose.Chest.rx = -0.22;
            pose.RightUpperLeg = { rx: -1.55, ry: 0.2, rz: -0.35 };
            pose.RightLowerLeg = { rx: 0.1, ry: 0, rz: 0 };
            pose.LeftUpperArm = { rx: -0.45, ry: 0, rz: 1.4 };
            pose.RightUpperArm = { rx: -1.35, ry: 0, rz: -1.1 };
          } else {
            pose.Hips.py = baseHipsY - 0.03;
            pose.Hips.ry = -0.28;
            pose.Chest.ry = 0.32;
            pose.Head.ry = -0.15;
            pose.RightUpperArm = { rx: -1.45, ry: -0.2, rz: -0.85 };
            pose.RightLowerArm = { rx: -0.45, ry: 0, rz: 0 };
            pose.LeftUpperArm = { rx: -0.45, ry: 0.3, rz: 0.65 };
          }
        } else {
          // 4. BHIDU — ICONIC JACKIE SHROFF SWAGGER WALK SUPERSHOT
          // Frames 0..3: Relaxed confident standing position
          // Frames 3..12.9: Slow deliberate signature swagger walk with shoulder roll & hand gesture
          // Frames 13..22: Intimidating hero-style stance + heavy ground shockwave release
          // Frames 22..40: Laid-back swagger recovery
          if (frame < 3) {
            pose.Hips.py = baseHipsY;
            pose.Chest.rx = -0.06;
            pose.Head.rx = -0.08;
            pose.LeftUpperArm = { rx: -0.25, ry: 0.15, rz: 0.38 };
            pose.RightUpperArm = { rx: -0.35, ry: -0.15, rz: -0.38 };
          } else if (frame < 13) {
            const walkPhase = ((frame - 3) / 10) * Math.PI * 2;
            const s = Math.sin(walkPhase);
            const c = Math.cos(walkPhase);
            pose.Hips.py = baseHipsY - 0.03 + Math.abs(c) * 0.05;
            pose.Hips.ry = s * 0.26;
            // Signature Jackie Shroff relaxed shoulder roll & swagger lean
            pose.Chest.rx = -0.08;
            pose.Chest.ry = -s * 0.32;
            pose.Chest.rz = s * 0.16;
            pose.LeftShoulder = { rx: 0, ry: 0, rz: Math.max(0, s * 0.18) };
            pose.RightShoulder = { rx: 0, ry: 0, rz: Math.min(0, s * 0.18) };
            pose.Head.ry = s * 0.14;
            pose.Head.rx = -0.08;
            // Deliberate swagger stride
            pose.LeftUpperLeg = { rx: s * 0.62, ry: 0, rz: 0.08 };
            pose.LeftLowerLeg = { rx: Math.max(0.12, -c * 0.5 + 0.3), ry: 0, rz: 0 };
            pose.RightUpperLeg = { rx: -s * 0.62, ry: 0, rz: -0.08 };
            pose.RightLowerLeg = { rx: Math.max(0.12, c * 0.5 + 0.3), ry: 0, rz: 0 };
            // Characteristic Bhidu hand/wrist gesture
            pose.RightUpperArm = { rx: -0.78 + s * 0.25, ry: -0.28, rz: -0.58 };
            pose.RightLowerArm = { rx: -1.05 + c * 0.25, ry: 0.3, rz: 0 };
            pose.LeftUpperArm = { rx: -0.35 - s * 0.25, ry: 0.2, rz: 0.48 };
            pose.LeftLowerArm = { rx: -0.75, ry: 0, rz: 0 };
          } else if (frame < 24) {
            const stompFactor = Math.max(0, 1 - (frame - 13) / 8);
            pose.Hips.py = baseHipsY * (0.82 + 0.08 * (1 - stompFactor));
            pose.Spine.rx = 0.18;
            pose.Chest.rx = 0.22;
            pose.Head.rx = -0.14;
            pose.RightUpperLeg = { rx: -0.68, ry: 0, rz: -0.22 };
            pose.RightLowerLeg = { rx: 0.72, ry: 0, rz: 0 };
            pose.LeftUpperLeg = { rx: 0.28, ry: 0, rz: 0.18 };
            pose.LeftLowerLeg = { rx: 0.42, ry: 0, rz: 0 };
            pose.LeftUpperArm = { rx: -0.95, ry: 0.35, rz: 0.85 };
            pose.RightUpperArm = { rx: -1.15, ry: -0.35, rz: -0.85 };
            pose.LeftLowerArm = { rx: -0.65, ry: 0, rz: 0 };
            pose.RightLowerArm = { rx: -0.55, ry: 0, rz: 0 };
          } else {
            pose.Hips.py = baseHipsY * 0.95;
            pose.Chest.rx = -0.05;
            pose.LeftUpperArm = { rx: -0.4, ry: 0.2, rz: 0.45 };
            pose.RightUpperArm = { rx: -0.45, ry: -0.2, rz: -0.45 };
          }
        }
        break;
      }

      case 'super_move':
      case 'super':
      case 'special': {
        const spin = t * 16.0;
        if (characterId === 'action_sultan') {
          pose.Hips.py = baseHipsY * 0.86;
          pose.Chest.rx = 0.32;
          pose.LeftUpperArm = { rx: -1.65, ry: 0.2, rz: 0.3 };
          pose.RightUpperArm = { rx: -1.65, ry: -0.2, rz: -0.3 };
          pose.LeftLowerArm = { rx: -0.2, ry: 0, rz: 0 };
          pose.RightLowerArm = { rx: -0.2, ry: 0, rz: 0 };
        } else if (characterId === 'romance_raja') {
          pose.Hips.py = baseHipsY + 0.12;
          pose.Chest.rx = -0.28;
          pose.Head.rx = -0.2;
          pose.LeftUpperArm = { rx: -0.25, ry: -0.45, rz: 1.48 };
          pose.RightUpperArm = { rx: -0.25, ry: 0.45, rz: -1.48 };
          pose.LeftLowerArm = { rx: -0.1, ry: 0, rz: 0 };
          pose.RightLowerArm = { rx: -0.1, ry: 0, rz: 0 };
        } else if (characterId === 'duggu') {
          pose.Hips.py = baseHipsY + 0.18;
          pose.Hips.ry = spin;
          pose.RightUpperLeg = { rx: -1.6, ry: 0, rz: -0.4 };
          pose.RightLowerLeg = { rx: 0.05, ry: 0, rz: 0 };
          pose.LeftUpperLeg = { rx: 0.4, ry: 0, rz: 0.3 };
          pose.LeftUpperArm = { rx: -0.5, ry: 0, rz: 1.35 };
          pose.RightUpperArm = { rx: -0.5, ry: 0, rz: -1.35 };
        } else {
          pose.Hips.py = baseHipsY * 0.82;
          pose.Chest.rx = 0.42;
          pose.LeftUpperArm = { rx: -2.1, ry: 0.25, rz: 0.2 };
          pose.RightUpperArm = { rx: -2.1, ry: -0.25, rz: -0.2 };
          pose.LeftLowerArm = { rx: -0.35, ry: 0, rz: 0 };
          pose.RightLowerArm = { rx: -0.35, ry: 0, rz: 0 };
        }
        break;
      }

      case 'hurt': {
        pose.Hips.py = baseHipsY * 0.94;
        pose.Spine.rx = -0.25;
        pose.Chest.rx = -0.32;
        pose.Head.rx = -0.38;
        pose.LeftUpperArm = { rx: -0.3, ry: 0, rz: 0.65 };
        pose.RightUpperArm = { rx: -0.3, ry: 0, rz: -0.65 };
        break;
      }

      case 'knockback': {
        pose.Hips.py = baseHipsY * 0.85;
        pose.Hips.rx = -0.65;
        pose.Chest.rx = -0.35;
        pose.LeftUpperArm = { rx: -0.9, ry: 0, rz: 0.75 };
        pose.RightUpperArm = { rx: -0.9, ry: 0, rz: -0.75 };
        pose.LeftUpperLeg = { rx: -0.45, ry: 0, rz: 0.15 };
        pose.RightUpperLeg = { rx: -0.35, ry: 0, rz: -0.15 };
        break;
      }

      case 'knockdown':
      case 'defeat': {
        pose.Hips.py = 0.18;
        pose.Hips.rx = -1.48;
        pose.Chest.rx = -0.1;
        pose.Head.rx = 0.22;
        pose.LeftUpperArm = { rx: -0.15, ry: 0, rz: 0.95 };
        pose.RightUpperArm = { rx: -0.15, ry: 0, rz: -0.95 };
        pose.LeftUpperLeg = { rx: 0.05, ry: 0, rz: 0.15 };
        pose.LeftLowerLeg = { rx: 0.15, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: 0.05, ry: 0, rz: -0.15 };
        pose.RightLowerLeg = { rx: 0.15, ry: 0, rz: 0 };
        break;
      }

      case 'recovery': {
        pose.Hips.py = baseHipsY * 0.65;
        pose.Hips.rx = 0.35;
        pose.Chest.rx = 0.3;
        pose.LeftUpperLeg = { rx: -1.0, ry: 0, rz: 0.1 };
        pose.LeftLowerLeg = { rx: 1.5, ry: 0, rz: 0 };
        pose.RightUpperLeg = { rx: -0.6, ry: 0, rz: -0.1 };
        pose.RightLowerLeg = { rx: 1.1, ry: 0, rz: 0 };
        break;
      }

      case 'victory': {
        const wave = Math.sin(t * 5.0) * 0.12;
        pose.Hips.py = baseHipsY + 0.03;
        if (characterId === 'romance_raja') {
          pose.Chest.rx = -0.22;
          pose.LeftUpperArm = { rx: -0.2, ry: -0.35, rz: 1.4 + wave };
          pose.RightUpperArm = { rx: -0.2, ry: 0.35, rz: -1.4 - wave };
          pose.LeftLowerArm = { rx: -0.15, ry: 0, rz: 0 };
          pose.RightLowerArm = { rx: -0.15, ry: 0, rz: 0 };
        } else if (characterId === 'duggu') {
          // DUGGU – FinalDanceDuggu victory / finisher celebration pose
          pose.Hips.py = baseHipsY + 0.05;
          pose.Hips.ry = Math.sin(t * 6.5) * 0.22;
          pose.Chest.ry = -Math.sin(t * 6.5) * 0.18;
          pose.Chest.rx = -0.12;
          pose.RightUpperArm = { rx: -0.9, ry: -0.25, rz: -0.5 };
          pose.RightLowerArm = { rx: -0.9, ry: 0, rz: 0 };
          pose.LeftUpperArm = { rx: -0.9, ry: 0.25, rz: 0.5 };
          pose.LeftLowerArm = { rx: -0.9, ry: 0, rz: 0 };
        } else {
          pose.Chest.rx = -0.15;
          pose.RightUpperArm = { rx: -2.65, ry: 0, rz: -0.35 + wave };
          pose.RightLowerArm = { rx: -0.35, ry: 0, rz: 0 };
          pose.LeftUpperArm = { rx: -0.45, ry: 0.25, rz: 0.55 };
          pose.LeftLowerArm = { rx: -1.1, ry: 0, rz: 0 };
        }
        break;
      }
    }

    const payload =
      eventPayload ||
      FighterAnimationEvents.computeFrameSnapshot(
        characterId,
        state,
        Math.floor(t * 60)
      );

    // Apply 5-node Facial Expression Rig poses (Jaw, LeftBrow, RightBrow, LeftEyelid, RightEyelid)
    const facialPoses = this.computeFacialRigPose(
      payload.facialExpression,
      t
    );
    Object.assign(pose, facialPoses);

    // Apply multi-phase SuperMove choreography if in SuperMove state
    if (
      state === 'super_move' ||
      state === 'super' ||
      state === 'special'
    ) {
      this.applyMultiPhaseSpecialPose(
        pose,
        characterId,
        state,
        payload,
        heightScale
      );
    }

    return pose;
  }

  public computeFacialRigPose(
    expression: FighterAnimationEventPayload['facialExpression'],
    t: number
  ): Record<string, BonePoseTransform> {
    const blink = Math.sin(t * 2.7) > 0.96 ? 0.08 : 0;

    switch (expression) {
      case 'EFFORT':
        return {
          Jaw: { rx: 0.22, ry: 0, rz: 0, px: 0, py: 0.032, pz: 0.03 },
          LeftBrow: { rx: 0.12, ry: 0, rz: -0.22 },
          RightBrow: { rx: 0.12, ry: 0, rz: 0.22 },
          LeftEyelid: { rx: 0.08, ry: 0, rz: 0 },
          RightEyelid: { rx: 0.08, ry: 0, rz: 0 },
        };
      case 'SUPER_ROAR':
        return {
          Jaw: { rx: 0.42, ry: 0, rz: 0, px: 0, py: 0.024, pz: 0.032 },
          LeftBrow: { rx: 0.18, ry: 0, rz: -0.32 },
          RightBrow: { rx: 0.18, ry: 0, rz: 0.32 },
          LeftEyelid: { rx: -0.05, ry: 0, rz: 0 },
          RightEyelid: { rx: -0.05, ry: 0, rz: 0 },
        };
      case 'PAIN':
        return {
          Jaw: { rx: 0.28, ry: 0.06, rz: 0, px: 0, py: 0.03, pz: 0.028 },
          LeftBrow: { rx: -0.15, ry: 0, rz: 0.25 },
          RightBrow: { rx: -0.15, ry: 0, rz: -0.25 },
          LeftEyelid: { rx: 0.25, ry: 0, rz: 0 },
          RightEyelid: { rx: 0.25, ry: 0, rz: 0 },
        };
      case 'VICTORY_SMILE':
        return {
          Jaw: { rx: 0.12, ry: 0, rz: 0, px: 0, py: 0.036, pz: 0.032 },
          LeftBrow: { rx: -0.12, ry: 0, rz: 0.1 },
          RightBrow: { rx: -0.12, ry: 0, rz: -0.1 },
          LeftEyelid: { rx: blink, ry: 0, rz: 0 },
          RightEyelid: { rx: blink, ry: 0, rz: 0 },
        };
      case 'NEUTRAL':
      default:
        return {
          Jaw: { rx: 0.02, ry: 0, rz: 0, px: 0, py: 0.04, pz: 0.03 },
          LeftBrow: { rx: 0, ry: 0, rz: -0.06 },
          RightBrow: { rx: 0, ry: 0, rz: 0.06 },
          LeftEyelid: { rx: blink, ry: 0, rz: 0 },
          RightEyelid: { rx: blink, ry: 0, rz: 0 },
        };
    }
  }

  public applyMultiPhaseSpecialPose(
    pose: RigPoseMap,
    characterId: FighterId,
    _state: FighterStateName,
    payload: FighterAnimationEventPayload,
    heightScale: number
  ): void {
    const baseHipsY = 0.95 * heightScale;
    const nt = payload.normalizedTime;

    if (characterId === 'action_sultan') {
      if (payload.superMovePhase === 'CHARGE_POSE') {
        pose.Hips.py = baseHipsY * 0.92;
        pose.Chest.rx = -0.22;
        pose.LeftUpperArm = { rx: -0.95, ry: 0.45, rz: 0.85 };
        pose.RightUpperArm = { rx: -0.95, ry: -0.45, rz: -0.85 };
        pose.LeftLowerArm = { rx: -1.65, ry: 0, rz: 0 };
        pose.RightLowerArm = { rx: -1.65, ry: 0, rz: 0 };
      } else if (payload.superMovePhase === 'BURST_ENGAGE') {
        pose.Hips.py = baseHipsY * 0.82;
        pose.Chest.rx = 0.48;
        pose.Chest.ry = 0.38;
        pose.RightUpperArm = { rx: -0.65, ry: -0.55, rz: -0.25 };
        pose.LeftUpperArm = { rx: -1.35, ry: 0.3, rz: 0.4 };
      } else {
        pose.Hips.py = baseHipsY * 0.72;
        pose.Chest.rx = 0.55;
        pose.LeftUpperArm = { rx: -1.85, ry: 0.25, rz: 0.2 };
        pose.RightUpperArm = { rx: -1.85, ry: -0.25, rz: -0.2 };
        pose.LeftLowerArm = { rx: -0.15, ry: 0, rz: 0 };
        pose.RightLowerArm = { rx: -0.15, ry: 0, rz: 0 };
      }
      return;
    }

    if (characterId === 'romance_raja') {
      if (payload.superMovePhase === 'CHARGE_POSE') {
        pose.Hips.ry = nt * Math.PI * 4;
        pose.Chest.rx = -0.18;
      } else if (payload.superMovePhase === 'BURST_ENGAGE') {
        pose.Hips.py = baseHipsY * 0.9;
        pose.Chest.ry = Math.sin(nt * 40) * 0.55;
        pose.RightUpperArm = { rx: -1.55, ry: -0.2, rz: -0.15 };
        pose.LeftUpperArm = { rx: -1.55, ry: 0.2, rz: 0.15 };
      } else {
        pose.Hips.py = baseHipsY + 0.18;
        pose.Chest.rx = -0.32;
        pose.Head.rx = -0.24;
        pose.LeftUpperArm = { rx: -0.22, ry: -0.45, rz: 1.52 };
        pose.RightUpperArm = { rx: -0.22, ry: 0.45, rz: -1.52 };
      }
      return;
    }

    if (characterId === 'duggu') {
      if (payload.superMovePhase === 'CHARGE_POSE') {
        pose.Hips.py = baseHipsY * 0.78;
        pose.Chest.rx = 0.28;
      } else if (payload.superMovePhase === 'BURST_ENGAGE') {
        pose.Hips.py = baseHipsY + 0.25;
        pose.Hips.ry = nt * Math.PI * 8;
        pose.RightUpperLeg = { rx: -1.65, ry: 0, rz: -0.45 };
        pose.LeftUpperLeg = { rx: -1.25, ry: 0, rz: 0.45 };
      } else {
        pose.Hips.py = baseHipsY * 0.85;
        pose.RightUpperLeg = { rx: -1.75, ry: 0.1, rz: -0.25 };
        pose.RightLowerLeg = { rx: 0.05, ry: 0, rz: 0 };
      }
      return;
    }

    if (characterId === 'bhidu') {
      if (payload.superMovePhase === 'CHARGE_POSE') {
        pose.Hips.py = baseHipsY * 0.94;
        pose.Chest.rx = -0.28;
        pose.LeftUpperArm = { rx: -0.65, ry: -0.4, rz: 1.1 };
        pose.RightUpperArm = { rx: -0.65, ry: 0.4, rz: -1.1 };
      } else if (payload.superMovePhase === 'BURST_ENGAGE') {
        pose.Hips.py = baseHipsY * 0.88;
        pose.Chest.rx = 0.35;
        pose.RightUpperArm = { rx: -1.55, ry: 0.1, rz: -1.25 };
        pose.RightLowerArm = { rx: -0.1, ry: 0, rz: 0 };
      } else {
        pose.Hips.py = baseHipsY * 0.72;
        pose.Chest.rx = 0.58;
        pose.LeftUpperArm = { rx: -2.15, ry: 0.25, rz: 0.18 };
        pose.RightUpperArm = { rx: -2.15, ry: -0.25, rz: -0.18 };
      }
    }
  }

  /**
   * Analytical two-bone contact constraint & IK adjustment for Action Sultan's Dhobi Pachad
   * during the active clinch, pull, pivot, and lift window (0.30s to 1.60s).
   * Adjusts shoulder, upper-arm, forearm, and wrist angles based on live horizontal separation
   * and vertical lift elevation so Sultan's hands maintain firm contact with the opponent's
   * upper torso/shoulder and waist without passing through or intersecting the opponent's mesh.
   */
  public applyDhobiPachadContactIK(
    attackerPose: RigPoseMap,
    defenderPose: RigPoseMap,
    t: number,
    separationX: number,
    elevationY: number
  ): void {
    const grabT = Math.max(0, Math.min(t, 2.8));
    if (grabT < 0.25 || grabT > 1.62) {
      return;
    }

    // Weight of the IK contact lock: ramps in from 0.25–0.30s, stays 1.0 during 0.30–1.50s, releases by 1.60s
    let contactWeight = 1.0;
    if (grabT < 0.3) {
      contactWeight = smoothstep01((grabT - 0.25) / 0.05);
    } else if (grabT > 1.5) {
      contactWeight = 1.0 - smoothstep01((grabT - 1.5) / 0.12);
    }

    // Clamp separation so hands never penetrate the opponent's chest cylinder (min surface clearance ~0.32m)
    const clampedSep = Math.max(0.32, Math.min(0.75, Math.abs(separationX)));
    const reachRatio = clamp01((clampedSep - 0.32) / 0.42);
    const liftRatio = clamp01(elevationY / 0.75);

    // 2-bone analytical elbow flexion angle (Law of Cosines approximation for upper arm L1=0.31m, forearm L2=0.29m)
    const targetElbowBend = lerp(-1.32, -0.78, reachRatio) - liftRatio * 0.12;
    const targetShoulderPitch = lerp(-0.82, -1.12, reachRatio) - liftRatio * 0.22;
    const antiPenetrationSpread = lerp(0.28, 0.18, reachRatio);

    if (attackerPose.RightUpperArm && attackerPose.RightLowerArm && attackerPose.RightHand) {
      attackerPose.RightUpperArm.rx = lerp(
        attackerPose.RightUpperArm.rx,
        targetShoulderPitch,
        contactWeight * 0.55
      );
      attackerPose.RightUpperArm.rz = lerp(
        attackerPose.RightUpperArm.rz,
        -antiPenetrationSpread,
        contactWeight * 0.65
      );
      attackerPose.RightLowerArm.rx = lerp(
        attackerPose.RightLowerArm.rx,
        targetElbowBend,
        contactWeight * 0.6
      );
      attackerPose.RightHand.fistCurl = Math.max(
        attackerPose.RightHand.fistCurl ?? 0.95,
        0.95 * contactWeight
      );
    }

    if (attackerPose.LeftUpperArm && attackerPose.LeftLowerArm && attackerPose.LeftHand) {
      attackerPose.LeftUpperArm.rx = lerp(
        attackerPose.LeftUpperArm.rx,
        targetShoulderPitch + 0.12,
        contactWeight * 0.55
      );
      attackerPose.LeftUpperArm.rz = lerp(
        attackerPose.LeftUpperArm.rz,
        antiPenetrationSpread,
        contactWeight * 0.65
      );
      attackerPose.LeftLowerArm.rx = lerp(
        attackerPose.LeftLowerArm.rx,
        targetElbowBend - 0.08,
        contactWeight * 0.6
      );
      attackerPose.LeftHand.fistCurl = Math.max(
        attackerPose.LeftHand.fistCurl ?? 0.95,
        0.95 * contactWeight
      );
    }

    // Ensure opponent's upper torso tracks Sultan's hip/shoulder rotation without mesh intersection
    if (defenderPose.Chest && defenderPose.Hips) {
      defenderPose.Hips.pz = 0;
    }
  }
}
