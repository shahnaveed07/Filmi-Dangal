import { BoneAttachmentName, FighterId, FighterStateName } from '../../types/fighter';
import { getCharacterAssetConfig } from '../../config/characterAssets';

/**
 * FighterAnimationEvents
 *
 * Frame-accurate animation event system for all 4 Fight Fun fighters:
 * - action_sultan (Action Sultan — Salman Khan)
 * - romance_raja  (Romance Raja — Shah Rukh Khan)
 * - duggu         (Duggu — Hrithik Roshan)
 * - bhidu         (Bhidu — Jackie Shroff)
 *
 * Emits:
 * - ON_STARTUP_BEGIN
 * - ON_CHARGE_START          (triggers character-specific supershot-charge / supermove-charge SFX & charge VFX)
 * - ON_ACTIVE_HITBOX_START
 * - ON_ACTIVE_HITBOX_END
 * - ON_PROJECTILE_SPAWN      (spawns visual SuperShot projectile/wave at release frame)
 * - ON_PROJECTILE_RELEASE    (triggers character-specific supershot-release SFX & release VFX)
 * - ON_SPECIAL_IMPACT        (triggers authoritative guaranteed damage resolution & supershot-impact SFX/VFX)
 * - ON_SUPERMOVE_PHASE
 * - ON_SUPERMOVE_CLIMAX
 * - ON_RECOVERY_BEGIN
 * - ON_ANIMATION_COMPLETE
 */

export type AnimationPhase = 'IDLE_LOOP' | 'STARTUP' | 'ACTIVE' | 'RECOVERY';

export type SuperMoveSequencePhase =
  | 'NONE'
  | 'CHARGE_POSE'
  | 'BURST_ENGAGE'
  | 'CLIMAX_IMPACT'
  | 'RECOVERY_POSE';

export type AnimationEventType =
  | 'ON_STARTUP_BEGIN'
  | 'ON_CHARGE_START'
  | 'ON_ACTIVE_HITBOX_START'
  | 'ON_ACTIVE_HITBOX_END'
  | 'ON_PROJECTILE_SPAWN'
  | 'ON_PROJECTILE_RELEASE'
  | 'ON_SPECIAL_IMPACT'
  | 'ON_SUPERMOVE_PHASE'
  | 'ON_SUPERMOVE_CLIMAX'
  | 'ON_RECOVERY_BEGIN'
  | 'ON_ANIMATION_COMPLETE';

export interface MoveFrameTimingSpec {
  clipName: string;
  totalFrames: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  activeBone?: BoneAttachmentName;
  hitboxRadius?: number;
  chargeStartFrame?: number;
  projectileSpawnFrame?: number;
  specialImpactFrame?: number;
  superMoveClimaxFrame?: number;
  isLooping: boolean;
}

export interface FighterAnimationEventPayload {
  characterId: FighterId;
  state: FighterStateName;
  clipName: string;
  type: AnimationEventType;
  phase: AnimationPhase;
  superMovePhase: SuperMoveSequencePhase;
  frame: number;
  totalFrames: number;
  normalizedTime: number;
  activeBone?: BoneAttachmentName;
  hitboxRadius?: number;
  facialExpression: 'NEUTRAL' | 'EFFORT' | 'PAIN' | 'VICTORY_SMILE' | 'SUPER_ROAR';
}

const CHARACTER_MOVE_SPECS: Record<FighterId, Record<string, MoveFrameTimingSpec>> = {
  action_sultan: {
    idle: {
      clipName: 'Idle',
      totalFrames: 60,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    walk: {
      clipName: 'Walk',
      totalFrames: 40,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    run: {
      clipName: 'Run',
      totalFrames: 30,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    punch: {
      clipName: 'Punch',
      totalFrames: 22,
      startupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 11,
      activeBone: 'RightHand',
      hitboxRadius: 0.34,
      isLooping: false,
    },
    kick: {
      clipName: 'Kick',
      totalFrames: 30,
      startupFrames: 9,
      activeFrames: 6,
      recoveryFrames: 15,
      activeBone: 'RightFoot',
      hitboxRadius: 0.38,
      isLooping: false,
    },
    block: {
      clipName: 'Block',
      totalFrames: 30,
      startupFrames: 2,
      activeFrames: 24,
      recoveryFrames: 4,
      isLooping: true,
    },
    jump: {
      clipName: 'Jump',
      totalFrames: 38,
      startupFrames: 4,
      activeFrames: 26,
      recoveryFrames: 8,
      isLooping: false,
    },
    super_shot: {
      clipName: 'Anim_AS_SuperShot_BlackbuckGunshot',
      totalFrames: 36,
      startupFrames: 14,
      activeFrames: 14,
      recoveryFrames: 8,
      activeBone: 'RightHand',
      hitboxRadius: 0.45,
      chargeStartFrame: 1,
      projectileSpawnFrame: 10,
      specialImpactFrame: 14,
      isLooping: false,
    },
    super_move: {
      clipName: 'Anim_AS_SuperMove_SultanBreaker',
      totalFrames: 42,
      startupFrames: 8,
      activeFrames: 16,
      recoveryFrames: 18,
      activeBone: 'Chest',
      hitboxRadius: 1.05,
      chargeStartFrame: 1,
      superMoveClimaxFrame: 20,
      isLooping: false,
    },
  },
  romance_raja: {
    idle: {
      clipName: 'Idle',
      totalFrames: 60,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    walk: {
      clipName: 'Walk',
      totalFrames: 38,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    run: {
      clipName: 'Run',
      totalFrames: 28,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    punch: {
      clipName: 'Punch',
      totalFrames: 19,
      startupFrames: 5,
      activeFrames: 5,
      recoveryFrames: 9,
      activeBone: 'RightHand',
      hitboxRadius: 0.32,
      isLooping: false,
    },
    kick: {
      clipName: 'Kick',
      totalFrames: 26,
      startupFrames: 7,
      activeFrames: 6,
      recoveryFrames: 13,
      activeBone: 'RightFoot',
      hitboxRadius: 0.36,
      isLooping: false,
    },
    block: {
      clipName: 'Block',
      totalFrames: 30,
      startupFrames: 2,
      activeFrames: 24,
      recoveryFrames: 4,
      isLooping: true,
    },
    jump: {
      clipName: 'Jump',
      totalFrames: 36,
      startupFrames: 4,
      activeFrames: 24,
      recoveryFrames: 8,
      isLooping: false,
    },
    super_shot: {
      clipName: 'Anim_RR_SuperShot_OpenArmsPose',
      totalFrames: 36,
      startupFrames: 16,
      activeFrames: 12,
      recoveryFrames: 8,
      activeBone: 'Chest',
      hitboxRadius: 0.44,
      chargeStartFrame: 1,
      projectileSpawnFrame: 11,
      specialImpactFrame: 16,
      isLooping: false,
    },
    super_move: {
      clipName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
      totalFrames: 39,
      startupFrames: 7,
      activeFrames: 16,
      recoveryFrames: 16,
      activeBone: 'Chest',
      hitboxRadius: 1.0,
      chargeStartFrame: 1,
      superMoveClimaxFrame: 18,
      isLooping: false,
    },
  },
  duggu: {
    idle: {
      clipName: 'Idle',
      totalFrames: 54,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    walk: {
      clipName: 'Walk',
      totalFrames: 34,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    run: {
      clipName: 'Run',
      totalFrames: 24,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    punch: {
      clipName: 'Punch',
      totalFrames: 16,
      startupFrames: 4,
      activeFrames: 4,
      recoveryFrames: 8,
      activeBone: 'RightHand',
      hitboxRadius: 0.31,
      isLooping: false,
    },
    kick: {
      clipName: 'Kick',
      totalFrames: 23,
      startupFrames: 6,
      activeFrames: 6,
      recoveryFrames: 11,
      activeBone: 'RightFoot',
      hitboxRadius: 0.37,
      isLooping: false,
    },
    block: {
      clipName: 'Block',
      totalFrames: 28,
      startupFrames: 2,
      activeFrames: 22,
      recoveryFrames: 4,
      isLooping: true,
    },
    jump: {
      clipName: 'Jump',
      totalFrames: 34,
      startupFrames: 3,
      activeFrames: 24,
      recoveryFrames: 7,
      isLooping: false,
    },
    super_shot: {
      clipName: 'Anim_DG_SuperShot_KahoNaaDanceWave',
      totalFrames: 38,
      startupFrames: 17,
      activeFrames: 13,
      recoveryFrames: 8,
      activeBone: 'RightFoot',
      hitboxRadius: 0.44,
      chargeStartFrame: 1,
      projectileSpawnFrame: 12,
      specialImpactFrame: 17,
      isLooping: false,
    },
    super_move: {
      clipName: 'Anim_DG_SuperMove_RhythmOverdrive',
      totalFrames: 39,
      startupFrames: 6,
      activeFrames: 18,
      recoveryFrames: 15,
      activeBone: 'RightFoot',
      hitboxRadius: 1.02,
      chargeStartFrame: 1,
      superMoveClimaxFrame: 19,
      isLooping: false,
    },
  },
  bhidu: {
    idle: {
      clipName: 'Idle',
      totalFrames: 64,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    walk: {
      clipName: 'Walk',
      totalFrames: 44,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    run: {
      clipName: 'Run',
      totalFrames: 32,
      startupFrames: 0,
      activeFrames: 0,
      recoveryFrames: 0,
      isLooping: true,
    },
    punch: {
      clipName: 'Punch',
      totalFrames: 24,
      startupFrames: 7,
      activeFrames: 5,
      recoveryFrames: 12,
      activeBone: 'RightHand',
      hitboxRadius: 0.36,
      isLooping: false,
    },
    kick: {
      clipName: 'Kick',
      totalFrames: 32,
      startupFrames: 10,
      activeFrames: 6,
      recoveryFrames: 16,
      activeBone: 'RightFoot',
      hitboxRadius: 0.4,
      isLooping: false,
    },
    block: {
      clipName: 'Block',
      totalFrames: 32,
      startupFrames: 2,
      activeFrames: 26,
      recoveryFrames: 4,
      isLooping: true,
    },
    jump: {
      clipName: 'Jump',
      totalFrames: 40,
      startupFrames: 5,
      activeFrames: 26,
      recoveryFrames: 9,
      isLooping: false,
    },
    super_shot: {
      clipName: 'Anim_BH_SuperShot_BhiduSwaggerWalk',
      totalFrames: 40,
      startupFrames: 18,
      activeFrames: 14,
      recoveryFrames: 8,
      activeBone: 'RightFoot',
      hitboxRadius: 0.48,
      chargeStartFrame: 1,
      projectileSpawnFrame: 13,
      specialImpactFrame: 18,
      isLooping: false,
    },
    super_move: {
      clipName: 'Anim_BH_SuperMove_BlackoutVerdict',
      totalFrames: 45,
      startupFrames: 9,
      activeFrames: 16,
      recoveryFrames: 20,
      activeBone: 'Chest',
      hitboxRadius: 1.1,
      chargeStartFrame: 1,
      superMoveClimaxFrame: 21,
      isLooping: false,
    },
  },
};

export class FighterAnimationEvents {
  private lastDispatchedState: FighterStateName | null = null;
  private lastDispatchedFrame = -1;
  private listeners: Array<(payload: FighterAnimationEventPayload) => void> = [];

  public onEvent(listener: (payload: FighterAnimationEventPayload) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static getMoveSpec(characterId: FighterId, state: FighterStateName): MoveFrameTimingSpec {
    const charSpecs = CHARACTER_MOVE_SPECS[characterId] || CHARACTER_MOVE_SPECS.action_sultan;
    const manifestEvents = getCharacterAssetConfig(characterId)?.specialAttackEvents;

    if (state === 'super_shot') {
      const base = charSpecs.super_shot;
      if (manifestEvents?.superShot) {
        return {
          ...base,
          chargeStartFrame: manifestEvents.superShot.chargeStartFrame,
          projectileSpawnFrame: manifestEvents.superShot.projectileReleaseFrame,
          specialImpactFrame: manifestEvents.superShot.specialImpactFrame,
          totalFrames: manifestEvents.superShot.animationCompleteFrame,
          activeBone: manifestEvents.superShot.projectileSpawnBone,
        };
      }
      return base;
    }

    if (state === 'super_move' || state === 'super' || state === 'special') {
      const base = charSpecs.super_move;
      if (manifestEvents?.superMove) {
        return {
          ...base,
          chargeStartFrame: manifestEvents.superMove.chargeStartFrame,
          superMoveClimaxFrame: manifestEvents.superMove.climaxImpactFrame,
          impactBone: manifestEvents.superMove.impactBone,
        } as MoveFrameTimingSpec;
      }
      return base;
    }

    const mappedKey =
      state === 'walk_forward' || state === 'walk_backward'
        ? 'walk'
        : state === 'crouch_block'
        ? 'block'
        : state === 'forward_punch'
        ? 'punch'
        : state === 'forward_kick' || state === 'sweep'
        ? 'kick'
        : state;

    return (
      charSpecs[mappedKey] || {
        clipName: state.toUpperCase(),
        totalFrames: 30,
        startupFrames: 5,
        activeFrames: 10,
        recoveryFrames: 15,
        isLooping: false,
      }
    );
  }

  /**
   * Pure stateless snapshot calculation of animation phase, superMovePhase, and facial expression
   * for a given character, state, and frame. Safe to call from both preview and gameplay pose
   * evaluators without mutating event dispatcher state or firing duplicate combat events.
   */
  public static computeFrameSnapshot(
    characterId: FighterId,
    state: FighterStateName,
    stateFrame: number
  ): FighterAnimationEventPayload {
    const spec = FighterAnimationEvents.getMoveSpec(characterId, state);
    const frame = spec.isLooping
      ? stateFrame % Math.max(1, spec.totalFrames)
      : Math.min(stateFrame, spec.totalFrames);

    const normalizedTime = Math.min(1, Math.max(0, frame / Math.max(1, spec.totalFrames)));

    let phase: AnimationPhase = 'IDLE_LOOP';
    if (!spec.isLooping) {
      if (frame < spec.startupFrames) {
        phase = 'STARTUP';
      } else if (frame < spec.startupFrames + spec.activeFrames) {
        phase = 'ACTIVE';
      } else {
        phase = 'RECOVERY';
      }
    }

    let superMovePhase: SuperMoveSequencePhase = 'NONE';
    if (state === 'super_move' || state === 'super' || state === 'special') {
      if (normalizedTime < 0.28) {
        superMovePhase = 'CHARGE_POSE';
      } else if (normalizedTime < 0.62) {
        superMovePhase = 'BURST_ENGAGE';
      } else if (normalizedTime < 0.84) {
        superMovePhase = 'CLIMAX_IMPACT';
      } else {
        superMovePhase = 'RECOVERY_POSE';
      }
    }

    let facialExpression: FighterAnimationEventPayload['facialExpression'] = 'NEUTRAL';
    if (state === 'hurt' || state === 'knockback' || state === 'knockdown' || state === 'defeat') {
      facialExpression = 'PAIN';
    } else if (state === 'victory') {
      facialExpression = 'VICTORY_SMILE';
    } else if (
      state === 'super_move' ||
      state === 'super' ||
      state === 'super_shot'
    ) {
      facialExpression = 'SUPER_ROAR';
    } else if (phase === 'ACTIVE') {
      facialExpression = 'EFFORT';
    }

    return {
      characterId,
      state,
      clipName: spec.clipName,
      type: 'ON_STARTUP_BEGIN',
      phase,
      superMovePhase,
      frame,
      totalFrames: spec.totalFrames,
      normalizedTime,
      activeBone: spec.activeBone,
      hitboxRadius: spec.hitboxRadius,
      facialExpression,
    };
  }

  /**
   * Evaluates current state and frame, returning the current phase, superMovePhase,
   * and facial expression, while firing discrete edge-triggered events to listeners.
   */
  public evaluateFrame(
    characterId: FighterId,
    state: FighterStateName,
    stateFrame: number
  ): FighterAnimationEventPayload {
    const spec = FighterAnimationEvents.getMoveSpec(characterId, state);
    const basePayload = FighterAnimationEvents.computeFrameSnapshot(
      characterId,
      state,
      stateFrame
    );
    const frame = basePayload.frame;

    const isNewFrame =
      this.lastDispatchedState !== state || this.lastDispatchedFrame !== frame;

    if (isNewFrame) {
      if (this.lastDispatchedState !== state || frame === 0) {
        this.emit({ ...basePayload, type: 'ON_STARTUP_BEGIN' });
      }
      if (
        spec.chargeStartFrame !== undefined &&
        frame === spec.chargeStartFrame
      ) {
        this.emit({ ...basePayload, type: 'ON_CHARGE_START' });
      }
      if (!spec.isLooping && frame === spec.startupFrames) {
        this.emit({ ...basePayload, type: 'ON_ACTIVE_HITBOX_START' });
      }
      if (spec.projectileSpawnFrame !== undefined && frame === spec.projectileSpawnFrame) {
        this.emit({ ...basePayload, type: 'ON_PROJECTILE_SPAWN' });
        this.emit({ ...basePayload, type: 'ON_PROJECTILE_RELEASE' });
      }
      if (
        (state === 'super_shot' &&
          (spec.specialImpactFrame ?? spec.projectileSpawnFrame) !== undefined &&
          frame === (spec.specialImpactFrame ?? spec.projectileSpawnFrame)) ||
        ((state === 'super_move' || state === 'super' || state === 'special') &&
          spec.superMoveClimaxFrame !== undefined &&
          frame === spec.superMoveClimaxFrame)
      ) {
        if (state === 'super_move' || state === 'super' || state === 'special') {
          this.emit({ ...basePayload, type: 'ON_SUPERMOVE_CLIMAX' });
        }
        this.emit({ ...basePayload, type: 'ON_SPECIAL_IMPACT' });
      }
      if (
        !spec.isLooping &&
        frame === spec.startupFrames + spec.activeFrames
      ) {
        this.emit({ ...basePayload, type: 'ON_ACTIVE_HITBOX_END' });
        this.emit({ ...basePayload, type: 'ON_RECOVERY_BEGIN' });
      }
      if (
        (state === 'super_move' || state === 'super') &&
        (frame === 1 ||
          frame === Math.floor(spec.totalFrames * 0.28) ||
          frame === (spec.superMoveClimaxFrame ?? Math.floor(spec.totalFrames * 0.62)))
      ) {
        this.emit({ ...basePayload, type: 'ON_SUPERMOVE_PHASE' });
      }
      if (!spec.isLooping && frame === spec.totalFrames) {
        this.emit({ ...basePayload, type: 'ON_ANIMATION_COMPLETE' });
      }

      this.lastDispatchedState = state;
      this.lastDispatchedFrame = frame;
    }

    return basePayload;
  }

  private emit(payload: FighterAnimationEventPayload): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}
