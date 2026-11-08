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
import {
  AnimationGroup,
  Bone,
  MeshBuilder,
  NullEngine,
  Scene,
  SceneLoader,
  Skeleton,
  TargetedAnimation,
  TransformNode,
  Animation,
} from '@babylonjs/core';
import {
  CharacterAssetLoader,
  attachImportedGLBHierarchyToFacingNode,
  computeRigWorldBounds,
  evaluateRuntimeProductionRigEligibility,
  resolveHumanoidSkeletonAndBones,
} from '../../game3d/assets/CharacterAssetLoader';
import {
  GLBAnimationGroupController,
  REQUIRED_FACIAL_BONES,
  REQUIRED_HUMANOID_BONES,
  loadCharacterRig3D,
  validateGLBBuffer,
} from '../../game3d/assets/AssetLoader3D';
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
import {
  CharacterPreviewScene,
  PreviewAudioTimerManager,
} from '../../game3d/scenes/CharacterPreviewScene';
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
    assert.equal(validation.glbFileValid, true);
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

test('10. CharacterAssetValidator, Honest Placeholder Classification, FighterAnimationEvents & SuperShotProjectileSystem', () => {
  const reports: CharacterAssetValidationReport[] = [];

  for (const char of CHARACTER_LIST) {
    const relPath = char.visuals.glbModelPath.replace(/^\//, '');
    const fullPath = path.resolve(process.cwd(), 'public', relPath);
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const report = CharacterAssetValidator.validateGLBBuffer(bytes, char.id);
    reports.push(report);

    assert.equal(
      report.glbFileValid,
      true,
      `GLB structural validation failed for ${char.id}: ${report.errors.join('; ')}`
    );
    assert.equal(
      report.productionRigValid,
      false,
      `Unskinned box-primitive GLB for ${char.id} must NOT be classified as a production skinned rig`
    );
    assert.equal(
      report.isPlaceholder,
      true,
      `Repository placeholder GLB for ${char.id} must be honestly classified as isPlaceholder: true`
    );
    assert.equal(report.productionStatus, 'PLACEHOLDER');
    assert.equal(report.missingHumanoidBones.length, 0);
    assert.equal(report.missingFacialRigBones.length, 0);
    assert.equal(report.lodLevelsFound.length, 3);
    assert.equal(report.groundOriginVerified, true);
    assert.equal(report.specialClipsUnique, true);
    assert.equal(report.documentedAnimations.length, 17);
  }

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

/**
 * Helper to synthesize a custom binary GLB 2.0 buffer from a glTF JSON object and binary payload
 * for deterministic unit testing of CharacterAssetValidator edge cases.
 */
function buildSyntheticGLBBuffer(
  gltfJson: Record<string, unknown>,
  binData: Uint8Array = new Uint8Array(64)
): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltfJson));
  const jsonPaddedLen = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const jsonChunk = new Uint8Array(jsonPaddedLen);
  jsonChunk.fill(0x20);
  jsonChunk.set(jsonBytes, 0);

  const binPaddedLen = Math.ceil(binData.byteLength / 4) * 4;
  const binChunk = new Uint8Array(binPaddedLen);
  binChunk.set(binData, 0);

  const totalLength = 12 + 8 + jsonPaddedLen + 8 + binPaddedLen;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalLength, true);

  view.setUint32(12, jsonPaddedLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonChunk, 20);

  const binOffset = 20 + jsonPaddedLen;
  view.setUint32(binOffset, binPaddedLen, true);
  view.setUint32(binOffset + 4, 0x004e4942, true); // 'BIN\0'
  out.set(binChunk, binOffset + 8);

  return out;
}

test('16. Section 4, 5 & 10 GLB Validation Suite: Header, Truncation, JSON, Meshes, Skins, JOINTS_0 Range, WEIGHTS_0 Normalization, Accessor Counts, Buffer Bounds & Animation Samplers', () => {
  // 1. Truncated buffer (< 20 bytes)
  const tinyReport = CharacterAssetValidator.validateGLBBuffer(
    new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
    'action_sultan'
  );
  assert.equal(tinyReport.glbFileValid, false);
  assert.equal(tinyReport.productionRigValid, false);
  assert.equal(tinyReport.productionReady, false);

  // 2. Invalid magic header
  const badMagic = new Uint8Array(32);
  const badMagicReport = CharacterAssetValidator.validateGLBBuffer(badMagic, 'action_sultan');
  assert.equal(badMagicReport.glbFileValid, false);
  assert.ok(badMagicReport.errors.some((e) => e.includes('Invalid GLB header magic')));

  // 3. Truncated GLB where declared length > buffer length
  const validSynthetic = buildSyntheticGLBBuffer({ asset: { version: '2.0' }, meshes: [{}] });
  const truncatedBytes = validSynthetic.slice(0, validSynthetic.byteLength - 6);
  const truncReport = CharacterAssetValidator.validateGLBBuffer(truncatedBytes, 'action_sultan');
  assert.equal(truncReport.glbFileValid, false);
  assert.ok(truncReport.errors.some((e) => e.includes('Truncated')));

  // 4. Invalid JSON chunk
  const corruptJsonBytes = new Uint8Array(validSynthetic);
  corruptJsonBytes[20] = 0x7b; // '{'
  corruptJsonBytes[21] = 0xff; // invalid UTF-8 / JSON syntax
  corruptJsonBytes[22] = 0x00;
  const corruptJsonReport = CharacterAssetValidator.validateGLBBuffer(
    corruptJsonBytes,
    'action_sultan'
  );
  assert.equal(corruptJsonReport.glbFileValid, false);

  // 5. Missing meshes
  const noMeshGlb = buildSyntheticGLBBuffer({
    asset: { version: '2.0' },
    meshes: [],
    nodes: [{ name: 'Hips' }],
  });
  const noMeshReport = CharacterAssetValidator.validateGLBBuffer(noMeshGlb, 'action_sultan');
  assert.equal(noMeshReport.glbFileValid, false);
  assert.ok(noMeshReport.errors.some((e) => e.includes('missing valid meshes')));

  // Construct a clean binary buffer with dedicated bufferViews:
  // - bufferView 0 (offset 0, len 12): POSITION VEC3 float32 (1 vertex: [0, 1.0, 0])
  // - bufferView 1 (offset 12, len 4): JOINTS_0 VEC4 uint8 (1 vertex: [0, 1, 2, 3])
  // - bufferView 2 (offset 16, len 16): WEIGHTS_0 VEC4 float32 (1 vertex: [0.7, 0.3, 0.0, 0.0], sum = 1.0)
  // - bufferView 3 (offset 32, len 8): Anim input SCALAR float32 (2 keys: [0.0, 0.5])
  // - bufferView 4 (offset 40, len 32): Anim output VEC4 float32 (2 rotation quaternions: [0,0,0,1], [0,0,0,1])
  const createValidProductionBin = (): Uint8Array => {
    const bin = new Uint8Array(72);
    const dv = new DataView(bin.buffer);
    // POSITION (offset 0)
    dv.setFloat32(0, 0.0, true);
    dv.setFloat32(4, 1.0, true);
    dv.setFloat32(8, 0.0, true);
    // JOINTS_0 (offset 12)
    bin[12] = 0;
    bin[13] = 1;
    bin[14] = 2;
    bin[15] = 3;
    // WEIGHTS_0 (offset 16)
    dv.setFloat32(16, 0.7, true);
    dv.setFloat32(20, 0.3, true);
    dv.setFloat32(24, 0.0, true);
    dv.setFloat32(28, 0.0, true);
    // Anim input times (offset 32)
    dv.setFloat32(32, 0.0, true);
    dv.setFloat32(36, 0.5, true);
    // Anim output rotations (offset 40)
    dv.setFloat32(40, 0.0, true);
    dv.setFloat32(44, 0.0, true);
    dv.setFloat32(48, 0.0, true);
    dv.setFloat32(52, 1.0, true);
    dv.setFloat32(56, 0.0, true);
    dv.setFloat32(60, 0.1, true);
    dv.setFloat32(64, 0.0, true);
    dv.setFloat32(68, 0.995, true);
    return bin;
  };

  const validBin = createValidProductionBin();

  const allBoneNodes = [
    ...REQUIRED_HUMANOID_BONES.map((name: string) => ({
      name,
      translation: [0, 0, 0],
    })),
    ...REQUIRED_FACIAL_BONES.map((name: string) => ({
      name,
      translation: [0, 0, 0],
    })),
  ];
  const jointIndices = REQUIRED_HUMANOID_BONES.map((_, idx) => idx);

  const allClipNames = [
    'Idle',
    'Walk',
    'Run',
    'Jump',
    'Crouch',
    'Block',
    'Punch',
    'Kick',
    'Grab',
    'HitReaction',
    'Knockback',
    'Knockdown',
    'Recovery',
    'Victory',
    'Defeat',
    'Anim_AS_SuperShot_BlackbuckGunshot',
    'Anim_AS_SuperMove_SultanBreaker',
  ];

  const baseSkinnedGltf = {
    asset: {
      version: '2.0',
      extras: {
        isPlaceholder: false,
        productionStatus: 'PRODUCTION_READY',
        lodLevels: [0, 1, 2],
        specialClips: {
          superShot: 'Anim_AS_SuperShot_BlackbuckGunshot',
          superMove: 'Anim_AS_SuperMove_SultanBreaker',
        },
        documentedAnimations: allClipNames,
      },
    },
    nodes: [
      ...allBoneNodes,
      { name: 'LOD0_High', mesh: 0, skin: 0 },
      { name: 'LOD1_Medium', mesh: 0, skin: 0 },
      { name: 'LOD2_Low', mesh: 0, skin: 0 },
    ],
    skins: [
      {
        name: 'HumanoidArmature',
        skeleton: 1,
        joints: jointIndices,
      },
    ],
    meshes: [
      {
        name: 'BodyLOD0',
        primitives: [
          {
            attributes: {
              POSITION: 0,
              JOINTS_0: 1,
              WEIGHTS_0: 2,
            },
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 1,
        type: 'VEC3',
        min: [-0.45, 0, -0.25],
        max: [0.45, 1.85, 0.25],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5121,
        count: 1,
        type: 'VEC4',
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126,
        count: 1,
        type: 'VEC4',
      },
      {
        bufferView: 3,
        byteOffset: 0,
        componentType: 5126,
        count: 2,
        type: 'SCALAR',
        min: [0.0],
        max: [0.5],
      },
      {
        bufferView: 4,
        byteOffset: 0,
        componentType: 5126,
        count: 2,
        type: 'VEC4',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12 },
      { buffer: 0, byteOffset: 12, byteLength: 4 },
      { buffer: 0, byteOffset: 16, byteLength: 16 },
      { buffer: 0, byteOffset: 32, byteLength: 8 },
      { buffer: 0, byteOffset: 40, byteLength: 32 },
    ],
    materials: [
      {
        name: 'SkinMat',
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
      },
    ],
    animations: allClipNames.map((name) => ({
      name,
      channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
      samplers: [{ input: 3, interpolation: 'LINEAR', output: 4 }],
    })),
  };

  // 6. Genuine skinned production GLB passes all 4 validation states
  const prodGlb = buildSyntheticGLBBuffer(baseSkinnedGltf, validBin);
  const prodReport = CharacterAssetValidator.validateGLBBuffer(prodGlb, 'action_sultan');
  assert.equal(prodReport.glbFileValid, true);
  assert.equal(
    prodReport.productionRigValid,
    true,
    `Expected productionRigValid=true, reasons: ${prodReport.productionEligibilityReasons.join('; ')}`
  );
  assert.equal(
    prodReport.animationValid,
    true,
    `Expected animationValid=true, errors: ${prodReport.errors.join('; ')}`
  );
  assert.equal(prodReport.productionReady, true);
  assert.equal(prodReport.isPlaceholder, false);
  assert.equal(prodReport.productionStatus, 'PRODUCTION_READY');

  // 7. Missing JOINTS_0 -> productionRigValid = false
  const noJointsGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  delete noJointsGltf.meshes[0].primitives[0].attributes.JOINTS_0;
  const noJointsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(noJointsGltf, validBin),
    'action_sultan'
  );
  assert.equal(noJointsReport.glbFileValid, true);
  assert.equal(noJointsReport.productionRigValid, false);
  assert.equal(noJointsReport.hasValidJointsAttribute, false);

  // 8. Out-of-range vertex joint index in JOINTS_0 binary buffer -> productionRigValid = false
  const outOfRangeJointsBin = new Uint8Array(validBin);
  outOfRangeJointsBin[12] = 99; // 99 >= skin.joints.length (20)
  const outOfRangeJointsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(baseSkinnedGltf, outOfRangeJointsBin),
    'action_sultan'
  );
  assert.equal(outOfRangeJointsReport.hasValidJointsAttribute, false);
  assert.equal(outOfRangeJointsReport.skinningValid, false);
  assert.equal(outOfRangeJointsReport.productionRigValid, false);

  // 9. Missing WEIGHTS_0 -> productionRigValid = false
  const noWeightsGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  delete noWeightsGltf.meshes[0].primitives[0].attributes.WEIGHTS_0;
  const noWeightsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(noWeightsGltf, validBin),
    'action_sultan'
  );
  assert.equal(noWeightsReport.glbFileValid, true);
  assert.equal(noWeightsReport.productionRigValid, false);
  assert.equal(noWeightsReport.hasValidWeightsAttribute, false);

  // 10. Zero WEIGHTS_0 values in binary buffer -> productionRigValid = false
  const zeroWeightsBin = new Uint8Array(validBin);
  const zwView = new DataView(zeroWeightsBin.buffer);
  zwView.setFloat32(16, 0.0, true);
  zwView.setFloat32(20, 0.0, true);
  zwView.setFloat32(24, 0.0, true);
  zwView.setFloat32(28, 0.0, true);
  const zeroWeightsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(baseSkinnedGltf, zeroWeightsBin),
    'action_sultan'
  );
  assert.equal(zeroWeightsReport.glbFileValid, true);
  assert.equal(zeroWeightsReport.hasValidWeightsAttribute, true);
  assert.equal(zeroWeightsReport.hasUsableVertexWeights, false);
  assert.equal(zeroWeightsReport.productionRigValid, false);

  // 11. NaN or unnormalized WEIGHTS_0 values in binary buffer -> productionRigValid = false
  const nanWeightsBin = new Uint8Array(validBin);
  new DataView(nanWeightsBin.buffer).setFloat32(16, Number.NaN, true);
  const nanWeightsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(baseSkinnedGltf, nanWeightsBin),
    'action_sultan'
  );
  assert.equal(nanWeightsReport.hasUsableVertexWeights, false);
  assert.equal(nanWeightsReport.productionRigValid, false);

  const unnormalizedWeightsBin = new Uint8Array(validBin);
  new DataView(unnormalizedWeightsBin.buffer).setFloat32(16, 4.5, true); // sum = 4.8 > 1.5
  const unnormWeightsReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(baseSkinnedGltf, unnormalizedWeightsBin),
    'action_sultan'
  );
  assert.equal(unnormWeightsReport.hasUsableVertexWeights, false);
  assert.equal(unnormWeightsReport.productionRigValid, false);

  // 12. Accessor count mismatch between POSITION and JOINTS_0/WEIGHTS_0 -> productionRigValid = false
  const mismatchedCountGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  mismatchedCountGltf.accessors[1].count = 2; // JOINTS_0 count 2 != POSITION count 1
  const mismatchedCountReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(mismatchedCountGltf, validBin),
    'action_sultan'
  );
  assert.equal(mismatchedCountReport.skinningValid, false);
  assert.equal(mismatchedCountReport.productionRigValid, false);

  // 13. Out-of-bounds bufferView byteOffset/byteLength -> productionRigValid = false
  const badBufferViewGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  badBufferViewGltf.bufferViews[2].byteOffset = 9999;
  const badBufferViewReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(badBufferViewGltf, validBin),
    'action_sultan'
  );
  assert.equal(badBufferViewReport.skinningValid, false);
  assert.equal(badBufferViewReport.productionRigValid, false);

  // 14. Invalid skin skeleton reference or missing mesh-node skin binding -> productionRigValid = false
  const badSkinRefGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  badSkinRefGltf.skins[0].skeleton = 9999;
  const badSkinRefReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(badSkinRefGltf, validBin),
    'action_sultan'
  );
  assert.equal(badSkinRefReport.skinningValid, false);
  assert.equal(badSkinRefReport.productionRigValid, false);

  const noNodeSkinBindingGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  for (const n of noNodeSkinBindingGltf.nodes) {
    delete n.skin;
  }
  const noNodeSkinBindingReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(noNodeSkinBindingGltf, validBin),
    'action_sultan'
  );
  assert.equal(noNodeSkinBindingReport.skinningValid, false);
  assert.equal(noNodeSkinBindingReport.productionRigValid, false);

  // 15. Missing special animation clips -> productionRigValid = true, animationValid = false, productionReady = false (NOT PRODUCTION_READY!)
  const missingSpecialClipGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  missingSpecialClipGltf.animations = [missingSpecialClipGltf.animations[0]];
  const missingSpecialReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(missingSpecialClipGltf, validBin),
    'action_sultan'
  );
  assert.equal(missingSpecialReport.glbFileValid, true);
  assert.equal(missingSpecialReport.productionRigValid, true);
  assert.equal(missingSpecialReport.animationValid, false);
  assert.equal(missingSpecialReport.productionReady, false);
  assert.notEqual(
    missingSpecialReport.productionStatus,
    'PRODUCTION_READY',
    'Model with missing required animations must NOT be marked PRODUCTION_READY'
  );

  // 16. Non-monotonic or NaN animation keyframe timestamps -> animationValid = false
  const nonMonotonicAnimBin = new Uint8Array(validBin);
  const nmView = new DataView(nonMonotonicAnimBin.buffer);
  nmView.setFloat32(32, 0.8, true);
  nmView.setFloat32(36, 0.2, true); // t[1] < t[0] (decreasing time)
  const nonMonotonicReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(baseSkinnedGltf, nonMonotonicAnimBin),
    'action_sultan'
  );
  assert.equal(nonMonotonicReport.animationValid, false);
  assert.equal(nonMonotonicReport.productionReady, false);

  // 17. Invalid animation sampler output type/count -> animationValid = false
  const badAnimSamplerGltf = JSON.parse(JSON.stringify(baseSkinnedGltf));
  badAnimSamplerGltf.accessors[4].count = 1; // output count 1 != input count 2
  const badAnimSamplerReport = CharacterAssetValidator.validateGLBBuffer(
    buildSyntheticGLBBuffer(badAnimSamplerGltf, validBin),
    'action_sultan'
  );
  assert.equal(badAnimSamplerReport.animationValid, false);
  assert.equal(badAnimSamplerReport.productionReady, false);
});

test('17. Section 3 & 10 Hierarchy Discovery, Unattachable Root Rejection, Bone Resolution, Transform Application & Resource Disposal (NullEngine)', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  // 1. Test top-level root discovery and attachment with multiple roots and nested children
  const rootNode = new TransformNode('test_root', scene);
  const facingNode = new TransformNode('test_facing', scene);
  facingNode.parent = rootNode;
  const modelTransformNode = new TransformNode('test_model_transform', scene);
  modelTransformNode.parent = facingNode;

  const importedRootA = new TransformNode('ArmatureRoot', scene);
  const childNodeA = new TransformNode('ChildBoneNode', scene);
  childNodeA.parent = importedRootA;

  const importedRootMeshB = MeshBuilder.CreateBox('StandaloneAccessoryRoot', { size: 0.2 }, scene);
  const childMeshB = MeshBuilder.CreateBox('NestedAccessoryChild', { size: 0.1 }, scene);
  childMeshB.parent = importedRootMeshB;

  const attachedResult = attachImportedGLBHierarchyToFacingNode(
    modelTransformNode,
    [importedRootMeshB, childMeshB],
    [importedRootA, childNodeA]
  );

  assert.equal(attachedResult.importedRoots.length, 2, 'Discovers both TransformNode and Mesh top-level roots');
  assert.equal(attachedResult.hierarchyValid, true);
  assert.equal(importedRootA.parent, modelTransformNode, 'Top-level TransformNode root attached to modelTransformNode');
  assert.equal(importedRootMeshB.parent, modelTransformNode, 'Top-level Mesh root attached to modelTransformNode');
  assert.equal(childNodeA.parent, importedRootA, 'Nested TransformNode child preserves internal parent');
  assert.equal(childMeshB.parent, importedRootMeshB, 'Nested Mesh child preserves internal parent');

  // 2. Test unattachable / broken root node failing descendant verification and being rejected by production eligibility
  const unattachableRoot = new TransformNode('UnattachableRoot', scene);
  Object.defineProperty(unattachableRoot, 'parent', {
    get: () => null,
    set: () => {
      // Simulate a broken or locked parent setter that refuses attachment
    },
    configurable: true,
  });
  const brokenAttachment = attachImportedGLBHierarchyToFacingNode(
    modelTransformNode,
    [],
    [unattachableRoot]
  );
  assert.equal(
    brokenAttachment.hierarchyValid,
    false,
    'Root that cannot be attached under modelTransformNode fails hierarchyValid'
  );

  const emptyAttachment = attachImportedGLBHierarchyToFacingNode(modelTransformNode, [], []);
  assert.equal(
    emptyAttachment.hierarchyValid,
    false,
    'Zero imported nodes fails hierarchyValid'
  );

  const bounds = computeRigWorldBounds(rootNode, [importedRootMeshB, childMeshB]);
  const rejectedByHierarchyEligibility = evaluateRuntimeProductionRigEligibility({
    manifest: {
      ...CHARACTER_ASSET_MANIFEST.action_sultan,
      isTemporaryPlaceholder: false,
    },
    glbLoaded: true,
    hierarchyValid: brokenAttachment.hierarchyValid,
    importedMeshes: [importedRootMeshB],
    allSkeletons: [],
    missingHumanoidBones: [],
    dimensions: bounds,
  });
  assert.equal(
    rejectedByHierarchyEligibility.isProductionReady,
    false,
    'Invalid hierarchy is rejected by evaluateRuntimeProductionRigEligibility'
  );
  assert.ok(
    rejectedByHierarchyEligibility.reasons.some((r) =>
      r.includes('hierarchy validation failed')
    ),
    'Records explicit hierarchy validation failure reason'
  );

  // 3. Test bone resolution across Mixamo, Rigify, and Skeleton.bones without false-positive mapping
  const skeleton = new Skeleton('TestHumanoidSkeleton', 'skel_0', scene);
  const boneMapInputNodes: TransformNode[] = [];

  const mixamoAliases: Record<string, string> = {
    Root: 'Armature',
    Hips: 'mixamorig:Hips',
    Spine: 'mixamorig:Spine',
    Chest: 'mixamorig:Spine2',
    Neck: 'mixamorig:Neck',
    Head: 'mixamorig:Head',
    LeftShoulder: 'mixamorig:LeftShoulder',
    LeftUpperArm: 'mixamorig:LeftArm',
    LeftForeArm: 'mixamorig:LeftForeArm',
    LeftHand: 'mixamorig:LeftHand',
    RightShoulder: 'mixamorig:RightShoulder',
  };

  for (const [, alias] of Object.entries(mixamoAliases)) {
    const tn = new TransformNode(alias, scene);
    tn.parent = importedRootA;
    boneMapInputNodes.push(tn);
  }

  const rigifyBones: Record<string, string> = {
    RightUpperArm: 'DEF-upper_arm.R',
    RightForeArm: 'DEF-forearm.R',
    RightHand: 'DEF-hand.R',
    LeftUpLeg: 'DEF-thigh.L',
    LeftLeg: 'DEF-shin.L',
    RightUpLeg: 'DEF-thigh.R',
    RightLeg: 'DEF-shin.R',
  };

  for (const [, alias] of Object.entries(rigifyBones)) {
    new Bone(alias, skeleton);
    // Intentionally omit LeftFoot/RightFoot to verify missing bones are NEVER mapped to unrelated nodes!
  }

  const boneResolution = resolveHumanoidSkeletonAndBones(
    'action_sultan',
    boneMapInputNodes,
    [importedRootMeshB],
    [skeleton],
    scene,
    modelTransformNode,
    'test_rig'
  );

  assert.ok(boneResolution.resolvedBoneMap.Hips, 'Resolved Mixamo Hips');
  assert.ok(boneResolution.resolvedBoneMap.Chest, 'Resolved Mixamo Spine2 -> Chest');
  assert.ok(boneResolution.resolvedBoneMap.RightUpperArm, 'Resolved Rigify Skeleton Bone DEF-upper_arm.R -> RightUpperArm');
  assert.ok(boneResolution.resolvedBoneMap.RightLeg, 'Resolved Rigify Skeleton Bone DEF-shin.R -> RightLeg');
  assert.equal(boneResolution.resolvedBoneMap.LeftFoot, undefined, 'Missing LeftFoot is NOT mapped to an unrelated node');
  assert.equal(boneResolution.resolvedBoneMap.RightFoot, undefined, 'Missing RightFoot is NOT mapped to an unrelated node');
  assert.ok(boneResolution.missingBones.includes('LeftFoot'));
  assert.ok(boneResolution.missingBones.includes('RightFoot'));

  // 4. Verify loadCharacterRig3D for all 4 fighters applies scale/groundOffset once, cleans up failed/placeholder imports, and disposes cleanly
  for (const char of CHARACTER_LIST) {
    const meshCountBeforeLoad = scene.meshes.length;
    const rig = await loadCharacterRig3D(scene, char, `null_${char.id}`, null);
    const manifest = CHARACTER_ASSET_MANIFEST[char.id];

    assert.equal(rig.isPlaceholderAsset, true);
    assert.equal(rig.productionReady, false);
    assert.equal(rig.rootNode.scaling.x, 1, 'rootNode scaling remains 1');
    assert.equal(rig.facingNode.scaling.x, 1, 'facingNode scaling remains 1');
    assert.ok(
      Math.abs(rig.modelTransformNode.scaling.x - manifest.scale) < 1e-5,
      'manifest.scale is applied exactly once on modelTransformNode'
    );
    assert.ok(
      Math.abs(rig.modelTransformNode.position.y - manifest.groundOffset) < 1e-5,
      'manifest.groundOffset is applied exactly once on modelTransformNode'
    );

    // Move FighterRoot on 2D XY plane and rotate FacingNode
    rig.rootNode.position.set(2.75, 1.25, 0);
    rig.facingNode.rotation.y = -Math.PI * 0.5;
    rig.sockets.Head.computeWorldMatrix(true);
    const updatedHeadPos = rig.sockets.Head.getAbsolutePosition();
    assert.ok(Math.abs(updatedHeadPos.x - 2.75) < 1.0, 'Head socket world X follows FighterRoot X');
    assert.ok(updatedHeadPos.y > 1.25, 'Head socket world Y is above FighterRoot Y');

    rig.dispose();
    assert.equal(
      scene.meshes.length,
      meshCountBeforeLoad,
      'rig.dispose() releases all character meshes from scene with zero leaked meshes'
    );
  }

  // 5. Verify full cleanup of imported meshes, transformNodes, skeletons, and animationGroups when an imported GLB fails hierarchy attachment / eligibility
  const origImportMeshAsync = SceneLoader.ImportMeshAsync;
  let importedBrokenRoot: TransformNode | null = null;
  let importedChildMesh: ReturnType<typeof MeshBuilder.CreateBox> | null = null;
  let importedExtraNode: TransformNode | null = null;
  let importedAnimGroup: AnimationGroup | null = null;

  try {
    SceneLoader.ImportMeshAsync = (async () => {
      importedBrokenRoot = new TransformNode('__root__', scene);
      Object.defineProperty(importedBrokenRoot, 'parent', {
        get() {
          return null;
        },
        set() {
          throw new Error('Simulated broken root parent setter during ImportMeshAsync');
        },
      });
      importedChildMesh = MeshBuilder.CreateBox('ImportedFailedMesh', { size: 1 }, scene);
      importedExtraNode = new TransformNode('ImportedFailedNode', scene);
      importedAnimGroup = new AnimationGroup('ImportedFailedAnimGroup', scene);
      const importedSkel = new Skeleton('ImportedFailedSkeleton', 'failed_skel', scene);

      return {
        meshes: [importedChildMesh],
        particleSystems: [],
        skeletons: [importedSkel],
        animationGroups: [importedAnimGroup],
        transformNodes: [importedBrokenRoot, importedExtraNode],
        geometries: [],
        lights: [],
        spriteManagers: [],
      };
    }) as unknown as typeof SceneLoader.ImportMeshAsync;

    const fallbackResult = await CharacterAssetLoader.loadCharacterFromManifest(
      scene,
      CHARACTERS.action_sultan,
      'cleanup_test',
      null
    );

    assert.equal(
      fallbackResult.diagnostics.hierarchyValid,
      false,
      'loadCharacterFromManifest records hierarchyValid = false when imported root fails attachment'
    );
    assert.equal(
      fallbackResult.isPlaceholderAsset,
      true,
      'loadCharacterFromManifest falls back to Path A placeholder when hierarchy attachment fails'
    );
    assert.equal(
      fallbackResult.diagnostics.usedTemporaryPlaceholder,
      true,
      'loadCharacterFromManifest sets usedTemporaryPlaceholder = true on Path A fallback'
    );
    assert.equal(
      importedChildMesh!.isDisposed(),
      true,
      'Imported mesh from failed hierarchy is disposed on Path A fallback'
    );
    assert.equal(
      importedBrokenRoot!.isDisposed(),
      true,
      'Imported broken root from failed hierarchy is disposed on Path A fallback'
    );
    assert.equal(
      importedExtraNode!.isDisposed(),
      true,
      'Imported TransformNode from failed hierarchy is disposed on Path A fallback'
    );

    fallbackResult.dispose();
  } finally {
    SceneLoader.ImportMeshAsync = origImportMeshAsync;
  }

  scene.dispose();
  engine.dispose();
});

test('18. Section 5, 6 & 10 Animation Controller Suite: Empty AnimationGroup Filtering, No Per-Frame Restart, 8-State Transitions & Coordinate Safety (NullEngine)', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const anim3D = new AnimationController3D();
  const charAnim = new CharacterAnimationController();

  const rig = await loadCharacterRig3D(scene, CHARACTERS.action_sultan, 'anim_test', null);
  rig.rootNode.position.set(-3.2, 0.5, 0);

  // 1. Verify transitions across all 8 core verification states (Idle, Walk, Punch, Kick, Block, Jump, SuperShot, SuperMove)
  // never mutate rootNode.position and always produce valid event payloads
  const eightStates: FighterStateName[] = [
    'idle',
    'walk',
    'punch',
    'kick',
    'block',
    'jump',
    'super_shot',
    'super_move',
  ];
  for (const st of eightStates) {
    const evt = charAnim.updateRigPose(rig, 'action_sultan', st, 0.08, 1 / 60, 1, 0);
    assert.equal(evt.state, st);
    assert.ok(evt.clipName.length > 0);
    assert.equal(rig.rootNode.position.x, -3.2, `State ${st} never mutates rootNode.position.x`);
    assert.equal(rig.rootNode.position.y, 0.5, `State ${st} never mutates rootNode.position.y`);
    assert.equal(rig.rootNode.position.z, 0, `State ${st} never mutates rootNode.position.z`);
  }

  // 2. Verify empty AnimationGroup (0 targetedAnimations) is rejected by createAnimationGroupController
  const emptyGroup = new AnimationGroup('Walk', scene);
  const dummyTarget = new TransformNode('DummyAnimTarget', scene);
  const animClip = new Animation(
    'rotAnim',
    'rotation.y',
    60,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CYCLE
  );
  animClip.setKeys([
    { frame: 0, value: 0 },
    { frame: 30, value: 1.0 },
  ]);
  const idleGroup = new AnimationGroup('Anim_Common_Idle', scene);
  idleGroup.addTargetedAnimation(animClip, dummyTarget);

  let startCallCount = 0;
  const origStart = idleGroup.start.bind(idleGroup);
  idleGroup.start = (...args: Parameters<typeof idleGroup.start>) => {
    startCallCount++;
    return origStart(...args);
  };

  const controllerWarnings: string[] = [];
  const glbController = new GLBAnimationGroupController(
    'action_sultan',
    [idleGroup, emptyGroup],
    controllerWarnings
  );
  assert.equal(
    glbController.hasClip('walk'),
    false,
    'Empty Walk AnimationGroup (0 targetedAnimations) is filtered out and not treated as usable'
  );
  assert.ok(
    controllerWarnings.some((w) => w.includes('Skipping unusable AnimationGroup "Walk"')),
    'Logs warning when skipping empty AnimationGroup'
  );

  rig.isPlaceholderAsset = false;
  rig.productionRigValid = true;
  rig.glbAnimationController = glbController;

  // Frame 1 of Idle: starts AnimationGroup once
  anim3D.updateRigPose(rig, 'action_sultan', 'idle', 0.016, 1 / 60, 1, 0);
  assert.equal(startCallCount, 1, 'Starts Idle AnimationGroup on state entry');

  // Frame 2 & Frame 3 of Idle: must NOT restart the active AnimationGroup every render frame!
  anim3D.updateRigPose(rig, 'action_sultan', 'idle', 0.032, 1 / 60, 1, 0);
  anim3D.updateRigPose(rig, 'action_sultan', 'idle', 0.048, 1 / 60, 1, 0);
  assert.equal(startCallCount, 1, 'Does NOT restart active AnimationGroup on subsequent frames');

  // Transition to 'kick' (missing from [idleGroup]): stops Idle group, records warning, falls back to procedural pose
  const prevRightLegRx = rig.bones.RightUpperLeg.rotation.x;
  anim3D.updateRigPose(rig, 'action_sultan', 'kick', 0.05, 1 / 60, 1, 0);
  assert.notEqual(
    rig.bones.RightUpperLeg.rotation.x,
    prevRightLegRx,
    'Falls back to procedural RightUpperLeg pose when production GLB is missing kick clip'
  );
  assert.ok(
    rig.diagnostics?.warnings.some((w) => w.includes('missing usable AnimationGroup')),
    'Records missing clip fallback warning in rig diagnostics'
  );

  emptyGroup.dispose();
  idleGroup.dispose();
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test('19. Section 7 & 10 CharacterPreviewScene Lifecycle, Rapid Switching Load-Token Protection, PreviewAudioTimerManager Cancellation & Gameplay Isolation (NullEngine)', async () => {
  const nullEngine = new NullEngine();
  const fakeCanvas = {
    width: 460,
    height: 260,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;

  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.0, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS.romance_raja, 2.0, 0, 0);

  const preview = new CharacterPreviewScene(
    fakeCanvas,
    'action_sultan',
    undefined,
    nullEngine
  );

  // 1. Rapidly switch characters: action_sultan -> romance_raja -> duggu -> bhidu
  const pSultan = preview.loadCharacterAsset('action_sultan');
  const pRaja = preview.loadCharacterAsset('romance_raja');
  const pDuggu = preview.loadCharacterAsset('duggu');
  const pBhidu = preview.loadCharacterAsset('bhidu');

  const [rSultan, rRaja, rDuggu, rBhidu] = await Promise.all([
    pSultan,
    pRaja,
    pDuggu,
    pBhidu,
  ]);

  // Earlier loads must be cancelled/disposed by newer loadToken; only the latest ('bhidu') remains active
  assert.equal(rSultan, null, 'Stale async load (action_sultan) cancelled by newer loadToken');
  assert.equal(rRaja, null, 'Stale async load (romance_raja) cancelled by newer loadToken');
  assert.equal(rDuggu, null, 'Stale async load (duggu) cancelled by newer loadToken');
  assert.ok(rBhidu, 'Latest character load (bhidu) succeeds');
  assert.equal(preview.getCurrentRig()?.characterId, 'bhidu');

  // 2. Preview animation triggers must never mutate gameplay Fighter3D state
  preview.triggerAnimationState('super_shot');
  preview.triggerAnimationState('super_move');
  assert.equal(p1.state, 'idle', 'Preview scene is completely isolated from gameplay Fighter3D');
  assert.equal(p2.health, p2.maxHealth);

  // 3. Test PreviewAudioTimerManager cancellation on new state trigger, character switch, and unmount/dispose
  const timerMgr = new PreviewAudioTimerManager('action_sultan');
  const firedEvents: string[] = [];

  // Schedule two timers for action_sultan, then immediately clearAll() (simulating clicking another preview button)
  timerMgr.schedule(15, 'action_sultan', () => firedEvents.push('sultan_stale_release'));
  timerMgr.schedule(25, 'action_sultan', () => firedEvents.push('sultan_stale_impact'));
  assert.equal(timerMgr.getPendingTimerCount(), 2);
  timerMgr.clearAll();
  assert.equal(timerMgr.getPendingTimerCount(), 0, 'clearAll cancels pending timers immediately');

  // Schedule a timer for action_sultan, then switch character to romance_raja before it fires
  timerMgr.schedule(15, 'action_sultan', () => firedEvents.push('sultan_after_switch'));
  timerMgr.setCharacterId('romance_raja');
  assert.equal(timerMgr.getPendingTimerCount(), 0, 'Switching character cancels previous character timers');

  // Schedule a valid timer for romance_raja that should fire
  timerMgr.schedule(10, 'romance_raja', () => firedEvents.push('raja_valid_impact'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(
    firedEvents,
    ['raja_valid_impact'],
    'Only the active character timer fires; cancelled/switched timers never fire'
  );

  // Schedule a timer and dispose before it fires (simulating preview unmount)
  timerMgr.schedule(15, 'romance_raja', () => firedEvents.push('raja_after_dispose'));
  timerMgr.dispose();
  assert.equal(timerMgr.getPendingTimerCount(), 0);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(firedEvents, ['raja_valid_impact'], 'Disposed timer manager never fires callbacks');

  preview.dispose();
  assert.equal(preview.getCurrentRig(), null, 'Preview dispose releases currentRig');
});

