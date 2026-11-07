import { CombatHitEvent } from '../../types/fighter';
import { MatchPhase, MatchStats } from '../../engine/MatchManager';
import { CombatSystem3D } from '../combat/CombatSystem3D';
import { Fighter3D } from '../combat/Fighter3D';
import { CPUController3D } from '../cpu/CPUController3D';

export class MatchManager3D {
  public static readonly ROUND_TIME_SECONDS = 60;
  public static readonly FRAMES_PER_SECOND = 60;
  public static readonly ROUNDS_TO_WIN = 2;
  public static readonly MAX_ROUNDS = 5;
  public static readonly P1_SPAWN_X_3D = -2.4;
  public static readonly P2_SPAWN_X_3D = 2.4;

  public phase: MatchPhase = 'round_intro';
  public phaseTimer = 90;
  public roundTimeRemaining = 60;
  public roundFrameCounter = 0;

  public currentRound = 1;
  public p1RoundWins = 0;
  public p2RoundWins = 0;

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

  public resetMatch(
    p1?: Fighter3D,
    p2?: Fighter3D,
    combat?: CombatSystem3D,
    cpu?: CPUController3D
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

    if (p1) p1.resetForRound(MatchManager3D.P1_SPAWN_X_3D, 0, 0, true);
    if (p2) p2.resetForRound(MatchManager3D.P2_SPAWN_X_3D, 0, 0, true);
    if (combat) {
      combat.projectileManager.clear();
      combat.clearResolvedActivations();
    }
    if (cpu) cpu.reset();
  }

  public restartCurrentRound(
    p1: Fighter3D,
    p2: Fighter3D,
    combat?: CombatSystem3D,
    cpu?: CPUController3D
  ): void {
    this.startRound(this.currentRound);
    p1.resetForRound(MatchManager3D.P1_SPAWN_X_3D, 0, 0, false);
    p2.resetForRound(MatchManager3D.P2_SPAWN_X_3D, 0, 0, false);
    if (combat) {
      combat.projectileManager.clear();
      combat.clearResolvedActivations();
    }
    if (cpu) cpu.reset();
  }

  public startRound(roundNumber: number): void {
    this.currentRound = roundNumber;
    this.phase = 'round_intro';
    this.phaseTimer = 90;
    this.roundTimeRemaining = MatchManager3D.ROUND_TIME_SECONDS;
    this.roundFrameCounter = 0;
    this.roundWinner = null;
  }

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

  public update(
    p1: Fighter3D,
    p2: Fighter3D,
    combat?: CombatSystem3D,
    cpu?: CPUController3D
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

        if (this.roundFrameCounter % MatchManager3D.FRAMES_PER_SECOND === 0) {
          if (this.roundTimeRemaining > 0) {
            this.roundTimeRemaining--;
          }
        }

        if (p1.health <= 0 || p2.health <= 0) {
          this.phase = 'ko';
          this.phaseTimer = 75;

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
          this.phase = 'time_over';
          this.phaseTimer = 90;

          const p1HpPct = p1.health / p1.maxHealth;
          const p2HpPct = p2.health / p2.maxHealth;

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

          if (this.p1RoundWins >= MatchManager3D.ROUNDS_TO_WIN) {
            this.matchWinner = 'p1';
            this.phase = 'match_end';
            p1.state = 'victory';
            p2.state = 'defeat';
          } else if (this.p2RoundWins >= MatchManager3D.ROUNDS_TO_WIN) {
            this.matchWinner = 'p2';
            this.phase = 'match_end';
            p1.state = 'defeat';
            p2.state = 'victory';
          } else if (this.currentRound >= MatchManager3D.MAX_ROUNDS) {
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
              p1.state = 'victory';
              p2.state = 'defeat';
            } else {
              p1.state = 'defeat';
              p2.state = 'victory';
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
          p1.resetForRound(MatchManager3D.P1_SPAWN_X_3D, 0, 0, false);
          p2.resetForRound(MatchManager3D.P2_SPAWN_X_3D, 0, 0, false);
          if (combat) {
            combat.projectileManager.clear();
            combat.clearResolvedActivations();
          }
          if (cpu) cpu.reset();
        }
        break;

      case 'match_end':
        break;
    }

    return { phaseChanged: this.phase !== oldPhase, newPhase: this.phase };
  }
}
