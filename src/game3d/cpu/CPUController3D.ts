import { DifficultyLevel, InputFrame } from '../../types/fighter';
import { EMPTY_INPUT_FRAME } from '../../engine/InputManager';
import { Fighter3D } from '../combat/Fighter3D';
import { ActiveProjectile3D } from '../combat/Projectile3D';

interface DifficultyProfile3D {
  decisionIntervalFrames: number;
  aggression: number;
  blockChance: number;
  sidestepDodgeChance: number;
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
    sidestepDodgeChance: 0.25,
    superMoveChance: 0.35,
    superShotChance: 0.28,
    comboFollowupChance: 0.2,
    antiAirChance: 0.2,
  },
  normal: {
    decisionIntervalFrames: 10,
    aggression: 0.65,
    blockChance: 0.55,
    sidestepDodgeChance: 0.6,
    superMoveChance: 0.75,
    superShotChance: 0.55,
    comboFollowupChance: 0.55,
    antiAirChance: 0.55,
  },
  hard: {
    decisionIntervalFrames: 5,
    aggression: 0.88,
    blockChance: 0.84,
    sidestepDodgeChance: 0.88,
    superMoveChance: 0.95,
    superShotChance: 0.78,
    comboFollowupChance: 0.85,
    antiAirChance: 0.85,
  },
};

/**
 * 3D CPU AI Controller for Filmi Dangal 2.0.
 * Navigates (X, Y, Z) space, sidesteps incoming 3D projectiles, aligns Z-depth before striking,
 * blocks, punishes whiffs, and triggers character-specific SuperShots & SuperMoves.
 */
export class CPUController3D {
  private difficulty: DifficultyLevel;
  private cooldownFrames = 0;
  private currentIntent:
    | 'idle'
    | 'approach'
    | 'retreat'
    | 'block'
    | 'crouch'
    | 'sidestep_up'
    | 'sidestep_down' = 'idle';
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
    const dz = player.position.z - cpu.position.z;
    const absDx = Math.abs(dx);
    const absDz = Math.abs(dz);
    const towardLeft = dx < 0;
    const towardRight = dx > 0;
    const awayLeft = !towardLeft;
    const awayRight = !towardRight;

    // 1. Check for incoming 3D enemy projectile to dodge via Z-sidestep or block
    const incomingProj = activeProjectiles.find(
      (p) =>
        p.ownerIndex !== cpu.playerIndex &&
        Math.abs(p.position.x - cpu.position.x) < 4.2 &&
        Math.abs(p.position.z - cpu.position.z) < 0.85
    );

    if (incomingProj && cpu.canAct()) {
      if (this.random() < profile.sidestepDodgeChance) {
        if (cpu.position.z <= 0) {
          frame.sidestepUp = true;
          frame.up = true;
        } else {
          frame.sidestepDown = true;
          frame.down = true;
        }
        return frame;
      } else if (this.random() < profile.blockChance) {
        frame.block = true;
        frame.left = awayLeft;
        frame.right = awayRight;
        return frame;
      }
    }

    // 2. Combo cancel into SuperMove when meter is full on hit
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

    // 3. Defensive reaction when player attacks in close/mid range
    if (player.isAttacking() && absDx < 2.3 && absDz < 0.9) {
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
      } else if (this.random() < profile.sidestepDodgeChance) {
        this.currentIntent = cpu.position.z <= 0 ? 'sidestep_up' : 'sidestep_down';
        this.applyOngoingIntent(frame, towardLeft, towardRight, awayLeft, awayRight);
        return frame;
      }
    }

    // 4. Align Z lane if misaligned before committing to melee attacks
    if (absDz > 0.55 && absDx < 3.5) {
      this.currentIntent = dz > 0 ? 'sidestep_up' : 'sidestep_down';
      this.applyOngoingIntent(frame, towardLeft, towardRight, awayLeft, awayRight);
      return frame;
    }

    // 5. Anti-air when player jumps in
    if (!player.isGrounded && absDx < 2.1 && this.random() < profile.antiAirChance) {
      frame.left = towardLeft;
      frame.right = towardRight;
      frame.kick = true;
      frame.kickJustPressed = true;
      this.currentIntent = 'idle';
      return frame;
    }

    // 6. Close-range melee & signature finisher logic
    if (absDx <= 1.85 && absDz <= 0.7) {
      // Unleash SuperMove when meter is 100!
      if (cpu.specialMeter >= 100 && this.random() < profile.superMoveChance) {
        frame.superMove = true;
        frame.superMoveJustPressed = true;
        frame.special = true;
        frame.specialJustPressed = true;
        this.currentIntent = 'idle';
        return frame;
      }

      // If opponent is blocking, use Grab (I) or low Sweep to break guard
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

    // 7. Mid-to-long range: fire SuperShot projectile or close distance
    if (
      absDx > 2.2 &&
      absDz < 0.85 &&
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
    } else if (this.currentIntent === 'sidestep_up') {
      frame.sidestepUp = true;
      frame.up = true;
    } else if (this.currentIntent === 'sidestep_down') {
      frame.sidestepDown = true;
      frame.down = true;
    }
  }
}
