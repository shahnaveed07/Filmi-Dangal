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

test('3. Strict 2D XY Plane Fighter3D movement (Vector2 X horizontal, Y vertical, Z = 0 fixed plane) and bounds clamping', () => {
  const bounds = ARENAS.award_night.bounds3D;
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 2.0, 0, 0);

  // Verify Vector2 instances for position2D and velocity2D
  assert.equal(p1.position2D.x, -2.0);
  assert.equal(p1.position2D.y, 0);
  assert.equal(p1.position.z, 0, 'Fighter3D is locked to Z = 0 fixed rendering plane');

  // Move forward along +X
  p1.processInput({ ...EMPTY_INPUT_FRAME, right: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position2D.x > -2.0, 'Fighter3D advances along +X on 2D XY plane');
  assert.equal(p1.position.z, 0, 'Z coordinate remains strictly 0');
  assert.equal(p1.state, 'run');

  // Verify sidestep inputs do NOT move along Z-axis (no Z-axis gameplay or depth movement)
  p1.processInput({ ...EMPTY_INPUT_FRAME, sidestepUp: true, sidestepDown: true }, p2);
  p1.stepPhysics(bounds);
  assert.equal(p1.position.z, 0, 'Sidestep inputs never change Z position');
  assert.equal(p1.velocity.z, 0, 'Z velocity is always 0');

  // Jump along +Y
  p1.processInput({ ...EMPTY_INPUT_FRAME, jumpJustPressed: true, jump: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position2D.y > 0, 'Fighter3D jumps vertically along +Y');
  assert.equal(p1.isGrounded, false);
  assert.equal(p1.position.z, 0);

  // Clamp to horizontal arena boundaries while keeping Z = 0
  p1.position.x = -20;
  p1.position.z = 15; // Attempting to set Z is ignored on fixed rendering plane
  p1.stepPhysics(bounds);
  assert.equal(p1.position.x, bounds.minX, 'Clamped to arena minX');
  assert.equal(p1.position.z, 0, 'Remains locked on Z = 0 plane');
});

test('4. Normal melee attacks retain ordinary hitbox rules and respect attack range', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, 0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 0.95, 0, 0);
  const combat = new CombatSystem3D();

  // Case A: Close range (dx = 0.95m) -> Normal punch connects with hurtbox
  p1.startAttack('punch');
  for (let i = 0; i < p1.def.moves.punch.startupFrames; i++) {
    p1.stepPhysics();
  }
  const atkSphere = p1.getActiveAttackSphere3D();
  assert.ok(atkSphere, 'Active 3D attack sphere exists for normal melee attack during active frames');

  const eventsClose = combat.updateAndResolveCombat(p1, p2);
  assert.equal(eventsClose.length, 1, 'Normal melee attack hits when within attack range');
  assert.equal(eventsClose[0].blocked, false);
  assert.ok(p2.health < p2.maxHealth);

  // Case B: Out of range (dx = 4.0m) -> Normal melee attack misses!
  p1.resetForRound(0, 0, 0, true);
  p2.resetForRound(4.0, 0, 0, true);

  p1.startAttack('punch');
  for (let i = 0; i < p1.def.moves.punch.startupFrames; i++) {
    p1.stepPhysics();
  }
  const eventsOutOfRange = combat.updateAndResolveCombat(p1, p2);
  assert.equal(
    eventsOutOfRange.length,
    0,
    'Normal melee attack respects attack range and misses distant opponent'
  );
  assert.equal(p2.health, p2.maxHealth, 'Out-of-range normal attack deals zero damage');
});

test('5. All 4 character SuperShots guarantee damage once per activation and spawn independent visual projectiles', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -4.5, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.action_sultan, 4.5, 0, 0);
    const combat = new CombatSystem3D();

    attacker.specialMeter = 50;
    const initialDefenderHp = defender.health;
    const started = attacker.startAttack('super_shot');
    assert.equal(started, true, `${char.id} starts SuperShot (${char.superShotInfo.name})`);
    assert.ok(attacker.currentSpecialActivationId, 'Unique activationId assigned on SuperShot start');
    assert.ok(attacker.superShotCooldownFrames > 0, 'Cooldown applied on SuperShot');

    // Step through startup frames: guaranteed hit resolves immediately on active frame, independent of projectile travel
    let hitEventsCount = 0;
    let totalDamageDealt = 0;
    for (let f = 0; f <= attacker.def.moves.super_shot.startupFrames + 15; f++) {
      attacker.stepPhysics();
      const evs = combat.updateAndResolveCombat(attacker, defender);
      for (const e of evs) {
        if (e.isSuperShot) {
          hitEventsCount++;
          totalDamageDealt += e.damage;
        }
      }
    }

    assert.equal(hitEventsCount, 1, `${char.id} SuperShot applies damage exactly once per activation`);
    assert.ok(totalDamageDealt > 0, `${char.id} SuperShot deals positive character-specific damage`);
    assert.equal(defender.health, initialDefenderHp - totalDamageDealt);

    // Visual projectile was also spawned independently on Z = 0 plane
    const activeProjs = combat.projectileManager.getActiveProjectiles();
    assert.equal(activeProjs.length, 1, `${char.id} spawned independent visual 3D SuperShot projectile`);
    assert.equal(activeProjs[0].position.z, 0, 'Projectile travels strictly on Z = 0 plane');
  }
});

test('6. All 4 character SuperMove finishers require 100 meter and guarantee damage regardless of distance', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -6.0, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.villain_saab, 6.0, 0, 0);
    const combat = new CombatSystem3D();

    attacker.specialMeter = 50;
    assert.equal(
      attacker.startAttack('super_move'),
      false,
      `${char.id} cannot trigger SuperMove with < 100 meter`
    );

    attacker.specialMeter = 100;
    const initialDefenderHp = defender.health;
    assert.equal(
      attacker.startAttack('super_move'),
      true,
      `${char.id} triggers SuperMove (${char.superMoveInfo.name}) at 100 meter`
    );
    assert.equal(attacker.specialMeter, 0, 'SuperMove consumes 100 meter');
    assert.ok(attacker.currentSpecialActivationId, 'Unique activationId assigned on SuperMove start');

    let superHitCount = 0;
    let superDamage = 0;
    for (let f = 0; f < 25; f++) {
      attacker.stepPhysics();
      const evs = combat.updateAndResolveCombat(attacker, defender);
      for (const e of evs) {
        if (e.isSuperMove) {
          superHitCount++;
          superDamage += e.damage;
        }
      }
    }
    assert.equal(superHitCount, 1, `${char.superMoveInfo.name} resolves guaranteed damage exactly once even across max arena distance`);
    assert.ok(superDamage > 0, `${char.superMoveInfo.name} deals positive character-specific finisher damage`);
    assert.equal(defender.health, initialDefenderHp - superDamage);
  }
});

test('7. CPUController3D operates strictly on 2D XY plane and unleashes SuperMove at 100 meter', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.5, 0, 0);
  const cpuFighter = new Fighter3D(1, CHARACTERS.dance_dynamo, 1.5, 0, 0);
  const combat = new CombatSystem3D();
  const cpu = new CPUController3D('hard');

  // Spawn an incoming P1 SuperShot projectile heading toward CPU on XY plane
  combat.projectileManager.spawnSuperShot(0, 'action_sultan', { x: -0.5, y: 0, z: 0 }, 1, 0);

  let reactedOn2DPlane = false;
  for (let i = 0; i < 10; i++) {
    const inp = cpu.computeInput(
      cpuFighter,
      p1,
      combat.projectileManager.getActiveProjectiles()
    );
    assert.equal(inp.sidestepUp, false, 'CPU never uses Z-axis sidestepUp');
    assert.equal(inp.sidestepDown, false, 'CPU never uses Z-axis sidestepDown');
    if (inp.jump || inp.block) {
      reactedOn2DPlane = true;
      break;
    }
  }
  assert.equal(
    reactedOn2DPlane,
    true,
    'CPU reacts to incoming projectile on 2D XY plane with jump or guard'
  );

  // Give CPU 100 meter and verify it triggers SuperMove
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
  assert.equal(triggeredSuper, true, 'Hard CPU triggers SuperMove at 100 meter');
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

test('11. Section E Validation Matrix: Every character SuperMove & SuperShot vs every opposing character across all 7 scenarios guarantees positive damage once per activation', () => {
  const combat = new CombatSystem3D();

  interface ValidationScenario {
    name: string;
    setup: (attacker: Fighter3D, defender: Fighter3D) => void;
  }

  const scenarios: ValidationScenario[] = [
    {
      name: '1. Point-blank range',
      setup: (attacker, defender) => {
        attacker.position.x = 0;
        attacker.position.y = 0;
        defender.position.x = 0.55;
        defender.position.y = 0;
      },
    },
    {
      name: '2. Medium range',
      setup: (attacker, defender) => {
        attacker.position.x = -1.5;
        attacker.position.y = 0;
        defender.position.x = 1.5;
        defender.position.y = 0;
      },
    },
    {
      name: '3. Maximum arena distance',
      setup: (attacker, defender) => {
        attacker.position.x = ARENAS.award_night.bounds3D.minX;
        attacker.position.y = 0;
        defender.position.x = ARENAS.award_night.bounds3D.maxX;
        defender.position.y = 0;
      },
    },
    {
      name: '4. Opposite sides of the arena',
      setup: (attacker, defender) => {
        attacker.position.x = ARENAS.film_city.bounds3D.maxX;
        attacker.position.y = 0;
        attacker.facing = -1;
        defender.position.x = ARENAS.film_city.bounds3D.minX;
        defender.position.y = 0;
        defender.facing = 1;
      },
    },
    {
      name: '5. While opponent is airborne',
      setup: (attacker, defender) => {
        attacker.position.x = -2.0;
        attacker.position.y = 0;
        defender.position.x = 2.5;
        defender.position.y = 2.4;
        defender.isGrounded = false;
        defender.state = 'jump';
        defender.velocity.y = 3.5;
      },
    },
    {
      name: '6. While opponent is blocking',
      setup: (attacker, defender) => {
        attacker.position.x = -2.0;
        attacker.position.y = 0;
        defender.position.x = 2.0;
        defender.position.y = 0;
        defender.isBlocking = true;
        defender.state = 'block';
      },
    },
    {
      name: '7. While opponent is moving',
      setup: (attacker, defender) => {
        attacker.position.x = -3.0;
        attacker.position.y = 0;
        defender.position.x = 3.0;
        defender.position.y = 0;
        defender.state = 'run';
        defender.velocity.x = 4.8;
      },
    },
  ];

  const abilities: Array<'super_shot' | 'super_move'> = ['super_shot', 'super_move'];
  let totalValidatedCases = 0;

  for (const attackerChar of CHARACTER_LIST) {
    for (const defenderChar of CHARACTER_LIST) {
      for (const ability of abilities) {
        for (const scenario of scenarios) {
          const attacker = new Fighter3D(0, attackerChar, -2.0, 0, 0);
          const defender = new Fighter3D(1, defenderChar, 2.0, 0, 0);
          scenario.setup(attacker, defender);

          // Ensure Z = 0 fixed plane
          assert.equal(attacker.position.z, 0);
          assert.equal(defender.position.z, 0);

          attacker.specialMeter = 100;
          attacker.superShotCooldownFrames = 0;
          const initialDefenderHp = defender.health;

          const started = attacker.startAttack(ability);
          assert.equal(
            started,
            true,
            `${attackerChar.id} vs ${defenderChar.id} [${ability}] failed to start in ${scenario.name}`
          );

          const activationId = attacker.currentSpecialActivationId;
          assert.ok(
            activationId,
            `Activation ID must exist for ${attackerChar.id} [${ability}]`
          );

          // Step simulation through startup and active frames
          let hitEventsForAbility = 0;
          let confirmedDamage = 0;

          for (let f = 0; f < 35; f++) {
            attacker.stepPhysics();
            const evs = combat.updateAndResolveCombat(attacker, defender);
            for (const ev of evs) {
              if (
                (ability === 'super_shot' && ev.isSuperShot) ||
                (ability === 'super_move' && ev.isSuperMove)
              ) {
                hitEventsForAbility++;
                confirmedDamage += ev.damage;
                assert.equal(
                  ev.blocked,
                  false,
                  `Guaranteed special [${ability}] must never be block-cancelled (${scenario.name})`
                );
                assert.ok(
                  defender.state === 'hurt' || defender.state === 'knockback',
                  `Guaranteed special [${ability}] must trigger opponent hit reaction (${defender.state})`
                );
              }
            }
          }

          assert.equal(
            hitEventsForAbility,
            1,
            `${attackerChar.id} vs ${defenderChar.id} [${ability}] in ${scenario.name} must apply damage EXACTLY ONCE per activation`
          );
          assert.ok(
            confirmedDamage > 0,
            `${attackerChar.id} vs ${defenderChar.id} [${ability}] in ${scenario.name} must deal positive damage`
          );
          assert.equal(
            defender.health,
            initialDefenderHp - confirmedDamage,
            `Defender health must immediately reflect guaranteed ${ability} damage`
          );

          // Verify duplicate call with the same activationId is rejected (0 extra damage)
          const duplicateEvt = combat.applyGuaranteedSpecialHit(
            attacker,
            defender,
            ability,
            activationId!
          );
          assert.equal(
            duplicateEvt,
            null,
            'Duplicate activationId must not deal damage a second time'
          );
          assert.equal(
            defender.health,
            initialDefenderHp - confirmedDamage,
            'Defender health unchanged after duplicate activationId check'
          );

          totalValidatedCases++;
        }
      }
    }
  }

  // 4 attackers * 4 defenders * 2 abilities * 7 scenarios = 224 validated cases
  assert.equal(totalValidatedCases, 224, 'All 224 matchup-ability-scenario combinations verified');

  // Verify MatchManager3D accurately detects KO when a guaranteed special attack reduces opponent health to 0
  const koAttacker = new Fighter3D(0, CHARACTERS.action_sultan, -6.5, 0, 0);
  const koDefender = new Fighter3D(1, CHARACTERS.villain_saab, 6.5, 0, 0);
  const match = new MatchManager3D();
  for (let i = 0; i < 90; i++) {
    match.update(koAttacker, koDefender, combat);
  }
  assert.equal(match.phase, 'fighting');

  koDefender.health = 10; // Low HP across the arena
  koAttacker.specialMeter = 100;
  const koResult = CharacterSpecialMoveController.tryExecuteSuperMove(koAttacker, koDefender, combat, match.phase);
  assert.ok(koResult && typeof koResult === 'object' && koResult.damage >= 10);
  assert.equal(koDefender.health, 0);

  match.update(koAttacker, koDefender, combat);
  assert.equal(match.phase, 'ko', 'MatchManager3D immediately detects KO from guaranteed special attack');
  assert.equal(match.roundWinner, 'p1');

  // Verify an already defeated opponent (health = 0 or state = 'defeat') and KO/match_end states are respected
  koAttacker.specialMeter = 100;
  const postKoEvt = combat.applyGuaranteedSpecialHit(
    koAttacker,
    koDefender,
    'super_shot',
    'post_ko_act_1',
    match.phase
  );
  assert.equal(postKoEvt, null, 'Guaranteed special attack must not apply damage during KO phase');

  koDefender.health = 500;
  koDefender.state = 'defeat';
  const defeatedTargetEvt = combat.applyGuaranteedSpecialHit(
    koAttacker,
    koDefender,
    'super_move',
    'defeated_target_act_1',
    'fighting'
  );
  assert.equal(defeatedTargetEvt, null, 'Guaranteed special attack must not damage an already defeated opponent');
});


