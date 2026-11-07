import { AttackType, Difficulty } from '../types/fighter';
import { Fighter } from './Fighter';

export class CPUController {
  public difficulty: Difficulty;
  private decisionTimer: number = 0;
  private pendingCombo: AttackType[] = [];
  private comboStepTimer: number = 0;
  private isBlockingIntent: boolean = false;
  private reactionTimer: number = 0;

  constructor(difficulty: Difficulty = 'normal') {
    this.difficulty = difficulty;
  }

  public setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.reset();
  }

  public reset(): void {
    this.decisionTimer = 0;
    this.pendingCombo = [];
    this.comboStepTimer = 0;
    this.isBlockingIntent = false;
    this.reactionTimer = 0;
  }

  /**
   * Main 60Hz update for the CPU AI
   */
  public update(cpu: Fighter, player: Fighter, currentFrame: number, groundY: number): void {
    if (!cpu.canAct()) {
      return;
    }

    const distance = Math.abs(cpu.x - player.x);
    const playerAttacking = player.isAttacking();

    // 1. Reactive Defense (Human-like reaction delay, no unfair instant input-reading)
    if (playerAttacking && !this.isBlockingIntent && this.reactionTimer === 0) {
      // Roll chance to react and defend
      const reactionDelay = this.difficulty === 'easy' ? 24 : this.difficulty === 'normal' ? 14 : 7;
      const blockChance = this.difficulty === 'easy' ? 0.35 : this.difficulty === 'normal' ? 0.70 : 0.90;

      if (Math.random() < blockChance) {
        this.reactionTimer = reactionDelay;
      }
    }

    if (this.reactionTimer > 0) {
      this.reactionTimer--;
      if (this.reactionTimer === 0 && playerAttacking) {
        this.isBlockingIntent = true;
      }
    }

    // Release block if player is no longer attacking
    if (!playerAttacking && this.isBlockingIntent) {
      this.isBlockingIntent = false;
      cpu.isHoldingBlock = false;
      cpu.isHoldingCrouch = false;
    }

    if (this.isBlockingIntent) {
      cpu.isHoldingBlock = true;
      // Match low sweep attacks if on Hard/Normal
      if ((this.difficulty === 'hard' || (this.difficulty === 'normal' && Math.random() < 0.6)) && player.state === 'sweep') {
        cpu.isHoldingCrouch = true;
        cpu.changeState('crouch_block');
      } else {
        cpu.isHoldingCrouch = false;
        cpu.changeState('block');
      }
      return;
    }

    cpu.isHoldingBlock = false;
    cpu.isHoldingCrouch = false;

    // 2. Combo Execution
    if (this.pendingCombo.length > 0) {
      this.comboStepTimer++;
      if (this.comboStepTimer >= 8) {
        const nextAttack = this.pendingCombo.shift()!;
        this.comboStepTimer = 0;
        cpu.triggerAttack(nextAttack, currentFrame);
      }
      return;
    }

    // 3. Strategic Decision Cycle
    this.decisionTimer--;
    if (this.decisionTimer > 0) {
      return;
    }

    // Reset decision timer based on difficulty
    const baseInterval = this.difficulty === 'easy' ? 26 : this.difficulty === 'normal' ? 14 : 8;
    this.decisionTimer = baseInterval + Math.floor(Math.random() * 8);

    // Super Attack Opportunity (when meter is 100)
    if (cpu.meter >= 100 && distance < 180) {
      const superChance = this.difficulty === 'easy' ? 0.4 : this.difficulty === 'normal' ? 0.75 : 0.92;
      if (Math.random() < superChance) {
        cpu.triggerAttack('super', currentFrame);
        return;
      }
    }

    // Anti-Air check: if player is jumping in close
    if (player.isAirborne(groundY) && distance < 110) {
      if (this.difficulty !== 'easy' && Math.random() < 0.65) {
        cpu.triggerAttack('forward_punch', currentFrame);
        return;
      }
    }

    // Distance-based Behaviors
    if (distance > 220) {
      // Far range: close the distance
      const roll = Math.random();
      if (roll < 0.70) {
        cpu.changeState('walk_forward');
      } else if (roll < 0.88) {
        // Jump forward
        cpu.changeState('jump');
        cpu.vy = cpu.character.stats.jumpVelocity;
        cpu.vx = cpu.character.stats.walkSpeed * cpu.facing * 0.9;
      } else {
        cpu.changeState('idle');
      }
    } else if (distance >= 75 && distance <= 220) {
      // Mid range: spacing and poke strikes
      const roll = Math.random();
      if (roll < 0.35) {
        cpu.changeState('walk_forward');
      } else if (roll < 0.55) {
        cpu.triggerAttack('forward_punch', currentFrame);
      } else if (roll < 0.75) {
        cpu.triggerAttack('forward_kick', currentFrame);
      } else if (roll < 0.88) {
        cpu.changeState('walk_backward');
      } else {
        cpu.changeState('idle');
      }
    } else {
      // Close range (< 75px): combos, jabs, sweeps, grabs
      const roll = Math.random();

      if (roll < 0.28) {
        // Light punch / initiate combo
        cpu.triggerAttack('punch', currentFrame);

        if (this.difficulty !== 'easy') {
          // Queue up combo follow-ups
          const comboChoice = Math.random();
          if (comboChoice < 0.45) {
            this.pendingCombo = ['punch', 'kick']; // J-J-K
          } else if (comboChoice < 0.80) {
            this.pendingCombo = ['kick', 'kick']; // J-K-K
          } else {
            this.pendingCombo = ['punch', 'punch']; // J-J-J
          }
        }
      } else if (roll < 0.50) {
        // Kick
        cpu.triggerAttack('kick', currentFrame);
      } else if (roll < 0.72) {
        // Low sweep
        cpu.triggerAttack('sweep', currentFrame);
      } else if (roll < 0.88) {
        // Grab / Throw
        cpu.triggerAttack('grab', currentFrame);
      } else {
        // Step back for spacing
        cpu.changeState('walk_backward');
      }
    }
  }
}
