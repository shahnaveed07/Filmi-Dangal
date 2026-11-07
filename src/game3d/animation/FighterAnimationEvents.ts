import {
  BoneAttachmentName,
  CharacterId,
  FighterStateName,
} from '../../types/fighter';

/**
 * FighterAnimationEvents
 *
 * Frame-accurate animation event system for 3D fighters.
 * Dispatches startup, active hitbox windows, projectile spawns, facial expression cues,
 * super-move phase transitions, and recovery events based on character-specific frame data.
 */

export type FacialExpressionState =
  | 'NEUTRAL'
  | 'FIERCE_EFFORT'
  | 'PAIN_GRIMACE'
  | 'BATTLE_CRY'
  | 'VICTORY_SMIRK'
  | 'GUARD_FOCUS';

export type AnimationEventType =
  | 'ON_STARTUP_BEGIN'
  | 'ON_ACTIVE_HITBOX_START'
  | 'ON_ACTIVE_HITBOX_END'
  | 'ON_PROJECTILE_SPAWN'
  | 'ON_SUPERMOVE_PHASE'
  | 'ON_FACIAL_EXPRESSION'
  | 'ON_RECOVERY_BEGIN'
  | 'ON_ANIMATION_COMPLETE';

export interface FighterAnimationEventPayload {
  type: AnimationEventType;
  characterId: CharacterId;
  state: FighterStateName;
  clipName: string;
  frame: number;
  totalFrames: number;
  phase: 'IDLE_LOOP' | 'STARTUP' | 'ACTIVE' | 'RECOVERY';
  activeBone?: BoneAttachmentName;
  hitboxRadius?: number;
  projectileOriginBone?: BoneAttachmentName;
  superMovePhase?: 'TAUNT_CHARGE' | 'BURST_ENGAGE' | 'CLIMAX_IMPACT';
  facialExpression: FacialExpressionState;
}

export interface MoveFrameSpecification {
  clipName: string;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  activeBone: BoneAttachmentName;
  hitboxRadius: number;
  projectileSpawnFrame?: number;
  superMoveClimaxFrame?: number;
  startupExpression: FacialExpressionState;
  activeExpression: FacialExpressionState;
}

export type AnimationEventListener = (event: FighterAnimationEventPayload) => void;

const CHARACTER_MOVE_FRAME_SPECS: Record<
  CharacterId,
  Partial<Record<FighterStateName, MoveFrameSpecification>>
> = {
  action_sultan: {
    punch: {
      clipName: 'Anim_AS_Punch_HeavyCross',
      startupFrames: 5,
      activeFrames: 5,
      recoveryFrames: 8,
      activeBone: 'RightHand',
      hitboxRadius: 0.34,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    forward_punch: {
      clipName: 'Anim_AS_ForwardPunch_StepHook',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 9,
      activeBone: 'RightHand',
      hitboxRadius: 0.36,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    kick: {
      clipName: 'Anim_AS_Kick_BrawlerRoundhouse',
      startupFrames: 8,
      activeFrames: 6,
      recoveryFrames: 11,
      activeBone: 'RightFoot',
      hitboxRadius: 0.4,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    forward_kick: {
      clipName: 'Anim_AS_ForwardKick_BootDriver',
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 12,
      activeBone: 'RightFoot',
      hitboxRadius: 0.42,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    sweep: {
      clipName: 'Anim_AS_Sweep_LowTailorSweep',
      startupFrames: 8,
      activeFrames: 6,
      recoveryFrames: 13,
      activeBone: 'RightFoot',
      hitboxRadius: 0.4,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    grab: {
      clipName: 'Anim_AS_Grab_CollarClinch',
      startupFrames: 5,
      activeFrames: 4,
      recoveryFrames: 12,
      activeBone: 'LeftHand',
      hitboxRadius: 0.42,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    super_shot: {
      clipName: 'Anim_AS_SuperShot_PowerlineBlast',
      startupFrames: 10,
      activeFrames: 6,
      recoveryFrames: 14,
      activeBone: 'RightHand',
      hitboxRadius: 0.38,
      projectileSpawnFrame: 10,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'BATTLE_CRY',
    },
    super_move: {
      clipName: 'Anim_AS_SuperMove_SultanBreaker',
      startupFrames: 11,
      activeFrames: 18,
      recoveryFrames: 16,
      activeBone: 'Chest',
      hitboxRadius: 0.72,
      superMoveClimaxFrame: 20,
      startupExpression: 'BATTLE_CRY',
      activeExpression: 'BATTLE_CRY',
    },
  },
  romance_raja: {
    punch: {
      clipName: 'Anim_RR_Punch_VelvetBackhand',
      startupFrames: 4,
      activeFrames: 4,
      recoveryFrames: 7,
      activeBone: 'RightHand',
      hitboxRadius: 0.32,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    kick: {
      clipName: 'Anim_RR_Kick_SpinningHook',
      startupFrames: 7,
      activeFrames: 6,
      recoveryFrames: 10,
      activeBone: 'RightFoot',
      hitboxRadius: 0.38,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    grab: {
      clipName: 'Anim_RR_Grab_DramaticDipThrow',
      startupFrames: 5,
      activeFrames: 4,
      recoveryFrames: 12,
      activeBone: 'LeftHand',
      hitboxRadius: 0.4,
      startupExpression: 'VICTORY_SMIRK',
      activeExpression: 'FIERCE_EFFORT',
    },
    super_shot: {
      clipName: 'Anim_RR_SuperShot_DilSePulse',
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 13,
      activeBone: 'Chest',
      hitboxRadius: 0.38,
      projectileSpawnFrame: 9,
      startupExpression: 'VICTORY_SMIRK',
      activeExpression: 'BATTLE_CRY',
    },
    super_move: {
      clipName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
      startupFrames: 10,
      activeFrames: 17,
      recoveryFrames: 15,
      activeBone: 'RightHand',
      hitboxRadius: 0.68,
      superMoveClimaxFrame: 18,
      startupExpression: 'VICTORY_SMIRK',
      activeExpression: 'BATTLE_CRY',
    },
  },
  dance_dynamo: {
    punch: {
      clipName: 'Anim_DD_Punch_CorkscrewJab',
      startupFrames: 3,
      activeFrames: 4,
      recoveryFrames: 6,
      activeBone: 'RightHand',
      hitboxRadius: 0.31,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    kick: {
      clipName: 'Anim_DD_Kick_AerialSplitWhip',
      startupFrames: 6,
      activeFrames: 6,
      recoveryFrames: 9,
      activeBone: 'RightFoot',
      hitboxRadius: 0.42,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'FIERCE_EFFORT',
    },
    grab: {
      clipName: 'Anim_DD_Grab_HeadscissorFlip',
      startupFrames: 4,
      activeFrames: 4,
      recoveryFrames: 11,
      activeBone: 'LeftHand',
      hitboxRadius: 0.38,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    super_shot: {
      clipName: 'Anim_DD_SuperShot_BeatDrop',
      startupFrames: 8,
      activeFrames: 6,
      recoveryFrames: 12,
      activeBone: 'RightFoot',
      hitboxRadius: 0.38,
      projectileSpawnFrame: 8,
      startupExpression: 'GUARD_FOCUS',
      activeExpression: 'BATTLE_CRY',
    },
    super_move: {
      clipName: 'Anim_DD_SuperMove_RhythmOverdrive',
      startupFrames: 9,
      activeFrames: 19,
      recoveryFrames: 14,
      activeBone: 'RightFoot',
      hitboxRadius: 0.7,
      superMoveClimaxFrame: 19,
      startupExpression: 'BATTLE_CRY',
      activeExpression: 'BATTLE_CRY',
    },
  },
  villain_saab: {
    punch: {
      clipName: 'Anim_VS_Punch_CrushingHaymaker',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 9,
      activeBone: 'RightHand',
      hitboxRadius: 0.36,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    kick: {
      clipName: 'Anim_VS_Kick_EnforcerStomp',
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 12,
      activeBone: 'RightFoot',
      hitboxRadius: 0.44,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    grab: {
      clipName: 'Anim_VS_Grab_ChokeslamToss',
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 13,
      activeBone: 'LeftHand',
      hitboxRadius: 0.45,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    super_shot: {
      clipName: 'Anim_VS_SuperShot_UnderworldBarrage',
      startupFrames: 12,
      activeFrames: 6,
      recoveryFrames: 15,
      activeBone: 'RightHand',
      hitboxRadius: 0.42,
      projectileSpawnFrame: 12,
      startupExpression: 'FIERCE_EFFORT',
      activeExpression: 'BATTLE_CRY',
    },
    super_move: {
      clipName: 'Anim_VS_SuperMove_BlackoutVerdict',
      startupFrames: 13,
      activeFrames: 18,
      recoveryFrames: 17,
      activeBone: 'Chest',
      hitboxRadius: 0.78,
      superMoveClimaxFrame: 21,
      startupExpression: 'BATTLE_CRY',
      activeExpression: 'BATTLE_CRY',
    },
  },
};

export class FighterAnimationEvents {
  private listeners: AnimationEventListener[] = [];
  private lastEvaluatedState: FighterStateName | null = null;
  private lastEvaluatedFrame = -1;

  public onEvent(listener: AnimationEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static getMoveSpecification(
    characterId: CharacterId,
    state: FighterStateName
  ): MoveFrameSpecification | null {
    const normalized = state === 'super' || state === 'special' ? 'super_move' : state;
    return CHARACTER_MOVE_FRAME_SPECS[characterId]?.[normalized] || null;
  }

  public static getClipNameForState(
    characterId: CharacterId,
    state: FighterStateName
  ): string {
    const moveSpec = FighterAnimationEvents.getMoveSpecification(characterId, state);
    if (moveSpec) return moveSpec.clipName;

    switch (state) {
      case 'idle':
        return 'Idle';
      case 'walk':
      case 'walk_forward':
      case 'walk_backward':
        return 'Walk';
      case 'run':
        return 'Run';
      case 'sidestep':
        return 'Sidestep';
      case 'jump':
        return 'Jump';
      case 'crouch':
        return 'Crouch';
      case 'block':
      case 'crouch_block':
        return 'Block';
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
      default:
        return 'Idle';
    }
  }

  /**
   * Evaluates current state & frame, returning the current phase/hitbox/expression status
   * and firing discrete transition events (`ON_STARTUP_BEGIN`, `ON_ACTIVE_HITBOX_START`,
   * `ON_PROJECTILE_SPAWN`, `ON_RECOVERY_BEGIN`, etc.).
   */
  public evaluateFrame(
    characterId: CharacterId,
    state: FighterStateName,
    frame: number
  ): FighterAnimationEventPayload {
    const spec = FighterAnimationEvents.getMoveSpecification(characterId, state);
    const clipName = FighterAnimationEvents.getClipNameForState(characterId, state);

    if (!spec) {
      let facialExpression: FacialExpressionState = 'NEUTRAL';
      if (state === 'hurt' || state === 'knockback' || state === 'knockdown') {
        facialExpression = 'PAIN_GRIMACE';
      } else if (state === 'victory') {
        facialExpression = 'VICTORY_SMIRK';
      } else if (state === 'block' || state === 'crouch_block') {
        facialExpression = 'GUARD_FOCUS';
      }

      const payload: FighterAnimationEventPayload = {
        type: 'ON_FACIAL_EXPRESSION',
        characterId,
        state,
        clipName,
        frame,
        totalFrames: 60,
        phase: 'IDLE_LOOP',
        facialExpression,
      };
      this.lastEvaluatedState = state;
      this.lastEvaluatedFrame = frame;
      return payload;
    }

    const totalFrames = spec.startupFrames + spec.activeFrames + spec.recoveryFrames;
    const activeStart = spec.startupFrames;
    const activeEnd = spec.startupFrames + spec.activeFrames;

    let phase: 'STARTUP' | 'ACTIVE' | 'RECOVERY' = 'STARTUP';
    let facialExpression: FacialExpressionState = spec.startupExpression;
    if (frame >= activeStart && frame < activeEnd) {
      phase = 'ACTIVE';
      facialExpression = spec.activeExpression;
    } else if (frame >= activeEnd) {
      phase = 'RECOVERY';
      facialExpression = 'GUARD_FOCUS';
    }

    const basePayload: FighterAnimationEventPayload = {
      type: 'ON_FACIAL_EXPRESSION',
      characterId,
      state,
      clipName,
      frame,
      totalFrames,
      phase,
      activeBone: phase === 'ACTIVE' ? spec.activeBone : undefined,
      hitboxRadius: phase === 'ACTIVE' ? spec.hitboxRadius : undefined,
      facialExpression,
    };

    const isNewFrame =
      this.lastEvaluatedState !== state || this.lastEvaluatedFrame !== frame;

    if (isNewFrame) {
      if (frame === 1) {
        this.emit({ ...basePayload, type: 'ON_STARTUP_BEGIN' });
      }
      if (frame === activeStart) {
        this.emit({
          ...basePayload,
          type: 'ON_ACTIVE_HITBOX_START',
          activeBone: spec.activeBone,
          hitboxRadius: spec.hitboxRadius,
        });
      }
      if (spec.projectileSpawnFrame && frame === spec.projectileSpawnFrame) {
        this.emit({
          ...basePayload,
          type: 'ON_PROJECTILE_SPAWN',
          projectileOriginBone: spec.activeBone,
        });
      }
      if (state === 'super_move' || state === 'super') {
        if (frame === 1) {
          this.emit({
            ...basePayload,
            type: 'ON_SUPERMOVE_PHASE',
            superMovePhase: 'TAUNT_CHARGE',
          });
        } else if (frame === activeStart) {
          this.emit({
            ...basePayload,
            type: 'ON_SUPERMOVE_PHASE',
            superMovePhase: 'BURST_ENGAGE',
          });
        } else if (spec.superMoveClimaxFrame && frame === spec.superMoveClimaxFrame) {
          this.emit({
            ...basePayload,
            type: 'ON_SUPERMOVE_PHASE',
            superMovePhase: 'CLIMAX_IMPACT',
          });
        }
      }
      if (frame === activeEnd) {
        this.emit({ ...basePayload, type: 'ON_ACTIVE_HITBOX_END' });
        this.emit({ ...basePayload, type: 'ON_RECOVERY_BEGIN' });
      }
      if (frame >= totalFrames) {
        this.emit({ ...basePayload, type: 'ON_ANIMATION_COMPLETE' });
      }
    }

    this.lastEvaluatedState = state;
    this.lastEvaluatedFrame = frame;
    return basePayload;
  }

  private emit(event: FighterAnimationEventPayload): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
