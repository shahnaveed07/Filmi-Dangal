import { AttackType } from '../types/fighter';

export interface BufferedInput {
  command: string;
  frame: number;
}

export interface ComboDefinition {
  id: string;
  name: string;
  sequence: string[];
  finalAttack: AttackType;
  description: string;
}

export const COMBO_DEFINITIONS: ComboDefinition[] = [
  {
    id: 'triple_punch',
    name: 'Triple Dishoom (J-J-J)',
    sequence: ['punch', 'punch', 'punch'],
    finalAttack: 'punch',
    description: 'Rapid 3-hit jab string ending in a stagger jab',
  },
  {
    id: 'punch_punch_kick',
    name: 'Bollywood High-Kick (J-J-K)',
    sequence: ['punch', 'punch', 'kick'],
    finalAttack: 'forward_kick',
    description: 'Double jab into a cinematic high roundhouse',
  },
  {
    id: 'punch_kick_kick',
    name: 'Dhamaka Stomp (J-K-K)',
    sequence: ['punch', 'kick', 'kick'],
    finalAttack: 'forward_punch',
    description: 'Jab into knee into heavy finishing haymaker',
  },
  {
    id: 'down_sweep',
    name: 'Floor Sweep (Down + K)',
    sequence: ['down_kick'],
    finalAttack: 'sweep',
    description: 'Low sweeping trip that knocks down the opponent',
  },
  {
    id: 'forward_punch',
    name: 'Heavy Haymaker (Forward + J)',
    sequence: ['forward_punch'],
    finalAttack: 'forward_punch',
    description: 'Crushing heavy strike that staggers and knocks back',
  },
  {
    id: 'forward_kick',
    name: 'Flying Roundhouse (Forward + K)',
    sequence: ['forward_kick'],
    finalAttack: 'forward_kick',
    description: 'Lunging cinematic kick with long reach',
  },
];

export class ComboSystem {
  private static BUFFER_WINDOW_FRAMES = 24; // ~0.4s input buffer window

  /**
   * Calculate combo scaling multiplier based on combo hit count
   * Prevents runaway damage and infinite combo exploits
   */
  public static getComboDamageMultiplier(comboCount: number): number {
    if (comboCount <= 1) return 1.0;
    if (comboCount === 2) return 0.85;
    if (comboCount === 3) return 0.70;
    if (comboCount === 4) return 0.55;
    return Math.max(0.40, 0.55 - (comboCount - 4) * 0.05);
  }

  /**
   * Determine if an attack input connects with previous inputs to form a recognized combo
   */
  public static detectCombo(inputHistory: BufferedInput[], currentFrame: number): ComboDefinition | null {
    // Filter to inputs within recent buffer window
    const recentInputs = inputHistory.filter(
      (inp) => currentFrame - inp.frame <= this.BUFFER_WINDOW_FRAMES
    );

    if (recentInputs.length === 0) return null;

    // Check sequences in order of longest match first
    for (const combo of COMBO_DEFINITIONS) {
      if (recentInputs.length < combo.sequence.length) continue;

      const slice = recentInputs.slice(-combo.sequence.length);
      const matches = slice.every((inp, index) => inp.command === combo.sequence[index]);

      if (matches) {
        return combo;
      }
    }

    return null;
  }

  /**
   * Check if a fighter in recovery or active frames can cancel into the next attack
   */
  public static canCancelIntoCombo(
    currentAttack: AttackType,
    nextAttack: AttackType,
    hitConfirmed: boolean,
    currentFrameInState: number,
    startupFrames: number
  ): boolean {
    // Attacks can only cancel if the previous hit connected
    if (!hitConfirmed) return false;

    // Must be past startup frames
    if (currentFrameInState <= startupFrames) return false;

    // Cannot cancel into the same grab or super from another special
    if (currentAttack === 'super') return false;
    if (nextAttack === 'super' && hitConfirmed) return true; // Super cancels are allowed on hit!

    // Standard chain cancels: Punch -> Kick, Punch -> Punch, Kick -> Forward/Sweep
    if (currentAttack === 'punch') return true;
    if (currentAttack === 'kick' && nextAttack !== 'punch') return true;

    return false;
  }
}
