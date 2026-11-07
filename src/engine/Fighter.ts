import { AttackType, CharacterDef, FighterStateName } from '../types/fighter';
import { BufferedInput, ComboDefinition, ComboInputCommand, ComboSystem } from './ComboSystem';

export class Fighter {
  public character: CharacterDef;
  public x: number;
  public y: number;
  public groundY: number;
  public vx: number = 0;
  public vy: number = 0;
  public facing: 1 | -1 = 1;
  public state: FighterStateName = 'idle';
  public frameInState: number = 0;

  public health: number;
  public meter: number = 0; // 0 to 100
  public hitStun: number = 0;
  public blockStun: number = 0;
  public knockdownTimer: number = 0;

  public currentAttack: AttackType | null = null;
  public hasHitConnected: boolean = false;
  public hitsConnectedCount: number = 0;
  public chainLength: number = 0;
  public lastMatchedCombo: ComboDefinition | null = null;
  public inputHistory: BufferedInput[] = [];
  public queuedAttack: { attackType: AttackType; frame: number } | null = null;

  public isPlayer: boolean;
  public isHoldingBlock: boolean = false;
  public isHoldingBack: boolean = false;
  public isHoldingCrouch: boolean = false;

  public static GRAVITY = 0.85;
  public static RECOVERY_FRAMES = 18;
  public static STAGE_MARGIN = 45;

  constructor(
    character: CharacterDef,
    initialX: number,
    initialY: number,
    facing: 1 | -1,
    isPlayer: boolean = true
  ) {
    this.character = character;
    this.x = initialX;
    this.y = initialY;
    this.groundY = initialY;
    this.facing = facing;
    this.health = character.stats.maxHealth;
    this.isPlayer = isPlayer;
  }

  /**
   * Reset fighter for a new round (preserves up to 50 meter by default)
   */
  public reset(
    spawnX: number,
    spawnY: number,
    spawnFacing: 1 | -1,
    fullMeterReset: boolean = false
  ): void {
    this.x = spawnX;
    this.y = spawnY;
    this.groundY = spawnY;
    this.vx = 0;
    this.vy = 0;
    this.facing = spawnFacing;
    this.state = 'idle';
    this.frameInState = 0;
    this.health = this.character.stats.maxHealth;
    this.meter = fullMeterReset ? 0 : Math.min(this.meter, 50);
    this.hitStun = 0;
    this.blockStun = 0;
    this.knockdownTimer = 0;
    this.currentAttack = null;
    this.hasHitConnected = false;
    this.hitsConnectedCount = 0;
    this.chainLength = 0;
    this.lastMatchedCombo = null;
    this.inputHistory = [];
    this.queuedAttack = null;
    this.isHoldingBlock = false;
    this.isHoldingBack = false;
    this.isHoldingCrouch = false;
  }

  /**
   * Check whether the fighter can freely move, block, or start a new action
   */
  public canAct(): boolean {
    if (this.hitStun > 0 || this.blockStun > 0 || this.knockdownTimer > 0) {
      return false;
    }
    return (
      this.state === 'idle' ||
      this.state === 'walk_forward' ||
      this.state === 'walk_backward' ||
      this.state === 'crouch' ||
      this.state === 'block' ||
      this.state === 'crouch_block'
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
      this.state === 'super'
    );
  }

  public isBlocking(): boolean {
    return this.state === 'block' || this.state === 'crouch_block';
  }

  public isAirborne(groundY: number = this.groundY): boolean {
    return this.y < groundY || this.vy < 0;
  }

  public isKnockedDown(): boolean {
    return this.state === 'knockdown' || this.state === 'recovery';
  }

  public isInvulnerable(): boolean {
    return (
      (this.state === 'knockdown' && this.y >= this.groundY) ||
      this.state === 'recovery' ||
      this.state === 'victory' ||
      this.state === 'defeat'
    );
  }

  /**
   * Check if current frame of active attack is within active hitbox window
   */
  public isAttackActive(): boolean {
    if (!this.isAttacking() || !this.currentAttack) return false;
    const move = this.character.moves[this.currentAttack];
    const frame = this.frameInState;
    return frame >= move.startupFrames && frame < move.startupFrames + move.activeFrames;
  }

  /**
   * Transition to a new fighter state with guard validation
   */
  public changeState(
    newState: FighterStateName,
    attackType: AttackType | null = null
  ): void {
    // Prevent non-terminal states from overriding terminal match-end states
    if (
      (this.state === 'victory' || this.state === 'defeat') &&
      newState !== 'victory' &&
      newState !== 'defeat' &&
      newState !== 'idle'
    ) {
      return;
    }

    // Avoid resetting frame counter if already in the same continuous movement/guard state
    if (
      this.state === newState &&
      !this.isAttacking() &&
      newState !== 'hurt' &&
      newState !== 'knockdown' &&
      newState !== 'recovery'
    ) {
      // Ensure velocity stays synced for walking
      if (newState === 'walk_forward') {
        this.vx = this.character.stats.walkSpeed * this.facing;
      } else if (newState === 'walk_backward') {
        this.vx = -this.character.stats.walkSpeed * 0.75 * this.facing;
      } else if (newState !== 'jump') {
        this.vx = 0;
      }
      return;
    }

    this.state = newState;
    this.frameInState = 0;
    this.currentAttack = attackType;
    this.hasHitConnected = false;
    this.hitsConnectedCount = 0;

    if (!this.isAttacking()) {
      this.chainLength = 0;
      this.queuedAttack = null;
    }

    // Movement speeds for walking states
    if (newState === 'walk_forward') {
      this.vx = this.character.stats.walkSpeed * this.facing;
    } else if (newState === 'walk_backward') {
      this.vx = -this.character.stats.walkSpeed * 0.75 * this.facing;
    } else if (newState === 'jump') {
      // Keep existing horizontal momentum when jumping
    } else if (!this.isAttacking() && newState !== 'hurt' && newState !== 'knockdown') {
      this.vx = 0;
    }
  }

  /**
   * Initiate an attack or combo move
   */
  public executeAttack(attackType: AttackType, meterCost: number = 0, isChainCancel: boolean = false): boolean {
    if (meterCost > 0 && this.meter < meterCost) {
      return false;
    }

    if (meterCost > 0) {
      this.meter = Math.max(0, this.meter - meterCost);
    }

    const nextChainLength = isChainCancel ? this.chainLength + 1 : 1;
    if (!this.isAirborne(this.groundY)) {
      this.vx = 0;
    }

    this.state = attackType as FighterStateName;
    this.frameInState = 0;
    this.currentAttack = attackType;
    this.hasHitConnected = false;
    this.hitsConnectedCount = 0;
    this.chainLength = nextChainLength;
    this.queuedAttack = null;

    // Grounded lunge physics for heavy/super strikes
    if (!this.isAirborne(this.groundY)) {
      if (attackType === 'forward_punch') {
        this.vx = 3.0 * this.facing;
      } else if (attackType === 'forward_kick') {
        this.vx = 4.2 * this.facing;
      } else if (attackType === 'super') {
        this.vx = 5.5 * this.facing;
      }
    }

    return true;
  }

  /**
   * Process intent to attack with input buffering & combo cancellation
   */
  public triggerAttack(
    requestedAttack: AttackType,
    currentFrame: number,
    rawCommand?: ComboInputCommand
  ): boolean {
    const commandToRecord: ComboInputCommand = ComboSystem.normalizeCommand(
      rawCommand || requestedAttack
    );

    // Record into input history
    this.inputHistory.push({ command: commandToRecord, frame: currentFrame });
    if (this.inputHistory.length > 30) {
      this.inputHistory.shift();
    }

    // 1. Neutral / Actable State Execution
    if (this.canAct() || (this.state === 'jump' && !this.isAttacking())) {
      const { attackType, matchedCombo } = ComboSystem.resolveComboAttack(
        requestedAttack,
        this.inputHistory,
        currentFrame,
        1
      );
      const move = this.character.moves[attackType];
      if ((move.meterCost || 0) > this.meter) {
        return false;
      }
      this.lastMatchedCombo = matchedCombo;
      return this.executeAttack(attackType, move.meterCost || 0, false);
    }

    // 2. Active Attack Combo Cancel / Input Buffer Queue
    if (this.isAttacking() && this.currentAttack) {
      const currentMove = this.character.moves[this.currentAttack];
      const { attackType, matchedCombo } = ComboSystem.resolveComboAttack(
        requestedAttack,
        this.inputHistory,
        currentFrame,
        this.chainLength + 1
      );

      const canCancelNow = ComboSystem.canCancelIntoCombo(
        this.currentAttack,
        attackType,
        this.hasHitConnected,
        this.frameInState,
        currentMove.startupFrames,
        this.chainLength
      );

      if (canCancelNow) {
        const nextMove = this.character.moves[attackType];
        if ((nextMove.meterCost || 0) <= this.meter) {
          this.lastMatchedCombo = matchedCombo;
          return this.executeAttack(attackType, nextMove.meterCost || 0, true);
        }
      } else if (this.chainLength < ComboSystem.MAX_CHAIN_LENGTH || attackType === 'super') {
        // Buffer the input so if the current attack connects within the buffer window, it cancels on the first legal frame
        this.queuedAttack = { attackType, frame: currentFrame };
      }
    }

    return false;
  }

  /**
   * Main 60Hz physics and state tick
   */
  public update(groundY: number, stageWidth: number, opponentX: number, currentFrame?: number): void {
    this.groundY = groundY;
    this.frameInState++;

    // Face the opponent automatically when grounded, not attacking, not stunned, and not knocked down
    if (
      !this.isAirborne(groundY) &&
      !this.isAttacking() &&
      !this.isKnockedDown() &&
      this.hitStun === 0 &&
      this.blockStun === 0 &&
      this.state !== 'victory' &&
      this.state !== 'defeat'
    ) {
      if (Math.abs(opponentX - this.x) > 4) {
        this.facing = opponentX > this.x ? 1 : -1;
      }
    }

    // Apply gravity and vertical movement
    if (this.isAirborne(groundY)) {
      this.vy += Fighter.GRAVITY * this.character.stats.weight;
      this.y += this.vy;
      this.x += this.vx;

      // Check ground landing
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.vx = 0;

        if (this.state === 'knockdown') {
          // Remain in knockdown until knockdownTimer completes
        } else if (this.state === 'hurt') {
          if (this.hitStun <= 0) {
            this.changeState('idle');
          }
        } else if (this.state === 'jump' || this.isAttacking()) {
          // Landing cancels aerial jump or aerial attack recovery into grounded stance
          if (this.isHoldingCrouch) {
            this.changeState(this.isHoldingBlock || this.isHoldingBack ? 'crouch_block' : 'crouch');
          } else {
            this.changeState(this.isHoldingBlock ? 'block' : 'idle');
          }
        }
      }
    } else {
      this.y = groundY;
      this.x += this.vx;

      // Friction for grounded slide/knockback/lunge
      if (this.state !== 'walk_forward' && this.state !== 'walk_backward') {
        this.vx *= 0.82;
        if (Math.abs(this.vx) < 0.2) this.vx = 0;
      }
    }

    // Stage boundary clamping (fighters cannot leave arena bounds)
    const margin = Fighter.STAGE_MARGIN;
    if (this.x < margin) {
      this.x = margin;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > stageWidth - margin) {
      this.x = stageWidth - margin;
      if (this.vx > 0) this.vx = 0;
    }

    // Handle Hit Stun
    if (this.hitStun > 0) {
      this.hitStun--;
      if (this.hitStun === 0 && !this.isKnockedDown()) {
        if (this.isAirborne(groundY)) {
          this.changeState('jump');
        } else {
          this.changeState(this.isHoldingCrouch ? 'crouch' : 'idle');
        }
      }
      return;
    }

    // Handle Block Stun
    if (this.blockStun > 0) {
      this.blockStun--;
      if (this.blockStun === 0) {
        if (this.isHoldingCrouch) {
          this.changeState(this.isHoldingBlock || this.isHoldingBack ? 'crouch_block' : 'crouch');
        } else {
          this.changeState(this.isHoldingBlock ? 'block' : 'idle');
        }
      }
      return;
    }

    // Handle Knockdown and Recovery
    if (this.state === 'knockdown') {
      // Only decrement knockdown timer once fighter has landed on the stage floor
      if (!this.isAirborne(groundY)) {
        if (this.knockdownTimer > 0) {
          this.knockdownTimer--;
        } else if (this.health > 0) {
          this.changeState('recovery');
        }
      }
      return;
    }

    if (this.state === 'recovery') {
      if (this.frameInState >= Fighter.RECOVERY_FRAMES) {
        this.changeState(this.isHoldingCrouch ? 'crouch' : 'idle');
      }
      return;
    }

    // Handle Attack Animations, Buffered Cancels & Recovery
    if (this.isAttacking() && this.currentAttack) {
      const move = this.character.moves[this.currentAttack];

      // Check if a buffered attack input is waiting for the cancel window
      if (this.queuedAttack && this.hasHitConnected && this.frameInState >= move.startupFrames) {
        const frameAge = currentFrame !== undefined ? currentFrame - this.queuedAttack.frame : 0;
        if (frameAge <= ComboSystem.CANCEL_QUEUE_WINDOW_FRAMES) {
          const nextAtk = this.queuedAttack.attackType;
          if (
            ComboSystem.canCancelIntoCombo(
              this.currentAttack,
              nextAtk,
              this.hasHitConnected,
              this.frameInState,
              move.startupFrames,
              this.chainLength
            )
          ) {
            const nextMove = this.character.moves[nextAtk];
            if ((nextMove.meterCost || 0) <= this.meter) {
              this.executeAttack(nextAtk, nextMove.meterCost || 0, true);
              return;
            }
          }
        }
      }

      const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;
      if (this.frameInState >= totalFrames) {
        this.changeState(this.isHoldingCrouch ? 'crouch' : 'idle');
      }
      return;
    }
  }

  /**
   * Apply hit damage and reaction to fighter.
   * Note: If applyDefense is false, finalDamage has already been adjusted by CombatSystem.
   */
  public takeHit(
    damageAmount: number,
    hitStun: number,
    knockbackX: number,
    knockbackY: number,
    causesKnockdown: boolean,
    meterGain: number,
    attackerFacing: 1 | -1,
    applyDefense: boolean = false
  ): number {
    const finalDamage = applyDefense
      ? Math.max(1, Math.round(damageAmount / this.character.stats.defenseMultiplier))
      : Math.max(1, Math.round(damageAmount));

    this.health = Math.max(0, this.health - finalDamage);
    this.meter = Math.min(100, this.meter + meterGain);
    this.hitStun = 0;
    this.blockStun = 0;
    this.queuedAttack = null;

    if (this.health <= 0) {
      this.changeState('knockdown');
      this.knockdownTimer = 9999;
      this.vx = knockbackX * attackerFacing * 1.3;
      this.vy = -7;
      return finalDamage;
    }

    if (causesKnockdown || this.isAirborne(this.groundY)) {
      this.changeState('knockdown');
      this.knockdownTimer = 35; // Frames lying down on ground
      this.vx = knockbackX * attackerFacing;
      this.vy = knockbackY < 0 ? knockbackY : -4;
    } else {
      this.changeState('hurt');
      this.hitStun = hitStun;
      this.vx = knockbackX * attackerFacing;
      this.vy = knockbackY;
    }

    return finalDamage;
  }

  /**
   * Apply blocked attack reaction
   */
  public takeBlock(
    chipDamage: number,
    blockStun: number,
    pushbackX: number,
    meterGain: number,
    attackerFacing: 1 | -1,
    isLow: boolean
  ): number {
    const actualChip = Math.max(0, Math.min(this.health - 1, Math.round(chipDamage)));
    this.health = Math.max(1, this.health - actualChip); // Chip cannot finish round
    this.meter = Math.min(100, this.meter + meterGain);
    this.hitStun = 0;
    this.blockStun = blockStun;
    this.changeState(isLow || this.isHoldingCrouch ? 'crouch_block' : 'block');
    this.vx = pushbackX * attackerFacing;
    return actualChip;
  }
}
