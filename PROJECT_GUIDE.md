# Fight Fun — Developer & Architecture Guide (`PROJECT_GUIDE.md`)

**Official Game Title:** FIGHT FUN (`Fight Fun`)  
**Tagline:** Lights. Camera. Knockout!

This document is the authoritative developer reference for **Fight Fun**, a 3D cinematic Bollywood arcade fighting game built with React 19, TypeScript, Tailwind CSS, and Babylon.js 9 on a classic 2D fighting plane (`X` horizontal, `Y` vertical, `Z = 0` stage plane).

Use this guide to understand the runtime execution flow, locate the exact file responsible for any feature, replace 3D character models or animations, add new fighters or arenas, tune combat balance, and avoid regressions across interdependent systems.

---

## 1. Project Overview

### 1.1 High-Level Architecture
**Fight Fun** separates UI presentation, shared game state, deterministic 60Hz 2D combat simulation, and 3D Babylon.js rendering into four cleanly decoupled layers:

1. **React UI & Screen Router Layer (`src/App.tsx`, `src/components/*`)**:
   - Renders the title screen (`FIGHT FUN`), character selection screen, arena selection screen, in-match arcade HUD overlay, mobile virtual controls, pause menu, settings modal, controls modal, disclaimer modal, and post-match results screen.
   - Communicates with the game engine exclusively through the singleton `GameBridge` (`src/engine/GameBridge.ts`). Never mutates 3D scene meshes directly.
2. **State & Event Bridge (`src/engine/GameBridge.ts`)**:
   - Holds the authoritative match configuration: `screen`, `gameMode` (`arcade` | `vs_cpu` | `training`), `p1CharacterId`, `p2CharacterId`, `arenaId`, `arcadeStageIndex`, `trainingDummyBehavior`, and `lastMatchWinner`.
   - Publishes 60Hz HUD snapshots (`GameHUDState`) and match lifecycle commands (`startMatch`, `rematch`, `advanceArcadeTower`, `restartRound`, `returnToMenu`) via typed subscriptions.
3. **60Hz Deterministic Combat & Match Core (`src/game3d/combat/*`, `src/game3d/hitboxes/*`, `src/game3d/cpu/*`, `src/game3d/managers/*`)**:
   - Runs inside `BabylonFightEngine` on a fixed `1/60s` (`FIXED_DT`) accumulator loop.
   - All fighter movement, jump arcs, pushbox separation, attack frame windows (`startup`, `active`, `recovery`), hitstun/blockstun, combo scaling, SuperShot projectiles, and SuperMove impacts operate on the 2D `X/Y` plane (`Z = 0`).
4. **3D Babylon.js Scene, Asset Loader & Skeletal Animation Layer (`src/game3d/engine/*`, `src/game3d/assets/*`, `src/game3d/animation/*`, `src/game3d/arenas/*`, `src/game3d/cameras/*`, `src/game3d/vfx/*`)**:
   - Loads character rigs via `CharacterAssetLoader` (`src/game3d/assets/CharacterAssetLoader.ts`) and `AssetLoader3D` (`src/game3d/assets/AssetLoader3D.ts`).
   - Synchronizes 3D rig world coordinates (`rootNode.position.set(fighter.x, fighter.y, 0)`), facing yaw (`facingNode.rotation.y`), skeletal bone poses (`AnimationController3D`), 3D arenas (`ArenaBuilder3D`), dynamic framing camera (`DynamicFightCamera3D`), and 3D VFX (`VFXManager3D`).

### 1.2 Runtime Execution Flow (End-to-End Lifecycle)

```text
[1. TitleScreen.tsx] ("FIGHT FUN" — Visual-First Main Menu with Live 3D Hero Showcase)
   ├─> "PLAY": bridge.setScreen('game_mode')
   ├─> "FIGHTERS": bridge.characterSelectBrowseOnly = true; bridge.setScreen('character_select')
   └─> "SETTINGS": opens SettingsModal

[2. GameModeSelect.tsx]
   User clicks visual mode card ('arcade' | 'vs_cpu' | 'training')
   └─> bridge.gameMode = mode; bridge.setScreen('character_select')

[3. CharacterSelect.tsx & CharacterOverview.tsx]
   User clicks character card for P1 or P2 (or opens CharacterOverview for full-body 3D turntable & Attack/Defence/Speed bars)
   └─> applyFighterSelection(current, clickedId) (src/game3d/characters/CharacterRoster3D.ts)
       Updates p1Id / p2Id deterministically & writes bridge.p1CharacterId / bridge.p2CharacterId
   └─> CharacterPreview3D.tsx passes activeCharacterId to CharacterPreviewScene.loadCharacterAsset(characterId)
       ├─> Monotonic loadToken increments; immediately disposes previous preview rig
       └─> AssetLoader3D.loadCharacterRig3D(scene, def) -> CharacterAssetLoader.loadCharacterFromManifest(...)
           ├─> Validates GLB against CharacterAssetConfig (src/config/characterAssets.ts)
           ├─> If isTemporaryPlaceholder === true: disposes 24-vertex box proxy GLB and builds character-specific
           │   articulated 22-bone + 5-facial-bone procedural rig (renderState = 'TEMPORARY_PLACEHOLDER')
           └─> If isTemporaryPlaceholder === false: calibrates imported GLB scale/groundOffset, maps humanoid
               bones via boneAliases, registers dynamic AnimationGroups (excluding static 'mixamo_com' pose),
               and sets renderState = 'PRODUCTION_SKINNED'

[4. ArenaSelect.tsx & ArenaPreview3D.tsx]
   User previews real-time 3D stage ('award_night' | 'film_city') via ArenaPreview3D and clicks "FIGHT!"
   └─> bridge.arenaId = selectedArena; bridge.startMatch() (sets screen = 'fighting')

[5. GameCanvas.tsx -> BabylonFightEngine.ts]
   Mounts canvas and instantiates BabylonFightEngine(canvas)
   └─> initializeFullMatch():
       ├─> Creates Fighter3D(p1Def, -2.3, 1) and Fighter3D(p2Def, +2.3, -1)
       ├─> Builds 3D stage via ArenaBuilder3D.buildArena(scene, bridge.arenaId)
       └─> Calls loadFighterRigs():
           ├─> Increments rigLoadToken, immediately disposes stale p1Rig/p2Rig if characterId changed
           ├─> Loads P1 & P2 rigs in parallel via safeLoadRig(def, slotTag)
           │   (On error: builds that character's own procedural fallback rig via buildFallbackCharacterRig3D,
           │    NEVER substituting Action Sultan for another character)
           └─> Verifies rigLoadToken & p1Rig.characterId === p1.id / p2Rig.characterId === p2.id before attaching
   └─> 60Hz Fixed Timestep Loop:
       ├─> MatchManager3D steps round intro / active fight / round over / match over
       ├─> CPUController3D generates AI inputs for P2
       ├─> CombatSystem3D steps physics, pushboxes, HitboxSystem3D collisions, SuperShot projectiles, SuperMoves
       └─> sync3DSceneVisuals() updates P1/P2 rig positions & unified AnimationController3D poses (only when rig.characterId === fighter.id)

[6. ResultsModal.tsx]
   Match ends -> bridge.setScreen('results')
   ├─> "REMATCH": bridge.rematch() -> preserves p1CharacterId & p2CharacterId, reloads match
   ├─> "NEXT STAGE" (Arcade win): bridge.advanceArcadeStage() -> sets p2CharacterId to next distinct fighter
   └─> "FIGHTERS": bridge.setScreen('character_select') -> returns to CharacterSelect with current IDs intact
```

---

## 2. Installation and Development

### 2.1 Prerequisites
- **Node.js**: v22+ (recommended)
- **Bun**: v1.4+ (optional, used in CI alongside `bun.lock`)

### 2.2 Install Dependencies
```bash
npm install
# or with Bun:
bun install --frozen-lockfile
```

### 2.3 Available Scripts (`package.json`)
| Command | Script | Description |
| :--- | :--- | :--- |
| `npm run dev` | `vite --port=3000 --host=0.0.0.0` | Starts the local development server on `http://localhost:3000`. |
| `npm run build` | `vite build` | Compiles production client bundle into `dist/`. |
| `npm run preview` | `vite preview` | Serves the production build locally for verification. |
| `npm run lint` | `tsc --noEmit` | Runs full TypeScript type checking across the entire codebase. |
| `npm test` | `tsx --test src/engine/tests/combat.test.ts` | Executes the automated unit & integration test suite (26 tests covering combat, selection, 3D loading, animation choreography parity, arena switching, and branding). |
| `npx tsx scripts/build-glb-assets.ts` | Custom script | Regenerates the lightweight placeholder `.glb` proxy files and `manifest.json` files for temporary placeholder fighters. |

### 2.4 Fast Browser Testing Query Parameters
- `http://localhost:3000/?autostart=1` — Automatically skips the title screen and launches an Arcade match.
- `http://localhost:3000/?autostart=1&mode=training` — Automatically launches Training Mode.
- `http://localhost:3000/?autostart=1&mode=vs_cpu` — Automatically launches Versus CPU Mode.

---

## 3. Complete Folder Structure

```text
/
├── .github/workflows/
│   └── ci.yml                          # GitHub Actions CI pipeline (Fight Fun CI: install, lint, test, build)
├── index.html                          # HTML entry point, Google Fonts, Fight Fun title & OpenGraph metadata
├── metadata.json                       # Application metadata (Fight Fun — Lights. Camera. Knockout!)
├── package.json                        # Package manifest ("fight-fun"), scripts, and dependencies
├── bun.lock                            # Synchronized Bun lockfile for CI (--frozen-lockfile)
├── PROJECT_GUIDE.md                    # This comprehensive developer & architecture guide
├── scripts/
│   └── build-glb-assets.ts             # Utility script to generate placeholder GLB/manifest files
├── public/
│   └── assets/
│       ├── audio/characters/
│       │   └── README.md               # Audio drop-in guide for character SFX (.ogg/.mp3)
│       └── characters/
│           ├── README.md               # 3D character GLB drop-in guide
│           ├── action-sultan/
│           │   ├── manifest.json       # Accurate asset metadata for Action Sultan (isPlaceholder: false)
│           │   └── model.glb           # Production skinned Mixamo GLB model (14,918 vertices, 65 joints)
│           ├── romance-raja/
│           │   ├── manifest.json       # Asset metadata for Romance Raja (isPlaceholder: true)
│           │   └── model.glb           # Temporary 24-vertex box placeholder proxy GLB
│           ├── duggu/
│           │   ├── manifest.json       # Asset metadata for Duggu (isPlaceholder: true)
│           │   └── model.glb           # Temporary 24-vertex box placeholder proxy GLB
│           └── bhidu/
│               ├── manifest.json       # Asset metadata for Bhidu (isPlaceholder: true)
│               └── model.glb           # Temporary 24-vertex box placeholder proxy GLB
└── src/
    ├── main.tsx                        # React DOM root mount
    ├── App.tsx                         # Top-level screen router, HUD state subscriber, modal manager
    ├── index.css                       # Global Tailwind CSS import & custom arcade scrollbar/utilities
    ├── types/
    │   └── fighter.ts                  # Core TypeScript types: FighterId, ArenaId, GameMode, CharacterDef, etc.
    ├── config/
    │   ├── characterAssets.ts          # Authoritative 3D asset manifest (CHARACTER_ASSET_MANIFEST)
    │   └── audioAssets.ts              # Character-specific audio manifest (CHARACTER_AUDIO_MANIFEST)
    ├── data/
    │   ├── characters.ts               # Fighter gameplay stats, palettes, movesets, and arcade ladder
    │   └── arenas.ts                   # Arena definitions ('award_night', 'film_city')
    ├── components/
    │   ├── ui/
    │   │   └── FightFunUI.tsx          # Reusable UI design system (PrimaryButton, SecondaryButton, ScreenHeader, CharacterPortrait, CharacterCard, CharacterRoster, CharacterStats, ArenaCard, Modal, LoadingIndicator)
    │   ├── TitleScreen.tsx             # Visual-first Main Menu ("FIGHT FUN", 3D hero showcase, Play/Fighters/Settings)
    │   ├── GameModeSelect.tsx          # Dedicated Game Mode selection screen (Arcade, Versus CPU, Training)
    │   ├── CharacterSelect.tsx         # P1/P2 fighter selection UI, roster grid, 3D preview host
    │   ├── CharacterOverview.tsx       # Dedicated full-body 3D character overview, rotation controls, Attack/Defence/Speed stat bars
    │   ├── ArenaSelect.tsx             # Stage selection screen with live 3D ArenaPreview3D viewport
    │   ├── GameCanvas.tsx              # Babylon.js WebGL canvas host & engine lifecycle wrapper
    │   ├── FightHUD.tsx                # Clean health bars, super meters, timer, combo counters, training controls
    │   ├── MobileControls.tsx          # Virtual D-pad and action buttons for touch devices
    │   ├── PauseModal.tsx              # Simplified in-match pause overlay
    │   ├── ResultsModal.tsx            # Winner showcase, rematch, arcade progression, and main menu actions
    │   ├── ControlsModal.tsx           # Keybinding reference & character move list modal
    │   ├── SettingsModal.tsx           # Audio, Gameplay, Display, and Controls settings modal
    │   └── DisclaimerModal.tsx         # Parody & legal disclaimer modal ("FIGHT FUN")
    ├── engine/
    │   ├── GameBridge.ts               # Singleton pub/sub bridge between React UI and 3D engine
    │   ├── AudioManager.ts             # Hybrid file + procedural Web Audio synthesizer & BGM engine
    │   ├── SettingsManager.ts          # Persistent localStorage settings (audio, difficulty, keybindings)
    │   ├── Fighter.ts                  # Legacy 2D fighter state class (used by pure 2D unit tests)
    │   ├── CombatSystem.ts             # Legacy 2D combat resolver
    │   ├── ComboSystem.ts              # Hit combo counter and damage scaling calculator
    │   ├── HitboxSystem.ts             # 2D AABB collision helper
    │   ├── InputManager.ts             # Keyboard & touch input buffer
    │   ├── MatchManager.ts             # Legacy 2D round state machine
    │   ├── CPUController.ts            # Legacy 2D AI controller
    │   └── tests/
    │       └── combat.test.ts          # Comprehensive automated test suite (27 tests)
    └── game3d/
        ├── engine/
        │   └── BabylonFightEngine.ts   # Main 3D match engine, 60Hz loop, rig loader, scene coordinator
        ├── characters/
        │   └── CharacterRoster3D.ts    # Authoritative FighterId mapping & P1/P2 selection state reducer
        ├── assets/
        │   ├── CharacterAssetLoader.ts # GLB loader, skeleton/skinning validator, procedural rig builder
        │   ├── CharacterAssetValidator.ts # Startup asset manifest integrity validator
        │   └── AssetLoader3D.ts        # High-level rig loader & non-Sultan fallback generator
        ├── animation/
        │   ├── AnimationController3D.ts # Unified 3D animation state machine (GLB clips -> Procedural bones + Facial + Multi-phase SuperMove -> Visual-only)
        │   ├── CharacterAnimationController.ts # Preview animation controller delegating pose calculation to AnimationController3D
        │   └── FighterAnimationEvents.ts # Frame-accurate animation event dispatcher & stateless frame snapshot helper
        ├── combat/
        │   ├── Fighter3D.ts            # 3D-bound fighter physics, state machine, pushbox & hurtbox
        │   ├── CombatSystem3D.ts       # Authoritative combat hit/block/grab/super resolver
        │   ├── CharacterSpecialMoveController.ts # Character-specific SuperShot & SuperMove frame handlers
        │   ├── SuperShotProjectileSystem.ts # 3D projectile manager for SuperShots
        │   └── Projectile3D.ts         # Individual 3D projectile entity
        ├── hitboxes/
        │   └── HitboxSystem3D.ts       # 2D/3D hitbox-vs-hurtbox intersection & socket world projection
        ├── cpu/
        │   └── CPUController3D.ts      # Difficulty-scaled CPU AI controller (Easy / Medium / Hard)
        ├── managers/
        │   └── MatchManager3D.ts       # Best-of-3 round timer, intro/KO phases, win tracking
        ├── arenas/
        │   └── ArenaBuilder3D.ts       # Multi-layered 3D stage builder & material disposer (Award Night & Film City)
        ├── cameras/
        │   └── DynamicFightCamera3D.ts # Side-view framing camera with zoom, shake, and Super zoom-ins
        ├── scenes/
        │   ├── ArenaPreview3D.tsx      # Real-time 3D Babylon.js arena preview viewport for ArenaSelect
        │   ├── CharacterPreview3D.tsx  # React wrapper for the Character Select / Overview / Hero 3D viewport
        │   └── CharacterPreviewScene.ts # Dedicated Babylon.js 3D preview scene with monotonic async guard & interactive rotation
        ├── audio/
        │   └── AudioManager3D.ts       # 3D combat audio event adapter
        └── vfx/
            └── VFXManager3D.ts         # 3D hit sparks, block shields, ground shockwaves, hitbox debug wireframes
```

---

## 4. Character Management

### 4.1 Current Fighter Roster & Asset Status
The game features four distinct fighters defined in `src/types/fighter.ts`, `src/data/characters.ts`, and `src/config/characterAssets.ts`:

| Fighter ID (`FighterId`) | Display Name | Archetype | Folder (`public/assets/characters/`) | Current 3D Asset Status | Render State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `'action_sultan'` | **Action Sultan** | Power Brawler | `action-sultan/` | **Production Skinned GLB** (`model.glb`, 14,918 vertices, 65 Mixamo joints, 2 skinned meshes). Contains 1 static bind pose group (`mixamo_com`), so dynamic combat states use procedural bone animation (`canUseProceduralBoneFallback: true`). | `'PRODUCTION_SKINNED'` |
| `'romance_raja'` | **Romance Raja** | Counter & Mind-Games | `romance-raja/` | **Temporary Placeholder** (`isTemporaryPlaceholder: true`). Disk `model.glb` is a 24-vertex 3-LOD box proxy; runtime loader builds Romance Raja's bespoke 22-bone + 5-facial-bone procedural rig (crimson blazer, open-arms pose). | `'TEMPORARY_PLACEHOLDER'` |
| `'duggu'` | **Duggu** | Rushdown Acrobat | `duggu/` | **Temporary Placeholder** (`isTemporaryPlaceholder: true`). Disk `model.glb` is a 24-vertex 3-LOD box proxy; runtime loader builds Duggu's bespoke 22-bone + 5-facial-bone procedural rig (emerald jacket, visor, lean dancer build). | `'TEMPORARY_PLACEHOLDER'` |
| `'bhidu'` | **Bhidu** | Heavy Grappler | `bhidu/` | **Temporary Placeholder** (`isTemporaryPlaceholder: true`). Disk `model.glb` is a 24-vertex 3-LOD box proxy; runtime loader builds Bhidu's bespoke 22-bone + 5-facial-bone procedural rig (charcoal biker vest, gold bandana & chain). | `'TEMPORARY_PLACEHOLDER'` |

### 4.2 Authoritative Character Identity Mapping
`src/game3d/characters/CharacterRoster3D.ts` enforces a single, strict chain of identity for every fighter via `resolveAuthoritativeCharacterMapping(id)`:
```text
FighterId -> CharacterDef (src/data/characters.ts)
          -> CharacterAssetConfig (src/config/characterAssets.ts)
          -> modelPath (/assets/characters/<slug>/model.glb)
          -> CharacterRig3D (rig.characterId === FighterId)
```
- **Never** hardcode `'action_sultan'` as a fallback when another character fails to load. `AssetLoader3D.buildFallbackCharacterRig3D(scene, characterDef)` guarantees that even if a network or GLB parse error occurs, the fallback procedural rig preserves the selected fighter's `characterId`, palette, proportions, and moveset (`renderState: 'LOAD_FAILED'`).

### 4.3 Step-by-Step: How to Add a New Playable Character
To add a 5th fighter (e.g., `'disco_king'`), update these files in order:
1. **`src/types/fighter.ts`**:
   - Add `'disco_king'` to the `FighterId` union type:
     ```ts
     export type FighterId = 'action_sultan' | 'romance_raja' | 'duggu' | 'bhidu' | 'disco_king';
     ```
2. **`src/config/characterAssets.ts`**:
   - Add `'disco_king'` to `ALL_FIGHTER_IDS`.
   - Add the `'disco_king'` entry to `CHARACTER_ASSET_MANIFEST` with `id: 'disco_king'`, `modelPath: '/assets/characters/disco-king/model.glb'`, `isTemporaryPlaceholder: true` (or `false` if supplying a production GLB), `scale`, `groundOffset`, `facingRotationY`, `boneMap`, `boneAliases`, and `animations`.
3. **`src/data/characters.ts`**:
   - Add the `CharacterDef` entry to `CHARACTERS.disco_king` (stats, palette, `bodyScale`, `moves` frame data for `punch`, `kick`, `crouch_kick`, `uppercut`, `grab`, `super_shot`, `super_move`).
   - Add `'disco_king'` to `ARCADE_LADDER` if it should appear in Arcade Mode progression.
4. **`src/config/audioAssets.ts`**:
   - Add `'disco_king'` to `CHARACTER_AUDIO_MANIFEST` pointing to `/assets/audio/characters/disco-king/*.ogg` with `isTemporaryPlaceholder: true`.
5. **`src/game3d/animation/FighterAnimationEvents.ts` & `src/game3d/animation/AnimationController3D.ts`**:
   - Add frame timing specs in `CHARACTER_MOVE_SPECS` (`FighterAnimationEvents.ts`) and custom `super_shot` / `super_move` procedural poses in `AnimationController3D.ts`.
6. **`public/assets/characters/disco-king/`**:
   - Create `manifest.json` and place `model.glb` in `public/assets/characters/disco-king/`.

---

## 5. 3D Model Replacement

### 5.1 Why `isTemporaryPlaceholder: false` Alone Does Not Make a Box GLB Production-Ready
The existing `.glb` files in `public/assets/characters/romance-raja/model.glb`, `duggu/model.glb`, and `bhidu/model.glb` are 24-vertex 3-LOD box proxy meshes (`LOD0_High`, `LOD1_Medium`, `LOD2_Low` with 0 skeletons and 0 skins) generated by `scripts/build-glb-assets.ts`.
- `CharacterAssetLoader.ts` detects these 24-vertex box proxies (`isGeneratedBoxPlaceholderProxy`).
- Even if a developer prematurely flips `isTemporaryPlaceholder: false` in `src/config/characterAssets.ts` without replacing the `.glb` file on disk, `CharacterAssetLoader` refuses to render the raw grey box as `VISUAL_ONLY`, logs a clear diagnostic warning, and keeps the character's articulated procedural rig (`TEMPORARY_PLACEHOLDER`).

### 5.2 Step-by-Step: Replacing a Placeholder Fighter with a Real Production GLB
1. **Export the GLB from Blender / Mixamo**:
   - Format: glTF 2.0 Binary (`.glb`).
   - Up Axis: `+Y` Up.
   - Forward Axis: `+Z` Forward (the engine's `facingRotationY` rotates `+Z` to `+X` when facing right and `-X` when facing left).
   - Origin: Character's feet centered at `(0, 0, 0)`.
   - Skeleton: Standard Mixamo (`mixamorig:Hips`, `mixamorig:Spine`, `mixamorig:Head`, `mixamorig:RightHand`, etc.) or humanoid rig.
2. **Copy the `.glb` File**:
   - Overwrite `public/assets/characters/<character-slug>/model.glb` (e.g., `public/assets/characters/romance-raja/model.glb`).
3. **Update `src/config/characterAssets.ts`**:
   - Locate `CHARACTER_ASSET_MANIFEST['romance_raja']`.
   - Set `isTemporaryPlaceholder: false`.
   - Set `scale` (target world height in meters, e.g., `1.88`) and `groundOffset` (`0.0`).
   - Verify `boneAliases` includes any custom bone names in your rig if it does not use standard `mixamorig:` names.
4. **Update `public/assets/characters/<character-slug>/manifest.json`**:
   - Set `"isPlaceholder": false` and `"isTemporaryPlaceholder": false`.
5. **Verify in Character Select & Gameplay**:
   - Run `npm test` and open Character Select to confirm the preview container attribute `data-render-state` is `'PRODUCTION_SKINNED'`.

---

## 6. Animation Management

### 6.1 Three-Tier Animation Priority System
Both Gameplay (`AnimationController3D` in `src/game3d/animation/AnimationController3D.ts`) and Character Preview (`CharacterAnimationController` in `src/game3d/animation/CharacterAnimationController.ts`) share a single unified pose pipeline and enforce the exact same 3-tier priority order:

1. **Priority 1 — Imported GLB `AnimationGroup`s**:
   - When a production GLB contains multi-frame dynamic `AnimationGroup`s matching standard clip IDs (`Idle`, `Walk`, `Run`, `Jump`, `Crouch`, `Block`, `Punch`, `Kick`, `SuperShot`, `SuperMove`, `HitReact`, `Knockdown`, `GetUp`, `Victory`, `Defeat`), `GLBAnimationController` plays and crossfades the embedded clip.
   - **Important (`mixamo_com` Exclusion)**: Mixamo exports often include a single-pose static bind clip named `mixamo_com` or `TPose`. `CharacterAssetLoader.ts` (`STATIC_POSE_CLIP_PATTERNS`) automatically filters out `mixamo_com` so it never overrides procedural combat animations and freezes the character in a T-pose.
2. **Priority 2 — Procedural Skeletal Bone Animation (`applyProceduralPoseToRigBones`)**:
   - Whenever an imported GLB lacks an embedded clip for the active state (for example, `action_sultan/model.glb` has 65 Mixamo bones and 0 dynamic clips), OR when a character is using its 22-bone procedural rig, `AnimationController3D.computeTargetPose()` computes procedural bone transforms for all 22 humanoid bones, all 5 facial expression bones (`Jaw`, `LeftBrow`, `RightBrow`, `LeftEyelid`, `RightEyelid`), and the 3-phase `SuperMove` choreography (`CHARGE_POSE` -> `BURST_ENGAGE` -> `CLIMAX_IMPACT` -> `RECOVERY_POSE`).
   - For imported glTF/Mixamo rigs (`node.metadata.isImportedBone === true`), `applyProceduralPoseToRigBones` converts character-space Euler targets into the bone's local Quaternion space relative to its bind pose (`standLocalQuat` / `standRootQuat`).
3. **Priority 3 — Visual-Only Root Presentation (`updateVisualOnlyPresentation`)**:
   - Used only if an imported static mesh has zero compatible humanoid bones. Applies subtle breathing, step bobbing, and attack lunges to `modelTransformNode` while keeping `rootNode.position` strictly controlled by 2D gameplay physics.

### 6.2 Frame-Accurate Combat Events (`FighterAnimationEvents.ts`)
- `FighterAnimationEvents.computeFrameSnapshot(characterId, state, stateFrame)` is a pure stateless helper used by `AnimationController3D.computeTargetPose()` to read the current animation phase, `superMovePhase`, and `facialExpression` without firing duplicate events.
- `FighterAnimationEvents.evaluateFrame(characterId, state, stateFrame)` is called once per frame per fighter by `Fighter3D.stepPhysics()` (in gameplay) and `CharacterAnimationController.updateRigPose()` (in preview) to dispatch edge-triggered events (`ON_CHARGE_START`, `ON_PROJECTILE_SPAWN`, `ON_PROJECTILE_RELEASE`, `ON_SPECIAL_IMPACT`, `ON_SUPERMOVE_CLIMAX`).

---

## 7. Arena Management

### 7.1 Existing 3D Arenas
Defined in `src/data/arenas.ts` and constructed in 3D by `src/game3d/arenas/ArenaBuilder3D.ts`:
- **`'award_night'` (Filmfare Grand Stage)**: Multi-layered stage floor (`Y = 0`) with sub-stage apron, crimson red carpet with gold trim & center star medallion, foreground footlight housings, grand upstage steps, brass perimeter stanchions with velvet ropes, 3 monumental golden stage archways, LED backdrop wall with gold louver columns, dual multi-part 3D Golden Trophy statues on tiered pedestals with rotating film-reel halos, tiered VIP audience seating risers with guest silhouettes on left/right wings, overhead concert lighting gantry, sweeping volumetric spotlight cones, and 4-light key/fill/rim/accent setup.
- **`'film_city'` (Film City Backlot)**: Industrial soundstage deck (`Y = 0`) with yellow safety hazard boundary stripes, steel dolly track rails & cross-ties, neo-classical palace movie set facades on left/right wings (columns, walls, cornices), soundstage acoustic back wall, overhead steel box-truss catwalk & studio spotlights, tripod studio fresnel floodlight stands on stage wings, an articulated multi-part 3D camera crane rig (rolling dolly cart, turret column, counterweight, jib arm, 3D cinema camera & lens hood) that pans smoothly across the fight, and contrasting cool/warm studio lighting.

### 7.2 Arena Lifecycle & Memory Disposal
- Both gameplay (`BabylonFightEngine`) and the Arena Select 3D preview (`ArenaPreview3D.tsx`) use `ArenaBuilder3D.buildArena(...)`.
- `ArenaBuilder3D.dispose()` disposes the `ShadowGenerator`, all stage lights (`hemiLight`, `keyLight`, `rimLight`, `accentLight`), all tracked and child `PBRMaterial` instances, and `rootNode` so switching arenas never leaks GPU resources.

### 7.3 How to Add or Modify an Arena
1. Add the new arena ID to `ArenaId` in `src/types/fighter.ts`.
2. Add the metadata entry to `ARENAS` in `src/data/arenas.ts`.
3. Add a builder method in `src/game3d/arenas/ArenaBuilder3D.ts` using `registerMat(...)` and parent all stage meshes to `rootNode` so `dispose()` automatically cleans up all meshes and materials.

---

## 8. Combat Management

### 8.1 2D Gameplay Plane & Stage Boundaries
- **Coordinate System**: Fighters move along `X` (horizontal stage axis, bounded to `[-7.5, +7.5]`) and `Y` (vertical jump axis, `Y >= 0`). `Z` is locked to `0`.
- **Spawn Positions**: Player 1 spawns at `X = -2.3` facing right (`+1`); Player 2 spawns at `X = +2.3` facing left (`-1`).

### 8.2 Moves, Hitboxes, Combos & Meter
- **Move Frame Data (`src/data/characters.ts`)**: Each fighter defines `startup`, `active`, `recovery`, `damage`, `hitstun`, `blockstun`, `knockbackX`, `knockbackY`, `isLow`, `isOverhead`, `causesKnockdown`, and `meterCost` for `punch`, `kick`, `crouch_kick`, `uppercut`, `grab`, `super_shot`, and `super_move`.
- **Hitbox & Hurtbox System (`src/game3d/hitboxes/HitboxSystem3D.ts`)**: Projects active attack hitboxes from 3D bone sockets (`RightHand`, `RightFoot`, `Chest`) onto the 2D `X/Y` combat plane with deterministic fallback coordinates.
- **Meter & Specials (`src/game3d/combat/CombatSystem3D.ts`)**:
  - **SuperShot (`U` / `25%` meter)**: Fires a character-specific 3D projectile (`Action Sultan` Blackbuck Gunshot, `Romance Raja` Mohabbat Rose Wave, `Duggu` Cyber Hrithik Pulse, `Bhidu` Dada Shockwave).
  - **SuperMove (`L` / `100%` meter)**: Triggers cinematic camera zoom, arena blackout dimming (`setBlackoutIntensity`), and multi-phase climax impact.

---

## 9. Audio and VFX Management

### 9.1 Hybrid Audio System (`src/engine/AudioManager.ts` & `src/config/audioAssets.ts`)
- `AudioManager` attempts to load external `.ogg`/`.mp3` files configured in `CHARACTER_AUDIO_MANIFEST` (`src/config/audioAssets.ts`).
- When `isTemporaryPlaceholder: true` or an external audio file is not present on disk, `AudioManager` synthesizes character-specific Web Audio API sound effects (punches, kicks, blocks, KO bells, and signature SuperShot/SuperMove cues) plus procedural arcade background music so gameplay never fails or goes silent.

### 9.2 3D Visual Effects & Hitbox Debugger (`src/game3d/vfx/VFXManager3D.ts`)
- Renders 3D hit sparks, block shields, Super activation rings, and ground shockwaves.
- Pressing **`H`** during a match toggles real-time 3D wireframe rendering of pushboxes (green), hurtboxes (yellow), and active attack hitboxes (red).

---

## 10. UI Management

| Component File | Responsibility |
| :--- | :--- |
| `src/App.tsx` | Top-level screen state router (`title` -> `game_mode` -> `character_select` -> `character_overview` -> `arena_select` -> `fighting` -> `results`), global settings modal, and mobile portrait prompt. |
| `src/components/ui/FightFunUI.tsx` | Reusable UI design system (`PrimaryButton`, `SecondaryButton`, `ScreenHeader`, `SelectionIndicator`, `CharacterPortrait`, `CharacterCard`, `CharacterRoster`, `CharacterStats`, `ArenaCard`, `Modal`, `LoadingIndicator`). |
| `src/components/TitleScreen.tsx` | Minimal visual-first Main Menu with **FIGHT FUN** logo, live 3D character showcase, and `PLAY`, `FIGHTERS`, `SETTINGS` navigation. |
| `src/components/GameModeSelect.tsx` | Visual mode selection cards for `ARCADE`, `VERSUS CPU`, and `TRAINING`. |
| `src/components/CharacterSelect.tsx` | P1/P2 slot selector, 4-fighter `CharacterRoster` grid, large `CharacterPreview3D` viewport, `OVERVIEW` button, and `CONFIRM FIGHTERS` CTA. |
| `src/components/CharacterOverview.tsx` | Dedicated full-body 3D character inspection screen with interactive turntable rotation, fighting style, and `Attack`, `Defence`, `Speed` stat bars. |
| `src/components/ArenaSelect.tsx` | Real-time 3D stage preview (`ArenaPreview3D`) and visual `ArenaCard` selectors for `award_night` and `film_city`. |
| `src/components/FightHUD.tsx` | Unobtrusive in-match HUD with P1/P2 health bars, character names, round timer, and compact special/super availability indicators. |
| `src/components/PauseModal.tsx` | Simplified pause modal (`RESUME`, `RESTART MATCH`, `SETTINGS`, `MAIN MENU`, plus training dummy selector in Training mode). |
| `src/components/ResultsModal.tsx` | Winner announcement, 3D winning character showcase, `REMATCH` / `NEXT STAGE`, `FIGHTERS`, and `MAIN MENU` actions. |
| `src/components/SettingsModal.tsx` | Categorized `Audio`, `Gameplay`, `Display`, and `Controls` configuration modal. |

---

## 11. Common Maintenance Tasks

- **Change Game Branding or Metadata**:
  - Update `index.html`, `metadata.json`, `src/components/TitleScreen.tsx`, `src/components/DisclaimerModal.tsx`, and `src/App.tsx`.
- **Tune Fighter Health, Speed, or Attack Damage**:
  - Edit `CHARACTERS[<fighterId>].stats` or `CHARACTERS[<fighterId>].moves` in `src/data/characters.ts`.
- **Adjust 3D Model Scale, Ground Offset, or Facing Direction**:
  - Edit `scale`, `groundOffset`, or `facingRotationY` in `CHARACTER_ASSET_MANIFEST[<fighterId>]` (`src/config/characterAssets.ts`) and keep `public/assets/characters/<slug>/manifest.json` synchronized.
- **Change Default Keybindings**:
  - Edit `DEFAULT_KEY_BINDINGS` in `src/engine/SettingsManager.ts` (note: bump `SETTINGS_STORAGE_KEY` if changing schema).

---

## 12. Troubleshooting

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **Character freezes in T-pose when attacking** | Imported GLB contains a static single-frame clip (such as `mixamo_com`) that was treated as a playable animation. | Ensure `STATIC_POSE_CLIP_PATTERNS` in `src/game3d/assets/CharacterAssetLoader.ts` excludes the static clip name and `canUseProceduralBoneFallback` is `true`. |
| **Grey 3D box appears instead of character** | `isTemporaryPlaceholder: false` was set on a 24-vertex placeholder box GLB. | Keep `isTemporaryPlaceholder: true` in `src/config/characterAssets.ts` until a real rigged character `.glb` replaces `public/assets/characters/<slug>/model.glb`. |
| **Wrong character model appears after rapid clicking** | Stale async GLB promise resolved after a newer selection. | `CharacterPreviewScene.loadCharacterAsset()` and `BabylonFightEngine.loadFighterRigs()` use monotonic request tokens (`requestId` / `rigLoadToken`) and dispose stale rigs immediately. Never bypass these methods. |
| **Preview and Gameplay SuperMove animations differ** | Pose logic added only to `CharacterAnimationController.ts` instead of `AnimationController3D.ts`. | Always add procedural bone/facial/multi-phase poses in `AnimationController3D.computeTargetPose()`; `CharacterAnimationController` delegates directly to it. |
| **`bun install --frozen-lockfile` fails in CI** | `package.json` `name` or dependency versions diverged from `bun.lock`. | Keep `name` (`"fight-fun"`) and all dependency versions in `package.json` and `bun.lock` identical. |

---

## 13. Testing

Run the automated test suite before every commit:
```bash
npm test
# or directly via tsx:
npx --yes tsx --test src/engine/tests/combat.test.ts
```

### What `src/engine/tests/combat.test.ts` Verifies:
1. **Core 2D/3D Combat Mechanics**: Movement, jump gravity, pushbox separation, standing/crouching guard rules, throw tech, combo scaling, SuperShot projectile collisions, SuperMove climax impacts, and MatchManager best-of-3 round rules.
2. **Authoritative Character Mapping (`Phase 2`)**: Verifies all 4 fighters resolve consistent `FighterId -> CharacterDef -> CharacterAssetConfig -> modelPath -> manifest.json` mappings.
3. **Deterministic P1 & P2 Selection (`Phase 2`)**: Verifies selecting all 4 characters for P1 and P2, duplicate selection auto-swap, and state persistence across rematch and Arcade tower progression.
4. **3D Preview & Gameplay Asset Loading (`Phase 2 & 3`)**: Verifies `CharacterPreviewScene` and `BabylonFightEngine` load the exact selected character rig across all 6 unique matchups (and reverse P2/P1 slots), protect against premature `isTemporaryPlaceholder: false` on box proxies, preserve non-Sultan fighter identity on load failures, and leak zero meshes/materials during rapid switching.
5. **Preview vs. Gameplay Animation Parity & Arena Disposal (`Phase 3 & 4`)**: Verifies `CharacterAnimationController` and `AnimationController3D` produce identical multi-phase `SuperMove` and facial rig poses, and verifies switching arenas (`award_night` <-> `film_city`) disposes all previous stage meshes, lights, and materials.
6. **Fight Fun Branding Verification (`Phase 6`)**: Verifies `index.html`, `metadata.json`, `TitleScreen.tsx`, `DisclaimerModal.tsx`, `package.json`, and `PROJECT_GUIDE.md` use the **Fight Fun — Lights. Camera. Knockout!** branding.

---

## 14. Safe Development Rules

1. **Never Substitute Action Sultan for Another Character**: If a character asset fails to load, always use `AssetLoader3D.buildFallbackCharacterRig3D(scene, characterDef)` so the fallback rig retains the requested fighter's `characterId`, palette, and moveset.
2. **Always Guard Async 3D Loads with Monotonic Tokens**: Both `CharacterPreviewScene` (`requestId`) and `BabylonFightEngine` (`rigLoadToken`) cancel and dispose stale loads when a newer selection arrives.
3. **Keep `AnimationController3D.computeTargetPose` as the Single Pose Authority**: Never duplicate pose math between preview and gameplay controllers.
4. **Dispose Babylon.js Meshes, Skeletons, Materials, and Lights Explicitly**: When replacing a character rig or switching arenas, always call `rig.dispose()` / `arenaHandle.dispose()` before creating replacement nodes.
5. **Keep `package.json` and `bun.lock` Synchronized**: Any change to `package.json` `name` or dependencies must be reflected in `bun.lock` so `bun install --frozen-lockfile` succeeds in CI.
