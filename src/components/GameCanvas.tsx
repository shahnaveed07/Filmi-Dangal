import React, { useEffect, useRef } from 'react';
import { CHARACTERS } from '../data/characters';
import { ARENAS } from '../data/arenas';
import { ArenaRenderer } from '../engine/ArenaRenderer';
import { AudioManager } from '../engine/AudioManager';
import { CombatSystem } from '../engine/CombatSystem';
import { CPUController } from '../engine/CPUController';
import { Fighter } from '../engine/Fighter';
import { GameBridge, GameHUDState, MatchLifecycleCommand } from '../engine/GameBridge';
import { InputManager } from '../engine/InputManager';
import { MatchManager } from '../engine/MatchManager';
import { SpriteRenderer } from '../engine/SpriteRenderer';

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bridge = GameBridge.getInstance();
    const audio = AudioManager.getInstance();
    const input = InputManager.getInstance();

    // Load selected fighters and arena from GameBridge
    let p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    let p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;
    let arenaDef = ARENAS[bridge.arenaId] || ARENAS.award_night;

    let groundY = arenaDef.groundY;
    let stageWidth = arenaDef.stageWidth;

    const p1 = new Fighter(p1Def, MatchManager.P1_SPAWN_X, groundY, 1, true);
    const p2 = new Fighter(p2Def, MatchManager.P2_SPAWN_X, groundY, -1, false);

    const combat = new CombatSystem();
    const cpu = new CPUController(bridge.difficulty);
    const match = new MatchManager(groundY, stageWidth);

    let animationFrameId: number = 0;
    let frameCount = 0;
    let hitstopTimer = 0;
    let cameraShake = 0;
    let announcement = 'ROUND 1';
    let announcementTimerFrames = 90;
    let matchEndTimerFrames = 0;
    let isDisposed = false;

    const pushHUDUpdate = () => {
      const hudState: GameHUDState = {
        p1Health: p1.health,
        p1MaxHealth: p1.character.stats.maxHealth,
        p2Health: p2.health,
        p2MaxHealth: p2.character.stats.maxHealth,
        p1Meter: p1.meter,
        p2Meter: p2.meter,
        p1Name: p1.character.name,
        p2Name: p2.character.name,
        p1Wins: match.p1RoundWins,
        p2Wins: match.p2RoundWins,
        roundTimer: match.roundTimeRemaining,
        currentRound: match.currentRound,
        phase: match.phase,
        comboP1: combat.comboP1,
        comboP2: combat.comboP2,
        announcementText: announcement,
        isPaused: bridge.isPaused,
        isMuted: audio.isMuted,
        debugHitboxes: bridge.debugHitboxes,
      };
      bridge.notifyHUD(hudState);
    };

    const initializeFullMatch = () => {
      p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
      p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;
      arenaDef = ARENAS[bridge.arenaId] || ARENAS.award_night;
      groundY = arenaDef.groundY;
      stageWidth = arenaDef.stageWidth;

      p1.character = p1Def;
      p2.character = p2Def;
      cpu.setDifficulty(bridge.difficulty);
      match.setArenaBounds(groundY, stageWidth);
      match.resetMatch(p1, p2, combat, cpu);
      SpriteRenderer.clearEffects();
      input.clearAll();

      frameCount = 0;
      hitstopTimer = 0;
      cameraShake = 0;
      announcement = 'ROUND 1';
      announcementTimerFrames = 90;
      matchEndTimerFrames = 0;

      audio.playSound('round');
      pushHUDUpdate();
    };

    const handleRestartRound = () => {
      match.restartCurrentRound(p1, p2, combat, cpu);
      SpriteRenderer.clearEffects();
      input.clearAll();
      hitstopTimer = 0;
      cameraShake = 0;
      announcement = `ROUND ${match.currentRound}`;
      announcementTimerFrames = 90;
      matchEndTimerFrames = 0;
      audio.playSound('round');
      pushHUDUpdate();
    };

    // Initialize match on mount
    initializeFullMatch();

    // Subscribe to explicit lifecycle commands from GameBridge
    const unsubscribeCommand = bridge.subscribeCommand((cmd: MatchLifecycleCommand) => {
      if (isDisposed) return;
      if (cmd === 'start_match' || cmd === 'reset_match' || cmd === 'rematch') {
        initializeFullMatch();
      } else if (cmd === 'restart_round') {
        handleRestartRound();
      }
    });

    const unsubscribePause = bridge.subscribePause(() => {
      if (!isDisposed) pushHUDUpdate();
    });

    const unsubscribeMute = audio.subscribeMute(() => {
      if (!isDisposed) pushHUDUpdate();
    });

    // Single 60Hz deterministic simulation step
    const updateSimulation = () => {
      if (isDisposed) return;

      // 1. Poll unified inputs
      const inputSnapshot = input.pollSnapshot();

      // Authoritative Pause toggle
      if (inputSnapshot.pauseJustPressed && match.phase !== 'match_end') {
        bridge.togglePause();
        pushHUDUpdate();
        return;
      }

      // Mute toggle
      if (inputSnapshot.muteJustPressed) {
        audio.toggleMute();
        pushHUDUpdate();
      }

      // Hitbox Debug Mode toggle
      if (inputSnapshot.debugJustPressed) {
        bridge.debugHitboxes = !bridge.debugHitboxes;
        pushHUDUpdate();
      }

      // If paused, freeze simulation, timer, CPU, and fighter states
      if (bridge.isPaused) {
        return;
      }

      frameCount++;

      // Handle announcement display timer in simulation frames
      if (announcementTimerFrames > 0) {
        announcementTimerFrames--;
        if (announcementTimerFrames === 0 && match.phase === 'fighting') {
          announcement = '';
        }
      }

      // Handle match-end transition timer in simulation frames (no leaked setTimeout)
      if (match.phase === 'match_end' && matchEndTimerFrames > 0) {
        matchEndTimerFrames--;
        if (matchEndTimerFrames === 0) {
          bridge.lastMatchStats = { ...match.stats, roundResults: [...match.stats.roundResults] };
          bridge.matchWinner = match.matchWinner;
          bridge.setScreen('results');
          return;
        }
      }

      // Handle hitstop freeze frames for crunchy impact weight
      if (hitstopTimer > 0) {
        hitstopTimer--;
        SpriteRenderer.updateEffects();
        ArenaRenderer.update(frameCount);
        return;
      }

      // 2. Player Input Handling (active during fighting phase)
      if (match.phase === 'fighting') {
        const isMovingBack =
          p1.facing === 1 ? inputSnapshot.moveLeft : inputSnapshot.moveRight;
        const isMovingForward =
          p1.facing === 1 ? inputSnapshot.moveRight : inputSnapshot.moveLeft;

        p1.isHoldingBlock = inputSnapshot.blockHeld;
        p1.isHoldingBack = isMovingBack;
        p1.isHoldingCrouch = inputSnapshot.crouchHeld;

        if (inputSnapshot.crouchHeld && p1.canAct()) {
          p1.changeState(
            inputSnapshot.blockHeld || isMovingBack ? 'crouch_block' : 'crouch'
          );
        } else if (inputSnapshot.jumpJustPressed && p1.canAct()) {
          p1.changeState('jump');
          p1.vy = p1.character.stats.jumpVelocity;
          if (inputSnapshot.moveLeft) {
            p1.vx = -p1.character.stats.walkSpeed * 0.9;
          } else if (inputSnapshot.moveRight) {
            p1.vx = p1.character.stats.walkSpeed * 0.9;
          }
          audio.playSound('whoosh');
        } else if (inputSnapshot.blockHeld && p1.canAct()) {
          p1.changeState('block');
        } else if (inputSnapshot.moveLeft && p1.canAct()) {
          p1.changeState(p1.facing === 1 ? 'walk_backward' : 'walk_forward');
        } else if (inputSnapshot.moveRight && p1.canAct()) {
          p1.changeState(p1.facing === 1 ? 'walk_forward' : 'walk_backward');
        } else if (p1.canAct()) {
          p1.changeState('idle');
        }

        // Edge-triggered Attacks & Combos
        if (inputSnapshot.superJustPressed) {
          if (p1.triggerAttack('super', frameCount, 'super')) {
            audio.playSound('super');
          }
        } else if (inputSnapshot.grabJustPressed) {
          if (p1.triggerAttack('grab', frameCount, 'grab')) {
            audio.playSound('whoosh');
          }
        } else if (inputSnapshot.punchJustPressed) {
          if (isMovingForward && p1.chainLength === 0 && !p1.isAttacking()) {
            if (p1.triggerAttack('forward_punch', frameCount, 'forward_punch')) {
              audio.playSound('whoosh');
            }
          } else {
            if (p1.triggerAttack('punch', frameCount, 'punch')) {
              audio.playSound('whoosh');
            }
          }
        } else if (inputSnapshot.kickJustPressed) {
          if (inputSnapshot.crouchHeld) {
            if (p1.triggerAttack('sweep', frameCount, 'down_kick')) {
              audio.playSound('whoosh');
            }
          } else if (isMovingForward && p1.chainLength === 0 && !p1.isAttacking()) {
            if (p1.triggerAttack('forward_kick', frameCount, 'forward_kick')) {
              audio.playSound('whoosh');
            }
          } else {
            if (p1.triggerAttack('kick', frameCount, 'kick')) {
              audio.playSound('whoosh');
            }
          }
        }

        // 3. CPU Opponent Decision Update
        cpu.update(p2, p1, frameCount, groundY);
      }

      // 4. Update Fighters Physics and Animation State
      p1.update(groundY, stageWidth, p2.x, frameCount);
      p2.update(groundY, stageWidth, p1.x, frameCount);

      // 5. Combat Collision and Resolution
      if (match.phase === 'fighting') {
        const combatFeedback = combat.update(p1, p2, groundY);

        if (combatFeedback.hitstopFrames > 0) {
          hitstopTimer = combatFeedback.hitstopFrames;
        }
        if (combatFeedback.shakeIntensity > 0) {
          cameraShake = combatFeedback.shakeIntensity;
        }

        // Process hit events and update match statistics
        for (const ev of combatFeedback.events) {
          const isP1Attacker = ev.attackerId === p1.character.id && p1.isPlayer;
          match.recordHitEvent(ev, isP1Attacker);
          bridge.emitHit(ev);

          const isHeavy =
            ev.attackType === 'super' ||
            ev.attackType === 'forward_punch' ||
            ev.attackType === 'forward_kick' ||
            ev.isGrab;
          SpriteRenderer.addHitspark(ev.hitX, ev.hitY, ev.isBlocked, isHeavy);

          if (ev.isBlocked) {
            audio.playSound('block');
          } else if (isHeavy) {
            audio.playSound('dishoom');
          } else if (ev.attackType === 'kick' || ev.attackType === 'sweep') {
            audio.playSound('kick');
          } else {
            audio.playSound('punch');
          }
        }
      }

      // 6. Match Flow & State Management
      const matchUpdate = match.update(p1, p2, combat, cpu);
      if (matchUpdate.phaseChanged) {
        if (matchUpdate.newPhase === 'fighting') {
          announcement = 'FIGHT!';
          announcementTimerFrames = 55;
          audio.playSound('fight');
        } else if (matchUpdate.newPhase === 'ko') {
          announcement = 'K.O.!';
          announcementTimerFrames = 75;
          audio.playSound('ko');
        } else if (matchUpdate.newPhase === 'time_over') {
          announcement = "TIME'S UP!";
          announcementTimerFrames = 90;
          audio.playSound('ko');
        } else if (matchUpdate.newPhase === 'round_intro') {
          SpriteRenderer.clearEffects();
          announcement = `ROUND ${match.currentRound}`;
          announcementTimerFrames = 90;
          audio.playSound('round');
        } else if (matchUpdate.newPhase === 'match_end') {
          announcement =
            match.matchWinner === 'p1'
              ? `${p1.character.name.toUpperCase()} WINS!`
              : `${p2.character.name.toUpperCase()} WINS!`;
          announcementTimerFrames = 110;
          matchEndTimerFrames = 105; // ~1.75s before showing Results screen
        }
        pushHUDUpdate();
      }

      // 7. Update Arena and FX
      ArenaRenderer.update(frameCount);
      SpriteRenderer.updateEffects();
      if (cameraShake > 0) cameraShake *= 0.88;
      if (cameraShake < 0.2) cameraShake = 0;

      // 8. Push HUD State to Bridge every 3 frames
      if (frameCount % 3 === 0) {
        pushHUDUpdate();
      }
    };

    // Render loop (decoupled from simulation step)
    const render = () => {
      if (isDisposed) return;
      ctx.save();

      // Camera Shake offset
      if (cameraShake > 0 && !bridge.isPaused) {
        const sx = (Math.random() - 0.5) * cameraShake * 3;
        const sy = (Math.random() - 0.5) * cameraShake * 3;
        ctx.translate(sx, sy);
      }

      // 1. Draw Arena Environment
      ArenaRenderer.render(ctx, bridge.arenaId, frameCount, groundY);

      // 2. Draw Fighters
      SpriteRenderer.renderFighter(ctx, p1, groundY);
      SpriteRenderer.renderFighter(ctx, p2, groundY);

      // 3. Draw Hitbox & Hurtbox Debug Overlay when enabled
      if (bridge.debugHitboxes) {
        SpriteRenderer.renderDebugOverlay(ctx, p1);
        SpriteRenderer.renderDebugOverlay(ctx, p2);
      }

      // 4. Draw Visual Effects (Hitsparks, Dust, Comic text)
      SpriteRenderer.renderEffects(ctx);

      ctx.restore();
    };

    // Fixed-timestep 60Hz accumulator loop with frame catch-up cap
    const FIXED_STEP_MS = 1000 / 60;
    const MAX_DELTA_MS = 100; // Cap catch-up at ~6 frames max to avoid spiral of death
    let lastTimestamp = performance.now();
    let accumulatorMs = 0;

    const loop = (currentTime: number) => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(loop);

      const rawDelta = Math.max(0, currentTime - lastTimestamp);
      lastTimestamp = currentTime;
      accumulatorMs += Math.min(rawDelta, MAX_DELTA_MS);

      let steps = 0;
      while (accumulatorMs >= FIXED_STEP_MS && steps < 6) {
        updateSimulation();
        accumulatorMs -= FIXED_STEP_MS;
        steps++;
      }

      render();
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      unsubscribeCommand();
      unsubscribePause();
      unsubscribeMute();
      SpriteRenderer.clearEffects();
      input.clearAll();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#10111B] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        data-testid="fight-canvas"
        width={1280}
        height={720}
        className="w-full h-full max-h-screen object-contain aspect-video shadow-2xl"
      />
    </div>
  );
};
