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
}

export type RigPoseMap = Record<string, BonePoseTransform>;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
      const blendSpeed = Math.min(1, dt * 18);
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
          pose.Hips.py = baseHipsY + breath * 0.025;
          pose.Hips.ry = -0.22;
          pose.Chest.rx = 0.08 + breath * 0.03;
          pose.Chest.ry = 0.18;
          pose.LeftUpperArm = { rx: -0.65 + breath * 0.05, ry: 0.25, rz: 0.38 };
          pose.LeftLowerArm = { rx: -1.35, ry: 0, rz: 0 };
          pose.RightUpperArm = { rx: -0.45 - breath * 0.05, ry: -0.2, rz: -0.42 };
          pose.RightLowerArm = { rx: -1.25, ry: 0, rz: 0 };
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
        pose.Hips.py = baseHipsY * 0.9;
        pose.Chest.rx = 0.28;
        pose.LeftUpperArm = { rx: -1.45, ry: 0.35, rz: 0.2 };
        pose.LeftLowerArm = { rx: -0.45, ry: 0, rz: 0 };
        pose.RightUpperArm = { rx: -1.45, ry: -0.35, rz: -0.2 };
        pose.RightLowerArm = { rx: -0.45, ry: 0, rz: 0 };
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
}
