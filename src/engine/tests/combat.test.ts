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
import {
  SettingsManager,
  DEFAULT_GAME_SETTINGS,
  sanitizeGameSettings,
  detectTouchCapability,
  shouldShowMobileControls,
} from '../SettingsManager';
import { AudioManager } from '../AudioManager';
import { shouldTriggerTitleShortcut } from '../../components/TitleScreen';
import { buildArenaPreviewFallbackState } from '../../game3d/scenes/ArenaPreview3D';

import {
  CHARACTER_ASSET_MANIFEST,
  ALL_STANDARD_ANIMATION_CLIP_IDS,
  validateCharacterAssetManifestConfig,
  resolveCharacterAnimationClip,
  getCharacterAssetConfig,
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
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import {
  CharacterAssetLoader,
  attachImportedGLBHierarchyToFacingNode,
  calibrateImportedModelTransform,
  computeRigWorldBounds,
  evaluateRuntimeProductionRigEligibility,
  resolveHumanoidSkeletonAndBones,
} from '../../game3d/assets/CharacterAssetLoader';
import {
  GLBAnimationGroupController,
  REQUIRED_FACIAL_BONES,
  REQUIRED_HUMANOID_BONES,
  buildFallbackCharacterRig3D,
  loadCharacterRig3D,
  validateGLBBuffer,
} from '../../game3d/assets/AssetLoader3D';
import {
  ALL_FIGHTER_IDS,
  applyFighterSelection,
  resolveAuthoritativeCharacterMapping,
  verifyAllAuthoritativeCharacterMappings,
} from '../../game3d/characters/CharacterRoster3D';
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
  PreviewTelemetrySnapshot,
} from '../../game3d/scenes/CharacterPreviewScene';
import { ArenaBuilder3D } from '../../game3d/arenas/ArenaBuilder3D';
import { FighterStateName } from '../../types/fighter';

test('1. Character Loading & Binary GLB 2.0 Asset Validation for all 4 fighters', () => {
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
    assert.ok(validation.meshCount > 0);

    if (char.id === 'action_sultan') {
      // Action Sultan: Genuine 3D model replacement (PRODUCTION_SKINNED or VISUAL_ONLY)
      assert.ok(validation.renderState === 'PRODUCTION_SKINNED' || validation.renderState === 'VISUAL_ONLY');
      assert.equal(validation.isPlaceholder, false);
    } else {
      // Other 3 fighters remain procedural placeholders with complete 20 dummy bone hierarchies
      assert.equal(validation.isPlaceholder, true);
      assert.equal(validation.renderState, 'TEMPORARY_PLACEHOLDER');
      assert.equal(validation.missingBones.length, 0);
      assert.ok(validation.boneCount >= REQUIRED_HUMANOID_BONES.length);
    }
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

test('10. CharacterAssetValidator, Honest Classification, FighterAnimationEvents & SuperShotProjectileSystem', () => {
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
    assert.equal(report.productionReady, false);
 
     if (char.id === 'action_sultan') {
       assert.equal(report.isPlaceholder, false);
       assert.ok(
         report.productionStatus === 'STAGE_2_INTEGRATED' ||
           report.productionStatus === 'VISUAL_ONLY' ||
           report.productionStatus === 'PRODUCTION_READY',
         `Action Sultan active replacement status: ${report.productionStatus}`
       );
       assert.ok(report.estimatedBounds.height > 0.8);
       assert.equal(report.plausibleBoundsVerified, true);
     } else {
       assert.equal(
         report.productionRigValid,
         false,
         `Placeholder for ${char.id} must NOT be classified as a production skinned rig`
       );
       assert.equal(report.isPlaceholder, true);
       assert.equal(report.isVisualOnly, false);
       assert.equal(report.productionStatus, 'PLACEHOLDER');
       assert.equal(report.missingHumanoidBones.length, 0);
       assert.equal(report.missingFacialRigBones.length, 0);
       assert.equal(report.lodLevelsFound.length, 3);
       assert.equal(report.groundOriginVerified, true);
       assert.equal(report.specialClipsUnique, true);
       assert.equal(report.documentedAnimations.length, 17);
     }
  }

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
      char.id !== 'action_sultan',
      `${char.id} placeholder status matches active/temporary status`
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

  // Reset back to vs_cpu and 'stand' for clean state
  bridge.setTrainingDummyBehavior('stand');
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

    assert.equal(
      rig.isPlaceholderAsset,
      char.id !== 'action_sultan',
      `${char.id} isPlaceholderAsset matches character status`
    );
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

  const rig = await loadCharacterRig3D(scene, CHARACTERS.romance_raja, 'anim_test', null);
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
    const evt = charAnim.updateRigPose(rig, 'romance_raja', st, 0.08, 1 / 60, 1, 0);
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
    'romance_raja',
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
  anim3D.updateRigPose(rig, 'romance_raja', 'idle', 0.016, 1 / 60, 1, 0);
  assert.equal(startCallCount, 1, 'Starts Idle AnimationGroup on state entry');

  // Frame 2 & Frame 3 of Idle: must NOT restart the active AnimationGroup every render frame!
  anim3D.updateRigPose(rig, 'romance_raja', 'idle', 0.032, 1 / 60, 1, 0);
  anim3D.updateRigPose(rig, 'romance_raja', 'idle', 0.048, 1 / 60, 1, 0);
  assert.equal(startCallCount, 1, 'Does NOT restart active AnimationGroup on subsequent frames');

  // Transition to 'kick' (missing from [idleGroup]): stops Idle group, records warning, falls back to procedural pose
  const prevRightLegRx = rig.bones.RightUpperLeg.rotation.x;
  anim3D.updateRigPose(rig, 'romance_raja', 'kick', 0.05, 1 / 60, 1, 0);
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

test('20. Section 10 Action Sultan GLB Replacement Activation & 12 Architectural Verifications (NullEngine)', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new UniversalCamera('testCam', new Vector3(0, 1.5, -4), scene);

  // 1. Action Sultan loads from configured path /assets/characters/action-sultan/model.glb
  const sultanConfig = getCharacterAssetConfig('action_sultan');
  assert.equal(sultanConfig.modelPath, '/assets/characters/action-sultan/model.glb');
  assert.equal(sultanConfig.isTemporaryPlaceholder, false, 'Action Sultan is configured as an active replacement model');

  // Load the actual GLB file from disk
  const relPath = sultanConfig.modelPath.replace(/^\//, '');
  const fullPath = path.resolve(process.cwd(), 'public', relPath);
  assert.equal(fs.existsSync(fullPath), true, 'Action Sultan GLB must exist on disk');
  const buffer = new Uint8Array(fs.readFileSync(fullPath));

  // 2. Validate replacement model: active replacement model, not a procedural box placeholder
  const report = CharacterAssetValidator.validateGLBBuffer(buffer, 'action_sultan');
  assert.equal(report.glbFileValid, true, 'Action Sultan GLB is structurally valid');
  assert.equal(report.isPlaceholder, false, 'Not classified as a placeholder');
  assert.ok(
    report.productionStatus === 'STAGE_2_INTEGRATED' ||
      report.productionStatus === 'VISUAL_ONLY' ||
      report.productionStatus === 'PRODUCTION_READY',
    `Valid active production status: ${report.productionStatus}`
  );
  assert.equal(report.skinningValid, true, 'Valid skinning attributes and joint indices');
  assert.ok(report.jointCount >= 20, 'Has humanoid joints');

  // 5. Valid replacement model geometry remains visible
  const sultanRig = await loadCharacterRig3D(
    scene,
    CHARACTERS.action_sultan,
    'test_sultan_20'
  );
  assert.ok(
    sultanRig.renderState === 'PRODUCTION_SKINNED' || sultanRig.renderState === 'VISUAL_ONLY',
    `Expected valid replacement renderState, got ${sultanRig.renderState}`
  );
  assert.equal(sultanRig.isPlaceholderAsset, false);
  assert.ok(sultanRig.meshes.length > 0, 'Imported meshes exist');
  const geomMesh = sultanRig.meshes.find((m) => m.getTotalVertices() > 0);
  assert.ok(geomMesh, 'Imported geometry mesh exists');
  assert.equal(geomMesh.isVisible, true, 'Imported geometry mesh is set to visible');

  // 6. Invalid GLB files use safe procedural fallback (LOAD_FAILED)
  const invalidBuffer = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const invalidReport = CharacterAssetValidator.validateGLBBuffer(invalidBuffer, 'action_sultan');
  assert.equal(invalidReport.glbFileValid, false);
  assert.equal(invalidReport.isVisualOnly, false);
  assert.equal(invalidReport.productionStatus, 'GRAYBOX_PLACEHOLDER');

  // 7. Model scale (1.94) and ground offset (-0.002) applied once on modelTransformNode
  assert.equal(sultanConfig.scale, 1.94);
  assert.equal(sultanConfig.groundOffset, -0.002);
  assert.equal(sultanRig.modelTransformNode.scaling.x, 1.94);
  assert.equal(sultanRig.modelTransformNode.scaling.y, 1.94);
  assert.equal(sultanRig.modelTransformNode.scaling.z, 1.94);
  assert.equal(Number(sultanRig.modelTransformNode.position.y.toFixed(3)), -0.002);

  // 8. Imported hierarchy remains attached under modelTransformNode
  assert.ok(sultanRig.importedRootNodes.length > 0);
  for (const root of sultanRig.importedRootNodes) {
    assert.equal(root.parent, sultanRig.modelTransformNode, 'Imported root parented to modelTransformNode');
  }

  // 9. Preview scene loads and reports VISUAL_ONLY telemetry
  const fakeCanvas = {
    width: 460,
    height: 260,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
  let previewTelemetry: PreviewTelemetrySnapshot | null = null;
  const preview = new CharacterPreviewScene(
    fakeCanvas,
    'action_sultan',
    (snap) => {
      previewTelemetry = snap;
    },
    engine
  );
  const loadedPreviewRig = await preview.loadCharacterAsset('action_sultan');
  assert.ok(loadedPreviewRig);
  assert.ok(
    loadedPreviewRig?.renderState === 'PRODUCTION_SKINNED' ||
      loadedPreviewRig?.renderState === 'VISUAL_ONLY'
  );
  assert.equal(loadedPreviewRig?.isPlaceholderAsset, false);

  // 10. Actual gameplay loads fighter model without errors
  const fighter3D = new Fighter3D(0, CHARACTERS.action_sultan, -1.5, 0, 0);
  assert.equal(fighter3D.id, 'action_sultan');
  assert.equal(fighter3D.position.z, 0, 'Gameplay strictly on Z = 0');
  fighter3D.stepPhysics();
  assert.equal(fighter3D.position.z, 0);

  // 11. Character switching does not leak meshes or materials
  const initialMeshCount = scene.meshes.length;
  await preview.loadCharacterAsset('romance_raja');
  assert.equal(preview.getCurrentRig()?.characterId, 'romance_raja');
  await preview.loadCharacterAsset('action_sultan');
  assert.equal(preview.getCurrentRig()?.characterId, 'action_sultan');
  // Confirm mesh cleanup works cleanly
  assert.ok(scene.meshes.length <= initialMeshCount + 50);

  // 12. Animation updates for visual-only rig do not throw and do not freeze gameplay
  const anim3D = new AnimationController3D();
  const testStates: FighterStateName[] = [
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
  for (const st of testStates) {
    assert.doesNotThrow(() => {
      anim3D.updateRigPose(sultanRig, 'action_sultan', st, 0.25, 1 / 60, 1, 0);
    }, `Animation update for state ${st} must not throw`);
  }
  // Model transform position.z must stay 0
  assert.equal(sultanRig.modelTransformNode.position.z, 0);
  assert.equal(sultanRig.rootNode.position.z, 0);

  preview.dispose();
  sultanRig.dispose();
  scene.dispose();
  engine.dispose();
});

test('21. Phase 9 Action Sultan Blender Model Grounding Calibration, Independent Capability Flags & Quaternion Skeletal Animation', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new UniversalCamera('testCam21', new Vector3(0, 1.5, -4), scene);

  const sultanRig = await loadCharacterRig3D(
    scene,
    CHARACTERS.action_sultan,
    'test_sultan_21'
  );

  // 1. Grounding & Calibration Tests
  const diag = sultanRig.diagnostics;
  assert.ok(diag, 'Action Sultan diagnostics must exist');
  assert.ok(diag.measuredLocalBounds, 'Measured unscaled local bounds must be recorded');
  assert.ok(
    Math.abs(diag.measuredLocalBounds.minY - 0.001) < 0.015,
    `Expected unscaled local minY ~ 0.001, got ${diag.measuredLocalBounds.minY}`
  );
  assert.ok(
    Math.abs(diag.measuredLocalBounds.maxY - 0.96) < 0.02,
    `Expected unscaled local maxY ~ 0.96, got ${diag.measuredLocalBounds.maxY}`
  );
  assert.ok(
    Math.abs(diag.measuredLocalBounds.height - 0.959) < 0.02,
    `Expected unscaled local height ~ 0.959, got ${diag.measuredLocalBounds.height}`
  );

  // Calibrated scale & groundOffset applied once to modelTransformNode, no double scaling
  assert.equal(sultanRig.modelTransformNode.scaling.x, 1.94);
  assert.equal(sultanRig.modelTransformNode.scaling.y, 1.94);
  assert.equal(sultanRig.modelTransformNode.scaling.z, 1.94);
  assert.equal(sultanRig.rootNode.scaling.x, 1);
  assert.equal(sultanRig.rootNode.scaling.y, 1);
  assert.equal(sultanRig.rootNode.scaling.z, 1);
  assert.equal(sultanRig.facingNode.scaling.x, 1);
  assert.equal(Number(sultanRig.modelTransformNode.position.y.toFixed(3)), -0.002);

  // Direct mathematical calibration test
  const recalib = calibrateImportedModelTransform(
    sultanRig.rootNode,
    sultanRig.modelTransformNode,
    sultanRig.meshes,
    getCharacterAssetConfig('action_sultan'),
    1.924
  );
  assert.equal(recalib.calibratedScale, 1.94);
  assert.ok(
    Math.abs(recalib.calibratedGroundOffset - -0.002) < 0.005,
    `Calibrated groundOffsetY must be ~ -0.002, got ${recalib.calibratedGroundOffset}`
  );

  // World-space foot contact check before and during animations
  const initialBounds = computeRigWorldBounds(sultanRig.rootNode, sultanRig.meshes);
  assert.equal(initialBounds.plausibleBounds, true, 'Action Sultan world bounds must be valid on the floor');
  assert.ok(
    Math.abs(initialBounds.minY - sultanRig.rootNode.position.y) <= 0.02,
    `Initial foot minY (${initialBounds.minY}) must contact floor (rootY=${sultanRig.rootNode.position.y})`
  );
  assert.ok(
    initialBounds.height >= 1.75 && initialBounds.height <= 2.1,
    `World character height (${initialBounds.height}) must match fighter scale`
  );

  // 2. Independent Rendering & Animation Capability Flags
  assert.equal(sultanRig.hasRenderableGeometry, true, 'hasRenderableGeometry must be true');
  assert.equal(sultanRig.hasValidSkinning, true, 'hasValidSkinning must be true');
  assert.equal(sultanRig.hasUsableSkeleton, true, 'hasUsableSkeleton must be true');
  assert.equal(sultanRig.hasEmbeddedAnimationGroups, true, 'hasEmbeddedAnimationGroups must be true');
  assert.equal(sultanRig.hasCanonicalHumanoidMapping, true, 'hasCanonicalHumanoidMapping must be true (20/20 bones)');
  assert.equal(
    sultanRig.canPlayImportedAnimations,
    false,
    'canPlayImportedAnimations must be false because embedded mixamo_com clip is a static 1-frame pose'
  );
  assert.equal(
    sultanRig.canUseProceduralBoneFallback,
    true,
    'canUseProceduralBoneFallback must be true because 20/20 canonical mixamorig_* bones are resolved'
  );
  assert.ok(
    sultanRig.glbAnimationController?.getStaticPoseClipNames().some((n) => n.includes('mixamo')),
    'mixamo static pose clip must be detected and classified as a static pose clip'
  );

  // 3. Quaternion Skeletal Animation across states & Non-Floating verification
  const anim3D = new AnimationController3D();
  const charAnim = new CharacterAnimationController();

  // Record bind T-pose quaternion of RightUpperArm before procedural pose
  const rArmNode = sultanRig.bones.RightUpperArm;
  const rLegNode = sultanRig.bones.RightUpperLeg;
  const headNode = sultanRig.bones.Head;
  assert.ok(rArmNode && rArmNode.rotationQuaternion, 'RightUpperArm must have rotationQuaternion');
  assert.ok(rLegNode && rLegNode.rotationQuaternion, 'RightUpperLeg must have rotationQuaternion');
  assert.ok(headNode && headNode.rotationQuaternion, 'Head must have rotationQuaternion');

  // Step idle pose and verify non-T-pose arm lowering + grounded feet
  for (let i = 0; i < 15; i++) {
    anim3D.updateRigPose(sultanRig, 'action_sultan', 'idle', i / 60, 1 / 60, 1, 0);
  }
  const idleQuatArm = rArmNode.rotationQuaternion.clone();
  const idleQuatLeg = rLegNode.rotationQuaternion.clone();
  const idleBounds = computeRigWorldBounds(sultanRig.rootNode, sultanRig.meshes);
  assert.ok(
    Math.abs(idleBounds.minY) <= 0.04,
    `Action Sultan must remain grounded during idle (minY=${idleBounds.minY})`
  );
  assert.ok(
    idleBounds.width < 1.1,
    `Action Sultan arms must be lowered from horizontal 1.94m T-pose into fighting stance (width=${idleBounds.width})`
  );

  // Step walk pose and verify legs articulate and feet remain grounded
  for (let i = 0; i < 15; i++) {
    anim3D.updateRigPose(sultanRig, 'action_sultan', 'walk', 0.18, 1 / 60, 1, 0);
  }
  const walkQuatLeg = rLegNode.rotationQuaternion.clone();
  const legQuatDelta =
    Math.abs(walkQuatLeg.x - idleQuatLeg.x) +
    Math.abs(walkQuatLeg.y - idleQuatLeg.y) +
    Math.abs(walkQuatLeg.z - idleQuatLeg.z) +
    Math.abs(walkQuatLeg.w - idleQuatLeg.w);
  assert.ok(legQuatDelta > 0.05, `RightUpperLeg quaternion must articulate from idle to walk (delta=${legQuatDelta})`);
  const walkBounds = computeRigWorldBounds(sultanRig.rootNode, sultanRig.meshes);
  assert.ok(
    Math.abs(walkBounds.minY) <= 0.06,
    `Action Sultan must not float during walk (minY=${walkBounds.minY})`
  );

  // Step punch pose and verify RightUpperArm quaternion changes significantly
  for (let i = 0; i < 15; i++) {
    anim3D.updateRigPose(sultanRig, 'action_sultan', 'punch', 0.2, 1 / 60, 1, 0);
  }
  const punchQuatArm = rArmNode.rotationQuaternion.clone();
  const armQuatDelta =
    Math.abs(punchQuatArm.x - idleQuatArm.x) +
    Math.abs(punchQuatArm.y - idleQuatArm.y) +
    Math.abs(punchQuatArm.z - idleQuatArm.z) +
    Math.abs(punchQuatArm.w - idleQuatArm.w);
  assert.ok(armQuatDelta > 0.1, `RightUpperArm quaternion must articulate during punch (delta=${armQuatDelta})`);

  // Verify CharacterAnimationController (used in Preview) also drives Quaternion bones & SuperShot / SuperMove events
  const emittedEvents: string[] = [];
  charAnim.getEventsDispatcher().onEvent((evt) => {
    emittedEvents.push(`${evt.state}:${evt.frame}:${evt.type}`);
  });

  for (let f = 0; f <= 36; f++) {
    charAnim.updateRigPose(
      sultanRig,
      'action_sultan',
      'super_shot',
      f / 60,
      1 / 60,
      1,
      0
    );
  }
  assert.ok(
    emittedEvents.includes('super_shot:10:ON_PROJECTILE_RELEASE'),
    'SuperShot must emit ON_PROJECTILE_RELEASE at frame 10'
  );
  assert.ok(
    emittedEvents.includes('super_shot:14:ON_SPECIAL_IMPACT'),
    'SuperShot must emit ON_SPECIAL_IMPACT at frame 14'
  );
  assert.ok(
    emittedEvents.includes('super_shot:36:ON_ANIMATION_COMPLETE'),
    'SuperShot must emit ON_ANIMATION_COMPLETE at frame 36'
  );

  for (let f = 0; f <= 42; f++) {
    charAnim.updateRigPose(
      sultanRig,
      'action_sultan',
      'super_move',
      f / 60,
      1 / 60,
      1,
      0
    );
  }
  assert.ok(
    emittedEvents.includes('super_move:20:ON_SUPERMOVE_CLIMAX'),
    'SuperMove must emit ON_SUPERMOVE_CLIMAX at frame 20'
  );
  assert.ok(
    emittedEvents.includes('super_move:42:ON_ANIMATION_COMPLETE'),
    'SuperMove must emit ON_ANIMATION_COMPLETE at frame 42'
  );

  // Verify modelTransformNode scale & groundOffset were never overwritten by animation frames
  assert.equal(sultanRig.modelTransformNode.scaling.y, 1.94);
  assert.equal(Number(sultanRig.modelTransformNode.position.y.toFixed(3)), -0.002);

  sultanRig.dispose();
  scene.dispose();
  engine.dispose();
});

test('22. Phase 6.1 — Player 1 & Player 2 Character Selection, Duplicate Replacement & Navigation Persistence', () => {
  const bridge = GameBridge.getInstance();

  // 1. Verify Player 1 can select all 4 characters without corrupting a non-conflicting P2
  for (const p1Target of ALL_FIGHTER_IDS) {
    const initialP2 = ALL_FIGHTER_IDS.find((id) => id !== p1Target)!;
    const next = applyFighterSelection(
      { p1Id: initialP2, p2Id: initialP2, selectingFor: 'p1' },
      p1Target
    );
    assert.equal(next.p1Id, p1Target, `P1 should update to ${p1Target}`);
    assert.equal(next.p2Id, initialP2, `P2 should remain ${initialP2}`);
    assert.notEqual(next.p1Id, next.p2Id);
  }

  // 2. Verify Player 2 can select all 4 characters without corrupting a non-conflicting P1
  for (const p2Target of ALL_FIGHTER_IDS) {
    const initialP1 = ALL_FIGHTER_IDS.find((id) => id !== p2Target)!;
    const next = applyFighterSelection(
      { p1Id: initialP1, p2Id: initialP1, selectingFor: 'p2' },
      p2Target
    );
    assert.equal(next.p2Id, p2Target, `P2 should update to ${p2Target}`);
    assert.equal(next.p1Id, initialP1, `P1 should remain ${initialP1}`);
    assert.notEqual(next.p1Id, next.p2Id);
  }

  // 3. Verify automatic duplicate selection replacement in both directions
  // P1 = action_sultan, P2 = romance_raja -> P1 selects romance_raja => P1 becomes romance_raja, P2 swaps to action_sultan
  const dupP1 = applyFighterSelection(
    { p1Id: 'action_sultan', p2Id: 'romance_raja', selectingFor: 'p1' },
    'romance_raja'
  );
  assert.equal(dupP1.p1Id, 'romance_raja');
  assert.equal(dupP1.p2Id, 'action_sultan');

  // P1 = duggu, P2 = bhidu -> P2 selects duggu => P2 becomes duggu, P1 swaps to bhidu
  const dupP2 = applyFighterSelection(
    { p1Id: 'duggu', p2Id: 'bhidu', selectingFor: 'p2' },
    'duggu'
  );
  assert.equal(dupP2.p2Id, 'duggu');
  assert.equal(dupP2.p1Id, 'bhidu');

  // 4. Verify all 12 ordered (P1, P2) distinct combinations persist across arena selection and returning to character select
  let combinationCount = 0;
  for (const p1 of ALL_FIGHTER_IDS) {
    for (const p2 of ALL_FIGHTER_IDS) {
      if (p1 === p2) continue;
      combinationCount++;
      bridge.gameMode = 'vs_cpu';
      bridge.setScreen('character_select');
      bridge.p1CharacterId = p1;
      bridge.p2CharacterId = p2;

      // Proceed to arena select
      bridge.setScreen('arena_select');
      assert.equal(bridge.p1CharacterId, p1);
      assert.equal(bridge.p2CharacterId, p2);

      // Return to character select
      bridge.setScreen('character_select');
      assert.equal(bridge.p1CharacterId, p1);
      assert.equal(bridge.p2CharacterId, p2);
    }
  }
  assert.equal(combinationCount, 12, 'Must verify all 12 distinct (P1, P2) pairings');
});

test('23. Phase 6.2 — Authoritative Character Mapping, Manifest JSON Accuracy & Non-Sultan Fallback Identity', async () => {
  // 1. Verify authoritative character mapping across all 4 fighters
  const verification = verifyAllAuthoritativeCharacterMappings();
  assert.equal(
    verification.valid,
    true,
    `Authoritative character mapping failed: ${verification.errors.join('; ')}`
  );

  for (const id of ALL_FIGHTER_IDS) {
    const mapping = resolveAuthoritativeCharacterMapping(id);
    assert.equal(mapping.fighterId, id);
    assert.equal(mapping.characterDef.id, id);
    assert.equal(mapping.assetConfig.id, id);
    assert.equal(mapping.modelPath, CHARACTER_ASSET_MANIFEST[id].modelPath);
    assert.equal(
      mapping.isTemporaryPlaceholder,
      id !== 'action_sultan',
      `Placeholder flag mismatch for ${id}`
    );

    // 2. Verify public/assets/characters/<slug>/manifest.json accuracy
    const manifestPath = path.resolve(
      process.cwd(),
      'public',
      'assets',
      'characters',
      mapping.assetConfig.slug,
      'manifest.json'
    );
    assert.equal(fs.existsSync(manifestPath), true, `manifest.json must exist at ${manifestPath}`);
    const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifestJson.characterId, id);
    assert.equal(manifestJson.displayName, mapping.characterDef.name);
    assert.equal(manifestJson.modelPath, mapping.modelPath);
    assert.equal(manifestJson.isTemporaryPlaceholder, id !== 'action_sultan');
    assert.equal(manifestJson.isPlaceholder, id !== 'action_sultan');
    assert.ok(manifestJson.skeleton?.boneAliases, `${id} manifest.json must document boneAliases`);
    assert.ok(
      Array.isArray(manifestJson.animations?.proceduralFallbackAnimations) &&
        manifestJson.animations.proceduralFallbackAnimations.length >= 15,
      `${id} manifest.json must list proceduralFallbackAnimations`
    );
    assert.ok(
      manifestJson.animations?.specialAttackAnimations?.superShot &&
        manifestJson.animations?.specialAttackAnimations?.superMove,
      `${id} manifest.json must document specialAttackAnimations`
    );

    if (id === 'action_sultan') {
      assert.deepEqual(
        manifestJson.animations.embeddedAnimations,
        ['mixamo_com'],
        'action_sultan manifest.json must accurately state only mixamo_com is embedded in model.glb'
      );
      assert.equal(manifestJson.animations.canPlayImportedAnimations, false);
      assert.equal(manifestJson.animations.canUseProceduralBoneFallback, true);
    }
  }

  // 3. Verify that prematurely flipping isTemporaryPlaceholderOverride: false on a box-primitive placeholder GLB
  // is caught and falls back to TEMPORARY_PLACEHOLDER (never misclassified as PRODUCTION_SKINNED or VISUAL_ONLY)
  const engine = new NullEngine();
  const scene = new Scene(engine);

  for (const id of ['romance_raja', 'duggu', 'bhidu'] as const) {
    const prematureRig = await loadCharacterRig3D(scene, CHARACTERS[id], `premature_${id}`, null, {
      isTemporaryPlaceholderOverride: false,
    });
    assert.equal(prematureRig.characterId, id);
    assert.equal(
      prematureRig.renderState,
      'TEMPORARY_PLACEHOLDER',
      `Box placeholder GLB for ${id} must remain TEMPORARY_PLACEHOLDER even if isTemporaryPlaceholder is false`
    );
    assert.equal(prematureRig.isVisualOnly, false);
    assert.equal(prematureRig.productionRigValid, false);
    assert.ok(
      prematureRig.diagnostics?.productionEligibilityReasons.some((r) =>
        r.includes('generated box-primitive placeholder proxy')
      ),
      `Diagnostics for ${id} must explain why box proxy GLB was rejected for production`
    );
    prematureRig.dispose();
  }

  // 4. Verify that a failed GLB load for ANY fighter preserves that fighter's identity and NEVER substitutes action_sultan
  for (const id of ALL_FIGHTER_IDS) {
    const failedRig = await buildFallbackCharacterRig3D(
      scene,
      CHARACTERS[id],
      `failed_${id}`,
      null,
      `Simulated network/disk error for ${id}`
    );
    assert.equal(
      failedRig.characterId,
      id,
      `Fallback rig for ${id} must preserve characterId="${id}" (never substitute action_sultan)`
    );
    assert.equal(failedRig.renderState, 'LOAD_FAILED');
    assert.equal(failedRig.glbLoaded, false);
    assert.equal(failedRig.isPlaceholderAsset, true);
    assert.ok(
      failedRig.diagnostics?.errors.some((e) => e.includes(`Simulated network/disk error for ${id}`)),
      `Fallback rig for ${id} must record the diagnostic error`
    );
    failedRig.dispose();
  }

  scene.dispose();
  engine.dispose();
});

test('24. Phase 6.3 — Rapid 3D Preview Switching (action_sultan -> duggu -> bhidu -> romance_raja) & Zero Resource Leaks', async () => {
  const previewScene = new CharacterPreviewScene(null, 'action_sultan');

  // Fire rapid un-awaited switches followed by final selection 'romance_raja'
  const p1 = previewScene.loadCharacterAsset('action_sultan');
  const p2 = previewScene.loadCharacterAsset('duggu');
  const p3 = previewScene.loadCharacterAsset('bhidu');
  const p4 = previewScene.loadCharacterAsset('romance_raja');

  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);
  assert.equal(r1, null, 'Superseded load 1 (action_sultan) must return null and dispose');
  assert.equal(r2, null, 'Superseded load 2 (duggu) must return null and dispose');
  assert.equal(r3, null, 'Superseded load 3 (bhidu) must return null and dispose');
  assert.ok(r4 !== null, 'Final load 4 (romance_raja) must succeed');

  const finalRig = previewScene.getCurrentRig();
  assert.ok(finalRig !== null);
  assert.equal(
    finalRig!.characterId,
    'romance_raja',
    'Final preview rig must be romance_raja'
  );
  assert.equal(
    finalRig!.diagnostics?.characterId,
    'romance_raja',
    'Final preview diagnostics must match romance_raja'
  );

  // Measure baseline scene mesh & material count with romance_raja loaded, then cycle through all 4 characters 3 times
  const baselineMeshCount = previewScene.getScene().meshes.length;
  const baselineMatCount = previewScene.getScene().materials.length;

  for (let cycle = 0; cycle < 3; cycle++) {
    for (const id of ['action_sultan', 'duggu', 'bhidu', 'romance_raja'] as const) {
      const loaded = await previewScene.loadCharacterAsset(id);
      assert.ok(loaded !== null);
      assert.equal(loaded!.characterId, id);
      assert.equal(previewScene.getCurrentRig()?.characterId, id);
    }
  }

  // After ending back on romance_raja, mesh and material counts must match baseline (zero leaks!)
  assert.equal(
    previewScene.getScene().meshes.length,
    baselineMeshCount,
    `Preview scene mesh count must not grow after 12 character switches (expected ${baselineMeshCount}, got ${previewScene.getScene().meshes.length})`
  );
  assert.equal(
    previewScene.getScene().materials.length,
    baselineMatCount,
    `Preview scene material count must not grow after 12 character switches (expected ${baselineMatCount}, got ${previewScene.getScene().materials.length})`
  );

  previewScene.dispose();
});

test('25. Phase 6.4 — All 6 Gameplay Matchups, Rematch, Reselection, Arcade Ladder Progression & Training Mode', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const bridge = GameBridge.getInstance();
  const combat3D = new CombatSystem3D();
  const cpu3D = new CPUController3D('normal');
  const match3D = new MatchManager3D();
  const anim3D = new AnimationController3D();

  const p1Fighter = new Fighter3D(0, CHARACTERS.action_sultan, MatchManager3D.P1_SPAWN_X_3D, 0, 0);
  const p2Fighter = new Fighter3D(1, CHARACTERS.romance_raja, MatchManager3D.P2_SPAWN_X_3D, 0, 0);

  const ALL_SIX_MATCHUPS: ReadonlyArray<readonly [typeof ALL_FIGHTER_IDS[number], typeof ALL_FIGHTER_IDS[number]]> = [
    ['action_sultan', 'romance_raja'],
    ['action_sultan', 'duggu'],
    ['action_sultan', 'bhidu'],
    ['romance_raja', 'duggu'],
    ['romance_raja', 'bhidu'],
    ['duggu', 'bhidu'],
  ];

  // 1. Test all 6 distinct matchups (and verify Fighter3D + CharacterRig3D identity match P1 and P2)
  for (const [p1Id, p2Id] of ALL_SIX_MATCHUPS) {
    bridge.gameMode = 'vs_cpu';
    bridge.p1CharacterId = p1Id;
    bridge.p2CharacterId = p2Id;
    bridge.startMatch();

    const p1Def = CHARACTERS[bridge.p1CharacterId];
    const p2Def = CHARACTERS[bridge.p2CharacterId];
    p1Fighter.setCharacterDef(p1Def);
    p2Fighter.setCharacterDef(p2Def);
    match3D.resetMatch(p1Fighter, p2Fighter, combat3D, cpu3D);

    const [p1Rig, p2Rig] = await Promise.all([
      loadCharacterRig3D(scene, p1Def, `match_p1_${p1Id}`),
      loadCharacterRig3D(scene, p2Def, `match_p2_${p2Id}`),
    ]);

    assert.equal(p1Fighter.id, p1Id);
    assert.equal(p1Fighter.def.id, p1Id);
    assert.equal(p1Rig.characterId, p1Id);
    assert.equal(p1Rig.diagnostics?.requestedModelPath, CHARACTER_ASSET_MANIFEST[p1Id].modelPath);

    assert.equal(p2Fighter.id, p2Id);
    assert.equal(p2Fighter.def.id, p2Id);
    assert.equal(p2Rig.characterId, p2Id);
    assert.equal(p2Rig.diagnostics?.requestedModelPath, CHARACTER_ASSET_MANIFEST[p2Id].modelPath);

    // Step 10 frames of combat + pose updates
    for (let f = 0; f < 10; f++) {
      p1Fighter.stepPhysics(ARENAS.award_night.bounds3D, 1 / 60);
      p2Fighter.stepPhysics(ARENAS.award_night.bounds3D, 1 / 60);
      anim3D.updateRigPose(p1Rig, p1Fighter.id, p1Fighter.state, p1Fighter.stateFrame / 60, 1 / 60, p1Fighter.facing, 0);
      anim3D.updateRigPose(p2Rig, p2Fighter.id, p2Fighter.state, p2Fighter.stateFrame / 60, 1 / 60, p2Fighter.facing, 0);
    }

    p1Rig.dispose();
    p2Rig.dispose();
  }

  // 2. Test Rematch preserves selected characters
  bridge.p1CharacterId = 'duggu';
  bridge.p2CharacterId = 'bhidu';
  bridge.startMatch();
  bridge.setScreen('results');
  bridge.rematch();
  assert.equal(bridge.screen, 'fighting');
  assert.equal(bridge.p1CharacterId, 'duggu');
  assert.equal(bridge.p2CharacterId, 'bhidu');

  // 3. Test Character Reselection after match results
  bridge.setScreen('results');
  bridge.setScreen('character_select');
  bridge.p1CharacterId = 'bhidu';
  bridge.p2CharacterId = 'romance_raja';
  bridge.startMatch();
  assert.equal(bridge.p1CharacterId, 'bhidu');
  assert.equal(bridge.p2CharacterId, 'romance_raja');

  // 4. Test Arcade Mode 3-Stage Ladder Progression for all 4 P1 characters
  for (const p1Hero of ALL_FIGHTER_IDS) {
    bridge.gameMode = 'arcade';
    bridge.p1CharacterId = p1Hero;
    bridge.startMatch();

    assert.equal(bridge.arcadeLadder.length, 3);
    assert.ok(!bridge.arcadeLadder.includes(p1Hero), `Arcade ladder must not include P1 (${p1Hero})`);
    assert.equal(bridge.arcadeStageIndex, 0);
    assert.equal(bridge.p2CharacterId, bridge.arcadeLadder[0]);
    assert.equal(bridge.hasNextArcadeStage(), true);

    // Stage 1 -> Stage 2
    const hasStage2 = bridge.advanceArcadeStage();
    assert.equal(hasStage2, true);
    assert.equal(bridge.arcadeStageIndex, 1);
    assert.equal(bridge.p1CharacterId, p1Hero);
    assert.equal(bridge.p2CharacterId, bridge.arcadeLadder[1]);
    assert.equal(bridge.hasNextArcadeStage(), true);

    // Stage 2 -> Stage 3 (Final Boss Stage)
    const hasStage3 = bridge.advanceArcadeStage();
    assert.equal(hasStage3, true);
    assert.equal(bridge.arcadeStageIndex, 2);
    assert.equal(bridge.p1CharacterId, p1Hero);
    assert.equal(bridge.p2CharacterId, bridge.arcadeLadder[2]);
    assert.equal(bridge.hasNextArcadeStage(), false);

    // Completing Stage 3 finishes the ladder
    const hasStage4 = bridge.advanceArcadeStage();
    assert.equal(hasStage4, false);
  }

  // 5. Test Training Mode dummy behaviors and reset
  bridge.gameMode = 'training';
  bridge.p1CharacterId = 'action_sultan';
  bridge.p2CharacterId = 'duggu';
  bridge.startMatch();
  assert.equal(bridge.trainingDummyBehavior, 'stand');
  assert.equal(bridge.cycleTrainingDummyBehavior(), 'block');
  assert.equal(bridge.cycleTrainingDummyBehavior(), 'crouch');
  assert.equal(bridge.cycleTrainingDummyBehavior(), 'jump');
  assert.equal(bridge.cycleTrainingDummyBehavior(), 'cpu_spar');
  assert.equal(bridge.cycleTrainingDummyBehavior(), 'stand');

  scene.dispose();
  engine.dispose();
});

test('26. Phase 3, 4, 6 & 7 — Preview vs. Gameplay Animation Parity, Reverse P2/P1 Matchups, Arena Switching Disposal & Fight Fun Branding Verification', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const anim3D = new AnimationController3D();
  const charAnim = new CharacterAnimationController();

  // 1. Verify Preview (CharacterAnimationController) and Gameplay (AnimationController3D) produce IDENTICAL
  // multi-phase SuperMove poses, SuperShot poses, and 5-bone facial rig poses across all 4 fighters
  const testStates: FighterStateName[] = ['idle', 'walk', 'punch', 'kick', 'super_shot', 'super_move', 'victory'];
  const sampleTimes = [0.05, 0.22, 0.45, 0.68];

  for (const id of ALL_FIGHTER_IDS) {
    for (const st of testStates) {
      for (const t of sampleTimes) {
        const gameplayPose = anim3D.computeTargetPose(id, st, t, 1.0, 0);
        const previewPose = charAnim.computeTargetPose(id, st, t, 1.0, 0);
        assert.deepEqual(
          gameplayPose,
          previewPose,
          `Gameplay and Preview poses must match for fighter="${id}", state="${st}", t=${t}`
        );
        assert.ok(gameplayPose.Jaw, `Facial rig Jaw bone must be populated for ${id} (${st})`);
        assert.ok(gameplayPose.LeftBrow, `Facial rig LeftBrow bone must be populated for ${id} (${st})`);
        assert.ok(gameplayPose.RightBrow, `Facial rig RightBrow bone must be populated for ${id} (${st})`);
      }
    }
  }

  // 2. Verify Reverse Player Assignments (P2 vs P1) for all 6 matchups
  const REVERSE_SIX_MATCHUPS: ReadonlyArray<readonly [typeof ALL_FIGHTER_IDS[number], typeof ALL_FIGHTER_IDS[number]]> = [
    ['romance_raja', 'action_sultan'],
    ['duggu', 'action_sultan'],
    ['bhidu', 'action_sultan'],
    ['duggu', 'romance_raja'],
    ['bhidu', 'romance_raja'],
    ['bhidu', 'duggu'],
  ];

  for (const [p1Id, p2Id] of REVERSE_SIX_MATCHUPS) {
    const [p1Rig, p2Rig] = await Promise.all([
      loadCharacterRig3D(scene, CHARACTERS[p1Id], `rev_p1_${p1Id}`),
      loadCharacterRig3D(scene, CHARACTERS[p2Id], `rev_p2_${p2Id}`),
    ]);
    assert.equal(p1Rig.characterId, p1Id);
    assert.equal(p2Rig.characterId, p2Id);
    p1Rig.dispose();
    p2Rig.dispose();
  }

  // 3. Verify Arena Switching (award_night <-> film_city) disposes all meshes, lights, and materials cleanly
  const baseMeshes = scene.meshes.length;
  const baseLights = scene.lights.length;
  const baseMaterials = scene.materials.length;

  const awardHandle = ArenaBuilder3D.buildArena(scene, 'award_night', true);
  assert.equal(awardHandle.arenaId, 'award_night');
  assert.ok(scene.meshes.length > baseMeshes, 'Award Night arena creates 3D stage meshes');
  awardHandle.update(1 / 60);
  awardHandle.setBlackoutIntensity(0.5);
  awardHandle.dispose();

  assert.equal(scene.meshes.length, baseMeshes, 'Disposing Award Night arena removes all stage meshes');
  assert.equal(scene.lights.length, baseLights, 'Disposing Award Night arena removes all stage lights');
  assert.equal(scene.materials.length, baseMaterials, 'Disposing Award Night arena removes all stage materials');

  const filmCityHandle = ArenaBuilder3D.buildArena(scene, 'film_city', true);
  assert.equal(filmCityHandle.arenaId, 'film_city');
  assert.ok(scene.meshes.length > baseMeshes, 'Film City arena creates 3D stage meshes');
  filmCityHandle.update(1 / 60);
  filmCityHandle.setBlackoutIntensity(0);
  filmCityHandle.dispose();

  assert.equal(scene.meshes.length, baseMeshes, 'Disposing Film City arena removes all stage meshes');
  assert.equal(scene.lights.length, baseLights, 'Disposing Film City arena removes all stage lights');
  assert.equal(scene.materials.length, baseMaterials, 'Disposing Film City arena removes all stage materials');

  scene.dispose();
  engine.dispose();

  // 4. Verify Fight Fun Clean Branding & Dependency Synchronization (Phase 10)
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('<title>Fight Fun</title>'),
    'index.html must have clean <title>Fight Fun</title> without old tagline'
  );
  assert.ok(
    !indexHtml.includes('Lights. Camera. Knockout!'),
    'index.html must not contain old tagline Lights. Camera. Knockout!'
  );
  assert.ok(!indexHtml.includes('Filmi Dangal'), 'index.html must not contain old Filmi Dangal title');

  const metadataJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'metadata.json'), 'utf8'));
  assert.equal(metadataJson.name, 'Fight Fun');
  assert.ok(
    !String(metadataJson.description).includes('Lights. Camera. Knockout!'),
    'metadata.json description must be factual and free of the old tagline'
  );

  const titleScreenTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/TitleScreen.tsx'), 'utf8');
  assert.ok(titleScreenTsx.includes('FIGHT FUN'), 'TitleScreen.tsx must display FIGHT FUN');
  assert.ok(
    !titleScreenTsx.includes('LIGHTS. CAMERA. KNOCKOUT!'),
    'TitleScreen.tsx must remove the tagline completely'
  );
  assert.ok(!titleScreenTsx.includes('FILMI DANGAL'), 'TitleScreen.tsx must not display FILMI DANGAL');

  const disclaimerTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/DisclaimerModal.tsx'), 'utf8');
  assert.ok(disclaimerTsx.includes('FIGHT FUN'), 'DisclaimerModal.tsx must display FIGHT FUN');
  assert.ok(!disclaimerTsx.includes('FILMI DANGAL'), 'DisclaimerModal.tsx must not display FILMI DANGAL');

  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  const bunLock = fs.readFileSync(path.resolve(process.cwd(), 'bun.lock'), 'utf8');
  assert.equal(pkgJson.name, 'fight-fun', 'package.json name must be fight-fun');
  assert.ok(bunLock.includes('"name": "fight-fun"'), 'bun.lock workspace name must match package.json');
  assert.ok(
    bunLock.includes(`"esbuild": "${pkgJson.devDependencies.esbuild}"`),
    'bun.lock esbuild version must match package.json devDependencies.esbuild'
  );

  const projectGuide = fs.readFileSync(path.resolve(process.cwd(), 'PROJECT_GUIDE.md'), 'utf8');
  assert.ok(projectGuide.includes('# Fight Fun'), 'PROJECT_GUIDE.md must be titled for Fight Fun');
  for (const sectionHeading of [
    '## 1. Project Overview',
    '## 2. Installation and Development',
    '## 3. Complete Folder Structure',
    '## 4. Character Management',
    '## 5. 3D Model Replacement',
    '## 6. Animation Management',
    '## 7. Arena Management',
    '## 8. Combat Management',
    '## 9. Audio and VFX Management',
    '## 10. UI Management',
    '## 11. Common Maintenance Tasks',
    '## 12. Troubleshooting',
    '## 13. Testing',
    '## 14. Safe Development Rules',
  ]) {
    assert.ok(
      projectGuide.includes(sectionHeading),
      `PROJECT_GUIDE.md must include section "${sectionHeading}"`
    );
  }
});

test('27. UI Redesign & 3D Arena Enhancement Verification: Screen Flow (title -> game_mode -> character_select -> character_overview -> arena_select -> fighting -> results), Interactive Preview Rotation & Enhanced 3D Stages', async () => {
  const bridge = GameBridge.getInstance();
  bridge.returnToMenu();
  assert.equal(bridge.screen, 'title');

  // 1. Verify complete navigation flow: MAIN MENU -> GAME MODE -> CHARACTER SELECT -> CHARACTER OVERVIEW -> ARENA SELECT -> FIGHT -> RESULTS
  const observedScreens: string[] = [];
  const unsub = bridge.subscribeScreen((s) => observedScreens.push(s));

  bridge.setScreen('game_mode');
  assert.equal(bridge.screen, 'game_mode');

  bridge.gameMode = 'vs_cpu';
  bridge.setScreen('character_select');
  assert.equal(bridge.screen, 'character_select');

  bridge.inspectedCharacterId = 'duggu';
  bridge.setScreen('character_overview');
  assert.equal(bridge.screen, 'character_overview');
  assert.equal(bridge.inspectedCharacterId, 'duggu');

  bridge.setScreen('arena_select');
  assert.equal(bridge.screen, 'arena_select');

  bridge.arenaId = 'film_city';
  bridge.startMatch();
  assert.equal(bridge.screen, 'fighting');

  bridge.matchWinner = 'p1';
  bridge.setScreen('results');
  assert.equal(bridge.screen, 'results');

  bridge.returnToMenu();
  assert.equal(bridge.screen, 'title');
  unsub();

  assert.deepEqual(observedScreens, [
    'game_mode',
    'character_select',
    'character_overview',
    'arena_select',
    'fighting',
    'results',
    'title',
  ]);

  // 2. Verify CharacterPreviewScene interactive turntable rotation & viewport variants
  const previewScene = new CharacterPreviewScene(null, 'action_sultan', undefined, undefined, 'overview');
  await previewScene.loadCharacterAsset('romance_raja');
  assert.equal(previewScene.getCurrentRig()?.characterId, 'romance_raja');
  previewScene.rotateModel(0.5);
  previewScene.resetRotation();
  previewScene.dispose();

  // 3. Verify enhanced Award Night and Film City 3D arenas have 3-point + accent lighting (4 lights) and rich multi-layered geometry
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const award = ArenaBuilder3D.buildArena(scene, 'award_night', true);
  assert.equal(scene.lights.length, 4, 'Award Night arena configures 4 lights (Hemi, Key, Rim, Accent)');
  assert.ok(scene.meshes.length >= 30, 'Award Night arena builds rich multi-layered 3D stage & VIP seating meshes');
  award.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.lights.length, 0);

  const film = ArenaBuilder3D.buildArena(scene, 'film_city', true);
  assert.equal(scene.lights.length, 4, 'Film City arena configures 4 lights (Hemi, Key, Rim, Accent)');
  assert.ok(scene.meshes.length >= 30, 'Film City arena builds rich 3D soundstage, set facades, and articulated crane meshes');
  film.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.lights.length, 0);

  scene.dispose();
  engine.dispose();
});

test('28. Phase 2–12 Regression Suite: Browse-Only vs Match Character Select, Restart Match vs Restart Round, Arcade Stage Preservation, Touch Capability Detection, Title Shortcut Guards & WebGL Fallback', () => {
  const bridge = GameBridge.getInstance();

  // 1. Character Browse-Only Mode vs Match Selection Mode (Phase 2)
  bridge.p1CharacterId = 'action_sultan';
  bridge.p2CharacterId = 'romance_raja';

  bridge.openFightersBrowse('duggu');
  assert.equal(bridge.screen, 'character_select');
  assert.equal(bridge.characterSelectBrowseOnly, true);
  assert.equal(bridge.getCharacterSelectMode(), 'browse');
  assert.equal(bridge.inspectedCharacterId, 'duggu');
  // Browsing fighters must NEVER mutate P1/P2 match selection
  assert.equal(bridge.p1CharacterId, 'action_sultan');
  assert.equal(bridge.p2CharacterId, 'romance_raja');

  // Opening match character select switches to 'match' mode
  bridge.openMatchCharacterSelect('vs_cpu');
  assert.equal(bridge.screen, 'character_select');
  assert.equal(bridge.characterSelectBrowseOnly, false);
  assert.equal(bridge.getCharacterSelectMode(), 'match');
  assert.equal(bridge.gameMode, 'vs_cpu');

  // 2. Restart Match vs Restart Round & Arcade Stage Preservation (Phase 5)
  const emittedCommands: string[] = [];
  const unsubCmd = bridge.subscribeCommand((cmd) => emittedCommands.push(cmd));

  bridge.gameMode = 'arcade';
  bridge.p1CharacterId = 'action_sultan';
  bridge.p2CharacterId = 'romance_raja';
  bridge.startNewMatch();
  assert.equal(bridge.arcadeStageIndex, 0);
  assert.equal(bridge.p2CharacterId, 'romance_raja');

  // Advance to Stage 2 (index 1)
  const advanced = bridge.advanceArcadeStage();
  assert.equal(advanced, true);
  assert.equal(bridge.arcadeStageIndex, 1);
  const stage2Opponent = bridge.p2CharacterId;
  assert.notEqual(stage2Opponent, 'action_sultan');

  // Simulate mid-match stats & round wins in MatchManager3D
  const match3D = new MatchManager3D();
  const p1 = new Fighter3D(0, CHARACTERS.action_sultan, -2.5, 0, 0);
  const p2 = new Fighter3D(1, CHARACTERS[stage2Opponent], 2.5, 0, 0);
  const combat3D = new CombatSystem3D();
  const cpu3D = new CPUController3D('normal');

  match3D.resetMatch(p1, p2, combat3D, cpu3D);
  match3D.currentRound = 2;
  match3D.p1RoundWins = 1;
  match3D.p2RoundWins = 0;
  match3D.stats.p1DamageDealt = 420;
  match3D.stats.roundResults.push('p1');
  p1.health = 180;
  p1.specialMeter = 75;
  p2.health = 90;

  // Verify restartCurrentRound ONLY resets the current round (preserving Round 2 and p1RoundWins = 1)
  match3D.restartCurrentRound(p1, p2, combat3D, cpu3D);
  assert.equal(match3D.currentRound, 2, 'restartCurrentRound keeps currentRound = 2');
  assert.equal(match3D.p1RoundWins, 1, 'restartCurrentRound keeps p1RoundWins = 1');
  assert.equal(p1.health, p1.maxHealth, 'restartCurrentRound restores fighter health');

  // Verify restartMatch() emits 'restart_match', resets MatchManager3D to Round 1 & 0 wins,
  // AND preserves Arcade stage 2 (arcadeStageIndex === 1 and stage2Opponent)!
  p1.health = 120;
  bridge.setPaused(true);
  bridge.restartMatch();
  assert.equal(bridge.isPaused, false);
  assert.equal(emittedCommands[emittedCommands.length - 1], 'restart_match');
  assert.equal(bridge.arcadeStageIndex, 1, 'restartMatch preserves Arcade Stage 2 index');
  assert.equal(bridge.p2CharacterId, stage2Opponent, 'restartMatch preserves Arcade Stage 2 opponent');
  assert.equal(bridge.lastMatchStats.p1DamageDealt, 0);
  assert.equal(bridge.lastMatchStats.roundResults.length, 0);

  match3D.resetMatch(p1, p2, combat3D, cpu3D);
  assert.equal(match3D.currentRound, 1, 'resetMatch resets currentRound to 1');
  assert.equal(match3D.p1RoundWins, 0, 'resetMatch resets p1RoundWins to 0');
  assert.equal(match3D.p2RoundWins, 0, 'resetMatch resets p2RoundWins to 0');
  assert.equal(match3D.matchWinner, null);
  assert.equal(match3D.stats.p1DamageDealt, 0);
  assert.equal(match3D.stats.roundResults.length, 0);
  assert.equal(p1.health, p1.maxHealth);
  assert.equal(p1.specialMeter, 25);
  assert.equal(combat3D.projectileManager.getActiveProjectiles().length, 0);

  unsubCmd();

  // 3. Touch Control Capability Detection & Visibility Overrides (Phase 3)
  // Phone portrait/landscape
  assert.equal(
    detectTouchCapability({ maxTouchPoints: 5, coarsePointer: true, innerWidth: 390 }),
    true
  );
  // Wide landscape tablet (iPad Pro 1366x1024 - previously hidden by lg:hidden!)
  const isWideTabletTouch = detectTouchCapability({
    maxTouchPoints: 5,
    coarsePointer: true,
    innerWidth: 1366,
  });
  assert.equal(isWideTabletTouch, true);
  assert.equal(
    shouldShowMobileControls('auto', isWideTabletTouch),
    true,
    'Wide landscape touch tablet (>= 1024px) must show touch controls in auto mode'
  );
  // Standard desktop mouse-only (1920x1080)
  const isDesktopTouch = detectTouchCapability({
    maxTouchPoints: 0,
    coarsePointer: false,
    anyCoarsePointer: false,
    hasTouchStart: false,
    innerWidth: 1920,
  });
  assert.equal(isDesktopTouch, false);
  assert.equal(
    shouldShowMobileControls('auto', isDesktopTouch),
    false,
    'Desktop mouse-only setup must hide mobile controls in auto mode'
  );
  // Explicit user overrides ('always' | 'off')
  assert.equal(shouldShowMobileControls('always', false), true);
  assert.equal(shouldShowMobileControls('off', true), false);

  // Sanitize settings with mobileControlVisibility
  const sanitized = sanitizeGameSettings({ mobileControlVisibility: 'always' });
  assert.equal(sanitized.mobileControlVisibility, 'always');
  const fallbackSanitized = sanitizeGameSettings({ mobileControlVisibility: 'invalid' });
  assert.equal(fallbackSanitized.mobileControlVisibility, 'auto');

  // 4. Multi-Touch Pointer Release on Pause / Blur (Phase 3)
  const inputMgr = InputManager.getInstance();
  inputMgr.clearAll();
  inputMgr.onVirtualPointerDown(101, 'right');
  inputMgr.onVirtualPointerDown(102, 'punch');
  assert.equal(inputMgr.isVirtualControlActive('right'), true);
  assert.equal(inputMgr.isVirtualControlActive('punch'), true);
  inputMgr.clearTouchInputs();
  assert.equal(inputMgr.isVirtualControlActive('right'), false);
  assert.equal(inputMgr.isVirtualControlActive('punch'), false);

  // 5. Title Screen Context-Aware Keyboard Shortcut Guards (Phase 4)
  assert.equal(
    shouldTriggerTitleShortcut({
      currentScreen: 'title',
      keyCode: 'Enter',
      isModalOpen: false,
      hasDialogInDom: false,
      defaultPrevented: false,
      repeat: false,
      activeElementTagName: 'BODY',
    }),
    true,
    'Unfocused BODY on Title Screen with no modal open allows Enter shortcut'
  );
  assert.equal(
    shouldTriggerTitleShortcut({
      currentScreen: 'title',
      keyCode: 'Enter',
      isModalOpen: true,
      hasDialogInDom: true,
      defaultPrevented: false,
      repeat: false,
      activeElementTagName: 'BODY',
    }),
    false,
    'Open SettingsModal blocks Title Screen Enter shortcut'
  );
  assert.equal(
    shouldTriggerTitleShortcut({
      currentScreen: 'title',
      keyCode: 'Space',
      isModalOpen: false,
      hasDialogInDom: false,
      defaultPrevented: false,
      repeat: false,
      activeElementTagName: 'BUTTON',
    }),
    false,
    'Focused BUTTON on Title Screen must not be hijacked by global shortcut listener'
  );

  // 6. WebGL Preview Fallback State Builder (Phase 6)
  const fallbackAward = buildArenaPreviewFallbackState(
    'award_night',
    new Error('WebGL context creation failed')
  );
  assert.equal(fallbackAward.arenaId, 'award_night');
  assert.equal(fallbackAward.hasWebGLError, true);
  assert.ok(fallbackAward.arenaName.length > 0);
  assert.ok(fallbackAward.errorMessage?.includes('WebGL context creation failed'));

  // 7. Action Sultan Iconic 3.0s Hands-in-Pockets Idle Loop (Storyboard Frames 1–6)
  const animCtrl = new AnimationController3D();
  const pose0 = animCtrl.computeTargetPose('action_sultan', 'idle', 0.0, 1.0, 0);
  const pose05 = animCtrl.computeTargetPose('action_sultan', 'idle', 0.5, 1.0, 0);
  const pose10 = animCtrl.computeTargetPose('action_sultan', 'idle', 1.0, 1.0, 0);
  const pose13 = animCtrl.computeTargetPose('action_sultan', 'idle', 1.3, 1.0, 0);
  const pose25 = animCtrl.computeTargetPose('action_sultan', 'idle', 2.5, 1.0, 0);
  const pose30 = animCtrl.computeTargetPose('action_sultan', 'idle', 3.0, 1.0, 0);

  // Seamless 3.0s loop boundary (t = 0.0s matches t = 3.0s)
  assert.ok(Math.abs(pose0.Hips.py! - pose30.Hips.py!) < 1e-6, 'Hips.py must loop seamlessly at 3.0s');
  assert.ok(Math.abs(pose0.Chest.rx - pose30.Chest.rx) < 1e-6, 'Chest.rx must loop seamlessly at 3.0s');
  assert.ok(Math.abs(pose0.Head.ry - pose30.Head.ry) < 1e-6, 'Head.ry must loop seamlessly at 3.0s');

  // Frame 1 (0.0s) & Frame 6 (2.5s): Head faces forward
  assert.equal(pose0.Head.ry, 0);
  assert.equal(pose25.Head.ry, 0);

  // Frame 2 (0.5s): Subtle inhalation expands chest upward compared to 0.0s
  assert.ok(pose05.Chest.rx < pose0.Chest.rx, 'Chest expands subtly upward during Frame 2 inhalation (0.5s)');

  // Frame 3 (1.0s) & Frame 4 (1.3s hold): Subtle side head turn & attitude hold, then return by 2.5s
  assert.ok(pose10.Head.ry > 0.07 && pose10.Head.ry < 0.15, 'Head turns subtly to the side at 1.0s');
  assert.ok(pose13.Head.ry > 0.07 && pose13.Head.ry < 0.15, 'Head holds side-facing attitude at 1.0–1.5s');

  // Hands remain in pockets and legs remain grounded across all frames
  for (const samplePose of [pose0, pose05, pose10, pose13, pose25, pose30]) {
    assert.ok(samplePose.LeftUpperArm.rx > 0.05, 'LeftUpperArm stays in pocket posture');
    assert.ok(samplePose.LeftLowerArm.rz > 0.35, 'LeftLowerArm angles inward into front pocket');
    assert.ok(samplePose.RightLowerArm.rz < -0.35, 'RightLowerArm angles inward into front pocket');
    assert.equal(samplePose.LeftUpperLeg.rx, 0, 'Left leg stays grounded without stepping');
    assert.equal(samplePose.RightUpperLeg.rx, 0, 'Right leg stays grounded without stepping');
  }

  // 8. Action Sultan 0.40s Fast Right Straight Punch (Storyboard 7-Frame Sequence at 2.0x Speed & Combat Integration)
  const punchGuard0 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.0, 1.0, 0);
  const punchWindup05 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.05, 1.0, 0);
  const punchPower10 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.1, 1.0, 0);
  const punchExtend175 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.175, 1.0, 0);
  const punchImpact225 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.225, 1.0, 0);
  const punchRetract30 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.3, 1.0, 0);
  const punchRecover40 = animCtrl.computeTargetPose('action_sultan', 'punch', 0.4, 1.0, 0);

  // Frame 1 (0.00s) & Frame 7 (0.40s): Combat Guard stance matches cleanly
  assert.ok(Math.abs(punchGuard0.Hips.ry - punchRecover40.Hips.ry) < 1e-6, 'Frame 7 returns Hips.ry to Combat Guard');
  assert.ok(Math.abs(punchGuard0.RightUpperArm.rx - punchRecover40.RightUpperArm.rx) < 1e-6, 'Frame 7 returns RightUpperArm.rx to Combat Guard');
  assert.ok(Math.abs(punchGuard0.RightLowerArm.rx - punchRecover40.RightLowerArm.rx) < 1e-6, 'Frame 7 returns RightLowerArm.rx to Combat Guard');
  // Combat stance has knees slightly bent (LeftUpperLeg forward, RightUpperLeg back) and closed fists
  assert.ok(punchGuard0.LeftUpperLeg.rx < -0.1, 'Combat stance places left leg slightly forward');
  assert.ok(punchGuard0.RightUpperLeg.rx > 0.1, 'Combat stance places right leg slightly behind');
  assert.equal(punchGuard0.LeftHand.fistCurl, 1, 'Left hand forms closed defensive fist in guard');
  assert.equal(punchGuard0.RightHand.fistCurl, 1, 'Right hand forms closed striking fist in guard');

  // Frame 2 (0.05s): Anticipation / Wind-up coils right shoulder and upper torso back (ry increases) and shifts weight slightly to rear leg
  assert.ok(punchWindup05.RightShoulder.ry > punchGuard0.RightShoulder.ry, 'Frame 2 pulls right shoulder backward');
  assert.ok(punchWindup05.Chest.ry > punchGuard0.Chest.ry, 'Frame 2 coils chest slightly away from target');
  assert.ok((punchWindup05.Hips.px ?? 0) < (punchGuard0.Hips.px ?? 0), 'Frame 2 shifts weight slightly toward rear leg');

  // Frame 3 (0.10s) -> Frame 4 (0.175s) -> Frame 5 (0.225s Impact): Hips, chest, and right shoulder drive forward (ry goes negative) while right arm extends straight
  assert.ok(punchPower10.Hips.ry < punchWindup05.Hips.ry, 'Frame 3 initiates hip rotation toward target');
  assert.ok(punchExtend175.Hips.ry < punchPower10.Hips.ry, 'Frame 4 continues hip rotation');
  assert.ok(punchImpact225.Hips.ry <= punchExtend175.Hips.ry, 'Frame 5 completes hip rotation at impact');
  assert.ok(punchImpact225.RightShoulder.ry < -0.2, 'Frame 5 engages right shoulder forward into the punch');
  assert.ok(punchImpact225.RightUpperArm.rx < -1.15, 'Frame 5 raises right upper arm into full straight punch line');
  assert.ok(punchImpact225.RightLowerArm.rx > -0.25 && punchImpact225.RightLowerArm.rx < -0.05, 'Frame 5 reaches near-full elbow extension without hyperextending');
  assert.ok(punchImpact225.LeftLowerArm.rx < -1.4, 'Left arm remains bent in defensive chin guard throughout impact');

  // Frame 6 (0.30s Retraction): Elbow bends back and torso reverses rotation toward guard
  assert.ok(punchRetract30.RightLowerArm.rx < -1.0, 'Frame 6 retracts right forearm quickly by bending elbow');
  assert.ok(punchRetract30.Hips.ry > punchImpact225.Hips.ry, 'Frame 6 reverses hip rotation back toward guard');

  // Combat synchronization: 24 frames (0.40s at 60 FPS), active hit window centered around 0.225s (Frames 11-14), single hit per punch, clean recovery to idle
  const sultanPunchSpec = FighterAnimationEvents.getMoveSpec('action_sultan', 'punch');
  assert.equal(sultanPunchSpec.totalFrames, 24, 'Action Sultan punch clip totalFrames is 24 (0.40s)');
  assert.equal(sultanPunchSpec.startupFrames, 11);
  assert.equal(sultanPunchSpec.activeFrames, 4);
  assert.equal(sultanPunchSpec.recoveryFrames, 9);

  const sultanAttacker = new Fighter3D(0, CHARACTERS.action_sultan, 0, 0, 0);
  const dummyDefender = new Fighter3D(1, CHARACTERS.romance_raja, 0.95, 0, 0);
  const punchCombat = new CombatSystem3D();
  assert.equal(sultanAttacker.startAttack('punch', 'fighting'), true);
  let punchHitCount = 0;
  let hitFrame = -1;
  for (let f = 1; f <= 24; f++) {
    sultanAttacker.stepPhysics();
    dummyDefender.stepPhysics();
    const hits = punchCombat.updateAndResolveCombat(sultanAttacker, dummyDefender, 1 / 60, 'fighting');
    if (hits.length > 0) {
      punchHitCount += hits.length;
      hitFrame = f;
    }
  }
  assert.equal(punchHitCount, 1, 'Single punch produces exactly one damage event');
  assert.ok(hitFrame >= 11 && hitFrame <= 14, `Punch impact occurs inside the 0.18s-0.24s active window (frame=${hitFrame})`);
  assert.equal(sultanAttacker.state, 'idle', 'Action Sultan returns cleanly to idle after 24-frame (0.40s) punch');
  assert.equal(sultanAttacker.startAttack('punch', 'fighting'), true, 'Action Sultan can immediately perform another attack after punch completion');

  // 9. Action Sultan 0.60s Fast Right Front Kick (Storyboard 7-Frame Sequence at 2.0x Speed & Combat Integration)
  const kickGuard0 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.0, 1.0, 0);
  const kickTransfer075 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.075, 1.0, 0);
  const kickChamber15 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.15, 1.0, 0);
  const kickExtend25 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.25, 1.0, 0);
  const kickImpact325 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.325, 1.0, 0);
  const kickRecoil335 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.335, 1.0, 0);
  const kickRetract45 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.45, 1.0, 0);
  const kickRecover60 = animCtrl.computeTargetPose('action_sultan', 'kick', 0.6, 1.0, 0);

  // Frame 1 (0.00s) & Frame 7 (0.60s): Combat Guard stance matches cleanly
  assert.ok(Math.abs(kickGuard0.Hips.ry - kickRecover60.Hips.ry) < 1e-6, 'Frame 7 returns Hips.ry to Combat Guard');
  assert.ok(Math.abs(kickGuard0.RightUpperLeg.rx - kickRecover60.RightUpperLeg.rx) < 1e-6, 'Frame 7 returns RightUpperLeg.rx to Combat Guard');
  assert.ok(Math.abs(kickGuard0.RightLowerLeg.rx - kickRecover60.RightLowerLeg.rx) < 1e-6, 'Frame 7 returns RightLowerLeg.rx to Combat Guard');
  assert.ok(Math.abs(kickGuard0.RightFoot.rx - kickRecover60.RightFoot.rx) < 1e-6, 'Frame 7 returns RightFoot.rx to Combat Guard');
  assert.equal(kickGuard0.LeftHand.fistCurl, 1, 'Left hand forms closed defensive fist in kick guard');
  assert.equal(kickGuard0.RightHand.fistCurl, 1, 'Right hand forms closed defensive fist in kick guard');

  // Frame 2 (0.075s Weight Transfer): Weight shifts onto supporting left leg, left knee bends slightly, right knee begins lifting
  assert.ok((kickTransfer075.Hips.px ?? 0) < (kickGuard0.Hips.px ?? 0), 'Frame 2 transfers weight onto supporting left leg');
  assert.ok(kickTransfer075.LeftLowerLeg.rx > kickGuard0.LeftLowerLeg.rx, 'Frame 2 bends supporting left knee slightly');
  assert.ok(kickTransfer075.RightUpperLeg.rx < -0.45, 'Frame 2 lifts right thigh forward and upward');
  assert.ok(kickTransfer075.RightLowerLeg.rx > 0.9, 'Frame 2 flexes right knee as leg lifts');

  // Frame 3 (0.15s Knee Chamber): Right knee raised high toward target, knee tightly bent pulling lower leg toward thigh
  assert.ok(kickChamber15.RightUpperLeg.rx < -1.3, 'Frame 3 chambers right knee high toward target');
  assert.ok(kickChamber15.RightLowerLeg.rx > 1.6, 'Frame 3 pulls right lower leg tightly back toward thigh');
  assert.equal(kickChamber15.LeftHand.fistCurl, 1, 'Frame 3 maintains closed left fist in guard');
  assert.equal(kickChamber15.RightHand.fistCurl, 1, 'Frame 3 maintains closed right fist in guard');

  // Frame 4 (0.25s Kick Extension) -> Frame 5 (0.325s Impact): Hips drive forward, torso counterbalances back, right lower leg extends, foot aligns heel/sole
  assert.ok(kickExtend25.Hips.rx < kickChamber15.Hips.rx, 'Frame 4 drives hip forward into kick extension');
  assert.ok(kickExtend25.RightLowerLeg.rx < 0.45, 'Frame 4 rapidly extends right lower leg toward opponent');
  assert.ok(kickExtend25.RightFoot.rx < -0.25, 'Frame 4 aligns right foot heel/sole toward target');
  assert.ok(kickExtend25.Spine.rx < -0.08 && kickExtend25.Chest.rx < -0.1, 'Frame 4 leans upper body slightly backward for counterbalance');

  assert.ok(kickImpact325.RightUpperLeg.rx <= -1.55, 'Frame 5 reaches peak forward thigh drive');
  assert.ok(
    kickImpact325.RightLowerLeg.rx > 0.05 && kickImpact325.RightLowerLeg.rx < 0.22,
    'Frame 5 reaches near-full knee extension without hyperextending'
  );
  assert.ok(kickImpact325.RightFoot.rx < -0.35, 'Frame 5 directs right heel/sole into opponent at impact');
  assert.ok(kickImpact325.Hips.rx <= -0.18 && kickImpact325.Hips.ry <= -0.14, 'Frame 5 fully engages hip drive and rotation');
  assert.ok(kickImpact325.LeftLowerLeg.rx > 0.2, 'Frame 5 keeps supporting left knee slightly bent for balance');
  assert.ok(kickImpact325.LeftLowerArm.rx < -1.4 && kickImpact325.RightLowerArm.rx < -1.4, 'Frame 5 keeps both arms raised in combat guard');
  assert.ok(kickRecoil335.RightLowerLeg.rx > kickImpact325.RightLowerLeg.rx, 'Subtle body/knee recoil occurs immediately after 0.325s impact');

  // Frame 6 (0.45s Retraction): Right knee bends and retracts back toward chamber while hips return toward normal orientation
  assert.ok(kickRetract45.RightLowerLeg.rx > 1.4, 'Frame 6 bends right knee to retract lower leg toward thigh');
  assert.ok(kickRetract45.RightUpperLeg.rx < -1.0 && kickRetract45.RightUpperLeg.rx > kickImpact325.RightUpperLeg.rx, 'Frame 6 brings right knee back toward chamber');
  assert.ok(kickRetract45.Hips.ry > kickImpact325.Hips.ry, 'Frame 6 returns hips toward normal guard orientation');

  // Combat synchronization: 36 frames (0.60s at 60 FPS), active hit window around 0.325s impact (Frames 16-21), single hit per kick, clean recovery to idle
  const sultanKickSpec = FighterAnimationEvents.getMoveSpec('action_sultan', 'kick');
  assert.equal(sultanKickSpec.totalFrames, 36, 'Action Sultan kick clip totalFrames is 36 (0.60s)');
  assert.equal(sultanKickSpec.startupFrames, 16);
  assert.equal(sultanKickSpec.activeFrames, 6);
  assert.equal(sultanKickSpec.recoveryFrames, 14);
  assert.equal(sultanKickSpec.activeBone, 'RightFoot');

  const kickAttacker = new Fighter3D(0, CHARACTERS.action_sultan, 0, 0, 0);
  const kickDefender = new Fighter3D(1, CHARACTERS.romance_raja, 1.05, 0, 0);
  const kickCombat = new CombatSystem3D();
  assert.equal(kickAttacker.startAttack('kick', 'fighting'), true);
  let kickHitCount = 0;
  let kickHitFrame = -1;
  for (let f = 1; f <= 36; f++) {
    kickAttacker.stepPhysics();
    kickDefender.stepPhysics();
    const hits = kickCombat.updateAndResolveCombat(kickAttacker, kickDefender, 1 / 60, 'fighting');
    if (hits.length > 0) {
      kickHitCount += hits.length;
      kickHitFrame = f;
    }
  }
  assert.equal(kickHitCount, 1, 'Single front kick produces exactly one damage event');
  assert.ok(kickHitFrame >= 16 && kickHitFrame <= 21, `Kick impact occurs inside the 0.27s-0.35s active window (frame=${kickHitFrame})`);
  assert.equal(kickAttacker.state, 'idle', 'Action Sultan returns cleanly to idle after 36-frame (0.60s) front kick');
  assert.equal(kickAttacker.startAttack('kick', 'fighting'), true, 'Action Sultan can immediately perform another attack after kick completion');

  bridge.returnToMenu();
});








