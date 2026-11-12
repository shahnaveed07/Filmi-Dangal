import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
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
 * Builds the 3D Award Night and Film City arenas with multi-layered foreground,
 * midground, and background depth, calibrated PBR materials, 3-point key/fill/rim
 * lighting, shadows, and environmental animation while keeping the 2.5D fighting
 * plane (Z = 0, floorY = 0, minX = -7.5, maxX = 7.5) completely unobstructed.
 */
export class ArenaBuilder3D {
  public static buildArena(
    scene: Scene,
    arenaId: ArenaId,
    isSoftwareWebGL: boolean
  ): ArenaSceneHandle3D {
    const rootNode = new TransformNode(`arena_${arenaId}_root`, scene);
    const animatedNodes: Array<(elapsed: number) => void> = [];
    const createdMaterials = new Set<PBRMaterial>();
    let elapsed = 0;

    const registerMat = (name: string): PBRMaterial => {
      const mat = new PBRMaterial(name, scene);
      createdMaterials.add(mat);
      return mat;
    };

    // Scene clear color & atmospheric depth fog
    if (arenaId === 'award_night') {
      scene.clearColor = new Color4(0.04, 0.03, 0.08, 1);
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogColor = new Color3(0.06, 0.04, 0.11);
      scene.fogDensity = 0.018;
    } else {
      scene.clearColor = new Color4(0.04, 0.07, 0.12, 1);
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogColor = new Color3(0.05, 0.08, 0.15);
      scene.fogDensity = 0.018;
    }

    // 1. Ambient Fill Light (Hemispheric)
    const hemiLight = new HemisphericLight(
      'arenaHemiLight',
      new Vector3(0, 1, 0),
      scene
    );
    hemiLight.intensity = 0.88;
    hemiLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(1.0, 0.93, 0.82)
        : new Color3(0.86, 0.93, 1.0);
    hemiLight.groundColor =
      arenaId === 'award_night'
        ? new Color3(0.24, 0.16, 0.3)
        : new Color3(0.18, 0.24, 0.32);

    // 2. Key Light (Directional)
    const keyLight = new DirectionalLight(
      'arenaKeyLight',
      new Vector3(-0.32, -0.86, 0.4).normalize(),
      scene
    );
    keyLight.position = new Vector3(4.5, 9.5, -6.5);
    keyLight.intensity = 1.75;
    keyLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(1.0, 0.94, 0.82)
        : new Color3(0.98, 0.95, 0.88);

    // 3. Rim / Backlight (Directional from behind stage to separate fighter silhouettes)
    const rimLight = new DirectionalLight(
      'arenaRimLight',
      new Vector3(0.15, -0.45, -0.88).normalize(),
      scene
    );
    rimLight.position = new Vector3(0, 6.5, 6.0);
    rimLight.intensity = 0.95;
    rimLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(0.98, 0.75, 0.28)
        : new Color3(0.22, 0.78, 0.98);

    // 4. Center Stage Accent Light (PointLight)
    const accentLight = new PointLight(
      'arenaAccentLight',
      new Vector3(0, 4.8, 2.5),
      scene
    );
    accentLight.intensity = 1.25;
    accentLight.diffuse =
      arenaId === 'award_night'
        ? new Color3(0.96, 0.64, 0.08)
        : new Color3(0.06, 0.74, 0.88);

    // Shadow generator on hardware GPU
    let shadowGenerator: ShadowGenerator | null = null;
    if (!isSoftwareWebGL) {
      shadowGenerator = new ShadowGenerator(1024, keyLight);
      shadowGenerator.useBlurExponentialShadowMap = true;
      shadowGenerator.blurKernel = 16;
    }

    // Shared Main Fighting Stage Floor (Y = 0 top surface)
    const stageDeck = MeshBuilder.CreateBox(
      'stageDeck',
      { width: 18.4, height: 0.56, depth: 8.6 },
      scene
    );
    stageDeck.position.set(0, -0.28, 0);
    stageDeck.parent = rootNode;
    stageDeck.receiveShadows = true;

    const deckMat = registerMat('deckMat');
    if (arenaId === 'award_night') {
      deckMat.albedoColor = Color3.FromHexString('#161024');
      deckMat.roughness = 0.22;
      deckMat.metallic = 0.42;
    } else {
      deckMat.albedoColor = Color3.FromHexString('#1E293B');
      deckMat.roughness = 0.44;
      deckMat.metallic = 0.24;
    }
    stageDeck.material = deckMat;

    // Lower Sub-Stage Apron Foundation for Foreground Depth
    const subApron = MeshBuilder.CreateBox(
      'subApron',
      { width: 19.6, height: 0.45, depth: 9.4 },
      scene
    );
    subApron.position.set(0, -0.72, 0.1);
    subApron.parent = rootNode;

    const apronMat = registerMat('apronMat');
    apronMat.albedoColor = Color3.FromHexString(
      arenaId === 'award_night' ? '#0D0916' : '#0F172A'
    );
    apronMat.roughness = 0.38;
    apronMat.metallic = 0.5;
    subApron.material = apronMat;

    // Gold / Cyan Illuminated Stage Boundary Trim
    const edgeMat = registerMat('edgeMat');
    edgeMat.albedoColor = Color3.FromHexString(
      arenaId === 'award_night' ? '#F59E0B' : '#38BDF8'
    );
    edgeMat.metallic = 0.85;
    edgeMat.roughness = 0.2;
    edgeMat.emissiveColor = Color3.FromHexString(
      arenaId === 'award_night' ? '#92400E' : '#0284C7'
    );

    const frontTrim = MeshBuilder.CreateBox(
      'frontTrim',
      { width: 16.8, height: 0.08, depth: 0.14 },
      scene
    );
    frontTrim.position.set(0, 0.01, -3.55);
    frontTrim.parent = rootNode;
    frontTrim.material = edgeMat;

    const backTrim = MeshBuilder.CreateBox(
      'backTrim',
      { width: 16.8, height: 0.08, depth: 0.14 },
      scene
    );
    backTrim.position.set(0, 0.01, 3.55);
    backTrim.parent = rootNode;
    backTrim.material = edgeMat;

    // Left & Right Arena Boundary Posts (marks minX = -7.5, maxX = 7.5)
    for (const side of [-1, 1]) {
      const markerStrip = MeshBuilder.CreateBox(
        `boundaryStrip_${side}`,
        { width: 0.12, height: 0.03, depth: 6.9 },
        scene
      );
      markerStrip.position.set(side * 7.55, 0.012, 0);
      markerStrip.parent = rootNode;
      markerStrip.material = edgeMat;
    }

    if (arenaId === 'award_night') {
      this.buildAwardNightProps(scene, rootNode, edgeMat, registerMat, animatedNodes);
    } else {
      this.buildFilmCityProps(scene, rootNode, edgeMat, registerMat, animatedNodes);
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
        hemiLight.intensity = 0.88 * scale;
        keyLight.intensity = 1.75 * scale;
        rimLight.intensity = 0.95 * (1 - factor * 0.35);
      },
      dispose: () => {
        shadowGenerator?.dispose();
        hemiLight.dispose();
        keyLight.dispose();
        rimLight.dispose();
        accentLight.dispose();
        const childMaterials = new Set(
          rootNode
            .getChildMeshes(false)
            .map((m) => m.material)
            .filter(Boolean)
        );
        rootNode.dispose();
        for (const mat of childMaterials) {
          mat?.dispose();
        }
        for (const mat of createdMaterials) {
          mat.dispose();
        }
        createdMaterials.clear();
      },
    };
  }

  private static buildAwardNightProps(
    scene: Scene,
    rootNode: TransformNode,
    goldMat: PBRMaterial,
    registerMat: (name: string) => PBRMaterial,
    animatedNodes: Array<(elapsed: number) => void>
  ): void {
    // 1. Center Red Carpet Runner with Gold Side Trim & Central Medallion
    const carpetMat = registerMat('carpetMat');
    carpetMat.albedoColor = Color3.FromHexString('#991B1B');
    carpetMat.roughness = 0.62;
    carpetMat.metallic = 0.06;

    const crimsonVelvetMat = registerMat('crimsonVelvetMat');
    crimsonVelvetMat.albedoColor = Color3.FromHexString('#7F1D1D');
    crimsonVelvetMat.roughness = 0.55;
    crimsonVelvetMat.metallic = 0.1;

    const obsidianMat = registerMat('obsidianMat');
    obsidianMat.albedoColor = Color3.FromHexString('#111827');
    obsidianMat.roughness = 0.2;
    obsidianMat.metallic = 0.6;

    const ledPanelMat = registerMat('ledPanelMat');
    ledPanelMat.albedoColor = Color3.FromHexString('#1E1B4B');
    ledPanelMat.emissiveColor = Color3.FromHexString('#4338CA').scale(0.45);
    ledPanelMat.roughness = 0.25;
    ledPanelMat.metallic = 0.3;

    const carpet = MeshBuilder.CreateBox(
      'redCarpet',
      { width: 15.0, height: 0.02, depth: 4.5 },
      scene
    );
    carpet.position.set(0, 0.01, 0);
    carpet.parent = rootNode;
    carpet.material = carpetMat;

    // Gold trim stripes along carpet front and back
    for (const zCarpet of [-2.22, 2.22]) {
      const runnerTrim = MeshBuilder.CreateBox(
        `carpetTrim_${zCarpet}`,
        { width: 15.0, height: 0.024, depth: 0.1 },
        scene
      );
      runnerTrim.position.set(0, 0.012, zCarpet);
      runnerTrim.parent = rootNode;
      runnerTrim.material = goldMat;
    }

    // Center Stage Star Medallion Inlay
    const centerRing = MeshBuilder.CreateTorus(
      'stageCenterMedallion',
      { diameter: 2.8, thickness: 0.07, tessellation: 32 },
      scene
    );
    centerRing.position.set(0, 0.015, 0);
    centerRing.parent = rootNode;
    centerRing.material = goldMat;

    // 2. Foreground Stage Footlight Housings along Front Edge (Z = -3.8)
    for (let i = -3; i <= 3; i++) {
      const footlight = MeshBuilder.CreateBox(
        `footlight_${i}`,
        { width: 0.42, height: 0.14, depth: 0.24 },
        scene
      );
      footlight.position.set(i * 2.2, 0.06, -3.78);
      footlight.parent = rootNode;
      footlight.material = obsidianMat;

      const lens = MeshBuilder.CreateCylinder(
        `footlightLens_${i}`,
        { height: 0.05, diameter: 0.18, tessellation: 12 },
        scene
      );
      lens.position.set(i * 2.2, 0.12, -3.72);
      lens.rotation.x = Math.PI * 0.35;
      lens.parent = rootNode;
      lens.material = goldMat;
    }

    // 3. Upstage Grand Staircase Risers & Brass Perimeter Stanchions (Z = 3.2..4.4)
    for (let step = 0; step < 3; step++) {
      const riser = MeshBuilder.CreateBox(
        `grandStair_${step}`,
        { width: 9.6 - step * 0.8, height: 0.22, depth: 0.55 },
        scene
      );
      riser.position.set(0, 0.11 + step * 0.2, 3.6 + step * 0.48);
      riser.parent = rootNode;
      riser.material = step === 1 ? carpetMat : obsidianMat;
    }

    for (const xPost of [-6.8, -4.6, 4.6, 6.8]) {
      const stanchion = MeshBuilder.CreateCylinder(
        `stanchion_${xPost}`,
        { height: 0.92, diameterTop: 0.07, diameterBottom: 0.16, tessellation: 12 },
        scene
      );
      stanchion.position.set(xPost, 0.46, 3.25);
      stanchion.parent = rootNode;
      stanchion.material = goldMat;

      const finial = MeshBuilder.CreateSphere(
        `stanchionFinial_${xPost}`,
        { diameter: 0.15, segments: 10 },
        scene
      );
      finial.position.set(xPost, 0.96, 3.25);
      finial.parent = rootNode;
      finial.material = goldMat;
    }

    // Velvet Ropes connecting outer stanchion pairs
    for (const side of [-1, 1]) {
      const rope = MeshBuilder.CreateCylinder(
        `velvetRope_${side}`,
        { height: 2.2, diameter: 0.06, tessellation: 10 },
        scene
      );
      rope.position.set(side * 5.7, 0.68, 3.25);
      rope.rotation.z = Math.PI * 0.5;
      rope.parent = rootNode;
      rope.material = crimsonVelvetMat;
    }

    // 4. Monumental Illuminated Golden Stage Archways & Backstage LED Screen
    const backdropWall = MeshBuilder.CreateBox(
      'awardBackdropWall',
      { width: 17.5, height: 7.4, depth: 0.35 },
      scene
    );
    backdropWall.position.set(0, 3.4, 7.8);
    backdropWall.parent = rootNode;
    backdropWall.material = ledPanelMat;

    // Vertical Gold Louver Columns on the LED Backdrop
    for (let c = -4; c <= 4; c++) {
      const col = MeshBuilder.CreateBox(
        `backdropLouver_${c}`,
        { width: 0.16, height: 6.8, depth: 0.42 },
        scene
      );
      col.position.set(c * 1.85, 3.4, 7.65);
      col.parent = rootNode;
      col.material = goldMat;
    }

    for (let i = 0; i < 3; i++) {
      const arch = MeshBuilder.CreateTorus(
        `awardArch_${i}`,
        { diameter: 9.6 + i * 2.5, thickness: 0.25, tessellation: 36 },
        scene
      );
      arch.position.set(0, 1.35, 4.65 + i * 1.15);
      arch.parent = rootNode;
      arch.material = goldMat;
    }

    // 5. Dual Multi-Part 3D Golden Trophy Statues on Tiered Pedestals
    for (const side of [-1, 1]) {
      const trophyRoot = new TransformNode(`trophy_${side}`, scene);
      trophyRoot.parent = rootNode;
      trophyRoot.position.set(side * 6.0, 0, 4.0);

      const basePlinth = MeshBuilder.CreateBox(
        `trophyPlinth_${side}`,
        { width: 1.55, height: 0.35, depth: 1.55 },
        scene
      );
      basePlinth.position.y = 0.175;
      basePlinth.parent = trophyRoot;
      basePlinth.material = obsidianMat;

      const pedestal = MeshBuilder.CreateCylinder(
        `pedestal_${side}`,
        { height: 1.35, diameterTop: 1.05, diameterBottom: 1.3, tessellation: 18 },
        scene
      );
      pedestal.position.y = 0.95;
      pedestal.parent = trophyRoot;
      pedestal.material = obsidianMat;

      const pedestalRing = MeshBuilder.CreateTorus(
        `pedestalGoldRing_${side}`,
        { diameter: 1.16, thickness: 0.08, tessellation: 20 },
        scene
      );
      pedestalRing.position.y = 1.62;
      pedestalRing.parent = trophyRoot;
      pedestalRing.material = goldMat;

      const statueSpire = MeshBuilder.CreateCylinder(
        `statueSpire_${side}`,
        { height: 2.2, diameterTop: 0.22, diameterBottom: 0.58, tessellation: 16 },
        scene
      );
      statueSpire.position.y = 2.65;
      statueSpire.parent = trophyRoot;
      statueSpire.material = goldMat;

      const wingArm = MeshBuilder.CreateTorus(
        `statueWing_${side}`,
        { diameter: 0.85, thickness: 0.09, tessellation: 18 },
        scene
      );
      wingArm.position.y = 3.1;
      wingArm.scaling.set(0.75, 1.35, 0.5);
      wingArm.parent = trophyRoot;
      wingArm.material = goldMat;

      const crownGlobe = MeshBuilder.CreateSphere(
        `crownGlobe_${side}`,
        { diameter: 0.42, segments: 14 },
        scene
      );
      crownGlobe.position.y = 3.92;
      crownGlobe.parent = trophyRoot;
      crownGlobe.material = goldMat;

      const reelRing = MeshBuilder.CreateTorus(
        `reelRing_${side}`,
        { diameter: 1.08, thickness: 0.12, tessellation: 24 },
        scene
      );
      reelRing.position.y = 3.92;
      reelRing.parent = trophyRoot;
      reelRing.material = goldMat;

      animatedNodes.push((t) => {
        reelRing.rotation.y = t * 1.2 * side;
      });
    }

    // 6. Tiered VIP Audience Seating & Silhouettes on Left and Right Wings
    const silhouetteMat = registerMat('audienceSilhouetteMat');
    silhouetteMat.albedoColor = Color3.FromHexString('#090710');
    silhouetteMat.roughness = 0.7;
    silhouetteMat.metallic = 0.1;

    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        const tierRiser = MeshBuilder.CreateBox(
          `vipRiser_${side}_${row}`,
          { width: 3.4, height: 0.55 + row * 0.45, depth: 1.1 },
          scene
        );
        tierRiser.position.set(side * 8.6, 0.25 + row * 0.22, 4.6 + row * 1.25);
        tierRiser.rotation.y = side * -0.24;
        tierRiser.parent = rootNode;
        tierRiser.material = obsidianMat;

        for (let seat = -1; seat <= 1; seat++) {
          const guestTorso = MeshBuilder.CreateCylinder(
            `vipGuestTorso_${side}_${row}_${seat}`,
            { height: 0.58, diameterTop: 0.28, diameterBottom: 0.36, tessellation: 10 },
            scene
          );
          guestTorso.position.set(
            side * 8.6 + seat * 0.85,
            0.78 + row * 0.45,
            4.55 + row * 1.25
          );
          guestTorso.parent = rootNode;
          guestTorso.material = silhouetteMat;

          const guestHead = MeshBuilder.CreateSphere(
            `vipGuestHead_${side}_${row}_${seat}`,
            { diameter: 0.24, segments: 8 },
            scene
          );
          guestHead.position.set(
            side * 8.6 + seat * 0.85,
            1.18 + row * 0.45,
            4.55 + row * 1.25
          );
          guestHead.parent = rootNode;
          guestHead.material = silhouetteMat;
        }
      }
    }

    // 7. Overhead Concert Lighting Truss & Sweeping Volumetric Stage Cones
    const topGantry = MeshBuilder.CreateBox(
      'awardTopGantry',
      { width: 15.8, height: 0.36, depth: 0.42 },
      scene
    );
    topGantry.position.set(0, 6.4, 4.3);
    topGantry.parent = rootNode;
    topGantry.material = obsidianMat;

    const beamMat = registerMat('beamMat');
    beamMat.albedoColor = Color3.FromHexString('#FDE047');
    beamMat.emissiveColor = Color3.FromHexString('#F59E0B').scale(0.55);
    beamMat.alpha = 0.14;
    beamMat.roughness = 0.9;

    const beamL = MeshBuilder.CreateCylinder(
      'beamL',
      { height: 8.5, diameterTop: 0.22, diameterBottom: 3.2, tessellation: 16 },
      scene
    );
    beamL.position.set(-4.8, 4.2, 4.2);
    beamL.parent = rootNode;
    beamL.material = beamMat;

    const beamR = MeshBuilder.CreateCylinder(
      'beamR',
      { height: 8.5, diameterTop: 0.22, diameterBottom: 3.2, tessellation: 16 },
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
    registerMat: (name: string) => PBRMaterial,
    animatedNodes: Array<(elapsed: number) => void>
  ): void {
    const steelMat = registerMat('steelMat');
    steelMat.albedoColor = Color3.FromHexString('#475569');
    steelMat.metallic = 0.78;
    steelMat.roughness = 0.3;

    const darkIronMat = registerMat('darkIronMat');
    darkIronMat.albedoColor = Color3.FromHexString('#1E293B');
    darkIronMat.metallic = 0.68;
    darkIronMat.roughness = 0.36;

    const hazardMat = registerMat('hazardMat');
    hazardMat.albedoColor = Color3.FromHexString('#F59E0B');
    hazardMat.roughness = 0.42;
    hazardMat.metallic = 0.25;

    const sandstoneMat = registerMat('sandstoneMat');
    sandstoneMat.albedoColor = Color3.FromHexString('#785A3C');
    sandstoneMat.roughness = 0.72;
    sandstoneMat.metallic = 0.08;

    const warmLampMat = registerMat('warmLampMat');
    warmLampMat.albedoColor = Color3.FromHexString('#FEF08A');
    warmLampMat.emissiveColor = Color3.FromHexString('#F59E0B').scale(0.85);
    warmLampMat.roughness = 0.2;

    // 1. Studio Safety Hazard Stripes & Cable Ramp along Stage Deck
    for (let s = -6; s <= 6; s += 2) {
      const hazardTile = MeshBuilder.CreateBox(
        `hazardStripe_${s}`,
        { width: 0.85, height: 0.022, depth: 0.26 },
        scene
      );
      hazardTile.position.set(s * 1.15, 0.011, -3.25);
      hazardTile.parent = rootNode;
      hazardTile.material = hazardMat;
    }

    // 2. Background Dolly Track Rails & Cross-Ties (Z = 3.7..4.1)
    for (const zRail of [3.7, 4.1]) {
      const rail = MeshBuilder.CreateBox(
        `dollyRail_${zRail}`,
        { width: 15.2, height: 0.06, depth: 0.08 },
        scene
      );
      rail.position.set(0, 0.03, zRail);
      rail.parent = rootNode;
      rail.material = steelMat;
    }

    for (let tie = -7; tie <= 7; tie++) {
      const sleeper = MeshBuilder.CreateBox(
        `dollyTie_${tie}`,
        { width: 0.16, height: 0.03, depth: 0.56 },
        scene
      );
      sleeper.position.set(tie * 1.0, 0.015, 3.9);
      sleeper.parent = rootNode;
      sleeper.material = darkIronMat;
    }

    // 3. Backlot Movie Set Facades (Neo-Classical Palace Archways on Left/Right Wings)
    for (const side of [-1, 1]) {
      const facadeRoot = new TransformNode(`setFacade_${side}`, scene);
      facadeRoot.parent = rootNode;
      facadeRoot.position.set(side * 6.5, 0, 5.2);
      facadeRoot.rotation.y = side * -0.18;

      const facadeWall = MeshBuilder.CreateBox(
        `facadeWall_${side}`,
        { width: 4.4, height: 5.2, depth: 0.45 },
        scene
      );
      facadeWall.position.y = 2.6;
      facadeWall.parent = facadeRoot;
      facadeWall.material = sandstoneMat;

      const cornice = MeshBuilder.CreateBox(
        `facadeCornice_${side}`,
        { width: 4.8, height: 0.38, depth: 0.68 },
        scene
      );
      cornice.position.y = 5.35;
      cornice.parent = facadeRoot;
      cornice.material = hazardMat;

      for (const colOffset of [-1.5, 1.5]) {
        const pillar = MeshBuilder.CreateCylinder(
          `facadePillar_${side}_${colOffset}`,
          { height: 5.0, diameterTop: 0.42, diameterBottom: 0.48, tessellation: 14 },
          scene
        );
        pillar.position.set(colOffset, 2.5, -0.25);
        pillar.parent = facadeRoot;
        pillar.material = sandstoneMat;
      }
    }

    // Soundstage Acoustic Back Wall & Giant Cyclorama Screen (Z = 7.9)
    const soundstageWall = MeshBuilder.CreateBox(
      'soundstageBackWall',
      { width: 18.5, height: 7.4, depth: 0.4 },
      scene
    );
    soundstageWall.position.set(0, 3.5, 7.9);
    soundstageWall.parent = rootNode;
    soundstageWall.material = darkIronMat;

    // 4. Overhead Soundstage Truss Pillars, Catwalk Beam & Studio Spotlights
    for (const side of [-1, 1]) {
      const pillar = MeshBuilder.CreateBox(
        `trussPillar_${side}`,
        { width: 0.48, height: 6.4, depth: 0.48 },
        scene
      );
      pillar.position.set(side * 7.4, 3.2, 4.45);
      pillar.parent = rootNode;
      pillar.material = steelMat;
    }

    const topTruss = MeshBuilder.CreateBox(
      'topTruss',
      { width: 15.6, height: 0.48, depth: 0.58 },
      scene
    );
    topTruss.position.set(0, 6.15, 4.45);
    topTruss.parent = rootNode;
    topTruss.material = steelMat;

    // Studio Spotlights mounted on Top Truss
    for (let i = -2; i <= 2; i++) {
      const lampHousing = MeshBuilder.CreateCylinder(
        `trussLamp_${i}`,
        { height: 0.46, diameterTop: 0.28, diameterBottom: 0.46, tessellation: 14 },
        scene
      );
      lampHousing.position.set(i * 2.8, 5.75, 4.2);
      lampHousing.rotation.x = -0.35;
      lampHousing.parent = rootNode;
      lampHousing.material = darkIronMat;

      const lampLens = MeshBuilder.CreateSphere(
        `trussLampLens_${i}`,
        { diameter: 0.34, segments: 10 },
        scene
      );
      lampLens.position.set(i * 2.8, 5.58, 4.08);
      lampLens.parent = rootNode;
      lampLens.material = i % 2 === 0 ? cyanMat : warmLampMat;
    }

    // 5. Tripod Studio Fresnel Floodlight Towers on Stage Wings
    for (const side of [-1, 1]) {
      const standRoot = new TransformNode(`floodStand_${side}`, scene);
      standRoot.parent = rootNode;
      standRoot.position.set(side * 5.8, 0, 3.35);

      const mast = MeshBuilder.CreateCylinder(
        `floodMast_${side}`,
        { height: 2.6, diameterTop: 0.08, diameterBottom: 0.14, tessellation: 10 },
        scene
      );
      mast.position.y = 1.3;
      mast.parent = standRoot;
      mast.material = steelMat;

      const headBox = MeshBuilder.CreateBox(
        `floodHead_${side}`,
        { width: 0.62, height: 0.48, depth: 0.38 },
        scene
      );
      headBox.position.y = 2.68;
      headBox.rotation.y = side * -0.35;
      headBox.parent = standRoot;
      headBox.material = darkIronMat;

      const glowFace = MeshBuilder.CreateBox(
        `floodGlow_${side}`,
        { width: 0.5, height: 0.36, depth: 0.06 },
        scene
      );
      glowFace.position.set(0, 2.68, -0.18);
      glowFace.rotation.y = side * -0.35;
      glowFace.parent = standRoot;
      glowFace.material = side < 0 ? cyanMat : warmLampMat;
    }

    // 6. Articulated Multi-Part 3D Camera Crane Rig that pans smoothly across the fight
    const craneBase = new TransformNode('craneBase', scene);
    craneBase.parent = rootNode;
    craneBase.position.set(-4.5, 0, 3.9);

    const dollyCart = MeshBuilder.CreateBox(
      'dollyCart',
      { width: 1.55, height: 0.36, depth: 1.05 },
      scene
    );
    dollyCart.position.y = 0.22;
    dollyCart.parent = craneBase;
    dollyCart.material = hazardMat;

    const turretColumn = MeshBuilder.CreateCylinder(
      'craneTurretColumn',
      { height: 0.95, diameter: 0.36, tessellation: 12 },
      scene
    );
    turretColumn.position.y = 0.85;
    turretColumn.parent = craneBase;
    turretColumn.material = darkIronMat;

    const jibPivot = new TransformNode('jibPivot', scene);
    jibPivot.parent = craneBase;
    jibPivot.position.y = 1.25;

    const counterweight = MeshBuilder.CreateBox(
      'craneCounterweight',
      { width: 0.65, height: 0.45, depth: 0.42 },
      scene
    );
    counterweight.position.set(-0.85, -0.25, 0);
    counterweight.parent = jibPivot;
    counterweight.material = darkIronMat;

    const jibArm = MeshBuilder.CreateBox(
      'jibArm',
      { width: 4.8, height: 0.22, depth: 0.22 },
      scene
    );
    jibArm.position.set(1.5, 0.78, 0);
    jibArm.rotation.z = 0.34;
    jibArm.parent = jibPivot;
    jibArm.material = steelMat;

    const cameraBox = MeshBuilder.CreateBox(
      'cinemaCamera3D',
      { width: 0.6, height: 0.44, depth: 0.68 },
      scene
    );
    cameraBox.position.set(3.65, 1.56, -0.2);
    cameraBox.parent = jibPivot;
    cameraBox.material = darkIronMat;

    const lensHood = MeshBuilder.CreateCylinder(
      'cinemaCameraLens',
      { height: 0.34, diameterTop: 0.34, diameterBottom: 0.22, tessellation: 14 },
      scene
    );
    lensHood.position.set(3.65, 1.56, -0.64);
    lensHood.rotation.x = Math.PI * 0.5;
    lensHood.parent = jibPivot;
    lensHood.material = cyanMat;

    animatedNodes.push((t) => {
      craneBase.position.x = -2.4 + Math.sin(t * 0.55) * 2.8;
      jibPivot.rotation.y = Math.sin(t * 0.9) * 0.32;
    });
  }
}
