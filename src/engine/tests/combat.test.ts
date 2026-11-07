import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS, CHARACTER_LIST } from '../../data/characters';
import { ARENAS } from '../../data/arenas';
import { HitboxSystem } from '../HitboxSystem';
import { ComboSystem } from '../ComboSystem';
import { Fighter } from '../Fighter';
import { CombatSystem } from '../CombatSystem';
import { CPUController } from '../CPUController';
import { MatchManager } from '../MatchManager';
import { InputManager } from '../InputManager';
import { GameBridge } from '../GameBridge';
import { SpriteRenderer } from '../SpriteRenderer';

test('1. Fighter movement (walk forward and walk backward)', () => {
  const sultan = new Fighter(CHARACTERS.action_sultan, 500, 580, 1, true);

  // Walk forward
  sultan.changeState('walk_forward');
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x > 500, 'Fighter should advance forward on walk_forward');

  const afterForwardX = sultan.x;
  // Walk backward
  sultan.changeState('walk_backward');
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x < afterForwardX, 'Fighter should retreat on walk_backward');
});

test('2. Fighter boundaries (left and right stage limits)', () => {
  const sultan = new Fighter(CHARACTERS.action_sultan, 20, 580, 1, true);
  sultan.vx = -15;
  sultan.update(580, 1280, 700);
  assert.equal(sultan.x, Fighter.STAGE_MARGIN, 'Fighter clamped to left boundary');

  sultan.x = 1270;
  sultan.vx = 15;
  sultan.update(580, 1280, 700);
  assert.equal(sultan.x, 1280 - Fighter.STAGE_MARGIN, 'Fighter clamped to right boundary');
});

test('3. Jump and landing restores grounded state cleanly', () => {
  const raja = new Fighter(CHARACTERS.romance_raja, 500, 580, 1, true);
  raja.changeState('jump');
  raja.vy = raja.character.stats.jumpVelocity;

  // Ascend
  raja.update(580, 1280, 800);
  assert.equal(raja.isAirborne(580), true, 'Fighter should be airborne');
  assert.ok(raja.y < 580, 'Fighter height should rise above groundY');

  // Step until landing
  for (let i = 0; i < 60; i++) {
    raja.update(580, 1280, 800);
    if (!raja.isAirborne(580)) break;
  }

  assert.equal(raja.y, 580, 'Fighter should land exactly at groundY');
  assert.equal(raja.state, 'idle', 'Landing should restore idle state');
});

test('4. Block input (stationary back-holding and block button)', () => {
  const p1 = new Fighter(CHARACTERS.romance_raja, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.action_sultan, 445, 580, -1, false);
  const combat = new CombatSystem();

  // P2 is stationary (vx === 0) but holding back relative to P1
  p2.vx = 0;
  p2.isHoldingBack = true;

  p1.triggerAttack('punch', 1);
  for (let i = 0; i < p1.character.moves.punch.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, i);
  }

  const feedback = combat.update(p1, p2, 580);
  assert.equal(feedback.events.length, 1);
  assert.equal(feedback.events[0].isBlocked, true, 'Stationary holding-back must block mid/high attacks');
  assert.equal(p2.state, 'block', 'Defender enters block state');
  assert.equal(p2.canAct(), false, 'Defender cannot act while in blockStun');
});

test('5 & 6. Crouch block vs Low attacks (sweeps)', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.romance_raja, 445, 580, -1, false);
  const combat = new CombatSystem();

  // Case A: P2 holds standing block against low sweep -> Sweep hits unblocked!
  p2.isHoldingBlock = true;
  p2.isHoldingCrouch = false;
  p2.changeState('block');

  p1.triggerAttack('sweep', 1);
  for (let i = 0; i < p1.character.moves.sweep.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, i);
  }

  const fbStanding = combat.update(p1, p2, 580);
  assert.equal(fbStanding.events.length, 1);
  assert.equal(fbStanding.events[0].isBlocked, false, 'Standing block must NOT block low sweep');
  assert.equal(p2.state, 'knockdown', 'Low sweep knocks down standing blocker');

  // Case B: P2 holds crouch block against low sweep -> Sweep is blocked!
  p1.reset(400, 580, 1, true);
  p2.reset(445, 580, -1, true);
  p2.isHoldingBack = true;
  p2.isHoldingCrouch = true;
  p2.changeState('crouch_block');

  p1.triggerAttack('sweep', 10);
  for (let i = 0; i < p1.character.moves.sweep.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, 10 + i);
  }

  const fbCrouch = combat.update(p1, p2, 580);
  assert.equal(fbCrouch.events.length, 1);
  assert.equal(fbCrouch.events[0].isBlocked, true, 'Crouch block must block low sweep');
  assert.equal(p2.state, 'crouch_block');
});

test('7. Grab bypasses standing and crouch block but misses airborne targets', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.romance_raja, 430, 580, -1, false);
  const combat = new CombatSystem();

  // Grounded blocking opponent gets grabbed
  p2.isHoldingBlock = true;
  p2.isHoldingCrouch = true;
  p2.changeState('crouch_block');

  p1.triggerAttack('grab', 1);
  for (let i = 0; i < p1.character.moves.grab.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, i);
  }

  const fbGrounded = combat.update(p1, p2, 580);
  assert.equal(fbGrounded.events.length, 1);
  assert.equal(fbGrounded.events[0].isGrab, true);
  assert.equal(fbGrounded.events[0].isBlocked, false, 'Grab bypasses block');

  // Airborne opponent cannot be grabbed
  p1.reset(400, 580, 1, true);
  p2.reset(430, 580, -1, true);
  p2.changeState('jump');
  p2.y = 520;
  p2.vy = -8;

  p1.triggerAttack('grab', 20);
  for (let i = 0; i < p1.character.moves.grab.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, 20 + i);
  }
  const fbAir = combat.update(p1, p2, 580);
  assert.equal(fbAir.events.length, 0, 'Grab must whiff against airborne opponent');
});

test('8. Hitbox intersection and facing direction validation', () => {
  const box1 = { x: 100, y: 100, w: 50, h: 50 };
  const box2 = { x: 120, y: 120, w: 50, h: 50 };
  const box3 = { x: 200, y: 200, w: 50, h: 50 };

  assert.equal(HitboxSystem.intersects(box1, box2), true);
  assert.equal(HitboxSystem.intersects(box1, box3), false);

  const rightBox = HitboxSystem.getAttackHitbox(400, 580, 1, { x: 40, y: -70, w: 45, h: 25 });
  assert.equal(rightBox.x, 440);

  const leftBox = HitboxSystem.getAttackHitbox(400, 580, -1, { x: 40, y: -70, w: 45, h: 25 });
  assert.equal(leftBox.x, 315);
});

test('9. Damage applies powerMultiplier and defenseMultiplier exactly once', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.villain_saab, 445, 580, -1, false);
  const combat = new CombatSystem();

  const initialHp = p2.health;
  p1.triggerAttack('punch', 1);
  for (let i = 0; i < p1.character.moves.punch.startupFrames + 1; i++) {
    p1.update(580, 1280, p2.x, i);
  }

  const fb = combat.update(p1, p2, 580);
  assert.equal(fb.events.length, 1);

  const expectedDamage = Math.round(
    (p1.character.moves.punch.damage * p1.character.stats.powerMultiplier) /
      p2.character.stats.defenseMultiplier
  );

  assert.equal(fb.events[0].damage, expectedDamage, 'Event damage matches exact formula');
  assert.equal(initialHp - p2.health, expectedDamage, 'HP lost equals event damage (no double defense division)');
});

test('10 & 11. Hit stun, knockdown, and 18-frame invulnerable recovery', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.dance_dynamo, 445, 580, -1, false);
  const combat = new CombatSystem();

  // Hit stun check
  p2.takeHit(50, 10, 3, 0, false, 5, 1);
  assert.equal(p2.state, 'hurt');
  assert.equal(p2.canAct(), false, 'Cannot act during hitStun');

  for (let i = 0; i < 10; i++) {
    p2.update(580, 1280, p1.x);
  }
  assert.equal(p2.state, 'idle', 'Recovers to idle after hitStun expires');
  assert.equal(p2.canAct(), true);

  // Knockdown and recovery check
  p2.takeHit(80, 20, 6, -4, true, 10, 1);
  assert.equal(p2.state, 'knockdown');

  // Step until landing and knockdownTimer finishes
  for (let i = 0; i < 60; i++) {
    p2.update(580, 1280, p1.x);
    if (p2.state === 'recovery') break;
  }
  assert.equal(p2.state, 'recovery', 'Transitions from knockdown to recovery');
  assert.equal(p2.isInvulnerable(), true, 'Fighter is invulnerable during recovery');

  // Complete 18 recovery frames
  for (let i = 0; i < Fighter.RECOVERY_FRAMES; i++) {
    p2.update(580, 1280, p1.x);
  }
  assert.equal(p2.state, 'idle', 'Returns to idle after recovery completes');
});

test('12. Attack timing (startup, active, recovery frames)', () => {
  const dynamo = new Fighter(CHARACTERS.dance_dynamo, 400, 580, 1, true);
  const move = dynamo.character.moves.kick;

  dynamo.triggerAttack('kick', 1);
  assert.equal(dynamo.state, 'kick');
  assert.equal(dynamo.isAttackActive(), false, 'Inactive during frame 0 startup');

  // Step to active window
  for (let i = 0; i < move.startupFrames; i++) {
    dynamo.update(580, 1280, 600);
  }
  assert.equal(dynamo.isAttackActive(), true, 'Active at startupFrames');

  // Step past active window into recovery
  for (let i = 0; i < move.activeFrames; i++) {
    dynamo.update(580, 1280, 600);
  }
  assert.equal(dynamo.isAttackActive(), false, 'Inactive during recovery frames');

  // Step through remaining recovery
  for (let i = 0; i < move.recoveryFrames; i++) {
    dynamo.update(580, 1280, 600);
  }
  assert.equal(dynamo.state, 'idle', 'Returns to idle after total attack frames');
});

test('13. Combo sequences (J-J-J, J-J-K, J-K-K, Down+K, Forward+J, Forward+K) & 3-hit chain cap', () => {
  // Verify sequence detector for all 6 required combos
  assert.equal(
    ComboSystem.detectCombo(
      [
        { command: 'punch', frame: 10 },
        { command: 'punch', frame: 18 },
        { command: 'punch', frame: 25 },
      ],
      25
    )?.id,
    'triple_punch'
  );

  assert.equal(
    ComboSystem.detectCombo(
      [
        { command: 'punch', frame: 10 },
        { command: 'punch', frame: 18 },
        { command: 'kick', frame: 25 },
      ],
      25
    )?.finalAttack,
    'forward_kick'
  );

  assert.equal(
    ComboSystem.detectCombo(
      [
        { command: 'punch', frame: 10 },
        { command: 'kick', frame: 18 },
        { command: 'kick', frame: 25 },
      ],
      25
    )?.finalAttack,
    'forward_punch'
  );

  assert.equal(
    ComboSystem.detectCombo([{ command: 'down_kick', frame: 10 }], 10)?.finalAttack,
    'sweep'
  );

  assert.equal(
    ComboSystem.detectCombo([{ command: 'forward_punch', frame: 10 }], 10)?.finalAttack,
    'forward_punch'
  );

  assert.equal(
    ComboSystem.detectCombo([{ command: 'forward_kick', frame: 10 }], 10)?.finalAttack,
    'forward_kick'
  );

  // Execute live J-J-K combo in combat and verify 3rd hit promotes to forward_kick and caps at 3 hits
  const p1 = new Fighter(CHARACTERS.romance_raja, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.action_sultan, 440, 580, -1, false);
  const combat = new CombatSystem();

  // Hit 1: J (punch)
  assert.equal(p1.triggerAttack('punch', 1, 'punch'), true);
  for (let f = 2; f <= 6; f++) {
    p1.update(580, 1280, p2.x, f);
    combat.update(p1, p2, 580);
  }
  assert.equal(p1.hasHitConnected, true);

  // Hit 2: Cancel into J (punch)
  assert.equal(p1.triggerAttack('punch', 7, 'punch'), true);
  assert.equal(p1.chainLength, 2);
  p2.x = p1.x + 40; // Keep in close range
  for (let f = 8; f <= 12; f++) {
    p1.update(580, 1280, p2.x, f);
    combat.update(p1, p2, 580);
  }
  assert.equal(p1.hasHitConnected, true);

  // Hit 3: Cancel into K -> Promotes to forward_kick finisher!
  assert.equal(p1.triggerAttack('kick', 13, 'kick'), true);
  assert.equal(p1.currentAttack, 'forward_kick', 'J-J-K 3rd hit executes forward_kick finisher');
  assert.equal(p1.chainLength, 3);

  // Verify 4th normal cancel is blocked (prevents infinite chaining)
  p1.hasHitConnected = true;
  p1.frameInState = 10;
  assert.equal(
    p1.triggerAttack('punch', 20, 'punch'),
    false,
    'Cannot chain a 4th normal attack after completing 3-hit combo'
  );
});

test('14 & 15. Super meter generation, consumption, and super attack execution', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  p1.meter = 50;

  assert.equal(p1.triggerAttack('super', 1), false, 'Cannot trigger super with < 100 meter');
  assert.equal(p1.meter, 50);

  p1.meter = 100;
  assert.equal(p1.triggerAttack('super', 2), true, 'Super triggers at 100 meter');
  assert.equal(p1.meter, 0, 'Super consumes 100 meter');
  assert.equal(p1.state, 'super');
});

test('16 & 17. CPU deterministic decisions and hit-confirmed combo execution', () => {
  const cpu = new Fighter(CHARACTERS.villain_saab, 440, 580, -1, false);
  const player = new Fighter(CHARACTERS.dance_dynamo, 400, 580, 1, true);
  const combat = new CombatSystem();

  // Deterministic RNG returning 0.2 (triggers close punch + J-J-K pendingCombo on Hard)
  const deterministicCpu = new CPUController('hard', () => 0.2);

  deterministicCpu.update(cpu, player, 1, 580);
  assert.equal(cpu.state, 'punch', 'CPU initiates punch in close range');
  assert.deepEqual(deterministicCpu.pendingCombo, ['punch', 'kick'], 'CPU queues J-J-K follow-up');

  // Step into active frames so punch connects
  for (let f = 2; f <= 7; f++) {
    cpu.update(580, 1280, player.x, f);
    combat.update(player, cpu, 580);
  }
  assert.equal(cpu.hasHitConnected, true, 'CPU first punch connected');

  // Next CPU update should cancel into 2nd hit of combo
  deterministicCpu.update(cpu, player, 8, 580);
  assert.equal(cpu.chainLength, 2, 'CPU cancelled into 2nd combo hit after hit confirm');
  assert.equal(deterministicCpu.pendingCombo.length, 1);

  // If CPU is hit, pendingCombo is cleared immediately
  cpu.takeHit(40, 14, 3, 0, false, 5, 1);
  deterministicCpu.update(cpu, player, 9, 580);
  assert.equal(deterministicCpu.pendingCombo.length, 0, 'Stunned CPU clears pending combo');
});

test('18, 19 & 20. MatchManager round transitions, time expiry, draw, and KO victory', () => {
  const arena = ARENAS.film_city; // groundY = 568
  const p1 = new Fighter(CHARACTERS.action_sultan, 380, arena.groundY, 1, true);
  const p2 = new Fighter(CHARACTERS.dance_dynamo, 900, arena.groundY, -1, false);
  const combat = new CombatSystem();
  const cpu = new CPUController('normal');
  const match = new MatchManager(arena.groundY, arena.stageWidth);

  // Advance past round 1 intro (90 frames)
  for (let i = 0; i < 90; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.phase, 'fighting');

  // Simulate Time Expiry with P1 having higher health
  p2.health = 500;
  match.roundTimeRemaining = 1;
  match.roundFrameCounter = 59;
  match.update(p1, p2, combat, cpu);
  assert.equal(match.phase, 'time_over');
  assert.equal(match.roundWinner, 'p1');
  assert.equal(match.p1RoundWins, 1);

  // Advance through time_over (90 frames) + round_end (60 frames) -> Round 2 intro
  combat.comboP1 = 4;
  for (let i = 0; i < 155; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.currentRound, 2);
  assert.equal(p1.y, arena.groundY, 'Round reset places fighter at arena groundY (568)');
  assert.equal(combat.comboP1, 0, 'Round transition resets combo counter');

  // Advance Round 2 intro -> fighting -> KO P2
  for (let i = 0; i < 90; i++) {
    match.update(p1, p2, combat, cpu);
  }
  p2.health = 0;
  match.update(p1, p2, combat, cpu);
  assert.equal(match.phase, 'ko');

  for (let i = 0; i < 80; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.p1RoundWins, 2);
  assert.equal(match.matchWinner, 'p1');
  assert.equal(match.phase, 'match_end');
  assert.equal(p1.state, 'victory');
  assert.equal(p2.state, 'defeat');
});

test('21 & 22. Rematch and Restart Round lifecycles', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 380, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.romance_raja, 900, 580, -1, false);
  const combat = new CombatSystem();
  const cpu = new CPUController('normal');
  const match = new MatchManager(580, 1280);

  // Modify state during Round 1
  match.p1RoundWins = 1;
  match.currentRound = 2;
  p1.health = 300;
  p2.health = 400;
  combat.comboP1 = 5;

  // Restart current round preserves round wins & current round number, but resets HP & combos
  match.restartCurrentRound(p1, p2, combat, cpu);
  assert.equal(match.currentRound, 2);
  assert.equal(match.p1RoundWins, 1);
  assert.equal(p1.health, p1.character.stats.maxHealth);
  assert.equal(p2.health, p2.character.stats.maxHealth);
  assert.equal(combat.comboP1, 0);

  // Full resetMatch / rematch clears round wins, stats, meter, and sets Round 1
  p1.meter = 80;
  match.resetMatch(p1, p2, combat, cpu);
  assert.equal(match.currentRound, 1);
  assert.equal(match.p1RoundWins, 0);
  assert.equal(p1.meter, 0);
  assert.equal(match.matchWinner, null);
});

test('23. InputManager edge triggers, multi-pointer touch, and cleanup', () => {
  const input = InputManager.getInstance();
  input.clearAll();

  // Simulate simultaneous keyboard movement + punch
  input.simulateKeyDown('d', 'KeyD');
  input.simulateKeyDown('j', 'KeyJ');

  const snap1 = input.pollSnapshot();
  assert.equal(snap1.moveRight, true);
  assert.equal(snap1.punchJustPressed, true);

  // Next frame without releasing: moveRight stays held, punchJustPressed is false
  const snap2 = input.pollSnapshot();
  assert.equal(snap2.moveRight, true);
  assert.equal(snap2.punchJustPressed, false, 'Edge-triggered attack must not fire twice while held');

  // Multitouch independent pointers: Pointer 1 holds 'left', Pointer 2 taps 'kick'
  input.onVirtualPointerDown(1, 'left');
  input.onVirtualPointerDown(2, 'kick');
  assert.equal(input.getActiveTouchCount(), 2);

  const snapTouch = input.pollSnapshot();
  assert.equal(snapTouch.moveLeft, true);
  assert.equal(snapTouch.kickJustPressed, true);

  // Release pointer 2 only; pointer 1 remains held
  input.onVirtualPointerUp(2);
  assert.equal(input.getActiveTouchCount(), 1);
  assert.equal(input.pollSnapshot().moveLeft, true);

  // Blur / clearAll releases all keys and pointers
  input.handleBlur();
  assert.equal(input.getActiveTouchCount(), 0);
  const snapCleared = input.pollSnapshot();
  assert.equal(snapCleared.moveLeft, false);
  assert.equal(snapCleared.moveRight, false);
});

test('24. Arena selection, Character roster integrity, and GameBridge pause synchronization', () => {
  assert.equal(CHARACTER_LIST.length, 4, 'All 4 launch characters exist');
  assert.notEqual(
    ARENAS.award_night.groundY,
    ARENAS.film_city.groundY,
    'Arenas have distinct groundY heights'
  );

  const bridge = GameBridge.getInstance();
  bridge.p1CharacterId = 'dance_dynamo';
  bridge.p2CharacterId = 'villain_saab';
  bridge.arenaId = 'film_city';
  bridge.difficulty = 'hard';

  bridge.startMatch();
  assert.equal(bridge.screen, 'fighting');
  assert.equal(bridge.isPaused, false);

  // Toggle authoritative pause
  bridge.togglePause();
  assert.equal(bridge.isPaused, true);

  // Return to menu clears pause and sets title screen
  bridge.returnToMenu();
  assert.equal(bridge.screen, 'title');
  assert.equal(bridge.isPaused, false);

  // Effects cleanup check
  SpriteRenderer.addDust(100, 500);
  assert.ok(SpriteRenderer.effects.length > 0);
  SpriteRenderer.clearEffects();
  assert.equal(SpriteRenderer.effects.length, 0);
});
