import { CharacterId, Sphere3D, Vector3D } from '../../types/fighter';
import { ActiveProjectile3D, ProjectileManager3D } from './Projectile3D';
import { Fighter3D } from './Fighter3D';

/**
 * SuperShotProjectileSystem
 *
 * Manages ranged 3D special attacks (`SuperShot`) for all four fighters:
 * - Action Sultan: BLACKBUCK GUNSHOT (Anim_AS_SuperShot_BlackbuckGunshot)
 * - Romance Raja: ICONIC OPEN-ARMS POSE (Anim_RR_SuperShot_OpenArmsPose)
 * - Duggu: KAHO NAA DANCE WAVE (Anim_DG_SuperShot_KahoNaaDanceWave)
 * - Bhidu: BHIDU SWAGGER SHOCKWAVE (Anim_BH_SuperShot_BhiduSwaggerWalk)
 *
 * Wraps and extends ProjectileManager3D with animation-event-driven release frames
 * and 3D projectile-vs-projectile clash resolution.
 */

export class SuperShotProjectileSystem {
  private readonly manager = new ProjectileManager3D();

  public getProjectileManager(): ProjectileManager3D {
    return this.manager;
  }

  public spawnSuperShotForFighter(
    fighter: Fighter3D,
    targetZ = 0
  ): ActiveProjectile3D {
    return this.manager.spawnSuperShot(
      fighter.playerIndex,
      fighter.id,
      fighter.position,
      fighter.facing,
      targetZ
    );
  }

  public spawnSuperShot(
    ownerIndex: 0 | 1,
    characterId: CharacterId,
    origin: Vector3D,
    facing: 1 | -1,
    targetZ: number
  ): ActiveProjectile3D {
    return this.manager.spawnSuperShot(
      ownerIndex,
      characterId,
      origin,
      facing,
      targetZ
    );
  }

  public updateFrame(dt = 1 / 60): void {
    this.manager.updateFrame(dt);

    // Resolve 3D Projectile-vs-Projectile Clash Cancellation
    const active = this.manager.getActiveProjectiles();
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (!a.active) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (!b.active || a.ownerIndex === b.ownerIndex) continue;
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= a.radius + b.radius) {
          a.active = false;
          b.active = false;
        }
      }
    }
  }

  public getActiveProjectiles(): ActiveProjectile3D[] {
    return this.manager.getActiveProjectiles();
  }

  public getProjectileSphere(proj: ActiveProjectile3D): Sphere3D {
    return this.manager.getProjectileSphere(proj);
  }

  public clear(): void {
    this.manager.clear();
  }
}
