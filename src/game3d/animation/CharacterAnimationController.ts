import { Vector3 } from '@babylonjs/core';
import {
  BoneAttachmentName,
  FighterId,
  FighterStateName,
} from '../../types/fighter';
import { CharacterRig3D } from '../assets/AssetLoader3D';
import {
  FacialExpressionState,
  FighterAnimationEventPayload,
  FighterAnimationEvents,
} from './FighterAnimationEvents';

/**
 * CharacterAnimationController
 *
 * Drives character-specific 3D skeletal animations, facial expression rig nodes
 * (Jaw, LeftBrow, RightBrow, LeftEyelid, RightEyelid), socket world queries,
 * and FighterAnimationEvents across all 18 animation states.
 *
 * Guarantees that every character has distinct Idle, Walk, Punch, Kick, Block, Jump,
 * SuperShot, and SuperMove choreography (never reusing the same animation with just
 * different particle colors).
 */

export interface BoneTransformTarget {
  rot: [number, number, number];
  posOffset?: [number, number, number];
}

export type BonePoseMap = Record<string, BoneTransformTarget>;

export class CharacterAnimationController {
  private events = new FighterAnimationEvents();
  private lastEventPayload: FighterAnimationEventPayload | null = null;

  public getEventsDispatcher(): FighterAnimationEvents {
    return this.events;
  }

  public getLastEventPayload(): FighterAnimationEventPayload | null {
    return this.lastEventPayload;
  }

  /**
   * Computes character-specific target pose across all 22 humanoid bones + 5 facial rig nodes.
   */
  public computeTargetPose(
    characterId: FighterId,
    state: FighterStateName,
    stateTimeSec: number,
    heightScale = 1.0,
    zVelocity = 0
  ): BonePoseMap {
    const pose: BonePoseMap = {
      Hips: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      Spine: { rot: [0, 0, 0] },
      Chest: { rot: [0, 0, 0] },
      Neck: { rot: [0, 0, 0] },
      Head: { rot: [0, 0, 0] },
      Jaw: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      LeftBrow: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      RightBrow: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      LeftEyelid: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      RightEyelid: { rot: [0, 0, 0], posOffset: [0, 0, 0] },
      LeftShoulder: { rot: [0, 0, 0] },
      LeftUpperArm: { rot: [0, 0, 0.25] },
      LeftLowerArm: { rot: [-0.8, 0, 0] },
      LeftHand: { rot: [0, 0, 0] },
      RightShoulder: { rot: [0, 0, 0] },
      RightUpperArm: { rot: [0, 0, -0.25] },
      RightLowerArm: { rot: [-0.8, 0, 0] },
      RightHand: { rot: [0, 0, 0] },
      LeftUpperLeg: { rot: [-0.15, 0, 0.05] },
      LeftLowerLeg: { rot: [0.3, 0, 0] },
      LeftFoot: { rot: [-0.15, 0, 0] },
      RightUpperLeg: { rot: [0.15, 0, -0.05] },
      RightLowerLeg: { rot: [0.25, 0, 0] },
      RightFoot: { rot: [-0.1, 0, 0] },
    };

    const breathe = Math.sin(stateTimeSec * 4.5);
    const stride = Math.sin(stateTimeSec * 11.0);
    const fastCycle = Math.sin(stateTimeSec * 16.0);
    const stateFrame = Math.round(stateTimeSec * 60);

    switch (state) {
      case 'idle': {
        if (characterId === 'action_sultan') {
          // Heavy mass-action brawler stance: chin tucked behind aviators, broad shoulder roll, Firoza bracelet flex
          pose.Hips.posOffset = [0, breathe * 0.025 * heightScale, 0];
          pose.Spine.rot = [0.07 + breathe * 0.025, -0.22, 0];
          pose.Chest.rot = [0.04, -0.14 + Math.sin(stateTimeSec * 2.4) * 0.06, 0];
          pose.Head.rot = [-0.05, 0.24, 0];
          pose.LeftUpperArm.rot = [-0.62 + breathe * 0.05, 0.28, 0.34];
          pose.LeftLowerArm.rot = [-1.52, 0, 0];
          pose.RightUpperArm.rot = [-0.52 - breathe * 0.05, -0.25, -0.36];
          pose.RightLowerArm.rot = [-1.42, 0.2 * Math.sin(stateTimeSec * 3.2), 0];
        } else if (characterId === 'romance_raja') {
          // Poised romantic fencing stance, charismatic head tilt & open lead hand
          pose.Hips.posOffset = [0, breathe * 0.022 * heightScale, 0];
          pose.Spine.rot = [0.03, -0.32, 0];
          pose.Chest.rot = [-0.04, -0.1, 0.04];
          pose.Head.rot = [-0.04, 0.34, -0.06];
          pose.LeftUpperArm.rot = [-0.78 + breathe * 0.06, 0.35, 0.22];
          pose.LeftLowerArm.rot = [-1.25, 0, 0];
          pose.RightUpperArm.rot = [-0.45, -0.2, -0.45];
          pose.RightLowerArm.rot = [-1.6, 0, 0];
        } else if (characterId === 'dance_dynamo') {
          // Kinetic rhythmic bounce, agile high guard
          const groove = Math.sin(stateTimeSec * 7.2);
          pose.Hips.posOffset = [0, Math.abs(groove) * 0.038 * heightScale, groove * 0.02];
          pose.Spine.rot = [0.08, -0.2 + groove * 0.08, groove * 0.04];
          pose.Chest.rot = [0.05, -0.12 - groove * 0.06, 0];
          pose.Head.rot = [-0.04, 0.26, 0];
          pose.LeftUpperArm.rot = [-0.85 + groove * 0.08, 0.3, 0.28];
          pose.LeftLowerArm.rot = [-1.65, 0, 0];
          pose.RightUpperArm.rot = [-0.72 - groove * 0.08, -0.28, -0.28];
          pose.RightLowerArm.rot = [-1.55, 0, 0];
        } else {
          // Villain Saab: towering heavy enforcer, menacing low guard & slow neck roll
          pose.Hips.posOffset = [0, breathe * 0.018 * heightScale, 0];
          pose.Spine.rot = [0.11, -0.15, 0];
          pose.Chest.rot = [0.08, -0.1, 0];
          pose.Head.rot = [0.06, 0.18, Math.sin(stateTimeSec * 2.0) * 0.08];
          pose.LeftUpperArm.rot = [-0.42, 0.2, 0.42];
          pose.LeftLowerArm.rot = [-1.15, 0, 0];
          pose.RightUpperArm.rot = [-0.38, -0.2, -0.42];
          pose.RightLowerArm.rot = [-1.1, 0, 0];
        }
        break;
      }

      case 'walk':
      case 'walk_forward':
      case 'walk_backward': {
        const dir = state === 'walk_backward' ? -1 : 1;
        const swagger =
          characterId === 'action_sultan'
            ? 0.15
            : characterId === 'villain_saab'
            ? 0.18
            : 0.09;
        pose.Hips.posOffset = [0, Math.abs(stride) * 0.04, 0];
        pose.Spine.rot = [0.12 * dir, stride * swagger, 0];
        pose.Chest.rot = [0.06 * dir, stride * (swagger * 0.8), 0];
        pose.LeftUpperLeg.rot = [-stride * 0.55 * dir, 0, 0.05];
        pose.LeftLowerLeg.rot = [Math.max(0.15, stride * 0.65), 0, 0];
        pose.RightUpperLeg.rot = [stride * 0.55 * dir, 0, -0.05];
        pose.RightLowerLeg.rot = [Math.max(0.15, -stride * 0.65), 0, 0];
        pose.LeftUpperArm.rot = [-0.6 + stride * 0.35, 0.2, 0.28];
        pose.LeftLowerArm.rot = [-1.45, 0, 0];
        pose.RightUpperArm.rot = [-0.6 - stride * 0.35, -0.2, -0.28];
        pose.RightLowerArm.rot = [-1.45, 0, 0];
        break;
      }

      case 'run': {
        pose.Hips.posOffset = [0, Math.abs(fastCycle) * 0.06, 0];
        pose.Spine.rot = [0.28, fastCycle * 0.16, 0];
        pose.Chest.rot = [0.18, fastCycle * 0.12, 0];
        pose.LeftUpperLeg.rot = [-fastCycle * 0.8, 0, 0.05];
        pose.LeftLowerLeg.rot = [Math.max(0.2, fastCycle * 0.9), 0, 0];
        pose.RightUpperLeg.rot = [fastCycle * 0.8, 0, -0.05];
        pose.RightLowerLeg.rot = [Math.max(0.2, -fastCycle * 0.9), 0, 0];
        pose.LeftUpperArm.rot = [-0.7 + fastCycle * 0.6, 0.1, 0.25];
        pose.RightUpperArm.rot = [-0.7 - fastCycle * 0.6, -0.1, -0.25];
        break;
      }

      case 'sidestep': {
        const leanZ = zVelocity >= 0 ? -0.22 : 0.22;
        pose.Hips.posOffset = [0, -0.06, 0];
        pose.Spine.rot = [0.15, 0, leanZ];
        pose.Chest.rot = [0.1, 0, leanZ * 0.6];
        pose.LeftUpperLeg.rot = [-0.35, 0, 0.18];
        pose.LeftLowerLeg.rot = [0.65, 0, 0];
        pose.RightUpperLeg.rot = [-0.35, 0, -0.18];
        pose.RightLowerLeg.rot = [0.65, 0, 0];
        pose.LeftUpperArm.rot = [-0.8, 0.3, 0.35];
        pose.RightUpperArm.rot = [-0.8, -0.3, -0.35];
        break;
      }

      case 'jump': {
        pose.Hips.posOffset = [0, 0.08, 0];
        pose.Spine.rot = [0.18, 0, 0];
        pose.LeftUpperLeg.rot = [-0.75, 0, 0.1];
        pose.LeftLowerLeg.rot = [1.25, 0, 0];
        pose.RightUpperLeg.rot = [-0.55, 0, -0.1];
        pose.RightLowerLeg.rot = [0.95, 0, 0];
        pose.LeftUpperArm.rot = [-1.1, 0.2, 0.4];
        pose.LeftLowerArm.rot = [-1.2, 0, 0];
        pose.RightUpperArm.rot = [-0.9, -0.2, -0.4];
        pose.RightLowerArm.rot = [-1.3, 0, 0];
        break;
      }

      case 'crouch':
      case 'crouch_block': {
        pose.Hips.posOffset = [0, -0.34, 0];
        pose.Spine.rot = [0.32, -0.2, 0];
        pose.LeftUpperLeg.rot = [-1.05, 0, 0.15];
        pose.LeftLowerLeg.rot = [1.85, 0, 0];
        pose.RightUpperLeg.rot = [-0.95, 0, -0.15];
        pose.RightLowerLeg.rot = [1.75, 0, 0];
        pose.LeftUpperArm.rot = [-0.95, 0.45, 0.25];
        pose.LeftLowerArm.rot = [-1.75, 0, 0];
        pose.RightUpperArm.rot = [-0.95, -0.45, -0.25];
        pose.RightLowerArm.rot = [-1.75, 0, 0];
        break;
      }

      case 'block': {
        pose.Hips.posOffset = [0, -0.07, 0];
        pose.Spine.rot = [0.14, -0.1, 0];
        pose.Chest.rot = [0.1, 0, 0];
        pose.Head.rot = [0.16, 0, 0];
        pose.LeftUpperArm.rot = [-1.28, 0.62, 0.2];
        pose.LeftLowerArm.rot = [-1.92, 0, 0];
        pose.RightUpperArm.rot = [-1.28, -0.62, -0.2];
        pose.RightLowerArm.rot = [-1.92, 0, 0];
        pose.LeftUpperLeg.rot = [-0.28, 0, 0.1];
        pose.LeftLowerLeg.rot = [0.5, 0, 0];
        pose.RightUpperLeg.rot = [0.22, 0, -0.1];
        pose.RightLowerLeg.rot = [0.42, 0, 0];
        break;
      }

      case 'punch':
      case 'forward_punch': {
        const t = Math.min(1, stateFrame / 15);
        const thrust = Math.sin(t * Math.PI);
        if (characterId === 'action_sultan') {
          // Heavy brawler right straight cross with full shoulder torque
          pose.Spine.rot = [0.12 * thrust, 0.58 * thrust, 0];
          pose.Chest.rot = [0.1 * thrust, 0.48 * thrust, 0];
          pose.RightUpperArm.rot = [-1.55 * thrust - 0.35 * (1 - thrust), -0.18 * thrust, -0.1];
          pose.RightLowerArm.rot = [-0.1 * thrust - 1.45 * (1 - thrust), 0, 0];
          pose.LeftUpperArm.rot = [-0.5, 0.35, 0.42];
          pose.LeftLowerArm.rot = [-1.75, 0, 0];
        } else if (characterId === 'romance_raja') {
          // Velvet backhand-into-palm strike
          pose.Spine.rot = [0.06 * thrust, 0.5 * thrust, -0.08 * thrust];
          pose.Chest.rot = [0, 0.45 * thrust, 0];
          pose.RightUpperArm.rot = [-1.48 * thrust - 0.3, 0.25 * thrust, -0.2];
          pose.RightLowerArm.rot = [-0.15 * thrust - 1.3 * (1 - thrust), 0, 0];
          pose.LeftUpperArm.rot = [-0.4, -0.3 * thrust, 0.65];
        } else if (characterId === 'dance_dynamo') {
          // Corkscrew lightning jab
          pose.Spine.rot = [0.1 * thrust, 0.64 * thrust, 0];
          pose.Chest.rot = [0.08 * thrust, 0.52 * thrust, 0];
          pose.RightUpperArm.rot = [-1.62 * thrust - 0.3, -0.1, -0.05];
          pose.RightLowerArm.rot = [-0.08 * thrust - 1.5 * (1 - thrust), thrust * 0.8, 0];
        } else {
          // Villain Saab: Crushing overhand haymaker
          pose.Spine.rot = [0.24 * thrust, 0.62 * thrust, -0.12 * thrust];
          pose.Chest.rot = [0.2 * thrust, 0.5 * thrust, 0];
          pose.RightUpperArm.rot = [-1.75 * thrust - 0.3, -0.3 * thrust, -0.35];
          pose.RightLowerArm.rot = [-0.2 * thrust - 1.3 * (1 - thrust), 0, 0];
        }
        break;
      }

      case 'kick':
      case 'forward_kick':
      case 'sweep': {
        const t = Math.min(1, stateFrame / 22);
        const kickArc = Math.sin(t * Math.PI);
        if (state === 'sweep') {
          pose.Hips.posOffset = [0, -0.35 * kickArc, 0];
          pose.Spine.rot = [0.28 * kickArc, 0.45 * kickArc, 0];
          pose.RightUpperLeg.rot = [-1.15 * kickArc, 0.35 * kickArc, -0.45 * kickArc];
          pose.RightLowerLeg.rot = [0.1, 0, 0];
          pose.LeftUpperLeg.rot = [-0.95 * kickArc, 0, 0.2];
          pose.LeftLowerLeg.rot = [1.65 * kickArc, 0, 0];
        } else if (characterId === 'action_sultan') {
          // Heavy brawler roundhouse boot kick
          pose.Hips.rot = [-0.22 * kickArc, 0.42 * kickArc, 0];
          pose.Spine.rot = [-0.2 * kickArc, -0.3 * kickArc, -0.15 * kickArc];
          pose.RightUpperLeg.rot = [-1.58 * kickArc, -0.22 * kickArc, -0.3 * kickArc];
          pose.RightLowerLeg.rot = [0.12 * (1 - kickArc), 0, 0];
          pose.LeftUpperLeg.rot = [0.12, 0, 0.08];
          pose.LeftLowerLeg.rot = [0.24, 0, 0];
        } else if (characterId === 'romance_raja') {
          // Agile spinning hook kick
          pose.Hips.rot = [-0.18 * kickArc, 0.65 * kickArc, 0];
          pose.Spine.rot = [-0.24 * kickArc, -0.4 * kickArc, 0];
          pose.RightUpperLeg.rot = [-1.65 * kickArc, 0.15 * kickArc, -0.25 * kickArc];
          pose.RightLowerLeg.rot = [0.1 * (1 - kickArc), 0, 0];
        } else if (characterId === 'dance_dynamo') {
          // High acrobatic 135-degree split whip kick
          pose.Hips.rot = [-0.32 * kickArc, 0.5 * kickArc, 0];
          pose.Spine.rot = [-0.35 * kickArc, -0.35 * kickArc, -0.22 * kickArc];
          pose.RightUpperLeg.rot = [-1.92 * kickArc, -0.15 * kickArc, -0.35 * kickArc];
          pose.RightLowerLeg.rot = [0.05 * (1 - kickArc), 0, 0];
        } else {
          // Villain Saab: Brutal enforcer front stomp kick
          pose.Hips.rot = [-0.15 * kickArc, 0.25 * kickArc, 0];
          pose.Spine.rot = [-0.12 * kickArc, -0.2 * kickArc, 0];
          pose.RightUpperLeg.rot = [-1.45 * kickArc, 0, -0.1];
          pose.RightLowerLeg.rot = [0.2 * (1 - kickArc), 0, 0];
        }
        pose.LeftUpperArm.rot = [-0.9, 0.2, 0.5];
        pose.RightUpperArm.rot = [-0.5, -0.3, -0.5];
        break;
      }

      case 'grab': {
        const t = Math.min(1, stateFrame / 18);
        const reach = Math.sin(t * Math.PI);
        pose.Spine.rot = [0.25 * reach, 0, 0];
        pose.Chest.rot = [0.15 * reach, 0, 0];
        pose.LeftUpperArm.rot = [-1.45 * reach - 0.4, -0.2 * reach, 0.2];
        pose.LeftLowerArm.rot = [-0.35 * reach - 1.1 * (1 - reach), 0, 0];
        pose.RightUpperArm.rot = [-1.45 * reach - 0.4, 0.2 * reach, -0.2];
        pose.RightLowerArm.rot = [-0.35 * reach - 1.1 * (1 - reach), 0, 0];
        break;
      }

      case 'super_shot': {
        const t = Math.min(1, stateFrame / 32);
        if (characterId === 'action_sultan') {
          // ANIM_AS_SUPERSHOT_POWERLINEBLAST:
          // Wide brawler plant + Firoza bracelet charge -> explosive two-handed forward palm thrust
          if (t < 0.34) {
            const p = t / 0.34;
            pose.Hips.posOffset = [0, -0.09 * p, 0];
            pose.Spine.rot = [-0.18 * p, -0.45 * p, 0];
            pose.Chest.rot = [-0.12 * p, -0.35 * p, 0];
            pose.RightUpperArm.rot = [-1.1 * p, 0.65 * p, -0.4];
            pose.RightLowerArm.rot = [-1.85 * p, 0, 0];
            pose.LeftUpperArm.rot = [-0.95 * p, -0.45 * p, 0.35];
            pose.LeftLowerArm.rot = [-1.6 * p, 0, 0];
          } else {
            const p = Math.sin(((t - 0.34) / 0.66) * Math.PI);
            pose.Hips.posOffset = [0, -0.1, 0];
            pose.Spine.rot = [0.26 * p, 0.35 * p, 0];
            pose.Chest.rot = [0.18 * p, 0.28 * p, 0];
            pose.LeftUpperArm.rot = [-1.58 * p - 0.4, -0.22 * p, 0.1];
            pose.LeftLowerArm.rot = [-0.12, 0, 0];
            pose.RightUpperArm.rot = [-1.58 * p - 0.4, 0.22 * p, -0.1];
            pose.RightLowerArm.rot = [-0.12, 0, 0];
          }
        } else if (characterId === 'romance_raja') {
          // ANIM_RR_SUPERSHOT_DILSEPULSE:
          // Sweeping wide open-arms Baadshah pose projecting a heart-shaped kinetic wave
          const open = Math.sin(t * Math.PI);
          pose.Hips.posOffset = [0, 0.03 * open, 0];
          pose.Spine.rot = [-0.22 * open, 0, 0];
          pose.Chest.rot = [-0.25 * open, 0, 0];
          pose.Head.rot = [-0.18 * open, 0.15 * open, -0.08 * open];
          pose.LeftUpperArm.rot = [-0.35 * open, -0.75 * open, 1.38 * open];
          pose.LeftLowerArm.rot = [-0.15, 0, 0];
          pose.RightUpperArm.rot = [-0.35 * open, 0.75 * open, -1.38 * open];
          pose.RightLowerArm.rot = [-0.15, 0, 0];
        } else if (characterId === 'dance_dynamo') {
          // ANIM_DD_SUPERSHOT_BEATDROP:
          // 360-degree tornado spin crescent kick launching a sonic blade
          const spin = t * Math.PI * 2;
          const kickPeak = Math.sin(t * Math.PI);
          pose.Hips.posOffset = [0, 0.18 * kickPeak, 0];
          pose.Hips.rot = [0, spin, 0];
          pose.Spine.rot = [-0.28 * kickPeak, 0, -0.2 * kickPeak];
          pose.RightUpperLeg.rot = [-1.78 * kickPeak, 0, -0.35 * kickPeak];
          pose.RightLowerLeg.rot = [0.08, 0, 0];
          pose.LeftUpperArm.rot = [-1.2 * kickPeak, 0, 0.8 * kickPeak];
          pose.RightUpperArm.rot = [-1.2 * kickPeak, 0, -0.8 * kickPeak];
        } else {
          // ANIM_VS_SUPERSHOT_UNDERWORLDBARRAGE:
          // Overhead two-handed lift into ground-shattering tremor stomp
          if (t < 0.38) {
            const lift = t / 0.38;
            pose.Spine.rot = [-0.25 * lift, 0, 0];
            pose.LeftUpperArm.rot = [-2.5 * lift, 0, 0.3];
            pose.RightUpperArm.rot = [-2.5 * lift, 0, -0.3];
            pose.RightUpperLeg.rot = [-1.1 * lift, 0, 0];
            pose.RightLowerLeg.rot = [1.2 * lift, 0, 0];
          } else {
            const smash = Math.sin(((t - 0.38) / 0.62) * Math.PI);
            pose.Hips.posOffset = [0, -0.22 * smash, 0];
            pose.Spine.rot = [0.42 * smash, 0, 0];
            pose.LeftUpperArm.rot = [-1.35 * smash, 0, 0.25];
            pose.RightUpperArm.rot = [-1.35 * smash, 0, -0.25];
            pose.RightUpperLeg.rot = [-0.3 * smash, 0, -0.15];
          }
        }
        break;
      }

      case 'super_move':
      case 'super':
      case 'special': {
        const t = Math.min(1, stateFrame / 44);
        if (characterId === 'action_sultan') {
          // ANIM_AS_SUPERMOVE_SULTANBREAKER:
          // Collar/bracelet flex taunt -> bull-rush shoulder charge -> seismic two-handed ground slam
          if (t < 0.25) {
            const p = t / 0.25;
            pose.Hips.posOffset = [0, -0.1 * p, 0];
            pose.Spine.rot = [-0.24 * p, 0, 0];
            pose.Chest.rot = [-0.2 * p, 0, 0];
            pose.LeftUpperArm.rot = [-0.9 * p, 0.4 * p, 0.95 * p];
            pose.RightUpperArm.rot = [-1.2 * p, 0.5 * p, -0.5 * p];
            pose.RightLowerArm.rot = [-1.7 * p, 0, 0];
          } else if (t < 0.62) {
            const p = (t - 0.25) / 0.37;
            pose.Hips.posOffset = [0, 0.08 * Math.sin(p * Math.PI), 0];
            pose.Spine.rot = [0.45, 0.55, 0];
            pose.Chest.rot = [0.35, 0.45, 0];
            pose.RightUpperArm.rot = [-0.8, -0.6, -0.5];
            pose.RightLowerArm.rot = [-1.8, 0, 0];
          } else {
            const p = (t - 0.62) / 0.38;
            const slam = Math.sin(p * Math.PI);
            pose.Hips.posOffset = [0, -0.26 * slam, 0];
            pose.Spine.rot = [0.52 * slam, 0, 0];
            pose.Chest.rot = [0.38 * slam, 0, 0];
            pose.LeftUpperArm.rot = [-1.95 * slam, 0, 0.15];
            pose.LeftLowerArm.rot = [-0.2, 0, 0];
            pose.RightUpperArm.rot = [-1.95 * slam, 0, -0.15];
            pose.RightLowerArm.rot = [-0.2, 0, 0];
          }
        } else if (characterId === 'romance_raja') {
          // ANIM_RR_SUPERMOVE_BAADSHAHGRANDGESTURE:
          // Spotlight spin -> rapid 3-palm flurry -> levitating wide-arm finisher burst
          if (t < 0.5) {
            const flurry = Math.sin(t * Math.PI * 6);
            pose.Spine.rot = [0.15, flurry * 0.6, 0];
            pose.RightUpperArm.rot = [-1.5, flurry * 0.4, -0.2];
            pose.LeftUpperArm.rot = [-1.5, -flurry * 0.4, 0.2];
          } else {
            const burst = Math.sin(((t - 0.5) / 0.5) * Math.PI);
            pose.Hips.posOffset = [0, 0.22 * burst, 0];
            pose.Spine.rot = [-0.3 * burst, 0, 0];
            pose.Chest.rot = [-0.28 * burst, 0, 0];
            pose.LeftUpperArm.rot = [-0.2, -0.6 * burst, 1.45 * burst];
            pose.LeftLowerArm.rot = [-0.1, 0, 0];
            pose.RightUpperArm.rot = [-0.2, 0.6 * burst, -1.45 * burst];
            pose.RightLowerArm.rot = [-0.1, 0, 0];
          }
        } else if (characterId === 'dance_dynamo') {
          // ANIM_DD_SUPERMOVE_RHYTHMOVERDRIVE:
          // Multi-spin helicopter cyclone kick into airborne scissor-kick slam
          const cyclone = t * Math.PI * 4;
          const lift = Math.sin(t * Math.PI);
          pose.Hips.posOffset = [0, 0.32 * lift, 0];
          pose.Hips.rot = [-0.25 * lift, cyclone, 0];
          pose.RightUpperLeg.rot = [-1.65 * lift, 0, -0.65 * lift];
          pose.RightLowerLeg.rot = [0.05, 0, 0];
          pose.LeftUpperLeg.rot = [0.9 * lift, 0, 0.55 * lift];
          pose.LeftLowerLeg.rot = [0.2, 0, 0];
          pose.LeftUpperArm.rot = [-1.4 * lift, 0, 0.9 * lift];
          pose.RightUpperArm.rot = [-1.4 * lift, 0, -0.9 * lift];
        } else {
          // ANIM_VS_SUPERMOVE_BLACKOUTVERDICT:
          // Menacing chest roar -> ruthless lariat charge -> overhead double-hammer execution slam
          if (t < 0.3) {
            const roar = t / 0.3;
            pose.Spine.rot = [-0.32 * roar, 0, 0];
            pose.LeftUpperArm.rot = [-0.6, 0, 1.1 * roar];
            pose.RightUpperArm.rot = [-0.6, 0, -1.1 * roar];
          } else {
            const smash = Math.sin(((t - 0.3) / 0.7) * Math.PI);
            pose.Hips.posOffset = [0, -0.28 * smash, 0];
            pose.Spine.rot = [0.58 * smash, 0, 0];
            pose.Chest.rot = [0.42 * smash, 0, 0];
            pose.LeftUpperArm.rot = [-2.1 * smash, -0.2 * smash, 0.1];
            pose.LeftLowerArm.rot = [-0.3, 0, 0];
            pose.RightUpperArm.rot = [-2.1 * smash, 0.2 * smash, -0.1];
            pose.RightLowerArm.rot = [-0.3, 0, 0];
          }
        }
        break;
      }

      case 'hurt': {
        const recoil = Math.sin(Math.min(1, stateFrame / 14) * Math.PI);
        pose.Spine.rot = [-0.35 * recoil, 0.2 * recoil, 0];
        pose.Chest.rot = [-0.25 * recoil, 0, 0];
        pose.Head.rot = [-0.4 * recoil, 0.25 * recoil, 0];
        pose.LeftUpperArm.rot = [-0.3, 0, 0.6 * recoil];
        pose.RightUpperArm.rot = [-0.3, 0, -0.6 * recoil];
        break;
      }

      case 'knockback': {
        pose.Hips.posOffset = [0, 0.1, 0];
        pose.Spine.rot = [-0.55, 0, 0];
        pose.Head.rot = [-0.35, 0, 0];
        pose.LeftUpperArm.rot = [-0.8, 0, 0.7];
        pose.RightUpperArm.rot = [-0.8, 0, -0.7];
        pose.LeftUpperLeg.rot = [-0.5, 0, 0.15];
        pose.RightUpperLeg.rot = [-0.3, 0, -0.15];
        break;
      }

      case 'knockdown':
      case 'defeat': {
        pose.Hips.posOffset = [0, -0.78, 0];
        pose.Hips.rot = [-1.48, 0, 0];
        pose.Spine.rot = [-0.1, 0, 0];
        pose.Head.rot = [0.2, 0.3, 0];
        pose.LeftUpperArm.rot = [-0.2, 0, 0.9];
        pose.LeftLowerArm.rot = [-0.3, 0, 0];
        pose.RightUpperArm.rot = [-0.2, 0, -0.9];
        pose.RightLowerArm.rot = [-0.3, 0, 0];
        pose.LeftUpperLeg.rot = [0.1, 0, 0.2];
        pose.LeftLowerLeg.rot = [0.15, 0, 0];
        pose.RightUpperLeg.rot = [0.1, 0, -0.2];
        pose.RightLowerLeg.rot = [0.15, 0, 0];
        break;
      }

      case 'recovery': {
        const p = Math.min(1, stateFrame / 18);
        pose.Hips.posOffset = [0, -0.45 * (1 - p), 0];
        pose.Hips.rot = [-0.7 * (1 - p), 0, 0];
        pose.Spine.rot = [0.35 * (1 - p), 0, 0];
        pose.LeftUpperLeg.rot = [-0.8 * (1 - p), 0, 0.1];
        pose.LeftLowerLeg.rot = [1.4 * (1 - p), 0, 0];
        break;
      }

      case 'victory': {
        const sway = Math.sin(stateTimeSec * 3.5);
        if (characterId === 'romance_raja') {
          pose.Spine.rot = [-0.18, sway * 0.15, 0];
          pose.Chest.rot = [-0.15, 0, 0];
          pose.LeftUpperArm.rot = [-0.2, -0.4, 1.35];
          pose.LeftLowerArm.rot = [-0.2, 0, 0];
          pose.RightUpperArm.rot = [-0.2, 0.4, -1.35];
          pose.RightLowerArm.rot = [-0.2, 0, 0];
        } else if (characterId === 'action_sultan') {
          pose.Spine.rot = [-0.12, sway * 0.1, 0];
          pose.LeftUpperArm.rot = [-1.4, 0.2, 0.9];
          pose.LeftLowerArm.rot = [-1.7, 0, 0];
          pose.RightUpperArm.rot = [-1.4, -0.2, -0.9];
          pose.RightLowerArm.rot = [-1.7, 0, 0];
        } else {
          pose.Spine.rot = [-0.15, sway * 0.12, 0];
          pose.RightUpperArm.rot = [-2.6, 0, -0.25];
          pose.RightLowerArm.rot = [-0.3, 0, 0];
          pose.LeftUpperArm.rot = [-0.5, 0.2, 0.4];
        }
        break;
      }
    }

    // Apply Facial Expression Rig Pose
    this.applyFacialExpressionToPose(pose, state, stateTimeSec);

    return pose;
  }

  private applyFacialExpressionToPose(
    pose: BonePoseMap,
    state: FighterStateName,
    timeSec: number
  ): void {
    let expr: FacialExpressionState = 'NEUTRAL';
    if (
      state === 'super_move' ||
      state === 'super' ||
      state === 'special' ||
      state === 'super_shot' ||
      state === 'grab'
    ) {
      expr = 'BATTLE_CRY';
    } else if (
      state === 'punch' ||
      state === 'forward_punch' ||
      state === 'kick' ||
      state === 'forward_kick' ||
      state === 'sweep'
    ) {
      expr = 'FIERCE_EFFORT';
    } else if (
      state === 'hurt' ||
      state === 'knockback' ||
      state === 'knockdown'
    ) {
      expr = 'PAIN_GRIMACE';
    } else if (state === 'victory') {
      expr = 'VICTORY_SMIRK';
    } else if (state === 'block' || state === 'crouch_block') {
      expr = 'GUARD_FOCUS';
    }

    switch (expr) {
      case 'BATTLE_CRY':
        pose.Jaw = { rot: [0.28, 0, 0], posOffset: [0, -0.018, 0] };
        pose.LeftBrow = { rot: [0, 0, -0.25], posOffset: [0, -0.008, 0] };
        pose.RightBrow = { rot: [0, 0, 0.25], posOffset: [0, -0.008, 0] };
        break;
      case 'FIERCE_EFFORT':
        pose.Jaw = { rot: [0.12, 0, 0], posOffset: [0, -0.008, 0] };
        pose.LeftBrow = { rot: [0, 0, -0.22], posOffset: [0, -0.006, 0] };
        pose.RightBrow = { rot: [0, 0, 0.22], posOffset: [0, -0.006, 0] };
        break;
      case 'PAIN_GRIMACE':
        pose.Jaw = { rot: [0.22, 0.08, 0], posOffset: [0, -0.012, 0] };
        pose.LeftBrow = { rot: [0, 0, 0.24], posOffset: [0, 0.006, 0] };
        pose.RightBrow = { rot: [0, 0, -0.24], posOffset: [0, 0.006, 0] };
        pose.LeftEyelid = { rot: [0.35, 0, 0], posOffset: [0, -0.005, 0] };
        pose.RightEyelid = { rot: [0.35, 0, 0], posOffset: [0, -0.005, 0] };
        break;
      case 'VICTORY_SMIRK':
        pose.Jaw = { rot: [0.05, 0.06, 0], posOffset: [0, -0.003, 0] };
        pose.LeftBrow = { rot: [0, 0, 0.18], posOffset: [0, 0.01, 0] };
        pose.RightBrow = { rot: [0, 0, -0.08], posOffset: [0, -0.002, 0] };
        break;
      case 'GUARD_FOCUS':
        pose.LeftBrow = { rot: [0, 0, -0.15], posOffset: [0, -0.004, 0] };
        pose.RightBrow = { rot: [0, 0, 0.15], posOffset: [0, -0.004, 0] };
        break;
      default: {
        const blinkPhase = timeSec % 3.8;
        if (blinkPhase > 3.65) {
          pose.LeftEyelid = { rot: [0.4, 0, 0], posOffset: [0, -0.006, 0] };
          pose.RightEyelid = { rot: [0.4, 0, 0], posOffset: [0, -0.006, 0] };
        }
        break;
      }
    }
  }

  /**
   * Smoothly blends the character's 3D bone hierarchy + facial expression rig toward the target pose
   * and evaluates frame animation events.
   */
  public updateRigPose(
    rig: CharacterRig3D,
    characterId: FighterId,
    state: FighterStateName,
    stateTimeSec: number,
    dt: number,
    facing: 1 | -1,
    zVelocity = 0
  ): FighterAnimationEventPayload {
    const stateFrame = Math.max(0, Math.round(stateTimeSec * 60));
    const eventPayload = this.events.evaluateFrame(characterId, state, stateFrame);
    this.lastEventPayload = eventPayload;

    // Face opponent along X axis (+X = +Math.PI/2, -X = -Math.PI/2)
    const targetYaw = facing === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
    rig.facingNode.rotation.y = targetYaw;

    const heightScale = rig.rootNode.metadata?.heightScale || 1.0;
    const targetPose = this.computeTargetPose(
      characterId,
      state,
      stateTimeSec,
      heightScale,
      zVelocity
    );

    const blendFactor = Math.min(1, Math.max(0.22, dt * 16));

    for (const [boneName, transform] of Object.entries(targetPose)) {
      const bone = rig.bones[boneName];
      if (!bone) continue;

      const targetRot = new Vector3(
        transform.rot[0],
        transform.rot[1],
        transform.rot[2]
      );
      bone.rotation = Vector3.Lerp(bone.rotation, targetRot, blendFactor);

      if (boneName === 'Hips' && transform.posOffset) {
        const baseHipsY = 0.95 * heightScale;
        const targetPos = new Vector3(
          transform.posOffset[0],
          baseHipsY + transform.posOffset[1],
          transform.posOffset[2]
        );
        bone.position = Vector3.Lerp(bone.position, targetPos, blendFactor);
      }
    }

    return eventPayload;
  }

  /**
   * Returns the world-space 3D position of a named bone socket for bone-attached hitboxes & VFX.
   */
  public getSocketWorldPosition(
    rig: CharacterRig3D,
    bone: BoneAttachmentName
  ): Vector3 {
    const node =
      rig.bones[bone] ||
      rig.bones.Chest ||
      rig.bones.Hips ||
      rig.rootNode;
    node.computeWorldMatrix(true);
    return node.getAbsolutePosition().clone();
  }
}
