import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CHARACTERS, CHARACTER_LIST } from '../../data/characters';
import { ARENAS } from '../../data/arenas';
import { HitboxSystem } from '../HitboxSystem';
import { ComboSystem } from '../ComboSystem';
import { Fighter } from '../Fighter';
import { CombatSystem } from '../CombatSystem';
import { CPUController } from '../CPUController';
import { MatchManager } from '../MatchManager';
import { InputManager, EMPTY_INPUT_FRAME } from '../InputManager';
import { GameBridge } from '../GameBridge';

import { validateGLBBuffer, REQUIRED_HUMANOID_BONES } from '../../game3d/assets/AssetLoader3D';
import {
  CharacterAssetValidator,
  CharacterAssetValidationReport,
} from '../../game3d/assets/CharacterAssetValidator';
import { AnimationController3D } from '../../game3d/animation/AnimationController3D';
import { CharacterAnimationController } from '../../game3d/animation/CharacterAnimationController';
import { FighterAnimationEvents } from '../../game3d/animation/FighterAnimationEvents';
import { CharacterSpecialMoveController } from '../../game3d/combat/CharacterSpecialMoveController';
import { SuperShotProjectileSystem } from '../../game3d/combat/SuperShotProjectileSystem';
import { HitboxSystem3D } from '../../game3d/hitboxes/HitboxSystem3D';
import { Fighter3D } from '../../game3d/combat/Fighter3D';
import { CombatSystem3D } from '../../game3d/combat/CombatSystem3D';
import { CPUController3D } from '../../game3d/cpu/CPUController3D';
import { MatchManager3D } from '../../game3d/managers/MatchManager3D';
import { FighterStateName } from '../../types/fighter';

test('1. Binary GLB 2.0 Humanoid Asset Validation for all 4 fighters', () => {
  assert.equal(CHARACTER_LIST.length, 4, 'Exactly 4 launch characters');

  for (const char of CHARACTER_LIST) {
    const relPath = char.visuals.glbModelPath.replace(/^\//, '');
    const fullPath = path.resolve(process.cwd(), 'public', relPath);
    assert.equal(
      fs.existsSync(fullPath),
      true,
      `GLB model file must exist at ${fullPath}`
    );

    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const validation = validateGLBBuffer(char.id, bytes);

    assert.equal(
      validation.valid,
      true,
      `GLB validation failed for ${char.id}: ${validation.errors.join('; ')}`
    );
    assert.equal(validation.glbMagicValid, true);
    assert.equal(validation.version, 2);
    assert.equal(validation.missingBones.length, 0);
    assert.ok(validation.boneCount >= REQUIRED_HUMANOID_BONES.length);
    assert.ok(validation.meshCount > 0);
  }
});

test('2. AnimationController3D generates distinct poses across all 18 animation states', () => {
  const anim = new AnimationController3D();
  const requiredStates: FighterStateName[] = [
    'idle',
    'walk',
    'run',
    'sidestep',
    'jump',
    'crouch',
    'block',
    'punch',
    'kick',
    'grab',
    'hurt',
    'knockback',
    'knockdown',
    'recovery',
    'victory',
    'defeat',
    'super_shot',
    'super_move',
  ];

  for (const char of CHARACTER_LIST) {
    for (const state of requiredStates) {
      const pose = anim.computeTargetPose(char.id, state, 0.25, 1.0, 2.0);
      assert.ok(pose.Hips, `${char.id} state ${state} must define Hips pose`);
      assert.ok(pose.Chest, `${char.id} state ${state} must define Chest pose`);
      assert.ok(pose.RightUpperArm, `${char.id} state ${state} must define RightUpperArm pose`);
      assert.ok(pose.RightUpperLeg, `${char.id} state ${state} must define RightUpperLeg pose`);
    }
  }
});

test('3. 3D Fighter movement (X horizontal, Z sidestep, Y jump) and 3D arena bounds clamping', () => {
  const bounds = ARENAS.award_night.bounds3D;
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 2.0, 0, 0);

  // Move forward along +X
  p1.processInput({ ...EMPTY_INPUT_FRAME, right: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position.x > -2.0, 'Fighter3D advances along +X');
  assert.equal(p1.state, 'run');

  // Sidestep in along +Z
  p1.processInput({ ...EMPTY_INPUT_FRAME, sidestepUp: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position.z > 0, 'Fighter3D sidesteps into foreground/depth along +Z');
  assert.equal(p1.state, 'sidestep');

  // Sidestep out along -Z
  const prevZ = p1.position.z;
  p1.processInput({ ...EMPTY_INPUT_FRAME, sidestepDown: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position.z < prevZ, 'Fighter3D sidesteps along -Z');

  // Clamp to 3D stage boundaries
  p1.position.x = -20;
  p1.position.z = 15;
  p1.stepPhysics(bounds);
  assert.equal(p1.position.x, bounds.minX, 'Clamped to 3D minX');
  assert.equal(p1.position.z, bounds.maxZ, 'Clamped to 3D maxZ');
});

test('4. 3D Bone-attached attack spheres, 3D capsule hurtboxes, and Z-axis sidestep evasion', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, 0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 0.95, 0, 0);
  const combat = new CombatSystem3D();

  // Case A: Aligned in Z (z = 0) -> Punch connects with 3D capsule hurtbox
  p1.startAttack('punch');
  for (let i = 0; i < p1.def.moves.punch.startupFrames; i++) {
    p1.stepPhysics();
  }
  const atkSphere = p1.getActiveAttackSphere3D();
  assert.ok(atkSphere, 'Active 3D attack sphere exists during active frames');

  const eventsAligned = combat.updateAndResolveCombat(p1, p2);
  assert.equal(eventsAligned.length, 1, 'Melee attack hits when aligned in X and Z');
  assert.equal(eventsAligned[0].blocked, false);
  assert.ok(p2.health < p2.maxHealth);

  // Case B: Defender sidestepped along Z (z = 1.8m) -> Melee attack whiffs in 3D space!
  p1.resetForRound(0, 0, 0, true);
  p2.resetForRound(0.95, 0, 1.8, true);

  p1.startAttack('punch');
  for (let i = 0; i < p1.def.moves.punch.startupFrames; i++) {
    p1.stepPhysics();
  }
  const eventsSidestepped = combat.updateAndResolveCombat(p1, p2);
  assert.equal(
    eventsSidestepped.length,
    0,
    '3D sidestep along Z evades linear melee attack'
  );
});

test('5. All 4 character SuperShot 3D projectiles and cooldown/meter mechanics', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -1.5, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.action_sultan, 1.5, 0, 0);
    const combat = new CombatSystem3D();

    attacker.specialMeter = 50;
    const started = attacker.startAttack('super_shot');
    assert.equal(started, true, `${char.id} starts SuperShot (${char.superShotInfo.name})`);
    assert.ok(attacker.superShotCooldownFrames > 0, 'Cooldown applied on SuperShot');

    // Step through startup frames to spawn projectile
    for (let f = 0; f <= attacker.def.moves.super_shot.startupFrames + 1; f++) {
      attacker.stepPhysics();
      combat.updateAndResolveCombat(attacker, defender);
    }

    const activeProjs = combat.projectileManager.getActiveProjectiles();
    assert.equal(activeProjs.length, 1, `${char.id} spawned 3D SuperShot projectile`);
    assert.equal(activeProjs[0].name, char.superShotInfo.name);

    // Step frames until projectile reaches defender
    let hitDetected = false;
    for (let f = 0; f < 45; f++) {
      const evs = combat.updateAndResolveCombat(attacker, defender);
      if (evs.some((e) => e.isSuperShot)) {
        hitDetected = true;
        break;
      }
    }
    assert.equal(hitDetected, true, `${char.superShotInfo.name} 3D projectile hits target`);
  }
});

test('6. All 4 character SuperMove finishers require 100 meter and execute signature damage', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -0.5, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.villain_saab, 0.5, 0, 0);
    const combat = new CombatSystem3D();

    attacker.specialMeter = 50;
    assert.equal(
      attacker.startAttack('super_move'),
      false,
      `${char.id} cannot trigger SuperMove with < 100 meter`
    );

    attacker.specialMeter = 100;
    assert.equal(
      attacker.startAttack('super_move'),
      true,
      `${char.id} triggers SuperMove (${char.superMoveInfo.name}) at 100 meter`
    );
    assert.equal(attacker.specialMeter, 0, 'SuperMove consumes 100 meter');

    let superHit = false;
    for (let f = 0; f < 20; f++) {
      attacker.stepPhysics();
      // Keep defender in front of charging attacker
      defender.position.x = attacker.position.x + 0.65;
      const evs = combat.updateAndResolveCombat(attacker, defender);
      if (evs.some((e) => e.isSuperMove)) {
        superHit = true;
        break;
      }
    }
    assert.equal(superHit, true, `${char.superMoveInfo.name} connects with heavy 3D impact`);
  }
});

test('7. CPUController3D sidesteps incoming 3D projectiles and unleashes SuperMove at 100 meter', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.5, 0, 0);
  const cpuFighter = new Fighter3D(1, CHARACTERS.dance_dynamo, 1.5, 0, 0);
  const combat = new CombatSystem3D();
  const cpu = new CPUController3D('hard');

  // Spawn an incoming P1 SuperShot projectile heading toward CPU at Z = 0
  combat.projectileManager.spawnSuperShot(0, 'action_sultan', { x: -0.5, y: 0, z: 0 }, 1, 0);

  let sidesteppedOrBlocked = false;
  for (let i = 0; i < 10; i++) {
    const inp = cpu.computeInput(
      cpuFighter,
      p1,
      combat.projectileManager.getActiveProjectiles()
    );
    if (inp.sidestepUp || inp.sidestepDown || inp.block) {
      sidesteppedOrBlocked = true;
      break;
    }
  }
  assert.equal(
    sidesteppedOrBlocked,
    true,
    '3D CPU reacts to incoming 3D projectile with sidestep or guard'
  );

  // Give CPU 100 meter in close range and verify it triggers SuperMove
  combat.projectileManager.clear();
  cpu.reset();
  p1.position = { x: 0.5, y: 0, z: 0 };
  cpuFighter.position = { x: 1.4, y: 0, z: 0 };
  cpuFighter.specialMeter = 100;

  let triggeredSuper = false;
  for (let i = 0; i < 15; i++) {
    const inp = cpu.computeInput(cpuFighter, p1, []);
    if (inp.superMoveJustPressed) {
      triggeredSuper = true;
      break;
    }
  }
  assert.equal(triggeredSuper, true, 'Hard CPU triggers SuperMove in close range at 100 meter');
});

test('8. MatchManager3D round flow, K.O., time expiry, and rematch reset', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, MatchManager3D.P2_SPAWN_X_3D, 0, 0);
  const combat = new CombatSystem3D();
  const cpu = new CPUController3D('normal');
  const match = new MatchManager3D();

  for (let i = 0; i < 90; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.phase, 'fighting');

  // Simulate P1 winning Round 1 by KO
  p2.health = 0;
  match.update(p1, p2, combat, cpu);
  assert.equal(match.phase, 'ko');
  assert.equal(match.p1RoundWins, 1);

  // Advance to Round 2
  for (let i = 0; i < 140; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.currentRound, 2);
  assert.equal(p2.health, p2.maxHealth);

  // Reset full match
  match.resetMatch(p1, p2, combat, cpu);
  assert.equal(match.currentRound, 1);
  assert.equal(match.p1RoundWins, 0);
});

test('9. Legacy 2D engine compatibility & InputManager 3D controls verification', () => {
  const input = InputManager.getInstance();
  input.clearAll();

  input.simulateKeyDown('w', 'KeyW');
  input.simulateKeyDown('u', 'KeyU');
  input.simulateKeyDown('l', 'KeyL');

  const snap = input.pollSnapshot();
  assert.equal(snap.sidestepUpHeld, true, 'W triggers 3D sidestepUpHeld');
  assert.equal(snap.superShotJustPressed, true, 'U triggers superShotJustPressed');
  assert.equal(snap.superMoveJustPressed, true, 'L triggers superMoveJustPressed');

  // Verify ComboSystem and legacy Fighter unit tests still pass
  const sultan = new Fighter(CHARACTERS.action_sultan, 500, 580, 1, true);
  sultan.changeState('walk_forward');
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x > 500);
  assert.equal(HitboxSystem.intersects({ x: 0, y: 0, w: 50, h: 50 }, { x: 20, y: 20, w: 50, h: 50 }), true);
  assert.ok(ComboSystem.getComboDamageMultiplier(3) < 1.0);
  assert.ok(new CombatSystem());
  assert.ok(new CPUController('normal'));
  assert.ok(new MatchManager(580, 1280));
  assert.ok(GameBridge.getInstance());
});

test('10. Final Character Asset Production Directive: CharacterAssetValidator, Action Sultan Vertical Slice, FighterAnimationEvents, CharacterSpecialMoveController & SuperShotProjectileSystem', () => {
  const reports: CharacterAssetValidationReport[] = [];

  for (const char of CHARACTER_LIST) {
    const relPath = char.visuals.glbModelPath.replace(/^\//, '');
    const fullPath = path.resolve(process.cwd(), 'public', relPath);
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const report = CharacterAssetValidator.validateGLBBuffer(bytes, char.id);
    reports.push(report);

    assert.equal(
      report.isValid,
      true,
      `CharacterAssetValidator failed for ${char.id}: ${report.errors.join('; ')}`
    );
    assert.equal(report.missingHumanoidBones.length, 0);
    assert.equal(report.missingFacialRigBones.length, 0);
    assert.equal(report.lodLevelsFound.length, 3);
    assert.equal(report.groundOriginVerified, true);
    assert.equal(report.specialClipsUnique, true);
    assert.equal(report.documentedAnimations.length, 18);
  }

  // Action Sultan is Vertical Slice #1
  const sultanReport = reports.find((r) => r.characterId === 'action_sultan')!;
  assert.equal(sultanReport.productionStatus, 'VERTICAL_SLICE_COMPLETE');

  // Verify no two characters share the same special attack animation names
  const uniqueness = CharacterAssetValidator.verifyCrossCharacterSpecialUniqueness(reports);
  assert.equal(uniqueness.unique, true, 'All 8 special move animation clips across 4 characters are unique');
  assert.equal(CharacterSpecialMoveController.verifyUniqueSpecialAnimations(), true);

  // Verify Action Sultan Idle, Walk, Punch, Kick, Block, Jump, SuperShot, SuperMove poses & events
  const charAnim = new CharacterAnimationController();
  const sultanSliceStates: FighterStateName[] = [
    'idle',
    'walk',
    'punch',
    'kick',
    'block',
    'jump',
    'super_shot',
    'super_move',
  ];

  for (const st of sultanSliceStates) {
    const pose = charAnim.computeTargetPose('action_sultan', st, 0.2);
    assert.ok(pose.Hips && pose.Chest && pose.Jaw && pose.LeftBrow);
  }

  // Verify FighterAnimationEvents fires ON_ACTIVE_HITBOX_START and ON_PROJECTILE_SPAWN for Action Sultan
  const events = new FighterAnimationEvents();
  const firedTypes: string[] = [];
  events.onEvent((evt) => firedTypes.push(evt.type));

  for (let f = 0; f <= 30; f++) {
    events.evaluateFrame('action_sultan', 'super_shot', f);
  }
  assert.equal(firedTypes.includes('ON_STARTUP_BEGIN'), true);
  assert.equal(firedTypes.includes('ON_ACTIVE_HITBOX_START'), true);
  assert.equal(firedTypes.includes('ON_PROJECTILE_SPAWN'), true);
  assert.equal(firedTypes.includes('ON_RECOVERY_BEGIN'), true);

  // Verify SuperShotProjectileSystem projectile clash cancellation
  const projSys = new SuperShotProjectileSystem();
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -1.5, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 1.5, 0, 0);
  projSys.spawnSuperShotForFighter(p1, 0);
  projSys.spawnSuperShotForFighter(p2, 0);
  assert.equal(projSys.getActiveProjectiles().length, 2);

  for (let i = 0; i < 30; i++) {
    projSys.updateFrame(1 / 60);
  }
  assert.equal(
    projSys.getActiveProjectiles().length,
    0,
    'Opposing 3D SuperShot projectiles cancel on mid-air collision'
  );
});

