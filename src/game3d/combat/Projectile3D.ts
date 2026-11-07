import { CharacterId, Sphere3D, Vector3D } from '../../types/fighter';
import { FIXED_RENDER_PLANE_Z } from './Fighter3D';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';

export type SuperShotVisualStyle =
  | 'bullet_tracer'
  | 'open_arms_wave'
  | 'sonic_dance_wave'
  | 'swagger_ground_wave';

export interface ActiveProjectile3D {
  id: string;
  ownerIndex: 0 | 1;
  characterId: CharacterId;
  name: string;
  visualStyle: SuperShotVisualStyle;
  position: Vector3D;
  velocity: Vector3D;
  radius: number;
  damage: number;
  chipDamage: number;
  hitStunFrames: number;
  blockStunFrames: number;
  knockbackX: number;
  knockbackY: number;
  causesKnockdown: boolean;
  colorHex: string;
  secondaryHex: string;
  ageFrames: number;
  maxLifetimeFrames: number;
  active: boolean;
}

const SUPERSHOT_PROFILES: Record<
  CharacterId,
  {
    name: string;
    visualStyle: SuperShotVisualStyle;
    speedX: number;
    spawnHeightOffset: number;
    radius: number;
    damage: number;
    chipDamage: number;
    hitStunFrames: number;
    blockStunFrames: number;
    knockbackX: number;
    knockbackY: number;
    causesKnockdown: boolean;
    colorHex: string;
    secondaryHex: string;
  }
> = {
  action_sultan: {
    name: 'BLACKBUCK GUNSHOT',
    visualStyle: 'bullet_tracer',
    speedX: 16.5,
    spawnHeightOffset: 1.32,
    radius: 0.42,
    damage: 95,
    chipDamage: 20,
    hitStunFrames: 20,
    blockStunFrames: 12,
    knockbackX: 5.5,
    knockbackY: 2.2,
    causesKnockdown: false,
    colorHex: '#F59E0B',
    secondaryHex: '#FEF08A',
  },
  romance_raja: {
    name: 'ICONIC OPEN-ARMS POSE',
    visualStyle: 'open_arms_wave',
    speedX: 11.2,
    spawnHeightOffset: 1.22,
    radius: 0.46,
    damage: 88,
    chipDamage: 18,
    hitStunFrames: 19,
    blockStunFrames: 12,
    knockbackX: 4.8,
    knockbackY: 2.0,
    causesKnockdown: false,
    colorHex: '#EC4899',
    secondaryHex: '#FBBF24',
  },
  duggu: {
    name: 'KAHO NAA DANCE WAVE',
    visualStyle: 'sonic_dance_wave',
    speedX: 13.5,
    spawnHeightOffset: 1.08,
    radius: 0.44,
    damage: 85,
    chipDamage: 18,
    hitStunFrames: 18,
    blockStunFrames: 11,
    knockbackX: 4.5,
    knockbackY: 2.0,
    causesKnockdown: false,
    colorHex: '#06B6D4',
    secondaryHex: '#4ADE80',
  },
  bhidu: {
    name: 'BHIDU SWAGGER SHOCKWAVE',
    visualStyle: 'swagger_ground_wave',
    speedX: 10.2,
    spawnHeightOffset: 0.42,
    radius: 0.52,
    damage: 102,
    chipDamage: 22,
    hitStunFrames: 22,
    blockStunFrames: 14,
    knockbackX: 6.2,
    knockbackY: 3.5,
    causesKnockdown: true,
    colorHex: '#F59E0B',
    secondaryHex: '#DC2626',
  },
};

export class ProjectileManager3D {
  private projectiles: ActiveProjectile3D[] = [];
  private nextId = 1;

  public spawnSuperShot(
    ownerIndex: 0 | 1,
    characterId: CharacterId,
    origin: Vector3D,
    facing: 1 | -1,
    _targetZ: number
  ): ActiveProjectile3D {
    const profile = SUPERSHOT_PROFILES[characterId] || SUPERSHOT_PROFILES.action_sultan;
    const spawnPos: Vector3D = {
      x: origin.x + facing * 0.85,
      y: origin.y + profile.spawnHeightOffset,
      z: FIXED_RENDER_PLANE_Z,
    };

    const proj: ActiveProjectile3D = {
      id: `proj3d_${this.nextId++}`,
      ownerIndex,
      characterId,
      name: profile.name,
      visualStyle: profile.visualStyle,
      position: spawnPos,
      velocity: {
        x: facing * profile.speedX,
        y: 0,
        z: 0,
      },
      radius: profile.radius,
      damage: profile.damage,
      chipDamage: profile.chipDamage,
      hitStunFrames: profile.hitStunFrames,
      blockStunFrames: profile.blockStunFrames,
      knockbackX: profile.knockbackX,
      knockbackY: profile.knockbackY,
      causesKnockdown: profile.causesKnockdown,
      colorHex: profile.colorHex,
      secondaryHex: profile.secondaryHex,
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
      p.ageFrames += 1;
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z = FIXED_RENDER_PLANE_Z;

      if (
        p.ageFrames >= p.maxLifetimeFrames ||
        Math.abs(p.position.x) > 12.0
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
      FIXED_RENDER_PLANE_Z,
      proj.radius
    );
  }

  public clear(): void {
    this.projectiles = [];
  }
}
