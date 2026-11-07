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

  constructor() {
    this.startRound(1);
  }

  public resetMatch(): void {
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
   * Main 60Hz tick for match rules, timer and round flow
   */
  public update(p1: Fighter, p2: Fighter): { phaseChanged: boolean; newPhase: MatchPhase } {
    let phaseChanged = false;
    const oldPhase = this.phase;

    switch (this.phase) {
      case 'round_intro':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.phase = 'fighting';
          phaseChanged = true;
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
          phaseChanged = true;

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
          phaseChanged = true;

          if (p1.health === p2.health) {
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
            phaseChanged = true;
          } else if (this.p2RoundWins >= MatchManager.ROUNDS_TO_WIN) {
            this.matchWinner = 'p2';
            this.phase = 'match_end';
            p1.changeState('defeat');
            p2.changeState('victory');
            phaseChanged = true;
          } else if (this.currentRound >= 3 && this.p1RoundWins === this.p2RoundWins) {
            // Sudden death round if tied
            this.phase = 'round_end';
            this.phaseTimer = 60;
            phaseChanged = true;
          } else {
            this.phase = 'round_end';
            this.phaseTimer = 60;
            phaseChanged = true;
          }
        }
        break;

      case 'round_end':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.startRound(this.currentRound + 1);
          p1.reset(380, 580, 1);
          p2.reset(900, 580, -1);
          phaseChanged = true;
        }
        break;

      case 'match_end':
        // Awaiting player UI click (Rematch or Character Select)
        break;
    }

    return { phaseChanged: this.phase !== oldPhase, newPhase: this.phase };
  }
}
