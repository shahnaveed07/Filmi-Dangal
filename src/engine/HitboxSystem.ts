import { Box, FighterStateName } from '../types/fighter';

export class HitboxSystem {
  /**
   * Check if two Axis-Aligned Bounding Boxes intersect
   */
  public static intersects(a: Box, b: Box): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  /**
   * Returns a hurtbox encompassing the fighter based on state, position, and facing direction
   */
  public static getHurtbox(
    x: number,
    y: number,
    state: FighterStateName,
    facing: 1 | -1
  ): Box {
    if (state === 'crouch' || state === 'crouch_block' || state === 'sweep') {
      return {
        x: x - 32,
        y: y - 55,
        w: 64,
        h: 55,
      };
    }

    if (state === 'knockdown') {
      return {
        x: x - 45,
        y: y - 25,
        w: 90,
        h: 25,
      };
    }

    if (state === 'jump') {
      return {
        x: x - 30,
        y: y - 90,
        w: 60,
        h: 75,
      };
    }

    // Standard standing hurtbox (idle, walks, attacks, hit, block)
    return {
      x: x - 32,
      y: y - 100,
      w: 64,
      h: 100,
    };
  }

  /**
   * Returns precise attack hitbox based on the attack frame offset, fighter position, and facing direction
   */
  public static getAttackHitbox(
    fighterX: number,
    fighterY: number,
    facing: 1 | -1,
    offset: { x: number; y: number; w: number; h: number }
  ): Box {
    // If facing right (1), offset.x moves forward (+x)
    // If facing left (-1), offset.x moves forward (-x)
    const boxX = facing === 1 ? fighterX + offset.x : fighterX - offset.x - offset.w;
    const boxY = fighterY + offset.y;

    return {
      x: boxX,
      y: boxY,
      w: offset.w,
      h: offset.h,
    };
  }

  /**
   * Calculate distance between two points on the X axis
   */
  public static getHorizontalDistance(x1: number, x2: number): number {
    return Math.abs(x1 - x2);
  }
}
