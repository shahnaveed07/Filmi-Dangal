import { CharacterId, Sphere3D, Vector3D } from '../../types/fighter';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';

export interface ActiveProjectile3D {
  id: string;
  ownerIndex: 0 | 1;
  characterId: CharacterId;
  name: string;
  position: Vector3D;
  velocity: Vector3D;
  radius: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockbackX: number;
  knockbackY: number;
  causesKnockdown: boolean;
  colorHex: string;
  secondaryHex: string;
  ageFrames: number;
  maxLifetimeFrames: number;
  active: boolean;
}

/**
 * Factory and updater for character-specific 3D SuperShot projectiles.
 */
export class ProjectileManager3D {
  private projectiles: ActiveProjectile3D[] = [];
  private nextId = 1;

  public spawnSuperShot(
    ownerIndex: 0 | 1,
    characterId: CharacterId,
    origin: Vector3D,
    facing: 1 | -1,
    targetZ: number
  ): ActiveProjectile3D {
    const id = `proj_${this.nextId++}`;
    const dz = targetZ - origin.z;
    const zVel = Math.max(-1.8, Math.min(1.8, dz * 1.4));

    let speedX = 11.0;
    let radius = 0.45;
    let damage = 90;
    let hitstun = 20;
    let blockstun = 12;
    let knockbackX = 4.2;
    let knockbackY = 2.0;
    let causesKnockdown = false;
    let colorHex = '#F59E0B';
    let secondaryHex = '#FEF08A';
    let name = 'POWERLINE BLAST';

    if (characterId === 'action_sultan') {
      name = 'POWERLINE BLAST';
      speedX = 11.5;
      radius = 0.48;
      damage = 95;
      knockbackX = 5.2;
      knockbackY = 2.8;
      colorHex = '#F59E0B';
      secondaryHex = '#DC2626';
    } else if (characterId === 'romance_raja') {
      name = 'DIL SE PULSE';
      speedX = 12.2;
      radius = 0.46;
      damage = 88;
      knockbackX = 3.8;
      knockbackY = 1.8;
      colorHex = '#EC4899';
      secondaryHex = '#FBBF24';
    } else if (characterId === 'dance_dynamo') {
      name = 'BEAT DROP';
      speedX = 13.5;
      radius = 0.44;
      damage = 82;
      hitstun = 22;
      knockbackX = 3.5;
      knockbackY = 2.2;
      colorHex = '#06B6D4';
      secondaryHex = '#EC4899';
    } else if (characterId === 'villain_saab') {
      name = 'UNDERWORLD BARRAGE';
      speedX = 10.5;
      radius = 0.52;
      damage = 100;
      knockbackX = 6.0;
      knockbackY = 3.2;
      causesKnockdown = true;
      colorHex = '#DC2626';
      secondaryHex = '#F97316';
    }

    const proj: ActiveProjectile3D = {
      id,
      ownerIndex,
      characterId,
      name,
      position: {
        x: origin.x + facing * 0.75,
        y: origin.y + 1.05,
        z: origin.z,
      },
      velocity: {
        x: facing * speedX,
        y: 0,
        z: zVel,
      },
      radius,
      damage,
      hitstun,
      blockstun,
      knockbackX,
      knockbackY,
      causesKnockdown,
      colorHex,
      secondaryHex,
      ageFrames: 0,
      maxLifetimeFrames: 110,
      active: true,
    };

    this.projectiles.push(proj);
    return proj;
  }

  public updateFrame(dt = 1 / 60): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;
      p.ageFrames += 1;

      if (
        p.ageFrames >= p.maxLifetimeFrames ||
        Math.abs(p.position.x) > 10.5 ||
        Math.abs(p.position.z) > 5.0
      ) {
        p.active = false;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.active);
  }

  public getActiveProjectiles(): ActiveProjectile3D[] {
    return this.projectiles;
  }

  public getProjectileSphere(proj: ActiveProjectile3D): Sphere3D {
    return HitboxSystem3D.createSphere(
      proj.position.x,
      proj.position.y,
      proj.position.z,
      proj.radius
    );
  }

  public clear(): void {
    this.projectiles = [];
  }
}
