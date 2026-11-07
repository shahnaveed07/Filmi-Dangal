import { AttackType, Difficulty } from '../types/fighter';
import { ComboInputCommand } from './ComboSystem';
import { Fighter } from './Fighter';

export class CPUController {
  public difficulty: Difficulty;
  public rng: () => number;
  private decisionTimer: number = 0;
  public pendingCombo: ComboInputCommand[] = [];
  private isBlockingIntent: boolean = false;
  private reactionTimer: number = 0;

  constructor(difficulty: Difficulty = 'normal', rng: () => number = Math.random) {
    this.difficulty = difficulty;
    this.rng = rng;
  }

  public setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.reset();
  }

  public reset(): void {
    this.decisionTimer = 0;
    this.pendingCombo = [];
    this.isBlockingIntent = false;
    this.reactionTimer = 0;
  }

  /**
   * Main 60Hz update for the CPU AI
   */
  public update(cpu: Fighter, player: Fighter, currentFrame: number, groundY: number): void {
    // 0. If stunned, knocked down, or in terminal state, clear pending combos and abort
    if (
      cpu.hitStun > 0 ||
      cpu.blockStun > 0 ||
      cpu.isKnockedDown() ||
      cpu.state === 'victory' ||
      cpu.state === 'defeat'
    ) {
      this.pendingCombo = [];
      this.isBlockingIntent = false;
      cpu.isHoldingBlock = false;
      cpu.isHoldingBack = false;
      cpu.isHoldingCrouch = false;
      return;
    }

    // 1. Active Combo Chain Execution during Cancel Window
    if (this.pendingCombo.length > 0 && cpu.isAttacking() && cpu.currentAttack) {
      const move = cpu.character.moves[cpu.currentAttack];
      // Wait until active frames have started
      if (cpu.frameInState >= move.startupFrames) {
        if (cpu.hasHitConnected) {
          const nextCmd = this.pendingCombo[0];
          const requestedAttack: AttackType =
            nextCmd === 'down_kick' ? 'sweep' : (nextCmd as AttackType);
          const triggered = cpu.triggerAttack(requestedAttack, currentFrame, nextCmd);
          if (triggered) {
            this.pendingCombo.shift();
          }
        } else if (cpu.frameInState >= move.startupFrames + move.activeFrames) {
          // Attack whiffed or was blocked; abort follow-up combo string
          this.pendingCombo = [];
        }
      }
      return;
    }

    // If still mid-attack or airborne without a pending cancel, wait until actionable
    if (!cpu.canAct()) {
      return;
    }

    const distance = Math.abs(cpu.x - player.x);
    const playerAttacking = player.isAttacking();

    // 2. Reactive Defense (Human-like reaction delay, no unfair instant input-reading)
    if (playerAttacking && distance < 170 && !this.isBlockingIntent && this.reactionTimer === 0) {
      const reactionDelay =
        this.difficulty === 'easy' ? 18 : this.difficulty === 'normal' ? 10 : 4;
      const blockChance =
        this.difficulty === 'easy' ? 0.35 : this.difficulty === 'normal' ? 0.70 : 0.90;

      if (this.rng() < blockChance) {
        this.reactionTimer = reactionDelay;
      } else {
        this.reactionTimer = -1; // Failed reaction roll for this attack
      }
    }

    if (!playerAttacking) {
      this.reactionTimer = 0;
      if (this.isBlockingIntent) {
        this.isBlockingIntent = false;
        cpu.isHoldingBlock = false;
        cpu.isHoldingBack = false;
        cpu.isHoldingCrouch = false;
      }
    } else if (this.reactionTimer > 0) {
      this.reactionTimer--;
      if (this.reactionTimer === 0) {
        this.isBlockingIntent = true;
      }
    }

    if (this.isBlockingIntent && playerAttacking) {
      cpu.isHoldingBlock = true;
      cpu.isHoldingBack = true;
      // Match low sweep attacks on Hard/Normal
      const shouldBlockLow =
        player.state === 'sweep' &&
        (this.difficulty === 'hard' || (this.difficulty === 'normal' && this.rng() < 0.65));

      if (shouldBlockLow) {
        cpu.isHoldingCrouch = true;
        cpu.changeState('crouch_block');
      } else {
        cpu.isHoldingCrouch = false;
        cpu.changeState('block');
      }
      return;
    }

    cpu.isHoldingBlock = false;
    cpu.isHoldingBack = false;
    cpu.isHoldingCrouch = false;

    // 3. Recovery Punishment / Counter Opportunity (Hard & Normal)
    if (
      this.difficulty !== 'easy' &&
      distance < 105 &&
      player.isAttacking() &&
      player.currentAttack
    ) {
      const pMove = player.character.moves[player.currentAttack];
      const inRecovery = player.frameInState >= pMove.startupFrames + pMove.activeFrames;
      if (inRecovery) {
        const punishChance = this.difficulty === 'hard' ? 0.85 : 0.50;
        if (this.rng() < punishChance) {
          this.initiateCloseAttackOrCombo(cpu, currentFrame);
          return;
        }
      }
    }

    // 4. Strategic Decision Cycle
    if (this.decisionTimer > 0) {
      this.decisionTimer--;
      return;
    }

    const baseInterval =
      this.difficulty === 'easy' ? 24 : this.difficulty === 'normal' ? 12 : 6;
    this.decisionTimer = baseInterval + Math.floor(this.rng() * 6);

    // 5. Super Attack Opportunity (when meter is 100 and within range)
    if (cpu.meter >= 100 && distance < 165 && !player.isInvulnerable()) {
      const superChance =
        this.difficulty === 'easy' ? 0.40 : this.difficulty === 'normal' ? 0.75 : 0.92;
      if (this.rng() < superChance) {
        if (cpu.triggerAttack('super', currentFrame, 'super')) {
          return;
        }
      }
    }

    // 6. Anti-Air Response (when player is jumping in close)
    if (player.isAirborne(groundY) && distance < 120) {
      const antiAirChance =
        this.difficulty === 'easy' ? 0.25 : this.difficulty === 'normal' ? 0.65 : 0.88;
      if (this.rng() < antiAirChance) {
        cpu.triggerAttack('forward_punch', currentFrame, 'forward_punch');
        return;
      }
    }

    // 7. Distance-Based Spacing & Offence
    if (distance > 220) {
      // Far range: approach or jump in
      const roll = this.rng();
      if (roll < 0.72) {
        cpu.changeState('walk_forward');
      } else if (roll < 0.88) {
        cpu.changeState('jump');
        cpu.vy = cpu.character.stats.jumpVelocity;
        cpu.vx = cpu.character.stats.walkSpeed * cpu.facing * 0.9;
      } else {
        cpu.changeState('idle');
      }
    } else if (distance >= 80 && distance <= 220) {
      // Mid range: spacing, pokes, and footsies
      const roll = this.rng();
      if (roll < 0.38) {
        cpu.changeState('walk_forward');
      } else if (roll < 0.58) {
        cpu.triggerAttack('forward_punch', currentFrame, 'forward_punch');
      } else if (roll < 0.78) {
        cpu.triggerAttack('forward_kick', currentFrame, 'forward_kick');
      } else if (roll < 0.90) {
        cpu.changeState('walk_backward');
      } else {
        cpu.changeState('idle');
      }
    } else {
      // Close range (< 80px): combos, sweeps, grabs, or tactical retreat
      this.initiateCloseAttackOrCombo(cpu, currentFrame, player.isBlocking());
    }
  }

  private initiateCloseAttackOrCombo(
    cpu: Fighter,
    currentFrame: number,
    opponentIsBlocking: boolean = false
  ): void {
    // If opponent is turtling/blocking at close range, prioritize Grab or Low Sweep
    if (opponentIsBlocking && this.difficulty !== 'easy') {
      const mixupRoll = this.rng();
      if (mixupRoll < 0.55) {
        cpu.triggerAttack('grab', currentFrame, 'grab');
        return;
      } else if (mixupRoll < 0.85) {
        cpu.triggerAttack('sweep', currentFrame, 'sweep');
        return;
      }
    }

    const roll = this.rng();
    if (roll < 0.42) {
      const started = cpu.triggerAttack('punch', currentFrame, 'punch');
      if (started && this.difficulty !== 'easy') {
        const comboRoll = this.rng();
        if (comboRoll < 0.40) {
          this.pendingCombo = ['punch', 'kick']; // J-J-K
        } else if (comboRoll < 0.75) {
          this.pendingCombo = ['kick', 'kick']; // J-K-K
        } else {
          this.pendingCombo = ['punch', 'punch']; // J-J-J
        }
      }
    } else if (roll < 0.62) {
      cpu.triggerAttack('kick', currentFrame, 'kick');
    } else if (roll < 0.78) {
      cpu.triggerAttack('sweep', currentFrame, 'sweep');
    } else if (roll < 0.92) {
      cpu.triggerAttack('grab', currentFrame, 'grab');
    } else {
      cpu.changeState('walk_backward');
    }
  }
}
