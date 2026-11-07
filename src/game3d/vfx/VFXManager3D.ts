import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import { CharacterId, Vector3D } from '../../types/fighter';
import { ActiveProjectile3D } from '../combat/Projectile3D';
import { Fighter3D } from '../combat/Fighter3D';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';

interface BurstEffect3D {
  mesh: Mesh;
  mat: StandardMaterial;
  age: number;
  maxAge: number;
  expandRate: number;
}

/**
 * 3D Visual Effects & Debug Hitbox Visualizer for Filmi Dangal 2.0.
 * Manages 3D SuperShot projectile meshes, hit sparks, shockwave rings,
 * character-specific SuperMove finisher FX, and 3D hitbox wireframe spheres.
 */
export class VFXManager3D {
  private scene: Scene;
  private rootNode: TransformNode;
  private projectileNodes = new Map<string, TransformNode>();
  private bursts: BurstEffect3D[] = [];
  private debugNodes: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.rootNode = new TransformNode('vfxRoot3D', scene);
  }

  public spawnHitBurst(
    pos: Vector3D,
    blocked: boolean,
    isSuperMove: boolean,
    colorHex = '#F59E0B'
  ): void {
    const ring = MeshBuilder.CreateTorus(
      'hitBurstRing',
      {
        diameter: isSuperMove ? 0.95 : 0.45,
        thickness: isSuperMove ? 0.12 : 0.06,
        tessellation: 20,
      },
      this.scene
    );
    ring.parent = this.rootNode;
    ring.position.set(pos.x, pos.y, pos.z);
    ring.rotation.x = Math.PI * 0.45;

    const mat = new StandardMaterial('hitBurstMat', this.scene);
    const col = blocked
      ? Color3.FromHexString('#38BDF8')
      : Color3.FromHexString(colorHex);
    mat.emissiveColor = col;
    mat.diffuseColor = col;
    mat.disableLighting = true;
    mat.alpha = 0.92;
    ring.material = mat;

    this.bursts.push({
      mesh: ring,
      mat,
      age: 0,
      maxAge: isSuperMove ? 0.55 : 0.28,
      expandRate: isSuperMove ? 6.5 : 3.8,
    });
  }

  public spawnSuperMoveSignatureVFX(
    characterId: CharacterId,
    origin: Vector3D
  ): void {
    let colorHex = '#F59E0B';
    if (characterId === 'romance_raja') colorHex = '#EC4899';
    else if (characterId === 'dance_dynamo') colorHex = '#06B6D4';
    else if (characterId === 'villain_saab') colorHex = '#DC2626';

    const groundWave = MeshBuilder.CreateTorus(
      'superGroundWave',
      { diameter: 1.2, thickness: 0.14, tessellation: 28 },
      this.scene
    );
    groundWave.parent = this.rootNode;
    groundWave.position.set(origin.x, 0.06, origin.z);

    const mat = new StandardMaterial('superWaveMat', this.scene);
    const col = Color3.FromHexString(colorHex);
    mat.emissiveColor = col;
    mat.diffuseColor = col;
    mat.disableLighting = true;
    mat.alpha = 0.95;
    groundWave.material = mat;

    this.bursts.push({
      mesh: groundWave,
      mat,
      age: 0,
      maxAge: 0.65,
      expandRate: 7.2,
    });
  }

  public syncProjectiles(activeProjectiles: ActiveProjectile3D[], dt: number): void {
    const activeIds = new Set(activeProjectiles.map((p) => p.id));

    for (const [id, node] of this.projectileNodes.entries()) {
      if (!activeIds.has(id)) {
        node.dispose();
        this.projectileNodes.delete(id);
      }
    }

    for (const proj of activeProjectiles) {
      let node = this.projectileNodes.get(proj.id);
      if (!node) {
        node = this.createProjectileMesh(proj);
        this.projectileNodes.set(proj.id, node);
      }
      node.position.set(proj.position.x, proj.position.y, proj.position.z);
      node.rotation.z += dt * 8.0;
      node.rotation.y += dt * 5.0;
    }

    for (const b of this.bursts) {
      b.age += dt;
      const scale = 1 + b.age * b.expandRate;
      b.mesh.scaling.set(scale, scale, scale);
      b.mat.alpha = Math.max(0, 1 - b.age / b.maxAge);
    }

    for (const b of this.bursts) {
      if (b.age >= b.maxAge) {
        b.mesh.dispose();
        b.mat.dispose();
      }
    }
    this.bursts = this.bursts.filter((b) => b.age < b.maxAge);
  }

  private createProjectileMesh(proj: ActiveProjectile3D): TransformNode {
    const root = new TransformNode(`proj3D_${proj.id}`, this.scene);
    root.parent = this.rootNode;

    const coreMat = new PBRMaterial(`projCore_${proj.id}`, this.scene);
    coreMat.albedoColor = Color3.FromHexString(proj.colorHex);
    coreMat.emissiveColor = Color3.FromHexString(proj.colorHex).scale(0.85);
    coreMat.roughness = 0.2;
    coreMat.metallic = 0.4;

    const ringMat = new PBRMaterial(`projRing_${proj.id}`, this.scene);
    ringMat.albedoColor = Color3.FromHexString(proj.secondaryHex);
    ringMat.emissiveColor = Color3.FromHexString(proj.secondaryHex).scale(0.9);
    ringMat.roughness = 0.2;

    const core = MeshBuilder.CreateSphere(
      `projCoreMesh_${proj.id}`,
      { diameter: proj.radius * 1.25, segments: 12 },
      this.scene
    );
    core.parent = root;
    core.material = coreMat;

    const ring = MeshBuilder.CreateTorus(
      `projRingMesh_${proj.id}`,
      { diameter: proj.radius * 1.9, thickness: 0.09, tessellation: 18 },
      this.scene
    );
    ring.rotation.z = Math.PI * 0.5;
    ring.parent = root;
    ring.material = ringMat;

    return root;
  }

  public updateDebugHitboxes(
    f1: Fighter3D,
    f2: Fighter3D,
    enabled: boolean
  ): void {
    for (const m of this.debugNodes) {
      m.dispose();
    }
    this.debugNodes = [];

    if (!enabled) return;

    const hurtMat = new StandardMaterial('dbgHurtMat', this.scene);
    hurtMat.emissiveColor = new Color3(0.1, 0.85, 0.4);
    hurtMat.wireframe = true;
    hurtMat.disableLighting = true;

    const hitMat = new StandardMaterial('dbgHitMat', this.scene);
    hitMat.emissiveColor = new Color3(1.0, 0.2, 0.2);
    hitMat.wireframe = true;
    hitMat.disableLighting = true;

    for (const fighter of [f1, f2]) {
      const cap = fighter.getCapsuleHurtbox3D();
      for (const s of [cap.headSphere, cap.torsoSphere, cap.legsSphere]) {
        const c = HitboxSystem3D.getSphereCenter(s);
        const m = MeshBuilder.CreateSphere(
          'dbgHurt',
          { diameter: s.radius * 2, segments: 8 },
          this.scene
        );
        m.position.set(c.x, c.y, c.z);
        m.material = hurtMat;
        this.debugNodes.push(m);
      }

      const atk = fighter.getActiveAttackSphere3D();
      if (atk) {
        const c = HitboxSystem3D.getSphereCenter(atk);
        const m = MeshBuilder.CreateSphere(
          'dbgAtk',
          { diameter: atk.radius * 2, segments: 10 },
          this.scene
        );
        m.position.set(c.x, c.y, c.z);
        m.material = hitMat;
        this.debugNodes.push(m);
      }
    }
  }

  public dispose(): void {
    for (const node of this.projectileNodes.values()) {
      node.dispose();
    }
    this.projectileNodes.clear();
    for (const b of this.bursts) {
      b.mesh.dispose();
      b.mat.dispose();
    }
    this.bursts = [];
    for (const m of this.debugNodes) {
      m.dispose();
    }
    this.debugNodes = [];
    this.rootNode.dispose();
  }
}
