import { AttackType, BoneAttachmentName, CharacterId, FighterStateName } from '../../types/fighter';

/**
 * FighterAnimationEvents
 *
 * Frame-accurate animation event system for Filmi Dangal 3D characters.
 * Triggers hitbox activation windows, SuperShot projectile spawns, SuperMove
 * multi-stage climax impacts, camera trauma cues, and sound effects at exact
 * keyframe indices during skeletal animations.
 */

export type AnimationEventType =
  | 'ON_STARTUP_BEGIN'
  | 'ON_ACTIVE_HITBOX_START'
  | 'ON_ACTIVE_HITBOX_END'
  | 'ON_PROJECTILE_SPAWN'
  | 'ON_SUPERMOVE_PHASE'
  | 'ON_CAMERA_CUT'
  | 'ON_VFX_BURST'
  | 'ON_RECOVERY_BEGIN';

export type FacialExpressionState =
  | 'NEUTRAL'
  | 'BATTLE_CRY'
  | 'FIERCE_EFFORT'
  | 'PAIN_GRIMACE'
  | 'VICTORY_SMIRK'
  | 'GUARD_FOCUS';

export interface AnimationFrameEvent {
  type: AnimationEventType;
  characterId: CharacterId;
  moveType: AttackType;
  frame: number;
  attachedBone: BoneAttachmentName;
  hitRadius3D: number;
  superMovePhase?: 'CHARGE' | 'BURST_ENGAGE' | 'RUSH_IMPACT' | 'CLIMAX_IMPACT';
  cameraTrauma?: number;
  calloutText?: string;
}

export interface FighterAnimationEventMetadata {
  clipName: string;
  phase: 'IDLE_LOOP' | 'STARTUP' | 'ACTIVE' | 'RECOVERY';
  frame: number;
  totalFrames: number;
  activeBone: BoneAttachmentName | undefined;
  hitboxRadius: number;
  facialExpression: FacialExpressionState;
}

export type FighterAnimationEventPayload = AnimationFrameEvent[] & FighterAnimationEventMetadata;

export interface MoveAnimationEventSpec {
  clipName: string;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  attachedBone: BoneAttachmentName;
  hitRadius3D: number;
  projectileSpawnFrame?: number;
  superMoveClimaxFrame?: number;
}

const CHARACTER_MOVE_EVENT_SPECS: Record<
  CharacterId,
  Record<AttackType, MoveAnimationEventSpec>
> = {
  action_sultan: {
    punch: {
      clipName: 'Punch',
      startupFrames: 5,
      activeFrames: 4,
      recoveryFrames: 9,
      attachedBone: 'RightHand',
      hitRadius3D: 0.42,
    },
    kick: {
      clipName: 'Kick',
      startupFrames: 8,
      activeFrames: 5,
      recoveryFrames: 13,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.48,
    },
    sweep: {
      clipName: 'Kick',
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 16,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.5,
    },
    forward_punch: {
      clipName: 'Punch',
      startupFrames: 9,
      activeFrames: 5,
      recoveryFrames: 13,
      attachedBone: 'RightHand',
      hitRadius3D: 0.48,
    },
    forward_kick: {
      clipName: 'Kick',
      startupFrames: 11,
      activeFrames: 6,
      recoveryFrames: 15,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.54,
    },
    grab: {
      clipName: 'Grab',
      startupFrames: 6,
      activeFrames: 4,
      recoveryFrames: 16,
      attachedBone: 'RightHand',
      hitRadius3D: 0.52,
    },
    super_shot: {
      clipName: 'Anim_AS_SuperShot_PowerlineBlast',
      startupFrames: 10,
      activeFrames: 12,
      recoveryFrames: 14,
      attachedBone: 'RightHand',
      hitRadius3D: 0.56,
      projectileSpawnFrame: 10,
    },
    super_move: {
      clipName: 'Anim_AS_SuperMove_SultanBreaker',
      startupFrames: 12,
      activeFrames: 16,
      recoveryFrames: 20,
      attachedBone: 'Chest',
      hitRadius3D: 1.45,
      superMoveClimaxFrame: 20,
    },
    super: {
      clipName: 'Anim_AS_SuperMove_SultanBreaker',
      startupFrames: 12,
      activeFrames: 16,
      recoveryFrames: 20,
      attachedBone: 'Chest',
      hitRadius3D: 1.45,
      superMoveClimaxFrame: 20,
    },
  },
  romance_raja: {
    punch: {
      clipName: 'Punch',
      startupFrames: 4,
      activeFrames: 4,
      recoveryFrames: 8,
      attachedBone: 'RightHand',
      hitRadius3D: 0.38,
    },
    kick: {
      clipName: 'Kick',
      startupFrames: 7,
      activeFrames: 5,
      recoveryFrames: 11,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.45,
    },
    sweep: {
      clipName: 'Kick',
      startupFrames: 8,
      activeFrames: 5,
      recoveryFrames: 14,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.46,
    },
    forward_punch: {
      clipName: 'Punch',
      startupFrames: 7,
      activeFrames: 5,
      recoveryFrames: 11,
      attachedBone: 'RightHand',
      hitRadius3D: 0.44,
    },
    forward_kick: {
      clipName: 'Kick',
      startupFrames: 9,
      activeFrames: 5,
      recoveryFrames: 13,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.5,
    },
    grab: {
      clipName: 'Grab',
      startupFrames: 5,
      activeFrames: 4,
      recoveryFrames: 15,
      attachedBone: 'RightHand',
      hitRadius3D: 0.48,
    },
    super_shot: {
      clipName: 'Anim_RR_SuperShot_DilSePulse',
      startupFrames: 9,
      activeFrames: 11,
      recoveryFrames: 13,
      attachedBone: 'Chest',
      hitRadius3D: 0.54,
      projectileSpawnFrame: 9,
    },
    super_move: {
      clipName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
      startupFrames: 11,
      activeFrames: 15,
      recoveryFrames: 18,
      attachedBone: 'Chest',
      hitRadius3D: 1.5,
      superMoveClimaxFrame: 18,
    },
    super: {
      clipName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
      startupFrames: 11,
      activeFrames: 15,
      recoveryFrames: 18,
      attachedBone: 'Chest',
      hitRadius3D: 1.5,
      superMoveClimaxFrame: 18,
    },
  },
  dance_dynamo: {
    punch: {
      clipName: 'Punch',
      startupFrames: 4,
      activeFrames: 3,
      recoveryFrames: 7,
      attachedBone: 'LeftHand',
      hitRadius3D: 0.37,
    },
    kick: {
      clipName: 'Kick',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 10,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.5,
    },
    sweep: {
      clipName: 'Kick',
      startupFrames: 7,
      activeFrames: 5,
      recoveryFrames: 12,
      attachedBone: 'LeftFoot',
      hitRadius3D: 0.48,
    },
    forward_punch: {
      clipName: 'Punch',
      startupFrames: 6,
      activeFrames: 4,
      recoveryFrames: 10,
      attachedBone: 'RightHand',
      hitRadius3D: 0.42,
    },
    forward_kick: {
      clipName: 'Kick',
      startupFrames: 8,
      activeFrames: 5,
      recoveryFrames: 11,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.52,
    },
    grab: {
      clipName: 'Grab',
      startupFrames: 5,
      activeFrames: 4,
      recoveryFrames: 14,
      attachedBone: 'RightHand',
      hitRadius3D: 0.46,
    },
    super_shot: {
      clipName: 'Anim_DD_SuperShot_BeatDrop',
      startupFrames: 8,
      activeFrames: 10,
      recoveryFrames: 12,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.54,
      projectileSpawnFrame: 8,
    },
    super_move: {
      clipName: 'Anim_DD_SuperMove_RhythmOverdrive',
      startupFrames: 10,
      activeFrames: 16,
      recoveryFrames: 16,
      attachedBone: 'RightFoot',
      hitRadius3D: 1.4,
      superMoveClimaxFrame: 19,
    },
    super: {
      clipName: 'Anim_DD_SuperMove_RhythmOverdrive',
      startupFrames: 10,
      activeFrames: 16,
      recoveryFrames: 16,
      attachedBone: 'RightFoot',
      hitRadius3D: 1.4,
      superMoveClimaxFrame: 19,
    },
  },
  villain_saab: {
    punch: {
      clipName: 'Punch',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 10,
      attachedBone: 'RightHand',
      hitRadius3D: 0.45,
    },
    kick: {
      clipName: 'Kick',
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 14,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.5,
    },
    sweep: {
      clipName: 'Kick',
      startupFrames: 10,
      activeFrames: 6,
      recoveryFrames: 17,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.52,
    },
    forward_punch: {
      clipName: 'Punch',
      startupFrames: 10,
      activeFrames: 6,
      recoveryFrames: 14,
      attachedBone: 'RightHand',
      hitRadius3D: 0.5,
    },
    forward_kick: {
      clipName: 'Kick',
      startupFrames: 12,
      activeFrames: 6,
      recoveryFrames: 16,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.56,
    },
    grab: {
      clipName: 'Grab',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 16,
      attachedBone: 'RightHand',
      hitRadius3D: 0.55,
    },
    super_shot: {
      clipName: 'Anim_VS_SuperShot_UnderworldBarrage',
      startupFrames: 12,
      activeFrames: 12,
      recoveryFrames: 15,
      attachedBone: 'RightFoot',
      hitRadius3D: 0.58,
      projectileSpawnFrame: 12,
    },
    super_move: {
      clipName: 'Anim_VS_SuperMove_BlackoutVerdict',
      startupFrames: 14,
      activeFrames: 16,
      recoveryFrames: 22,
      attachedBone: 'Chest',
      hitRadius3D: 1.55,
      superMoveClimaxFrame: 21,
    },
    super: {
      clipName: 'Anim_VS_SuperMove_BlackoutVerdict',
      startupFrames: 14,
      activeFrames: 16,
      recoveryFrames: 22,
      attachedBone: 'Chest',
      hitRadius3D: 1.55,
      superMoveClimaxFrame: 21,
    },
  },
};

export type AnimationEventListener = (event: AnimationFrameEvent) => void;

export class FighterAnimationEvents {
  private listeners: AnimationEventListener[] = [];

  public onEvent(listener: AnimationEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static getMoveSpec(
    characterId: CharacterId,
    moveType: AttackType
  ): MoveAnimationEventSpec {
    return CHARACTER_MOVE_EVENT_SPECS[characterId][moveType];
  }

  public static resolveCanonicalClipName(
    characterId: CharacterId,
    state: FighterStateName
  ): string {
    switch (state) {
      case 'idle':
        return 'Idle';
      case 'walk':
      case 'walk_forward':
      case 'walk_backward':
        return 'Walk';
      case 'run':
        return 'Run';
      case 'jump':
        return 'Jump';
      case 'crouch':
        return 'Crouch';
      case 'block':
      case 'crouch_block':
        return 'Block';
      case 'punch':
      case 'forward_punch':
        return 'Punch';
      case 'kick':
      case 'sweep':
      case 'forward_kick':
        return 'Kick';
      case 'grab':
        return 'Grab';
      case 'hurt':
        return 'HitReaction';
      case 'knockback':
        return 'Knockback';
      case 'knockdown':
        return 'Knockdown';
      case 'recovery':
        return 'Recovery';
      case 'victory':
        return 'Victory';
      case 'defeat':
        return 'Defeat';
      case 'super_shot':
        return CHARACTER_MOVE_EVENT_SPECS[characterId].super_shot.clipName;
      case 'super_move':
      case 'super':
      case 'special':
        return CHARACTER_MOVE_EVENT_SPECS[characterId].super_move.clipName;
    }
  }

  public evaluateFrame(
    characterId: CharacterId,
    state: FighterStateName,
    stateFrame: number
  ): FighterAnimationEventPayload {
    const clipName = FighterAnimationEvents.resolveCanonicalClipName(characterId, state);
    const moveType = this.stateToMoveType(state);
    const emitted: AnimationFrameEvent[] = [];

    let facialExpression: FacialExpressionState = 'NEUTRAL';
    if (
      state === 'super_move' ||
      state === 'super' ||
      state === 'special' ||
      state === 'super_shot' ||
      state === 'grab'
    ) {
      facialExpression = 'BATTLE_CRY';
    } else if (moveType) {
      facialExpression = 'FIERCE_EFFORT';
    } else if (state === 'hurt' || state === 'knockback' || state === 'knockdown') {
      facialExpression = 'PAIN_GRIMACE';
    } else if (state === 'victory') {
      facialExpression = 'VICTORY_SMIRK';
    } else if (state === 'block' || state === 'crouch_block') {
      facialExpression = 'GUARD_FOCUS';
    }

    if (!moveType) {
      return Object.assign(emitted, {
        clipName,
        phase: 'IDLE_LOOP' as const,
        frame: stateFrame,
        totalFrames: 60,
        activeBone: undefined,
        hitboxRadius: 0,
        facialExpression,
      });
    }

    const spec = CHARACTER_MOVE_EVENT_SPECS[characterId][moveType];
    const totalFrames = spec.startupFrames + spec.activeFrames + spec.recoveryFrames;
    const isActiveWindow =
      stateFrame >= spec.startupFrames &&
      stateFrame < spec.startupFrames + spec.activeFrames;
    const phase: 'IDLE_LOOP' | 'STARTUP' | 'ACTIVE' | 'RECOVERY' =
      stateFrame < spec.startupFrames
        ? 'STARTUP'
        : isActiveWindow
        ? 'ACTIVE'
        : 'RECOVERY';

    if (stateFrame === 1) {
      emitted.push({
        type: 'ON_STARTUP_BEGIN',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
      });

      if (moveType === 'super_move' || moveType === 'super') {
        emitted.push({
          type: 'ON_SUPERMOVE_PHASE',
          characterId,
          moveType,
          frame: stateFrame,
          attachedBone: spec.attachedBone,
          hitRadius3D: spec.hitRadius3D,
          superMovePhase: 'CHARGE',
          cameraTrauma: 0.25,
        });
      }
    }

    if (stateFrame === spec.startupFrames) {
      emitted.push({
        type: 'ON_ACTIVE_HITBOX_START',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
      });

      if (moveType === 'super_move' || moveType === 'super') {
        emitted.push({
          type: 'ON_SUPERMOVE_PHASE',
          characterId,
          moveType,
          frame: stateFrame,
          attachedBone: spec.attachedBone,
          hitRadius3D: spec.hitRadius3D,
          superMovePhase: 'RUSH_IMPACT',
          cameraTrauma: 0.48,
        });
      }
    }

    if (spec.projectileSpawnFrame !== undefined && stateFrame === spec.projectileSpawnFrame) {
      emitted.push({
        type: 'ON_PROJECTILE_SPAWN',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
      });
    }

    if (spec.superMoveClimaxFrame !== undefined && stateFrame === spec.superMoveClimaxFrame) {
      emitted.push({
        type: 'ON_SUPERMOVE_PHASE',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
        superMovePhase: 'CLIMAX_IMPACT',
        cameraTrauma: 0.72,
      });
    }

    if (stateFrame === spec.startupFrames + spec.activeFrames) {
      emitted.push({
        type: 'ON_ACTIVE_HITBOX_END',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
      });
      emitted.push({
        type: 'ON_RECOVERY_BEGIN',
        characterId,
        moveType,
        frame: stateFrame,
        attachedBone: spec.attachedBone,
        hitRadius3D: spec.hitRadius3D,
      });
    }

    for (const evt of emitted) {
      for (const listener of this.listeners) {
        listener(evt);
      }
    }

    return Object.assign(emitted, {
      clipName,
      phase,
      frame: stateFrame,
      totalFrames,
      activeBone: isActiveWindow ? spec.attachedBone : undefined,
      hitboxRadius: spec.hitRadius3D,
      facialExpression,
    });
  }

  private stateToMoveType(state: FighterStateName): AttackType | null {
    switch (state) {
      case 'punch':
      case 'kick':
      case 'sweep':
      case 'forward_punch':
      case 'forward_kick':
      case 'grab':
      case 'super_shot':
      case 'super_move':
      case 'super':
        return state;
      case 'special':
        return 'super_move';
      default:
        return null;
    }
  }
}
