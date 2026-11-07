import { AttackType } from '../types/fighter';

export type ComboInputCommand =
  | 'punch'
  | 'kick'
  | 'sweep'
  | 'down_kick'
  | 'forward_punch'
  | 'forward_kick'
  | 'grab'
  | 'super';

export interface BufferedInput {
  command: ComboInputCommand;
  frame: number;
  consumed?: boolean;
}

export interface ComboDefinition {
  id: string;
  name: string;
  sequence: ComboInputCommand[];
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
    sequence: ['sweep'],
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
  public static DEFAULT_BUFFER_WINDOW_FRAMES = 28; // ~0.46s input buffer window
  public static CANCEL_QUEUE_WINDOW_FRAMES = 14; // ~0.23s pre-cancel input queue window
  public static MAX_CHAIN_LENGTH = 3; // Maximum hits in a normal target-combo chain

  /**
   * Normalize directional input command aliases so 'down_kick' and 'sweep' match seamlessly
   */
  public static normalizeCommand(cmd: ComboInputCommand | string): ComboInputCommand {
    if (cmd === 'down_kick') return 'sweep';
    return cmd as ComboInputCommand;
  }

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
  public static detectCombo(
    inputHistory: BufferedInput[],
    currentFrame: number,
    bufferWindowFrames: number = ComboSystem.DEFAULT_BUFFER_WINDOW_FRAMES
  ): ComboDefinition | null {
    // Filter to inputs within recent buffer window
    const recentInputs = inputHistory.filter(
      (inp) => currentFrame - inp.frame <= bufferWindowFrames
    );

    if (recentInputs.length === 0) return null;

    // Sort multi-hit combos ahead of single-input command moves so 3-hit chains take precedence
    const orderedDefs = [...COMBO_DEFINITIONS].sort(
      (a, b) => b.sequence.length - a.sequence.length
    );

    for (const combo of orderedDefs) {
      if (recentInputs.length < combo.sequence.length) continue;

      const slice = recentInputs.slice(-combo.sequence.length);
      let matches = true;
      for (let i = 0; i < combo.sequence.length; i++) {
        if (this.normalizeCommand(slice[i].command) !== this.normalizeCommand(combo.sequence[i])) {
          matches = false;
          break;
        }
        // Ensure consecutive steps in a multi-hit sequence aren't too far apart
        if (i > 0 && slice[i].frame - slice[i - 1].frame > bufferWindowFrames) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return combo;
      }
    }

    return null;
  }

  /**
   * Check if a fighter in active or recovery frames can cancel into the next attack
   */
  public static canCancelIntoCombo(
    currentAttack: AttackType,
    nextAttack: AttackType,
    hitConfirmed: boolean,
    currentFrameInState: number,
    startupFrames: number,
    chainLength: number = 1
  ): boolean {
    // Attacks can only cancel if the previous hit connected (hit-confirm requirement)
    if (!hitConfirmed) return false;

    // Must be in active or recovery frames (past startup frames)
    if (currentFrameInState < startupFrames) return false;

    // Cannot cancel out of a super or grab
    if (currentAttack === 'super' || currentAttack === 'grab') return false;

    // Super cancels are always allowed on hit-confirm from any normal/command attack
    if (nextAttack === 'super') return true;

    // Prevent infinite chaining: normal chains are capped at MAX_CHAIN_LENGTH (3 hits)
    if (chainLength >= ComboSystem.MAX_CHAIN_LENGTH) {
      return false;
    }

    // Step 1 -> Step 2: Punch can cancel into Punch or Kick
    if (chainLength === 1) {
      if (currentAttack === 'punch' && (nextAttack === 'punch' || nextAttack === 'kick')) {
        return true;
      }
      return false;
    }

    // Step 2 -> Step 3:
    // J-J -> J (punch) or K (kick / forward_kick)
    // J-K -> K (kick / forward_punch)
    if (chainLength === 2) {
      if (
        currentAttack === 'punch' &&
        (nextAttack === 'punch' || nextAttack === 'kick' || nextAttack === 'forward_kick')
      ) {
        return true;
      }
      if (
        currentAttack === 'kick' &&
        (nextAttack === 'kick' || nextAttack === 'forward_punch' || nextAttack === 'sweep')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve the actual AttackType to execute when cancelling or buffering a combo sequence
   */
  public static resolveComboAttack(
    requestedAttack: AttackType,
    inputHistory: BufferedInput[],
    currentFrame: number,
    chainLength: number,
    bufferWindowFrames: number = ComboSystem.DEFAULT_BUFFER_WINDOW_FRAMES
  ): { attackType: AttackType; matchedCombo: ComboDefinition | null } {
    const matched = this.detectCombo(inputHistory, currentFrame, bufferWindowFrames);

    // If we are on the 3rd step of a 3-hit chain (J-J-J, J-J-K, J-K-K), promote to the combo's finalAttack
    if (matched && matched.sequence.length === 3 && chainLength >= 2) {
      return { attackType: matched.finalAttack, matchedCombo: matched };
    }

    // If it's a single-command directional move (sweep, forward_punch, forward_kick)
    if (matched && matched.sequence.length === 1) {
      return { attackType: matched.finalAttack, matchedCombo: matched };
    }

    return { attackType: requestedAttack, matchedCombo: null };
  }
}
