import { ArenaId, CombatHitEvent, Difficulty, FighterId, GameMode } from '../types/fighter';
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
}

export type StateListener = (state: GameHUDState) => void;
export type ScreenListener = (screen: GameScreen) => void;
export type HitEventListener = (event: CombatHitEvent) => void;

export class GameBridge {
  private static instance: GameBridge;

  public screen: GameScreen = 'title';
  public gameMode: GameMode = 'arcade';
  public difficulty: Difficulty = 'normal';
  public p1CharacterId: FighterId = 'action_sultan';
  public p2CharacterId: FighterId = 'romance_raja';
  public arenaId: ArenaId = 'award_night';
  public lastMatchStats: MatchStats | null = null;
  public matchWinner: 'p1' | 'p2' | null = null;

  private stateListeners: Set<StateListener> = new Set();
  private screenListeners: Set<ScreenListener> = new Set();
  private hitListeners: Set<HitEventListener> = new Set();

  public static getInstance(): GameBridge {
    if (!GameBridge.instance) {
      GameBridge.instance = new GameBridge();
    }
    return GameBridge.instance;
  }

  public setScreen(screen: GameScreen): void {
    this.screen = screen;
    if (typeof document !== 'undefined') {
      document.body.dataset.state = screen === 'fighting' ? 'playing' : screen;
    }
    this.screenListeners.forEach((l) => l(screen));
  }

  public subscribeScreen(listener: ScreenListener): () => void {
    this.screenListeners.add(listener);
    return () => this.screenListeners.delete(listener);
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
}
