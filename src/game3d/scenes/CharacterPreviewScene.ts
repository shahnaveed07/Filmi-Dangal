import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  NullEngine,
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
import {
  CharacterAssetLoadDiagnostics,
  CharacterRenderState,
} from '../assets/CharacterAssetLoader';
import { CharacterRig3D, loadCharacterRig3D } from '../assets/AssetLoader3D';
import { detectSoftwareWebGL } from '../engine/BabylonFightEngine';
import { VFXManager3D } from '../vfx/VFXManager3D';

export type PreviewViewportVariant = 'select' | 'overview' | 'hero';

export interface PreviewTelemetrySnapshot {
  characterId: FighterId;
  isLoading: boolean;
  glbLoaded: boolean;
  glbFileValid: boolean;
  productionRigValid: boolean;
  animationValid: boolean;
  isPlaceholderAsset: boolean;
  isVisualOnly?: boolean;
  renderState?: CharacterRenderState;
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

/**
 * Cancellable Preview Audio Timer Manager.
 * Tracks all scheduled preview audio `setTimeout` IDs and ensures pending timers are cancelled:
 * - When a new preview animation state is triggered,
 * - When the selected `characterId` changes,
 * - When the preview component/scene unmounts or disposes.
 */
export class PreviewAudioTimerManager {
  private activeTimers = new Set<ReturnType<typeof setTimeout>>();
  private currentCharacterId: FighterId;
  private isDisposed = false;

  constructor(initialCharacterId: FighterId) {
    this.currentCharacterId = initialCharacterId;
  }

  public setCharacterId(characterId: FighterId): void {
    if (this.currentCharacterId !== characterId) {
      this.currentCharacterId = characterId;
      this.clearAll();
    } else {
      this.currentCharacterId = characterId;
    }
  }

  public getCharacterId(): FighterId {
    return this.currentCharacterId;
  }

  public getPendingTimerCount(): number {
    return this.activeTimers.size;
  }

  public clearAll(): void {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
  }

  public schedule(
    delayMs: number,
    expectedCharacterId: FighterId,
    callback: () => void
  ): ReturnType<typeof setTimeout> | null {
    if (this.isDisposed) return null;
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      if (this.isDisposed || this.currentCharacterId !== expectedCharacterId) {
        return;
      }
      callback();
    }, Math.max(0, delayMs));
    this.activeTimers.add(timerId);
    return timerId;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.clearAll();
  }
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
  private stateDurationSec = 0;
  private renderMode: 'stylized' | 'graybox' = 'stylized';
  private lodLevel: 0 | 1 | 2 = 0;
  private manualYawOffset = 0;
  private autoTurntable = true;

  private activeHitboxSphere: Mesh;
  private previewProjectileMesh: Mesh;
  private previewShockwaveRing: Mesh;
  private ringMat: PBRMaterial;
  private outerRingMat: PBRMaterial;
  private projMat: PBRMaterial;
  private shockMat: PBRMaterial;
  private projectileLifeSec = 0;
  private shockwaveLifeSec = 0;

  private isDisposed = false;
  private onTelemetryUpdate?: (snap: PreviewTelemetrySnapshot) => void;
  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;

  constructor(
    canvas: HTMLCanvasElement | null,
    initialCharacterId: FighterId,
    onTelemetryUpdate?: (snap: PreviewTelemetrySnapshot) => void,
    existingEngine?: Engine,
    variant: PreviewViewportVariant = 'select'
  ) {
    this.characterId = initialCharacterId;
    this.onTelemetryUpdate = onTelemetryUpdate;

    if (existingEngine) {
      this.engine = existingEngine;
    } else if (!canvas) {
      this.engine = new NullEngine();
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
    this.scene.clearColor = new Color4(0.028, 0.018, 0.024, 1);
    this.vfxManager = new VFXManager3D(this.scene);

    // Centered full-body framing that frames head (Y~1.92) to pedestal feet (Y~0)
    const camZ = variant === 'overview' ? -3.3 : variant === 'hero' ? -3.18 : -3.4;
    const camY = variant === 'overview' ? 0.98 : 0.96;
    this.camera = new UniversalCamera(
      'previewCam',
      new Vector3(0, camY, camZ),
      this.scene
    );
    this.camera.fov = variant === 'overview' ? 0.68 : 0.7;
    this.camera.setTarget(new Vector3(0, 0.96, 0));

    // 3-Point Studio Lighting for clear silhouette separation
    const hemi = new HemisphericLight('prevHemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.02;
    hemi.diffuse = new Color3(1, 0.96, 0.88);
    hemi.groundColor = new Color3(0.22, 0.14, 0.14);

    const key = new DirectionalLight(
      'prevKey',
      new Vector3(-0.38, -0.82, 0.45).normalize(),
      this.scene
    );
    key.intensity = 1.85;
    key.diffuse = new Color3(1.0, 0.95, 0.86);

    const rim = new DirectionalLight(
      'prevRim',
      new Vector3(0.3, -0.35, -0.88).normalize(),
      this.scene
    );
    rim.intensity = 1.05;
    rim.diffuse = new Color3(0.98, 0.72, 0.28);

    const charDef = CHARACTERS[initialCharacterId] || CHARACTERS.action_sultan;
    const isHeroVariant = variant === 'hero';
    const ringPrimaryHex = isHeroVariant ? '#F59E0B' : '#EF4444';
    const ringSecondaryHex = isHeroVariant ? '#FACC15' : '#F59E0B';

    // 3D Stage Pedestal (Ground Origin Y = 0)
    const pedMat = new PBRMaterial('pedMat', this.scene);
    pedMat.albedoColor = Color3.FromHexString('#120D10');
    pedMat.metallic = 0.68;
    pedMat.roughness = 0.2;

    this.ringMat = new PBRMaterial('ringMat', this.scene);
    this.ringMat.albedoColor = Color3.FromHexString(ringPrimaryHex);
    this.ringMat.emissiveColor = Color3.FromHexString(ringPrimaryHex).scale(0.9);
    this.ringMat.metallic = 0.75;
    this.ringMat.roughness = 0.16;

    this.outerRingMat = new PBRMaterial('outerRingMat', this.scene);
    this.outerRingMat.albedoColor = Color3.FromHexString(ringSecondaryHex);
    this.outerRingMat.emissiveColor = Color3.FromHexString(ringSecondaryHex).scale(0.65);
    this.outerRingMat.metallic = 0.8;
    this.outerRingMat.roughness = 0.2;

    const pedestal = MeshBuilder.CreateCylinder(
      'previewPedestal',
      { height: 0.16, diameterTop: 1.68, diameterBottom: 1.94, tessellation: 36 },
      this.scene
    );
    pedestal.position.y = -0.08;
    pedestal.material = pedMat;

    const glowRing = MeshBuilder.CreateTorus(
      'previewRing',
      { diameter: 1.7, thickness: 0.052, tessellation: 40 },
      this.scene
    );
    glowRing.position.y = 0.01;
    glowRing.material = this.ringMat;

    const outerRing = MeshBuilder.CreateTorus(
      'previewOuterRing',
      { diameter: 1.98, thickness: 0.028, tessellation: 40 },
      this.scene
    );
    outerRing.position.y = -0.02;
    outerRing.material = this.outerRingMat;

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
      } else if (evt.type === 'ON_GRAB_SLAM_IMPACT') {
        this.vfxManager.spawnGrabSlamDustVFX({ x: 0.45, y: 0, z: 0 });
        this.shockwaveLifeSec = 0.45;
        this.previewShockwaveRing.scaling.setAll(0.5);
        this.previewShockwaveRing.isVisible = true;
      }
    });

    void this.loadCharacterAsset(initialCharacterId);

    let lastTime = performance.now();
    let turntableAngle = 0;

    if (canvas) {
      this.engine.runRenderLoop(() => {
        if (this.isDisposed) return;
        if (typeof document !== 'undefined' && document.hidden) {
          lastTime = performance.now();
          return;
        }
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

      this.stateElapsedSec += dt;
      if (this.stateDurationSec > 0 && this.stateElapsedSec >= this.stateDurationSec) {
        this.activeState = 'idle';
        this.stateElapsedSec = 0;
        this.stateDurationSec = 0;
      }

      if (this.currentRig && this.currentRig.characterId === this.characterId) {
        if (this.activeState === 'jump') {
          const jumpProgress = Math.min(
            1,
            this.stateElapsedSec / Math.max(0.01, this.stateDurationSec)
          );
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

        if (this.autoTurntable) {
          turntableAngle += dt * 0.85;
        }
        const autoSway = this.autoTurntable ? Math.sin(turntableAngle) * 0.34 : 0;
        const baseYaw =
          this.activeState === 'idle' ||
          this.activeState === 'walk' ||
          this.activeState === 'run'
            ? Math.PI + autoSway + this.manualYawOffset
            : Math.PI - 0.48 + this.manualYawOffset;
        this.currentRig.facingNode.rotation.y = baseYaw;

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
          isVisualOnly: this.currentRig.isVisualOnly,
          renderState: this.currentRig.renderState,
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

      if (this.projectileLifeSec > 0) {
        this.projectileLifeSec = Math.max(0, this.projectileLifeSec - dt);
        this.previewProjectileMesh.position.x += dt * 2.4;
        this.previewProjectileMesh.position.z -= dt * 1.4;
        this.previewProjectileMesh.rotation.x += dt * 12;
        if (this.projectileLifeSec <= 0) {
          this.previewProjectileMesh.isVisible = false;
        }
      }

      if (this.shockwaveLifeSec > 0) {
        this.shockwaveLifeSec = Math.max(0, this.shockwaveLifeSec - dt);
        const s = 0.6 + (0.65 - this.shockwaveLifeSec) * 2.8;
        this.previewShockwaveRing.scaling.set(s, 1, s);
        if (this.shockwaveLifeSec <= 0) {
          this.previewShockwaveRing.isVisible = false;
        }
      }

      glowRing.rotation.y += dt * 0.8;
      outerRing.rotation.y -= dt * 0.5;
      this.vfxManager.syncProjectiles([], dt);
      this.scene.render();
      });
    }

    this.boundResize = () => {
      if (this.isDisposed) return;
      if (canvas) {
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        if (w > 0 && h > 0 && (w !== this.lastCanvasWidth || h !== this.lastCanvasHeight)) {
          this.lastCanvasWidth = w;
          this.lastCanvasHeight = h;
          this.engine.resize();
        }
      } else {
        this.engine.resize();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('orientationchange', this.boundResize);
    }
    if (typeof ResizeObserver !== 'undefined' && canvas) {
      this.resizeObserver = new ResizeObserver(() => {
        this.boundResize();
      });
      this.resizeObserver.observe(canvas);
    }
  }

  public rotateModel(deltaYawRad: number): void {
    this.autoTurntable = false;
    this.manualYawOffset += deltaYawRad;
  }

  public resetRotation(): void {
    this.manualYawOffset = 0;
    this.autoTurntable = true;
  }

  public async loadCharacterAsset(characterId: FighterId): Promise<CharacterRig3D | null> {
    const token = ++this.loadToken;
    this.characterId = characterId;
    this.isLoading = true;
    this.loadError = null;
    this.activeState = 'idle';
    this.stateElapsedSec = 0;
    this.stateDurationSec = 0;
    this.manualYawOffset = 0;
    this.autoTurntable = true;
    this.activeHitboxSphere.isVisible = false;
    this.previewProjectileMesh.isVisible = false;
    this.previewShockwaveRing.isVisible = false;

    if (this.currentRig && this.currentRig.characterId !== characterId) {
      this.currentRig.dispose();
      this.currentRig = null;
    }

    const charDef = CHARACTERS[characterId] || CHARACTERS.action_sultan;
    const isHeroVariant = this.camera.position.z === -3.18;
    const ringPrimaryHex = isHeroVariant ? '#F59E0B' : '#EF4444';
    const ringSecondaryHex = isHeroVariant ? '#FACC15' : '#F59E0B';

    this.ringMat.albedoColor = Color3.FromHexString(ringPrimaryHex);
    this.ringMat.emissiveColor = Color3.FromHexString(ringPrimaryHex).scale(0.95);
    this.outerRingMat.albedoColor = Color3.FromHexString(ringSecondaryHex);
    this.outerRingMat.emissiveColor = Color3.FromHexString(ringSecondaryHex).scale(0.7);
    this.projMat.albedoColor = Color3.FromHexString(charDef.visuals.secondaryColor);
    this.projMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);
    this.shockMat.emissiveColor = Color3.FromHexString(charDef.visuals.primaryColor).scale(0.95);

    try {
      await Promise.resolve();
      if (this.isDisposed || token !== this.loadToken) {
        return null;
      }
      const rig = await loadCharacterRig3D(this.scene, charDef, `preview_${token}`, null);
      if (this.isDisposed || token !== this.loadToken) {
        rig.dispose();
        return null;
      }
      this.currentRig?.dispose();
      this.currentRig = rig;
      this.currentRig.setRenderMode(this.renderMode);
      this.currentRig.setLODLevel(this.lodLevel);
      this.isLoading = false;
      if (rig.renderState === 'LOAD_FAILED' && rig.diagnostics?.errors.length) {
        this.loadError = rig.diagnostics.errors.join('; ');
      }
      const evtPayload = this.animController.updateRigPose(
        this.currentRig,
        this.characterId,
        this.activeState,
        0,
        1 / 60,
        1,
        0
      );
      this.onTelemetryUpdate?.({
        characterId: this.characterId,
        isLoading: false,
        glbLoaded: rig.glbLoaded,
        glbFileValid: rig.glbFileValid,
        productionRigValid: rig.productionRigValid,
        animationValid: rig.animationValid,
        isPlaceholderAsset: rig.isPlaceholderAsset,
        isVisualOnly: rig.isVisualOnly,
        renderState: rig.renderState,
        validationReport: this.validationReport,
        diagnostics: rig.diagnostics ?? null,
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

  public getScene(): Scene {
    return this.scene;
  }

  public getLoadToken(): number {
    return this.loadToken;
  }

  public triggerAnimationState(state: FighterStateName): void {
    this.activeState = state;
    this.stateElapsedSec = 0;

    if (
      state === 'idle' ||
      state === 'walk' ||
      state === 'run' ||
      state === 'block'
    ) {
      this.stateDurationSec = 0;
    } else if (state === 'punch') {
      this.stateDurationSec = this.characterId === 'action_sultan' ? 0.4 : 0.45;
    } else if (state === 'kick') {
      this.stateDurationSec = this.characterId === 'action_sultan' ? 0.6 : 0.55;
    } else if (state === 'grab') {
      this.stateDurationSec = this.characterId === 'action_sultan' ? 2.8 : 0.6;
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
    this.engine.stopRenderLoop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('orientationchange', this.boundResize);
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
