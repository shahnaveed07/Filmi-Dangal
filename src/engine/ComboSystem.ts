import { AttackType } from '../types/fighter';

export type ComboInputCommand =
  | 'punch'
  | 'kick'
  | 'down_kick'
  | 'sweep'
  | 'forward_punch'
  | 'forward_kick'
  | 'grab'
  | 'super_shot'
  | 'super_move'
  | 'super';

export interface BufferedInput {
  command: ComboInputCommand;
  frame: number;
}

export interface ComboDefinition {
  id: string;
  name: string;
  sequence: AttackType[];
  bonusMultiplier: number;
  description: string;
}

export const COMBO_DEFINITIONS: ComboDefinition[] = [
  {
    id: 'one_two_kick',
    name: 'Box Office Blitz (J-J-K)',
    sequence: ['punch', 'punch', 'kick'],
    bonusMultiplier: 1.15,
    description: 'Two rapid jabs followed by a heavy roundhouse kick.',
  },
  {
    id: 'sweep_launcher',
    name: 'Red Carpet Sweep (J-K-Sweep)',
    sequence: ['punch', 'kick', 'sweep'],
    bonusMultiplier: 1.2,
    description: 'High-low mixup ending in a knockdown sweep.',
  },
  {
    id: 'triple_strike',
    name: 'Triple Strike (J-J-J)',
    sequence: ['punch', 'punch', 'punch'],
    bonusMultiplier: 1.12,
    description: 'Classic three-punch cinema rush combo.',
  },
  {
    id: 'command_crusher',
    name: 'Heroic Finisher (J-Fwd+J-Fwd+K)',
    sequence: ['punch', 'forward_punch', 'forward_kick'],
    bonusMultiplier: 1.25,
    description: 'Jab into overhead lunge punch and flying chest kick.',
  },
  {
    id: 'knockout_stomp',
    name: 'Knockout Stomp (J-K-K)',
    sequence: ['punch', 'kick', 'kick'],
    bonusMultiplier: 1.18,
    description: 'Quick punch into double high kick.',
  },
];

export class ComboSystem {
  public static readonly MAX_CHAIN_LENGTH = 3;
  public static readonly CANCEL_QUEUE_WINDOW_FRAMES = 18;
  private static readonly SCALING_TABLE = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45];

  public static getComboDamageMultiplier(comboHitIndex: number): number {
    if (comboHitIndex <= 1) return 1.0;
    const idx = Math.min(comboHitIndex - 1, this.SCALING_TABLE.length - 1);
    return this.SCALING_TABLE[idx];
  }

  public static normalizeCommand(cmd: AttackType | ComboInputCommand): ComboInputCommand {
    return cmd;
  }

  public static resolveComboAttack(
    requestedAttack: AttackType,
    inputHistory: BufferedInput[],
    _currentFrame: number,
    _chainIndex: number
  ): { attackType: AttackType; matchedCombo: ComboDefinition | null } {
    const recentCommands = inputHistory.slice(-3).map((b) => b.command as AttackType);
    const matched = this.matchComboChain(recentCommands);
    return {
      attackType: requestedAttack,
      matchedCombo: matched,
    };
  }

  public static canCancelIntoCombo(
    currentAttack: AttackType,
    nextAttack: AttackType,
    hasHitConnected: boolean,
    frameInState: number,
    startupFrames: number,
    chainLength: number
  ): boolean {
    if (!hasHitConnected || frameInState < startupFrames) {
      return false;
    }
    if (
      nextAttack === 'super' ||
      nextAttack === 'super_move' ||
      nextAttack === 'super_shot'
    ) {
      return (
        currentAttack !== 'super' &&
        currentAttack !== 'super_move' &&
        currentAttack !== 'super_shot'
      );
    }
    if (chainLength >= this.MAX_CHAIN_LENGTH) {
      return false;
    }
    return true;
  }

  public static matchComboChain(recentMoves: AttackType[]): ComboDefinition | null {
    if (recentMoves.length < 3) return null;
    const lastThree = recentMoves.slice(-3);

    for (const def of COMBO_DEFINITIONS) {
      if (
        def.sequence[0] === lastThree[0] &&
        def.sequence[1] === lastThree[1] &&
        def.sequence[2] === lastThree[2]
      ) {
        return def;
      }
    }
    return null;
  }
}
