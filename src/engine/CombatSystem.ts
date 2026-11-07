import { AttackType, CombatHitEvent } from '../types/fighter';
import { ComboSystem } from './ComboSystem';
import { Fighter } from './Fighter';
import { HitboxSystem } from './HitboxSystem';

export interface CombatFeedback {
  hitstopFrames: number;
  shakeIntensity: number;
  events: CombatHitEvent[];
}

export class CombatSystem {
  public comboP1: number = 0;
  public comboP2: number = 0;
  public comboTimerP1: number = 0;
  public comboTimerP2: number = 0;

  public static COMBO_RESET_WINDOW = 40; // Frames before combo counter resets if no new hit connects
  public static MIN_SEPARATION = 55; // Pixels between fighters on ground

  /**
   * Main 60Hz collision and interaction tick between two fighters
   */
  public update(p1: Fighter, p2: Fighter, groundY: number): CombatFeedback {
    const feedback: CombatFeedback = {
      hitstopFrames: 0,
      shakeIntensity: 0,
      events: [],
    };

    // Update combo decay timers (pause decay while opponent is still in hitStun)
    if (this.comboTimerP1 > 0 && p2.hitStun === 0) {
      this.comboTimerP1--;
      if (this.comboTimerP1 === 0) this.comboP1 = 0;
    }
    if (this.comboTimerP2 > 0 && p1.hitStun === 0) {
      this.comboTimerP2--;
      if (this.comboTimerP2 === 0) this.comboP2 = 0;
    }

    // Enforce mutual body collision / push separation
    this.enforceFighterSeparation(p1, p2, groundY);

    // Process P1 attacking P2
    if (p1.isAttackActive() && p1.currentAttack) {
      const moveP1 = p1.character.moves[p1.currentAttack];
      const maxHitsP1 = moveP1.maxHits || 1;
      if (p1.hitsConnectedCount < maxHitsP1) {
        const hitEvent = this.evaluateAttack(p1, p2, p1.currentAttack, groundY);
        if (hitEvent) {
          feedback.events.push(hitEvent);
          if (hitEvent.isBlocked) {
            feedback.shakeIntensity = Math.max(feedback.shakeIntensity, 2);
            feedback.hitstopFrames = Math.max(feedback.hitstopFrames, 2);
          } else {
            this.comboP1 = hitEvent.comboCount;
            this.comboTimerP1 = CombatSystem.COMBO_RESET_WINDOW;
            const isHeavy =
              hitEvent.attackType === 'super' ||
              hitEvent.attackType === 'forward_punch' ||
              hitEvent.attackType === 'forward_kick' ||
              hitEvent.isGrab;
            feedback.shakeIntensity = Math.max(feedback.shakeIntensity, isHeavy ? 9 : 4);
            feedback.hitstopFrames = Math.max(feedback.hitstopFrames, isHeavy ? 6 : 3);
          }
        }
      }
    }

    // Process P2 attacking P1
    if (p2.isAttackActive() && p2.currentAttack) {
      const moveP2 = p2.character.moves[p2.currentAttack];
      const maxHitsP2 = moveP2.maxHits || 1;
      if (p2.hitsConnectedCount < maxHitsP2) {
        const hitEvent = this.evaluateAttack(p2, p1, p2.currentAttack, groundY);
        if (hitEvent) {
          feedback.events.push(hitEvent);
          if (hitEvent.isBlocked) {
            feedback.shakeIntensity = Math.max(feedback.shakeIntensity, 2);
            feedback.hitstopFrames = Math.max(feedback.hitstopFrames, 2);
          } else {
            this.comboP2 = hitEvent.comboCount;
            this.comboTimerP2 = CombatSystem.COMBO_RESET_WINDOW;
            const isHeavy =
              hitEvent.attackType === 'super' ||
              hitEvent.attackType === 'forward_punch' ||
              hitEvent.attackType === 'forward_kick' ||
              hitEvent.isGrab;
            feedback.shakeIntensity = Math.max(feedback.shakeIntensity, isHeavy ? 9 : 4);
            feedback.hitstopFrames = Math.max(feedback.hitstopFrames, isHeavy ? 6 : 3);
          }
        }
      }
    }

    return feedback;
  }

  /**
   * Keep fighters separated so they don't walk inside one another unless knocked down
   */
  public enforceFighterSeparation(p1: Fighter, p2: Fighter, groundY: number): void {
    if (p1.isKnockedDown() || p2.isKnockedDown()) return;

    // Only separate if both are close in vertical height
    const distY = Math.abs(p1.y - p2.y);
    if (distY > 65) return;

    const dx = p2.x - p1.x;
    const distance = Math.abs(dx);

    if (distance < CombatSystem.MIN_SEPARATION) {
      const overlap = CombatSystem.MIN_SEPARATION - distance;
      const pushDirection = dx >= 0 ? 1 : -1;

      p1.x = Math.max(Fighter.STAGE_MARGIN, p1.x - (overlap / 2) * pushDirection);
      p2.x = Math.min(1280 - Fighter.STAGE_MARGIN, p2.x + (overlap / 2) * pushDirection);
    }
  }

  /**
   * Determine if defender is holding block relative to attacker position
   */
  public static isDefenderBlockingDirection(defender: Fighter, attacker: Fighter): boolean {
    if (defender.isHoldingBlock || defender.isHoldingBack || defender.isBlocking()) {
      return true;
    }
    // Also detect holding away via velocity if moving away from attacker
    const attackerIsRight = attacker.x >= defender.x;
    if (attackerIsRight && defender.vx < -0.1) return true;
    if (!attackerIsRight && defender.vx > 0.1) return true;
    return false;
  }

  /**
   * Evaluate if an attack connects with defender hurtbox
   */
  public evaluateAttack(
    attacker: Fighter,
    defender: Fighter,
    attackType: AttackType,
    groundY: number = defender.groundY
  ): CombatHitEvent | null {
    // Prevent hitting an invulnerable defender (grounded knockdown, recovery, victory/defeat)
    if (defender.isInvulnerable()) {
      return null;
    }

    // Prevent attacks from connecting through wrong facing direction
    const isDefenderInFront =
      attacker.facing === 1 ? defender.x >= attacker.x - 24 : defender.x <= attacker.x + 24;
    if (!isDefenderInFront) {
      return null;
    }

    // Grabs cannot hit airborne targets
    if (attackType === 'grab' && defender.isAirborne(groundY)) {
      return null;
    }

    // Ground sweeps cannot hit targets high in the air
    if (attackType === 'sweep' && groundY - defender.y > 45) {
      return null;
    }

    const move = attacker.character.moves[attackType];
    const maxHits = move.maxHits || 1;
    if (attacker.hitsConnectedCount >= maxHits) {
      return null;
    }

    const attackBox = HitboxSystem.getAttackHitbox(
      attacker.x,
      attacker.y,
      attacker.facing,
      move.hitboxOffset
    );
    const hurtBox = HitboxSystem.getHurtbox(
      defender.x,
      defender.y,
      defender.state,
      defender.facing
    );

    if (!HitboxSystem.intersects(attackBox, hurtBox)) {
      return null;
    }

    // Hit confirmed!
    attacker.hasHitConnected = true;
    attacker.hitsConnectedCount++;

    // 1. Check if attack is a Grab (Grabs bypass standing & crouch block)
    if (attackType === 'grab') {
      const rawDamage = move.damage * attacker.character.stats.powerMultiplier;
      const finalDamage = Math.max(
        1,
        Math.round(rawDamage / defender.character.stats.defenseMultiplier)
      );

      defender.takeHit(
        finalDamage,
        move.hitStunFrames,
        move.knockbackX,
        move.knockbackY,
        true,
        move.meterGainOnHit,
        attacker.facing,
        false
      );
      attacker.meter = Math.min(100, attacker.meter + move.meterGainOnHit);

      return {
        attackerId: attacker.character.id,
        defenderId: defender.character.id,
        damage: finalDamage,
        isBlocked: false,
        isCounter: false,
        isCritical: false,
        isGrab: true,
        hitX: attackBox.x + attackBox.w / 2,
        hitY: attackBox.y + attackBox.h / 2,
        attackType,
        comboCount: 1,
      };
    }

    // 2. Check Blocking
    // Defender must be able to act (or already in block stun), grounded, and holding guard/back relative to attacker
    const canBlockState =
      !defender.isAirborne(groundY) &&
      !defender.isAttacking() &&
      !defender.isKnockedDown() &&
      defender.hitStun === 0;

    const holdingGuard = CombatSystem.isDefenderBlockingDirection(defender, attacker);

    let isBlocked = false;
    if (canBlockState && holdingGuard) {
      const isDefenderCrouching =
        defender.isHoldingCrouch ||
        defender.state === 'crouch' ||
        defender.state === 'crouch_block';

      const isOverheadAttack = !!move.isHigh || attacker.isAirborne(groundY);

      if (move.isLow) {
        // Low attacks (sweeps) MUST be crouch-blocked; standing guard does not block low sweeps
        isBlocked = isDefenderCrouching;
      } else if (isOverheadAttack) {
        // Aerial / overhead attacks MUST be standing-blocked; crouch guard does not block overheads
        isBlocked = !isDefenderCrouching;
      } else {
        // Mid/High attacks are blocked by either standing or crouching guard
        isBlocked = true;
      }
    }

    if (isBlocked) {
      const rawChip =
        (move.damage * 0.12 * attacker.character.stats.powerMultiplier) /
        defender.character.stats.defenseMultiplier;
      const chipDamage = Math.max(2, Math.round(rawChip));

      const actualChip = defender.takeBlock(
        chipDamage,
        move.blockStunFrames,
        move.knockbackX * 0.7,
        move.meterGainOnBlock,
        attacker.facing,
        !!move.isLow
      );
      attacker.meter = Math.min(100, attacker.meter + move.meterGainOnBlock);

      return {
        attackerId: attacker.character.id,
        defenderId: defender.character.id,
        damage: actualChip,
        isBlocked: true,
        isCounter: false,
        isCritical: false,
        isGrab: false,
        hitX: attackBox.x + attackBox.w / 2,
        hitY: attackBox.y + attackBox.h / 2,
        attackType,
        comboCount: 0,
      };
    }

    // 3. Direct Unblocked Hit!
    // Check Counter Hit (defender caught in startup frames of an attack)
    let isCounter = false;
    if (defender.isAttacking() && defender.currentAttack) {
      const defMove = defender.character.moves[defender.currentAttack];
      if (defender.frameInState < defMove.startupFrames) {
        isCounter = true;
      }
    }

    const currentCombo = attacker.isPlayer ? this.comboP1 + 1 : this.comboP2 + 1;
    const comboScaling = ComboSystem.getComboDamageMultiplier(currentCombo);
    const counterBonus = isCounter ? 1.2 : 1.0;

    // Apply powerMultiplier once and defenseMultiplier once
    const calculatedDamage = Math.max(
      1,
      Math.round(
        (move.damage *
          attacker.character.stats.powerMultiplier *
          counterBonus *
          comboScaling) /
          defender.character.stats.defenseMultiplier
      )
    );

    defender.takeHit(
      calculatedDamage,
      move.hitStunFrames,
      move.knockbackX,
      move.knockbackY,
      !!move.causesKnockdown,
      move.meterGainOnHit,
      attacker.facing,
      false
    );

    attacker.meter = Math.min(100, attacker.meter + move.meterGainOnHit);

    return {
      attackerId: attacker.character.id,
      defenderId: defender.character.id,
      damage: calculatedDamage,
      isBlocked: false,
      isCounter,
      isCritical: attackType === 'super',
      isGrab: false,
      hitX: attackBox.x + attackBox.w / 2,
      hitY: attackBox.y + attackBox.h / 2,
      attackType,
      comboCount: currentCombo,
      comboName: attacker.lastMatchedCombo?.name,
    };
  }

  public resetCombos(): void {
    this.comboP1 = 0;
    this.comboP2 = 0;
    this.comboTimerP1 = 0;
    this.comboTimerP2 = 0;
  }
}
