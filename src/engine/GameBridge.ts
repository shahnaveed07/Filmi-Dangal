import {
  ArenaId,
  CombatHitEvent,
  Difficulty,
  FighterId,
  GameMode,
  ScreenName,
  TrainingDummyBehavior,
} from '../types/fighter';
import { MatchPhase, MatchStats } from './MatchManager';
import { CHARACTER_LIST } from '../data/characters';
import { SettingsManager } from './SettingsManager';

export type GameScreen = ScreenName;

export interface GameHUDState {
  p1Health: number;
  p1MaxHealth: number;
  p2Health: number;
  p2MaxHealth: number;
  p1Meter: number;
  p2Meter: number;
  p1Name: string;
  p2Name: string;
  p1Wins: number;
  p2Wins: number;
  roundTimer: number;
  currentRound: number;
  phase: MatchPhase;
  comboP1: number;
  comboP2: number;
  announcementText: string;
  isPaused: boolean;
  isMuted: boolean;
  debugHitboxes: boolean;
  p1SuperShotCooldown?: number;
  p2SuperShotCooldown?: number;
  p1SuperMoveName?: string;
  p1SuperShotName?: string;
  activeSpecialCallout?: string;
  gameMode?: GameMode;
  arcadeStageNumber?: number;
  arcadeTotalStages?: number;
  trainingDummyBehavior?: TrainingDummyBehavior;
}

export type CharacterSelectMode = 'match' | 'browse';

export type MatchLifecycleCommand =
  | 'start_match'
  | 'reset_match'
  | 'restart_match'
  | 'restart_round'
  | 'rematch'
  | 'reset_training';

type ScreenListener = (screen: ScreenName) => void;
type HUDListener = (state: GameHUDState) => void;
type HitListener = (event: CombatHitEvent) => void;
type PauseListener = (isPaused: boolean) => void;
type CommandListener = (command: MatchLifecycleCommand) => void;

export class GameBridge {
  private static instance: GameBridge;

  public gameMode: GameMode = 'arcade';
  public p1CharacterId: FighterId = 'action_sultan';
  public p2CharacterId: FighterId = 'romance_raja';
  public inspectedCharacterId: FighterId = 'action_sultan';
  public selectingPlayerSlot: 'p1' | 'p2' = 'p1';
  public characterSelectBrowseOnly: boolean = false;
  public arenaId: ArenaId = 'award_night';
  public difficulty: Difficulty = 'normal';
  public trainingDummyBehavior: TrainingDummyBehavior = 'stand';
  public screen: ScreenName = 'title';
  public isPaused: boolean = false;
  public debugHitboxes: boolean = false;

  // Arcade Mode multi-stage ladder state (3 sequential opponents)
  public arcadeLadder: FighterId[] = ['romance_raja', 'duggu', 'bhidu'];
  public arcadeStageIndex = 0;

  public lastMatchStats: MatchStats = {
    p1DamageDealt: 0,
    p2DamageDealt: 0,
    p1MaxCombo: 0,
    p2MaxCombo: 0,
    roundResults: [],
    totalFightTimeSeconds: 0,
  };
  public matchWinner: 'p1' | 'p2' | null = null;

  private screenListeners: Set<ScreenListener> = new Set();
  private hudListeners: Set<HUDListener> = new Set();
  private hitListeners: Set<HitListener> = new Set();
  private pauseListeners: Set<PauseListener> = new Set();
  private commandListeners: Set<CommandListener> = new Set();

  public static getInstance(): GameBridge {
    if (!GameBridge.instance) {
      GameBridge.instance = new GameBridge();
    }
    return GameBridge.instance;
  }

  private constructor() {
    const savedDiff = SettingsManager.getInstance().getSettings().cpuDifficulty;
    this.difficulty = savedDiff;
  }

  public getCharacterSelectMode(): CharacterSelectMode {
    return this.characterSelectBrowseOnly ? 'browse' : 'match';
  }

  /**
   * Opens the Fighters screen in browse-only mode (Main Menu -> Fighters).
   * Browsing fighters inspects 3D models and stats without mutating P1/P2 match selection
   * or starting a match.
   */
  public openFightersBrowse(initialInspectId?: FighterId): void {
    this.characterSelectBrowseOnly = true;
    this.inspectedCharacterId = initialInspectId || this.p1CharacterId;
    this.setScreen('character_select');
  }

  /**
   * Opens the Fighters screen in match-selection mode (Play -> Game Mode -> Character Select).
   */
  public openMatchCharacterSelect(mode?: GameMode): void {
    if (mode) {
      this.gameMode = mode;
    }
    this.characterSelectBrowseOnly = false;
    this.selectingPlayerSlot = 'p1';
    this.inspectedCharacterId = this.p1CharacterId;
    this.setScreen('character_select');
  }

  public setScreen(screen: ScreenName): void {
    const normalized: ScreenName = screen === 'fight' ? 'fighting' : screen;
    this.screen = normalized;
    if (normalized !== 'fighting') {
      this.isPaused = false;
    }
    this.screenListeners.forEach((l) => l(normalized));
  }

  /**
   * Initializes the 3-stage Arcade Mode progression ladder for Player 1.
   * Stage 1 starts with the selected initial opponent, followed by the remaining two fighters.
   */
  public initializeArcadeLadder(p1Id: FighterId = this.p1CharacterId): void {
    this.p1CharacterId = p1Id;
    const allRivals = CHARACTER_LIST.map((c) => c.id).filter((id) => id !== p1Id);
    const firstOpponent =
      this.p2CharacterId !== p1Id && allRivals.includes(this.p2CharacterId)
        ? this.p2CharacterId
        : allRivals[0];
    const remaining = allRivals.filter((id) => id !== firstOpponent);
    this.arcadeLadder = [firstOpponent, ...remaining];
    this.arcadeStageIndex = 0;
    this.applyArcadeStageConfig();
  }

  public applyArcadeStageConfig(): void {
    if (this.gameMode !== 'arcade') return;
    const clampedIdx = Math.max(
      0,
      Math.min(this.arcadeStageIndex, this.arcadeLadder.length - 1)
    );
    this.arcadeStageIndex = clampedIdx;
    this.p2CharacterId = this.arcadeLadder[clampedIdx] || 'romance_raja';

    // Progressive Arcade difficulty and arena rotation across the 3 ladder stages
    if (clampedIdx === 0) {
      this.difficulty = 'easy';
    } else if (clampedIdx === 1) {
      this.difficulty = 'normal';
      this.arenaId = this.arenaId === 'award_night' ? 'film_city' : 'award_night';
    } else {
      this.difficulty = 'hard';
      this.arenaId = 'award_night';
    }
  }

  public hasNextArcadeStage(): boolean {
    return (
      this.gameMode === 'arcade' &&
      this.arcadeStageIndex < this.arcadeLadder.length - 1
    );
  }

  public advanceArcadeStage(): boolean {
    if (!this.hasNextArcadeStage()) {
      return false;
    }
    this.arcadeStageIndex += 1;
    this.applyArcadeStageConfig();
    this.isPaused = false;
    this.matchWinner = null;
    this.setScreen('fighting');
    this.emitCommand('start_match');
    return true;
  }

  public startNewMatch(): void {
    this.isPaused = false;
    this.matchWinner = null;
    if (this.gameMode === 'arcade') {
      this.initializeArcadeLadder(this.p1CharacterId);
    }
    this.lastMatchStats = {
      p1DamageDealt: 0,
      p2DamageDealt: 0,
      p1MaxCombo: 0,
      p2MaxCombo: 0,
      roundResults: [],
      totalFightTimeSeconds: 0,
    };
    this.setScreen('fighting');
    this.emitCommand('start_match');
  }

  public startMatch(): void {
    this.startNewMatch();
  }

  public requestRematch(): void {
    this.isPaused = false;
    this.matchWinner = null;
    this.setScreen('fighting');
    this.emitCommand('rematch');
  }

  public rematch(): void {
    this.requestRematch();
  }

  /**
   * Restarts the entire current match from Round 1 (resetting round wins, stats,
   * health, meters, positions, and timers) while preserving selected fighters,
   * arena, game mode, difficulty, and current Arcade stage progression.
   */
  public requestRestartMatch(): void {
    this.isPaused = false;
    this.matchWinner = null;
    this.lastMatchStats = {
      p1DamageDealt: 0,
      p2DamageDealt: 0,
      p1MaxCombo: 0,
      p2MaxCombo: 0,
      roundResults: [],
      totalFightTimeSeconds: 0,
    };
    if (this.gameMode === 'arcade') {
      const clampedIdx = Math.max(
        0,
        Math.min(this.arcadeStageIndex, this.arcadeLadder.length - 1)
      );
      this.arcadeStageIndex = clampedIdx;
      this.p2CharacterId = this.arcadeLadder[clampedIdx] || this.p2CharacterId;
    }
    this.setScreen('fighting');
    this.emitCommand('restart_match');
  }

  public restartMatch(): void {
    this.requestRestartMatch();
  }

  public requestRestartRound(): void {
    this.isPaused = false;
    this.emitCommand('restart_round');
  }

  public restartRound(): void {
    this.requestRestartRound();
  }

  public resetTrainingState(): void {
    this.isPaused = false;
    this.emitCommand('reset_training');
  }

  public setTrainingDummyBehavior(behavior: TrainingDummyBehavior): void {
    this.trainingDummyBehavior = behavior;
  }

  public cycleTrainingDummyBehavior(): TrainingDummyBehavior {
    const order: TrainingDummyBehavior[] = ['stand', 'block', 'crouch', 'jump', 'cpu_spar'];
    const idx = order.indexOf(this.trainingDummyBehavior);
    this.trainingDummyBehavior = order[(idx + 1) % order.length];
    return this.trainingDummyBehavior;
  }

  public returnToMenu(): void {
    this.isPaused = false;
    this.setScreen('title');
  }

  public emitCommand(command: MatchLifecycleCommand): void {
    this.commandListeners.forEach((l) => l(command));
  }

  public subscribeCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  public subscribeScreen(listener: ScreenListener): () => void {
    this.screenListeners.add(listener);
    return () => this.screenListeners.delete(listener);
  }

  public notifyHUD(state: GameHUDState): void {
    this.hudListeners.forEach((l) => l(state));
  }

  public subscribeHUD(listener: HUDListener): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  public emitHit(event: CombatHitEvent): void {
    this.hitListeners.forEach((l) => l(event));
  }

  public subscribeHit(listener: HitListener): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  public setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.pauseListeners.forEach((l) => l(paused));
  }

  public togglePause(): boolean {
    this.setPaused(!this.isPaused);
    return this.isPaused;
  }

  public subscribePause(listener: PauseListener): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }
}
