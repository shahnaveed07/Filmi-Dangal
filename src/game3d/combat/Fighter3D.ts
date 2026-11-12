import { Vector2 } from '@babylonjs/core';
import {
  AttackFrameData,
  AttackType,
  BoneAttachmentName,
  CapsuleHurtbox3D,
  CharacterDef,
  CharacterId,
  FighterSnapshot,
  FighterStateName,
  InputFrame,
  Sphere3D,
  Vector3D,
} from '../../types/fighter';
import { MatchPhase } from '../../engine/MatchManager';
import { FighterAnimationEvents } from '../animation/FighterAnimationEvents';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';

export const STAGE_3D_GRAVITY = 28.0; // m/s^2 in 2D XY world units
export const STAGE_3D_GROUND_FRICTION = 0.8;
export const FIXED_RENDER_PLANE_Z = 0;

/**
 * 2D XY Plane position/velocity wrapper backed by Babylon.js Vector2.
 * Keeps Z permanently locked to FIXED_RENDER_PLANE_Z (0) so all gameplay
 * occurs strictly on the 2D XY plane while remaining compatible with 3D scene queries.
 */
export class PlaneVector2D implements Vector3D {
  public readonly vec2: Vector2;

  constructor(x = 0, y = 0) {
    this.vec2 = new Vector2(x, y);
  }

  public get x(): number {
    return this.vec2.x;
  }
  public set x(val: number) {
    this.vec2.x = val;
  }

  public get y(): number {
    return this.vec2.y;
  }
  public set y(val: number) {
    this.vec2.y = val;
  }

  public get z(): number {
    return FIXED_RENDER_PLANE_Z;
  }
  public set z(_val: number) {
    // Z-axis gameplay is disabled; all fighters remain on the fixed Z = 0 plane.
  }
}

/**
 * Fighter simulation model with 3D visuals and strict 2D XY plane gameplay.
 * X: horizontal stage axis (-7.5 to +7.5m)
 * Y: vertical height axis (0 = stage floor)
 * Z: permanently fixed at 0 (no Z-axis movement or sidestepping)
 */
export class Fighter3D {
  private static activationSequence = 0;

  public readonly playerIndex: 0 | 1;
  public def: CharacterDef;
  public id: CharacterId;
  public readonly animEvents = new FighterAnimationEvents();

  private _position: PlaneVector2D;
  private _velocity: PlaneVector2D;
  public facing: 1 | -1;

  public health: number;
  public maxHealth: number;
  public specialMeter: number;
  public maxSpecialMeter = 100;

  public state: FighterStateName = 'idle';
  public stateFrame = 0;
  public currentMoveType: AttackType | null = null;
  public currentMove: AttackFrameData | null = null;
  public moveHasHit = false;

  // Unique activation tracking & animation-event triggers for SuperMove and SuperShot
  public currentSpecialActivationId: string | null = null;
  public specialDamageResolvedForActivation = false;
  public pendingProjectileSpawn = false;
  public pendingSpecialImpact = false;

  // Synchronized two-character Grab & Throw (Dhobi Pachad) constraint state
  public activeGrabTarget: Fighter3D | null = null;
  public grabbedBy: Fighter3D | null = null;
  public grabActivationId: string | null = null;
  public grabDamageResolved = false;
  public grabAnchorX = 0;
  public grabWhiffed = false;

  public hitstunFrames = 0;
  public blockstunFrames = 0;
  public knockdownFrames = 0;
  public invulnerableFrames = 0;
  public superShotCooldownFrames = 0;
  public projectileSpawnedForCurrentMove = false;

  public isGrounded = true;
  public isCrouching = false;
  public isBlocking = false;

  public comboCount = 0;
  public comboDamage = 0;
  public comboTimerFrames = 0;

  // Optional callback set by the 3D scene to query exact bone world coordinates when rendering
  public boneWorldPositionProvider?: (bone: BoneAttachmentName) => Vector3D | null;

  public healthMultiplier = 1.0;
  public controlSensitivityMultiplier = 1.0;

  constructor(
    playerIndex: 0 | 1,
    def: CharacterDef,
    startX3D: number,
    floorY3D = 0,
    _unusedZ = 0
  ) {
    this.playerIndex = playerIndex;
    this.def = def;
    this.id = def.id;
    this._position = new PlaneVector2D(startX3D, floorY3D);
    this._velocity = new PlaneVector2D(0, 0);
    this.facing = playerIndex === 0 ? 1 : -1;
    this.maxHealth = Math.round(def.stats.maxHealth * this.healthMultiplier);
    this.health = this.maxHealth;
    this.specialMeter = 25; // Start with 25 meter so SuperShot is ready

    // Connect FighterAnimationEvents directly to combat triggers
    this.animEvents.onEvent((evt) => {
      if (evt.characterId !== this.id) return;
      if (
        (evt.type === 'ON_PROJECTILE_RELEASE' || evt.type === 'ON_PROJECTILE_SPAWN') &&
        (this.state === 'super_shot' || this.currentMoveType === 'super_shot')
      ) {
        this.pendingProjectileSpawn = true;
      }
      if (
        evt.type === 'ON_SPECIAL_IMPACT' &&
        (this.state === 'super_shot' ||
          this.state === 'super_move' ||
          this.state === 'super' ||
          this.currentMoveType === 'super_shot' ||
          this.currentMoveType === 'super_move' ||
          this.currentMoveType === 'super')
      ) {
        if (this.currentSpecialActivationId && !this.specialDamageResolvedForActivation) {
          this.pendingSpecialImpact = true;
        }
      } else if (
        (evt.type === 'ON_SUPERMOVE_CLIMAX' ||
          (evt.type === 'ON_SUPERMOVE_PHASE' && evt.superMovePhase === 'CLIMAX_IMPACT')) &&
        (this.state === 'super_move' ||
          this.state === 'super' ||
          this.currentMoveType === 'super_move' ||
          this.currentMoveType === 'super')
      ) {
        if (this.currentSpecialActivationId && !this.specialDamageResolvedForActivation) {
          this.pendingSpecialImpact = true;
        }
      }
    });
  }

  public get position2D(): Vector2 {
    return this._position.vec2;
  }

  public get velocity2D(): Vector2 {
    return this._velocity.vec2;
  }

  public get position(): PlaneVector2D {
    return this._position;
  }

  public set position(val: { x: number; y: number; z?: number }) {
    this._position.x = val.x;
    this._position.y = val.y;
  }

  public get velocity(): PlaneVector2D {
    return this._velocity;
  }

  public set velocity(val: { x: number; y: number; z?: number }) {
    this._velocity.x = val.x;
    this._velocity.y = val.y;
  }

  public setCharacterDef(def: CharacterDef): void {
    this.def = def;
    this.id = def.id;
    this.maxHealth = Math.round(def.stats.maxHealth * this.healthMultiplier);
  }

  public applyGameplaySettings(
    startingHealthPercent: 100 | 125 | 150 = 100,
    controlSensitivity: 'low' | 'normal' | 'high' = 'normal'
  ): void {
    this.healthMultiplier = startingHealthPercent / 100;
    this.controlSensitivityMultiplier =
      controlSensitivity === 'low' ? 0.9 : controlSensitivity === 'high' ? 1.12 : 1.0;
    const prevPct = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    this.maxHealth = Math.round(this.def.stats.maxHealth * this.healthMultiplier);
    this.health = Math.max(1, Math.round(this.maxHealth * prevPct));
  }

  // Compatibility 2D pixel getters/setters mapped cleanly to 2D XY meters (1m = 80px, center = 640px)
  public get x(): number {
    return 640 + this._position.x * 80;
  }
  public set x(px: number) {
    this._position.x = (px - 640) / 80;
  }

  public get y(): number {
    return 570 - this._position.y * 80;
  }
  public set y(py: number) {
    this._position.y = Math.max(0, (570 - py) / 80);
  }

  public get z(): number {
    return FIXED_RENDER_PLANE_Z;
  }
  public set z(_val: number) {
    // Locked to 0
  }

  public get vx(): number {
    return this._velocity.x;
  }
  public set vx(val: number) {
    this._velocity.x = val;
  }

  public get vy(): number {
    return -this._velocity.y;
  }
  public set vy(val: number) {
    this._velocity.y = -val;
  }

  public resetForRound(
    startX3D: number,
    floorY3D = 0,
    _unusedZ = 0,
    fullMeterReset = false
  ): void {
    this._position.x = startX3D;
    this._position.y = floorY3D;
    this._velocity.x = 0;
    this._velocity.y = 0;
    this.facing = this.playerIndex === 0 ? 1 : -1;
    this.maxHealth = Math.round(this.def.stats.maxHealth * this.healthMultiplier);
    this.health = this.maxHealth;
    this.specialMeter = fullMeterReset ? 25 : Math.max(25, Math.min(this.specialMeter, 60));
    this.state = 'idle';
    this.stateFrame = 0;
    this.currentMoveType = null;
    this.currentMove = null;
    this.moveHasHit = false;
    this.currentSpecialActivationId = null;
    this.specialDamageResolvedForActivation = false;
    this.pendingProjectileSpawn = false;
    this.pendingSpecialImpact = false;
    this.activeGrabTarget = null;
    this.grabbedBy = null;
    this.grabActivationId = null;
    this.grabDamageResolved = false;
    this.grabAnchorX = startX3D;
    this.grabWhiffed = false;
    this.hitstunFrames = 0;
    this.blockstunFrames = 0;
    this.knockdownFrames = 0;
    this.invulnerableFrames = 0;
    this.superShotCooldownFrames = 0;
    this.projectileSpawnedForCurrentMove = false;
    this.isGrounded = true;
    this.isCrouching = false;
    this.isBlocking = false;
    this.comboCount = 0;
    this.comboDamage = 0;
    this.comboTimerFrames = 0;
  }

  /**
   * Releases any active two-character grab constraint on this fighter and their partner,
   * restoring valid combat states if interrupted or cancelled.
   */
  public releaseGrabConstraint(restoreIdleIfGrabbed = true): void {
    const target = this.activeGrabTarget;
    const captor = this.grabbedBy;
    this.activeGrabTarget = null;
    this.grabbedBy = null;

    if (target) {
      target.grabbedBy = null;
      if (restoreIdleIfGrabbed && target.state === 'grabbed') {
        target.position.y = 0;
        target.velocity.x = 0;
        target.velocity.y = 0;
        target.isGrounded = true;
        target.state = target.health <= 0 ? 'defeat' : 'idle';
        target.stateFrame = 0;
      }
    }
    if (captor) {
      captor.activeGrabTarget = null;
    }
    if (restoreIdleIfGrabbed && this.state === 'grabbed') {
      this._position.y = 0;
      this._velocity.x = 0;
      this._velocity.y = 0;
      this.isGrounded = true;
      this.state = this.health <= 0 ? 'defeat' : 'idle';
      this.stateFrame = 0;
    }
  }

  public isEligibleTarget(): boolean {
    return this.health > 0 && this.state !== 'defeat';
  }

  public hasUnresolvedSpecial(): boolean {
    return (
      (this.state === 'super_move' ||
        this.state === 'super' ||
        this.state === 'super_shot' ||
        this.currentMoveType === 'super_move' ||
        this.currentMoveType === 'super' ||
        this.currentMoveType === 'super_shot') &&
      this.currentSpecialActivationId !== null &&
      !this.specialDamageResolvedForActivation &&
      this.health > 0
    );
  }

  public canAct(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walk' ||
      this.state === 'walk_forward' ||
      this.state === 'walk_backward' ||
      this.state === 'run' ||
      this.state === 'crouch' ||
      this.state === 'block' ||
      this.state === 'crouch_block' ||
      (this.state === 'jump' && this.currentMove === null)
    );
  }

  public isAttacking(): boolean {
    return (
      this.state === 'punch' ||
      this.state === 'kick' ||
      this.state === 'sweep' ||
      this.state === 'forward_punch' ||
      this.state === 'forward_kick' ||
      this.state === 'grab' ||
      this.state === 'super_shot' ||
      this.state === 'super_move' ||
      this.state === 'super' ||
      this.state === 'special'
    );
  }

  public updateFacing(opponent: Fighter3D): void {
    if (
      this.isAttacking() ||
      this.state === 'grabbed' ||
      this.grabbedBy !== null ||
      this.activeGrabTarget !== null ||
      this.state === 'knockdown' ||
      this.state === 'defeat'
    ) {
      return;
    }
    if (Math.abs(opponent.position.x - this._position.x) > 0.05) {
      this.facing = opponent.position.x >= this._position.x ? 1 : -1;
    }
  }

  public processInput(
    input: InputFrame,
    opponent: Fighter3D,
    matchPhase: MatchPhase = 'fighting'
  ): void {
    if (matchPhase !== 'fighting') {
      return;
    }

    this.updateFacing(opponent);

    if (
      this.state === 'grabbed' ||
      this.grabbedBy !== null ||
      this.activeGrabTarget !== null ||
      this.state === 'hurt' ||
      this.state === 'knockback' ||
      this.state === 'knockdown' ||
      this.state === 'recovery' ||
      this.state === 'victory' ||
      this.state === 'defeat'
    ) {
      return;
    }

    // Cancel normal attacks into SuperMove or SuperShot on hit
    if (this.isAttacking() && this.currentMove && this.currentMoveType) {
      const canSpecialCancel =
        this.moveHasHit &&
        this.currentMoveType !== 'super' &&
        this.currentMoveType !== 'super_move' &&
        this.currentMoveType !== 'super_shot';

      if (canSpecialCancel) {
        if ((input.superMoveJustPressed || input.specialJustPressed) && this.specialMeter >= 100) {
          this.startAttack('super_move', matchPhase);
          return;
        }
        if (
          input.superShotJustPressed &&
          this.specialMeter >= (this.def.moves.super_shot.meterCost ?? 25) &&
          this.superShotCooldownFrames <= 0
        ) {
          this.startAttack('super_shot', matchPhase);
          return;
        }
      }
      return;
    }

    // 1. Check SuperMove (L) - Requires 100 meter
    if ((input.superMoveJustPressed || input.specialJustPressed) && this.specialMeter >= 100) {
      this.startAttack('super_move', matchPhase);
      return;
    }

    // 2. Check SuperShot (U) - Requires 20-25 meter & off cooldown
    const shotCost = this.def.moves.super_shot.meterCost ?? 25;
    if (
      input.superShotJustPressed &&
      this.specialMeter >= shotCost &&
      this.superShotCooldownFrames <= 0
    ) {
      this.startAttack('super_shot', matchPhase);
      return;
    }

    // 3. Check Grab (I)
    if (input.grabJustPressed && this.isGrounded) {
      this.startAttack('grab', matchPhase);
      return;
    }

    const holdingForward =
      (this.facing === 1 && input.right) || (this.facing === -1 && input.left);
    const holdingBack =
      (this.facing === 1 && input.left) || (this.facing === -1 && input.right);

    // 4. Check Punch / Kick / Directional Command Attacks
    if (input.punchJustPressed) {
      if (holdingForward && this.isGrounded) {
        this.startAttack('forward_punch', matchPhase);
      } else {
        this.startAttack('punch', matchPhase);
      }
      return;
    }

    if (input.kickJustPressed) {
      if ((input.crouch || input.down) && this.isGrounded) {
        this.startAttack('sweep', matchPhase);
      } else if (holdingForward && this.isGrounded) {
        this.startAttack('forward_kick', matchPhase);
      } else {
        this.startAttack('kick', matchPhase);
      }
      return;
    }

    if (!this.isGrounded) {
      const airMoveSpeed = this.def.stats.walkSpeed * 0.85;
      if (input.left) {
        this._velocity.x = -airMoveSpeed;
      } else if (input.right) {
        this._velocity.x = airMoveSpeed;
      }
      return;
    }

    // 5. Dedicated Block (SHIFT / B) or holding back while opponent attacks
    if (input.block || (holdingBack && opponent.isAttacking())) {
      this.state = input.crouch || input.down ? 'crouch_block' : 'block';
      this.isBlocking = true;
      this.isCrouching = input.crouch || input.down;
      this._velocity.x *= 0.5;
      return;
    }
    this.isBlocking = false;

    // 6. Jump (SPACE / W / UP)
    if (input.jumpJustPressed || input.upJustPressed) {
      this.state = 'jump';
      this.stateFrame = 0;
      this.isGrounded = false;
      this.isCrouching = false;
      this._velocity.y = Math.abs(this.def.stats.jumpVelocity) * 0.72;
      if (input.left) {
        this._velocity.x = -this.def.stats.walkSpeed * 0.9;
      } else if (input.right) {
        this._velocity.x = this.def.stats.walkSpeed * 0.9;
      }
      return;
    }

    // 7. Crouch (CTRL / C / S / DOWN)
    if (input.crouch || input.down) {
      this.state = 'crouch';
      this.isCrouching = true;
      this._velocity.x *= 0.6;
      return;
    }
    this.isCrouching = false;

    // 8. Strictly 2D Horizontal X-Axis Movement (No Z-axis movement or sidestepping)
    const baseSpeed = this.def.stats.walkSpeed * 1.05 * this.controlSensitivityMultiplier;
    const isActionSultan = this.id === 'action_sultan';
    const walkMoveSpeed = baseSpeed * (isActionSultan ? 0.82 : 0.85);
    const sprintMoveSpeed = baseSpeed * (isActionSultan ? 1.56 : 1.25);
    let movingX = false;

    if (input.left) {
      const targetSpeed = holdingBack ? walkMoveSpeed : sprintMoveSpeed;
      const targetVx = -targetSpeed;
      this._velocity.x =
        Math.abs(this._velocity.x) < 0.1
          ? targetVx * 0.82
          : this._velocity.x + (targetVx - this._velocity.x) * 0.48;
      movingX = true;
    } else if (input.right) {
      const targetSpeed = holdingForward ? sprintMoveSpeed : walkMoveSpeed;
      const targetVx = targetSpeed;
      this._velocity.x =
        Math.abs(this._velocity.x) < 0.1
          ? targetVx * 0.82
          : this._velocity.x + (targetVx - this._velocity.x) * 0.48;
      movingX = true;
    }

    if (movingX) {
      const nextState: FighterStateName = holdingForward ? 'run' : 'walk';
      if (this.state !== nextState) {
        this.state = nextState;
        this.stateFrame = 0;
      }
    } else {
      if (this.state !== 'idle') {
        this.state = 'idle';
        this.stateFrame = 0;
      }
    }
  }

  public startAttack(
    type: AttackType,
    matchPhase: MatchPhase = 'fighting'
  ): boolean {
    if (
      matchPhase !== 'fighting' ||
      !this.isEligibleTarget() ||
      this.state === 'grabbed' ||
      this.grabbedBy !== null ||
      this.activeGrabTarget !== null
    ) {
      return false;
    }

    const resolvedType: AttackType = type === 'super' ? 'super_move' : type;
    const move = this.def.moves[resolvedType];
    if (!move) return false;

    const cost = move.meterCost ?? 0;
    if (resolvedType === 'super_move' && this.specialMeter < 100) {
      return false;
    }
    if (resolvedType === 'super_shot') {
      if (this.specialMeter < cost || this.superShotCooldownFrames > 0) {
        return false;
      }
      this.superShotCooldownFrames = move.cooldownFrames ?? 60;
    }

    if (cost > 0) {
      this.specialMeter = Math.max(0, this.specialMeter - cost);
    }

    this.state = resolvedType;
    this.stateFrame = 0;
    this.currentMoveType = resolvedType;
    this.currentMove = move;
    this.moveHasHit = false;
    this.projectileSpawnedForCurrentMove = false;
    this.pendingProjectileSpawn = false;
    this.pendingSpecialImpact = false;
    this.isBlocking = false;

    if (resolvedType === 'grab') {
      Fighter3D.activationSequence += 1;
      this.grabActivationId = `${this.id}_grab_act_${Fighter3D.activationSequence}`;
      this.grabDamageResolved = false;
      this.grabAnchorX = this._position.x;
      this.grabWhiffed = false;
    } else {
      this.grabActivationId = null;
      this.grabDamageResolved = false;
      this.grabWhiffed = false;
    }

    if (resolvedType === 'super_move' || resolvedType === 'super_shot') {
      Fighter3D.activationSequence += 1;
      this.currentSpecialActivationId = `${this.id}_${resolvedType}_act_${Fighter3D.activationSequence}`;
      this.specialDamageResolvedForActivation = false;
      // Grant special armor against normal melee interruption until the special finishes its active window
      this.invulnerableFrames = Math.max(
        this.invulnerableFrames,
        move.startupFrames + move.activeFrames
      );
    } else {
      this.currentSpecialActivationId = null;
      this.specialDamageResolvedForActivation = false;
    }

    if (resolvedType === 'super_move') {
      if (this.id === 'action_sultan' || this.id === 'duggu') {
        this._velocity.x = this.facing * 6.5;
      } else if (this.id === 'romance_raja') {
        this._velocity.x = this.facing * 4.5;
      } else {
        this._velocity.x = this.facing * 5.2;
      }
    } else if (resolvedType === 'forward_punch' || resolvedType === 'forward_kick') {
      this._velocity.x = this.facing * 3.8;
    } else if (resolvedType === 'grab') {
      this._velocity.x = this.facing * (this.id === 'action_sultan' ? 1.6 : 2.2);
    } else if (this.isGrounded) {
      this._velocity.x *= 0.35;
    }
    return true;
  }

  public stepPhysics(
    bounds = { minX: -7.5, maxX: 7.5, minZ: 0, maxZ: 0, floorY: 0 },
    dt = 1 / 60
  ): void {
    this.stateFrame += 1;

    // Evaluate frame-accurate animation events for the current simulation step
    this.animEvents.evaluateFrame(this.id, this.state, this.stateFrame);

    if (this.comboTimerFrames > 0) {
      this.comboTimerFrames -= 1;
      if (this.comboTimerFrames <= 0) {
        this.comboCount = 0;
        this.comboDamage = 0;
      }
    }

    if (this.invulnerableFrames > 0) {
      this.invulnerableFrames -= 1;
    }
    if (this.superShotCooldownFrames > 0) {
      this.superShotCooldownFrames -= 1;
    }

    if (this.state === 'grabbed') {
      if (!this.grabbedBy || !this.grabbedBy.isEligibleTarget() || this.grabbedBy.state !== 'grab') {
        this.releaseGrabConstraint(true);
      } else {
        // While locked in a synchronized grab/throw, position & airborne arc are driven by CombatSystem3D
        this._position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this._position.x));
        return;
      }
    }

    if (this.state === 'hurt' || this.state === 'knockback') {
      this.hitstunFrames -= 1;
      if (this.hitstunFrames <= 0 && this.isGrounded) {
        this.state = 'idle';
        this.stateFrame = 0;
      }
    } else if (this.state === 'block' || this.state === 'crouch_block') {
      if (this.blockstunFrames > 0) {
        this.blockstunFrames -= 1;
      }
    } else if (this.state === 'knockdown') {
      this.knockdownFrames -= 1;
      if (this.knockdownFrames <= 0 && this.health > 0) {
        this.state = 'recovery';
        this.stateFrame = 0;
        this.hitstunFrames = 0;
        this.invulnerableFrames = 18;
      }
    } else if (this.state === 'recovery') {
      if (this.stateFrame >= 18) {
        this.state = 'idle';
        this.stateFrame = 0;
        this.hitstunFrames = 0;
      }
    } else if (this.isAttacking() && this.currentMove) {
      // If Action Sultan's Dhobi Pachad grab whiffed (out of range or invalid target), recover cleanly at 0.60s (Frame 36)
      const isWhiffedSultanGrab =
        this.id === 'action_sultan' &&
        this.state === 'grab' &&
        this.grabWhiffed &&
        !this.activeGrabTarget;
      const totalMoveFrames = isWhiffedSultanGrab
        ? 36
        : this.currentMove.startupFrames +
          this.currentMove.activeFrames +
          this.currentMove.recoveryFrames;
      if (this.stateFrame >= totalMoveFrames) {
        this.releaseGrabConstraint(false);
        this.currentMove = null;
        this.currentMoveType = null;
        this.moveHasHit = false;
        this.grabWhiffed = false;
        this.pendingProjectileSpawn = false;
        this.pendingSpecialImpact = false;
        this.state = this.isGrounded ? (this.isCrouching ? 'crouch' : 'idle') : 'jump';
        this.stateFrame = 0;
      }
    }

    // Apply strictly 2D XY velocities
    this._position.x += this._velocity.x * dt;
    this._position.y += this._velocity.y * dt;

    if (!this.isGrounded) {
      this._velocity.y -= STAGE_3D_GRAVITY * dt;
      if (this._position.y <= bounds.floorY) {
        this._position.y = bounds.floorY;
        this._velocity.y = 0;
        this.isGrounded = true;

        if (this.state === 'knockback') {
          this.state = 'knockdown';
          this.stateFrame = 0;
          this.hitstunFrames = 0;
          this.knockdownFrames = 26;
          this.invulnerableFrames = 28;
        } else if (this.state === 'jump' || this.isAttacking()) {
          this.currentMove = null;
          this.currentMoveType = null;
          this.pendingProjectileSpawn = false;
          this.pendingSpecialImpact = false;
          this.state = 'idle';
          this.stateFrame = 0;
        }
      }
    } else {
      this._position.y = bounds.floorY;
      this._velocity.y = 0;
      if (
        this.state !== 'walk' &&
        this.state !== 'walk_forward' &&
        this.state !== 'walk_backward' &&
        this.state !== 'run'
      ) {
        this._velocity.x *= STAGE_3D_GROUND_FRICTION;
        if (Math.abs(this._velocity.x) < 0.02) this._velocity.x = 0;
      }
    }

    // Clamp to 2D horizontal arena boundaries
    this._position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this._position.x));
  }

  public isMoveInActiveWindow(): boolean {
    if (!this.isAttacking() || !this.currentMove) return false;
    return (
      this.stateFrame >= this.currentMove.startupFrames &&
      this.stateFrame < this.currentMove.startupFrames + this.currentMove.activeFrames
    );
  }

  /**
   * Returns true only on the configured animation release frame (ON_PROJECTILE_SPAWN).
   */
  public shouldSpawnProjectileThisFrame(): boolean {
    if (
      this.state === 'super_shot' &&
      this.currentMove &&
      this.pendingProjectileSpawn &&
      !this.projectileSpawnedForCurrentMove
    ) {
      this.pendingProjectileSpawn = false;
      this.projectileSpawnedForCurrentMove = true;
      return true;
    }
    return false;
  }

  /**
   * Returns true only when FighterAnimationEvents has fired the configured
   * special impact/release event (ON_PROJECTILE_SPAWN for SuperShot or
   * ON_SUPERMOVE_PHASE CLIMAX_IMPACT for SuperMove).
   */
  public consumePendingSpecialImpact(): boolean {
    if (
      this.pendingSpecialImpact &&
      this.currentSpecialActivationId &&
      !this.specialDamageResolvedForActivation
    ) {
      this.pendingSpecialImpact = false;
      return true;
    }
    return false;
  }

  /**
   * Returns the capsule hurtbox on the fixed Z = 0 plane.
   */
  public getCapsuleHurtbox3D(): CapsuleHurtbox3D {
    const heightScale = this.def.visuals.proportions.heightScale;
    const shoulderWidth = this.def.visuals.proportions.shoulderWidth;
    const topY = this.isCrouching
      ? this._position.y + 1.15 * heightScale
      : this.state === 'knockdown'
      ? this._position.y + 0.45
      : this._position.y + 1.82 * heightScale;

    const bottomY = this._position.y + 0.22;
    const radius = Math.max(0.32, shoulderWidth * 0.72);

    const headSphere = HitboxSystem3D.createSphere(
      this._position.x,
      topY - 0.14,
      FIXED_RENDER_PLANE_Z,
      0.24
    );
    const torsoSphere = HitboxSystem3D.createSphere(
      this._position.x,
      (bottomY + topY) * 0.52,
      FIXED_RENDER_PLANE_Z,
      radius
    );
    const legsSphere = HitboxSystem3D.createSphere(
      this._position.x,
      bottomY + 0.25,
      FIXED_RENDER_PLANE_Z,
      radius * 0.9
    );

    return {
      lowerSphere: legsSphere,
      upperSphere: headSphere,
      cylinderRadius: radius,
      bottom: { x: this._position.x, y: bottomY, z: FIXED_RENDER_PLANE_Z },
      top: { x: this._position.x, y: topY, z: FIXED_RENDER_PLANE_Z },
      radius,
      headSphere,
      torsoSphere,
      legsSphere,
    };
  }

  /**
   * Returns the bone-attached attack hitbox sphere on the fixed Z = 0 plane during active
   * normal melee attack frames.
   * Note: SuperShot and SuperMove bypass normal hitbox collision and resolve via
   * CombatSystem3D.applyGuaranteedSpecialHit at their animation event frames.
   */
  public getActiveAttackSphere3D(): Sphere3D | null {
    if (!this.isMoveInActiveWindow() || !this.currentMove || this.moveHasHit) {
      return null;
    }
    if (
      this.currentMove.isProjectile ||
      this.currentMoveType === 'super_shot' ||
      this.currentMoveType === 'super_move' ||
      this.currentMoveType === 'super' ||
      (this.id === 'action_sultan' && this.currentMoveType === 'grab')
    ) {
      return null;
    }

    const move = this.currentMove;
    const boneName = move.attachedBone ?? 'RightHand';
    const bonePos = this.boneWorldPositionProvider?.(boneName);

    const reachMeters = Math.max(
      0.75,
      (move.hitboxOffset.x + move.hitboxOffset.w * 0.5) / 78
    );
    const heightMeters = move.isLow
      ? 0.32
      : boneName === 'RightFoot' || boneName === 'LeftFoot'
      ? 1.05
      : 1.28;

    const cx = bonePos
      ? bonePos.x + this.facing * 0.22
      : this._position.x + this.facing * reachMeters;
    const cy = bonePos ? bonePos.y : this._position.y + heightMeters;

    return HitboxSystem3D.createSphere(
      cx,
      cy,
      FIXED_RENDER_PLANE_Z,
      move.hitRadius3D || 0.48
    );
  }

  public registerComboHit(rawDamage: number): number {
    this.comboCount += 1;
    this.comboTimerFrames = 55;
    const scale =
      this.comboCount <= 1
        ? 1.0
        : this.comboCount === 2
        ? 0.85
        : this.comboCount === 3
        ? 0.72
        : Math.max(0.45, 0.72 - (this.comboCount - 3) * 0.08);
    const scaled = Math.max(1, Math.round(rawDamage * scale));
    this.comboDamage += scaled;
    return scaled;
  }

  public gainMeter(amount: number): void {
    this.specialMeter = Math.min(this.maxSpecialMeter, this.specialMeter + amount);
  }

  public toSnapshot(): FighterSnapshot {
    return {
      id: this.id,
      name: this.def.name,
      x: this.x,
      y: this.y,
      z: FIXED_RENDER_PLANE_Z,
      vx: this._velocity.x,
      vy: this._velocity.y,
      vz: 0,
      facing: this.facing,
      health: Math.max(0, Math.round(this.health)),
      maxHealth: this.maxHealth,
      specialMeter: Math.round(this.specialMeter),
      maxSpecialMeter: this.maxSpecialMeter,
      superShotCooldown: this.superShotCooldownFrames,
      state: this.state,
      stateFrame: this.stateFrame,
      comboCount: this.comboCount,
      comboDamage: Math.round(this.comboDamage),
      isGrounded: this.isGrounded,
      isBlocking: this.isBlocking,
      isCrouching: this.isCrouching,
      invulnerable: this.invulnerableFrames > 0,
      activeMove: this.currentMoveType,
    };
  }
}
