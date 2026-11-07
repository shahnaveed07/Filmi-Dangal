import { CapsuleHurtbox3D, Sphere3D, Vector3D } from '../../types/fighter';

export interface HitLocationResult3D {
  overlaps: boolean;
  hitRegion: 'head' | 'torso' | 'legs' | 'none';
  contactPoint: Vector3D;
  penetrationDepth: number;
}

/**
 * 3D Hitbox & Hurtbox collision system for Filmi Dangal 2.0 on the fixed Z = 0 plane.
 * Uses 3D bone-attached attack spheres and 3D capsule / multi-sphere hurtboxes.
 */
export class HitboxSystem3D {
  public static getSphereCenter(s: Sphere3D): Vector3D {
    return s.center ?? { x: s.x, y: s.y, z: 0 };
  }

  public static createSphere(x: number, y: number, z: number, radius: number): Sphere3D {
    return {
      x,
      y,
      z,
      radius,
      center: { x, y, z },
    };
  }

  public static distanceSquared3D(a: Vector3D, b: Vector3D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  public static distance3D(a: Vector3D, b: Vector3D): number {
    return Math.sqrt(this.distanceSquared3D(a, b));
  }

  public static closestPointOnSegment3D(
    point: Vector3D,
    segA: Vector3D,
    segB: Vector3D
  ): Vector3D {
    const abx = segB.x - segA.x;
    const aby = segB.y - segA.y;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < 1e-8) {
      return { x: segA.x, y: segA.y, z: 0 };
    }
    const apx = point.x - segA.x;
    const apy = point.y - segA.y;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    return {
      x: segA.x + abx * t,
      y: segA.y + aby * t,
      z: 0,
    };
  }

  public static checkSphereSphereOverlap3D(a: Sphere3D, b: Sphere3D): boolean {
    const rSum = a.radius + b.radius;
    return (
      this.distanceSquared3D(this.getSphereCenter(a), this.getSphereCenter(b)) <=
      rSum * rSum
    );
  }

  /**
   * Checks whether a 3D attack sphere (attached to a hand/foot/chest bone)
   * intersects a defender's 3D capsule hurtbox on the 2D XY plane and identifies hit region.
   */
  public static checkAttackHit3D(
    attackSphere: Sphere3D,
    defenderHurtbox: CapsuleHurtbox3D
  ): HitLocationResult3D {
    const center = this.getSphereCenter(attackSphere);
    const closest = this.closestPointOnSegment3D(
      center,
      defenderHurtbox.bottom,
      defenderHurtbox.top
    );
    const dist = this.distance3D(center, closest);
    const combinedRadius = attackSphere.radius + defenderHurtbox.radius;

    if (dist > combinedRadius) {
      return {
        overlaps: false,
        hitRegion: 'none',
        contactPoint: closest,
        penetrationDepth: 0,
      };
    }

    const contactPoint: Vector3D = {
      x: (center.x + closest.x) * 0.5,
      y: (center.y + closest.y) * 0.5,
      z: 0,
    };

    const heightSpan = Math.max(0.1, defenderHurtbox.top.y - defenderHurtbox.bottom.y);
    const relY = (closest.y - defenderHurtbox.bottom.y) / heightSpan;

    let hitRegion: 'head' | 'torso' | 'legs' = 'torso';
    if (relY >= 0.72) {
      hitRegion = 'head';
    } else if (relY <= 0.35) {
      hitRegion = 'legs';
    }

    return {
      overlaps: true,
      hitRegion,
      contactPoint,
      penetrationDepth: combinedRadius - dist,
    };
  }

  /**
   * Computes strictly horizontal X-axis pushbox overlap between two fighters on the 2D XY plane.
   */
  public static computeHorizontalPushSeparation3D(
    posA: Vector3D,
    radiusA: number,
    posB: Vector3D,
    radiusB: number
  ): { overlap: number; dirX: number } {
    const dx = posB.x - posA.x;
    const dist = Math.abs(dx);
    const minDist = radiusA + radiusB;

    if (dist >= minDist) {
      return { overlap: 0, dirX: 0 };
    }

    if (dist < 1e-5) {
      return { overlap: minDist, dirX: 1 };
    }

    return {
      overlap: minDist - dist,
      dirX: dx >= 0 ? 1 : -1,
    };
  }
}
