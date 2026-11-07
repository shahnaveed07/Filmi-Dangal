import React, { useEffect, useRef } from 'react';
import { CHARACTERS } from '../data/characters';
import { ARENAS } from '../data/arenas';
import { ArenaRenderer } from '../engine/ArenaRenderer';
import { AudioManager } from '../engine/AudioManager';
import { CombatSystem } from '../engine/CombatSystem';
import { CPUController } from '../engine/CPUController';
import { Fighter } from '../engine/Fighter';
import { GameBridge, GameHUDState } from '../engine/GameBridge';
import { InputManager } from '../engine/InputManager';
import { MatchManager } from '../engine/MatchManager';
import { SpriteRenderer } from '../engine/SpriteRenderer';

interface GameCanvasProps {
  onPause: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ onPause }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();
  const input = InputManager.getInstance();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load selected fighters and arena from GameBridge
    const p1Def = CHARACTERS[bridge.p1CharacterId] || CHARACTERS.action_sultan;
    const p2Def = CHARACTERS[bridge.p2CharacterId] || CHARACTERS.romance_raja;
    const arenaDef = ARENAS[bridge.arenaId] || ARENAS.award_night;

    const groundY = arenaDef.groundY;
    const stageWidth = arenaDef.stageWidth;

    const p1 = new Fighter(p1Def, 380, groundY, 1, true);
    const p2 = new Fighter(p2Def, 900, groundY, -1, false);

    const combat = new CombatSystem();
    const cpu = new CPUController(bridge.difficulty);
    const match = new MatchManager();

    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let hitstopTimer = 0;
    let cameraShake = 0;
    let announcement = 'ROUND 1';
    let isGamePaused = false;

    // Sound cues on start
    audio.playSound('round');
    setTimeout(() => {
      audio.playSound('fight');
    }, 1200);

    // Subscribe to screen changes (e.g. pause/resume)
    const unsubscribeScreen = bridge.subscribeScreen((screen) => {
      isGamePaused = screen !== 'fighting';
    });

    const updateSimulation = () => {
      frameCount++;

      // 1. Poll inputs
      const inputSnapshot = input.pollSnapshot();

      // Pause toggle
      if (inputSnapshot.pauseJustPressed) {
        onPause();
        return;
      }

      // Mute toggle
      if (inputSnapshot.muteJustPressed) {
        audio.toggleMute();
      }

      if (isGamePaused) {
        return;
      }

      // Handle hitstop freeze frames for crunchy weight
      if (hitstopTimer > 0) {
        hitstopTimer--;
        // While frozen, hitsparks and camera shake continue updating
        SpriteRenderer.updateEffects();
        ArenaRenderer.update(frameCount);
        return;
      }

      // 2. Player Input Handling (only if round is fighting or intro)
      if (match.phase === 'fighting') {
        // Movement & Blocking
        p1.isHoldingBlock = inputSnapshot.blockHeld;
        p1.isHoldingCrouch = inputSnapshot.crouchHeld;

        if (inputSnapshot.crouchHeld && p1.canAct()) {
          p1.changeState(inputSnapshot.blockHeld ? 'crouch_block' : 'crouch');
        } else if (inputSnapshot.jumpJustPressed && p1.canAct()) {
          p1.changeState('jump');
          p1.vy = p1.character.stats.jumpVelocity;
          audio.playSound('whoosh');
        } else if (inputSnapshot.moveLeft && p1.canAct()) {
          p1.changeState(p1.facing === 1 ? 'walk_backward' : 'walk_forward');
        } else if (inputSnapshot.moveRight && p1.canAct()) {
          p1.changeState(p1.facing === 1 ? 'walk_forward' : 'walk_backward');
        } else if (p1.canAct()) {
          p1.changeState(inputSnapshot.blockHeld ? 'block' : 'idle');
        }

        // Attacks
        if (inputSnapshot.superJustPressed) {
          if (p1.triggerAttack('super', frameCount)) {
            audio.playSound('super');
          }
        } else if (inputSnapshot.grabJustPressed) {
          if (p1.triggerAttack('grab', frameCount)) {
            audio.playSound('whoosh');
          }
        } else if (inputSnapshot.punchJustPressed) {
          if (inputSnapshot.moveRight || inputSnapshot.moveLeft) {
            if (p1.triggerAttack('forward_punch', frameCount)) {
              audio.playSound('whoosh');
            }
          } else {
            if (p1.triggerAttack('punch', frameCount)) {
              audio.playSound('whoosh');
            }
          }
        } else if (inputSnapshot.kickJustPressed) {
          if (inputSnapshot.crouchHeld) {
            if (p1.triggerAttack('sweep', frameCount)) {
              audio.playSound('whoosh');
            }
          } else if (inputSnapshot.moveRight || inputSnapshot.moveLeft) {
            if (p1.triggerAttack('forward_kick', frameCount)) {
              audio.playSound('whoosh');
            }
          } else {
            if (p1.triggerAttack('kick', frameCount)) {
              audio.playSound('whoosh');
            }
          }
        }

        // 3. CPU Opponent Decision Update
        cpu.update(p2, p1, frameCount, groundY);
      }

      // 4. Update Fighters Physics and Animation State
      p1.update(groundY, stageWidth, p2.x);
      p2.update(groundY, stageWidth, p1.x);

      // 5. Combat Collision and Resolution
      if (match.phase === 'fighting') {
        const combatFeedback = combat.update(p1, p2, groundY);

        if (combatFeedback.hitstopFrames > 0) {
          hitstopTimer = combatFeedback.hitstopFrames;
        }
        if (combatFeedback.shakeIntensity > 0) {
          cameraShake = combatFeedback.shakeIntensity;
        }

        // Process hit events
        for (const ev of combatFeedback.events) {
          bridge.emitHit(ev);

          const isHeavy = ev.attackType === 'super' || ev.attackType === 'forward_punch' || ev.isGrab;
          SpriteRenderer.addHitspark(ev.hitX, ev.hitY, ev.isBlocked, isHeavy);

          if (ev.isBlocked) {
            audio.playSound('block');
          } else if (isHeavy) {
            audio.playSound('dishoom');
          } else if (ev.attackType === 'kick') {
            audio.playSound('kick');
          } else {
            audio.playSound('punch');
          }
        }
      }

      // 6. Match Flow & State Management
      const matchUpdate = match.update(p1, p2);
      if (matchUpdate.phaseChanged) {
        if (matchUpdate.newPhase === 'fighting') {
          announcement = 'FIGHT!';
          audio.playSound('fight');
          setTimeout(() => {
            if (announcement === 'FIGHT!') announcement = '';
          }, 1000);
        } else if (matchUpdate.newPhase === 'ko') {
          announcement = 'K.O.!';
          audio.playSound('ko');
        } else if (matchUpdate.newPhase === 'time_over') {
          announcement = "TIME'S UP!";
          audio.playSound('ko');
        } else if (matchUpdate.newPhase === 'round_intro') {
          announcement = `ROUND ${match.currentRound}`;
          audio.playSound('round');
        } else if (matchUpdate.newPhase === 'match_end') {
          bridge.lastMatchStats = match.stats;
          bridge.matchWinner = match.matchWinner;
          setTimeout(() => {
            bridge.setScreen('results');
          }, 1800);
        }
      }

      // 7. Update Arena and FX
      ArenaRenderer.update(frameCount);
      SpriteRenderer.updateEffects();
      if (cameraShake > 0) cameraShake *= 0.88;
      if (cameraShake < 0.2) cameraShake = 0;

      // 8. Push HUD State to Bridge every 3 frames
      if (frameCount % 3 === 0) {
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
          isPaused: isGamePaused,
          isMuted: audio.isMuted,
        };
        bridge.notifyHUD(hudState);
      }
    };

    // Render loop
    const render = () => {
      ctx.save();

      // Camera Shake offset
      if (cameraShake > 0) {
        const sx = (Math.random() - 0.5) * cameraShake * 3;
        const sy = (Math.random() - 0.5) * cameraShake * 3;
        ctx.translate(sx, sy);
      }

      // 1. Draw Arena Environment
      ArenaRenderer.render(ctx, bridge.arenaId, frameCount, groundY);

      // 2. Draw Fighters
      SpriteRenderer.renderFighter(ctx, p1, groundY);
      SpriteRenderer.renderFighter(ctx, p2, groundY);

      // 3. Draw Visual Effects (Hitsparks, Dust, Comic text)
      SpriteRenderer.renderEffects(ctx);

      ctx.restore();
    };

    // 60Hz Engine Tick with precise frame capping
    const targetFps = 60;
    const interval = 1000 / targetFps;
    let lastRenderTime = performance.now();

    const loop = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(loop);

      const delta = currentTime - lastRenderTime;
      if (delta >= interval - 1) {
        lastRenderTime = currentTime - (delta % interval);
        updateSimulation();
        render();
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      unsubscribeScreen();
    };
  }, [bridge, audio, input, onPause]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#10111B] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full h-full max-h-screen object-contain aspect-video shadow-2xl"
      />
    </div>
  );
};
