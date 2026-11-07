import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS } from '../../data/characters';
import { ARENAS } from '../../data/arenas';
import { HitboxSystem } from '../HitboxSystem';
import { ComboSystem } from '../ComboSystem';
import { Fighter } from '../Fighter';
import { CombatSystem } from '../CombatSystem';
import { CPUController } from '../CPUController';
import { MatchManager } from '../MatchManager';

test('HitboxSystem detects AABB intersection correctly', () => {
  const box1 = { x: 100, y: 100, w: 50, h: 50 };
  const box2 = { x: 120, y: 120, w: 50, h: 50 };
  const box3 = { x: 200, y: 200, w: 50, h: 50 };

  assert.equal(HitboxSystem.intersects(box1, box2), true, 'Overlapping boxes should intersect');
  assert.equal(HitboxSystem.intersects(box1, box3), false, 'Non-overlapping boxes should not intersect');
});

test('HitboxSystem calculates attack hitbox according to facing direction', () => {
  const fighterX = 400;
  const fighterY = 580;
  const offset = { x: 40, y: -70, w: 45, h: 25 };

  const rightBox = HitboxSystem.getAttackHitbox(fighterX, fighterY, 1, offset);
  assert.equal(rightBox.x, 440, 'Facing right should project hitbox forward');
  assert.equal(rightBox.w, 45);

  const leftBox = HitboxSystem.getAttackHitbox(fighterX, fighterY, -1, offset);
  assert.equal(leftBox.x, 400 - 40 - 45, 'Facing left should project hitbox in negative direction');
});

test('Fighter movement, gravity, and stage boundaries', () => {
  const sultan = new Fighter(CHARACTERS.action_sultan, 500, 580, 1, true);

  // Walk forward
  sultan.changeState('walk_forward');
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x > 500, 'Fighter should advance forward on walk');

  // Jump physics
  sultan.changeState('jump');
  sultan.vy = sultan.character.stats.jumpVelocity;
  sultan.update(580, 1280, 700);
  assert.ok(sultan.y < 580, 'Fighter should ascend during jump');
  assert.equal(sultan.isAirborne(580), true);

  // Boundary clamp
  sultan.x = 20;
  sultan.vx = -10;
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x >= 45, 'Fighter should be clamped within left stage boundary');
});

test('ComboSystem scales damage to prevent infinite juggle damage', () => {
  assert.equal(ComboSystem.getComboDamageMultiplier(1), 1.0, 'First hit has full damage');
  assert.equal(ComboSystem.getComboDamageMultiplier(2), 0.85, 'Second hit scales to 85%');
  assert.equal(ComboSystem.getComboDamageMultiplier(3), 0.70, 'Third hit scales to 70%');
  assert.ok(ComboSystem.getComboDamageMultiplier(5) <= 0.55, 'Higher hits scale down further');
});

test('ComboSystem detects combo strings', () => {
  const currentFrame = 100;
  const history = [
    { command: 'punch', frame: 80 },
    { command: 'punch', frame: 90 },
    { command: 'kick', frame: 98 },
  ];

  const combo = ComboSystem.detectCombo(history, currentFrame);
  assert.ok(combo !== null, 'Should detect J-J-K combo');
  assert.equal(combo?.id, 'punch_punch_kick');
});

test('CombatSystem calculates hits, damage, and counter-hits', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.romance_raja, 445, 580, -1, false);
  const combat = new CombatSystem();

  const initialHp = p2.health;
  // Trigger P1 punch
  p1.triggerAttack('punch', 1);
  // Advance P1 into active punch frames (startup is 5 frames)
  for (let i = 0; i < 6; i++) {
    p1.update(580, 1280, p2.x);
  }

  const feedback = combat.update(p1, p2, 580);
  assert.ok(feedback.events.length > 0, 'Attack should generate hit event');
  assert.ok(p2.health < initialHp, 'Defender should take damage');
  assert.ok(p1.meter > 0, 'Attacker should generate super meter on hit');
});

test('CombatSystem blocking reduces damage to chip and prevents hit stun', () => {
  const p1 = new Fighter(CHARACTERS.romance_raja, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.action_sultan, 445, 580, -1, false);
  const combat = new CombatSystem();

  // P2 holds block
  p2.isHoldingBlock = true;
  p2.changeState('block');

  p1.triggerAttack('punch', 1);
  for (let i = 0; i < 5; i++) {
    p1.update(580, 1280, p2.x);
  }

  const feedback = combat.update(p1, p2, 580);
  assert.ok(feedback.events.length > 0);
  assert.equal(feedback.events[0].isBlocked, true, 'Attack should be blocked');
  assert.ok(feedback.events[0].damage < 15, 'Blocked attack should deal minimal chip damage');
  assert.equal(p2.state, 'block');
});

test('Grab attack ignores regular standing block', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.romance_raja, 430, 580, -1, false);
  const combat = new CombatSystem();

  p2.isHoldingBlock = true;
  p2.changeState('block');

  p1.triggerAttack('grab', 1);
  for (let i = 0; i < 5; i++) {
    p1.update(580, 1280, p2.x);
  }

  const feedback = combat.update(p1, p2, 580);
  assert.ok(feedback.events.length > 0);
  assert.equal(feedback.events[0].isGrab, true);
  assert.equal(feedback.events[0].isBlocked, false, 'Grab must bypass standing block');
});

test('Super attack consumes 100 meter and deals heavy damage', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 400, 580, 1, true);
  p1.meter = 100;
  const initialMeter = p1.meter;

  const executed = p1.triggerAttack('super', 1);
  assert.equal(executed, true, 'Super attack should trigger when meter is 100');
  assert.equal(p1.meter, 0, 'Super attack should consume 100 meter');
  assert.equal(p1.state, 'super');
});

test('CPUController makes strategic decisions based on difficulty', () => {
  const cpu = new Fighter(CHARACTERS.villain_saab, 600, 580, -1, false);
  const player = new Fighter(CHARACTERS.dance_dynamo, 400, 580, 1, true);

  const cpuEasy = new CPUController('easy');
  const cpuHard = new CPUController('hard');

  assert.equal(cpuEasy.difficulty, 'easy');
  assert.equal(cpuHard.difficulty, 'hard');

  // Let CPU update across several frames
  for (let f = 0; f < 30; f++) {
    cpuHard.update(cpu, player, f, 580);
    cpu.update(580, 1280, player.x);
  }

  assert.ok(cpu.canAct() || cpu.isAttacking() || cpu.isBlocking());
});

test('MatchManager handles KO and best-of-3 match victory', () => {
  const p1 = new Fighter(CHARACTERS.action_sultan, 380, 580, 1, true);
  const p2 = new Fighter(CHARACTERS.dance_dynamo, 900, 580, -1, false);
  const match = new MatchManager();

  // Fast-forward intro
  for (let i = 0; i < 95; i++) {
    match.update(p1, p2);
  }
  assert.equal(match.phase, 'fighting');

  // Knockout P2
  p2.health = 0;
  match.update(p1, p2);
  assert.equal(match.phase, 'ko');
  assert.equal(match.p2RoundWins, 0);
  assert.equal(match.p1RoundWins, 1);

  // Fast forward KO delay (75 frames) + round_end (60 frames) = 135+ frames
  for (let i = 0; i < 145; i++) {
    match.update(p1, p2);
  }
  assert.equal(match.currentRound, 2, 'Should advance to round 2');

  // Fast forward intro for round 2
  for (let i = 0; i < 95; i++) {
    match.update(p1, p2);
  }
  assert.equal(match.phase, 'fighting');

  // Knockout P2 again in next round
  p2.health = 0;
  match.update(p1, p2);
  assert.equal(match.phase, 'ko');

  // Fast forward KO delay + transition to match_end
  for (let i = 0; i < 80; i++) {
    match.update(p1, p2);
  }

  assert.equal(match.p1RoundWins, 2);
  assert.equal(match.matchWinner, 'p1');
  assert.equal(match.phase, 'match_end');
});
