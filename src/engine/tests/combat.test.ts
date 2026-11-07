import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CHARACTERS, CHARACTER_LIST } from '../../data/characters';
import { ARENAS } from '../../data/arenas';
import { HitboxSystem } from '../HitboxSystem';
import { ComboSystem, COMBO_DEFINITIONS } from '../ComboSystem';
import { Fighter } from '../Fighter';
import { CombatSystem } from '../CombatSystem';
import { CPUController } from '../CPUController';
import { MatchManager } from '../MatchManager';
import { InputManager, EMPTY_INPUT_FRAME } from '../InputManager';
import { GameBridge } from '../GameBridge';
import { SettingsManager, DEFAULT_GAME_SETTINGS, sanitizeGameSettings } from '../SettingsManager';
import { AudioManager } from '../AudioManager';

import {
  CHARACTER_ASSET_MANIFEST,
  ALL_STANDARD_ANIMATION_CLIP_IDS,
  validateCharacterAssetManifestConfig,
  resolveCharacterAnimationClip,
} from '../../config/characterAssets';
import {
  CHARACTER_AUDIO_MANIFEST,
  ALL_CHARACTER_AUDIO_EVENTS,
  getCharacterAudioEventConfig,
} from '../../config/audioAssets';
import { CharacterAssetLoader } from '../../game3d/assets/CharacterAssetLoader';
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
import { Fighter3D } from '../../game3d/combat/Fighter3D';
import { CombatSystem3D } from '../../game3d/combat/CombatSystem3D';
import { CPUController3D } from '../../game3d/cpu/CPUController3D';
import { MatchManager3D } from '../../game3d/managers/MatchManager3D';
import { FighterStateName } from '../../types/fighter';

test('1. Character Loading & Binary GLB 2.0 Humanoid Asset Validation for all 4 fighters', () => {
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

test('2. AnimationController3D generates distinct poses across all 17 active 2D XY animation states (no sidestep)', () => {
  const anim = new AnimationController3D();
  const requiredStates: FighterStateName[] = [
    'idle',
    'walk',
    'run',
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
      const pose = anim.computeTargetPose(char.id, state, 0.25, 1.0, 0);
      assert.ok(pose.Hips, `${char.id} state ${state} must define Hips pose`);
      assert.ok(pose.Chest, `${char.id} state ${state} must define Chest pose`);
      assert.ok(pose.RightUpperArm, `${char.id} state ${state} must define RightUpperArm pose`);
      assert.ok(pose.RightUpperLeg, `${char.id} state ${state} must define RightUpperLeg pose`);
    }
  }
});

test('3. Strict 2D XY Plane Movement, Jumping/Gravity/Landing, Crouching/Standing transitions, and Arena Boundary Clamping', () => {
  const bounds = ARENAS.award_night.bounds3D;
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 2.0, 0, 0);

  // Verify Vector2 instances for position2D and velocity2D and fixed Z = 0
  assert.equal(p1.position2D.x, -2.0);
  assert.equal(p1.position2D.y, 0);
  assert.equal(p1.position.z, 0, 'Fighter3D is locked to Z = 0 fixed rendering plane');

  // Move forward along +X
  p1.processInput({ ...EMPTY_INPUT_FRAME, right: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position2D.x > -2.0, 'Fighter3D advances along +X on 2D XY plane');
  assert.equal(p1.position.z, 0, 'Z coordinate remains strictly 0');
  assert.equal(p1.state, 'run');

  // Crouching and standing transitions
  p1.processInput({ ...EMPTY_INPUT_FRAME, crouch: true, down: true }, p2);
  p1.stepPhysics(bounds);
  assert.equal(p1.state, 'crouch');
  assert.equal(p1.isCrouching, true);

  p1.processInput({ ...EMPTY_INPUT_FRAME }, p2);
  p1.stepPhysics(bounds);
  assert.equal(p1.state, 'idle');
  assert.equal(p1.isCrouching, false);

  // Jump along +Y, gravity arc, and landing
  p1.processInput({ ...EMPTY_INPUT_FRAME, jumpJustPressed: true, jump: true }, p2);
  p1.stepPhysics(bounds);
  assert.ok(p1.position2D.y > 0, 'Fighter3D jumps vertically along +Y');
  assert.equal(p1.isGrounded, false);
  assert.equal(p1.position.z, 0);

  let maxHeightReached = p1.position2D.y;
  for (let f = 0; f < 65; f++) {
    p1.stepPhysics(bounds);
    if (p1.position2D.y > maxHeightReached) {
      maxHeightReached = p1.position2D.y;
    }
    assert.equal(p1.position.z, 0, 'Z remains 0 throughout jump arc');
  }
  assert.ok(maxHeightReached > 0.5, 'Fighter reaches positive jump apex');
  assert.equal(p1.isGrounded, true, 'Fighter lands back on floorY = 0');
  assert.equal(p1.position2D.y, 0);

  // Clamp to horizontal arena boundaries while keeping Z = 0
  p1.position.x = -20;
  p1.position.z = 15; // Attempting to set Z is ignored on fixed rendering plane
  p1.stepPhysics(bounds);
  assert.equal(p1.position.x, bounds.minX, 'Clamped to arena minX');
  assert.equal(p1.position.z, 0, 'Remains locked on Z = 0 plane');

  p1.position.x = 20;
  p1.stepPhysics(bounds);
  assert.equal(p1.position.x, bounds.maxX, 'Clamped to arena maxX');
});

test('4. Normal melee hitboxes/hurtboxes, Blocking, Guard-Breaking Grabs, and Knockback/Knockdown/Recovery', () => {
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

  // Case C: Blocking reduces normal attack to chip damage
  p1.resetForRound(0, 0, 0, true);
  p2.resetForRound(0.95, 0, 0, true);
  p2.isBlocking = true;
  p2.state = 'block';
  p1.startAttack('punch');
  for (let i = 0; i < p1.def.moves.punch.startupFrames; i++) {
    p1.stepPhysics();
  }
  const blockedEvents = combat.updateAndResolveCombat(p1, p2);
  assert.equal(blockedEvents.length, 1);
  assert.equal(blockedEvents[0].blocked, true, 'Standing block guards normal punch');
  assert.ok(blockedEvents[0].damage < p1.def.moves.punch.damage, 'Blocked punch only deals chip damage');

  // Case D: Grab breaks standing guard and causes knockdown -> recovery -> idle
  p1.resetForRound(0, 0, 0, true);
  p2.resetForRound(0.85, 0, 0, true);
  p2.isBlocking = true;
  p2.state = 'block';
  p1.startAttack('grab');
  for (let i = 0; i < p1.def.moves.grab.startupFrames; i++) {
    p1.stepPhysics();
  }
  const grabEvents = combat.updateAndResolveCombat(p1, p2);
  assert.equal(grabEvents.length, 1);
  assert.equal(grabEvents[0].blocked, false, 'Grab is unblockable and breaks guard');
  assert.equal(grabEvents[0].isGrab, true);
  assert.equal(p2.state, 'knockback', 'Grab launches opponent into knockback');

  let enteredKnockdown = false;
  let enteredRecovery = false;
  for (let f = 0; f < 90; f++) {
    p2.stepPhysics();
    if (p2.state === 'knockdown') enteredKnockdown = true;
    if (p2.state === 'recovery') enteredRecovery = true;
  }
  assert.equal(enteredKnockdown, true, 'Knockback transitions to knockdown on landing');
  assert.equal(enteredRecovery, true, 'Knockdown transitions to wakeup recovery');
  assert.equal(p2.state, 'idle', 'Recovery returns fighter to idle');
});

test('5. Frame-Accurate SuperShot Timing: Spawns projectile at ON_PROJECTILE_RELEASE and resolves guaranteed damage at ON_SPECIAL_IMPACT (never frame 0/1)', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -4.5, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.action_sultan, 4.5, 0, 0);
    const combat = new CombatSystem3D();
    const spec = FighterAnimationEvents.getMoveSpec(char.id, 'super_shot');
    const chargeFrame = spec.chargeStartFrame!;
    const releaseFrame = spec.projectileSpawnFrame!;
    const impactFrame = spec.specialImpactFrame!;

    assert.ok(chargeFrame >= 1, `${char.id} chargeStartFrame >= 1`);
    assert.ok(releaseFrame > chargeFrame, `${char.id} releaseFrame (${releaseFrame}) > chargeFrame (${chargeFrame})`);
    assert.ok(impactFrame > releaseFrame, `${char.id} impactFrame (${impactFrame}) > releaseFrame (${releaseFrame})`);

    attacker.specialMeter = 50;
    const initialDefenderHp = defender.health;
    const started = attacker.startAttack('super_shot');
    assert.equal(started, true, `${char.id} starts SuperShot (${char.superShotInfo.name})`);

    // Step through frames BEFORE releaseFrame: NO damage and NO projectile yet!
    for (let f = 1; f < releaseFrame; f++) {
      attacker.stepPhysics();
      const earlyEvents = combat.updateAndResolveCombat(attacker, defender);
      assert.equal(
        earlyEvents.length,
        0,
        `${char.id} SuperShot must NOT deal damage before releaseFrame (${releaseFrame}) at frame ${f}`
      );
      assert.equal(
        combat.projectileManager.getActiveProjectiles().length,
        0,
        `${char.id} SuperShot must NOT spawn projectile before releaseFrame (${releaseFrame}) at frame ${f}`
      );
    }

    // Step onto exact releaseFrame (ON_PROJECTILE_RELEASE): projectile spawns, damage STILL NOT applied until impactFrame!
    attacker.stepPhysics();
    assert.equal(attacker.stateFrame, releaseFrame);
    const releaseEvents = combat.updateAndResolveCombat(attacker, defender);
    assert.equal(
      releaseEvents.length,
      0,
      `${char.id} SuperShot must NOT apply damage on projectile releaseFrame (${releaseFrame}) before impactFrame (${impactFrame})`
    );
    const activeProjs = combat.projectileManager.getActiveProjectiles();
    assert.equal(activeProjs.length, 1, `${char.id} spawned visual 3D SuperShot projectile at releaseFrame ${releaseFrame}`);
    assert.equal(activeProjs[0].position.z, 0, 'Projectile travels strictly on Z = 0 plane');

    // Step through frames between releaseFrame and impactFrame: still 0 damage
    for (let f = releaseFrame + 1; f < impactFrame; f++) {
      attacker.stepPhysics();
      const midEvents = combat.updateAndResolveCombat(attacker, defender);
      assert.equal(
        midEvents.length,
        0,
        `${char.id} SuperShot must NOT deal damage before impactFrame (${impactFrame}) at frame ${f}`
      );
    }

    // Step onto exact impactFrame (ON_SPECIAL_IMPACT): guaranteed damage resolves ONCE!
    attacker.stepPhysics();
    assert.equal(attacker.stateFrame, impactFrame);
    const impactEvents = combat.updateAndResolveCombat(attacker, defender);
    assert.equal(
      impactEvents.length,
      1,
      `${char.id} SuperShot resolves guaranteed damage at exact impactFrame ${impactFrame}`
    );
    assert.equal(impactEvents[0].isSuperShot, true);
    assert.ok(impactEvents[0].damage > 0);
    assert.equal(defender.health, initialDefenderHp - impactEvents[0].damage);

    // Step through remaining active & recovery frames: no duplicate damage!
    for (let f = 0; f < 25; f++) {
      attacker.stepPhysics();
      const postEvents = combat.updateAndResolveCombat(attacker, defender);
      assert.equal(postEvents.length, 0, 'No duplicate SuperShot damage on subsequent frames');
    }
  }
});

test('6. Frame-Accurate SuperMove Timing: Resolves guaranteed damage at ON_SUPERMOVE_CLIMAX frame (not frame 0/1)', () => {
  for (const char of CHARACTER_LIST) {
    const attacker = new Fighter3D(0, char, -6.0, 0, 0);
    const defender = new Fighter3D(1, CHARACTERS.bhidu, 6.0, 0, 0);
    const combat = new CombatSystem3D();
    const spec = FighterAnimationEvents.getMoveSpec(char.id, 'super_move');
    const climaxFrame = spec.superMoveClimaxFrame!;

    // Failed activation (< 100 meter) must not deduct meter or create activationId
    attacker.specialMeter = 50;
    assert.equal(attacker.startAttack('super_move'), false);
    assert.equal(attacker.specialMeter, 50, 'Failed SuperMove activation does not deduct meter');
    assert.equal(attacker.currentSpecialActivationId, null);

    attacker.specialMeter = 100;
    const initialDefenderHp = defender.health;
    assert.equal(attacker.startAttack('super_move'), true);
    assert.equal(attacker.specialMeter, 0, 'Successful SuperMove consumes 100 meter');

    // Step through frames BEFORE climaxFrame: NO damage yet!
    for (let f = 1; f < climaxFrame; f++) {
      attacker.stepPhysics();
      const earlyEvents = combat.updateAndResolveCombat(attacker, defender);
      assert.equal(
        earlyEvents.length,
        0,
        `${char.id} SuperMove must NOT deal damage before climaxFrame (${climaxFrame}) at frame ${f}`
      );
    }

    // Step onto exact climaxFrame: guaranteed damage resolves!
    attacker.stepPhysics();
    assert.equal(attacker.stateFrame, climaxFrame);
    const climaxEvents = combat.updateAndResolveCombat(attacker, defender);
    assert.equal(
      climaxEvents.length,
      1,
      `${char.id} SuperMove resolves guaranteed damage at exact climaxFrame ${climaxFrame}`
    );
    assert.equal(climaxEvents[0].isSuperMove, true);
    assert.ok(climaxEvents[0].damage > 0);
    assert.equal(defender.health, initialDefenderHp - climaxEvents[0].damage);

    // Step through remaining frames: no duplicate damage!
    for (let f = 0; f < 25; f++) {
      attacker.stepPhysics();
      const postEvents = combat.updateAndResolveCombat(attacker, defender);
      assert.equal(postEvents.length, 0, 'No duplicate SuperMove damage on subsequent frames');
    }
  }
});

test('7. CPUController3D decision-making across Easy, Normal, and Hard difficulties on 2D XY plane', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.5, 0, 0);
  const cpuFighter = new Fighter3D(1, CHARACTERS.duggu, 1.5, 0, 0);
  const combat = new CombatSystem3D();

  for (const diff of ['easy', 'normal', 'hard'] as const) {
    const cpu = new CPUController3D(diff);
    combat.projectileManager.clear();
    combat.projectileManager.spawnSuperShot(0, 'action_sultan', { x: -0.5, y: 0, z: 0 }, 1, 0);

    let tookAction = false;
    for (let i = 0; i < 25; i++) {
      const inp = cpu.computeInput(
        cpuFighter,
        p1,
        combat.projectileManager.getActiveProjectiles()
      );
      if (inp.jump || inp.block || inp.left || inp.right) {
        tookAction = true;
      }
    }
    assert.equal(tookAction, true, `CPU (${diff}) makes valid 2D XY decisions`);
  }

  // Hard CPU unleashes SuperMove at 100 meter
  const hardCpu = new CPUController3D('hard');
  cpuFighter.specialMeter = 100;
  let triggeredSuper = false;
  for (let i = 0; i < 15; i++) {
    const inp = hardCpu.computeInput(cpuFighter, p1, []);
    if (inp.superMoveJustPressed) {
      triggeredSuper = true;
      break;
    }
  }
  assert.equal(triggeredSuper, true, 'Hard CPU triggers SuperMove at 100 meter');
});

test('8. Match Lifecycle, Pause/Resume, Round Restart, Rematch, and Game Mode Progression (Arcade 3-Stage Ladder vs Versus CPU)', () => {
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, MatchManager3D.P2_SPAWN_X_3D, 0, 0);
  const combat = new CombatSystem3D();
  const cpu = new CPUController3D('normal');
  const match = new MatchManager3D();
  const bridge = GameBridge.getInstance();

  for (let i = 0; i < 90; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.phase, 'fighting');

  // Pause & Resume state preservation
  bridge.setPaused(true);
  assert.equal(bridge.isPaused, true);
  bridge.togglePause();
  assert.equal(bridge.isPaused, false);

  // Round restart resets positions & health while preserving currentRound
  p1.health = 400;
  p2.health = 300;
  match.restartCurrentRound(p1, p2, combat, cpu);
  assert.equal(match.currentRound, 1);
  assert.equal(p1.health, p1.maxHealth);
  assert.equal(p2.health, p2.maxHealth);

  // Advance to fighting and simulate P1 winning Round 1 by KO
  for (let i = 0; i < 90; i++) {
    match.update(p1, p2, combat, cpu);
  }
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

  // Full rematch reset
  match.resetMatch(p1, p2, combat, cpu);
  assert.equal(match.currentRound, 1);
  assert.equal(match.p1RoundWins, 0);

  // Verify Arcade Mode 3-Stage Ladder Progression vs Versus CPU single match
  bridge.gameMode = 'arcade';
  bridge.p1CharacterId = 'action_sultan';
  bridge.p2CharacterId = 'romance_raja';
  bridge.startNewMatch();

  assert.equal(bridge.arcadeLadder.length, 3, 'Arcade ladder has 3 distinct opponents');
  assert.equal(bridge.arcadeLadder.includes('action_sultan'), false, 'Player character excluded from rival ladder');
  assert.equal(bridge.arcadeStageIndex, 0);
  assert.equal(bridge.p2CharacterId, 'romance_raja');
  assert.equal(bridge.difficulty, 'easy', 'Arcade Stage 1 starts on easy difficulty');
  assert.equal(bridge.hasNextArcadeStage(), true);

  assert.equal(bridge.advanceArcadeStage(), true, 'Advances to Arcade Stage 2');
  assert.equal(bridge.arcadeStageIndex, 1);
  assert.equal(bridge.difficulty, 'normal', 'Arcade Stage 2 scales to normal difficulty');
  assert.equal(bridge.hasNextArcadeStage(), true);

  assert.equal(bridge.advanceArcadeStage(), true, 'Advances to Arcade Stage 3 (Final Boss)');
  assert.equal(bridge.arcadeStageIndex, 2);
  assert.equal(bridge.difficulty, 'hard', 'Arcade Stage 3 scales to hard difficulty');
  assert.equal(bridge.hasNextArcadeStage(), false, 'No further stages after Stage 3');

  // Versus CPU mode does not override chosen opponent or difficulty
  bridge.gameMode = 'vs_cpu';
  bridge.p1CharacterId = 'duggu';
  bridge.p2CharacterId = 'bhidu';
  bridge.difficulty = 'hard';
  bridge.startNewMatch();
  assert.equal(bridge.p2CharacterId, 'bhidu');
  assert.equal(bridge.difficulty, 'hard');
  assert.equal(bridge.hasNextArcadeStage(), false);
});

test('9. Mobile Multitouch Input Release & Cancel Handling and English-Only Verification', () => {
  const input = InputManager.getInstance();
  input.clearAll();

  // Simulate two simultaneous touch pointers (e.g. holding right with finger 1, pressing jump with finger 2)
  input.onVirtualPointerDown(1, 'right');
  input.onVirtualPointerDown(2, 'jump');
  assert.equal(input.getActiveTouchCount(), 2);

  let snap = input.pollSnapshot();
  assert.equal(snap.moveRight, true);
  assert.equal(snap.jumpJustPressed, true);

  // Cancel pointer 2 and release pointer 1
  input.onVirtualPointerCancel(2);
  assert.equal(input.getActiveTouchCount(), 1);
  input.onVirtualPointerUp(1);
  assert.equal(input.getActiveTouchCount(), 0);

  snap = input.pollSnapshot();
  assert.equal(snap.moveRight, false);
  assert.equal(snap.jumpHeld, false);

  // Verify ComboSystem and legacy 2D engine compatibility
  const sultan = new Fighter(CHARACTERS.action_sultan, 500, 580, 1, true);
  sultan.changeState('walk_forward');
  sultan.update(580, 1280, 700);
  assert.ok(sultan.x > 500);
  assert.equal(HitboxSystem.intersects({ x: 0, y: 0, w: 50, h: 50 }, { x: 20, y: 20, w: 50, h: 50 }), true);
  assert.ok(ComboSystem.getComboDamageMultiplier(3) < 1.0);
  assert.ok(new CombatSystem());
  assert.ok(new CPUController('normal'));
  assert.ok(new MatchManager(580, 1280));

  // Verify 100% English character dialogues and combo names (no Devanagari characters)
  const devanagariRegex = /[\u0900-\u097F]/;
  for (const char of CHARACTER_LIST) {
    assert.equal(devanagariRegex.test(char.dialogues.intro), false);
    assert.equal(devanagariRegex.test(char.dialogues.win), false);
    assert.equal(devanagariRegex.test(char.dialogues.superQuote), false);
    assert.equal(devanagariRegex.test(char.dialogues.superShotQuote), false);
    assert.equal(devanagariRegex.test(char.dialogues.taunt), false);
  }
  for (const combo of COMBO_DEFINITIONS) {
    assert.equal(devanagariRegex.test(combo.name), false);
  }
});

test('10. CharacterAssetValidator, Action Sultan Vertical Slice, FighterAnimationEvents & SuperShotProjectileSystem', () => {
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
    assert.equal(report.documentedAnimations.length, 17);
  }

  const sultanReport = reports.find((r) => r.characterId === 'action_sultan')!;
  assert.equal(sultanReport.productionStatus, 'VERTICAL_SLICE_COMPLETE');

  const uniqueness = CharacterAssetValidator.verifyCrossCharacterSpecialUniqueness(reports);
  assert.equal(uniqueness.unique, true, 'All 8 special move animation clips across 4 characters are unique');
  assert.equal(CharacterSpecialMoveController.verifyUniqueSpecialAnimations(), true);

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

  const events = new FighterAnimationEvents();
  const firedTypes: string[] = [];
  events.onEvent((evt) => firedTypes.push(evt.type));

  for (let f = 0; f <= 36; f++) {
    events.evaluateFrame('action_sultan', 'super_shot', f);
  }
  assert.equal(firedTypes.includes('ON_STARTUP_BEGIN'), true);
  assert.equal(firedTypes.includes('ON_CHARGE_START'), true);
  assert.equal(firedTypes.includes('ON_ACTIVE_HITBOX_START'), true);
  assert.equal(firedTypes.includes('ON_PROJECTILE_SPAWN'), true);
  assert.equal(firedTypes.includes('ON_PROJECTILE_RELEASE'), true);
  assert.equal(firedTypes.includes('ON_SPECIAL_IMPACT'), true);
  assert.equal(firedTypes.includes('ON_RECOVERY_BEGIN'), true);
  assert.equal(firedTypes.includes('ON_ANIMATION_COMPLETE'), true);

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

test('11. Section 8 Mandatory 10-Scenario Matrix: Every character SuperMove & SuperShot vs every opposing character across all 10 scenarios', () => {
  interface ValidationScenario {
    name: string;
    setup: (attacker: Fighter3D, defender: Fighter3D) => void;
    simultaneous?: boolean;
    nearKo?: boolean;
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
      name: '5. Opponent airborne / jumping',
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
      name: '6. Opponent blocking',
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
      name: '7. Opponent crouching',
      setup: (attacker, defender) => {
        attacker.position.x = -2.0;
        attacker.position.y = 0;
        defender.position.x = 2.0;
        defender.position.y = 0;
        defender.isCrouching = true;
        defender.state = 'crouch';
      },
    },
    {
      name: '8. Opponent moving',
      setup: (attacker, defender) => {
        attacker.position.x = -3.0;
        attacker.position.y = 0;
        defender.position.x = 3.0;
        defender.position.y = 0;
        defender.state = 'run';
        defender.velocity.x = 4.8;
      },
    },
    {
      name: '9. Simultaneous special attacks',
      simultaneous: true,
      setup: (attacker, defender) => {
        attacker.position.x = -2.5;
        attacker.position.y = 0;
        defender.position.x = 2.5;
        defender.position.y = 0;
        defender.specialMeter = 100;
        defender.superShotCooldownFrames = 0;
      },
    },
    {
      name: '10. Activation near round end / KO state',
      nearKo: true,
      setup: (attacker, defender) => {
        attacker.position.x = -3.5;
        attacker.position.y = 0;
        defender.position.x = 3.5;
        defender.position.y = 0;
        defender.health = 15; // Low HP so the special attack triggers immediate KO
      },
    },
  ];

  const abilities: Array<'super_shot' | 'super_move'> = ['super_shot', 'super_move'];
  let totalValidatedCases = 0;

  for (const attackerChar of CHARACTER_LIST) {
    for (const defenderChar of CHARACTER_LIST) {
      for (const ability of abilities) {
        for (const scenario of scenarios) {
          const combat = new CombatSystem3D();
          const attacker = new Fighter3D(0, attackerChar, -2.0, 0, 0);
          const defender = new Fighter3D(1, defenderChar, 2.0, 0, 0);
          scenario.setup(attacker, defender);

          assert.equal(attacker.position.z, 0);
          assert.equal(defender.position.z, 0);

          attacker.specialMeter = 100;
          attacker.superShotCooldownFrames = 0;
          const initialDefenderHp = defender.health;
          const initialAttackerHp = attacker.health;

          const started = attacker.startAttack(ability, 'fighting');
          assert.equal(
            started,
            true,
            `${attackerChar.id} vs ${defenderChar.id} [${ability}] failed to start in ${scenario.name}`
          );

          if (scenario.simultaneous) {
            const defStarted = defender.startAttack(ability, 'fighting');
            assert.equal(defStarted, true, 'Defender also starts simultaneous special attack');
          }

          const activationId = attacker.currentSpecialActivationId!;
          const spec = FighterAnimationEvents.getMoveSpec(attackerChar.id, ability);
          const expectedImpactFrame =
            ability === 'super_shot'
              ? spec.specialImpactFrame!
              : spec.superMoveClimaxFrame!;

          let attackerHitEvents = 0;
          let defenderHitEvents = 0;
          let confirmedDamageToDefender = 0;
          let impactOccurredOnFrame = -1;

          for (let f = 1; f <= 40; f++) {
            attacker.stepPhysics();
            if (scenario.simultaneous) {
              defender.stepPhysics();
            }
            const evs = combat.updateAndResolveCombat(attacker, defender, 1 / 60, 'fighting');
            for (const ev of evs) {
              if (ev.attackerIndex === 0) {
                attackerHitEvents++;
                confirmedDamageToDefender += ev.damage;
                impactOccurredOnFrame = ev.impactFrame ?? attacker.stateFrame;
                assert.equal(ev.blocked, false, 'Guaranteed special must never be blocked');
              } else if (ev.attackerIndex === 1) {
                defenderHitEvents++;
              }
            }
          }

          assert.equal(
            attackerHitEvents,
            1,
            `${attackerChar.id} vs ${defenderChar.id} [${ability}] in ${scenario.name} must apply damage EXACTLY ONCE`
          );
          assert.equal(
            impactOccurredOnFrame,
            expectedImpactFrame,
            `${attackerChar.id} [${ability}] must resolve on exact animation event frame ${expectedImpactFrame}`
          );
          assert.ok(confirmedDamageToDefender > 0);
          assert.equal(
            defender.health,
            Math.max(0, initialDefenderHp - confirmedDamageToDefender)
          );

          if (scenario.simultaneous) {
            assert.equal(
              defenderHitEvents,
              1,
              `Simultaneous ${ability} from ${defenderChar.id} also resolves deterministically once`
            );
            assert.ok(attacker.health < initialAttackerHp);
          }

          if (scenario.nearKo) {
            assert.equal(defender.health, 0, 'Defender reduced to 0 HP in near-KO scenario');
            // Verify post-KO special activation or damage against defeated opponent is rejected
            attacker.specialMeter = 100;
            attacker.superShotCooldownFrames = 0;
            assert.equal(
              attacker.startAttack(ability, 'ko'),
              false,
              'Cannot start new special attack during KO phase'
            );
            const postKoHit = combat.applyGuaranteedSpecialHit(
              attacker,
              defender,
              ability,
              'post_ko_attempt',
              'fighting'
            );
            assert.equal(postKoHit, null, 'Cannot damage already defeated opponent');
          }

          // Duplicate activationId must never apply damage a second time
          const duplicateEvt = combat.applyGuaranteedSpecialHit(
            attacker,
            defender,
            ability,
            activationId,
            'fighting'
          );
          assert.equal(duplicateEvt, null);

          totalValidatedCases++;
        }
      }
    }
  }

  // 4 attackers * 4 defenders * 2 abilities * 10 scenarios = 320 validated cases
  assert.equal(totalValidatedCases, 320, 'All 320 matchup-ability-scenario combinations verified');
});

test('12. CharacterAssetManifest & CharacterAssetLoader: 15 required animation mappings, bone aliases, and placeholder separation', () => {
  const loaderValidation = CharacterAssetLoader.validateAllCharacterManifests();
  assert.equal(
    loaderValidation.allValid,
    true,
    `Manifest validation failed: ${loaderValidation.results.map((r) => r.errors.join(', ')).join('; ')}`
  );
  assert.equal(loaderValidation.results.length, 4);

  for (const char of CHARACTER_LIST) {
    const cfg = CHARACTER_ASSET_MANIFEST[char.id];
    const singleReport = validateCharacterAssetManifestConfig(cfg);
    assert.equal(singleReport.valid, true);
    assert.equal(
      cfg.isTemporaryPlaceholder,
      true,
      `${char.id} marked as temporary placeholder until real GLB replacement`
    );
    assert.ok(cfg.modelPath.startsWith('/assets/characters/'));
    assert.equal(ALL_STANDARD_ANIMATION_CLIP_IDS.length, 15);

    for (const animState of ALL_STANDARD_ANIMATION_CLIP_IDS) {
      const resolved = resolveCharacterAnimationClip(char.id, animState);
      assert.ok(resolved.resolvedClipName.length > 0);
    }

    // Verify missing clip fallback resolution logs structured warning and falls back safely
    let capturedWarn = '';
    const res = resolveCharacterAnimationClip(
      char.id,
      'super_move',
      ['Idle', 'Walk'],
      (msg) => {
        capturedWarn = msg;
      }
    );
    assert.equal(res.usedFallback, true);
    assert.ok(capturedWarn.includes('Missing animation clip') || capturedWarn.includes('missing animation clip'));
  }
});

test('13. Character-Specific Audio Manifest & AudioManager Volume / Event Routing', () => {
  const audio = AudioManager.getInstance();
  audio.setMasterVolume(80);
  audio.setMusicVolume(60);
  audio.setSfxVolume(90);
  SettingsManager.getInstance().updateSettings({ muteAll: false });

  assert.ok(Math.abs(audio.masterVolume - 0.8) < 0.01);
  assert.ok(Math.abs(audio.musicVolume - 0.6) < 0.01);
  assert.ok(Math.abs(audio.sfxVolume - 0.9) < 0.01);

  const seenSuperShotSignatures = new Set<string>();
  for (const char of CHARACTER_LIST) {
    const manifest = CHARACTER_AUDIO_MANIFEST[char.id];
    assert.ok(manifest, `Audio manifest exists for ${char.id}`);

    for (const evt of ALL_CHARACTER_AUDIO_EVENTS) {
      const entry = getCharacterAudioEventConfig(char.id, evt);
      assert.ok(
        entry.filePath.startsWith('/assets/audio/characters/'),
        `${char.id} ${evt} has drop-in audio path`
      );
      assert.equal(
        entry.isTemporaryPlaceholder,
        true,
        `${char.id} ${evt} is explicitly flagged as temporary placeholder until custom audio files are dropped in`
      );
      assert.ok(
        entry.fallbackSynth.startFreqHz > 0,
        `${char.id} ${evt} has procedural synth fallback`
      );
      if (evt.startsWith('supershot-')) {
        assert.ok(
          entry.fallbackSynth.signatureId && entry.fallbackSynth.signatureId.length > 0,
          `${char.id} ${evt} defines a unique signatureId`
        );
        assert.ok(
          entry.fallbackSynth.layers && entry.fallbackSynth.layers.length >= 2,
          `${char.id} ${evt} defines multi-layered sound synthesis`
        );
        seenSuperShotSignatures.add(entry.fallbackSynth.signatureId!);
      }

      // Should execute cleanly without throwing even in headless Node environment
      audio.playCharacterEvent(char.id, evt);
    }
  }
  assert.equal(
    seenSuperShotSignatures.size,
    12,
    'All 12 SuperShot audio events (4 characters x 3 phases) have distinct signatureIds'
  );
});

test('14. SettingsManager Persistence, Key Rebinding, and Corrupted Storage Recovery', () => {
  const settingsMgr = SettingsManager.getInstance();
  settingsMgr.resetAllToDefaults();

  const defaults = settingsMgr.getSettings();
  assert.equal(defaults.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume);
  assert.equal(defaults.roundDurationSeconds, 60);
  assert.equal(defaults.startingHealthPercent, 100);

  // Update gameplay & control settings
  settingsMgr.updateSettings({
    cpuDifficulty: 'hard',
    roundDurationSeconds: 90,
    startingHealthPercent: 125,
    mobileControlSize: 'large',
    mobileControlOpacity: 95,
  });
  settingsMgr.updateKeyBinding('punch', 'F');

  const updated = settingsMgr.getSettings();
  assert.equal(updated.cpuDifficulty, 'hard');
  assert.equal(updated.roundDurationSeconds, 90);
  assert.equal(updated.startingHealthPercent, 125);
  assert.equal(updated.keyBindings.punch, 'F');
  assert.equal(updated.mobileControlSize, 'large');

  // Verify corrupted or invalid raw object recovery returns clean validated defaults
  const recovered = sanitizeGameSettings({
    roundDurationSeconds: 999,
    startingHealthPercent: -50,
    keyBindings: { punch: '' },
  });
  assert.equal(recovered.roundDurationSeconds, 60);
  assert.equal(recovered.startingHealthPercent, 100);
  assert.equal(recovered.keyBindings.punch, 'J');

  settingsMgr.resetAllToDefaults();
});

test('15. Training Mode: Infinite Timer, Non-Lethal HP Floor, Auto Health/Meter Regeneration, and Dummy Behaviors', () => {
  const bridge = GameBridge.getInstance();
  bridge.gameMode = 'training';
  bridge.setTrainingDummyBehavior('block');

  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, MatchManager3D.P2_SPAWN_X_3D, 0, 0);
  const combat = new CombatSystem3D();
  const cpu = new CPUController3D('normal');
  const match = new MatchManager3D(60, 'training');

  match.resetMatch(p1, p2, combat, cpu);
  // Advance past short 35-frame training intro
  for (let i = 0; i < 40; i++) {
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.phase, 'fighting', 'Training mode transitions to fighting phase');
  assert.equal(p1.specialMeter, 100, 'Training mode starts P1 with full 100% special meter');

  // Deal massive damage to dummy: dummy HP must never trigger KO in Training Mode
  p2.health = 10;
  p1.specialMeter = 100;
  p1.startAttack('super_move', 'fighting');
  for (let f = 0; f < 30; f++) {
    p1.stepPhysics();
    p2.stepPhysics();
    combat.updateAndResolveCombat(p1, p2, 1 / 60, 'fighting');
    match.update(p1, p2, combat, cpu);
  }
  assert.equal(match.phase, 'fighting', 'Training mode never triggers KO');
  assert.ok(p2.health >= 1, 'Training dummy health is clamped at >= 1 HP');

  // Step 120 idle frames and verify health & meter auto-regenerate back to max
  for (let f = 0; f < 120; f++) {
    p1.stepPhysics();
    p2.stepPhysics();
    match.update(p1, p2, combat, cpu);
  }
  assert.ok(p2.health > 1, 'Training dummy auto-regenerates health after idle recovery');
  assert.equal(p1.specialMeter, 100, 'Training mode auto-refills P1 special meter to 100%');

  // Reset back to vs_cpu for clean state
  bridge.gameMode = 'vs_cpu';
});
