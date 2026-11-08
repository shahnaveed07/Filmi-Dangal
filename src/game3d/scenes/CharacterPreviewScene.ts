import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { CHARACTERS } from '../../data/characters';
import { FighterId, FighterStateName } from '../../types/fighter';
import { CharacterAnimationController } from '../animation/CharacterAnimationController';
import { FighterAnimationEventPayload } from '../animation/FighterAnimationEvents';
import { CharacterAssetValidationReport } from '../assets/CharacterAssetValidator';
import { CharacterAssetLoadDiagnostics } from '../assets/CharacterAssetLoader';
import { CharacterRig3D, loadCharacterRig3D } from '../assets/AssetLoader3D';
import { detectSoftwareWebGL } from '../engine/BabylonFightEngine';
import { VFXManager3D } from '../vfx/VFXManager3D';

/**
 * CharacterPreviewScene
 *
 * Dedicated Babylon.js 3D Character Preview & Vertical Slice Verification Scene.
 * - Loads GLB 2.0 character assets via CharacterAssetLoader & validates via CharacterAssetValidator
 * - Protects against rapid character switching via async load tokens
 * - Plays back Idle, Walk, Punch, Kick, Block, Jump, SuperShot, and SuperMove animations
 * - Renders live bone-attached 3D active hitbox spheres, 3D SuperShot projectile VFX,
 *   and 3D SuperMove shockwave VFX triggered by FighterAnimationEvents
 */

export interface PreviewTelemetrySnapshot {
  characterId: FighterId;
  isLoading: boolean;
  glbLoaded: boolean;
  glbFileValid: boolean;
  productionRigValid: boolean;
  animationValid: boolean;
  isPlaceholderAsset: boolean;
  validationReport: CharacterAssetValidationReport | null;
  diagnostics: CharacterAssetLoadDiagnostics | null;
  loadError: string | null;
  activeState: FighterStateName;
  activeClipName: string;
  phase: 'IDLE_LOOP' | 'STARTUP' | 'ACTIVE' | 'RECOVERY';
  frame: number;
  totalFrames: number;
  activeBone?: string;
  facialExpression: string;
  renderMode: 'stylized' | 'graybox';
  lodLevel: 0 | 1 | 2;
}

export class CharacterPreviewScene {
  private engine: Engine;
  private scene: Scene;
  private camera: UniversalCamera;
  private animController = new CharacterAnimationController();
  private vfxManager: VFXManager3D;
  private currentRig: CharacterRig3D | null = null;
  private validationReport: CharacterAssetValidationReport | null = null;
  private loadToken = 0;
  private isLoading = false;
  private loadError: string | null = null;

  private characterId: FighterId;
  private activeState: FighterStateName = 'idle';
  private stateElapsedSec = 0;
  private stateDurationSec = 0; // 0 = continuous loop (Idle / Walk / Block)
  private renderMode: 'stylized' | 'graybox' = 'stylized';
  private lodLevel: 0 | 1 | 2 = 0;

  private activeHitboxSphere: Mesh;
  private previewProjectileMesh: Mesh;
  private previewShockwaveRing: Mesh;
  private ringMat: PBRMaterial;
  private projMat: PBRMaterial;
  private shockMat: PBRMaterial;
  private projectileLifeSec = 0;
  private shockwaveLifeSec = 0;

  private isDisposed = false;
  private onTelemetryUpdate?: (snap: PreviewTelemetrySnapshot) => void;
  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    initialCharacterId: FighterId,
    onTelemetryUpdate?: (snap: PreviewTelemetrySnapshot) => void,
    existingEngine?: Engine
  ) {
    this.characterId = initialCharacterId;
    this.onTelemetryUpdate = onTelemetryUpdate;

    if (existingEngine) {
      this.engine = existingEngine;
    } else {
      const isSoftwareGL = detectSoftwareWebGL(canvas);
      this.engine = new Engine(canvas, !isSoftwareGL, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      if (isSoftwareGL) {
        this.engine.setHardwareScalingLevel(1);
      }
    }

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.06, 0.05, 0.11, 1);
    this.vfxManager = new VFXManager3D(this.scene);

    // Centered full-body framing that prevents clipping head (Y~2.1) or pedestal feet (Y~-0.14)
    this.camera = new UniversalCamera(
      'previewCam',
      new Vector3(0, 1.15, -3.85),
      this.scene
    );
    this.camera.fov = 0.64;
    this.camera.setTarget(new Vector3(0, 1.02, 0));

    const hemi = new HemisphericLight('prevHemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.98;
    hemi.diffuse = new Color3(1, 0.96, 0.88);
    hemi.groundColor = new Color3(0.24, 0.2, 0.32);

    const key = new DirectionalLight(
      'prevKey',
      new Vector3(-0.4, -0.8, 0.5).normalize(),
      this.scene
    );
    key.intensity = 1.65;

    const charDef = CHARACTERS[initialCharacterId] || CHARACTERS.action_sultan;

    // 3D Stage Pedestal (Ground Origin Y = 0)
    const pedMat = new PBRMaterial('pedMat', this.scene);
    pedMat.albedoColor = Color3.FromHexString('#1E1B2E');
    pedMat.metallic = 0.55;
    pedMat.roughness = 0.25;

    this.ringMat = new PBRMaterial('ringMat', this.scene);
    this.ringMat.albedoColor = Color3.FromHexString(charDef.visuals.primaryColor);
    this.ringMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.6);
    this.ringMat.metallic = 0.7;
    this.ringMat.roughness = 0.2;

    const pedestal = MeshBuilder.CreateCylinder(
      'previewPedestal',
      { height: 0.14, diameterTop: 1.55, diameterBottom: 1.75, tessellation: 24 },
      this.scene
    );
    pedestal.position.y = -0.07;
    pedestal.material = pedMat;

    const glowRing = MeshBuilder.CreateTorus(
      'previewRing',
      { diameter: 1.6, thickness: 0.045, tessellation: 28 },
      this.scene
    );
    glowRing.position.y = 0.01;
    glowRing.material = this.ringMat;

    // Live 3D Hitbox Indicator Sphere (shown during ACTIVE attack frames)
    const hbMat = new PBRMaterial('hbMat', this.scene);
    hbMat.albedoColor = Color3.FromHexString('#EF4444');
    hbMat.emissiveColor = Color3.FromHexString('#EF4444').scale(0.75);
    hbMat.alpha = 0.42;
    hbMat.wireframe = true;
    this.activeHitboxSphere = MeshBuilder.CreateSphere(
      'previewActiveHitbox',
      { diameter: 0.55, segments: 10 },
      this.scene
    );
    this.activeHitboxSphere.material = hbMat;
    this.activeHitboxSphere.isVisible = false;

    // Live 3D SuperShot Projectile Preview Mesh
    this.projMat = new PBRMaterial('projPreviewMat', this.scene);
    this.projMat.albedoColor = Color3.FromHexString(charDef.visuals.secondaryColor);
    this.projMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);
    this.projMat.roughness = 0.15;
    this.previewProjectileMesh = MeshBuilder.CreateTorus(
      'previewProjectile',
      { diameter: 0.48, thickness: 0.12, tessellation: 18 },
      this.scene
    );
    this.previewProjectileMesh.rotation.z = Math.PI * 0.5;
    this.previewProjectileMesh.material = this.projMat;
    this.previewProjectileMesh.isVisible = false;

    // Live 3D SuperMove Shockwave Ring Preview Mesh
    this.shockMat = new PBRMaterial('shockPreviewMat', this.scene);
    this.shockMat.albedoColor = Color3.FromHexString('#FEF08A');
    this.shockMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);
    this.shockMat.alpha = 0.75;
    this.previewShockwaveRing = MeshBuilder.CreateTorus(
      'previewShockwave',
      { diameter: 0.9, thickness: 0.08, tessellation: 24 },
      this.scene
    );
    this.previewShockwaveRing.position.y = 0.06;
    this.previewShockwaveRing.material = this.shockMat;
    this.previewShockwaveRing.isVisible = false;

    // Subscribe to FighterAnimationEvents for character-specific SuperShot & SuperMove VFX triggers
    this.animController.getEventsDispatcher().onEvent((evt) => {
      if (this.isDisposed) return;
      if (evt.type === 'ON_CHARGE_START' && evt.state === 'super_shot') {
        this.vfxManager.spawnSuperShotChargeVFX(this.characterId, { x: 0, y: 0, z: 0 }, 1);
      } else if (evt.type === 'ON_PROJECTILE_RELEASE' && evt.state === 'super_shot') {
        this.vfxManager.spawnSuperShotReleaseVFX(this.characterId, { x: 0, y: 0, z: 0 }, 1);
        this.projectileLifeSec = 0.55;
        this.previewProjectileMesh.position.set(0.35, 1.15, -0.2);
        this.previewProjectileMesh.isVisible = true;
      } else if (
        evt.type === 'ON_SUPERMOVE_PHASE' &&
        (evt.superMovePhase === 'BURST_ENGAGE' || evt.superMovePhase === 'CLIMAX_IMPACT')
      ) {
        this.shockwaveLifeSec = 0.65;
        this.previewShockwaveRing.scaling.setAll(0.6);
        this.previewShockwaveRing.isVisible = true;
      }
    });

    void this.loadCharacterAsset(initialCharacterId);

    let lastTime = performance.now();
    let turntableAngle = 0;

    this.engine.runRenderLoop(() => {
      if (this.isDisposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      this.stateElapsedSec += dt;
      if (this.stateDurationSec > 0 && this.stateElapsedSec >= this.stateDurationSec) {
        this.activeState = 'idle';
        this.stateElapsedSec = 0;
        this.stateDurationSec = 0;
      }

      if (this.currentRig) {
        // Bounded jump vertical arc in preview so head never clips top of viewport
        if (this.activeState === 'jump') {
          const jumpProgress = Math.min(1, this.stateElapsedSec / Math.max(0.01, this.stateDurationSec));
          this.currentRig.rootNode.position.y = Math.sin(jumpProgress * Math.PI) * 0.42;
        } else {
          this.currentRig.rootNode.position.y = 0;
        }

        const evtPayload: FighterAnimationEventPayload = this.animController.updateRigPose(
          this.currentRig,
          this.characterId,
          this.activeState,
          this.stateElapsedSec,
          dt,
          1,
          0
        );

        // Gently rotate character in 3/4 view so 3D depth, strike extension, and costume are clear
        turntableAngle += dt * 0.95;
        const baseYaw =
          this.activeState === 'idle' || this.activeState === 'walk'
            ? Math.PI + Math.sin(turntableAngle) * 0.36
            : Math.PI - 0.52;
        this.currentRig.facingNode.rotation.y = baseYaw;

        // Update active bone-attached hitbox sphere
        if (evtPayload.phase === 'ACTIVE' && evtPayload.activeBone) {
          const bonePos = this.animController.getSocketWorldPosition(
            this.currentRig,
            evtPayload.activeBone
          );
          this.activeHitboxSphere.position.copyFrom(bonePos);
          const diameter = (evtPayload.hitboxRadius || 0.34) * 1.6;
          this.activeHitboxSphere.scaling.setAll(diameter);
          this.activeHitboxSphere.isVisible = true;
        } else {
          this.activeHitboxSphere.isVisible = false;
        }

        this.onTelemetryUpdate?.({
          characterId: this.characterId,
          isLoading: this.isLoading,
          glbLoaded: this.currentRig.glbLoaded,
          glbFileValid: this.currentRig.glbFileValid,
          productionRigValid: this.currentRig.productionRigValid,
          animationValid: this.currentRig.animationValid,
          isPlaceholderAsset: this.currentRig.isPlaceholderAsset,
          validationReport: this.validationReport,
          diagnostics: this.currentRig.diagnostics ?? null,
          loadError: this.loadError,
          activeState: this.activeState,
          activeClipName: evtPayload.clipName,
          phase: evtPayload.phase,
          frame: evtPayload.frame,
          totalFrames: evtPayload.totalFrames,
          activeBone: evtPayload.activeBone,
          facialExpression: evtPayload.facialExpression,
          renderMode: this.renderMode,
          lodLevel: this.lodLevel,
        });
      }

      // Step preview SuperShot projectile
      if (this.projectileLifeSec > 0) {
        this.projectileLifeSec = Math.max(0, this.projectileLifeSec - dt);
        this.previewProjectileMesh.position.x += dt * 2.4;
        this.previewProjectileMesh.position.z -= dt * 1.4;
        this.previewProjectileMesh.rotation.x += dt * 12;
        if (this.projectileLifeSec <= 0) {
          this.previewProjectileMesh.isVisible = false;
        }
      }

      // Step preview SuperMove shockwave
      if (this.shockwaveLifeSec > 0) {
        this.shockwaveLifeSec = Math.max(0, this.shockwaveLifeSec - dt);
        const s = 0.6 + (0.65 - this.shockwaveLifeSec) * 2.8;
        this.previewShockwaveRing.scaling.set(s, 1, s);
        if (this.shockwaveLifeSec <= 0) {
          this.previewShockwaveRing.isVisible = false;
        }
      }

      glowRing.rotation.y += dt * 0.8;
      this.vfxManager.syncProjectiles([], dt);
      this.scene.render();
    });

    this.boundResize = () => {
      if (!this.isDisposed) this.engine.resize();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
    }
    if (typeof ResizeObserver !== 'undefined' && canvas) {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.isDisposed) {
          this.engine.resize();
        }
      });
      this.resizeObserver.observe(canvas);
    }
  }

  public async loadCharacterAsset(characterId: FighterId): Promise<CharacterRig3D | null> {
    const token = ++this.loadToken;
    this.characterId = characterId;
    this.isLoading = true;
    this.loadError = null;

    const charDef = CHARACTERS[characterId] || CHARACTERS.action_sultan;

    // Update accent colors on pedestal ring & preview VFX for the newly selected character
    this.ringMat.albedoColor = Color3.FromHexString(charDef.visuals.primaryColor);
    this.ringMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.6);
    this.projMat.albedoColor = Color3.FromHexString(charDef.visuals.secondaryColor);
    this.projMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);
    this.shockMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);

    try {
      const rig = await loadCharacterRig3D(this.scene, charDef, `preview_${token}`, null);
      if (this.isDisposed || token !== this.loadToken) {
        rig.dispose();
        return null;
      }
      this.currentRig?.dispose();
      this.currentRig = rig;
      this.currentRig.setRenderMode(this.renderMode);
      this.currentRig.setLODLevel(this.lodLevel);
      this.activeState = 'idle';
      this.stateElapsedSec = 0;
      this.stateDurationSec = 0;
      this.isLoading = false;
      return rig;
    } catch (err) {
      if (!this.isDisposed && token === this.loadToken) {
        this.loadError = err instanceof Error ? err.message : String(err);
        this.isLoading = false;
      }
      return null;
    }
  }

  public getCurrentRig(): CharacterRig3D | null {
    return this.currentRig;
  }

  public getLoadToken(): number {
    return this.loadToken;
  }

  public triggerAnimationState(state: FighterStateName): void {
    this.activeState = state;
    this.stateElapsedSec = 0;

    if (state === 'idle' || state === 'walk' || state === 'block') {
      this.stateDurationSec = 0; // loop continuously until changed
    } else if (state === 'punch') {
      this.stateDurationSec = 0.45;
    } else if (state === 'kick') {
      this.stateDurationSec = 0.55;
    } else if (state === 'jump') {
      this.stateDurationSec = 0.65;
    } else if (state === 'super_shot') {
      this.stateDurationSec = 0.85;
    } else if (state === 'super_move') {
      this.stateDurationSec = 1.15;
    } else {
      this.stateDurationSec = 0.6;
    }
  }

  public setRenderMode(mode: 'stylized' | 'graybox'): void {
    this.renderMode = mode;
    this.currentRig?.setRenderMode(mode);
  }

  public setLODLevel(level: 0 | 1 | 2): void {
    this.lodLevel = level;
    this.currentRig?.setLODLevel(level);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.loadToken++;
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.vfxManager.dispose();
    this.currentRig?.dispose();
    this.currentRig = null;
    this.scene.dispose();
    this.engine.dispose();
  }
}
