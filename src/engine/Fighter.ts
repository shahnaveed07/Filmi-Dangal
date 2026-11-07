import { AttackType, CharacterDef, FighterStateName } from '../types/fighter';
import { BufferedInput, ComboSystem } from './ComboSystem';

export class Fighter {
  public character: CharacterDef;
  public x: number;
  public y: number;
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
  public inputHistory: BufferedInput[] = [];

  public isPlayer: boolean;
  public isHoldingBlock: boolean = false;
  public isHoldingCrouch: boolean = false;

  private static GRAVITY = 0.85;

  constructor(character: CharacterDef, initialX: number, initialY: number, facing: 1 | -1, isPlayer: boolean = true) {
    this.character = character;
    this.x = initialX;
    this.y = initialY;
    this.facing = facing;
    this.health = character.stats.maxHealth;
    this.isPlayer = isPlayer;
  }

  public reset(spawnX: number, spawnY: number, spawnFacing: 1 | -1): void {
    this.x = spawnX;
    this.y = spawnY;
    this.vx = 0;
    this.vy = 0;
    this.facing = spawnFacing;
    this.state = 'idle';
    this.frameInState = 0;
    this.health = this.character.stats.maxHealth;
    this.meter = Math.min(this.meter, 50); // Preserve up to 50 meter across rounds
    this.hitStun = 0;
    this.blockStun = 0;
    this.knockdownTimer = 0;
    this.currentAttack = null;
    this.hasHitConnected = false;
    this.inputHistory = [];
    this.isHoldingBlock = false;
    this.isHoldingCrouch = false;
  }

  public canAct(): boolean {
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

  public isAirborne(groundY: number): boolean {
    return this.y < groundY || this.vy < 0;
  }

  public isKnockedDown(): boolean {
    return this.state === 'knockdown' || this.state === 'recovery';
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
   * Transition to a new fighter state
   */
  public changeState(newState: FighterStateName, attackType: AttackType | null = null): void {
    this.state = newState;
    this.frameInState = 0;
    this.currentAttack = attackType;
    this.hasHitConnected = false;

    // Movement speeds for walking states
    if (newState === 'walk_forward') {
      this.vx = this.character.stats.walkSpeed * this.facing;
    } else if (newState === 'walk_backward') {
      this.vx = -this.character.stats.walkSpeed * 0.75 * this.facing;
    } else if (newState === 'jump') {
      // Keep existing horizontal momentum when jumping
    } else if (!this.isAttacking()) {
      this.vx = 0;
    }
  }

  /**
   * Initiate an attack or combo move
   */
  public executeAttack(attackType: AttackType, meterCost: number = 0): boolean {
    if (meterCost > 0 && this.meter < meterCost) {
      return false;
    }

    if (meterCost > 0) {
      this.meter = Math.max(0, this.meter - meterCost);
    }

    this.vx = 0;
    this.changeState(attackType as FighterStateName, attackType);

    // Some attacks have forward lunging physics
    if (attackType === 'forward_punch') {
      this.vx = 3.0 * this.facing;
    } else if (attackType === 'forward_kick') {
      this.vx = 4.2 * this.facing;
    } else if (attackType === 'super') {
      this.vx = 5.5 * this.facing;
    }

    return true;
  }

  /**
   * Process intent to attack with input buffering & combo cancellation
   */
  public triggerAttack(attackType: AttackType, currentFrame: number): boolean {
    // Record into input history
    this.inputHistory.push({ command: attackType, frame: currentFrame });
    if (this.inputHistory.length > 30) this.inputHistory.shift();

    if (this.canAct()) {
      const move = this.character.moves[attackType];
      return this.executeAttack(attackType, move.meterCost || 0);
    }

    // Check combo cancel
    if (this.isAttacking() && this.currentAttack) {
      const currentMove = this.character.moves[this.currentAttack];
      const canCancel = ComboSystem.canCancelIntoCombo(
        this.currentAttack,
        attackType,
        this.hasHitConnected,
        this.frameInState,
        currentMove.startupFrames
      );

      if (canCancel) {
        const nextMove = this.character.moves[attackType];
        return this.executeAttack(attackType, nextMove.meterCost || 0);
      }
    }

    return false;
  }

  /**
   * Main 60Hz physics and state tick
   */
  public update(groundY: number, stageWidth: number, opponentX: number): void {
    this.frameInState++;

    // Face the opponent automatically when grounded and not mid-attack
    if (!this.isAirborne(groundY) && !this.isAttacking() && !this.isKnockedDown() && this.hitStun === 0) {
      this.facing = opponentX > this.x ? 1 : -1;
    }

    // Apply gravity
    if (this.isAirborne(groundY)) {
      this.vy += Fighter.GRAVITY * this.character.stats.weight;
      this.y += this.vy;
      this.x += this.vx;

      // Check ground landing
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.vx = 0;
        if (this.state === 'jump') {
          this.changeState('idle');
        }
      }
    } else {
      this.y = groundY;
      this.x += this.vx;

      // Friction for grounded slide/knockback
      if (this.state !== 'walk_forward' && this.state !== 'walk_backward') {
        this.vx *= 0.82;
        if (Math.abs(this.vx) < 0.2) this.vx = 0;
      }
    }

    // Stage boundary clamping (fighters cannot leave arena bounds)
    const margin = 45;
    if (this.x < margin) {
      this.x = margin;
      this.vx = 0;
    } else if (this.x > stageWidth - margin) {
      this.x = stageWidth - margin;
      this.vx = 0;
    }

    // Handle Hit Stun
    if (this.hitStun > 0) {
      this.hitStun--;
      if (this.hitStun === 0 && !this.isKnockedDown()) {
        this.changeState('idle');
      }
      return;
    }

    // Handle Block Stun
    if (this.blockStun > 0) {
      this.blockStun--;
      if (this.blockStun === 0) {
        this.changeState(this.isHoldingCrouch ? 'crouch' : 'idle');
      }
      return;
    }

    // Handle Knockdown and Recovery
    if (this.state === 'knockdown') {
      if (this.knockdownTimer > 0) {
        this.knockdownTimer--;
      } else {
        this.changeState('recovery');
      }
      return;
    }

    if (this.state === 'recovery') {
      if (this.frameInState >= 18) {
        this.changeState('idle');
      }
      return;
    }

    // Handle Attack Animations & Recovery
    if (this.isAttacking() && this.currentAttack) {
      const move = this.character.moves[this.currentAttack];
      const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;

      if (this.frameInState >= totalFrames) {
        this.changeState(this.isHoldingCrouch ? 'crouch' : 'idle');
      }
      return;
    }
  }

  /**
   * Apply hit damage and reaction to fighter
   */
  public takeHit(
    rawDamage: number,
    hitStun: number,
    knockbackX: number,
    knockbackY: number,
    causesKnockdown: boolean,
    meterGain: number,
    attackerFacing: 1 | -1
  ): void {
    const defense = this.character.stats.defenseMultiplier;
    const finalDamage = Math.round(rawDamage / defense);

    this.health = Math.max(0, this.health - finalDamage);
    this.meter = Math.min(100, this.meter + meterGain);

    if (this.health <= 0) {
      this.changeState('knockdown');
      this.knockdownTimer = 9999;
      this.vx = knockbackX * attackerFacing * 1.3;
      this.vy = -7;
      return;
    }

    if (causesKnockdown || this.isAirborne(580)) {
      this.changeState('knockdown');
      this.knockdownTimer = 35; // Frames lying down
      this.vx = knockbackX * attackerFacing;
      this.vy = knockbackY < 0 ? knockbackY : -4;
    } else {
      this.changeState('hurt');
      this.hitStun = hitStun;
      this.vx = knockbackX * attackerFacing;
      this.vy = knockbackY;
    }
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
  ): void {
    this.health = Math.max(1, this.health - chipDamage); // Chip cannot finish round
    this.meter = Math.min(100, this.meter + meterGain);
    this.blockStun = blockStun;
    this.changeState(isLow ? 'crouch_block' : 'block');
    this.vx = pushbackX * attackerFacing;
  }
}
