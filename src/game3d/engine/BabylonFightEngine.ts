import { Engine, Scene } from '@babylonjs/core';
import { ARENAS } from '../../data/arenas';
import { CHARACTERS } from '../../data/characters';
import { GameBridge, GameHUDState, MatchLifecycleCommand } from '../../engine/GameBridge';
import { EMPTY_INPUT_FRAME } from '../../engine/InputManager';
import { GameSettings, SettingsManager } from '../../engine/SettingsManager';
import { BoneAttachmentName, CharacterDef, InputFrame } from '../../types/fighter';
import { AnimationController3D } from '../animation/AnimationController3D';
import { ArenaBuilder3D, ArenaSceneHandle3D } from '../arenas/ArenaBuilder3D';
import {
  buildFallbackCharacterRig3D,
  CharacterRig3D,
  loadCharacterRig3D,
} from '../assets/AssetLoader3D';
import { AudioManager, AudioManager3D } from '../audio/AudioManager3D';
import { DynamicFightCamera3D } from '../cameras/DynamicFightCamera3D';
import { CombatSystem3D } from '../combat/CombatSystem3D';
import { Fighter3D } from '../combat/Fighter3D';
import { CPUController3D } from '../cpu/CPUController3D';
import { InputManager3D } from '../input/InputManager3D';
import { MatchManager3D } from '../managers/MatchManager3D';
import { VFXManager3D } from '../vfx/VFXManager3D';

export function detectSoftwareWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl || !('getParameter' in gl)) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    );
    return /SwiftShader|llvmpipe|Software|lavapipe/i.test(renderer);
  } catch {
    return false;
  }
}

/**
 * Babylon.js 3D Fighting Game Engine & Scene Coordinator for Filmi Dangal 2.0.
 */
export class BabylonFightEngine {
  private engine: Engine;
  private scene: Scene;
  private cameraController: DynamicFightCamera3D;
  private arenaHandle: ArenaSceneHandle3D;
  private animController = new AnimationController3D();
  private vfxManager: VFXManager3D;

  private p1Rig: CharacterRig3D | null = null;
  private p2Rig: CharacterRig3D | null = null;
  private rigLoadToken = 0;
  private activeRigLoadPromise: Promise<void> | null = null;

  public readonly p1: Fighter3D;
  public readonly p2: Fighter3D;
  public readonly combat = new CombatSystem3D();
  public readonly cpu: CPUController3D;
  public readonly match = new MatchManager3D();

  private frameCount = 0;
  private hitstopTimer = 0;
  private blackoutTimer = 0;
  private announcement = 'ROUND 1';
  private announcementTimerFrames = 90;
  private specialCallout = '';
  private specialCalloutFrames = 0;
  private matchEndTimerFrames = 0;
  private isDisposed = false;
  private isSoftwareGL = false;
  private screenShakeEnabled = true;

  private unsubscribeCommand: () => void;
  private unsubscribePause: () => void;
  private unsubscribeMute: () => void;
  private unsubscribeSettings: () => void;
  private unsubscribeP1AnimEvents: () => void;
  private unsubscribeP2AnimEvents: () => void;
  private boundResize: () => void;
  private boundVisibilityChange: () => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private canvas: HTMLCanvasElement;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;
  private isContextLost = false;
  private onContextLostStateChange?: (lost: boolean) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onContextLostStateChange?: (lost: boolean) => void
  ) {
    this.canvas = canvas;
    this.onContextLostStateChange = onContextLostStateChange;
    this.isSoftwareGL = detectSoftwareWebGL(canvas);

    this.engine = new Engine(canvas, !this.isSoftwareGL, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: 'high-performance',
    });

    this.scene = new Scene(this.engine);
    this.cameraController = new DynamicFightCamera3D(this.scene);

    const bridge = GameBridge.getInstance();
    const settingsMgr = SettingsManager.getInstance();
    const settings = settingsMgr.getSettings();

    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    this.arenaHandle = ArenaBuilder3D.buildArena(
      this.scene,
      bridge.arenaId || 'award_night',
      this.isSoftwareGL || settings.graphicsQuality === 'low'
    );
    this.vfxManager = new VFXManager3D(this.scene);

    this.p1 = new Fighter3D(0, p1Def, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
    this.p2 = new Fighter3D(1, p2Def, MatchManager3D.P2_SPAWN_X_3D, 0, 0);
    this.cpu = new CPUController3D(bridge.difficulty);

    // Connect animation events to character-specific SuperShot charge & release SFX/VFX
    this.unsubscribeP1AnimEvents = this.p1.animEvents.onEvent((evt) => {
      if (evt.type === 'ON_CHARGE_START' && evt.state === 'super_shot') {
        this.vfxManager.spawnSuperShotChargeVFX(this.p1.id, this.p1.position, this.p1.facing);
      } else if (evt.type === 'ON_PROJECTILE_RELEASE' && evt.state === 'super_shot') {
        AudioManager3D.playSuperShotRelease(this.p1.id);
        this.vfxManager.spawnSuperShotReleaseVFX(this.p1.id, this.p1.position, this.p1.facing);
        if (this.p1.id === 'action_sultan' || this.p1.id === 'bhidu') {
          this.addCameraTrauma(0.24);
        }
      }
    });
    this.unsubscribeP2AnimEvents = this.p2.animEvents.onEvent((evt) => {
      if (evt.type === 'ON_CHARGE_START' && evt.state === 'super_shot') {
        this.vfxManager.spawnSuperShotChargeVFX(this.p2.id, this.p2.position, this.p2.facing);
      } else if (evt.type === 'ON_PROJECTILE_RELEASE' && evt.state === 'super_shot') {
        AudioManager3D.playSuperShotRelease(this.p2.id);
        this.vfxManager.spawnSuperShotReleaseVFX(this.p2.id, this.p2.position, this.p2.facing);
        if (this.p2.id === 'action_sultan' || this.p2.id === 'bhidu') {
          this.addCameraTrauma(0.24);
        }
      }
    });

    this.applySettingsToEngine(settings);
    this.initializeFullMatch();

    this.unsubscribeCommand = bridge.subscribeCommand((cmd: MatchLifecycleCommand) => {
      if (this.isDisposed) return;
      if (
        cmd === 'start_match' ||
        cmd === 'reset_match' ||
        cmd === 'restart_match' ||
        cmd === 'rematch'
      ) {
        this.handleRestartMatch();
      } else if (cmd === 'restart_round' || cmd === 'reset_training') {
        this.handleRestartRound();
      }
    });

    this.unsubscribePause = bridge.subscribePause(() => {
      if (!this.isDisposed) this.pushHUDUpdate();
    });

    this.unsubscribeMute = AudioManager.getInstance().subscribeMute(() => {
      if (!this.isDisposed) this.pushHUDUpdate();
    });

    this.unsubscribeSettings = settingsMgr.subscribe((newSettings) => {
      if (!this.isDisposed) {
        this.applySettingsToEngine(newSettings);
      }
    });

    this.boundResize = () => {
      if (this.isDisposed || this.isContextLost) return;
      const w = this.canvas.clientWidth || this.canvas.width;
      const h = this.canvas.clientHeight || this.canvas.height;
      if (w > 0 && h > 0 && (w !== this.lastCanvasWidth || h !== this.lastCanvasHeight)) {
        this.lastCanvasWidth = w;
        this.lastCanvasHeight = h;
        this.engine.resize();
      }
    };

    this.boundVisibilityChange = () => {
      if (this.isDisposed) return;
      if (typeof document !== 'undefined' && document.hidden) {
        InputManager3D.getInstance().clearAll();
      } else {
        this.boundResize();
      }
    };

    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.isContextLost = true;
      InputManager3D.getInstance().clearAll();
      this.onContextLostStateChange?.(true);
    };

    this.boundContextRestored = () => {
      if (this.isDisposed) return;
      this.isContextLost = false;
      this.lastCanvasWidth = 0;
      this.lastCanvasHeight = 0;
      this.boundResize();
      this.onContextLostStateChange?.(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('orientationchange', this.boundResize);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
      document.addEventListener('fullscreenchange', this.boundResize);
    }
    this.canvas.addEventListener('webglcontextlost', this.boundContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.boundContextRestored, false);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.boundResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    this.startLoop();
  }

  public getP1Rig(): CharacterRig3D | null {
    return this.p1Rig;
  }

  public getP2Rig(): CharacterRig3D | null {
    return this.p2Rig;
  }

  public async waitForFighterRigs(): Promise<void> {
    if (this.activeRigLoadPromise) {
      await this.activeRigLoadPromise;
    }
  }

  private applySettingsToEngine(settings: GameSettings): void {
    this.screenShakeEnabled = settings.screenShake;

    if (this.isSoftwareGL) {
      this.engine.setHardwareScalingLevel(1);
    } else if (!settings.resolutionScaling || settings.graphicsQuality === 'low') {
      this.engine.setHardwareScalingLevel(1.25);
    } else if (settings.graphicsQuality === 'medium') {
      this.engine.setHardwareScalingLevel(1.0);
    } else {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.engine.setHardwareScalingLevel(1 / dpr);
    }

    const targetLod: 0 | 1 | 2 =
      settings.graphicsQuality === 'low' ? 2 : settings.graphicsQuality === 'medium' ? 1 : 0;
    this.p1Rig?.setLODLevel(targetLod);
    this.p2Rig?.setLODLevel(targetLod);

    this.p1.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);
    this.p2.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);

    const bridge = GameBridge.getInstance();
    this.match.setConfiguration(settings.roundDurationSeconds, bridge.gameMode);
  }

  private addCameraTrauma(amount: number): void {
    if (this.screenShakeEnabled) {
      this.cameraController.addTrauma(amount);
    }
  }

  private async loadFighterRigs(
    requestedP1Def?: CharacterDef,
    requestedP2Def?: CharacterDef
  ): Promise<void> {
    const loadToken = ++this.rigLoadToken;
    const bridge = GameBridge.getInstance();
    const p1Def = requestedP1Def || CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = requestedP2Def || CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    const safeLoadRig = async (
      def: CharacterDef,
      slotPrefix: string
    ): Promise<CharacterRig3D> => {
      try {
        return await loadCharacterRig3D(
          this.scene,
          def,
          `${slotPrefix}_${loadToken}`,
          this.arenaHandle.shadowGenerator
        );
      } catch (err) {
        console.warn(
          `[BabylonFightEngine] Unexpected error loading ${slotPrefix} (${def.id}); building procedural fallback rig for ${def.id}:`,
          err
        );
        return await buildFallbackCharacterRig3D(
          this.scene,
          def,
          `${slotPrefix}_fallback_${loadToken}`,
          this.arenaHandle.shadowGenerator,
          err
        );
      }
    };

    const [rig1, rig2] = await Promise.all([
      safeLoadRig(p1Def, 'p1'),
      safeLoadRig(p2Def, 'p2'),
    ]);

    if (this.isDisposed || loadToken !== this.rigLoadToken) {
      rig1.dispose();
      rig2.dispose();
      return;
    }

    const prevP1Rig = this.p1Rig;
    const prevP2Rig = this.p2Rig;
    prevP1Rig?.dispose();
    prevP2Rig?.dispose();

    const settings = SettingsManager.getInstance().getSettings();
    const targetLod: 0 | 1 | 2 =
      settings.graphicsQuality === 'low' ? 2 : settings.graphicsQuality === 'medium' ? 1 : 0;
    rig1.setLODLevel(targetLod);
    rig2.setLODLevel(targetLod);

    // Sync initial positions immediately so there is never a single frame at (0,0,0)
    rig1.rootNode.position.set(this.p1.position.x, this.p1.position.y, 0);
    rig2.rootNode.position.set(this.p2.position.x, this.p2.position.y, 0);

    this.p1Rig = rig1;
    this.p2Rig = rig2;

    this.p1.boneWorldPositionProvider = (bone: BoneAttachmentName) => {
      if (!this.p1Rig || this.p1Rig.characterId !== this.p1.id) return null;
      const v = this.animController.getSocketWorldPosition(this.p1Rig, bone);
      return { x: v.x, y: v.y, z: v.z };
    };

    this.p2.boneWorldPositionProvider = (bone: BoneAttachmentName) => {
      if (!this.p2Rig || this.p2Rig.characterId !== this.p2.id) return null;
      const v = this.animController.getSocketWorldPosition(this.p2Rig, bone);
      return { x: v.x, y: v.y, z: v.z };
    };
  }

  public initializeFullMatch(): void {
    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();
    const input = InputManager3D.getInstance();
    const settings = SettingsManager.getInstance().getSettings();

    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    const arenaChanged = this.arenaHandle.arenaId !== bridge.arenaId;
    if (arenaChanged) {
      this.arenaHandle.dispose();
      this.arenaHandle = ArenaBuilder3D.buildArena(
        this.scene,
        bridge.arenaId,
        this.isSoftwareGL || settings.graphicsQuality === 'low'
      );
    }

    const p1RigMismatch = !this.p1Rig || this.p1Rig.characterId !== p1Def.id;
    const p2RigMismatch = !this.p2Rig || this.p2Rig.characterId !== p2Def.id;

    if (
      this.p1.id !== p1Def.id ||
      this.p2.id !== p2Def.id ||
      arenaChanged ||
      p1RigMismatch ||
      p2RigMismatch
    ) {
      if (this.p1Rig && this.p1Rig.characterId !== p1Def.id) {
        this.p1Rig.dispose();
        this.p1Rig = null;
      }
      if (this.p2Rig && this.p2Rig.characterId !== p2Def.id) {
        this.p2Rig.dispose();
        this.p2Rig = null;
      }
      this.p1.setCharacterDef(p1Def);
      this.p2.setCharacterDef(p2Def);
      const loadPromise = this.loadFighterRigs(p1Def, p2Def).finally(() => {
        if (this.activeRigLoadPromise === loadPromise) {
          this.activeRigLoadPromise = null;
        }
      });
      this.activeRigLoadPromise = loadPromise;
    }

    this.p1.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);
    this.p2.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);

    this.cpu.setDifficulty(bridge.difficulty);
    this.match.setConfiguration(settings.roundDurationSeconds, bridge.gameMode);
    this.match.resetMatch(this.p1, this.p2, this.combat, this.cpu);
    input.clearAll();

    this.frameCount = 0;
    this.hitstopTimer = 0;
    this.blackoutTimer = 0;
    this.announcement =
      bridge.gameMode === 'training'
        ? 'TRAINING MODE'
        : bridge.gameMode === 'arcade'
        ? `STAGE ${bridge.arcadeStageIndex + 1} - ROUND 1`
        : 'ROUND 1';
    this.announcementTimerFrames = bridge.gameMode === 'training' ? 40 : 90;
    this.specialCallout = '';
    this.specialCalloutFrames = 0;
    this.matchEndTimerFrames = 0;

    audio.playSound('round');
    this.pushHUDUpdate();
  }

  public handleRestartMatch(): void {
    this.initializeFullMatch();
  }

  public handleRestartRound(): void {
    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();
    const input = InputManager3D.getInstance();
    const settings = SettingsManager.getInstance().getSettings();

    this.p1.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);
    this.p2.applyGameplaySettings(settings.startingHealthPercent, settings.controlSensitivity);
    this.match.setConfiguration(settings.roundDurationSeconds, bridge.gameMode);
    this.match.restartCurrentRound(this.p1, this.p2, this.combat, this.cpu);
    input.clearAll();
    this.hitstopTimer = 0;
    this.blackoutTimer = 0;
    this.announcement =
      bridge.gameMode === 'training' ? 'POSITIONS RESET' : `ROUND ${this.match.currentRound}`;
    this.announcementTimerFrames = bridge.gameMode === 'training' ? 35 : 90;
    this.specialCallout = '';
    this.specialCalloutFrames = 0;
    this.matchEndTimerFrames = 0;

    audio.playSound('round');
    this.pushHUDUpdate();
  }

  private computeTrainingDummyInput(): InputFrame {
    const bridge = GameBridge.getInstance();
    const behavior = bridge.trainingDummyBehavior;
    if (behavior === 'cpu_spar') {
      return this.cpu.computeInput(
        this.p2,
        this.p1,
        this.combat.projectileManager.getActiveProjectiles()
      );
    }
    if (behavior === 'crouch') {
      return { ...EMPTY_INPUT_FRAME, crouch: true, down: true };
    }
    if (behavior === 'block') {
      return { ...EMPTY_INPUT_FRAME, block: true };
    }
    if (behavior === 'jump') {
      const shouldJump = this.p2.isGrounded && this.frameCount % 50 === 0;
      return {
        ...EMPTY_INPUT_FRAME,
        jump: shouldJump,
        up: shouldJump,
        jumpJustPressed: shouldJump,
        upJustPressed: shouldJump,
      };
    }
    return { ...EMPTY_INPUT_FRAME };
  }

  private pushHUDUpdate(): void {
    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();

    const hudState: GameHUDState = {
      p1Health: Math.max(0, Math.round(this.p1.health)),
      p1MaxHealth: this.p1.maxHealth,
      p2Health: Math.max(0, Math.round(this.p2.health)),
      p2MaxHealth: this.p2.maxHealth,
      p1Meter: Math.round(this.p1.specialMeter),
      p2Meter: Math.round(this.p2.specialMeter),
      p1Name: this.p1.def.name,
      p2Name: this.p2.def.name,
      p1Wins: this.match.p1RoundWins,
      p2Wins: this.match.p2RoundWins,
      roundTimer: this.match.roundTimeRemaining,
      currentRound: this.match.currentRound,
      phase: this.match.phase,
      comboP1: this.p1.comboCount,
      comboP2: this.p2.comboCount,
      announcementText: this.announcement,
      isPaused: bridge.isPaused,
      isMuted: audio.isMuted,
      debugHitboxes: bridge.debugHitboxes,
      p1SuperShotCooldown: this.p1.superShotCooldownFrames,
      p2SuperShotCooldown: this.p2.superShotCooldownFrames,
      p1SuperMoveName: this.p1.def.superMoveInfo.name,
      p1SuperShotName: this.p1.def.superShotInfo.name,
      activeSpecialCallout: this.specialCallout,
      gameMode: bridge.gameMode,
      arcadeStageNumber: bridge.arcadeStageIndex + 1,
      arcadeTotalStages: bridge.arcadeLadder.length,
      trainingDummyBehavior: bridge.trainingDummyBehavior,
    };

    bridge.notifyHUD(hudState);
  }

  private stepSimulationFrame(): void {
    if (this.isDisposed) return;

    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();
    const input = InputManager3D.getInstance();
    const arenaDef = ARENAS[bridge.arenaId] || ARENAS.award_night;

    const snap = input.pollSnapshot();

    if (snap.pauseJustPressed && this.match.phase !== 'match_end') {
      bridge.togglePause();
      this.pushHUDUpdate();
      return;
    }

    if (snap.muteJustPressed) {
      audio.toggleMute();
      this.pushHUDUpdate();
    }

    if (snap.debugJustPressed) {
      bridge.debugHitboxes = !bridge.debugHitboxes;
      this.pushHUDUpdate();
    }

    if (bridge.isPaused) {
      return;
    }

    this.frameCount++;

    if (this.announcementTimerFrames > 0) {
      this.announcementTimerFrames--;
      if (this.announcementTimerFrames === 0 && this.match.phase === 'fighting') {
        this.announcement = '';
      }
    }

    if (this.specialCalloutFrames > 0) {
      this.specialCalloutFrames--;
      if (this.specialCalloutFrames === 0) {
        this.specialCallout = '';
      }
    }

    if (this.blackoutTimer > 0) {
      this.blackoutTimer = Math.max(0, this.blackoutTimer - 1 / 60);
      this.arenaHandle.setBlackoutIntensity(Math.min(1, this.blackoutTimer * 1.4));
    } else {
      this.arenaHandle.setBlackoutIntensity(0);
    }

    if (this.match.phase === 'match_end' && this.matchEndTimerFrames > 0) {
      this.matchEndTimerFrames--;
      if (this.matchEndTimerFrames === 0) {
        bridge.lastMatchStats = {
          ...this.match.stats,
          roundResults: [...this.match.stats.roundResults],
        };
        bridge.matchWinner = this.match.matchWinner;
        bridge.setScreen('results');
        return;
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer--;
      return;
    }

    // 1. Process Player 1 and CPU / Training Dummy inputs during fighting phase
    if (this.match.phase === 'fighting') {
      const p1InputFrame = input.snapshotToInputFrame(snap);
      const prevP1State = this.p1.state;
      this.p1.processInput(p1InputFrame, this.p2, this.match.phase);
      this.triggerMovePresentationEffects(this.p1, prevP1State, 0);

      const p2InputFrame =
        bridge.gameMode === 'training'
          ? this.computeTrainingDummyInput()
          : this.cpu.computeInput(
              this.p2,
              this.p1,
              this.combat.projectileManager.getActiveProjectiles()
            );
      const prevP2State = this.p2.state;
      this.p2.processInput(p2InputFrame, this.p1, this.match.phase);
      this.triggerMovePresentationEffects(this.p2, prevP2State, 1);
    }

    // 2. Step 3D Fighter Physics & Arena Clamping (also evaluates FighterAnimationEvents)
    this.p1.stepPhysics(arenaDef.bounds3D, 1 / 60);
    this.p2.stepPhysics(arenaDef.bounds3D, 1 / 60);

    // 3. Resolve 3D Pushboxes, Projectiles & Animation-Event-Synchronized Special / Melee Combat
    this.combat.resolvePushboxes3D(this.p1, this.p2, arenaDef.bounds3D);

    if (this.match.phase === 'fighting') {
      const hitEvents = this.combat.updateAndResolveCombat(
        this.p1,
        this.p2,
        1 / 60,
        this.match.phase
      );
      for (const ev of hitEvents) {
        const isP1Attacker = ev.attackerIndex === 0;
        this.match.recordHitEvent(ev, isP1Attacker);
        bridge.emitHit(ev);

        const attackerChar = isP1Attacker ? this.p1.def : this.p2.def;
        this.vfxManager.spawnHitBurst(
          ev.contactPoint3D,
          ev.blocked,
          ev.isSuperMove,
          attackerChar.visuals.primaryColor
        );
        if (ev.isGrab) {
          this.vfxManager.spawnGrabSlamDustVFX(ev.contactPoint3D);
        }

        if (ev.blocked) {
          audio.playSound('block');
          this.addCameraTrauma(0.14);
          this.hitstopTimer = Math.max(this.hitstopTimer, 2);
        } else if (ev.isSuperMove) {
          AudioManager3D.playSuperMoveImpact(ev.attackerId);
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.65);
          this.hitstopTimer = Math.max(this.hitstopTimer, 7);
        } else if (ev.isSuperShot) {
          AudioManager3D.playSuperShotImpact(ev.attackerId);
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.38);
          this.hitstopTimer = Math.max(this.hitstopTimer, 5);
        } else if (ev.isGrab) {
          audio.playSound('dishoom');
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.42);
          this.hitstopTimer = Math.max(this.hitstopTimer, 6);
        } else if (ev.causedKnockdown) {
          audio.playSound('dishoom');
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.38);
          this.hitstopTimer = Math.max(this.hitstopTimer, 5);
        } else if (ev.moveType === 'kick' || ev.moveType === 'sweep') {
          audio.playSound('kick');
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.22);
          this.hitstopTimer = Math.max(this.hitstopTimer, 3);
        } else {
          audio.playSound('punch');
          AudioManager3D.playHitReact(ev.defenderId);
          this.addCameraTrauma(0.18);
          this.hitstopTimer = Math.max(this.hitstopTimer, 3);
        }
      }
      if (hitEvents.length > 0) {
        this.pushHUDUpdate();
      }
    }

    // 4. Advance Round & Match State Machine
    const matchUpdate = this.match.update(this.p1, this.p2, this.combat, this.cpu);
    if (matchUpdate.phaseChanged) {
      if (matchUpdate.newPhase === 'fighting') {
        this.announcement = bridge.gameMode === 'training' ? 'PRACTICE!' : 'FIGHT!';
        this.announcementTimerFrames = 45;
        audio.playSound('fight');
      } else if (matchUpdate.newPhase === 'ko') {
        this.announcement = 'K.O.!';
        this.announcementTimerFrames = 75;
        audio.playSound('ko');
        this.addCameraTrauma(0.6);
      } else if (matchUpdate.newPhase === 'time_over') {
        this.announcement = "TIME'S UP!";
        this.announcementTimerFrames = 90;
        audio.playSound('ko');
      } else if (matchUpdate.newPhase === 'round_intro') {
        this.announcement = `ROUND ${this.match.currentRound}`;
        this.announcementTimerFrames = 90;
        audio.playSound('round');
      } else if (matchUpdate.newPhase === 'match_end') {
        const winnerFighter = this.match.matchWinner === 'p1' ? this.p1 : this.p2;
        const loserFighter = this.match.matchWinner === 'p1' ? this.p2 : this.p1;
        AudioManager3D.playVictory(winnerFighter.id);
        AudioManager3D.playDefeat(loserFighter.id);
        this.announcement = `${winnerFighter.def.name.toUpperCase()} WINS!`;
        this.announcementTimerFrames = 110;
        this.matchEndTimerFrames = 105;
      }
      this.pushHUDUpdate();
    }

    if (this.frameCount % 3 === 0) {
      this.pushHUDUpdate();
    }
  }

  private triggerMovePresentationEffects(
    fighter: Fighter3D,
    prevState: string,
    fighterIndex: 0 | 1
  ): void {
    if (fighter.state === prevState) return;
    const audio = AudioManager.getInstance();

    if (fighter.state === 'super_move' || fighter.state === 'super') {
      AudioManager3D.playSuperMoveCharge(fighter.id);
      this.cameraController.triggerSuperMoveZoom(fighterIndex, 1.15);
      this.vfxManager.spawnSuperMoveSignatureVFX(fighter.id, fighter.position);
      this.specialCallout = `${fighter.def.name.toUpperCase()}: ${fighter.def.superMoveInfo.name}!`;
      this.specialCalloutFrames = 75;
      if (fighter.id === 'bhidu') {
        this.blackoutTimer = 1.25;
      }
      this.pushHUDUpdate();
    } else if (fighter.state === 'super_shot') {
      AudioManager3D.playSuperShotCharge(fighter.id);
      this.specialCallout = `${fighter.def.superShotInfo.name}!`;
      this.specialCalloutFrames = 45;
      this.pushHUDUpdate();
    } else if (fighter.state === 'grab' && fighter.id === 'action_sultan') {
      AudioManager3D.playNormalAttack(fighter.id);
      this.specialCallout = 'DHOBI PACHAD!';
      this.specialCalloutFrames = 55;
      this.pushHUDUpdate();
    } else if (fighter.isAttacking()) {
      AudioManager3D.playNormalAttack(fighter.id);
    } else if (fighter.state === 'jump') {
      audio.playSound('whoosh');
    }
  }

  private sync3DSceneVisuals(dt: number): void {
    const bridge = GameBridge.getInstance();

    if (this.p1Rig) {
      this.p1Rig.rootNode.position.set(this.p1.position.x, this.p1.position.y, 0);
      this.animController.updateRigPose(
        this.p1Rig,
        this.p1.id,
        this.p1.state,
        this.p1.stateFrame / 60,
        dt,
        this.p1.facing,
        0
      );
    }

    if (this.p2Rig) {
      this.p2Rig.rootNode.position.set(this.p2.position.x, this.p2.position.y, 0);
      this.animController.updateRigPose(
        this.p2Rig,
        this.p2.id,
        this.p2.state,
        this.p2.stateFrame / 60,
        dt,
        this.p2.facing,
        0
      );
    }

    // Apply analytical 2-bone arm IK contact during Action Sultan's Dhobi Pachad grab & lift (0.30s - 1.60s)
    if (this.p1Rig && this.p2Rig) {
      if (this.p1.activeGrabTarget === this.p2 && this.p1.state === 'grab') {
        const t = this.p1.stateFrame / 60;
        const sepX = Math.abs(this.p2.position.x - this.p1.position.x);
        const elevY = this.p2.position.y - this.p1.position.y;
        const p1Pose = this.animController.computeTargetPose(this.p1.id, 'grab', t, 1.0, 0);
        const p2Pose = this.animController.computeTargetPose(this.p2.id, 'grabbed', t, 1.0, 0);
        this.animController.applyDhobiPachadContactIK(p1Pose, p2Pose, t, sepX, elevY);
        this.animController.applyProceduralPoseToRigBones(this.p1Rig, p1Pose, 1.0, 0.92);
      } else if (this.p2.activeGrabTarget === this.p1 && this.p2.state === 'grab') {
        const t = this.p2.stateFrame / 60;
        const sepX = Math.abs(this.p1.position.x - this.p2.position.x);
        const elevY = this.p1.position.y - this.p2.position.y;
        const p2Pose = this.animController.computeTargetPose(this.p2.id, 'grab', t, 1.0, 0);
        const p1Pose = this.animController.computeTargetPose(this.p1.id, 'grabbed', t, 1.0, 0);
        this.animController.applyDhobiPachadContactIK(p2Pose, p1Pose, t, sepX, elevY);
        this.animController.applyProceduralPoseToRigBones(this.p2Rig, p2Pose, 1.0, 0.92);
      }
    }

    this.arenaHandle.update(dt);
    this.vfxManager.syncProjectiles(
      this.combat.projectileManager.getActiveProjectiles(),
      dt
    );
    this.vfxManager.updateDebugHitboxes(this.p1, this.p2, bridge.debugHitboxes);
    this.cameraController.update(this.p1, this.p2, dt);
  }

  private startLoop(): void {
    const FIXED_STEP_MS = 1000 / 60;
    const MAX_DELTA_MS = 100;
    let lastTimestamp = performance.now();
    let accumulatorMs = 0;

    this.engine.runRenderLoop(() => {
      if (this.isDisposed || this.isContextLost) return;

      if (typeof document !== 'undefined' && document.hidden) {
        lastTimestamp = performance.now();
        accumulatorMs = 0;
        return;
      }

      const now = performance.now();
      const rawDelta = Math.max(0, now - lastTimestamp);
      lastTimestamp = now;
      accumulatorMs += Math.min(rawDelta, MAX_DELTA_MS);

      let steps = 0;
      while (accumulatorMs >= FIXED_STEP_MS && steps < 6) {
        this.stepSimulationFrame();
        accumulatorMs -= FIXED_STEP_MS;
        steps++;
      }

      const dtSeconds = Math.min(0.05, rawDelta / 1000 || 1 / 60);
      this.sync3DSceneVisuals(dtSeconds);
      this.scene.render();
    });
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.rigLoadToken++;
    this.engine.stopRenderLoop();
    this.unsubscribeCommand();
    this.unsubscribePause();
    this.unsubscribeMute();
    this.unsubscribeSettings();
    this.unsubscribeP1AnimEvents();
    this.unsubscribeP2AnimEvents();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('orientationchange', this.boundResize);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      document.removeEventListener('fullscreenchange', this.boundResize);
    }
    this.canvas.removeEventListener('webglcontextlost', this.boundContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestored, false);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    InputManager3D.getInstance().clearAll();
    this.vfxManager.dispose();
    this.p1Rig?.dispose();
    this.p2Rig?.dispose();
    this.arenaHandle.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
