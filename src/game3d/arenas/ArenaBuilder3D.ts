import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { ArenaId } from '../../types/fighter';

export interface ArenaSceneHandle3D {
  arenaId: ArenaId;
  rootNode: TransformNode;
  shadowGenerator: ShadowGenerator | null;
  keyLight: DirectionalLight;
  accentLight: PointLight;
  update: (dt: number) => void;
  setBlackoutIntensity: (factor: number) => void;
  dispose: () => void;
}

/**
 * Builds the 3D Award Night and Film City arenas with 3D geometry, PBR materials,
 * lighting, shadows, and animated stage props.
 */
export class ArenaBuilder3D {
  public static buildArena(
    scene: Scene,
    arenaId: ArenaId,
    isSoftwareWebGL: boolean
  ): ArenaSceneHandle3D {
    const rootNode = new TransformNode(`arena_${arenaId}_root`, scene);
    const animatedNodes: Array<(elapsed: number) => void> = [];
    let elapsed = 0;

    // Scene clear color & fog
    if (arenaId === 'award_night') {
      scene.clearColor = new Color4(0.05, 0.04, 0.09, 1);
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogColor = new Color3(0.07, 0.05, 0.12);
      scene.fogDensity = 0.022;
    } else {
      scene.clearColor = new Color4(0.05, 0.08, 0.14, 1);
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogColor = new Color3(0.06, 0.09, 0.16);
      scene.fogDensity = 0.022;
    }

    // 3-Point Cinematic Lighting
    const hemiLight = new HemisphericLight(
      'arenaHemiLight',
      new Vector3(0, 1, 0),
      scene
    );
    hemiLight.intensity = 0.85;
    hemiLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(1.0, 0.94, 0.86)
        : new Color3(0.88, 0.94, 1.0);
    hemiLight.groundColor = new Color3(0.22, 0.18, 0.28);

    const keyLight = new DirectionalLight(
      'arenaKeyLight',
      new Vector3(-0.35, -0.85, 0.42).normalize(),
      scene
    );
    keyLight.position = new Vector3(4, 9, -6);
    keyLight.intensity = 1.65;
    keyLight.diffuse = new Color3(1.0, 0.95, 0.85);

    const accentLight = new PointLight(
      'arenaAccentLight',
      new Vector3(0, 4.8, 2.5),
      scene
    );
    accentLight.intensity = 1.1;
    accentLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(0.96, 0.62, 0.04)
        : new Color3(0.02, 0.71, 0.83);

    // Shadow generator on hardware GPU
    let shadowGenerator: ShadowGenerator | null = null;
    if (!isSoftwareWebGL) {
      shadowGenerator = new ShadowGenerator(1024, keyLight);
      shadowGenerator.useBlurExponentialShadowMap = true;
      shadowGenerator.blurKernel = 16;
    }

    // Shared Stage Floor & Boundary Trim
    const stageDeck = MeshBuilder.CreateBox(
      'stageDeck',
      { width: 17.5, height: 0.5, depth: 8.2 },
      scene
    );
    stageDeck.position.set(0, -0.25, 0);
    stageDeck.parent = rootNode;
    stageDeck.receiveShadows = true;

    const deckMat = new PBRMaterial('deckMat', scene);
    if (arenaId === 'award_night') {
      deckMat.albedoColor = Color3.FromHexString('#1A1225');
      deckMat.roughness = 0.24;
      deckMat.metallic = 0.35;
    } else {
      deckMat.albedoColor = Color3.FromHexString('#1E293B');
      deckMat.roughness = 0.48;
      deckMat.metallic = 0.2;
    }
    stageDeck.material = deckMat;

    // Gold / Hazard Stage Edge Border
    const edgeMat = new PBRMaterial('edgeMat', scene);
    edgeMat.albedoColor = Color3.FromHexString(
      arenaId === 'award_night' ? '#F59E0B' : '#38BDF8'
    );
    edgeMat.metallic = 0.8;
    edgeMat.roughness = 0.25;
    edgeMat.emissiveColor = Color3.FromHexString(
      arenaId === 'award_night' ? '#78350F' : '#0369A1'
    );

    const frontTrim = MeshBuilder.CreateBox(
      'frontTrim',
      { width: 16.0, height: 0.08, depth: 0.14 },
      scene
    );
    frontTrim.position.set(0, 0.01, -3.45);
    frontTrim.parent = rootNode;
    frontTrim.material = edgeMat;

    const backTrim = MeshBuilder.CreateBox(
      'backTrim',
      { width: 16.0, height: 0.08, depth: 0.14 },
      scene
    );
    backTrim.position.set(0, 0.01, 3.45);
    backTrim.parent = rootNode;
    backTrim.material = edgeMat;

    if (arenaId === 'award_night') {
      this.buildAwardNightProps(scene, rootNode, edgeMat, animatedNodes);
    } else {
      this.buildFilmCityProps(scene, rootNode, edgeMat, animatedNodes);
    }

    return {
      arenaId,
      rootNode,
      shadowGenerator,
      keyLight,
      accentLight,
      update: (dt: number) => {
        elapsed += dt;
        for (const fn of animatedNodes) {
          fn(elapsed);
        }
      },
      setBlackoutIntensity: (factor: number) => {
        // factor: 0 = normal lighting, 1 = dramatic SuperMove dim
        const scale = 1 - factor * 0.65;
        hemiLight.intensity = 0.85 * scale;
        keyLight.intensity = 1.65 * scale;
      },
      dispose: () => {
        shadowGenerator?.dispose();
        hemiLight.dispose();
        keyLight.dispose();
        accentLight.dispose();
        const materials = new Set(
          rootNode
            .getChildMeshes(false)
            .map((m) => m.material)
            .filter(Boolean)
        );
        rootNode.dispose();
        for (const mat of materials) {
          mat?.dispose();
        }
      },
    };
  }

  private static buildAwardNightProps(
    scene: Scene,
    rootNode: TransformNode,
    goldMat: PBRMaterial,
    animatedNodes: Array<(elapsed: number) => void>
  ): void {
    // 1. Center Red Carpet Runner
    const carpetMat = new PBRMaterial('carpetMat', scene);
    carpetMat.albedoColor = Color3.FromHexString('#991B1B');
    carpetMat.roughness = 0.65;
    carpetMat.metallic = 0.05;

    const carpet = MeshBuilder.CreateBox(
      'redCarpet',
      { width: 14.8, height: 0.02, depth: 4.4 },
      scene
    );
    carpet.position.set(0, 0.01, 0);
    carpet.parent = rootNode;
    carpet.material = carpetMat;

    // 2. Monumental Illuminated Golden Stage Archways
    for (let i = 0; i < 3; i++) {
      const arch = MeshBuilder.CreateTorus(
        `awardArch_${i}`,
        { diameter: 9.5 + i * 2.4, thickness: 0.24, tessellation: 32 },
        scene
      );
      arch.position.set(0, 1.2, 4.6 + i * 1.4);
      arch.parent = rootNode;
      arch.material = goldMat;
    }

    // 3. Dual 3D Golden Trophy Statues on Pedestals
    const pedestalMat = new PBRMaterial('pedestalMat', scene);
    pedestalMat.albedoColor = Color3.FromHexString('#111827');
    pedestalMat.roughness = 0.25;
    pedestalMat.metallic = 0.5;

    for (const side of [-1, 1]) {
      const trophyRoot = new TransformNode(`trophy_${side}`, scene);
      trophyRoot.parent = rootNode;
      trophyRoot.position.set(side * 6.2, 0, 3.9);

      const pedestal = MeshBuilder.CreateCylinder(
        `pedestal_${side}`,
        { height: 1.4, diameterTop: 1.1, diameterBottom: 1.35, tessellation: 16 },
        scene
      );
      pedestal.position.y = 0.7;
      pedestal.parent = trophyRoot;
      pedestal.material = pedestalMat;

      const statueSpire = MeshBuilder.CreateCylinder(
        `statueSpire_${side}`,
        { height: 2.2, diameterTop: 0.18, diameterBottom: 0.55, tessellation: 14 },
        scene
      );
      statueSpire.position.y = 2.4;
      statueSpire.parent = trophyRoot;
      statueSpire.material = goldMat;

      const reelRing = MeshBuilder.CreateTorus(
        `reelRing_${side}`,
        { diameter: 0.95, thickness: 0.14, tessellation: 20 },
        scene
      );
      reelRing.position.y = 3.7;
      reelRing.parent = trophyRoot;
      reelRing.material = goldMat;

      animatedNodes.push((t) => {
        reelRing.rotation.y = t * 1.2 * side;
      });
    }

    // 4. Sweeping Volumetric Stage Cones
    const beamMat = new PBRMaterial('beamMat', scene);
    beamMat.albedoColor = Color3.FromHexString('#FDE047');
    beamMat.emissiveColor = Color3.FromHexString('#F59E0B').scale(0.5);
    beamMat.alpha = 0.14;
    beamMat.roughness = 0.9;

    const beamL = MeshBuilder.CreateCylinder(
      'beamL',
      { height: 8.5, diameterTop: 0.2, diameterBottom: 3.2, tessellation: 16 },
      scene
    );
    beamL.position.set(-4.8, 4.2, 4.2);
    beamL.parent = rootNode;
    beamL.material = beamMat;

    const beamR = MeshBuilder.CreateCylinder(
      'beamR',
      { height: 8.5, diameterTop: 0.2, diameterBottom: 3.2, tessellation: 16 },
      scene
    );
    beamR.position.set(4.8, 4.2, 4.2);
    beamR.parent = rootNode;
    beamR.material = beamMat;

    animatedNodes.push((t) => {
      beamL.rotation.z = Math.sin(t * 1.4) * 0.28 - 0.15;
      beamR.rotation.z = -Math.sin(t * 1.4 + 0.8) * 0.28 + 0.15;
    });
  }

  private static buildFilmCityProps(
    scene: Scene,
    rootNode: TransformNode,
    cyanMat: PBRMaterial,
    animatedNodes: Array<(elapsed: number) => void>
  ): void {
    const steelMat = new PBRMaterial('steelMat', scene);
    steelMat.albedoColor = Color3.FromHexString('#475569');
    steelMat.metallic = 0.78;
    steelMat.roughness = 0.32;

    const hazardMat = new PBRMaterial('hazardMat', scene);
    hazardMat.albedoColor = Color3.FromHexString('#F59E0B');
    hazardMat.roughness = 0.45;
    hazardMat.metallic = 0.25;

    // 1. Background Dolly Track Rails
    for (const zRail of [3.7, 4.1]) {
      const rail = MeshBuilder.CreateBox(
        `dollyRail_${zRail}`,
        { width: 15.0, height: 0.06, depth: 0.08 },
        scene
      );
      rail.position.set(0, 0.03, zRail);
      rail.parent = rootNode;
      rail.material = steelMat;
    }

    // 2. Overhead Soundstage Truss Pillars & Catwalk Beam
    for (const side of [-1, 1]) {
      const pillar = MeshBuilder.CreateBox(
        `trussPillar_${side}`,
        { width: 0.45, height: 6.2, depth: 0.45 },
        scene
      );
      pillar.position.set(side * 7.2, 3.1, 4.4);
      pillar.parent = rootNode;
      pillar.material = steelMat;
    }

    const topTruss = MeshBuilder.CreateBox(
      'topTruss',
      { width: 15.2, height: 0.45, depth: 0.55 },
      scene
    );
    topTruss.position.set(0, 6.0, 4.4);
    topTruss.parent = rootNode;
    topTruss.material = steelMat;

    // Studio Spotlights mounted on Top Truss
    for (let i = -2; i <= 2; i++) {
      const lamp = MeshBuilder.CreateCylinder(
        `trussLamp_${i}`,
        { height: 0.42, diameterTop: 0.26, diameterBottom: 0.42, tessellation: 12 },
        scene
      );
      lamp.position.set(i * 2.8, 5.65, 4.2);
      lamp.rotation.x = -0.35;
      lamp.parent = rootNode;
      lamp.material = i % 2 === 0 ? cyanMat : hazardMat;
    }

    // 3. Articulated 3D Camera Crane Rig that pans smoothly across the fight
    const craneBase = new TransformNode('craneBase', scene);
    craneBase.parent = rootNode;
    craneBase.position.set(-4.5, 0, 3.9);

    const dollyCart = MeshBuilder.CreateBox(
      'dollyCart',
      { width: 1.4, height: 0.35, depth: 1.0 },
      scene
    );
    dollyCart.position.y = 0.2;
    dollyCart.parent = craneBase;
    dollyCart.material = hazardMat;

    const jibPivot = new TransformNode('jibPivot', scene);
    jibPivot.parent = craneBase;
    jibPivot.position.y = 1.2;

    const jibArm = MeshBuilder.CreateBox(
      'jibArm',
      { width: 4.6, height: 0.22, depth: 0.22 },
      scene
    );
    jibArm.position.set(1.6, 0.8, 0);
    jibArm.rotation.z = 0.35;
    jibArm.parent = jibPivot;
    jibArm.material = steelMat;

    const cameraBox = MeshBuilder.CreateBox(
      'cinemaCamera3D',
      { width: 0.55, height: 0.42, depth: 0.65 },
      scene
    );
    cameraBox.position.set(3.6, 1.55, -0.2);
    cameraBox.parent = jibPivot;
    cameraBox.material = cyanMat;

    animatedNodes.push((t) => {
      craneBase.position.x = -2.5 + Math.sin(t * 0.55) * 2.8;
      jibPivot.rotation.y = Math.sin(t * 0.9) * 0.32;
    });
  }
}
