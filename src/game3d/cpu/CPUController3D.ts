import { DifficultyLevel, InputFrame } from '../../types/fighter';
import { EMPTY_INPUT_FRAME } from '../../engine/InputManager';
import { Fighter3D } from '../combat/Fighter3D';
import { ActiveProjectile3D } from '../combat/Projectile3D';

interface DifficultyProfile3D {
  decisionIntervalFrames: number;
  aggression: number;
  blockChance: number;
  jumpEvadeChance: number;
  superMoveChance: number;
  superShotChance: number;
  comboFollowupChance: number;
  antiAirChance: number;
}

const PROFILES_3D: Record<DifficultyLevel, DifficultyProfile3D> = {
  easy: {
    decisionIntervalFrames: 18,
    aggression: 0.38,
    blockChance: 0.22,
    jumpEvadeChance: 0.2,
    superMoveChance: 0.35,
    superShotChance: 0.28,
    comboFollowupChance: 0.2,
    antiAirChance: 0.2,
  },
  normal: {
    decisionIntervalFrames: 10,
    aggression: 0.65,
    blockChance: 0.55,
    jumpEvadeChance: 0.5,
    superMoveChance: 0.75,
    superShotChance: 0.55,
    comboFollowupChance: 0.55,
    antiAirChance: 0.55,
  },
  hard: {
    decisionIntervalFrames: 5,
    aggression: 0.88,
    blockChance: 0.84,
    jumpEvadeChance: 0.8,
    superMoveChance: 0.95,
    superShotChance: 0.78,
    comboFollowupChance: 0.85,
    antiAirChance: 0.85,
  },
};

/**
 * 2D XY Plane CPU AI Controller for Filmi Dangal 2.0.
 * Operates strictly on the 2D XY plane (no Z-axis or sidestepping), managing horizontal
 * spacing, vertical jumps, crouch/block defense, melee combos, and guaranteed SuperShot
 * & SuperMove activations.
 */
export class CPUController3D {
  private difficulty: DifficultyLevel;
  private cooldownFrames = 0;
  private currentIntent: 'idle' | 'approach' | 'retreat' | 'block' | 'crouch' =
    'idle';
  private rngState = 987654321;

  constructor(difficulty: DifficultyLevel) {
    this.difficulty = difficulty;
  }

  public setDifficulty(difficulty: DifficultyLevel): void {
    this.difficulty = difficulty;
  }

  public reset(): void {
    this.cooldownFrames = 0;
    this.currentIntent = 'idle';
  }

  private random(): number {
    this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
    return this.rngState / 0xffffffff;
  }

  public computeInput(
    cpu: Fighter3D,
    player: Fighter3D,
    activeProjectiles: ActiveProjectile3D[] = []
  ): InputFrame {
    const frame: InputFrame = { ...EMPTY_INPUT_FRAME };
    const profile = PROFILES_3D[this.difficulty];

    const dx = player.position.x - cpu.position.x;
    const absDx = Math.abs(dx);
    const towardLeft = dx < 0;
    const towardRight = dx > 0;
    const awayLeft = !towardLeft;
    const awayRight = !towardRight;

    // 1. Combo cancel into SuperMove when meter is full on hit
    if (
      cpu.isAttacking() &&
      cpu.moveHasHit &&
      cpu.specialMeter >= 100 &&
      this.random() < profile.comboFollowupChance
    ) {
      frame.superMove = true;
      frame.superMoveJustPressed = true;
      frame.special = true;
      frame.specialJustPressed = true;
      return frame;
    }

    if (this.cooldownFrames > 0) {
      this.cooldownFrames -= 1;
      this.applyOngoingIntent(frame, towardLeft, towardRight, awayLeft, awayRight);
      return frame;
    }

    this.cooldownFrames = profile.decisionIntervalFrames;

    // 2. Defensive reaction when player attacks in close/mid range or visual projectile approaches on XY plane
    const incomingProj = activeProjectiles.find(
      (pr) => pr.ownerIndex !== cpu.playerIndex && Math.abs(pr.position.x - cpu.position.x) < 3.5
    );
    if ((player.isAttacking() && absDx < 2.3) || incomingProj) {
      if (this.random() < profile.blockChance) {
        this.currentIntent = 'block';
        frame.block = true;
        frame.left = awayLeft;
        frame.right = awayRight;
        if (player.state === 'sweep') {
          frame.crouch = true;
          frame.down = true;
        }
        return frame;
      } else if (this.random() < profile.jumpEvadeChance && cpu.isGrounded) {
        frame.jump = true;
        frame.jumpJustPressed = true;
        frame.up = true;
        frame.upJustPressed = true;
        frame.left = awayLeft;
        frame.right = awayRight;
        return frame;
      }
    }

    // 3. Anti-air when player jumps in
    if (
      !player.isGrounded &&
      absDx < 2.1 &&
      this.random() < profile.antiAirChance
    ) {
      frame.left = towardLeft;
      frame.right = towardRight;
      frame.kick = true;
      frame.kickJustPressed = true;
      this.currentIntent = 'idle';
      return frame;
    }

    // 4. Unleash guaranteed SuperMove whenever meter is 100
    if (cpu.specialMeter >= 100 && this.random() < profile.superMoveChance) {
      frame.superMove = true;
      frame.superMoveJustPressed = true;
      frame.special = true;
      frame.specialJustPressed = true;
      this.currentIntent = 'idle';
      return frame;
    }

    // 5. Close-range melee logic
    if (absDx <= 1.85) {
      if (player.isBlocking && this.random() < profile.aggression) {
        if (this.random() < 0.55 && absDx <= 1.35) {
          frame.grab = true;
          frame.grabJustPressed = true;
        } else {
          frame.crouch = true;
          frame.down = true;
          frame.kick = true;
          frame.kickJustPressed = true;
        }
        this.currentIntent = 'idle';
        return frame;
      }

      if (this.random() < profile.aggression) {
        const roll = this.random();
        if (roll < 0.35) {
          frame.punch = true;
          frame.punchJustPressed = true;
        } else if (roll < 0.65) {
          frame.kick = true;
          frame.kickJustPressed = true;
        } else if (roll < 0.85) {
          frame.left = towardLeft;
          frame.right = towardRight;
          frame.punch = true;
          frame.punchJustPressed = true;
        } else {
          frame.left = towardLeft;
          frame.right = towardRight;
          frame.kick = true;
          frame.kickJustPressed = true;
        }
        this.currentIntent = 'idle';
        return frame;
      }

      this.currentIntent = this.random() < 0.5 ? 'retreat' : 'block';
      this.applyOngoingIntent(frame, towardLeft, towardRight, awayLeft, awayRight);
      return frame;
    }

    // 6. Mid-to-long range: fire guaranteed SuperShot or close distance
    if (
      absDx > 2.2 &&
      cpu.specialMeter >= 25 &&
      cpu.superShotCooldownFrames <= 0 &&
      this.random() < profile.superShotChance
    ) {
      frame.superShot = true;
      frame.superShotJustPressed = true;
      this.currentIntent = 'idle';
      return frame;
    }

    if (this.random() < profile.aggression) {
      this.currentIntent = 'approach';
      if (absDx > 3.8 && this.random() < 0.16) {
        frame.jump = true;
        frame.jumpJustPressed = true;
        frame.up = true;
        frame.upJustPressed = true;
      }
    } else {
      this.currentIntent = 'idle';
    }

    this.applyOngoingIntent(frame, towardLeft, towardRight, awayLeft, awayRight);
    return frame;
  }

  private applyOngoingIntent(
    frame: InputFrame,
    towardLeft: boolean,
    towardRight: boolean,
    awayLeft: boolean,
    awayRight: boolean
  ): void {
    if (this.currentIntent === 'approach') {
      frame.left = towardLeft;
      frame.right = towardRight;
    } else if (this.currentIntent === 'retreat') {
      frame.left = awayLeft;
      frame.right = awayRight;
    } else if (this.currentIntent === 'block') {
      frame.block = true;
      frame.left = awayLeft;
      frame.right = awayRight;
    } else if (this.currentIntent === 'crouch') {
      frame.crouch = true;
      frame.down = true;
    }
  }
}
