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

  private static COMBO_RESET_WINDOW = 35; // Frames before combo counter resets if no new hit connects
  private static MIN_SEPARATION = 55; // Pixels between fighters on ground

  /**
   * Main 60Hz collision and interaction tick between two fighters
   */
  public update(p1: Fighter, p2: Fighter, groundY: number): CombatFeedback {
    const feedback: CombatFeedback = {
      hitstopFrames: 0,
      shakeIntensity: 0,
      events: [],
    };

    // Update combo decay timers
    if (this.comboTimerP1 > 0) {
      this.comboTimerP1--;
      if (this.comboTimerP1 === 0) this.comboP1 = 0;
    }
    if (this.comboTimerP2 > 0) {
      this.comboTimerP2--;
      if (this.comboTimerP2 === 0) this.comboP2 = 0;
    }

    // Enforce mutual body collision / push separation
    this.enforceFighterSeparation(p1, p2, groundY);

    // Process P1 attacking P2
    if (p1.isAttackActive() && !p1.hasHitConnected && p1.currentAttack) {
      const hitEvent = this.evaluateAttack(p1, p2, p1.currentAttack);
      if (hitEvent) {
        feedback.events.push(hitEvent);
        if (hitEvent.isBlocked) {
          feedback.shakeIntensity = Math.max(feedback.shakeIntensity, 2);
          feedback.hitstopFrames = Math.max(feedback.hitstopFrames, 2);
        } else {
          this.comboP1++;
          this.comboTimerP1 = CombatSystem.COMBO_RESET_WINDOW;
          const isHeavy = hitEvent.attackType === 'super' || hitEvent.attackType === 'forward_punch';
          feedback.shakeIntensity = isHeavy ? 9 : 4;
          feedback.hitstopFrames = isHeavy ? 6 : 3;
        }
      }
    }

    // Process P2 attacking P1
    if (p2.isAttackActive() && !p2.hasHitConnected && p2.currentAttack) {
      const hitEvent = this.evaluateAttack(p2, p1, p2.currentAttack);
      if (hitEvent) {
        feedback.events.push(hitEvent);
        if (hitEvent.isBlocked) {
          feedback.shakeIntensity = Math.max(feedback.shakeIntensity, 2);
          feedback.hitstopFrames = Math.max(feedback.hitstopFrames, 2);
        } else {
          this.comboP2++;
          this.comboTimerP2 = CombatSystem.COMBO_RESET_WINDOW;
          const isHeavy = hitEvent.attackType === 'super' || hitEvent.attackType === 'forward_punch';
          feedback.shakeIntensity = isHeavy ? 9 : 4;
          feedback.hitstopFrames = isHeavy ? 6 : 3;
        }
      }
    }

    return feedback;
  }

  /**
   * Keep fighters separated so they don't walk inside one another unless knocked down
   */
  private enforceFighterSeparation(p1: Fighter, p2: Fighter, groundY: number): void {
    if (p1.isKnockedDown() || p2.isKnockedDown()) return;

    // Only separate if both are close to ground level
    const distY = Math.abs(p1.y - p2.y);
    if (distY > 60) return;

    const dx = p2.x - p1.x;
    const distance = Math.abs(dx);

    if (distance < CombatSystem.MIN_SEPARATION) {
      const overlap = CombatSystem.MIN_SEPARATION - distance;
      const pushDirection = dx >= 0 ? 1 : -1;

      p1.x -= (overlap / 2) * pushDirection;
      p2.x += (overlap / 2) * pushDirection;
    }
  }

  /**
   * Evaluate if an attack connects with defender hurtbox
   */
  public evaluateAttack(attacker: Fighter, defender: Fighter, attackType: AttackType): CombatHitEvent | null {
    // Cannot hit an already invincible or knocked down grounded defender (unless juggle)
    if (defender.state === 'knockdown' && defender.y >= 580) {
      return null;
    }
    if (defender.state === 'recovery') {
      return null;
    }

    const move = attacker.character.moves[attackType];
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

    // Check if attack is a grab (grabs ignore regular standing block)
    if (attackType === 'grab') {
      const damage = Math.round(move.damage * attacker.character.stats.powerMultiplier);
      defender.takeHit(
        damage,
        move.hitStunFrames,
        move.knockbackX,
        move.knockbackY,
        true,
        move.meterGainOnHit,
        attacker.facing
      );
      attacker.meter = Math.min(100, attacker.meter + move.meterGainOnHit);

      return {
        attackerId: attacker.character.id,
        defenderId: defender.character.id,
        damage,
        isBlocked: false,
        isCounter: false,
        isCritical: false,
        isGrab: true,
        hitX: (attackBox.x + attackBox.w / 2),
        hitY: (attackBox.y + attackBox.h / 2),
        attackType,
        comboCount: 1,
      };
    }

    // Check Blocking
    // Defender must be holding away from attacker to block
    const isHoldingAway = defender.facing === 1 ? defender.vx < 0 : defender.vx > 0;
    const canBlock = defender.isHoldingBlock || isHoldingAway;

    let isBlocked = false;
    if (canBlock && defender.canAct()) {
      if (move.isLow) {
        // Low attacks must be crouch blocked
        if (defender.state === 'crouch' || defender.state === 'crouch_block' || defender.isHoldingCrouch) {
          isBlocked = true;
        }
      } else {
        // High or mid attacks blocked by standing or crouch block
        isBlocked = true;
      }
    }

    if (isBlocked) {
      const chipDamage = Math.max(2, Math.round(move.damage * 0.12));
      defender.takeBlock(
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
        damage: chipDamage,
        isBlocked: true,
        isCounter: false,
        isCritical: false,
        isGrab: false,
        hitX: (attackBox.x + attackBox.w / 2),
        hitY: (attackBox.y + attackBox.h / 2),
        attackType,
        comboCount: 0,
      };
    }

    // Direct Hit!
    // Check Counter Hit (defender in startup frames of an attack)
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

    const calculatedDamage = Math.round(
      move.damage * attacker.character.stats.powerMultiplier * counterBonus * comboScaling
    );

    defender.takeHit(
      calculatedDamage,
      move.hitStunFrames,
      move.knockbackX,
      move.knockbackY,
      !!move.causesKnockdown,
      move.meterGainOnHit,
      attacker.facing
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
      hitX: (attackBox.x + attackBox.w / 2),
      hitY: (attackBox.y + attackBox.h / 2),
      attackType,
      comboCount: currentCombo,
    };
  }

  public resetCombos(): void {
    this.comboP1 = 0;
    this.comboP2 = 0;
    this.comboTimerP1 = 0;
    this.comboTimerP2 = 0;
  }
}
