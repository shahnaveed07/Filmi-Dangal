# Filmi Dangal — Developer & Maintainer Project Guide (`PROJECT_GUIDE.md`)

**Filmi Dangal: Lights. Camera. Knockout!** is a 3D Bollywood arcade fighting game built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`)**.

This document is the authoritative developer handbook for maintaining, debugging, and extending **Filmi Dangal** without breaking existing combat, animation, audio, UI, or 3D asset-loading systems.

---

## Table of Contents

1. [Project Overview](#section-1--project-overview)
2. [Full Directory & File Map](#section-2--full-directory--file-map)
3. [Complete Game Flow](#section-3--complete-game-flow)
4. [Character System Architecture](#section-4--character-system-architecture)
5. [How 3D Character Loading Works](#section-5--how-3d-character-loading-works)
6. [How to Replace a Character's 3D Model](#section-6--how-to-replace-a-characters-3d-model)
7. [How to Add or Update Character Animations](#section-7--how-to-add-or-update-character-animations)
8. [How to Modify Character Stats, Moves & Special Attacks](#section-8--how-to-modify-character-stats-moves--special-attacks)
9. [How to Modify Audio](#section-9--how-to-modify-audio)
10. [How to Modify Arenas & Lighting](#section-10--how-to-modify-arenas--lighting)
11. [How to Modify UI Screens](#section-11--how-to-modify-ui-screens)
12. [How to Add a Brand-New Fighter](#section-12--how-to-add-a-brand-new-fighter)
13. [Testing & Verification Guide](#section-13--testing--verification-guide)
14. [Common Pitfalls & Do-Not-Break Rules](#section-14--common-pitfalls--do-not-break-rules)

---

## Section 1 — Project Overview

### What Filmi Dangal Is
Filmi Dangal is a 60fps deterministic 2.5D fighting game rendered in a real-time 3D Babylon.js stage. Fighters move and battle along the 2D `X/Y` gameplay plane (`Z = 0`) while full 3D skeletal rigs, dynamic cameras, PBR materials, volumetric stage lighting, and 3D particle/mesh VFX render in 3D space.

### Playable Roster (4 Fighters)
| `FighterId` | Display Name | Slug | Real-Life Parody Inspiration | Current 3D Asset Status |
| :--- | :--- | :--- | :--- | :--- |
| `action_sultan` | **Action Sultan** | `action-sultan` | Salman Khan | **Production Skinned GLB** (`isTemporaryPlaceholder: false`, `PRODUCTION_SKINNED`, 52-bone Mixamo rig, 16,133 vertices, procedural bone animation fallback) |
| `romance_raja` | **Romance Raja** | `romance-raja` | Shah Rukh Khan | **Temporary Placeholder** (`isTemporaryPlaceholder: true`, `TEMPORARY_PLACEHOLDER`, Path A articulated 20-bone + 5-facial-bone procedural rig) |
| `duggu` | **Duggu** | `duggu` | Hrithik Roshan | **Temporary Placeholder** (`isTemporaryPlaceholder: true`, `TEMPORARY_PLACEHOLDER`, Path A articulated 20-bone + 5-facial-bone procedural rig) |
| `bhidu` | **Bhidu** | `bhidu` | Jackie Shroff | **Temporary Placeholder** (`isTemporaryPlaceholder: true`, `TEMPORARY_PLACEHOLDER`, Path A articulated 20-bone + 5-facial-bone procedural rig) |

### Game Modes
- **Versus CPU (`vs_cpu`)**: Single best-of-3 round match against a chosen CPU fighter (`easy`, `normal`, or `hard`).
- **Arcade Mode (`arcade`)**: 3-stage tournament ladder against the 3 remaining roster fighters (`bridge.arcadeLadder`), automatically advancing via `bridge.advanceArcadeStage()`.
- **Training Mode (`training`)**: Infinite-time, auto-regenerating health & meter practice mode with configurable dummy behavior (`stand`, `block`, `crouch`, `jump`, `cpu_spar`).

### Architecture Split: React UI vs. GameBridge vs. 3D Engine
1. **React UI Layer (`src/App.tsx`, `src/components/*`)**:
   Renders menus, HUD overlays, modals, and mobile touch controls. React **never** runs a 60fps state loop directly; during active combat it subscribes to throttled HUD snapshots (`GameHUDState`) pushed from the 3D engine every 3 simulation frames (or immediately on hit/phase events).
2. **`GameBridge` Singleton (`src/engine/GameBridge.ts`)**:
   The single source of truth linking React UI screens and the Babylon.js engine. Stores `screen`, `gameMode`, `p1CharacterId`, `p2CharacterId`, `arenaId`, `difficulty`, `arcadeLadder`, `arcadeStageIndex`, `trainingDummyBehavior`, `isPaused`, and `lastMatchStats`.
3. **3D Gameplay & Preview Engines (`src/game3d/*`)**:
   - `CharacterPreviewScene.ts`: Powers the interactive 3D fighter turntable and 8-state animation/SFX verification deck on the Character Select screen.
   - `BabylonFightEngine.ts`: Runs the fixed-timestep 60Hz combat simulation (`Fighter3D`, `CombatSystem3D`, `HitboxSystem3D`, `CPUController3D`, `MatchManager3D`) and synchronizes the 3D rigs (`CharacterRig3D`), arena (`ArenaBuilder3D`), camera (`DynamicFightCamera3D`), and effects (`VFXManager3D`).
4. **Legacy 2D Engine (`src/engine/Fighter.ts`, `CombatSystem.ts`, `HitboxSystem.ts`, `MatchManager.ts`, `CPUController.ts`)**:
   Pure TypeScript 2D reference engine retained for deterministic unit testing and frame-data parity checks in `src/engine/tests/combat.test.ts`. Active browser gameplay uses `src/game3d/*` (`BabylonFightEngine`).

---

## Section 2 — Full Directory & File Map

### Root Configuration & Scripts
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `package.json` | Dependencies, build scripts (`dev`, `build`, `lint`, `test`, `build:glb`). | Adding scripts or dependencies. |
| `index.html` | HTML entry point, Google Fonts (`Cinzel`, `Rajdhani`, `Bungee`, `Inter`), title/meta tags. | Updating page metadata or fonts. |
| `metadata.json` | AI Studio applet metadata (`name`, `description`, capabilities). | Do not rename the app after creation. |
| `vite.config.ts` | Vite bundler configuration with React and Tailwind CSS plugins. | Changing build/dev server configuration. |
| `tsconfig.json` | TypeScript compiler configuration (`tsc --noEmit` used by `npm run lint`). | Updating TypeScript paths or strictness. |
| `scripts/build-glb-assets.ts` | Generates binary `.glb` placeholder files and `manifest.json` for placeholder characters (`romance-raja`, `duggu`, `bhidu`) while skipping production characters in `SKIP_PRODUCTION_CHARACTER_IDS`. | Modifying placeholder GLB generation or adding a new character's placeholder GLB. |

### Public Assets (`public/assets/`)
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `public/assets/characters/README.md` | Quick asset specification for 3D character `.glb` files. | Updating artist documentation. |
| `public/assets/characters/action-sultan/model.glb` | Production skinned Mixamo `.glb` model for Action Sultan (52 bones, 16,133 vertices). | Replacing or updating Action Sultan's 3D mesh. |
| `public/assets/characters/action-sultan/manifest.json` | Metadata describing Action Sultan's GLB, scale, bone aliases, and procedural fallback animations. | Updating Action Sultan's GLB or embedded clips. |
| `public/assets/characters/romance-raja/model.glb` | Temporary placeholder `.glb` for Romance Raja (replaced at runtime by Path A procedural rig). | Dropping in a production skinned `.glb` for Romance Raja. |
| `public/assets/characters/romance-raja/manifest.json` | Metadata for Romance Raja's asset status, bone aliases, and animations. | Promoting Romance Raja to `PRODUCTION_SKINNED`. |
| `public/assets/characters/duggu/model.glb` | Temporary placeholder `.glb` for Duggu (replaced at runtime by Path A procedural rig). | Dropping in a production skinned `.glb` for Duggu. |
| `public/assets/characters/duggu/manifest.json` | Metadata for Duggu's asset status, bone aliases, and animations. | Promoting Duggu to `PRODUCTION_SKINNED`. |
| `public/assets/characters/bhidu/model.glb` | Temporary placeholder `.glb` for Bhidu (replaced at runtime by Path A procedural rig). | Dropping in a production skinned `.glb` for Bhidu. |
| `public/assets/characters/bhidu/manifest.json` | Metadata for Bhidu's asset status, bone aliases, and animations. | Promoting Bhidu to `PRODUCTION_SKINNED`. |
| `public/assets/audio/characters/README.md` | Documentation for external per-character `.ogg`/`.mp3` audio files. | Adding studio voice/SFX files. |

### Core Types, Data & Config (`src/types/`, `src/data/`, `src/config/`)
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `src/types/fighter.ts` | Core TypeScript types: `FighterId`, `ArenaId`, `GameMode`, `Difficulty`, `FighterStateName`, `CharacterDef`, `MoveFrameData`, `Sphere3D`, `CapsuleHurtbox3D`, `HitEvent`. | Adding a new fighter ID, arena ID, combat state, or frame-data field. |
| `src/data/characters.ts` | Authoritative gameplay definitions (`CHARACTERS`, `CHARACTER_LIST`) for all 4 fighters: names, titles, bios, stats, proportions, colors, `superShotInfo`, `superMoveInfo`, and `moves` frame data. | Tuning fighter health, speed, damage, frame data, or descriptions. |
| `src/data/arenas.ts` | Definitions (`ARENAS`, `ARENA_LIST`) for `award_night` and `film_city`, including 3D stage bounds (`bounds3D`). | Tuning stage width/bounds or adding a new arena. |
| `src/config/characterAssets.ts` | Authoritative 3D asset manifest (`CHARACTER_ASSET_MANIFEST`): `isTemporaryPlaceholder`, `modelPath`, `scale`, `groundOffset`, `facingRotationY`, `boneAliases`, `animations`, `specialAttackEvents`, `vfx`, and `audio` paths. | Promoting a character from placeholder to production GLB, calibrating scale/groundOffset, or remapping bone/animation names. |
| `src/config/audioAssets.ts` | Per-character audio manifest (`CHARACTER_AUDIO_MANIFEST`): maps all 9 combat/special audio events per character to external `.ogg`/`.mp3` paths and multi-layer Web Audio synth fallback profiles. | Customizing sound synthesis or enabling external audio files (`isTemporaryPlaceholder: false`). |

### UI Components (`src/components/`)
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `src/App.tsx` | Root application router switching between `title`, `character_select`, `arena_select`, `fighting`, and `results`, plus global modals and portrait-orientation prompt. | Adding a new top-level screen or global modal. |
| `src/components/TitleScreen.tsx` | Main menu with mode buttons (`Versus CPU`, `Arcade Ladder`, `Training`), settings, controls, and parody disclaimer triggers. | Modifying title screen layout or mode cards. |
| `src/components/CharacterSelect.tsx` | Player 1 & Player 2 (CPU/Dummy) fighter selection grid, difficulty/dummy toggles, fighter dossier, and embedded `<CharacterPreview3D />`. | Modifying selection UI or dossier presentation. |
| `src/components/ArenaSelect.tsx` | Stage selection screen (`Award Night` vs `Film City`) with stage feature previews and `START FIGHT` trigger. | Adding a new arena card or changing stage preview UI. |
| `src/components/GameCanvas.tsx` | Mounts the WebGL `<canvas>` for active combat and instantiates/disposes `BabylonFightEngine`. | Modifying canvas sizing or WebGL fallback wrapper. |
| `src/components/FightHUD.tsx` | 60fps-driven arcade overlay: health bars with ghost damage trail, round clock, win pips, Filmi Super meter, SuperShot cooldown badge, combo counter, and special move callouts. | Modifying in-fight HUD layout or indicators. |
| `src/components/MobileControls.tsx` | Multitouch virtual D-pad and action buttons (`PUNCH`, `KICK`, `SHOT`, `SUPER`, `BLOCK`) for touch/mobile viewports. | Adjusting mobile button placement or touch bindings. |
| `src/components/PauseModal.tsx` | In-fight pause overlay (`Resume`, `Restart Round`, `Controls`, `Settings`, `Main Menu`). | Modifying pause menu options. |
| `src/components/ResultsModal.tsx` | Post-match victory/defeat screen, match statistics, Arcade Next Opponent progression button, Rematch, and Character Select navigation. | Modifying post-match stats or arcade progression UI. |
| `src/components/ControlsModal.tsx` | Keyboard and mobile touch control reference modal + combo list. | Updating displayed control bindings or combo recipes. |
| `src/components/SettingsModal.tsx` | Graphics quality (`low`/`medium`/`high`), LOD/resolution scaling, round timer, starting health, control sensitivity, HUD scale, and audio volume settings. | Adding a new user-configurable setting. |
| `src/components/DisclaimerModal.tsx` | Parody & fair-use celebration disclaimer modal. | Editing legal/parody notice text. |

### Shared State, Settings, Audio & Tests (`src/engine/`)
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `src/engine/GameBridge.ts` | Singleton state bridge (`screen`, `p1CharacterId`, `p2CharacterId`, `arenaId`, `gameMode`, `arcadeLadder`, `startMatch()`, `rematch()`, `advanceArcadeStage()`). | Adding cross-layer state or lifecycle commands. |
| `src/engine/SettingsManager.ts` | Persistent `localStorage` settings manager with sanitization (`sanitizeGameSettings`). | Adding new persisted settings fields. |
| `src/engine/AudioManager.ts` | Web Audio API synthesizer + external `.ogg`/`.mp3` audio buffer loader & BGM sequencer. | Modifying audio playback engine or BGM loop. |
| `src/engine/ComboSystem.ts` | Input buffer & 3-hit target combo detector (`Dial-A-Dishoom`, `Box Office Blitz`, ` Launcher`). | Adding or modifying target combo sequences. |
| `src/engine/InputManager.ts` | Keyboard & touch state snapshotter (`EMPTY_INPUT_FRAME`, `InputSnapshot`). | Changing keyboard key bindings. |
| `src/engine/Fighter.ts`, `CombatSystem.ts`, `HitboxSystem.ts`, `MatchManager.ts`, `CPUController.ts` | Pure 2D deterministic combat classes used alongside 3D classes in unit tests. | Keep in sync if changing core move/combo rules tested by 2D unit tests. |
| `src/engine/tests/combat.test.ts` | Comprehensive Node test suite (`npm test`) covering binary GLB validation, 3D rig loading, bone calibration, preview switching, and all 6 matchups. | Adding unit/integration tests for any new feature or bugfix. |

### 3D Babylon.js Engine (`src/game3d/`)
| File Path | Responsibility | When to Edit |
| :--- | :--- | :--- |
| `src/game3d/characters/CharacterRoster3D.ts` | Authoritative character mapping (`resolveAuthoritativeCharacterMapping`, `verifyAllAuthoritativeCharacterMappings`, `applyFighterSelection`, `getCharacterMonogram`). | Adding a new fighter or verifying character ID mappings. |
| `src/game3d/assets/CharacterAssetValidator.ts` | Pure binary `.glb` and glTF JSON validator (`validateGLBBuffer`, `validateParsedGLTF`): checks magic header, skins, `JOINTS_0`/`WEIGHTS_0`, humanoid bones, bounds, and animations. | Adjusting static binary GLB validation thresholds. |
| `src/game3d/assets/CharacterAssetLoader.ts` | Core Babylon.js 3D loader (`loadCharacterFromManifest`), bone alias resolver (`resolveHumanoidSkeletonAndBones`), auto-scale/ground calibrator (`calibrateImportedModelTransform`), eligibility evaluator, and Path A procedural humanoid rig builder (`buildTemporaryPlaceholderHumanoidRig`). | Changing how `.glb` hierarchies, bones, or procedural fallback rigs are built. |
| `src/game3d/assets/AssetLoader3D.ts` | High-level wrapper (`loadCharacterRig3D`, `buildFallbackCharacterRig3D`, `CharacterRig3D` interface). | Adding properties to `CharacterRig3D`. |
| `src/game3d/animation/CharacterAnimationController.ts` | Hybrid animation controller: plays embedded GLB `AnimationGroup` clips when valid, and drives quaternion-safe procedural bone poses for all 15 states + 4 character-specific SuperShots and SuperMoves. | Tuning procedural bone rotations or special attack poses. |
| `src/game3d/animation/AnimationController3D.ts` | Gameplay animation wrapper delegating to `CharacterAnimationController` and resolving world-space bone socket coordinates (`getSocketWorldPosition`). | Modifying socket world position lookups. |
| `src/game3d/animation/FighterAnimationEvents.ts` | Frame-accurate animation event dispatcher (`ON_CHARGE_START`, `ON_PROJECTILE_RELEASE`, `ON_SPECIAL_IMPACT`, `ON_SUPERMOVE_CLIMAX`, `ON_ANIMATION_COMPLETE`). | Changing special move frame event triggers. |
| `src/game3d/scenes/CharacterPreview3D.tsx` | React wrapper for the Character Select 3D preview canvas, status badges (`PRODUCTION GLB ACTIVE` vs `TEMPORARY PLACEHOLDER`), LOD toggle, and 8-state verification buttons. | Modifying preview overlay badges or buttons. |
| `src/game3d/scenes/CharacterPreviewScene.ts` | Babylon.js scene controller for the character select turntable (`loadCharacterAsset`, load-token concurrency guard, preview VFX, telemetry callback). | Modifying preview lighting, camera, or turntable behavior. |
| `src/game3d/engine/BabylonFightEngine.ts` | Main 60fps 3D match coordinator (`initializeFullMatch`, `loadFighterRigs`, `stepSimulationFrame`, `sync3DSceneVisuals`). | Modifying match loop, camera trauma, or rig lifecycle. |
| `src/game3d/combat/Fighter3D.ts` | 3D fighter state machine, physics, 3-sphere capsule hurtbox (`headSphere`, `torsoSphere`, `legsSphere`), bone-attached active attack spheres, and special move controllers. | Modifying fighter physics, state transitions, or 3D hurtboxes/hitboxes. |
| `src/game3d/combat/CombatSystem3D.ts` | 3D pushbox separator, sphere-vs-capsule collision resolver, hitstop/blockstun/knockdown application, and projectile integration. | Modifying hit resolution or pushbox collision. |
| `src/game3d/combat/CharacterSpecialMoveController.ts` | Per-character 4-phase `SuperMove` state machine (`STARTUP_FREEZE` -> `BURST_ENGAGE` -> `CLIMAX_IMPACT` -> `RECOVERY`) and `SuperShot` frame timing. | Modifying SuperShot or SuperMove frame windows or lunges. |
| `src/game3d/combat/SuperShotProjectileSystem.ts` & `Projectile3D.ts` | Spawns, steps, and collides 3D `SuperShot` projectiles (`bullet_tracer`, `open_arms_wave`, `sonic_dance_wave`, `swagger_ground_wave`). | Tuning projectile speed, radius, lifetime, or visual style. |
| `src/game3d/hitboxes/HitboxSystem3D.ts` | Pure 3D sphere-sphere and sphere-capsule math (`testSphereVsCapsule3D`). | Modifying 3D collision geometry math. |
| `src/game3d/arenas/ArenaBuilder3D.ts` | Builds 3D geometry, PBR materials, lights, shadows, and animated stage props for `award_night` and `film_city`. | Modifying stage 3D props, colors, or lighting. |
| `src/game3d/cameras/DynamicFightCamera3D.ts` | 3D tracking camera that frames P1 and P2, zooms on SuperMoves, and applies decay-based screen-shake trauma. | Adjusting camera FOV, distance, height, or shake intensity. |
| `src/game3d/vfx/VFXManager3D.ts` | 3D meshes and bursts for hit sparks, character-specific SuperShot charge/release VFX, SuperMove ground waves, projectile meshes, and wireframe debug hitboxes (`[H]`). | Adding or modifying 3D visual effects. |
| `src/game3d/audio/AudioManager3D.ts` | Static facade routing 3D character combat events to `AudioManager`. | Adding new character audio event helpers. |
| `src/game3d/cpu/CPUController3D.ts` | 3D AI controller with difficulty profiles (`easy`, `normal`, `hard`), projectile evasion, anti-air, and SuperMove execution. | Tuning CPU AI aggressiveness or reaction frequency. |
| `src/game3d/managers/MatchManager3D.ts` | Round timer, best-of-3 round win counter, spawn coordinates (`P1_SPAWN_X_3D = -2.4`, `P2_SPAWN_X_3D = 2.4`), and match phase state machine. | Changing spawn positions or round rules. |

---

## Section 3 — Complete Game Flow

```text
[TitleScreen.tsx]
   │  User clicks mode ("VERSUS CPU" | "ARCADE LADDER" | "TRAINING")
   ▼
bridge.gameMode = mode;
bridge.setScreen('character_select');
   │
   ▼
[CharacterSelect.tsx]  ◄──────────────────────────────────────────┐
   │  • Initializes p1Id = bridge.p1CharacterId                   │
   │  • Initializes p2Id = bridge.p2CharacterId (ensured != p1Id) │
   │  • Toggle active slot: "PLAYER 1" ('p1') vs "CPU/DUMMY" ('p2')│
   │  • Clicking a fighter card calls applyFighterSelection():    │
   │      - Updates active slot (p1Id or p2Id)                    │
   │      - Syncs bridge.p1CharacterId & bridge.p2CharacterId     │
   │      - If duplicate with other slot, swaps other slot to     │
   │        previous fighter                                      │
   │  • Renders <CharacterPreview3D characterId={selectedChar.id}/>│
   │      - Calls CharacterPreviewScene.loadCharacterAsset(id)    │
   │      - Increments loadToken, disposes old rig immediately,   │
   │        loads new CharacterRig3D, updates telemetry badge     │
   │  • User clicks "SELECT 3D ARENA →"                           │
   ▼                                                              │
bridge.setScreen('arena_select');                                 │
   │                                                              │
   ▼                                                              │
[ArenaSelect.tsx]                                                 │
   │  • User picks 'award_night' or 'film_city' (bridge.arenaId)  │
   │  • Clicking "CHANGE FIGHTERS" returns to 'character_select' ─┘
   │  • Clicking "START FIGHT" calls bridge.startMatch():
   │      - If gameMode === 'arcade', builds 3-opponent ladder
   │        excluding bridge.p1CharacterId and sets
   │        bridge.p2CharacterId = bridge.arcadeLadder[0]
   │      - Sets bridge.screen = 'fighting'
   │      - Emits 'start_match' command
   ▼
[GameCanvas.tsx] + [FightHUD.tsx]
   │  • Mounts <canvas> and creates new BabylonFightEngine(canvas)
   │  • BabylonFightEngine.initializeFullMatch():
   │      1. Reads bridge.p1CharacterId & bridge.p2CharacterId
   │      2. Resolves p1Def = CHARACTERS[bridge.p1CharacterId]
   │         and p2Def = CHARACTERS[bridge.p2CharacterId]
   │      3. Disposes any mismatched p1Rig / p2Rig immediately
   │      4. Updates this.p1.setCharacterDef(p1Def) &
   │         this.p2.setCharacterDef(p2Def)
   │      5. Calls loadFighterRigs(p1Def, p2Def) with ++rigLoadToken
   │      6. Resets MatchManager3D & pushes initial GameHUDState
   │  • Runs 60fps simulation loop until MatchManager3D reaches 'match_end'
   ▼
bridge.setScreen('results');
   │
   ▼
[ResultsModal.tsx]
   ├─► "REMATCH" -> bridge.rematch() -> screen = 'fighting', emits 'rematch'
   │   (Preserves current bridge.p1CharacterId & bridge.p2CharacterId)
   ├─► "NEXT OPPONENT" (Arcade win on Stage 1 or 2) ->
   │   bridge.advanceArcadeStage() -> increments arcadeStageIndex,
   │   sets bridge.p2CharacterId = arcadeLadder[arcadeStageIndex],
   │   emits 'start_match'
   ├─► "CHARACTER SELECT" -> bridge.setScreen('character_select')
   └─► "MAIN MENU" -> bridge.returnToMenu() -> screen = 'title'
```

---

## Section 4 — Character System Architecture

Every character in Filmi Dangal is bound through a strict 5-stage authoritative chain:

```text
FighterId ('action_sultan' | 'romance_raja' | 'duggu' | 'bhidu')
   │
   ├─► 1. CharacterDef (src/data/characters.ts -> CHARACTERS[id])
   │      Controls gameplay identity: name, title, stats, proportions,
   │      colors, superShotInfo, superMoveInfo, and moves frame data.
   │
   ├─► 2. CharacterAssetConfig (src/config/characterAssets.ts -> CHARACTER_ASSET_MANIFEST[id])
   │      Controls 3D & audio pipeline: isTemporaryPlaceholder, modelPath,
   │      scale, groundOffset, boneAliases, animations, specialAttackEvents,
   │      vfx paths, and audio paths.
   │
   ├─► 3. Binary GLB File & JSON Manifest (public/assets/characters/<slug>/model.glb & manifest.json)
   │      Physical 3D asset on disk loaded by Babylon.js SceneLoader.
   │
   ├─► 4. Loaded CharacterRig3D (src/game3d/assets/AssetLoader3D.ts)
   │      Runtime 3D scene graph: rootNode -> facingNode -> modelTransformNode,
   │      resolved canonical bones, attachment sockets, meshes, renderState,
   │      and CharacterAssetLoadDiagnostics.
   │
   └─► 5. Active Scene Binding
          • Preview: CharacterPreviewScene.currentRig (verified currentRig.characterId === characterId)
          • Gameplay: BabylonFightEngine.p1Rig & p2Rig (verified p1Rig.characterId === p1.id)
```

### Authoritative Verification Helper
`src/game3d/characters/CharacterRoster3D.ts` exports:
- `resolveAuthoritativeCharacterMapping(id: FighterId)`: Verifies that `FighterId`, `CharacterDef.id`, `CharacterAssetConfig.id`, and `modelPath` all match `id` with zero cross-character aliasing.
- `verifyAllAuthoritativeCharacterMappings()`: Validates that all 4 fighters have valid, mutually exclusive `modelPath` configurations.

---

## Section 5 — How 3D Character Loading Works

All 3D character loading flows through `loadCharacterRig3D()` (`src/game3d/assets/AssetLoader3D.ts`) -> `CharacterAssetLoader.loadCharacterFromManifest()` (`src/game3d/assets/CharacterAssetLoader.ts`).

### Scene Graph Hierarchy
Every loaded character rig constructs a strict 3-tier transform hierarchy:
1. **`rootNode` (`${prefix}_${charId}_root`)**:
   Positioned at `(x, y, 0)` in world space by `Fighter3D.position` (or `(0, y, 0)` in preview). Scale is `(1, 1, 1)`.
2. **`facingNode` (`${prefix}_${charId}_facing`, child of `rootNode`)**:
   Rotated around `Y` (`facingRotationY.right = +π/2`, `facingRotationY.left = -π/2`, or turntable angle in preview).
3. **`modelTransformNode` (`${prefix}_${charId}_modelTransform`, child of `facingNode`)**:
   Applies calibrated `scale` and `groundOffset` **exactly once**. All imported GLB root nodes or procedural bones attach under `modelTransformNode`.

### The 4 Render States (`CharacterRenderState`)

| `renderState` | Meaning | How It Is Triggered |
| :--- | :--- | :--- |
| `PRODUCTION_SKINNED` | **Path B — Production Skinned Character**: Uses the imported `.glb` meshes, PBR materials/textures, and `Skeleton` (>= 15 bones with valid `JOINTS_0` and `WEIGHTS_0` vertex weights and all 20 canonical humanoid bones resolved). | `manifest.isTemporaryPlaceholder === false` AND `glbLoaded === true` AND `eligibility.isProductionReady === true`. (**Currently active for `action_sultan`**). |
| `VISUAL_ONLY` | **Path C — Valid Visual-Only Character**: Uses imported non-placeholder `.glb` mesh geometry and materials, even if the model has no skeletal skinning. | `manifest.isTemporaryPlaceholder === false` AND `glbLoaded === true` AND `hasValidGeometry === true` (and NOT a generated 24-vertex box placeholder proxy) when `isProductionSkinned === false`. |
| `TEMPORARY_PLACEHOLDER` | **Path A — Procedural Humanoid Rig**: Disposes any imported placeholder proxy meshes/materials from the `.glb` and builds the character-specific articulated 20-bone + 5-facial-bone procedural humanoid rig (`buildTemporaryPlaceholderHumanoidRig`) styled with that fighter's exact proportions, colors, hair, sunglasses/bandana, and attire. | `manifest.isTemporaryPlaceholder === true` (or when `isTemporaryPlaceholder === false` but the `.glb` on disk is still the generated box-primitive placeholder proxy). (**Currently active for `romance_raja`, `duggu`, and `bhidu`**). |
| `LOAD_FAILED` | **Path A — Load Failed Fallback Rig**: The `.glb` file could not be fetched or parsed. Builds the requested fighter's own procedural humanoid rig (`buildTemporaryPlaceholderHumanoidRig`) so gameplay/preview continues with the selected fighter's identity and records the failure in `diagnostics.errors`. | `glbLoaded === false` or an unrecoverable loader error occurred. **Never substitutes `action_sultan` when another fighter fails to load.** |

### Critical Role of `isTemporaryPlaceholder`
- In `src/config/characterAssets.ts`, each character has `isTemporaryPlaceholder: boolean`.
- **Replacing a `.glb` file on disk alone does NOT activate a production model if `isTemporaryPlaceholder` is still `true`!** While `isTemporaryPlaceholder: true`, `CharacterAssetLoader` intentionally disposes the imported GLB proxy meshes and builds Path A (`TEMPORARY_PLACEHOLDER`).
- Conversely, **setting `isTemporaryPlaceholder: false` without replacing the generated placeholder `.glb` will NOT activate production mode**: `CharacterAssetLoader` detects generated 24-vertex box-primitive placeholder proxies (`LOD0_High`/`LOD1_Medium`/`LOD2_Low` with 0 skins) and safely keeps the character in `TEMPORARY_PLACEHOLDER` state.

---

## Section 6 — How to Replace a Character's 3D Model

Follow this exact step-by-step checklist when replacing a temporary placeholder character (`romance_raja`, `duggu`, or `bhidu`)—or updating `action_sultan`—with a new production `.glb` model.

### Step 1: Verify Technical Requirements for the `.glb` File
Before exporting from Blender / Maya / Mixamo, verify that the model satisfies `PRODUCTION_GLB_ASSET_CONTRACT` (`src/config/characterAssets.ts`):
1. **Format**: glTF 2.0 binary `.glb` (`magic === 0x46546C67`, `version === 2`).
2. **Mesh & Vertex Skinning**:
   - At least 1 mesh primitive with `POSITION`, `JOINTS_0`, and normalized non-zero `WEIGHTS_0` attributes (`sum(w0..w3) ≈ 1.0`).
   - At least 1 glTF `skin` with `>= 15` joints bound to the mesh node(s).
3. **Required 20 Canonical Humanoid Bones**:
   Must include nodes/bones matching these 20 canonical names or their supported Mixamo (`mixamorig:*`), Rigify, or Biped aliases in `DEFAULT_HUMANOID_BONE_ALIASES`:
   `Root`, `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `LeftShoulder`, `LeftUpperArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightUpperArm`, `RightForeArm`, `RightHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`.
4. **Scale, Forward Axis & Ground Origin**:
   - Forward axis: `+Z` in local space.
   - Note on Mixamo FBX-to-GLB exports: If your exporter wraps the armature in an `FBX_Root` node scaled to `0.01`, `CharacterAssetLoader` automatically neutralizes `FBX_Root` scale to `1.0` and `calibrateImportedModelTransform()` computes the exact `scale` and `groundOffset` so the character's feet rest at `Y = 0` and height matches `targetHeightMeters` (`~1.82m * heightScale`).

### Step 2: Place the `.glb` File in the Character's Folder
Overwrite the target file in `public/assets/characters/<slug>/model.glb`:
- Action Sultan: `public/assets/characters/action-sultan/model.glb`
- Romance Raja: `public/assets/characters/romance-raja/model.glb`
- Duggu: `public/assets/characters/duggu/model.glb`
- Bhidu: `public/assets/characters/bhidu/model.glb`

### Step 3: Protect the Character from Placeholder Regeneration
Open `scripts/build-glb-assets.ts` and add the character's ID to `SKIP_PRODUCTION_CHARACTER_IDS`:
```ts
const SKIP_PRODUCTION_CHARACTER_IDS = new Set<string>([
  'action_sultan',
  'romance_raja', // <-- Add the promoted character ID here so npm run build:glb never overwrites it
]);
```

### Step 4: Enable Production Loading in `src/config/characterAssets.ts`
Open `src/config/characterAssets.ts` and update that character's entry in `CHARACTER_ASSET_MANIFEST`:
1. Set `isTemporaryPlaceholder: false`.
2. If your rig uses custom bone names not already in `DEFAULT_HUMANOID_BONE_ALIASES`, add them to `boneAliases` for that character.
3. Adjust `scale`, `groundOffset`, or `facingRotationY` if needed (note that `calibrateImportedModelTransform` auto-calibrates `scale` and `groundOffset` from unscaled local mesh bounds when `isTemporaryPlaceholder: false`).

### Step 5: Update `public/assets/characters/<slug>/manifest.json`
Update the character's `manifest.json` so its metadata (`assetStatus: "PRODUCTION_SKINNED"`, `isPlaceholder: false`, `isTemporaryPlaceholder: false`, `scale`, `groundOffset`, `embeddedAnimations`) matches the new binary `.glb`.

### Step 6: Update and Run Automated Validation Tests
1. In `src/engine/tests/combat.test.ts`, update tests that assert which characters have `isTemporaryPlaceholder: true` vs `false` (Tests 1, 10, 12, 17, 23).
2. Run `npm test` to verify binary GLB validation (`validateGLBBuffer`) and headless Babylon `NullEngine` rig loading (`loadCharacterRig3D`) report `renderState === 'PRODUCTION_SKINNED'` and `productionRigValid === true`.

---

## Section 7 — How to Add or Update Character Animations

Filmi Dangal uses a **hybrid animation architecture** (`CharacterAnimationController.ts` + `CharacterAssetLoader.ts`) that supports both embedded GLB `AnimationGroup` clips and quaternion-safe procedural bone animation.

### 1. Standardized Animation Clip IDs (`StandardAnimationClipId`)
Defined in `src/config/characterAssets.ts` (`ALL_STANDARD_ANIMATION_CLIP_IDS`):
- Locomotion & Defense: `idle`, `walk`, `run`, `jump`, `landing`, `crouch`, `block`
- Melee & Reactions: `punch`, `kick`, `hit_react`, `knockout`, `victory`, `defeat`
- Signature Specials: `super_shot`, `super_move`

### 2. How Embedded GLB Animations Are Resolved vs. Static Pose Filtering
When a production `.glb` is imported in `CharacterAssetLoader.createAnimationGroupController()`:
1. Every `AnimationGroup` in the `.glb` is inspected by `isAnimationGroupMeaningfullyAnimated()`.
2. **Static bind-pose clips** (such as Mixamo's default 1-frame `"mixamo_com"` clip that has zero keyframe delta across frames) are automatically classified into `staticPoseClipNames` and **stopped/excluded** from runtime playback so they never freeze the character in a T-pose or corrupt `Hips.y` ground calibration.
3. If a non-static `AnimationGroup` matches the requested state's `clipName` or `aliases` (configured in `src/config/characterAssets.ts` -> `createStandardAnimationsConfig`), `glbAnimationController.playClip(clipId)` plays that embedded clip.
4. **Automatic Procedural Bone Fallback**: If an embedded clip is not present for a state (for example, `action-sultan/model.glb` only embeds the static `mixamo_com` clip), `CharacterAnimationController.updateRigPose()` automatically drives all 20 humanoid bones (using quaternion rotations when `node.rotationQuaternion` is active on glTF/Mixamo rigs, or Euler angles on procedural rigs) from captured rest poses (`__restPosition`, `__restQuaternion`).

### 3. How to Map New Embedded Animation Clips
If you export a `.glb` with embedded animations:
- Name the clips in Blender/Mixamo to match `createStandardAnimationsConfig` in `src/config/characterAssets.ts` (e.g., `Idle`, `Walk`, `Run`, `Jump`, `Landing`, `Crouch`, `Block`, `Punch`, `Kick`, `HitReact`, `Knockout`, `Victory`, `Defeat`, plus the character's `superShotClip` and `superMoveClip`), **or** add your custom clip names to the `aliases` array in `src/config/characterAssets.ts`.

### 4. How to Modify Procedural Animation Poses
Open `src/game3d/animation/CharacterAnimationController.ts`:
- `updateRigPose()` computes procedural joint angles (`PoseTargets`) for every `FighterStateName`.
- Character-specific `super_shot` and `super_move` choreography is implemented in dedicated per-character blocks inside `CharacterAnimationController.ts` (e.g. Action Sultan aiming & recoil, Romance Raja open-arms pose, Duggu rhythmic dance steps, Bhidu swagger walk & ground stomp).

---

## Section 8 — How to Modify Character Stats, Moves & Special Attacks

### 1. Modifying Fighter Stats, Names, Colors & Proportions
Edit **`src/data/characters.ts`** (`CHARACTERS[fighterId]`):
- `stats.maxHealth`: Starting/maximum HP (`1050` for Action Sultan, `960` for Romance Raja, `950` for Duggu, `1080` for Bhidu).
- `stats.walkSpeed` / `stats.jumpForce` / `stats.gravity`: Movement physics speeds.
- `stats.powerMultiplier` / `stats.defenseMultiplier`: Global damage dealt and damage taken multipliers.
- `visuals.primaryColor` / `secondaryColor` / `skinColor` / `hairColor`: Hex colors used by procedural rigs, preview pedestal rings, and hit/super VFX bursts.
- `visuals.proportions`: `heightScale`, `shoulderWidth`, `chestDepth`, `torsoBulk`, `limbThickness`, `legLength`, `jawWidth`.

### 2. Modifying Normal & Command Attack Frame Data
Edit **`src/data/characters.ts`** (`CHARACTERS[fighterId].moves`):
Each move (`punch`, `kick`, `crouch_punch`, `crouch_kick`, `jump_punch`, `jump_kick`, `forward_punch`, `forward_kick`, `sweep`, `grab`, `special`, `super`, `super_shot`, `super_move`) defines `MoveFrameData`:
- `startup`: Frames before the hitbox becomes active.
- `active`: Frames the attack sphere is active.
- `recovery`: Frames after active frames before the fighter returns to `idle`.
- `damage` & `chipDamage`: Unblocked vs blocked damage.
- `meterGain`: Super meter gained on execution/hit (or negative meter cost for specials).
- `hitstun` & `blockstun`: Frames the defender is locked in stun.
- `knockback`: `{ x, y }` velocity impulse applied to the defender.
- `causesKnockdown`: Whether an unblocked hit puts the defender into `knockdown`.

### 3. Modifying `SuperShot [U]` & `SuperMove [L]` Behavior
Special attacks are coordinated across **4 files**:
1. **`src/data/characters.ts`**:
   Update `superShotInfo`, `superMoveInfo`, and `moves.super_shot` / `moves.super_move` damage and frame counts.
2. **`src/config/characterAssets.ts`**:
   Update `specialAttackEvents.superShot` (`chargeStartFrame`, `projectileReleaseFrame`, `specialImpactFrame`, `animationCompleteFrame`) and `specialAttackEvents.superMove` (`chargeStartFrame`, `climaxImpactFrame`, `animationCompleteFrame`).
   > **Rule**: Must satisfy `1 <= chargeStartFrame < projectileReleaseFrame <= specialImpactFrame < animationCompleteFrame`.
3. **`src/game3d/combat/CharacterSpecialMoveController.ts` & `src/game3d/combat/SuperShotProjectileSystem.ts`**:
   - `CharacterSpecialMoveController.ts`: Controls the 4-phase `SuperMove` timeline (`STARTUP_FREEZE` -> `BURST_ENGAGE` -> `CLIMAX_IMPACT` -> `RECOVERY`), forward lunge speed, invulnerability windows, and active melee radius.
   - `SuperShotProjectileSystem.ts`: Controls projectile velocity, spawn offset, radius, lifetime, and `visualStyle` (`bullet_tracer`, `open_arms_wave`, `sonic_dance_wave`, `swagger_ground_wave`).
4. **`src/game3d/vfx/VFXManager3D.ts`**:
   - `spawnSuperShotChargeVFX()`: Spawns character-specific charge effects at `ON_CHARGE_START`.
   - `spawnSuperShotReleaseVFX()`: Spawns muzzle flash / energy wave effects at `ON_PROJECTILE_RELEASE`.
   - `createProjectileMesh()`: Builds the 3D projectile mesh for each `visualStyle`.

---

## Section 9 — How to Modify Audio

Filmi Dangal's audio pipeline is controlled by **`src/config/audioAssets.ts`**, **`src/engine/AudioManager.ts`**, and **`src/game3d/audio/AudioManager3D.ts`**.

### Per-Character Audio Events (`ALL_CHARACTER_AUDIO_EVENTS`)
Every fighter has 9 distinct audio events in `CHARACTER_AUDIO_MANIFEST`:
`supershot-charge`, `supershot-release`, `supershot-impact`, `supermove-charge`, `supermove-impact`, `normal-attack`, `hit-react`, `victory`, `defeat`.

### How Fallback Synthesis vs. Studio Audio Files Work
1. In `src/config/audioAssets.ts`, each event entry has:
   - `filePath`: `/assets/audio/characters/<slug>/<event>.ogg`
   - `mp3FallbackPath`: `/assets/audio/characters/<slug>/<event>.mp3`
   - `isTemporaryPlaceholder: boolean`
   - `fallbackSynth: ProceduralAudioSynthProfile` (multi-layered Web Audio API oscillator/envelope synthesis unique to each fighter).
2. While `isTemporaryPlaceholder: true`, `AudioManager.playCharacterEvent()` synthesizes the sound in real time using `fallbackSynth` without making network requests for missing `.ogg`/`.mp3` files.
3. **To replace a synthesized sound with a real studio audio file**:
   - Place the `.ogg` (and optional `.mp3` fallback) file at `public/assets/audio/characters/<slug>/<event>.ogg`.
   - In `src/config/audioAssets.ts`, set `isTemporaryPlaceholder: false` on that event's config.
   - `AudioManager` will automatically fetch, decode, and cache the audio buffer, falling back to `fallbackSynth` only if decoding fails.

---

## Section 10 — How to Modify Arenas & Lighting

Arenas are defined in **`src/data/arenas.ts`** and constructed in 3D by **`src/game3d/arenas/ArenaBuilder3D.ts`**.

### Current Arenas
1. **`award_night` ("Award Night — National Cinema Awards Stage")**:
   Crimson velvet carpet, golden stage archways, rotating 3D golden film trophy statues, and sweeping volumetric spotlight cones.
2. **`film_city` ("Film City — Studio Floor 7, Mumbai")**:
   Dolly track rails, overhead steel lighting trusses, studio spotlights, and an animated 3D articulated camera crane rig that pans across the stage.

### How to Modify Stage Bounds or Visuals
- **Stage Boundaries**: Edit `ARENAS[arenaId].bounds3D` (`minX: -7.5`, `maxX: 7.5`, `floorY: 0`) in `src/data/arenas.ts`.
- **Stage Lighting & Props**: Edit `ArenaBuilder3D.buildArena()`, `buildAwardNightProps()`, or `buildFilmCityProps()` in `src/game3d/arenas/ArenaBuilder3D.ts`.
- **Adding a New Arena**:
  1. Add the new ID to `ArenaId` in `src/types/fighter.ts`.
  2. Add its `ArenaDef` entry to `ARENAS` in `src/data/arenas.ts`.
  3. Add its 3D prop builder branch in `ArenaBuilder3D.buildArena()` (`src/game3d/arenas/ArenaBuilder3D.ts`).

---

## Section 11 — How to Modify UI Screens

All UI screens live in `src/components/` and use Tailwind CSS utility classes matching the Filmi Dangal Bollywood Art-Deco palette (`#10111B` deep midnight background, `#D6A447` brass gold borders, `#FEF08A` marquee yellow highlights, `#BE123C` velvet crimson accents, `#0284C7` spotlight cyan).

- **Screen Routing**: Controlled in `src/App.tsx` via `bridge.subscribeScreen()`.
- **Character Selection (`src/components/CharacterSelect.tsx`)**:
  - Uses `applyFighterSelection({ p1Id, p2Id, selectingFor }, chosenId)` from `src/game3d/characters/CharacterRoster3D.ts`.
  - Always keep `bridge.p1CharacterId` and `bridge.p2CharacterId` synchronized with React state (`p1Id`, `p2Id`).
  - Passes `selectedChar.id` to `<CharacterPreview3D characterId={selectedChar.id} />`.
- **In-Fight HUD (`src/components/FightHUD.tsx`)**:
  - Receives `hudState: GameHUDState` pushed by `BabylonFightEngine.pushHUDUpdate()`.
  - Keep HUD elements `pointer-events-none` except for interactive buttons (`Pause`, `Mute`, Training Dummy controls) which use `pointer-events-auto`.

---

## Section 12 — How to Add a Brand-New Fighter

To add a 5th fighter (e.g., `'disco_dancer'`) without breaking any system or test, update these exact files in order:

1. **`src/types/fighter.ts`**:
   Add `'disco_dancer'` to the `FighterId` union type.
2. **`src/data/characters.ts`**:
   Add `disco_dancer: CharacterDef` to `CHARACTERS` with complete `stats`, `visuals`, `superShotInfo`, `superMoveInfo`, and `moves`.
3. **`src/config/characterAssets.ts`**:
   - Add `'disco_dancer'` to `ALL_FIGHTER_IDS` and `isValidFighterId()`.
   - Add `disco_dancer: CharacterAssetConfig` to `CHARACTER_ASSET_MANIFEST` with unique `modelPath` (`/assets/characters/disco-dancer/model.glb`), `animations`, `specialAttackEvents`, `vfx`, and `audio` paths.
4. **`src/config/audioAssets.ts`**:
   Add `disco_dancer` to `CHARACTER_AUDIO_MANIFEST` with all 9 `ALL_CHARACTER_AUDIO_EVENTS` entries and unique `fallbackSynth.signatureId` values.
5. **`src/game3d/characters/CharacterRoster3D.ts`**:
   Add the `case 'disco_dancer':` monogram in `getCharacterMonogram()`.
6. **`src/game3d/combat/SuperShotProjectileSystem.ts` & `src/game3d/combat/CharacterSpecialMoveController.ts`**:
   Add the projectile profile and SuperMove phase profile for `'disco_dancer'`.
7. **`src/game3d/animation/CharacterAnimationController.ts` & `src/game3d/vfx/VFXManager3D.ts`**:
   Add `'disco_dancer'` SuperShot/SuperMove procedural pose choreography and VFX bursts.
8. **`public/assets/characters/disco-dancer/model.glb` & `manifest.json`**:
   Place the `.glb` and `manifest.json` files in `public/assets/characters/disco-dancer/` (or add `'disco_dancer'` to `scripts/build-glb-assets.ts` and run `npm run build:glb`).
9. **`src/engine/tests/combat.test.ts`**:
   Update roster count assertions (`CHARACTER_LIST.length`) and run `npm test`.

---

## Section 13 — Testing & Verification Guide

Run these commands from the repository root before committing any changes:

### 1. Unit & 3D Headless Integration Tests (`npm test`)
```bash
npm test
```
Executes `npx --yes tsx --test src/engine/tests/combat.test.ts` (25 test suites) verifying:
- Binary `.glb` header, chunk, skinning, bone, and animation validation for all 4 fighters.
- Authoritative `FighterId -> CharacterDef -> CharacterAssetConfig -> modelPath` mapping and `manifest.json` accuracy.
- Player 1 and Player 2 selection state transitions and automatic duplicate replacement rules across all 12 ordered pairings.
- Headless Babylon.js `NullEngine` 3D rig loading (`loadCharacterRig3D`), verifying `action_sultan` loads as `PRODUCTION_SKINNED` (52 Mixamo bones, calibrated scale `1.94`, groundOffset `0.969`) and `romance_raja`, `duggu`, `bhidu` load as `TEMPORARY_PLACEHOLDER` procedural rigs.
- Protection against prematurely setting `isTemporaryPlaceholder: false` on a box-primitive placeholder GLB.
- Non-Sultan fallback protection (`buildFallbackCharacterRig3D`), ensuring a failed load for any character preserves that character's `characterId` and `LOAD_FAILED` diagnostics without ever substituting `action_sultan`.
- Rapid async 3D preview switching (`action_sultan -> duggu -> bhidu -> romance_raja`) with load-token cancellation and zero mesh/material leaks across 12 consecutive switches.
- All 6 distinct gameplay matchups, rematch, character reselection, 3-stage Arcade ladder progression, and Training mode dummy behaviors.

### 2. TypeScript Typecheck (`npm run lint`)
```bash
npm run lint
```
Runs `tsc --noEmit` across the entire codebase to verify zero type or import errors.

### 3. Production Bundle Build (`npm run build`)
```bash
npm run build
```
Runs `vite build` to verify all TypeScript modules, Babylon.js loaders, and Tailwind CSS bundle cleanly into `dist/`.

---

## Section 14 — Common Pitfalls & Do-Not-Break Rules

1. **NEVER silently substitute `action_sultan` when another fighter fails to load**:
   If `loadCharacterRig3D()` fails for `romance_raja`, `duggu`, or `bhidu`, always fall back to **that specific fighter's** procedural rig (`buildFallbackCharacterRig3D(scene, def, ...)`) so `rig.characterId === def.id` and `rig.renderState === 'LOAD_FAILED'`.
2. **NEVER assume replacing `model.glb` alone activates a production model**:
   Characters with `isTemporaryPlaceholder: true` in `src/config/characterAssets.ts` intentionally dispose imported placeholder meshes and build Path A (`TEMPORARY_PLACEHOLDER`). You must both supply a valid skinned `.glb` AND set `isTemporaryPlaceholder: false`.
3. **NEVER flip `isTemporaryPlaceholder: false` while the `.glb` on disk is still a box-primitive placeholder**:
   The placeholder `.glb` files for `romance-raja`, `duggu`, and `bhidu` contain only 5 unskinned 24-vertex boxes. Only set `isTemporaryPlaceholder: false` after placing a genuine production `.glb` in the character's folder.
4. **NEVER claim embedded combat animations exist in `action-sultan/manifest.json` unless they are actually embedded in `action-sultan/model.glb`**:
   `action-sultan/model.glb` currently contains only 1 static bind-pose clip (`mixamo_com`), which is stopped and excluded at import time. All 15 combat and special states for Action Sultan run via quaternion-safe procedural bone animation on his 52-bone Mixamo skeleton.
5. **NEVER apply `manifest.scale` or `manifest.groundOffset` more than once**:
   `scale` and `groundOffset` are applied **exclusively** on `modelTransformNode`. Never multiply `scale` onto `rootNode`, `facingNode`, or individual bones.
6. **NEVER mix Euler `.rotation` writes with `.rotationQuaternion` on imported glTF/Mixamo bones**:
   Babylon.js glTF/GLB importers set `rotationQuaternion` on every imported `TransformNode`. When `rotationQuaternion` is non-null, Babylon ignores `.rotation`. Always use quaternion math (as implemented in `CharacterAnimationController.applyJointRotation`) when animating imported GLB bones.
7. **ALWAYS guard async 3D loads with a monotonically increasing load token**:
   Both `CharacterPreviewScene.loadCharacterAsset()` (`++this.loadToken`) and `BabylonFightEngine.loadFighterRigs()` (`++this.rigLoadToken`) must check `token !== this.loadToken` after `await loadCharacterRig3D(...)` and immediately `dispose()` any superseded rig so older async loads can never overwrite a newer selection or leak GPU resources.
