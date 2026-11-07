import { Engine, Scene } from '@babylonjs/core';
import { ARENAS } from '../../data/arenas';
import { CHARACTERS } from '../../data/characters';
import { GameBridge, GameHUDState, MatchLifecycleCommand } from '../../engine/GameBridge';
import { BoneAttachmentName } from '../../types/fighter';
import { AnimationController3D } from '../animation/AnimationController3D';
import { ArenaBuilder3D, ArenaSceneHandle3D } from '../arenas/ArenaBuilder3D';
import { CharacterRig3D, loadCharacterRig3D } from '../assets/AssetLoader3D';
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

  private unsubscribeCommand: () => void;
  private unsubscribePause: () => void;
  private unsubscribeMute: () => void;
  private boundResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.isSoftwareGL = detectSoftwareWebGL(canvas);

    this.engine = new Engine(canvas, !this.isSoftwareGL, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: 'high-performance',
    });

    if (this.isSoftwareGL) {
      this.engine.setHardwareScalingLevel(1);
    } else {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.engine.setHardwareScalingLevel(1 / dpr);
    }

    this.scene = new Scene(this.engine);
    this.cameraController = new DynamicFightCamera3D(this.scene);

    const bridge = GameBridge.getInstance();
    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    this.arenaHandle = ArenaBuilder3D.buildArena(
      this.scene,
      bridge.arenaId || 'award_night',
      this.isSoftwareGL
    );
    this.vfxManager = new VFXManager3D(this.scene);

    this.p1 = new Fighter3D(0, p1Def, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
    this.p2 = new Fighter3D(1, p2Def, MatchManager3D.P2_SPAWN_X_3D, 0, 0);
    this.cpu = new CPUController3D(bridge.difficulty);

    this.loadFighterRigs();
    this.initializeFullMatch();

    this.unsubscribeCommand = bridge.subscribeCommand((cmd: MatchLifecycleCommand) => {
      if (this.isDisposed) return;
      if (cmd === 'start_match' || cmd === 'reset_match' || cmd === 'rematch') {
        this.initializeFullMatch();
      } else if (cmd === 'restart_round') {
        this.handleRestartRound();
      }
    });

    this.unsubscribePause = bridge.subscribePause(() => {
      if (!this.isDisposed) this.pushHUDUpdate();
    });

    this.unsubscribeMute = AudioManager.getInstance().subscribeMute(() => {
      if (!this.isDisposed) this.pushHUDUpdate();
    });

    this.boundResize = () => {
      if (!this.isDisposed) {
        this.engine.resize();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
    }

    this.startLoop();
  }

  private async loadFighterRigs(): Promise<void> {
    const bridge = GameBridge.getInstance();
    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    this.p1Rig?.dispose();
    this.p2Rig?.dispose();

    const [rig1, rig2] = await Promise.all([
      loadCharacterRig3D(this.scene, p1Def, 'p1', this.arenaHandle.shadowGenerator),
      loadCharacterRig3D(this.scene, p2Def, 'p2', this.arenaHandle.shadowGenerator),
    ]);

    if (this.isDisposed) {
      rig1.dispose();
      rig2.dispose();
      return;
    }

    this.p1Rig = rig1;
    this.p2Rig = rig2;

    this.p1.boneWorldPositionProvider = (bone: BoneAttachmentName) => {
      if (!this.p1Rig) return null;
      const v = this.animController.getSocketWorldPosition(this.p1Rig, bone);
      return { x: v.x, y: v.y, z: v.z };
    };

    this.p2.boneWorldPositionProvider = (bone: BoneAttachmentName) => {
      if (!this.p2Rig) return null;
      const v = this.animController.getSocketWorldPosition(this.p2Rig, bone);
      return { x: v.x, y: v.y, z: v.z };
    };
  }

  public initializeFullMatch(): void {
    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();
    const input = InputManager3D.getInstance();

    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;

    if (this.p1.id !== p1Def.id || this.p2.id !== p2Def.id) {
      this.p1.setCharacterDef(p1Def);
      this.p2.setCharacterDef(p2Def);
      this.loadFighterRigs();
    }

    if (this.arenaHandle.arenaId !== bridge.arenaId) {
      this.arenaHandle.dispose();
      this.arenaHandle = ArenaBuilder3D.buildArena(
        this.scene,
        bridge.arenaId,
        this.isSoftwareGL
      );
    }

    this.cpu.setDifficulty(bridge.difficulty);
    this.match.resetMatch(this.p1, this.p2, this.combat, this.cpu);
    input.clearAll();

    this.frameCount = 0;
    this.hitstopTimer = 0;
    this.blackoutTimer = 0;
    this.announcement = 'ROUND 1';
    this.announcementTimerFrames = 90;
    this.specialCallout = '';
    this.specialCalloutFrames = 0;
    this.matchEndTimerFrames = 0;

    audio.playSound('round');
    this.pushHUDUpdate();
  }

  public handleRestartRound(): void {
    const audio = AudioManager.getInstance();
    const input = InputManager3D.getInstance();

    this.match.restartCurrentRound(this.p1, this.p2, this.combat, this.cpu);
    input.clearAll();
    this.hitstopTimer = 0;
    this.blackoutTimer = 0;
    this.announcement = `ROUND ${this.match.currentRound}`;
    this.announcementTimerFrames = 90;
    this.specialCallout = '';
    this.specialCalloutFrames = 0;
    this.matchEndTimerFrames = 0;

    audio.playSound('round');
    this.pushHUDUpdate();
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

    // 1. Process Player 1 and CPU 3D inputs during fighting phase
    if (this.match.phase === 'fighting') {
      const p1InputFrame = input.snapshotToInputFrame(snap);
      const prevP1State = this.p1.state;
      this.p1.processInput(p1InputFrame, this.p2);
      this.triggerMovePresentationEffects(this.p1, prevP1State, 0);

      const cpuInputFrame = this.cpu.computeInput(
        this.p2,
        this.p1,
        this.combat.projectileManager.getActiveProjectiles()
      );
      const prevP2State = this.p2.state;
      this.p2.processInput(cpuInputFrame, this.p1);
      this.triggerMovePresentationEffects(this.p2, prevP2State, 1);
    }

    // 2. Step 3D Fighter Physics & Arena Clamping
    this.p1.stepPhysics(arenaDef.bounds3D, 1 / 60);
    this.p2.stepPhysics(arenaDef.bounds3D, 1 / 60);

    // 3. Resolve 3D Pushboxes, Projectiles & Bone-Attached Melee Hitboxes
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

        if (ev.blocked) {
          audio.playSound('block');
          this.cameraController.addTrauma(0.14);
          this.hitstopTimer = Math.max(this.hitstopTimer, 2);
        } else if (ev.isSuperMove) {
          audio.playSound('dishoom');
          this.cameraController.addTrauma(0.65);
          this.hitstopTimer = Math.max(this.hitstopTimer, 7);
        } else if (ev.isSuperShot || ev.causedKnockdown) {
          audio.playSound('dishoom');
          this.cameraController.addTrauma(0.38);
          this.hitstopTimer = Math.max(this.hitstopTimer, 5);
        } else if (ev.moveType === 'kick' || ev.moveType === 'sweep') {
          audio.playSound('kick');
          this.cameraController.addTrauma(0.22);
          this.hitstopTimer = Math.max(this.hitstopTimer, 3);
        } else {
          audio.playSound('punch');
          this.cameraController.addTrauma(0.18);
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
        this.announcement = 'FIGHT!';
        this.announcementTimerFrames = 55;
        audio.playSound('fight');
      } else if (matchUpdate.newPhase === 'ko') {
        this.announcement = 'K.O.!';
        this.announcementTimerFrames = 75;
        audio.playSound('ko');
        this.cameraController.addTrauma(0.6);
      } else if (matchUpdate.newPhase === 'time_over') {
        this.announcement = "TIME'S UP!";
        this.announcementTimerFrames = 90;
        audio.playSound('ko');
      } else if (matchUpdate.newPhase === 'round_intro') {
        this.announcement = `ROUND ${this.match.currentRound}`;
        this.announcementTimerFrames = 90;
        audio.playSound('round');
      } else if (matchUpdate.newPhase === 'match_end') {
        this.announcement =
          this.match.matchWinner === 'p1'
            ? `${this.p1.def.name.toUpperCase()} WINS!`
            : `${this.p2.def.name.toUpperCase()} WINS!`;
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
      AudioManager3D.playSuperMoveSound(fighter.id);
      this.cameraController.triggerSuperMoveZoom(fighterIndex, 1.15);
      this.vfxManager.spawnSuperMoveSignatureVFX(fighter.id, fighter.position);
      this.specialCallout = `${fighter.def.name.toUpperCase()}: ${fighter.def.superMoveInfo.name}!`;
      this.specialCalloutFrames = 75;
      if (fighter.id === 'villain_saab') {
        this.blackoutTimer = 1.25;
      }
      this.pushHUDUpdate();
    } else if (fighter.state === 'super_shot') {
      AudioManager3D.playSuperShotSound(fighter.id);
      this.specialCallout = `${fighter.def.superShotInfo.name}!`;
      this.specialCalloutFrames = 45;
      this.pushHUDUpdate();
    } else if (fighter.isAttacking() || fighter.state === 'jump') {
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
      if (this.isDisposed) return;

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
    this.unsubscribeCommand();
    this.unsubscribePause();
    this.unsubscribeMute();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
    }
    InputManager3D.getInstance().clearAll();
    this.vfxManager.dispose();
    this.p1Rig?.dispose();
    this.p2Rig?.dispose();
    this.arenaHandle.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
