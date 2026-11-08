import { Vector3 } from '@babylonjs/core';
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
  AnimationController3D,
  BonePoseTransform,
  hasCompatibleProceduralBones,
  RigPoseMap,
} from './AnimationController3D';
import {
  FighterAnimationEventPayload,
  FighterAnimationEvents,
} from './FighterAnimationEvents';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * CharacterAnimationController
 *
 * Production 3D Skeletal + Facial Expression Animation Controller for Filmi Dangal:
 * - Drives all 22 humanoid skeleton bones + 5 facial rig bones (`Jaw`, `LeftBrow`, `RightBrow`, `LeftEyelid`, `RightEyelid`)
 * - Evaluates frame-accurate `FighterAnimationEvents` (`ON_STARTUP_BEGIN`, `ON_CHARGE_START`,
 *   `ON_PROJECTILE_RELEASE`, `ON_SPECIAL_IMPACT`, `ON_ANIMATION_COMPLETE`)
 * - Implements the 4 character-specific SuperShot animations:
 *   1. Action Sultan: `Anim_AS_SuperShot_BlackbuckGunshot`
 *   2. Romance Raja: `Anim_RR_SuperShot_OpenArmsPose`
 *   3. Duggu: `Anim_DG_SuperShot_KahoNaaDanceWave`
 *   4. Bhidu: `Anim_BH_SuperShot_BhiduSwaggerWalk`
 */
export class CharacterAnimationController {
  private readonly baseAnim = new AnimationController3D();
  private readonly animEvents = new FighterAnimationEvents();
  private warnedMissingClips = new Set<string>();

  public getEventsDispatcher(): FighterAnimationEvents {
    return this.animEvents;
  }

  public updateRigPose(
    rig: CharacterRig3D,
    characterId: FighterId,
    state: FighterStateName,
    stateTimeSec: number,
    dt: number,
    facing: 1 | -1,
    zVelocity = 0
  ): FighterAnimationEventPayload {
    const manifest = getCharacterAssetConfig(characterId);
    const heightScale = (rig.rootNode.metadata?.heightScale as number) || 1.0;
    const stateFrame = Math.floor(stateTimeSec * 60);

    const eventPayload = this.animEvents.evaluateFrame(
      characterId,
      state,
      stateFrame
    );

    const rightYaw = manifest?.facingRotationY?.right ?? Math.PI * 0.5;
    const leftYaw = manifest?.facingRotationY?.left ?? -Math.PI * 0.5;
    const targetYaw =
      facing === 1
        ? rightYaw - zVelocity * 0.05
        : leftYaw + zVelocity * 0.05;
    rig.facingNode.rotation.y = lerp(
      rig.facingNode.rotation.y,
      targetYaw,
      Math.min(1, dt * 16)
    );

    if (!rig.rootNode.metadata) {
      rig.rootNode.metadata = {};
    }
    const meta = rig.rootNode.metadata as Record<string, unknown>;
    const prevState = meta.lastPreviewAnimState as FighterStateName | undefined;
    const prevStateTime = (meta.lastPreviewAnimStateTimeSec as number) ?? 0;
    const isNewStateEntry =
      prevState !== state || stateTimeSec < prevStateTime - 0.02;
    meta.lastPreviewAnimState = state;
    meta.lastPreviewAnimStateTimeSec = stateTimeSec;

    if (!rig.isPlaceholderAsset && rig.productionRigValid) {
      const standardClipId = mapStateToStandardClipId(state);
      const animSpeed = manifest?.animationSpeed || 1.0;
      const played =
        rig.glbAnimationController?.playClip(
          standardClipId,
          animSpeed,
          isNewStateEntry
        ) ?? false;

      if (played) {
        return eventPayload;
      }

      rig.glbAnimationController?.stopAll();
      const warnKey = `${characterId}:${standardClipId}`;
      if (!this.warnedMissingClips.has(warnKey)) {
        this.warnedMissingClips.add(warnKey);
        const msg = `Production GLB for '${characterId}' is missing usable AnimationGroup for state '${state}' (${standardClipId}); falling back to procedural bone pose.`;
        console.warn(`[CharacterAnimationController] ${msg}`);
        if (
          rig.diagnostics &&
          !rig.diagnostics.warnings.includes(msg)
        ) {
          rig.diagnostics.warnings.push(msg);
        }
      }

      if (!hasCompatibleProceduralBones(rig.bones)) {
        return eventPayload;
      }
    }

    if (!rig.bones || Object.keys(rig.bones).length === 0) {
      return eventPayload;
    }

    const pose = this.computeTargetPose(
      characterId,
      state,
      stateTimeSec,
      heightScale,
      zVelocity,
      eventPayload
    );

    const blendSpeed = Math.min(1, dt * 18);

    for (const [boneName, target] of Object.entries(pose)) {
      const node = rig.bones[boneName];
      if (!node) continue;

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

    return eventPayload;
  }

  public getSocketWorldPosition(
    rig: CharacterRig3D,
    boneName: BoneAttachmentName
  ): Vector3 {
    return this.baseAnim.getSocketWorldPosition(rig, boneName);
  }

  public computeTargetPose(
    characterId: FighterId,
    state: FighterStateName,
    t: number,
    heightScale = 1.0,
    zVel = 0,
    eventPayload?: FighterAnimationEventPayload
  ): RigPoseMap {
    const pose = this.baseAnim.computeTargetPose(
      characterId,
      state,
      t,
      heightScale,
      zVel
    );

    const payload =
      eventPayload ||
      this.animEvents.evaluateFrame(characterId, state, Math.floor(t * 60));

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

  private computeFacialRigPose(
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

  private applyMultiPhaseSpecialPose(
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
