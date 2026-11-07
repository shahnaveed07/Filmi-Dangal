import { ArenaId, CombatHitEvent, Difficulty, FighterId, GameMode } from '../types/fighter';
import { InputManager } from './InputManager';
import { MatchPhase, MatchStats } from './MatchManager';

export type GameScreen =
  | 'title'
  | 'character_select'
  | 'arena_select'
  | 'difficulty_select'
  | 'fighting'
  | 'results'
  | 'controls'
  | 'settings'
  | 'credits'
  | 'disclaimer';

export type MatchLifecycleCommand =
  | 'start_match'
  | 'restart_round'
  | 'reset_match'
  | 'rematch';

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
  debugHitboxes?: boolean;
}

export type StateListener = (state: GameHUDState) => void;
export type ScreenListener = (screen: GameScreen) => void;
export type PauseListener = (isPaused: boolean) => void;
export type HitEventListener = (event: CombatHitEvent) => void;
export type CommandListener = (cmd: MatchLifecycleCommand) => void;

export class GameBridge {
  private static instance: GameBridge;

  public screen: GameScreen = 'title';
  public gameMode: GameMode = 'arcade';
  public difficulty: Difficulty = 'normal';
  public p1CharacterId: FighterId = 'action_sultan';
  public p2CharacterId: FighterId = 'romance_raja';
  public arenaId: ArenaId = 'award_night';
  public isPaused: boolean = false;
  public debugHitboxes: boolean = false;

  public lastMatchStats: MatchStats | null = null;
  public matchWinner: 'p1' | 'p2' | null = null;
  public matchSessionId: number = 0;

  private stateListeners: Set<StateListener> = new Set();
  private screenListeners: Set<ScreenListener> = new Set();
  private pauseListeners: Set<PauseListener> = new Set();
  private hitListeners: Set<HitEventListener> = new Set();
  private commandListeners: Set<CommandListener> = new Set();

  public static getInstance(): GameBridge {
    if (!GameBridge.instance) {
      GameBridge.instance = new GameBridge();
    }
    return GameBridge.instance;
  }

  public setScreen(screen: GameScreen): void {
    this.screen = screen;
    if (screen !== 'fighting') {
      this.setPaused(false);
    }
    if (typeof document !== 'undefined') {
      document.body.dataset.state =
        screen === 'fighting'
          ? this.isPaused
            ? 'paused'
            : 'playing'
          : screen === 'results'
          ? 'gameover'
          : screen;
    }
    this.screenListeners.forEach((l) => l(screen));
  }

  public setPaused(paused: boolean): void {
    const nextPaused = this.screen === 'fighting' ? paused : false;
    if (this.isPaused === nextPaused) return;
    this.isPaused = nextPaused;

    // Safely release active touch/held inputs when entering pause
    if (this.isPaused) {
      InputManager.getInstance().clearAll();
    }

    if (typeof document !== 'undefined' && this.screen === 'fighting') {
      document.body.dataset.state = this.isPaused ? 'paused' : 'playing';
    }

    this.pauseListeners.forEach((l) => l(this.isPaused));
  }

  public togglePause(): boolean {
    if (this.screen !== 'fighting') return false;
    this.setPaused(!this.isPaused);
    return this.isPaused;
  }

  // --- EXPLICIT MATCH LIFECYCLE METHODS ---

  public startMatch(): void {
    this.matchSessionId++;
    this.lastMatchStats = null;
    this.matchWinner = null;
    this.isPaused = false;
    InputManager.getInstance().clearAll();
    this.setScreen('fighting');
    this.emitCommand('start_match');
  }

  public restartRound(): void {
    this.setPaused(false);
    InputManager.getInstance().clearAll();
    if (this.screen !== 'fighting') {
      this.setScreen('fighting');
    }
    this.emitCommand('restart_round');
  }

  public resetMatch(): void {
    this.matchSessionId++;
    this.lastMatchStats = null;
    this.matchWinner = null;
    this.setPaused(false);
    InputManager.getInstance().clearAll();
    if (this.screen !== 'fighting') {
      this.setScreen('fighting');
    }
    this.emitCommand('reset_match');
  }

  public rematch(): void {
    this.matchSessionId++;
    this.lastMatchStats = null;
    this.matchWinner = null;
    this.setPaused(false);
    InputManager.getInstance().clearAll();
    this.setScreen('fighting');
    this.emitCommand('rematch');
  }

  public returnToMenu(): void {
    this.setPaused(false);
    InputManager.getInstance().clearAll();
    this.setScreen('title');
  }

  // --- SUBSCRIPTIONS ---

  public subscribeScreen(listener: ScreenListener): () => void {
    this.screenListeners.add(listener);
    return () => this.screenListeners.delete(listener);
  }

  public subscribePause(listener: PauseListener): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  public notifyHUD(state: GameHUDState): void {
    this.stateListeners.forEach((l) => l(state));
  }

  public subscribeHUD(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public emitHit(event: CombatHitEvent): void {
    this.hitListeners.forEach((l) => l(event));
  }

  public subscribeHit(listener: HitEventListener): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  private emitCommand(cmd: MatchLifecycleCommand): void {
    this.commandListeners.forEach((l) => l(cmd));
  }

  public subscribeCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }
}
