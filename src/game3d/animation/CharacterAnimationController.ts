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
 * Production 3D Skeletal + Facial Expression Animation Controller for Fight Fun:
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

    // Priority 1: Play imported Blender/GLB AnimationGroup if available & genuinely animated
    const hasEmbeddedController = Boolean(
      !rig.isPlaceholderAsset &&
        rig.glbAnimationController &&
        rig.glbAnimationController.getClipCount() > 0
    );

    if (hasEmbeddedController) {
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
    } else if (!rig.isPlaceholderAsset) {
      rig.glbAnimationController?.stopAll();
    }

    // Priority 2: Procedural skeletal bone fallback on resolved humanoid bones
    const canDriveBones =
      rig.canUseProceduralBoneFallback ||
      hasCompatibleProceduralBones(rig.bones);

    if (canDriveBones && rig.bones && Object.keys(rig.bones).length > 0) {
      const isLocomotionState =
        state === 'walk' ||
        state === 'walk_forward' ||
        state === 'walk_backward' ||
        state === 'run';

      let effectiveTimeSec = stateTimeSec;
      if (isLocomotionState && Math.abs(zVelocity) > 0.05) {
        const refSpeed = state === 'run' ? 7.6 : 4.0;
        const speedRatio = Math.max(0.65, Math.min(1.65, Math.abs(zVelocity) / refSpeed));
        const prevLocomotionTime =
          typeof meta.locomotionCycleTimeSec === 'number' && !isNewStateEntry
            ? (meta.locomotionCycleTimeSec as number)
            : stateTimeSec;
        effectiveTimeSec = prevLocomotionTime + dt * speedRatio;
        meta.locomotionCycleTimeSec = effectiveTimeSec;
      } else {
        meta.locomotionCycleTimeSec = stateTimeSec;
      }

      const pose = this.computeTargetPose(
        characterId,
        state,
        effectiveTimeSec,
        heightScale,
        zVelocity,
        eventPayload
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
          : Math.min(1, dt * (isCrispStrikeState ? 48 : isLocomotionState ? 24 : 18));
      this.baseAnim.applyProceduralPoseToRigBones(
        rig,
        pose,
        heightScale,
        blendSpeed
      );
      return eventPayload;
    }

    // Priority 3: Safe visual presentation (only if neither imported animations nor procedural bones are available)
    if (rig.isVisualOnly || rig.renderState === 'VISUAL_ONLY') {
      this.baseAnim.updateVisualOnlyPresentation(
        rig,
        characterId,
        state,
        stateTimeSec,
        dt
      );
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
    return this.baseAnim.computeTargetPose(
      characterId,
      state,
      t,
      heightScale,
      zVel,
      eventPayload
    );
  }
}
