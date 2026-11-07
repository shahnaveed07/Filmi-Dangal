import { AttackType, CombatHitEvent, Vector3D } from '../../types/fighter';
import { Fighter3D } from './Fighter3D';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';
import { ActiveProjectile3D, ProjectileManager3D } from './Projectile3D';

export interface CombatHitEvent3D extends CombatHitEvent {
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
  dialogueLine?: string;
}

/**
 * 3D Combat resolution engine handling 3D pushbox separation, bone-attached melee spheres,
 * 3D capsule hurtboxes, and 3D SuperShot projectiles.
 */
export class CombatSystem3D {
  public readonly projectileManager = new ProjectileManager3D();

  public resolvePushboxes3D(
    f1: Fighter3D,
    f2: Fighter3D,
    bounds3D = { minX: -7.5, maxX: 7.5, minZ: -3.2, maxZ: 3.2 }
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
    f1.position.z -= sep.dirZ * halfPush;
    f2.position.x += sep.dirX * halfPush;
    f2.position.z += sep.dirZ * halfPush;

    f1.position.x = Math.max(bounds3D.minX, Math.min(bounds3D.maxX, f1.position.x));
    f1.position.z = Math.max(bounds3D.minZ, Math.min(bounds3D.maxZ, f1.position.z));
    f2.position.x = Math.max(bounds3D.minX, Math.min(bounds3D.maxX, f2.position.x));
    f2.position.z = Math.max(bounds3D.minZ, Math.min(bounds3D.maxZ, f2.position.z));
  }

  public updateAndResolveCombat(
    f1: Fighter3D,
    f2: Fighter3D,
    dt = 1 / 60
  ): CombatHitEvent3D[] {
    const events: CombatHitEvent3D[] = [];

    // 1. Check if either fighter spawns a SuperShot projectile on this frame
    if (f1.shouldSpawnProjectileThisFrame()) {
      this.projectileManager.spawnSuperShot(
        0,
        f1.id,
        f1.position,
        f1.facing,
        f2.position.z
      );
    }
    if (f2.shouldSpawnProjectileThisFrame()) {
      this.projectileManager.spawnSuperShot(
        1,
        f2.id,
        f2.position,
        f2.facing,
        f1.position.z
      );
    }

    // 2. Advance active 3D projectiles and check collisions
    this.projectileManager.updateFrame(dt);
    for (const proj of this.projectileManager.getActiveProjectiles()) {
      if (!proj.active) continue;
      const attacker = proj.ownerIndex === 0 ? f1 : f2;
      const defender = proj.ownerIndex === 0 ? f2 : f1;

      if (
        defender.invulnerableFrames > 0 ||
        defender.state === 'knockdown' ||
        defender.state === 'defeat'
      ) {
        continue;
      }

      const projSphere = this.projectileManager.getProjectileSphere(proj);
      const hurtbox = defender.getCapsuleHurtbox3D();
      const hitCheck = HitboxSystem3D.checkAttackHit3D(projSphere, hurtbox);

      if (hitCheck.overlaps) {
        proj.active = false;
        const evt = this.applyProjectileHit(
          attacker,
          defender,
          proj,
          hitCheck.contactPoint,
          hitCheck.hitRegion
        );
        events.push(evt);
      }
    }

    // 3. Resolve melee bone-attached 3D attack spheres
    const hit1 = this.checkFighterMeleeAttack(f1, f2);
    const hit2 = this.checkFighterMeleeAttack(f2, f1);

    if (hit1) events.push(hit1);
    if (hit2) events.push(hit2);

    return events;
  }

  private checkFighterMeleeAttack(
    attacker: Fighter3D,
    defender: Fighter3D
  ): CombatHitEvent3D | null {
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
    const hitResult = HitboxSystem3D.checkAttackHit3D(attackSphere, defenderCapsule);
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
    const isSuperMove = moveType === 'super_move' || moveType === 'super';
    const moveName = isSuperMove
      ? attacker.def.superMoveInfo.name
      : moveType.toUpperCase();

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
        isSuperMove,
        isSuperShot: false,
        hitRegion: hitResult.hitRegion,
        contactPoint3D: hitResult.contactPoint,
        contactX2D,
        contactY2D,
        hitX: contactX2D,
        hitY: contactY2D,
        hitZ: hitResult.contactPoint.z,
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
      isCritical: isSuperMove,
      isGrab: moveType === 'grab',
      causedKnockdown: causesKnockdown,
      isSuperMove,
      isSuperShot: false,
      hitRegion: hitResult.hitRegion,
      contactPoint3D: hitResult.contactPoint,
      contactX2D,
      contactY2D,
      hitX: contactX2D,
      hitY: contactY2D,
      hitZ: hitResult.contactPoint.z,
      comboCount: attacker.comboCount,
      dialogueLine: isSuperMove ? attacker.def.dialogues.superQuote : undefined,
    };
  }

  private applyProjectileHit(
    attacker: Fighter3D,
    defender: Fighter3D,
    proj: ActiveProjectile3D,
    contactPoint: Vector3D,
    hitRegion: 'head' | 'torso' | 'legs' | 'none'
  ): CombatHitEvent3D {
    const pushDirX = proj.velocity.x >= 0 ? 1 : -1;
    const contactX2D = 640 + contactPoint.x * 80;
    const contactY2D = 570 - contactPoint.y * 80;

    if (defender.isBlocking) {
      const chip = Math.max(2, Math.round(proj.damage * 0.15));
      defender.health = Math.max(1, defender.health - chip);
      defender.state = defender.isCrouching ? 'crouch_block' : 'block';
      defender.stateFrame = 0;
      defender.blockstunFrames = proj.blockstun;
      defender.velocity.x = pushDirX * 2.4;
      defender.gainMeter(5);

      return {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerIndex: attacker.playerIndex,
        defenderIndex: defender.playerIndex,
        moveType: 'super_shot',
        attackType: 'super_shot',
        moveName: proj.name,
        damage: chip,
        blocked: true,
        isBlocked: true,
        isCounter: false,
        isCritical: false,
        isGrab: false,
         isProjectile: true,
        causedKnockdown: false,
        isSuperMove: false,
        isSuperShot: true,
        hitRegion,
        contactPoint3D: contactPoint,
        contactX2D,
        contactY2D,
        hitX: contactX2D,
        hitY: contactY2D,
        hitZ: contactPoint.z,
        comboCount: 0,
      };
    }

    const rawDamage =
      (proj.damage * attacker.def.stats.powerMultiplier) /
      defender.def.stats.defenseMultiplier;
    const scaledDamage = attacker.registerComboHit(rawDamage);

    defender.health = Math.max(0, defender.health - scaledDamage);
    defender.isBlocking = false;
    defender.currentMove = null;
    defender.currentMoveType = null;
    defender.gainMeter(8);

    const causesKO = defender.health <= 0;
    const causesKnockdown = proj.causesKnockdown || causesKO;

    if (causesKnockdown) {
      defender.state = 'knockback';
      defender.stateFrame = 0;
      defender.hitstunFrames = proj.hitstun + 10;
      defender.isGrounded = false;
      defender.velocity.x = pushDirX * proj.knockbackX;
      defender.velocity.y = Math.max(4.5, proj.knockbackY);
    } else {
      defender.state = 'hurt';
      defender.stateFrame = 0;
      defender.hitstunFrames = proj.hitstun;
      defender.velocity.x = pushDirX * proj.knockbackX * 0.65;
    }

    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerIndex: attacker.playerIndex,
      defenderIndex: defender.playerIndex,
      moveType: 'super_shot',
      attackType: 'super_shot',
      moveName: proj.name,
      damage: scaledDamage,
      blocked: false,
      isBlocked: false,
      isCounter: false,
      isCritical: false,
      isGrab: false,
      isProjectile: true,
      causedKnockdown: causesKnockdown,
      isSuperMove: false,
      isSuperShot: true,
      hitRegion,
      contactPoint3D: contactPoint,
      contactX2D,
      contactY2D,
      hitX: contactX2D,
      hitY: contactY2D,
      hitZ: contactPoint.z,
      comboCount: attacker.comboCount,
      dialogueLine: attacker.def.dialogues.superShotQuote,
    };
  }
}
