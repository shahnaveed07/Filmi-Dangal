import { AttackType, CombatHitEvent, Vector3D } from '../../types/fighter';
import { MatchPhase } from '../../engine/MatchManager';
import { Fighter3D, FIXED_RENDER_PLANE_Z } from './Fighter3D';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';
import { ProjectileManager3D } from './Projectile3D';

export interface CombatHitEvent3D extends CombatHitEvent {
  activationId?: string;
  attackerIndex: 0 | 1;
  defenderIndex: 0 | 1;
  moveType: AttackType;
  moveName: string;
  blocked: boolean;
  causedKnockdown: boolean;
  isSuperMove: boolean;
  isSuperShot: boolean;
  hitRegion: 'head' | 'torso' | 'legs' | 'none';
  contactPoint3D: Vector3D;
  contactX2D: number;
  contactY2D: number;
  impactFrame?: number;
  dialogueLine?: string;
}

/**
 * CombatSystem3D
 *
 * Authoritative combat system on the 2D XY plane (Z = 0).
 * Resolves 2D XY plane pushboxes, standard hitbox/hurtbox collision for normal attacks,
 * and animation-event-synchronized guaranteed opponent damage for SuperMove and SuperShot.
 */
export class CombatSystem3D {
  public readonly projectileManager = new ProjectileManager3D();
  private readonly resolvedSpecialActivationIds = new Set<string>();

  public hasResolvedActivation(activationId: string): boolean {
    return this.resolvedSpecialActivationIds.has(activationId);
  }

  public clearResolvedActivations(): void {
    this.resolvedSpecialActivationIds.clear();
  }

  /**
   * Resolves horizontal X-axis pushbox overlap on the 2D XY plane.
   */
  public resolvePushboxes3D(
    f1: Fighter3D,
    f2: Fighter3D,
    bounds = { minX: -7.5, maxX: 7.5, minZ: 0, maxZ: 0 }
  ): void {
    const r1 = Math.max(0.32, f1.def.visuals.proportions.shoulderWidth * 0.72);
    const r2 = Math.max(0.32, f2.def.visuals.proportions.shoulderWidth * 0.72);

    const sep = HitboxSystem3D.computeHorizontalPushSeparation3D(
      f1.position,
      r1,
      f2.position,
      r2
    );

    if (sep.overlap <= 0) return;

    const halfPush = sep.overlap * 0.52;
    f1.position.x -= sep.dirX * halfPush;
    f2.position.x += sep.dirX * halfPush;

    f1.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, f1.position.x));
    f2.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, f2.position.x));
  }

  /**
   * AUTHORITATIVE GUARANTEED-HIT COMBAT FUNCTION FOR SPECIAL ATTACKS (SuperMove & SuperShot).
   *
   * Guarantees positive character-specific damage whenever resolved at the configured
   * animation impact/release event against an eligible opposing fighter:
   * - No maximum distance or range check
   * - No projectile collision requirement
   * - Blocking, crouching, jumping, or invulnerability cannot prevent or reduce the guaranteed damage
   * - Applies damage exactly once per activation via unique activationId deduplication
   * - Triggers opponent hit reaction (hurt / knockback) unless defender is mid-unresolved-special with > 0 HP
   * - Respects match-end and KO states and never damages an already defeated opponent
   */
  public applyGuaranteedSpecialHit(
    attacker: Fighter3D,
    defender: Fighter3D,
    abilityType: 'super_shot' | 'super_move',
    activationId: string,
    matchPhase: MatchPhase = 'fighting',
    allowSimultaneousTrade = false
  ): CombatHitEvent3D | null {
    if (matchPhase !== 'fighting') {
      return null;
    }

    if (!activationId || this.resolvedSpecialActivationIds.has(activationId)) {
      return null;
    }

    const attackerEligible = allowSimultaneousTrade
      ? attacker.state !== 'defeat'
      : attacker.isEligibleTarget();
    const defenderEligible = defender.isEligibleTarget();

    if (
      attacker.playerIndex === defender.playerIndex ||
      !attackerEligible ||
      !defenderEligible
    ) {
      return null;
    }

    // Lock activation ID so damage can never be applied more than once for this activation
    this.resolvedSpecialActivationIds.add(activationId);
    attacker.moveHasHit = true;
    attacker.specialDamageResolvedForActivation = true;
    attacker.pendingSpecialImpact = false;

    const move = attacker.def.moves[abilityType];
    const isSuperMove = abilityType === 'super_move';
    const moveName = isSuperMove
      ? attacker.def.superMoveInfo.name
      : attacker.def.superShotInfo.name;

    // Guaranteed positive character-specific damage (never zero, never prevented by block)
    const rawDamage =
      (move.damage * attacker.def.stats.powerMultiplier) /
      defender.def.stats.defenseMultiplier;
    const confirmedDamage = Math.max(1, Math.round(rawDamage));

    attacker.comboCount += 1;
    attacker.comboTimerFrames = 60;
    attacker.comboDamage += confirmedDamage;

    const defenderHadUnresolvedSpecial = defender.hasUnresolvedSpecial();

    // Bypass block, dodge, and invulnerability on confirmed special hit
    defender.isBlocking = false;
    defender.health = Math.max(0, defender.health - confirmedDamage);
    defender.gainMeter(isSuperMove ? 15 : 8);

    const pushDirX = defender.position.x >= attacker.position.x ? 1 : -1;
    const causesKO = defender.health <= 0;
    const causesKnockdown = isSuperMove || !!move.causesKnockdown || causesKO;

    const kbX = Math.min(8.5, Math.max(2.5, move.knockbackX * 0.55));
    const kbY = Math.min(9.5, Math.max(2.5, Math.abs(move.knockbackY) * 0.55));

    // If defender is mid-special and survives the hit, preserve their active special state
    // so simultaneous special attacks both complete deterministically; otherwise apply hit reaction.
    if (defenderHadUnresolvedSpecial && !causesKO) {
      defender.velocity.x = pushDirX * kbX * 0.25;
    } else {
      defender.invulnerableFrames = 0;
      defender.currentMove = null;
      defender.currentMoveType = null;
      defender.pendingProjectileSpawn = false;
      defender.pendingSpecialImpact = false;

      if (causesKnockdown) {
        defender.state = 'knockback';
        defender.stateFrame = 0;
        defender.hitstunFrames = move.hitStunFrames + 12;
        defender.isGrounded = false;
        defender.velocity.x = pushDirX * kbX;
        defender.velocity.y = Math.max(4.6, kbY);
      } else {
        defender.state = 'hurt';
        defender.stateFrame = 0;
        defender.hitstunFrames = move.hitStunFrames;
        defender.velocity.x = pushDirX * kbX * 0.65;
      }
    }

    const contactPoint3D: Vector3D = {
      x: defender.position.x,
      y: defender.position.y + 1.15,
      z: FIXED_RENDER_PLANE_Z,
    };
    const contactX2D = 640 + contactPoint3D.x * 80;
    const contactY2D = 570 - contactPoint3D.y * 80;

    return {
      activationId,
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerIndex: attacker.playerIndex,
      defenderIndex: defender.playerIndex,
      moveType: abilityType,
      attackType: abilityType,
      moveName,
      damage: confirmedDamage,
      blocked: false,
      isBlocked: false,
      isCounter: false,
      isCritical: isSuperMove,
      isGrab: false,
      isProjectile: !isSuperMove,
      causedKnockdown: causesKnockdown,
      isSuperMove,
      isSuperShot: !isSuperMove,
      hitRegion: 'torso',
      contactPoint3D,
      contactX2D,
      contactY2D,
      hitX: contactX2D,
      hitY: contactY2D,
      hitZ: FIXED_RENDER_PLANE_Z,
      comboCount: attacker.comboCount,
      impactFrame: attacker.stateFrame,
      dialogueLine: isSuperMove
        ? attacker.def.dialogues.superQuote
        : attacker.def.dialogues.superShotQuote,
    };
  }

  public updateAndResolveCombat(
    f1: Fighter3D,
    f2: Fighter3D,
    dt = 1 / 60,
    matchPhase: MatchPhase = 'fighting'
  ): CombatHitEvent3D[] {
    // 1. Spawn & advance visual 3D SuperShot projectiles at their configured animation release frame
    if (f1.shouldSpawnProjectileThisFrame()) {
      this.projectileManager.spawnSuperShot(
        0,
        f1.id,
        f1.position,
        f1.facing,
        FIXED_RENDER_PLANE_Z
      );
    }
    if (f2.shouldSpawnProjectileThisFrame()) {
      this.projectileManager.spawnSuperShot(
        1,
        f2.id,
        f2.position,
        f2.facing,
        FIXED_RENDER_PLANE_Z
      );
    }

    this.projectileManager.updateFrame(dt);
    for (const proj of this.projectileManager.getActiveProjectiles()) {
      if (!proj.active) continue;
      const defender = proj.ownerIndex === 0 ? f2 : f1;
      if (proj.ageFrames >= 4 && Math.abs(proj.position.x - defender.position.x) < 0.45) {
        proj.active = false;
      }
    }

    // Respect match-end and KO states: do not resolve damage outside active fighting phase
    if (matchPhase !== 'fighting') {
      return [];
    }

    const events: CombatHitEvent3D[] = [];

    // 2. Resolve Guaranteed Special Hits at their configured animation event frame
    const f1EligiblePre = f1.isEligibleTarget();
    const f2EligiblePre = f2.isEligibleTarget();
    const f1ImpactReady = f1.consumePendingSpecialImpact();
    const f2ImpactReady = f2.consumePendingSpecialImpact();
    const simultaneousImpact = f1ImpactReady && f2ImpactReady && f1EligiblePre && f2EligiblePre;

    if (f1ImpactReady && f1EligiblePre && f2EligiblePre) {
      const specialEvt1 = this.resolvePendingSpecialAtImpact(
        f1,
        f2,
        matchPhase,
        simultaneousImpact
      );
      if (specialEvt1) events.push(specialEvt1);
    }

    if (f2ImpactReady && f2EligiblePre && (simultaneousImpact || f2.isEligibleTarget())) {
      const specialEvt2 = this.resolvePendingSpecialAtImpact(
        f2,
        f1,
        matchPhase,
        simultaneousImpact
      );
      if (specialEvt2) events.push(specialEvt2);
    }

    // 3. Resolve normal attacks (punch, kick, sweep, forward_punch, forward_kick, grab) with standard hitbox/hurtbox collision
    const hit1 = this.checkFighterMeleeAttack(f1, f2);
    const hit2 = this.checkFighterMeleeAttack(f2, f1);

    if (hit1) events.push(hit1);
    if (hit2) events.push(hit2);

    return events;
  }

  private resolvePendingSpecialAtImpact(
    attacker: Fighter3D,
    defender: Fighter3D,
    matchPhase: MatchPhase,
    allowSimultaneousTrade = false
  ): CombatHitEvent3D | null {
    if (
      !attacker.currentSpecialActivationId ||
      attacker.specialDamageResolvedForActivation
    ) {
      return null;
    }

    if (
      attacker.state === 'super_shot' ||
      attacker.currentMoveType === 'super_shot'
    ) {
      return this.applyGuaranteedSpecialHit(
        attacker,
        defender,
        'super_shot',
        attacker.currentSpecialActivationId,
        matchPhase,
        allowSimultaneousTrade
      );
    }

    if (
      attacker.state === 'super_move' ||
      attacker.state === 'super' ||
      attacker.currentMoveType === 'super_move' ||
      attacker.currentMoveType === 'super'
    ) {
      return this.applyGuaranteedSpecialHit(
        attacker,
        defender,
        'super_move',
        attacker.currentSpecialActivationId,
        matchPhase,
        allowSimultaneousTrade
      );
    }

    return null;
  }

  private checkFighterMeleeAttack(
    attacker: Fighter3D,
    defender: Fighter3D
  ): CombatHitEvent3D | null {
    if (!attacker.isEligibleTarget() || !defender.isEligibleTarget()) {
      return null;
    }

    const attackSphere = attacker.getActiveAttackSphere3D();
    if (!attackSphere || !attacker.currentMove || !attacker.currentMoveType) {
      return null;
    }

    if (
      defender.invulnerableFrames > 0 ||
      defender.state === 'knockdown' ||
      defender.state === 'defeat'
    ) {
      return null;
    }

    const defenderCapsule = defender.getCapsuleHurtbox3D();
    const hitResult = HitboxSystem3D.checkAttackHit3D(
      attackSphere,
      defenderCapsule
    );
    if (!hitResult.overlaps) {
      return null;
    }

    attacker.moveHasHit = true;
    const move = attacker.currentMove;
    const moveType = attacker.currentMoveType;

    const pushDirX = defender.position.x >= attacker.position.x ? 1 : -1;

    // Grab breaks guard! Low sweep hits if standing-blocking
    const canBlockMove =
      moveType !== 'grab' && !(move.isLow && !defender.isCrouching);

    const isBlocked = defender.isBlocking && canBlockMove;
    const moveName = moveType.toUpperCase();

    const contactX2D = 640 + hitResult.contactPoint.x * 80;
    const contactY2D = 570 - hitResult.contactPoint.y * 80;

    if (isBlocked) {
      const chipDamage = Math.max(
        2,
        Math.round(
          (move.damage * 0.15 * attacker.def.stats.powerMultiplier) /
            defender.def.stats.defenseMultiplier
        )
      );
      defender.health = Math.max(1, defender.health - chipDamage);
      defender.state = defender.isCrouching ? 'crouch_block' : 'block';
      defender.stateFrame = 0;
      defender.blockstunFrames = move.blockStunFrames;
      defender.velocity.x = pushDirX * Math.max(2.2, move.knockbackX * 0.35);

      attacker.gainMeter(move.meterGainOnBlock);
      defender.gainMeter(move.meterGainOnBlock);

      return {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerIndex: attacker.playerIndex,
        defenderIndex: defender.playerIndex,
        moveType,
        attackType: moveType,
        moveName,
        damage: chipDamage,
        blocked: true,
        isBlocked: true,
        isCounter: false,
        isCritical: false,
        isGrab: false,
        causedKnockdown: false,
        isSuperMove: false,
        isSuperShot: false,
        hitRegion: hitResult.hitRegion,
        contactPoint3D: hitResult.contactPoint,
        contactX2D,
        contactY2D,
        hitX: contactX2D,
        hitY: contactY2D,
        hitZ: FIXED_RENDER_PLANE_Z,
        comboCount: 0,
      };
    }

    const rawDamage =
      (move.damage * attacker.def.stats.powerMultiplier) /
      defender.def.stats.defenseMultiplier;
    const scaledDamage = attacker.registerComboHit(rawDamage);

    defender.health = Math.max(0, defender.health - scaledDamage);
    defender.isBlocking = false;
    defender.currentMove = null;
    defender.currentMoveType = null;

    attacker.gainMeter(move.meterGainOnHit);
    defender.gainMeter(Math.round(move.meterGainOnHit * 0.45));

    const causesKO = defender.health <= 0;
    const causesKnockdown = !!move.causesKnockdown || causesKO;

    const kbX3D = Math.min(8.5, Math.max(2.0, move.knockbackX * 0.55));
    const kbY3D = Math.min(9.5, Math.max(0, Math.abs(move.knockbackY) * 0.55));

    if (causesKnockdown) {
      defender.state = 'knockback';
      defender.stateFrame = 0;
      defender.hitstunFrames = move.hitStunFrames + 12;
      defender.isGrounded = false;
      defender.velocity.x = pushDirX * kbX3D;
      defender.velocity.y = Math.max(4.8, kbY3D);
    } else {
      defender.state = 'hurt';
      defender.stateFrame = 0;
      defender.hitstunFrames = move.hitStunFrames;
      defender.velocity.x = pushDirX * kbX3D * 0.65;
      if (kbY3D > 1.5) {
        defender.isGrounded = false;
        defender.velocity.y = kbY3D;
      }
    }

    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerIndex: attacker.playerIndex,
      defenderIndex: defender.playerIndex,
      moveType,
      attackType: moveType,
      moveName,
      damage: scaledDamage,
      blocked: false,
      isBlocked: false,
      isCounter: false,
      isCritical: false,
      isGrab: moveType === 'grab',
      causedKnockdown: causesKnockdown,
      isSuperMove: false,
      isSuperShot: false,
      hitRegion: hitResult.hitRegion,
      contactPoint3D: hitResult.contactPoint,
      contactX2D,
      contactY2D,
      hitX: contactX2D,
      hitY: contactY2D,
      hitZ: FIXED_RENDER_PLANE_Z,
      comboCount: attacker.comboCount,
    };
  }
}
