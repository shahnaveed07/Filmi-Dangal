import { CombatHitEvent } from '../types/fighter';
import { CombatSystem } from './CombatSystem';
import { CPUController } from './CPUController';
import { Fighter } from './Fighter';

export type MatchPhase =
  | 'round_intro'
  | 'fighting'
  | 'ko'
  | 'time_over'
  | 'round_end'
  | 'match_end';

export interface MatchStats {
  p1DamageDealt: number;
  p2DamageDealt: number;
  p1MaxCombo: number;
  p2MaxCombo: number;
  roundResults: ('p1' | 'p2' | 'draw')[];
  totalFightTimeSeconds: number;
}

export class MatchManager {
  public static ROUND_TIME_SECONDS = 60;
  public static FRAMES_PER_SECOND = 60;
  public static TOTAL_ROUND_FRAMES = 60 * 60; // 3600 frames
  public static ROUNDS_TO_WIN = 2;
  public static MAX_ROUNDS = 5;
  public static P1_SPAWN_X = 380;
  public static P2_SPAWN_X = 900;

  public groundY: number;
  public stageWidth: number;

  public phase: MatchPhase = 'round_intro';
  public phaseTimer: number = 0; // In frames
  public roundTimeRemaining: number = 60;
  public roundFrameCounter: number = 0;

  public currentRound: number = 1;
  public p1RoundWins: number = 0;
  public p2RoundWins: number = 0;

  public roundWinner: 'p1' | 'p2' | 'draw' | null = null;
  public matchWinner: 'p1' | 'p2' | null = null;

  public stats: MatchStats = {
    p1DamageDealt: 0,
    p2DamageDealt: 0,
    p1MaxCombo: 0,
    p2MaxCombo: 0,
    roundResults: [],
    totalFightTimeSeconds: 0,
  };

  constructor(groundY: number = 580, stageWidth: number = 1280) {
    this.groundY = groundY;
    this.stageWidth = stageWidth;
    this.startRound(1);
  }

  public setArenaBounds(groundY: number, stageWidth: number = 1280): void {
    this.groundY = groundY;
    this.stageWidth = stageWidth;
  }

  public resetMatch(
    p1?: Fighter,
    p2?: Fighter,
    combat?: CombatSystem,
    cpu?: CPUController
  ): void {
    this.currentRound = 1;
    this.p1RoundWins = 0;
    this.p2RoundWins = 0;
    this.roundWinner = null;
    this.matchWinner = null;
    this.stats = {
      p1DamageDealt: 0,
      p2DamageDealt: 0,
      p1MaxCombo: 0,
      p2MaxCombo: 0,
      roundResults: [],
      totalFightTimeSeconds: 0,
    };
    this.startRound(1);

    if (p1) p1.reset(MatchManager.P1_SPAWN_X, this.groundY, 1, true);
    if (p2) p2.reset(MatchManager.P2_SPAWN_X, this.groundY, -1, true);
    if (combat) combat.resetCombos();
    if (cpu) cpu.reset();
  }

  public restartCurrentRound(
    p1: Fighter,
    p2: Fighter,
    combat?: CombatSystem,
    cpu?: CPUController
  ): void {
    this.startRound(this.currentRound);
    p1.reset(MatchManager.P1_SPAWN_X, this.groundY, 1, false);
    p2.reset(MatchManager.P2_SPAWN_X, this.groundY, -1, false);
    if (combat) combat.resetCombos();
    if (cpu) cpu.reset();
  }

  public startRound(roundNumber: number): void {
    this.currentRound = roundNumber;
    this.phase = 'round_intro';
    this.phaseTimer = 90; // 1.5 seconds intro ("ROUND X... FIGHT!")
    this.roundTimeRemaining = MatchManager.ROUND_TIME_SECONDS;
    this.roundFrameCounter = 0;
    this.roundWinner = null;
  }

  /**
   * Record combat hit statistics for match summary
   */
  public recordHitEvent(event: CombatHitEvent, isP1Attacker: boolean): void {
    if (isP1Attacker) {
      this.stats.p1DamageDealt += event.damage;
      if (event.comboCount > this.stats.p1MaxCombo) {
        this.stats.p1MaxCombo = event.comboCount;
      }
    } else {
      this.stats.p2DamageDealt += event.damage;
      if (event.comboCount > this.stats.p2MaxCombo) {
        this.stats.p2MaxCombo = event.comboCount;
      }
    }
  }

  /**
   * Main 60Hz tick for match rules, timer and round flow
   */
  public update(
    p1: Fighter,
    p2: Fighter,
    combat?: CombatSystem,
    cpu?: CPUController
  ): { phaseChanged: boolean; newPhase: MatchPhase } {
    const oldPhase = this.phase;

    switch (this.phase) {
      case 'round_intro':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.phase = 'fighting';
        }
        break;

      case 'fighting':
        this.roundFrameCounter++;
        this.stats.totalFightTimeSeconds += 1 / 60;

        // Timer countdown every 60 frames
        if (this.roundFrameCounter % MatchManager.FRAMES_PER_SECOND === 0) {
          if (this.roundTimeRemaining > 0) {
            this.roundTimeRemaining--;
          }
        }

        // Check for K.O.
        if (p1.health <= 0 || p2.health <= 0) {
          this.phase = 'ko';
          this.phaseTimer = 75; // 1.25s slow-motion dramatic KO beat

          if (p1.health <= 0 && p2.health <= 0) {
            this.roundWinner = 'draw';
          } else if (p1.health <= 0) {
            this.roundWinner = 'p2';
            this.p2RoundWins++;
          } else {
            this.roundWinner = 'p1';
            this.p1RoundWins++;
          }
        } else if (this.roundTimeRemaining <= 0) {
          // Time Over
          this.phase = 'time_over';
          this.phaseTimer = 90;

          const p1HpPct = p1.health / p1.character.stats.maxHealth;
          const p2HpPct = p2.health / p2.character.stats.maxHealth;

          if (p1.health === p2.health || Math.abs(p1HpPct - p2HpPct) < 0.0001) {
            this.roundWinner = 'draw';
          } else if (p1.health > p2.health) {
            this.roundWinner = 'p1';
            this.p1RoundWins++;
          } else {
            this.roundWinner = 'p2';
            this.p2RoundWins++;
          }
        }
        break;

      case 'ko':
      case 'time_over':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.stats.roundResults.push(this.roundWinner || 'draw');

          // Check if match is concluded
          if (this.p1RoundWins >= MatchManager.ROUNDS_TO_WIN) {
            this.matchWinner = 'p1';
            this.phase = 'match_end';
            p1.changeState('victory');
            p2.changeState('defeat');
          } else if (this.p2RoundWins >= MatchManager.ROUNDS_TO_WIN) {
            this.matchWinner = 'p2';
            this.phase = 'match_end';
            p1.changeState('defeat');
            p2.changeState('victory');
          } else if (this.currentRound >= MatchManager.MAX_ROUNDS) {
            // Hard cap on rounds to prevent infinite matches on repeated draws
            if (this.p1RoundWins > this.p2RoundWins) {
              this.matchWinner = 'p1';
            } else if (this.p2RoundWins > this.p1RoundWins) {
              this.matchWinner = 'p2';
            } else {
              this.matchWinner =
                this.stats.p1DamageDealt >= this.stats.p2DamageDealt ? 'p1' : 'p2';
            }
            this.phase = 'match_end';
            if (this.matchWinner === 'p1') {
              p1.changeState('victory');
              p2.changeState('defeat');
            } else {
              p1.changeState('defeat');
              p2.changeState('victory');
            }
          } else {
            this.phase = 'round_end';
            this.phaseTimer = 60;
          }
        }
        break;

      case 'round_end':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.startRound(this.currentRound + 1);
          p1.reset(MatchManager.P1_SPAWN_X, this.groundY, 1, false);
          p2.reset(MatchManager.P2_SPAWN_X, this.groundY, -1, false);
          if (combat) combat.resetCombos();
          if (cpu) cpu.reset();
        }
        break;

      case 'match_end':
        // Awaiting player UI click (Rematch or Character Select)
        break;
    }

    return { phaseChanged: this.phase !== oldPhase, newPhase: this.phase };
  }
}
