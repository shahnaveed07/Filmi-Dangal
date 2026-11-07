import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { CharacterId, Vector3D } from '../../types/fighter';
import { ActiveProjectile3D } from '../combat/Projectile3D';
import { Fighter3D } from '../combat/Fighter3D';
import { HitboxSystem3D } from '../hitboxes/HitboxSystem3D';

interface BurstEffect3D {
  node: TransformNode;
  materials: StandardMaterial[];
  age: number;
  maxAge: number;
  expandRate: number;
  velocity?: Vector3;
  spinY?: number;
}

/**
 * 3D Visual Effects & Debug Hitbox Visualizer for Filmi Dangal 2.0.
 * Manages:
 * - Character-specific 3D SuperShot charge & release VFX:
 *   1. Action Sultan: Non-graphic stylized golden Blackbuck hologram emblem during aim + muzzle flash, ejecting shell casing, smoke puff, and high-velocity bullet tracer
 *   2. Romance Raja: Open-arms golden/crimson wind aura + expanding energy wave + spotlight flash
 *   3. Duggu: Rhythmic Kaho Naa ground beat rings + arm/leg motion trails + rotating sonic energy arcs
 *   4. Bhidu: Deliberate swagger walk footstep dust rings + low-frequency ground shockwave ripple
 * - Hit sparks, SuperMove finisher FX, and 3D hitbox wireframe spheres.
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

  private createUnlitMat(name: string, hexColor: string, alpha = 0.92): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    const col = Color3.FromHexString(hexColor);
    mat.emissiveColor = col;
    mat.diffuseColor = col;
    mat.disableLighting = true;
    mat.alpha = alpha;
    return mat;
  }

  public spawnHitBurst(
    pos: Vector3D,
    blocked: boolean,
    isSuperMove: boolean,
    colorHex = '#F59E0B'
  ): void {
    const group = new TransformNode('hitBurstGroup', this.scene);
    group.parent = this.rootNode;
    group.position.set(pos.x, pos.y, pos.z);

    const ring = MeshBuilder.CreateTorus(
      'hitBurstRing',
      {
        diameter: isSuperMove ? 0.95 : 0.48,
        thickness: isSuperMove ? 0.12 : 0.065,
        tessellation: 20,
      },
      this.scene
    );
    ring.parent = group;
    ring.rotation.x = Math.PI * 0.45;

    const mat = this.createUnlitMat(
      'hitBurstMat',
      blocked ? '#38BDF8' : colorHex,
      0.94
    );
    ring.material = mat;

    this.bursts.push({
      node: group,
      materials: [mat],
      age: 0,
      maxAge: isSuperMove ? 0.55 : 0.3,
      expandRate: isSuperMove ? 6.5 : 4.0,
    });
  }

  /**
   * Spawns character-specific SuperShot CHARGE visual effects at `ON_CHARGE_START`.
   */
  public spawnSuperShotChargeVFX(
    characterId: CharacterId,
    origin: Vector3D,
    facing: 1 | -1
  ): void {
    const group = new TransformNode(`ssCharge_${characterId}`, this.scene);
    group.parent = this.rootNode;

    if (characterId === 'action_sultan') {
      // Stylized, non-graphic golden Blackbuck Silhouette Hologram Sight Emblem
      // Appears briefly in front of Action Sultan during his aiming stance as a purely artistic parody emblem
      group.position.set(origin.x + facing * 1.15, origin.y + 1.42, origin.z - 0.18);
      const goldMat = this.createUnlitMat('asBlackbuckHoloMat', '#FBBF24', 0.88);
      const cyanMat = this.createUnlitMat('asSightReticleMat', '#38BDF8', 0.78);

      const reticleRing = MeshBuilder.CreateTorus(
        'asSightReticle',
        { diameter: 0.62, thickness: 0.025, tessellation: 24 },
        this.scene
      );
      reticleRing.rotation.x = Math.PI * 0.5;
      reticleRing.parent = group;
      reticleRing.material = cyanMat;

      // Stylized leaping antelope/blackbuck geometric silhouette (neck/body/spiral horns)
      const bodyArc = MeshBuilder.CreateBox(
        'asBuckBody',
        { width: 0.24, height: 0.09, depth: 0.02 },
        this.scene
      );
      bodyArc.position.set(-facing * 0.03, -0.04, 0);
      bodyArc.rotation.z = facing * 0.22;
      bodyArc.parent = group;
      bodyArc.material = goldMat;

      const neckCrest = MeshBuilder.CreateBox(
        'asBuckNeck',
        { width: 0.06, height: 0.14, depth: 0.02 },
        this.scene
      );
      neckCrest.position.set(facing * 0.08, 0.04, 0);
      neckCrest.rotation.z = -facing * 0.28;
      neckCrest.parent = group;
      neckCrest.material = goldMat;

      const hornLeft = MeshBuilder.CreateCylinder(
        'asBuckHorn1',
        { height: 0.22, diameterTop: 0.01, diameterBottom: 0.028, tessellation: 8 },
        this.scene
      );
      hornLeft.position.set(facing * 0.02, 0.18, 0);
      hornLeft.rotation.z = facing * 0.52;
      hornLeft.parent = group;
      hornLeft.material = goldMat;

      const hornRight = MeshBuilder.CreateCylinder(
        'asBuckHorn2',
        { height: 0.2, diameterTop: 0.01, diameterBottom: 0.025, tessellation: 8 },
        this.scene
      );
      hornRight.position.set(facing * 0.05, 0.17, 0);
      hornRight.rotation.z = facing * 0.36;
      hornRight.parent = group;
      hornRight.material = goldMat;

      this.bursts.push({
        node: group,
        materials: [goldMat, cyanMat],
        age: 0,
        maxAge: 0.42,
        expandRate: 0.55,
      });
    } else if (characterId === 'romance_raja') {
      // Warm golden & rose open-arms aura + wind ribbons
      group.position.set(origin.x, origin.y + 1.05, origin.z);
      const goldMat = this.createUnlitMat('rrGoldAura', '#FBBF24', 0.88);
      const roseMat = this.createUnlitMat('rrRoseWind', '#F43F5E', 0.82);

      const auraHalo = MeshBuilder.CreateTorus(
        'rrOpenArmsHalo',
        { diameter: 1.15, thickness: 0.05, tessellation: 28 },
        this.scene
      );
      auraHalo.rotation.x = Math.PI * 0.5;
      auraHalo.parent = group;
      auraHalo.material = goldMat;

      const windSwirl = MeshBuilder.CreateTorus(
        'rrWindSwirl',
        { diameter: 1.35, thickness: 0.035, tessellation: 24 },
        this.scene
      );
      windSwirl.position.y = -0.45;
      windSwirl.parent = group;
      windSwirl.material = roseMat;

      this.bursts.push({
        node: group,
        materials: [goldMat, roseMat],
        age: 0,
        maxAge: 0.48,
        expandRate: 1.4,
        spinY: 4.5,
      });
    } else if (characterId === 'duggu') {
      // Rhythmic Kaho Naa ground beat rings + arm/leg motion trail arcs
      group.position.set(origin.x, origin.y + 0.08, origin.z);
      const cyanMat = this.createUnlitMat('dgBeatCyan', '#06B6D4', 0.9);
      const greenMat = this.createUnlitMat('dgBeatGreen', '#4ADE80', 0.85);

      const floorBeatRing = MeshBuilder.CreateTorus(
        'dgFloorBeat',
        { diameter: 1.1, thickness: 0.055, tessellation: 24 },
        this.scene
      );
      floorBeatRing.parent = group;
      floorBeatRing.material = cyanMat;

      const danceArc = MeshBuilder.CreateTorus(
        'dgDanceTrailArc',
        { diameter: 0.95, thickness: 0.04, tessellation: 22 },
        this.scene
      );
      danceArc.position.y = 0.95;
      danceArc.rotation.x = Math.PI * 0.35;
      danceArc.parent = group;
      danceArc.material = greenMat;

      this.bursts.push({
        node: group,
        materials: [cyanMat, greenMat],
        age: 0,
        maxAge: 0.45,
        expandRate: 2.1,
        spinY: 9.0,
      });
    } else {
      // Bhidu — Heavy swagger walk ground dust particles & footstep rings
      group.position.set(origin.x + facing * 0.25, origin.y + 0.06, origin.z);
      const dustMat = this.createUnlitMat('bhStepDust', '#F59E0B', 0.85);
      const crimsonMat = this.createUnlitMat('bhSwaggerRipple', '#DC2626', 0.82);

      const stepRing1 = MeshBuilder.CreateTorus(
        'bhSwaggerStep1',
        { diameter: 0.75, thickness: 0.06, tessellation: 20 },
        this.scene
      );
      stepRing1.position.x = -facing * 0.2;
      stepRing1.parent = group;
      stepRing1.material = dustMat;

      const stepRing2 = MeshBuilder.CreateTorus(
        'bhSwaggerStep2',
        { diameter: 0.95, thickness: 0.05, tessellation: 20 },
        this.scene
      );
      stepRing2.position.x = facing * 0.22;
      stepRing2.parent = group;
      stepRing2.material = crimsonMat;

      this.bursts.push({
        node: group,
        materials: [dustMat, crimsonMat],
        age: 0,
        maxAge: 0.5,
        expandRate: 1.85,
      });
    }
  }

  /**
   * Spawns character-specific SuperShot RELEASE visual effects at `ON_PROJECTILE_RELEASE`.
   */
  public spawnSuperShotReleaseVFX(
    characterId: CharacterId,
    origin: Vector3D,
    facing: 1 | -1
  ): void {
    if (characterId === 'action_sultan') {
      // 1. Muzzle flash burst + smoke puff at barrel tip
      const flashGroup = new TransformNode('asMuzzleFlashGroup', this.scene);
      flashGroup.parent = this.rootNode;
      flashGroup.position.set(origin.x + facing * 0.92, origin.y + 1.35, origin.z);

      const flashMat = this.createUnlitMat('asMuzzleMat', '#FEF08A', 0.98);
      const smokeMat = this.createUnlitMat('asSmokeMat', '#94A3B8', 0.65);

      const flashCone = MeshBuilder.CreateCylinder(
        'asMuzzleCone',
        { height: 0.42, diameterTop: 0.02, diameterBottom: 0.26, tessellation: 10 },
        this.scene
      );
      flashCone.rotation.z = -facing * Math.PI * 0.5;
      flashCone.parent = flashGroup;
      flashCone.material = flashMat;

      const smokeSphere = MeshBuilder.CreateSphere(
        'asBarrelSmoke',
        { diameter: 0.24, segments: 8 },
        this.scene
      );
      smokeSphere.position.set(facing * 0.12, 0.08, 0);
      smokeSphere.parent = flashGroup;
      smokeSphere.material = smokeMat;

      this.bursts.push({
        node: flashGroup,
        materials: [flashMat, smokeMat],
        age: 0,
        maxAge: 0.22,
        expandRate: 3.4,
      });

      // 2. Ejecting brass shell casing arc
      const shellGroup = new TransformNode('asEjectedShell', this.scene);
      shellGroup.parent = this.rootNode;
      shellGroup.position.set(origin.x + facing * 0.65, origin.y + 1.4, origin.z);
      const brassMat = this.createUnlitMat('asBrassShellMat', '#F59E0B', 0.95);
      const shell = MeshBuilder.CreateCylinder(
        'asShellMesh',
        { height: 0.09, diameter: 0.035, tessellation: 8 },
        this.scene
      );
      shell.parent = shellGroup;
      shell.material = brassMat;

      this.bursts.push({
        node: shellGroup,
        materials: [brassMat],
        age: 0,
        maxAge: 0.38,
        expandRate: 0.2,
        velocity: new Vector3(-facing * 1.6, 2.2, 0),
        spinY: 18.0,
      });
      return;
    }

    const releaseGroup = new TransformNode(`ssRelease_${characterId}`, this.scene);
    releaseGroup.parent = this.rootNode;
    releaseGroup.position.set(
      origin.x + facing * 0.55,
      characterId === 'bhidu' ? origin.y + 0.1 : origin.y + 1.15,
      origin.z
    );

    const colorHex =
      characterId === 'romance_raja'
        ? '#F43F5E'
        : characterId === 'duggu'
        ? '#38BDF8'
        : '#F59E0B';
    const mat = this.createUnlitMat(`ssRelMat_${characterId}`, colorHex, 0.92);

    const wave = MeshBuilder.CreateTorus(
      `ssRelRing_${characterId}`,
      { diameter: 0.72, thickness: 0.08, tessellation: 24 },
      this.scene
    );
    if (characterId !== 'bhidu') {
      wave.rotation.z = Math.PI * 0.5;
    }
    wave.parent = releaseGroup;
    wave.material = mat;

    this.bursts.push({
      node: releaseGroup,
      materials: [mat],
      age: 0,
      maxAge: 0.34,
      expandRate: 4.5,
    });
  }

  public spawnSuperMoveSignatureVFX(
    characterId: CharacterId,
    origin: Vector3D
  ): void {
    let colorHex = '#F59E0B';
    if (characterId === 'romance_raja') colorHex = '#EC4899';
    else if (characterId === 'duggu') colorHex = '#06B6D4';
    else if (characterId === 'bhidu') colorHex = '#DC2626';

    const group = new TransformNode('superGroundWaveGroup', this.scene);
    group.parent = this.rootNode;
    group.position.set(origin.x, 0.06, origin.z);

    const groundWave = MeshBuilder.CreateTorus(
      'superGroundWave',
      { diameter: 1.2, thickness: 0.14, tessellation: 28 },
      this.scene
    );
    groundWave.parent = group;

    const mat = this.createUnlitMat('superWaveMat', colorHex, 0.95);
    groundWave.material = mat;

    this.bursts.push({
      node: group,
      materials: [mat],
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
      if (proj.visualStyle === 'sonic_dance_wave') {
        node.rotation.z += dt * 14.0;
        node.rotation.x += dt * 9.0;
      } else if (proj.visualStyle === 'open_arms_wave') {
        const s = 1 + Math.min(0.85, proj.ageFrames * 0.035);
        node.scaling.set(s, s, s);
      } else if (proj.visualStyle === 'swagger_ground_wave') {
        const s = 1 + Math.min(0.95, proj.ageFrames * 0.04);
        node.scaling.set(s, 1, s);
      }
    }

    for (const b of this.bursts) {
      b.age += dt;
      const scale = 1 + b.age * b.expandRate;
      b.node.scaling.set(scale, scale, scale);
      if (b.velocity) {
        b.node.position.x += b.velocity.x * dt;
        b.node.position.y += b.velocity.y * dt;
        b.velocity.y -= 9.8 * dt;
      }
      if (b.spinY) {
        b.node.rotation.y += b.spinY * dt;
      }
      const alpha = Math.max(0, 1 - b.age / b.maxAge);
      for (const m of b.materials) {
        m.alpha = alpha;
      }
    }

    for (const b of this.bursts) {
      if (b.age >= b.maxAge) {
        b.node.dispose();
        for (const m of b.materials) {
          m.dispose();
        }
      }
    }
    this.bursts = this.bursts.filter((b) => b.age < b.maxAge);
  }

  private createProjectileMesh(proj: ActiveProjectile3D): TransformNode {
    const root = new TransformNode(`proj3D_${proj.id}`, this.scene);
    root.parent = this.rootNode;
    const dir = proj.velocity.x >= 0 ? 1 : -1;

    const coreMat = new PBRMaterial(`projCore_${proj.id}`, this.scene);
    coreMat.albedoColor = Color3.FromHexString(proj.colorHex);
    coreMat.emissiveColor = Color3.FromHexString(proj.colorHex).scale(0.95);
    coreMat.roughness = 0.18;
    coreMat.metallic = 0.5;

    const ringMat = new PBRMaterial(`projRing_${proj.id}`, this.scene);
    ringMat.albedoColor = Color3.FromHexString(proj.secondaryHex);
    ringMat.emissiveColor = Color3.FromHexString(proj.secondaryHex).scale(0.95);
    ringMat.roughness = 0.2;

    if (proj.visualStyle === 'bullet_tracer') {
      // Action Sultan — High-velocity gold bullet & glowing tracer tail
      const bulletTip = MeshBuilder.CreateCylinder(
        `bulletCore_${proj.id}`,
        { height: 0.55, diameterTop: 0.04, diameterBottom: 0.16, tessellation: 12 },
        this.scene
      );
      bulletTip.rotation.z = -dir * Math.PI * 0.5;
      bulletTip.parent = root;
      bulletTip.material = ringMat;

      const tracerStreak = MeshBuilder.CreateCylinder(
        `bulletTrail_${proj.id}`,
        { height: 1.35, diameterTop: 0.12, diameterBottom: 0.01, tessellation: 10 },
        this.scene
      );
      tracerStreak.rotation.z = -dir * Math.PI * 0.5;
      tracerStreak.position.x = -dir * 0.65;
      tracerStreak.parent = root;
      tracerStreak.material = coreMat;
      return root;
    }

    if (proj.visualStyle === 'open_arms_wave') {
      // Romance Raja — Expanding open-arms crimson-gold energy wave
      const waveArc = MeshBuilder.CreateTorus(
        `openArmsWave_${proj.id}`,
        { diameter: proj.radius * 2.3, thickness: 0.11, tessellation: 24 },
        this.scene
      );
      waveArc.rotation.y = Math.PI * 0.5;
      waveArc.parent = root;
      waveArc.material = coreMat;

      const innerHeartGlow = MeshBuilder.CreateSphere(
        `openArmsCore_${proj.id}`,
        { diameter: proj.radius * 1.15, segments: 12 },
        this.scene
      );
      innerHeartGlow.parent = root;
      innerHeartGlow.material = ringMat;
      return root;
    }

    if (proj.visualStyle === 'sonic_dance_wave') {
      // Duggu — Rotating dual sonic energy arcs + beat core
      const arc1 = MeshBuilder.CreateTorus(
        `sonicArc1_${proj.id}`,
        { diameter: proj.radius * 2.1, thickness: 0.085, tessellation: 22 },
        this.scene
      );
      arc1.rotation.z = Math.PI * 0.35;
      arc1.parent = root;
      arc1.material = coreMat;

      const arc2 = MeshBuilder.CreateTorus(
        `sonicArc2_${proj.id}`,
        { diameter: proj.radius * 1.75, thickness: 0.075, tessellation: 22 },
        this.scene
      );
      arc2.rotation.x = Math.PI * 0.35;
      arc2.parent = root;
      arc2.material = ringMat;
      return root;
    }

    // Bhidu — Heavy low-frequency ground shockwave ripple
    const groundRipple = MeshBuilder.CreateTorus(
      `bhiduGroundWave_${proj.id}`,
      { diameter: proj.radius * 2.4, thickness: 0.12, tessellation: 24 },
      this.scene
    );
    groundRipple.position.y = -0.22;
    groundRipple.parent = root;
    groundRipple.material = coreMat;

    const crestSpike = MeshBuilder.CreateCylinder(
      `bhiduCrest_${proj.id}`,
      { height: 0.65, diameterTop: 0.08, diameterBottom: 0.42, tessellation: 10 },
      this.scene
    );
    crestSpike.rotation.z = -dir * 0.32;
    crestSpike.parent = root;
    crestSpike.material = ringMat;

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
      b.node.dispose();
      for (const m of b.materials) {
        m.dispose();
      }
    }
    this.bursts = [];
    for (const m of this.debugNodes) {
      m.dispose();
    }
    this.debugNodes = [];
    this.rootNode.dispose();
  }
}
