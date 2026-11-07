import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { Fighter3D, FIXED_RENDER_PLANE_Z } from '../combat/Fighter3D';

/**
 * Fixed Side-View 3D Camera for Filmi Dangal 2.0.
 * Keeps gameplay strictly framed from a perpendicular side-view perspective looking
 * straight at the Z = 0 fighting plane, tracking horizontal midpoint X and vertical Y
 * while zooming cleanly during SuperMoves.
 */
export class DynamicFightCamera3D {
  public readonly camera: UniversalCamera;
  private currentPos: Vector3;
  private currentTarget: Vector3;
  private trauma = 0;
  private specialZoomTimer = 0;
  private specialFocusIndex: 0 | 1 | null = null;
  private elapsed = 0;

  constructor(scene: Scene) {
    this.currentPos = new Vector3(0, 2.1, -6.8);
    this.currentTarget = new Vector3(0, 1.15, FIXED_RENDER_PLANE_Z);

    this.camera = new UniversalCamera(
      'FilmiFightCamera3D',
      this.currentPos.clone(),
      scene
    );
    this.camera.fov = 0.66;
    this.camera.minZ = 0.15;
    this.camera.maxZ = 85;
    this.camera.setTarget(this.currentTarget);
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public triggerSuperMoveZoom(
    fighterIndex: 0 | 1,
    durationSeconds = 1.15
  ): void {
    this.specialFocusIndex = fighterIndex;
    this.specialZoomTimer = durationSeconds;
    this.addTrauma(0.45);
  }

  public update(f1: Fighter3D, f2: Fighter3D, dt: number): void {
    this.elapsed += dt;

    if (this.specialZoomTimer > 0) {
      this.specialZoomTimer = Math.max(0, this.specialZoomTimer - dt);
      if (this.specialZoomTimer === 0) {
        this.specialFocusIndex = null;
      }
    }

    const midX = (f1.position.x + f2.position.x) * 0.5;
    const midY = Math.max(1.05, (f1.position.y + f2.position.y) * 0.5 + 1.08);
    const separation = Math.abs(f1.position.x - f2.position.x);

    // True fixed side-view alignment: camera X matches target X on the Z = 0 plane
    let desiredTarget = new Vector3(midX, midY, FIXED_RENDER_PLANE_Z);
    let desiredDistZ = Math.max(5.4, Math.min(11.2, 4.4 + separation * 0.72));
    let desiredHeightY = 1.85 + separation * 0.09;
    let desiredPosX = midX;

    // Side-view dramatic zoom during SuperMove activation
    if (this.specialZoomTimer > 0 && this.specialFocusIndex !== null) {
      const focusFighter = this.specialFocusIndex === 0 ? f1 : f2;
      desiredPosX = focusFighter.position.x + focusFighter.facing * 0.35;
      desiredTarget = new Vector3(
        desiredPosX,
        focusFighter.position.y + 1.2,
        FIXED_RENDER_PLANE_Z
      );
      desiredDistZ = 4.1;
      desiredHeightY = 1.5;
    }

    const desiredPos = new Vector3(
      desiredPosX,
      desiredHeightY,
      FIXED_RENDER_PLANE_Z - desiredDistZ
    );

    const smoothFactor = Math.min(1, dt * 8.5);
    Vector3.LerpToRef(this.currentPos, desiredPos, smoothFactor, this.currentPos);
    Vector3.LerpToRef(
      this.currentTarget,
      desiredTarget,
      smoothFactor,
      this.currentTarget
    );

    // Apply decaying trauma camera shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0.001) {
      const shakeMag = this.trauma * this.trauma * 0.24;
      shakeX = Math.sin(this.elapsed * 53.0) * shakeMag;
      shakeY = Math.cos(this.elapsed * 67.0) * shakeMag;
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }

    this.camera.position.set(
      this.currentPos.x + shakeX,
      Math.max(0.65, this.currentPos.y + shakeY),
      this.currentPos.z
    );
    this.camera.setTarget(this.currentTarget);
  }
}
